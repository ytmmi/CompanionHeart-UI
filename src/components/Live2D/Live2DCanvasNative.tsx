/**
 * Live2DCanvas — 基于原生 Cubism SDK 的 Live2D 渲染组件
 *
 * PLATFORM: 全平台通用（Win / Web / Android 平板 / Android 手机）
 * WebGL 渲染依赖设备 GPU 能力，Android 低端设备可能需要降级
 *
 * 替代原有的 pixi-live2d-display + PixiJS 方案，直接使用 Cubism SDK for Web。
 * 参考 Open-LLM-VTuber 的架构：
 * - canvas 元素由 React 创建并管理
 * - 通过 LAppGlManager.setCanvas() 注入到 SDK
 * - SDK 的 Delegate 管理 WebGL 渲染循环
 * - ResizeObserver 监听容器变化，调用 delegate.onResize()
 * - NativeLive2DController 提供表情/动作/口型同步控制
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { CSSProperties } from "react";
import type { Live2DCanvasProps, ModelInfo } from "../../types/live2d";
import { DEFAULT_MODEL_INFO } from "../../config/live2d";
import {
  initNativeLive2D,
  resizeNativeLive2D,
} from "../../cubism-sdk/src/initLive2D";
import { LAppDelegate } from "../../cubism-sdk/src/lappdelegate";
import { NativeLive2DController } from "./NativeLive2DController";
import { LAppLive2DManager } from "../../cubism-sdk/src/lapplive2dmanager";
import type { LAppModel } from "../../cubism-sdk/src/lappmodel";
import { useLive2DStore } from "../../store/live2dStore";

// ─── 全局类型声明 ───────────────────────────────────

declare global {
  interface Window {
    Live2DCubismCore?: {
      Version: number;
      _isInitialized?: boolean;
    };
  }
}

// ─── 常量 ─────────────────────────────────────────────

/** 模型加载总超时时间（毫秒） */
const MODEL_LOAD_TIMEOUT_MS = 20000;
/** 模型加载轮询间隔（毫秒） */
const MODEL_POLL_INTERVAL_MS = 100;
/** 鼠标拖拽判定阈值（像素），小于此值视为点击 */
const DRAG_THRESHOLD_PX = 5;
/** 拖拽灵敏度系数 */
const DRAG_SENSITIVITY = 30;
/** 长按判定时间（毫秒），按住超过此时长进入"拖动模型"模式 */
const LONG_PRESS_MS = 300;

// ─── 调试日志工具（本地持久化）───────────────────────

/**
 * Live2D 调试日志系统 - 三重输出：
 * 1. console（实时查看）
 * 2. 内存环形缓冲区（最近 500 条，防 OOM）
 * 3. localStorage 持久化（键名 __L2D_LOGS__，页面刷新/崩溃后可恢复）
 *
 * 全局 API（浏览器控制台执行）：
 *   __L2D_EXPORT_LOGS__()  → 下载完整 .log 文件
 *   __L2D_CLEAR_LOGS__()   → 清空本地日志
 *   __L2D_VIEW_LOGS__()    → console.table 查看最近 50 条
 *   __L2D_FLUSH_LOGS__()   → 强制刷新到 localStorage
 *   __L2D_LOG_ENABLED__ = false → 关闭日志
 *
 * Chrome DevTools → Application → Local Storage → __L2D_LOGS__ 可直接查看
 */

let LOG_ENABLED = true;
const LOG_BUFFER_SIZE = 500;
const LS_LOG_KEY = "__L2D_LOGS__";
const LS_MAX_CHARS = 3_500_000;

interface LogEntry {
  t: string;
  id: number;
  ph: string;
  lv: string;
  msg: string;
  data?: unknown;
  mem?: string;
}
const logBuffer: LogEntry[] = [];
let bufferWriteIdx = 0;
let flushTimerId: ReturnType<typeof setTimeout> | null = null;
let restoredFromLS = false;

function now(): string {
  return (performance.now() / 1000).toFixed(3) + "s";
}
function getMemSnapshot(): string {
  try {
    const m = (performance as any).memory;
    if (m)
      return `JS堆:${(m.usedJSHeapSize / 1048576).toFixed(1)}/${(m.jsHeapSizeLimit / 1048576).toFixed(1)}MB`;
  } catch {}
  return "";
}

function restoreFromLS(): void {
  if (restoredFromLS) return;
  restoredFromLS = true;
  try {
    const raw = localStorage.getItem(LS_LOG_KEY);
    if (!raw) return;
    const entries: LogEntry[] = JSON.parse(raw);
    if (!Array.isArray(entries)) return;
    const toRestore = entries.slice(-LOG_BUFFER_SIZE);
    for (const e of toRestore) {
      logBuffer[bufferWriteIdx % LOG_BUFFER_SIZE] = e;
      bufferWriteIdx++;
    }
    console.log(
      `[L2D] 📂 从 localStorage 恢复 ${toRestore.length} 条历史日志（共 ${entries.length} 条）`,
    );
  } catch (e) {
    console.warn("[L2D] localStorage 恢复失败:", e);
  }
}

function _doFlushToLS(): void {
  try {
    const allEntries: LogEntry[] = [];
    for (let i = 0; i < LOG_BUFFER_SIZE; i++) {
      const e = logBuffer[i];
      if (e) allEntries.push(e);
    }
    if (allEntries.length === 0) return;
    let existing: LogEntry[] = [];
    try {
      const raw = localStorage.getItem(LS_LOG_KEY);
      if (raw) existing = JSON.parse(raw) || [];
    } catch {}
    const existingSet = new Set(existing.map((e) => `${e.t}|${e.msg}`));
    const newEntries = allEntries.filter(
      (e) => !existingSet.has(`${e.t}|${e.msg}`),
    );
    if (newEntries.length === 0) return;
    const merged = [...existing, ...newEntries];
    let json = JSON.stringify(merged);
    if (json.length > LS_MAX_CHARS) {
      const trimmed = merged.slice(Math.floor(merged.length / 2));
      json = JSON.stringify(trimmed);
      console.warn(`[L2D] ⚠️ 日志过大，已截断至最近 ${trimmed.length} 条`);
    }
    localStorage.setItem(LS_LOG_KEY, json);
  } catch (e) {
    console.warn("[L2D] localStorage 写入失败:", e);
    try {
      localStorage.removeItem(LS_LOG_KEY);
      const slim = logBuffer.filter(Boolean).slice(-50);
      if (slim.length > 0)
        localStorage.setItem(LS_LOG_KEY, JSON.stringify(slim));
    } catch {}
  }
}

function flushToLS(): void {
  if (flushTimerId !== null) return;
  flushTimerId = setTimeout(() => {
    flushTimerId = null;
    _doFlushToLS();
  }, 500);
}

