# 客户端桥（Client Bridge）规格

| 项       | 内容                                                                            |
| -------- | ------------------------------------------------------------------------------- |
| 版本     | v0.2（M3.1 落地回填，读模型 + create/update/pause/resume）                      |
| 日期     | 2026-09-19                                                                      |
| 状态     | Implemented（`list/get/create/update/pause/resume`）                            |
| 适用范围 | M3（Roster 与委派）：`@botharness/client` ↔ `@botharness/core` 的读模型契约     |
| 决策记录 | ADR-0023（客户端桥是读模型 RPC，不是 Cordis 注入）                              |
| 上位规格 | `docs/botharness.md` §6；架构 `docs/architecture/botharness-architecture.md` §8 |

## 1. 为什么需要桥

Web Client 是**独立的浏览器 Cordis 应用**，与 Host 分开组装、分开加载；分层是「Host 状态 → Remote 传输 → Client model → UI adapter → Slots」。因此 `ctx.provide('botharness', core)` 只对 Host 内插件可见，浏览器半侧**不能** `inject` 该服务。

core 把 PersonaBot 的读模型显式定义为一组 RPC 方法；浏览器只依赖这份 wire 契约，不依赖任何 Host 对象。方法名与信封已随 M3.1 实现冻结。

## 2. 传输与信封

- 通道：通用 Connection RPC（共享 `/api`），无需 Typert 代码生成。
- 客户端调用：`ctx.connection.rpc.call('/api', 'botharness/<method>', payload, signal)`
- Host 注册：`ctx.connection.rpc.intercept('/api', …)`，或精确路由 `ctx.connection.fetch.register({ path: '/api/…' })`。
- 响应信封：

  ```ts
  type BridgeResult<T> =
    | { ok: true; value: T; cursor?: string }
    | { ok: false; error: { code: string; message: string } };
  ```

- `code` 用稳定枚举（如 `invalid-slug`、`duplicate`、`not-found`、`invalid-input`），`message` 只供展示；服务端错误不得带堆栈或凭据。

## 3. 方法面

命名一律 `botharness/<method>`，unary、无副作用泄漏；写方法与读方法同一信封。

| 方法                | 入参                                                                                               | 出参                                    | 说明                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `botharness/list`   | `{ query?, since? }`                                                                               | `{ bots: PersonaBotSummary[]; cursor }` | roster 名册；`since` 增量                                     |
| `botharness/get`    | `{ slug }`                                                                                         | `{ bot: PersonaBotDetail }`             | 详情（含记忆入口、workspaces）                                |
| `botharness/create` | `{ slug, displayName, persona?, tag?, description?, model?, preset?, workspaces?, avatarSeed? }`   | `{ bot: PersonaBotDetail }`             | 新建向导；persona 写入 `PERSONA.md`（缺省占位、已存在不覆盖） |
| `botharness/update` | `{ slug, patch: { displayName?, tag?, description?, model?, preset?, workspaces?, avatarSeed? } }` | `{ bot: PersonaBotDetail }`             | 编辑；不写 persona（人属）；空字符串清空可选字段              |
| `botharness/pause`  | `{ slug }`                                                                                         | `{ bot: PersonaBotDetail }`             | 暂停后续委派；状态仍在读模型中（`paused: true`）              |
| `botharness/resume` | `{ slug }`                                                                                         | `{ bot: PersonaBotDetail }`             | 恢复委派；读模型清除 `paused`                                 |

`PersonaBotSummary` 含 `slug / displayName / tag? / description? / avatar? / paused? / aggregateState / workspaces / createdAt`；`PersonaBotDetail` 追加 `model? / preset? / memoryDir? / sessions`。`aggregateState` 为五态聚合（六态是展示派生，见 `docs/botharness.md` §3）。委派（delegate）与记忆编辑不在已实现面：前者依赖工位会话，后者复用 `memory_*` 工具语义后另行补方法。

## 4. 刷新与变更模型

