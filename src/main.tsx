import ReactDOM from "react-dom/client";
import App from "./App";

// 注意：不使用 React.StrictMode，因为 Live2D Cubism SDK 使用全局单例管理 WebGL 上下文，
// StrictMode 在开发环境下的双重挂载（mount→unmount→remount）会释放已初始化的 WebGL 资源，
// 导致第二次挂载时模型无法正常渲染。WebGL 应用通常建议关闭 StrictMode。
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