function forceFlushLogs(): void {
  if (flushTimerId !== null) {
    clearTimeout(flushTimerId);
    flushTimerId = null;
  }
  _doFlushToLS();
}

function writeLog(
  level: "log" | "warn" | "error",
  id: number,
  phase: string,
  msg: string,
  data?: unknown,
): void {
  if (!LOG_ENABLED) return;
  const mem = getMemSnapshot();
  const tag = `[L2D#${id}]`;
  const time = now();
  const prefix = `${time} ${tag} [${phase}]`;
  const memSuffix = mem ? ` | ${mem}` : "";
  if (data !== undefined) console[level](`${prefix} ${msg}${memSuffix}`, data);
  else console[level](`${prefix} ${msg}${memSuffix}`);
  const entry: LogEntry = {
    t: new Date().toISOString(),
    id,
    ph: phase,
    lv: level,
    msg,
    data,
    mem,
  };
  logBuffer[bufferWriteIdx % LOG_BUFFER_SIZE] = entry;
  bufferWriteIdx++;
  flushToLS();
  if (level === "error") forceFlushLogs();

  // ── 发送日志到 Vite 服务器写入本地文件 ──
  // sendBeacon 适用于页面崩溃/卸载场景，不阻塞主线程
  try {
    const payload = JSON.stringify(entry);
    if (level === "error" || level === "warn") {
      navigator.sendBeacon("/__l2d_log__", payload);
    } else {
      fetch("/__l2d_log__", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {
        /* 静默忽略 */
      });
    }
  } catch {
    /* 发送失败不影响主功能 */
  }
}

function l2dLog(id: number, phase: string, msg: string, data?: unknown): void {
  writeLog("log", id, phase, msg, data);
}
function l2dWarn(id: number, phase: string, msg: string, data?: unknown): void {
  writeLog("warn", id, phase, msg, data);
}
function l2dError(
  id: number,
  phase: string,
  msg: string,
  data?: unknown,
): void {
  writeLog("error", id, phase, msg, data);
}

