# DSH 旗舰社区 UI 插件源码级深潜（EasyRewrite / rewind / subagent-ui / background-agents / channel-view）

## 0. 元信息

| 项          | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 问题        | 3-4 个旗舰社区「client UI 插件」的 UI 是怎么搭建的（组件/状态/交互/持久化）？有哪些代码级最佳实践可被 BotHarness M3 `@botharness/client`（roster / 会话 UI）直接借鉴？有哪些坑与反面教材？                                                                                                                                                                                                                                                             |
| 样本        | ① Renzic-Stone/DSH-EasyRewrite（115★，#3456）② SiriLee/dsh-rewind（76★，#4592）③ miuzel/dsh-subagent-ui（3★，#4876）④ PerryLink/dsh-background-agents（16★，#2487）⑤ 附录：RGarvel/dsh-channel-view（#4818 watchlist，footer.action + projections + portal）                                                                                                                                                                                           |
| Pinned SHAs | EasyRewrite `ecd336ec81b6c561c3d75d7ee12ed177c404b28c`（2026-09-19 03:46 +0800，v2.5.4）· rewind `9b26ab463def45dd073ac950a26925fccd40e6c8`（2026-09-18 13:29 +0800，v0.13.0-alpha.2）· subagent-ui `e1c7fc262b41049b05ba4247d48c9a1c24b7b67a`（2026-09-12，v1.4.0）· background-agents `d1b2ec9d2ebad5e7bd9e6bfda83648ac381a4220`（2026-09-19 13:27 +0800，0.9.7）· channel-view `f6383668141a96cbe5ddeefb278b575d1855a779`（2026-09-04，v2.5 spike） |
| 访问日期    | 2026-09-19                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 调研方法    | WSL 浅克隆到 `/tmp/ui-dives/<name>` 后逐文件读源码/文档（UNC 只读）。**未安装、未运行、未构建任何插件**；运行时行为一律标「未验证」。所有 `file:line` 相对各仓库 Pinned SHA 的仓库根。官方侧对照使用既有 pinned DSH 源码克隆 `/tmp/dsh-src-client`（`ddefc45fbc7f8e46dd73185e68295696d1297887`，与 `docs/research/2026-09-19-dsh-plugin-authoring-client.md` 同源）                                                                                    |
| 边界        | EasyRewrite/subagent-ui 都在「dsh 0.1.2-0.1.5 线」上验证过，本调研同时对照了 0.1.6-alpha.2 的官方 client 契约；两者不一致处即为「版本漂移」，本文一律显式标注。channel-view 只有预构建 `lib/client.js`（无源码），按 README 自述 + bundle 形态观察，标注「未读完整源码」                                                                                                                                                                               |
| 不重复      | 官方 client 作者规范见 `docs/research/2026-09-19-dsh-plugin-authoring-client.md`（下称「作者规范」）；生态广扫见 `docs/research/2026-09-19-dsh-community-plugins-survey.md`。本文只做源码级实现与代码形态                                                                                                                                                                                                                                              |

**一句话结论：这五份插件代表了 DSH client 插件的三条成熟路线——「DOM/portal 桥接派」（rewind、channel-view：把 React 控件 portal 进宿主既有行，副作用最小但耦合宿主内部 DOM）、「槽位整装派」（subagent-ui、background-agents：整块面板挂 header/footer 槽，数据尽量走官方会话投影）、「复刻渲染器派」（EasyRewrite：keyed 槽 priority:-1 整体接管 user 气泡）——对 BotHarness roster 最值得抄的不是界面，而是它们的四条工程骨架：slot 注册的 fiber 绑定 + 编译期 slot pin、服务面的结构类型化（版本漂移不炸编译）、只读投影 + 纯 presenter + `useSyncExternalStore` 的数据流、以及按会话的草稿/pending 持久化与「惰性提交」交互模型。**

---

## 1. Renzic-Stone/DSH-EasyRewrite —— keyed 槽整体接管 + 惰性提交

### 1.1 形态与构建

- `package.json:7-11`：`exports` 只有 `.`/`./client`/`./package.json` 三条，**没有类型声明**——整个包是手写 JS。
- `package.json:12-24`：`dsh.bundle.patch` → `./cordis.patch.yml`（4 行的 `insert` 行，`cordis.patch.yml:2-4`）；`dsh.client = { inject: ["slots","sessions","workspaces"], platform: "web" }`。注意这里的 `inject` 填的是**服务名而不是包名**，与官方「信息性包名依赖边」的口径不符（写作目的应为声明运行时服务；因该字段不参与激活顺序，未观察到实际危害，推断）。
- 构建：`build.mjs:13-20` 只做一件事——读 `assets/*.png` → base64 → 替换 `src/client.src.js` 里的 `__DASH_*_ICON__` 占位符 → 写 `lib/client.js`。**没有打包器**：`src/client.src.js:8-12` 直接手写 `window.__ModuleLoader__.load({ id, factory })` 并用 factory 注入的 `require("react")`、`require("@deepseek-ai/dsh-client-ui-primitives")`。产物 `lib/client.js` 与源文件等长（4272 行），`lib/index.js`（550 行 host 半）直接手写提交，不经构建。
- host 半 `lib/index.js:95-96`：`export const inject = ['webServer','sessions','settings','agents']`，纯 HTTP 路由插件。

### 1.2 UI 实现

**slot 注册（`src/client.src.js:3949-4267`，全部在同一个 `ctx.effect` 内）**

| 槽位                                  | kind/scope    | 注册参数                                                               | 组件                                      |
| ------------------------------------- | ------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| `conversation.chat.node`              | keyed/session | `key:"user"`, **`priority:-1`**（覆盖官方 user 渲染器）, `inject` face | `UserBubbleView`（`:4106-4143`）          |
| `conversation.input.dock`             | list/session  | `id:"dsh-easyrewrite-recall-banner"`, `order:-10`                      | `RecallBanner`（`:4146-4200`）            |
| `settings.plugin.item`                | list/root     | `key+id` 双写, `order:30`                                              | `EasyRewriteSettingsCard`（`:4202-4216`） |
| `conversation.chat.assistant-actions` | list/session  | `id:"dsh-easyrewrite-version-pager"`, `order:10`                       | `VersionPager`（`:4218-4261`）            |

- 注册不是逐条 `ctx.slots.inject` 收集 disposer，而是外层一个 `ctx.effect(function(){...}, "dsh-easyrewrite: UserBubbleView overlay")`（`:3950`），内部把 5 个注册返回值塞进本地 `disposers` 数组，effect 的返回函数统一卸载并移除注入的 `<style>`（`:4262-4266`）。这是官方 `ctx.effect` 语义的可用写法，但与官方示例「一个 inject 一个注册、fiber 各自回收」相比更集中、更易漏错。
- **props 自给自足**：注册条目上的 `inject(sessionId)` face 返回 `openSession/ctxWorkspaces/ctxSessions/modelSel/inputActions/inputState/restoreSession`（`:4111-4141`、`:4151-4197`）。因为 0.1.2 起宿主不再下发 `inputActions`，它在 face 内部经 `ctx.sessions.scope(sessionId).get("conversation").input.for(scope)` 自取（`:4152-4162`），这是**对官方 slot props 收缩的现场适配**。

**组件树/状态**

- `UserBubbleView`（`:2841` 起）：display / confirming / editing / recall-pending 四态；局部 `React.useState` × 十余个（确认、编辑、图片工作集、拖拽态……），把「同一会话单待定」的约束放在组件里靠 pending store 维持。整个文件**没有一个 `.tsx`/JSX**，全部 `React.createElement`；`aria-label`/`role` 在自绘按钮上有做（版本翻页器 `:2600,2609`、复制键 `:2631`、菜单 `role="menuitemradio"`+`aria-checked` `:2780,2802`）。
- 版本翻页器 `VersionPager`（`:2525-2613`）：hooks 无条件前置（注释明写 React 规则，`:2527`），只挂在**会话最后一个 TurnTail**——通过 `snapshot.order` 末尾 turn-tail 的 `data.closing.finalNode.messageId === props.messageId` 判定（`:2550-2565`），避免每个历史回合都渲染。键盘 ←/→ 全局监听（`:2533-2546`）。
- 版本家族数据**不落自建存储**：从官方 `sessions.list` 快照的 `parentId` lineage 派生（`:65-132`），排除 `origin==="subagent"` 与 `blank`；注释说明这是 review #6 后删掉 localStorage 自建版本树的结果，并在启动时清扫旧键（`:4034-4043`）。