- **MVP：动作后刷新 + 低频轮询**。客户端在 create/update/pause/resume 后立即重拉 `list`；名册每 5–10s 轮询一次 `list`（带 `since`/`cursor`，只回变更摘要）。
- **不做实时推送**：`states.on(...)` 是 Host 进程内 tracker；上游 Remote 事件白名单（`API_REMOTE_FORWARDED_EVENTS`）是第一方静态清单，第三方包无法追加。「六态实时」若被验证为必须，再在 `fetch.register` 的私有路由上做 SSE/长轮询，wire 形状仍走 `botharness/*`。
- 客户端必须以「读模型可能过期」为前提渲染：加载态、错误态、空态都是一等 UI。

## 5. 为什么不走 Cordis inject / Typert

| 路径                     | 结论                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `inject(['botharness'])` | 不成立：浏览器与 Host 是两个 Cordis 应用，跨进程没有服务注入                                 |
| Typert `@Remote`         | 暂缓：需构建期代码生成 + 第一方 assembly；仓库外可复现性未验证；留作 M3.5 安装门通过后的候选 |
| 直接 `states.on` 推送    | 不成立：转发事件白名单是第一方静态文件，第三方不可扩展                                       |
| 现在做 SSE               | 暂缓：MVP 需要的是刷新而非实时；私有流在方法面不变的前提下可后加                             |

## 6. 客户端包与 bundle 约束

- **独立包** `@botharness/client`（DSH 默认是「同一包两半侧」，本仓库按 ADR-0023 显式偏离）：package.json 声明 `dsh.client = { platform: 'web', inject: [...] }` 与 `exports['./client']`，并作为独立 Loader entry 挂载。
- **产物格式**：lazy-CJS closure factory，入口 `lib/client.js`，自注册 `window.__ModuleLoader__.load({ id: '@botharness/client', factory: (require) => { … } })`，带 sourcemap。
- **外置基线**：只外置 shell 注入的模块表（`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`）；其余依赖（含 blobatar）全部内联。
- **纯净门禁**：跨插件只允许 `import type`，不得值导入；跨包协作走 Cordis 服务或 slot。
- **构建**：共享 preset（`clientBundle()`）未发布，等价构建已在根 `tsdown.config.ts`（`clientBundleOptions`）实现：banner/footer 生成 closure factory，`pnpm build` 产出 `lib/client.js` + `lib/client.js.map`。契约由 `packages/client/test/client-bundle.test.ts` 覆盖（自注册、只外置 shell 基线、插件注册）。剩余风险转移到 M3.5：把该 Loader entry 装进真实 profile 并加载。

## 7. 本地开发环路（dev profile + HMR）

M3 起在本地联调客户端半侧；M3.5 安装门复用同一环路做真实验收。

- **准备（一次）**：pin `@deepseek-ai/dsh@0.1.5-rc.2`，用隔离 `DSH_HOME`，把本地 bundle 装进专用 `web-dev` profile（`dsh plugin --profile web-dev add <path>`）；bundle 成员变化需要重启。先决条件：`deepseekbot` 最小 bundle 尚未建立，core/client 还没有 Loader entry 挂载。
- **运行**：`dsh web --profile web-dev`。
- **迭代客户端**：改 `packages/client` 后跑根 `pnpm build`，产出新的 `lib/client.js`；`dsh-client-hmr` 检测 bundle 字节变化（`ClientModuleRegistry.rebuilt` 重哈希 → revision 变化 → 推送新入口图），浏览器自动换新。仅 sourcemap 变化不触发重载。
- **迭代 Host**：Cordis 插件注册都走 `ctx.effect`，vendored HMR 直接生效，无需重启。
- **参考**：client-modules（bundle 路由、revision、`onRebuilt`/`onGraphChanged`）；extension-cookbook（plugin hot-reload）。

## 8. 未决

- 六个桥方法（`list/get/create/update/pause/resume`）已实现（`packages/core/src/bridge/`）；写方法只落 `bot.json`，persona 仅 create 时写 `PERSONA.md` 且不覆盖。
- 委派与取消的方法形状（工位会话就绪后）。
- 记忆编辑是否走同一桥，还是继续只由 `memory_*` 工具在会话内负责。
- 六态实时性等级与私有流（如做）的鉴权与背压。
- `@PersonaBot` 提及 token 的 appearance 与序列化（依赖 `@deepseek-ai/dsh-client-ui-input-trigger` 的 `ReferenceInsert` 限制）。
