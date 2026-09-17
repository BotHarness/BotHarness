# DSH 客户端扩展点与 DSH 文档 IA 调研 — 面向 BotHarness M3 与 botharness.ai

## 0. 元信息

| 项         | 内容                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题       | ① BotHarness M3 要写的 `@botharness/client`（`main` 面板 + `sidebar.panellist` 名册、详情/新建、composer `@PersonaBot` 提及、`/bot` 兜底、六态展示）落在 DSH 的哪些客户端包与 API 上？客户端如何消费 core 的 `botharness` 服务与状态事件？② DSH 官方文档站的信息架构（IA）是什么？botharness.ai 应如何对齐？                                                                                                                      |
| 上游仓库   | https://github.com/deepseek-ai/deepseek-harness （文档站 https://deepseek-harness.github.io/deepseek-harness/）                                                                                                                                                                                                                                                                                                                   |
| Pinned SHA | `ddefc45fbc7f8e46dd73185e68295696d1297887`（2026-09-17 21:19 +0800，release `dsh-0.1.6-alpha.2`）。以下 `packages/...`、`docs/...`、`website/...` 路径均相对该 SHA 的仓库根；本文行号以此为准                                                                                                                                                                                                                                     |
| npm 快照   | 2026-09-18 查询：`@deepseek-ai/dsh` dist-tags `latest = next = 0.1.5-rc.2`、`alpha = 0.1.6-alpha.2`；两条线均含全部客户端包（如 `@deepseek-ai/dsh-client-ui-input-trigger@0.1.5-rc.2` 与 `@0.1.6-alpha.2`）。本仓库当前安装/声明的是 0.1.5-rc.2 系（`packages/core/package.json`）；本调研的源码细节以 0.1.6-alpha.2 为主，并抽样核对了 0.1.5-rc.2 的 d.ts                                                                        |
| 调研方法   | 一手来源优先：`git clone --depth 1 --filter=blob:none --sparse` 上游到 `/tmp/dsh-src` 后逐文件读源码与官方 Markdown 文档；docs 站（VitePress 中文根树）交叉验证；npm tarball 下载到 `/tmp/dsh-probe` 读 `package.json`/`d.ts`（含社区参照 `@xmanrui/dsh-im@4.21.2`）；`pnpm view` 读 registry 元数据。所有 URL 访问日期 **2026-09-18**。无法由一手来源确认的一律标「未验证」。本次未安装/运行任何插件，未改动工作区（唯写本文件） |

一句话结论：M3 需要的三块客户端扩展点是 **`@deepseek-ai/dsh-client-ui-layout`（`main` keyed 面板）+ `@deepseek-ai/dsh-client-ui-sidebar`（`sidebar.panellist` 列表）+ `@deepseek-ai/dsh-client-ui-input-trigger`（`ctx.inputTriggers` 的 `@`/`/` 触发源）**，通过 `ctx.slots` 注册；但客户端是独立的浏览器 Cordis 应用，**不能 `inject` host 侧的 `botharness` 服务**，跨进程只有两条路：官方 Typert `@Remote` → `ctx.remote.<ns>`（构建期产物），或通用 Connection RPC（`connection.rpc.call` + host `rpc.intercept`/`fetch.register`，dsh-im 实证）。架构文档 §1/§3/§8 的 `provide('botharness') → client inject` 画法需要修正（详见 §2）。文档 IA 上，DSH 是「入门 / 开发 / 参考」三模块 + 中文根树 / 英文 `/en` + 每页 `.md` 原始孪生 + `llms.txt`，无版本化；botharness.ai 建议在保留 `/docs`、`/dev`、`/changelog` 三根的前提下把 `/dev` 组织为「概念 / 指南 / 生成参考 / ADR」四组，并新增由代码生成的三张参考目录（config / tools / events）。

---

## 1. M3 客户端扩展点（DSH 当前实现）

### 1.1 包名、导入路径与服务

M3 要用的包全部是 `dsh-web-app` 的依赖，两条发行线都有（`pnpm view @deepseek-ai/dsh-web-app@0.1.5-rc.2 dependencies`、`@0.1.6-alpha.2`，2026-09-18 查询）：

| 能力                           | npm 包与 `/client` 导入                                                                   | 客户端服务 / 注册点                                                                                                             | 权威声明位置（pinned SHA）                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 客户端插件载体（加载与清单）   | 包根 `package.json` 的 `dsh.client` + `exports["./client"]`                               | Host 侧 `ctx.clientModules`（`ClientModuleRegistry`）扫描 Loader entry                                                          | `docs/subsystems/client-modules.zh.md`；`docs/cookbook/adding-a-settings-card.zh.md:82-99`                              |
| Slot 注册表（类型/生命周期）   | `@deepseek-ai/dsh-client-ui-slots`                                                        | `ctx.slots`（Context merge 由 renderer 包提供）                                                                                 | `packages/client/ui-slots/src/index.ts:1157-1203`                                                                       |
| React 绑定 / 组件渲染机        | `@deepseek-ai/dsh-client-ui-renderer`                                                     | 唯一的 `useSyncExternalStore` 适配层；提供 `ctx.slots` 的 React 面                                                              | `docs/subsystems/web-client.zh.md:62-66`                                                                                |
| 面板框架（`main` / `sidebar`） | `@deepseek-ai/dsh-client-ui-layout`（`/client` 导出类型 `MainPanelId`）                   | `ctx.layout`（选面板/几何）；SlotMap：`sidebar`、`main`(keyed)、`rightbar`、`shell.overlay`                                     | `packages/client/ui-layout/src/client/index.ts:48-80`、`:140-158`                                                       |
| 侧栏面板入口                   | `@deepseek-ai/dsh-client-ui-sidebar`（`/client` 拉入 SlotMap 声明）                       | SlotMap：`sidebar.panellist`（list），id 与 `main` key 对应                                                                     | `packages/client/ui-sidebar/src/client/contract/slots.ts:34-40`；`.../index.ts:81`                                      |
| Composer / 输入                | `@deepseek-ai/dsh-client-ui-conversation`                                                 | SlotMap：`conversation.composer`、`conversation.input.*`、`conversation.input.overlay` 等；`ReferenceInsert`/`PickOutcome` 类型 | `docs/subsystems/slots.zh.md`（Slot 层级）；`packages/client/ui-conversation/src/client/contract/draft-editor.ts:14-21` |
| `@`/`/` 触发与候选菜单         | `@deepseek-ai/dsh-client-ui-input-trigger`（`/client`）                                   | `ctx.inputTriggers`（`InputTriggerServiceContract`）                                                                            | `packages/client/ui-input-trigger/src/client/contract.ts:12-24`                                                         |
| `/` 命令 UI 与宿主命令         | `@deepseek-ai/dsh-client-ui-commands`（浏览器半）+ `@deepseek-ai/dsh-commands`（host 半） | `ctx.commandUi`；`/` source 由它注册；宿主 `ctx.commands`                                                                       | `packages/client/ui-commands/src/client/index.ts:56-67`；`docs/subsystems/commands.zh.md`                               |
| 本地化                         | `@deepseek-ai/dsh-client-locale`                                                          | `ctx.locale`；组件通过 slot 的 `locale` 席位拿 `t`                                                                              | `packages/client/ui-sidebar/src/client/index.ts:38-46`                                                                  |
| 客户端 ↔ Host RPC              | `@deepseek-ai/dsh-client-connection`                                                      | `ctx.connection.rpc.call / .open`；host `ctx.connection.rpc.intercept` / `fetch.register`                                       | `packages/client/connection/src/rpc.ts:116-160,220`；`.../client/rpc.ts:34`                                             |
| 客户端 store / 基元            | `@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-primitives`                  | `createSnapshotStore`、图标/控件目录（不可跨插件导入组件）                                                                      | `packages/client/AGENTS.md`（Shared modules 节）                                                                        |

