// PLATFORM: Group A — Win / Web / Android 平板 共用组件
// 聊天框父容器：纵向三层布局
//   第一层：展开/收缩栏（点击三角形切换）
//   第二层：占位层（空）
//   第三层：输入控件层（输入框、发送等，内部从左到右排列）
//     └ 左侧控件列：话筒（上）+ 更多（下），纵向排列
// 本组件只负责布局骨架，不含业务逻辑

import React, { useState } from "react";
import RoundedTriangle from "../Common/RoundedTriangle";
import MicButton from "./MicButton";
import MoreButton from "./MoreButton";

/** 顶部展开/收缩栏高度（px），供使用方计算收缩后的容器高度 */
export const CHAT_TOGGLE_BAR_HEIGHT = 15;

interface ChatContainerProps {
  /** 是否展开（受控模式；不传则组件内部管理） */
  expanded?: boolean;
  /** 展开/收缩切换回调（点击顶部三角形时触发，参数为切换后的状态） */
  onToggleExpand?: (expanded: boolean) => void;
}

const styles: Record<string, React.CSSProperties> = {
  // 父容器 — 填充父级给定的区域，纵向排列（尺寸由使用方控制）
  container: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    backgroundColor: "#F3F3F3",
    overflow: "hidden",
  },
  // 第一层：展开/收缩栏 — 宽度跟随容器，固定 15px 高，三角形居中，仅底部描边
  toggleBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: CHAT_TOGGLE_BAR_HEIGHT,
    flexShrink: 0,
    borderBottom: "1px solid #e0e0e0",
    boxSizing: "border-box",
    cursor: "pointer",
    userSelect: "none",
  },
  // 第二层：占位层 — 暂时高度为 0（后续放内容时再调整）
  spacer: {
    height: 0,
    flexShrink: 0,
    overflow: "hidden",
  },
  // 第三层：输入控件层 — 弹性填充剩余空间，内部从左到右排列
  inputBar: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    flex: 1,
    minHeight: 0,
  },
  // 输入层左侧控件列 — 从上到下排列：话筒（上）+ 更多（下），在第三层内垂直居中
  leftControls: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: 4,
    padding: 4,
    flexShrink: 0,
  },
  // 输入框 — 圆角无描边，外边距 5px（下 10px），弹性填充剩余空间（暂无实际功能）
  input: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    margin: "5px 5px 10px 5px",
    padding: "6px 10px",
    border: "none",
    borderRadius: 8,
    outline: "none",
    resize: "none",
    fontSize: 13,
    fontFamily: "inherit",
    backgroundColor: "#fff",
    boxSizing: "border-box",
  },
  // 发送按钮 — 长方形宽高比 21:10（缩放 2/3），圆角，底部与输入框底部对齐（暂无实际功能）
  sendBtn: {
    alignSelf: "flex-end",
    width: 50.4,
    height: 24,
    margin: "0 10px 10px 5px",
    padding: 0,
    border: "none",
    borderRadius: 4,
    backgroundColor: "#E8E8E8",
    color: "#999999",
    fontSize: 13,
    fontFamily: "inherit",
    cursor: "pointer",
    flexShrink: 0,
  },
};

const ChatContainer: React.FC<ChatContainerProps> = ({
  expanded,
  onToggleExpand,
}) => {
  // 非受控模式下的内部展开状态
  const [innerExpanded, setInnerExpanded] = useState(true);
  const isExpanded = expanded ?? innerExpanded;

  /** 话筒开关（仅 UI 状态切换，实际功能待开发） */
  const [micOn, setMicOn] = useState(false);

  const handleToggle = () => {
    const next = !isExpanded;
    if (expanded === undefined) setInnerExpanded(next);
    onToggleExpand?.(next);
  };

  return (
    <div style={styles.container}>
      {/* 第一层：展开/收缩栏（点击切换，三角形旋转动画：展开朝上 / 收缩朝下） */}
      <div
        style={styles.toggleBar}
        onClick={handleToggle}
        title={isExpanded ? "收缩聊天框" : "展开聊天框"}
      >
        <RoundedTriangle
          size={12}
          direction={isExpanded ? "up" : "down"}
        />
      </div>
      {/* 第二层：占位层 */}
      <div style={styles.spacer} />
      {/* 第三层：输入控件层（输入框、发送等，从左到右排列） */}
      <div style={styles.inputBar}>
        {/* 左侧控件列：话筒（上）+ 更多（下） */}
        <div style={styles.leftControls}>
          <MicButton
            on={micOn}
            onToggle={setMicOn}
          />
          <MoreButton />
        </div>
        {/* 输入框（暂无实际功能） */}
        <textarea
          style={styles.input}
          placeholder="输入消息..."
        />
        {/* 发送按钮（暂无实际功能） */}
        <button
          type="button"
          style={styles.sendBtn}
        >
          发送
        </button>
      </div>
    </div>
  );
};

export default ChatContainer;