function exportLogsToFile(): void {
  try {
    forceFlushLogs();
    const raw = localStorage.getItem(LS_LOG_KEY);
    if (!raw) {
      console.warn("[L2D] 没有可导出的日志");
      return;
    }
    const entries: LogEntry[] = JSON.parse(raw);
    const lines = entries.map(
      (e) =>
        `${e.t} [#${e.id}] [${e.ph}] [${e.lv.toUpperCase()}] ${e.msg}${e.mem ? " | " + e.mem : ""}`,
    );
    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `live2d-debug-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`[L2D] 📥 已下载 ${entries.length} 条日志`);
  } catch (e) {
    console.error("[L2D] 导出失败:", e);
  }
}

function clearLogs(): void {
  try {
    localStorage.removeItem(LS_LOG_KEY);
    logBuffer.length = 0;
    bufferWriteIdx = 0;
    console.log("[L2D] 🗑️ 本地日志已清空");
  } catch (e) {
    console.warn("[L2D] 清空失败:", e);
  }
}

if (typeof window !== "undefined") {
  restoreFromLS();
  window.addEventListener("beforeunload", () => forceFlushLogs());
  Object.defineProperty(window, "__L2D_LOG_ENABLED__", {
    get: () => LOG_ENABLED,
    set: (v: boolean) => {
      LOG_ENABLED = v;
    },
    configurable: true,
  });
  (window as any).__L2D_EXPORT_LOGS__ = exportLogsToFile;
  (window as any).__L2D_CLEAR_LOGS__ = clearLogs;
  (window as any).__L2D_FLUSH_LOGS__ = forceFlushLogs;
  (window as any).__L2D_VIEW_LOGS__ = () => {
    try {
      const raw = localStorage.getItem(LS_LOG_KEY);
      if (raw) {
        const entries = JSON.parse(raw);
        console.table(entries.slice(-50));
        console.log(`共 ${entries.length} 条日志（显示最近 50 条）`);
      } else console.log("[L2D] 暂无本地日志");
    } catch (e) {
      console.warn("[L2D] 查看失败:", e);
    }
  };
}

// ─── 样式 ─────────────────────────────────────────────

const containerStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  backgroundColor: "transparent",
  // 创建独立层叠上下文，确保内部 overlay/遮罩层级仅在容器内生效
  // 不会穿透覆盖页面全局元素（导航栏、弹窗、下拉菜单等）
  isolation: "isolate",
  zIndex: 0,
};

const canvasStyle: CSSProperties = {
  display: "block",
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
};

const loadingOverlay: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 14,
  color: "#999",
  backgroundColor: "rgba(255,255,255,0.5)",
  zIndex: 1,
  whiteSpace: "pre-line",
  textAlign: "center",
  padding: "0 16px",
  // 遮罩层级仅在容器 isolation 上下文内生效
  pointerEvents: "auto",
};

const errorOverlay: CSSProperties = {
  ...loadingOverlay,
  color: "#e74c3c",
};

// ─── 实例计数器（多实例支持） ────────────────────────

let globalInstanceCounter = 0;

// ─── 组件 ─────────────────────────────────────────────

/**
 * Live2DCanvas — 原生 Cubism SDK 渲染画布
 *
 * 渲染流程：
 * 1. 创建 canvas 元素，设置 CSS 填满容器
 * 2. 调用 initNativeLive2D() 初始化 SDK（注入 canvas → GL → Delegate → 渲染循环）
 * 3. 等待模型加载完成，创建 NativeLive2DController 并绑定
 * 4. ResizeObserver 监听容器变化，调用 delegate.onResize()
 * 5. 组件卸载时清理 SDK 资源
 */
export default function Live2DCanvas({
  width = "100%",
  height = "100%",
  className,
  style,
  controllerRef,
  modelInfo,
  onControllerReady,
}: Live2DCanvasProps) {
  // ── 合并配置 ──
  const config: ModelInfo = { ...DEFAULT_MODEL_INFO, ...modelInfo };

  // ── 实例 ID ──
  const instanceIdRef = useRef(++globalInstanceCounter);

  // ── Refs ──
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const controllerRef_ = useRef<NativeLive2DController | null>(null);
  const generationRef = useRef(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const interactionCleanupRef = useRef<(() => void) | null>(null);
  /** 追踪所有 setTimeout / requestAnimationFrame ID，确保组件卸载时全部取消 */
  const timerIdsRef = useRef<Set<number>>(new Set());
  /** 防止 cleanup 重复执行 */
  const cleanedUpRef = useRef(false);
  /** 保存最新的 cleanup 函数引用，避免 useEffect 依赖循环导致重复初始化 */
  const cleanupFnRef = useRef<(() => void) | null>(null);
  /** WebGL 上下文丢失监听器清理函数 */
  const glContextCleanupRef = useRef<(() => void) | null>(null);
  /** 页面可见性监听器清理函数 */
  const visibilityCleanupRef = useRef<(() => void) | null>(null);
  /** DPR 变化监听器清理函数 */
  const dprCleanupRef = useRef<(() => void) | null>(null);
  /** ResizeObserver 防抖定时器 ID */
  const resizeDebounceRef = useRef<number | null>(null);
  /** ResizeObserver 防抖用的 rAF ID（参考 Open-LLM-VTuber，使用 rAF 代替 setTimeout） */
  const resizeRafRef = useRef<number | null>(null);
  /** 是否有待处理的 resize（rAF 去抖标志） */
  const resizePendingRef = useRef(false);
  /** 滚轮缩放动画 rAF ID */
  const scaleAnimRef = useRef<number | null>(null);
  /** 滚轮缩放目标值（视图缩放因子，1.0 = 原始大小） */
  const targetScaleRef = useRef(1.0);
  /** 滚轮缩放当前值（用于平滑动画） */
  const currentScaleRef = useRef(1.0);
  /** 是否正在缩放动画中 */
  const isScaleAnimatingRef = useRef(false);
  /** 缩放缓动系数 */
  const SCALE_EASING = 0.3;
  /** 最小缩放 */
  const MIN_SCALE = 0.1;
  /** 最大缩放 */
  const MAX_SCALE = 5.0;
  /** 组件是否已挂载，用于防止卸载后 setState（替代不可靠的 generation > 0 判断） */
  const isMountedRef = useRef(false);

  // ── State ──
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState<string>("初始化中...");
  const [error, setError] = useState<string | null>(null);

  // ── 安全的 setState（通过 isMountedRef 防止卸载后更新）──
  const safeSetLoading = useCallback((_value: boolean) => {
    if (isMountedRef.current) setLoading(_value);
  }, []);
  const safeSetLoadingStatus = useCallback((_value: string) => {
    if (isMountedRef.current) setLoadingStatus(_value);
  }, []);
  const safeSetError = useCallback((_value: string | null) => {
    if (isMountedRef.current) setError(_value);
  }, []);

  // ── 统一资源清理（幂等，可安全重复调用）──
  const cleanup = useCallback(() => {
    if (cleanedUpRef.current) {
      l2dLog(instanceIdRef.current, "CLEANUP", "已清理过，跳过（幂等保护）");
      return;
    }
    cleanedUpRef.current = true;

    const id = instanceIdRef.current;
    l2dLog(id, "CLEANUP", "▶ 开始资源清理...", {
      timerCount: timerIdsRef.current.size,
    });

    // 0. 取消所有挂起的定时器和动画帧
    const timerIds = timerIdsRef.current;
    if (timerIds.size > 0) {
      l2dLog(id, "CLEANUP", `取消 ${timerIds.size} 个定时器/动画帧`, [
        ...timerIds,
      ]);
      timerIds.forEach((tid) => {
        clearTimeout(tid);
        cancelAnimationFrame(tid);
      });
      timerIds.clear();
      l2dLog(id, "CLEANUP", "已取消所有定时器/动画帧");
    }

    // 0a. 清除 resize rAF 防抖
    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = null;
    }
    resizePendingRef.current = false;

    // 0b. 清除缩放动画 rAF
    if (scaleAnimRef.current !== null) {
      cancelAnimationFrame(scaleAnimRef.current);
      scaleAnimRef.current = null;
    }
    isScaleAnimatingRef.current = false;

    // 0c. 清除 resize 防抖定时器（兼容旧方案）
    if (resizeDebounceRef.current !== null) {
      clearTimeout(resizeDebounceRef.current);
      timerIdsRef.current.delete(resizeDebounceRef.current);
      resizeDebounceRef.current = null;
    }

    // 1. 清理鼠标/触摸交互监听器
    if (interactionCleanupRef.current) {
      try {
        interactionCleanupRef.current();
        l2dLog(id, "CLEANUP", "已清理交互监听器（鼠标+触摸+滚轮）");
      } catch (e) {
        l2dWarn(id, "CLEANUP", "交互清理异常", e);
      }
      interactionCleanupRef.current = null;
    }

    // 2. 清理控制器引用
    if (controllerRef) controllerRef.current = null;

    if (controllerRef_.current) {
      try {
        controllerRef_.current.destroy();
        l2dLog(id, "CLEANUP", "已销毁控制器");
      } catch (e) {
        l2dWarn(id, "CLEANUP", "控制器销毁异常", e);
      }
      controllerRef_.current = null;
    }

    // 3. 停止并销毁 ResizeObserver
    if (observerRef.current) {
      try {
        observerRef.current.disconnect();
        l2dLog(id, "CLEANUP", "已断开 ResizeObserver");
      } catch (e) {
        l2dWarn(id, "CLEANUP", "Observer 断开异常", e);
      }
      observerRef.current = null;
    }

    // 4. 移除 WebGL 上下文监听器
    if (glContextCleanupRef.current) {
      try {
        glContextCleanupRef.current();
        l2dLog(id, "CLEANUP", "已移除 WebGL 上下文监听器");
      } catch (e) {
        l2dWarn(id, "CLEANUP", "GL 上下文监听器清理异常", e);
      }
      glContextCleanupRef.current = null;
    }

    // 5. 移除页面可见性监听器
    if (visibilityCleanupRef.current) {
      try {
        visibilityCleanupRef.current();
        l2dLog(id, "CLEANUP", "已移除页面可见性监听器");
      } catch (e) {
        l2dWarn(id, "CLEANUP", "可见性监听器清理异常", e);
      }
      visibilityCleanupRef.current = null;
    }

    // 6. 移除 DPR 变化监听器
    if (dprCleanupRef.current) {
      try {
        dprCleanupRef.current();
        l2dLog(id, "CLEANUP", "已移除 DPR 变化监听器");
      } catch (e) {
        l2dWarn(id, "CLEANUP", "DPR 监听器清理异常", e);
      }
      dprCleanupRef.current = null;
    }

    // 7. 调用 SDK 清理函数（释放所有模型、纹理、WebGL 资源）
    if (cleanupRef.current) {
      try {
        l2dLog(id, "CLEANUP", "正在调用 SDK 全量释放...");
        cleanupRef.current();
        l2dLog(id, "CLEANUP", "✅ SDK 资源已全量释放");
      } catch (e) {
        l2dWarn(id, "CLEANUP", "SDK 清理异常", e);
      }
      cleanupRef.current = null;
    }

    l2dLog(id, "CLEANUP", "✅ 清理完成");
    // 清理完成后强制刷新日志到 localStorage（页面崩溃前最后的日志）
    forceFlushLogs();
  }, [controllerRef]);

  // 保持 cleanupFnRef 始终指向最新的 cleanup 函数
  cleanupFnRef.current = cleanup;

  // ── 初始化 ──
  const init = useCallback(async () => {
    const gen = ++generationRef.current;
    const id = instanceIdRef.current;
    l2dLog(id, "INIT", `▶ 开始初始化 #${gen}`, {
      modelUrl: config.url,
      kScale: config.kScale,
    });
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) {
      l2dWarn(id, "INIT", "容器或 canvas 不存在，放弃初始化");
      return;
    }

    // 清理上一次的资源，重置清理标志以便本次可以再次清理
    l2dLog(id, "INIT", `调用旧 cleanup（gen ${gen - 1}）`);
    cleanupFnRef.current?.();
    cleanedUpRef.current = false;

    try {
      // 0. 校验容器尺寸，避免零尺寸导致 WebGL 初始化失败
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      l2dLog(
        id,
        "INIT",
        `容器尺寸: ${cw}x${ch}, DPR: ${window.devicePixelRatio}`,
      );
      if (cw <= 0 || ch <= 0) {
        l2dWarn(id, "INIT", `容器尺寸为零 (${cw}x${ch})，无法初始化`);
        safeSetError(
          "容器尺寸为 0，无法渲染 Live2D 模型。\n（排查：检查父级 CSS 布局是否正确，确保容器有明确的宽高）",
        );
        safeSetLoading(false);
        return;
      }

      if (gen !== generationRef.current) {
        l2dWarn(
          id,
          "INIT",
          `世代不匹配 #${gen} vs #${generationRef.current}，放弃`,
        );
        return;
      }

      // 0a. 检查 Cubism Core 是否加载
      const cubismCore = window.Live2DCubismCore;
      l2dLog(
        id,
        "INIT",
        `CubismCore 状态: ${typeof cubismCore === "undefined" ? "未加载" : `v${cubismCore.Version}`}`,
      );
      if (typeof cubismCore === "undefined") {
        throw new Error(
          "Live2D Cubism Core 未加载。请确认 index.html 中 live2dcubismcore.min.js 已正确引用。（排查：检查 <script> 标签顺序，确保在组件渲染前加载）",
        );
      }

      // 0b. 安全的状态更新
      safeSetLoading(true);
      safeSetLoadingStatus("初始化中...");
      safeSetError(null);

      // 1. 设置 canvas 像素尺寸
      safeSetLoadingStatus("创建渲染器...");
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      l2dLog(
        id,
        "INIT",
        `Canvas 尺寸设置: ${canvas.width}x${canvas.height} (CSS ${cw}x${ch}, DPR ${dpr})`,
      );

      if (gen !== generationRef.current) {
        l2dWarn(
          id,
          "INIT",
          `世代不匹配 #${gen} vs #${generationRef.current}，放弃`,
        );
        return;
      }

      // 2. 初始化原生 Cubism SDK
      safeSetLoadingStatus("加载模型中...");
      l2dLog(id, "INIT", "调用 initNativeLive2D...");
      const cleanupFn = initNativeLive2D(canvas, {
        modelUrl: config.url,
        kScale: config.kScale,
      });
      cleanupRef.current = cleanupFn;
      l2dLog(id, "INIT", "initNativeLive2D 返回，cleanupFn 已保存");

      if (gen !== generationRef.current) {
        l2dWarn(id, "INIT", `SDK init 后世代不匹配，调用 cleanupFn`);
        cleanupFn();
        return;
      }

      // 2a. 注册 WebGL 上下文丢失/恢复监听
      l2dLog(id, "INIT", "注册 WebGL 上下文监听器...");
      glContextCleanupRef.current = setupGLContextListeners(
        canvas,
        gen,
        generationRef,
        `[L2D#${id}]`,
        safeSetError,
        () => {
          if (!isMountedRef.current) return;
          l2dLog(id, "INIT", "WebGL 上下文恢复，触发全量重新初始化");
          generationRef.current += 1;
          cleanedUpRef.current = false;
          init();
        },
      );

      // 2b. 注册页面可见性监听
      l2dLog(id, "INIT", "注册页面可见性监听器...");
      visibilityCleanupRef.current = setupVisibilityListener(
        `[L2D#${id}]`,
        gen,
        generationRef,
      );

      // 2c. 注册 DPR 变化监听
      l2dLog(id, "INIT", "注册 DPR 变化监听器...");
      dprCleanupRef.current = setupDPRListener(
        canvas,
        container,
        gen,
        generationRef,
        timerIdsRef,
      );

      // 3. 等待模型加载完成
      safeSetLoadingStatus("等待模型加载...");
      l2dLog(
        id,
        "INIT",
        "开始等待模型加载（轮询间隔: " +
          MODEL_POLL_INTERVAL_MS +
          "ms, 超时: " +
          MODEL_LOAD_TIMEOUT_MS +
          "ms）",
      );
      const { ready: modelReadyPromise, cancel: cancelPolling } = waitForModel(
        gen,
        generationRef,
        timerIdsRef,
      );
      const modelReady = await modelReadyPromise;
      if (gen !== generationRef.current) {
        l2dWarn(id, "INIT", `模型等待结果时世代不匹配，取消轮询`);
        cancelPolling();
        return;
      }
      cancelPolling();
      l2dLog(id, "INIT", `模型加载结果: ${modelReady ? "✅ 就绪" : "❌ 超时"}`);

      if (!modelReady) {
        throw new Error("模型加载超时");
      }

      // 4. 创建控制器并绑定（传入 config 以支持 VTS 模型的 expressionFiles/motionFiles）
      l2dLog(id, "INIT", "创建 NativeLive2DController...");
      const ctrl = new NativeLive2DController();
      ctrl.bind(config);
      l2dLog(
        id,
        "INIT",
        `控制器已绑定: ${ctrl.expressionList.length} 表情, ${ctrl.motionList.length} 动作`,
      );

      controllerRef_.current = ctrl;
      if (controllerRef) controllerRef.current = ctrl;
      onControllerReady?.(ctrl);

      // 5. 设置默认表情
      if (config.defaultEmotion !== undefined) {
        ctrl.setExpression(String(config.defaultEmotion));
      }

      // 6. 播放空闲动作
      if (config.idleMotionGroupName) {
        ctrl.setMotion(config.idleMotionGroupName);
      }

      // 7. 设置 ResizeObserver（rAF 去抖，每帧最多同步 resize 一次）
      l2dLog(id, "INIT", "设置 ResizeObserver + rAF 去抖...");
      if (observerRef.current) {
        l2dLog(id, "INIT", "断开旧 ResizeObserver");
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      // 追踪上次 resize 的尺寸和 DPR，避免无变化时重复重绘
      let lastResizeW = 0;
      let lastResizeH = 0;
      let lastResizeDpr = 0;
      /** 执行一次画布缓冲重建 + SDK resize（onResize 内部会同步重绘一帧，
       *  避免空缓冲被合成造成闪烁；同尺寸时 _resizeCanvas 内部跳过重建） */
      const doResize = () => {
        if (gen !== generationRef.current) return;
        const newCw = container.clientWidth;
        const newCh = container.clientHeight;
        if (newCw <= 0 || newCh <= 0) return;
        const newDpr = window.devicePixelRatio || 1;
        // 尺寸与 DPR 均无变化时跳过重绘
        if (
          newCw === lastResizeW &&
          newCh === lastResizeH &&
          newDpr === lastResizeDpr
        ) {
          return;
        }
        lastResizeW = newCw;
        lastResizeH = newCh;
        lastResizeDpr = newDpr;
        // 缓冲重建统一交给 SDK 的 _resizeCanvas（内部有同尺寸跳过保护），
        // 此处不再手动设置 canvas.width/height，避免每次 resize 双重重建缓冲
        resizeNativeLive2D();
      };
      const observer = new ResizeObserver(() => {
        if (gen !== generationRef.current) return;
        // rAF 去抖：合并同一帧内的多次回调，每帧最多 resize 一次。
        // 每帧都跟随最新尺寸重建缓冲（而非节流跳帧），
        // 否则缓冲宽高比与 CSS 显示尺寸不一致，模型会被拉伸。
        if (!resizePendingRef.current) {
          resizePendingRef.current = true;
          resizeRafRef.current = requestAnimationFrame(() => {
            resizeRafRef.current = null;
            resizePendingRef.current = false;
            doResize();
          });
        }
      });
      observer.observe(container);
      observerRef.current = observer;
      l2dLog(id, "INIT", "ResizeObserver 已创建并开始监听");

      // 7a. 设置滚轮缩放（参考 Open-LLM-VTuber 平滑缩放动画）
      // 开关由 live2dStore.wheelZoomEnabled 控制（UI 可切换），
      // 且仅当鼠标指针悬停在模型上（hit test 命中）时才缩放
      const handleWheel = (e: WheelEvent) => {
        if (!useLive2DStore.getState().wheelZoomEnabled) return;
        if (hitTestModel(canvas, e.clientX, e.clientY) === null) return;
        e.preventDefault();
        const direction = e.deltaY > 0 ? -1 : 1;
        // 步长由 live2dStore.wheelZoomStep 控制（测试面板滑块可调）
        const increment = useLive2DStore.getState().wheelZoomStep * direction;
        const currentActual = currentScaleRef.current;
        targetScaleRef.current = Math.max(
          MIN_SCALE,
          Math.min(MAX_SCALE, currentActual + increment),
        );
        // 启动平滑缩放动画（若未在运行）
        if (!isScaleAnimatingRef.current) {
          isScaleAnimatingRef.current = true;
          const animateScale = () => {
            const current = currentScaleRef.current;
            const target = targetScaleRef.current;
            const diff = target - current;
            // 差值足够小时直接设为目标值并停止
            if (Math.abs(diff) < 0.001) {
              currentScaleRef.current = target;
              applyModelScale(target);
              isScaleAnimatingRef.current = false;
              scaleAnimRef.current = null;
              return;
            }
            const newScale = current + diff * SCALE_EASING;
            currentScaleRef.current = newScale;
            applyModelScale(newScale);
            scaleAnimRef.current = requestAnimationFrame(animateScale);
          };
          scaleAnimRef.current = requestAnimationFrame(animateScale);
        }
      };
      // wheelCleanup 将在 interactionCleanupRef 中统一管理
      const wheelCleanup = () => {
        canvas.removeEventListener("wheel", handleWheel);
      };
      canvas.addEventListener("wheel", handleWheel, { passive: false });

      // 8. 设置鼠标 + 触摸交互（含 hit test）
      l2dLog(id, "INIT", "设置鼠标/触摸/滚轮交互...");
      const interactionCleanup = setupCanvasInteraction(canvas, ctrl);
      interactionCleanupRef.current = () => {
        interactionCleanup();
        wheelCleanup();
      };
      l2dLog(id, "INIT", "交互监听器已注册");

      // 9. 完成初始化
      if (gen !== generationRef.current) {
        l2dWarn(id, "INIT", "交互设置后世代不匹配，放弃");
        return;
      }

      // 单帧延迟确保 CSS flex 布局完成最终计算
      const rafId = requestAnimationFrame(() => {
        timerIdsRef.current.delete(rafId);
        if (gen !== generationRef.current) return;
        resizeNativeLive2D();
      });
      timerIdsRef.current.add(rafId);

      safeSetLoading(false);
      l2dLog(id, "INIT", `✅ 初始化完成 #${gen}`);
    } catch (err: unknown) {
      l2dError(id, "INIT", `初始化异常 #${gen}`, err);
      if (resizeDebounceRef.current !== null) {
        clearTimeout(resizeDebounceRef.current);
        timerIdsRef.current.delete(resizeDebounceRef.current);
        resizeDebounceRef.current = null;
      }
      if (gen !== generationRef.current) {
        l2dWarn(id, "INIT", `异常时世代不匹配`);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (message === "CANCELLED_BY_GENERATION") return;
      const friendlyMessage = getFriendlyErrorMessage(message, config.url);
      safeSetError(friendlyMessage);
      safeSetLoading(false);
      l2dLog(id, "INIT", `错误提示: ${friendlyMessage.substring(0, 80)}...`);
      // 初始化失败时强制刷新日志到本地存储
      forceFlushLogs();
    }
    // 依赖只包含影响初始化的配置项
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.url,
    config.kScale,
    config.defaultEmotion,
    config.idleMotionGroupName,
  ]);

  // ── 生命周期 ──
  useEffect(() => {
    const id = instanceIdRef.current;
    l2dLog(id, "LIFECYCLE", "🟢 组件挂载");
    isMountedRef.current = true;
    cleanedUpRef.current = false;
    init();

    return () => {
      l2dLog(id, "LIFECYCLE", "🔴 组件卸载，递增 gen + 调用 cleanup");
      isMountedRef.current = false;
      generationRef.current += 1;
      cleanupFnRef.current?.();
      l2dLog(id, "LIFECYCLE", "🔴 cleanup 已调用");
    };
    // 只依赖 init，避免 controllerRef 变化触发完整 SDK 重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init]);

  // ── 渲染 ──
  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        ...containerStyle,
        ...style,
        width: style?.width ?? width,
        height: style?.height ?? height,
      }}
    >
      {/* 不设置固定 id，避免多实例 ID 冲突 */}
      <canvas
        ref={canvasRef}
        style={canvasStyle}
      />
      {loading && <div style={loadingOverlay}>⏳ {loadingStatus}</div>}
      {error && (
        <div style={errorOverlay}>
          <span>❌ {error}</span>
        </div>
      )}
    </div>
  );
}

