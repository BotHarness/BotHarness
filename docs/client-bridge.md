# 客户端桥（Client Bridge）规格

| 项       | 内容                                                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 版本     | v0.6（新增七个 roster 桥方法与 `storage-unavailable` 错误码，#66）                                                                                                               |
| 日期     | 2026-09-20                                                                                                                                                                       |
| 状态     | Implemented（`list/get/create/update/pause/resume` + 五个 channel 方法 + `sessions` + 七个 roster 方法）                                                                         |
| 适用范围 | M3（Roster、Chat 壳与本地 Channel 历史）：`@botharness/client` ↔ `@botharness/core` 的读模型契约                                                                                 |
| 决策记录 | ADR-0023（客户端桥是读模型 RPC，不是 Cordis 注入）及其 2026-09-19 更新、ADR-0029 / ADR-0030（Channel 与本地 NDJSON 历史）、ADR-0034（持久化地图与主客分界，#66 落地陈列迁 Host） |
| 设计权威 | `docs/architecture/botharness-architecture.md`；取舍与理由见相关 ADR                                                                                                             |

## 1. 为什么需要桥

Web Client 是**独立的浏览器 Cordis 应用**，与 Host 分开组装、分开加载；分层是「Host 状态 → Remote 传输 → Client model → UI adapter → Slots」。因此 `ctx.provide('botharness', core)` 只对 Host 内插件可见，浏览器半侧**不能** `inject` 该服务。

core 把 PersonaBot 的读模型显式定义为一组 RPC 方法；浏览器只依赖这份 wire 契约，不依赖任何 Host 对象。方法名与信封已随 M3.1 实现冻结。

## 2. 传输与信封

- 通道：通用 Connection RPC（共享 `/api`）。`/api` 路由与其**唯一 interceptor 槽位**归 `@deepseek-ai/dsh-api-gateway`；插件端点必须经 gateway 认领，**不得** `connection.rpc.intercept('/api', …)`（见 #50）。
- 客户端调用：`ctx.connection.rpc.call('/api', 'botharness/<method>', { args: { …命名参数 } }, signal)`。
- Host 注册：`BotharnessBridgeService extends TypertRemoteService`（Cordis 服务键 `botharnessBridge`，wire namespace `botharness`），随 `ctx.provide`/Service 生命周期注册；gateway 扫描带 `typertRemote` 绑定的服务与 remote-method descriptor（SRC markers，无构建期 codegen）后认领 `botharness/*`。
  - 方法参数按**命名 wire 字段**传递（与下表入参同名）；缺省可省（SRC codec 允许 missing），未知字段会被 gateway 拒绝为 `gateway/arguments-invalid`。
  - 构建链（rolldown/oxc）不 emit 标准装饰器语法，故 descriptor 由 `markRemoteMethods` 直接写入（键 `@deepseek-ai/dsh-typert-protocol/remote-methods`，version 1），格式由 `packages/core/test/bridge-rpc.test.ts` 锁住。
- 失败映射：方法抛 `RemoteError(code, message, {})`；gateway 原样编码为响应信封的 error 分支，客户端仍按 `{ ok: false, error }` 处理。
- 响应信封：

  ```ts
  type BridgeResult<T> =
    | { ok: true; value: T; cursor?: string }
    | { ok: false; error: { code: string; message: string } };
  ```

- `code` 用稳定枚举（如 `invalid-slug`、`duplicate`、`not-found`、`invalid-input`、`storage-unavailable`），`message` 只供展示；服务端错误不得带堆栈或凭据。`storage-unavailable` 表示该 profile 没有 `storageDomain` 后端：roster 的读与写都以该码失败（`rosterGet` 不假装空陈列），客户端在首次加载即渲染只读态，后端可用后重载即恢复。

## 3. 方法面

命名一律 `botharness/<method>`，unary、无副作用泄漏；写方法与读方法同一信封。

