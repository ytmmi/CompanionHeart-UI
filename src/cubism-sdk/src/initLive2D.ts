/**
 * Live2D 原生 Cubism SDK 初始化入口
 *
 * 参考 Open-LLM-VTuber 的架构：
 * - LAppGlManager.setCanvas() 注入外部 canvas
 * - LAppDelegate 管理 Cubism Framework + View + 渲染循环
 * - LAppDefine.updateModelConfig() 设置模型路径
 */

import { LAppGlManager } from "./lappglmanager";
import { LAppDelegate, s_instance } from "./lappdelegate";
import { LAppLive2DManager } from "./lapplive2dmanager";
import * as LAppDefine from "./lappdefine";

export interface NativeLive2DConfig {
  /** 模型 model3.json 的 URL（相对于 public 目录） */
  modelUrl: string;
  /** 缩放系数（默认 1.0） */
  kScale?: number;
}

/**
 * 解析 model3.json URL 为 SDK 需要的 ResourcesPath + ModelDir 格式
 *
 * SDK 的 LAppLive2DManager 会构造路径: ResourcesPath + ModelDir[i] + "/" + ModelFileName
 * 所以 ResourcesPath 应该是模型文件夹的父目录，ModelDir 是模型文件夹名。
 *
 * 输入: "live2d-models/akari_vts/akari.model3.json"
 * 输出: { baseUrl: "live2d-models/", modelDir: "akari_vts", modelFileName: "akari" }
 *
 * 输入: "live2d-models/moran/moran.model3.json"
 * 输出: { baseUrl: "live2d-models/", modelDir: "moran", modelFileName: "moran" }
 */
function parseModelUrl(url: string): {
  baseUrl: string;
  modelDir: string;
  modelFileName: string;
} {
  // 移除文件名部分，获取目录路径
  // "live2d-models/akari_vts/akari.model3.json" -> "live2d-models/akari_vts"
  const lastSlash = url.lastIndexOf("/");
  if (lastSlash === -1) {
    // 没有目录，文件在根目录
    const fileName = url.replace(".model3.json", "");
    return { baseUrl: "./", modelDir: ".", modelFileName: fileName };
  }

  const dirPath = url.substring(0, lastSlash); // "live2d-models/akari_vts"
  const fileName = url.substring(lastSlash + 1).replace(".model3.json", ""); // "akari"

  // 获取父目录和当前目录名
  const parentSlash = dirPath.lastIndexOf("/");
  if (parentSlash === -1) {
    // dirPath 没有更上层目录，如 "akari_vts/akari.model3.json"
    return { baseUrl: "./", modelDir: dirPath, modelFileName: fileName };
  }

  const baseUrl = dirPath.substring(0, parentSlash + 1); // "live2d-models/"
  const modelDir = dirPath.substring(parentSlash + 1); // "akari_vts"

  return { baseUrl, modelDir, modelFileName: fileName };
}

/**
 * 初始化原生 Cubism SDK Live2D 渲染
 *
 * 流程（参考 Open-LLM-VTuber 的 initializeLive2D）：
 * 1. setCanvas() 注入 canvas
 * 2. updateModelConfig() 设置模型路径
 * 3. LAppGlManager.getInstance() 初始化 WebGL
 * 4. LAppDelegate.getInstance().initialize() 初始化 Delegate
 * 5. delegate.run() 启动渲染循环
 *
 * @param canvasEl - React 创建的 canvas DOM 元素
 * @param config - 模型配置
 * @returns 清理函数
 */
