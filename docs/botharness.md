# BotHarness 规格（PoC）

| 项       | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 版本     | v1.14                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 日期     | 2026-09-20                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 状态     | Draft                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 形态     | DSH 插件层：SDK 包 + bundle（**不 fork DSH**，ADR-0015）                                                                                                                                                                                                                                                                                                                                                                                                     |
| 首个应用 | **DeepSeekBot**（见 `PRD.md`）                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 决策记录 | `docs/adr/`（v1.13 落地 0034 陈列迁 Host `botharness_roster`（#66）：section/pins/顺序经七个 roster 桥方法读写、section id 由 Host 生成、手动拖拽经 `channelAssign` 定位写 Host，旧 `roster.json` 一次性迁移并重映射 `sortModes`；v1.12 落地 0031 三态排序与 scope 内拖拽（#55）；v1.11 新增 0034 持久化地图与主客分界；v1.10 新增 0031 sidebar 组织与排序、0032 头像与图标；0028 增补 vendored 字形；排序偏好落在 `ui-bot-mode` settings 命名空间，见 #68） |

**v1.14 变更**：#56 follow-up 把未分组从固定底部 bucket 改为可与 section 混排的松散 Channel；section 整块接收归属投放，拖拽 marker 全为 overlay、源行原位淡出；Host roster 增加混合 `topOrder` 与第八个 `topReorder` 桥方法（ADR-0031/0034）。

## 1. 定位与缺口

- 现有 LLM harness（含 DSH）以 session 为单位：跨 session 至多是一份"云记忆"，**没有带人格、持久身份的 Bot 实体**。
- BotHarness 在 DSH 之上补这一层：**PersonaBot**（persona + 跨 session 记忆 + 状态 + 工作），以 SDK + bundle 交付，内核不动。
- 灵感：Grok Bot（每个 Bot 有自己的电脑、记忆、状态、自主工作）；DeepSeek Harness（插件宿主，"承载其他插件"）。
- 消费方：DeepSeekBot（首个应用）、IM 适配器、Live2D 渲染器（独立、后置）。

## 2. 实体模型

| 实体                     | 定义                                                                                | 关键关系                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PersonaBot**           | 一等实体：persona、profile（name/tag/description）、跨 session 记忆、状态、Bindings | 可并发多个 Session；同一时刻一个 Orchestrator Session（ADR-0016/0024）                                                                                         |
| **Session**              | DSH 执行单元：一次工作/对话，有独立进度与 cwd                                       | 属于一个 PersonaBot；**工作 = Session**（ADR-0017）                                                                                                            |
| **Workspace**            | 单个主机目录，与 DSH workspace 1:1                                                  | Session 的 cwd；可多个，UI 可分组（ADR-0018）                                                                                                                  |
| **Agent**                | DSH 的会话内执行体                                                                  | 每 Session 一个；**不指 PersonaBot**                                                                                                                           |
| **Orchestrator Session** | 每 PersonaBot 一个：拥有 Bot Inbox，决定回复/派发/新开 Session                      | 长期存续、按 Bot Inbox 批次唤醒；id 稳定（ADR-0024/0025）                                                                                                      |
| **Channel**              | 平台内会话空间；类型 `dm`（BOT ↔ 人）/ `group chat`（多成员，口语 chatroom）        | 历史本地 append-only；可由 Bridge 接入外部来源（ADR-0026/0030）                                                                                                |
| **Binding**              | PersonaBot 到参与表面的连接：Channel / Chat / sidebar/renderer                      | 可有多个；不再按 binding 把消息路由到固定 Session（ADR-0026）                                                                                                  |
| **Bridge**               | 配置关系：外部来源 ↔ Channel 或 Bot Inbox                                           | 入站投递 + 出站回复路由；回显按外部 id 去重（ADR-0026 增补）                                                                                                   |
| **Bot Inbox**            | PersonaBot 级待处理事件投影（跨 Channel，非队列）                                   | 准入按 Channel membership 策略（muted/mentions/all，默认 all）（ADR-0025）                                                                                     |
| **Human Inbox**          | Dashboard 上聚合所有 Bot Inbox 的待人工视图                                         | 只显示需要人类动作的事件                                                                                                                                       |
| **Channel section**      | bot-mode sidebar 中用户自建的可折叠 Channel 分组                                    | 陈列存 Host `botharness_roster` 域（成员/名称/顺序 + pins），排序偏好在 `ui-bot-mode` settings，折叠状态在浏览器本地；不随 SoulSnapshot 导出（§2.1、ADR-0034） |
| **Memory**               | 文件优先的持久知识（§4）                                                            | 用户可配目录，跨一切作用域                                                                                                                                     |

