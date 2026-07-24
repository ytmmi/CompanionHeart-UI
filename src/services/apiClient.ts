/**
 * API 客户端 — 与 CompanionHeart-Backend 通信
 */

// 后端地址，默认从环境变量读取或使用本地开发地址
// （后端标准启动端口为 8000，见后端文档；如需其他端口用 VITE_API_BASE_URL 覆盖）
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

/** 聊天消息 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 非流式对话响应 */
export interface ChatResponse {
  reply: string;
  model: string;
  engine: string;
}

/** LLM 状态响应 */
export interface LLMStatus {
  engine: string;
  model: string;
  streaming_supported: boolean;
  config_valid: boolean;
}

/** 模型列表响应 */
export interface ModelsResponse {
  models: { id: string; engine: string }[];
  engine: string;
  default_model: string;
}

/**
 * 非流式对话 — POST /api/llm/chat
 */
export async function chat(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    signal?: AbortSignal;
  },
): Promise<ChatResponse> {
  const resp = await fetch(`${API_BASE}/api/llm/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2048,
      top_p: options?.top_p ?? 0.95,
    }),
    signal: options?.signal,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail ??
        `HTTP ${resp.status} ${resp.statusText}`,
    );
  }

  return resp.json() as Promise<ChatResponse>;
}

/**
 * 流式对话 — POST /api/llm/chat/stream（SSE）
 * 返回一个 ReadableStream，每块为字符串文本
 */
export function chatStream(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    signal?: AbortSignal;
  },
): { stream: ReadableStream<string>; response: Promise<Response> } {
  const abortController = new AbortController();
  const signal = options?.signal ?? abortController.signal;

  const responsePromise = fetch(`${API_BASE}/api/llm/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2048,
      top_p: options?.top_p ?? 0.95,
    }),
    signal,
  });

  const stream = new ReadableStream<string>({
    async start(controller) {
      const resp = await responsePromise;
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        controller.error(
          new Error(
            (err as { detail?: string }).detail ??
              `HTTP ${resp.status} ${resp.statusText}`,
          ),
        );
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        controller.error(new Error("响应体为空"));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // 保留未完成行

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;

            const payload = trimmed.slice(6);
            if (payload === "[DONE]") return;

            try {
              const parsed = JSON.parse(payload);
              if (parsed.content) {
                controller.enqueue(parsed.content);
              }
            } catch {
              // 非 JSON 数据跳过
            }
          }
        }

        // 处理剩余 buffer
        if (buffer.startsWith("data: ")) {
          const payload = buffer.slice(6);
          if (payload !== "[DONE]") {
            try {
              const parsed = JSON.parse(payload);
              if (parsed.content) {
                controller.enqueue(parsed.content);
              }
            } catch {
              // 忽略
            }
          }
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return { stream, response: responsePromise };
}

/**
 * 获取 LLM 状态 — GET /api/llm/status
 */
export async function getLLMStatus(): Promise<LLMStatus> {
  const resp = await fetch(`${API_BASE}/api/llm/status`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json() as Promise<LLMStatus>;
}

/**
 * 语音合成 — POST /api/voice/tts
 * 返回音频 Blob（EdgeTTS: MP3，GenieTTS 插件: WAV）
 */
export async function synthesizeSpeech(
  text: string,
  options?: {
    voice?: string;
    signal?: AbortSignal;
  },
): Promise<Blob> {
  const resp = await fetch(`${API_BASE}/api/voice/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      ...(options?.voice ? { voice: options.voice } : {}),
    }),
    signal: options?.signal,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail ??
        `HTTP ${resp.status} ${resp.statusText}`,
    );
  }

  return resp.blob();
}

/**
 * 流式语音合成 — POST /api/voice/tts/stream
 * 逐 chunk 返回 Uint8Array 音频数据块。
 * 通过 response 头判断流格式：
 *   Content-Type: audio/wav + X-Streaming: true → WAV 头 + PCM 真流式（GenieTTS 插件）
 *   其他（audio/mpeg 或 X-Streaming: false）    → 需收集完整数据后解码播放
 */
export function synthesizeSpeechStream(
  text: string,
  options?: {
    voice?: string;
    signal?: AbortSignal;
  },
): {
  stream: ReadableStream<Uint8Array>;
  response: Promise<Response>;
} {
  const signal = options?.signal;

  const responsePromise = fetch(`${API_BASE}/api/voice/tts/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      ...(options?.voice ? { voice: options.voice } : {}),
    }),
    signal,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const resp = await responsePromise;
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        controller.error(
          new Error(
            (err as { detail?: string }).detail ??
              `HTTP ${resp.status} ${resp.statusText}`,
          ),
        );
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        controller.error(new Error("响应体为空"));
        return;
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return { stream, response: responsePromise };
}

/** 句子级同步流式合成的单句数据 */
export interface SentenceChunk {
  /** 句子文本 */
  text: string;
  /** base64 编码的 16-bit PCM @32kHz 单声道 */
  audio: string;
  /** 该句音频时长（毫秒） */
  duration_ms: number;
}

/**
 * 句子级同步流式合成 — POST /api/voice/tts/stream/sentences（NDJSON）
 * 每句的文本与音频成对到达，用于语音-文字严格同步播放。
 * 引擎不支持时后端返回 501，调用方应回退。
 */
export function synthesizeSpeechSentences(
  text: string,
  options?: { signal?: AbortSignal },
): { stream: ReadableStream<SentenceChunk>; response: Promise<Response> } {
  const responsePromise = fetch(`${API_BASE}/api/voice/tts/stream/sentences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: options?.signal,
  });

  const stream = new ReadableStream<SentenceChunk>({
    async start(controller) {
      const resp = await responsePromise;
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        controller.error(
          new Error(
            (err as { detail?: string }).detail ??
              `HTTP ${resp.status} ${resp.statusText}`,
          ),
        );
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        controller.error(new Error("响应体为空"));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      const emit = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          controller.enqueue(JSON.parse(trimmed) as SentenceChunk);
        } catch {
          // 非 JSON 行跳过
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) emit(line);
        }
        emit(buffer);
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return { stream, response: responsePromise };
}

/** TTS 状态响应 */
export interface TTSStatusResponse {
  engine: string;
  voices_count: number;
  streaming_supported: boolean;
  sentence_stream_supported?: boolean;
}

/**
 * 获取 TTS 状态 — GET /api/voice/tts/status
 */
export async function getTTSStatus(): Promise<TTSStatusResponse> {
  const resp = await fetch(`${API_BASE}/api/voice/tts/status`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json() as Promise<TTSStatusResponse>;
}

/** TTS 启用状态响应 */
export interface TTSEnabledResponse {
  enabled: boolean;
}

/**
 * 查询 TTS 是否启用 — GET /api/voice/tts/enabled
 */
export async function getTTSEnabled(): Promise<boolean> {
  const resp = await fetch(`${API_BASE}/api/voice/tts/enabled`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as TTSEnabledResponse;
  return data.enabled;
}

/**
 * 设置 TTS 启用/禁用 — POST /api/voice/tts/enabled
 * 禁用后后端合成端点返回 403，不路由到 TTS 引擎。
 */
export async function setTTSEnabled(enabled: boolean): Promise<boolean> {
  const resp = await fetch(`${API_BASE}/api/voice/tts/enabled`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as TTSEnabledResponse;
  return data.enabled;
}

/**
 * 获取模型列表 — GET /api/llm/models
 */
export async function getModels(): Promise<ModelsResponse> {
  const resp = await fetch(`${API_BASE}/api/llm/models`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json() as Promise<ModelsResponse>;
}
