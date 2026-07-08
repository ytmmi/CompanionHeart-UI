/**
 * Live2D 模型配置文件
 *
 * 所有 Live2D 模型相关的配置集中在此文件中管理。
 * 每个模型有独立的配置文件（`live2d/` 目录下），文件名与模型名对应：
 * - `moran.ts`      → moran 模型
 * - `universal.ts`  → 万能自定义模型
 * - `default.ts`    → re-export 当前默认模型
 *
 * 切换模型方式：修改 `default.ts` 中的 import 源
 */
export { default as DEFAULT_MODEL_INFO } from "./live2d/default";