要点：

- **一个包两个半侧**。官方约定 Host 半侧在 `src/`、浏览器半侧在 `src/client/`，用 `./client` 导出并在 `package.json` 声明 `dsh.client`（`docs/cookbook/adding-a-settings-card.zh.md:7`）。示例清单（同文 `:84-91`）：

  ```jsonc
  {
    "exports": {
      ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
      "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    },
    "dsh": {
      "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-settings-plugins"] },
    },
  }
  ```

  `dsh.client.inject` 是**信息性**的包名边（供预检/ HMR diff），不决定激活顺序；激活顺序由 Cordis 服务 `inject` 等待决定（`packages/client/AGENTS.md`「dsh.client manifest semantics」、`docs/subsystems/web-client.zh.md`）。`platform: 'web'` 必填；`immediately: true` 仅限第一阶段预取的基础设施行。

- 客户端插件必须作为**已启用的 Loader entry**被挂载（bundle 的 `cordis.patch.yml` 插入该插件的行），浏览器半侧会被自动扫描，无需重构建 Web 应用（`docs/cookbook/adding-a-settings-card.zh.md:82`）。

- 组件基座是 **React 18**（`packages/client/ui-plugin-manager/package.json` devDeps：`react ^18.2.0`、`@types/react ~18.3.1`）。React、Cordis 等由 shell 以模块表身份共享，业务包不得重复打包（见 §1.5）。

### 1.2 注册形状：slot、面板、组件契约

- 注册/声明：`ctx.slots.register({ name, ... }, Component)`；跨越别人的 slot 用 `ctx.slots.inject(name, () => ctx.slots.register(...))`，它会等待真实声明、随声明生命周期装卸，并随调用插件的 fiber 卸载（`packages/client/AGENTS.md`「Slot and props discipline」第 1、4 条；`docs/subsystems/slots.zh.md`）。
- `main` 是 **keyed** 槽：注册时带 `key`（`MainPanelId` branded string；保留 key `conversation` 归 Conversation），组件由 `sidebar.panellist` 的面板行选中后渲染（`packages/client/ui-layout/src/client/index.ts:60-67`；`AppFrame.tsx:40-42`）。
- `sidebar.panellist` 是 **list** 槽：注册带 `id`（= 对应 `main` key）、`order`、`label`（string 或 thunk，thunk 跟随语言）；owner props 是 `{ size: number; active: boolean }`（`packages/client/ui-sidebar/src/client/contract/slots.ts:34,80-90`）。
- 组件 props 由五份「share」推导：`PropsRuntime<K>`（owner 值 + 作用域/全局席位）、`PropsRenderSlots`（children）、`PropsStore`、inject face、`PropsLocale`；**组件永远拿不到 `ctx`**，不自己造 hook（`packages/client/AGENTS.md` 第 3、7 条；`docs/subsystems/slots.zh.md`「组件输入」）。
- 根 slot 层级（`docs/subsystems/slots.zh.md`「当前层级」）：`root → sidebar(… sidebar.panellist …) / main → main.conversation(… conversation.composer …) / rightbar / shell.overlay`。做「名册主面板」= `main` keyed + `sidebar.panellist` 两处注册，与 ui-plugin-manager 的 Plugins 页完全同构。

可直接对照的第一方范例（pinned SHA）：

```ts
// packages/client/ui-plugin-manager/src/client/index.ts:50,83-99（节选）
export const inject = [
  'slots',
  'locale',
  'remote',
  'remote.pluginManager',
  'remote.pluginInventory',
];
// ...
ctx.slots.inject('main', () =>
  ctx.slots.register(
    {
      name: 'main',
      key: PANEL_ID, // MainPanelId = 'plugins'
      locale: NS,
      inject: () => controller.inject(configLedger),
      children: {/* 声明本页面自己的子 slot */},
    },
    PluginManagerPage,
  ),
);
ctx.slots.inject('sidebar.panellist', () =>
  ctx.slots.register(
    {
      name: 'sidebar.panellist',
      id: PANEL_ID,
      order: 0,
      label: () => t('panel'),
      locale: NS,
    },
    PluginsPanelIcon,
  ),
);
```

### 1.3 `@PersonaBot` 提及与 `/bot` 兜底

