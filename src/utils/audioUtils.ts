/**
 * 音频工具函数 — 播放 TTS 音频 Blob
 */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  // 恢复被浏览器自动暂停的 AudioContext（自动播放策略）
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

/**
 * 全局初始化 — 在用户首次交互时唤醒 AudioContext
 * 由 App.tsx 在点击/触摸事件中调用
 */
export function initAudio(): void {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

/**
 * 播放 TTS 音频 Blob
 * 自动解码并播放 MP3/WAV 数据
 * 如果已有音频在播放则先停止
 */
let currentSource: AudioBufferSourceNode | null = null;

export async function playAudioBlob(blob: Blob): Promise<void> {
  // 停止当前播放
  stopAudio();

  const ctx = getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.start(0);

  currentSource = source;

  return new Promise((resolve) => {
    source.onended = () => {
      currentSource = null;
      resolve();
    };
  });
}

/**
 * 流式音频收集器 — 收集所有 chunk 后一次性播放
 * 用于无法渐进式解码的格式（如 MP3）；
 * WAV+PCM 流请使用 createPcmStreamPlayer 实现真流式播放。
 */
let collectedChunks: Uint8Array[] = [];
let isCollecting = false;

/**
 * 创建流式音频收集器
 * 收集所有 chunk，close() 时合并为完整 Blob 并播放
 */
export function createStreamingAudioPlayer(): {
  appendChunk: (chunk: Uint8Array) => void;
  close: () => void;
  stop: () => void;
} {
  // 停止之前的播放
  stopAudio();

  collectedChunks = [];
  isCollecting = true;

  return {
    appendChunk(chunk: Uint8Array) {
      if (isCollecting) {
        collectedChunks.push(chunk);
      }
    },
    close() {
      isCollecting = false;
      if (collectedChunks.length === 0) return;

      const blob = new Blob(collectedChunks, { type: "audio/mpeg" });
      collectedChunks = [];
      // 使用 AudioContext 解码播放
      playAudioBlob(blob).catch((err) => console.warn("TTS 播放失败:", err));
    },
    stop() {
      isCollecting = false;
      collectedChunks = [];
      stopAudio();
    },
  };
}

// ─── 单句 PCM 播放（句子级同步队列用） ───────────────────

/** base64 → Uint8Array */
export function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let currentPcmSource: AudioBufferSourceNode | null = null;

/**
 * 播放一段 16-bit PCM（单声道），返回播放结束的 Promise。
 * 不会打断已在播的其他句子——调用方应顺序 await 实现队列播放；
 * stopAudio() 会中止当前句。
 */
export function playPcm(
  pcm: Uint8Array,
  sampleRate: number = PCM_SAMPLE_RATE,
): Promise<void> {
  const ctx = getAudioContext();
  const sampleCount = Math.floor(pcm.length / 2);
  if (sampleCount === 0) return Promise.resolve();

  const aligned = pcm.slice(0, sampleCount * 2);
  const int16 = new Int16Array(aligned.buffer, 0, sampleCount);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) float32[i] = int16[i] / 32768;

  const buffer = ctx.createBuffer(1, sampleCount, sampleRate);
  buffer.copyToChannel(float32, 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  currentPcmSource = source;

  return new Promise((resolve) => {
    source.onended = () => {
      if (currentPcmSource === source) currentPcmSource = null;
      resolve();
    };
    source.start(0);
  });
}

/**
 * 停止当前音频播放
 */
export function stopAudio(): void {
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      // 已停止则忽略
    }
    currentSource = null;
  }
  if (currentPcmSource) {
    try {
      currentPcmSource.stop();
    } catch {
      // 已停止则忽略
    }
    currentPcmSource = null;
  }
  if (currentPcmPlayer) {
    currentPcmPlayer.stop();
    currentPcmPlayer = null;
  }
  collectedChunks = [];
  isCollecting = false;
}

// ─── PCM 真流式播放器（WAV 头 + 16-bit PCM 流） ───────────

