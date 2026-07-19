// PLATFORM: Group A — Win / Web / Android 平板 共用控件
// live2d展示：背景 + Live2D 画布/模型 + 拉绳控件 组合的独立可复用控件
//
// 实现方式为「占位槽」：本组件只渲染一个空容器并注册到 live2dHostStore，
// 真实渲染内容由挂载在 App 根部的常驻宿主 Live2DHost 浮动对位到此容器上。
// 因此界面切换（首页 ⇄ 父界面1及派生界面）时模型不卸载、不重新加载：
//   - positionMode = "persist"（首页）：模型位置持久化，回到首页时恢复上次位置
//   - positionMode = "reset"（父界面1及派生界面）：进入时仅重置模型位置

import React, { useEffect, useRef } from "react";
import {
  useLive2DHostStore,
  type Live2DPositionMode,
} from "../../store/live2dHostStore";

/** 拉绳控件默认宽度（px） */
const DEFAULT_PULL_CORD_WIDTH = 64;

interface Live2DShowcaseProps {
  /** 模型位置模式：persist = 持久化（首页，默认）；reset = 每次进入重置 */
  positionMode?: Live2DPositionMode;
  /** 拉绳宽度（px），默认 64 */
  cordWidth?: number;
  /** 拉绳特定条件：为 true 时第二状态显示 pullRope-3 */
  cordAltActive?: boolean;
  /** 拉绳单击回调 — 默认状态（pullRope-1）时触发 */
  onCordClickPrimary?: () => void;
  /** 拉绳单击回调 — 第二状态（pullRope-2/3）时触发 */
  onCordClickSecondary?: () => void;
  /** 附加样式（作用于占位容器） */
  style?: React.CSSProperties;
}

// 占位容器 — 填满外层分配的空间，宿主按此矩形对位
const slotStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  minWidth: 0,
  overflow: "hidden",
};

const Live2DShowcase: React.FC<Live2DShowcaseProps> = ({
  positionMode = "persist",
  cordWidth = DEFAULT_PULL_CORD_WIDTH,
  cordAltActive = false,
  onCordClickPrimary,
  onCordClickSecondary,
  style,
}) => {
  const slotRef = useRef<HTMLDivElement>(null);
  /** 用 ref 承载最新回调，注册 effect 无需依赖回调引用（避免反复注册） */
  const primaryRef = useRef(onCordClickPrimary);
  const secondaryRef = useRef(onCordClickSecondary);
  primaryRef.current = onCordClickPrimary;
  secondaryRef.current = onCordClickSecondary;

  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const { registerSlot, unregisterSlot } = useLive2DHostStore.getState();
    registerSlot({
      element: el,
      positionMode,
      cordWidth,
      cordAltActive,
      onCordClickPrimary: () => primaryRef.current?.(),
      onCordClickSecondary: () => secondaryRef.current?.(),
    });
    return () => unregisterSlot(el);
  }, [positionMode, cordWidth, cordAltActive]);

  return (
    <div
      ref={slotRef}
      style={{ ...slotStyle, ...style }}
    />
  );
};

export default Live2DShowcase;
