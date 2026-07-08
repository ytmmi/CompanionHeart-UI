/**
 * Live2D 模型配置 — akari
 *
 * VTube Studio 模型，1 张 4K 纹理，4 个表情，3 个动作。
 * model3.json 未定义 Expressions/Motions 字段，因此通过 expressionFiles/motionFiles 显式列出。
 *
 * 特性：
 * - fitMode="cover"：填满容器，可能裁剪边缘
 * - idleMotionGroupName="Idle_2"：使用 Idle_2 作为空闲动画
 */
import type { ModelInfo } from "../../types/live2d";

const config: ModelInfo = {
  name: "akari",
  url: "live2d-models/akari_vts/akari.model3.json",
  kScale: 1.0,
  fitMode: "cover",
  initialXshift: 0,
  initialYshift: 0,
  idleMotionGroupName: "Idle_2",
  pointerInteractive: true,
  tapMotions: {},
  // model3.json 未定义 Expressions 字段，显式列出
  expressionFiles: [
    "expressions/EyesCry.exp3.json",
    "expressions/EyesLove.exp3.json",
    "expressions/SignAngry.exp3.json",
    "expressions/SignShock.exp3.json",
  ],
  // model3.json 未定义 Motions 字段，显式列出
  motionFiles: [
    { group: "Idle_2", file: "animations/Idle_2.motion3.json" },
    { group: "Love", file: "animations/Love.motion3.json" },
    { group: "Shock", file: "animations/Shock.motion3.json" },
  ],
};

export default config;
