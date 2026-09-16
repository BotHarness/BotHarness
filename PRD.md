# DeepSeekBot — 产品需求文档（PRD）

| 项        | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 版本      | v0.9（PoC）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 日期      | 2026-09-17                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 状态      | Draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 仓库      | `~/project/DeepSeekBot`（GitHub: `Teamemos/DeepSeekBot`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 形态      | DeepSeek Harness（DSH）插件                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 上游依赖  | DSH（开发者预览，**必须 pin 版本**）；基座候选见 5.6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 许可      | MIT（待定）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| v0.9 变更 | ① 集成定稿：**独立 DSH 插件**、不改不 fork dsh-im（ADR-0011），组件归属见 5.1；② 记忆规格修订：引入 **front-matter**（反转 v0.6）、`PERSONA.md`（人属、Agent 禁写）、可见性 `shared/private`（private 归属写作者）、`MEMORY.md` 生成化、附件**引用即提升**、git 每 turn 一个 commit（仅 `memory/`）；③ 回复位置 PoC 走基座 thread-first 配置，`feishu_reply_scope` 工具延后 M6；④ M1 只验证 **Lark 国际版**（六条 gate）；⑤ p2p 一等、审批范围收敛、AC-5.6 增加 webhook 例外；⑥ sandbox 改为 **DSH 内建优先**、`sbx` 升级项（ADR-0012~0014） |
| v0.8 变更 | ① 添加 GitHub 远端 `Teamemos/DeepSeekBot`；② Issue 管理切换到 **GitHub Issues**（`gh` CLI；PR 不作 triage 入口）；③ 按 PRD 建立领域文档：根 `CONTEXT.md` + `docs/adr/`（10 篇，沉淀 §5.2 关键决策）                                                                                                                                                                                                                                                                                                                                          |
| v0.7 变更 | ① 回复位置默认策略 = **thread 优先**（可配置切 root）；② 上游共建**延后**：自研能力暂时保留在本仓库，PoC 稳定后再评估是否提交 PR；③ 安装 mattpocock/skills 技能包（37 个）并完成技能初始化（`AGENTS.md` + `docs/agents/*`，见附录 F）                                                                                                                                                                                                                                                                                                        |
| v0.6 变更 | ① 明确 **front-matter**（Markdown 头部 `---` 包裹的 YAML 元数据）PoC **不引入**；② 目录树注入规则定稿：**上限 1000 个路径**，超出时优先列文件夹、折叠文件过多的文件夹并标注「（n 个文件）」；③ 工程初始化：复用 GEO-SNS 工具链（pnpm + TypeScript 7 + oxlint + oxfmt）+ vitest + tsdown（见附录 E）                                                                                                                                                                                                                                          |
| v0.5 变更 | ① 记忆**写入时机 = 工具写**（模型显式调用记忆工具，PoC 不做自动蒸馏）；② turn 默认注入**记忆目录树**（清单 + 一句话摘要），正文按需检索；③ git 版本化确认方向（M4 引入，每次 Agent 修改一个 commit、带摘要与来源）；④ 明确**群内上传文件必须可被 Agent 读取/引用**（入站归档 + 路径注入）                                                                                                                                                                                                                                                    |
| v0.4 变更 | ① 记忆改为**文件优先**（每 Bot 一个 folder，`MEMORY.md` + 主题文件，直接读写/检索文件）；② SQLite 降级为**可选的小型索引/注册表**，不再承担记忆与凭据；③ 凭据走 **DSH credentials 服务**；④ 新增「**Bot 即人**」核心理念与**客户跟进**北极星场景；⑤ 补充基座候选评估（dsh-im / dsh-lark-link / dsh-feishu / dsh-lark-bridge / dsh-lark-bot）                                                                                                                                                                                                 |
| v0.3 变更 | 明确不用 celld（仅 SQLite）；记忆自研；SQLite 参考 Codex；不做多工作站；PoC 基于已有插件扩展、后期上游 PR                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| v0.2 变更 | 飞书长连接为出站、无需公网入口；插件内配置 UI 为 P0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

---

## 1. 背景

### 1.1 上游现状

- DeepSeek Harness（DSH）是 DeepSeek 官方开源的 agent harness，MIT，`everything is a plugin`（Cordis 内核）。开发者预览，存在破坏性变更风险。
- DSH 社区已有多个成熟的飞书桥接插件（调研见 5.6）：多机器人、长连接、流式卡片、审批卡片、扫码建应用、凭据进 DSH credentials 服务都已有实现。**桥接层不再是本项目要造的东西。**
- DSH 的记忆插件默认作用域多为 project/session，**缺少「Bot 级、跨群跨会话、人类可读可编辑」的记忆**——这是本项目的核心增量。
- Docker 已提供面向 agent 的 microVM 沙箱（Docker Sandboxes / `sbx`），用于执行隔离；DSH 亦自带内建 sandbox（文件隔离 + approval）。

### 1.2 要复刻的体验

类似 Grok Bot / Claude in Slack：

1. 一个 Bot 可以加入多个 Lark 群，Bot 知道自己在哪一个群；
2. 群根消息被 @ 时，Agent 能决定「直接在根消息下回复」还是「创建 thread 并在 thread 内回复」；
3. 一个 Bot 拥有自己的记忆，独立维护，**跨不同 thread / session 存在**；
4. 记忆的读写作为插件介入 DSH；
5. Agent 能执行代码（配合沙箱方案）；
6. 部署以 VPS 为主、也支持个人设备本地 DSH；**单 Host 形态**，不做多工作站/远程组网；
7. **配置与管理的 UI/UX 由插件自带**：不改配置文件、不需要公网入口，在 DSH 界面内完成飞书接入、插件设置、Bot 管理与记忆管理；
8. 群聊中上传的图片与文件，Agent 能读取、获取、引用（归档到 Bot 工作区，并把路径带入上下文）。

