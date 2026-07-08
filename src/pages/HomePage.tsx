// PLATFORM: Group A — Win / Web / Android 平板 共用界面
// 左右分栏布局，三平台共享桌面级交互

import React from "react";
import ChatHistory from "../components/Chat/ChatHistory";
import BackgroundPanel from "../components/Live2D/BackgroundPanel";

const styles: Record<string, React.CSSProperties> = {
  // PLATFORM: Win/Web/平板 共用容器 — 横向分栏
  container: {
    display: "flex",
    flexDirection: "row",
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
  },
};

// PLATFORM: Win — 原生窗口，支持标题栏和窗口拖拽
// PLATFORM: Web  — 浏览器全屏，响应式宽度
// PLATFORM: 平板  — 触摸大屏，≥768dp 横竖屏自适应
const HomePage: React.FC = () => {
  return (
    <div style={styles.container}>
      {/* PLATFORM: Win/Web/平板 — 左侧聊天面板 */}
      <ChatHistory />
      {/* PLATFORM: Win/Web/平板 — 右侧 Live2D 背景 + 房间背景 */}
      <BackgroundPanel />
    </div>
  );
};

export default HomePage;
