# DeepSeekBot — 产品需求文档（PRD）

| 项 | 内容 |
|---|---|
| 版本 | v0.3（PoC） |
| 日期 | 2026-09-17 |
| 状态 | Draft |
| 仓库 | `~/project/DeepSeekBot` |
| 形态 | DeepSeek Harness（DSH）插件 |
| 上游依赖 | DSH `0.1.0-rc.6+`（开发者预览，**必须 pin 版本**）；先例 [dsh-im](https://github.com/xmanrui/dsh-im)（MIT） |
| 许可 | MIT（待定） |
| v0.3 变更 | ① 明确**不用 celld**，仅 SQLite；② Bot 记忆**自研**；③ SQLite 实现**参考 Codex**（openai/codex `codex-rs/state`）的长期最佳实践；④ **不做多工作站**，但必须有 UI 管理插件与 Bot；⑤ PoC **基于已有插件（dsh-im）扩展**，后期以 PR 回上游共建 |
| v0.2 变更 | 飞书长连接为出站、无需公网入口；新增「插件内配置 UI」为 P0 |

---

## 1. 背景

### 1.1 上游现状

- DeepSeek Harness（DSH）是 DeepSeek 官方开源的 agent harness，MIT，`everything is a plugin`（Cordis 内核：模型、工具、技能、会话、沙箱、存储、循环、调度、UI 全部可替换）。目前为开发者预览，存在破坏性变更风险。
- DSH 社区已有飞书接入先例（**PoC 的直接基础**）：
  - **dsh-im**（1.4k★，MIT，665 commits，官方认可）：一个设置入口接 9 个 IM 渠道，**每渠道支持多个机器人**，各机器人工作区/模型/会话独立；飞书走长连接 + 流式卡片 + 超时补发 + 主动投递；配置 UI 内嵌 DSH 设置页。**PoC 在此之上扩展。**
  - **dsh-lark-bridge**（MIT，很新）：群 → Project、topic/thread → 独立 Session、卡片按钮审批、凭据文件、长连接无需公网。作为「群/线程路由」的设计参考。
- DSH 生态的 context/memory 插件（dsh-meow-memory、dsh-memory-evolve 等）默认作用域多为 project/session，**不满足 Bot 级跨会话记忆**；因此本项目**自研记忆**，仅借鉴其注入/检索思路。
- Docker 已提供面向 agent 的 microVM 沙箱（Docker Sandboxes / `sbx`），支持 clone-mode 工作区隔离与凭据代理（密钥不进沙箱）。
- **openai/codex** 的 `codex-rs/state` 提供了一套经生产验证的本地 SQLite 状态方案（多库分离、版本化迁移、可重建索引、损坏隔离与恢复），作为本项目 SQLite 实现的参考。

### 1.2 要复刻的体验

类似 Grok Bot / Claude in Slack：

1. 一个 Bot 可以加入多个 Lark 群，Bot 知道自己在哪一个群；
2. 群根消息被 @ 时，Agent 能决定「直接在根消息下回复」还是「创建 thread 并在 thread 内回复」；
3. 一个 Bot 拥有自己的记忆，独立维护，**跨不同 thread / session 存在**；
4. 记忆的读写作为插件介入 DSH；
5. Agent 能执行代码（配合沙箱方案）；
6. 部署以 VPS 为主、也支持个人设备本地 DSH；**单 Host 形态**，本阶段不做多工作站/远程组网；
7. **配置与管理的 UI/UX 由插件自带**：一般用户不改配置文件、不需要公网入口，直接在 DSH 界面内完成飞书接入、插件设置、Bot 管理与记忆管理。

---

## 2. 目标与非目标

### 2.1 PoC 目标（按优先级）

| 优先级 | 目标 | 一句话验收 |
|---|---|---|
| **P0-1** | **Lark 多 Bot 接入** | 一个 DSH Host 同时接入 ≥2 个飞书 Bot，各自独立工作区/模型/会话，互不串扰（基于 dsh-im 多机器人能力） |
| **P0-2** | **插件内配置 UI** | 在 DSH 设置页完成接入向导、**插件设置、多 Bot 管理**、记忆基础设置；**全程无需公网入口** |
| **P0-3** | **DSH 插件化 + 快速配置** | 安装即用；支持已有 App ID/Secret 或扫码创建应用；密钥进 DSH 凭据存储 |
| **P1-1** | **群感知与会话路由** | Bot 被拉入多个群，各群会话隔离；Bot 知道当前 `chat_id` / 群名 / 是否 thread |
| **P1-2** | **Bot 级记忆（自研）** | 在群 A 告诉 Bot 的事实，在群 B（同 Bot）能回忆起来；记忆以插件形式读写，存储在 Bot 作用域 |
| **P1-3** | **回复位置决策** | Agent 可调用工具选择 root reply 或创建 thread（默认策略可配置，工具可覆盖） |
| **P2-1** | 代码执行沙箱 | 接入 Docker Sandboxes（`sbx`，clone mode + 网络白名单 + 凭据代理）或等价方案 |
| **P2-2** | **上游共建（后续）** | 新增能力以薄层/可上游化方式实现；PoC 稳定后向 dsh-im 提交 PR |

### 2.2 非目标（PoC 明确不做）

- ❌ 通用多 IM 渠道（先只做飞书；微信/Slack/Telegram 等不做）
- ❌ 独立 Web 管理后台 / 站点（UI 以 **DSH 插件设置页**形式提供）
- ❌ **celld / Cloudflare / Postgres 等额外存储与部署形态**：本阶段只使用 **SQLite**
- ❌ **多工作站 / 远程组网（Cloudflare Tunnel / Tailscale）**：暂缓；长连接本身无需公网，记录为附录备选
- ❌ SaaS 多租户、计费、配额系统
- ❌ 插件市场发布、ClawHub 类分发

---

## 3. 用户故事与验收标准

### US-1 多 Bot 接入（P0）

> 作为团队管理员，我希望在一个 DSH Host 上运行多个飞书 Bot（如「研发助手」「运营助手」），每个 Bot 有自己的工作区、模型、Agent Preset 与会话，互不影响。

**验收标准**
- AC-1.1 同一 Host 启动 ≥2 个 Bot，分别使用不同 `appId`，各自长连接在线。
- AC-1.2 消息按 Bot 隔离：发给 Bot A 的消息不会进入 Bot B 的会话。
- AC-1.3 每个 Bot 可独立配置：workspace、模型、思考强度、Agent Preset。
- AC-1.4 某一 Bot 断线重连不影响其他 Bot。

### US-2 群感知与会话路由（P1）

> 作为群成员，我在群里 @Bot 时，Bot 知道是哪个群、是不是线程，并在正确的上下文里回答。

**验收标准**
- AC-2.1 Bot 可被拉入 ≥3 个群；每个群拥有独立会话上下文。
- AC-2.2 群内新建 thread 自动成为独立 Session（默认 `groupSessionScope: thread`）。
- AC-2.3 Agent 上下文中包含 `chat_id`、群名、`thread_id`（如有）、发送者 open_id。
- AC-2.4 未 @Bot 的群消息默认忽略（可配置白名单放开）。

### US-3 回复位置决策（P1）

> 作为用户，我 @Bot 问一个长任务，希望 Bot 自己判断：简单问题直接回复，复杂任务开 thread 免得刷屏。

**验收标准**
- AC-3.1 默认策略可配置（root / thread）。
- AC-3.2 提供 DSH 工具（如 `feishu_reply_scope`），模型可调用它决定本次回复落到 root 还是新 thread。
- AC-3.3 无论落到哪里，后续对话都在同一上下文续接。
- AC-3.4 卡片工具调用审计日志记录决策依据（可选）。

### US-4 Bot 级记忆（P1，自研）

> 作为高频使用者，我希望同一个 Bot 在不同群、不同 thread 里都能记住我的偏好与历史结论。

**验收标准**
- AC-4.1 记忆以 `botId` 为作用域键；跨群、跨 thread、跨 session 可读。
- AC-4.2 记忆读写通过 DSH 插件能力（工具 + turn 注入），不改 DSH 核心。
- AC-4.3 群 A 写入的事实，在群 B 提问时可被检索并注入回答。
- AC-4.4 记忆可查看 / 搜索 / 删除 / 导出（UI + 工具）。
- AC-4.5 记忆不写入 Lark 卡片、日志等外部可见面；敏感字段脱敏。
- AC-4.6 记忆数据落盘于每 Bot 独立 SQLite 文件，可单独备份与销毁。

### US-5 快速配置与设置 UI（P0）

> 作为个人用户，我希望装好插件后在 DSH 的界面里扫码建应用、绑定凭据、看到连接状态，不需要改配置文件，也不需要公网/域名。

**验收标准**
- AC-5.1 安装：`dsh plugin --profile <p> add -w <pkg>`（或等价的 Git 安装）。
- AC-5.2 接入向导支持两种路径：① 扫码一键创建应用；② 已有 `appId` + `appSecret` 手动绑定。
- AC-5.3 App Secret 写入 DSH owner-only 凭据存储，**不落 Profile 配置、不落仓库**；UI 不回显密文。
- AC-5.4 手动创建应用时在界面内给出**最小权限清单**与事件订阅步骤（含一键复制/导入 JSON）。
- AC-5.5 **诊断页**：权限检查、长连接状态、最近事件时间、一键补全权限（`/repair` 类似）。
- AC-5.6 全程**无需公网入口**：本地 `dsh web`（127.0.0.1）即可完成全部配置。

### US-6 插件与 Bot 管理 UI（P0）

> 作为管理员，我希望在界面里管理插件设置、Bot 与记忆，而不是编辑配置文件或连数据库。

**验收标准**
- AC-6.1 入口形态：DSH 设置页一级菜单（参考 dsh-im「设置 → IM机器人」）。
- AC-6.2 插件设置：启用/停用、默认模型与思考强度、默认工作区、日志级别、数据目录等。
- AC-6.3 Bot 管理：新增 / 删除 / 别名 / 启停、工作区、模型、思考强度、Agent Preset、访问策略（用户与群白名单）。
- AC-6.4 记忆管理：按 Bot 查看 / 搜索 / 删除 / 导出；显示条目来源（群/会话）与更新时间。
- AC-6.5 状态展示：每 Bot 连接状态、所在群列表、最近活动时间。
- AC-6.6 UI 操作不需要重启 Host（或明确提示需要重启）。

### US-7 上游共建（P2）

> 作为贡献者，我希望 PoC 的实现方式便于向上游（dsh-im）提交 PR，而不是形成不可合并的分叉。

**验收标准**
- AC-7.1 新增能力（记忆、回复位置工具、UI 增强）以独立模块/薄层实现，尽量少改动上游代码。
- AC-7.2 与上游保持 rebase 能力（记录基线与补丁清单）。
- AC-7.3 完成一次上游 PR（至少一个独立能力）。

---

## 4. 功能需求

| 编号 | 需求 | 优先级 | 说明 |
|---|---|---|---|
| FR-1 | Bot 注册表 | P0 | 单 Host 多 Bot；每 Bot：`appId`、`secretRef`、workspace、模型、preset、访问策略 |
| FR-2 | 事件接入 | P0 | 飞书长连接（WebSocket）接收 `im.message.receive_v1`、卡片回调；事件去重、按 chat 串行 |
| FR-3 | 会话路由 | P0 | `botId + chatId(+threadId) → DSH Session`；`groupSessionScope` 可配 |
| FR-4 | 回复与卡片 | P0 | 流式卡片（思考/工具进度/答案）；卡片即原消息引用回复；超时补发 |
| FR-5 | 记忆（自研） | P1 | 每 Bot 独立 SQLite；`botId` 作用域；turn 注入 + turn 落库；读/写/查/删/导出工具 |
| FR-6 | 回复位置工具 | P1 | `feishu_reply_scope(mode)`；默认策略 + 模型覆盖 |
| FR-7 | Setup / 诊断 | P0 | 扫码建应用 / 手动凭据；写 Profile + 凭据；权限检查与一键补全 |
| FR-8 | 密钥治理 | P0 | 凭据存储 / 环境变量引用；日志与卡片脱敏；仓库零密钥 |
| FR-9 | 沙箱执行 | P2 | `sbx`（microVM、clone mode、网络白名单、凭据代理）或 DSH sandbox 插件 |
| FR-10 | 配置与管理 UI | P0 | DSH 设置页：插件设置、接入向导、Bot 管理、记忆管理、诊断；不依赖公网 |
| FR-11 | 上游可合并性 | P2 | 独立模块/薄层；可 rebase；PR 回 dsh-im |

---

## 5. 架构

### 5.1 逻辑架构（PoC）

```text
飞书开放平台
   │  WebSocket 长连接（出站，无需公网入站）
   ▼
DSH Host（单进程，VPS 或本地设备）
 ├── deepseekbot 插件（在 dsh-im 之上扩展）
 │    ├─ SettingsUI          # DSH 设置页：插件设置 / 接入向导 / Bot 管理 / 记忆管理 / 诊断
 │    ├─ BotRegistry         # N 个 Bot：appId / secretRef / 工作区 / 模型
 │    ├─ ChannelAdapter      # 事件、卡片、文件、卡回执（复用 dsh-im 渠道层）
 │    ├─ SessionRouter       # botId+chatId(+threadId) → Session
 │    ├─ MemoryStore         # 自研：每 Bot 独立 SQLite（memory / index 分离）
 │    └─ Tools               # reply_scope / memory_* / deliver_file
 └── DSH Agent（模型 + 工具 + 会话日志）
      └── （P2）sandbox 执行：sbx / microsandbox / dsh-ssh
```

### 5.2 关键设计决策

| 决策 | 结论 | 理由 |
|---|---|---|
| 复用还是自研 | **PoC 基于 dsh-im 扩展**（渠道层/多机器人/设置页 UI 直接复用）；新增能力做成独立模块，目标可上游 PR | 用户决策；避免重写已成熟部分；降低维护面 |
| Bot 记忆 | **自研**（不依赖社区 memory 插件） | 社区插件作用域是 project/session，Bot 级跨会话需要独立设计 |
| 存储 | **SQLite only**；明确不引入 celld / Cloudflare / Postgres | 技术成熟度优先；单机单写者场景 SQLite 足够，运维最简单 |
| 持久化实现 | **参考 openai/codex `codex-rs/state` 的最佳实践**（见 5.5） | 经生产验证：多库分离、版本化迁移、可重建索引、损坏隔离与恢复 |
| 配置 UI | **DSH 插件设置页（in-harness）**，不做独立站点；本地 `dsh web` 即可用 | 用户免改配置、免公网、免部署；dsh-im 已验证该形态 |
| 传输 | 长连接优先（**出站，无需公网入口**）；webhook 仅在国际版 Lark / 自建域名等长连接受限时作为备选 | 本地/内网/VPS 都能即插即用 |
| 多工作站 | **暂缓**（不进 PoC） | 单 Host 已满足当前需求；避免分布式复杂度 |
| 版本策略 | pin DSH、dsh-im、飞书 SDK 版本 | DSH 预览期存在破坏性变更 |

### 5.3 部署形态

- **形态 A（主）**：VPS 运行 DSH + 插件，多 Bot 长连接，配置 UI 通过本机 `dsh web` 访问。
- **形态 B（PoC 轻量）**：个人设备运行 DSH + 插件，出站长连接接入飞书；无需公网、无需域名证书。
- ~~形态 C：多工作站 / 远程组网~~ → **暂缓**（见附录 D 备选记录）。

### 5.4 长连接的边界条件（务必知悉）

| 条件 | 说明 |
|---|---|
| 需要出网 | 运行插件的机器需能访问飞书开放平台（`open.feishu.cn` / `open.larksuite.com`）；无需任何入站端口 |
| 中国版飞书 | 长连接（WebSocket）支持完整，推荐默认方案 |
| 国际版 Lark / 自建域名 | 社区经验是长连接支持有限，通常改用 webhook（**这时才需要公网**） |
| 应用配置 | 建应用/发布/审核仍在飞书开放平台（UI 向导中扫码/跳转完成） |
| 卡片回调 | 可走同一长连接，无需 webhook 服务器 |

### 5.5 SQLite 设计规范（参考 Codex `codex-rs/state`）

> 参考：`openai/codex` 的 `codex-rs/state`（`runtime.rs` / `migrations.rs` / `sqlite.rs` / `lib.rs`）与社区整理的状态库结构说明。以下是本项目 MemoryStore 必须遵循的长期实践。

| # | 规范 | Codex 的做法 / 依据 |
|---|---|---|
| S1 | **按用途分库，各自独立迁移器** | Codex 分 `state` / `logs` / `goals` / `memory` 四个运行时库与四套 migrator；一个库损坏不拖垮其他库 |
| S2 | **追加日志是事实源，索引可重建** | Codex 以 JSONL rollout 为唯一事实源，SQLite 只是元数据索引；`reconcile_rollout` 扫描文件系统重建索引。本项目：记忆先写 append-only 事实记录，FTS5 索引可随时重建 |
| S3 | **独立索引库 + 完整性自检 + 损坏隔离** | 启动 `PRAGMA integrity_check`；损坏库移入 `db-backups/` 并自动重建 |
| S4 | **版本化迁移 + 校验和** | sqlx `Migrator` + checksum；`ignore_missing: true` 允许「旧二进制 + 新库」共存（不可修改已应用的迁移） |
| S5 | **Pragma 基线** | `journal_mode=WAL`、`synchronous=NORMAL`、`busy_timeout`、`foreign_keys=ON` |
| S6 | **网络文件系统禁用 WAL** | Codex 已知 NFS + WAL 损坏问题（issue #30957）；检测到网络 FS 时降级 rollback journal |
| S7 | **单写者 + 批量写入** | 单 Host 进程写；高频写入（抽取/日志）走有界队列 + 批量提交，暴露丢包/延迟指标 |
| S8 | **备份用 SQL 接口，不 `cp` 活动库** | `VACUUM INTO` / `.backup`；迁移后 `wal_checkpoint(FULL)`；WAL/SHM 需随库一起移动 |
| S9 | **时间有序 ID** | Codex 使用 UUIDv7；本项目主键同样使用 UUIDv7（按时间排序、可分页） |
| S10 | **数据目录可配置** | Codex 支持 `CODEX_SQLITE_HOME`；本项目支持 `DEEPSEEKBOT_HOME` 覆盖默认数据目录 |
| S11 | **SQLite 版本下限** | Codex 断言 SQLite ≥ 3.51.3（含 WAL-reset 修复）；本项目固定捆绑版本并断言 |

**库文件布局（建议）**

```text
<data-dir>/
├── registry.sqlite            # 插件级：Bot 注册表 / 群绑定 / 配置（S1、S4）
├── bots/
│   └── <botId>/
│       ├── memory.sqlite      # 记忆事实记录（append-only，S2）
│       └── memory-index.sqlite# FTS5 检索索引（可重建，S2/S3）
└── db-backups/                # 损坏库隔离与备份（S3）
```

**记忆数据流（S2 落地）**

```text
turn 开始 → 检索 index（FTS5）→ 命中记忆注入上下文
turn 结束 → 追加事实记录（memory.sqlite）→ 异步更新 FTS5 索引
（索引损坏/丢失 → 从事实记录重建，不丢数据）
```

**不建议**：直接 `cp` 活动数据库、在 NFS 上用 WAL、复用社区插件库表结构、把记忆索引当唯一数据源。

---

## 6. 非功能需求

| 类别 | 要求 |
|---|---|
| 安全 | 最小飞书权限（见附录 A）；工具调用可审批；沙箱隔离执行；密钥仅存在于凭据存储 |
| 密钥 | 仓库与 Profile 零明文；支持 `${ENV}` 引用；日志/卡片/错误信息脱敏；UI 不回显密文 |
| 版本 | pin DSH、dsh-im、飞书 SDK、Node 版本；升级需过诊断自检 |
| 可观测 | 结构化日志；沿用 DSH append-only session log；SQLite 写入/重建/损坏事件可追踪（参考 S7） |
| 性能 | 单 Host 支撑 ≥5 Bot × ≥20 群；@ 到「已受理」< 2s，首字回复（不含模型）< 5s |
| 兼容 | Node 22+；Linux 优先，macOS 次之 |
| 可靠性 | 长连接自动重连；事件去重；超时任务结果补发（复用 dsh-im 机制）；SQLite 完整性自检与恢复（S3） |
| 易用性 | 零配置文件操作路径：安装 → UI 向导 → 可用；界面文案中文优先 |

---

## 7. 里程碑

| 里程碑 | 交付 | 状态 |
|---|---|---|
| **M0** | 仓库初始化 + PRD + README | ✅ 已完成 |
| M1 | 基于 dsh-im 跑通：多 Bot + 插件/Bot 管理 UI（插件设置、Bot 增删改、状态） | 待开始 |
| M2 | 群感知与回复位置：群/线程路由明确化 + `feishu_reply_scope` 工具 | 待开始 |
| M3 | Bot 级记忆 MVP：SQLite（按 5.5 规范）+ turn 注入 + 记忆管理页 | 待开始 |
| M4 | 记忆增强：FTS5 检索、导出/删除、索引重建与完整性自检 | 待开始 |
| M5 | 沙箱执行接入（`sbx`） | 待开始 |
| M6 | 上游共建：整理补丁并向 dsh-im 提交 PR | 待开始 |

---

## 8. 竞品与先例参考

| 项目 | 可借鉴 | 差异 |
|---|---|---|
| [dsh-im](https://github.com/xmanrui/dsh-im) | **PoC 基座**：多机器人、流式卡片、超时补发、凭据存储、`/repair`、设置页 UI 形态 | 无 Bot 级记忆、无回复位置决策 |
| [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge) | 群→Project、thread→Session、卡片审批、安全模型、`doctor` | 单 Bot、无跨会话记忆 |
| [openai/codex](https://github.com/openai/codex)（`codex-rs/state`） | **SQLite 长期实践范本**（见 5.5） | 非 IM / 非记忆场景 |
| OpenClaw（飞书插件） | 多群、动态 agent、Skills | 非 DSH 体系 |
| OpenHands（Slack 集成） | @ 触发、线程=会话、仓库映射 | 无飞书、非 DSH |

---

## 9. 风险与开放问题

### 9.1 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| DSH 预览期破坏性变更 | 插件失效 | pin 版本；关注 release；兼容性测试 |
| **上游（dsh-im）演进导致分叉漂移** | 合并冲突、维护成本 | 薄层 + 独立模块设计（AC-7.1）；记录基线；尽快上游 PR |
| 飞书权限/发布审核延迟 | 无法联通 | UI 向导内置权限清单与自检；一键补全指引 |
| 多 Bot 触发飞书限流 | 消息失败 | 每 Bot 独立凭据与配额；发送重试 + 结果补发 |
| 长连接稳定性 | 掉线漏消息 | 自动重连、事件去重、补发机制 |
| SQLite 损坏（故障/文件系统） | 记忆不可用 | 遵守 5.5（S3/S6/S8）：完整性自检、损坏隔离、可重建索引、正规备份 |
| 记忆错误/污染 | 回答质量下降 | 记忆可查/可删/可导出（AC-6.4）；来源标注；后续可加审核 |

### 9.2 开放问题

1. SQLite 驱动：`node:sqlite`（内置）vs `better-sqlite3`（原生模块，插件安装体验差）？（M3 决策）
2. 记忆检索：FTS5 全文即可，还是需要向量检索（sqlite-vec）？（M4 决策）
3. dsh-im 扩展方式：Fork + 薄补丁 vs 独立插件通过 Cordis 服务集成？（M1 决策）
4. 上游 PR 边界：哪些能力希望被 dsh-im 接受（回复位置工具？记忆库？），哪些保留在本仓库？（M6 决策）
5. 设置页 UI 实现：跟随 DSH 官方插件 UI 契约（feature plugin / native pages）还是沿用 dsh-im 现有页面扩展？（M1 决策）

---

## 附录 A：飞书权限清单（最小集）

| 类型 | 值 | 用途 |
|---|---|---|
| 权限 | `im:message.p2p_msg:readonly` | 接收私聊消息 |
| 权限 | `im:message.group_at_msg:readonly` | 接收群里 @Bot 的消息 |
| 权限 | `im:message:send_as_bot` | 以 Bot 身份发消息 |
| 权限 | `im:resource` | 上传/读取图片与文件 |
| 权限 | `im:message:readonly` | 下载消息中的附件（可选） |
| 事件 | `im.message.receive_v1` | 接收消息 |
| 回调 | `card.action.trigger` | 卡片交互（审批 / 按钮） |
| 可选 | `im:message.group_at_msg.include_bot:readonly` | 接收其他机器人 @ 当前机器人 |

> 具体以飞书开放平台最新文档为准；setup 流程中提供一键导入 JSON。

## 附录 B：命令与界面速览（规划中）

```bash
# 安装（规划）
dsh plugin --profile <profile> add -w deepseekbot

# 配置（规划；主要走 UI，CLI 为无头环境兜底）
dsh --profile <profile>            # 启动；浏览器打开 dsh web 进入「设置 → DeepSeekBot」
deepseekbot setup --app-id cli_xxx --app-secret-stdin   # 可选：命令行接入
deepseekbot doctor                                      # 可选：命令行自检
```

## 附录 C：参考资料

- DeepSeek Harness：https://github.com/deepseek-ai/deepseek-harness ｜ https://deepseek.com/harness/
- 插件目录：https://github.com/kejixiaoliang/awesome-dsh-plugins
- **dsh-im（PoC 基座）**：https://github.com/xmanrui/dsh-im
- dsh-lark-bridge：https://github.com/imetn/dsh-lark-bridge
- **Codex SQLite 状态层**：https://github.com/openai/codex（`codex-rs/state/src/lib.rs`、`migrations.rs`、`runtime.rs`）
- SQLite WAL 限制：https://www.sqlite.org/wal.html
- Docker Sandboxes：https://docs.docker.com/ai/sandboxes/

## 附录 D：暂缓项记录（不进 PoC）

| 项 | 原因 | 触发条件（何时重新评估） |
|---|---|---|
| celld / Cloudflare / Postgres | 技术成熟度与运维复杂度 | 需要多机水平扩展或 CF 编程模型时 |
| 多工作站 / 远程组网（Tunnel / Tailscale） | 单 Host 已满足；长连接无需公网 | 需要跨设备共享算力或远程访问 DSH Web UI 时 |
| 向量检索 / 记忆自动演化 | PoC 先做可靠的基础记忆 | FTS5 检索效果不足时 |
