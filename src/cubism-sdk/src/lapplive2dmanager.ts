// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismMatrix44 } from "@framework/math/cubismmatrix44";
import { ACubismMotion } from "@framework/motion/acubismmotion";
import { csmVector } from "@framework/type/csmvector";

import * as LAppDefine from "./lappdefine";
import { canvas } from "./lappglmanager";
import { LAppModel } from "./lappmodel";
import { LAppPal } from "./lapppal";

export let s_instance: LAppLive2DManager | null | undefined = null;

/**
 * サンプルアプリケーションにおいてCubismModelを管理するクラス
 * モデル生成と破棄、タップイベントの処理、モデル切り替えを行う。
 *
 * 在示例应用程序中管理CubismModel的类
 * 执行模型生成和销毁、触摸事件处理、模型切换。
 */
export class LAppLive2DManager {
  /**
   * クラスのインスタンス（シングルトン）を返す。
   * インスタンスが生成されていない場合は内部でインスタンスを生成する。
   *
   * 返回类的实例（单例）。
   * 如果尚未创建实例，则在内部创建实例。
   *
   * @return クラスのインスタンス
   */
  public static getInstance(): LAppLive2DManager {
    if (s_instance == null) {
      s_instance = new LAppLive2DManager();
    }

    return s_instance;
  }

  /**
   * クラスのインスタンス（シングルトン）を解放する。
   *
   * 释放类的实例（单例）。
   * 先释放所有模型资源，再清空单例引用。
   * 幂等操作，可安全重复调用。
   */
  public static releaseInstance(): void {
    if (s_instance != null) {
      try {
        // 先释放所有模型（包括 WebGL 资源），再置空引用
        s_instance.releaseAllModel();
      } catch (e) {
        console.warn("[LAppLive2DManager] releaseAllModel 异常:", e);
      }
      s_instance = void 0;
    }

    s_instance = null;
  }

  /**
   * 現在のシーンで保持しているモデルを返す。
   *
   * @param no モデルリストのインデックス値
   * @return モデルのインスタンスを返す。インデックス値が範囲外の場合はNULLを返す。
   */
  public getModel(no: number): LAppModel | null {
    if (no < this._models.getSize()) {
      return this._models.at(no);
    }

    return null;
  }

  /**
   * 現在のシーンで保持しているすべてのモデルを解放する
   */
  public releaseAllModel(): void {
    for (let i = 0; i < this._models.getSize(); i++) {
      const model = this._models.at(i);
      if (model) {
        model.release();
      }
      this._models.set(i, null);
    }
    this._models.clear();
  }

  /**
   * 画面をドラッグした時の処理
   *
   * 当拖动屏幕时的处理
   *
   * @param x 画面のX座標
   * @param y 画面のY座標
   */
  public onDrag(x: number, y: number): void {
    for (let i = 0; i < this._models.getSize(); i++) {
      const model: LAppModel = this.getModel(i)!;

      if (model) {
        model.setDragging(x, y);
      }
    }
  }

  /**
   * 画面をタップした時の処理
   *
   * @param x 画面のX座標
   * @param y 画面のY座標
   */
  public onTap(x: number, y: number): void {
    if (LAppDefine.DebugLogEnable) {
      LAppPal.printMessage(
        `[APP]tap point: {x: ${x.toFixed(2)} y: ${y.toFixed(2)}}`,
      );
    }

    for (let i = 0; i < this._models.getSize(); i++) {
      const model = this._models.at(i);
      if (!model) continue;

      if (model.hitTest(LAppDefine.HitAreaNameHead, x, y)) {
        if (LAppDefine.DebugLogEnable) {
          LAppPal.printMessage(
            `[APP]hit area: [${LAppDefine.HitAreaNameHead}]`,
          );
        }
        model.setRandomExpression();
      } else if (model.hitTest(LAppDefine.HitAreaNameBody, x, y)) {
        if (LAppDefine.DebugLogEnable) {
          LAppPal.printMessage(
            `[APP]hit area: [${LAppDefine.HitAreaNameBody}]`,
          );
        }
        model.startRandomMotion(
          LAppDefine.MotionGroupTapBody,
          LAppDefine.PriorityNormal,
          this._finishedMotion,
        );
      }
    }
  }

