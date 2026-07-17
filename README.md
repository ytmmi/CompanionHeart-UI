# CompanionHeart-UI

AI 陪伴助手桌面应用前端，基于 Tauri 2.0 + React 19 + TypeScript 构建。

## 技术栈

| 类别     | 技术                                                   | 版本  |
| -------- | ------------------------------------------------------ | ----- |
| 桌面框架 | Tauri                                                  | ^2    |
| 前端框架 | React                                                  | ^19   |
| 语言     | TypeScript                                             | ~5.8  |
| 构建工具 | Vite                                                   | ^7    |
| 包管理   | pnpm                                                   | ^9    |
| Live2D   | **原生 Cubism SDK for Web** (替代 pixi-live2d-display) | 5-r.5 |
| 状态管理 | Zustand                                                | ^5    |

## 目录结构

```
src/
├── App.tsx                # 🚪 根组件（按平台分组挂载首页 + #/testlive2d 调试路由）
├── pages/
│   ├── HomePage.tsx       # 🏠 首页（Group A：Win/Web/平板，左右分栏布局）
│   └── PhoneHomePage.tsx  # 📱 手机首页（Group B：Android 手机，窄屏触控布局）
├── components/
│   ├── Chat/
│   │   └── ChatHistory.tsx # 聊天记录面板（左栏，10vw 宽）
│   ├── Live2D/
│   │   ├── BackgroundPanel.tsx        # 背景面板（isolation:isolate 层叠上下文）
│   │   ├── Live2DCanvasNative.tsx      # 🟢 Live2D 画布组件（原生 Cubism SDK，含长按拖动/滚轮缩放）
│   │   ├── NativeLive2DController.ts   # 🟢 原生 SDK 控制器（表情/动作/口型/视线）
│   │   └── useLive2D.ts                # 控制器生命周期 Hook
│   ├── Voice/             # 语音相关（待实现）
│   ├── Settings/          # 设置相关（待实现）
│   ├── Common/            # 通用 UI 组件（待实现）
│   └── test/              # 🧪 测试组件（开发调试用，已加入 .gitignore）
│       ├── TestChat/      # 聊天测试（TestChatWindow, TestMessageBubble, TestMessageInput, TestPipelineStatus）
│       └── TestLive2D/    # Live2D 模型测试（TestLive2DCanvas, TestLive2DPanel）
├── cubism-sdk/            # Live2D Cubism SDK for Web（原生 SDK，替代 pixi-live2d-display）
│   ├── Core/              # Cubism Core（运行时引擎）
│   ├── Framework/         # Cubism Framework（TypeScript 源码）
│   └── src/               # SDK 应用层（参考 Open-LLM-VTuber 适配）
│       ├── initLive2D.ts          # 初始化入口（CompanionHeart 适配）
│       ├── lappdelegate.ts        # 应用主类（渲染循环、pause/resume API）
│       ├── lappglmanager.ts       # WebGL 上下文管理
│       ├── lappview.ts            # 视图渲染
│       ├── lapplive2dmanager.ts   # 模型管理
│       ├── lappmodel.ts           # 模型加载与更新
│       └── lappdefine.ts          # 配置常量
├── hooks/                 # 自定义 Hooks（useTypewriter, usePlatform）
├── config/                # 应用配置（live2d 模型配置）
│   ├── live2d.ts          # 模型主配置入口（导出 DEFAULT_MODEL_INFO）
│   └── live2d/            # 各模型独立配置
│       ├── 配置规则.md    #   模型配置文件规范文档 📄
│       ├── default.ts     #   re-export 当前默认模型（→ akari）
│       ├── universal.ts   #   万能自定义模型（23纹理/38表情/3动作）
│       ├── akari.ts       #   🟢 akari 模型配置（当前默认，VTube Studio, 1纹理/4表情/3动作）
│       └── moran.ts       #   moran 模型配置（VTube Studio, 4纹理/9表情/无动作）
├── services/              # API 通信服务（apiClient）
├── store/                 # Zustand 状态管理（live2dStore：表情/动作/口型 + 交互开关）
├── types/                 # TypeScript 类型定义（live2d）
├── utils/                 # 工具函数（audioUtils, textCleaner）
└── assets/                # 静态资源
```