export function initNativeLive2D(
  canvasEl: HTMLCanvasElement,
  config: NativeLive2DConfig,
): () => void {
  const { modelUrl, kScale = 1.0 } = config;

  console.log("[initNativeLive2D] 开始初始化", { modelUrl, kScale });

  // 0. 🆕 前置验证：canvas 存在且有有效尺寸
  if (!canvasEl) {
    console.error("[initNativeLive2D] ❌ canvas 元素为 null");
    return () => {};
  }

  // 1. 设置 canvas 像素尺寸
  const dpr = window.devicePixelRatio || 1;
  const parent = canvasEl.parentElement;
  if (parent) {
    const cw = parent.clientWidth;
    const ch = parent.clientHeight;
    if (cw <= 0 || ch <= 0) {
      console.error(
        `[initNativeLive2D] ❌ 父容器尺寸为零 (${cw}×${ch})，无法初始化 WebGL`,
      );
      return () => {};
    }
    canvasEl.width = Math.round(cw * dpr);
    canvasEl.height = Math.round(ch * dpr);
    console.log(
      `[initNativeLive2D] Canvas 尺寸: ${canvasEl.width}×${canvasEl.height} (CSS ${cw}×${ch}, DPR ${dpr})`,
    );
  } else {
    console.warn("[initNativeLive2D] ⚠️ canvas 无父容器，使用默认尺寸");
  }

  // 2. 注入 canvas 到 GL Manager
  LAppGlManager.setCanvas(canvasEl);

  // 3. 解析模型路径并配置
  const { baseUrl, modelDir, modelFileName } = parseModelUrl(modelUrl);
  LAppDefine.updateModelConfig(baseUrl, modelDir, kScale, modelFileName);

  // 🆕 前置验证：尝试 fetch 模型文件，提前暴露路径错误
  const fullModelPath = `${baseUrl}${modelDir}/${modelFileName}.model3.json`;
  console.log("[initNativeLive2D] 验证模型路径可访问:", fullModelPath);
  fetch(fullModelPath)
    .then((res) => {
      if (!res.ok) {
        console.error(
          `[initNativeLive2D] ❌ 模型文件返回 ${res.status}: ${fullModelPath}`,
        );
      } else {
        console.log(`[initNativeLive2D] ✅ 模型文件可访问 (${res.status})`);
        // 测试纹理是否也可访问
        const texPath = `${baseUrl}${modelDir}/akari.4096/texture_00.png`;
        const img = new Image();
        img.onload = () =>
          console.log("[initNativeLive2D] ✅ 纹理文件可访问:", texPath);
        img.onerror = () =>
          console.error("[initNativeLive2D] ❌ 纹理文件不可访问:", texPath);
        img.src = texPath;
      }
    })
    .catch((err) => {
      console.error(
        `[initNativeLive2D] ❌ 模型文件 fetch 失败: ${fullModelPath}`,
        err,
      );
    });

  console.log("[initNativeLive2D] 模型配置", {
    baseUrl,
    modelDir,
    modelFileName,
    fullPath: `${baseUrl}${modelDir}/${modelFileName}.model3.json`,
  });

  // 4. 清理已有实例（先释放 Delegate，再释放 GL Manager）
  if (s_instance) {
    console.log("[initNativeLive2D] 释放旧的 LAppDelegate 实例");
    LAppDelegate.releaseInstance();
  }
  LAppGlManager.releaseInstance();

  // 4b. 重新注入 canvas（确保 GL Manager 构造函数能找到 canvas）
  LAppGlManager.setCanvas(canvasEl);

  // 5. 初始化 GL + Delegate
  const glMgr = LAppGlManager.getInstance();
  if (!glMgr) {
    console.error("[initNativeLive2D] ❌ GL Manager 初始化失败");
    return () => {};
  }

  // 🆕 验证 WebGL 上下文是否成功获取
  const glContext = LAppGlManager.getGL();
  if (!glContext) {
    console.error(
      "[initNativeLive2D] ❌ WebGL 上下文获取失败。（排查：浏览器是否支持 WebGL？chrome://gpu 确认硬件加速已启用）",
    );
    return () => {};
  }
  console.log(
    `[initNativeLive2D] WebGL 上下文就绪 | isContextLost: ${glContext.isContextLost()}`,
  );

  const delegate = LAppDelegate.getInstance();
  if (!delegate.initialize()) {
    console.error("[initNativeLive2D] ❌ Delegate 初始化失败");
    return () => {};
  }

  // 6. 启动渲染循环
  delegate.run();
  console.log(
    `[initNativeLive2D] 渲染循环已启动 (isRunning: ${delegate.isRunning})`,
  );

  // 7. 触发模型加载（构造函数中不再自动加载）
  const manager = LAppLive2DManager.getInstance();
  if (manager) {
    console.log(
      `[initNativeLive2D] 触发模型加载: ${baseUrl}${modelDir}/${modelFileName}.model3.json`,
    );
    manager.changeScene(0);
  } else {
    console.error("[initNativeLive2D] ❌ LAppLive2DManager 获取失败");
    return () => {};
  }

  // 8. 暴露全局 API（参考项目做法）
  (window as any).getLive2DManager = () => LAppLive2DManager.getInstance();

  console.log("[initNativeLive2D] ✅ 初始化完成（模型异步加载中...）");

  // 9. 返回清理函数（幂等，可安全重复调用）
  let cleanedUp = false;
  return () => {
    if (cleanedUp) return;
    cleanedUp = true;
    console.log("[initNativeLive2D] 清理资源");
    try {
      LAppDelegate.releaseInstance();
    } catch (e) {
      console.warn("[initNativeLive2D] Delegate 释放异常:", e);
    }
    try {
      LAppGlManager.releaseInstance();
    } catch (e) {
      console.warn("[initNativeLive2D] GL Manager 释放异常:", e);
    }
    // 清除全局引用
    try {
      delete (window as any).getLive2DManager;
    } catch (e) {
      /* ignore */
    }
    try {
      delete (window as any).LAppLive2DManager;
    } catch (e) {
      /* ignore */
    }
  };
}

/**
 * 触发画布 resize
 */
export function resizeNativeLive2D(): void {
  const delegate = LAppDelegate.getInstance();
  if (delegate) {
    delegate.onResize();
  }
}