| 方法                         | 入参                                                                                                 | 出参                                                                            | 说明                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `botharness/list`            | `{ query?, since? }`                                                                                 | `{ bots: PersonaBotSummary[]; cursor }`                                         | roster 名册；`since` 增量                                                                         |
| `botharness/get`             | `{ slug }`                                                                                           | `{ bot: PersonaBotDetail }`                                                     | 详情（含记忆入口、workspaces）                                                                    |
| `botharness/create`          | `{ displayName, roles?, persona?, description?, model?, preset?, workspaces?, avatarSeed? }`         | `{ bot: PersonaBotDetail }`                                                     | Host 生成内部 ID；最小 UI 发名称及可选岗位/简介；persona 缺省时写占位 `PERSONA.md`                |
| `botharness/update`          | `{ slug, patch: { displayName?, roles?, description?, model?, preset?, workspaces?, avatarSeed? } }` | `{ bot: PersonaBotDetail }`                                                     | `slug` 是内部 ID 的当前 wire 键；不写 persona（人属）；空值清空可选字段                           |
| `botharness/pause`           | `{ slug }`                                                                                           | `{ bot: PersonaBotDetail }`                                                     | 暂停后续委派；状态仍在读模型中（`paused: true`）                                                  |
| `botharness/resume`          | `{ slug }`                                                                                           | `{ bot: PersonaBotDetail }`                                                     | 恢复委派；读模型清除 `paused`                                                                     |
| `botharness/channels`        | `{}`                                                                                                 | `{ channels: ChannelListItem[] }`                                               | M3 本地 Channel 列表；附可选的最新消息投影；`updatedAt` 新→旧                                     |
| `botharness/channelDm`       | `{ slug, displayName? }`                                                                             | `{ channel }`                                                                   | 打开 BOT 的 DM（幂等）；M3 仅本地                                                                 |
| `botharness/channelCreate`   | `{ name, members }`                                                                                  | `{ channel }`                                                                   | 新建群聊 Channel；M3 仅本地                                                                       |
| `botharness/channelRename`   | `{ channelId, name }`                                                                                | `{ channel, bot? }`                                                             | 重命名 group Channel；DM 同步 PersonaBot displayName，但保留 Channel ID 与内部 PersonaBot ID      |
| `botharness/channelMessages` | `{ channelId, before?, limit? }`                                                                     | `{ messages, revision }`                                                        | 历史快照与该 Channel 的提交修订号；`before` 用于分页                                              |
| `botharness/channelTimeline` | `{ channelId, direction?, cursor?, around?, limit?, olderLimit?, newerLimit? }`                      | `{ page: { entries, olderCursor, newerCursor, hasOlder, hasNewer }, revision }` | #143 当前读路径；Host 解释不透明游标，按持久提交顺序返回 latest / older / newer / around 连续窗口 |
| `botharness/channelSend`     | `{ channelId, body }`                                                                                | `{ message }`                                                                   | 写本地 NDJSON（`author.kind = 'human'`）；M3 无投递                                               |
| `botharness/assignments`     | `{ slug }`                                                                                           | `{ assignments }`                                                               | PersonaBot 的 Assignment Directory 摘要                                                           |
| `botharness/assignment`      | `{ slug, sessionId }`                                                                                | `{ assignment }`                                                                | 一项 Assignment 的目的、状态、报告与 Session 关联                                                 |
| `botharness/sessions`        | `{ slug }`                                                                                           | `{ sessions: SessionSummary[] }`                                                | BOT 的会话列表：cwd 落在其 workspace 内；`updatedAt` 新→旧                                        |
| `botharness/rosterGet`       | `{}`                                                                                                 | `{ pins, hidden, sectionOrder, topOrder?, sections }`                           | 陈列快照；`hidden` 只省略 navigation，不改 placement；无 storage 时报 `storage-unavailable`       |
| `botharness/sectionCreate`   | `{ name }`                                                                                           | `{ section }`                                                                   | 新建 section；id 由 Host 生成（uuid）并入 order 末尾                                              |
| `botharness/sectionRename`   | `{ sectionId, name }`                                                                                | `{ section }`                                                                   | 重命名；未知 id → `not-found`                                                                     |
| `botharness/sectionRemove`   | `{ sectionId }`                                                                                      | `{ removed }`                                                                   | 删除 section；成员回落未分组；幂等                                                                |
| `botharness/channelAssign`   | `{ channelId, sectionId?, index? }`                                                                  | `{}`                                                                            | 单一归属：先移除旧归属再入新 section；`sectionId` 省略/null = 未分组；`index` 省略追加；幂等      |
| `botharness/sectionReorder`  | `{ order }`                                                                                          | `{ sectionOrder }`                                                              | section 顺序；未知 id 丢弃、省略的 id 保持原序在后                                                |
| `botharness/topReorder`      | `{ order }`                                                                                          | `{ topOrder }`                                                                  | section block 与未分组 Channel 的绝对混排；未知 id 丢弃、单一归属保持                             |
| `botharness/pinsSet`         | `{ pins }`                                                                                           | `{ pins }`                                                                      | 置顶 Channel ID 列表；去重                                                                        |
| `botharness/hiddenSet`       | `{ hidden }`                                                                                         | `{ hidden }`                                                                    | 隐藏 Channel ID 列表；去重；不改 pin、section 或 topOrder                                         |

