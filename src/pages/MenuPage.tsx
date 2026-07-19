// PLATFORM: Group A — Win / Web / Android 平板 共用界面
// 菜单界面：基于 父界面1 派生（路由 #/menu）
//   - 由首页单击默认状态（pullRope-1）的拉绳跳转进入
//   - 右容器暂为空白，后续填充菜单内容

import React from "react";
import ParentPage1 from "./ParentPage1";

const MenuPage: React.FC = () => {
  return <ParentPage1 />;
};

export default MenuPage;
