# CompanionHeart-UI

> AI 陪伴助手（AI Companion）多平台前端 · 基于 **Tauri 2.0 + React 19 + TypeScript**

CompanionHeart-UI 是 AI 陪伴助手的前端应用，使用原生 **Cubism SDK for Web** 渲染 Live2D 虚拟形象，与 Python 后端（[CompanionHeart-Backend](../CompanionHeart-Backend/)）完全分离，通过 HTTP REST 通信。一套代码同时面向 **Windows 桌面、Web 浏览器、Android 手机 / 平板**。

---

## ✨ 核心特性

- **Live2D 虚拟形象** — 原生 Cubism SDK for Web + WebGL 渲染，支持表情切换、动作播放、口型同步、视线追踪、点击命中检测；悬停滚轮缩放、鼠标长按拖动、触屏双指手势（缩放 + 平移）。
- **文字聊天** — 输入发送 → LLM 回复 → 气泡打字机与 TTS 语音**同步播放**；长回复自动分段、气泡跟随模型、停留后淡出销毁。
- **语音** — TTS 语音合成已集成；ASR 语音识别开发中。
- **跨界面复用的 Live2D 展示** — 模型在界面切换时不卸载、不重载，首页位置持久化。
- **界面导航与切换动画** — 拉绳单击跳转 + 窗帘过渡动画。
- **多平台适配** — 统一的平台感知，覆盖 Windows / Web / Android 手机与平板。

---

## 🧱 技术栈

| 类别     | 技术                        | 说明                              |
| -------- | --------------------------- | --------------------------------- |
| 桌面框架 | **Tauri 2.0**               | Rust 驱动的跨平台外壳             |
| 前端框架 | **React 19**                | UI 组件                           |
| 语言     | **TypeScript**              | 类型安全                         |
| 构建工具 | **Vite**                    | 开发与打包                       |
| 包管理   | **pnpm**                    | 依赖管理                         |
| 状态管理 | **Zustand**                 | 轻量全局状态                     |
| Live2D   | **原生 Cubism SDK for Web 5-r.5** | 虚拟形象渲染                |
| 通信     | **HTTP REST**               | 与后端交互                       |

---

## 🚀 快速开始

### 环境要求

- **Node.js** LTS（≥18）、**pnpm** ≥9
- **Rust** 最新稳定版（Tauri 桌面 / Android 构建需要）
- **Python** ≥3.10（运行后端需要）
- Windows 桌面构建：Visual Studio Build Tools（含「使用 C++ 的桌面开发」）+ Edge WebView2
- Android 构建：Android Studio + JDK 17 + SDK/NDK

### 安装与运行

```bash
pnpm install            # 安装依赖

pnpm dev                # 启动 Vite 开发服务器（Web 预览，默认 http://localhost:1420）
pnpm tauri dev          # 启动 Tauri 桌面开发模式
pnpm tauri android dev  # 连接设备 / 模拟器运行 Android
```

### 构建

```bash
pnpm tsc --noEmit       # TypeScript 类型检查
pnpm build              # Web 生产构建（产物在 dist/）
pnpm tauri build        # 构建 Windows 发布版本（.exe / .msi）

.\android-build.ps1 -Build            # 构建 Android APK（仅 arm64-v8a）
.\android-build.ps1 -Build -Sign      # 构建 + 签名
.\android-build.ps1 -Build -Install   # 构建 + 签名 + 安装到设备
```

---

## 🔌 连接后端

前后端完全分离，后端项目位于 `../CompanionHeart-Backend/`：

```bash
cd ../CompanionHeart-Backend
uvicorn app.main:app --reload --port 8000
```

后端地址在 `src/services/apiClient.ts` 中配置，可用环境变量 `VITE_API_BASE_URL` 覆盖（在项目根目录创建 `.env` 即可）。

---

## 📁 项目结构

```
CompanionHeart-UI/
├── src/                # React 前端源码
│   ├── pages/          #   页面（首页 / 手机首页 / 菜单等）
│   ├── components/     #   UI 组件（Live2D / Chat / Common / ...）
│   ├── cubism-sdk/     #   Live2D Cubism SDK for Web（原生 SDK 应用层）
│   ├── config/         #   应用配置（Live2D 模型配置）
│   ├── hooks/          #   自定义 Hooks
│   ├── services/       #   API 客户端
│   ├── store/          #   Zustand 状态管理
│   └── utils/          #   工具函数
├── public/             # 静态资源（Cubism Core / Live2D 模型 / 背景图）
├── src-tauri/          # Tauri Rust 外壳
├── android-build.ps1   # Android 构建脚本
├── vite.config.ts      # Vite 配置
└── package.json
```

---

## 🎭 Live2D

- 使用**原生 Cubism SDK for Web 5-r.5**（WebGL 渲染），渲染层架构参考 [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber-Web)。
- 每个模型一个独立配置文件，放在 `src/config/live2d/` 下；切换默认模型只需修改 `src/config/live2d/default.ts` 的 re-export 源，生产构建时同步更新 `vite.config.ts` 中的 `BUNDLED_MODELS` 白名单即可。
- 模型交互（长按拖动 / 滚轮缩放 / 双指手势）开关由 `live2dStore` 管理并持久化到 localStorage，默认开启。

---

## 🏗️ 生产构建优化

- **Rust release profile**（`src-tauri/Cargo.toml`）：`opt-level=3` + `lto` + `strip` 等，性能优先并压缩体积。
- **Live2D 模型瘦身**（`vite.config.ts` 的 `BUNDLED_MODELS`）：生产产物只保留默认模型，大幅减小体积。
- **Android 仅构建 arm64-v8a**：单 ABI，APK 更小、构建更快。

---

## 🙏 致谢

- **Live2D 画布参考**：[Open-LLM-VTuber / Open-LLM-VTuber-Web](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber-Web)
- **Live2D 引擎**：[Live2D Cubism SDK for Web](https://www.live2d.com/download/cubism-sdk/download-web/)
- [Tauri](https://tauri.app/) · [React](https://react.dev/) · [Vite](https://vitejs.dev/) · [Zustand](https://github.com/pmndrs/zustand)

---

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源。

> Live2D Cubism SDK / Core 及各 Live2D 模型资产受 Live2D Inc. 各自的许可协议约束，不在本项目 MIT 许可范围内，使用前请遵循其官方授权条款。