**状态与数据流（惰性提交）**

- pending store（`:456-506`）：`localStorage["dsh-easyrewrite:pending:<sessionId>"]` + 内存缓存 + 订阅者 + `storage` 事件跨标签同步；`usePending` = `React.useSyncExternalStore`（`:504-506`）。pending 结构含 `type/edit/recall、targetKey、draftText、editImgs`（含 dataUrl 字节，>4MB 时降级只留引用，`:2931`）。
- 草稿超时备份：host 路由 `/bubble/backup*` 写 `$DSH_HOME/dsh-easyrewrite/backups/<sessionId>.json`（`lib/index.js:350-410`），处理完成即删。
- 真正改 context 只在两处：编辑「确定」→ `/bubble/edit`；撤回「发送」→ `/bubble/recall`（host 半做边界/ fork，见下）。**发送钩子**是 DOM 捕获级劫持：`document.addEventListener("keydown"|"click", handler, true)`（`:1123-1157`），Enter 时排除 `isComposing`/Shift，点击时排除「停止生成」按钮，随后先 `e.preventDefault()+stopPropagation()` 再走 `doRecallThenSend`（`:1141-1149`）。
- 撤回执行链（`:1001-1122`）：本地按快照算回合边界，算不出走 host `/bubble/recall` → `props.ctxSessions.fork({ sessionId, atSeq: boundary })`（`:1073`）→ **`/bubble/clean-ghost`**（`:1089-1090`）→ 写 `resume-send:<newId>` 标记（带 `t` 时间戳）→ `ctxWorkspaces.archiveSession(sid)` 归档旧会话 → `safeOpenSession(newId)` 多重降级打开（props.openSession → `ctxSessions.open` → `ctxUiWorkspaceRef.openSession`，`:562-580`）→ 清 pending。新会话挂载后轮询 `inputActions` 就绪（100ms×50），`setDraft`+`addImages`+`submit` 自动重发（`:1164-1201`）；标记带 **30s TTL** 防「陈旧草稿幽灵自动发送」（`:1176-1180`）。

**RPC 形态**：不走 `ctx.connection.rpc`，而是 host `webServer.register({kind:'exact', path:'/bubble/*'})` + 客户端裸 `fetch`（`lib/index.js:330-529`，客户端 `:1043` 等）。信封是自定义 `{ok:true,...}|{ok:false,error}`；失败路径有明确错误码 `session-not-found/agent-busy/no-boundary/turn-open`（DESIGN §4.5），客户端把 `turn-open/no-boundary` 转成 resetConversation 分叉（`:1029-1062`）。

**样式**：一个 `injectThemeStyle()` 生成的 `<style>`（`:3932-3947`）+ 大量行内 style；颜色全部走 `--dsw-alias-*` 令牌（暗色模式随宿主），`@media (hover:hover)` 处理悬停；图标是 base64 PNG，深色模式靠 CSS `invert` 自适应（README:204）。

**i18n**：`ctx.locale.register(UI_NS, {zh,en,ja})`（`:4044-4049`），自建 `useUILocaleDict`（监听 `ctx.locale.subscribe`），三语字典内置在源码；README 三语。

### 1.3 工程细节

- 测试：`tests/smoke-host.mjs` 用 `__test` 导出直接跑纯函数边界（`lib/index.js:314`），共 3 个 node 脚本（`package.json:61`）；`tests/README.md` 自述 `smoke-client.mjs` 只存在于计划中（未实现）——**UI 无自动化测试**。
- 类型：无 `.d.ts`、无 tsc；版本 pin 靠 README（`:21`：2.4.0 要求 dsh `0.1.2-rc.1+`；旧线停 2.3.1）。
- CI：仓库内未发现 workflow（浅克隆文件清单无 `.github/`）。
- 自曝限制：README:182「fork 只能在闭合回合边界截断，未结束回合内无法撤回」；DESIGN §5 列了首条禁用、运行中禁用、附件只回填文本等。

### 1.4 可复制代码形态（文字化）

1. **keyed 槽 priority:-1 整体接管 + 全量自绘**：`:4106-4111` 注册 `{name, key:"user", priority:-1}`，组件收到 `node`，自己 `React.createElement` 整个气泡交互。适合 BotHarness「在消息里加 Bot 标记/动作条」的侵入需求，但代价是官方气泡改版即要跟版（DESIGN §8.5 自曝）。
2. **注册 face 做依赖注入**：`:4111-4141` 把 `ctx.*` 能力收进 `inject(sessionId)` 返回值，组件只见 props；BotHarness 的 roster 面板可照此把 `bridge`/`sessions` 控制在注册边界。
3. **按会话 pending + 超时备份 + TTL resume**：`:456-506` + `:1164-1201`；「本地无 pending 才从文件备份恢复，绝不覆盖正在编辑的草稿」（DESIGN §4.3）是可直接搬的恢复优先级。
4. **捕获级发送拦截的完整边界**：`:1126-1148`（IME、Shift+Enter、stop 按钮、双击锁 `sendingRef`）；若 BotHarness 需要「发送到某 Bot」类的提交拦截，这是当前唯一实证可行路径（作者规范 §4.2 的 composer 没有公开提交钩子）。
5. **版本家族=官方 lineage 派生**：`:65-132`，把「多版本」当会话树处理而不是另存一份数据，注释里写明「归档会话仍在 `sessions.list`，家族关系天然持久」。

### 1.5 坑与教训

- **fork 幽灵队列（Issue #9/#10，P0）**：官方 `sessions.fork` 贪婪切片会把 `turn/end` 到 `turn/start` 之间的 `agent/inbox/spliced` 入队事件复制进新会话，形成幽灵待发消息；客户端快照读不到（WebSocket 帧才填 `queue`），最终只能在 host 端直接操作 `ctx.agents.get(sessionId).inbox` 物理移除（`lib/index.js:587-613` 注释 + CHANGELOG 2.5.3/2.5.4）。**任何基于 fork 的「回退/重发」功能都要验证这个语义**。
- **宿主 slot/API 收缩**：0.1.2 起 `inputActions` 不再随 slot 下发（`:4112、4152` 注释）；更晚的 0.1.6-alpha.2 里它注册的 `settings.plugin.item` 已被换成 `plugins.bundle.config`（作者规范 §4.5、rewind audit），`props.useInput` 在事件里调用会抛 React #321（CHANGELOG 2.4.1）。2.5.4 并未声明适配 0.1.6，**在 BotHarness 的 pinned 宿主上是否还能完整工作未验证**。
- **React hooks 纪律错误**：设置卡曾因条件分支里的 `useState` 漂移报 React #310（CHANGELOG 2.5.0），版本翻页器源码里直接写了警示注释（`:2527`）。
- **host 无界 Promise 链 OOM（Issue #7）**：日志串行 `then` 累积导致 V8 堆 4GB，改为批处理缓冲 + 1000 条背压（`lib/index.js:24-60`）。
- localStorage 当设置存储：设置项散落在 `dsh-easyrewrite:*` 键（`:46-63`），与官方 `settingsScope` 平台不同步、多浏览器不共享。
- 包体：无打包导致单文件 4272 行、无 tree-shaking、无 sourcemap；调试 API 挂在 `window.__dshEasyRewrite` 上（`:3956-4029`）。

### 1.6 与官方规范对照

