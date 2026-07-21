// PLATFORM: 全平台通用
// 独立界面切换动画组件：窗帘过渡（curtain transition）
//   总时长 1s = 前半（盖住）0.5s + 后半（展示）0.5s，前后两部分为独立动画，分别引用
//   前半 盖住（四片同时进行）：
//     - curtain_top 从界面外上方进入，从上往下贴顶
//     - curtain_bottom 从界面外下方进入，从下往上贴底
//     - curtain_left / curtain_right 从界面外左右进入，到中间刚好贴住
//     - top/bottom 层级在 left/right 之上（curtain 在最顶层）
//   后半 展示：全部反向退出，露出下一个界面
//
// 前后两部分使用独立 keyframes（curtain-in-* / curtain-out-*），阶段切换时仅改变
// animation 名称即可重新触发动画（名称不同必然重启），不重建 DOM。
// 覆盖层始终挂载（idle 时 visibility:hidden），保证四张大图在 WebView 中保持
// 已解码状态 — 阶段切换若重建 <img>，Android WebView 需重新解码大图导致闪烁。
//
// 用法：
//   - 组合调用：playCurtainTransition(() => { window.location.hash = "..." }, ready?)
//     前半盖住 → 完全盖住时执行回调（此时切换界面用户不可见）
//     → 等新界面资源就绪（默认：两帧 rAF + 所有 <img> 加载完成，5s 兜底；
//        可传 ready 覆盖判定）→ 播放后半展示
//   - 分段调用：playCurtainCover(onCovered?) 播放前半并保持盖住状态；
//     playCurtainReveal() 从盖住状态播放后半展示（需较长准备的界面自行控制时机）
//   - 组件 <CurtainTransition /> 挂载在 App 根部
//   - useCurtainTransitionStore((s) => s.phase) 可查询当前阶段

import React, { useEffect } from "react";
import { create } from "zustand";
import curtainTopUrl from "../../assets/img/transition/curtain_top.png";
import curtainBottomUrl from "../../assets/img/transition/curtain_bottom.png";
import curtainLeftUrl from "../../assets/img/transition/curtain_left.png";
import curtainRightUrl from "../../assets/img/transition/curtain_right.png";

/** 前半（盖住）时长（ms） */
const COVER_MS = 500;
/** 后半（展示）时长（ms） */
const REVEAL_MS = 500;

/** idle 无动画 | cover 前半进行中 | covered 已完全盖住（保持） | reveal 后半进行中 */
type Phase = "idle" | "cover" | "covered" | "reveal";

interface CurtainTransitionState {
  phase: Phase;
  /** 前半：盖住界面；onCovered 在完全盖住时执行，之后保持 covered 状态 */
  cover: (onCovered?: () => void) => void;
  /** 后半：从盖住状态展示下一个界面 */
  reveal: () => void;
}

export const useCurtainTransitionStore = create<CurtainTransitionState>(
  (set, get) => ({
    phase: "idle",
    cover: (onCovered?: () => void) => {
      if (get().phase !== "idle") return; // 动画进行中忽略
      set({ phase: "cover" });
      window.setTimeout(() => {
        set({ phase: "covered" });
        onCovered?.();
      }, COVER_MS);
    },
    reveal: () => {
      if (get().phase !== "covered") return; // 仅在完全盖住后可展示
      set({ phase: "reveal" });
      window.setTimeout(() => set({ phase: "idle" }), REVEAL_MS);
    },
  }),
);

/** 前半：播放盖住动画，完全盖住时执行 onCovered，之后保持盖住状态 */
export function playCurtainCover(onCovered?: () => void): void {
  useCurtainTransitionStore.getState().cover(onCovered);
}

/** 后半：从盖住状态播放展示动画 */
export function playCurtainReveal(): void {
  useCurtainTransitionStore.getState().reveal();
}

/** 等待界面资源就绪的兜底上限（ms）— 防止资源异常时帘幕永不揭开 */
const READY_TIMEOUT_MS = 5000;

/**
 * 等待当前界面资源加载完成：
 *   1. 两帧 rAF — 等新界面完成挂载与首次绘制
 *   2. 所有 <img> 加载完成（含失败，失败不阻塞）
 * 超过 READY_TIMEOUT_MS 直接放行。
 */
function waitForPageReady(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve();
    };
    // 兜底：超时放行
    const timeoutId = window.setTimeout(done, READY_TIMEOUT_MS);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const images = Array.from(document.querySelectorAll("img")).filter(
          (img) => !img.complete,
        );
        if (images.length === 0) {
          done();
          return;
        }
        let remaining = images.length;
        const onOne = () => {
          remaining--;
          if (remaining <= 0) done();
        };
        images.forEach((img) => {
          // 加载失败同样计数，不阻塞揭幕
          img.addEventListener("load", onOne, { once: true });
          img.addEventListener("error", onOne, { once: true });
        });
      });
    });
  });
}

/**
 * 组合：前半盖住 → onCovered（切换界面）→ 等新界面资源加载完成 → 后半展示。
 * 可传入 ready 覆盖默认就绪判定（返回 Promise，resolve 后揭幕），
 * 需要更长准备的界面也可自行分段调用 playCurtainCover / playCurtainReveal。
 */
export function playCurtainTransition(
  onCovered: () => void,
  ready?: () => Promise<void>,
): void {
  playCurtainCover(() => {
    try {
      onCovered();
    } finally {
      (ready?.() ?? waitForPageReady())
        .catch(() => {
          /* 就绪判定异常不阻塞揭幕 */
        })
        .then(() => playCurtainReveal());
    }
  });
}