目录约定：

- `$DSH_HOME/botharness/bots/<slug>/bot.json`：机器元数据（slug、displayName、tag、description、avatar、模型/preset、workspaces、bindings、`capabilities.tools.allow`）。
- `PERSONA.md` / `MEMORY.md` / 主题文件随**用户配置的记忆目录**走（默认在 `bots/<slug>/memory/`）。

### 2.1 持久化地图（ADR-0034）

一类状态一个家；主机（Host）与浏览器各管各的，客户端不碰主机文件与 `ctx.storage`。存储域是**可选能力**（`ctx.inject(['storageDomain'], cb)` 或 `ctx.get`），没有域后端时核心插件照常加载。

| 类别                                                  | 存放                                                                                     | 权威 / 说明                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bot 身份 / 记忆 / persona                             | `$DSH_HOME/botharness/bots/<slug>/`（用户所有，可 git、可打包）                          | 文件优先（§4、ADR-0002）；M6/M7 以整目录为快照/发布单元                                                                                                                                                                                                                                                                                                                                                      |
| Channel 元数据 + 消息                                 | `…/channels/<id>/{channel.json, messages.ndjson}`                                        | append-only 日志是权威（ADR-0030 不变）                                                                                                                                                                                                                                                                                                                                                                      |
| 名册陈列（section 成员/名称/顺序、pins）              | DSH storage 域 **`botharness_roster`**（json 后端，`version 1`、`layout: single`）✅ #66 | global 槽 `{ pins, sectionOrder, topOrder? }` + `sections` 表（key = **主机生成**的 section id）`{ name, channelIds }`；客户端经 `botharness/*` 桥方法读写（写后重拉 `rosterGet`，无乐观状态）；无 storageDomain 的 profile 读写都回 `storage-unavailable`，客户端首屏即渲染只读态、后端可用后重载恢复                                                                                                       |
| 排序偏好（全局 `sortMode` + per-section `sortModes`） | DSH settings 命名空间 **`ui-bot-mode`**（`settings.yaml`，per-profile、跨浏览器）✅ #68  | 客户端经 `ctx.settingsScope.bind({ namespace: 'ui-bot-mode' })` 读写（全局 `set`、per-section `mutate` 路径操作），刷新走转发的 `settings/document-updated`；sidebar `...` 菜单与 General 设置行同一份 store（非 loopback 页面写入仅进程内，DSH 既有行为）；per-section 排序行为 ✅ #55（section 内拖拽重排、首次拖拽冻结并切 manual、恢复自动回 inherit），手动顺序经 `channelAssign` 定位写 Host 域 ✅ #66 |
| 折叠状态（`collapsed`）                               | 浏览器 localStorage                                                                      | 只影响本浏览器的展示（sort 之外的视图状态）                                                                                                                                                                                                                                                                                                                                                                  |
| 派生 / 分析（未读、消息计数、搜索/筛选、dashboard）   | 未来 SQLite 索引（ADR-0005 可选索引）                                                    | NDJSON 日志仍是权威，索引可重建；`dsh-storage-sqlite` 当前未安装                                                                                                                                                                                                                                                                                                                                             |
| 实时推送                                              | v1.1：`botharness` 命名空间的 `mode: 'stream'` remote 方法                               | 先 roster 后 channel 消息，IM 式推送；`domain/changed` 仅进程内、**不可**转发到客户端                                                                                                                                                                                                                                                                                                                        |