- 官方推荐：priority 抢占 keyed 槽是 slot 引擎明确语义（`ui-slots/src/index.ts:285-296` 同源自官方 API 事实表 `docs/api-facts.md:10`）；`ctx.effect` 生命周期、`ctx.locale.register`、官方 Primitives 图标、`--dsw-*` 令牌全部符合。
- 官方未覆盖：composer 提交拦截（无公开钩子，只能 DOM 捕获）；「用裸 fetch + webServer 精确路由」替代 `ctx.connection.rpc`（作者规范 §5.2 推荐通用 RPC；两者都可用，裸路由缺统一认证信封与 RPC 类型）。
- 偏差：`dsh.client.inject` 填服务名而非包名；无类型构建；`settings.plugin.item` 未随宿主迁移。

---

## 2. SiriLee/dsh-rewind —— 同窗口原地回退、portal 桥接与「测试即兼容审计」

### 2.1 形态与构建

- `package.json:2`：npm 名是 **`dsh-rewind-plugin`**——README:41 明写「npm 上的 `dsh-rewind` 属于其他作者，请用 `dsh-rewind-plugin` 安装」，是本仓库最直白的名字撞车教训。
- `package.json:48-64`：`dsh.bundle.patch`、**`dsh.engines.dsh: ">=0.1.6-alpha.2"`**（单行模型）、`dsh.client.inject` 填 4 个官方包名；`:76-92` peerDeps 全部 `^0.1.6-alpha.2` 且 optional。
- 构建 `scripts/build.mjs`：host 半 esbuild → ESM、`external: ['@deepseek-ai/*']`（`:63-73`）；client 半 esbuild → **CJS**、`platform:browser`、externals 只留 `react/react-dom/react/jsx-runtime/@deepseek-ai/dsh-client-ui-primitives`（`:76-96`），然后用 `window.__ModuleLoader__.load({id, factory})` 包裹（`:100-113`）；tsc 产出 `lib/types/`；构建后自检 loader 包装、host 导出形状、「不得静态 import 0.1.2 已删除的 `settingsNamespace`」、公开契约导出仍在（`:116-158`）。这是**仓库外自建构建的完整可复刻样本**，直接回答作者规范 §7.3 的最大工程风险。

### 2.2 UI 实现

**注册（`src/client/index.ts`，4 处）**

| 位置       | 槽位                                                 | 参数                                                            | 用途                                                                                 |
| ---------- | ---------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `:249-258` | `conversation.session.header.actions`                | `id:'dsh-rewind-portals'`, `order:1000`                         | **只挂一个 bridge**，本身不渲染 header UI，靠 portal 往每条 user 消息操作行塞 ↶ 按钮 |
| `:316-329` | `plugins.bundle.config`                              | `key: PLUGIN_PACKAGE`, `locale: NS`, `inject: () => ({t, api})` | 设置卡（0.1.6-alpha.2 契约）                                                         |
| `:426-428` | `/rewind`、`/undo`                                   | `commandUi.decorate({name, ...})`                               | 文本流：裸 `/rewind` 打开官方 popupSelect 候选                                       |
| `:78`      | `inject = ['slots','sessions','locale','commandUi']` | —                                                               | 模块级必需服务                                                                       |

- **可选服务用嵌套 inject**：`settingsScope` 不写进模块级 `inject`，而是在 `clientCtx.inject(['settingsScope'], scoped => {...})` 里注册（`:271-335`）。注释解释：写模块级会让无此服务的宿主**整插件不挂载**，代价是回退功能一起消失——这是 BotHarness 处理「可选能力」的教科书姿势。
- **类型结构性声明替代跨包类型导入**：`SlotsLike`（`portals.tsx:123-137`）、`UiConversationLike`（`index.ts:88-92`）、`SessionInputResolverLike`（`:101-103`）、`SessionKindLike`（`portals.tsx:428-431`）全部本地手写；build.mjs 顶层注释写明意图「survives harness version drift」。同时 `tests/client-contract.test.ts:28-40` 用 `keyof SlotMap` 在**编译期**钉住注册的槽位名——「slot 被宿主删除」会 typecheck 失败，而不是静默不渲染（该文件的 docblock 记录了 alpha.2 删 `settings.plugin.item` 时正是靠这个发现）。

**组件树与数据流**

- `RewindPortals`（bridge，`portals.tsx:567-684`）：`useState<PortalTarget[]>`；`useLayoutEffect` 内 `refresh()` 扫描 DOM × chat 快照配对（`:577-652`）；`MutationObserver(document.body, {childList, subtree, attributes, attributeFilter:['style']})` 触发 `queueMicrotask` **合并 + diff**（`:630-652`），注释强调「不做每次 mutation 的同步全量扫描，避免拖慢新气泡绘制」；`targets.map(createPortal(<RewindButton/>, container, key))`（`:654-683`）。
- 目标发现是**结构性的**：`actionsContainerOf`（`:376-391`）取「最后一个非本插件 button 的父元素」作操作行（防止落到图片缩略图 button 或自身）。模块 docblock 顶部直接标注 **COUPLING NOTE — HIGH**：宿主没有 per-user-message 动作槽，`data-chat-flow-kind`/`data-chat-anchor-key`/`data-composer-input` 等均为内部结构，已随 0.1.6-alpha.2 重新核对（`:23-39`）。
- 行撤回 `RewindButton`（`:698-733`）：点击 → 官方 `/rewind @<seq> <mode>` 命令 → 等命令节点出现（`waitForCommand`，20s 超时）→ 成功后把原文回填 composer，但**有「composer 非空就不覆盖」保护**（`:307-309`）。回填优先官方 `conversation.input.setDraft`，失败降级 `contenteditable` + `execCommand('insertText')`（`:158-211`）。
- pending（未发出）steering 消息的撤回按钮 `RetractButton`（`:815-842`）走 `session.updateQueue(id,{kind:'remove'})`（`:785`），**不打断正在运行的回合**（`:744-765` 注释详细解释了为什么 pending 不需要 stop、durable 才需要）。
- 隐藏逻辑 `hiddenSeqsOf`（`hidden.ts:177-216`）：按每条已执行且携带 marker 的 rewind 命令的 `[target, marker]` 算 span，span 之间保持独立；DOM 隐藏 + `data-dsh-rewind-hidden` 观测标记（`portals.tsx:605-617`）。

**RPC/控制通道**：没有自定义 RPC。全部走官方：

- 执行：`session.command('/rewind @seq mode')`，`outcome.kind==='success'` 且 `sourceEventSeq`（marker log seq）做机器判据（`hidden.ts:116-123`）；
- 候选：`/rewind __candidates` 的文本行编码 `candidates=\nseq\ttime\tpreview`（`candidates.ts:131-153`）；
- 数据：`uiConversation` 的 `chat` view + `session.projections.faceOf('inbox')`（`portals.tsx:468-480`）；
- 设置：`SettingsScope.getSnapshot().value/set/unset`（`:287-315`）。
  `docs/contract/client-contract.md` 把外部可见面分级为 stable/semver-protected（`/rewind @seq` args、`sourceEventSeq`、`data-dsh-rewind-hidden`）vs 明确 non-contract（`outcome.text`），并规定破坏性变更必须升 minor/major——**这是第三方交互契约的写法范本**。

**交互/无障碍**：popover `role="dialog"` + `aria-label`（`popover.ts:410-411,477-478`）；`focusFirst`/`moveFocus` 做 ↑/↓ 焦点漫游，Esc 分步语义（modes=取消、impact=返回），外部 `pointerdown` 关闭（`:360-395,540-561`）；监听在 document 捕获阶段以「偷走」composer 的 ↑/↓/Esc（`:378-385` 注释）。未做焦点陷阱（推断）。

**样式**：`styles.ts` 导出一个大 CSS 字符串，注入 `<style data-plugin=包名>`（`index.ts:151-156`，注释说明宿主按 `data-plugin === entryId` 匹配归属样式），全部 `--dsw-*` 令牌；卸载时 `style.remove()`（`:441`）。

