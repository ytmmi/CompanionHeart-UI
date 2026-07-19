// PLATFORM: Group A — Win / Web / Android 平板 共用控件
// 拉绳控件：悬挂式拉绳，循环摇摆动画（原点为从上往下 1/3 处，±3°）
//   - 默认显示 pullRope-1，双击切换为 pullRope-2（再双击切回）
//   - 单击：pullRope-1 与 pullRope-2/3 功能不同（由使用方传入回调）
//     单击时播放拉动动画：拉绳下降 1/3 → 上升 1/3 回原位
//   - pullRope-3 与 pullRope-2 单击功能相同，仅在特定条件（altActive）下代替 2 显示
//   - 双击切换动画：当前图片宽收缩为 0 → 换图 → 宽拉伸恢复，摇摆跟随默认（±3°）

import React, { useEffect, useRef, useState } from "react";
import rope1Url from "../../assets/img/PullCord/pullRope-1.png";
import rope2Url from "../../assets/img/PullCord/pullRope-2.png";
import rope3Url from "../../assets/img/PullCord/pullRope-3.png";

/** 素材原始宽高比（2048 × 5538，三张一致） */
export const PULL_CORD_ASPECT_RATIO = 5538 / 2048;

/** 单击/双击判定间隔（ms） */
const CLICK_DELAY_MS = 250;
/** 切换动画单阶段时长（ms）：收缩 / 拉伸各一段，共 1s */
const SWITCH_PHASE_MS = 500;
/** 单击拉动动画时长（ms）：下降 + 上升 */
const PULL_ANIM_MS = 400;

interface PullCordProps {
  /** 控件宽度（px），高度按素材比例自适应，默认 64 */
  width?: number;
  /** 特定条件：为 true 时第二状态显示 pullRope-3（代替 pullRope-2） */
  altActive?: boolean;
  /** 单击回调 — 当前显示 pullRope-1 时触发 */
  onClickPrimary?: () => void;
  /** 单击回调 — 当前显示 pullRope-2 / pullRope-3 时触发 */
  onClickSecondary?: () => void;
  /** 附加样式（作用于摇摆根元素） */
  style?: React.CSSProperties;
}

/** 注入摇摆/拉动 keyframes（全局一次） */
const SWING_KEYFRAMES_ID = "__pullcord_swing_keyframes__";
function ensureSwingKeyframes(): void {
  if (document.getElementById(SWING_KEYFRAMES_ID)) return;
  const el = document.createElement("style");
  el.id = SWING_KEYFRAMES_ID;
  el.textContent = `@keyframes pullcord-swing {
  0% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
  100% { transform: rotate(-3deg); }
}
@keyframes pullcord-pull {
  0% { transform: translateY(0); }
  50% { transform: translateY(33.333%); }
  100% { transform: translateY(0); }
}`;
  document.head.appendChild(el);
}

const PullCord: React.FC<PullCordProps> = ({
  width = 64,
  altActive = false,
  onClickPrimary,
  onClickSecondary,
  style,
}) => {
  /** 当前状态：primary = pullRope-1，secondary = pullRope-2/3 */
  const [isSecondary, setIsSecondary] = useState(false);
  /** 切换动画阶段：idle | collapse（收缩） | expand（拉伸） */
  const [phase, setPhase] = useState<"idle" | "collapse" | "expand">("idle");
  /** 是否正在播放单击拉动动画（下降 1/3 → 上升 1/3） */
  const [pulling, setPulling] = useState(false);
  /** 单击延迟定时器（用于区分单击/双击） */
  const clickTimerRef = useRef<number | null>(null);
  /** 切换动画定时器 */
  const switchTimersRef = useRef<number[]>([]);
  /** 拉动动画定时器 */
  const pullTimerRef = useRef<number | null>(null);

  useEffect(() => {
    ensureSwingKeyframes();
    return () => {
      // 卸载时清理所有定时器
      if (clickTimerRef.current !== null) clearTimeout(clickTimerRef.current);
      if (pullTimerRef.current !== null) clearTimeout(pullTimerRef.current);
      switchTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  /** 单击：延迟判定，若在间隔内发生双击则取消；触发时播放拉动动画 */
  const handleClick = () => {
    if (clickTimerRef.current !== null) return;
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      // 拉动动画：下降 1/3 → 上升 1/3 回原位
      setPulling(true);
      if (pullTimerRef.current !== null) clearTimeout(pullTimerRef.current);
      pullTimerRef.current = window.setTimeout(() => {
        pullTimerRef.current = null;
        setPulling(false);
      }, PULL_ANIM_MS);
      if (isSecondary) {
        onClickSecondary?.();
      } else {
        onClickPrimary?.();
      }
    }, CLICK_DELAY_MS);
  };

  /** 双击：取消单击判定，播放收缩→换图→拉伸动画（期间摇摆幅度增大） */
  const handleDoubleClick = () => {
    if (clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    if (phase !== "idle") return; // 动画进行中忽略
    // 阶段 1：宽收缩为 0
    setPhase("collapse");
    switchTimersRef.current.push(
      window.setTimeout(() => {
        // 阶段 2：换图，从宽 0 拉伸恢复
        setIsSecondary((prev) => !prev);
        setPhase("expand");
        switchTimersRef.current.push(
          window.setTimeout(() => {
            setPhase("idle");
            switchTimersRef.current = [];
          }, SWITCH_PHASE_MS),
        );
      }, SWITCH_PHASE_MS),
    );
  };

  const height = width * PULL_CORD_ASPECT_RATIO;
  const src = isSecondary ? (altActive ? rope3Url : rope2Url) : rope1Url;

  return (
    // 摇摆层 — 原点为从上往下 1/3 处，±3° 循环摇摆
    <div
      style={{
        width,
        height,
        transformOrigin: "50% 33.333%",
        animation: "pullcord-swing 3s ease-in-out infinite",
        cursor: "pointer",
        userSelect: "none",
        ...style,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* 拉动层 — 单击时下降 1/3 → 上升 1/3（keyframes 驱动，结束自动回原位） */}
      <div
        style={{
          width: "100%",
          height: "100%",
          animation: pulling
            ? `pullcord-pull ${PULL_ANIM_MS}ms ease-in-out`
            : "none",
        }}
      >
        {/* 图片层 — 双击切换动画：collapse 时仅宽收缩为 0（无上下位移） */}
        <img
          src={src}
          alt="拉绳"
          draggable={false}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            transformOrigin: "50% 50%",
            transform: phase === "collapse" ? "scaleX(0)" : "scaleX(1)",
            // 非线性缓动：收缩段先慢后快（ease-in），拉伸段先快后慢（ease-out）
            transition: `transform ${SWITCH_PHASE_MS}ms ${
              phase === "collapse"
                ? "cubic-bezier(0.55, 0, 0.85, 0.36)"
                : "cubic-bezier(0.15, 0.64, 0.45, 1)"
            }`,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
};

export default PullCord;
