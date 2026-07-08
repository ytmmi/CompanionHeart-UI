/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

export let canvas: HTMLCanvasElement | null = null;
export let gl: WebGLRenderingContext | null = null;
export let s_instance: LAppGlManager | null = null;

/**
 * Cubism SDK の WebGL 管理类
 * CompanionHeart 适配：通过 setCanvas() 注入外部 canvas
 */
export class LAppGlManager {
  private _released = false;

  /**
   * 注入外部 canvas（在 getInstance 之前调用）。
   * ⚠️ 当 canvas 元素变化时（如 React StrictMode 重挂载），
   *    必须置空 gl 引用，迫使构造函数为新 canvas 创建全新的 WebGL 上下文。
   *    否则 gl 仍指向旧 canvas 的上下文，所有渲染命令发到已脱离 DOM 的旧 canvas。
   */
  public static setCanvas(canvasEl: HTMLCanvasElement): void {
    if (canvas !== canvasEl) {
      // Canvas 元素变化（StrictMode 重挂载等场景），强制重置 gl
      if (gl) {
        console.log(
          "[LAppGlManager] setCanvas: 检测到 canvas 元素变化，重置 gl 上下文",
        );
      }
      gl = null;
    }
    canvas = canvasEl;
  }

  /**
   * 安全获取 WebGL 上下文（不触发重新创建）
   */
  public static getGL(): WebGLRenderingContext | null {
    return gl;
  }

  public static getInstance(): LAppGlManager {
    if (s_instance == null) {
      s_instance = new LAppGlManager();
    }
    return s_instance;
  }

  public static releaseInstance(): void {
    if (s_instance != null) {
      try {
        s_instance.release();
      } catch (e) {
        console.warn("[LAppGlManager] release 异常:", e);
      }
      s_instance = null;
    }
  }

  constructor() {
    if (!canvas) {
      // 兜底：尝试从 DOM 获取
      canvas = document.getElementById("canvas") as HTMLCanvasElement;
    }

    if (!canvas) {
      console.warn("[LAppGlManager] Canvas 未注入");
      return;
    }

    // 检查 canvas 是否有有效尺寸（0×0 尺寸会导致 WebGL 上下文创建失败）
    if (canvas.width === 0 || canvas.height === 0) {
      console.warn(
        `[LAppGlManager] Canvas 尺寸为零 (${canvas.width}×${canvas.height})，WebGL 可能无法正常初始化`,
      );
    }

    // WebGL 规范：同一 canvas 重复调用 getContext 返回同一上下文对象
    // 所以即使 gl 被 release() 置空，对同一 canvas 重新 getContext 也不会丢失上下文
    // 这确保 React StrictMode 重挂载时，新 canvas 能获得全新的 WebGL 上下文
    if (!gl) {
      gl = canvas.getContext("webgl2") || canvas.getContext("webgl");

      if (!gl) {
        console.error("[LAppGlManager] WebGL 初始化失败");
      } else {
        const rendererInfo = gl.getParameter(
          (gl as any).RENDERER || 0,
        ) as string;
        console.log(
          `[LAppGlManager] WebGL 上下文已创建 | GPU: ${rendererInfo || "未知"} | 尺寸: ${canvas.width}×${canvas.height}`,
        );
      }
    } else {
      console.log("[LAppGlManager] 复用已有 WebGL 上下文");
    }
  }

  /**
   * 释放 GL Manager。
   * 置空 gl 引用：
   * 1. 允许旧 WebGL 上下文被 GC 回收
   * 2. 迫使下次 getInstance() 为当前 canvas 创建全新上下文
   * 不调用 loseContext()（会导致上下文永久失效）。
   * canvas.getContext("webgl2") 对同一 canvas 幂等返回同一上下文对象，
   * 所以即使同一 canvas 重新调用也不会丢失已创建的上下文。
   */
  public release(): void {
    if (this._released) return;
    this._released = true;
    gl = null;
    console.log(
      "[LAppGlManager] release 完成（gl 已置空，等待下次 getInstance 重建）",
    );
  }
}