`ChannelRecord` 含 `id / type ('dm' | 'group') / name / members (PersonaBot IDs) / botSlug? (dm；当前 wire 键) / createdAt / updatedAt`；`ChannelListItem` 在它之上附加可选 `latestMessage`，由现有消息权威读取并投影给折叠 rail，不写回 `channel.json`；`ChannelMessage` 含 `id / at / author ({ kind: 'human' } | { kind: 'bot', slug } | { kind: 'bridged', source }) / body / external? ({ id, thread? })`。当前 M3 bridge 仍以每 Channel 的 `messages.ndjson` 作为历史权威，只读写本地文件、不做投递，群聊暂不写 BOT 回复（v1.1 Channel 工具）；这是迁移前的实现事实，不是新架构终态。ADR-0037 与 #79/#80 会将 Messaging operational facts 单向迁入 `botharness.db`，迁移后不双写 NDJSON。`before` 是消息 id 游标：返回比该消息更旧的一页。

#143 起，Client 读取历史首选 `channelTimeline`，旧 `channelMessages` 只保留兼容。当前 NDJSON 实现仍会扫描文件后切片；Client 不解释游标，也不将整段历史无限累计到内存。游标与消息 revision 各司其职：前者定位历史页，后者是 SSE 重连水位。详见 ADR-0055。

`SessionSummary` 含 `id / title / cwd / updatedAt`；标题取会话日志里第一条 `user/message` 的文本（无则空串，客户端回退展示），`updatedAt` 取最后一条事件时间（无事件回退 `createdAt`）。`sessions` 只读 DSH Host 当前在册的会话（`ctx.sessions.list()`），按 cwd 是否位于 BOT 的任一 workspace 内过滤。这是已实现 M3 bridge 的临时兼容启发式，只用于描述当前 wire 行为；新领域逻辑不得把 cwd 当 ownership。#80 会以 durable explicit Session ownership 和 Orchestrator / Assignment role projection 替换它（ADR-0035/0045）。

`PersonaBotSummary` 含 `slug（内部 PersonaBot ID 的当前 wire 键）/ displayName / roles[] / description? / avatar? / paused? / aggregateState / workspaces / createdAt`；`PersonaBotDetail` 追加 `model? / preset? / memoryDir? / sessions`。`aggregateState` 为五态聚合，六态是客户端展示派生。委派（delegate）与记忆编辑不在已实现面：前者依赖工位会话，后者复用 `memory_*` 工具语义后另行补方法。