### public/ 静态资源

```
public/
├── backgrounds/
│   └── room/
│       └── images/        # 房间背景图片
├── cubism-core/           # Live2D Cubism Core SDK
└── live2d-models/         # Live2D 模型资产
    ├── moran/
    ├── akari_vts/
    ├── hijiki_vts/
    └── ...
```

## 首页布局（HomePage）

入口 `src/App.tsx` 通过 `usePlatform()` 按平台分组挂载首页：

| 分组    | 平台                    | 首页组件        |
| ------- | ----------------------- | --------------- |
| Group A | Win / Web / Android平板 | `HomePage`      |
| Group B | Android 手机            | `PhoneHomePage` |

另有调试路由 `#/testlive2d` → `TestLive2DPanel`（Live2D 调试面板）。

`HomePage` 采用左右两栏自适应 flex 布局：

| 区域 | 组件              | 说明                                                                                                          |
| ---- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| 左栏 | `ChatHistory`     | 聊天记录面板，固定 10vw 宽，100vh 高，灰色占位背景                                                            |
| 右栏 | `BackgroundPanel` | 背景面板，`flex: 1` 填充剩余宽度。双层叠加：底层房间背景图片（height:100%自适应），顶层 Live2D 画布（全透明） |

布局定义在 `src/pages/HomePage.tsx`。

`BackgroundPanel` 内部结构：

```
BackgroundPanel (flex:1, 100vh, transparent)
├── <img> 房间背景图 (position:absolute, 底层)
└── <div> Live2D 层 (position:absolute, inset:0, 顶层)
    └── Live2DCanvas (100%×100%, 全透明画布)
```

## Live2D

- 使用**原生 Cubism SDK for Web 5-r.5**（替代 pixi-live2d-display + PixiJS）
- 参考 [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber-Web) 的渲染层架构
- Cubism Core 使用本地文件：`public/live2dcubismcore.min.js`（从 SDK 复制）
- **主画布组件**：`Live2DCanvasNative.tsx`（旧版 PixiJS 方案 `Live2DCanvas.tsx` 已删除）
- **模型配置统一管理**：每个模型有独立配置文件在 `src/config/live2d/` 下
  - `default.ts` re-export 当前默认模型，切换模型只需修改 import 源
  - 当前默认模型：**akari**（`akari.ts`，纯英文文件名，兼容 Android APK 打包编码）
  - 配置规范见 [src/config/live2d/配置规则.md](./src/config/live2d/配置规则.md)
- 模型文件位于 `public/live2d-models/` 目录下，每个模型一个子目录
- **SDK 层特性**：
  - hit test 点击检测（`anyhitTest` + `isHitOnModel`）
  - `_deviceToScreen` 精确坐标转换
  - rAF 防抖 ResizeObserver（替代 setTimeout）
  - SDK 层公开 `pause()/resume()` API + 防双重渲染循环
  - 参数覆盖系统（`_paramOverrides`）：滑块/表情叠加通过 `setParamOverride` 每帧覆盖模型参数

### 模型交互（拖动 / 缩放）

`Live2DCanvasNative.tsx` 内置两种模型交互，开关状态存于 `live2dStore`（localStorage 持久化，默认开启）：

| 交互         | 触发方式                                                   | 开关（zustand）    |
| ------------ | ---------------------------------------------------------- | ------------------ |
| **长按拖动** | 鼠标左键长按模型 ≥300ms 后拖动（触摸端长按同样支持）       | `modelDragEnabled` |
| **滚轮缩放** | 指针悬停在模型上（hit test 命中）时滚动滚轮，平滑 easing 动画 | `wheelZoomEnabled` |

实现要点：

