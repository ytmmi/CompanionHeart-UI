// PLATFORM: Group A — Win / Web / Android 平板 共用控件
// 话筒开关按钮：显示开/关图标，点击切换（实际录音功能待开发）

import React from "react";
import micOnUrl from "../../assets/svg/micOn.svg";
import micOffUrl from "../../assets/svg/micOff.svg";

interface MicButtonProps {
  /** 话筒是否开启 */
  on: boolean;
  /** 点击切换回调（参数为切换后的状态） */
  onToggle?: (on: boolean) => void;
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

const MicButton: React.FC<MicButtonProps> = ({
  on,
  onToggle,
  size = 20,
  style,
}) => {
  return (
    <button
      type="button"
      style={{ ...btnStyle, ...style }}
      onClick={() => onToggle?.(!on)}
      title={on ? "话筒：开" : "话筒：关"}
    >
      <img
        src={on ? micOnUrl : micOffUrl}
        alt={on ? "话筒开" : "话筒关"}
        style={{
          width: size,
          height: size,
          display: "block",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
    </button>
  );
};

export default MicButton;