`RosterSection` 含 `id / name / channelIds`（数组序 = 显示顺序）；`RosterSnapshot` 含 `pins / hidden / sectionOrder / topOrder? / sections`，其中 `pins` 与 `hidden` 的 canonical identifier 都是 Channel ID。陈列的权威是 Host storage 域 `botharness_roster`（json 后端、`version 1`、`layout: single`；global `{ pins, hidden?, sectionOrder, topOrder? }` + `sections` 表，ADR-0034），客户端不碰 Host 文件或 `ctx.storage`；各方法每次写入返回即已落盘，客户端写后重拉 `rosterGet`（不做乐观状态），旧 `roster.json` 只作一次性迁移源。隐藏只改变 roster navigation；恢复沿用未被改写的 pin/section/order。排序偏好不在本桥（#68 `ui-bot-mode` settings），折叠状态留浏览器本地。

## 4. 刷新与变更模型

- **分页与阅读位置（#143）**：打开 Channel 取最新 50 条；靠近顶部加载更早页，按原有消息的屏幕位置校准视口（同 sender 气泡组跨页重排时也不跳动）。围绕消息 ID 可打开前后窗口；离开末尾时保留连续的历史窗口，只提示有新消息，不把 SSE 尾部跨缺口拼接进去；加载失败保留原窗口并可重试。
- **Channel 消息（#141）**：`channelTimeline` 页返回 `revision`；已选 Channel 建立一个经 DSH 认证的 `GET /api/botharness/stream?channelId=…&after=revision` SSE 流。Host 仅在消息持久提交后发带递增 revision 的 `channel/message`，重连从权威日志回放、缺口则从 Host 修复连续窗口；Human 本地发送立即回显。Orchestrator 的显式 `channel_send` 工具参数流可产生无 revision 的进程内 `channel/draft`，只预览正在生成的 DM 气泡；提交后由正式消息替换，失败或放弃则移除。Assignment 输出和普通 assistant final 不进入 Channel。
- **其他读模型**：create/update/pause/resume 后仍主动刷新；现有名册低频轮询与六态 Activity 实时投影不由 Channel SSE 替代。Host 进程内 `states.on(...)` 不能跨浏览器直接使用，上游 Remote 事件白名单也不可由第三方扩展。
- **路由边界**：SSE 使用 Connection Fetch 注册完整 `/api/botharness/stream` 路径，而不是占用 API gateway 的 `/api` RPC interceptor；普通读写命令继续使用 Typert bridge。详见 ADR-0054。
- 客户端仍以「读模型可能过期」为前提渲染：加载态、错误态、空态都是一等 UI。

## 5. 为什么不走 Cordis inject / 为什么最终走 Typert SRC

| 路径                     | 结论                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `inject(['botharness'])` | 不成立：浏览器与 Host 是两个 Cordis 应用，跨进程没有服务注入                                                                |
| Typert 严格 codegen      | 暂缓：需构建期生成 + 第一方 assembly；仓库外可复现性未验证                                                                  |
| Typert SRC markers       | 已采用（#50）：`TypertRemoteService` + `typertRemote` 绑定即可被 gateway 认领，无需 codegen；`/api` 单槽位仍归 gateway 所有 |
| 直接 `states.on` 推送    | 不成立：转发事件白名单是第一方静态文件，第三方不可扩展                                                                      |
| Channel SSE              | 已实现（#141）：单向投递已提交消息和进程内 `channel_send` 草稿；快照与命令仍走 Typert RPC，其他状态不借此流广播             |

## 6. 客户端包与 bundle 约束