/** 后端 GenieTTS 插件的固定输出格式 */
const PCM_SAMPLE_RATE = 32000;
/** 标准 WAV 文件头长度（python wave 模块写出的头固定 44 字节） */
const WAV_HEADER_BYTES = 44;

export interface PcmStreamPlayer {
  /** 送入一个流 chunk（首个含 WAV 头，自动跳过） */
  appendChunk: (chunk: Uint8Array) => void;
  /** 已接收音频总时长（毫秒） */
  getTotalDurationMs: () => number;
  /** 距播放完已排程音频的剩余时间（毫秒） */
  getRemainingMs: () => number;
  /** 等待所有已排程音频播放完毕（须在流读完后调用） */
  finish: () => Promise<void>;
  /** 立即停止播放 */
  stop: () => void;
}

let currentPcmPlayer: PcmStreamPlayer | null = null;

/**
 * 创建 PCM 真流式播放器：chunk 到达即转 AudioBuffer 排程播放，
 * 实现"边合成边播"（后端 /stream 每合成完一句推送一段 PCM）。
 */
export function createPcmStreamPlayer(
  sampleRate: number = PCM_SAMPLE_RATE,
): PcmStreamPlayer {
  stopAudio();

  const ctx = getAudioContext();
  const sources: AudioBufferSourceNode[] = [];
  let skippedBytes = 0; // 已跳过的 WAV 头字节数
  let leftover: Uint8Array = new Uint8Array(0); // 半个采样的残留字节
  let nextStartTime = 0; // 下一段音频的排程时刻
  let totalSamples = 0;
  let stopped = false;

  const player: PcmStreamPlayer = {
    appendChunk(chunk: Uint8Array) {
      if (stopped || chunk.length === 0) return;

      // 跳过流首部的 WAV 头（可能跨 chunk）
      let data = chunk;
      if (skippedBytes < WAV_HEADER_BYTES) {
        const toSkip = Math.min(WAV_HEADER_BYTES - skippedBytes, data.length);
        data = data.subarray(toSkip);
        skippedBytes += toSkip;
        if (data.length === 0) return;
      }

      // 拼接残留字节，按 16-bit 采样切齐
      let merged: Uint8Array;
      if (leftover.length > 0) {
        merged = new Uint8Array(leftover.length + data.length);
        merged.set(leftover);
        merged.set(data, leftover.length);
      } else {
        merged = data;
      }
      const sampleCount = Math.floor(merged.length / 2);
      leftover = merged.subarray(sampleCount * 2);
      if (sampleCount === 0) return;

      // int16 → float32（注意 subarray 的 byteOffset 对齐：复制到独立 buffer）
      const aligned = merged.slice(0, sampleCount * 2);
      const int16 = new Int16Array(aligned.buffer, 0, sampleCount);
      const float32 = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        float32[i] = int16[i] / 32768;
      }

      const buffer = ctx.createBuffer(1, sampleCount, sampleRate);
      buffer.copyToChannel(float32, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      // 无缝衔接排程：落后于当前时间则留 50ms 余量重新起播
      const now = ctx.currentTime;
      if (nextStartTime < now + 0.05) {
        nextStartTime = now + 0.05;
      }
      source.start(nextStartTime);
      nextStartTime += buffer.duration;
      totalSamples += sampleCount;
      sources.push(source);
    },

    getTotalDurationMs() {
      return (totalSamples / sampleRate) * 1000;
    },

    getRemainingMs() {
      return Math.max(0, (nextStartTime - ctx.currentTime) * 1000);
    },

    finish() {
      return new Promise<void>((resolve) => {
        const check = () => {
          if (stopped || ctx.currentTime >= nextStartTime) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    },

    stop() {
      stopped = true;
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          // 已停止则忽略
        }
      }
      sources.length = 0;
    },
  };

  currentPcmPlayer = player;
  return player;
}

/**
 * 判断是否正在播放音频
 */
export function isPlaying(): boolean {
  return currentSource !== null;
}
