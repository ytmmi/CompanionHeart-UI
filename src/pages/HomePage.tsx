// PLATFORM: Group A — Win / Web / Android 平板 共用界面
// 左右分栏布局，三平台共享桌面级交互

import React, { useState } from "react";
import ChatHistory from "../components/Chat/ChatHistory";
import ChatContainer, {
  CHAT_TOGGLE_BAR_HEIGHT,
} from "../components/Chat/ChatContainer";
import Live2DShowcase from "../components/Live2D/Live2DShowcase";
import { playCurtainTransition } from "../components/Common/CurtainTransition";

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
  // 右分栏 — 纵向排列：上方 live2d展示（5/6）+ 下方聊天框（1/6）
  rightPanel: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  // live2d展示区域 — 占据聊天框以外的剩余高度
  showcaseArea: {
    flex: 1,
    minHeight: 0,
  },
  // 聊天框区域 — 宽度跟随右分栏；展开时高度 1/6，收缩时仅剩顶栏
  chatArea: {
    flexShrink: 0,
    transition: "height 250ms ease",
  },
};

// PLATFORM: Win — 原生窗口，支持标题栏和窗口拖拽
// PLATFORM: Web  — 浏览器全屏，响应式宽度
// PLATFORM: 平板  — 触摸大屏，≥768dp 横竖屏自适应
const HomePage: React.FC = () => {
  /** 底部聊天框是否展开 */
  const [chatExpanded, setChatExpanded] = useState(true);

  /** 单击默认状态（pullRope-1）拉绳 → 窗帘过渡跳转菜单界面 */
  const handleCordClickPrimary = () => {
    playCurtainTransition(() => {
      window.location.hash = "#/menu";
    });
  };

  return (
    <div style={styles.container}>
      {/* PLATFORM: Win/Web/平板 — 左侧聊天面板 */}
      <ChatHistory />
      {/* PLATFORM: Win/Web/平板 — 右分栏：live2d展示 + 底部聊天框 */}
      <div style={styles.rightPanel}>
        {/* live2d展示（背景 + Live2D + 拉绳，独立可复用控件） */}
        <div style={styles.showcaseArea}>
          <Live2DShowcase onCordClickPrimary={handleCordClickPrimary} />
        </div>
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
    </div>
  );
};

export default HomePage;
