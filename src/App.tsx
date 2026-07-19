import { useState, useEffect } from "react";
import "./App.css";
import { usePlatform } from "./hooks/usePlatform";
import HomePage from "./pages/HomePage";
import PhoneHomePage from "./pages/PhoneHomePage";
import MenuPage from "./pages/MenuPage";
import Live2DHost from "./components/Live2D/Live2DHost";
import CurtainTransition from "./components/Common/CurtainTransition";
import TestLive2DPanel from "./components/test/TestLive2D/TestLive2DPanel";

/**
 * 根组件 — 按平台分组挂载首页
 *
 * - Group A（Win / Web / Android 平板）→ HomePage（左右分栏布局）
 * - Group B（Android 手机）→ PhoneHomePage（窄屏触控布局）
 * - #/menu → MenuPage（菜单界面，首页单击默认状态拉绳进入）
 * - #/testlive2d → TestLive2DPanel（Live2D 调试面板）
 *
 * Live2DHost 为 live2d展示 的常驻宿主：真实的背景 + Live2D 模型 + 拉绳
 * 只在宿主中渲染一次，界面切换（首页 ⇄ 菜单等）时模型不卸载不重新加载，
 * 各界面通过 Live2DShowcase 占位槽声明显示位置与模型位置模式。
 */
function App() {
  const { isGroupB } = usePlatform();
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // 调试路由：#/testlive2d → Live2D 测试面板（独立环境，不挂载常驻宿主）
  if (hash === "#/testlive2d") {
    return <TestLive2DPanel />;
  }

  // 菜单界面：#/menu → MenuPage（基于 父界面1）
  const page =
    hash === "#/menu" ? <MenuPage /> : isGroupB ? <PhoneHomePage /> : <HomePage />;

  return (
    <>
      {page}
      {/* live2d展示 常驻宿主 — 跨界面保持挂载，模型不重新加载 */}
      {!isGroupB && <Live2DHost />}
      {/* 界面切换窗帘动画（最顶层覆盖） */}
      <CurtainTransition />
    </>
  );
}

export default App;