- **长按判定**：`mousedown`/`touchstart` 时 hit test 命中模型才启动 300ms 定时器；期间移动超过 5px 阈值则取消（判定为普通视线拖拽）；长按成立后光标变 `grabbing`，进入拖动模型模式
- **拖动坐标系**：拖动增量经 `_deviceToScreen` 转换为模型坐标，直接累加到 `_modelMatrix` 的平移分量，与 hit test / tap 坐标系一致，拖动跟手
- **缩放语义**：`CubismModelMatrix.scale()` 是绝对值语义，首次缩放时用 `WeakMap` 记录模型的基准缩放（`setupFromLayout` 计算的初始值），之后按 `baseScale × 视图缩放因子` 设置，因子 1.0 = 原始大小，范围 0.1 ~ 5.0
- **开关即时生效**：事件处理器内通过 `useLive2DStore.getState()` 实时读取开关，无需重建画布
- **UI 开关入口**：调试面板（`#/testlive2d`）控制区的 "✋ 长按拖动" / "🔍 滚轮缩放" 按钮；正式界面暂无开关，可直接调用 `setModelDragEnabled` / `setWheelZoomEnabled`

### 画布透明

Live2DCanvasNative 使用原生 Cubism SDK 的 WebGL 渲染，背景透明：

```ts
// lappdelegate.ts - 渲染循环中
gl.clearColor(0.0, 0.0, 0.0, 0.0); // alpha=0 全透明
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
```

容器使用 `position: relative` + `isolation: isolate`，创建独立层叠上下文，不脱离文档流，正常参与父级 flex 布局。内部遮罩层级仅在容器范围内生效，不会穿透覆盖页面全局元素。

### 渲染架构

```
React 组件 (Live2DCanvasNative)
  ↓ canvas ref
LAppGlManager.setCanvas() → WebGL 上下文
  ↓
LAppDelegate.initialize() → Cubism Framework 启动
  ↓
LAppView → 视图矩阵 + 渲染
  ↓
LAppLive2DManager → 模型加载 + 更新 + 参数覆盖
  ↓
requestAnimationFrame 渲染循环
```

### 核心文件一览

| 文件                                              | 说明                                              |
| ------------------------------------------------- | ------------------------------------------------- |
| `src/config/live2d.ts`                            | 模型主配置入口（导出 `DEFAULT_MODEL_INFO`）       |
| `src/config/live2d/default.ts`                    | re-export 当前默认模型（→ akari）                 |
| `src/config/live2d/universal.ts`                  | 万能自定义模型                                    |
| `src/config/live2d/akari.ts`                      | 🟢 akari VTS 模型（当前默认）                     |
| `src/config/live2d/moran.ts`                      | moran VTS 模型                                    |
| `src/config/live2d/配置规则.md`                   | 📄 模型配置文件编写规范                           |
| `src/components/Live2D/Live2DCanvasNative.tsx`    | 🟢 原生 Cubism SDK 画布组件（当前使用，含长按拖动/滚轮缩放） |
| `src/components/Live2D/NativeLive2DController.ts` | 🟢 原生 SDK 控制器（表情/动作/口型同步/参数读写） |
| `src/components/Live2D/BackgroundPanel.tsx`       | 背景面板（房间背景图 + Live2D 叠加）              |
| `src/store/live2dStore.ts`                        | Zustand 状态（表情/动作/口型 + 拖动/缩放开关持久化） |
| `src/cubism-sdk/src/initLive2D.ts`                | SDK 初始化入口                                    |
| `src/cubism-sdk/src/lappdelegate.ts`              | 应用主类（渲染循环管理、pause/resume API）        |
| `src/cubism-sdk/src/lappglmanager.ts`             | WebGL 上下文管理（canvas 注入）                   |
| `src/cubism-sdk/src/lappview.ts`                  | 视图矩阵 + 渲染                                   |
| `src/cubism-sdk/src/lapplive2dmanager.ts`         | 模型管理 + **参数覆盖系统**（`_paramOverrides`）  |
| `src/cubism-sdk/src/lappmodel.ts`                 | 模型加载与更新（呼吸/拖拽/物理/表情）             |
| `src/cubism-sdk/src/lappdefine.ts`                | 配置常量 + 动态模型路径                           |