`@` 与 `/` 是同一套输入触发流水线（`@deepseek-ai/dsh-client-ui-input-trigger`）。功能插件通过 `ctx.inputTriggers.registerSource(source)` 注册触发源，重复的 `<trigger>/<name>` 会抛错（`packages/client/ui-input-trigger/src/client/contract.ts:12-18`）。

`InputTriggerSource` 关键成员（`packages/client/ui-input-trigger/src/types.ts:160-256`）：

| 成员                                                           | 作用                                                                                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trigger: '/' \| '@'`、`name`、`order?`                        | 绑定触发字符与菜单分组；`name` 在同 trigger 内唯一                                                                                                 |
| `candidates(session, req)`                                     | 异步拉候选（`req.query`、`signal`；失败源被静默丢弃）                                                                                              |
| `onPick(pick): PickOutcome`                                    | 落选：`{ insert: ReferenceInsert }` 插入引用 token、`{ claim: CommandClaim }` 进入命令流、`{ text, continue? }` 继续改写、`'handled'`、`undefined` |
| `matchSpace?` / `matchEnter?(session, line, signal, envelope)` | 以空白/回车「裁决」整行草稿的命令式参与；实现即声明参与，注册序第一个非 undefined 者胜出                                                           |
| `header?` / `lexicon?` / `subscribeLexicon?`                   | 面包屑、纯文本补全/装饰名录                                                                                                                        |
| `codec?: ReferenceCodec`                                       | 产出 `insert` 的源必须给剪贴板投影与模型序列化（`clipboardText` / `serialize`）                                                                    |
| `openReference?`                                               | 点击已插入 token 时的预览                                                                                                                          |

- `ReferenceInsert` 的 `source` 是自由字符串，但 `appearance` 目前仅 `'session' | 'file' | 'folder'`（`packages/client/ui-conversation/src/client/contract/draft-editor.ts:14-21`）。`@PersonaBot` 建议用 `appearance: 'session'`；自定义外观是否可行**未验证**。
- 第一方 `@` 范例是 `ui-reference`（文件/会话引用）：`packages/client/ui-reference/src/client/index.ts:37-137`，声明 `trigger: '@'`、`showGroupTitle: false`，`onPick` 返回 `{ insert: { source: 'reference', ref, label, appearance, clipboardText } }`，并用 `ctx.effect(() => inputTriggers.registerSource(source))` 管理生命周期。
- `/bot` 兜底：注册第二个 source，`trigger: '/'`，在 `matchSpace`/`matchEnter` 里用 `{ claim }` 或直接返回 `{ text }`/`'handled'` 均可。注意可用性分层：`plain` 时 `/`、`@` 都活；`claimed`（命令模式）时 `/` 被抑制、`@` 仍活（`types.ts:258-261`）。
- 若希望 `/bot` 复用宿主命令语义（`ctx.commands`），第一方路径是 `@deepseek-ai/dsh-client-ui-commands` 的 `CommandUiRuntime`（它自己注册 `/` source 并把 pick 路由到命令弹窗/执行，`packages/client/ui-commands/src/client/index.ts:56-67`）。第三方在客户端自建 `/` source 完全可行，但**没有自动映射宿主 `ctx.commands` 的桥**（未发现声明式注册命令到 `/` 菜单的公开 API；`/bot` 作为纯触发源更省事）。

### 1.4 客户端如何消费 core 服务（本节是 M3 的关键约束）

结论：**浏览器半侧不能 `inject` host 的 Cordis 服务**。Web Client 是与 Host 独立组装、独立加载的浏览器 Cordis 应用；分层是「Host 状态 → Remote 传输 → Client model → UI adapter → Slots」（`docs/subsystems/web-client.zh.md:22-28` 的分层表）。因此 `ctx.provide('botharness', core)`（`packages/core/src/plugin.ts:66`）只对 Host 侧插件可见。客户端有两条现行通路：

1. **官方主路径：Typert Remote（构建期代码生成）**

   业务服务继承 `TypertRemoteService` 并给方法加 `@Remote` / `@RemoteScope`，构建期由 `@deepseek-ai/dsh-typert-generator` 生成 `./typert`（Host）与 `./remote`（Host-for-Client）产物；`api-remotes` assembly 把贡献挂成 `ctx.remote.<namespace>`，客户端业务包在 `inject` 里声明 `['remote', 'remote.<namespace>']`，调用即 `connection.rpc.call('/api', '<namespace>/<method>', { args }, signal)`（`docs/api-gateway.zh.md:9-15,58,121,133`；`docs/subsystems/web-client.zh.md:28`）。第一方 `ui-plugin-manager` 就是消费方（`inject` 含 `remote.pluginManager`，见 §1.2）。
   - 代价：需要把 generator 接进构建（该包已发布 npm：`@deepseek-ai/dsh-typert-generator@0.1.6-alpha.2`，README 面向「package/repository maintainers」，见 `README.md`）。**本仓库外是否可在非 DSH workspace 完整复现该流水线，未验证**；且 `api-remotes` assembly 是第一方静态组合，第三方贡献能否被运行时 `$mount`，未验证。
   - 事件推送：`ctx.remote.$on('<event>')` 只转发 `@deepseek-ai/dsh-api-remotes` 里 `API_REMOTE_FORWARDED_EVENTS` 白名单的 Host 事件（`packages/api/remotes/src/remote-events.ts:18-43`）。该文件是**应用组装层**的静态清单，第三方包无法自行追加；`plugin-manager/changed` 这类事件是随包进入白名单的（`:37`）。所以「core 的 `states.on(...)` 直通浏览器」不存在现成机制。
   - 流：Remote 也可以有 stream（`ctx.remote.<ns>.follow(...)` 返回 `AsyncIterable` 帧流，见 `docs/subsystems/client-resources.zh.md` 的 provider 示例），但同样走 Typert 生成。

2. **通用 Connection RPC（无需代码生成；社区实证）**

   - Host：任一插件可拿 `ctx.connection`，用 `rpc.intercept('/api', matches, handler)` 拦截共享 `/api` 通道上的自有 endpoint，或用 `fetch.register({ path: '/api/...', methods, requestBody, fetch })` 注册精确路由（`packages/client/connection/src/rpc.ts:116-160`；`docs/subsystems/client-resources.zh.md` 与 `docs/api-gateway.zh.md:121` 提到功能自有的精确 Fetch 路由）。
   - Client：`ctx.connection.rpc.call('/api', 'botharness/list', payload, signal)` → `POST /api/botharness/list`，信封 `{ type: 'client-request', rpcId, method, payload }`，响应 `{ type: 'server-response', rpcId, result: { ok, value | error } }`（`packages/client/connection/src/client/rpc.ts:34-79`）。
   - 社区参照 `@xmanrui/dsh-im@4.21.2` 正是这样做的：Host 半侧 `plugin-src/management-rpc.mjs` 用 `ctx.connection.fetch.register({ path: '/api/dsh-im…' })` 注册 JSON RPC 路由；浏览器半侧 `lib/client.js` 走 `connection.rpc` 并自行开 `/api/harness/connector/stream` 做推送。注意 dsh-im 声明兼容到 DSH 0.1.5-alpha.1，其注入的 `@deepseek-ai/dsh-client-runtime@0.0.1-rc.1` **不在** 0.1.6-alpha.2 `dsh-web-app` 依赖图里——它不能当作当代客户端架构模板，只能当 RPC 桥的实证。

M3 建议（写入架构决策前的默认方案）：MVP 用**通用 Connection RPC 的 unary 方法**（list/get/create/update/pause…）+「用户动作后刷新 / 低频轮询」；六态推送若必须实时，再在 `fetch.register` 的自有路由上做 SSE/长轮询（`requestBody: 'streaming'` 另有背压语义）。Typert 路径留作 M3.5 安装门通过、且确认构建工具链可在本仓库复现后的候选。核心是：**在 core 里把 `botharness` 的读模型显式设计成一组 RPC 方法**，而不是假设客户端能拿到服务对象。

### 1.5 打包、模块图与版本约束

浏览器半侧的产物格式是硬约束（`packages/client/tsdown.client.ts:3,605-620`）：

- CJS **closure-factory**，入口固定 `lib/client.js`，自注册：`window.__ModuleLoader__.load({ id: '<包名>', factory: (require) => { ... } })`，并带 `lib/client.js.map`（sourcemap 指回 TSX）。
- 外置（不打包）的是 shell 注入的模块表基线 `PLATFORM_MODULES`：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`（`packages/client/web/src/platform.ts:8-14`）。其余依赖默认内联。
- **bundle 纯净门禁**拒绝跨插件值导入：除基线、生成的 `/remote` 贡献、少数 INLINE_SAFE wire 层外，任何 `@deepseek-ai/*` 值导入都是构建错误；跨包协作只能走 Cordis 服务或 slot（`packages/client/tsdown.client.ts:500-530` 的 `dsh-client-bundle-purity`；`packages/client/AGENTS.md`「A feature plugin MUST NOT…」）。
- **共享预设未发布**：`clientBundle()` 只存在于 DSH 仓库内，官方明说「本仓库之外的包得自行复刻同样的输出格式」（`docs/cookbook/adding-a-settings-card.zh.md:94-102`）。这是 M3 最大的工程风险：要么按格式手写构建（tsdown/rolldown 配置 + CSS Modules 注入 + sourcemap + 纯净门禁自检），要么把 `@botharness/client` 放进 DSH workspace 构建（与「不 fork DSH」的边界冲突）。
- 样式：CSS Modules 内联为 `<style data-plugin-css>` 注入；无组件库、无 Tailwind（`packages/client/AGENTS.md`「Styling and localization」）。
- npm 元数据：客户端包必须 `@deepseek-ai/cordis` 同时出现在 `peerDependencies` 与 `devDependencies`；`files` 必须覆盖 `lib/client.js`、`lib/client.js.map`、`lib/types/**/*.d.ts`（`packages/client/AGENTS.md`「Dependency declaration」「New plugin package checklist」）。
- 改完必须 `pnpm --filter <pkg> bundle` 再探测运行中的 `dsh web`——服务的是 `lib/client.js`，不是源码（同上 checklist 第 5 条）。

