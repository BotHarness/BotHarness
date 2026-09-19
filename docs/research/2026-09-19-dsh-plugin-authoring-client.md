# DSH 插件开发 client 侧（前端半场）官方一手规范

## 0. 元信息

| 项         | 内容                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 问题       | DSH（DeepSeek Harness）插件开发中，**client 侧（浏览器半场 / Web UI 扩展）**的官方一手规范是什么：`dsh.client` 清单、客户端插件运行时形态、Slots 扩展点全目录、RPC/宿主通信、官方 client 插件样本、构建产物契约、调试循环；以及 BotHarness M3 `@botharness/client` 第一步该怎么落                                                                |
| 上游       | https://github.com/deepseek-ai/deepseek-harness（浅克隆本地读源码与文档，UNC 路径 `\\wsl.localhost\Ubuntu-24.04\tmp\dsh-src-client`）                                                                                                                                                                                                            |
| Pinned SHA | `ddefc45fbc7f8e46dd73185e68295696d1297887`（2026-09-17 21:19 +0800；与 `docs/research/2026-09-18-dsh-plugin-installation.md:9` 同一提交）。根/CLI 版本 `0.1.6-alpha.2`（根 `package.json:2-3`、`apps/cli/package.json:2-4`）。仓库无新提交，故与 09-18 系列调研同源                                                                              |
| 访问日期   | 2026-09-19                                                                                                                                                                                                                                                                                                                                       |
| 调研方法   | `git clone --depth 1` 后逐文件读源码/文档原文：`docs/subsystems/*`、`docs/cookbook/*`、`packages/client/*`、`packages/util/package-manifest`、`packages/api/remotes`；npm registry 只读查询用于「发布态」对照。所有 `file:line` 引用相对 pinned SHA 的仓库根。本次**未运行 DSH、未安装任何插件、未构建任何包**；运行时行为类结论一律标「未验证」 |
| 不重复     | 安装/profile/patch/`/plugins` 宿主侧加载机制见 `docs/research/2026-09-18-dsh-plugin-installation.md`；Node/host 侧作者规范见 `docs/research/2026-09-18-dsh-authoring-conformance.md`；社区 client 插件样本见 `docs/research/2026-09-19-dsh-community-plugins-survey.md`。本文只深挖它们未覆盖的 **client authoring 面**                          |

一句话结论：**DSH 官方「客户端插件」= 同一个 npm 包（或独立包）的浏览器半边：宿主半边是普通 Cordis 插件（Loader entry），浏览器半边由 `dsh.client`（`platform: 'web'`）声明、从 `exports["./client"]` 指向的预构建 lazy-CJS bundle 由宿主经 `/plugins` 提供、浏览器懒加载；浏览器半是一个独立的 Cordis 应用，导出 `apply`/`inject`，只能通过 `ctx.slots`（注册 UI）、`ctx.locale`（i18n）、`ctx.connection.rpc`（通用 RPC）/`ctx.remote`（Typert Remote）等客户端服务工作，不能 inject 任何 Host 服务。** 官方客户端 UI 全部挂在声明式 Slots 上（当前约 60+ 个 key），没有任何一等 mention/roster 扩展 API；RPC 有两条路：面向官方的 Typert `@Remote`（需仓库内代码生成，仓库外可复现性未验证）与任何插件都能用的通用 Connection RPC（`/api` 或自有 channel）。官方**没有**发布 client bundle 构建 preset，仓库外必须自建等价的 tsdown/rolldown 产物（cookbook 原文）。

---

## 1. 官方 client 文档地图（一手）

仓库内文档即文档站同源（站点 `/reference/...` 对应 `docs/subsystems/...`；`/develop/...` 对应 `docs/user/develop/...`）。client 侧作者文档的完整清单：

| 文档                                      | 覆盖内容（要点）                                                                                                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/subsystems/web-client.md`           | Web Client 架构总览：分层（Host → Transport/Remote → Client models → UI adapters → Conversation → Slots → React）、browser boot、重连语义、包边界（`:12-18`、`:84-88`）                                           |
| `docs/subsystems/client-modules.md`       | `dsh.client` 扫描、`WebBootGraph` wire、`/plugins` bundle 路由、index 注入、`ctx.clientModules` 服务面（`:77`、`:85`、`:119-175`）                                                                                |
| `docs/subsystems/slots.md`                | **Slots 规范主文档**：声明与生命周期、kind/scope、组件 props（五份 shares）、框架 hooks、当前层级树、扩展规则（`:9-189`）                                                                                         |
| `docs/subsystems/client-resources.md`     | `dsh-resource://` 地址、`ctx.resources` provider、`useResource` 全局 hook、pin/release（`:1-92`）                                                                                                                 |
| `docs/subsystems/sidebar-right.md`        | 右侧边栏：tab 类型注册/路由、`ctx.sidebarRight`、pane-tab slots、资源模型（`:1-140+`）                                                                                                                            |
| `docs/subsystems/conversation.md`         | Conversation 数据装配与 target 扩展（Chat/Trajectory 的 `ConversationNodeDefinition` 与 keyed renderer）                                                                                                          |
| `docs/cookbook/adding-a-settings-card.md` | **唯一的「插件作者视角」client 教程**：Host 半 `installSection` + browser 半 `slots.register`/`ctx.settingsScope` + 打包两半 + 「无已发布 preset」声明（`:1-102`）                                                |
| `docs/cookbook/adding-a-remote-api.md`    | `@Remote` 五步法：声明/失败码/注册/客户端消费/测试（`:1-197`）                                                                                                                                                    |
| `docs/api-gateway.md`                     | Typert Gateway 全机制：生成管线、客户端调用形态、`/api` 调用、SRC 回退、开发模式（`:1-164`）                                                                                                                      |
| `docs/web-styling.md`                     | 样式所有权：CSS Modules + `clsx`，禁止组件库/Tailwind，`--dsw-*` token（`:1-40`）                                                                                                                                 |
| `packages/client/AGENTS.md`               | **仓库内 client 作者硬规则**（slot/props 纪律、五份 shares、export 纪律、ctx 纪律、共享模块与 `dsh.client.external`、新包清单）（`:1-156`）                                                                       |
| `packages/client/README.md`               | client 包地图（每个包的 role 与 ctx key 表，`:27-82`）                                                                                                                                                            |
| 关键包 README                             | `modules/README.md`（lazy-CJS、失败姿态）、`hmr/README.md`（开发循环）、`connection/README.md`（认证/信任边界/重连）、`locale/README.md`（i18n）、`ui-slots/README.md`（slot 引擎）、`ui-session`（Session 适配） |

> 注意：`docs/user/develop/**` 下**没有**专门的 client 插件教程；`adding-a-settings-card` 是唯一面向外部的 UI 编写 cookbook。client 侧的一手规范密度集中在子系统文档与 `packages/client/AGENTS.md`。

---

## 2. `dsh.client` 清单：全部子键、语义与官方校验

### 2.1 字段表（类型定义）

`packages/util/package-manifest/src/types.ts:28-37`（`DshManifest`：`manifestVersion` / `bundle` / `profile` / `client`）与 `:63-77`：

