// live2d展示 宿主槽位状态
// 页面通过 Live2DShowcase（占位槽）注册目标容器，常驻宿主 Live2DHost 将
// 真实渲染内容（背景 + Live2D + 拉绳）浮动对位到该容器上 —— 跨界面切换时
// 模型不卸载不重载，仅由宿主按 positionMode 调整模型位置。

import { create } from "zustand";

/** 模型位置模式：persist = 位置持久化（首页）；reset = 每次进入重置（父界面1及派生界面） */
export type Live2DPositionMode = "persist" | "reset";

export interface Live2DSlotInfo {
  /** 占位容器元素（宿主对位目标） */
  element: HTMLElement;
  /** 模型位置模式 */
  positionMode: Live2DPositionMode;
  /** 拉绳宽度（px） */
  cordWidth?: number;
  /** 拉绳特定条件：为 true 时第二状态显示 pullRope-3 */
  cordAltActive?: boolean;
  /** 拉绳单击回调 — 默认状态（pullRope-1） */
  onCordClickPrimary?: () => void;
  /** 拉绳单击回调 — 第二状态（pullRope-2/3） */
  onCordClickSecondary?: () => void;
}

interface Live2DHostState {
  /** 当前注册的占位槽（同一时刻最多一个） */
  slot: Live2DSlotInfo | null;
  registerSlot: (slot: Live2DSlotInfo) => void;
  unregisterSlot: (element: HTMLElement) => void;
}

export const useLive2DHostStore = create<Live2DHostState>((set, get) => ({
  slot: null,
  registerSlot: (slot: Live2DSlotInfo) => set({ slot }),
  unregisterSlot: (element: HTMLElement) => {
    // 仅当仍是当前槽位时清空，避免误清后注册的新槽位
    if (get().slot?.element === element) set({ slot: null });
  },
}));
