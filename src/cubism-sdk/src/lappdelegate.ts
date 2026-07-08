/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismFramework, Option } from "@framework/live2dcubismframework";

import * as LAppDefine from "./lappdefine";
import { LAppLive2DManager } from "./lapplive2dmanager";
import { LAppPal } from "./lapppal";
import { LAppTextureManager } from "./lapptexturemanager";
import { LAppView } from "./lappview";
import { canvas, gl } from "./lappglmanager";

export let s_instance: LAppDelegate | null = null;
export let frameBuffer: WebGLFramebuffer | null = null;

/**
 * アプリケーションクラス。
 * Cubism SDKの管理を行う。
 *
 * 应用程序类。
 * 管理Cubism SDK。
 *
 */
export class LAppDelegate {
  /** 渲染循环是否正在运行 */
  private _running = false;
  /** 是否已释放 */
  private _released = false;
  /** 当前 rAF 句柄，用于精确取消 */
  private _rafId: number | null = null;

  /**
   * クラスのインスタンス（シングルトン）を返す。
   * インスタンスが生成されていない場合は内部でインスタンスを生成する。
   *
   * 返回类的实例（单例）。
   * 如果尚未创建实例，则在内部创建实例。
   *
   * @return クラスのインスタンス
   */
  public static getInstance(): LAppDelegate {
    if (s_instance == null) {
      s_instance = new LAppDelegate();
    }

    return s_instance;
  }

  /**
   * クラスのインスタンス（シングルトン）を解放する。
   *
   * 释放类的实例（单例）。
   *
   */
  public static releaseInstance(): void {
    if (s_instance != null) {
      s_instance.release();
    }

    s_instance = null;
  }

  /**
   * Initialize the application.
   */
  public initialize(): boolean {
    // Comment out the following code since canvas already exists in DOM
    // let parent = document.getElementById('live2d');
    // if (parent) {
    //   parent.appendChild(canvas!);
    // } else {
    //   document.body.appendChild(canvas!);
    // }

    if (LAppDefine.CanvasSize === "auto") {
      this._resizeCanvas();
    } else {
      canvas!.width = LAppDefine.CanvasSize.width;
      canvas!.height = LAppDefine.CanvasSize.height;
    }

    if (!frameBuffer) {
      frameBuffer = gl!.getParameter(gl!.FRAMEBUFFER_BINDING);
    }

    // 透過設定
    // 透明设置
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);

    const supportTouch: boolean = "ontouchend" in canvas!;

    if (supportTouch) {
      // タッチ関連コールバック関数登録
      // 注册触摸相关回调函数
      canvas!.addEventListener("touchstart", onTouchBegan, { passive: true });
      canvas!.addEventListener("touchmove", onTouchMoved, { passive: true });
      canvas!.addEventListener("touchend", onTouchEnded, { passive: true });
      canvas!.addEventListener("touchcancel", onTouchCancel, { passive: true });
    } else {
      // マウス関連コールバック関数登録
      // 注册鼠标相关回调函数
      canvas!.addEventListener("mousedown", onClickBegan, { passive: true });
      canvas!.addEventListener("mousemove", onMouseMoved, { passive: true });
      canvas!.addEventListener("mouseup", onClickEnded, { passive: true });
    }

    // AppViewの初期化
    this._view!.initialize();

    // Cubism SDKの初期化
    this.initializeCubism();

