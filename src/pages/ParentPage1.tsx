// PLATFORM: Group A — Win / Web / Android 平板 共用界面
// 父界面1：基础父界面，后续派生子界面
//   - 左右排列 2 个基础容器：左容器宽 1/3（放 live2d展示），右容器宽 2/3（空白，由子界面填充）
//   - 非首页场景：单击默认状态（pullRope-1）拉绳 → 跳转回首页（可由 props 覆盖）

import React from "react";
import Live2DShowcase from "../components/Live2D/Live2DShowcase";
import { playCurtainTransition } from "../components/Common/CurtainTransition";

interface ParentPage1Props {
  /** 右容器内容（子界面注入），默认空白 */
  children?: React.ReactNode;
  /** live2d展示 拉绳特定条件（透传） */
  cordAltActive?: boolean;
  /** live2d展示 拉绳单击回调 — 默认状态（透传），缺省为跳转回首页 */
  onCordClickPrimary?: () => void;
  /** live2d展示 拉绳单击回调 — 第二状态（透传） */
  onCordClickSecondary?: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  // 根容器 — 左右排列
  container: {
    display: "flex",
    flexDirection: "row",
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
    position: "relative",
  },
  // 左容器 — 宽 1/3，放 live2d展示
  leftPanel: {
    flexBasis: "33.333%",
    flexShrink: 0,
    minWidth: 0,
    height: "100%",
  },
  // 右容器 — 宽 2/3，空白（由子界面填充）
  rightPanel: {
    flexBasis: "66.667%",
    flexShrink: 0,
    minWidth: 0,
    height: "100%",
    overflow: "hidden",
  },
};

const ParentPage1: React.FC<ParentPage1Props> = ({
  children,
  cordAltActive,
  onCordClickPrimary,
  onCordClickSecondary,
}) => {
  /** 非首页场景默认行为：单击默认状态（pullRope-1）拉绳 → 窗帘过渡跳转回首页 */
  const handleCordClickPrimary =
    onCordClickPrimary ??
    (() => {
      playCurtainTransition(() => {
        window.location.hash = "";
      });
    });

  return (
    <div style={styles.container}>
      {/* 左容器 — live2d展示（reset：进入时仅重置模型位置，不重新加载） */}
      <div style={styles.leftPanel}>
        <Live2DShowcase
          positionMode="reset"
          cordAltActive={cordAltActive}
          onCordClickPrimary={handleCordClickPrimary}
          onCordClickSecondary={onCordClickSecondary}
        />
      </div>
      {/* 右容器 — 空白，子界面在此填充内容 */}
      <div style={styles.rightPanel}>{children}</div>
    </div>
  );
};

export default ParentPage1;