### 1.3 核心理念

1. **Bot 即人（Bot as a Person）**
   每个 Bot 是群里的一位"同事"：独立人格（人设/角色）、独立记忆、独立上下文。**Session / 线程只是它与人的交互通道，不是身份边界。** 传统「一个 Session 一个上下文」的模型不适用；Bot 的连续性是它的记忆文件，而不是某个会话的历史。
2. **记忆即文件（Memory as Files）**
   默认记忆形态是 **Markdown 文件**（含 YAML front-matter 元数据）：每个 Bot 一个独立记忆目录，含 `PERSONA.md`（人属人格）、生成的 `MEMORY.md`（索引）与按主题拆分的文件（如客户档案）。人类可直接阅读/编辑；Agent **通过记忆工具**增删改查（PoC 不做自动蒸馏）；turn 开始时默认注入**整个记忆目录树**（清单 + 一句话摘要），细节按需检索（grep/ripgrep）。M4 引入 git：每次 Agent 修改自动提交并带 commit 信息，可回溯。
3. **如无必要勿增实体**
   桥接、卡片、会话、多 Bot 注册、UI 壳层优先复用成熟插件（dsh-im）；本项目只自研真正缺失的三件事：**Bot 级记忆、回复位置策略、面向普通用户的管理 UI**。不 fork 基座。
4. **典型场景（北极星）**
   销售 / 客户跟进：团队在飞书里讨论某个客户，由一位 Bot 负责记住该客户的上下文（联系人、需求、承诺、进展、时间线）；下次跟进时，直接问这位 Bot。

---

## 2. 目标与非目标

### 2.1 PoC 目标（按优先级）

| 优先级   | 目标                      | 一句话验收                                                                                                |
| -------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| **P0-1** | **Lark 多 Bot 接入**      | 一个 DSH Host 同时接入 ≥2 个飞书/Lark Bot，各自独立人格/工作区/模型/记忆，互不串扰                        |
| **P0-2** | **插件内配置 UI**         | DSH 设置页完成接入向导、插件设置、**多 Bot 管理**、记忆管理；全程无需公网入口（webhook 例外见 AC-5.6）    |
| **P0-3** | **DSH 插件化 + 快速配置** | 安装即用；支持已有 App ID/Secret 或扫码创建应用；密钥进 DSH credentials 服务                              |
| **P1-1** | **群感知与会话路由**      | Bot 被拉入多个群，各群会话隔离；Bot 知道当前 `chat_id` / 群名 / 是否 thread（复用基座路由）               |
| **P1-2** | **Bot 级记忆（文件）**    | 在群 A 告诉 Bot 的事实，在群 B（同 Bot）能回忆起来；**工具写、目录树注入、按需检索、可见性过滤**          |
| **P1-3** | **回复位置决策**          | 默认 **thread 优先**（复用基座 `groupTopicReply` 配置）；模型级覆盖工具延后至 M6                          |
| **P2-1** | 代码执行沙箱              | **DSH 内建 sandbox 优先**（文件隔离 + approval）；Docker `sbx`（microVM + 网络白名单 + 凭据代理）为升级项 |
| **P2-2** | **上游共建（延后）**      | 新增能力以独立模块实现；**暂时保留在本仓库**，PoC 稳定后再评估是否向上游提交 PR                           |

### 2.2 非目标（PoC 明确不做）

- ❌ 通用多 IM 渠道（先只做飞书 / Lark）
- ❌ 独立 Web 管理后台 / 站点（UI 以 DSH 插件设置页形式提供）
- ❌ 自研桥接层 / 会话路由 / 多 Bot 注册（复用 dsh-im；不 fork、不 vendor）
- ❌ celld / Cloudflare / Postgres；**SQLite 只作为可选的小型索引/注册表**，不存记忆、不存凭据
- ❌ 多工作站 / 远程组网（Tunnel / Tailscale）——暂缓
- ❌ SaaS 多租户、计费、配额系统
- ❌ 向量检索 / 记忆自动蒸馏（PoC 先做「工具写 + 文件检索」的可靠记忆）
- ❌ 通用「每次工具调用都弹卡片审批」（只保留 DSH approval 与记忆写入确认开关，见 M7）
- ❌ per-群 / per-用户独立记忆库（单脑 + 可见性过滤，见 M11）
- ❌ Docker `sbx` 起步（先用 DSH 内建 sandbox；需要网络白名单时再升级）

---

## 3. 用户故事与验收标准

### US-1 多 Bot 接入（P0）

> 作为团队管理员，我希望在一个 DSH Host 上运行多个飞书 Bot（如「销售助手」「研发助手」），每个 Bot 有自己的**人格、工作区、模型、记忆**，互不影响。

**验收标准**

- AC-1.1 同一 Host 启动 ≥2 个 Bot，各自长连接在线。
- AC-1.2 消息按 Bot 隔离：发给 Bot A 的消息不会进入 Bot B 的上下文。
- AC-1.3 每个 Bot 可独立配置：人格（`PERSONA.md`，人属、Agent 禁写）、workspace、模型、Agent Preset；模型/工作区/Preset 由基座配置承载。
- AC-1.4 某一 Bot 断线重连不影响其他 Bot。