版本提示：客户端槽位/触发 API 在 **0.1.5-rc.2 与 0.1.6-alpha.2 形状一致**（已下载两条线的 d.ts 比对：`sidebar.panellist`、`main` keyed、`registerSource` 均相同）。但本仓库当前 Host 依赖是 0.1.5-rc.2 系，而本调研源码细节为 0.1.6-alpha.2；M3.5 安装门应钉死一条线再验收。

### 1.6 最小代码草图（~30 行，ESM + TS，仓库风格）

```ts
// packages/client/src/client/index.ts — @botharness/client 浏览器半侧
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'; // 拉入 ctx.slots 的 Context merge
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'; // 拉入 sidebar.panellist 声明
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import { RosterIcon } from './RosterIcon.js';
import { RosterPanel } from './RosterPanel.js';

export const inject = ['slots', 'connection', 'inputTriggers', 'locale'];

const PANEL_ID = 'botharness' as MainPanelId;

export function apply(ctx: ClientContext): void {
  const call = (endpoint: string, payload: Record<string, unknown>) =>
    ctx.connection.rpc.call('/api', `botharness/${endpoint}`, payload);

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: () => 'PersonaBots' },
      RosterIcon,
    ),
  );
  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        inject: () => ({ list: (query: string) => call('list', { query }) }),
      },
      RosterPanel,
    ),
  );

  const mention: InputTriggerSource = {
    trigger: '@',
    name: 'personabot',
    candidates: async (_session, { query, signal }) => {
      const result = await ctx.connection.rpc.call('/api', 'botharness/list', { query }, signal);
      return result.ok
        ? (result.value as { slug: string; displayName: string }[]).map((bot) => ({
            name: bot.slug,
            label: bot.displayName,
          }))
        : [];
    },
    codec: { clipboardText: (ref) => `@${ref}`, serialize: async (ref) => `@${ref}` },
    onPick: ({ candidate }) => ({
      insert: {
        source: 'personabot',
        ref: candidate.name,
        label: candidate.name,
        appearance: 'session',
        clipboardText: `@${candidate.name}`,
      },
    }),
  };
  ctx.effect(() => ctx.inputTriggers.registerSource(mention), 'botharness: @ mention');
}
```

