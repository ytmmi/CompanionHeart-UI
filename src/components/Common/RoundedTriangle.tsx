// 通用素材 — 带圆角的三角形
// 图形来自内部资源 assets/svg/rounded-triangle.svg（角朝上基准图形，currentColor 上色），
// 以 ?raw 方式内联渲染，direction 控制角的朝向，切换朝向时以旋转动画过渡

import React from "react";
import triangleRaw from "../../assets/svg/rounded-triangle.svg?raw";

export type TriangleDirection = "up" | "down" | "left" | "right";

interface RoundedTriangleProps {
  /** 三角形宽度（px），默认 16 */
  size?: number;
  /** 填充颜色，默认 #999 */
  color?: string;
  /** 角的朝向，默认 up */
  direction?: TriangleDirection;
  /** 旋转动画时长（ms），默认 250 */
  duration?: number;
  /** 附加样式（作用于根元素） */
  style?: React.CSSProperties;
}

/** 各朝向对应的旋转角度（基准图形角朝上） */
const ROTATION: Record<TriangleDirection, number> = {
  up: 0,
  right: 90,
  down: 180,
  left: 270,
};

const RoundedTriangle: React.FC<RoundedTriangleProps> = ({
  size = 16,
  color = "#999",
  direction = "up",
  duration = 250,
  style,
}) => {
  return (
    <span
      style={{
        display: "block",
        width: size,
        height: size,
        lineHeight: 0,
        // SVG 内部使用 currentColor，此处 color 即为三角形颜色
        color,
        transform: `rotate(${ROTATION[direction]}deg)`,
        transition: `transform ${duration}ms ease`,
        ...style,
      }}
      // 内联渲染 SVG 素材（svg 元素自动缩放到容器尺寸）
      dangerouslySetInnerHTML={{
        __html: triangleRaw.replace(
          "<svg ",
          `<svg width="${size}" height="${size}" `,
        ),
      }}
    />
  );
};

export default RoundedTriangle;