### US-2 群感知、会话路由与文件（P1）

> 作为群成员，我在群里 @Bot 时，Bot 知道是哪个群、是不是线程，并在正确的上下文里回答；我在群里发的文件，它也能用。

**验收标准**

- AC-2.1 Bot 可被拉入 ≥3 个群；各群会话隔离。
- AC-2.2 群内话题（thread）自动成为独立会话；默认 thread 优先由基座 `groupTopicReply` 提供。
- AC-2.3 Agent 上下文中包含 `chat_id`、群名、`thread_id`（如有）、发送者 open_id。
- AC-2.4 未 @Bot 的群消息默认忽略（策略可配）。
- AC-2.5 **群内上传的文件/图片可被 Agent 引用**：附件归档到 Bot 工作区，**被记忆引用时提升为稳定路径**（`<workspace>/attachments/`），消息上下文携带本地路径；文本文件可直接读取，图片仅在 image-capable 模型路由下可直接查看（DeepSeek 默认路由为 text-only）。
- AC-2.6 私聊（DM）与群同为一等场景：会话独立，记忆共享（披露受可见性约束，见 AC-4.7）。

### US-3 回复位置决策（P1）

> 作为用户，我 @Bot 问一个长任务，希望 Bot 自己判断：简单问题直接回复，复杂任务开 thread 免得刷屏。

**验收标准**

- AC-3.1 默认策略 = **thread 优先**（基座 per-bot 配置 `groupTopicReply`），可切到 root。
- AC-3.2 （**延后至 M6**）提供 DSH 工具（如 `feishu_reply_scope`），模型可决定本次回复落点；PoC 不做模型级覆盖。
- AC-3.3 无论落到哪里，后续对话都在同一上下文续接。
- AC-3.4 决策依据进入会话日志（可审计）。

### US-4 Bot 级记忆 —— 文件优先（P1，自研）

> 作为高频使用者，我希望同一个 Bot 在不同群、不同 thread 里都能记住我的偏好与历史结论；记忆是能直接打开看的文件，必要时我可以自己改。

**验收标准**

- AC-4.1 每个 Bot 的记忆位于其工作区 `<workspace>/memory/`（botId 为人类可读 slug）；核心文件：`PERSONA.md`（人属）、生成的 `MEMORY.md`、带 front-matter 的主题文件。
- AC-4.2 **写入时机 = 工具写**：模型显式调用记忆工具（`memory_read/write/edit/append/list/delete`、`memory_search`）落盘；PoC 不做自动蒸馏、不后台批量改写。
- AC-4.3 turn 开始时注入**记忆目录树**（取 front-matter 的 `summary` + `updated_at`）；细节用 `memory_search`（ripgrep）或读文件；**上限 1000 个路径**，超限折叠；注入按可见性过滤（AC-4.7）。
- AC-4.4 群 A 写入的事实，在群 B（同 Bot）可被检索并用于回答。
- AC-4.5 人类可直接编辑记忆文件（纯 Markdown + YAML front-matter）；front-matter 缺失/非法时**降级不报错**（首行摘要 + mtime），下次工具写入时修复。
- AC-4.6 记忆目录可整体导出 / 备份；**git 版本化（M4）**：每 Bot 一个 repo、只覆盖 `memory/`；每次 turn 的 Agent 修改合并为**一个 commit**（摘要 + 来源），人类编辑同样提交（source=human）；附件在 repo 外随打包备份。
- AC-4.7 **可见性**：条目 front-matter 带 `visibility`（`shared` 默认 / `private`）；`private` 归属写作者（owner），群 turn 的注入与搜索一律过滤，仅该 owner 的 DM 可见。

### US-5 快速配置与设置 UI（P0）

> 作为个人用户，我希望装好插件后在 DSH 界面里扫码建应用、绑定凭据、看到连接状态，不需要改配置文件，也不需要公网/域名。

**验收标准**

- AC-5.1 安装：`dsh plugin --profile <p> add -w <pkg>`（或等价安装）。
- AC-5.2 接入向导支持：① 扫码一键创建应用；② 已有 `appId` + `appSecret` 手动绑定。
- AC-5.3 App Secret 写入 **DSH credentials 服务**，不落配置文件、不落仓库；UI 不回显密文。
- AC-5.4 手动创建应用时给出最小权限清单与事件订阅步骤（一键复制/导入 JSON）。
- AC-5.5 诊断：权限检查、长连接状态、最近事件时间、一键补全权限。
- AC-5.6 长连接模式下无需公网入口；若 Lark 国际版被迫使用 webhook，允许一个公网回调域名（文档标注，不引入常驻公网服务）。

### US-6 插件与 Bot 管理 UI（P0）

> 作为管理员，我希望在界面里管理插件设置、Bot 与记忆，而不是编辑配置文件或连数据库。

**验收标准**

- AC-6.1 入口形态：DSH 设置页一级菜单。
- AC-6.2 插件设置：启用/停用、默认模型与思考强度、默认工作区、数据目录、日志级别。
- AC-6.3 Bot 管理：新增 / 删除 / 别名 / 启停、**人格编辑（`PERSONA.md`，Agent 禁写）**、工作区 / 模型 / Agent Preset（基座配置）、访问策略（基座 ownerOpenIds 与群策略）。
- AC-6.4 记忆管理：按 Bot 浏览 / 搜索 / 编辑 / 新建 / 删除 / 导出记忆文件；显示来源、可见性与更新时间；可查看 git 历史（M4）。
- AC-6.5 状态展示：每 Bot 连接状态、所在群列表、最近活动时间。
- AC-6.6 除插件启停外，全部 UI 操作热生效（增删 Bot、人格/模型/工作区/策略、记忆编辑），不需要重启 Host。