（示意性：真实代码还需按 `main` 组件 props 类型补 `PropsRuntime` 等声明合并；`connection` 的 inject 名以 `@deepseek-ai/dsh-client-connection/client` 的 Context merge 为准；未在真机运行。）

---

## 2. 与现有架构文档的出入

对照 `docs/architecture/botharness-architecture.md`（2026-09-18 版本）：

| #   | 架构文档说法                                                             | 一手事实                                                                                                                                                                                | 影响 / 建议                                                                                                                    |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | §1 mermaid：`Core -.->                                                   | "provide('botharness')"                                                                                                                                                                 | Client`，§3：`O->>D: inject(['botharness'])`后`ctx.botharness`                                                                 | 客户端是独立浏览器 Cordis 应用，host 服务不跨进程（`docs/subsystems/web-client.zh.md:22-28`） | 箭头改为「core →（Remote/RPC）→ client」；把 `provide('botharness')` 标注为「Host 内部服务面」 |
| 2   | §3 Note：客户端「订阅 `states.on(...)` 拿实时状态」                      | `states` 是 Host 进程内 tracker；浏览器只能经白名单事件（`remote.$on`，第三方不可扩展 `API_REMOTE_FORWARDED_EVENTS`）或自有流/轮询（`packages/api/remotes/src/remote-events.ts:18-43`） | 把「状态事件（M3 接入）」改述为「core 暴露 RPC 读模型 + 变更通知（轮询/自有流）」；六态实时性降级或补流式设计                  |
| 3   | §2/§1：`@botharness/client` 作为**独立包**                               | DSH 官方约定是「同一包两半侧」：Host 在 `src/`、浏览器在 `src/client/`，`dsh.client` + `./client`（`docs/cookbook/adding-a-settings-card.zh.md:7`）                                     | 可保留独立包（必须是自己的 Loader entry + `dsh.client`），但要显式记录这与 DSH 默认打包惯例不同；独立包也解决不了跨进程 inject |
| 4   | §8 通信表：「Cordis 服务 provide/inject core → client」                  | 同上，跨进程不成立；客户端 ↔ Host 的通道是 Remote / Connection RPC                                                                                                                      | 该行拆成「Host 内 Cordis」「浏览器内 Cordis」「跨进程 RPC」三行                                                                |
| 5   | §2 表格：`main` 面板 + `sidebar.panellist`；名册树/详情/新建；@委派      | ✅ 成立：`main` keyed + `sidebar.panellist` list + `ctx.inputTriggers`（§1.2/§1.3）                                                                                                     | 补上 id/key 必须一致、`@` 通过 input trigger source 注册这两个实现细节                                                         |
| 6   | `/bot` 兜底                                                              | ✅ 同流水线支持 `trigger: '/'`；但没有「注册宿主命令 → 自动出现在 `/` 菜单」的公开声明式 API（需要 source 或 `CommandUiRuntime`）                                                       | 在 PRD/架构中明确 `/bot` 是客户端触发源（可自行 claim/插入文本），不是宿主命令注册                                             |
| 7   | §6 状态机与事件：`aggregate-changed / session-changed / session-removed` | 事件名字是 core 自造；客户端消费时需在 RPC 层重新定义 wire 形状                                                                                                                         | 为 M3 定义一份「客户端读模型契约」（list/get + change cursor/version），事件类型不直接暴露到浏览器                             |

（§4 的创建流程、§5 的 IM 只读解析、§7 的磁盘布局未被本次调研推翻。）

---

## 3. DSH 文档 IA 拆解

### 3.1 站点形态与技术

- 站点是 **VitePress**，配置在 `website/.vitepress/config.ts`，路由与侧栏由 `website/docs.ts`（Canonical publication manifest）驱动；页面**不复制 Markdown**，而是由 `scripts/project-doc-site.ts` 把仓库里的 canonical 源投影成站点页（`website/docs.ts:1-8`；`website/.vitepress/config.ts:1`）。
- 语言：**中文是根树（默认）**，英文挂在 `/en/**`；每页有语言切换（渲染页右上角「简体中文 / English」）。配对规则：`foo.md` ↔ `foo.zh.md` 成对投影；缺失翻译时**两条路由都投影现有语言并标注**（`pairedPages`/`mirroredPages`，`website/docs.ts:71-105`）。中英切换路径来自导航（`/en/reference/...` 形式）。
- 版本：**没有版本选择器**；所有页面来自 `master`（edit link 指向 `edit/master/`，`website/.vitepress/config.ts:146-152`），文档随代码走。
- 搜索：VitePress **local** provider（`website/.vitepress/config.ts:126-160` 的 `search` 配置），无外部服务。
- AI 表面：每个已发布路由都有「URL 去尾斜杠 + `.md`」的原始 Markdown 孪生（`scripts/project-doc-site.ts:6-8,464-504`），并输出 `llms.txt`（`:551-575`）；页面带 `rawMarkdownPath` frontmatter。这是给 agent 消费的一等公民。
- 导航：顶栏只有 **开发**、**参考**两个模块入口（`moduleNav`，`config.ts:78-88`）；**入门** 通过首页/logo 进入。Guide 侧栏末尾直接放「开发 / 参考」两个模块链接（`guideSidebar`，`config.ts:63-76`）。
- 长侧栏治理：子系统参考有 6 组、几十页，全部 `collapsed: true` 默认折叠；其余组展开（`website/docs.ts:473-504`）。

### 3.2 顶层模块与 URL 布局

