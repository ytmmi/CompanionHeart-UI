// PLATFORM: Group A — Win / Web / Android 平板 共用组件
// 左侧聊天记录面板：内容区 + 右侧展开/收缩栏（点击三角形切换）

import React, { useState } from "react";
import RoundedTriangle from "../Common/RoundedTriangle";

/** 右侧展开/收缩栏宽度（px），即收缩后的面板宽度 */
export const CHAT_HISTORY_TOGGLE_BAR_WIDTH = 15;

const styles: Record<string, React.CSSProperties> = {
  // 面板容器 — 横向排列：左侧内容区 + 右侧展开/收缩栏
  container: {
    display: "flex",
    flexDirection: "row",
    height: "100vh",
    backgroundColor: "#e0e0e0",
    overflow: "hidden",
    flexShrink: 0,
    transition: "width 250ms ease",
  },
  // 内容区 — 弹性填充（收缩动画期间被压缩裁剪，不参与瞬时卸载）
  content: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#888",
    fontSize: 18,
    fontWeight: 500,
    userSelect: "none",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  // 右侧展开/收缩栏 — 宽 15px，高与容器一致，始终贴容器右边，三角形居中
  toggleBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: CHAT_HISTORY_TOGGLE_BAR_WIDTH,
    height: "100%",
    flexShrink: 0,
    marginLeft: "auto",
    borderLeft: "1px solid #d0d0d0",
    boxSizing: "border-box",
    cursor: "pointer",
    userSelect: "none",
  },
};

const ChatHistory: React.FC = () => {
  /** 面板是否展开 */
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      style={{
        ...styles.container,
        width: expanded ? "25vw" : CHAT_HISTORY_TOGGLE_BAR_WIDTH,
      }}
    >
      {/* 内容区（收缩时随容器宽度动画被压缩裁剪，不瞬时卸载） */}
      <div style={styles.content}>聊天记录</div>
      {/* 右侧展开/收缩栏（点击切换，三角形旋转动画：展开朝右 / 收缩朝左） */}
      <div
        style={styles.toggleBar}
        onClick={() => setExpanded((prev) => !prev)}
        title={expanded ? "收缩聊天记录" : "展开聊天记录"}
      >
        <RoundedTriangle
          size={12}
          direction={expanded ? "right" : "left"}
        />
      </div>
    </div>
  );
};

export default ChatHistory;
