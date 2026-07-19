// live2d展示 常驻宿主 — 挂载在 App 根部，跨界面切换不卸载
// 真实渲染内容（背景 + Live2D 画布/模型 + 拉绳）只在此处渲染一次，
// 通过 fixed 定位对齐当前注册的占位槽（Live2DShowcase）：
//   - 界面切换（首页 ⇄ 父界面1及派生界面）时模型不重新加载
//   - positionMode = "reset"：进入时将模型重置回初始位置（父界面1系）
//   - positionMode = "persist"：进入时恢复上次保存的位置，离开/关闭时保存（首页）

import React, { useEffect, useRef, useState } from "react";
import BackgroundPanel from "./BackgroundPanel";
import PullCord, { PULL_CORD_ASPECT_RATIO } from "../Common/PullCord";
import {
  useLive2DHostStore,
  type Live2DPositionMode,
} from "../../store/live2dHostStore";
import {
  getModelTransform,
  setModelTransform,
  saveHomeTransform,
  loadHomeTransform,
  type ModelTransform,
} from "./live2dModelTransform";

/** 模型就绪轮询间隔（ms） */
const MODEL_READY_POLL_MS = 200;
/** 拉绳默认宽度（px） */
const DEFAULT_PULL_CORD_WIDTH = 64;

interface SlotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const Live2DHost: React.FC = () => {
  const slot = useLive2DHostStore((s) => s.slot);
  /** 占位槽屏幕矩形（宿主对位目标） */
  const [rect, setRect] = useState<SlotRect | null>(null);
  /** 是否已有过占位槽 — 首个槽注册后才初始化渲染内容，之后保持挂载不再卸载 */
  const [activated, setActivated] = useState(false);
  /** 模型初始变换（加载完成后首次捕获，reset 模式的还原目标） */
  const initialTransformRef = useRef<ModelTransform | null>(null);
  /** 上一次的位置模式（null = 无槽位） */
  const prevModeRef = useRef<Live2DPositionMode | null>(null);
  /** 模式应用轮询令牌（新一轮应用/卸载时失效旧轮询） */
  const applyTokenRef = useRef(0);

  const mode: Live2DPositionMode | null = slot?.positionMode ?? null;

  // ── 首个槽位注册后激活渲染内容 ──
  useEffect(() => {
    if (slot && !activated) setActivated(true);
  }, [slot, activated]);

  // ── 占位槽矩形追踪：ResizeObserver + 窗口 resize/scroll ──
  useEffect(() => {
    const el = slot?.element;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [slot?.element]);

  // ── 位置模式切换：保存首页位置 / 重置或恢复模型位置 ──
  useEffect(() => {
    const prev = prevModeRef.current;

    // 离开首页（persist → 其他）：保存当前模型位置
    if (prev === "persist" && mode !== "persist") {
      const t = getModelTransform();
      if (t) saveHomeTransform(t);
    }

    // 进入新模式：等待模型就绪后应用（仅调整位置，不重新加载）
    if (mode !== null && mode !== prev) {
      const token = ++applyTokenRef.current;
      const tryApply = () => {
        if (token !== applyTokenRef.current) return;
        const current = getModelTransform();
        if (!current) {
          // 模型尚未加载完成，稍后重试
          window.setTimeout(tryApply, MODEL_READY_POLL_MS);
          return;
        }
        // 首次就绪时捕获初始变换（reset 的还原目标），须在任何恢复操作之前
        if (!initialTransformRef.current) {
          initialTransformRef.current = current;
        }
        if (mode === "reset") {
          // 父界面1及派生界面：重置回初始位置
          setModelTransform(initialTransformRef.current);
        } else {
          // 首页：恢复上次保存的位置（无记录则保持现状）
          const saved = loadHomeTransform();
          if (saved) setModelTransform(saved);
        }
      };
      tryApply();
    }

    prevModeRef.current = mode;
  }, [mode]);

  // ── 页面关闭/刷新时：若正处于首页，保存模型位置（跨会话持久化） ──
  useEffect(() => {
    const onBeforeUnload = () => {
      if (useLive2DHostStore.getState().slot?.positionMode === "persist") {
        const t = getModelTransform();
        if (t) saveHomeTransform(t);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      // 卸载时失效挂起的模式应用轮询
      applyTokenRef.current++;
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  // 从未注册过槽位（如 Group B 手机界面）→ 不初始化渲染内容
  if (!activated || !rect) return null;

  const cordWidth = slot?.cordWidth ?? DEFAULT_PULL_CORD_WIDTH;

  // 宿主容器 — fixed 对齐占位槽；无槽位时隐藏但保持挂载（模型不卸载）
  const hostStyle: React.CSSProperties = {
    position: "fixed",
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    visibility: slot ? "visible" : "hidden",
    pointerEvents: slot ? "auto" : "none",
    zIndex: 1,
  };

  // 拉绳 — 悬挂在容器右侧：中心距右边 1/10 容器宽，从上往下 1/3 处对齐容器顶端
  const pullCordStyle: React.CSSProperties = {
    position: "absolute",
    top: -(cordWidth * PULL_CORD_ASPECT_RATIO) / 3,
    right: `calc(10% - ${cordWidth / 2}px)`,
    zIndex: 10,
  };

  return (
    <div style={hostStyle}>
      {/* 背景 + Live2D 画布/模型（含气泡叠加层）— 常驻，跨界面不重新加载 */}
      <BackgroundPanel />
      {/* 拉绳（回调来自当前占位槽） */}
      <PullCord
        width={cordWidth}
        altActive={slot?.cordAltActive}
        onClickPrimary={slot?.onCordClickPrimary}
        onClickSecondary={slot?.onCordClickSecondary}
        style={pullCordStyle}
      />
    </div>
  );
};

export default Live2DHost;
