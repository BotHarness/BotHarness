# BotHarness 规格（PoC）

| 项       | 内容                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| 版本     | v1.6                                                                                   |
| 日期     | 2026-09-18                                                                             |
| 状态     | Draft                                                                                  |
| 形态     | DSH 插件层：SDK 包 + bundle（**不 fork DSH**，ADR-0015）                               |
| 首个应用 | **DeepSeekBot**（见 `PRD.md`）                                                         |
| 决策记录 | `docs/adr/`（v1.6 新增 0024 Orchestrator 拓扑、0025 Inbox 触发、0026 Channel/Binding） |

## 1. 定位与缺口

- 现有 LLM harness（含 DSH）以 session 为单位：跨 session 至多是一份"云记忆"，**没有带人格、持久身份的 Bot 实体**。
- BotHarness 在 DSH 之上补这一层：**PersonaBot**（persona + 跨 session 记忆 + 状态 + 工作），以 SDK + bundle 交付，内核不动。
- 灵感：Grok Bot（每个 Bot 有自己的电脑、记忆、状态、自主工作）；DeepSeek Harness（插件宿主，"承载其他插件"）。
- 消费方：DeepSeekBot（首个应用）、IM 适配器、Live2D 渲染器（独立、后置）。

## 2. 实体模型

| 实体                     | 定义                                                           | 关键关系                                                                          |
| ------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **PersonaBot**           | 一等实体：persona、跨 session 记忆、状态、Bindings             | 可并发多个 Session；同一时刻一个 Orchestrator Session（ADR-0016/0024）            |
| **Session**              | DSH 执行单元：一次工作/对话，有独立进度与 cwd                  | 属于一个 PersonaBot；**工作 = Session**（ADR-0017）                               |
| **Workspace**            | 单个主机目录，与 DSH workspace 1:1                             | Session 的 cwd；可多个，UI 可分组（ADR-0018）                                     |
| **Agent**                | DSH 的会话内执行体                                             | 每 Session 一个；**不指 PersonaBot**                                              |
| **Orchestrator Session** | 每 PersonaBot 一个：拥有 Inbox，决定回复/派发/新开 Session     | 由 Inbox 批次唤醒；id 稳定、不做 rollover（ADR-0024/0025）                        |
| **Channel**              | 平台内一等协作空间：PersonaBot 与人类共同参与                  | 可桥接外部 Chat（Lark 随 M5）（ADR-0026）                                         |
| **Binding**              | PersonaBot 到参与表面的连接：Channel / Chat / sidebar/renderer | 可有多个；不再按 binding 把消息路由到固定 Session（ADR-0026）                     |
| **Inbox**                | PersonaBot 级事件流（派生投影，非队列）                        | 来源：Channel / Chat / DM / 其他 Session / 系统；由 Orchestrator 消费（ADR-0025） |
| **Memory**               | 文件优先的持久知识（§4）                                       | 用户可配目录，跨一切作用域                                                        |

目录约定：

- `$DSH_HOME/botharness/bots/<slug>/bot.json`：机器元数据（slug、displayName、avatar、模型/preset、workspaces、bindings、`capabilities.tools.allow`）。
- `PERSONA.md` / `MEMORY.md` / 主题文件随**用户配置的记忆目录**走（默认在 `bots/<slug>/memory/`）。

## 3. 状态模型

- **Session 级**（真实进度）：`thinking` / `working` / `waiting` / `blocked` / `done`（无活动即 `idle`）。
- **PersonaBot 级**（聚合）：precedence `blocked > waiting > working > thinking > idle`；`done` 是 Session 事件，聚合态随即回 `idle`。
- 语义：`waiting` = 等审批/等人；`blocked` = 失败或缺条件。
- 事件：状态变化 + activity（工具/步骤摘要）以 PersonaBot id 发出，供 **Host 内**消费者（IM 适配器、其他插件）订阅；浏览器 roster 不直接订阅 `states.on`，经客户端桥读模型 + 刷新/轮询取状态（ADR-0023，`docs/client-bridge.md`）。Live2D 后置，消费更原始的模型/工具/响应信号（见 §8 开放项）。

