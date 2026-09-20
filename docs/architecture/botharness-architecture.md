# BotHarness 架构与数据流

BotHarness 是 DSH（DeepSeek Harness）之上的插件层，给 agent 持久身份：**PersonaBot**——带人格、跨 session 记忆、可并发工作。DeepSeekBot 是它的首个应用（sidebar 名册 + 委派 + IM 接入）。DSH 内核不 fork；IM 由 dsh-im 基座提供通道。

状态：M1 已实现（PR #13）· M2 记忆 MVP 已实现 · M3 Roster 与委派（名册陈列迁 Host `botharness_roster`，#66） · M5 IM 适配器 · M6 SoulSnapshot · M7 Soul registry（ADR-0019/0020）· 更新 2026-09-20

## 1 · 系统上下文

```mermaid
flowchart LR
  User["用户（DSH Web / 飞书群里的人）"]
  Feishu["飞书 / Lark 开放平台"]

  subgraph Host["DSH Host · 单进程"]
    IM["dsh-im 基座<br/>通道 · 会话路由 · 流式卡片 · 设置页"]
    Core["@botharness/core<br/>registry · 状态 · IM 绑定解析"]
    Agent["DSH Agent<br/>每 Session 一个执行体"]
  end

  subgraph Browser["Web Client · 浏览器（独立 Cordis 应用）"]
    Client["@botharness/client<br/>roster · 详情 · @委派（M3）"]
  end

  User -->|"@ / 委派"| Client
  User -->|"群消息"| Feishu
  Feishu <-->|"长连接（出站）"| IM
  IM --> Agent
  Core -->|"RPC（读模型）"| Client
  Client -.->|"RPC（写操作）"| Core
  Core -.->|"只读 config.json / workspaces.json"| IM
  Agent -.->|"状态事件（M3 接入）"| Core

  classDef ours fill:#ecfdf5,stroke:#16a34a,color:#14532d;
  classDef dsh fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95;
  classDef later fill:#f1f5f9,stroke:#94a3b8,color:#475569,stroke-dasharray:4 3;
  class Core ours;
  class IM dsh;
  class Client later;
```

两条入口（DSH Web 的 roster/委派、飞书群的 IM），同一颗 PersonaBot 大脑。浏览器半侧不是 Host 进程的一部分：跨进程只有 RPC（ADR-0023）。

## 2 · 模块与包

```mermaid
flowchart TB
  subgraph pkgs["monorepo packages"]
    Bundle["deepseekbot<br/>bundle + 应用（M5）"]
    CorePkg["@botharness/core<br/>host 域服务（M1 已实现）"]
    ClientPkg["@botharness/client<br/>React 客户端（M3）"]
    ImPkg["@botharness/im<br/>IM 适配器（M5）"]
  end

  Bundle --> CorePkg
  Bundle --> ClientPkg
  Bundle --> ImPkg

  subgraph core["packages/core/src"]
    Plugin["plugin.ts<br/>apply(config) / provide"]
    Registry["bots/registry.ts<br/>CRUD · 原子写 · 记忆目录 · findByWorkspace"]
    Slug["bots/slug.ts"]
    Record["bots/persona-bot.ts"]
    State["state/bot-state.ts<br/>五态 → 聚合 · 事件"]
    Store["im/config-store.ts<br/>只读 dsh-im JSON"]
    Identity["im/identity.ts<br/>workspace → BotIdentity"]
    MemoryService["memory/service.ts<br/>cwd → PersonaBot"]
    MemoryTools["memory/tools.ts<br/>memory_read/search/write/list"]
    MemoryStore["memory/store.ts<br/>读写 · 生成索引 · 每次写一个 commit"]
    MemoryTree["memory/tree.ts<br/>目录树 · 超出折叠/溢出标记"]
    MemorySearch["memory/search.ts<br/>rg 检索"]
    MemoryGit["memory/git.ts<br/>每 Bot 一个 repo"]
    FrontMatter["memory/front-matter.ts<br/>摘要 / 降级"]
  end

  Plugin --> Registry
  Plugin --> State
  Plugin --> Store
  Plugin --> MemoryService
  Plugin --> MemoryTools
  Registry --> Slug
  Registry --> Record
  Store --> Identity
  MemoryService --> MemoryStore
  MemoryTools --> MemoryStore
  MemoryStore --> MemoryTree
  MemoryStore --> MemorySearch
  MemoryStore --> MemoryGit
  MemoryStore --> FrontMatter
  MemoryTree --> FrontMatter
  ImPkg -.->|"M5 写绑定"| Registry

  classDef ours fill:#ecfdf5,stroke:#16a34a,color:#14532d;
  classDef later fill:#f1f5f9,stroke:#94a3b8,color:#475569,stroke-dasharray:4 3;
  class CorePkg,Plugin,Registry,Slug,Record,State,Store,Identity,MemoryService,MemoryTools,MemoryStore,MemoryTree,MemorySearch,MemoryGit,FrontMatter ours;
  class Bundle,ClientPkg,ImPkg later;
```

