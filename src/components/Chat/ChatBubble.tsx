// PLATFORM: Group A — Win / Web / Android 平板 共用控件
// 独立聊天气泡控件：10px 圆角，白色背景，1px 黑色描边（用于聊天画布中的对话显示）

import React from "react";

interface ChatBubbleProps {
  /** 气泡内容 */
  children: React.ReactNode;
  /** 附加样式（作用于根元素） */
  style?: React.CSSProperties;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ children, style }) => {
  return (
    <div
      style={{
        maxWidth: "75%",
        padding: "8px 12px",
        borderRadius: 10,
        backgroundColor: "#fff",
        border: "1px solid #000",
        boxSizing: "border-box",
        fontSize: 14,
        lineHeight: 1.5,
        color: "#333",
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export default ChatBubble;