## 4. 记忆（文件优先）

```text
<memory-dir>/                  # 用户可配；默认 $DSH_HOME/botharness/bots/<slug>/memory/
├── PERSONA.md                 # 人格（人属；Agent 禁写，ADR-0014）
├── MEMORY.md                  # 生成的索引（树 + 摘要），不手改
├── customers/                 # 客户档案（北极星场景）
│   └── acme.md                # 时间线 + 关键事实 + 待办 + 关联附件（front-matter）
├── topics/ journal/ ...
└── .git/                      # 每 PersonaBot 一个 repo，仅记忆目录
```

读写规则：

| #   | 规则                      | 说明                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | 文件是唯一事实源          | 纯 Markdown + YAML front-matter：`summary`、`updated_at`、`sources`，选填 `tags`；缺失/非法时降级（首行摘要 + mtime），不阻塞（ADR-0012）                                                                                                                                                                            |
| M2  | 原子写                    | 写临时文件 + `rename` 原子替换；禁止原地截断；同一 PersonaBot 串行写；工具路径 jail 在记忆目录，拒绝越界                                                                                                                                                                                                             |
| M3  | 目录树进上下文 + 按需检索 | turn 注入目录树（front-matter 的 `summary` + `updated_at`）；上限 1000 个路径，超出折叠；细节用 `memory_search`（ripgrep）/ 读文件                                                                                                                                                                                   |
| M4  | 显式来源                  | 来源写入 front-matter `sources`（群 / 会话 / 日期 / 发送者），便于审计与回滚                                                                                                                                                                                                                                         |
| M5  | 人类可编辑                | UI 提供编辑器；冲突策略：mtime/hash 检测后**拒绝保存并展示差异**（不自动合并）                                                                                                                                                                                                                                       |
| M6  | 可备份/可回滚             | 目录可直接复制/打包；git：每 PersonaBot 一个 repo、单分支、覆盖记忆目录，每次记忆写入一个 commit（message = 首行 `summary`，有 `sources` 时接 `sources: …` 行，人改附 `source=human`；同一 turn 多次写入按写入逐个提交）；导出由人选择文件与时间点；附件在 repo 外随打包备份；未来 UI 管历史（clone + reset 到版本） |
| M7  | 防污染                    | 记忆写入可配置为「需确认」；可选定期人工 review（默认关）                                                                                                                                                                                                                                                            |
| M8  | 敏感信息                  | 凭据严禁写入记忆；发现疑似密钥时告警并脱敏（扫描规则）                                                                                                                                                                                                                                                               |
| M9  | 写入时机 = 工具写         | 仅由模型显式调用记忆工具落盘；无自动蒸馏、无后台批量改写（PoC）                                                                                                                                                                                                                                                      |
| M10 | 入站文件归属              | 归档到 Session 的 workspace（引用即提升为稳定路径）；记忆正文引用相对路径；TTL 与记忆解耦                                                                                                                                                                                                                            |
| M11 | 分享边界在导出时决定      | store 不存可见性：Bot 读取全部记忆；导出（M6）时由人选择哪些文件、哪个时间点进入包（ADR-0021）                                                                                                                                                                                                                       |
| M12 | 注入位置与缓存            | persona 静态段留在 system prompt 前缀；memory tree 改为每 turn 注入的独立消息（替换语义 + 与上次注入比对去重），保持前缀字节稳定以命中 KV cache（M3 的落地细化）                                                                                                                                                     |

## 5. 工作方式