**i18n**：`ctx.locale.register(NS,{zh,en})`（`:148`），`ctx.locale.subscribe` 触发 bridge 重渲染以跟随语言（`portals.tsx:574-575`）。

### 2.3 工程细节（本项目工程质量最高）

- 测试：vitest + jsdom，覆盖 candidates/pending/hidden/client-dom/client-popover/client-contract/compat 等 30+ 文件；`tests/client-dom.test.ts:195-222` 直接对 `actionsContainerOf`/`collectTargets` 的 DOM 形状做测试；`tests/action` 之外还有 `scripts/verify-host.mjs` 跑真实 host 装配。CI `.github/workflows/ci.yml:26-27` 跑 `npm run check`（= typecheck 三面 + test + build + verify:host + pack --dry-run）。
- `docs/compat/audit.md` 把兼容性写成不变量 I1-I8（日志可重放、surface 一致、fold 安全、compact 互操作、客户端排序……），并逐条记录 0.1.6-alpha.2 的删除点：`SessionListState.current` 没了→`retainedBy.mainView`；`SessionSnapshot.queue` 没了→`inbox` projection；`settings.plugin.item` 没了→`plugins.bundle.config`；同步历史读废弃。**对 BotHarness 来说这是一份现成的宿主版本差异清单**。
- build 内容哈希注入（`build.mjs:46-52`）+ boot 日志打版本/构建号（`index.ts:145`），用于排除「缓存旧包/宿主没重启」。

### 2.4 可复制代码形态

1. **builder 自注册包装 + 自检**：`scripts/build.mjs:76-113`（esbuild CJS + `window.__ModuleLoader__.load` 包裹）与 `:116-158`（loader 包装/导出形状/删除 API 静态导入检查）——BotHarness M3 自建 client 构建可逐条复刻。
2. **list 槽 bridge + `createPortal` 到宿主行**：`index.ts:249-258` + `portals.tsx:654-683`；bridge 自身零 UI，只做 per-session 的 React 挂载点。roster 若要在每条消息/每个会话行插入「Bot 动作」，这是当前唯一官方可挂载 + 最小侵入的组合。
3. **MutationObserver 合并 + diff 的刷新**：`portals.tsx:630-652`——一次 refresh/批、目标集不变不 setState，避免在宿主渲染关键路径上抢帧。
4. **编译期 slot pin 测试**：`tests/client-contract.test.ts:28-40`（`readonly (keyof SlotMap)[]` + `type-only import` 拉进声明合并）——宿主改 slot 名时在 CI/typecheck 就失败。
5. **嵌套 inject 保护可选能力**：`index.ts:277-335`——宿主缺 `settingsScope` 时只丢设置卡，不丢功能。
6. **公开契约分级文档**：`docs/contract/client-contract.md` + build 时断言导出面（`build.mjs:141-154`）。

### 2.5 坑与教训

- **per-user-message 动作槽不存在**是 DSH 当前的结构性缺口；rewind 选择接受高耦合 DOM 定位（模块头 COUPLING NOTE），并把「将来官方出一等用户动作槽时此处迁移」写进注释。
- `role="dialog"` 无焦点陷阱、popover 关闭依赖 document 捕获监听——低风险但非完整 a11y（推断）。
- 版本策略「单行模型」：只保留当前 DSH 线的 peer tuple；新宿主删除接口就移动 floor（audit 文档）。对 BotHarness M3.5 安装门有直接参考价值。
- 历史包袱：早期 DOM appendChild 方案被 portal 取代（`portals.tsx:1-13` 记录性能问题与迁移理由）。

### 2.6 与官方规范对照

- 官方推荐全部命中：`ctx.effect(function*(){...})` 生成器 yield disposer、`ctx.locale.register`、`inject` 声明、slot `inject`+`register`、CSS 注入、`plugins.bundle.config`。
- 官方未覆盖：portal 桥接「无槽位的 per-message 动作」；用命令行（`commandUi.decorate` + `session.command`）当控制/数据通道；`hiddenSeqsOf` 这种对外导出的纯计算契约。
- 明确不与官方对抗：把宿主删除的同步历史读取（`snapshotEvents`）保留为自己不新增，并记录迁移路径（audit 文档）。

---

## 3. miuzel/dsh-subagent-ui —— 最接近 roster 的面板与精确寻址（工程风格反差最大）

### 3.1 形态与构建

- `package.json:24-36`：`dsh.bundle.patch` + `dsh.client.inject` 填官方包名；无 `engines.dsh`，README 声明支持 dsh 0.1.5-rc.2 并向后兼容。
- `scripts/build.mjs` 是**非常规**方案：源码 `src/client/*.ts` 按硬编码顺序（`:19-32`）经 sucrase 只做类型擦除（`disableESTransforms`）→ 删相对 import 行与 `export ` 前缀 → 拼接进 `window.__ModuleLoader__.load` 壳（`:34-44`）→ `node --check`（`:75`）。AGENTS.md:85 列出了一整套「保持与手写原始 bundle 字节一致」的 TS 书写限制（不能箭头函数返回类型标注、不能 as/satisfies/enum/namespace、import 必须单行、css 模板里不能有空行……）。作者用 `verify-build.mjs` 对 v1.3.4 手写 golden 做 token 级 diff 来证明迁移等价（README:83-91）。可敬但**不建议 BotHarness 模仿**（成本高、无 sourcemap、依赖书写纪律）。
- host 半 `lib/index.js` 手写（299 行），做的是**直接文件系统级的子代理删除**（见 §3.5）。

### 3.2 UI 实现

- 注册（`src/client/apply.ts:1-4`，压缩成 4 行）：`inject(['sessions','slots','locale'])`；`ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({name, id:'subagent-workspace-manager', order:100, locale:NS, inject:face}, Manager))`；`inject` face 一次性给出 `{openChild, openSession, refresh, setCatalogOpen}`。
- `Manager`（`manager.ts:28`）：props 里除了标准 `t`，还收到**注入版 `useSessions(selector, equality)`**（`types.ts:286`）——组件不 import 任何宿主模块，全部经 slot props 传入。
- 状态：一个组件 25+ 个 `useState`/`useRef`（`manager.ts:29`）；数据选择是亮点：
  - `useSessions(s => s, (a,b) => a?.byId===b?.byId && a?.subagentsByParent===b?.subagentsByParent && a?.current===b?.current)`（`:29` 开头，自定义 equality 限定订阅字段，README v1.3.2 自述是性能修复）；
  - `useMemo` 派生 `subagentRows→allRows`（`:31`），`useDeferredValue` 算 tab 计数（`:32,99`）；
  - `liveCap`（默认 3）限制同时订阅实时输出的子代理数，面板关闭/浮动窗隐藏即释放订阅（README v1.3.2）；
  - 打开面板才对每个 parent 调 `setCatalogOpen(p,true)+refresh(p)`，关闭时回 false（`:101`）。
- 面板形态：header 按钮（`chip.count` 徽标 + 脉冲点）→ `position:fixed` 的全屏 `backdrop` + 右侧 `<section role="dialog" aria-modal>`（`:105` 起渲染树）。视觉有一整套 `dsh-sam-*` CSS（`styles.ts`），含暗色 `body[data-ds-dark-theme]`、响应式 `@media(max-width:560px)`；但部分强调色是硬编码（`#42bd7b`、`#d6a646`），与令牌化程度更高的 rewind 有差距。
- 精确寻址：`modeMap` 把 `subagentsByParent[parent].entries[]` 的 `{kind:'child', id, mode, label}` 合并进行数据（`format.ts`），行地址 `{parentSessionId, childSessionId, mode}`；打开子会话调注入的 `openChild(address)` → `ctx.sessions.openSubagent(address)`（`apply.ts`）。README:50 说明「类型未加载的行仍可见可搜，退化为官方会话导航；DSH 提供地址后自动启用精确目录导航」。
- 实时输出：0.1.2-alpha.2 走 `binding.eventSource` 原始事件流（`live-events.ts` 手写 fold assistant/chunk、tool-call、context 注入），0.1.1 走 `session.getSnapshot().chat.legacy`（`live-output.ts`）；能力探测选路（README:52）。`live-output.ts` 订阅时先 `session.configureSubagent({parentSessionId, childSessionId, mode})` 再 `open()`（`live-output.ts` setup）。
- 交互原语：删除/暂停用 `window.confirm`/`window.alert`（`:33-40,59-61`）；批量模式 shift 连选（`:102` 尾部）；搜索支持 `id:` 前缀（`:31`）。
- i18n：`ctx.locale.register(NS,{zh,en})`（`apply.ts`），字典约 140 键（`i18n.ts`）。