| 子键          | 类型       | 语义                                                                                                                                                                                                                                                                    |
| ------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform`    | `string`   | 客户端平台标识；Web 消费者只选 `'web'`（`:65-66`）。声明 `dsh.client` 时必填且必须为字符串，否则扫描抛错                                                                                                                                                                |
| `inject`      | `string[]` | **信息性**包名依赖边（`:67-68`；`packages/client/AGENTS.md:142`）：用于预检显示、HMR diff、以及在 materialize 前把被注入包的 factory **先送达**（`packages/client/modules/src/client/system.ts:185-211`）。它**不**决定 Cordis 激活顺序——激活顺序只由服务 `inject` 决定 |
| `immediately` | `boolean`  | 阶段一（parser 预加载 bootstrap）注册屏障；仅基础设施行用（`:69-70`）。缺省表示进入共享 application batch                                                                                                                                                               |
| `external`    | `string[]` | baseline 之外的**精确 module-table 请求**（含 `<pkg>/client` 这类子路径）；缺省=只请求 baseline；`import type` 被擦除、不产生请求（`:71-76`）。**不是功能插件的依赖机制**，只允许基础设施/传输/生成物装配使用（`AGENTS.md:79`）                                         |

### 2.2 官方校验代码位置（node 侧扫描）

- 解析器：`packages/client/modules/src/client/manifest.ts:158-178`（`parseDshClient`：非对象、platform 非字符串、inject/external 非字符串数组、immediately 非布尔 → 抛错；`optionalStringArray` 在 `:141-147`）。
- `exports["./client"]` 解析：`packages/client/modules/src/index.ts:186-197`（`clientExportOf`：接受字符串或 `{ default: string }` 一层条件形态）；`resolveMeta` 在 `:781-810`，缺失时抛 `client-modules: <pkg> declares dsh.client but exports no "./client" bundle`（`:805`）。`platform !== 'web'` 视为「不是 client 包」（`:800-803`）。
- 扫描：只在 `ClientModuleRegistry` 构造时对**存活的 Loader entries** 全量种子 + 增量 flush（`packages/client/modules/src/index.ts:556-575`、`:988-1005`、`:1029-1055`），`internal/plugin` 事件触发 microtask 重扫。包解析用 Loader 自身的 `resolveSync` + 最近祖先 `package.json`（`:825-880`）。
- 失败姿态：激活期 malformed 声明/缺 bundle 聚合为 `ClientPackageCompositionError`（`AggregateError` 子类，`:93-127`）→ fiber FAILED + boot fail-loud；稳态只 warn、不毒化其他包（`:1035-1048`）。

### 2.3 最小清单示例（取自官方包）

`packages/client/ui-jobs/package.json:16-40`：

```json
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  },
  "dsh": {
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-ui-primitives"
      ],
      "platform": "web"
    }
  },
  "files": ["lib/index.js", "lib/client.js", "lib/types/**/*.d.ts"]
}
```

### 2.4 加载链路（与安装调研互补的一句话）

宿主将每个声明 `dsh.client` 的存活条目组合成 `window.__DSH_BOOT__` 的 `WebBootGraph`（`WebBootEntry` 定义在 `packages/client/modules/src/client/manifest.ts:52-65`），经 `/plugins/??<pkg>/client.js&rev=<rev>` 提供；浏览器用 lazy-CJS 模块表加载，bundle 执行时**只注册 factory**（`window.__ModuleLoader__.load({ id, factory })`），模块体副作用（含 CSS 注入）在首次 materialize 时才跑（`manifest.ts:1-30`、`:305-325`、`:346-363`）。

---

## 3. 客户端插件运行时

### 3.1 入口形态

- 插件模块就是包的**构建产物** `lib/client.js`：一个 lazy-CJS factory，返回模块 exports。Cordis 客户端 Loader 把 exports 当**对象插件**消费（`export function apply(ctx)` + `export const inject = [...]`；也可 `Config`）。实例：`packages/client/ui-jobs/src/client/index.ts:24-42`、`packages/client/ui-layout/src/client/index.ts:121-130`。
- 同包的宿主半边是普通 Cordis 插件（`src/index.ts`），通常空实现占位（`packages/client/ui-jobs/src/index.ts:1-9`、`packages/client/ui-user-questions/src/index.ts:10-11`）。
- 浏览器半是**独立 Cordis 应用**：与 Host 分开组装、分开加载；跨进程没有服务注入，不能 `inject(['botharness'])`（`docs/subsystems/web-client.md:8-18`、本仓库 `docs/client-bridge.md:12-16`）。插件 `inject` 列表里的名字是**客户端服务**（如 `slots`、`locale`、`sessions`、`remote`、`uiSession`），fiber 等到服务就绪才执行 `apply`；服务消失自动卸载后重载（Cordis 语义，与 Node 侧一致）。
- 客户端组件的 `ctx` 纪律：**组件永远看不到 ctx**，数据/回调经 slot props 的「五份 shares」传入（`packages/client/AGENTS.md:7-18`、`:40-41`）。

### 3.2 官方客户端服务清单（`ctx.*`，主查自包 README/源码）

| 服务                              | 提供方                                                             | 用途 / 关键 API                                                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.slots`                       | `ui-renderer`（`SlotRegistry extends Service`）                    | 注册/等待/查询 UI 扩展点；`register` / `registerFactory` / `inject` / `provideRoot` / `install` / `installLocale` / `entries` / `entriesOfSlot` / `snapshot` / `subscribe` / `getVersion` / `onEntryError`（`packages/client/ui-renderer/src/client/registry.ts:120-473`） |
| `ctx.locale`                      | `locale`                                                           | `ctx.locale.register(ns, { zh, en })`、`ctx.locale.addLanguage({ id, label, fallback })`、`ctx.locale.bind(ns)`（`packages/client/locale/README.md:34-60`）                                                                                                                |
| `ctx.sessions` / `ctx.workspaces` | `api/session-controller/client`、`api/workspace-controller/client` | React-free 客户端读模型；slot 组件经标准 hooks `useSessions`/`useSession`/`useWorkspaces` 消费（`docs/subsystems/web-client.md:38-52`、`:56-58`）                                                                                                                          |
| `ctx.remote`                      | `api/gateway/client` + `api-remotes/client`                        | Typert Remote 调用面 `ctx.remote.<ns>.<method>()`，`ctx.remote.$on()` 事件，`ctx.remote.$host` 固定宿主事实（`docs/api-gateway.md:58-78`、`:107-147`）                                                                                                                     |
| `ctx.connection`                  | `client/connection` 浏览器半                                       | 通用 RPC：`ctx.connection.rpc.call(channel, endpoint, payload, signal)`；连接代际/恢复状态/`reconnect()`（`packages/client/connection/src/client/index.ts:131-146,310`、`src/rpc.ts:219-251`）                                                                             |
| `ctx.uiSession`                   | `ui-session`                                                       | Session 标准源与 `registerPendingInteraction`（`packages/client/ui-user-questions/src/client/index.ts:91-93`）                                                                                                                                                             |
| `ctx.theme`                       | `ui-theme`                                                         | 主题快照与 `theme/change` 事件（`packages/client/ui-layout/src/client/index.ts:172-180`）                                                                                                                                                                                  |
| `ctx.layout`                      | `ui-layout`                                                        | `MainPanelId` 面板选择、列几何（`packages/client/ui-layout/src/client/index.ts:33-38,135-146`）                                                                                                                                                                            |
| `ctx.sidebarRight`                | `ui-sidebar-right`                                                 | 右栏 tab 导航 `openResource` / `openTab`（`docs/subsystems/sidebar-right.md:75-110`）                                                                                                                                                                                      |
| `ctx.resources`                   | `resources`                                                        | `ctx.resources.register({ protocol, open })` 资源协议 provider；`useResource` 全局 hook（`docs/subsystems/client-resources.md:22-55`）                                                                                                                                     |
| `ctx.settingsScope`               | `ui-settings` 浏览器半                                             | 插件设置卡片读写（`bind({ namespace })` + `set/unset`）（`packages/client/ui-settings/src/client/settings-scope.ts:221,254`、`docs/cookbook/adding-a-settings-card.md:48-72`）                                                                                             |
| `ctx.modules`                     | `modules` 浏览器半                                                 | lazy-CJS 模块表（`manifest.ts:382-422`；一般插件不需要直接用）                                                                                                                                                                                                             |
| `ctx.uiRenderer`                  | `ui-renderer`                                                      | 仅 shell 使用（`packages/client/README.md:37`）                                                                                                                                                                                                                            |
| `ctx.fileUpload`                  | `file-upload`                                                      | 原始 Blob/流上传（`packages/client/README.md:32`）                                                                                                                                                                                                                         |

### 3.3 标准 hooks 与约束

