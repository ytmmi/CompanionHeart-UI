import { useState, useEffect } from "react";
import "./App.css";
import { usePlatform } from "./hooks/usePlatform";
import HomePage from "./pages/HomePage";
import PhoneHomePage from "./pages/PhoneHomePage";
import TestLive2DPanel from "./components/test/TestLive2D/TestLive2DPanel";

/**
 * 根组件 — 按平台分组挂载首页
 *
 * - Group A（Win / Web / Android 平板）→ HomePage（左右分栏布局）
 * - Group B（Android 手机）→ PhoneHomePage（窄屏触控布局）
 * - #/testlive2d → TestLive2DPanel（Live2D 调试面板）
 */
function App() {
  const { isGroupB } = usePlatform();
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // 调试路由：#/testlive2d → Live2D 测试面板
  if (hash === "#/testlive2d") {
    return <TestLive2DPanel />;
  }

  return isGroupB ? <PhoneHomePage /> : <HomePage />;
}

export default App;
