import { create } from "zustand";

export interface Live2DState {
  /** 当前表情名称 */
  expression: string;
  /** 当前动作名称 */
  motion: string;
  /** 是否正在播放动作 */
  isMotionPlaying: boolean;
  /** 口型张开度（0~1，TTS 同步用） */
  mouthOpen: number;

  setExpression: (expr: string) => void;
  setMotion: (motion: string) => void;
  setIsMotionPlaying: (playing: boolean) => void;
  setMouthOpen: (value: number) => void;
}

export const useLive2DStore = create<Live2DState>((set: any) => ({
  expression: "",
  motion: "",
  isMotionPlaying: false,
  mouthOpen: 0,

  setExpression: (expression: string) => set({ expression }),
  setMotion: (motion: string) => set({ motion }),
  setIsMotionPlaying: (isMotionPlaying: boolean) => set({ isMotionPlaying }),
  setMouthOpen: (mouthOpen: number) => set({ mouthOpen }),
}));