slot 组件按作用域自动获得的框架 hooks（`docs/subsystems/slots.md:79-93`）：`useSessions`/`useSessionStatus`/`useSessionRetainInfo`（所有 scope）、`useWorkspaces`（所有 scope）、`usePanelInfo`（所有 scope）、`useSession`/`sessionId`/`useProjection`（`session`）、`useConversation`/`useInput`/`inputActions`（`session`）、`useChat`（`session`）、`useTrajectory`（`session`）、以及注册处声明的 `useStore`/`t`/`useResource` 与 inject face 的 `use<Name>`。**业务组件不得自建订阅机制**（`AGENTS.md:20-29`）。

React 版本：client 包统一 `react: ^18.2.0`、`@types/react: ~18.3.1`（`packages/client/web/package.json:37-41`）；shell 把 React 作为静态模块表种子共享（§7）。

---

## 4. Slots / 扩展点全目录（最重要）

### 4.1 注册表源码与 API

- **纯内核**：`packages/client/ui-slots/src/index.ts` —— `SlotMap`/`SlotFactoryMap`/`LocaleNamespaceMap` 声明合并点（`:25-47`）；`SlotKind = 'single' | 'list' | 'keyed' | 'chain'`、`SlotScope = 'root' | 'session-maybe' | 'session'`（`:100-104`）；`SlotCore` 类（`:987-1210`，含 root 种子 `:1008-1014`、register 重载 `:1157-1202`、未声明槽位抛错 `:1204-1207`）。
- **Cordis 服务层**：`packages/client/ui-renderer/src/client/registry.ts:120-763` —— `SlotRegistry extends Service`；`register` 经 `ctx.effect` 绑定**调用方 fiber**（`:739-746`，卸载即回收）；`inject(key, cb)` 等待声明生命周期、可事务性回滚（`:209-271`）；`provideRoot()` 贡献全局标准 hooks（`:312-329`）；`install/installLocale/installScope/绑定 store scope`（`:279-352`）；`renderSlot('root')` 是唯一 ctx 级渲染入口（`:381-395`）；`entries/entriesOfSlot/snapshot/onEntryError/spec/subscribe/getVersion` 供检查（`:402-472`）。
- **官方文档树**：`docs/subsystems/slots.md:107-178`（内容与源码有少量漂移，见 §4.5）。

### 4.2 kind / scope / priority 语义（怎么用）

| 概念         | 语义                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `single`     | 一个格子；同优先级第二个注册**抛错**；不同优先级按升序遮蔽（shadowing）                                                                                    |
| `list`       | 必须 `id`，按 `order` 升序、再按注册顺序；追加用新 `id`                                                                                                    |
| `keyed`      | owner 在 renderSlot 时给 `entryKey`，匹配单元渲染并接收 keyProps；重复 key 同优先级抛错                                                                    |
| `chain`      | 每条注册给纯函数 `select(owner)`；按 `priority` 升序第一个非 null 者当选，组件收到 `matched`，全 null 走 owner fallback（`ui-slots/src/index.ts:285-296`） |
| `root` scope | 一个根实例；`session-maybe` 可无会话渲染；`session` 必须绑定会话                                                                                           |
| `priority`   | 升序；默认 0；同 cell 同 priority 抛错；`list`/`keyed` 复用 cell = 替换展示，新 id/key = 追加（`slots.md:58`）                                             |

注册/排序/卸载模式（官方标准写法）：

```tsx
// 来源：docs/subsystems/slots.md:32-42（官方示例）
export const inject = ['slots'];
export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register(
      { name: 'conversation.session.header.actions', id: 'review', order: 100 },
      HeaderAction,
    ),
  );
}
```

规则：禁止模块级副作用；`inject` 回调在声明坍塌时回收、重声明时重跑；将多个注册原子安装可返回 generator（`AGENTS.md:143`、`slots.md:17-18`）。**没有卸载 API 之外的排序后改**——排序在注册时定死；卸载=disposer/fiber 卸载。`label` 可为 thunk 以跟随语言变化（`ui-slots/src/index.ts:756-758`）。

### 4.3 组件 props 约定（五份 shares）

`docs/subsystems/slots.md:62-105` + `packages/client/AGENTS.md:12-18`：`PropsRuntime<K>`（owner 值 + scope/global 标准位）、`PropsRenderSlots<S>`（已声明子槽的 `renderSlot`，含 `SessionProvider`）、`PropsRenderFactories`（`renderFactorySlot`）、`PropsStore<H>`（`useStore`/`actions`）、inject face（注册处 `inject` 工厂返回的普通数据/回调；保留 `hooks` 隔间会被渲染器合成为 `use<Name>`）。组件类型一律派生，不得手写；**ReactNode 只走子槽传递，不进 props**（`AGENTS.md:27`）。

### 4.4 全量槽位目录（以源码声明为准；`文件:行` 为声明处）

**框架/布局（ui-renderer + ui-layout）**

| 槽位            | kind/scope  | 用途                                                                                               |
| --------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `root`          | single/root | 内置根洞，`ui-layout` 的 AppFrame 占用；**禁止注册**（`ui-renderer/src/client/registry.ts:28-46`） |
| `sidebar`       | single/root | 整条左栏；被 ui-sidebar 占用，替换=整列消失（`ui-layout/src/client/index.ts:51-61`）               |
| `main`          | keyed/root  | 中央面板，按 sidebar 行 `id` 寻址；保留 key `conversation`（`:62-66`）                             |
| `rightbar`      | single/root | 右列容器；被右栏占用（`:67-80`）                                                                   |
| `shell.overlay` | list/root   | **帧级浮层**（badge/toast/status）可穿透点击；加自己的 `id` 即可（`:81-91`）                       |

**侧边栏（ui-sidebar/src/client/contract/slots.ts）**

| 槽位                                        | kind/scope  | 用途                                                                  |
| ------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| `sidebar.toggle.badge`                      | single/root | 折叠按钮内通知点（`:18`，**不在文档树里**）                           |
| `sidebar.brand.mark` / `sidebar.brand.name` | single/root | 品牌图形/名称替换（`:24,29`）                                         |
| `sidebar.panellist`                         | list/root   | **全局面板图标行**：`id` 同时寻址 `main` keyed 槽（`:34`；README:36） |
| `sidebar.workspaces`                        | single/root | 工作区/会话浏览区（ui-workspace 占用）（`:41`）                       |
| `sidebar.settings`                          | single/root | 设置入口（ui-settings 占用）（`:47`）                                 |
| `sidebar.footer.action`                     | list/root   | 设置旁的行动作（`:52`）                                               |

**会话/组合器（ui-conversation/src/client/contract/slots.ts）**

| 槽位                                                 | kind/scope           | 用途                                                          |
| ---------------------------------------------------- | -------------------- | ------------------------------------------------------------- |
| `main.conversation`                                  | single/session-maybe | Conversation 外壳（`:127`）                                   |
| `conversation.session`                               | single/session       | 会话正文（`:129`）                                            |
| `conversation.session.header`                        | single/session       | 标题/动作/View 导航（`:135`）                                 |
| `conversation.session.header.lineage`                | single/session       | 面包屑标题替换（`:137`）                                      |
| `conversation.session.header.actions`                | list/session         | **标题旁动作**（顺序追加；M3 快捷入口合适）（`:143`）         |
| `conversation.session.header.utilities`              | list/session         | 右对齐工具（`:149`）                                          |
| `conversation.session.header.leading` / `.corner`    | single/session       | 头部最左/最右单席位（`:161,172`）                             |
| `conversation.view`                                  | list/session         | 会话 target Views（Chat/Trajectory 等）（`:178`）             |
| `conversation.composer`                              | chain/session        | **组合器接管链**：可整体替换输入面（问询/审批用它）（`:180`） |
| `conversation.hero.workspace`                        | single/root          | 空会话工作区选择器（`:182`）                                  |
| `conversation.hero.brand.mark`                       | single/root          | 空会话品牌标记（`:184`）                                      |
| `conversation.hero.agentPreset`                      | single/session-maybe | 新会话 preset 控件（`:186`）                                  |
| `conversation.input.dock`                            | list/session         | composer 卡片上方整行（`:188`）                               |
| `conversation.input.overlay`                         | list/session         | composer 卡内浮层（`:190`）                                   |
| `conversation.composer.dock`                         | list/session         | composer 卡下方环境条目（`:192`）                             |
| `conversation.input.left` / `.right`                 | list/session         | 工具行左/右紧凑控件（`:194,196`）                             |
| `conversation.composer.bar`                          | single/session-maybe | composer 主体（`:198`）                                       |
| `conversation.input.attachments`                     | single/session-maybe | 附件栏（`:200`）                                              |
| `conversation.input.plan` / `.permission` / `.model` | single/session       | 工具行命名控件（`:206-210`）                                  |
| `conversation.content`（**Factory**）                | session-maybe        | 可复用会话装配（嵌到其他宿主）（`:213-234`）                  |

