# DeepSeekBot — 产品需求文档（PRD）

| 项 | 内容 |
|---|---|
| 版本 | v0.2（PoC） |
| 日期 | 2026-09-17 |
| 状态 | Draft |
| 仓库 | `~/project/DeepSeekBot` |
| 形态 | DeepSeek Harness（DSH）插件 |
| 上游依赖 | DSH `0.1.0-rc.6+`（开发者预览，**必须 pin 版本**） |
| 许可 | MIT（待定） |
| v0.2 变更 | 明确飞书长连接为出站、**无需公网入口**；新增「插件内配置 UI」为 P0；Cloudflare Tunnel / Tailscale 降级为可选远程访问场景 |

---

## 1. 背景

### 1.1 上游现状

- DeepSeek Harness（DSH）是 DeepSeek 官方开源的 agent harness，MIT，`everything is a plugin`（Cordis 内核：模型、工具、技能、会话、沙箱、存储、循环、调度、UI 全部可替换）。目前为开发者预览，存在破坏性变更风险。
- DSH 社区已有飞书接入先例：
  - **dsh-im**（1.4k★，MIT）：一个设置入口接 9 个 IM 渠道，**每渠道支持多个机器人**，各机器人工作区/模型/会话绑定独立；飞书走长连接 + 流式卡片 + 超时补发 + 主动投递；配置 UI 已内嵌在 DSH 设置页（「设置 → IM机器人」）。
  - **dsh-lark-bridge**（MIT，很新）：群 → Project（cwd/模型/权限/卡片预设）映射，topic/thread → 独立 Session，卡片按钮审批工具调用，App Secret 写 owner-only 凭据文件，长连接无需公网。
- DSH 生态已有 24 个 context/memory 插件（如 dsh-meow-memory、dsh-memory-evolve、dsh-mnemon），但**默认作用域多为 project/session**，缺少「按 Bot 作用域、跨群跨会话」的记忆实现。
- Docker 已提供面向 agent 的 microVM 沙箱（Docker Sandboxes / `sbx`），支持 clone-mode 工作区隔离与凭据代理（密钥不进沙箱）。

### 1.2 要复刻的体验

类似 Grok Bot / Claude in Slack：

1. 一个 Bot 可以加入多个 Lark 群，Bot 知道自己在哪一个群；
2. 群根消息被 @ 时，Agent 能决定「直接在根消息下回复」还是「创建 thread 并在 thread 内回复」；
3. 一个 Bot 拥有自己的记忆，独立维护，**跨不同 thread / session 存在**；
4. 记忆的读写作为插件介入 DSH；
5. Agent 能执行代码（配合沙箱方案）；
6. 部署在 VPS 为主；也希望支持「用户本地 DSH + 插件」快速把自己的设备变成对他人可用的工作站；
7. **配置与管理的 UI/UX 由插件自带**：一般用户不改配置文件、不需要公网入口，直接在 DSH 界面内完成飞书接入、Bot 管理、记忆管理等基本设置。

---

## 2. 目标与非目标

### 2.1 PoC 目标（按优先级）

| 优先级 | 目标 | 一句话验收 |
|---|---|---|
| **P0-1** | **Lark 多 Bot 接入** | 一个 DSH Host 同时接入 ≥2 个飞书 Bot，各自独立工作区/模型/会话，互不串扰 |
| **P0-2** | **DSH 插件化 + 快速配置** | `dsh plugin add` 完成安装；支持已有 App ID/Secret 或扫码创建应用；密钥进 DSH 凭据存储 |
| **P0-3** | **插件内配置 UI** | 在 DSH 设置页完成接入向导、多 Bot 管理、记忆与基础设置；**全程无需公网入口** |
| **P1-1** | **群感知与会话路由** | Bot 被拉入多个群，各群会话隔离；Bot 知道当前 `chat_id` / 群名 / 是否 thread |
| **P1-2** | **Bot 级记忆** | 在群 A 告诉 Bot 的事实，在群 B（同 Bot）能回忆起来；记忆以插件形式读写，存储在 Bot 作用域 |
| **P1-3** | **回复位置决策** | Agent 可调用工具选择 root reply 或创建 thread（默认策略可配置，工具可覆盖） |
| **P2-1** | 代码执行沙箱 | 接入 Docker Sandboxes（`sbx`，clone mode + 网络白名单 + 凭据代理）或等价方案 |
| **P2-2** | 远程访问 / 多设备（stretch，纯可选） | 长连接场景**无需公网**；仅在「远程访问 DSH Web UI」或「跨设备工作站组网」时，提供 Cloudflare Tunnel / Tailscale how-to |

### 2.2 非目标（PoC 明确不做）