// ─── 工具函数 ─────────────────────────────────────────

/**
 * 使用 SDK 的 _deviceToScreen 进行屏幕坐标→模型坐标转换（参考 Open-LLM-VTuber）。
 * 比手动 normalizeCoords 更准确，与 SDK 内部的 hit test 坐标系统一致。
 */
function screenToModelCoords(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const delegate = LAppDelegate.getInstance();
  const view = delegate?.getView();
  if (!view?._deviceToScreen) return null;
  const scale = canvas.width / rect.width;
  const sx = (clientX - rect.left) * scale;
  const sy = (clientY - rect.top) * scale;
  return {
    x: view._deviceToScreen.transformX(sx),
    y: view._deviceToScreen.transformY(sy),
  };
}

/**
 * 检测指定屏幕坐标是否命中模型（hit test，参考 Open-LLM-VTuber）。
 * 返回命中的区域名称；模型未定义命中区域时兜底返回 "model"；未命中返回 null。
 */
function hitTestModel(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): string | null {
  const manager = LAppLive2DManager.getInstance();
  const model = manager?.getModel(0);
  if (!model) return null;
  const modelCoords = screenToModelCoords(canvas, clientX, clientY);
  if (!modelCoords) return null;
  const areaName = (model as any).anyhitTest?.(modelCoords.x, modelCoords.y);
  if (areaName != null) return areaName;
  const isHit = (model as any).isHitOnModel?.(modelCoords.x, modelCoords.y);
  return isHit ? "model" : null;
}

