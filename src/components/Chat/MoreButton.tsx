// PLATFORM: Group A — Win / Web / Android 平板 共用控件
// 更多按钮：显示更多图标（菜单等实际功能待开发）

import React from "react";
import moreUrl from "../../assets/svg/more.svg";

interface MoreButtonProps {
  /** 点击回调 */
  onClick?: () => void;
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

const MoreButton: React.FC<MoreButtonProps> = ({ onClick, size = 20, style }) => {
  return (
    <button
      type="button"
      style={{ ...btnStyle, ...style }}
      onClick={onClick}
      title="更多"
    >
      <img
        src={moreUrl}
        alt="更多"
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

export default MoreButton;