- 桥规则：主机拥有或消费的一切经 `botharness` typert remote 命名空间暴露（细粒度动作型方法与 `ui-workspace` 对齐：`rosterGet`、`sectionCreate`、`sectionRename`、`sectionRemove`、`channelAssign`、`sectionReorder`、`topReorder`、`pinsSet`）；纯瞬态 UI 状态留在客户端。
- 迁移：旧 `roster.json` 的排序偏好（全局 `sortMode` + per-section `sortModes[sectionId]`）一次性迁入 `ui-bot-mode` settings ✅ #68，随后从本地记录中清理排序字段、写失败保留源数据；陈列（section 成员/名称/顺序、pins）进 `botharness_roster` 的迁移 ✅ #66：空域 + 有旧键才执行，section 按旧数组顺序经 `sectionCreate`（Host 生成 id）建入、成员经 `channelAssign` 按序归属、`sectionReorder`/`pinsSet` 落顺序与置顶，`sortModes` 键从旧 section id 重映射到 Host id，旧记录备份到 `botharness/roster.json.backup` 后仅留 `collapsed`；有域不覆盖、重跑 no-op，任一写入失败保留本地源数据。

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

- **入口与 Bot Inbox**：所有来源事件（Channel / DM / Bridge / 其他 Session / 系统，将来 webhook）进入 PersonaBot 的 Bot Inbox——派生投影而非队列；投递 ≠ 已处理，忽略是合法结果。准入由 **Channel membership** 策略决定（`muted` / `mentions` / `all`，默认 `all`）；事件再分触发：immediate（@我、DM、blocked/审批、其他 Session 直接消息）立即唤醒；digest（普通未读，默认 30 秒或 5 条合并为有界摘要）；silent（只记录）。可过滤维度：`type ∈ {user, bot, bridged}` × `channel` × `unread`。触发策略为 Host 强制的 durable 配置，Settings UI 可改；Orchestrator 只决定每批怎么处理（ADR-0025）。
- **Orchestrator Session（主会话）**：每 PersonaBot 同一时刻一个，长期存续但不持续跑 turn——按 Bot Inbox 批次唤醒；决定回复、派发给已有工作 Session、或新开 Session；上下文交给 DSH `compaction-basic`，Session id 保持稳定（ADR-0024）。它默认独占 Channel 工具（"一张嘴"）。
- **工作 Session**：独立 root Session，可位于不同 Workspace（`ensureSession(sessionId, cwd)`），可并行多个；每个 Session 的 Agent 可再派生 DSH subagent 做会话内子任务，但 subagent 不构成 PersonaBot 级身份（ADR-0024）。
- **Channel 与 Bridge**：Channel（`dm` / `group chat`）历史为每 Channel append-only NDJSON（ADR-0030）；Bridge 可把外部来源投递到 Channel 或直接进 Bot Inbox，出站回复默认免审批并按外部 thread 路由；发送者本人不入自己的 Bot Inbox，平台回显按外部 id 去重（ADR-0026 增补）；用户自配 Bridge 可能再次带回 BOT 自己的历史消息——不阻止、不校验，来源（Bridge / 外部 thread / 外部作者）记录在消息上供 BOT 识别。
- **Agent 消息工具**：`inbox_list` / `channel_read` / `channel_history` / `channel_send`；默认仅 Orchestrator Session 可见，经 `capabilities.tools.allow` 控制（ADR-0029）。
- **Session 间消息**：同一 PersonaBot 内可直接互发（Host 总线，`plugin` + relay 注入；请求-回复带超时与 interrupt），Orchestrator 留 audit 副本；跨 PersonaBot 暂经 Orchestrator（后置）。投递是 hint，不承诺 exactly-once。
- **状态感知**：Orchestrator 默认 pull（`sessionQuery` 读状态/最近输出，零打扰）；工作 Session 在里程碑、阻塞、需要决策时 push（immediate）。Memory 只放长期事实。
- **决策呈现**：waiting 徽标 + DSH Ask Question / Ask Permission；需要人类介入时也可向来源 Chat 发消息（去重靠 `message_id`）。
- **审批分级**：只读 + 记忆/家内写入自由；经 Bridge 的聊天出站默认免审批；其他外部副作用（外部 API、家外写）置 `waiting`，等有人对话时确认（DSH approval 需要 open turn）。
- **自主性**：事件驱动（无 scheduler/心跳）；「主动」= 跨来源、跨 Workspace、自主选择 Session。PoC 仍只做委派制（ADR-0025）。
- **工具面**：per-PersonaBot `capabilities.tools.allow`；激活时 `ctx.tools.restrict` 裁剪；未知名字先过滤并告警；核心 Memory 工具强制并集；UI 写路径后置。
- **模型选择**：全局默认 + per-PersonaBot 覆盖（本地解析）；模型与凭据**不随 SoulSnapshot 发布**，导入方用自己的模型（ADR-0027）。
- **Bot 模式 UI**：sidebar = 置顶 BOT 网格（始终手动）＋一个混合顶层序列（可折叠 Channel section 与未归属的松散 Channel 可交错）；未分组是 membership 状态，不再有固定底部 bucket/header。点击 BOT 打开 DM 聊天；Session 在右侧面板（只读列表 + 切换，含「主会话」）；Workspace 不在 sidebar 呈现。入口在「新会话」下方（ADR-0029/0031）。
- **sidebar 操作（ADR-0031）**：头部 = `Bots` 标签 + 右侧 **search → `...`（排序菜单）→ `+`（创建菜单：创建 BOT（#41 前禁用）/ 创建 Channel / 创建 Channel section）**；section 头 `+` 在区内建 Channel，`...` = 排序方式 → 重命名 → 删除。移动 = 原生 HTML5 DnD＋右键「移动到」；Channel 行、section 头/体、section 边界间隙都是真实 drop target：投到 section 归属该 section，投到边界间隙则保持未分组并写入该顶层位置。预测线绝对定位、不占布局，源行留在原位以 40% opacity 淡出。陈列（含混合 `topOrder`）存 Host `botharness_roster`，经八个细粒度桥方法读写（新增 `topReorder`）；排序偏好在 `ui-bot-mode`，折叠状态在浏览器本地。
- **排序模式（ADR-0031）**：每个 section 三态 `updated` / `manual` / `inherit`；全局默认在头部 `...` 菜单设置。首次手动拖拽或拖入 section 切 `manual` 并冻结当前顺序，源 section 模式不变，「恢复自动」回 `inherit`。松散 Channel 的顶层位置是显式陈列，在所有排序模式下保持不动；section 内发送消息仍按新 `updatedAt` 即时重排。section 头为 Discord 式 24px muted→solid、无 hover 背景、右侧 `IconChevronDownOutline14`；Channel 行 32px，区块间距 12px。
- **头像与图标（ADR-0032）**：默认头像 = 由 slug 确定性生成的静态 blobatar（本轮只用字符串生成器）；DM Channel 行显示 Bot 头像，群 Channel 行用字形；DSH 字形缺口以 vendored Lucide（ISC）首方组件补齐（hash / 群聊先行），随包附 `THIRD_PARTY_NOTICES.md`；自定义头像与动效/表情留 v1.1。

