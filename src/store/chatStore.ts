/**
 * chatStore — 聊天对话状态与发送管线
 *
 * 连接聊天框（ChatContainer 输入/发送）与 Live2D 气泡（ModelBubbleOverlay 显示）：
 *   sendMessage → LLM 对话 → TTS 合成 → 文字（气泡打字机）与语音同步播放
 *
 * 同步策略：
 *   默认句子级同步流式（/api/voice/tts/stream/sentences，NDJSON）：
 *     每句的文本与音频成对到达进入队列，播放某句音频时才按该句真实时长
 *     揭示对应文字——语音永远与文字严格同句，音频未到不提前打字；
 *   引擎不支持（501/失败）时回退非流式：
 *     解码音频获得时长 → 每字符间隔 = 时长 / 字数（钳制 15~200ms）→
 *     打字机与音频同时启动，语音结束时补全文字
 *
 * 分段显示：过长回复按句子切分为多段（每段 ≤ MAX_SEGMENT_CHARS），
 *   打字机跨全文连续推进，气泡每次只显示当前段已揭示的部分，
 *   前一段显示完自动切换到下一段。
 *
 * 气泡销毁：文字全部显示完后停留 BUBBLE_DISMISS_DELAY_MS，
 *   然后进入淡出（bubbleClosing=true，透明度 100→0 动画 BUBBLE_FADE_MS），
 *   动画结束清空 bubbleText 销毁气泡。
 */

import { create } from "zustand";
import {
  chat,
  synthesizeSpeech,
  synthesizeSpeechSentences,
} from "../services/apiClient";
import type { ChatMessage } from "../services/apiClient";
import { cleanTextForTTS } from "../utils/textCleaner";
import {
  playAudioBlob,
  playPcm,
  base64ToUint8,
  stopAudio,
} from "../utils/audioUtils";

/** 发送管线阶段 */
export type ChatPhase = "idle" | "thinking" | "speaking";

/** 携带的上下文消息条数上限 */
const MAX_CONTEXT_MESSAGES = 10;
/** 无语音（TTS 失败）时的打字机速度（毫秒/字符） */
const FALLBACK_TYPE_SPEED_MS = 40;
/** 有语音时打字机速度钳制范围（毫秒/字符） */
const MIN_TYPE_SPEED_MS = 15;
const MAX_TYPE_SPEED_MS = 200;
/** 气泡单段最大字符数（超长回复按句子切分为多段轮播） */
const MAX_SEGMENT_CHARS = 60;
/** 文字显示结束到气泡开始销毁的停留时间（毫秒） */
const BUBBLE_DISMISS_DELAY_MS = 3000;
/** 气泡销毁淡出动画时长（毫秒），与 ModelBubbleOverlay 的 transition 一致 */
export const BUBBLE_FADE_MS = 1000;

// ─── 回复分段 ────────────────────────────────────────

/**
 * 将回复文本按句子切分为多段（每段 ≤ MAX_SEGMENT_CHARS）。
 * 各段拼接后恢复原文（打字机全局索引可直接映射到段内偏移）。
 * 单个超长句子按 MAX_SEGMENT_CHARS 硬切。
 */
function splitIntoSegments(text: string): string[] {
  // 按句末标点/换行切句（保留分隔符）
  const sentences = text
    .split(/(?<=[。！？!?；;\n])/)
    .filter((s) => s.length > 0);
  const segments: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.length > 0) {
      segments.push(current);
      current = "";
    }
  };

  for (const sentence of sentences) {
    if (sentence.length > MAX_SEGMENT_CHARS) {
      // 超长单句：先收尾当前段，再硬切
      pushCurrent();
      for (let i = 0; i < sentence.length; i += MAX_SEGMENT_CHARS) {
        segments.push(sentence.slice(i, i + MAX_SEGMENT_CHARS));
      }
      continue;
    }
    if (current.length + sentence.length > MAX_SEGMENT_CHARS) {
      pushCurrent();
    }
    current += sentence;
  }
  pushCurrent();

  return segments.length > 0 ? segments : [text];
}

/**
 * 分段显示映射器：给定全文已揭示字符数，返回当前段的可见文字。
 * 前段显示完后自动进入下一段（气泡只显示当前段内容）。
 */
function makeSegmentDisplay(segments: string[]): (count: number) => string {
  // 各段在全文中的起始偏移
  const starts: number[] = [];
  let acc = 0;
  for (const seg of segments) {
    starts.push(acc);
    acc += seg.length;
  }
  const total = acc;

  return (count: number): string => {
    const clamped = Math.max(0, Math.min(count, total));
    // 找到包含第 clamped 个字符的段（正好落在段尾时仍显示该段全文）
    let idx = segments.length - 1;
    for (let i = 0; i < segments.length; i++) {
      if (clamped <= starts[i] + segments[i].length) {
        idx = i;
        break;
      }
    }
    return segments[idx].slice(0, clamped - starts[idx]).trimStart();
  };
}

