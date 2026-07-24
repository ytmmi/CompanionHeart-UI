// PLATFORM: Group A — Win / Web / Android 平板 共用组件
// 独立组件历史记录：横条矩形，白色背景
//   三角形按钮（居中）— 复用 rounded-triangle.svg，收起时朝下，
//     点击旋转 180° 朝上并向下展开历史对话列表
//   + 按钮（靠右）— 复用 +.svg，开启新对话

import React, { useState } from "react";
import RoundedTriangle from "../Common/RoundedTriangle";
import plusUrl from "../../assets/svg/+.svg";

/** 横条高度（px） */
export const CHAT_HISTORY_BAR_HEIGHT = 28;

interface ChatHistoryBarProps {
  /** 开启新对话回调（点击 + 按钮时触发） */
  onNewChat?: () => void;
  /** 展开区内容（历史对话列表；不传则显示占位提示） */
  children?: React.ReactNode;
  /** 附加样式（作用于根元素） */
  style?: React.CSSProperties;
}

const styles: Record<string, React.CSSProperties> = {
  // 根容器 — 纵向排列：横条 +（展开时）向下的历史对话列表
  container: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    flexShrink: 0,
  },
  // 横条矩形 — 白色背景，三角形居中、+ 靠右
  bar: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: CHAT_HISTORY_BAR_HEIGHT,
    flexShrink: 0,
    backgroundColor: "#fff",
    boxSizing: "border-box",
    userSelect: "none",
  },
  // 三角形按钮 — 居中（点击展开/收缩历史对话）
  triangleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    padding: 0,
    border: "none",
    backgroundColor: "transparent",
    cursor: "pointer",
  },
  // + 按钮 — 绝对定位贴横条右侧（开启新对话）
  plusBtn: {
    position: "absolute",
    right: 4,
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    padding: 0,
    border: "none",
    backgroundColor: "transparent",
    cursor: "pointer",
  },
  // 展开区 — 向下展开的历史对话列表（高度过渡动画）
  dropdown: {
    width: "100%",
    backgroundColor: "#fff",
    overflow: "hidden",
    transition: "max-height 250ms ease",
    boxSizing: "border-box",
  },
  // 展开区占位提示（历史对话列表功能待开发）
  placeholder: {
    padding: "8px 12px",
    color: "#999",
    fontSize: 13,
  },
};

const ChatHistoryBar: React.FC<ChatHistoryBarProps> = ({
  onNewChat,
  children,
  style,
}) => {
  /** 历史对话列表是否展开 */
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ ...styles.container, ...style }}>
      {/* 横条矩形：三角形居中 + 号靠右 */}
      <div style={styles.bar}>
        {/* 三角形按钮（收起朝下 / 展开旋转 180° 朝上） */}
        <button
          type="button"
          style={styles.triangleBtn}
          onClick={() => setExpanded((prev) => !prev)}
          title={expanded ? "收起历史对话" : "展开历史对话"}
        >
          <RoundedTriangle
            size={12}
            direction={expanded ? "up" : "down"}
          />
        </button>
        {/* + 按钮（开启新对话） */}
        <button
          type="button"
          style={styles.plusBtn}
          onClick={onNewChat}
          title="开启新对话"
        >
          <img
            src={plusUrl}
            alt="开启新对话"
            style={{
              width: 14,
              height: 14,
              display: "block",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        </button>
      </div>
      {/* 向下展开的历史对话列表 */}
      <div
        style={{
          ...styles.dropdown,
          maxHeight: expanded ? 240 : 0,
        }}
      >
        {children ?? <div style={styles.placeholder}>暂无历史对话</div>}
      </div>
    </div>
  );
};

export default ChatHistoryBar;
