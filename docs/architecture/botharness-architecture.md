# BotHarness 架构与数据流

BotHarness 是 DSH（DeepSeek Harness）之上的插件层，给 agent 持久身份：**PersonaBot**——带人格、跨 session 记忆、可并发工作。DeepSeekBot 是它的首个应用（sidebar 名册 + 委派 + IM 接入）。DSH 内核不 fork；IM 由 dsh-im 基座提供通道。

状态：M1 已实现（PR #13）· M2 记忆 MVP · M3 Roster 与委派 · M5 IM 适配器 · 更新 2026-09-17

## 1 · 系统上下文

```mermaid
flowchart LR
  User["用户（DSH Web / 飞书群里的人）"]
  Feishu["飞书 / Lark 开放平台"]

  subgraph Host["DSH Host · 单进程"]
    IM["dsh-im 基座<br/>通道 · 会话路由 · 流式卡片 · 设置页"]
    Core["@botharness/core<br/>registry · 状态 · IM 绑定解析"]
    Client["@botharness/client<br/>roster · 详情 · @委派（M3）"]
    Agent["DSH Agent<br/>每 Session 一个执行体"]
  end

  User -->|"@ / 委派"| Client
  User -->|"群消息"| Feishu
  Feishu <-->|"长连接（出站）"| IM
  IM --> Agent
  Client --> Agent
  Core -.->|"provide('botharness')"| Client
  Core -.->|"只读 config.json / workspaces.json"| IM
  Agent -.->|"状态事件（M3 接入）"| Core

  classDef ours fill:#ecfdf5,stroke:#16a34a,color:#14532d;
  classDef dsh fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95;
  classDef later fill:#f1f5f9,stroke:#94a3b8,color:#475569,stroke-dasharray:4 3;
  class Core ours;
  class IM dsh;
  class Client later;
```

两条入口（DSH Web 的 roster/委派、飞书群的 IM），同一颗 PersonaBot 大脑。

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
    Plugin["plugin.ts<br/>apply / settings / provide"]
    Registry["bots/registry.ts<br/>CRUD · 原子写 · 记忆目录"]
    Slug["bots/slug.ts"]
    Record["bots/persona-bot.ts"]
    State["state/bot-state.ts<br/>五态 → 聚合 · 事件"]
    Store["im/config-store.ts<br/>只读 dsh-im JSON"]
    Identity["im/identity.ts<br/>workspace → BotIdentity"]
  end

  Plugin --> Registry
  Plugin --> State
  Plugin --> Store
  Registry --> Slug
  Registry --> Record
  Store --> Identity
  ImPkg -.->|"M5 写绑定"| Registry

  classDef ours fill:#ecfdf5,stroke:#16a34a,color:#14532d;
  classDef later fill:#f1f5f9,stroke:#94a3b8,color:#475569,stroke-dasharray:4 3;
  class CorePkg,Plugin,Registry,Slug,Record,State,Store,Identity ours;
  class Bundle,ClientPkg,ImPkg later;
```

| 模块                 | 职责                                                                                        | 状态             |
| -------------------- | ------------------------------------------------------------------------------------------- | ---------------- |
| `plugin.ts`          | 插件入口：settings 命名空间 + `provide('botharness')`；`createCore()` 组装                  | M1 ✅            |
| `bots/registry.ts`   | PersonaBot 生命周期 + 原子持久化；`remove` 默认保记忆，`purge` 才清                         | M1 ✅            |
| `state/bot-state.ts` | Session 五态上报 → PersonaBot 聚合；`aggregate-changed / session-changed / session-removed` | M1 ✅            |
| `im/*`               | 只读 dsh-im 存储（v1/v2/v3 兼容）+ workspace→BotIdentity（IM 绑定助手）                     | M1 ✅（M5 接线） |
| 记忆（M2）           | front-matter、目录树注入、`memory_*` 工具、可见性、git 版本化                               | M2               |
| roster 客户端        | `main` 面板 + `sidebar.panellist`；名册树 / 详情 / 新建；@委派                              | M3               |

## 3 · 装载与服务暴露

```mermaid
sequenceDiagram
  participant D as DSH / Cordis
  participant P as @botharness/core · plugin.ts
  participant O as 其他插件（client / im / 第三方）

  D->>P: apply(ctx)
  P->>D: settings.register('botharness')
  P->>D: provide('botharness', { rootDir, registry, states })
  O->>D: inject(['botharness'])
  D-->>O: ctx.botharness
  Note over O: 读 registry（list/get）<br/>订阅 states.on(...) 拿实时状态
```

一切走 Cordis 服务总线，无文件轮询。

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

| 通道                         | 方向                    | 说明                                         |
| ---------------------------- | ----------------------- | -------------------------------------------- |
| Cordis 服务 `provide/inject` | core → client/im/第三方 | `botharness` 服务；无全局单例                |
| Tracker 订阅 `states.on()`   | core → client           | 进程内事件，非轮询                           |
| DSH 事件总线 `ctx.on`        | DSH/dsh-im → core       | M3 接 `agent/*` 驱动状态                     |
| 飞书 / Lark                  | dsh-im ↔ 开放平台       | 长连接出站；无公网入口（webhook 例外见 PRD） |
| dsh-im 磁盘                  | 只读                    | 只经 `im/` 一个模块；不 fork / 不 patch      |
| Secrets                      | —                       | 只在 DSH credentials 服务；仓库零明文        |

## 9 · 如何维护

- 这是**活的**架构文档：模块、数据流、边界发生结构变化时，更新本文件（mermaid 源码直接内联）。
- 本页由 `scripts/sync-docs.mjs` 同步到文档站（`apps/docs`）；站点地址 `https://botharness.ai/architecture`。
- 配套：平台规格 `docs/botharness.md` · 应用 PRD `PRD.md` · 词表 `CONTEXT.md` · 决策 `docs/adr/`。