## 🧪 测试面板

测试面板用于独立调试 Live2D 模型，路由 `#/testlive2d`。

组件：`src/components/test/TestLive2D/TestLive2DPanel.tsx`

### 功能

| 功能           | 说明                                                                           |
| -------------- | ------------------------------------------------------------------------------ |
| **模型切换**   | 在万能自定义 / akari / moran 之间切换，画布完全重建（`key` 机制强制卸载/挂载） |
| **状态指示灯** | 🟠 加载中 → 🟢 就绪，显示当前模型名称                                          |
| **表情控制**   | 切换模式（替换当前表情）和叠加模式（多个表情参数叠加，逐参数覆盖）             |
| **动作控制**   | 播放模型的动作动画（仅配置有 `motionFiles` 时显示）                            |
| **参数滑块**   | 12 个标准 Cubism 参数滑块（头部角度、眼球、嘴巴、眉毛、眼睛开合等）            |
| **呼吸开关**   | 通过保存/恢复 `_breath` 实例切换呼吸动画                                       |
| **鼠标跟随**   | 切换模型是否响应鼠标拖拽                                                       |
| **长按拖动**   | 启用/停止 鼠标左键长按拖动模型（`live2dStore.modelDragEnabled`）               |
| **滚轮缩放**   | 启用/停止 悬停模型时滚轮缩放（`live2dStore.wheelZoomEnabled`）                 |
| **重置**       | 清除所有参数覆盖，恢复呼吸动画                                                 |

### 参数覆盖系统

滑块控制的参数通过 `LAppLive2DManager.setParamOverride()` 实现，每帧在模型 `update()` 之后、`draw()` 之前写入参数值，并同步到 `_savedParameters` 以跨帧持久化。

支持平滑过渡（`_paramLerpSpeed = 0.15`）：首次设置直接到达目标值，后续微调有 15%/帧 的插值。

## 模型配置规范

详见 [src/config/live2d/配置规则.md](./src/config/live2d/配置规则.md)

### 关键规则

- 每个模型一个 `.ts` 文件，放在 `src/config/live2d/` 下
- 必填字段：`name`（显示名）、`url`（model3.json 路径）
- 当 model3.json 未定义 `Expressions` / `Motions` 时，通过 `expressionFiles` / `motionFiles` 显式列出
- `default.ts` re-export 当前默认模型，切换模型只需修改 import 源

## 已知问题 / 注意事项

### VS Code 内置浏览器不可用

VS Code Simple Browser 使用软件渲染 WebGL，无法承受 Live2D 的 draw call 负载，页面几秒内必然卡死。
请用 Chrome/Edge/Firefox 打开 `http://localhost:1420`。

### CubismIdHandle 引用比较问题

Cubism SDK 的 `getParameterIndex()` 使用引用比较（`===`），`getIdManager().getId()` 返回的新对象与模型内部对象引用不同。
所有 `*ById()` 方法失效，代码统一使用字符串匹配 + `*ByIndex()` 方式操作参数。

### 呼吸参数兼容

`CubismBreath` 的 `_breathParameters` 被赋值为 `csmVector`，但 `csmVector` 无 `.length` 且不能通过 `[i]` 索引。
呼吸遍历代码需用 `getSize()` + `at(i)` 访问。
`BreathParameterData` 的属性名**没有下划线前缀**（`parameterId` / `offset` / `peak` / `cycle` / `weight`）。

## 常用命令

```bash
pnpm dev            # 启动 Vite 开发服务器（前端预览，默认 http://localhost:1420）
pnpm tsc --noEmit   # TypeScript 类型检查
pnpm tauri dev      # 启动 Tauri 开发模式（含桌面窗口）
pnpm tauri build    # 构建发布版本
pnpm preview        # 预览构建产物
```

## 后端

前后端完全分离，后端项目位于 `../CompanionHeart-Backend/`

```bash
# 启动后端（FastAPI）
cd ../CompanionHeart-Backend
uvicorn app.main:app --reload --port 8000
```
