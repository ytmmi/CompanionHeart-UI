/**
 * NativeLive2DController — 基于原生 Cubism SDK 的 Live2D 控制器
 *
 * 替代原有的 pixi-live2d-display 版本 Live2DController。
 * 通过 LAppAdapter 封装 Cubism SDK 的模型操作，提供统一的控制器接口。
 *
 * 参考 Open-LLM-VTuber 的 LAppAdapter 架构：
 * - 表情切换：通过 Cubism SDK 的 ExpressionManager
 * - 动作播放：通过 Cubism SDK 的 MotionManager
 * - 口型同步：通过 LipSync 参数注入
 * - 视线追踪：通过 DragManager 参数注入
 */

import { LAppLive2DManager } from "../../cubism-sdk/src/lapplive2dmanager";
import type { LAppModel } from "../../cubism-sdk/src/lappmodel";
import type {
  Live2DControllerAPI,
  Live2DExpression,
  Live2DMotion,
  ModelInfo,
} from "../../types/live2d";

/**
 * NativeLive2DController — 原生 Cubism SDK 控制器实现
 *
 * 用法：
 * ```ts
 * const ctrl = new NativeLive2DController();
 * // 等待模型加载完成后绑定
 * ctrl.bind();
 * ctrl.setExpression("happy");
 * ctrl.setMotion("TapBody");
 * ctrl.setMouthOpen(0.5);
 * ctrl.destroy();
 * ```
 */
export class NativeLive2DController implements Live2DControllerAPI {
  private _isBound = false;
  private _destroyed = false;
  private _mouthOpenValue = 0;
  private _expressionList: Live2DExpression[] = [];
  private _motionList: Live2DMotion[] = [];
  private _activeExpression = "";

  /** 控制器是否已绑定到模型实例 */
  get isBound(): boolean {
    return this._isBound && !this._destroyed;
  }

  /** 模型可用表情列表 */
  get expressionList(): Live2DExpression[] {
    return this._destroyed ? [] : this._expressionList;
  }

  /** 模型可用动作列表 */
  get motionList(): Live2DMotion[] {
    return this._destroyed ? [] : this._motionList;
  }

  /**
   * 绑定到已初始化的 Live2D 模型
   *
   * 在 initNativeLive2D() 完成后调用，从 SDK 中提取表情和动作列表。
   * @param config 可选的模型配置，用于补充 model3.json 未定义的表情/动作文件
   */
  bind(config?: ModelInfo): void {
    if (this._destroyed) {
      console.warn("[NativeLive2DController] 控制器已销毁，无法绑定");
      return;
    }
    if (this._isBound) {
      console.warn("[NativeLive2DController] 已经绑定，请先 destroy()");
      return;
    }

    this._isBound = true;
    this._initExpressions(config);
    this._initMotions(config);

    console.log(
      `[NativeLive2DController] 绑定完成: ${this._expressionList.length} 表情, ${this._motionList.length} 动作`,
    );
  }

