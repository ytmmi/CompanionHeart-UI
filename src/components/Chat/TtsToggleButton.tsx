// PLATFORM: Group A — Win / Web / Android 平板 共用控件
// TTS 语音开关按钮：控制 chatStore.ttsEnabled 并同步后端开关
//   启用 — sound_on.svg；禁用 — sound_off.svg

import React from "react";
import soundOnUrl from "../../assets/svg/sound_on.svg";
import soundOffUrl from "../../assets/svg/sound_off.svg";
import { useChatStore } from "../../store/chatStore";

interface TtsToggleButtonProps {
  /** 图标尺寸（px），默认 20 */
  size?: number;
  /** 附加样式（作用于按钮根元素） */
  style?: React.CSSProperties;
}

const btnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  padding: 0,
  border: "none",
  borderRadius: 6,
  backgroundColor: "transparent",
  cursor: "pointer",
};

const TtsToggleButton: React.FC<TtsToggleButtonProps> = ({
  size = 20,
  style,
}) => {
  const ttsEnabled = useChatStore((s) => s.ttsEnabled);
  const setTtsEnabled = useChatStore((s) => s.setTtsEnabled);

  return (
    <button
      type="button"
      style={{ ...btnStyle, ...style }}
      onClick={() => void setTtsEnabled(!ttsEnabled)}
      title={ttsEnabled ? "语音：开（点击禁用 TTS）" : "语音：关（点击启用 TTS）"}
    >
      <img
        src={ttsEnabled ? soundOnUrl : soundOffUrl}
        alt={ttsEnabled ? "语音开" : "语音关"}
        style={{
          width: size,
          height: size,
          display: "block",
          userSelect: "none",
          pointerEvents: "none",
          opacity: ttsEnabled ? 1 : 0.45,
          // 喇叭图形在素材中偏左（喇叭主体在左、声波在右），
          // 微移使其与话筒/更多图标视觉居中对齐
          transform: "translateX(2px)",
        }}
      />
    </button>
  );
};

export default TtsToggleButton;
