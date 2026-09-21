# 桌面桌宠与 Live2D 接入调研 — BongoCat / dsh-tauri pet / Live2D 引擎与许可

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题     | 桌面桌宠怎么落地？BongoCat 有哪些可复用的工程做法？`untitled-pixi-live2d-engine` 能否作为 Live2D 渲染器接入桌面端 / PersonaBot presence？许可门槛在哪？                                                                                                                                                                                                                                         |
| 上游来源 | BongoCat：<https://github.com/ayangweb/BongoCat>；dsh-tauri 桌面端：<https://github.com/dsh-tauri/deepseek-harness-desktop>；untitled-pixi-live2d-engine：<https://github.com/Untitled-Story/untitled-pixi-live2d-engine>；easy-live2d：<https://github.com/Panzer-Jack/easy-live2d>；dsh-pet-component（npm）；Live2D Cubism SDK for Web 下载页：<https://www.live2d.com/en/sdk/download/web/> |
| 日期     | 2026-09-21                                                                                                                                                                                                                                                                                                                                                                                      |
| 调研方法 | 一手来源优先：GitHub API 读上游仓库源码与配置（BongoCat master `v1.1.0`；桌面端 `main`；两个引擎仓库 README / `package.json`）、npm registry 元数据、Live2D 官方 SDK 下载页。**未运行任何引擎、未实测透明窗口 WebGL 与性能**，相关结论一律标「未验证」。所有 URL 访问日期 2026-09-21。                                                                                                          |

**一句话结论**：BongoCat 的价值在**窗口 / 输入 / 渲染三层解耦**的做法，可直接作为桌面壳桌宠的工程基准；Live2D 技术可接入，`untitled-pixi-live2d-engine`（Pixi v8 / Cubism 2–5 / MIT）功能上满足需求，但真正的闸门是 **Cubism Core 的专有许可与模型授权**，且 Cubism 2.1 legacy runtime 官方已停止分发（不建议打包）。若走成熟路径，BongoCat 实际使用的是 `easy-live2d`（MPL-2.0，仅 Cubism 3/4/5）。

这不是实现提案：BotHarness 当前没有桌面端，本文件只作 presence/avatar 与未来 Live2D/口型 consumer 的参考资料；若采纳需要单独 ADR 与票据。

---

## 1. BongoCat 的窗口工程（dsh-tauri 抄的就是这层）