  /**
   * 切换表情预设（开关模式）
   *
   * 优先从模型 _expressions 映射查找；若不存在则从 config.expressionFiles
   * fetch 并加载到模型后应用（VTS 模型兼容）。
   */
  setExpression(name: string): void {
    if (this._destroyed) return;
    const model = this._getModel();
    if (!model) return;

    // 同一个表情 → 清除
    if (this._activeExpression === name) {
      try {
        model.setExpression("");
      } catch {
        /* ignore */
      }
      this._activeExpression = "";
      return;
    }

    // 先尝试模型内部映射
    const expressions = (model as any)._expressions;
    if (expressions?.getValue?.(name)) {
      try {
        model.setExpression(name);
        this._activeExpression = name;
      } catch (e) {
        console.warn(`[NativeLive2DController] 表情 '${name}' 应用失败:`, e);
      }
      return;
    }

    // 🆕 兜底：从 _expressionList 查找文件路径，fetch 后注入模型并应用
    const entry = this._expressionList.find((e) => e.name === name);
    if (!entry) {
      console.warn(`[NativeLive2DController] 表情 '${name}' 不存在`);
      return;
    }

    const modelHomeDir = (model as any)._modelHomeDir ?? "";
    const fullPath = modelHomeDir + entry.file;
    console.log(`[NativeLive2DController] 异步加载表情 '${name}': ${fullPath}`);

    fetch(fullPath)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (this._destroyed || (model as any)._disposed) return;
        try {
          const motion = (model as any).loadExpression?.(
            buf,
            buf.byteLength,
            name,
          );
          if (motion && expressions) {
            expressions.setValue(name, motion);
            model.setExpression(name);
            this._activeExpression = name;
            console.log(
              `[NativeLive2DController] ✅ 表情 '${name}' 已加载并应用`,
            );
          }
        } catch (e) {
          console.warn(`[NativeLive2DController] 表情 '${name}' 加载失败:`, e);
        }
      })
      .catch((e) => {
        console.warn(
          `[NativeLive2DController] 表情文件 fetch 失败: ${fullPath}`,
          e,
        );
      });
  }

  /**
   * 播放动作动画
   * @param name 动作组名称（如 "TapBody"、"Idle_2"）
   *
   * 优先从 model3.json 定义的动作组播放；若不存在则从 config.motionFiles
   * 异步加载 .motion3.json 到模型的 _motions 映射后播放（VTS 模型兼容）。
   */
  setMotion(name: string): void {
    if (this._destroyed) return;
    const model = this._getModel();
    if (!model) return;

    // 路径 1：model3.json 有定义的动作组
    try {
      const modelSetting = (model as any)._modelSetting;
      if (modelSetting?.getMotionCount?.(name) > 0) {
        model.startRandomMotion(name, 2);
        return;
      }
    } catch {
      /* ignore */
    }

    // 路径 2：VTS 模型 — 从 motionList 查找文件，fetch 加载后播放
    const entry = this._motionList.find((m) => m.name === name);
    if (!entry) {
      console.warn(`[NativeLive2DController] 动作组 '${name}' 不存在`);
      return;
    }

    // 检查是否已加载到 _motions 映射
    const motions = (model as any)._motions;
    const motionKey = `${name}_0`;
    if (motions?.getValue?.(motionKey)) {
      try {
        model.startMotion(name, 0, 2);
        return;
      } catch (e) {
        console.warn(`[NativeLive2DController] 动作 '${name}' 播放失败:`, e);
        return;
      }
    }

    // 异步加载动作文件
    const modelHomeDir = (model as any)._modelHomeDir ?? "";
    const fullPath = modelHomeDir + entry.file;
    console.log(`[NativeLive2DController] 异步加载动作 '${name}': ${fullPath}`);

    fetch(fullPath)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (this._destroyed || (model as any)._disposed) return;
        try {
          const motion = (model as any).loadMotion?.(
            buf,
            buf.byteLength,
            motionKey,
          );
          if (motion) {
            // 设置渐变时间和效果 ID（与 preLoadMotionGroup 一致）
            motion.setFadeInTime(0.5);
            motion.setFadeOutTime(0.5);
            const eyeBlinkIds = (model as any)._eyeBlinkIds;
            const lipSyncIds = (model as any)._lipSyncIds;
            if (eyeBlinkIds && lipSyncIds) {
              motion.setEffectIds(eyeBlinkIds, lipSyncIds);
            }
            if (motions) {
              motions.setValue(motionKey, motion);
            }
            model.startMotion(name, 0, 2);
            console.log(
              `[NativeLive2DController] ✅ 动作 '${name}' 已加载并播放`,
            );
          }
        } catch (e) {
          console.warn(`[NativeLive2DController] 动作 '${name}' 加载失败:`, e);
        }
      })
      .catch((e) => {
        console.warn(
          `[NativeLive2DController] 动作文件 fetch 失败: ${fullPath}`,
          e,
        );
      });
  }

  /**
   * 设置口型开合度（用于 TTS 唇形同步）
   * @param value 0.0（闭）~ 1.0（全开）
   */
  setMouthOpen(value: number): void {
    if (this._destroyed) return;
    this._mouthOpenValue = Math.max(0, Math.min(1, value));

    const model = this._getModel();
    if (!model) return;

    try {
      const cubismModel = (model as any)._model;
      if (!cubismModel) return;

      // 🆕 修复：CubismModel 没有 getParameterIds() 方法，
      //   改用 _parameterIds（TypeScript private 字段，运行时可访问）+ 字符串匹配
      const paramIds: any[] = cubismModel._parameterIds;
      const paramCount: number = cubismModel.getParameterCount?.() ?? 0;
      if (!paramIds || paramCount === 0) return;

      for (let i = 0; i < paramCount; i++) {
        const pid = paramIds[i];
        if (pid?.getString?.() === "ParamMouthOpenY") {
          cubismModel.setParameterValueByIndex(i, this._mouthOpenValue);
          break;
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * 设置视线焦点（鼠标追踪）
   * @param x 视口 X 坐标（-1 ~ 1）
   * @param y 视口 Y 坐标（-1 ~ 1）
   */
  focus(x: number, y: number): void {
    if (this._destroyed) return;
    const manager = LAppLive2DManager.getInstance();
    if (manager) {
      manager.onDrag(x, y);
    }
  }

  /**
   * 直接设置模型参数值（持久覆盖，每帧应用）
   * @param id 参数 ID（如 "ParamMouthOpenY"）
   * @param value 参数值
   */
  setParameter(id: string, value: number): void {
    if (this._destroyed) return;
    const manager = LAppLive2DManager.getInstance();
    if (manager) {
      manager.setParamOverride(id, value);
    }
  }

  /**
   * 清除参数覆盖（恢复模型默认行为）
   * @param id 参数 ID
   */
  clearParameter(id: string): void {
    if (this._destroyed) return;
    const manager = LAppLive2DManager.getInstance();
    if (manager) {
      manager.clearParamOverride(id);
    }
  }

  /** 清除所有参数覆盖 */
  clearAllParameters(): void {
    if (this._destroyed) return;
    const manager = LAppLive2DManager.getInstance();
    if (manager) {
      manager.clearAllParamOverrides();
    }
  }

  /**
   * 获取模型参数值
   * @param id 参数 ID
   */
  getParameter(id: string): number | undefined {
    if (this._destroyed) return undefined;
    const model = this._getModel();
    if (!model) return undefined;

    try {
      const cubismModel = (model as any)._model;
      if (!cubismModel) return undefined;

      // 🆕 修复：CubismModel 没有 getParameterIds() 方法，
      //   改用 _parameterIds + 字符串匹配查找参数索引
      const paramIds: any[] = cubismModel._parameterIds;
      const paramCount: number = cubismModel.getParameterCount?.() ?? 0;
      if (!paramIds || paramCount === 0) return undefined;

      for (let i = 0; i < paramCount; i++) {
        if (paramIds[i]?.getString?.() === id) {
          return cubismModel.getParameterValueByIndex(i) as number;
        }
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  /**
   * 销毁控制器，清理所有资源（幂等，可安全重复调用）
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    // 标记解绑
    this._isBound = false;

    // 清空所有缓存集合
    this._expressionList.length = 0;
    this._motionList.length = 0;

    // 清空状态值
    this._mouthOpenValue = 0;
    this._activeExpression = "";
  }

  // ─── 内部方法 ───────────────────────────────────────────

  /** 获取当前模型实例 */
  private _getModel(): LAppModel | null {
    const manager = LAppLive2DManager.getInstance();
    return manager?.getModel(0) ?? null;
  }

  /** 初始化表情列表（从 model3.json 或 config.expressionFiles） */
  private _initExpressions(config?: ModelInfo): void {
    const model = this._getModel();
    if (!model?._modelSetting) return;

    this._expressionList = [];

    // 优先从 model3.json 读取
    const count = model._modelSetting.getExpressionCount();
    for (let i = 0; i < count; i++) {
      const name = model._modelSetting.getExpressionName(i);
      const file = model._modelSetting.getExpressionFileName(i);
      if (name && file) {
        this._expressionList.push({ name, file });
      }
    }

    // 🆕 VTS 兼容：model3.json 未定义表情时，从 config.expressionFiles 补充
    if (this._expressionList.length === 0 && config?.expressionFiles?.length) {
      for (const filePath of config.expressionFiles) {
        // 从文件路径提取名称："expressions/EyesCry.exp3.json" → "EyesCry"
        const fileName = filePath.split("/").pop() ?? filePath;
        const name = fileName.replace(/\.exp3\.json$/i, "");
        this._expressionList.push({ name, file: filePath });
      }
      console.log(
        `[NativeLive2DController] 从 config.expressionFiles 加载 ${this._expressionList.length} 个表情`,
      );
    }
  }

  /** 初始化动作列表（从 model3.json 或 config.motionFiles） */
  private _initMotions(config?: ModelInfo): void {
    const model = this._getModel();
    if (!model?._modelSetting) return;

    this._motionList = [];

    // 优先从 model3.json 读取
    const groupCount = model._modelSetting.getMotionGroupCount();
    for (let i = 0; i < groupCount; i++) {
      const group = model._modelSetting.getMotionGroupName(i);
      const count = model._modelSetting.getMotionCount(group);
      for (let j = 0; j < count; j++) {
        const file = model._modelSetting.getMotionFileName(group, j);
        this._motionList.push({ name: group, file });
      }
    }

    // 🆕 VTS 兼容：model3.json 未定义动作时，从 config.motionFiles 补充
    if (this._motionList.length === 0 && config?.motionFiles?.length) {
      for (const { group, file } of config.motionFiles) {
        this._motionList.push({ name: group, file });
      }
      console.log(
        `[NativeLive2DController] 从 config.motionFiles 加载 ${this._motionList.length} 个动作`,
      );
    }

    // 🆕 VTS 兼容：model3.json 未定义动作且无 motionFiles 时，扫描 animations/ 目录
    if (this._motionList.length === 0 && config?.idleMotionGroupName) {
      // 至少把 idleMotionGroupName 加入列表供测试面板使用
      this._motionList.push({
        name: config.idleMotionGroupName,
        file: `animations/${config.idleMotionGroupName}.motion3.json`,
      });
    }
  }
}
