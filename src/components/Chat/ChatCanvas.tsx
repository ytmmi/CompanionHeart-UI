// PLATFORM: Group A — Win / Web / Android 平板 共用组件
// 聊天画布：左侧聊天记录面板的左功能区（独立控件）
//   自定义壁纸 — wallpaper 属性可替换，默认恋爱壁纸
//   对话显示 — 头像（ChatAvatar）与气泡（ChatBubble）为独立组件：
//     助手消息靠左（头像 + 气泡），用户消息靠右（无头像，仅气泡）
//   打字机效果 — TTS 启用时最新助手消息按 revealCount（随语音进度）逐字显示；
//     TTS 禁用时完整显示
//   上下滑动 — 内容超出画布时可回看此前聊天：PC 滚轮 / 触屏手指上下滑动，
//     滑动时画布右边暂时出现滑动块（停止滑动后自动淡出）
//   顶部为独立的历史记录横条（ChatHistoryBar：展开历史对话 / 开启新对话）

import React, { useEffect, useRef, useState } from "react";
import ChatHistoryBar from "./ChatHistoryBar";
import ChatAvatar from "./ChatAvatar";
import ChatBubble from "./ChatBubble";
import { useChatStore } from "../../store/chatStore";
import defaultWallpaper from "../../assets/img/chat/wallpaper/chat_liaanai_1.png";
import assistantAvatar from "../../assets/img/chat/avatar/avatar_lianai_1.png";

/** 滑动块淡出前的停留时间（ms） */
const SCROLLBAR_HIDE_DELAY_MS = 800;
/** 滑动块最小高度（px） */
const SCROLLBAR_MIN_THUMB = 24;

interface ChatCanvasProps {
  /** 自定义壁纸地址（不传使用默认壁纸） */
  wallpaper?: string;
  /** 助手头像地址（不传使用默认头像） */
  avatar?: string;
}

const styles: Record<string, React.CSSProperties> = {
  // 画布容器 — 纵向排列：顶部历史记录横条 + 下方对话显示区（壁纸铺满整个画布）
  container: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    overflow: "hidden",
  },
  // 对话显示区外层 — 弹性填充剩余高度，纵向滚动（隐藏原生滚动条，用自定义滑动块）
  scrollArea: {
    position: "relative",
    flex: 1,
    minHeight: 0,
  },
  // 滚动容器 — 上下滑动（PC 滚轮 / 触屏手指），原生滚动条隐藏
  scroller: {
    width: "100%",
    height: "100%",
    overflowY: "auto",
    // 隐藏原生滚动条（Firefox；WebKit 由 App.css 的 .ch-hide-scrollbar 处理）
    scrollbarWidth: "none",
    boxSizing: "border-box",
  },
  // 消息列表 — 内容不足时贴底（margin-top:auto 实现，避免 flex-end 破坏滚动）
  messageList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 12,
    minHeight: "100%",
    justifyContent: "flex-end",
    boxSizing: "border-box",
  },
  // 自定义滑动块 — 滑动时在画布右边暂时出现，停止后淡出
  scrollThumb: {
    position: "absolute",
    right: 2,
    width: 5,
    borderRadius: 3,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    transition: "opacity 300ms ease",
    pointerEvents: "none",
  },
  // 助手消息行 — 靠左：头像（左）+ 气泡（右），头像与气泡上端对齐
  assistantRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: 8,
  },
  // 用户消息行 — 靠右，无头像
  userRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
};

const ChatCanvas: React.FC<ChatCanvasProps> = ({
  wallpaper = defaultWallpaper,
  avatar = assistantAvatar,
}) => {
  const messages = useChatStore((s) => s.messages);
  const newChat = useChatStore((s) => s.newChat);
  const ttsEnabled = useChatStore((s) => s.ttsEnabled);
  const revealCount = useChatStore((s) => s.revealCount);
  const phase = useChatStore((s) => s.phase);
  const syncTtsEnabled = useChatStore((s) => s.syncTtsEnabled);

  // 挂载时从后端同步 TTS 启用状态
  useEffect(() => {
    void syncTtsEnabled();
  }, [syncTtsEnabled]);

  // 最新一条助手消息的下标（TTS 启用且语音播放中时按 revealCount 打字机显示）
  const lastAssistantIdx = messages.reduce(
    (last, msg, idx) => (msg.role === "assistant" ? idx : last),
    -1,
  );

  /** 消息在画布上的显示内容（打字机效果只作用于播放中的最新助手消息） */
  const displayContent = (content: string, idx: number): string => {
    if (ttsEnabled && phase === "speaking" && idx === lastAssistantIdx) {
      return content.slice(0, revealCount);
    }
    return content;
  };

  // 新消息或打字机推进时滚动到底部（程序滚动，不触发滑动块显示；
  // 用户已向上滑动回看时不强行拉回底部）
  const listRef = useRef<HTMLDivElement>(null);
  const programmaticScrollRef = useRef(false);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const nearBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    if (nearBottom) {
      programmaticScrollRef.current = true;
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, revealCount]);

  // ── 滑动块：滑动时暂时出现在画布右边，停止后淡出 ──
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(
    null,
  );
  const [thumbVisible, setThumbVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 滚动回调：按滚动进度计算滑动块位置并显示，停止滑动后延时淡出 */
  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    // 程序滚动（自动贴底）不显示滑动块，仅用户滑动时出现
    if (programmaticScrollRef.current) {
      programmaticScrollRef.current = false;
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    // 内容未超出画布：无需滑动块
    if (scrollHeight <= clientHeight + 1) {
      setThumbVisible(false);
      return;
    }
    const height = Math.max(
      SCROLLBAR_MIN_THUMB,
      (clientHeight / scrollHeight) * clientHeight,
    );
    const maxTop = clientHeight - height;
    const top =
      (scrollTop / (scrollHeight - clientHeight)) * maxTop;
    setThumb({ top, height });
    setThumbVisible(true);
    if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setThumbVisible(false);
    }, SCROLLBAR_HIDE_DELAY_MS);
  };

  // 卸载时清理淡出定时器
  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return (
    <div
      style={{
        ...styles.container,
        backgroundImage: `url(${wallpaper})`,
      }}
    >
      {/* 顶部历史记录横条（展开历史对话 / 开启新对话） */}
      <ChatHistoryBar onNewChat={newChat} />
      {/* 对话显示区（助手：头像+气泡靠左；用户：气泡靠右无头像）
          上下滑动回看：PC 滚轮 / 触屏手指滑动，滑动时右边暂现滑动块 */}
      <div style={styles.scrollArea}>
        <div
          ref={listRef}
          className="ch-hide-scrollbar"
          style={styles.scroller}
          onScroll={handleScroll}
        >
          <div style={styles.messageList}>
            {messages.map((msg, idx) =>
              msg.role === "assistant" ? (
                <div
                  key={idx}
                  style={styles.assistantRow}
                >
                  <ChatAvatar
                    src={avatar}
                    alt="助手头像"
                  />
                  <ChatBubble>{displayContent(msg.content, idx)}</ChatBubble>
                </div>
              ) : (
                <div
                  key={idx}
                  style={styles.userRow}
                >
                  <ChatBubble>{msg.content}</ChatBubble>
                </div>
              ),
            )}
          </div>
        </div>
        {/* 滑动块（滑动时暂现，停止后淡出） */}
        {thumb && (
          <div
            style={{
              ...styles.scrollThumb,
              top: thumb.top,
              height: thumb.height,
              opacity: thumbVisible ? 1 : 0,
            }}
          />
        )}
      </div>
    </div>
  );
};

export default ChatCanvas;