上游 README 明确本项目是 Windows-only 的 [Bongo-Cat-Mver](https://github.com/MMmmmoko/Bongo-Cat-Mver) 的跨平台重写（Tauri 2 + Vue 3），MIT，23.4k star。桌面端 README 把 BongoCat 列为「Tauri 桌宠窗口、原生拖动、DPI 与鼠标穿透基准」。

**窗口配方**（`src-tauri/tauri.conf.json`）：

- 主窗口：`transparent: true`、`decorations: false`、`alwaysOnTop: true`、`skipTaskbar: true`、`acceptFirstMouse: true`、不可最大化；偏好窗口用 `titleBarStyle: "Overlay"`。
- `src-tauri/Cargo.toml`：`tauri` 打开 `macos-private-api`、`tray-icon`、`protocol-asset`；macOS 额外挂 `tauri-nspanel`（悬浮在全屏应用之上）。
- 窗口行为命令拆平台模块：`src-tauri/src/plugins/window/src/commands/{linux,macos,windows}.rs`，产物是自家的 `tauri-plugin-custom-window`。

**交互三件套**（`src/pages/main/index.vue`）：

- 原生拖动：`mousedown → appWindow.startDragging()`；`Shift + 右键拖`按 `(movementX + movementY) * 0.5` 改缩放，clamp 10–500。
- 鼠标穿透：`appWindow.setIgnoreCursorEvents(value)`，跟随设置即时生效。
- 尺寸与模型绑定：watch `[window.scale, modelSize]` → `setSize(new PhysicalSize({ width: width * scale / 100, height: height * scale / 100 }))`；`useModel.handleResize()` 用 `LogicalSize` 保宽高比（取 `innerWidth`，高按比例），resize 期间显示「重绘中」占位。
- 视觉：外层容器管 `opacity`、`borderRadius`，镜像用 CSS `-scale-x-100`；canvas 与叠加图都是绝对定位满屏。
- 平台 workaround：Windows 弹原生右键菜单前**临时关 alwaysOnTop**（否则菜单被窗口盖住），关闭后恢复。

**值得直接抄的点**：窗口层不包含任何渲染逻辑，换 renderer（视频 / Live2D / 静态图）不动窗口代码；`PhysicalSize`/`LogicalSize` 的使用区分是 DPI 正确性的关键。

## 2. BongoCat 的分层与生态（比窗口更值钱）

- **输入与渲染解耦**：Rust 侧 `rdev`（键鼠全局钩子）+ `gilrs`（手柄，Windows xinput）采集输入，把动作以事件推给前端（`LISTEN_KEY.START_MOTION` / `SET_EXPRESSION`），前端只负责播。桌宠状态机不跑在渲染循环里，agent 侧（如会话活动）要驱动动作时可以复用同一条事件通道。
- **混合渲染**：Live2D 基底 + `resources/background.png` + `resources/left-keys`、`right-keys` 按键反馈贴图。基础模型只做「身体/表情」，高频瞬态反馈用静态图，避免为每个键位做动作。
- **模型目录即协议**：模型是不可变数据目录（`model3.json` + `resources/`），加模型不发版；配套在线转换器与 [Awesome-BongoCat](https://github.com/ayangweb/Awesome-BongoCat) 模型库，形成供给侧生态。
- **工程栈**：`pixi.js ^8.18.1` + `easy-live2d ^0.4.4`；pinia + `@tauri-store/pinia`（状态持久化到 Rust 侧）；updater / autostart / single-instance / tray / global-shortcut / prevent-default / macOS 权限引导；release-it + commitlint + lint-staged + antfu eslint + UnoCSS。
- **平台边界**：README 标 Linux 仅 x11（Wayland 未覆盖）——与桌面端 README 里的 WebKitGTK/Wayland 黑屏提示一致。

## 3. 桌面端（dsh-tauri）pet 现状与插件分发方式（对照）

- `packages/dsh-tauri-pet`：管理 Chat / Codex 双来源桌宠、预设宠物下载、Codex `.zip` 资源包导入、会话活动状态气泡。
- **渲染走视频路线**：预设宠物是 WebM 动作 + 预览 GIF（`preset-pets.json` 固定到 `e1ff8c1`），macOS 另出 HEVC-alpha `.mov` 镜像（`dsh-pet-mov`，固定 `be0f3bb`），因为 **WKWebView 不支持 VP9-alpha**。这条路线本质上绕开了 WebGL 与 Live2D 许可，代价是动作预渲染死、没有口型与鼠标跟随。
- 渲染组件是 `dsh-pet-component`（npm `0.2.2`，React 19 peer）：把 dsh-pet 与 Codex Pet 两套协议收进一个 `<Pet>`，依赖里**没有 pixi / WebGL**——换 Live2D 等于在 pet 窗口（独立 `pet.html`）里加一条 renderer 分支，窗口层不动。
- **插件分发三层**（桌面端 `src-tauri/resources/README.md` + `archive/docs/spec/BUILTIN_PLUGINS.zh.md`）：internal（随包分发、启动自愈、`link:` 安装）、preset（首启引导清单、按 `spec` 现装）、社区（`dsh plugin add` / DSH Market）。未来的桌宠 renderer 若作为桌面端插件分发，internal 是唯一能保证「装了就有」的层级。

## 4. Live2D 引擎候选对比

|            | `untitled-pixi-live2d-engine`                                                                                                                                                          | `easy-live2d`（BongoCat 在用）                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 许可       | **MIT**（引擎代码；Core 另计）                                                                                                                                                         | **MPL-2.0**（文件级 copyleft，改其文件需开源改文件）                                           |
| 体量       | 78 star / 7 fork（2026-09-21，单一 org）                                                                                                                                               | 0.4.4，个人项目；但 BongoCat `v1.1.0` 生产在用                                                 |
| Pixi       | **v8 原生 Render Pipe**：`extensions.add(Live2DPlugin)`，支持 `Filter` / `RenderTexture`、参与 zIndex 排序与 blend、继承 renderer resolution                                           | 把模型包成 Pixi `Sprite`，API 更薄（`Live2DSprite` / `Config` / `CubismSetting` / `Priority`） |
| Cubism     | **2.1 legacy + 3/4/5**，分 bundle entry（`/cubism-legacy`、`/cubism`、`index`）                                                                                                        | 仅 3/4/5（要求入口 HTML 先加载 `live2dcubismcore.js`）                                         |
| 功能亮点   | 纹理 LOD（`full` / `single-auto` / `false`）、自动高精度 mask、并行动作与末帧定格、`model.speak()` 口型同步、命中检测、动作优先级调度、严格 TS、`configureCubismSDK({ memorySizeMB })` | 命中检测、拖动、动作/表情/语音、口型同步、`Config.MouseFollow`；文档站友好                     |
| 上游谱系   | fork/重构自 [pixi-live2d-display-mulmotion](https://github.com/Sekai-World/pixi-live2d-display)（原 `pixi-live2d-display` 已停滞，v8 支持是缺口）                                      | `@easy-live2d/core` workspace，同样源自 pixi-live2d-display 谱系                               |
| 外部运行时 | `live2dcubismcore.min.js`（Cubism 5 SDK for Web）；legacy 需 `live2d.min.js`                                                                                                           | `live2dcubismcore.js`（Cubism 5 SDK for Web）                                                  |
| 硬件要求   | WebGL + ES6                                                                                                                                                                            | 同左                                                                                           |

结论：**要 Cubism 2.1 老模型 → 只有 untitled 的 `cubism-legacy` entry；要跟随已验证路径 → easy-live2d。** 两者都依赖官方 Core，业务代码可互换，接成 renderer seam 后选型是可替换的。

版本补充：untitled 引擎 npm 已从 `1.0.1`（2026-02）演进到 **`1.4.0`（2026-09-20）**，1.4.0 原生修复了 extensionless/blob URL 纹理识别与 Cubism teardown 生命周期，并新增纹理 LOD（1.1.0）等；AnySoul 当年在 `1.0.1` 上自建运行时与 workaround 的完整复盘见 `docs/research/2026-09-21-anysoul-live2d-runtime.md`（含 LLM tool call → 行为映射与动画 runtime 的可复用设计）。

## 5. 许可与合规闸门（真正的阻塞项）

1. **Cubism Core 是专有软件**：`live2dcubismcore.min.js` 只能从官方 SDK 下载页获取，使用前需接受 Live2D 的 Cubism SDK 发布许可；免费额度/署名义务等具体条款本轮**未逐条核对**。Core 不得单独再分发，但随应用分发需按许可执行（标「未验证」）。
2. **Cubism 2.1 legacy 不要打包**：官方 2019-09-04 停止分发 `live2d.min.js`，上游 README 自己给的是镜像地址；把镜像 runtime 打进发布包有法律灰区，只发 Cubism 5（向下兼容 3/4 模型）。
3. **模型授权独立于引擎**：大量免费模型禁商用；如果要随包/内置分发模型，逐个核对模型的许可。
4. **声明义务**：无论选哪个引擎，都要在 `LICENSE` / `THIRD_PARTY_NOTICES` 增补（引擎许可 + Core 许可 + 模型许可三层）；参考桌面端 `LICENSE.details` 与 ADR-0032 对 THIRD_PARTY_NOTICES 的处理。
5. 现有 ADR-0032 已把 blobatar 动效与表情推迟到 v1.1；Live2D 是更重的路线，不能绕过该决策直接做。

## 6. 若做接入的架构草图（application-defined，未验证）

- **renderer seam**：pet 窗口内按模型类型分流 `video | live2d`。Live2D 路径 = `<canvas>` + `new Application()` + `backgroundAlpha: 0` + `autoDensity` + `extensions.add(Live2DPlugin)`（untitled）或 `Live2DSprite`（easy）。
- **Core 本地加载**：`live2dcubismcore.min.js` 作为应用资源（不挂 CDN）随包分发，版本 pin；构建期校验 hash。
- **状态映射**：PersonaBot Activity / Presence → `idle / thinking / replying` 对应 motion group 与 expression；口型同步只消费 **`PersonaBot Output Committed`**（#125）这类已提交、允许公开的内容，与 #119 的边界保持一致。
- **交互**：mousemove 用引擎命中检测判断是否在模型上，动态切 `setIgnoreCursorEvents`，让穿透在「非模型区域」生效。
- **DPI / 性能**：`resolution: devicePixelRatio` + `autoDensity`、设 `maxFPS` 上限、纹理 LOD `single-auto`、`configureCubismSDK({ memorySizeMB: 32 })`（多模型/复杂模型时）；窗口尺寸 = 模型宽高 × scale。
- **平台**：macOS 走透明 WebGL 反而省掉 VP9-alpha 转码；Linux Wayland + WebKitGTK 的透明 WebGL 风险高于视频（桌面端 README 已有兜底，但 Live2D 场景需重测，未验证）。

## 7. 与 BotHarness 的关系

- 本文件是参考资料，不产生决策；若未来做桌面壳 / 桌宠 / Live2D presence，需要新 ADR（产品路线 + 许可闸门）与独立票据。
- 相关：#125（Live2D 被点名为 Output Committed 的未来 consumer 之一，本票不实现）、#119（orchestrator map，明确不扩展 TTS/Live2D consumer）、#58（自定义头像资产）、ADR-0032（头像身份；动效/表情推迟 v1.1）。
- 未验证清单：未运行 `untitled-pixi-live2d-engine` 与 `easy-live2d`；未在 Tauri 透明窗口实测 WebGL；未核对 Cubism 许可条款与免费额度；未测性能/耗电；`dsh-pet-component` 内部如何扩展 renderer 未读源码。

## 8. 参考

- BongoCat：<https://github.com/ayangweb/BongoCat>（master，`package.json` `v1.1.0`、`src-tauri/tauri.conf.json`、`src/pages/main/index.vue`、`src/composables/useModel.ts`、`src-tauri/src/plugins/window/`）
- dsh-tauri 桌面端：<https://github.com/dsh-tauri/deepseek-harness-desktop>（`packages/dsh-tauri-pet`、`src-tauri/resources/README.md`、README 的插件三层与 Linux 提示）
- `untitled-pixi-live2d-engine`：<https://github.com/Untitled-Story/untitled-pixi-live2d-engine>（README、`package.json`）
- `easy-live2d`：<https://github.com/Panzer-Jack/easy-live2d>（README、`package.json`；文档站 <https://panzer-jack.github.io/easy-live2d/>）
- `dsh-pet-component`：npm <https://www.npmjs.com/package/dsh-pet-component>（`0.2.2`）
- Cubism SDK for Web / Core 下载：<https://www.live2d.com/en/sdk/download/web/>
- 相关：`docs/research/2026-09-21-anysoul-live2d-runtime.md`（AnySoul 组合方式、引擎 1.0.1→1.4.0 delta、DSH-Live2D/DSH-Avatar 设计输入）