| 模块                     | 职责                                                                                                                                   | 状态             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `plugin.ts`              | 插件入口：`apply(ctx, config)`（`enabled` 门控）+ `provide('botharness')`；`createCore()` 组装                                         | M1 ✅            |
| `bots/registry.ts`       | PersonaBot 生命周期 + 原子持久化；`remove` 默认保记忆，`purge` 才清                                                                    | M1 ✅            |
| `state/bot-state.ts`     | Session 五态上报 → PersonaBot 聚合；`aggregate-changed / session-changed / session-removed`                                            | M1 ✅            |
| `im/*`                   | 只读 dsh-im 存储（v1/v2/v3 兼容）+ workspace→BotIdentity（IM 绑定助手）                                                                | M1 ✅（M5 接线） |
| `memory/front-matter.ts` | front-matter 解析/序列化 + 降级（首行摘要 + mtime；非法 YAML 不抛错）                                                                  | M2 ✅            |
| `memory/store.ts`        | 记忆读写：路径 jail、原子写、串行队列、`MEMORY.md` 生成、每次写入一个 commit                                                           | M2 ✅            |
| `memory/tree.ts`         | 目录树：front-matter 摘要 + `updated_at`；≤1000 路径，超出折叠为目录计数                                                               | M2 ✅            |
| `memory/search.ts`       | 大小写不敏感检索（`rg` 优先，纯 Node 回退）；跳过 front-matter，返回 path/line/excerpt                                                 | M2 ✅            |
| `memory/tools.ts`        | DSH 工具 `memory_read / memory_search / memory_write / memory_list`（write 必带 summary）                                              | M2 ✅            |
| `memory/service.ts`      | `agent.session.header.cwd → PersonaBot` 映射；每记忆目录一个 store（跨 Session 串行）                                                  | M2 ✅            |
| `memory/git.ts`          | 每 Bot 一个 repo：`main` 单分支、`.gitattributes` 强制 LF、本地身份、`history()`                                                       | M2 ✅            |
| roster 客户端            | `main` 面板 + `sidebar.panellist`；名册树 / 详情 / 新建；@委派                                                                         | M3               |
| `roster/{spec,store}.ts` | `botharness_roster` 存储域（global `pins/sectionOrder/topOrder?` + `sections` 表）；Host 生成 id；可选 `storageDomain`（缺省只读降级） | M3 ✅ #66        |

## 3 · 装载与服务暴露

```mermaid
sequenceDiagram
  participant D as DSH / Cordis
  participant P as @botharness/core · plugin.ts
  participant M as memory/service.ts
  participant T as memory/tools.ts
  participant O as Host 插件（im / 第三方）
  participant C as Web Client（浏览器）

  D->>P: apply(ctx, config)
  P->>M: createMemoryService({ registry })
  P->>D: provide('botharness', { rootDir, registry, states, memory })（仅 Host 内）
  P->>T: createMemoryTools({ resolveStore })
  T-->>P: memory_* 工具
  P->>D: tools.register(memory_read / memory_search / memory_write / memory_list)
  P->>D: systemPrompt.section(persona · memory-tree)
  O->>D: inject(['botharness'])
  D-->>O: ctx.botharness
  Note over O: 读 registry（list/get/findByWorkspace）<br/>订阅 states.on(...)（仅 Host 内）
  C->>D: connection.rpc.call('/api', 'botharness/<method>')（M3 起）
  D-->>C: { ok, value | error }
  Note over P: M3：经 connection.rpc / fetch 注册读模型端点（ADR-0023）
  Note over C: 读模型 + 刷新/轮询；不 inject Host 服务，<br/>不直接订阅 states.on
```