名册域的 global 槽现为 `{ pins, sectionOrder, topOrder? }`；`topOrder` 混排 section block 与松散 Channel，缺省表示 pre-flat 域并由客户端一次性迁移。绝对顶层位置通过 `topReorder` 写入，Host 在 assign/create/remove/reorder 时维持“section 成员不能同时有 loose entry”的单一归属不变量（ADR-0034）。

- **实时同步（v1.1，ADR-0034）**：`botharness` 命名空间加 `mode: 'stream'` remote 方法（Host AsyncIterable、客户端 `connection.rpc.open`），先推 roster 变更、后推 channel 消息，IM 式；`domain/changed` 是进程内事件且不可转发（api-remotes 白名单静态），客户端不得依赖；现有 unary 方法面不变。
- **排序偏好设置行（#68，ADR-0034）✅**：Settings → General 加一行 `settings.general.item`（与对话显示/忙碌发送/主题同模式），暴露与 sidebar `...` 菜单相同的 `ui-bot-mode` 排序偏好——一个 policy store、两个入口（`id=bot-mode-sort`、`order=30`；General 槽位在真实 dev loop 中已渲染，未退到 `settings.plugin.item` fallback）；该设置行**不迁移任何既有 sidebar UI**，只是新增入口。
- **创建与 onboarding**：首次无 BOT 时显示创建按钮 → 按需创建 Builder（普通 BOT，可删）；之后从「+」菜单选择 Builder 对话或表单向导；`bot_create` 由工具白名单控制（ADR-0029）。
- **落地节奏**：M3 = bot-mode IA + chat UI 外壳 + 本地消息存储（第一个切片）；Bot Inbox / Orchestrator / Channel 工具 / Bridge / 跨 Session 总线在 M4 后排期（v1.1，#30）；Channel 的 Lark 桥接随 M5。
- **已知约束**：DSH web profile 对"从未打开过的程序化 agent"起 turn 有开放问题（Discussion #6617）；工位会话存活是 M3/M4 的验证项。
- **Task 不存在**（ADR-0017）。