/** 注入前/后半 keyframes（全局一次）— 前后独立命名，避免同名动画不重新触发 */
const CURTAIN_KEYFRAMES_ID = "__curtain_transition_keyframes__";
function ensureCurtainKeyframes(): void {
  if (document.getElementById(CURTAIN_KEYFRAMES_ID)) return;
  const el = document.createElement("style");
  el.id = CURTAIN_KEYFRAMES_ID;
  el.textContent = `
@keyframes curtain-in-top { from { transform: translateY(-101%); } to { transform: translateY(0); } }
@keyframes curtain-in-bottom { from { transform: translateY(101%); } to { transform: translateY(0); } }
@keyframes curtain-in-left { from { transform: translateX(-101%); } to { transform: translateX(0); } }
@keyframes curtain-in-right { from { transform: translateX(101%); } to { transform: translateX(0); } }
@keyframes curtain-out-top { from { transform: translateY(0); } to { transform: translateY(-101%); } }
@keyframes curtain-out-bottom { from { transform: translateY(0); } to { transform: translateY(101%); } }
@keyframes curtain-out-left { from { transform: translateX(0); } to { transform: translateX(-101%); } }
@keyframes curtain-out-right { from { transform: translateX(0); } to { transform: translateX(101%); } }
`;
  document.head.appendChild(el);
}

/**
 * 生成某一片窗帘的 animation 值：
 * cover 引用前半（curtain-in-*），reveal 引用后半（curtain-out-*），
 * covered 无动画（keyframes to 值即贴合位，静止保持盖住）
 */
function curtainAnimation(part: string, phase: Phase): string {
  if (phase === "cover")
    return `curtain-in-${part} ${COVER_MS}ms ease-in-out forwards`;
  if (phase === "reveal")
    return `curtain-out-${part} ${REVEAL_MS}ms ease-in-out forwards`;
  return "none";
}

const styles: Record<string, React.CSSProperties> = {
  // 覆盖层 — 全屏最顶层，动画期间拦截交互
  overlay: {
    position: "fixed",
    inset: 0,
    overflow: "hidden",
    zIndex: 9999,
    pointerEvents: "auto",
  },
  // 左右窗帘 — 像素相贴：素材四周含透明边距（左帘不透明区约 x 2.7%~98.6%，
  // 右帘约 3.4%~97.9%），若按图片边缘各占 50% 相贴，中缝与屏幕边缘会露出界面。
  // 因此宽度放大到 55% 并向屏外偏移 2%，令闭合时中缝两侧的不透明像素互相搭接、
  // 屏幕外缘也由不透明像素覆盖（层级低于 top/bottom）
  // willChange/backfaceVisibility：提升为独立合成层，避免 Android WebView
  // 在动画期间反复栅格化大图导致闪烁
  left: {
    position: "absolute",
    top: "-2%",
    left: "-2%",
    width: "55%",
    height: "105%",
    objectFit: "fill",
    zIndex: 1,
    willChange: "transform",
    backfaceVisibility: "hidden",
  },
  right: {
    position: "absolute",
    top: "-2%",
    right: "-2%",
    width: "55%",
    height: "105%",
    objectFit: "fill",
    zIndex: 1,
    willChange: "transform",
    backfaceVisibility: "hidden",
  },
  // 上下帘幔 — 全宽拉伸：上帘高占界面 1/10，下帘高占界面 1/8，贴顶/贴底（curtain 在最顶层）
  top: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "10%",
    objectFit: "fill",
    zIndex: 2,
    willChange: "transform",
    backfaceVisibility: "hidden",
  },
  bottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: "100%",
    height: "12.5%",
    objectFit: "fill",
    zIndex: 2,
    willChange: "transform",
    backfaceVisibility: "hidden",
  },
};

const CurtainTransition: React.FC = () => {
  const phase = useCurtainTransitionStore((s) => s.phase);

  useEffect(() => {
    ensureCurtainKeyframes();
  }, []);

  // 覆盖层常驻挂载：idle 时仅隐藏（visibility）而非卸载。
  // 阶段切换靠 animation 名称变化重启动画（cover/reveal 引用不同 keyframes），
  // 不使用 key=phase 重建 DOM — 重建 <img> 会让 Android WebView 重新解码大图，
  // 造成阶段衔接处闪烁（左右帘素材 1.7MB 尤为明显）
  const hidden = phase === "idle";

  return (
    <div
      style={{
        ...styles.overlay,
        visibility: hidden ? "hidden" : "visible",
        pointerEvents: hidden ? "none" : "auto",
      }}
    >
      {/* 左右窗帘 — 从界面外左右进入，到中间刚好贴住 */}
      <img
        src={curtainLeftUrl}
        alt=""
        draggable={false}
        style={{
          ...styles.left,
          animation: curtainAnimation("left", phase),
        }}
      />
      <img
        src={curtainRightUrl}
        alt=""
        draggable={false}
        style={{
          ...styles.right,
          animation: curtainAnimation("right", phase),
        }}
      />
      {/* 上下帘幔 — 从界面外上下进入，贴顶/贴底，层级最顶 */}
      <img
        src={curtainTopUrl}
        alt=""
        draggable={false}
        style={{
          ...styles.top,
          animation: curtainAnimation("top", phase),
        }}
      />
      <img
        src={curtainBottomUrl}
        alt=""
        draggable={false}
        style={{
          ...styles.bottom,
          animation: curtainAnimation("bottom", phase),
        }}
      />
    </div>
  );
};

export default CurtainTransition;