  /**
   * 🆕 参数覆盖映射（UI 滑块设置的参数，每帧在 update 后、draw 前应用）
   * 键：参数 ID（如 "ParamAngleX"），值：目标覆盖值
   */
  private _paramOverrides: Map<string, number> = new Map();

  /**
   * 🆕 参数当前插值值（用于平滑过渡）
   * 键：参数 ID，值：当前插值后的值
   */
  private _paramCurrentValues: Map<string, number> = new Map();

  /** 🆕 参数过渡速度（0~1，越大越快，1 = 无过渡） */
  private _paramLerpSpeed = 0.15;

  /** 🔍 是否已打印参数 info（每会话仅打印一次） */
  private _loggedParamInfo = false;

  /**
   * 🆕 参数原始值备份（首次覆盖前保存），用于重置时恢复 _savedParameters。
   * 键：参数名，值：首次覆盖前 _parameterValues 中的值。
   */
  private _paramOriginalValues: Map<string, number> = new Map();

  /**
   * 设置参数覆盖（持久生效，每帧平滑过渡到目标值）
   * @param id 参数 ID
   * @param value 目标值
   */
  public setParamOverride(id: string, value: number): void {
    this._paramOverrides.set(id, value);
    // 首次设置时直接到达目标值（无过渡），后续变化才有过渡
    if (!this._paramCurrentValues.has(id)) {
      this._paramCurrentValues.set(id, value);
    }
    // 记录原始值（仅首次）
    if (!this._paramOriginalValues.has(id)) {
      const model = this.getModel(0) as any;
      const cubismModel = model?._model;
      if (cubismModel) {
        const rawIds: string[] | null =
          cubismModel._model?.parameters?.ids ?? null;
        const rawValues: Float32Array | null =
          cubismModel._model?.parameters?.values ?? null;
        if (rawIds && rawValues) {
          const idx = rawIds.indexOf(id);
          if (idx >= 0) {
            this._paramOriginalValues.set(id, rawValues[idx]);
          }
        }
      }
    }
  }

  /**
   * 清除参数覆盖（恢复模型默认行为）
   * @param id 参数 ID
   */
  public clearParamOverride(id: string): void {
    // 从 _savedParameters 中恢复原始值
    this._restoreOriginalParam(id);
    this._paramOverrides.delete(id);
    this._paramCurrentValues.delete(id);
    this._paramOriginalValues.delete(id);
  }

  /** 清除所有参数覆盖 */
  public clearAllParamOverrides(): void {
    // 从 _savedParameters 中恢复所有原始值
    for (const id of this._paramOverrides.keys()) {
      this._restoreOriginalParam(id);
    }
    this._paramOverrides.clear();
    this._paramCurrentValues.clear();
    this._paramOriginalValues.clear();
  }

  /**
   * 🆕 将某个参数的原始值写回 _savedParameters，使其在 loadParameters 后恢复。
   */
  private _restoreOriginalParam(id: string): void {
    const origValue = this._paramOriginalValues.get(id);
    if (origValue === undefined) return;
    const model = this.getModel(0) as any;
    const cubismModel = model?._model;
    if (!cubismModel || !cubismModel._savedParameters) return;
    const rawIds: string[] | null = cubismModel._model?.parameters?.ids ?? null;
    if (!rawIds) return;
    const idx = rawIds.indexOf(id);
    if (idx >= 0 && idx < cubismModel._savedParameters.length) {
      cubismModel._savedParameters[idx] = origValue;
    }
  }

  /**
   * 画面を更新するときの処理
   * モデルの更新処理及び描画処理を行う
   */
  public onUpdate(): void {
    if (!canvas) return;
    const { width, height } = canvas;

    const modelCount: number = this._models.getSize();

    // 复用 projection 矩阵，避免每帧 new CubismMatrix44() 产生 GC 压力
    if (!this._cachedProjection) {
      this._cachedProjection = new CubismMatrix44();
    }
    const projection = this._cachedProjection;
    projection.loadIdentity();

    for (let i = 0; i < modelCount; ++i) {
      const model: LAppModel = this.getModel(i);

      if (!model) continue;

      if (model.getModel()) {
        if (model.getModel().getCanvasWidth() > 1.0 && width < height) {
          model.getModelMatrix().setWidth(2.0);
          projection.scale(1.0, width / height);
        } else {
          projection.scale(height / width, 1.0);
        }

        if (this._viewMatrix != null) {
          projection.multiplyByMatrix(this._viewMatrix);
        }
      }

      model.update();

      // 🆕 在 update 后、draw 前应用参数覆盖
      if (this._paramOverrides.size > 0) {
        this._applyParamOverrides(model);
      }

      model.draw(projection);
    }
  }