- ❌ 通用多 IM 渠道（先只做飞书；微信/Slack/Telegram 等不做）
- ❌ 独立 Web 管理后台 / 站点；（接入、Bot、记忆管理的界面以 **DSH 插件设置页**形式提供）
- ❌ SaaS 多租户、计费、配额系统
- ❌ 插件市场发布、ClawHub 类分发
- ❌ celld / Cloudflare 部署（作为 Phase 2 备选记录，不在 PoC 引入）
- ❌ 发布到 npm 正式包（PoC 可先用 Git / 本地路径安装）

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

### US-4 Bot 级记忆（P1）

> 作为高频使用者，我希望同一个 Bot 在不同群、不同 thread 里都能记住我的偏好与历史结论。

**验收标准**
- AC-4.1 记忆以 `botId` 为作用域键；跨群、跨 thread、跨 session 可读。
- AC-4.2 记忆读写通过 DSH 插件能力（工具 + turn 注入），不改 DSH 核心。
- AC-4.3 群 A 写入的事实，在群 B 提问时可被检索并注入回答。
- AC-4.4 记忆可查看 / 删除（至少提供命令或工具）。
- AC-4.5 记忆不写入 Lark 卡片、日志等外部可见面；敏感字段脱敏。

### US-5 快速配置与设置 UI（P0）

> 作为个人用户，我希望装好插件后在 DSH 的界面里扫码建应用、绑定凭据、看到连接状态，不需要改配置文件，也不需要公网/域名。

**验收标准**
- AC-5.1 安装：`dsh plugin --profile <p> add -w <pkg>`（或等价的 Git 安装）。
- AC-5.2 接入向导支持两种路径：① 扫码一键创建应用；② 已有 `appId` + `appSecret` 手动绑定。
- AC-5.3 App Secret 写入 DSH owner-only 凭据存储，**不落 Profile 配置、不落仓库**；UI 不回显密文。
- AC-5.4 手动创建应用时在界面内给出**最小权限清单**与事件订阅步骤（含一键复制/导入 JSON）。
- AC-5.5 **诊断页**：权限检查、长连接状态、最近事件时间、一键补全权限（`/repair` 类似）。
- AC-5.6 全程**无需公网入口**：本地 `dsh web`（127.0.0.1）即可完成全部配置。

### US-6 配置 UI（Bot / 记忆管理）（P0/P1）

> 作为管理员，我希望在界面里管理 Bot 与记忆，而不是编辑配置文件或连数据库。

**验收标准**
- AC-6.1 入口形态：DSH 设置页一级菜单（参考 dsh-im「设置 → IM机器人」）。
- AC-6.2 Bot 管理：新增 / 删除 / 别名 / 启停、工作区、模型、思考强度、Agent Preset、访问策略（用户与群白名单）。
- AC-6.3 记忆管理：按 Bot 查看 / 搜索 / 删除 / 导出；显示条目来源（群/会话）与更新时间。
- AC-6.4 状态展示：每 Bot 连接状态、所在群列表、最近活动时间。
- AC-6.5 UI 操作不需要重启 Host（或明确提示需要重启）。

### US-7 分布式工作站（P2，stretch，可选）

> 作为使用者，我希望把本地 DSH（或朋友的设备）接进来当工作站，共享算力与工具使用。

**验收标准**
- AC-7.1 本地 DSH 装插件后通过**出站长连接**接入飞书（无需公网入站）。
- AC-7.2 仅在需要远程访问 DSH Web UI 或多设备组网时，提供 Cloudflare Tunnel / Tailscale 的 how-to（含安全边界与鉴权要求）。
- AC-7.3 工作站身份可识别（谁在承载本次执行），任务可路由（可选实现）。

---

## 4. 功能需求

| 编号 | 需求 | 优先级 | 说明 |
|---|---|---|---|
| FR-1 | Bot 注册表 | P0 | 单 Host 多 Bot；每 Bot：`appId`、`secretRef`、workspace、模型、preset、访问策略 |
| FR-2 | 事件接入 | P0 | 飞书长连接（WebSocket）接收 `im.message.receive_v1`、卡片回调；事件去重、按 chat 串行 |
| FR-3 | 会话路由 | P0 | `botId + chatId(+threadId) → DSH Session`；`groupSessionScope` 可配 |
| FR-4 | 回复与卡片 | P0 | 流式卡片（思考/工具进度/答案）；卡片即原消息引用回复；超时补发 |
| FR-5 | 记忆 | P1 | SQLite；key = `botId`；turn 开始注入、turn 结束落库；提供读/写/查/删工具 |
| FR-6 | 回复位置工具 | P1 | `feishu_reply_scope(mode)`；默认策略 + 模型覆盖 |
| FR-7 | Setup / 诊断 | P0 | 扫码建应用 / 手动凭据；写 Profile + 凭据；权限检查与一键补全 |
| FR-8 | 密钥治理 | P0 | 凭据存储 / 环境变量引用；日志与卡片脱敏；仓库零密钥 |
| FR-9 | 沙箱执行 | P2 | `sbx`（microVM、clone mode、网络白名单、凭据代理）或 DSH sandbox 插件 |
| FR-10 | 远程访问（可选） | P2 | 长连接无需公网；仅为远程访问 DSH Web UI / 跨设备组网提供 Tunnel/Tailscale how-to |
| FR-11 | 插件配置 UI | P0 | DSH 设置页：接入向导、Bot 管理、记忆管理、诊断；不依赖公网 |