| 模块           | 入口 URL                        | 目的                                                | 侧栏分组（root 语言）                                                                                                              | 内容来源（canonical）                                                                                                                    |
| -------------- | ------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 入门 Guide     | `/guide/quickstart`（首页跳转） | 用户上手：Web UI、模型配置、代理、SDK、自动化、集成 | 入门 / SDK / 自动化 / 集成                                                                                                         | `docs/user/guide/*.md`                                                                                                                   |
| 开发 Develop   | `/develop/basic/`               | 插件作者：从第一个插件到框架能力、实战              | 基础 / 框架能力 / 实战 / Cordis 框架教程                                                                                           | `docs/user/develop/**`、`docs/cordis-tutorial/*`                                                                                         |
| 参考 Reference | `/reference/`                   | 架构与生成参考：概念、Cordis API、子系统、cookbook  | 概念 / 生成参考 / Cordis API / 开发手册 / 总览 / 内核与作用域 / 会话与持久化 / 模型与上下文 / 执行与工具 / 策略与交互 / 平台与接入 | `docs/architecture.md`、`docs/architecture.md`、`docs/cordis-api/*`、`docs/subsystems/*`、`docs/cookbook/*`、`docs/config-catalog.md` 等 |
| 英文镜像       | `/en/**`                        | 同一模块树的英文路由                                | 同上（英文字段）                                                                                                                   | `*.md` / 缺失时回退中文                                                                                                                  |

生成参考的做法值得抄：`config-catalog`、`tool-catalog`、`persistence-catalog` 都由脚本从源码生成（如 `scripts/gen-cordis-catalog.ts`，见 `docs/subsystems/client-modules.zh.md` 文末），single source of truth 在代码。

### 3.3 内容组织约定

- canonical 源按仓库层放置：用户指南 `docs/user/**`，架构/子系统 `docs/**`，包级细节在各 `packages/*/README*.md`（不直接投影，由文档页链接）。
- 每页在 manifest 里声明：`source`、`route`、`label(zh/en)`、`sidebar`、`section`、`order`、`outline`、`sourceAliases`；路由推导，不手写链接（`website/docs.ts:23-44`、`landingLink` `:571-575`）。
- frontmatter 由投影器写入 `editSource`/`rawMarkdownPath`；页面正文保持仓库 Markdown 原样（`scripts/project-doc-site.ts:205-214`）。

---

## 4. 对 botharness.ai 的建议 IA

### 4.1 现状（代码为准）

- 技术：Astro + **Nimbus**（`@cloudflare/nimbus-docs`），`apps/docs/astro.config.ts`；内容集合 `docs`（英）、`docs-zh`（中，经 `versions.others: ['zh']` 挂到 `/zh`）、`changelog`、`changelog-zh`；`syncDocs()` 在 Astro 配置加载时运行，把仓库源投影进 `src/content/**`（`scripts/sync-docs.mjs:385-401`）。
- 路由/分区：`/docs`（用户指南，目前只有 `overview`、`quickstart`）、`/dev`（架构、`spec/platform`、`spec/app-prd`、`spec/context`、`adr/<nnnn>`，21 篇 ADR）、`/changelog`（18 对双语条目）。`/docs`、`/dev` 裸路径用 meta-refresh 跳到各自首屏（`apps/docs/src/pages/docs/index.astro`、`dev/index.astro`）。
- 导航：`Header.astro` 三个入口 `/docs/overview`、`/dev/architecture`、`/changelog` + 语言切换；Nimbus 侧栏 `scope: "section"`，即每个顶层分区的侧栏互不串台（`astro.config.ts`）。
- 双语：**英文在根**（与 DSH 相反），中文在 `/zh`；缺失翻译页带 `untranslated: true` 横幅；架构页是中英双源的特例。`src/lib/language.ts` 管切换映射。
- 生成禁区：`src/content/docs/dev/**`、`docs-zh/dev/**`、两个 changelog 树、`public/diagrams/**` 不可手改（`apps/docs/AGENT.md`）。

### 4.2 建议 IA（保留三根，重组 `/dev`）

```text
/                     落地页（coss ui）
/docs                 「用」：使用者手册（en 根；zh 镜像 /zh/docs）
  /overview           产品是什么 / PersonaBot 概念
  /quickstart         安装 DSH、装 BotHarness bundle、首次运行（M3.5 安装门产物）
  /roster            名册与委派（M3）
  /memory            记忆与档案（M2）
  /im                飞书/Lark 接入与绑定（M5）
  /troubleshooting   故障排查与 FAQ
/dev                  「造」：平台规格与扩展开发（zh 镜像 /zh/dev）
  /architecture       活架构文档（保持）
  # 概念（spec 组）
  /spec/platform      平台规格（保持）
  /spec/app-prd       应用 PRD（保持）
  /spec/context       词表（保持）
  /spec/client-bridge 新增：客户端 ↔ core 桥（本调研 §1.4 的结论）
  # 指南（新的 how-to 组，来源：docs/research + 新增 walkthrough）
  /guides/client-plugin 写一个 DSH 客户端插件（面板/提及）
  /guides/memory-tools  memory_* 工具使用与扩展
  /guides/state-events  状态模型与事件消费
  # 参考（生成组）
  /reference/config   settings 命名空间与 Schema 目录（生成）
  /reference/tools    memory_* 工具 schema 目录（生成）
  /reference/events   bot-state 事件目录（生成）
  # 决策
  /adr/index + /adr/<nnnn>  21 篇，建议加目录页
/changelog           保持（en 根 + /zh/changelog）
```

与 DSH 的映射逻辑：`/docs` ≙ Guide，`/dev` ≙ Develop + Reference 的合并（BotHarness 体量还撑不起第四棵根树），`/changelog` ≙ DSH 没有（我们的增量）。差异点：DSH 中文为根、英文 `/en`；我们**保持英文根**，这是仓库既有决策（`docs/changelog/2026-09-17-english-default`），不要为对齐 DSH 而反转，代价是 switch 映射与 DSH 相反（已有 `language.ts` 处理）。

### 4.3 迁移映射