/**
 * 按增量平移模型（长按拖动用）。
 * dx/dy 为 _deviceToScreen 坐标系下的增量，与 hit test / tap 坐标系一致。
 */
function translateModelBy(dx: number, dy: number): void {
  try {
    const manager = LAppLive2DManager.getInstance();
    const model = manager?.getModel(0);
    if (!model) return;
    // @ts-ignore - _modelMatrix 是 SDK 内部属性
    const matrix = (model as any)._modelMatrix;
    if (!matrix) return;
    matrix.translateX(matrix.getTranslateX() + dx);
    matrix.translateY(matrix.getTranslateY() + dy);
  } catch {
    // 模型尚未就绪时静默忽略
  }
}

/**
 * 等待模型加载完成（带可取消的轮询定时器）
 *
 * 每次创建新定时器前移除旧 ID，防止 timerIdsRef 堆积过期 ID。
 * 优先使用公开 API 判断加载状态，私有属性仅作兜底。
 */
function waitForModel(
  currentGen: number,
  genRef: React.MutableRefObject<number>,
  timerIdsRef?: React.MutableRefObject<Set<number>>,
): { ready: Promise<boolean>; cancel: () => void } {
  const startTime = Date.now();
  let timerId: number | null = null;
  let resolved = false;

  const clearPrevTimer = () => {
    if (timerId !== null && timerIdsRef) {
      timerIdsRef.current.delete(timerId);
    }
  };

  const ready = new Promise<boolean>((resolve) => {
    const check = () => {
      if (resolved) return;
      if (genRef.current !== currentGen) {
        resolved = true;
        resolve(false);
        return;
      }

      const manager = LAppLive2DManager.getInstance();
      if (!manager) {
        clearPrevTimer();
        timerId = window.setTimeout(check, MODEL_POLL_INTERVAL_MS);
        if (timerIdsRef && timerId !== null) {
          timerIdsRef.current.add(timerId);
        }
        return;
      }

      const model = manager.getModel(0);
      const isReady = checkModelReady(model);

      if (isReady) {
        resolved = true;
        resolve(true);
        return;
      }

      if (Date.now() - startTime > MODEL_LOAD_TIMEOUT_MS) {
        resolved = true;
        resolve(false);
        return;
      }

      clearPrevTimer();
      timerId = window.setTimeout(check, MODEL_POLL_INTERVAL_MS);
      if (timerIdsRef && timerId !== null) {
        timerIdsRef.current.add(timerId);
      }
    };

    check();
  });

  const cancel = () => {
    if (!resolved) {
      clearPrevTimer();
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    }
    resolved = true;
  };

  return { ready, cancel };
}

