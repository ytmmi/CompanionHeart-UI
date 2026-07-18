/**
 * live2dModelRect — 计算 Live2D 模型在画布上的可视矩形（CSS 像素）
 *
 * 复刻 LAppLive2DManager.onUpdate 的投影矩阵构造（projection × view × modelMatrix），
 * 将模型空间包围盒变换到裁剪空间（-1~1），再换算为相对画布的 CSS 像素矩形。
 * 供气泡等 DOM 控件跟随模型定位（拖动/缩放模型后位置同步变化）。
 */

import { CubismMatrix44 } from "@framework/math/cubismmatrix44";
import { LAppLive2DManager } from "../../cubism-sdk/src/lapplive2dmanager";
import { canvas } from "../../cubism-sdk/src/lappglmanager";

/** 模型可视矩形（相对画布 CSS 盒，单位 px） */
export interface ModelScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 模型空间包围盒缓存（顶点遍历较重，按时间间隔重算） */
interface BBoxCache {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  computedAt: number;
}

/** 包围盒重算间隔（毫秒）——动作/物理摆动引起的形变在此粒度内可接受 */
const BBOX_RECOMPUTE_INTERVAL_MS = 500;

const bboxCacheMap = new WeakMap<object, BBoxCache>();

/** 遍历所有可见 drawable 顶点，计算模型空间包围盒 */
function computeModelSpaceBBox(lappModel: any): BBoxCache | null {
  const coreModel = lappModel?._model;
  if (!coreModel) return null;

  const drawableCount: number = coreModel.getDrawableCount?.() ?? 0;
  if (drawableCount === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < drawableCount; i++) {
    if (!coreModel.getDrawableDynamicFlagIsVisible(i)) continue;
    const vertices: Float32Array = coreModel.getDrawableVertices(i);
    for (let j = 0; j < vertices.length; j += 2) {
      const vx = vertices[j];
      const vy = vertices[j + 1];
      if (vx < minX) minX = vx;
      if (vx > maxX) maxX = vx;
      if (vy < minY) minY = vy;
      if (vy > maxY) maxY = vy;
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { minX, minY, maxX, maxY, computedAt: performance.now() };
}

// 复用矩阵实例，避免每帧分配
const _mvp = new CubismMatrix44();

/**
 * 获取模型当前在画布上的可视矩形。
 * 模型未就绪 / 画布不可用时返回 null。
 */
export function getModelScreenRect(): ModelScreenRect | null {
  if (!canvas) return null;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  const pxW = canvas.width;
  const pxH = canvas.height;
  if (cssW <= 0 || cssH <= 0 || pxW <= 0 || pxH <= 0) return null;

  const manager = LAppLive2DManager.getInstance();
  const model: any = manager?.getModel(0);
  if (!model?._model || !model._modelMatrix) return null;

  // 1. 模型空间包围盒（带缓存）
  let bbox = bboxCacheMap.get(model as object);
  if (
    !bbox ||
    performance.now() - bbox.computedAt > BBOX_RECOMPUTE_INTERVAL_MS
  ) {
    const fresh = computeModelSpaceBBox(model);
    if (!fresh) return null;
    bboxCacheMap.set(model as object, fresh);
    bbox = fresh;
  }

  // 2. 构造 MVP（与 LAppLive2DManager.onUpdate 完全一致，仅不做 setWidth 副作用）
  _mvp.loadIdentity();
  if (model.getModel()?.getCanvasWidth() > 1.0 && pxW < pxH) {
    _mvp.scale(1.0, pxW / pxH);
  } else {
    _mvp.scale(pxH / pxW, 1.0);
  }
  const viewMatrix = (manager as any)._viewMatrix;
  if (viewMatrix) {
    _mvp.multiplyByMatrix(viewMatrix);
  }
  _mvp.multiplyByMatrix(model._modelMatrix);

  // 3. 变换包围盒四角到裁剪空间（矩阵为仿射，直接取 min/max 角点即可）
  const m = _mvp.getArray();
  const transform = (x: number, y: number): [number, number] => [
    m[0] * x + m[4] * y + m[12],
    m[1] * x + m[5] * y + m[13],
  ];
  const corners = [
    transform(bbox.minX, bbox.minY),
    transform(bbox.maxX, bbox.minY),
    transform(bbox.minX, bbox.maxY),
    transform(bbox.maxX, bbox.maxY),
  ];
  let clipMinX = Infinity;
  let clipMinY = Infinity;
  let clipMaxX = -Infinity;
  let clipMaxY = -Infinity;
  for (const [cx, cy] of corners) {
    if (cx < clipMinX) clipMinX = cx;
    if (cx > clipMaxX) clipMaxX = cx;
    if (cy < clipMinY) clipMinY = cy;
    if (cy > clipMaxY) clipMaxY = cy;
  }

  // 4. 裁剪空间（-1~1，Y 向上）→ 画布 CSS 像素（Y 向下）
  const left = ((clipMinX + 1) / 2) * cssW;
  const right = ((clipMaxX + 1) / 2) * cssW;
  const top = ((1 - clipMaxY) / 2) * cssH;
  const bottom = ((1 - clipMinY) / 2) * cssH;

  return { left, top, width: right - left, height: bottom - top };
}