**聊天/工具/轨迹（ui-chat、ui-tool、ui-trajectory）**

| 槽位                                  | kind/scope     | 用途                                                                                                                              |
| ------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `conversation.chat.node`              | keyed/session  | **按 ChatNodeKind 的节点渲染器**（复用 key=替换；未占用 key 回退通用行）（`ui-chat/src/client/contract/slots.ts:188-195`）        |
| `conversation.message.images`         | single/session | 消息图片组渲染（`:201`）                                                                                                          |
| `conversation.chat.commandview`       | keyed/session  | 命令生命周期行（`:207`）                                                                                                          |
| `conversation.chat.turnTail`          | list/session   | 已完成 turn 的行动前条目（`:213`）                                                                                                |
| `conversation.chat.assistant-actions` | list/session   | 助手消息动作条（`:219`）                                                                                                          |
| `tool.call.toolview`                  | keyed/session  | **按工具名渲染调用卡片**；open key 域，自己的工具可自绘（`ui-tool/src/client/contract/slots.ts:26`）                              |
| `tool.call.images`                    | single/session | 工具图片画廊（`:40`）                                                                                                             |
| `tool.view.cordis`                    | keyed/session  | 动态插件在 `cordis_run` 卡内的自绘区（`packages/extensions/ui-cordis/src/client/slots.ts:24-42`，**不在文档树正表但树里出现过**） |
| `conversation.trajectory.images`      | single/session | Trajectory 图片组（`ui-trajectory/src/client/trajectory-contract.ts:98`）                                                         |

**审批/问询（ui-approval、ui-user-questions）**

| 槽位                               | kind/scope     | 用途                                                                    |
| ---------------------------------- | -------------- | ----------------------------------------------------------------------- |
| `conversation.approval.detail`     | single/session | 审批请求的工具详情替换（`ui-approval/src/client/contract/slots.ts:37`） |
| `conversation.plan-review.actions` | list/session   | 计划评审动作（`ui-user-questions/src/client/contract/slots.ts:21`）     |

**设置（ui-settings、ui-settings-general、ui-settings-models、ui-settings-plugins）**

| 槽位                                 | kind/scope  | 用途                                                                                                                  |
| ------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `settings.trigger`                   | single/root | 侧栏底部触发行内容（`ui-settings/src/client/contract/slots.ts:24`）                                                   |
| `settings.header` / `settings.close` | single/root | 面板标题/关闭无障碍名（`:30,42`）                                                                                     |
| `settings.action`                    | list/root   | 内容列头部动作（`:36`）                                                                                               |
| `settings.section`                   | list/root   | **一个设置页**（`id`=section key、`order`、`label` 注册方本地化）（`:54`）                                            |
| `settings.plugins.tab`               | list/root   | Plugins 页内的一个 tab（`:63`）                                                                                       |
| `settings.onboarding`                | list/root   | 引导步骤（`:74`）                                                                                                     |
| `settings.general.item`              | list/root   | General 区一行偏好（locale/主题/composer 已用）（`:89`；运行时在 `ui-settings-general/src/client/index.ts:193` 声明） |
| `settings.models.provider-card`      | keyed/root  | 按设置 namespace 给 provider 卡加扩展区（`ui-settings-models/src/client/slot-contract.ts:33`）                        |
| `settings.models.footer`             | list/root   | Models 页脚区（`:38`）                                                                                                |

**右栏（ui-sidebar-right、ui-sidebar-documentpreview、ui-workspace）**

| 槽位                                                                             | kind/scope     | 用途                                                                                                      |
| -------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `rightbar.session`                                                               | single/session | 右栏会话内容（`ui-sidebar-right/src/client/contract/slots.ts:42`）                                        |
| `sidebar.right.pane.tab`                                                         | keyed/session  | **按 tab 类型 id 注册 tab 体**（`:50`；hookContext=TabHookContext）                                       |
| `sidebar.right.pane.tab.title`                                                   | keyed/session  | tab 标题（`:64`）                                                                                         |
| `sidebar.right.tab.guide`                                                        | chain/session  | 替换 guide tab 内容（`:75`）                                                                              |
| `sidebar.right.tab.guide.entry`                                                  | keyed/session  | guide 卡片（`:82`）                                                                                       |
| `sidebar.right.tab.menu.item`                                                    | list/session   | tab 动作菜单项（`:94`）                                                                                   |
| `sidebar.right.tab.document`                                                     | keyed/session  | 文档预览实现 id 注册（`ui-sidebar-documentpreview/src/client/document/contract.ts:45`，**不在文档树里**） |
| `sidebar.workspaces.directoryFlow` / `conversation.hero.workspace.directoryFlow` | single/root    | 工作区目录选择交互洞（`ui-workspace/src/client/contract/slots.ts:57,59`）                                 |

**插件管理（ui-plugin-manager/src/client/slot-contract.ts）**

| 槽位                    | kind/scope | 用途                                                      |
| ----------------------- | ---------- | --------------------------------------------------------- |
| `plugins.item`          | list/root  | Official 组里的一张插件页（summary/page 两视图）（`:32`） |
| `plugins.bundle.config` | keyed/root | 按 bundle 包名给 bundle 页配配置（`:38`）                 |
| `plugins.row.config`    | keyed/root | 按 `<pkg>#<row id>` 给单行配配置（`:45`）                 |

### 4.5 文档与源码漂移（写 Skill 时必须以源码为准）

1. `docs/cookbook/adding-a-settings-card.md:50-68` 让卡片注册进 `settings.plugin.item`——**该 key 在当前源码中不存在**（全仓库 grep 只命中 cookbook 自身）；当前等价物是 `plugins.item` / `plugins.bundle.config` / `plugins.row.config`（ui-plugin-manager）与 `settings.plugins.tab`（ui-settings）。
2. `docs/subsystems/slots.md:107-178` 的层级树未列 `sidebar.toggle.badge`、`sidebar.right.tab.document`、`tool.view.cordis` 三个已在源码声明的 key。
3. 运行时可查活树：`cordis_inspect what:"client"`（由 `packages/extensions/cordis-client-runner` 提供，catalog 生成自 `SlotMap` 与 `slots.register` 调用点，`docs/subsystems/slots.md:180`）。

---

## 5. RPC / Host Remote（客户端如何调宿主）

### 5.1 官方 Typert Remote 路线（适合仓库内；仓库外未验证）

- 形态：Host 服务用 `@Remote` / `@RemoteScope` 标注方法；客户端调用 `ctx.remote.<namespace>.<method>(...)` / `agentCtx.remote.<ns>`（`docs/api-gateway.md:7-18`、`:58`）。
- 生成管线：Host 构建期由 `@deepseek-ai/dsh-typert-generator` 从 **Host aggregate ts.Program** 生成 `lib/typert.host.*` 与 `lib/typert.remote-client.*`；客户端 `@deepseek-ai/dsh-api-remotes` 显式选择并 `ctx.remote.$mount()` 挂载（`docs/api-gateway.md:84-115`、`packages/api/remotes/README.md:28-34`）。客户端**不做运行时发现**——没有生成物就挂不上（`docs/api-gateway.md:131-137`）。
- 调用信封：`ctx.remote.<ns>.<method>()` 返回 `RemoteResult<T>`（`{ok:true,value}|{ok:false,error}`），不 reject；失败码体系 `RemoteError` + `RemoteErrorDetailsMap` 合并（`docs/cookbook/adding-a-remote-api.md:51-88`、`:107-147`）。
- 转发事件：`API_REMOTE_FORWARDED_EVENTS` 是**第一方静态白名单**（`packages/api/remotes/README.md:41-45`），第三方包无法追加——这决定了「六态实时推送」不能走 `ctx.remote.$on`。
- **仓库外可复现性未验证**：`@deepseek-ai/dsh-typert-generator` 在 npm 上有 `0.0.1-rc.1` 发布，但整个管线依赖仓库的 tsconfig host/client face 与根构建顺序（`docs/api-gateway.md:95-101`）；外部包能否独立复刻未实测。