---

## 5. 架构

### 5.1 逻辑架构（PoC）

```text
飞书开放平台
   │  WebSocket 长连接（出站，无需公网入站）
   ▼
DSH Host（单进程，可跑在 VPS 或本地设备）
 ├── deepseekbot 插件
 │    ├─ SettingsUI          # DSH 设置页：接入向导 / Bot 管理 / 记忆管理 / 诊断
 │    ├─ BotRegistry         # N 个 Bot：appId / secretRef / 工作区 / 模型
 │    ├─ ChannelAdapter      # 事件、卡片、文件、卡回执
 │    ├─ SessionRouter       # botId+chatId(+threadId) → Session
 │    ├─ MemoryStore         # SQLite，botId 作用域，跨群跨会话
 │    └─ Tools               # reply_scope / memory_* / deliver_file
 └── DSH Agent（模型 + 工具 + 会话日志）
      └── （P2）sandbox 执行：sbx / microsandbox / dsh-ssh
```

### 5.2 关键设计决策

| 决策 | 结论 | 理由 |
|---|---|---|
| 复用还是自研 | **自研独立插件，吸收 dsh-im / dsh-lark-bridge 验证过的模式**；若工期紧，评估直接 fork dsh-im 加薄层 | 两者均 MIT；多 Bot + Bot 记忆 + 回复位置工具在我们的组合里需要统一设计 |
| 单进程多 Bot | 采用 | 与 dsh-im 一致，运维简单；Bot 间靠注册表隔离 |
| 记忆作用域 | `botId` | 跨群/线程/会话是核心诉求；避免绑定 project/session |
| 记忆实现 | 首选复用社区 memory 插件（如 dsh-meow-memory）并加 Bot 作用域适配层；不行则自建薄层 | 降低从零开发成本 |
| 状态持久化 | SQLite（会话/记忆）；备份可选 Litestream → R2 | 简单、成本低；celld 留作 Phase 2（多机/DO 模型时再上） |
| 配置 UI | **DSH 插件设置页（in-harness），不做独立站点**；本地 `dsh web` 即可用 | 用户免改配置、免公网、免部署；dsh-im 已验证该形态 |
| 传输 | 长连接优先（**出站，无需公网入口**）；webhook 仅在国际版 Lark / 自建域名等长连接受限时作为备选（此时才需要公网 → Tunnel） | 本地/内网/VPS 都能即插即用 |
| 版本策略 | pin DSH 与飞书 SDK 版本 | DSH 预览期存在破坏性变更 |

### 5.3 部署形态

- **形态 A（主）**：VPS 上运行 DSH + 插件，多 Bot 长连接，配置 UI 通过本机 `dsh web` 访问。
- **形态 B（PoC 轻量）**：个人设备运行 DSH + 插件，出站长连接接入飞书；无需公网、无需域名证书。
- **形态 C（P2，可选）**：远程访问 / 多工作站。**核心场景不需要公网入口**；仅在 ① 在外网访问 DSH Web UI、② 多设备工作站组网 时，才需要 Tailscale（推荐，私网）或 Cloudflare Tunnel（公网入口，须配合 Access 鉴权，默认关闭）。

### 5.4 长连接的边界条件（务必知悉）

| 条件 | 说明 |
|---|---|
| 需要出网 | 运行插件的机器需能访问飞书开放平台（`open.feishu.cn` / `open.larksuite.com`）；无需任何入站端口 |
| 中国版飞书 | 长连接（WebSocket）支持完整，推荐默认方案 |
| 国际版 Lark / 自建域名 | 社区经验是长连接支持有限，通常改用 webhook（**这时才需要公网**，即 Tunnel 的适用场景） |
| 应用配置 | 无论长连接还是 webhook，建应用/发布/审核仍在飞书开放平台（可在 UI 向导中跳转/扫码完成） |
| 卡片回调 | 可走同一长连接，无需 webhook 服务器 |

