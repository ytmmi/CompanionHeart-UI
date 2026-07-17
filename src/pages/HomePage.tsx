// PLATFORM: Group A — Win / Web / Android 平板 共用界面
// 左右分栏布局，三平台共享桌面级交互

import React, { useState } from "react";
import ChatHistory from "../components/Chat/ChatHistory";
import ChatContainer, {
  CHAT_TOGGLE_BAR_HEIGHT,
} from "../components/Chat/ChatContainer";
import BackgroundPanel from "../components/Live2D/BackgroundPanel";
import PullCord, {
  PULL_CORD_ASPECT_RATIO,
} from "../components/Common/PullCord";

/** 拉绳控件宽度（px） */
const PULL_CORD_WIDTH = 64;

const styles: Record<string, React.CSSProperties> = {
  // PLATFORM: Win/Web/平板 共用容器 — 横向分栏
  container: {
    display: "flex",
    flexDirection: "row",
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
    position: "relative",
  },
  // 右分栏 — 纵向排列：上方 Live2D 背景（5/6）+ 下方聊天框（1/6）
  rightPanel: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  // 聊天框区域 — 宽度跟随右分栏；展开时高度 1/6，收缩时仅剩顶栏
  chatArea: {
    flexShrink: 0,
    transition: "height 250ms ease",
  },
  // 拉绳 — 悬挂在界面右侧：中心距右边 1/10 视宽，从上往下 1/3 处对齐界面顶端
  pullCord: {
    position: "absolute",
    top: -(PULL_CORD_WIDTH * PULL_CORD_ASPECT_RATIO) / 3,
    right: `calc(10vw - ${PULL_CORD_WIDTH / 2}px)`,
    zIndex: 10,
  },
};

// PLATFORM: Win — 原生窗口，支持标题栏和窗口拖拽
// PLATFORM: Web  — 浏览器全屏，响应式宽度
// PLATFORM: 平板  — 触摸大屏，≥768dp 横竖屏自适应
const HomePage: React.FC = () => {
  /** 底部聊天框是否展开 */
  const [chatExpanded, setChatExpanded] = useState(true);

  return (
    <div style={styles.container}>
      {/* PLATFORM: Win/Web/平板 — 左侧聊天面板 */}
      <ChatHistory />
      {/* PLATFORM: Win/Web/平板 — 右分栏：Live2D 背景 + 底部聊天框 */}
      <div style={styles.rightPanel}>
        <BackgroundPanel />
        <div
          style={{
            ...styles.chatArea,
            height: chatExpanded
              ? "calc(100% / 6)"
              : CHAT_TOGGLE_BAR_HEIGHT,
          }}
        >
          <ChatContainer
            expanded={chatExpanded}
            onToggleExpand={setChatExpanded}
          />
        </div>
      </div>
      {/* 拉绳（悬挂在界面右侧，单击/双击功能待接入） */}
      <PullCord
        width={PULL_CORD_WIDTH}
        style={styles.pullCord}
      />
    </div>
  );
};

export default HomePage;