// ─── 打字机定时器（模块级，跨多次发送共享） ─────────────

let typewriterTimer: ReturnType<typeof setInterval> | null = null;

function stopTypewriter(): void {
  if (typewriterTimer !== null) {
    clearInterval(typewriterTimer);
    typewriterTimer = null;
  }
}

function startTypewriter(
  totalChars: number,
  speedMs: number,
  onTick: (count: number) => void,
  onDone?: () => void,
): void {
  stopTypewriter();
  let idx = 0;
  typewriterTimer = setInterval(() => {
    idx++;
    onTick(idx);
    if (idx >= totalChars) {
      stopTypewriter();
      onDone?.();
    }
  }, speedMs);
}

/**
 * 句子 tween 打字机：在 durationMs 内把揭示字符数从 from 匀速推进到 to。
 * 用于句子级同步——每句音频开始播放时启动，与该句时长严格对齐。
 */
let adaptiveTimer: ReturnType<typeof setInterval> | null = null;

function stopAdaptiveTypewriter(): void {
  if (adaptiveTimer !== null) {
    clearInterval(adaptiveTimer);
    adaptiveTimer = null;
  }
}

function tweenTypewriter(
  from: number,
  to: number,
  durationMs: number,
  onTick: (count: number) => void,
): void {
  stopAdaptiveTypewriter();
  const chars = to - from;
  if (chars <= 0) return;
  const start = performance.now();
  onTick(from);
  adaptiveTimer = setInterval(() => {
    const frac = Math.min(1, (performance.now() - start) / Math.max(1, durationMs));
    onTick(from + Math.round(chars * frac));
    if (frac >= 1) stopAdaptiveTypewriter();
  }, 33);
}

// ─── 气泡销毁定时器（停留 → 淡出 → 清空） ───────────────

let dismissTimer: ReturnType<typeof setTimeout> | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;

function cancelBubbleDismiss(): void {
  if (dismissTimer !== null) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  if (fadeTimer !== null) {
    clearTimeout(fadeTimer);
    fadeTimer = null;
  }
}