/**
 * 检测模型是否已加载完成并可渲染。
 *
 * 🆕 修复：原逻辑仅检查 _model 存在性，未验证渲染器是否就绪。
 * 模型 draw() 实际需要 renderer + program 才能渲染，仅 _model 存在不足以判定可渲染。
 * 新逻辑：
 * 1. 检查 _state == CompleteSetup (值为22) — SDK 标准加载完成标志
 * 2. 检查 renderer 是否存在并已初始化（有 shader program）
 * 3. 兜底：检查 _model + _initialized
 */
function checkModelReady(model: LAppModel | null): boolean {
  if (!model) return false;

  // 🆕 最佳：检查 _state 是否为 CompleteSetup (22)
  const state = (model as any)._state;
  if (typeof state === "number" && state === 22) {
    return true;
  }

  // 🆕 次选：检查渲染器是否已就绪（即使 _state 未到 CompleteSetup，
  //        若 renderer 已有 shader program 则可兜底渲染）
  try {
    const renderer = (model as any).getRenderer?.();
    if (renderer) {
      const hasProgram =
        !!(renderer as any)._programId || !!(renderer as any)._shaderProgram;
      const hasModel = !!(model as any)._model;
      if (hasProgram && hasModel) {
        return true;
      }
    }
  } catch {
    // getRenderer 不可用，继续其他检测
  }

  // 备选：公开的 isInitialized 方法
  if (typeof (model as any).isInitialized === "function") {
    return (model as any).isInitialized();
  }

  // 备选：公开的 initialized 属性
  if (typeof (model as any).initialized === "boolean") {
    return (model as any).initialized;
  }

  // 兜底：私有属性 _initialized（SDK 版本兼容）
  if ((model as any)._initialized !== undefined) {
    return (model as any)._initialized === true;
  }

  // 最后兜底：检查是否有可渲染内容
  return !!(model as any)._model;
}

/**
 * 注册 WebGL 上下文丢失/恢复监听器
 */
function setupGLContextListeners(
  canvas: HTMLCanvasElement,
  _currentGen: number,
  _genRef: React.MutableRefObject<number>,
  instanceTag: string,
  onError: (msg: string | null) => void,
  onReinit: () => void,
): () => void {
  const onContextLost = (e: Event) => {
    e.preventDefault();
    console.warn(`${instanceTag} WebGL 上下文丢失`);
    onError(
      "WebGL 上下文丢失，可能因内存不足或显卡驱动异常。\n（排查：关闭其他 3D 应用、更新显卡驱动、重启浏览器）",
    );
  };

  const onContextRestored = () => {
    console.log(`${instanceTag} WebGL 上下文恢复，触发全量重新初始化`);
    onError(null);
    // WebGL 上下文恢复后，所有 GPU 资源（纹理/缓冲区/着色器）已失效
    // 必须全量重新初始化，仅 resize 不够
    onReinit();
  };

  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  return () => {
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
  };
}