  /**
   * 🆕 将参数覆盖应用到模型（在 update 之后、draw 之前调用）
   *
   * 遍历模型自身的 _parameterIds 列表，按字符串名称匹配参数，
   * 再用 setParameterValueByIndex 设置值。
   *
   * ⚠️ 不能用 CubismFramework.getIdManager().getId() + setParameterValueById()，
   *    因为 getParameterIndex() 使用引用比较 (===)，getId() 创建的新对象
   *    与模型内部加载的对象引用不同，导致返回 -1。
   */
  private _applyParamOverrides(model: LAppModel): void {
    try {
      const cubismModel = (model as any)._model;
      if (!cubismModel) {
        console.warn("[_applyParamOverrides] cubismModel 为空");
        return;
      }

      const paramCount: number = cubismModel.getParameterCount?.() ?? 0;
      const rawValues: Float32Array | null =
        cubismModel._model?.parameters?.values ?? null;
      const rawIds: string[] | null =
        cubismModel._model?.parameters?.ids ?? null;

      console.log(
        `[_applyParamOverrides] 参数数=${paramCount}, 原始值数组=${!!rawValues}, 原始ID数组=${!!rawIds}, 覆盖数=${this._paramOverrides.size}`,
      );

      // 直接通过核心模型的 parameters.ids 数组查找参数索引 + 直接写入 parameters.values
      // 完全绕过 CubismModel 封装层，消除所有可能的间接问题
      if (!rawValues || !rawIds || rawIds.length === 0) {
        console.warn("[_applyParamOverrides] 核心模型参数数据不可用");
        return;
      }

      // 🔍 打印 ParamAngleX 的 min/max/默认值（仅首次）
      const angleXIdx = rawIds.indexOf("ParamAngleX");
      if (angleXIdx >= 0 && !this._loggedParamInfo) {
        this._loggedParamInfo = true;
        const minV =
          cubismModel._model?.parameters?.minimumValues?.[angleXIdx] ?? "?";
        const maxV =
          cubismModel._model?.parameters?.maximumValues?.[angleXIdx] ?? "?";
        const defV =
          cubismModel._model?.parameters?.defaultValues?.[angleXIdx] ?? "?";
        console.log(
          `[_applyParamOverrides] 📊 ParamAngleX[${angleXIdx}] min=${minV} max=${maxV} default=${defV}`,
        );
        // 也打印前 20 个参数名
        console.log(
          `[_applyParamOverrides] 📋 前20参数: [${rawIds.slice(0, 20).join(", ")}]`,
        );
      }

      let applied = 0;
      for (const [paramName, targetValue] of this._paramOverrides) {
        const index = rawIds.indexOf(paramName);
        if (index >= 0) {
          const current =
            this._paramCurrentValues.get(paramName) ?? targetValue;
          const lerpValue =
            current + (targetValue - current) * this._paramLerpSpeed;
          this._paramCurrentValues.set(paramName, lerpValue);

          // 🆕 使用 CubismModel.setParameterValueByIndex() 而不是直接写 rawValues。
          //   setParameterValueByIndex 内部会处理 clamp/repeat 逻辑，
          //   与 breath/拖拽代码中的 addParameterValueByIndex 使用相同的写入路径。
          const before = cubismModel.getParameterValueByIndex(index);
          cubismModel.setParameterValueByIndex(index, lerpValue);
          const after = cubismModel.getParameterValueByIndex(index);
          applied++;

          // ✅ 只在值变化显著时打印（减少日志量）
          if (Math.abs(lerpValue - before) > 0.5 || applied <= 3) {
            console.log(
              `[_applyParamOverrides] ${paramName}[${index}]: ${before.toFixed(3)} → ${after.toFixed(3)} (目标=${targetValue})`,
            );
          }
        } else {
          console.warn(
            `[_applyParamOverrides] ⚠️ 参数 '${paramName}' 不在模型中，可用(${rawIds.length}个): [${rawIds.slice(0, 10).join(", ")}...]`,
          );
        }
      }

      if (applied > 0) {
        try {
          // 执行核心 update，使参数值生效到顶点位置
          if (typeof cubismModel._model?.update === "function") {
            cubismModel._model.update();
          } else if (typeof cubismModel.update === "function") {
            cubismModel.update();
          }

          // 🆕 仅将本次覆盖的参数值保存到 _savedParameters，避免丢失覆盖值。
          //   不能调用 saveParameters() 保存全部参数——那会把呼吸/拖拽的中间态也存进去，
          //   导致下帧 loadParameters() 后呼吸/拖拽再叠加产生累积和渲染错误。
          //   这里只更新被覆盖的单个参数在 _savedParameters 中的条目。
          if (cubismModel._savedParameters) {
            for (const [paramName] of this._paramOverrides) {
              const idx = rawIds.indexOf(paramName);
              if (idx >= 0 && idx < cubismModel._savedParameters.length) {
                cubismModel._savedParameters[idx] = rawValues[idx];
              }
            }
          }
        } catch (e) {
          console.warn("[_applyParamOverrides] update 失败:", e);
        }

        // 🔍 验证：update 后读回 ParamAngleX 的值，看是否被物理或其他系统冲掉
        for (const [paramName] of this._paramOverrides) {
          const idx = rawIds.indexOf(paramName);
          if (idx >= 0) {
            console.log(
              `[_applyParamOverrides] 🔍 update 后 ${paramName}[${idx}] = ${rawValues[idx].toFixed(3)}`,
            );
          }
        }
      }
    } catch (e) {
      console.warn("[_applyParamOverrides] 异常:", e);
    }
  }