---

## 6. 非功能需求

| 类别 | 要求 |
|---|---|
| 安全 | 最小飞书权限（见附录 A）；工具调用可审批；沙箱隔离执行；密钥仅存在于凭据存储 |
| 密钥 | 仓库与 Profile 零明文；支持 `${ENV}` 引用；日志/卡片/错误信息脱敏；UI 不回显密文 |
| 版本 | pin DSH、飞书 SDK、Node 版本；升级需过诊断自检 |
| 可观测 | 结构化日志；沿用 DSH append-only session log；关键事件（收到/入会/回复/错误）可追踪 |
| 性能 | 单 Host 支撑 ≥5 Bot × ≥20 群；@ 到「已受理」< 2s，首字回复（不含模型）< 5s |
| 兼容 | Node 22+；Linux 优先，macOS 次之 |
| 可靠性 | 长连接自动重连；事件去重；超时任务结果补发（参考 dsh-im） |
| 易用性 | 零配置文件操作路径：安装 → UI 向导 → 可用；界面文案中英双语（PoC 先中文） |

---

## 7. 里程碑

| 里程碑 | 交付 | 状态 |
|---|---|---|
| **M0** | 仓库初始化 + PRD + README | ✅ 已完成 |
| M1 | 单 Bot 群聊 @ 闭环：长连接、流式卡片、会话路由 + **最小设置页**（接入向导 + 连接状态） | 待开始 |
| M2 | 多 Bot：注册表、独立工作区/模型/会话 + **Bot 管理页** | 待开始 |
| M3 | Bot 级记忆：SQLite + turn 注入 + 工具 + **记忆管理页** | 待开始 |
| M4 | 回复位置工具（root / thread 决策） | 待开始 |
| M5 | 沙箱执行接入（`sbx`） | 待开始 |
| M6 | （可选）远程访问 / 多设备：Tunnel / Tailscale how-to（长连接本身无需公网） | 待开始 |

---

## 8. 竞品与先例参考

| 项目 | 可借鉴 | 差异 |
|---|---|---|
| [dsh-im](https://github.com/xmanrui/dsh-im) | 多机器人一插件、流式卡片、超时补发、主动投递、凭据存储、`/repair` 补权限、**设置页 UI 形态** | 无 Bot 级记忆、无回复位置决策 |
| [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge) | 群→Project、thread→Session、卡片审批、安全模型、`doctor` | 单 Bot、无跨会话记忆 |
| OpenClaw（飞书插件） | 多群、动态 agent、Skills | 非 DSH 体系 |
| OpenHands（Slack 集成） | @ 触发、线程=会话、仓库映射 | 无飞书、非 DSH |

---

## 9. 风险与开放问题

### 9.1 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| DSH 预览期破坏性变更 | 插件失效 | pin 版本；关注 release；M1 起写兼容性测试 |
| 飞书权限/发布审核延迟 | 无法联通 | UI 向导内置权限清单与自检；一键补全指引 |
| 多 Bot 触发飞书限流 | 消息失败 | 每 Bot 独立凭据与配额；发送重试 + 结果补发 |
| 长连接稳定性 | 掉线漏消息 | 自动重连、事件去重、补发机制 |
| 记忆作用域与社区插件不匹配 | 返工 | M3 先调研复用可行性，再决定自建 |
| 沙箱隔离不足 | 主机风险 | 默认 clone mode；网络白名单；凭据代理 |
| 远程访问误暴露 | 凭据/会话泄露 | 默认不暴露；远程访问必须配 Tailscale / CF Access；文档默认关闭 |

### 9.2 开放问题

1. Bot 记忆：复用社区插件（适配 Bot 作用域）还是自建薄层？（M3 决策）
2. SQLite 驱动：`node:sqlite`（内置、实验）vs `better-sqlite3`（原生模块，插件安装体验差）？（M1 决策）
3. 形态 C（远程访问/多设备）是否值得做——长连接已无需公网，只剩「远程访问 UI」与「多工作站」两个真实诉求？（M6 决策）
4. PoC 安装方式：Git 直装 vs npm 私有包 vs 本地目录？（M1 决策）
5. 与 dsh-im 的关系：是竞争、互补，还是共建上游？
6. 设置页 UI 的实现方式：跟随 DSH 官方插件 UI 契约（feature plugin / native pages）还是先做简单表单页？（M1 决策）

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
- dsh-im：https://github.com/xmanrui/dsh-im
- dsh-lark-bridge：https://github.com/imetn/dsh-lark-bridge
- Docker Sandboxes：https://docs.docker.com/ai/sandboxes/
- celld（Phase 2 备选）：https://github.com/denoland/celld
