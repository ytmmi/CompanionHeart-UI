/**
 * Live2D 默认模型配置 — re-export
 *
 * 所有项目的默认模型统一从此文件导出。
 * 切换默认模型时只需修改下方 import 源（如 "./akari" 或 "./moran"），
 * 无需改动任何组件代码。
 *
 * 当前默认: akari（纯英文文件名，兼容 Android APK 打包编码）
 *
 * 用法：
 *   import { DEFAULT_MODEL_INFO } from "../../config/live2d";
 *   // DEFAULT_MODEL_INFO 即此文件导出对象的默认值
 */
export { default } from "./akari";