| 现路由                    | 目标路由                  | 动作                                                              |
| ------------------------- | ------------------------- | ----------------------------------------------------------------- |
| `/docs/overview`          | `/docs/overview`          | 保持                                                              |
| `/docs/quickstart`        | `/docs/quickstart`        | 保持；M3.5 安装步骤并入                                           |
| `/dev/architecture`       | `/dev/architecture`       | 保持；仅更新 mermaid（§2）                                        |
| `/dev/spec/platform`      | `/dev/spec/platform`      | 保持                                                              |
| `/dev/spec/app-prd`       | `/dev/spec/app-prd`       | 保持                                                              |
| `/dev/spec/context`       | `/dev/spec/context`       | 保持                                                              |
| （无）                    | `/dev/spec/client-bridge` | 新增，由本调研改写（不直接贴研究文件，产出规格化页面）            |
| （无）                    | `/dev/guides/*`           | 新增；`PAGES` 里加 `zh`/`en` 变体                                 |
| （无）                    | `/dev/reference/*`        | 新增；生成脚本（见 4.4）                                          |
| `/dev/adr/<nnnn>`         | `/dev/adr/<nnnn>`         | 保持；新增 `/dev/adr/index` 目录页（Nimbus 目录组自动聚合 21 篇） |
| `/changelog/**`、`/zh/**` | 不变                      | 保持                                                              |

实现要点：`scripts/sync-docs.mjs` 的 `PAGES` 数组是唯一注册点（`docs/research/2026-09-18-dsh-client-ui-and-docs-ia.md` 这类研究文件**不进站点**，只作为源材料）；新页面加进 `PAGES` 后由 `syncPages()` 写两种树，缺失一侧自动 `untranslated`。Nimbus 侧栏支持目录自动分组与折叠（`node_modules/@cloudflare/nimbus-docs/dist/types.d.ts:453-463`），`dev/guides`、`dev/reference` 目录即分组；长 ADR 列表建议配 `collapsed: true` 或显式 `sidebar.group`。

### 4.4 生成参考层（对齐 DSH 的「生成参考」）

DSH 的三张 catalog 都是脚本从源码生成的；建议 BotHarness 也照做，避免手抄漂移：

- `/dev/reference/config`：从 `packages/core` 的 `Schema`（`SETTINGS_NAMESPACE = 'botharness'`）与 `Config` 生成字段表；
- `/dev/reference/tools`：从 `createMemoryTools` 的工具定义生成 `memory_read/search/write/list` 参数表；
- `/dev/reference/events`：从 `state/bot-state.ts` 的事件联合生成「事件 → 触发 → 消费者」表（M3 客户端对接的 wire 契约也写在这里）。
- 形态：新增 `scripts/gen-botharness-catalog.*`（或扩展 `sync-docs.mjs`），产物写进 `src/content/docs/dev/reference/*.mdx`，遵守生成禁区约定；`pnpm` 根脚本串入 `pnpm build` 前的 `syncDocs()` 路径。

### 4.5 LLM/搜索/版本策略

- **AI 表面**：Nimbus 已有 `llms.txt.ts`、`[...slug]/index.md.ts` 与 `<AgentDirective/>`（`apps/docs/AGENT.md`「AI surface」审计项）。建议对齐 DSH 的约定：**去掉尾斜杠 + `.md` 即原始 Markdown**，并在 `llms.txt` 里按模块分组列全量页面（DSH 的做法见 `scripts/project-doc-site.ts:551-575`）。
- **搜索**：保持 Pagefind（`data-pagefind-body` 已在审计清单）；不需要 VitePress local 那套。
- **版本**：不做版本选择器，文档跟 `main`；**不要**用 Nimbus 的 `versions` 机制做版本化——它已被占用为中文挂载（`astro.config.ts` 注释明说「Nimbus 没有 i18n，`versions.others` 是唯一能挂第二语言树并保留 sidebar/prev-next/llms 的机制」）。若未来要版本，需先解决 i18n × versions 的正交问题（**未验证** Nimbus 是否支持嵌套）。

### 4.6 风险

| 风险                              | 说明                                                                                 | 缓解                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 生成内容不可手改                  | 站点页由 `sync-docs.mjs` 重建，直接改会丢                                            | 所有新页在仓库源创建 + `PAGES` 注册；review 时对照「生成禁区」清单                       |
| 路由变更的静态重定向              | 站点静态输出，无服务端 redirect；现有裸路径用 meta-refresh 兜底（`dev/index.astro`） | 若 `/dev/spec` 改名，需按同样方式加旧路径 meta-refresh，并更新 `LINK_REWRITES`           |
| 翻译债                            | 研究/指南类新增页若只有中文，英文树会挂 `untranslated` 横幅                          | 新增 `PAGES` 默认提供 `zh` 源并接受英文树 fallback；重要页同时写 `en` 源                 |
| ADR 列表膨胀                      | 21 篇且持续增长，平铺侧栏会过长                                                      | Nimbus 目录组默认折叠；加 `/dev/adr/index` 目录页                                        |
| OG 字体                           | 中文字页新增/改名后，OG 卡 CanvasKit 需要重生成 Noto Sans SC 子集                    | 按 AGENTS.md：改中文文案后跑 `pnpm og:font`                                              |
| Nimbus `versions.others` 语义偏离 | 用「版本」机制挂「语言」，未来升级 Nimbus 或做版本化会打架                           | 把这一 hack 固定为决策记录；升级 Nimbus 时用 `nimbus-docs migrate --dry-run --diff` 审阅 |
| 生成参考的实现成本                | config/tool/event catalog 需要解析 Schema / 工具定义；当前无现成脚本                 | 先以「半自动生成 + 人工校」上线，脚本迭代；以 DSH `gen-cordis-catalog` 为参照            |

---

## 5. 未验证 / 待确认

