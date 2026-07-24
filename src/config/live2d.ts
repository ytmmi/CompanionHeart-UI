/**
 * Live2D 模型配置文件
 *
 * 所有 Live2D 模型相关的配置集中在此文件中管理。
 * 每个模型有独立的配置文件（`live2d/` 目录下），文件名与模型名对应：
 * - `akari.ts`      → akari 模型（当前默认）
 * - `moran.ts`      → moran 模型
 * - `universal.ts`  → 万能自定义模型
 * - `default.ts`    → re-export 当前默认模型
 *
 * 切换模型方式：
 * - 静态默认：修改 `default.ts` 中的 import 源
 * - 运行时切换：dev_global_settings 界面通过 MODEL_REGISTRY 按名称选择
 *   （注意：构建产物默认只保留默认模型，备选模型仅开发环境可用，
 *    见 vite.config.ts 的 prune-live2d-models 插件）
 */
import type { ModelInfo } from "../types/live2d";
import akari from "./live2d/akari";
import moran from "./live2d/moran";
import universal from "./live2d/universal";

export { default as DEFAULT_MODEL_INFO } from "./live2d/default";

/** 可切换的模型注册表（键 = 模型名，供 dev_global_settings 角色设置使用） */
export const MODEL_REGISTRY: Record<string, ModelInfo> = {
  akari,
  moran,
  万能自定义模型: universal,
};

/** 按名称取模型配置（未注册时回退 akari） */
export function getModelByName(name: string): ModelInfo {
  return MODEL_REGISTRY[name] ?? akari;
}