/**
 * 注册页面可见性监听器
 * 页面切后台时渲染循环自动暂停（由 LAppDelegate run loop 的 _running 标志控制），
 * 恢复时触发 resize 刷新画面。
 */
function setupVisibilityListener(
  instanceTag: string,
  currentGen: number,
  genRef: React.MutableRefObject<number>,
): () => void {
  const onVisibilityChange = () => {
    if (genRef.current !== currentGen) return;
    const delegate = LAppDelegate.getInstance();
    if (!delegate) return;

    if (document.hidden) {
      console.log(`${instanceTag} 页面隐藏，暂停渲染循环`);
      // 使用公开 API 暂停渲染循环（停止 rAF + 模型更新）
      delegate.pause();
    } else {
      console.log(`${instanceTag} 页面可见，恢复渲染循环`);
      // resume() 内部已防双重循环，仅在未运行时启动
      delegate.resume();
      resizeNativeLive2D();
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

/**
 * 注册 DPR（设备像素比）变化监听器
 * 窗口跨显示器拖动、浏览器缩放导致 DPR 变化时重新计算 canvas 尺寸。
 */
function setupDPRListener(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  currentGen: number,
  genRef: React.MutableRefObject<number>,
  timerIdsRef?: React.MutableRefObject<Set<number>>,
): () => void {
  let currentDPR = window.devicePixelRatio || 1;

  const checkDPR = () => {
    if (genRef.current !== currentGen) return;
    const newDPR = window.devicePixelRatio || 1;
    if (newDPR !== currentDPR) {
      currentDPR = newDPR;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw > 0 && ch > 0) {
        canvas.width = Math.round(cw * newDPR);
        canvas.height = Math.round(ch * newDPR);
        resizeNativeLive2D();
      }
    }
  };

  const mq = window.matchMedia(`(resolution: ${currentDPR}dppx)`);
  const onDPRChange = () => checkDPR();
  mq.addEventListener("change", onDPRChange);

  // 定时轮询兜底（部分浏览器 matchMedia 不可靠），纳入统一 timer 管理
  const intervalId = window.setInterval(checkDPR, 2000);
  if (timerIdsRef) {
    timerIdsRef.current.add(intervalId);
  }

  return () => {
    mq.removeEventListener("change", onDPRChange);
    clearInterval(intervalId);
    if (timerIdsRef) {
      timerIdsRef.current.delete(intervalId);
    }
  };
}

/**
 * 设置 canvas 鼠标 + 触摸交互
 *
 * 支持（参考 Open-LLM-VTuber）：
 * - 鼠标移动 → 视线追踪（focus）
 * - 点击（移动距离 < 阈值）→ hit test + 命中检测（tap）
 * - 拖拽（移动距离 ≥ 阈值）→ 视线拖拽
 * - 左键长按模型（≥ LONG_PRESS_MS）→ 拖动模型位置（开关：modelDragEnabled）
 * - 触摸 → 移动端交互（长按同样支持拖动模型）
 * - 使用 _deviceToScreen 进行准确的坐标转换
 * - 鼠标/触摸结束 → 复位拖拽偏移
 */
function setupCanvasInteraction(
  canvas: HTMLCanvasElement,
  ctrl: NativeLive2DController,
): () => void {
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let lastX = 0;
  let lastY = 0;
  let hasMoved = false;
  /** 是否处于"拖动模型"模式（长按触发） */
  let isModelDragMode = false;
  /** 长按判定定时器 */
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  const clearLongPressTimer = () => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const exitModelDragMode = () => {
    if (isModelDragMode) {
      isModelDragMode = false;
      canvas.style.cursor = "";
    }
  };

  const screenToModel = (clientX: number, clientY: number) =>
    screenToModelCoords(canvas, clientX, clientY);

  const hitTest = (clientX: number, clientY: number): string | null =>
    hitTestModel(canvas, clientX, clientY);

  /**
   * 将 DOM 坐标归一化到 Cubism 坐标系（-1 ~ 1）
   * DOM 原点左上角 Y↓，Cubism 原点中心 Y↑ → Y 轴取反
   * 用于 focus 视线追踪等不需要精确坐标的场景
   */
  const normalizeCoords = (
    clientX: number,
    clientY: number,
  ): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return { x: x * 2 - 1, y: -(y * 2 - 1) };
  };

  const getDragDelta = (
    clientX: number,
    clientY: number,
  ): { dx: number; dy: number } => {
    const dx = (clientX - lastX) / canvas.clientWidth;
    const dy = -(clientY - lastY) / canvas.clientHeight;
    return { dx, dy };
  };

  const handleMove = (clientX: number, clientY: number) => {
    // ── 拖动模型模式：按增量平移模型矩阵，不做视线追踪 ──
    if (isModelDragMode) {
      const prev = screenToModel(lastX, lastY);
      const curr = screenToModel(clientX, clientY);
      lastX = clientX;
      lastY = clientY;
      if (prev && curr) {
        translateModelBy(curr.x - prev.x, curr.y - prev.y);
      }
      return;
    }

    const { x, y } = normalizeCoords(clientX, clientY);
    ctrl.focus(x, y);

    if (isDragging) {
      const deltaX = clientX - dragStartX;
      const deltaY = clientY - dragStartY;
      if (!hasMoved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX) {
        hasMoved = true;
        // 移动超过阈值 → 判定为普通拖拽，取消长按拖动模型
        clearLongPressTimer();
      }
      if (hasMoved) {
        const { dx, dy } = getDragDelta(clientX, clientY);
        lastX = clientX;
        lastY = clientY;
        const manager = LAppLive2DManager.getInstance();
        if (manager) {
          // 传入拖拽增量（相对位移），SDK 内部累加到模型朝向偏移上
          // 注：若 SDK onDrag 接口为绝对坐标语义（-1~1），需改为传入归一化触点坐标
          manager.onDrag(dx * DRAG_SENSITIVITY, dy * DRAG_SENSITIVITY);
        }
      }
    }
  };

  const handleDown = (clientX: number, clientY: number) => {
    isDragging = true;
    hasMoved = false;
    dragStartX = clientX;
    dragStartY = clientY;
    lastX = clientX;
    lastY = clientY;

    // ── 长按判定：按住不动超过 LONG_PRESS_MS 且命中模型 → 进入拖动模型模式 ──
    clearLongPressTimer();
    if (
      useLive2DStore.getState().modelDragEnabled &&
      hitTest(clientX, clientY) !== null
    ) {
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        // 已移动（普通拖拽）或已松开时不进入
        if (!isDragging || hasMoved) return;
        isModelDragMode = true;
        canvas.style.cursor = "grabbing";
        // 复位视线偏移，避免拖动模型时视线残留
        const manager = LAppLive2DManager.getInstance();
        if (manager) manager.onDrag(0, 0);
      }, LONG_PRESS_MS);
    }
  };

  const handleUp = (clientX: number, clientY: number) => {
    clearLongPressTimer();
    if (isModelDragMode) {
      exitModelDragMode();
      isDragging = false;
      hasMoved = false;
      return;
    }
    if (!isDragging) return;
    if (!hasMoved) {
      // 点击前先做 hit test（参考 Open-LLM-VTuber），仅命中模型时触发 tap
      const hit = hitTest(clientX, clientY);
      if (hit !== null) {
        const manager = LAppLive2DManager.getInstance();
        if (manager) {
          // 使用 _deviceToScreen 坐标进行 tap
          const modelCoords = screenToModel(clientX, clientY);
          if (modelCoords) {
            manager.onTap(modelCoords.x, modelCoords.y);
          } else {
            // 兜底：使用归一化坐标
            const { x, y } = normalizeCoords(clientX, clientY);
            manager.onTap(x, y);
          }
        }
      }
    }
    isDragging = false;
    hasMoved = false;
  };

  // ── 鼠标事件 ──

  const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
  const onMouseDown = (e: MouseEvent) => {
    // 仅左键触发拖拽/长按逻辑
    if (e.button !== 0) return;
    handleDown(e.clientX, e.clientY);
  };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button !== 0) return;
    handleUp(e.clientX, e.clientY);
  };
  const onMouseLeave = () => {
    clearLongPressTimer();
    exitModelDragMode();
    isDragging = false;
    hasMoved = false;
    const manager = LAppLive2DManager.getInstance();
    if (manager) manager.onDrag(0, 0);
  };

  // ── 触摸事件 ──

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 0) return;
    const t = e.touches[0];
    handleMove(t.clientX, t.clientY);
    // 拖动模型模式或拖拽判定生效后阻止默认行为，避免阻断页面滚动
    if (isModelDragMode || (isDragging && hasMoved)) {
      e.preventDefault();
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 0) return;
    const t = e.touches[0];
    handleDown(t.clientX, t.clientY);
    // touchstart 不阻止默认行为，保留浏览器滚动能力
    // 若后续判定为拖拽，在 touchmove 中再阻止
  };

  const onTouchEnd = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    if (t) handleUp(t.clientX, t.clientY);
    else {
      clearLongPressTimer();
      exitModelDragMode();
    }
    const manager = LAppLive2DManager.getInstance();
    if (manager) manager.onDrag(0, 0);
  };

  const onTouchCancel = () => {
    clearLongPressTimer();
    exitModelDragMode();
    isDragging = false;
    hasMoved = false;
    const manager = LAppLive2DManager.getInstance();
    if (manager) manager.onDrag(0, 0);
  };

  // ── 绑定 ──

  canvas.addEventListener("mousemove", onMouseMove, { passive: true });
  canvas.addEventListener("mousedown", onMouseDown, { passive: true });
  canvas.addEventListener("mouseup", onMouseUp, { passive: true });
  canvas.addEventListener("mouseleave", onMouseLeave, { passive: true });

  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: true });
  canvas.addEventListener("touchcancel", onTouchCancel, { passive: true });

  return () => {
    clearLongPressTimer();
    exitModelDragMode();
    try {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchCancel);
    } catch (_) {
      // canvas 可能已脱离 DOM
    }
  };
}