  /**
   * 次のシーンに切りかえる
   * サンプルアプリケーションではモデルセットの切り替えを行う。
   */
  public nextScene(): void {
    const no: number = (this._sceneIndex + 1) % LAppDefine.ModelDirSize;
    this.changeScene(no);
  }

  /**
   * シーンを切り替える
   * サンプルアプリケーションではモデルセットの切り替えを行う。
   */
  public changeScene(index: number): void {
    this._sceneIndex = index;
    if (LAppDefine.DebugLogEnable) {
      LAppPal.printMessage(`[APP]model index: ${this._sceneIndex}`);
    }

    // Use the directory name and file name from our configuration
    const model: string = LAppDefine.ModelDir[index];
    const modelPath: string = LAppDefine.ResourcesPath + model + "/";

    // Use ModelFileNames if available, otherwise fall back to ModelDir
    let modelJsonName: string =
      LAppDefine.ModelFileNames && LAppDefine.ModelFileNames[index]
        ? LAppDefine.ModelFileNames[index]
        : LAppDefine.ModelDir[index];

    modelJsonName += ".model3.json";

    if (LAppDefine.DebugLogEnable) {
      LAppPal.printMessage(`[APP]model path: ${modelPath}${modelJsonName}`);
    }

    this.releaseAllModel();
    this._models.pushBack(new LAppModel());
    this._models.at(0).loadAssets(modelPath, modelJsonName);
  }

  public setViewMatrix(m: CubismMatrix44) {
    for (let i = 0; i < 16; i++) {
      this._viewMatrix.getArray()[i] = m.getArray()[i];
    }
  }

  /**
   * コンストラクタ
   * 注意：不在构造函数中调用 changeScene，由 initNativeLive2D 统一控制加载时机
   */
  constructor() {
    this._viewMatrix = new CubismMatrix44();
    this._models = new csmVector<LAppModel>();
    this._sceneIndex = 0;
  }

  _viewMatrix: CubismMatrix44; // モデル描画に用いるview行列
  _models: csmVector<LAppModel>; // モデルインスタンスのコンテナ
  _sceneIndex: number; // 表示するシーンのインデックス値
  _cachedProjection: CubismMatrix44 | null; // 🆕 复用的投影矩阵（避免每帧 new）
  // モーション再生終了のコールバック関数
  _finishedMotion = (self: ACubismMotion): void => {
    LAppPal.printMessage("Motion Finished:");
    console.log(self);
  };
}
