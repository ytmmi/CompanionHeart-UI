/**
 * Live2D 模型配置 — 万能自定义模型 1.1.0_4K（当前默认模型）
 *
 * 通用 Live2D 模型，23 张 4K 纹理，38 个表情，3 个动作。
 * VTube Studio 通用模型，通过 expressionFiles/motionFiles 显式定义全部资源。
 *
 * 特性：
 * - idleMotionGroupName 未指定：不绑定空闲动作，由 CubismBreath + CubismEyeBlink 提供默认动画
 * - defaultEmotion="怜爱_裙子"：启动时自动应用该表情
 * - tapMotions：点击 Body 区域播放「嗷呜」，点击 Head 区域播放「点头数数」
 */
import type { ModelInfo } from "../../types/live2d";

const config: ModelInfo = {
  name: "万能自定义模型",
  url: "live2d-models/万能自定义模型1.1.0_4K/万能自定义模型.model3.json",
  kScale: 0.85,
  initialXshift: 0,
  initialYshift: 0,
  // 不绑定空闲动作，让 CubismBreath + CubismEyeBlink 提供默认呼吸/眨眼
  defaultEmotion: "怜爱_裙子",
  pointerInteractive: true,
  tapMotions: {
    Body: "嗷呜",
    Head: "点头数数",
  },
  // model3.json 未定义 Expressions 字段，显式列出
  expressionFiles: [
    "expressions/怜爱_裙子.exp3.json",
    "expressions/怜爱_JK.exp3.json",
    "expressions/怜爱_女仆.exp3.json",
    "expressions/欣可_jk.exp3.json",
    "expressions/欣可_女仆.exp3.json",
    "expressions/欣可_泳装.exp3.json",
    "expressions/NanaAll_女仆.exp3.json",
    "expressions/【按键表情】星星眼.exp3.json",
    "expressions/【按键表情】委屈巴巴.exp3.json",
    "expressions/【按键表情】红温生气.exp3.json",
    "expressions/【按键表情】脸颊翻红.exp3.json",
    "expressions/【按键表情】阴险脸.exp3.json",
    "expressions/【按键表情】私人笑.exp3.json",
    "expressions/【按键表情】卡通流泪.exp3.json",
    "expressions/【按键表情】剪刀眼.exp3.json",
    "expressions/【按键表情】南瓜头套.exp3.json",
    "expressions/【按键表情】荧光猫胡须特效.exp3.json",
  ],
  // model3.json 未定义 Motions 字段，显式列出
  motionFiles: [
    { group: "wink", file: "motions/【动画】wink.motion3.json" },
    { group: "嗷呜", file: "motions/【动画】嗷呜.motion3.json" },
    { group: "点头数数", file: "motions/【动画】点头数数.motion3.json" },
  ],
};

export default config;
