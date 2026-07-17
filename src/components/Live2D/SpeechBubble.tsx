// PLATFORM: 全平台 — Live2D 通用控件
// 模型回复气泡：显示模型回复用户的话（文字），独立控件，使用时调用
// 样式：10px 圆角 + 1px 白色描边 + 50% 透明白色背景 + 背景模糊(4px) + 阴影
// 大小自适应文字内容，可通过 maxWidth 限制换行宽度

import React from "react";

interface SpeechBubbleProps {
  /** 要显示的回复文字（为空时不渲染） */
  text: string;
  /** 最大宽度（超出自动换行），默认 320 */
  maxWidth?: number | string;
  /** 文字大小（px），默认 14 */
  fontSize?: number;
  /** 附加样式（作用于气泡根元素，可用于定位） */
  style?: React.CSSProperties;
}

const bubbleStyle: React.CSSProperties = {
  display: "inline-block",
  boxSizing: "border-box",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #fff",
  backgroundColor: "rgba(255, 255, 255, 0.5)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
  color: "#333",
  lineHeight: 1.6,
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
  userSelect: "none",
};

const SpeechBubble: React.FC<SpeechBubbleProps> = ({
  text,
  maxWidth = 320,
  fontSize = 14,
  style,
}) => {
  if (!text) return null;

  return (
    <div
      style={{
        ...bubbleStyle,
        maxWidth,
        fontSize,
        ...style,
      }}
    >
      {text}
    </div>
  );
};

export default SpeechBubble;