- **独立包** `@botharness/client`（DSH 默认是「同一包两半侧」，本仓库按 ADR-0023 显式偏离）：package.json 声明 `dsh.client = { platform: 'web', inject: [...] }` 与 `exports['./client']`，并作为独立 Loader entry 挂载。
- **产物格式**：lazy-CJS closure factory，入口 `lib/client.js`，自注册 `window.__ModuleLoader__.load({ id: '@botharness/client', factory: (require) => { … } })`，带 sourcemap。
- **外置基线**：只外置 shell 注入的模块表（`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`）；其余依赖（含 blobatar）全部内联。
- **纯净门禁**：跨插件只允许 `import type`，不得值导入；跨包协作走 Cordis 服务或 slot。
- **构建**：共享 preset（`clientBundle()`）未发布，等价构建已在根 `tsdown.config.ts`（`clientBundleOptions`）实现：banner/footer 生成 closure factory，`pnpm build` 产出 `lib/client.js` + `lib/client.js.map`。契约由 `packages/client/test/client-bundle.test.ts` 覆盖（自注册、只外置 shell 基线、插件注册）。剩余风险转移到 M3.5：把该 Loader entry 装进真实 profile 并加载。

## 7. 本地开发环路（dev profile + HMR）

M3 起在本地联调客户端半侧；M3.5 安装门复用同一环路做真实验收。

- **准备（一次）**：pin `@deepseek-ai/dsh@0.1.5-rc.2`，用隔离 `DSH_HOME`。先把 `@botharness/core` 与 `@botharness/client` 作为普通 profile dependency 链接，再只用 `dsh plugin --profile web-dev add ./packages/deepseekbot` 挂载 umbrella bundle。`dsh.profile.bundles` 必须包含 `deepseekbot`、不得包含两个成员包；否则 umbrella patch 与顶层 bundle 会重复注册 Loader。bundle 成员变化需要重启。
- **运行**：`dsh web --profile web-dev`。
- **迭代客户端**：改 `packages/client` 后跑根 `pnpm build`，产出新的 `lib/client.js`；`dsh-client-hmr` 检测 bundle 字节变化（`ClientModuleRegistry.rebuilt` 重哈希 → revision 变化 → 推送新入口图），浏览器自动换新。仅 sourcemap 变化不触发重载。
- **迭代 Host**：Cordis 插件注册都走 `ctx.effect`，vendored HMR 直接生效，无需重启。
- **参考**：client-modules（bundle 路由、revision、`onRebuilt`/`onGraphChanged`）；extension-cookbook（plugin hot-reload）。
- **Agent 一键实例**：`node scripts/dev-instance.mjs --home ~/.dsh-<name> --port <port> [--worktree <path>] [--build]` 自动完成「建 profile → 链接该 worktree 的包 → pnpm install → 注入机器级 `DEEPSEEK_API_KEY` → 后台启动 → 等待 token URL → 探测 `/api` 健康」，适合并行 worktree/端口/token 互不干扰；密钥来源与优先级见 `scripts/dev-secret.mjs`（env > `~/.config/botharness/dev.env` > macOS Keychain）。

## 8. 未决

- 二十七个桥方法已实现（`packages/core/src/bridge/`），包括 PersonaBot 六个、Channel 九个、Assignment 两个、`sessions` 一个，以及 `rosterGet/sectionCreate/sectionRename/sectionRemove/channelAssign/sectionReorder/topReorder/pinsSet/hiddenSet` 九个 roster 方法。前六个 PersonaBot 方法只落 `bot.json`/`PERSONA.md`，Channel 九个方法读写 `<channels-dir>/<channel-id>/{channel.json,messages.ndjson,read-position.json}`（ADR-0030）；其中 `channelReadPosition` / `channelMarkRead` 持久化单调的已读锚点；DM 重命名同时更新 PersonaBot Registry 的显示名。roster 方法经可选 `storageDomain` 落 `botharness_roster`（无后端时读写都回 `storage-unavailable`，客户端首屏只读）。
- 委派与取消的方法形状（工位会话就绪后）。
- 记忆编辑是否走同一桥，还是继续只由 `memory_*` 工具在会话内负责。
- 六态 Activity 的独立实时性与未来 Channel SSE 的慢消费者背压策略（#141 首个切片只覆盖选中 Channel 的已提交消息）。
- `@PersonaBot` 提及 token 的 appearance 与序列化（依赖 `@deepseek-ai/dsh-client-ui-input-trigger` 的 `ReferenceInsert` 限制）。
