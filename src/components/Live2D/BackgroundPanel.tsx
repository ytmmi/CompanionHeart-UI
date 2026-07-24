// PLATFORM: Group A（Win / Web / 平板）— 右侧背景面板（房间背景 + Live2D）
// PLATFORM: Group B（Android 手机）— 暂未使用

import React from "react";
import Live2DCanvas from "./Live2DCanvasNative";
import ModelBubbleOverlay from "./ModelBubbleOverlay";
import type { ModelInfo } from "../../types/live2d";
import { getModelByName } from "../../config/live2d";
import { useChatStore } from "../../store/chatStore";
import { useSettingsStore } from "../../store/settingsStore";

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    backgroundColor: "transparent",
    overflow: "hidden",
    position: "relative",
    // 创建独立层叠上下文，与 Live2DCanvas 的 isolation 配合
    // 确保组件内所有元素层级不会泄漏到页面全局
    isolation: "isolate",
    zIndex: 0,
  },
  image: {
    display: "block",
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center",
    zIndex: 0,
  },
  live2dOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 1,
  },
};

const imgSrc = "/backgrounds/room/images/房间3.png";

const BackgroundPanel: React.FC = () => {
  /** 模型回复气泡文字（由聊天发送管线驱动） */
  const bubbleText = useChatStore((s) => s.bubbleText);
  /** 气泡是否处于淡出销毁动画中 */
  const bubbleClosing = useChatStore((s) => s.bubbleClosing);
  /** 当前角色模型（dev_global_settings 角色设置可切换，切换时画布重新加载） */
  const modelName = useSettingsStore((s) => s.modelName);

  const modelConfig: ModelInfo = {
    ...getModelByName(modelName),
    kScale: 1.0,
  };

  return (
    <div style={styles.container}>
      <img
        src={imgSrc}
        alt="背景"
        style={styles.image}
      />
      <div style={styles.live2dOverlay}>
        <Live2DCanvas
          width="100%"
          height="100%"
          modelInfo={modelConfig}
        />
        {/* 模型回复气泡：与模型居中对齐，模型贴边时钳制在画布内 */}
        <ModelBubbleOverlay
          text={bubbleText}
          closing={bubbleClosing}
        />
      </div>
    </div>
  );
};

export default BackgroundPanel;
