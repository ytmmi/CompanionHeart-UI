// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismDefaultParameterId } from "@framework/cubismdefaultparameterid";
import { CubismModelSettingJson } from "@framework/cubismmodelsettingjson";
import {
  BreathParameterData,
  CubismBreath,
} from "@framework/effect/cubismbreath";
import { CubismEyeBlink } from "@framework/effect/cubismeyeblink";
import { ICubismModelSetting } from "@framework/icubismmodelsetting";
import { CubismIdHandle } from "@framework/id/cubismid";
import { CubismFramework } from "@framework/live2dcubismframework";
import { CubismMatrix44 } from "@framework/math/cubismmatrix44";
import { CubismUserModel } from "@framework/model/cubismusermodel";
import {
  ACubismMotion,
  FinishedMotionCallback,
} from "@framework/motion/acubismmotion";
import { CubismMotion } from "@framework/motion/cubismmotion";
import {
  CubismMotionQueueEntryHandle,
  InvalidMotionQueueEntryHandleValue,
} from "@framework/motion/cubismmotionqueuemanager";
import { csmMap } from "@framework/type/csmmap";
import { csmRect } from "@framework/type/csmrectf";
import { csmString } from "@framework/type/csmstring";
import { csmVector } from "@framework/type/csmvector";
import {
  CSM_ASSERT,
  CubismLogError,
  CubismLogInfo,
} from "@framework/utils/cubismdebug";

import * as LAppDefine from "./lappdefine";
import { frameBuffer, LAppDelegate } from "./lappdelegate";
import { canvas, gl } from "./lappglmanager";
import { LAppPal } from "./lapppal";
import { TextureInfo } from "./lapptexturemanager";
import { LAppWavFileHandler } from "./lappwavfilehandler";
import { CubismMoc } from "@framework/model/cubismmoc";

enum LoadStep {
  LoadAssets,
  LoadModel,
  WaitLoadModel,
  LoadExpression,
  WaitLoadExpression,
  LoadPhysics,
  WaitLoadPhysics,
  LoadPose,
  WaitLoadPose,
  SetupEyeBlink,
  SetupBreath,
  LoadUserData,
  WaitLoadUserData,
  SetupEyeBlinkIds,
  SetupLipSyncIds,
  SetupLayout,
  LoadMotion,
  WaitLoadMotion,
  CompleteInitialize,
  CompleteSetupModel,
  LoadTexture,
  WaitLoadTexture,
  CompleteSetup,
}

/**
 * ユーザーが実際に使用するモデルの実装クラス<br>
 * モデル生成、機能コンポーネント生成、更新処理とレンダリングの呼び出しを行う。
 */
export class LAppModel extends CubismUserModel {
  /** 标记模型是否已被释放，防止异步回调操作已释放的资源 */
  private _disposed = false;

