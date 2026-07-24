/**
 * settingsStore — 开发全局持久化设置（localStorage）
 *
 * 由 dev_global_settings 界面（#/dev/dev_global_settings）读写：
 *   通用全局设置 — TTS 开关等
 *   角色设置     — Live2D 角色模型切换等
 *
 * 所有设置写入 localStorage（键名 __CH_GLOBAL_SETTINGS__），应用启动时恢复。
 */

import { create } from "zustand";

/** localStorage 键名 */
const LS_KEY = "__CH_GLOBAL_SETTINGS__";

/** 持久化的设置内容 */
export interface GlobalSettings {
  /** 通用：TTS 是否启用 */
  ttsEnabled: boolean;
  /** 角色：当前 Live2D 模型名（对应 config/live2d/ 下的模型配置） */
  modelName: string;
}

/** 默认设置 */
const DEFAULT_SETTINGS: GlobalSettings = {
  ttsEnabled: true,
  modelName: "akari",
};

/** 从 localStorage 读取设置（缺失/损坏时回退默认值） */
function loadSettings(): GlobalSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GlobalSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** 写入 localStorage（失败仅告警，不影响内存状态） */
function saveSettings(settings: GlobalSettings): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn("[settingsStore] 设置持久化失败:", err);
  }
}

export interface SettingsState extends GlobalSettings {
  /** 更新部分设置并持久化 */
  updateSettings: (patch: Partial<GlobalSettings>) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadSettings(),

  updateSettings: (patch: Partial<GlobalSettings>) => {
    set(patch);
    const { ttsEnabled, modelName } = get();
    saveSettings({ ttsEnabled, modelName });
  },
}));