- **入口与 Inbox**：所有来源事件（Channel / Chat / DM / 其他 Session / 系统，将来 webhook）进入 PersonaBot 的 Inbox——派生投影而非队列；投递 ≠ 已处理，忽略是合法结果。三类：immediate（@我、DM、blocked/审批、其他 Session 的直接消息）立即唤醒；digest（普通未读，默认 30 秒或 5 条合并为一次有界摘要）；silent（只记录，不唤醒）。触发策略（来源开关、窗口、阈值、优先级）是 Host 强制的 durable 配置，Settings UI 可改；Orchestrator 只决定每批怎么处理（ADR-0025）。
- **Orchestrator Session**：每 PersonaBot 同一时刻一个，由 Inbox 批次唤醒（非常驻）；决定回复、派发给已有工作 Session、或新开 Session；上下文交给 DSH `compaction-basic`，Session id 保持稳定（ADR-0024）。
- **工作 Session**：独立 root Session，可位于不同 Workspace（`ensureSession(sessionId, cwd)`），可并行多个；每个 Session 的 Agent 可再派生 DSH subagent 做会话内子任务，但 subagent 不构成 PersonaBot 级身份（ADR-0024）。
- **Session 间消息**：同一 PersonaBot 内可直接互发（Host 总线，`plugin` + relay 注入；请求-回复带超时与 interrupt），Orchestrator 留 audit 副本；跨 PersonaBot 暂经 Orchestrator（后置）。投递是 hint，不承诺 exactly-once。
- **状态感知**：Orchestrator 默认 pull（`sessionQuery` 读状态/最近输出，零打扰）；工作 Session 在里程碑、阻塞、需要决策时 push（immediate）。Memory 只放长期事实。
- **决策呈现**：waiting 徽标 + DSH Ask Question / Ask Permission；需要人类介入时也可向来源 Chat 发消息（去重靠 `message_id`）。
- **审批分级**：只读 + 记忆/家内写入自由；外部副作用（对外发消息、外部 API、家外写）置 `waiting`，等有人对话时确认（DSH approval 需要 open turn）。
- **自主性**：事件驱动（无 scheduler/心跳）；「主动」= 跨来源、跨 Workspace、自主选择 Session。PoC 仍只做委派制（ADR-0025）。
- **工具面**：per-PersonaBot `capabilities.tools.allow`；激活时 `ctx.tools.restrict` 裁剪；未知名字先过滤并告警；核心 Memory 工具强制并集；UI 写路径后置。
- **落地节奏**：M3 = roster + @委派 + 工位会话（目标模型的第一个切片）；Inbox、Orchestrator、跨 Session 总线在 M4 后排期；Channel 的 Lark 桥接随 M5。
- **已知约束**：DSH web profile 对"从未打开过的程序化 agent"起 turn 有开放问题（Discussion #6617）；工位会话存活是 M3/M4 的验证项。
- **Task 不存在**（ADR-0017）。

## 6. 插件层与包

- 交付形态：SDK 包 + bundle（`cordis.patch.yml`），不 fork DSH。
- 包（monorepo，包边界先行；第二个消费方出现再拆仓）：

| 包                   | 内容                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `@botharness/core`   | host 域服务：registry、memory、state/events、inbox、orchestrator 调度、session 总线、workspaces |
| `@botharness/client` | React 客户端：roster、PersonaBot 详情/新建、@委派入口（DSH client bundle）                      |
| `@botharness/im`     | IM 适配器（后置；首个为 Feishu/Lark，复用 dsh-im）                                              |
| `deepseekbot`        | bundle + 应用：组装以上并发布为可用插件                                                         |

- 扩展面：其他 Host 插件可读 registry、订阅状态事件、注册 renderer；不提供路由与回复位置的覆盖（沿用 ADR-0011，路由类需求走上游）。
- 客户端事实：DSH 客户端组件是 React，且浏览器半侧是**独立 Cordis 应用**——不能 `inject` host 服务；客户端经**客户端桥（读模型 RPC）**读写 PersonaBot（ADR-0023，规格 `docs/client-bridge.md`）。shell 只共享 `react`/`react-dom` 等基线，第三方依赖必须打进 lazily-loaded bundle（blobatar 走这条）。
- 插件配置走 DSH 规范通道：导出 `Config` + `apply(ctx, config)`，`enabled` 是组合层开关；settings 卡片推迟到 M3+ 以 `installSection` + 动态注入回归（ADR-0022）。