/**
 * 应用模型缩放（参考 Open-LLM-VTuber 的 applyScale 实现）。
 * 通过直接操作模型的变换矩阵实现缩放，不经过 View 矩阵。
 *
 * ⚠️ CubismModelMatrix.scale() 是"设置绝对值"语义，会覆盖模型加载时
 *    setupFromLayout/setHeight 计算的初始缩放。因此首次调用时记录该模型的
 *    基准缩放，之后按 baseScale * scale 设置，scale=1.0 即恢复原始大小。
 *    scale() 不修改平移分量，模型会围绕自身原点原地缩放（拖动后位置不漂移）。
 */
const modelBaseScaleMap = new WeakMap<object, number>();

function applyModelScale(scale: number): void {
  try {
    const manager = LAppLive2DManager.getInstance();
    if (!manager) return;
    const model = manager.getModel(0);
    if (!model) return;
    // @ts-ignore - _modelMatrix 是 SDK 内部属性
    const matrix = (model as any)._modelMatrix;
    if (!matrix) return;

    let baseScale = modelBaseScaleMap.get(model as object);
    if (baseScale === undefined) {
      baseScale = matrix.getScaleX() || 1.0;
      modelBaseScaleMap.set(model as object, baseScale as number);
    }

    const newScale = (baseScale as number) * scale;
    matrix.scale(newScale, newScale);
  } catch {
    // 模型尚未就绪时静默忽略
  }
}

/**
 * 将原始错误信息转换为用户友好的中文提示（含排查建议）
 */
function getFriendlyErrorMessage(message: string, modelUrl: string): string {
  if (message === "CANCELLED_BY_GENERATION") return "";

  if (message.includes("Live2D Cubism Core")) return message;

  if (
    message.includes("超时") ||
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    return `模型加载超时: ${modelUrl}\n排查建议：① 检查网络连接 ② 确认文件路径正确 ③ 查看浏览器控制台是否有 404 错误`;
  }
  if (
    message.includes("404") ||
    message.includes("Not Found") ||
    message.includes("Failed to load")
  ) {
    return `模型文件不存在 (404): ${modelUrl}\n排查建议：① 检查 public 目录下模型文件夹是否存在 ② 检查 model3.json 文件名是否正确`;
  }
  if (message.includes("NetworkError") || message.includes("Failed to fetch")) {
    return "网络请求失败\n排查建议：① 确认开发服务器已启动 ② 检查防火墙/代理设置 ③ 查看控制台网络面板";
  }
  if (message.includes("跨域") || message.includes("CORS")) {
    return `跨域请求被拦截: ${modelUrl}\n排查建议：① 模型文件应放在 public 目录下 ② 如需外部加载，配置服务器 CORS 头`;
  }
  if (message.includes("WebGL") || message.includes("webgl")) {
    return "WebGL 初始化失败\n排查建议：① 确认浏览器支持 WebGL（chrome://gpu）② 启用硬件加速 ③ 关闭过多 WebGL 页面释放上下文";
  }
  return `模型加载失败: ${message}\n排查建议：查看浏览器控制台完整错误信息`;
}