### 5.2 通用 Connection RPC 路线（**任何插件可用的官方通用面**）

Host 半（`packages/client/connection/src/rpc-host.ts:78-94`、`src/rpc.ts:137-162`）：

```ts
// 通道形态：注册一个独立 channel（如 /botharness），或拦截共享 /api 的端点
ctx.connection.rpc.handle('/botharness', async (endpoint, payload, signal) => {
  /* ConnectionRpcResult */
});
ctx.connection.rpc.intercept(
  '/api',
  (ep) => ep.startsWith('botharness/'),
  async (endpoint, payload, signal) => {
    /* ... */
  },
);
// 流式/非 JSON：精确 Fetch 路由
ctx.connection.fetch.register({
  path: '/api/botharness/stream',
  methods: ['GET'],
  requestBody: 'streaming',
  fetch: (req) => Promise<Response>,
});
```

客户端半（`packages/client/connection/src/rpc.ts:219-251`）：

```ts
const r = await ctx.connection.rpc.call('/botharness', 'list', { query: '' }, signal);
if (!r.ok) {
  /* r.error.code / r.error.message / r.error.details */
}
```

- 结果信封固定为 `ConnectionRpcResult<T> = {ok:true,value}|{ok:false,error:{code,message,details}}`（`rpc.ts:17-27`）——本仓库 `docs/client-bridge.md:23-29` 的 `BridgeResult` 是它的子集。
- 请求体约定：客户端 `rpc.call(channel, endpoint, payload)` 的 `payload` **原样**交给 handler（`rpc-host.ts:239`）；Typert Remote 的 `{ args }` 包裹只是它的约定（`docs/api-gateway.md:121`）。`channel='/api'` 保留给 `intercept`，`handle` 不接受（`rpc-host.ts:290-295`），独立 channel 会自动挂一条带鉴权的物理前缀路由（`rpc-host.ts:158-182`）。
- 每个 RPC 请求都过统一信任门与浏览器认证：Host/Origin 白名单（防 DNS rebinding/跨站）+ 签名 cookie（root token 换发），失败 403/401（`packages/client/connection/README.md:34-43`、`rpc-host.ts:96-110`）。**`dsh web --host 0.0.0.0` 不受支持**（README:41）。

### 5.3 安全边界（浏览器半边能做什么/不能做什么）

- **不能**：inject 任何 Host Cordis 服务、直接读写宿主文件系统、直接访问 agent/session 对象；一切经 `/api` 上的 Remote/通用 RPC/精确 Fetch 路由。
- **能**：读 `ctx.remote.$host`（`home`/`isLoopback` 普通字段，无订阅）；订阅连接代际与 `connection/reset`（`docs/cookbook/adding-a-remote-api.md:111`）；通过官方客户端模型（`ctx.sessions`/`ctx.workspaces`/Session hooks）读取已装配数据。
- 流式更新三类：Remote 逻辑流（Typert）、`$events` 转发事件（白名单不可扩展）、精确 Fetch 路由上的自建 SSE/长轮询（第三方实时性的官方出口，`docs/client-bridge.md:51` 同判断）。

---

## 6. 官方 client 插件样本与最小完整骨架

### 6.1 黄金样本 A：`@deepseek-ai/dsh-client-ui-jobs`（最小骨架范本，浏览器半 42 行）

- 宿主半：`src/index.ts:1-9`——空 `apply()`，只为让包成为 Loader entry、让 `dsh.client` 被扫描。
- 浏览器半：`src/client/index.ts:24-42`——`inject = ['sessions','slots','locale']`；注册字典 + 一个 header action：

```ts
export const inject = ['sessions', 'slots', 'locale'];
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-job: dictionaries');
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.actions',
        id: 'job-list',
        order: 20,
        locale: NS,
      },
      JobListAction,
    ),
  );
}
```

- 组件只收 props（`JobListActionProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<typeof NS>`），用标准 hook `useSessions(state => state.jobsBySession[sessionId])` 读镜像数据，**零 RPC**（`src/client/JobListAction.tsx:1-30`）。
- 包清单与构建：`package.json:16-40`、`tsdown.config.ts`（3 行调用共享 preset）。

### 6.2 黄金样本 B：`@deepseek-ai/dsh-client-ui-user-questions`（进阶：chain 接管 + 事件 + store + i18n）

`src/client/index.ts:51-107`：`inject = ['sessions','remote','uiSession','slots','locale']`；`ctx.remote.$on('user-questions/request', …)` 挂 scoped waterfall 事件；`ctx.slots.inject('conversation.composer', …)` 注册 chain 条目（`select` 从 `pendingInteraction` 择出自己）；`store: questionDraftStore`；`locale: 'question'`。该包也是「同包两半」的官方形态（`src/index.ts` 空、`exports['./client']` 指向产物）。

### 6.3 最小完整 client 插件骨架（仓库外，可直接照抄的形态）

```text
my-plugin/
├─ package.json
├─ tsdown.config.ts        # 仓库外必须自建等价构建（见 §7.3）
├─ src/
│  ├─ index.ts             # 宿主半：export function apply(): void {}
│  └─ client/
│     ├─ index.ts          # 浏览器半：export const inject = [...]; export function apply(ctx) {...}
│     └─ Panel.tsx         # 纯 props 组件
└─ lib/                    # client.js（预构建产物）+ index.js + types/，随包发布
```

```ts
// src/index.ts —— 只为成为 Loader entry
export function apply(): void {}
```

```ts
// src/client/index.ts —— 官方形态（对照 ui-jobs:24-42 / docs/subsystems/slots.md:32-42）
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'; // 仅为把 SlotMap 声明拉进类型程序
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

export const inject = ['slots', 'locale'];
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('myPlugin', { zh, en }), 'my-plugin: dictionaries');
  const t = ctx.locale.bind('myPlugin');
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: 'my-panel', order: 50, label: () => t('panel') },
      MyIcon,
    ),
  );
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'my-panel' }, MyPanel));
}
```

要点：`sidebar.panellist` 的 `id` 必须与 `main` keyed 的 `key` 一致（`packages/client/ui-sidebar/README.md:36`）；`label` 可为 thunk 以跟随语言（`ui-slots/src/index.ts:754-758`）。

---

## 7. 构建与产物

### 7.1 官方共享 preset 的产物契约（`packages/client/tsdown.client.ts`）