### US-7 客户跟进（北极星场景，P1）

> 作为销售/客户成功团队，我们希望群里关于某个客户的讨论由一个 Bot 持续记住，下次跟进时直接问它。

**验收标准**

- AC-7.1 Bot 为客户建立档案文件（如 `customers/<name>.md`），含时间线与关键事实。
- AC-7.2 群聊中提到该客户时，Bot 自动读取并更新对应档案（不要求用户显式指定文件）。
- AC-7.3 换群或换 thread 讨论同一客户，仍引用同一档案。
- AC-7.4 档案可导出、可回滚（git）。
- AC-7.5 「这个客户我们上次聊到哪了？」能给出基于档案的答复，并附来源（文件路径/日期）。
- AC-7.6 档案可引用群内上传的文件（引用即提升为稳定路径，如合同、报价单截图）。

### US-8 上游共建（P2）

> 作为贡献者，我希望实现方式便于向上游提交 PR，而不是形成不可合并的分叉。

**验收标准**

- AC-8.1 新增能力以独立模块/薄层实现，尽量少改上游代码；本项目为独立 DSH 插件。
- AC-8.2 与上游保持 rebase 能力（记录基线与补丁清单）。
- AC-8.3 （延后）PoC 稳定后评估是否向上游提交 PR；**当前保留在本仓库**。

---

## 4. 功能需求

| 编号  | 需求             | 优先级            | 说明                                                                                                                                                                                                                             |
| ----- | ---------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Bot 注册表       | P0                | 单 Host 多 Bot；每 Bot：人格（`PERSONA.md`）、`appId`、`secretRef`、workspace（含 `memory/`）、模型、preset、访问策略；定义存基座 config store，密钥存 DSH credentials                                                           |
| FR-2  | 事件接入         | P0                | 基座长连接接收 `im.message.receive_v1`、卡片回调；**去重用 `message_id`**（官方口径）；按 chat 串行                                                                                                                              |
| FR-3  | 会话路由         | P0                | 复用基座会话键：`p2p:<openId>`、`group:<chatId>`、`group:<chatId>:thread:<threadId>`；默认 thread 优先 = 基座 `groupTopicReply`                                                                                                  |
| FR-4  | 回复与卡片       | P0                | 流式卡片；卡片即原消息引用回复；超时补发（基座）                                                                                                                                                                                 |
| FR-5  | **记忆（文件）** | P1                | 每 Bot `<workspace>/memory/`；**front-matter**（`summary`/`updated_at`/`sources`/`visibility`/`tags`）；文件面工具 + `memory_search`（ripgrep）；turn 注入目录树；可见性过滤；原子写 + 路径 jail；M4 起 git（每 turn 一 commit） |
| FR-6  | 回复位置         | P1（工具延后 M6） | 默认策略走基座 `groupTopicReply`；模型覆盖工具延后                                                                                                                                                                               |
| FR-7  | Setup / 诊断     | P0                | 扫码建应用 / 手动凭据（基座）；写 Profile + credentials 服务；权限检查与一键补全                                                                                                                                                 |
| FR-8  | 密钥治理         | P0                | **DSH credentials 服务** / 环境变量引用；日志与卡片脱敏；仓库零密钥                                                                                                                                                              |
| FR-9  | 沙箱执行         | P2                | **DSH 内建 sandbox 优先**（文件隔离 + approval 升级）；`sbx`（microVM、网络白名单、凭据代理）为升级项                                                                                                                            |
| FR-10 | 配置与管理 UI    | P0                | 基座：插件设置、接入向导、Bot 管理、诊断；本插件：**记忆编辑器、人格编辑器**                                                                                                                                                     |
| FR-11 | 上游可合并性     | P2                | 独立模块/薄层；可 rebase；PR 回上游                                                                                                                                                                                              |
| FR-12 | 可选索引/注册表  | P2                | 仅在基座未提供时引入 SQLite，用于注册表/去重/出站队列；**不存记忆、不存凭据**                                                                                                                                                    |
| FR-13 | 入站文件         | P0                | 归档到工作区附件区；记忆引用即提升为稳定路径；图片需 image-capable 路由方可直接查看                                                                                                                                              |

---

## 5. 架构

### 5.1 逻辑架构（PoC）

```text
飞书开放平台
   │  WebSocket 长连接（出站，无需公网入站）
   ▼
DSH Host（单进程，VPS 或本地设备）
 ├── deepseekbot 插件（独立 DSH 插件，不改基座）
 │    ├─ MemoryStore          # 文件记忆：布局 / front-matter / 目录树注入 / 可见性过滤 / 原子写 / 检索 / git 版本化
 │    ├─ Tools                # memory_* / memory_search / （M6）reply_scope / deliver_file
 │    ├─ Persona              # PERSONA.md 注入（per-bot prompt section）
 │    ├─ MemoryUI             # 记忆/人格编辑器 + 诊断（DSH 设置分区）
 │    └─ InboundFiles         # 引用即提升：入站附件 → <workspace>/attachments/
 ├── dsh-im 基座（复用，不 fork）
 │    ├─ ChannelAdapter       # 事件、卡片、文件、卡回执
 │    ├─ SessionRouter        # botId+chatId(+threadId) → Session（managed topic = thread 优先）
 │    ├─ BotRegistry          # 多 Bot 定义（config store + credentials 服务）
 │    └─ SettingsUI           # 基座设置分区：多 Bot 管理 / 接入向导 / 诊断
 └── DSH Agent（模型 + 工具 + 会话日志）
      └── （P2）sandbox 执行：DSH 内建 sandbox 优先；sbx 为升级项
```