### 3.3 host 半与「RPC」

- `lib/index.js:289-299`：`apply(ctx)` 里 `ctx.get('webServer')` 拿不到就 `ctx.inject(['webServer'],...)`；注册两条 `kind:'exact'` 路由 `/api/dsh-subagent-workspace-ui/delete`、`/batch-delete`（`:226-287`）。
- 删除流程（`:215-224`）：`stopAgentIfRunning`（`ctx.get('agents')` → `agent.cancel({kind:'user'})` + `whenIdle()` 5s 超时）→ `detachLiveSession`（`sessions.detachEntered` 或 `store.delete` + `attachments.delete`）→ **`removeSessionDirs` 直接 `fs.rmSync($DSH_HOME/sessions/<slug>/<sessionId>)`**（`:53-63`）→ `stripStorageDomains`（操作 `session_projcache`/`workspace` 表的内部形状，`:120-166`）→ `emitRemovalMarker` 通过 `sessions.prepare/enter/announce/flush` 造一个「删除标记」会话再删掉（`:168-188`）。
- 请求体自带 8MiB 上限（`:204`）；无鉴权、无 CSRF 防护（推断：`webServer` 面与官方 `/api` 同级信任域）。

### 3.4 可复制代码形态

1. **slot props 注入 `useSessions`**：`types.ts:286` + `manager.ts:29`——面板组件零宿主 import、可在 jsdom/story 里以假 `useSessions` 驱动；BotHarness roster 组件建议同样按 props 收数据源。
2. **选择器 + equality + deferred 的性能三件套**：`manager.ts:29-32`；roster 行数增长时直接可用。
3. **父→子目录的地址模型**：`format.ts` 的 `modeMap` 合并 + `{parentSessionId, childSessionId, mode}` 寻址；BotHarness 的「父会话→多个 Bot 子会话」可复用同一形状。
4. **打开目录才订阅**：`:101` 的 open/close 生命周期绑定 `setCatalogOpen+refresh`，避免后台为全部父会话轮询。
5. **能力探测的降级链**（`live-output.ts`：eventSource → legacy snapshot → durable summary）——roster 实时状态在旧/新宿主间的兼容写法。

### 3.5 坑与教训（反面教材集中）

- **直接删会话目录与存储域**：绕过官方持久化 API，可能遗漏附件、索引、其他插件的派生数据（它的 `stripStorageDomains` 已不得不逐个猜表名）；官方一旦改目录布局即失效。对 BotHarness：**不要**用文件系统当删除通道，优先找官方 API。
- `window.confirm/alert` 阻断式交互 + 文案拼接，未走宿主确认组件；与「原生观感」目标冲突。
- 无单测/无 lint（AGENTS.md:77 自述）；只有 build/typecheck/语法/smoke，UI 回归靠人。
- 巨型单组件（`manager.ts` 106 行但每行都是超长压缩逻辑，实际近 2000 物理行）+ 24 个 hook：可读性、可测试性差（反面典型）。
- 4 处 `document.querySelector` 级 DOM 依赖：chat tab 通过 `header div[role="tablist"]` 里文案 `'对话'|'Chat'` 匹配（`manager.ts:11-27`）——宿主换语言/结构即碎。
- 兼容声明停留在 0.1.5-rc.2，`list.current`、`openSubagent`、`subagentsByParent` 等在当前 0.1.6-alpha.2 契约中已变/不存在（见 §7），实际多半只在新宿主上部分可用。

### 3.6 与官方规范对照

- 官方推荐：slot 注册 + locale、`ctx.get` 可选服务、`ctx.inject` 补依赖、官方会话 store 数据（`useSessions`）。
- 官方未覆盖：host 端会话删除能力（官方无此 API，才逼出 fs 方案）——对 BotHarness 是「M3 不做会话删除」的有力论据。
- 偏差：自建构建方式、直接 fs/storage 操作、确认交互、语言相关 DOM 匹配。

---

## 4. PerryLink/dsh-background-agents —— 官方 seam + 投影数据链 + 侧栏面板

### 4.1 形态与构建

- `package.json:44-60`：`dsh.manifestVersion:1`、bundle patch、`dsh.client.inject` 6 个官方包名；`:117-131` `engines.dsh` 与 peerDeps 用**多段区间**声明三条宿主线（`>=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0 || >=0.1.6-0 <0.2.0`）。
- 构建最接近官方：tsdown + 三份 tsconfig（build/client-build/client）+ `tsc` 出 d.ts + `fix-dts`；CSS Modules 经 lightningcss；`vitest` + `oxlint` + 5 个 GitHub workflow（ci/compat/plugin-doctor/release/scorecard）。`scripts/gen-aliases.mjs`/`verify-self-contained.mjs`/`verify-artifacts.mjs` 还做了别名与自包含校验。
- client 半 `src/client/index.ts:53`：`inject = ['sessions','slots','locale','connection','remote','remote.commands']`。

### 4.2 UI 实现

**注册**