| 契约       | 内容                                                                                                                                                                                            | 来源                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 输出格式   | **CJS**、`platform: 'browser'`、入口文件名固定 `lib/client.js`、chunk `client.<name>.js`                                                                                                        | `:473-490`、`:604-608`                                        |
| 自注册     | 每条输出包一层 banner/footer：`window.__ModuleLoader__.load({ id, ["chunk: "...] factory: (require) => { ... return module.exports; } })`                                                       | `:618-625`                                                    |
| externals  | baseline（`PLATFORM_MODULES` + 空 `PRELOADED_CLIENT_EXTERNALS`）隐式 external；`dsh.client.external` 追加精确请求；**其余全部内联**（`neverBundle: isRequested`、`alwaysBundle: !isRequested`） | `:401-425`、`:491-499`                                        |
| 纯度门     | 跨插件 `@deepseek-ai/*` 值导入若既非请求外部、也非 `INLINE_SAFE`/生成 `/remote`/vendored 库，则**构建报错**（职责=走 Cordis 服务或 slot）                                                       | `:64`、`:528-546`                                             |
| CSS        | `*.module.css` → 哈希类名 + factory 执行时注入 `<style data-plugin>`；`*.css?inline` → 导出编译文本；普通 `.css` 也内联注入                                                                     | `:30-56`、`:547-603`                                          |
| sourcemap  | `sourcemapExcludeSources:false`，把 `lib/types` 的 tsc map 链进产物                                                                                                                             | `:683-713`、`:609-617`                                        |
| 构建期环境 | 静态替换 `process.env.DSH_CLIENT_*`（只读、公开）；`NODE_ENV`/`import.meta.env` 也定义                                                                                                          | `packages/client/AGENTS.md:70-72`、`tsdown.client.ts:520-527` |
| 两半同包   | `clientBundle(id, ['lib/types/index.js'])` 一次产出 node 库 + 浏览器 bundle；`package.json exports` 用 `.` 与 `./client`；`files` 覆盖 `lib/index.js`、`lib/client.js`、`lib/types/**/*.d.ts`   | `tsdown.client.ts:93-127`；`ui-jobs/package.json:41-44`       |