### 5.2 关键设计决策

| 决策         | 结论                                                                                     | 理由                                                            |
| ------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 集成方式     | **独立 DSH 插件**，不 fork dsh-im（ADR-0011）                                            | 基座无路由/工具扩展 seam；核心增量不依赖分叉；M2 有硬需求再评估 |
| 基座         | **dsh-im**（多 Bot + 设置页 UI + MIT）；Lark 国际版自 v4.21.2 起支持 `domain` 选择       | 多 Bot 是核心诉求；详见 5.6                                     |
| Bot 记忆     | **自研，文件优先**（Markdown + front-matter，`<workspace>/memory/`）                     | 人类可读可编辑；检索即文件检索；客户档案场景天然适配            |
| 记忆写入时机 | **工具写**（模型显式调用记忆工具）；PoC 不做自动蒸馏                                     | 可控、可审计、可回滚                                            |
| 上下文注入   | 注入**记忆目录树**（front-matter 摘要），细节按需 `memory_search` / 读文件；按可见性过滤 | 渐进披露；不把正文塞满 token                                    |
| 可见性       | **单脑 + `visibility`**；`private` 归属写作者，仅其 DM 可见（ADR-0013）                  | 隐私有机制边界，不牺牲「Bot 即人」                              |
| 人格载体     | **`PERSONA.md`** 记忆文件，人属、Agent 禁写（ADR-0014）                                  | 复用记忆编辑/历史/备份；人格稳定可审计                          |
| 记忆版本化   | M4 引入 git：**每 Bot 一个 repo**（仅 `memory/`），每次 turn 一个 commit                 | 可 diff、可回溯、可回滚；人机共用历史                           |
| SQLite       | **降级为可选**：注册表/去重/出站队列；不存记忆、不存凭据                                 | 「如无必要勿增实体」                                            |
| 凭据         | **DSH credentials 服务**（沿用基座做法）                                                 | 不进配置文件与仓库                                              |
| 入站文件     | 归档到工作区附件区；**引用即提升**为稳定路径                                             | TTL 与记忆解耦；记忆引用不失效                                  |
| 配置 UI      | DSH 插件设置页（基座分区 + 本插件分区）                                                  | 用户免改配置、免公网                                            |
| 传输         | 长连接优先；国际版若被迫 webhook，允许公网回调（AC-5.6 例外）                            | 即插即用，例外有据                                              |
| 回复位置     | 默认 **thread 优先**走基座 `groupTopicReply`；模型工具延后 M6                            | 不为一个开关 fork 基座                                          |
| Sandbox      | **DSH 内建 sandbox 优先**（文件隔离）；`sbx` 升级项                                      | 零依赖跑通执行；真实攻击面出现再付                              |
| 多工作站     | 暂缓                                                                                     | 单 Host 已满足                                                  |
| 版本策略     | pin DSH 与基座版本                                                                       | DSH 预览期存在破坏性变更                                        |

### 5.3 部署形态

- **形态 A（主）**：VPS 运行 DSH + 插件，多 Bot 长连接，配置 UI 通过本机 `dsh web` 访问。
- **形态 B（PoC 轻量）**：个人设备运行 DSH + 插件，出站长连接接入飞书；无需公网、无需域名证书。
- ~~形态 C：多工作站 / 远程组网~~ → **暂缓**。

### 5.4 长连接的边界条件

| 条件                   | 说明                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 需要出网               | 需能访问 `open.feishu.cn` / `open.larksuite.com`；无需入站端口                                                                  |
| 中国版飞书             | 长连接支持完整                                                                                                                  |
| 国际版 Lark / 自建域名 | 官方文档支持自建应用长连接（SDK `Lark.Domain`）；社区有反例（多为 domain 配错）。若被迫 webhook：属 AC-5.6 例外，需一个公网回调 |
| 应用配置               | 建应用/发布/审核仍在开放平台（UI 向导扫码/跳转完成）                                                                            |
| 卡片回调               | 可走同一长连接                                                                                                                  |

### 5.5 记忆设计（文件优先）

**目录布局（`<workspace>` 下）**

```text
<workspace>/memory/            # 每 Bot 记忆根（git repo）
├── PERSONA.md                 # 人格（人属；Agent 禁写）
├── MEMORY.md                  # 生成的索引（树 + 摘要），不手改
├── customers/                 # 客户档案（北极星场景）
│   └── acme.md                # 时间线 + 关键事实 + 待办 + 关联附件（front-matter）
├── topics/                    # 主题知识（定价策略、流程约定……）
│   └── pricing.md
├── journal/                   # 可选：按日追加的原始记录
│   └── 2026-09-17.md
└── .git/                      # M4：每次 turn 一个 commit

<workspace>/attachments/       # 入站附件的稳定路径（引用即提升；不入 git）
└── 2026-09-17/acme-quote.pdf
```

**读写规则**