Host 内一切走 Cordis 服务总线；浏览器半侧经客户端桥 RPC 读模型，不跨进程 inject、无文件轮询。

### 3.1 · BOT 模式偏好（#68）

Host 半在 `packages/client/src/index.ts` 向 `ctx.settings` 注册命名空间 `ui-bot-mode`（schemastery：全局 `sortMode` + per-section `sortModes`，默认 `updated` / `{}`）；浏览器半经 `ctx.settingsScope.bind({ namespace: 'ui-bot-mode' })` 读写（全局 `set`、per-section `mutate` 路径操作），`settings/document-updated` 到达时由 policy store adopt：

```mermaid
sequenceDiagram
  participant H as Host · client/src/index.ts
  participant S as DSH settings（settings.yaml）
  participant P as 浏览器 · BotModePrefs（共享 store）
  participant U as sidebar `...` 菜单 / General 设置行

  H->>S: settings.register('ui-bot-mode', schema)
  S-->>P: settingsScope.bind(...) → status/value/user
  U->>P: setSortMode / setSectionSortMode（乐观写）
  P->>S: set('sortMode') / mutate(path ['sortModes', id])
  S-->>P: settings/document-updated → adopt
  Note over P,U: 一份 store、两个入口；旧 roster.json 排序字段一次性迁入
```

偏差记录：Host 半用 `settings.register(ns, schema)`，不用 cookbook 主推的 `installSection(ctx, ns, Config, config, { setSource, onChange })` —— 本插件没有可作 base 的 `cordis.yml` entry config，默认值与缺省行为完全由 schema 承担；出现 entry 配置需求时再切换到 `installSection`。

### 3.2 · 名册陈列（#66）

陈列（section 名称/成员/相对顺序、pins、混排 section 与松散 Channel 的 `topOrder`）的权威在 Host storage 域 `botharness_roster`（json 后端、`version 1`、`layout: single`；ADR-0034）；浏览器只经八个细粒度桥方法读写（含绝对顶层位置写 `topReorder`），写后重拉 `rosterGet`（无乐观状态）。storage 是可选能力：没有 `storageDomain` 时插件照常加载，roster 的读写都回 `storage-unavailable`（`rosterGet` 不假装空陈列），客户端首屏即只读、后端可用后重载恢复。

```mermaid
sequenceDiagram
  participant U as 浏览器 · BotSidebar
  participant B as botharness/* 桥（BotharnessBridgeService）
  participant R as core/roster/store.ts
  participant S as botharness_roster（json 后端）

  U->>B: rosterGet / sectionCreate / sectionRename / sectionRemove /<br/>channelAssign / sectionReorder / topReorder / pinsSet
  B->>R: zod 校验后的动作
  R->>S: 域写（global / sections 表，返回即已落盘）
  B-->>U: { ok, value }（写后客户端重拉 rosterGet）
  Note over U,S: 旧 roster.json 一次性迁移：空域 + 有旧键时建 section、<br/>按序归属、pins、重映射 sortModes，然后备份清理；pre-flat 域再一次性补 `topOrder`；有域不覆盖
```

## 4 · 创建 PersonaBot（数据流）

```mermaid
flowchart TD
  A["registry.create({ slug, displayName, … })"] --> B{"slug 合法?<br/>kebab-case ≤64"}
  B -- 否 --> E1["reason: invalid-slug"]
  B -- 是 --> C{"已有有效 bot.json?"}
  C -- 是 --> E2["reason: duplicate"]
  C -- 否 --> D{"memoryDir 为绝对路径?"}
  D -- 否 --> E3["reason: invalid-memory-dir"]
  D -- 是 --> F["组装 record<br/>slug/displayName/avatar/model/preset/workspaces/createdAt"]
  F --> G["原子写：bot.json.tmp-<uuid> → rename"]
  G --> H["mkdir memory/（默认或自定义）"]
  H --> I["返回 ok: record"]
  G -.->|"损坏可重建：保留既有 memory/"| H
```