`PLATFORM_MODULES` 全量（shell 共享的模块表，客户端 bundle 的外置基线）：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`（`packages/client/web/src/platform.ts:8-14`；`PRELOADED_CLIENT_EXTERNALS` 当前为空 `:17-18`）。

> 与 PRD 附录 E 的校正：shell 共享的**不止** `react`/`react-dom`，还包括上表其余 5 项；`@botharness/client` 的 bundle 也应外置这些（若用它们的类型/运行时的共享实例）。

### 7.2 同包两半的目录/exports 约定

官方新包清单（`packages/client/AGENTS.md:136-145`）：`package.json`（`.`/`./client`/`./src/*`/`./package.json` + `dsh.client` + `files`）、`tsconfig.json`、`tsdown.config.ts`、`src/index.ts`（空 node-half apply）、`src/client/` 浏览器半。**在仓库内还必须**：`tsconfig.client.json` aggregate references、`packages/bundle/web-app/cordis.patch.yml` 的 `dsh.client` 行、`packages/bundle/web-app/package.json` 依赖（`:141`）——这三条是仓库内注册面，仓库外对应为：profile 的 bundle patch 行（让宿主半成为 Loader entry）+ 包依赖。

### 7.3 仓库外构建的现实

- **官方不发布 preset**：`docs/cookbook/adding-a-settings-card.md:94-102` 原文——"No published preset exposes this package, so a package outside this repository has to reproduce the same output format itself."（本仓库 `docs/client-bridge.md:69` 已把此列为 M3 最大工程风险）。
- 自建需复刻：CJS + banner/footer 自注册、`lib/client.js` 文件名、baseline externals、其余内联、CSS Modules 注入、sourcemap；另需在写完全部 chunk 后 **touch 入口**（官方 preset 有意让 `client.js` mtime 晚于 chunk，HMR 用「入口字节 + 完成戳」判定 revision；`tsdown.client.ts:462-469`、`packages/client/hmr/README.md:32`）。**未验证**自建产物在 HMR 下的等价性。
- npm 发布态对照（2026-09-19 查询）：`@deepseek-ai/dsh-client-ui-slots@0.0.1-rc.1`、`@deepseek-ai/dsh-client-modules@0.0.1-rc.1`、`@deepseek-ai/dsh-client-connection@0.0.1-rc.1`、`@deepseek-ai/dsh-api-remotes@0.0.1-rc.1`、`@deepseek-ai/dsh-client-ui-renderer@0.1.0-rc.8`、`@deepseek-ai/dsh-typert-generator@0.0.1-rc.1`；均显著落后于 pinned SHA 的 `0.1.6-alpha.2`。**发布包仅可作类型/契约参考，版本兼容性未验证**。

---

## 8. 调试与验证

### 8.1 开发循环

- 官方仓库内：`pnpm dsh web` + `pnpm run dev:web`（host 走 tsx 源启动 + Client 插件 watcher 重写 `lib/client.js`；`docs/api-gateway.md:139-156`）。HMR 传输由 `@deepseek-ai/dsh-client-hmr` 提供：500ms 默认轮询（`packages/client/hmr/README.md:40-44`），rebuilt 帧到达后旧 fiber 拆除、新 bundle 物化、plugin 重挂（React 局部 state 丢失，会话/工作区/连接状态保留）（`:34-48`、`:64-74`）。
- 仓库外：在插件包跑自己的 `tsdown --watch`（官方措辞 "or a watch process using the shared Client tsdown preset"，`hmr/README.md:32`）；改完 bundle，HMR 自动换；或用页面刷新。官方明确**改 out-of-tree 插件必须重建产物**，宿主只服务 `lib/client.js`（`packages/client/AGENTS.md:144`）。

### 8.2 加载失败的表象与排查（按链路顺序）

| 表象                                                                                                                               | 根因                                                                        | 证据位置                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| fiber FAILED + `AggregateError: N client packages failed to compose` / `client bundle not found; run pnpm run build before launch` | 声明了 `dsh.client` 但 `lib/client.js` 不存在                               | `packages/client/modules/src/index.ts:93-127`                 |
| `client-modules: <pkg> declares dsh.client but exports no "./client" bundle`                                                       | `exports` 缺 `./client`                                                     | `:805`                                                        |
| `client-modules: <pkg> dsh.client.<field> must be …`                                                                               | 清单字段畸形                                                                | `packages/client/modules/src/client/manifest.ts:141-178`      |
| `bundle <url> loaded without registering "<id>" via __ModuleLoader__.load`                                                         | 产物不是 lazy-CJS 自注册格式（例如打成了 ESM）                              | `packages/client/modules/src/client/system.ts:175-178`        |
| 构建报 `client bundle purity: "<spec>" is not in … externals …`                                                                    | 值导入了别的插件包                                                          | `tsdown.client.ts:541-545`                                    |
| 激活期抛 `slot "<key>" is not declared` / 重复同优先级 / 一个 store handle 跨 scope                                                | 注册进未声明槽 / cell 冲突                                                  | `ui-slots/src/index.ts:1204-1207`、`:1122-1152`               |
| UI 不出现但无报错                                                                                                                  | 槽位所在父条目未挂载（如右栏未开）、keyed key 不匹配、list id 撞车被 shadow | `slots.md:109`（子树随父条目生命周期）                        |
| 页面侧同步失败                                                                                                                     | HMR 下载/物化失败，`Settings → Plugins → Plugin list` 提供页内重试          | `packages/client/modules/README.md:42`、`hmr/README.md:72-74` |

### 8.3 验证清单

1. `window.__DSH_BOOT__.entries` 含包名；Network `/plugins/<pkg>/client.js...` 200（安装调研已在 §4.3 记录）。
2. `Settings → Plugins → Plugin list` 无页内同步失败。
3. `cordis_inspect what:"client"` 查询活槽树与占用（`docs/subsystems/slots.md:180`）。
4. 改 bundle 后先 `pnpm --filter <pkg> bundle` 再探活（`packages/client/AGENTS.md:144`）；重启宿主只在 bundle 集合变化时必要（安装调研 §4.3）。
5. 构建期自检：`pnpm run build`；客户端 lint/i18n 门（`verify-client-ui-i18n`）为仓库内门，外部包按同规则自查（产品文案进 typed locale 字典，`AGENTS.md:111-115`）。

---

## 9. 对 BotHarness 的落点（M3 `@botharness/client`）

### 9.1 第一步：界面挂哪里

| 需求（PRD/架构）                   | 推荐槽位                                                                              | 说明                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Roster 面板（名册/详情/新建）      | `sidebar.panellist`（list，`id: 'botharness'`）+ `main`（keyed，`key: 'botharness'`） | 官方「同 id 寻址」模式（`ui-sidebar/README.md:36`、`ui-layout/src/client/index.ts:62-66`）；比替换 `sidebar` 安全，比右栏简单 |
| 会话内快捷动作（如「发给某 Bot」） | `conversation.session.header.actions`（list）                                         | 与 ui-jobs 同样的轻量模式（`ui-jobs/src/client/index.ts:32-41`），用 `useSession`/`useSessions` 可读当前会话                  |
| 全局状态/通知                      | `shell.overlay`（list）                                                               | 帧级浮层、可穿透点击（`ui-layout:81-91`）                                                                                     |
| 设置卡片（模型/默认 preset）       | `settings.general.item`（list）或 `settings.plugins.tab`（list）                      | 前者无需整页；插件自身配置页用 `plugins.bundle.config`（keyed by bundle 名）（`ui-plugin-manager` 契约）                      |
| composer `@PersonaBot`（M3 后续）  | `conversation.input.*`（left/right/overlay/dock）或 `conversation.composer` chain     | 上游**没有** mention API（作者审计 §24-26），需自建选择器；若做「接管式」输入才用 chain                                       |

注册纪律：所有注册走 `ctx.slots.inject(key, () => ctx.slots.register(...))`、禁止模块级副作用；每个注册必须有稳定 `id`/`key` 与 `order`（便于人与其他插件共存）。

### 9.2 RPC 面：与 `docs/client-bridge.md` 一致，官方通用 RPC 成立

- 浏览器半调用：`ctx.connection.rpc.call('/api', 'botharness/<method>', payload, signal)`（Host 用 `intercept` 于共享 `/api`）或注册独立 channel `ctx.connection.rpc.handle('/botharness', handler)` 后 `call('/botharness', '<method>', …)`。信封直接用官方 `ConnectionRpcResult`：`{ok:true,value}|{ok:false,error:{code,message,details}}`（`rpc.ts:17-27`）——本仓库 `BridgeResult` 可无损映射。
- 不选 Typert：与 ADR-0023 / `docs/client-bridge.md:54-61` 判断一致；本调研补充一手证据：Typert 客户端面**没有运行时发现**，生成物必须由仓库内 tsconfig face 管线产出，仓库外复现未验证。
- 实时性：官方 `$events` 白名单第三方不可扩展（`packages/api/remotes/README.md:41-45`、`:73-75`）；如 M3 后续需要六态实时，出口是 `ctx.connection.fetch.register` 的精确路由上自建 SSE（Host 半）+ 客户端 `fetch`/`EventSource`，或改为低频轮询（client-bridge §4 的 MVP 选择仍成立）。
- Host 半注册位于 `@botharness/core`（或 bundle 内的 host 服务插件）：`inject` 加 `connection`；注意 `rpc.handle` 注册在**当前 fiber**，卸载即撤销（`rpc-host.ts:158-182`）。

### 9.3 构建准备（M3 的工程前置）

1. **拆包形态**：ADR-0023 选择独立 `@botharness/client` 包（偏离官方「同包两半」惯例）。可行前提：该包自己有 `dsh.client` + `exports['./client']` + **一个空/极薄的宿主半**（像 ui-jobs 一样作为 Loader entry 被挂上），否则 `dsh.client` 不会被扫描（扫描对象是 Loader entries，`client-modules.md:77`）。若想少一层风险，也可把浏览器半并入 `deepseekbot` bundle 包的 `src/client/`，与官方形态完全一致。
2. **自建 tsdown/rolldown 客户端构建**：复刻 §7.1 契约（CJS/自注册 banner/`lib/client.js`/baseline externals 内联其余/CSS Modules 注入/sourcemap/touch 入口）。建议写一个 `packages/client/tsdown.client.ts` 的等价物并在 Skill 里固定为模板。
3. **依赖外置白名单**（写进构建配置）：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`；blobatar 等全部内联。
4. **i18n**：`ctx.locale.register(ns, { zh, en })` 需要 **zh 与 en 两本字典都齐**（对象形态）或改用 per-locale 形态；界面中文优先的项目应把文案集中进 typed 字典（`locale/README.md:34-60`）。
5. **样式**：CSS Modules + `clsx` + `--dsw-alias-*` token；禁止 Tailwind/组件库（`docs/web-styling.md:14-26`）——与 PRD 附录 E「不使用 Vite」兼容（tsdown/rolldown 直出产物）。
6. **版本钉死**：客户端基线身份是 shell 的；插件宿主版本用 `engines.dsh` 声明（不强制），M3.5 gate 仍按安装调研钉 `0.1.5-rc.2` 或当前宿主版本。

---

## 10. 未验证 / 存疑

1. **未运行验证**：本文所有运行时行为（slot 渲染、HMR 换包、通用 RPC 往返、cookie 认证）均来自源码/文档；M3.5 安装门应实测。
2. **仓库外扫描/HMR**：`dsh.client` 扫描对 profile `node_modules` 里 out-of-tree 包是否与 in-tree 完全一致（文档口径是「存活 Loader entries」，社区 dsh-im/dsh-market 成功是旁证），HMR 对 link 包的轮询行为未实测。
3. **自建构建的兼容性**：lazy-CJS banner/footer、CSS 注入、touch 入口三项是官方 preset 实现细节；复刻物是否在所有 DSH 预览版本下被接受未验证（预览期破坏性变更风险高）。
4. **Typert 仓库外路线**：`@deepseek-ai/dsh-typert-generator` 有 npm 发布但仍依赖仓库根 tsconfig face/构建顺序；外部包能否独立生成 `typert.remote-client.*` 未实测。
5. **npm 发布包版本落差**：`dsh-client-*` 发布版 `0.0.1-rc.1`（部分 `0.1.0-rc.8`）与 pinned SHA `0.1.6-alpha.2` 的类型契约兼容性未验证；不要以 npm 包作为运行时基线。
6. **通用 RPC 的 profile 可用性**：`ctx.connection` Host 半由 web 组合挂载（web-app patch `:182`）；headless/sdk 等无 GUI 组合不适用（那些 profile 也没有浏览器半）。
7. **文档漂移**：cookbook `settings.plugin.item` 与源码不符（§4.5）；`slots.md` 层级树落后于源码三个 key；文档站与仓库同源，故等同。
8. **`dsh.client.inject` 双重语义**：AGENTS.md 说「纯信息性」，而 `system.ts:185-211` 用它保证被注入包的 factory 先送达（materialize 前注册）；「不参与激活顺序」两者一致，但「纯信息性」的表述不精确——写 Skill 时用「code arrival 边，非激活边」描述。

---

## 11. 一手来源与访问日期

| 来源（pinned SHA 内路径）                                                                                                                      | 支撑内容                                                                                                                                                            | 访问日期   |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `docs/subsystems/web-client.md:1-95`                                                                                                           | client 架构分层、boot、Remote、Client models、包边界                                                                                                                | 2026-09-19 |
| `docs/subsystems/client-modules.md:5-178`                                                                                                      | 扫描、wire、bundle 路由、`ctx.clientModules`                                                                                                                        | 2026-09-19 |
| `docs/subsystems/slots.md:9-189`                                                                                                               | Slots 规范：声明/kind/scope/props/hooks/层级树/扩展规则                                                                                                             | 2026-09-19 |
| `docs/subsystems/client-resources.md:1-92`                                                                                                     | 资源地址/provider/`useResource`/pin                                                                                                                                 | 2026-09-19 |
| `docs/subsystems/sidebar-right.md:1-140`                                                                                                       | 右栏 tab 注册与导航、资源模型                                                                                                                                       | 2026-09-19 |
| `docs/cookbook/adding-a-settings-card.md:1-102`                                                                                                | 两半打包、`ctx.settingsScope`、**无已发布 preset** 原文                                                                                                             | 2026-09-19 |
| `docs/cookbook/adding-a-remote-api.md:1-197`                                                                                                   | Remote 五步、失败码、客户端消费、测试                                                                                                                               | 2026-09-19 |
| `docs/api-gateway.md:1-164`                                                                                                                    | 生成管线、调用形态、SRC 回退、dev 模式                                                                                                                              | 2026-09-19 |
| `docs/web-styling.md:1-40`                                                                                                                     | CSS Modules/`--dsw-*`/禁 Tailwind                                                                                                                                   | 2026-09-19 |
| `packages/client/AGENTS.md:1-156`                                                                                                              | 作者硬规则（五项 shares、export/ctx 纪律、共享模块、新包清单、检验梯）                                                                                              | 2026-09-19 |
| `packages/client/README.md:27-82`                                                                                                              | client 包地图与 ctx key                                                                                                                                             | 2026-09-19 |
| `packages/util/package-manifest/src/types.ts:28-77`                                                                                            | `DshManifest`/`DshClientManifest` 字段语义                                                                                                                          | 2026-09-19 |
| `packages/client/modules/src/client/manifest.ts:52-65,141-178,186-205,214-303,305-363,382-422`                                                 | wire 类型、`parseDshClient`、boot 解析、lazy-CJS 契约                                                                                                               | 2026-09-19 |
| `packages/client/modules/src/index.ts:93-127,186-197,439-491,556-575,640-810,825-880,988-1055`                                                 | 扫描/校验/缺 bundle 失败/graph 组合/`rebuilt`                                                                                                                       | 2026-09-19 |
| `packages/client/modules/src/client/system.ts:165-237`                                                                                         | 注入边与 factory 送达、materialize 失败                                                                                                                             | 2026-09-19 |
| `packages/client/modules/README.md:1-143`                                                                                                      | lazy-CJS 模型、共享模块、构建要求、已知限制                                                                                                                         | 2026-09-19 |
| `packages/client/hmr/README.md:1-128`                                                                                                          | 开发循环、reload 语义、失败策略、轮询默认                                                                                                                           | 2026-09-19 |
| `packages/client/connection/README.md:1-85`                                                                                                    | 浏览器认证/信任边界/连接代际/重连                                                                                                                                   | 2026-09-19 |
| `packages/client/connection/src/rpc.ts:17-27,100-162,219-251`                                                                                  | 通用 RPC 信封、Host handle/intercept、精确 Fetch 路由、客户端 call                                                                                                  | 2026-09-19 |
| `packages/client/connection/src/rpc-host.ts:78-200`                                                                                            | `ctx.connection.rpc`/`fetch` 实现、注册与鉴权                                                                                                                       | 2026-09-19 |
| `packages/client/connection/src/client/index.ts:131-146,310`                                                                                   | 浏览器半 `ctx.connection` 面与 provide                                                                                                                              | 2026-09-19 |
| `packages/client/ui-slots/src/index.ts:25-47,100-104,285-296,987-1210`                                                                         | SlotMap/kind/scope/chain/register 校验                                                                                                                              | 2026-09-19 |
| `packages/client/ui-renderer/src/client/registry.ts:28-473,739-763`                                                                            | `SlotRegistry` 服务 API（register/inject/provideRoot/renderSlot/查询）                                                                                              | 2026-09-19 |
| `packages/client/ui-layout/src/client/index.ts:33-93,121-181`                                                                                  | root 注册样例、`main`/`sidebar`/`shell.overlay` 声明                                                                                                                | 2026-09-19 |
| `packages/client/ui-sidebar/src/client/contract/slots.ts:15-147`                                                                               | sidebar 槽位与 owner props                                                                                                                                          | 2026-09-19 |
| `packages/client/ui-conversation/src/client/contract/slots.ts:124-486`                                                                         | 会话/composer 槽位与 standard hooks                                                                                                                                 | 2026-09-19 |
| `packages/client/ui-chat/src/client/contract/slots.ts:171-221`                                                                                 | chat 槽位与 keyed node 约定                                                                                                                                         | 2026-09-19 |
| `packages/client/ui-tool/src/client/contract/slots.ts:10-103`                                                                                  | toolview/images 槽位与 owner 货币                                                                                                                                   | 2026-09-19 |
| `packages/client/ui-settings/src/client/contract/slots.ts:14-136`                                                                              | settings 槽位族                                                                                                                                                     | 2026-09-19 |
| `packages/client/ui-settings-models/src/client/slot-contract.ts:23-56`                                                                         | models 槽位族                                                                                                                                                       | 2026-09-19 |
| `packages/client/ui-sidebar-right/src/client/contract/slots.ts:34-96`                                                                          | 右栏槽位族                                                                                                                                                          | 2026-09-19 |
| `packages/client/ui-sidebar-documentpreview/src/client/document/contract.ts:43-60`                                                             | `sidebar.right.tab.document`                                                                                                                                        | 2026-09-19 |
| `packages/client/ui-workspace/src/client/contract/slots.ts:54-61`                                                                              | directoryFlow 槽位                                                                                                                                                  | 2026-09-19 |
| `packages/client/ui-trajectory/src/client/trajectory-contract.ts:85-99`                                                                        | trajectory 图片槽                                                                                                                                                   | 2026-09-19 |
| `packages/client/ui-user-questions/src/client/contract/slots.ts:18-230` + `src/client/index.ts:30-107`                                         | 问询 chain 接管与 `$on` 事件样本                                                                                                                                    | 2026-09-19 |
| `packages/client/ui-approval/src/client/contract/slots.ts:29-167`                                                                              | 审批槽与 PendingApproval                                                                                                                                            | 2026-09-19 |
| `packages/client/ui-plugin-manager/src/client/slot-contract.ts:21-46`                                                                          | `plugins.*` 配置槽                                                                                                                                                  | 2026-09-19 |
| `packages/extensions/ui-cordis/src/client/slots.ts:1-42`                                                                                       | `tool.view.cordis`                                                                                                                                                  | 2026-09-19 |
| `packages/client/ui-jobs/src/client/index.ts:1-42` + `src/client/JobListAction.tsx:1-30` + `src/index.ts:1-9` + `package.json:1-77`            | 最小 client 插件黄金样本                                                                                                                                            | 2026-09-19 |
| `packages/client/ui-user-questions/src/index.ts:1-11` + `package.json:16-40` + `tsdown.config.ts:1-3`                                          | 两半同包形态                                                                                                                                                        | 2026-09-19 |
| `packages/client/tsdown.client.ts:30-127,401-425,462-499,528-627,683-713`                                                                      | 官方构建 preset 全契约（含 banner/footer、纯度门、CSS）                                                                                                             | 2026-09-19 |
| `packages/client/web/src/platform.ts:8-18`                                                                                                     | `PLATFORM_MODULES`/`PRELOADED_CLIENT_EXTERNALS`                                                                                                                     | 2026-09-19 |
| `packages/client/web/package.json:37-41`                                                                                                       | React 18.2 / types 18.3                                                                                                                                             | 2026-09-19 |
| `packages/client/locale/README.md:34-60`                                                                                                       | i18n 注册/语言包/回退链                                                                                                                                             | 2026-09-19 |
| `packages/api/remotes/README.md:28-45,73-75`                                                                                                   | Remote 装配、转发事件白名单、限制                                                                                                                                   | 2026-09-19 |
| `packages/bundle/web-app/cordis.patch.yml:167-196,337-372`                                                                                     | web 组合挂载 client 基础包与官方 client 插件行                                                                                                                      | 2026-09-19 |
| 根 `package.json:2-3` / `apps/cli/package.json:2-4`                                                                                            | 版本 0.1.6-alpha.2                                                                                                                                                  | 2026-09-19 |
| `npm view`（registry.npmjs.org，2026-09-19）                                                                                                   | `dsh-client-ui-slots`/`dsh-client-modules`/`dsh-client-connection`/`dsh-api-remotes`/`dsh-typert-generator` = `0.0.1-rc.1`；`dsh-client-ui-renderer` = `0.1.0-rc.8` | 2026-09-19 |
| 本仓库 `PRD.md:77-113,157-169`、`docs/botharness.md:88-104`、`docs/client-bridge.md:1-77`                                                      | M3 client 计划、baseline/构建约束、桥的既有决策                                                                                                                     | 2026-09-19 |
| `docs/research/2026-09-18-dsh-plugin-installation.md`、`2026-09-18-dsh-authoring-conformance.md`、`2026-09-19-dsh-community-plugins-survey.md` | 不重复的宿主安装/作者规范/生态结论                                                                                                                                  | 2026-09-19 |
