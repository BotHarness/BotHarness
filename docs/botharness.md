# BotHarness 规格（PoC）

| 项       | 内容                                                     |
| -------- | -------------------------------------------------------- |
| 版本     | v1.1                                                     |
| 日期     | 2026-09-18                                               |
| 状态     | Draft                                                    |
| 形态     | DSH 插件层：SDK 包 + bundle（**不 fork DSH**，ADR-0015） |
| 首个应用 | **DeepSeekBot**（见 `PRD.md`）                           |
| 决策记录 | `docs/adr/`（0019–0020 为本版新增）                      |

## 1. 定位与缺口

- 现有 LLM harness（含 DSH）以 session 为单位：跨 session 至多是一份"云记忆"，**没有带人格、持久身份的 Bot 实体**。
- BotHarness 在 DSH 之上补这一层：**PersonaBot**（persona + 跨 session 记忆 + 状态 + 工作），以 SDK + bundle 交付，内核不动。
- 灵感：Grok Bot（每个 Bot 有自己的电脑、记忆、状态、自主工作）；DeepSeek Harness（插件宿主，"承载其他插件"）。
- 消费方：DeepSeekBot（首个应用）、IM 适配器、Live2D 渲染器（独立、后置）。

## 2. 实体模型

| 实体                | 定义                                               | 关键关系                                            |
| ------------------- | -------------------------------------------------- | --------------------------------------------------- |
| **PersonaBot**      | 一等实体：persona、跨 session 记忆、状态、频道绑定 | 可并发多个 Session；由 registry 拥有（ADR-0016）    |
| **Session**         | DSH 执行单元：一次工作/对话，有独立进度与 cwd      | 属于一个 PersonaBot；**工作 = Session**（ADR-0017） |
| **Workspace**       | 单个主机目录，与 DSH workspace 1:1                 | Session 的 cwd；可多个，UI 可分组（ADR-0018）       |
| **Agent**           | DSH 的会话内执行体                                 | 每 Session 一个；**不指 PersonaBot**                |
| **Channel binding** | 对外表面的连接：IM / sidebar / renderer            | 一个 PersonaBot 可有多个                            |
| **Memory**          | 文件优先的持久知识（§4）                           | 用户可配目录，跨一切作用域                          |

目录约定：

- `$DSH_HOME/botharness/bots/<slug>/bot.json`：机器元数据（slug、displayName、avatar、模型/preset、workspaces 列表、频道绑定）。
- `PERSONA.md` / `MEMORY.md` / 主题文件随**用户配置的记忆目录**走（默认在 `bots/<slug>/memory/`）。

## 3. 状态模型

- **Session 级**（真实进度）：`thinking` / `working` / `waiting` / `blocked` / `done`（无活动即 `idle`）。
- **PersonaBot 级**（聚合）：precedence `blocked > waiting > working > thinking > idle`；`done` 是 Session 事件，聚合态随即回 `idle`。
- 语义：`waiting` = 等审批/等人；`blocked` = 失败或缺条件。
- 事件：状态变化 + activity（工具/步骤摘要）以 PersonaBot id 发出，供 roster 与 renderer 订阅。Live2D 后置，消费更原始的模型/工具/响应信号（见 §8 开放项）。

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

| #   | 规则                      | 说明                                                                                                                                                                                                                                               |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | 文件是唯一事实源          | 纯 Markdown + YAML front-matter：`summary`、`updated_at`、`sources`、`visibility`（默认 `shared`），选填 `tags`；缺失/非法时降级（首行摘要 + mtime），不阻塞（ADR-0012）                                                                           |
| M2  | 原子写                    | 写临时文件 + `rename` 原子替换；禁止原地截断；同一 PersonaBot 串行写；工具路径 jail 在记忆目录，拒绝越界                                                                                                                                           |
| M3  | 目录树进上下文 + 按需检索 | turn 注入目录树（front-matter 的 `summary` + `updated_at`）；上限 1000 个路径，超出折叠；细节用 `memory_search`（ripgrep）/ 读文件；注入按可见性过滤                                                                                               |
| M4  | 显式来源                  | 来源写入 front-matter `sources`（群 / 会话 / 日期 / 发送者），便于审计与回滚                                                                                                                                                                       |
| M5  | 人类可编辑                | UI 提供编辑器；冲突策略：mtime/hash 检测后**拒绝保存并展示差异**（不自动合并）                                                                                                                                                                     |
| M6  | 可备份/可回滚             | 目录可直接复制/打包；git：每 PersonaBot 一个 repo、单分支、覆盖记忆目录，每次 turn 一个 commit；**每次记忆写入必须带 `summary`（即 commit message，含来源；人改 source=human）**；附件在 repo 外随打包备份；未来 UI 管历史（clone + reset 到版本） |
| M7  | 防污染                    | 记忆写入可配置为「需确认」；可选定期人工 review（默认关）                                                                                                                                                                                          |
| M8  | 敏感信息                  | 凭据严禁写入记忆；发现疑似密钥时告警并脱敏（扫描规则）                                                                                                                                                                                             |
| M9  | 写入时机 = 工具写         | 仅由模型显式调用记忆工具落盘；无自动蒸馏、无后台批量改写（PoC）                                                                                                                                                                                    |
| M10 | 入站文件归属              | 归档到 Session 的 workspace（引用即提升为稳定路径）；记忆正文引用相对路径；TTL 与记忆解耦                                                                                                                                                          |
| M11 | 可见性                    | `shared` 默认；DM 来源默认 `private`（带 owner）；群 turn 的注入与搜索过滤 `private`，仅 owner 的 DM 可见（ADR-0013）                                                                                                                              |