    return true;
  }

  /**
   * Resize canvas and re-initialize view.
   * 仅在渲染循环运行中时执行，避免暂停/释放期间无效重绘。
   */
  public onResize(): void {
    // 暂停/释放状态下跳过 resize 操作
    if (!this._running || this._released) return;
    this._resizeCanvas();

    // Ensure view is properly initialized
    if (this._view && canvas) {
      this._view.initialize();
      this._view.initializeSprite();

      // Try to get and center the model
      const manager = LAppLive2DManager.getInstance();
      if (manager) {
        const model = manager.getModel(0);
        if (model) {
          // Keep model centered in canvas
          const width = canvas!.width;
          const height = canvas!.height;
          if (width > 0 && height > 0) {
            // @ts-ignore
            if (model.setPosition) {
              // @ts-ignore
              model.setPosition(width / 2, height / 2);
            }
          }
        }
      }
    }
  }

  /**
   * 暂停渲染循环（页面切后台时调用）。
   * 停止 rAF 循环和模型更新，释放 CPU/GPU 资源。
   */
  public pause(): void {
    if (!this._running) return;
    this._running = false;
    // 取消挂起的 rAF
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * 恢复渲染循环（页面重新可见时调用）。
   * 仅在非释放状态且循环未运行时启动。
   */
  public resume(): void {
    if (this._released) return;
    if (this._running) return; // 已在运行，防双重循环
    this.run();
  }

  /** 渲染循环是否正在运行 */
  public get isRunning(): boolean {
    return this._running && !this._released;
  }

  /**
   * 解放する。
   * 幂等操作，可安全重复调用。
   */
  public release(): void {
    // 防止重复释放
    if (this._released) return;
    this._released = true;

    // 停止渲染循环
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    // 移除 canvas 事件监听器
    if (canvas) {
      try {
        canvas.removeEventListener("touchstart", onTouchBegan);
        canvas.removeEventListener("touchmove", onTouchMoved);
        canvas.removeEventListener("touchend", onTouchEnded);
        canvas.removeEventListener("touchcancel", onTouchCancel);
        canvas.removeEventListener("mousedown", onClickBegan);
        canvas.removeEventListener("mousemove", onMouseMoved);
        canvas.removeEventListener("mouseup", onClickEnded);
      } catch (e) {
        console.warn("[LAppDelegate] 事件监听器移除异常:", e);
      }
    }

    // 1. 先释放 Live2D Manager（包括模型的所有 WebGL 资源：moc、renderer、motion 等）
    //    必须在纹理管理器释放之前，确保模型渲染器清理时 gl 上下文仍然有效。
    //    releaseInstance() 内部会调用 releaseAllModel() 释放所有模型。
    try {
      LAppLive2DManager.releaseInstance();
    } catch (e) {
      console.warn("[LAppDelegate] Manager 释放异常:", e);
    }

    // 2. 释放纹理管理器（删除所有 WebGL 纹理）
    if (this._textureManager) {
      try {
        this._textureManager.release();
      } catch (e) {
        console.warn("[LAppDelegate] 纹理管理器释放异常:", e);
      }
      this._textureManager = null;
    }

    // 3. 释放视图（删除着色器程序）
    if (this._view) {
      try {
        this._view.release();
      } catch (e) {
        console.warn("[LAppDelegate] 视图释放异常:", e);
      }
      this._view = null;
    }

    // 4. 释放 Cubism SDK 框架
    try {
      CubismFramework.dispose();
    } catch (e) {
      console.warn("[LAppDelegate] CubismFramework 释放异常:", e);
    }
  }

  /**
   * 実行処理。
   * 执行处理。
   * 防双重循环：若已在运行则直接返回，避免多个 rAF 循环叠加导致 GPU 占用翻倍。
   */
  public run(): void {
    // 防双重循环：已在运行或已释放时忽略
    if (this._running || this._released) return;
    this._running = true;

    let frameCount = 0;
    const MEMORY_LOG_INTERVAL = 180; // 每 180 帧输出一次内存快照 (~3s @60fps)
    let lastMemLogFrame = 0;

    // メインループ
    const loop = (): void => {
      // インスタンスの有無の確認、または停止フラグ
      if (!this._running || s_instance == null || !this._view) {
        this._rafId = null;
        return;
      }

      frameCount++;

      // ── 周期性 GPU 内存快照日志 ──
      if (frameCount - lastMemLogFrame >= MEMORY_LOG_INTERVAL) {
        lastMemLogFrame = frameCount;
        try {
          const mem = (performance as any).memory;
          const usedMB = mem ? (mem.usedJSHeapSize / 1048576).toFixed(1) : "?";
          const limitMB = mem
            ? (mem.jsHeapSizeLimit / 1048576).toFixed(1)
            : "?";
          let gpuInfo = "";
          if (gl) {
            const extDebug = gl.getExtension("WEBGL_debug_renderer_info");
            if (extDebug) {
              const v = gl.getParameter(extDebug.UNMASKED_VENDOR_WEBGL) || "";
              const r = gl.getParameter(extDebug.UNMASKED_RENDERER_WEBGL) || "";
              gpuInfo = `${v} ${r}`.substring(0, 80);
            } else {
              gpuInfo =
                `${gl.getParameter(gl.VENDOR)}/${gl.getParameter(gl.RENDERER)}`.substring(
                  0,
                  60,
                );
            }
          }
          const mgr = LAppLive2DManager.getInstance();
          const modelCount = mgr?.["_models"]?.getSize?.() ?? 0;
          const model = mgr?.getModel(0);
          const drawableCount = model?.getModel?.()?.getDrawableCount?.() ?? 0;
          console.log(
            `[L2D-SDK] 📊 帧#${frameCount} | JS堆:${usedMB}/${limitMB}MB | 模型:${modelCount} | 可绘:${drawableCount} | GPU:${gpuInfo}`,
          );
          try {
            navigator.sendBeacon(
              "/__l2d_log__",
              JSON.stringify({
                t: new Date().toISOString(),
                id: 0,
                ph: "RENDER",
                lv: "log",
                msg: `帧#${frameCount} | JS堆:${usedMB}/${limitMB}MB | 模型:${modelCount} | 可绘:${drawableCount} | GPU:${gpuInfo}`,
                mem: mem ? `JS堆:${usedMB}/${limitMB}MB` : "",
              }),
            );
          } catch {
            /* ignore */
          }
        } catch {
          /* ignore */
        }
      }

      // 時間更新
      if (LAppDefine.ENABLE_LIMITED_FRAME_RATE) {
        LAppPal.updateTime(false);
        if (LAppPal.getDeltaTime() < 1 / LAppDefine.LIMITED_FRAME_RATE) {
          this._rafId = requestAnimationFrame(loop);
          return;
        }
      }

      LAppPal.updateTime(true);

      // 画面の初期化
      if (gl) {
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        // 必须同时清除颜色缓冲和深度缓冲，否则模型可能渲染到脏帧缓冲上导致不可见
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clearDepth(1.0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }

      // 描画更新
      if (this._view) {
        this._view.render();
      }

      // ループのために再帰呼び出し
      this._rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  /**
   * シェーダーを登録する。
   * 注册着色器。
   */
  public createShader(): WebGLProgram | null {
    // バーテックスシェーダーのコンパイル
    // 编译顶点着色器
    const vertexShaderId = gl!.createShader(gl!.VERTEX_SHADER);

    if (vertexShaderId == null) {
      LAppPal.printMessage("failed to create vertexShader");
      return null;
    }

    const vertexShader: string =
      "precision mediump float;" +
      "attribute vec3 position;" +
      "attribute vec2 uv;" +
      "varying vec2 vuv;" +
      "void main(void)" +
      "{" +
      "   gl_Position = vec4(position, 1.0);" +
      "   vuv = uv;" +
      "}";

    gl!.shaderSource(vertexShaderId, vertexShader);
    gl!.compileShader(vertexShaderId);

    // フラグメントシェーダのコンパイル
    const fragmentShaderId = gl!.createShader(gl!.FRAGMENT_SHADER);

    if (fragmentShaderId == null) {
      LAppPal.printMessage("failed to create fragmentShader");
      return null;
    }

    const fragmentShader: string =
      "precision mediump float;" +
      "varying vec2 vuv;" +
      "uniform sampler2D texture;" +
      "void main(void)" +
      "{" +
      "   gl_FragColor = texture2D(texture, vuv);" +
      "}";

    gl!.shaderSource(fragmentShaderId, fragmentShader);
    gl!.compileShader(fragmentShaderId);

    // プログラムオブジェクトの作成
    // 创建程序对象
    const programId = gl!.createProgram();
    gl!.attachShader(programId!, vertexShaderId);
    gl!.attachShader(programId!, fragmentShaderId);

    gl!.deleteShader(vertexShaderId);
    gl!.deleteShader(fragmentShaderId);

    // リンク
    // 链接
    gl!.linkProgram(programId!);

    gl!.useProgram(programId);

    return programId;
  }

  /**
   * View情報を取得する。
   */
  public getView(): LAppView | null {
    return this._view;
  }

  public getTextureManager(): LAppTextureManager | null {
    return this._textureManager;
  }

  /**
   * コンストラクタ
   * 构造函数
   */
  constructor() {
    this._captured = false;
    this._mouseX = 0.0;
    this._mouseY = 0.0;
    this._isEnd = false;
    this._running = false;

    this._cubismOption = new Option();
    this._view = new LAppView();
    this._textureManager = new LAppTextureManager();
  }

  /**
   * Cubism SDKの初期化
   */
  public initializeCubism(): void {
    // setup cubism
    this._cubismOption.logFunction = LAppPal.printMessage;
    this._cubismOption.loggingLevel = LAppDefine.CubismLoggingLevel;
    CubismFramework.startUp(this._cubismOption);

    // initialize cubism
    CubismFramework.initialize();

    // load model
    LAppLive2DManager.getInstance();

    LAppPal.updateTime();

    this._view!.initializeSprite();
  }

  /**
   * Resize the canvas to fill the screen.
   */
  private _resizeCanvas(): void {
    if (!canvas) {
      console.warn("Canvas is null, skipping resize");
      return;
    }
    canvas.width = canvas.clientWidth * window.devicePixelRatio;
    canvas.height = canvas.clientHeight * window.devicePixelRatio;
    if (gl) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
  }

  _cubismOption: Option; // Cubism SDK Option
  _view: LAppView | null; // View情報  // 视图信息
  _captured: boolean; // クリックしているか // 是否点击
  _mouseX: number; // マウスX座標 // 鼠标X坐标
  _mouseY: number; // マウスY座標 // 鼠标Y坐标
  _isEnd: boolean; // APP終了しているか // APP是否已结束
  _textureManager: LAppTextureManager | null; // テクスチャマネージャー // 纹理管理器
}

/**
 * クリックしたときに呼ばれる。
 * 当单击时调用。
 */
function onClickBegan(e: MouseEvent): void {
  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage("view notfound");
    return;
  }
  LAppDelegate.getInstance()._captured = true;

  const posX: number = e.pageX;
  const posY: number = e.pageY;

  LAppDelegate.getInstance()._view!.onTouchesBegan(posX, posY);
}

/**
 * マウスポインタが動いたら呼ばれる。
 */
function onMouseMoved(e: MouseEvent): void {
  if (!LAppDelegate.getInstance()._captured) {
    return;
  }

  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage("view notfound");
    return;
  }

  const rect = (e.target as Element).getBoundingClientRect();
  const posX: number = e.clientX - rect.left;
  const posY: number = e.clientY - rect.top;

  LAppDelegate.getInstance()._view!.onTouchesMoved(posX, posY);
}

/**
 * クリックが終了したら呼ばれる。
 */
function onClickEnded(e: MouseEvent): void {
  LAppDelegate.getInstance()._captured = false;
  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage("view notfound");
    return;
  }

  const rect = (e.target as Element).getBoundingClientRect();
  const posX: number = e.clientX - rect.left;
  const posY: number = e.clientY - rect.top;

  LAppDelegate.getInstance()._view!.onTouchesEnded(posX, posY);
}

