// PLATFORM: Group A — Win / Web / Android 平板 共用组件
// 左侧聊天记录面板：左功能区（聊天画布）+ 右侧展开/收缩栏（点击三角形切换）

import React, { useState } from "react";
import RoundedTriangle from "../Common/RoundedTriangle";
import ChatCanvas from "./ChatCanvas";

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
  // 左功能区（聊天画布）— 弹性填充（收缩动画期间被压缩裁剪，不参与瞬时卸载）
  content: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  // 右侧展开/收缩栏 — 宽 15px，高与容器一致，始终贴容器右边，三角形居中
  // 白色背景 + 右侧 1px 黑色描边
  toggleBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: CHAT_HISTORY_TOGGLE_BAR_WIDTH,
    height: "100%",
    flexShrink: 0,
    marginLeft: "auto",
    backgroundColor: "#fff",
    borderRight: "1px solid #000",
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
      {/* 左功能区：聊天画布（收缩时随容器宽度动画被压缩裁剪，不瞬时卸载） */}
      <div style={styles.content}>
        <ChatCanvas />
      </div>
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
