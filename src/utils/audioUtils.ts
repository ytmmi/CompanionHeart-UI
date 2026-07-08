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
 * 不尝试渐进式播放（MediaSource 过于复杂且不可靠），
 * 而是收集完整数据后统一解码播放。
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
  collectedChunks = [];
  isCollecting = false;
}

/**
 * 判断是否正在播放音频
 */
export function isPlaying(): boolean {
  return currentSource !== null;
}