## 5. 工作方式

- **委派**：从聊天（composer `@PersonaBot`）或 roster 发起；工作落在 Session。
- **执行**：PersonaBot 维护**存活工位会话**；委派时工位空闲则唤醒，忙则开子会话（DSH continuable subagent）。已知约束：DSH web profile 对"从未打开过的程序化 agent"起 turn 有开放问题（Discussion #6617），存活工位是 PoC 的验证项。
- **审批分级**：只读 + 记忆/家内写入自由；外部副作用（对外发消息、外部 API、家外写）置 `waiting`，等有人对话时确认（DSH approval 需要 open turn）。
- **自主性**：PoC 只做委派制（无自由运行）；预留一个 wake 钩子，无人值守需求出现时再接队列。
- **跨 PersonaBot 通信**：只留 seam（registry + 事件），PoC 不实现。
- **工具面**：默认共享宿主已装插件/工具，per-bot 允许/禁止清单。
- **Task 不存在**（ADR-0017）。

## 6. 插件层与包

- 交付形态：SDK 包 + bundle（`cordis.patch.yml`），不 fork DSH。
- 包（monorepo，包边界先行；第二个消费方出现再拆仓）：

| 包                   | 内容                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| `@botharness/core`   | host 域服务：registry、memory、state/events、delegation、workspaces        |
| `@botharness/client` | React 客户端：roster、PersonaBot 详情/新建、@委派入口（DSH client bundle） |
| `@botharness/im`     | IM 适配器（后置；首个为 Feishu/Lark，复用 dsh-im）                         |
| `deepseekbot`        | bundle + 应用：组装以上并发布为可用插件                                    |

- 扩展面：其他插件可读 registry、订阅状态事件、注册 renderer；不提供路由与回复位置的覆盖（沿用 ADR-0011，路由类需求走上游）。
- 客户端事实：DSH 客户端组件是 React；shell 只共享 `react`/`react-dom` 等，第三方依赖必须打进 bundle（blobatar 走这条）。

## 7. 里程碑

| #   | 交付                                                                                                      | 状态             |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------- |
| M1  | **BotHarness 骨架**：core 包、PersonaBot registry、bot home（`bot.json` + 记忆目录）、状态事件、设置/存储 | 已完成（PR #13） |
| M2  | **记忆 MVP**：布局 + front-matter + 目录树注入 + `memory_*` 工具 + 可见性过滤 + 原子写                    | 待开始（#9）     |
| M3  | **Roster 与委派**：client 包、`main` 面板（名册/详情/新建）、@委派、工位会话、六态展示                    | 待开始（#10）    |
| M4  | **演示闭环**：文件研究助手（workspace 绑定、执行、汇报、waiting/审批）                                    | 待开始（#11）    |
| M5  | **IM 适配器**：dsh-im 绑定、Lark 国际版验证、客户跟进场景                                                 | 待开始（#12）    |
| M6  | **SoulSnapshot**：导出（档位/过滤/脱敏/快照）+ 导入（审阅闸门/新副本）+ commit message 规则               | 待开始（#17）    |
| M7  | **Soul registry / Marketplace**：BetterAuth、R2、PlanetScale、公开上架与下载；插件一键分享随后            | 待开始（#18）    |
| —   | Live2D：独立 effort，后续单独 grill/wayfinder                                                             | 暂缓             |

## 8. 风险与开放问题

| 风险                                       | 缓解                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| #6617：web profile 冷 agent 起不了 turn    | 工位会话 + 存活 owner agent；M3/M4 实测                                              |
| DSH 预览期破坏性变更                       | pin 版本；薄插件边界；契约测试                                                       |
| dsh-im 无 session→bot seam                 | 自持 registry；IM 绑定只在适配器读基座存储（ADR-0011 后果）                          |
| 记忆污染 / 私事外泄                        | 工具写 + `sources` + `visibility`（ADR-0012/0013）                                   |
| 自主动作越权                               | 审批分级（§5）；`waiting` 状态可见                                                   |
| 多根目录需求                               | 多个 Workspace + UI 分组；需要时再走多根文件工具（ADR-0018）                         |
| 默认公开的恶意/钓鱼 Bot                    | 上传自动闸门（密钥扫描硬拒绝、类型白名单、大小、解压炸弹）；举报 → 下架 → 封号       |
| 平台成本与依赖（Cloudflare / PlanetScale） | 公开免费 + 私有/超额付费；schema 预留 `plan`/`quota`（ADR-0019）                     |
| 快照触及他人内容与许可                     | `license` + `share_policy` + `provenance.upstream`（ADR-0020）；再导出必须保留原字段 |

**开放项**：工位会话的 wake 实测；Live2D 信号面（模型/工具/响应 → 动作）；跨 PersonaBot 通信的 API 形状；记忆树注入的刷新时机。