## 6. 插件层与包

- 交付形态：SDK 包 + bundle（`cordis.patch.yml`），不 fork DSH。
- 包（monorepo，包边界先行；第二个消费方出现再拆仓）：

| 包                   | 内容                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@botharness/core`   | host 域服务：registry、memory、state/events、channel store、bot inbox、orchestrator、session 总线、workspaces |
| `@botharness/client` | React 客户端：bot-mode IA（名册/DM 聊天/Channel section/右侧 session 面板/创建入口）（DSH client bundle）     |
| `@botharness/im`     | Bridge 适配器（后置；首个为 Feishu/Lark，复用 dsh-im）                                                        |
| `deepseekbot`        | bundle + 应用：组装以上并发布为可用插件                                                                       |

- 扩展面：其他 Host 插件可读 registry、订阅状态事件、注册 renderer；不提供路由与回复位置的覆盖（沿用 ADR-0011，路由类需求走上游）。
- 客户端事实：DSH 客户端组件是 React，且浏览器半侧是**独立 Cordis 应用**——不能 `inject` host 服务；客户端经**客户端桥（读模型 RPC）**读写 PersonaBot（ADR-0023，规格 `docs/client-bridge.md`）。shell 只共享 `react`/`react-dom` 等基线，第三方依赖必须打进 lazily-loaded bundle（blobatar 走这条）。
- 插件配置走 DSH 规范通道：导出 `Config` + `apply(ctx, config)`，`enabled` 是组合层开关；settings 卡片推迟到 M3+ 以 `installSection` + 动态注入回归（ADR-0022）。
- 客户端设计系统：in-harness UI 使用 DSH design tokens（`--dsw-*`）与基线 `@deepseek-ai/dsh-client-ui-primitives`，随宿主浅/深主题；COSS 仅用于 docs/landing（ADR-0028）。图标优先用基线字形，缺口以 vendored Lucide 字形（ISC，首方组件 + `THIRD_PARTY_NOTICES.md`）补齐，仍不引入组件库（ADR-0032）。

## 7. 里程碑

| #    | 交付                                                                                                          | 状态             |
| ---- | ------------------------------------------------------------------------------------------------------------- | ---------------- |
| M1   | **BotHarness 骨架**：core 包、PersonaBot registry、bot home（`bot.json` + 记忆目录）、状态事件、设置/存储     | 已完成（PR #13） |
| M2   | **记忆 MVP**：布局 + front-matter + 目录树注入 + `memory_*` 工具 + 原子写                                     | 已完成（#9）     |
| M3   | **Bot 模式 IA 与聊天外壳**：sidebar 列表/Section、DM 聊天（本地消息）、右侧 session 面板、入口与 Builder 创建 | 进行中（#10）    |
| M3.5 | **安装验证门**：本地跑起 DSH、官方 CLI 安装 bundle、插件加载与 UI 冒烟（M3 → M4 之间）                        | 待开始（#24）    |
| M4   | **演示闭环**：文件研究助手（workspace 绑定、执行、汇报、waiting/审批）                                        | 待开始（#11）    |
| M5   | **IM 适配器**：dsh-im 绑定、Lark 国际版验证、客户跟进场景                                                     | 待开始（#12）    |
| —    | **v1.1（post-PoC）**：Bot Inbox、Orchestrator、Channel 工具、Bridge、跨 Session 总线（#30）                   | 规划中           |
| M6   | **SoulSnapshot**：导出（档位/过滤/脱敏/快照）+ 导入（审阅闸门/新副本）+ commit message 规则                   | 待开始（#17）    |
| M7   | **Soul registry / Marketplace**：BetterAuth、R2、PlanetScale、公开上架与下载；插件一键分享随后                | 待开始（#18）    |
| —    | Live2D：独立 effort，后续单独 grill/wayfinder                                                                 | 暂缓             |

## 8. 风险与开放问题

| 风险                                       | 缓解                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| #6617：web profile 冷 agent 起不了 turn    | 工位会话 + 存活 owner agent；M3/M4 实测                                                                   |
| DSH 预览期破坏性变更                       | pin 版本；薄插件边界；契约测试                                                                            |
| dsh-im 无 session→bot seam                 | 自持 registry；IM 绑定只在适配器读基座存储（ADR-0011 后果）                                               |
| 记忆污染 / 私事外泄                        | 工具写 + `sources` + 导出时选择分享边界（ADR-0012/0021）                                                  |
| 自主动作越权                               | 审批分级（§5）；`waiting` 状态可见                                                                        |
| 多根目录需求                               | 多个 Workspace + UI 分组；需要时再走多根文件工具（ADR-0018）                                              |
| 默认公开的恶意/钓鱼 Bot                    | 上传自动闸门（密钥扫描硬拒绝、类型白名单、大小、解压炸弹）；举报 → 下架 → 封号                            |
| 平台成本与依赖（Cloudflare / PlanetScale） | 公开免费 + 私有/超额付费；schema 预留 `plan`/`quota`（ADR-0019）                                          |
| 快照触及他人内容与许可                     | `license` + `share_policy` + `provenance.upstream`（ADR-0020）；再导出必须保留原字段                      |
| Orchestrator 中枢成本与单点                | 批次唤醒 + 可忽略语义 + DSH compaction；消耗随 Inbox 量而非聊天量增长（ADR-0025）                         |
| 自建跨 Session 总线的可靠性                | durable 投影 + MessageId 去重 + 超时/interrupt；relay 失败返回结构化错误（ADR-0024）                      |
| 消息回灌 / 重复投递                        | 发送者排除 + 外部 id 去重 + 本地/回显合并（ADR-0026 增补）                                                |
| 本地消息增长与保留                         | append-only NDJSON + 保留策略开放项；SQLite 仅索引（ADR-0030）                                            |
| 陈列数据只在 Host / 单浏览器               | 陈列经 `botharness_roster` 跨浏览器共享；折叠状态本浏览器有效；迁移保留备份（ADR-0034）                   |
| 非 loopback 页面 settings 写入仅进程内     | DSH 既有行为（scope `unavailable`/memory 模式）；客户端按快照 status 降级，不假装已持久化（ADR-0034/#68） |

**开放项**：工位会话的 wake 实测；Live2D 信号面（模型/工具/响应 → 动作）；跨 PersonaBot 通信（经 Orchestrator）的 API 形状；跨 Session 请求-回复的超时/取消语义；消息保留/GC 策略；Bot Inbox 触发策略的 Settings UI 表达（默认 `all`）；Channel ↔ Lark 群/thread 映射（M5）；user 级共享记忆（跨 PersonaBot，Grok Bot 形态）是否引入；派生索引（未读/计数/搜索）何时启用 SQLite（ADR-0005/0034）。