| #   | 规则                          | 说明                                                                                                                                                                                                           |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | 文件是唯一事实源              | 纯 Markdown + YAML front-matter：`summary`、`updated_at`、`sources`、`visibility`（默认 `shared`），选填 `tags`；缺失/非法时降级（首行摘要 + mtime），不阻塞                                                   |
| M2  | 原子写                        | 写临时文件 + `rename` 原子替换；禁止原地截断；同一 Bot 串行写（单写者）；工具路径 jail 在 `memory/`，拒绝越界                                                                                                  |
| M3  | **目录树进上下文** + 按需检索 | turn 注入目录树（front-matter 的 `summary` + `updated_at`）；**上限 1000 个路径**，超出时优先列文件夹、折叠文件过多的文件夹并标注「（n 个文件）」；细节用 `memory_search`（ripgrep）/ 读文件；注入按可见性过滤 |
| M4  | 显式来源                      | 来源写入 front-matter `sources`（群 / 会话 / 日期 / 发送者），便于审计与回滚                                                                                                                                   |
| M5  | 人类可编辑                    | UI 提供编辑器；冲突策略：mtime/hash 检测后**拒绝保存并展示差异**（不自动合并）                                                                                                                                 |
| M6  | 可备份/可回滚                 | 目录可直接复制/打包；**git**：每 Bot 一个 repo、覆盖 `memory/`、每次 turn 一个 commit（摘要 + 来源；人改 source=human）；附件在 repo 外随打包备份                                                              |
| M7  | 防污染                        | 记忆写入可配置为「需确认」；可选定期人工 review（默认关）                                                                                                                                                      |
| M8  | 敏感信息                      | 凭据严禁写入记忆；发现疑似密钥时告警并脱敏（扫描规则）                                                                                                                                                         |
| M9  | **写入时机 = 工具写**         | 仅由模型显式调用记忆工具落盘；无自动蒸馏、无后台批量改写（PoC）                                                                                                                                                |
| M10 | 入站文件归属                  | 归档到 `<workspace>/attachments/`（引用即提升为稳定路径）；记忆正文引用相对路径；TTL 与记忆解耦                                                                                                                |
| M11 | 可见性                        | `shared` 默认；DM 来源默认 `private`（带 owner）；群 turn 的注入与搜索过滤 `private`，仅 owner 的 DM 可见                                                                                                      |

**与 SQLite 的边界**

- 记忆：❌ 不进 SQLite。
- 凭据：❌ 不进 SQLite（DSH credentials 服务）。
- SQLite（可选，仅在基座未覆盖时）：Bot 注册表、chat→session 绑定、事件去重、出站队列；如引入，遵循「版本化迁移、完整性自检、正规备份」的纪律（参考 Codex `codex-rs/state` 的工程实践：独立迁移器、checksum、`VACUUM INTO` 备份、WAL 不用于网络文件系统）。

### 5.6 基座候选评估（2026-09 调研）

