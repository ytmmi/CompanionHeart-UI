// PLATFORM: Group A — Win / Web / Android 平板 共用控件
// 独立头像控件：圆形，1px 白色描边（用于聊天画布中的对话显示）

import React from "react";

interface ChatAvatarProps {
  /** 头像图片地址 */
  src: string;
  /** 无障碍替代文本，默认 "头像" */
  alt?: string;
  /** 头像直径（px），默认 36 */
  size?: number;
  /** 附加样式（作用于根元素） */
  style?: React.CSSProperties;
}

const ChatAvatar: React.FC<ChatAvatarProps> = ({
  src,
  alt = "头像",
  size = 36,
  style,
}) => {
  return (
    <img
      src={src}
      alt={alt}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "1px solid #fff",
        boxSizing: "border-box",
        objectFit: "cover",
        display: "block",
        flexShrink: 0,
        userSelect: "none",
        ...style,
      }}
    />
  );
};

export default ChatAvatar;