  /**
   * model3.jsonが置かれたディレクトリとファイルパスからモデルを生成する
   * @param dir
   * @param fileName
   */
  public loadAssets(dir: string, fileName: string): void {
    this._modelHomeDir = dir;

    fetch(`${this._modelHomeDir}${fileName}`)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => {
        if (this._disposed) return;
        const setting: ICubismModelSetting = new CubismModelSettingJson(
          arrayBuffer,
          arrayBuffer.byteLength,
        );

        // ステートを更新
        this._state = LoadStep.LoadModel;

        // 結果を保存
        this.setupModel(setting);
      })
      .catch((error) => {
        CubismLogError(`Failed to load file ${this._modelHomeDir}${fileName}`);
        // 🔧 修复：即使 model3.json 加载失败也推进状态，防止模型卡死在初始状态导致超时
        this._state = LoadStep.CompleteSetup;
      });
  }

  /**
   * model3.jsonからモデルを生成する。
   * model3.jsonの記述に従ってモデル生成、モーション、物理演算などのコンポーネント生成を行う。
   *
   * @param setting ICubismModelSettingのインスタンス
   */
  private setupModel(setting: ICubismModelSetting): void {
    this._updating = true;
    this._initialized = false;

    this._modelSetting = setting;

    // Log hit areas information
    const hitAreasCount = this._modelSetting.getHitAreasCount();
    console.log(`Model has ${hitAreasCount} hit areas`);

    // CubismModel
    if (this._modelSetting.getModelFileName() != "") {
      const modelFileName = this._modelSetting.getModelFileName();

      fetch(`${this._modelHomeDir}${modelFileName}`)
        .then((response) => {
          if (response.ok) {
            return response.arrayBuffer();
          } else if (response.status >= 400) {
            CubismLogError(
              `Failed to load file ${this._modelHomeDir}${modelFileName}`,
            );
            return new ArrayBuffer(0);
          }
        })
        .then((arrayBuffer) => {
          if (this._disposed) return;
          this.loadModel(
            arrayBuffer,
            this._mocConsistency,
            LAppDefine.CurrentKScale,
          );
          this._state = LoadStep.LoadExpression;

          // callback
          loadCubismExpression();
        })
        .catch((error) => {
          CubismLogError(
            `Moc fetch failed: ${this._modelHomeDir}${modelFileName}`,
          );
          // 🔧 修复：fetch 失败时仍推进状态，防止模型卡在 WaitLoadModel
          this._state = LoadStep.LoadExpression;
          loadCubismExpression();
        });

      this._state = LoadStep.WaitLoadModel;
    } else {
      LAppPal.printMessage("Model data does not exist.");
    }

    // Expression
    const loadCubismExpression = (): void => {
      if (this._modelSetting.getExpressionCount() > 0) {
        const count: number = this._modelSetting.getExpressionCount();

        for (let i = 0; i < count; i++) {
          const expressionName = this._modelSetting.getExpressionName(i);
          const expressionFileName =
            this._modelSetting.getExpressionFileName(i);

          fetch(`${this._modelHomeDir}${expressionFileName}`)
            .then((response) => {
              if (response.ok) {
                return response.arrayBuffer();
              } else if (response.status >= 400) {
                CubismLogError(
                  `Failed to load file ${this._modelHomeDir}${expressionFileName}`,
                );
                // ファイルが存在しなくてもresponseはnullを返却しないため、空のArrayBufferで対応する
                return new ArrayBuffer(0);
              }
            })
            .then((arrayBuffer) => {
              if (this._disposed) return;
              const motion: ACubismMotion = this.loadExpression(
                arrayBuffer,
                arrayBuffer.byteLength,
                expressionName,
              );

              if (this._expressions.getValue(expressionName) != null) {
                ACubismMotion.delete(
                  this._expressions.getValue(expressionName),
                );
                this._expressions.setValue(expressionName, null);
              }

              this._expressions.setValue(expressionName, motion);

              this._expressionCount++;

              if (this._expressionCount >= count) {
                this._state = LoadStep.LoadPhysics;

                // callback
                loadCubismPhysics();
              }
            });
        }
        this._state = LoadStep.WaitLoadExpression;
      } else {
        this._state = LoadStep.LoadPhysics;

        // callback
        loadCubismPhysics();
      }
    };

    // Physics
    const loadCubismPhysics = (): void => {
      if (this._modelSetting.getPhysicsFileName() != "") {
        const physicsFileName = this._modelSetting.getPhysicsFileName();

        fetch(`${this._modelHomeDir}${physicsFileName}`)
          .then((response) => {
            if (response.ok) {
              return response.arrayBuffer();
            }
            CubismLogError(
              `Failed to load file ${this._modelHomeDir}${physicsFileName} (status: ${response.status})`,
            );
            return new ArrayBuffer(0);
          })
          .then((arrayBuffer) => {
            if (this._disposed) return;
            this.loadPhysics(arrayBuffer, arrayBuffer.byteLength);

            this._state = LoadStep.LoadPose;

            // callback
            loadCubismPose();
          })
          .catch((error) => {
            if (this._disposed) return;
            CubismLogError(
              `Physics fetch failed: ${this._modelHomeDir}${physicsFileName}`,
            );
            console.warn("[LAppModel] Physics load error:", error);
            // 🔧 修复：fetch 失败时仍推进状态，防止模型卡在 WaitLoadPhysics
            this._state = LoadStep.LoadPose;
            loadCubismPose();
          });
        this._state = LoadStep.WaitLoadPhysics;
      } else {
        this._state = LoadStep.LoadPose;

        // callback
        loadCubismPose();
      }
    };

    // Pose
    const loadCubismPose = (): void => {
      if (this._modelSetting.getPoseFileName() != "") {
        const poseFileName = this._modelSetting.getPoseFileName();

        fetch(`${this._modelHomeDir}${poseFileName}`)
          .then((response) => {
            if (response.ok) {
              return response.arrayBuffer();
            }
            CubismLogError(
              `Failed to load file ${this._modelHomeDir}${poseFileName} (status: ${response.status})`,
            );
            return new ArrayBuffer(0);
          })
          .then((arrayBuffer) => {
            if (this._disposed) return;
            this.loadPose(arrayBuffer, arrayBuffer.byteLength);

            this._state = LoadStep.SetupEyeBlink;

            // callback
            setupEyeBlink();
          })
          .catch((error) => {
            if (this._disposed) return;
            CubismLogError(
              `Pose fetch failed: ${this._modelHomeDir}${poseFileName}`,
            );
            console.warn("[LAppModel] Pose load error:", error);
            // 🔧 修复：fetch 失败时仍推进状态
            this._state = LoadStep.SetupEyeBlink;
            setupEyeBlink();
          });
        this._state = LoadStep.WaitLoadPose;
      } else {
        this._state = LoadStep.SetupEyeBlink;

        // callback
        setupEyeBlink();
      }
    };

    // EyeBlink
    const setupEyeBlink = (): void => {
      if (this._modelSetting.getEyeBlinkParameterCount() > 0) {
        this._eyeBlink = CubismEyeBlink.create(this._modelSetting);
      } else {
        // 🆕 VTS 兼容：model3.json 未定义 EyeBlink 参数时，
        //    创建默认 CubismEyeBlink 并注入标准眨眼参数，确保所有模型都有随机眨眼
        this._eyeBlink = CubismEyeBlink.create();
        const idManager = CubismFramework.getIdManager();
        if (idManager) {
          const leftEye = idManager.getId(
            CubismDefaultParameterId.ParamEyeLOpen,
          );
          const rightEye = idManager.getId(
            CubismDefaultParameterId.ParamEyeROpen,
          );
          if (leftEye)
            (this._eyeBlink as any)._parameterIds?.pushBack?.(leftEye);
          if (rightEye)
            (this._eyeBlink as any)._parameterIds?.pushBack?.(rightEye);
        }
        console.log(
          "[LAppModel] 🆕 创建默认 EyeBlink（ParamEyeLOpen + ParamEyeROpen）",
        );
      }
      this._state = LoadStep.SetupBreath;

      // callback
      setupBreath();
    };

    // Breath
    const setupBreath = (): void => {
      this._breath = CubismBreath.create();

      const breathParameters: csmVector<BreathParameterData> = new csmVector();
      breathParameters.pushBack(
        new BreathParameterData(this._idParamAngleX, 0.0, 15.0, 6.5345, 0.5),
      );
      breathParameters.pushBack(
        new BreathParameterData(this._idParamAngleY, 0.0, 8.0, 3.5345, 0.5),
      );
      breathParameters.pushBack(
        new BreathParameterData(this._idParamAngleZ, 0.0, 10.0, 5.5345, 0.5),
      );
      breathParameters.pushBack(
        new BreathParameterData(
          this._idParamBodyAngleX,
          0.0,
          4.0,
          15.5345,
          0.5,
        ),
      );

      // Add null check for CubismFramework.getIdManager()
      const idManager = CubismFramework.getIdManager();
      if (idManager) {
        const breathParameterId = idManager.getId(
          CubismDefaultParameterId.ParamBreath,
        );
        if (breathParameterId) {
          breathParameters.pushBack(
            new BreathParameterData(breathParameterId, 0.5, 0.5, 3.2345, 1),
          );
        }
      }

      this._breath.setParameters(breathParameters);
      this._state = LoadStep.LoadUserData;

      // callback
      loadUserData();
    };

    // UserData
    const loadUserData = (): void => {
      if (this._modelSetting.getUserDataFile() != "") {
        const userDataFile = this._modelSetting.getUserDataFile();

        fetch(`${this._modelHomeDir}${userDataFile}`)
          .then((response) => {
            if (response.ok) {
              return response.arrayBuffer();
            } else if (response.status >= 400) {
              CubismLogError(
                `Failed to load file ${this._modelHomeDir}${userDataFile}`,
              );
              return new ArrayBuffer(0);
            }
          })
          .then((arrayBuffer) => {
            if (this._disposed) return;
            this.loadUserData(arrayBuffer, arrayBuffer.byteLength);

            this._state = LoadStep.SetupEyeBlinkIds;

            // callback
            setupEyeBlinkIds();
          })
          .catch((error) => {
            CubismLogError(
              `UserData fetch failed: ${this._modelHomeDir}${userDataFile}`,
            );
            // 🔧 修复：fetch 失败时仍推进状态
            this._state = LoadStep.SetupEyeBlinkIds;
            setupEyeBlinkIds();
          });

        this._state = LoadStep.WaitLoadUserData;
      } else {
        this._state = LoadStep.SetupEyeBlinkIds;

        // callback
        setupEyeBlinkIds();
      }
    };

    // EyeBlinkIds
    const setupEyeBlinkIds = (): void => {
      const eyeBlinkIdCount: number =
        this._modelSetting.getEyeBlinkParameterCount();

      for (let i = 0; i < eyeBlinkIdCount; ++i) {
        this._eyeBlinkIds.pushBack(
          this._modelSetting.getEyeBlinkParameterId(i),
        );
      }

      this._state = LoadStep.SetupLipSyncIds;

      // callback
      setupLipSyncIds();
    };

    // LipSyncIds
    const setupLipSyncIds = (): void => {
      const lipSyncIdCount = this._modelSetting.getLipSyncParameterCount();

      for (let i = 0; i < lipSyncIdCount; ++i) {
        this._lipSyncIds.pushBack(this._modelSetting.getLipSyncParameterId(i));
      }

      // Fallback if no LipSync IDs are defined in the model setting
      if (this._lipSyncIds.getSize() === 0) {
        console.warn(
          '[Fallback] No LipSync IDs defined in model setting. Attempting fallback to "ParamMouthOpenY".',
        );

        const idManager = CubismFramework.getIdManager();
        if (idManager) {
          const fallbackId: CubismIdHandle = idManager.getId(
            CubismDefaultParameterId.ParamMouthOpenY,
          );

          // Check if the model actually has this parameter before adding it
          if (
            this._model &&
            fallbackId &&
            this._model.getParameterIndex(fallbackId) !== -1
          ) {
            this._lipSyncIds.pushBack(fallbackId);
            console.log(
              '[Fallback] Successfully added "ParamMouthOpenY" as LipSync ID.',
            );
          } else {
            console.warn(
              '[Fallback] Fallback ID "ParamMouthOpenY" not found in the current model or model not loaded.',
            );
          }
        } else {
          console.warn(
            "[Fallback] Could not access IdManager. LipSync fallback unavailable.",
          );
        }
      }

      this._state = LoadStep.SetupLayout;

      // callback
      setupLayout();
    };

    // Layout
    const setupLayout = (): void => {
      const layout: csmMap<string, number> = new csmMap<string, number>();

      if (this._modelSetting == null || this._modelMatrix == null) {
        CubismLogError("Failed to setupLayout().");
        return;
      }

      this._modelSetting.getLayoutMap(layout);
      // setupFromLayout expects a Map (iterable), csmMap may not implement iterator
      // Wrap in try-catch to handle gracefully
      try {
        this._modelMatrix.setupFromLayout(layout as any);
      } catch (e) {
        console.warn(
          "[LAppModel] setupLayout failed, using default layout:",
          e,
        );
      }
      this._state = LoadStep.LoadMotion;

      // callback
      loadCubismMotion();
    };

    // Motion
    const loadCubismMotion = (): void => {
      this._state = LoadStep.WaitLoadMotion;
      this._model.saveParameters();
      this._allMotionCount = 0;
      this._motionCount = 0;
      const group: string[] = [];

      const motionGroupCount: number = this._modelSetting.getMotionGroupCount();

      // モーションの総数を求める
      for (let i = 0; i < motionGroupCount; i++) {
        group[i] = this._modelSetting.getMotionGroupName(i);
        this._allMotionCount += this._modelSetting.getMotionCount(group[i]);
      }

      // Check if there are no actual motions to load, even if groups exist
      if (this._allMotionCount == 0) {
        this._state = LoadStep.LoadTexture;

        // 全てのモーションを停止する
        this._motionManager.stopAllMotions();

        this._updating = false;
        this._initialized = true;

        this.createRenderer();
        this.setupTextures();
        this.getRenderer().startUp(gl);
        return;
      }

      // モーションの読み込み
      for (let i = 0; i < motionGroupCount; i++) {
        this.preLoadMotionGroup(group[i]);
      }

      // モーションがない場合 (Original check, now might be redundant but kept for safety)
      if (motionGroupCount == 0) {
        this._state = LoadStep.LoadTexture;

        // 全てのモーションを停止する
        this._motionManager.stopAllMotions();

        this._updating = false;
        this._initialized = true;

        this.createRenderer();
        this.setupTextures();
        this.getRenderer().startUp(gl);
      }
    };
  }

  /**
   * テクスチャのセットアップ
   */
  private setupTextures(): void {
    console.log("Setting up textures for model:", this._modelHomeDir);

    // iPhoneでのアルファ品質向上のためTypescriptではpremultipliedAlphaを採用 (Reverted to likely original)
    const usePremultiply = true;

    if (this._state == LoadStep.LoadTexture) {
      // テクスチャ読み込み用
      const textureCount: number = this._modelSetting.getTextureCount();
      console.log(
        `[LAppModel] 纹理总数: ${textureCount}, 目录: ${this._modelHomeDir}`,
      );

      // 🆕 追踪有效纹理数（排除空文件名），用于正确判断加载完成
      let effectiveTextureCount = 0;

      for (
        let modelTextureNumber = 0;
        modelTextureNumber < textureCount;
        modelTextureNumber++
      ) {
        // テクスチャ名が空文字だった場合はロード・バインド処理をスキップ
        const texFileName =
          this._modelSetting.getTextureFileName(modelTextureNumber);
        if (texFileName == "") {
          console.log(
            `[LAppModel] 纹理#${modelTextureNumber} 文件名为空，跳过（计入已加载）`,
          );
          // 🆕 修复：空文件名纹理计入已完成计数，防止 _textureCount 永远达不到 textureCount
          this._textureCount++;
          continue;
        }
        effectiveTextureCount++;

        // WebGLのテクスチャユニットにテクスチャをロードする
        const texturePath = this._modelHomeDir + texFileName;
        console.log(
          `[LAppModel] 加载纹理#${modelTextureNumber}: ${texturePath}`,
        );

        // ロード完了時に呼び出すコールバック関数
        const onLoad = (textureInfo: TextureInfo): void => {
          if (this._disposed) return;
          console.log(
            `[LAppModel] 纹理#${modelTextureNumber} 加载完成 (${this._textureCount + 1}/${textureCount})`,
          );
          this.getRenderer().bindTexture(modelTextureNumber, textureInfo.id);

          this._textureCount++;

          if (this._textureCount >= textureCount) {
            // ロード完了
            console.log(`[LAppModel] ✅ 全部纹理加载完成，进入 CompleteSetup`);
            this._state = LoadStep.CompleteSetup;
          }
        };

        // 読み込み
        LAppDelegate.getInstance()
          .getTextureManager()
          .createTextureFromPngFile(texturePath, usePremultiply, onLoad);
        this.getRenderer().setIsPremultipliedAlpha(usePremultiply);
      }

      // 🆕 如果所有纹理都是空文件名（无有效纹理），直接进入 CompleteSetup
      if (effectiveTextureCount === 0 && textureCount > 0) {
        console.log("[LAppModel] ⚠️ 无有效纹理文件，直接进入 CompleteSetup");
        this._state = LoadStep.CompleteSetup;
        return;
      }

      this._state = LoadStep.WaitLoadTexture;
    }
  }

  /**
   * レンダラを再構築する
   */
  public reloadRenderer(): void {
    this.deleteRenderer();
    this.createRenderer();
    this.setupTextures();
  }

  /** 记录是否已输出过「非 CompleteSetup 跳过完整更新」警告（仅输出一次） */
  private _fallbackUpdateWarned = false;

  /**
   * 更新
   *
   * 🆕 修复：非 CompleteSetup 状态下仍执行基础 model.update()，
   * 确保模型至少能响应默认参数（呼吸/物理），而非完全冻结。
   * 动作/表情/物理运算等高级功能在 CompleteSetup 后才启用。
   */
  public update(): void {
    // 🆕 非 CompleteSetup 时仍调用 model.update() 维持基础动画
    if (this._state != LoadStep.CompleteSetup) {
      if (this._model) {
        // 仅输出一次警告
        if (!this._fallbackUpdateWarned) {
          this._fallbackUpdateWarned = true;
          console.warn(
            `[LAppModel] ⚠️ 模型未达 CompleteSetup（当前 _state=${this._state}），` +
              `仅执行基础 model.update()，动作/表情/物理等高级功能暂不可用。`,
          );
        }
        this._model.update();
      }
      return;
    }

    const deltaTimeSeconds: number = LAppPal.getDeltaTime();
    this._userTimeSeconds += deltaTimeSeconds;

    this._dragManager.update(deltaTimeSeconds);
    this._dragX = this._dragManager.getX();
    this._dragY = this._dragManager.getY();

    // モーションによるパラメータ更新の有無
    let motionUpdated = false;

    //--------------------------------------------------------------------------
    this._model.loadParameters(); // 前回セーブされた状態をロード
    if (this._motionManager.isFinished()) {
      // モーションの再生がない場合、待機モーションの中からランダムで再生する
      // 🔧 VTS 兼容：startRandomMotion 会检查 _modelSetting，VTS 模型返回 0。
      //    先尝试标准路径，失败则从 _motions 映射中查找已加载的空闲动作。
      const idleGroup = LAppDefine.MotionGroupIdle;
      const motionCount = this._modelSetting.getMotionCount(idleGroup);
      if (motionCount > 0) {
        this.startRandomMotion(idleGroup, LAppDefine.PriorityIdle);
      } else {
        // 从 _motions 中查找已加载的空闲动作（如 "Idle_0"）
        const idleMotion = this._motions.getValue(`${idleGroup}_0`);
        if (idleMotion) {
          this._motionManager.startMotionPriority(
            idleMotion,
            false,
            LAppDefine.PriorityIdle,
          );
        }
        // 否则静默跳过（无空闲动作可用）
      }
    } else {
      motionUpdated = this._motionManager.updateMotion(
        this._model,
        deltaTimeSeconds,
      ); // モーションを更新
    }
    this._model.saveParameters(); // 状態を保存
    //--------------------------------------------------------------------------

    // まばたき
    if (!motionUpdated) {
      if (this._eyeBlink != null) {
        // メインモーションの更新がないとき
        this._eyeBlink.updateParameters(this._model, deltaTimeSeconds); // 目パチ
      }
    }

    if (this._expressionManager != null) {
      this._expressionManager.updateMotion(this._model, deltaTimeSeconds); // 表情でパラメータ更新（相対変化）
    }

    // ドラッグによる変化
    // 🔧 绕过 addParameterValueById()，直接按字符串匹配设置参数（引用比较 bug 修复）
    const _paramIds = (this._model as any)._parameterIds;
    const _paramCount = (this._model as any).getParameterCount?.() ?? 0;

    const _addParam = (name: string, addValue: number) => {
      if (!_paramIds || _paramCount === 0) return;
      for (let k = 0; k < _paramCount; k++) {
        if (_paramIds[k]?.getString?.() === name) {
          this._model.addParameterValueByIndex(k, addValue);
          break;
        }
      }
    };

    // ドラッグによる顔の向きの調整
    _addParam("ParamAngleX", this._dragX * 30);
    _addParam("ParamAngleY", this._dragY * 30);
    _addParam("ParamAngleZ", this._dragX * this._dragY * -30);

    // ドラッグによる体の向きの調整
    _addParam("ParamBodyAngleX", this._dragX * 10);

    // ドラッグによる目の向きの調整
    _addParam("ParamEyeBallX", this._dragX);
    _addParam("ParamEyeBallY", this._dragY);

    // 呼吸など
    // 🔧 绕过 CubismBreath.updateParameters()，直接按索引设置呼吸参数。
    //    CubismBreath 内部调用 model.addParameterValueById()，
    //    而 addParameterValueById 使用引用比较 (===) 查找参数 ID，
    //    getIdManager().getId() 返回的对象 ≠ 模型内部对象 → 返回 -1 → 无效。
    if (this._breath != null && this._model) {
      this._breath._currentTime += deltaTimeSeconds;
      const t = this._breath._currentTime * 2.0 * Math.PI;
      const params = (this._breath as any)._breathParameters;
      const paramIds = (this._model as any)._parameterIds;
      const paramCount = (this._model as any).getParameterCount?.() ?? 0;

      if (params && paramIds && paramCount > 0) {
        // 🆕 修复：csmVector 没有 .length，必须用 getSize() 获取元素数，
        //   并用 at(i) 访问元素（不能直接用 [i] 索引）。
        const breathCount =
          typeof params.getSize === "function"
            ? params.getSize()
            : (params.length ?? 0);
        for (let i = 0; i < breathCount; i++) {
          const data =
            typeof params.at === "function" ? params.at(i) : params[i];
          if (!data) continue;
          // 🆕 修复：BreathParameterData 的属性名没有下划线前缀！
          //   parameterId / offset / peak / cycle / weight（不是 _parameterId / _offset 等）
          const targetId = data.parameterId;
          const value =
            (data.offset ?? 0) +
            (data.peak ?? 0) * Math.sin(t / (data.cycle ?? 1));

          // 按字符串匹配查找参数索引（避免引用比较问题）
          const targetName = targetId?.getString?.();
          if (!targetName) continue;

          for (let j = 0; j < paramCount; j++) {
            if (paramIds[j]?.getString?.() === targetName) {
              this._model.addParameterValueByIndex(
                j,
                value * (data.weight ?? 1),
              );
              break;
            }
          }
        }
      }
    }

    // 物理演算の設定
    if (this._physics != null) {
      this._physics.evaluate(this._model, deltaTimeSeconds);
    }

    // Lip sync settings
    if (this._lipsync) {
      let value = 0.0;
      this._wavFileHandler.update(deltaTimeSeconds);
      value = this._wavFileHandler.getRms();
      value = Math.min(1.0, value * 1.5);

      const lipSyncWeight = 4.0;

      for (let i = 0; i < this._lipSyncIds.getSize(); ++i) {
        this._model.addParameterValueById(
          this._lipSyncIds.at(i),
          value,
          lipSyncWeight,
        );
      }
    }

    // ポーズの設定
    if (this._pose != null) {
      this._pose.updateParameters(this._model, deltaTimeSeconds);
    }

    this._model.update();
  }

  /**
   * 引数で指定したモーションの再生を開始する
   * @param group モーショングループ名
   * @param no グループ内の番号
   * @param priority 優先度
   * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
   * @return 開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するisFinished()の引数で使用する。開始できない時は[-1]
   */
  public startMotion(
    group: string,
    no: number,
    priority: number,
    onFinishedMotionHandler?: FinishedMotionCallback,
  ): CubismMotionQueueEntryHandle {
    // Add a log specifically when trying to start a tap motion (which uses priority 3)
    if (priority === 3 && LAppDefine.DebugLogEnable) {
      console.log(
        `[APP] startMotion: Attempting to start tap motion. Group: '${group}', Index: ${no}`,
      );
    }

    if (priority == LAppDefine.PriorityForce) {
      this._motionManager.setReservePriority(priority);
    } else if (!this._motionManager.reserveMotion(priority)) {
      if (this._debugMode) {
        LAppPal.printMessage("[APP]can't start motion.");
      }
      return InvalidMotionQueueEntryHandleValue;
    }

    const motionFileName = this._modelSetting.getMotionFileName(group, no);

    // ex) idle_0 or _0 if group is ""
    const name = `${group}_${no}`;
    let motion: CubismMotion = this._motions.getValue(name) as CubismMotion;
    let autoDelete = false;

    if (motion == null) {
      if (LAppDefine.DebugLogEnable) {
        console.log(
          `[APP] startMotion: Motion '${name}' not found in cache, fetching: ${motionFileName}`,
        );
      }
      fetch(`${this._modelHomeDir}${motionFileName}`)
        .then((response) => {
          if (response.ok) {
            return response.arrayBuffer();
          } else if (response.status >= 400) {
            CubismLogError(
              `Failed to load file ${this._modelHomeDir}${motionFileName}`,
            );
            return new ArrayBuffer(0);
          }
        })
        .then((arrayBuffer) => {
          if (this._disposed) return;
          motion = this.loadMotion(
            arrayBuffer,
            arrayBuffer.byteLength,
            null, // Pass null for name here? Original code did. Let's keep it for now.
            onFinishedMotionHandler,
          );

          if (motion == null) {
            if (LAppDefine.DebugLogEnable) {
              console.error(
                `[APP] startMotion: Failed to load motion from fetched data for '${name}'`,
              );
            }
            return;
          }

          let fadeTime: number = this._modelSetting.getMotionFadeInTimeValue(
            group,
            no,
          );

          if (fadeTime >= 0.0) {
            motion.setFadeInTime(fadeTime);
          }

          fadeTime = this._modelSetting.getMotionFadeOutTimeValue(group, no);
          if (fadeTime >= 0.0) {
            motion.setFadeOutTime(fadeTime);
          }

          motion.setEffectIds(this._eyeBlinkIds, this._lipSyncIds);
          autoDelete = true; // 終了時にメモリから削除

          // Start the motion *after* it's loaded (moved from outside)
          if (LAppDefine.DebugLogEnable) {
            console.log(`[APP] startMotion: Starting fetched motion '${name}'`);
          }
          this._motionManager.startMotionPriority(motion, autoDelete, priority);
        });
      // Return InvalidHandle immediately because the motion starts asynchronously
      // This might be an issue if the caller expects a valid handle right away.
      // Let's reconsider this. Maybe startMotion should return a Promise? For now, keep original logic.
      return InvalidMotionQueueEntryHandleValue;
    } else {
      if (LAppDefine.DebugLogEnable) {
        console.log(
          `[APP] startMotion: Motion '${name}' found in cache. Starting.`,
        );
      }
      motion.setFinishedMotionHandler(onFinishedMotionHandler);
      // Start the motion if found in cache
      return this._motionManager.startMotionPriority(
        motion,
        autoDelete, // Should be false for cached motions? Let's assume true based on original code.
        priority,
      );
    }

    // Original code had voice logic and startMotionPriority call here, moved inside blocks
  }

  /** 已警告过的空动作组集合（防止每帧刷屏） */
  private _warnedEmptyGroups: Set<string> = new Set();

  /**
   * ランダムに選ばれたモーションの再生を開始する。
   * @param group モーショングループ名
   * @param priority 優先度
   * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
   * @return 開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するisFinished()の引数で使用する。開始できない時は[-1]
   */
  public startRandomMotion(
    group: string,
    priority: number,
    onFinishedMotionHandler?: FinishedMotionCallback,
  ): CubismMotionQueueEntryHandle {
    if (this._modelSetting.getMotionCount(group) == 0) {
      // 🔧 修复：每个空动作组只警告一次，避免每帧刷屏导致控制台内存暴涨
      if (!this._warnedEmptyGroups.has(group)) {
        this._warnedEmptyGroups.add(group);
        console.warn(
          `[LAppModel] 动作组 '${group}' 不存在或为空，跳过（仅警告一次）`,
        );
      }
      return InvalidMotionQueueEntryHandleValue;
    }

    const no: number = Math.floor(
      Math.random() * this._modelSetting.getMotionCount(group),
    );

    if (LAppDefine.DebugLogEnable) {
      console.log(
        `[APP] startRandomMotion: Selected random index ${no} from group '${group}'`,
      );
    }

    return this.startMotion(group, no, priority, onFinishedMotionHandler);
  }

  /**
   * 引数で指定した表情モーションをセットする
   *
   * @param expressionId 表情モーションのID
   * @param fadeInTime フェードイン時間（秒、デフォルト 0.3）
   * @param fadeOutTime フェードアウト時間（秒、デフォルト 0.3）
   */
  public setExpression(
    expressionId: string,
    fadeInTime = 0.3,
    fadeOutTime = 0.3,
  ): void {
    const motion: ACubismMotion = this._expressions.getValue(expressionId);

    if (this._debugMode) {
      LAppPal.printMessage(`[APP]expression: [${expressionId}]`);
    }

    if (motion != null) {
      // 🆕 设置渐变过渡时间，避免表情切换时突变
      motion.setFadeInTime(fadeInTime);
      motion.setFadeOutTime(fadeOutTime);
      this._expressionManager.startMotion(motion, false);
    } else {
      if (this._debugMode) {
        LAppPal.printMessage(`[APP]expression[${expressionId}] is null`);
      }
    }
  }

  /**
   * ランダムに選ばれた表情モーションをセットする
   */
  public setRandomExpression(): void {
    if (this._expressions.getSize() == 0) {
      return;
    }

    const no: number = Math.floor(Math.random() * this._expressions.getSize());

    for (let i = 0; i < this._expressions.getSize(); i++) {
      if (i == no) {
        const name: string = this._expressions._keyValues[i].first;
        this.setExpression(name);
        return;
      }
    }
  }

  /**
   * イベントの発火を受け取る
   */
  public motionEventFired(eventValue: csmString): void {
    CubismLogInfo("{0} is fired on LAppModel!!", eventValue.s);
  }

  /**
   * 当たり判定テスト
   * 指定ＩＤの頂点リストから矩形を計算し、座標をが矩形範囲内か判定する。
   *
   * @param hitArenaName  当たり判定をテストする対象のID
   * @param x             判定を行うX座標
   * @param y             判定を行うY座標
   */
  public hitTest(hitArenaName: string, x: number, y: number): boolean {
    // 透明時は当たり判定無し。
    if (this._opacity < 1) {
      return false;
    }

    const count: number = this._modelSetting.getHitAreasCount();

    for (let i = 0; i < count; i++) {
      if (this._modelSetting.getHitAreaName(i) == hitArenaName) {
        const drawId: CubismIdHandle = this._modelSetting.getHitAreaId(i);
        return this.isHit(drawId, x, y);
      }
    }

    return false;
  }

  /**
   * Test if a point hits any part of the model's defined hit areas.
   * @param x X coordinate to test
   * @param y Y coordinate to test
   * @returns The name of the hit area if hit, otherwise null.
   */
  public anyhitTest(x: number, y: number): string | null {
    // If opacity is less than 1, no hit detection
    if (this._opacity < 1) {
      return null;
    }

    const count: number = this._modelSetting.getHitAreasCount();

    for (let i = 0; i < count; i++) {
      const drawId: CubismIdHandle = this._modelSetting.getHitAreaId(i);
      const hit = this.isHit(drawId, x, y);
      if (hit) {
        // Get the CubismIdHandle for the hit area
        const hitAreaIdHandle = this._modelSetting.getHitAreaId(i);

        // Attempt to access the string via the internal _id.s structure
        // Accessing private members like this is generally discouraged but necessary if no public API exists
        const idString = (hitAreaIdHandle as any)?._id?.s; // Cast to any to bypass potential type errors

        // Debug log for hit area detection
        if (LAppDefine.DebugLogEnable) {
          console.log(
            `[APP] anyhitTest: Hit detected. ID Handle:`,
            hitAreaIdHandle,
            ` Extracted ID String: ${idString}`,
          );
        }
        // Return the ID string which should match the tapMotions keys
        return idString || null; // Return the extracted string, or null if it failed
      }
    }
    // Debug log if no hit area detected
    if (LAppDefine.DebugLogEnable) {
      // console.log(`[APP] anyhitTest: No specific hit area detected.`);
    }
    return null; // No hit area was hit
  }

  /**
   * Load motions for the model
   * @param group Motion group name
   */
  public preLoadMotionGroup(group: string): void {
    for (let i = 0; i < this._modelSetting.getMotionCount(group); i++) {
      const motionFileName = this._modelSetting.getMotionFileName(group, i);

      // ex) idle_0
      const name = `${group}_${i}`;
      if (this._debugMode) {
        LAppPal.printMessage(
          `[APP]load motion: ${motionFileName} => [${name}]`,
        );
      }

      fetch(`${this._modelHomeDir}${motionFileName}`)
        .then((response) => {
          if (response.ok) {
            return response.arrayBuffer();
          } else if (response.status >= 400) {
            CubismLogError(
              `Failed to load file ${this._modelHomeDir}${motionFileName}`,
            );
            return null; // Return null instead of empty ArrayBuffer
          }
        })
        .then((arrayBuffer) => {
          if (this._disposed) return;
          // Add null check before loading motion
          if (!arrayBuffer) {
            // If buffer is null, reduce motion count and return
            this._allMotionCount--;
            return;
          }

          const tmpMotion: CubismMotion = this.loadMotion(
            arrayBuffer,
            arrayBuffer.byteLength,
            name,
          );

          if (tmpMotion != null) {
            let fadeTime = this._modelSetting.getMotionFadeInTimeValue(
              group,
              i,
            );
            if (fadeTime >= 0.0) {
              tmpMotion.setFadeInTime(fadeTime);
            }

            fadeTime = this._modelSetting.getMotionFadeOutTimeValue(group, i);
            if (fadeTime >= 0.0) {
              tmpMotion.setFadeOutTime(fadeTime);
            }
            tmpMotion.setEffectIds(this._eyeBlinkIds, this._lipSyncIds);

            if (this._motions.getValue(name) != null) {
              ACubismMotion.delete(this._motions.getValue(name));
            }

            this._motions.setValue(name, tmpMotion);

            this._motionCount++;
            if (this._motionCount >= this._allMotionCount) {
              this._state = LoadStep.LoadTexture;

              // 全てのモーションを停止する
              this._motionManager.stopAllMotions();

              this._updating = false;
              this._initialized = true;

              this.createRenderer();
              this.setupTextures();
              this.getRenderer().startUp(gl);
            }
          } else {
            // loadMotionできなかった場合はモーションの総数がずれるので1つ減らす
            this._allMotionCount--;
          }
        })
        .catch((error) => {
          // Add error handling
          CubismLogError(`Failed to load motion: ${error}`);
          this._allMotionCount--;
        });
    }
  }

  /**
   * すべてのモーションデータを解放する。
   * 先调用 ACubismMotion.delete() 释放每个动作对象，再清空容器。
   */
  public releaseMotions(): void {
    for (let i = 0; i < this._motions.getSize(); i++) {
      const pair = this._motions._keyValues[i];
      if (pair?.second) {
        ACubismMotion.delete(pair.second);
      }
    }
    this._motions.clear();
  }

  /**
   * 全ての表情データを解放する。
   * 先调用 ACubismMotion.delete() 释放每个表情对象，再清空容器。
   */
  public releaseExpressions(): void {
    for (let i = 0; i < this._expressions.getSize(); i++) {
      const pair = this._expressions._keyValues[i];
      if (pair?.second) {
        ACubismMotion.delete(pair.second);
      }
    }
    this._expressions.clear();
  }

  /**
   * 释放模型所有资源（重写父类方法）。
   * 先清理 LAppModel 自有资源，再调用父类 release() 清理框架级资源。
   */
  public release(): void {
    // 0. 首先标记为已释放，防止异步回调操作已释放的资源
    this._disposed = true;

    // 1. 释放预加载的动作和表情数据
    this.releaseMotions();
    this.releaseExpressions();

    // 2. 释放 WAV 文件处理器
    if (this._wavFileHandler) {
      this._wavFileHandler.releasePcmData();
      this._wavFileHandler = null as any;
    }

    // 3. 释放模型设定
    if (this._modelSetting) {
      this._modelSetting.release();
      this._modelSetting = null as any;
    }

    // 4. 清空 ID 引用
    this._eyeBlinkIds = null as any;
    this._lipSyncIds = null as any;
    this._idParamAngleX = null as any;
    this._idParamAngleY = null as any;
    this._idParamAngleZ = null as any;
    this._idParamEyeBallX = null as any;
    this._idParamEyeBallY = null as any;
    this._idParamBodyAngleX = null as any;

    // 5. 重置状态
    this._state = LoadStep.LoadAssets;
    this._expressionCount = 0;
    this._textureCount = 0;
    this._motionCount = 0;
    this._allMotionCount = 0;
    this._consistency = false;

    // 5b. 重置兜底渲染警告标志（允许新模型再次输出一次警告）
    this._fallbackRenderWarned = false;
    this._fallbackUpdateWarned = false;
    this._warnedEmptyGroups.clear();

    // 6. 调用父类 release（释放 moc/renderer/motionManager/expressionManager 等）
    super.release();
  }

  /**
   * モデルを描画する処理。モデルを描画する空間のView-Projection行列を渡す。
   */
  public doDraw(): void {
    if (this._model == null) return;

    // キャンバスサイズを渡す
    const viewport: number[] = [0, 0, canvas.width, canvas.height];

    this.getRenderer().setRenderState(frameBuffer, viewport);
    this.getRenderer().drawModel();
  }

  /** 记录是否已输出过「非 CompleteSetup 兜底渲染」警告（仅输出一次） */
  private _fallbackRenderWarned = false;

  /**
   * モデルを描画する処理。モデルを描画する空間のView-Projection行列を渡す。
   *
   * 🆕 修复：增加渲染器兜底检测。
   * 原逻辑仅在 _state == CompleteSetup 时绘制，若模型加载链中某非关键步骤
   * （如表情/物理/动作文件 404）静默失败，_state 永远无法到达 CompleteSetup，
   * 导致模型已具备渲染条件（_model + renderer 就绪）但始终不显示。
   * 新逻辑：优先检查 CompleteSetup；若不满足则检查 renderer 是否存在并已启动，
   * 若 renderer 可用则兜底渲染并输出一次性警告日志。
   */
  public draw(matrix: CubismMatrix44): void {
    if (this._model == null) {
      return;
    }

    // 正常路径：所有资源加载完成
    if (this._state == LoadStep.CompleteSetup) {
      matrix.multiplyByMatrix(this._modelMatrix);
      this.getRenderer().setMvpMatrix(matrix);
      this.doDraw();
      return;
    }

    // 🆕 兜底路径：renderer 已创建且 model 存在时，尝试渲染
    // 场景：纹理加载完成后 renderer 实际已就绪，但某些非关键资源（表情/动作）
    //       加载失败导致 _state 未推进到 CompleteSetup
    try {
      const renderer = this.getRenderer();
      if (renderer) {
        // 检查 renderer 是否已初始化（有 program 即视为就绪）
        const isRendererReady =
          !!(renderer as any)._programId || !!(renderer as any)._shaderProgram;
        if (isRendererReady) {
          if (!this._fallbackRenderWarned) {
            this._fallbackRenderWarned = true;
            console.warn(
              `[LAppModel] ⚠️ 模型未达 CompleteSetup（当前 _state=${this._state}），` +
                `但 renderer 已就绪，启用兜底渲染。请检查模型文件完整性。`,
            );
          }
          matrix.multiplyByMatrix(this._modelMatrix);
          renderer.setMvpMatrix(matrix);
          this.doDraw();
        }
      }
    } catch {
      // renderer 不可用，静默跳过
    }
  }

  public async hasMocConsistencyFromFile() {
    CSM_ASSERT(this._modelSetting.getModelFileName().localeCompare(``));

    // CubismModel
    if (this._modelSetting.getModelFileName() != "") {
      const modelFileName = this._modelSetting.getModelFileName();

      const response = await fetch(`${this._modelHomeDir}${modelFileName}`);
      const arrayBuffer = await response.arrayBuffer();

      this._consistency = CubismMoc.hasMocConsistency(arrayBuffer);

      if (!this._consistency) {
        CubismLogInfo("Inconsistent MOC3.");
      } else {
        CubismLogInfo("Consistent MOC3.");
      }

      return this._consistency;
    } else {
      LAppPal.printMessage("Model data does not exist.");
    }
  }

  /**
   * Test if a point hits the model's rendered area
   * This is a fallback method when no hit areas are defined
   * @param x X coordinate to test
   * @param y Y coordinate to test
   */
  public isHitOnModel(x: number, y: number): boolean {
    // Skip if model is transparent
    if (this._opacity < 1) {
      return false;
    }

    // Get drawable count
    const drawableCount = this._model.getDrawableCount();

    // Get model matrix
    const matrix = this._modelMatrix.getArray();

    // Calculate determinant
    const det = matrix[0] * matrix[5] - matrix[1] * matrix[4];

    if (Math.abs(det) < 0.0001) {
      return false; // Matrix is not invertible
    }

    // Calculate inverse matrix elements
    const invDet = 1.0 / det;
    const invMatrix = {
      a: matrix[5] * invDet,
      b: -matrix[1] * invDet,
      c: -matrix[4] * invDet,
      d: matrix[0] * invDet,
      tx: (matrix[4] * matrix[13] - matrix[5] * matrix[12]) * invDet,
      ty: (matrix[1] * matrix[12] - matrix[0] * matrix[13]) * invDet,
    };

    // Transform point
    const transformedPoint = {
      x: x * invMatrix.a + y * invMatrix.c + invMatrix.tx,
      y: x * invMatrix.b + y * invMatrix.d + invMatrix.ty,
    };

    // Check each drawable area
    for (let i = 0; i < drawableCount; i++) {
      // Skip if drawable is not visible
      if (!this._model.getDrawableDynamicFlagIsVisible(i)) {
        continue;
      }

      // Get drawable vertex positions
      const vertices = this._model.getDrawableVertices(i);

      // Calculate bounds
      let minX = vertices[0];
      let minY = vertices[1];
      let maxX = vertices[0];
      let maxY = vertices[1];

      for (let j = 2; j < vertices.length; j += 2) {
        const vx = vertices[j];
        const vy = vertices[j + 1];
        minX = Math.min(minX, vx);
        minY = Math.min(minY, vy);
        maxX = Math.max(maxX, vx);
        maxY = Math.max(maxY, vy);
      }

      // Check if point is inside bounds
      if (
        transformedPoint.x >= minX &&
        transformedPoint.x <= maxX &&
        transformedPoint.y >= minY &&
        transformedPoint.y <= maxY
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Performs a hit test with fallback if the first one fails.
   *
   * @param x - X coordinate to test
   * @param y - Y coordinate to test
   * @returns boolean indicating if any hit was detected
   */
  public anyHitTestWithFallback(x: number, y: number): boolean {
    // First check named hit areas
    const hitAreaName = this.anyhitTest(x, y);

    // If a hit area was found, return true, otherwise fall back to general hit test
    return hitAreaName !== null || this.isHitOnModel(x, y);
  }

  /**
   * Starts a tap motion based on the hit area and configuration.
   * @param hitAreaName The name of the hit area that was tapped, or null if no specific area was hit
   * @param tapMotionsConfig The tap motion configuration from modelInfo
   */
  public startTapMotion(
    hitAreaName: string | null,
    tapMotionsConfig: any,
  ): void {
    if (LAppDefine.DebugLogEnable) {
      console.log(`[APP] startTapMotion called. Hit area: ${hitAreaName}`);
    }

    if (!tapMotionsConfig || Object.keys(tapMotionsConfig).length === 0) {
      if (LAppDefine.DebugLogEnable) {
        console.log("[APP] No tap motions configured.");
      }
      return;
    }

    let motionsToConsider: { [key: string]: number } = {};
    let areaSpecificHit = false;

    // 1. Check if a specific, configured hit area was tapped
    if (hitAreaName && tapMotionsConfig[hitAreaName]) {
      motionsToConsider = tapMotionsConfig[hitAreaName];
      areaSpecificHit = true;
      if (LAppDefine.DebugLogEnable) {
        console.log(
          `[APP] startTapMotion: Using motions for specific area: ${hitAreaName}`,
          motionsToConsider,
        );
      }
    }

    // 2. If no specific area hit OR the hit area has no config, combine all motions with weight summation
    if (!areaSpecificHit) {
      motionsToConsider = {};
      Object.values(tapMotionsConfig).forEach((areaMotions: any) => {
        for (const [motionName, weight] of Object.entries(areaMotions)) {
          if (motionsToConsider[motionName]) {
            motionsToConsider[motionName] += Number(weight);
          } else {
            motionsToConsider[motionName] = Number(weight);
          }
        }
      });
      if (LAppDefine.DebugLogEnable) {
        console.log(
          "[APP] startTapMotion: Using combined motions:",
          motionsToConsider,
        );
      }
    }

    // 3. Check if there are any motions to play
    if (Object.keys(motionsToConsider).length === 0) {
      if (LAppDefine.DebugLogEnable) {
        console.log("[APP] startTapMotion: No motions found to consider.");
      }
      return;
    }

    // 4. Weighted random selection
    const motionGroups = Object.keys(motionsToConsider);
    const weights = Object.values(motionsToConsider).map(Number);
    const totalWeight = weights.reduce((sum, w) => sum + (isNaN(w) ? 0 : w), 0);

    if (LAppDefine.DebugLogEnable) {
      console.log(
        `[APP] startTapMotion: Motion groups: ${motionGroups}, Weights: ${weights}, Total weight: ${totalWeight}`,
      );
    }

    if (totalWeight <= 0) {
      if (LAppDefine.DebugLogEnable) {
        console.log("[APP] startTapMotion: Total weight is zero or invalid.");
      }
      return;
    }

    let random = Math.random() * totalWeight;
    let selectedGroupName: string | null = null;

    for (let i = 0; i < motionGroups.length; i++) {
      const weight = isNaN(weights[i]) ? 0 : weights[i];
      if (random < weight) {
        selectedGroupName = motionGroups[i];
        break;
      }
      random -= weight;
    }

    if (LAppDefine.DebugLogEnable) {
      console.log(`[APP] startTapMotion: Selected group: ${selectedGroupName}`);
    }

    // 5. Play the selected motion group
    if (selectedGroupName !== null) {
      // Use PriorityForce (3) to ensure the motion plays
      this.startRandomMotion(selectedGroupName, 3);
    } else {
      if (LAppDefine.DebugLogEnable) {
        console.log("[APP] startTapMotion: Could not select a motion group.");
      }
    }
  }

  /**
   * コンストラクタ
   */
  public constructor() {
    super();

    this._modelSetting = null;
    this._modelHomeDir = null;
    this._userTimeSeconds = 0.0;

    this._eyeBlinkIds = new csmVector<CubismIdHandle>();
    this._lipSyncIds = new csmVector<CubismIdHandle>();

    this._motions = new csmMap<string, ACubismMotion>();
    this._expressions = new csmMap<string, ACubismMotion>();

    this._hitArea = new csmVector<csmRect>();
    this._userArea = new csmVector<csmRect>();

    const idManager = CubismFramework.getIdManager();

    if (idManager) {
      this._idParamAngleX = idManager.getId(
        CubismDefaultParameterId.ParamAngleX,
      );
      this._idParamAngleY = idManager.getId(
        CubismDefaultParameterId.ParamAngleY,
      );
      this._idParamAngleZ = idManager.getId(
        CubismDefaultParameterId.ParamAngleZ,
      );
      this._idParamEyeBallX = idManager.getId(
        CubismDefaultParameterId.ParamEyeBallX,
      );
      this._idParamEyeBallY = idManager.getId(
        CubismDefaultParameterId.ParamEyeBallY,
      );
      this._idParamBodyAngleX = idManager.getId(
        CubismDefaultParameterId.ParamBodyAngleX,
      );
    } else {
      // Initialize handles with null to avoid undefined errors
      this._idParamAngleX = null;
      this._idParamAngleY = null;
      this._idParamAngleZ = null;
      this._idParamEyeBallX = null;
      this._idParamEyeBallY = null;
      this._idParamBodyAngleX = null;
    }

    if (LAppDefine.MOCConsistencyValidationEnable) {
      this._mocConsistency = true;
    }

    this._state = LoadStep.LoadAssets;
    this._expressionCount = 0;
    this._textureCount = 0;
    this._motionCount = 0;
    this._allMotionCount = 0;
    this._wavFileHandler = new LAppWavFileHandler();
    this._consistency = false;
  }

  _modelSetting: ICubismModelSetting; // モデルセッティング情報
  _modelHomeDir: string; // モデルセッティングが置かれたディレクトリ
  _userTimeSeconds: number; // デルタ時間の積算値[秒]

  _eyeBlinkIds: csmVector<CubismIdHandle>; // モデルに設定された瞬き機能用パラメータID
  _lipSyncIds: csmVector<CubismIdHandle>; // モデルに設定されたリップシンク機能用パラメータID

  _motions: csmMap<string, ACubismMotion>; // 読み込まれているモーションのリスト
  _expressions: csmMap<string, ACubismMotion>; // 読み込まれている表情のリスト

  _hitArea: csmVector<csmRect>;
  _userArea: csmVector<csmRect>;

  _idParamAngleX: CubismIdHandle; // パラメータID: ParamAngleX
  _idParamAngleY: CubismIdHandle; // パラメータID: ParamAngleY
  _idParamAngleZ: CubismIdHandle; // パラメータID: ParamAngleZ
  _idParamEyeBallX: CubismIdHandle; // パラメータID: ParamEyeBallX
  _idParamEyeBallY: CubismIdHandle; // パラメータID: ParamEyeBAllY
  _idParamBodyAngleX: CubismIdHandle; // パラメータID: ParamBodyAngleX

  _state: LoadStep; // 現在のステータス管理用
  _expressionCount: number; // 表情データカウント
  _textureCount: number; // テクスチャカウント
  _motionCount: number; // モーションデータカウント
  _allMotionCount: number; // モーション総数
  _wavFileHandler: LAppWavFileHandler; //wavファイルハンドラ
  _consistency: boolean; // MOC3一貫性チェック管理用
}
