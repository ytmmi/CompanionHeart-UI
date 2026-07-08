/** Live2D 模型相关类型定义 */

// ─── 基础类型 ────────────────────────────────────────

/** 表情预设 */
export interface Live2DExpression {
  name: string;
  file: string;
}

/** 动作动画 */
export interface Live2DMotion {
  name: string;
  file: string;
}

/** 情感映射（语义化情感名称 → 表情文件） */
export type EmotionMap = Record<string, string>;

// ─── 模型配置 ────────────────────────────────────────

/**
 * Live2D 模型信息配置
 *
 * 参考 Open-LLM-VTuber 的 ModelInfo 设计，支持可配置的路径、缩放、偏移和表情映射。
 * 当 model3.json 中未定义 Expressions/Motions 时，可通过 expressionFiles/motionFiles
 * 显式指定，适用于 VTube Studio 导出的模型（表情/动作在独立文件中）。
 */
export interface ModelInfo {
  /** 模型名称 */
  name?: string;
  /** 模型设置文件 URL（相对于 public 目录） */
  url: string;
  /** 缩放因子（默认 1.0） */
  kScale?: number;
  /**
   * 模型适配模式（默认 "contain"）：
   * - "contain": 完整可见不裁剪，取较小缩放比（min），窄模型两侧留白
   * - "cover":  填满容器可能裁剪，取较大缩放比（max），确保容器无空白
   */
  fitMode?: "contain" | "cover";
  /** 初始 X 偏移（像素，默认 0） */
  initialXshift?: number;
  /** 初始 Y 偏移（像素，默认 0） */
  initialYshift?: number;
  /** 空闲动作组名称（默认 "Idle"） */
  idleMotionGroupName?: string;
  /** 默认表情索引或名称 */
  defaultEmotion?: number | string;
  /** 情感名称 → 表情文件映射 */
  emotionMap?: EmotionMap;
  /** 是否启用鼠标交互（默认 true） */
  pointerInteractive?: boolean;
  /** 是否启用滚轮缩放模型（默认 false） */
  scrollToResize?: boolean;
  /** 点击区域 → 动作映射 */
  tapMotions?: Record<string, string>;
  /**
   * 显式表情文件列表（当 model3.json 未定义 Expressions 时使用）。
   * 每个条目为相对于模型目录的 .exp3.json 文件路径。
   * 例如: ["EXP3/星星眼.exp3.json", "EXP3/爱心眼.exp3.json"]
   */
  expressionFiles?: string[];
  /**
   * 显式动作文件列表（当 model3.json 未定义 Motions 时使用）。
   * 每个条目为 { group: 动作组名, file: 相对于模型目录的 .motion3.json 文件路径 }
   */
  motionFiles?: { group: string; file: string }[];
}

// ─── 控制器接口 ──────────────────────────────────────

/** Live2D 控制器接口 */
export interface Live2DControllerAPI {
  /** 切换表情预设 */
  setExpression(name: string): void;
  /** 播放动作动画 */
  setMotion(name: string): void;
  /** 直接设置模型参数（持久覆盖，每帧应用） */
  setParameter(id: string, value: number): void;
  /** 清除参数覆盖（恢复默认行为） */
  clearParameter(id: string): void;
  /** 清除所有参数覆盖 */
  clearAllParameters(): void;
  /** 获取模型参数值 */
  getParameter(id: string): number | undefined;
  /** 设置视线焦点（鼠标追踪） */
  focus(x: number, y: number): void;
  /** 设置口型（TTS 同步用） */
  setMouthOpen(value: number): void;
  /** 销毁控制器 */
  destroy(): void;

  // ── 只读状态（用于 Hook 就绪检测） ──
  /** 控制器是否已绑定到模型实例 */
  readonly isBound: boolean;
  /** 模型可用表情列表 */
  readonly expressionList: Live2DExpression[];
  /** 模型可用动作列表 */
  readonly motionList: Live2DMotion[];
}

// ─── 组件 Props ──────────────────────────────────────

/** Live2D 组件 Props */
export interface Live2DCanvasProps {
  /** 画布宽度（支持 CSS 值如 "100%" 或像素值） */
  width?: string | number;
  /** 画布高度（支持 CSS 值如 "100%" 或像素值） */
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
  /** 控制器引用（从组件内部暴露控制器实例给父组件） */
  controllerRef?: React.MutableRefObject<Live2DControllerAPI | null>;
  /** 模型配置（覆盖默认 MODEL_PATH） */
  modelInfo?: ModelInfo;
  /** 控制器就绪回调（替代轮询，当控制器完成绑定后触发） */
  onControllerReady?: (ctrl: Live2DControllerAPI) => void;
  /** 是否显示模型监听范围（开发调试用，绿色半透明矩形） */
  showHitArea?: boolean;
}