/**
 * タッチしたときに呼ばれる。
 */
function onTouchBegan(e: TouchEvent): void {
  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage("view notfound");
    return;
  }

  LAppDelegate.getInstance()._captured = true;

  const posX = e.changedTouches[0].pageX;
  const posY = e.changedTouches[0].pageY;

  LAppDelegate.getInstance()._view!.onTouchesBegan(posX, posY);
}

/**
 * スワイプすると呼ばれる。
 */
function onTouchMoved(e: TouchEvent): void {
  if (!LAppDelegate.getInstance()._captured) {
    return;
  }

  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage("view notfound");
    return;
  }

  const rect = (e.target as Element).getBoundingClientRect();

  const posX = e.changedTouches[0].clientX - rect.left;
  const posY = e.changedTouches[0].clientY - rect.top;

  LAppDelegate.getInstance()._view!.onTouchesMoved(posX, posY);
}

/**
 * タッチが終了したら呼ばれる。
 */
function onTouchEnded(e: TouchEvent): void {
  LAppDelegate.getInstance()._captured = false;

  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage("view notfound");
    return;
  }

  const rect = (e.target as Element).getBoundingClientRect();

  const posX = e.changedTouches[0].clientX - rect.left;
  const posY = e.changedTouches[0].clientY - rect.top;

  LAppDelegate.getInstance()._view!.onTouchesEnded(posX, posY);
}

/**
 * タッチがキャンセルされると呼ばれる。
 */
function onTouchCancel(e: TouchEvent): void {
  LAppDelegate.getInstance()._captured = false;

  if (!LAppDelegate.getInstance()._view) {
    LAppPal.printMessage("view notfound");
    return;
  }

  const rect = (e.target as Element).getBoundingClientRect();

  const posX = e.changedTouches[0].clientX - rect.left;
  const posY = e.changedTouches[0].clientY - rect.top;

  LAppDelegate.getInstance()._view!.onTouchesEnded(posX, posY);
}