## 7. 里程碑

| #    | 交付                                                                                                      | 状态             |
| ---- | --------------------------------------------------------------------------------------------------------- | ---------------- |
| M1   | **BotHarness 骨架**：core 包、PersonaBot registry、bot home（`bot.json` + 记忆目录）、状态事件、设置/存储 | 已完成（PR #13） |
| M2   | **记忆 MVP**：布局 + front-matter + 目录树注入 + `memory_*` 工具 + 原子写                                 | 已完成（#9）     |
| M3   | **Roster 与委派**：client 包、`main` 面板（名册/详情/新建）、@委派、工位会话、六态展示                    | 待开始（#10）    |
| M3.5 | **安装验证门**：本地跑起 DSH、官方 CLI 安装 bundle、插件加载与 UI 冒烟（M3 → M4 之间）                    | 待开始（#24）    |
| M4   | **演示闭环**：文件研究助手（workspace 绑定、执行、汇报、waiting/审批）                                    | 待开始（#11）    |
| M5   | **IM 适配器**：dsh-im 绑定、Lark 国际版验证、客户跟进场景                                                 | 待开始（#12）    |
| M6   | **SoulSnapshot**：导出（档位/过滤/脱敏/快照）+ 导入（审阅闸门/新副本）+ commit message 规则               | 待开始（#17）    |
| M7   | **Soul registry / Marketplace**：BetterAuth、R2、PlanetScale、公开上架与下载；插件一键分享随后            | 待开始（#18）    |
| —    | Live2D：独立 effort，后续单独 grill/wayfinder                                                             | 暂缓             |

## 8. 风险与开放问题

| 风险                                       | 缓解                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| #6617：web profile 冷 agent 起不了 turn    | 工位会话 + 存活 owner agent；M3/M4 实测                                              |
| DSH 预览期破坏性变更                       | pin 版本；薄插件边界；契约测试                                                       |
| dsh-im 无 session→bot seam                 | 自持 registry；IM 绑定只在适配器读基座存储（ADR-0011 后果）                          |
| 记忆污染 / 私事外泄                        | 工具写 + `sources` + 导出时选择分享边界（ADR-0012/0021）                             |
| 自主动作越权                               | 审批分级（§5）；`waiting` 状态可见                                                   |
| 多根目录需求                               | 多个 Workspace + UI 分组；需要时再走多根文件工具（ADR-0018）                         |
| 默认公开的恶意/钓鱼 Bot                    | 上传自动闸门（密钥扫描硬拒绝、类型白名单、大小、解压炸弹）；举报 → 下架 → 封号       |
| 平台成本与依赖（Cloudflare / PlanetScale） | 公开免费 + 私有/超额付费；schema 预留 `plan`/`quota`（ADR-0019）                     |
| 快照触及他人内容与许可                     | `license` + `share_policy` + `provenance.upstream`（ADR-0020）；再导出必须保留原字段 |
| Orchestrator 中枢成本与单点                | 批次唤醒 + 可忽略语义 + DSH compaction；消耗随 Inbox 量而非聊天量增长（ADR-0025）    |
| 自建跨 Session 总线的可靠性                | durable 投影 + MessageId 去重 + 超时/interrupt；relay 失败返回结构化错误（ADR-0024） |

**开放项**：工位会话的 wake 实测；Live2D 信号面（模型/工具/响应 → 动作）；跨 PersonaBot 通信（经 Orchestrator）的 API 形状；跨 Session 请求-回复的超时/取消语义；Inbox 触发策略的 Settings UI 表达与默认值实测；Channel ↔ Lark 群/thread 映射（M5）。