校验 → 判重（以有效记录为准，不因墓碑目录卡死）→ 原子写 → 记忆目录。

## 5 · IM 绑定解析（当前为 helper，M5 接线）

```mermaid
sequenceDiagram
  participant S as DSH Session（cwd = 工作区）
  participant R as im/config-store.ts
  participant F as dsh-im 磁盘（只读）
  participant I as im/identity.ts
  participant G as registry（M5）

  S->>R: read()
  R->>F: integrations/dsh-feishu/config.json + workspaces.json
  F-->>R: bots[] · workspaces/aliases/conversationWorkspaces
  S->>I: resolveBotIdentity(workspace, conversationKey?)
  I-->>S: ok / ambiguous / not-found → BotIdentity{ id, displayName }
  S->>G: 写绑定：BotIdentity → registry slug（M5）
  Note over R,F: 基座升级需重验；不 fork、不 patch
```

## 6 · 状态机与事件

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> thinking: 委派 / 唤醒
  thinking --> working: 开始执行
  working --> waiting: 需要审批 / 等人
  waiting --> working: 确认后继续
  working --> blocked: 失败 / 缺条件
  blocked --> working: 修复后重试
  thinking --> blocked: 卡住
  working --> done: 完成（session 事件）
  done --> idle: 聚合回 idle
```

| 事件                | 触发                                  | 消费者               |
| ------------------- | ------------------------------------- | -------------------- |
| `aggregate-changed` | 聚合态变化                            | roster / 头像（M3+） |
| `session-changed`   | 任一 Session 状态变化（含聚合不动时） | 会话详情             |
| `session-removed`   | 会话结束 / 清理                       | 树刷新               |

事件只在 Host 进程内发出。浏览器端不直接订阅：roster 经客户端桥读模型 + 刷新/轮询获得状态（ADR-0023）。

## 7 · 磁盘数据

我们的（registry 写入）：

```text
$DSH_HOME/botharness/bots/<slug>/
├── bot.json   # 机器元数据（原子写）
└── memory/    # 默认记忆目录；可配绝对路径
               # M2：PERSONA.md / MEMORY.md / 主题文件
```

dsh-im 的（只读）：

```text
$DSH_HOME/integrations/dsh-feishu/
├── config.json      # bots[]
├── workspaces.json  # v3：workspaces/aliases/覆盖
└── bots/<botId>/state.json  # 会话绑定（M5）
```

## 8 · 通信与边界

| 通道                                 | 方向                          | 说明                                                                                   |
| ------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------- |
| Host 内 Cordis 服务 `provide/inject` | core → Host 插件（im/第三方） | `botharness` 服务仅同进程可见；无全局单例                                              |
| Host 内 Tracker 订阅 `states.on()`   | core → Host 消费者            | 进程内事件，非轮询；浏览器不直接订阅                                                   |
| 浏览器内 Cordis（slots/触发源等）    | client 插件之间               | Web Client 是独立 Cordis 应用，shell 基线由宿主注入                                    |
| 跨进程 Connection RPC                | client ↔ core                 | `botharness/<method>` 读模型；`{ ok, value \| error }` + cursor；刷新/轮询（ADR-0023） |
| DSH 事件总线 `ctx.on`                | DSH/dsh-im → core             | M3 接 `agent/*` 驱动状态                                                               |
| 飞书 / Lark                          | dsh-im ↔ 开放平台             | 长连接出站；无公网入口（webhook 例外见 PRD）                                           |
| dsh-im 磁盘                          | 只读                          | 只经 `im/` 一个模块；不 fork / 不 patch                                                |
| Secrets                              | —                             | 只在 DSH credentials 服务；仓库零明文                                                  |

## 9 · 如何维护

- 这是**活的**架构文档：模块、数据流、边界发生结构变化时，更新本文件（mermaid 源码直接内联）。
- 本页由 `scripts/sync-docs.mjs` 同步到文档站（`apps/docs`）；站点地址 `https://botharness.ai/architecture`。
- 配套：平台规格 `docs/botharness.md` · 应用 PRD `PRD.md` · 词表 `CONTEXT.md` · 决策 `docs/adr/`。