1. **第三方 Host 插件能否让自有事件进入 `ctx.remote.$on` 白名单**：`API_REMOTE_FORWARDED_EVENTS` 位于第一方 `@deepseek-ai/dsh-api-remotes`（静态文件），未发现运行时注册 API；若不能，「六态推送」只能走自有流/轮询（§1.4）。
2. **Typert 生成器在 DSH workspace 之外的可复现性**：npm 包已发布（`@deepseek-ai/dsh-typert-generator@0.1.6-alpha.2`），README 面向 maintainers；尚无外部包使用它的公开范例。`ctx.remote.$mount()` 是否允许第三方动态客户端挂载自有 `/remote` 贡献，未验证。
3. **`ctx.connection.rpc.intercept('/api', …)` 与 `fetch.register` 在随附 web carrier 下对第三方端点的完整行为**：接口是公开的（`rpc.ts:138-166`），但文档主推 Typert；dsh-im 仅证明 `fetch.register` 路径在 0.1.5-alpha.1 附近可用。
4. **`ReferenceInsert.appearance` 自定义值**：类型仅 `'session' | 'file' | 'folder'`；PersonaBot token 若想要专属配色/图标需另找机制（可能扩展 `appearance` 联合或走 `conversation.input.*` 装饰）；未验证。
5. **`sidebar.panellist` 面板行的图标能力**：owner props 只传 `size/active`，图标由注册组件自绘（`PluginsPanelIcon` 用 `ui-primitives` 的 `Icon`）；`InputTriggerCandidate.icon` 可传 `ComponentType<IconProps>`，跨包用图标需用 `ui-primitives`（bundle 纯净门禁不允许别的插件组件）。
6. **DSH 0.1.5-rc.2 与 0.1.6-alpha.2 的行为差异**：关键 slot/trigger API 形状已比对一致，但菜单细节（`showGroupTitle`、`matchEnter` 的 envelope）在两版间未逐行 diff；M3.5 钉版本后需复验。
7. **六态 vs 五态**：core 现有 `state/bot-state.ts` 为五态聚合；M3 展示若要求六态，需确认是 core 模型变更还是客户端派生，本文不涉及。
8. **dsh-im 客户端实现不是当代模板**：其 `@deepseek-ai/dsh-client-runtime@0.0.1-rc.1` 依赖不在 0.1.6-alpha.2 web-app 图中；只借鉴其 RPC 桥思路，不照抄架构。

## 6. 来源清单

**上游仓库（pinned `ddefc45fbc7f8e46dd73185e68295696d1297887`）**

- 客户端模块与扫描：`packages/client/modules/src/index.ts`；文档 `docs/subsystems/client-modules.zh.md`
- Slots：`packages/client/ui-slots/src/index.ts`（`register<…>` :1157-1203、`entriesOfSlot` :1352）；`docs/subsystems/slots.zh.md`
- 布局/面板：`packages/client/ui-layout/src/client/index.ts:48-80,140-158`、`AppFrame.tsx:40-42`
- 侧栏：`packages/client/ui-sidebar/src/client/contract/slots.ts:34-40`、`src/client/index.ts:51-105`
- 输入触发：`packages/client/ui-input-trigger/src/client/contract.ts:12-24`、`src/types.ts:160-261`、`README.zh.md`
- `@` 范例：`packages/client/ui-reference/src/client/index.ts:37-137`、`package.json`
- `/` 命令：`packages/client/ui-commands/src/client/index.ts`、`packages/interaction/commands`（`docs/subsystems/commands.zh.md`）
- 面板消费范例：`packages/client/ui-plugin-manager/src/client/index.ts:50,67-99`
- 引用插入类型：`packages/client/ui-conversation/src/client/contract/draft-editor.ts:14-21`、`contract/input.ts:56-72`
- RPC：`packages/client/connection/src/rpc.ts:116-166,220`、`src/client/rpc.ts:34-79`、`README.zh.md`（浏览器认证与信任）
- 事件白名单：`packages/api/remotes/src/remote-events.ts:18-43`
- Typert：`docs/api-gateway.zh.md:9-15,58,121,133`
- Web Client 分层：`docs/subsystems/web-client.zh.md:22-28,62-66,82`
- 客户端打包：`packages/client/AGENTS.md`、`packages/client/tsdown.client.ts:3,480,605-620`、`packages/client/web/src/platform.ts:8-14`、`docs/cookbook/adding-a-settings-card.zh.md:7,50-102`
- 文档站 IA：`website/docs.ts`（全 575 行）、`website/.vitepress/config.ts:36-160`、`scripts/project-doc-site.ts:6-8,205-214,464-575`
- 文档站线上（中文根树）：https://deepseek-harness.github.io/deepseek-harness/guide/quickstart 、`/develop/basic/`、`/reference/`（示例深链：`/reference/subsystems/slots`、`/reference/subsystems/client-modules`、`/reference/subsystems/web-client`、`/reference/api-gateway`）

**npm（2026-09-18）**

- `@deepseek-ai/dsh@0.1.5-rc.2`（latest/next）、`@deepseek-ai/dsh@0.1.6-alpha.2`（alpha）
- `@deepseek-ai/dsh-web-app@0.1.5-rc.2` / `@0.1.6-alpha.2` dependencies（含全部 `dsh-client-*`）
- 本调研抽样 tarball：`@deepseek-ai/dsh-client-ui-layout@0.1.5-rc.2`、`@deepseek-ai/dsh-client-ui-sidebar@0.1.5-rc.2`、`@deepseek-ai/dsh-client-ui-input-trigger@0.1.5-rc.2`、`@deepseek-ai/dsh-client-ui-layout@0.1.6-alpha.2`、`@deepseek-ai/dsh-client-ui-sidebar@0.1.6-alpha.2`、`@deepseek-ai/dsh-client-ui-input-trigger@0.1.6-alpha.2`、`@deepseek-ai/dsh-client-ui-reference@0.1.6-alpha.2`、`@deepseek-ai/dsh-client-ui-plugin-manager@0.1.6-alpha.2`、`@deepseek-ai/dsh-typert-generator@0.1.6-alpha.2`
- 社区参照：`@xmanrui/dsh-im@4.21.2`（`lib/client.js`、`plugin-src/management-rpc.mjs`；compatibility ≤ `0.1.5-alpha.1`，仅作 RPC 桥实证）

**本仓库**

- `docs/architecture/botharness-architecture.md`（§1/§2/§3/§6/§8 对照）
- `packages/core/src/plugin.ts:44-66`（`provide('botharness')`）、`packages/core/src/state/bot-state.ts`、`packages/core/package.json`
- `scripts/sync-docs.mjs`、`apps/docs/astro.config.ts`、`apps/docs/src/content.config.ts`、`apps/docs/AGENT.md`、`apps/docs/src/components/Header.astro`、`apps/docs/src/pages/{docs,dev}/index.astro`