/** 解码音频获取时长（毫秒），失败返回 null */
async function getAudioDurationMs(blob: Blob): Promise<number | null> {
  try {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    void ctx.close();
    return buf.duration * 1000;
  } catch {
    return null;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Store ───────────────────────────────────────────

export interface ChatState {
  /** 对话历史（user/assistant 交替，作为 LLM 上下文） */
  messages: ChatMessage[];
  /** Live2D 气泡当前显示的文字（空字符串 = 不显示气泡） */
  bubbleText: string;
  /** 气泡是否处于淡出销毁动画中 */
  bubbleClosing: boolean;
  /** 发送管线阶段 */
  phase: ChatPhase;

  /** 发送一条用户消息，走完 LLM → TTS → 同步播放全流程 */
  sendMessage: (text: string) => Promise<void>;
  /** 清空气泡（同时停止打字机与销毁定时器） */
  clearBubble: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  bubbleText: "",
  bubbleClosing: false,
  phase: "idle",

  sendMessage: async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || get().phase !== "idle") return;

    stopTypewriter();
    stopAdaptiveTypewriter();
    stopAudio();
    cancelBubbleDismiss();

    /** 文字显示结束 → 停留 3s → 淡出 1s → 清空销毁 */
    const scheduleBubbleDismiss = () => {
      cancelBubbleDismiss();
      dismissTimer = setTimeout(() => {
        dismissTimer = null;
        set({ bubbleClosing: true });
        fadeTimer = setTimeout(() => {
          fadeTimer = null;
          set({ bubbleText: "", bubbleClosing: false });
        }, BUBBLE_FADE_MS);
      }, BUBBLE_DISMISS_DELAY_MS);
    };

    // 上下文 = 最近 N 条历史 + 本条用户消息
    const history: ChatMessage[] = [
      ...get().messages.slice(-MAX_CONTEXT_MESSAGES),
      { role: "user", content: trimmed },
    ];
    set((s) => ({
      phase: "thinking",
      bubbleText: "……",
      bubbleClosing: false,
      messages: [...s.messages, { role: "user", content: trimmed }],
    }));

    // 1. LLM 对话（非流式，取完整回复）
    let reply = "";
    try {
      const resp = await chat(history);
      reply = resp.reply;
    } catch (err) {
      set({ phase: "idle", bubbleText: `⚠️ ${errorMessage(err)}` });
      scheduleBubbleDismiss();
      return;
    }
    if (!reply.trim()) {
      set({ phase: "idle", bubbleText: "" });
      return;
    }
    set((s) => ({
      messages: [...s.messages, { role: "assistant", content: reply }],
    }));

    // 2. TTS + 文字同步输出（长回复分段轮播）
    //    默认句子级同步流式：每句文本+音频成对到达，播到哪句显示到哪句；
    //    引擎不支持（HTTP 501 / 空流 / 异常）时回退非流式路径。
    const segments = splitIntoSegments(reply);
    const displayAt = makeSegmentDisplay(segments);
    const lastSegment = segments[segments.length - 1].trimStart();

    set({ phase: "speaking", bubbleText: "" });

    const finishSpeaking = () => {
      stopTypewriter();
      stopAdaptiveTypewriter();
      set({ bubbleText: lastSegment, phase: "idle" });
      scheduleBubbleDismiss();
    };

    /** 非流式回退：完整合成 → 按时长匀速打字 → 播放 */
    const fallbackNonStreaming = async () => {
      let audioBlob: Blob | null = null;
      try {
        audioBlob = await synthesizeSpeech(cleanTextForTTS(reply));
      } catch (err) {
        console.warn("[chatStore] TTS 合成失败，仅显示文字:", err);
      }

      if (audioBlob) {
        const durationMs = await getAudioDurationMs(audioBlob);
        const speedMs = durationMs
          ? Math.max(
              MIN_TYPE_SPEED_MS,
              Math.min(
                MAX_TYPE_SPEED_MS,
                durationMs / Math.max(1, reply.length),
              ),
            )
          : FALLBACK_TYPE_SPEED_MS;

        startTypewriter(reply.length, speedMs, (count) =>
          set({ bubbleText: displayAt(count) }),
        );
        try {
          await playAudioBlob(audioBlob);
        } catch (err) {
          console.warn("[chatStore] 语音播放失败:", err);
        }
        finishSpeaking();
      } else {
        // 无语音：按固定速度逐字显示
        startTypewriter(
          reply.length,
          FALLBACK_TYPE_SPEED_MS,
          (count) => set({ bubbleText: displayAt(count) }),
          () => {
            set({ phase: "idle" });
            scheduleBubbleDismiss();
          },
        );
      }
    };

    try {
      // ── 句子级同步队列：文本与音频成对到达，播到哪句显示到哪句 ──
      const { stream } = synthesizeSpeechSentences(cleanTextForTTS(reply));
      const reader = stream.getReader();

      // TTS 句子基于清理后的文本，映射回原文位置：
      // 优先在原文中顺序查找句子内容；找不到则按累计字数比例推进
      let searchFrom = 0;
      let cleanedChars = 0;
      const cleanedTotal = Math.max(1, cleanTextForTTS(reply).length);
      let revealed = 0;

      const targetFor = (sentence: string): number => {
        cleanedChars += sentence.length;
        const idx = reply.indexOf(sentence, searchFrom);
        if (idx >= 0) {
          searchFrom = idx + sentence.length;
          return idx + sentence.length;
        }
        // 清理导致原文不含该句：按清理文本占比映射到原文长度
        return Math.min(
          reply.length,
          Math.round((cleanedChars / cleanedTotal) * reply.length),
        );
      };

      let played = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          // 播放该句音频，同时把文字从当前进度 tween 到该句末尾
          const target = targetFor(value.text);
          tweenTypewriter(revealed, target, value.duration_ms, (count) => {
            revealed = count;
            set({ bubbleText: displayAt(count) });
          });
          await playPcm(base64ToUint8(value.audio));
          // 该句播完：文字对齐到句末（tween 可能因取整差一两个字符）
          stopAdaptiveTypewriter();
          revealed = target;
          set({ bubbleText: displayAt(target) });
          played++;
        }
      } finally {
        reader.releaseLock();
      }

      if (played === 0) {
        // 引擎没产出任何句子（异常空流）：回退
        await fallbackNonStreaming();
        return;
      }
      finishSpeaking();
    } catch (err) {
      console.warn("[chatStore] 句子级同步 TTS 失败，回退非流式:", err);
      stopAdaptiveTypewriter();
      await fallbackNonStreaming();
    }
  },

  clearBubble: () => {
    stopTypewriter();
    stopAdaptiveTypewriter();
    cancelBubbleDismiss();
    set({ bubbleText: "", bubbleClosing: false });
  },
}));
