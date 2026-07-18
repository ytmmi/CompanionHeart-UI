// PLATFORM: 全平台 — Live2D 通用控件
// 模型气泡定位层：将 SpeechBubble 悬浮在 Live2D 画布上，跟随模型定位
//   - 水平：与模型可视矩形中心对齐
//   - 垂直：气泡中心位于模型中间偏下（模型高度 BUBBLE_ANCHOR_RATIO 处）
//   - 钳制：气泡完整保持在画布内——模型部分超出画布边缘时气泡贴边不越界
//   - 销毁：closing=true 时透明度 100→0 淡出（时长 BUBBLE_FADE_MS，由 chatStore 驱动）
// 定位通过 rAF 轮询模型矩形实现，模型拖动/缩放/窗口变化时气泡实时跟随

import React, { useEffect, useRef, useState } from "react";
import SpeechBubble from "./SpeechBubble";
import { getModelScreenRect } from "./live2dModelRect";
import { BUBBLE_FADE_MS } from "../../store/chatStore";

interface ModelBubbleOverlayProps {
  /** 气泡文字（为空时不渲染） */
  text: string;
  /** 是否处于淡出销毁动画中（透明度 100→0） */
  closing?: boolean;
  /** 气泡最大宽度（px），默认 320；实际还会被画布宽度收窄 */
  maxWidth?: number;
}

/** 气泡中心的垂直锚点：模型可视矩形高度的比例（0=顶部，1=底部），0.6 即中间偏下 */
const BUBBLE_ANCHOR_RATIO = 0.6;
/** 气泡与画布边缘的最小间距（px） */
const EDGE_PADDING = 8;

const overlayStyle: React.CSSProperties = {
  // 覆盖整个 Live2D 画布区域（由父级提供 position 上下文），不拦截鼠标
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  zIndex: 2,
};

const ModelBubbleOverlay: React.FC<ModelBubbleOverlayProps> = ({
  text,
  closing = false,
  maxWidth = 320,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const bubbleWrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  /** 模型矩形不可用时气泡是否可见（居中兜底显示） */
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!text) {
      setVisible(false);
      return;
    }
    setVisible(true);

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);

      const overlay = overlayRef.current;
      const wrap = bubbleWrapRef.current;
      if (!overlay || !wrap) return;

      const areaW = overlay.clientWidth;
      const areaH = overlay.clientHeight;
      if (areaW <= 0 || areaH <= 0) return;

      // 画布很窄时收窄气泡，保证气泡宽度永远不超过画布
      wrap.style.maxWidth = `${Math.max(40, areaW - EDGE_PADDING * 2)}px`;

      const bubbleW = wrap.offsetWidth;
      const bubbleH = wrap.offsetHeight;
      if (bubbleW <= 0 || bubbleH <= 0) return;

      const rect = getModelScreenRect();

      // 期望位置：水平与模型中心对齐、垂直气泡中心在模型中间偏下；
      // 模型矩形不可用时兜底显示在画布中央
      let desiredLeft: number;
      let desiredTop: number;
      if (rect) {
        desiredLeft = rect.left + rect.width / 2 - bubbleW / 2;
        desiredTop =
          rect.top + rect.height * BUBBLE_ANCHOR_RATIO - bubbleH / 2;
      } else {
        desiredLeft = areaW / 2 - bubbleW / 2;
        desiredTop = areaH / 2 - bubbleH / 2;
      }

      // 钳制：气泡完整保持在画布内（模型贴边/越界时气泡贴边显示）
      const maxLeft = Math.max(EDGE_PADDING, areaW - bubbleW - EDGE_PADDING);
      const maxTop = Math.max(EDGE_PADDING, areaH - bubbleH - EDGE_PADDING);
      const left = Math.min(Math.max(desiredLeft, EDGE_PADDING), maxLeft);
      const top = Math.min(Math.max(desiredTop, EDGE_PADDING), maxTop);

      // 直接写 style，避开 React 渲染循环（每帧更新）
      wrap.style.transform = `translate(${left}px, ${top}px)`;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [text]);

  if (!text || !visible) return null;

  return (
    <div
      ref={overlayRef}
      style={overlayStyle}
    >
      <div
        ref={bubbleWrapRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          // 初始帧渲染在画布外，待首次 tick 定位后可见
          transform: "translate(-9999px, -9999px)",
          willChange: "transform",
          // 销毁动画：透明度 100→0（closing 由 chatStore 在停留 3s 后置位）
          opacity: closing ? 0 : 1,
          transition: `opacity ${BUBBLE_FADE_MS}ms ease`,
        }}
      >
        <SpeechBubble
          text={text}
          maxWidth={maxWidth}
        />
      </div>
    </div>
  );
};

export default ModelBubbleOverlay;
