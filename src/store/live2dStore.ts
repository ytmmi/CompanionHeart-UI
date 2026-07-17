import { create } from "zustand";

// ─── 交互开关持久化 ──────────────────────────────────

const LS_DRAG_KEY = "__L2D_DRAG_ENABLED__";
const LS_ZOOM_KEY = "__L2D_ZOOM_ENABLED__";
const LS_ZOOM_STEP_KEY = "__L2D_ZOOM_STEP__";

/** 滚轮缩放步长默认值（每滚一格缩放增量） */
export const DEFAULT_WHEEL_ZOOM_STEP = 0.03;

/** 从 localStorage 读取开关初始值（默认开启） */
function readBoolFromLS(key: string, defaultValue: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return raw === "true";
  } catch {
    return defaultValue;
  }
}

function writeBoolToLS(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* 写入失败不影响功能 */
  }
}

/** 从 localStorage 读取数字初始值（无效时返回默认值） */
function readNumberFromLS(key: string, defaultValue: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    const num = parseFloat(raw);
    return Number.isFinite(num) ? num : defaultValue;
  } catch {
    return defaultValue;
  }
}

function writeNumberToLS(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* 写入失败不影响功能 */
  }
}

export interface Live2DState {
  /** 当前表情名称 */
  expression: string;
  /** 当前动作名称 */
  motion: string;
  /** 是否正在播放动作 */
  isMotionPlaying: boolean;
  /** 口型张开度（0~1，TTS 同步用） */
  mouthOpen: number;
  /** 是否启用鼠标左键长按拖动模型 */
  modelDragEnabled: boolean;
  /** 是否启用指针悬停模型时滚轮缩放 */
  wheelZoomEnabled: boolean;
  /** 滚轮缩放步长（每滚一格的缩放增量） */
  wheelZoomStep: number;

  setExpression: (expr: string) => void;
  setMotion: (motion: string) => void;
  setIsMotionPlaying: (playing: boolean) => void;
  setMouthOpen: (value: number) => void;
  setModelDragEnabled: (enabled: boolean) => void;
  setWheelZoomEnabled: (enabled: boolean) => void;
  setWheelZoomStep: (step: number) => void;
}

export const useLive2DStore = create<Live2DState>((set: any) => ({
  expression: "",
  motion: "",
  isMotionPlaying: false,
  mouthOpen: 0,
  modelDragEnabled: readBoolFromLS(LS_DRAG_KEY, true),
  wheelZoomEnabled: readBoolFromLS(LS_ZOOM_KEY, true),
  wheelZoomStep: readNumberFromLS(LS_ZOOM_STEP_KEY, DEFAULT_WHEEL_ZOOM_STEP),

  setExpression: (expression: string) => set({ expression }),
  setMotion: (motion: string) => set({ motion }),
  setIsMotionPlaying: (isMotionPlaying: boolean) => set({ isMotionPlaying }),
  setMouthOpen: (mouthOpen: number) => set({ mouthOpen }),
  setModelDragEnabled: (modelDragEnabled: boolean) => {
    writeBoolToLS(LS_DRAG_KEY, modelDragEnabled);
    set({ modelDragEnabled });
  },
  setWheelZoomEnabled: (wheelZoomEnabled: boolean) => {
    writeBoolToLS(LS_ZOOM_KEY, wheelZoomEnabled);
    set({ wheelZoomEnabled });
  },
  setWheelZoomStep: (wheelZoomStep: number) => {
    writeNumberToLS(LS_ZOOM_STEP_KEY, wheelZoomStep);
    set({ wheelZoomStep });
  },
}));
