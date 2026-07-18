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
│   │   ├── ChatHistory.tsx    # 聊天记录面板（左栏，10vw 宽）
│   │   ├── ChatContainer.tsx  # 🟢 聊天输入容器（输入框 + 发送，接 chatStore 发送管线）
│   │   ├── MicButton.tsx      # 话筒按钮（UI 占位）
│   │   └── MoreButton.tsx     # 更多按钮（UI 占位）
│   ├── Live2D/
│   │   ├── BackgroundPanel.tsx        # 背景面板（isolation:isolate 层叠上下文 + 气泡叠加层）
│   │   ├── Live2DCanvasNative.tsx      # 🟢 Live2D 画布组件（原生 Cubism SDK，含长按拖动/滚轮缩放）
│   │   ├── NativeLive2DController.ts   # 🟢 原生 SDK 控制器（表情/动作/口型/视线）
│   │   ├── SpeechBubble.tsx            # 气泡样式控件（磨砂半透明，大小自适应文字）
│   │   ├── ModelBubbleOverlay.tsx      # 🟢 气泡定位层（跟随模型、画布内钳制、淡出销毁）
│   │   ├── live2dModelRect.ts          # 🟢 模型可视矩形计算（MVP 矩阵 → CSS 像素）
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
├── services/              # API 通信服务（apiClient，默认后端 http://127.0.0.1:8000）
├── store/                 # Zustand 状态管理
│   ├── live2dStore.ts     #   Live2D：表情/动作/口型 + 交互开关
│   └── chatStore.ts       #   🟢 聊天：发送管线（LLM→TTS→气泡打字机与语音同步）
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
    ├── Live2DCanvas (100%×100%, 全透明画布)
    └── ModelBubbleOverlay (气泡叠加层, pointer-events:none)
```

## 聊天发送管线（文字 + 语音同步）

正式聊天链路已接通：`ChatContainer` 输入框输入 → 发送（回车 / 按钮）→ `chatStore.sendMessage` → 后端 LLM + TTS → Live2D 气泡文字与语音同步播放。

```
ChatContainer（输入/发送，Shift+Enter 换行）
  ↓ sendMessage(text)
chatStore（zustand，src/store/chatStore.ts）
  ├── 1. POST /api/llm/chat        → 完整回复文本（上下文取最近 10 条）
  ├── 2. cleanTextForTTS(reply)     → 过滤 Markdown/思考内容/emoji 后
  │      POST /api/voice/tts        → MP3 音频 Blob（失败则退化为纯文字）
  └── 3. 同步播放：解码音频取时长 → 打字机速度 = 时长/字数（钳 15~200ms）
         打字机与音频同时启动，语音结束补全文字
  ↓ bubbleText / bubbleClosing
BackgroundPanel → ModelBubbleOverlay → SpeechBubble（气泡显示）
```

### 长回复分段

回复按句末标点切句、拼装成段（每段 ≤ `MAX_SEGMENT_CHARS` = 60 字符，超长单句硬切）。打字机按全文连续推进，气泡每次只显示当前段已揭示的部分，前一段显示完自动切换下一段，整体节奏仍与语音时长对齐。

### 气泡生命周期

文字全部显示完 → 停留 3s（`BUBBLE_DISMISS_DELAY_MS`）→ 透明度 1→0 淡出 1s（`BUBBLE_FADE_MS`，CSS transition）→ 清空销毁。期间用户发新消息会取消销毁、复用气泡。LLM 报错的错误气泡走同样流程。

### 气泡定位（ModelBubbleOverlay + live2dModelRect）

- `live2dModelRect.getModelScreenRect()` 复刻 SDK 的 MVP 矩阵构造（projection × view × modelMatrix），把模型空间包围盒（遍历可见 drawable 顶点，500ms 缓存）变换为画布 CSS 像素矩形——模型拖动/缩放/窗口 resize 后气泡位置都正确跟随
- 水平与模型矩形中心对齐；垂直气泡中心在模型高度 60% 处（`BUBBLE_ANCHOR_RATIO`，中间偏下）
- 最终位置钳制在画布内（8px 边距）：模型部分移出画布边缘时气泡贴边不越界；气泡 maxWidth 额外受画布宽度收窄
- rAF 每帧直接写 transform 定位，不走 React 渲染循环

### 可调常量（src/store/chatStore.ts 顶部）

| 常量                      | 默认 | 说明                       |
| ------------------------- | ---- | -------------------------- |
| `MAX_SEGMENT_CHARS`       | 60   | 气泡单段最大字符数         |
| `BUBBLE_DISMISS_DELAY_MS` | 3000 | 文字结束到开始销毁的停留   |
| `BUBBLE_FADE_MS`          | 1000 | 淡出动画时长（组件同引用） |
| `MAX_CONTEXT_MESSAGES`    | 10   | LLM 上下文条数             |
| `MIN/MAX_TYPE_SPEED_MS`   | 15/200 | 打字机速度钳制范围       |

`ModelBubbleOverlay.tsx` 内：`BUBBLE_ANCHOR_RATIO`（垂直锚点 0.6）、`EDGE_PADDING`（画布边距 8px）。

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
| `src/components/Live2D/BackgroundPanel.tsx`       | 背景面板（房间背景图 + Live2D + 气泡叠加层）      |
| `src/components/Live2D/SpeechBubble.tsx`          | 气泡样式控件（磨砂半透明，自适应文字）            |
| `src/components/Live2D/ModelBubbleOverlay.tsx`    | 🟢 气泡定位层（跟随模型/画布钳制/淡出销毁）       |
| `src/components/Live2D/live2dModelRect.ts`        | 🟢 模型可视矩形计算（MVP 矩阵 → CSS 像素）        |
| `src/components/Chat/ChatContainer.tsx`           | 🟢 聊天输入容器（发送 → chatStore 管线）          |
| `src/store/live2dStore.ts`                        | Zustand 状态（表情/动作/口型 + 拖动/缩放开关持久化） |
| `src/store/chatStore.ts`                          | 🟢 聊天状态与发送管线（LLM→TTS→气泡同步/分段/销毁） |
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

前端默认连接 `http://127.0.0.1:8000`（`src/services/apiClient.ts`），如后端跑在其他端口，启动前端时设置 `VITE_API_BASE_URL` 覆盖。

### TTS 文本清理（textCleaner）

发送给 TTS 的文本经 `cleanTextForTTS` 过滤，避免朗读无意义符号：思考/推理标签块、Markdown 符号（标题/加粗/代码块/链接/表格等）、URL、**emoji 表情**（`\p{Extended_Pictographic}` + 变体选择符/肤色修饰符/ZWJ/国旗/keycap）。气泡与聊天记录显示原始回复，不受过滤影响。
