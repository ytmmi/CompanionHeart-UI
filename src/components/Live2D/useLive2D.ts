import { useRef, useState, useCallback } from "react";
import type {
  Live2DControllerAPI,
  Live2DExpression,
  EmotionMap,
} from "../../types/live2d";

/**
 * useLive2D — Live2D 模型控制器 Hook
 *
 * 基于原生 Cubism SDK。
 * 参考 Open-LLM-VTuber 的分离式 Hook 设计。
 * 提供控制器生命周期管理，支持情感名称 ⇄ 表情文件映射。
 *
 * 优化：
 * - 用 `onControllerReady` 回调替代 `setInterval` 轮询，消除 300ms 延迟和不必要的定时器开销
 * - 使用 Live2DControllerAPI 接口，不依赖具体实现
 *
 * 用法：
 * ```tsx
 * const { ctrlRef, isReady, expressions, motions, onControllerReady } = useLive2D();
 * <Live2DCanvas controllerRef={ctrlRef} onControllerReady={onControllerReady} />
 * ```
 */
export function useLive2D(emotionMap?: EmotionMap) {
  const ctrlRef = useRef<Live2DControllerAPI | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [expressions, setExpressions] = useState<
    { name: string; file: string }[]
  >([]);
  const [motions, setMotions] = useState<{ name: string; file: string }[]>([]);

  /** 控制器就绪回调（代替轮询），由 Live2DCanvas 在初始化完成后同步调用 */
  const onControllerReady = useCallback((ctrl: Live2DControllerAPI) => {
    setExpressions([...ctrl.expressionList]);
    setMotions([...ctrl.motionList]);
    setIsReady(true);
  }, []);

  /**
   * 切换表情（支持语义化情感名称）
   * 如果传入了 emotionMap，优先查找情感名称映射
   */
  const setExpression = useCallback(
    (name: string) => {
      const ctrl = ctrlRef.current;
      if (!ctrl) return;

      // 如果是语义化情感名称且存在映射，转换为表情文件路径
      if (emotionMap && emotionMap[name]) {
        // emotionMap 的值是表情文件名，需要匹配 expressionList
        const targetFile = emotionMap[name];
        // 在 expressionList 中查找匹配项
        const match = ctrl.expressionList.find(
          (exp: Live2DExpression) =>
            exp.file === targetFile || exp.name === targetFile,
        );
        if (match) {
          ctrl.setExpression(match.name);
          return;
        }
      }

      // 直接作为表情名称设置
      ctrl.setExpression(name);
    },
    [emotionMap],
  );

  /** 播放动作 */
  const setMotion = useCallback((name: string) => {
    ctrlRef.current?.setMotion(name);
  }, []);

  /** 设置口型开合度 */
  const setMouthOpen = useCallback((value: number) => {
    ctrlRef.current?.setMouthOpen(value);
  }, []);

  /** 设置视线焦点 */
  const focus = useCallback((x: number, y: number) => {
    ctrlRef.current?.focus(x, y);
  }, []);

  return {
    ctrlRef,
    isReady,
    expressions,
    motions,
    onControllerReady,
    setExpression,
    setMotion,
    setMouthOpen,
    focus,
  };
}
