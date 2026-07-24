// PLATFORM: Group A/B 共用 — 开发全局设置界面（dev_global_settings）
// 路由：#/dev/dev_global_settings
// 功能：开发时进行全局持久化设置（localStorage，见 settingsStore）
//   板块一：通用全局设置 — TTS 开关等
//   板块二：角色设置     — Live2D 角色模型切换等

import React from "react";
import { useSettingsStore } from "../store/settingsStore";
import { useChatStore } from "../store/chatStore";
import { MODEL_REGISTRY } from "../config/live2d";

const styles: Record<string, React.CSSProperties> = {
  // 页面容器 — 竖向滚动，浅灰背景
  page: {
    width: "100vw",
    height: "100vh",
    overflowY: "auto",
    backgroundColor: "#f5f5f5",
    boxSizing: "border-box",
    padding: 24,
  },
  // 顶栏 — 标题 + 返回
  header: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  backBtn: {
    padding: "6px 14px",
    border: "1px solid #ccc",
    borderRadius: 6,
    backgroundColor: "#fff",
    fontSize: 13,
    cursor: "pointer",
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    color: "#333",
  },
  // 设置板块卡片
  section: {
    backgroundColor: "#fff",
    borderRadius: 10,
    border: "1px solid #e0e0e0",
    padding: 16,
    marginBottom: 16,
    maxWidth: 560,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#333",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: "1px solid #eee",
  },
  // 单条设置项 — 左标签右控件
  row: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 0",
  },
  rowLabel: {
    fontSize: 14,
    color: "#555",
  },
  rowHint: {
    fontSize: 12,
    color: "#aaa",
    marginTop: 2,
  },
  select: {
    padding: "6px 10px",
    border: "1px solid #ccc",
    borderRadius: 6,
    fontSize: 13,
    backgroundColor: "#fff",
    cursor: "pointer",
  },
};

/** 简易开关（受控） */
const Toggle: React.FC<{
  on: boolean;
  onChange: (on: boolean) => void;
}> = ({ on, onChange }) => (
  <div
    onClick={() => onChange(!on)}
    style={{
      width: 44,
      height: 24,
      borderRadius: 12,
      backgroundColor: on ? "#4A90D9" : "#ccc",
      position: "relative",
      cursor: "pointer",
      transition: "background-color 200ms ease",
      flexShrink: 0,
    }}
  >
    <div
      style={{
        position: "absolute",
        top: 2,
        left: on ? 22 : 2,
        width: 20,
        height: 20,
        borderRadius: "50%",
        backgroundColor: "#fff",
        transition: "left 200ms ease",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }}
    />
  </div>
);

const DevGlobalSettingsPage: React.FC = () => {
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const modelName = useSettingsStore((s) => s.modelName);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const setTtsEnabled = useChatStore((s) => s.setTtsEnabled);

  /** TTS 开关：走 chatStore（内部会写持久化设置并同步后端） */
  const handleTtsToggle = (on: boolean) => {
    void setTtsEnabled(on);
  };

  /** 角色模型切换：写持久化设置（BackgroundPanel 监听后重新加载画布） */
  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateSettings({ modelName: e.target.value });
  };

  return (
    <div style={styles.page}>
      {/* 顶栏 */}
      <div style={styles.header}>
        <button
          type="button"
          style={styles.backBtn}
          onClick={() => {
            window.location.hash = "#/";
          }}
        >
          ← 返回首页
        </button>
        <span style={styles.title}>开发全局设置</span>
      </div>

      {/* 板块一：通用全局设置 */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>通用全局设置</div>
        <div style={styles.row}>
          <div>
            <div style={styles.rowLabel}>TTS 语音合成</div>
            <div style={styles.rowHint}>
              关闭后对话仅显示文字，后端不路由 TTS
            </div>
          </div>
          <Toggle
            on={ttsEnabled}
            onChange={handleTtsToggle}
          />
        </div>
      </div>

      {/* 板块二：角色设置 */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>角色设置</div>
        <div style={styles.row}>
          <div>
            <div style={styles.rowLabel}>角色模型</div>
            <div style={styles.rowHint}>
              切换 Live2D 角色模型（备选模型仅开发环境可用）
            </div>
          </div>
          <select
            style={styles.select}
            value={modelName}
            onChange={handleModelChange}
          >
            {Object.keys(MODEL_REGISTRY).map((name) => (
              <option
                key={name}
                value={name}
              >
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default DevGlobalSettingsPage;
