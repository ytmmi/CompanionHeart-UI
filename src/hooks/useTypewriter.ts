import { useEffect, useRef, useCallback } from "react";

/**
 * 打字机效果 Hook
 * 将目标文本以逐字方式逐步更新到 displayCallback 中
 *
 * @param speed 每字符间隔（毫秒），默认 30
 */
export function useTypewriter(speed: number = 30) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetRef = useRef<string>("");
  const currentRef = useRef<number>(0);
  const callbackRef = useRef<((text: string) => void) | null>(null);
  const activeRef = useRef<boolean>(false);

  // 清除定时器
  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    activeRef.current = false;
  }, []);

  /**
   * 开始打字机效果
   * @param fullText  要逐字显示的完整文本
   * @param onUpdate  每显示一个新字符时的回调
   */
  const start = useCallback(
    (fullText: string, onUpdate: (currentText: string) => void) => {
      clear();
      targetRef.current = fullText;
      currentRef.current = 0;
      callbackRef.current = onUpdate;
      activeRef.current = true;

      // 立即显示第一个字符（如果文本非空）
      if (fullText.length > 0) {
        const firstChar = fullText[0];
        currentRef.current = 1;
        onUpdate(firstChar);
      }

      // 如果只有一个字符或空，直接完成
      if (fullText.length <= 1) {
        activeRef.current = false;
        return;
      }

      // 按 speed 间隔逐字追加
      timerRef.current = setInterval(() => {
        if (!activeRef.current) {
          clear();
          return;
        }

        const idx = currentRef.current;
        if (idx >= targetRef.current.length) {
          clear();
          return;
        }

        currentRef.current = idx + 1;
        callbackRef.current?.(targetRef.current.slice(0, currentRef.current));
      }, speed);
    },
    [clear, speed],
  );

  /**
   * 跳过动画，直接显示完整文本
   */
  const skip = useCallback(() => {
    clear();
    if (callbackRef.current && targetRef.current) {
      callbackRef.current(targetRef.current);
    }
    activeRef.current = false;
  }, [clear]);

  // 组件卸载时清理
  useEffect(() => {
    return () => clear();
  }, [clear]);

  return { start, skip, clear, isActive: () => activeRef.current };
}