| 候选                                                         | ★    | 许可            | 多 Bot                    | Lark 国际版                                           | 工程成熟度                                              | 结论                                             |
| ------------------------------------------------------------ | ---- | --------------- | ------------------------- | ----------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| [dsh-im](https://github.com/xmanrui/dsh-im)                  | 1.4k | MIT             | ✅ **每渠道多机器人**     | ✅ v4.21.2（2026-09）起内置 Feishu/Lark `domain` 选择 | 665+ commits、官方认可、设置页 UI、超时补发、主动投递   | **首选基座**                                     |
| [dsh-lark-link](https://github.com/amlyczz/dsh-lark-link)    | 39   | MIT             | ❌ 每 profile 单 Bot      | ✅ 飞书/Lark，扫码 30s                                | 264 测试、Outbox + Inbound WAL、`groupPolicy`、ZIP 诊断 | **可靠性设计参考**（零丢失机制）                 |
| [dsh-feishu](https://github.com/PGZXB/dsh-feishu)            | 30   | MIT             | ❌                        | ✅ Lark 开放平台 SDK                                  | 222 commits、面板控制台、卡内审批、e2e                  | 单 Bot UX 参考                                   |
| [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge)  | 6    | MIT             | ❌                        | ✅ `--brand feishu/lark/larkoffice`                   | 7 commits，太新                                         | **群→Project / thread→Session 设计参考**         |
| [dsh-lark-bot](https://github.com/PlutoKeating/dsh-lark-bot) | 39   | **AGPL-3.0** ⚠️ | ✅ `bot add` 多机器人交接 | ✅                                                    | 565 commits、功能最全、安全网守护、Web 设置页           | **因 AGPL 排除**（商用/SaaS/闭源二开需另行授权） |

**结论**：以 **dsh-im** 为基座提供多 Bot、路由、卡片与设置 UI；本项目以**独立插件**叠加记忆/人格/可见性（ADR-0011），其余候选的成熟机制仅作设计参考（可靠性借鉴 dsh-lark-link，群/线程路由借鉴 dsh-lark-bridge，单 Bot UX 借鉴 dsh-feishu）；不引入 AGPL 代码。

---

## 6. 非功能需求

| 类别   | 要求                                                                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 安全   | 最小飞书权限（附录 A）；approval 仅用于 sandbox 升级；记忆写入确认开关默认关（M7）；沙箱隔离执行（DSH 内建）；凭据仅在 credentials 服务；入站文件大小/类型限制；DM 内容按可见性披露 |
| 密钥   | 仓库与配置零明文；日志/卡片/错误信息脱敏；UI 不回显密文                                                                                                                             |
| 版本   | pin DSH、基座、飞书 SDK、Node 版本；升级需过诊断自检                                                                                                                                |
| 可观测 | 结构化日志；DSH append-only session log；记忆写入有来源与时间戳（M4）；git 历史可查（M4）                                                                                           |
| 性能   | 单 Host ≥5 Bot × ≥20 群；@ 到「已受理」< 2s（反馈形态见 9.2-9），首字回复（不含模型）< 5s；记忆目录树注入 < 2k tokens                                                               |
| 兼容   | Node 22+；Linux 优先，macOS 次之                                                                                                                                                    |
| 可靠性 | 长连接自动重连；事件去重（`message_id`）；超时补发；记忆原子写（M2）                                                                                                                |
| 易用性 | 零配置文件路径：安装 → UI 向导 → 可用；界面中文优先                                                                                                                                 |

---

## 7. 里程碑

| 里程碑 | 交付                                                                                                            | 状态      |
| ------ | --------------------------------------------------------------------------------------------------------------- | --------- |
| **M0** | 仓库初始化 + PRD + README                                                                                       | ✅ 已完成 |
| M1     | **基座验证（Lark 国际版）+ 集成地基**：独立插件脚手架、session→bot 识别、设置分区、六条 gate（见下）            | 待开始    |
| M2     | 群感知与附件：基座路由接入 + 入站附件提升管线 + DM 一等                                                         | 待开始    |
| M3     | **Bot 记忆 MVP（文件）**：`memory/` 布局 + front-matter + 目录树注入 + `memory_*` 工具 + 可见性过滤 + 原子写    | 待开始    |
| M4     | 记忆增强：`memory_search`（ripgrep）、记忆/人格编辑器 UI、**git 版本化（每 turn 一个 commit）**、来源标注、备份 | 待开始    |
| M5     | 沙箱执行：DSH 内建 sandbox 接入（`sbx` 升级评估）                                                               | 待开始    |
| M6     | （延后）上游/工具评估：`feishu_reply_scope` 工具、上游 PR 边界                                                  | 待开始    |

**M1 出口标准（只验证 Lark 国际版）**

1. 一个 Host 两个 Bot 同时在线、互不串扰（长连接各一条）；
2. Lark 国际版收发成功（`domain` 配置正确）；
3. 凭据进 DSH credentials、Bot 定义进基座 config store、UI 可管理；
4. session→bot 可稳定识别（记忆/人格注入的前提）；
5. 流式卡片在群与话题内可用；「已受理」即时反馈优先复用基座，没有则加 Reaction；
6. 若国际版长连接不可用，webhook 例外的书面结论（AC-5.6）。

---

## 8. 竞品与先例参考

（见 5.6 基座候选评估；另参考 [openai/codex](https://github.com/openai/codex) 的本地状态工程实践、OpenClaw 与 OpenHands 的产品形态。）

---

## 9. 风险与开放问题

### 9.1 风险

| 风险                                                    | 影响             | 缓解                                                             |
| ------------------------------------------------------- | ---------------- | ---------------------------------------------------------------- |
| DSH 预览期破坏性变更                                    | 插件失效         | pin 版本；关注 release；兼容性测试                               |
| Lark 国际版长连接不稳（官方称支持自建应用，社区有反例） | 收不到事件       | M1 实测；确保 domain 配置正确；预接受 webhook 例外（AC-5.6）     |
| 基座演进频繁导致不兼容                                  | 插件失效         | 独立插件薄边界；pin 基座版本；M1 起建契约测试                    |
| 记忆文件并发写/损坏                                     | 记忆不可用       | 单写者 + 原子写（M2）；git 版本化（M4）；定期备份                |
| 记忆被污染（prompt injection 写入错误事实）             | 回答质量下降     | 来源标注（M4）、写入确认策略（M7）、人工可编辑/回滚（M5/M6）     |
| 凭据写入记忆                                            | 泄露             | 扫描与告警（M8）；credentials 服务隔离                           |
| 入站文件携带恶意内容 / 超大文件                         | 安全与稳定性     | 大小/类型限制；仅归档不执行；沙箱内读取（M5）                    |
| 目录树过大导致注入超限                                  | token 浪费       | 摘要 + 截断策略；超过阈值时折叠为索引（M3）                      |
| 多 Bot 触发飞书限流                                     | 消息失败         | 每 Bot 独立凭据与配额；重试 + 补发                               |
| DeepSeek 默认路由 text-only                             | 图片无法直接理解 | AC-2.5 两档验收；需要时配 image-capable 路由                     |
| DM 私事经记忆泄露                                       | 信任受损         | visibility + owner 过滤（M11）；`sources` 可审计；记忆编辑器可删 |

### 9.2 开放问题

1. ~~记忆的 front-matter schema~~ ✅ 已定：**引入 front-matter**（反转 v0.6；字段见 M1 规则）。
2. ~~记忆写入时机~~ ✅ 已定：**工具写**，PoC 不做自动蒸馏（见 US-4 / M9）。
3. ~~git 版本化~~ ✅ 已定：每 Bot 一个 repo、仅 `memory/`；**每次 turn 一个 commit**（摘要 + 来源；人改亦提交）。
4. ~~目录树注入的规模阈值~~ ✅ 已定：**上限 1000 个路径**，超出时优先列文件夹、折叠文件过多的文件夹并标注「（n 个文件）」（M3 实现）。
5. ~~基座最终选择~~ ✅ 已定：**dsh-im 之上做独立插件**（不 fork；ADR-0011）；M2 评估是否需要路由级 patch。
6. ~~回复位置决策的默认策略~~ ✅ 已定：**thread 优先**（基座 `groupTopicReply`）；模型覆盖工具延后 M6。
7. ~~上游 PR 边界~~ ✅ 已定：**暂时保留在本仓库**，自研能力先不向上游提交；PoC 稳定后再评估。
8. 记忆树注入的刷新时机（每 turn 重注入 vs 会话内缓存 + 变更刷新）——M3 实现时定。
9. 「已受理」即时反馈形态——M1 验证基座是否已有；有则复用，无则加 Reaction。

---

## 附录 A：飞书权限清单（最小集）

| 类型 | 值                                             | 用途                        |
| ---- | ---------------------------------------------- | --------------------------- |
| 权限 | `im:message.p2p_msg:readonly`                  | 接收私聊消息                |
| 权限 | `im:message.group_at_msg:readonly`             | 接收群里 @Bot 的消息        |
| 权限 | `im:message:send_as_bot`                       | 以 Bot 身份发消息           |
| 权限 | `im:resource`                                  | 上传/读取图片与文件         |
| 权限 | `im:message:readonly`                          | 下载消息中的附件（可选）    |
| 事件 | `im.message.receive_v1`                        | 接收消息                    |
| 回调 | `card.action.trigger`                          | 卡片交互（审批 / 按钮）     |
| 可选 | `im:message.group_at_msg.include_bot:readonly` | 接收其他机器人 @ 当前机器人 |

## 附录 B：命令与界面速览（规划中）

```bash
# 安装（规划）
dsh plugin --profile <profile> add -w deepseekbot

# 配置（规划；主要走 UI，CLI 为无头环境兜底）
dsh --profile <profile>            # 启动；浏览器打开 dsh web 进入「设置 → DeepSeekBot」
```

## 附录 C：参考资料

- DeepSeek Harness：https://github.com/deepseek-ai/deepseek-harness
- 插件目录：https://github.com/kejixiaoliang/awesome-dsh-plugins
- 基座候选：dsh-im · dsh-lark-link · dsh-feishu · dsh-lark-bridge · dsh-lark-bot（见 5.6 链接）
- Codex 本地状态工程实践：https://github.com/openai/codex（`codex-rs/state`）
- Docker Sandboxes：https://docs.docker.com/ai/sandboxes/

## 附录 D：暂缓项记录（不进 PoC）

| 项                                        | 原因                                             | 触发条件（何时重新评估）                   |
| ----------------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| celld / Cloudflare / Postgres             | 成熟度与运维复杂度                               | 需要多机水平扩展或 CF 编程模型时           |
| 多工作站 / 远程组网（Tunnel / Tailscale） | 单 Host 已满足；长连接无需公网                   | 需要跨设备共享算力或远程访问 DSH Web UI 时 |
| 向量检索 / 记忆自动蒸馏                   | 工具写 + 文件检索先跑通                          | grep/关键词检索效果不足时                  |
| Docker `sbx` 沙箱起步                     | DSH 内建 sandbox 已覆盖文件隔离                  | 需要网络白名单 / 一次性 microVM 时（M5+）  |
| `feishu_reply_scope` 模型工具             | 需 patch 基座 bridge；基座配置已提供 thread 优先 | M6 上游/分叉评估时                         |
| DM 独立记忆分区                           | 单脑 + visibility 已给隐私边界                   | 合规要求更严时                             |

## 附录 E：工程基础设施（v0.6 初始化）

| 项          | 选择                                                                                                        | 来源                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 包管理      | pnpm 12.4.2（`packageManager` 锁定）                                                                        | 复用 GEO-SNS                                              |
| Node        | `engines: >=22`；`.node-version` = v24.21.0                                                                 | 复用 GEO-SNS                                              |
| 语言        | TypeScript 7（strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`） | 复用 GEO-SNS                                              |
| Lint / 格式 | oxlint + oxfmt（printWidth 100、单引号、trailingComma all）                                                 | 复用 GEO-SNS                                              |
| 测试        | vitest                                                                                                      | 新增                                                      |
| 构建        | tsdown（host ESM + d.ts；后续 client bundle 同工具）                                                        | DSH 插件生态惯例（dsh-lark-link 同款）                    |
| 不使用      | Vite / React / Cloudflare 工具链                                                                            | 插件在 Node 侧运行；设置 UI 走 DSH 插件契约，无需独立前端 |

常用命令：`pnpm lint` · `pnpm format` · `pnpm format:check` · `pnpm typecheck` · `pnpm test` · `pnpm build`。

## 附录 F：Agent 技能包（v0.7 安装）

- 来源：[mattpocock/skills](https://github.com/mattpocock/skills)（37 个技能，MIT）——安装于 `.agents/skills/`，`.claude/skills/` 为符号链接；`skills-lock.json` 锁定来源与哈希。
- 更新：`npx skills@latest update`。**勿手动格式化这些第三方文件**（oxfmt/oxlint 已忽略 `.agents`、`.claude`、`agent`）。
- 技能初始化（对应 `setup-matt-pocock-skills`）：
  - Issue tracker：**GitHub Issues**（`Teamemos/DeepSeekBot`，`gh` CLI；PR 不作 triage 入口）——见 `docs/agents/issue-tracker.md`
  - Triage 标签：默认五角色（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）——见 `docs/agents/triage-labels.md`
  - 领域文档：单 context；根 `CONTEXT.md` + `docs/adr/`（14 篇）已按 PRD 建立——见 `docs/agents/domain.md`
  - `AGENTS.md` 已加入 `## Agent skills` 区块
- 常用技能：`/grill-with-docs`（对齐 + 领域建模）、`/to-spec`、`/to-tickets`、`/tdd`、`/diagnosing-bugs`、`/code-review`、`/research`、`/handoff`、`/wizard`。
