import { useState, useEffect } from "react";
import "./App.css";
import { usePlatform } from "./hooks/usePlatform";
import HomePage from "./pages/HomePage";
import PhoneHomePage from "./pages/PhoneHomePage";
import TestLive2DPanel from "./components/test/TestLive2D/TestLive2DPanel";

/**
 * 调试模式：直接以 TestLive2DPanel 为首页，排除路由干扰
 * 后续恢复为正式路由
 */
function App() {
  return <TestLive2DPanel />;
}

export default App;
