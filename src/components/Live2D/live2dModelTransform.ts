// live2d展示 模型变换工具
// 读取/设置模型矩阵（_modelMatrix）的平移与缩放，并提供首页位置的
// localStorage 持久化 —— 供 Live2DHost 在界面切换时重置/恢复模型位置。

import { LAppLive2DManager } from "../../cubism-sdk/src/lapplive2dmanager";

/** 模型变换（模型矩阵坐标系）：平移 x/y + 缩放因子 */
export interface ModelTransform {
  x: number;
  y: number;
  scale: number;
}

/** 首页模型位置持久化键 */
const LS_HOME_TRANSFORM_KEY = "__L2D_HOME_TRANSFORM__";

/** 获取当前模型的 _modelMatrix（模型未就绪时返回 null） */
function getModelMatrix(): any | null {
  try {
    const manager = LAppLive2DManager.getInstance();
    const model = manager?.getModel(0);
    // @ts-ignore - _modelMatrix 是 SDK 内部属性（与画布拖动/缩放同一矩阵）
    return (model as any)?._modelMatrix ?? null;
  } catch {
    return null;
  }
}

/** 读取当前模型变换（模型未就绪时返回 null） */
export function getModelTransform(): ModelTransform | null {
  const matrix = getModelMatrix();
  if (!matrix) return null;
  return {
    x: matrix.getTranslateX(),
    y: matrix.getTranslateY(),
    scale: matrix.getScaleX(),
  };
}

/**
 * 应用模型变换（模型未就绪时返回 false）。
 * scale() 为绝对值语义且不修改平移分量，translateX/Y 为绝对位置设置。
 */
export function setModelTransform(t: ModelTransform): boolean {
  const matrix = getModelMatrix();
  if (!matrix) return false;
  matrix.scale(t.scale, t.scale);
  matrix.translateX(t.x);
  matrix.translateY(t.y);
  return true;
}

/** 保存首页模型位置到 localStorage */
export function saveHomeTransform(t: ModelTransform): void {
  try {
    localStorage.setItem(LS_HOME_TRANSFORM_KEY, JSON.stringify(t));
  } catch {
    /* 写入失败不影响功能 */
  }
}

/** 读取持久化的首页模型位置（无记录或数据无效时返回 null） */
export function loadHomeTransform(): ModelTransform | null {
  try {
    const raw = localStorage.getItem(LS_HOME_TRANSFORM_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (
      typeof t?.x === "number" &&
      Number.isFinite(t.x) &&
      typeof t?.y === "number" &&
      Number.isFinite(t.y) &&
      typeof t?.scale === "number" &&
      Number.isFinite(t.scale) &&
      t.scale > 0
    ) {
      return { x: t.x, y: t.y, scale: t.scale };
    }
    return null;
  } catch {
    return null;
  }
}
