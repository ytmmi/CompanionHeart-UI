/**
 * Live2D 模型配置 — moran
 *
 * VTube Studio 模型，4 张 4K 纹理，9 个表情（EXP3），无动作。
 * model3.json 未定义 Expressions 字段，因此通过 expressionFiles 显式列出。
 *
 * 特性：
 * - idleMotionGroupName=""：不播放空闲动画，依赖 CubismBreath + CubismEyeBlink
 * - 无 motionFiles：模型无内置动作文件
 */
import type { ModelInfo } from "../../types/live2d";

const config: ModelInfo = {
  name: "moran",
  url: "live2d-models/moran/moran.model3.json",
  kScale: 0.85,
  initialXshift: 0,
  initialYshift: 0,
  idleMotionGroupName: "",
  pointerInteractive: true,
  tapMotions: {},
  // model3.json 未定义 Expressions 字段，显式列出
  expressionFiles: [
    "EXP3/星星眼.exp3.json",
    "EXP3/爱心眼.exp3.json",
    "EXP3/眯眼.exp3.json",
    "EXP3/圈圈眼.exp3.json",
    "EXP3/熊猫.exp3.json",
    "EXP3/水印.exp3.json",
    "EXP3/耳朵关闭.exp3.json",
    "EXP3/脸黑.exp3.json",
    "EXP3/黑眼圈.exp3.json",
  ],
};

export default config;