| 位置                          | 槽位                                 | 要点                                                                                                                                         |
| ----------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/client/index.ts:251-332` | `sidebar.footer.action`（list/root） | `id:'background-agents'`, `order:0`, `locale:NS`, `inject` face 给出 `{sessions(observable), openChild, stopChild, sendMessage, readResult}` |
| `src/client/index.ts:366-375` | `settings.section`（list/root）      | `id:'team-rooms'`, `order:30`, `label: () => ctx.locale.bind(ROOM_NS)('nav')`（thunk 跟随语言）, `locale:ROOM_NS`                            |

**组件与状态**

- `BackgroundAgentsAction.tsx:55-56`：props 类型 `PropsRuntime<'sidebar.footer.action'> & BackgroundAgentsInjected & PropsLocale<typeof NS>`——**从槽位契约派生 props**（作者规范 §4.3 的「五份 shares」标准写法，仓库外可复刻）。
- 数据：`useSyncExternalStore(sessions.subscribe, sessions.getSnapshot)` + 纯函数 `buildAgentRows(...)`（`:206-209`）。行的所有事实（label/status/messageCount/metrics）来自会话列表快照里的 `projectionValues.backgroundAgents`，**行数据零 RPC**（模块 docblock `:1-13`）。
- 交互状态：`open/busyId/composingId/draft/result/now/anchor` 等 `useState`（`:190-201`）；面板 `createPortal` 到 `document.body`，锚定 trigger 左上、向上展开；resize 重锚（`:221-231`）；打开时 focus 面板、关闭时 focus 回 trigger（`:236-243`）；outside pointerdown + Escape 关闭（`:246-263`）；trigger 有 `aria-expanded`，面板 `role="dialog"`+`aria-label`+`tabIndex=-1`（`:330,343`）。
- 行内动作 `Row`（`:106-184`）：open/stop/message/result 四按钮 + 内联 composer（Enter 发送）+ 结果 peek；`busy` 全局锁 + archived 行禁用。

**控制通道（RPC）**：三类，全部官方面：

1. `remote.commands.execute(sessionId, line, [])` 执行 `/room …` 命令（`index.ts:344`），注释明确「零自定义 RPC，让每个动作保持持久命令生命周期」；
2. `connection.api.subagents.prompt({requestId: crypto.randomUUID(), parentSessionId, childSessionId, mode:'continuable', content, clientTimeZone})`（`:303-310`）与 `api.subagents.interruptByParent(...)`（`:286-290`）——`requestId` 客户端铸造，用于宿主持久化去重；
3. 读子会话最终结果：`sessions.binding(childId).session.projections.faceOf('conversation')`（`:322-326`），「transcript history RPC 已不存在，peek 不会激活子 Agent」。

**投影数据链**：client 的 `TeamRoomsController`（`:71-170`）是自实现 store：订阅 `sessions.list.subscribe`，用 `retainedBy.mainView` 判定当前会话（`:120-143`，注释标明 `SessionListState.current` 在 0.1.6-alpha.2 被删），随当前会话切换对 `projections.faceOf('teamRoom')` 重订阅（`:145-168`）；`getSnapshot/subscribe` 暴露给 React，用 `hooks.teamRooms` 名经 inject 传入（`:353-354`）。host 半 `src/projection.ts`/`projection-schema.ts` 用 `ctx.sessionProjections` 注册插件投影单元，把 facts 折叠进会话列表快照——这正是 rosters 类面板「宿主算、客户端读」的正规数据路径。

**样式/i18n**：CSS Modules（`BackgroundAgentsAction.module.css`）经 tsdown+lightningcss 编译为哈希类名，组件 `import css from './…module.css'`（`:16`）；两个 locale namespace（`background-agents`、`teamRooms`）经 `declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap {...} }`（`index.ts:32-39`）做类型安全合并。

### 4.3 工程细节

- 测试：vitest（`@vitest/coverage-v8`、jsdom）；`tests/action.spec.tsx` 用 `react-dom/client` `createRoot` 真渲染组件、`vi.mock` 掉 primitives，断言「Escape 关闭、外部点击关闭、stop 状态禁用、发送失败显示、focus 进入/归还」（`:106-243`）；`presenter.spec.ts`/`projection.spec.ts` 等纯函数测试 300+ 条（跨文件）。
- `dshWorkshop` 元数据（`package.json:61-101`）声明安装事务模式、权限、兼容版本、能力与证据——一种面向生态工具的清单实践，BotHarness 打包时可借鉴（非官方字段）。

### 4.4 可复制代码形态

1. **纯 presenter + `useSyncExternalStore`**：`src/client/presenter.ts`（行/成本导出）+ `BackgroundAgentsAction.tsx:206`；UI 只绑交互，事实全在可测纯函数里。roster 的「Bot 行派生」建议完全照此分层。
2. **`sidebar.footer.action` trigger + `createPortal` 浮层面板**：`:323-393`——roster 的全局入口/通知中心可直接用这个槽 + portal，不占 sidebar 工作区。
3. **settings.section 的 `label` thunk + locale namespace**：`:366-375` + `:32-39`。
4. **宿主投影 → 客户端 `faceOf` 的数据链**：`TeamRoomsController`（`:71-170`）可作为 BotHarness「六态/名册实时数据」的替代方案（比自建 SSE 轮询更贴官方）；注意它只覆盖「会话列表可见行」。
5. **官方命令即 API**：`executeRoom`（`:340-351`）把 UI 动作翻译成 `/room` 命令行，保留命令历史与审计——BotHarness 的 roster 写操作可评估用 `/bot` 命令族实现。

### 4.5 坑与教训

- **版本漂移自曝**：`index.ts:258-283` 明确写 `openSubagent` 类客户端子会话导航在 0.1.6-alpha.2 被移除、「navigation belongs to the view owners」，`openChild` 只剩 warn + 错误提示；但 `ARCHITECTURE.md:68` 仍写着 `sessions.openSubagent`——**文档与代码已漂移**，读这个仓要以 `src/` 为准。
- 大仓：host 半 ~4600 行 + room hub 1039 行，客户端只 700 行——UI 薄、领域厚，是「UI 插件也别把逻辑塞组件」的正面示范。
- 结构类型化 remote（`SubagentsRemote`/`CommandsRemote`，`:179-224`）是对「生成式 Remote 类型在严格包管理器下解析到不同物理副本」的防御，但字段是手抄的，宿主改签名不会编译报错（风险自担，推断）。

### 4.6 与官方规范对照

- 官方推荐：slot 注册纪律、五份 shares/类型派生、locale namespace 合并、projection 数据面、`remote.commands`、`inject` 全量声明。
- 官方未覆盖：投影单元的客户端消费模式（`faceOf`）、`retainedBy.mainView` 判定当前会话（官方审计文档记载了该迁移）。
- 与 subagent-ui 相反的取舍：**不做** fs 删除、不用 `window.confirm`、导航缺失时显式告知而不是硬闯。

---

## 5. 附录：RGarvel/dsh-channel-view —— DOM 锚点 + portal 的「平行 tab」（未读完整源码）

- 形态：`package.json:26-35` 标准三导出；`dsh.client.inject: []`；**只有预构建 `lib/client.js`**（手写、无构建，README:17-18 自述），另有 `test/buildChannelState.test.mjs`（node --test）。
- 做法（README:25）：在侧栏「工作区」标题行做 DOM 锚点，用 **shell 播种的官方 `react-dom`** portal 注入 `[工作区 | Channels(n)]` 平行 tab，切换时隐藏官方列表分支；数据面走「宿主注册 `qqChannel` 投影单元 → 官方推送帧 → 客户端行 `projectionValues`」（README:19，实测 latch 语义 6/8）。
- 规避的核心缺陷（README:41）：QQ 会话在 web 端转 live 时，`dsh-client-runtime` 会用只含内置键的 `projectionValuesOf(log)` 重算行投影，插件单元锁存值丢失 → 分组判定改为「权威路由优先、行投影兜底」，host 半新增 `ctx.webServer.register` 只读路由 `/dsh-channel-view/state`，客户端每 4s 轮询（README:40-43）。
- 自曝风险（README:44）：该路由暴露会话 id/绑定关系，与 `/api` 同信任域，宿主绑 `0.0.0.0` 时局域网可读，正式版需鉴权。
- 价值：证明了「纯第三方扩展面 + portal 不改宿主也能做平行导航视图」的上限与代价（DOM 锚点脆、轮询取巧、投影 live 行有 core 缺陷）；`ctx.sessions.open` 是其 v2 时（08-27）的打开方式，在 0.1.6 线上应改为 `ctx.uiWorkspace.openSession`（见 §7）。

---

## 6. 横向最佳实践清单（带出处）

| #   | 实践                                                                                                | 出处（Pinned SHA 内 file:line）                                                   | 对 BotHarness                              |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | **编译期 slot pin**：用 `keyof SlotMap` 的类型测试钉住注册槽，宿主删槽时 typecheck 失败而非静默空白 | rewind `tests/client-contract.test.ts:28-40`                                      | M3 直接建此测试                            |
| 2   | **嵌套 `ctx.inject` 保护可选服务**：可选能力不进模块级 inject，缺服务只少一块 UI                    | rewind `src/client/index.ts:277-335`                                              | 设置卡/实时推送/投影适配                   |
| 3   | **服务面结构类型化**：本地声明所需方法的最小形状，不 import 宿主 UI 包类型                          | rewind `src/client/index.ts:88-103`；background-agents `:179-224`                 | roster 对 `uiWorkspace`/projections 的读取 |
| 4   | **只读投影 + 纯 presenter + `useSyncExternalStore`**：事实全在纯函数，组件只绑交互                  | background-agents `src/client/presenter.ts` + `BackgroundAgentsAction.tsx:206`    | roster 行派生与单测                        |
| 5   | **list 槽 bridge + `createPortal` 进宿主行**：bridge 零 UI，只做 React 挂载点                       | rewind `index.ts:249-258` + `portals.tsx:654-683`                                 | 每条消息/会话行内嵌 Bot 动作               |
| 6   | **MutationObserver 合并 + diff 刷新**：一批 mutation 一次 refresh，目标集不变不 setState            | rewind `portals.tsx:630-652`                                                      | 任何 DOM 观察式功能                        |
| 7   | **按会话 pending/草稿持久化 + `useSyncExternalStore` + TTL resume**                                 | EasyRewrite `src/client.src.js:456-506,1164-1201`                                 | 会话切换/刷新不丢草稿                      |
| 8   | **捕获阶段发送拦截的完整边界**（IME/Shift/stop/双击锁）                                             | EasyRewrite `:1123-1157`                                                          | 仅在官方无提交钩子时使用                   |
| 9   | **`ctx.effect` 生成器 + yield 注册 + 卸载清理**（官方标准生命周期）                                 | rewind `index.ts:147-157,434-442`                                                 | 全部注册                                   |
| 10  | **自建 client 构建的 loader 包装 + 产物自检**                                                       | rewind `scripts/build.mjs:76-113,116-158`                                         | M3 工程前置                                |
| 11  | **公开契约分级文档**（stable/semver vs non-contract，构建期断言导出面）                             | rewind `docs/contract/client-contract.md` + `build.mjs:141-154`                   | BotHarness↔其他插件互操作                  |
| 12  | **面板 a11y**：trigger `aria-expanded`、面板 `role=dialog`、focus 进出归还、Esc/外点关闭            | background-agents `BackgroundAgentsAction.tsx:236-263,330,343`                    | roster 面板基线                            |
| 13  | **选择器 + equality + `useDeferredValue` + 订阅上限**                                               | subagent-ui `manager.ts:29-32,99`                                                 | 大量 Bot 行时的性能                        |
| 14  | **父→子地址模型** `{parentSessionId, childSessionId, mode}` 与目录 open/close 订阅                  | subagent-ui `format.ts`、`manager.ts:101`；官方 `SubagentAddress`                 | 父子会话寻址                               |
| 15  | **官方命令当 API**（保留命令生命周期/审计）                                                         | background-agents `src/client/index.ts:340-351`                                   | 写操作可选通道                             |
| 16  | **宿主投影单元注册**（facts 折叠进会话列表快照，客户端零 RPC 读）                                   | background-agents `src/projection.ts` + client `:154-168`；channel-view README:19 | roster 数据面首选                          |
| 17  | **版本差异审计文档**（逐条记录宿主删除的 API 与替代）                                               | rewind `docs/compat/audit.md`                                                     | M3.5 安装门知识库                          |
| 18  | **构建内容哈希 + boot 日志**（排除缓存旧包/未重启）                                                 | rewind `build.mjs:46-52` + `index.ts:145`                                         | 现场排障                                   |

---

## 7. 反面 / 风险清单

| 风险                              | 证据                                                                                                                                                                                                                                                                                                        | 说明                                                                                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **直接操作文件系统/存储域**       | subagent-ui `lib/index.js:53-63,120-166,215-224`                                                                                                                                                                                                                                                            | 删 `$DSH_HOME/sessions/...` 与 `session_projcache`/`workspace` 表；宿主改布局即坏，可能遗漏附件/索引                                                                                                         |
| **Navigation API 版本漂移**       | 官方 pinned `packages/api/session-controller/src/client/contract/sessions.ts:49-162`：**无 `open`/`openSubagent`/`current`**；`background-agents` `index.ts:258-283` 自曝 0.1.6 移除导航、`ARCHITECTURE.md:68` 却未更新；EasyRewrite `:4105`、subagent-ui `apply.ts`、channel-view README:25 都还在用旧 API | 0.1.6-alpha.2 的官方导航入口是 `ctx.uiWorkspace.openSession(SessionTarget)`（官方 `ui-subagent/src/client/index.ts:23,59-65`、`ui-workspace/src/client/navigation.ts:30`）；BotHarness roster 跳转必须用后者 |
| **slot key 漂移**                 | `settings.plugin.item`（EasyRewrite `:4202`，0.1.2 线；rewind audit 记录在 0.1.6 已删）→ `plugins.bundle.config`（rewind `:316`）                                                                                                                                                                           | 注册槽位必须写 pin 测试，否则设置卡静默消失                                                                                                                                                                  |
| **DOM/语言耦合**                  | rewind `portals.tsx:23-39`（自标 HIGH coupling）；subagent-ui `manager.ts:11-27` 按 `'对话'                                                                                                                                                                                                                 | 'Chat'`文字找 tab；EasyRewrite`:2986`按 aria-label`'发送'                                                                                                                                                    | 'Send'` 找按钮 | 宿主改版/换语言即碎 |
| **`window.confirm/alert` 式交互** | subagent-ui `manager.ts:33-40,59-61,65`                                                                                                                                                                                                                                                                     | 与原生观感/无障碍冲突；background-agents/rewind 都用自绘 dialog，应为基线                                                                                                                                    |
| **fork 语义陷阱**                 | EasyRewrite `lib/index.js:582-613`、CHANGELOG 2.5.3/2.5.4（Issue #9/#10）                                                                                                                                                                                                                                   | `sessions.fork` 会继承 `agent/inbox/spliced` 幽灵待办；fork 后需清理或避开该边界                                                                                                                             |
| **静默 catch 文化**               | EasyRewrite 全文大量 `catch { /* ignore */ }`（如 `:37,496,606`）                                                                                                                                                                                                                                           | 靠统一 `/bubble/log` 补偿；BotHarness 建议失败路径显式上报（rewind 的 `rewindLog.warn(...)` 更佳）                                                                                                           |
| **localStorage 当设置/存储**      | EasyRewrite `:46-63`；subagent-ui `bootstrap.ts:load`                                                                                                                                                                                                                                                       | 不跨浏览器、无 schema、易膨胀（图片 dataUrl 4MB 上限 `:2931`）                                                                                                                                               |
| **性能回归历史**                  | EasyRewrite Issue #7（无界 Promise 链 OOM）；subagent-ui README v1.3.2（重复全量扫描、订阅不释放）；rewind `portals.tsx:1-13`（纯 DOM appendChild 拖慢新气泡）                                                                                                                                              | 都是「观察式 UI + 全量扫描」的经典坑；采用 #6/#13 模式规避                                                                                                                                                   |
| **npm 撞名**                      | rewind README:41（`dsh-rewind` 属于他人，实装 `dsh-rewind-plugin`）                                                                                                                                                                                                                                         | BotHarness 发布前先查 npm/GitHub 命名                                                                                                                                                                        |
| **未鉴权 host 路由**              | channel-view README:40-44（自曝轮询 + 局域网可读）                                                                                                                                                                                                                                                          | 第三方 webServer 路由要自己承担信任域（作者规范 §5.2 的 `connection.rpc` 自带鉴权）                                                                                                                          |

---

## 8. 对 BotHarness 的落点（M3 `@botharness/client`）

### 8.1 Roster 数据面：优先「宿主投影 + 会话列表」，不要为行数据自建实时通道

- background-agents 已证明：在 host 半用 `ctx.sessionProjections` 注册投影单元（facts 折叠进会话列表快照），客户端用 `useSyncExternalStore(sessions.list)` + 纯 presenter 读 `projectionValues.<unit>`，**行数据零 RPC、重连自动 resync**（`src/client/index.ts:154-168,206`）。BotHarness 的 roster（六态、当前任务、最近活跃）可直接落成 `botharness` 投影单元；channel-view README:41 也记录了该路径在 live 行上的 core 缺陷（插件单元锁存值可能被重算丢失）——若采用，需要一份 host 权威 route 兜底或接受降级（channel-view 方案，带鉴权缺口）。
- 若坚持走 `docs/client-bridge.md` 的 Connection RPC：把它留给**写操作**（创建/暂停/委派）与投影不可达的补充读；读路径以投影为准。信封/错误分层沿用官方 `ConnectionRpcResult`（作者规范 §5.2），失败在 UI 显式呈现（background-agents 的 `error` 状态 + inline 展示是范例）。

### 8.2 会话/面板挂载点

| 需求                  | 推荐做法                                                                                                                            | 出处                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 全局 roster 入口/通知 | `sidebar.footer.action`（list）+ `createPortal` 浮层面板（向上展开、focus 进出归还、Esc/外点关闭）                                  | background-agents `:251-332,323-393`                                                                                          |
| Roster 主视图         | 作者规范 §9.1 的 `sidebar.panellist` + `main`（keyed 同 id）；若要平行 tab 形态则学 channel-view 的 DOM 锚点 portal，但接受其脆弱性 | `docs/research/2026-09-19-dsh-plugin-authoring-client.md:478-486`；channel-view README:25                                     |
| 消息内 Bot 动作       | `conversation.session.header.actions` bridge + `createPortal` 到 user 行（当前无 per-user 槽）                                      | rewind `index.ts:249-258`、`portals.tsx:376-391`                                                                              |
| 设置页                | 嵌套 `inject(['settingsScope'])` + `plugins.bundle.config`（keyed by bundle 包名）；`label` 用 thunk                                | rewind `index.ts:277-335`、background-agents `:366-375`                                                                       |
| **跳转到 Bot 会话**   | `ctx.uiWorkspace.openSession(sessionId)`（0.1.6 唯一官方入口；把 `uiWorkspace` 放可选注入，缺失时降级提示）                         | 官方 `ui-subagent/src/client/index.ts:59-65`、`ui-workspace/src/client/navigation.ts:30`；反例见 background-agents `:258-283` |

### 8.3 交互模式

- **惰性提交 + 按会话草稿**：roster 的「给 Bot 发消息/委派草稿」可复刻 EasyRewrite 的 pending store（localStorage + `useSyncExternalStore` + 超时备份 + TTL resume + 恢复优先级「有本地 pending 不读文件」）；这条链同时覆盖「切会话/刷新/重启」三种恢复场景（`:456-506,1164-1201`）。
- **发送拦截**：EasyRewrite 的 document 捕获级 keydown/click 是目前唯一实证；但 BotHarness 若只需「发送给指定 Bot」，优先用自有 composer 面板/命令，不做全局拦截（避免与宿主/其他插件抢事件）。
- **确认与撤销**：rewind 的 `role=dialog` + 焦点漫游 + Esc 分步、EasyRewrite 的「行内胶囊确认 + 取消随时恢复原草稿」；不要用 `window.confirm`。
- **键盘**：↑/↓ 漫游、Esc 关闭、←/→ 翻版本（rewind `popover.ts:540-561`、EasyRewrite `:2533-2546`）——roster 列表键盘导航可直接采用同型。

### 8.4 工程前置（M3 必做）

1. **自建 client 构建**：以 rewind `scripts/build.mjs:76-113` 为模板（esbuild CJS + `window.__ModuleLoader__.load` 包裹 + externals `react/react-dom/react/jsx-runtime/@deepseek-ai/dsh-client-ui-primitives`），产物自检（loader 包装、host 导出、删除 API 不静态导入、公开契约导出）。比 subagent-ui 的 sucrase 拼接与 EasyRewrite 的无构建模板都更可维护。
2. **编译期 slot pin 测试**：`keyof SlotMap` 断言注册槽名（rewind `tests/client-contract.test.ts:28-40`）。
3. **版本策略**：声明 `dsh.engines.dsh`（rewind 单行模型 vs background-agents 多段区间）；peer 只声明验证过的线；维护一份自己的「宿主差异审计」（rewind `docs/compat/audit.md` 格式），M3.5 gate 直接复用。
4. **i18n**：`ctx.locale.register(ns,{zh,en})` + `declare module LocaleNamespaceMap`（background-agents `index.ts:32-39`）；文案进 typed 字典。
5. **样式**：官方要求 CSS Modules/`--dsw-*`；background-agents 用 tsdown+lightningcss 是仓库外最接近官方的 CSS Modules 方案（rewind/EasyRewrite/subagent-ui 都是字符串 CSS，仅 subagent-ui 有暗色处理）。

---

## 9. 未验证 / 存疑

1. **全部运行时行为未验证**：未安装/未运行任何插件；slot 渲染、portal 桥接、RPC/命令往返、localStorage 恢复全部仅来自源码阅读理解。
2. **EasyRewrite 在 0.1.6-alpha.2 的可用性存疑**：它依赖 `sessions.open`、`list.current`、`settings.plugin.item`、`props.useInput` 等 0.1.2 线形状（`:4047,4152,4202`）；README:21 只承诺 `0.1.2-rc.1+`，未声明 0.1.6 适配。其「官方扩展点纪律最好」的评价来自官方 API 使用密度，不代表宿主版本兼容。
3. **subagent-ui 的 `openSubagent` 在 0.1.5-rc.2 是否真存在、0.1.6 删除细节**：官方 pinned 契约（0.1.6-alpha.2）无此方法；中间版本的删除提交未逐行核对。
4. **background-agents 文档漂移**：`ARCHITECTURE.md:68` 的 `openSubagent` 与 `src/client/index.ts:258-283` 的「已移除」矛盾，未去看 git 历史确认哪边是最近一次改动。
5. **channel-view 未读完整源码**（只有预构建 bundle + README + 1 个测试），其「会话投影 latch 6/8」等自述数据未核对。
6. **a11y 覆盖程度**：只核对了显式 `role/aria-*`/焦点管理；未做键盘全程走查（如 rewind popover 是否有焦点陷阱、subagent-ui 模态是否有 focus restore——后者未见实现）。
7. **性能结论未实测**：合并刷新、`useDeferredValue`、投影读取的真实帧耗未测量。
8. **许可证/复用**：样本为 MIT（EasyRewrite/rewind/subagent-ui/channel-view）与 Apache-2.0（background-agents），代码形态可借鉴，直接复制代码需保留版权声明。

---

## 10. 一手来源与访问日期

| 来源                                                                | 支撑内容                                                                                                                                                                                                                                      | 访问日期   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `/tmp/ui-dives/easyrewrite` @ `ecd336ec…`                           | §1 全部；含 `package.json`、`build.mjs`、`src/client.src.js`、`lib/index.js`、`tests/`、`DESIGN.md`、`CHANGELOG.md`                                                                                                                           | 2026-09-19 |
| `/tmp/ui-dives/rewind` @ `9b26ab46…`                                | §2 全部；含 `src/client/*`、`scripts/build.mjs`、`tests/client-contract.test.ts`、`docs/contract/client-contract.md`、`docs/compat/audit.md`、`README.md`                                                                                     | 2026-09-19 |
| `/tmp/ui-dives/subagent-ui` @ `e1c7fc26…`                           | §3 全部；含 `src/client/*.ts`、`lib/index.js`、`scripts/build.mjs`、`README.md`、`AGENTS.md`                                                                                                                                                  | 2026-09-19 |
| `/tmp/ui-dives/background-agents` @ `d1b2ec9d…`                     | §4 全部；含 `src/client/*`、`src/projection.ts`、`tests/action.spec.tsx`、`ARCHITECTURE.md`、`package.json`                                                                                                                                   | 2026-09-19 |
| `/tmp/ui-dives/channel-view` @ `f6383668…`                          | §5；`README.md`、`package.json`、`lib/client.js` 形态                                                                                                                                                                                         | 2026-09-19 |
| `/tmp/dsh-src-client` @ `ddefc45f…`                                 | §7 对照：`packages/api/session-controller/src/client/contract/sessions.ts:49-162`、`sessions/service.ts:53-68`、`packages/client/ui-subagent/src/client/index.ts:23,59-69`、`packages/client/ui-workspace/src/client/navigation.ts:26-37,161` | 2026-09-19 |
| `docs/research/2026-09-19-dsh-plugin-authoring-client.md`（本仓库） | 官方槽位/五份 shares/构建契约/RPC 的对照基线                                                                                                                                                                                                  | 2026-09-19 |
