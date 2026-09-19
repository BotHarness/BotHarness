# DeepSeekBot — 产品需求文档（PRD）

| 项        | 内容                                                                                                                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 版本      | v1.4（PoC）                                                                                                                                                                                                                             |
| 日期      | 2026-09-19                                                                                                                                                                                                                              |
| 状态      | Draft                                                                                                                                                                                                                                   |
| 形态      | **BotHarness 的首个应用**：DSH 插件 bundle                                                                                                                                                                                              |
| 平台规格  | `docs/botharness.md`（PersonaBot / 记忆 / 状态 / 工作方式）                                                                                                                                                                             |
| 上游依赖  | DSH（开发者预览，**必须 pin**）；dsh-im（通道基座）；blobatar（MVP 形象）                                                                                                                                                               |
| v1.0 变更 | 重组：平台层（PersonaBot、记忆、状态、工作方式）移入 `docs/botharness.md`，本 PRD 只描述 DeepSeekBot 应用；路线从 IM-first 调整为 **sidebar-first**（IM 作为第一个真实渠道，见 M5）；仓库更名 `BotHarness/BotHarness`                   |
| v1.1 变更 | 对齐平台 v1.6（ADR-0024/0025/0026）：US-2/AC-2.2 委派目标态 = 独立工作 Session；术语对齐 `CONTEXT.md`（Channel / Binding / Inbox / Orchestrator Session）；跨 PersonaBot 通信目标路径 = 经 Orchestrator                                 |
| v1.2 变更 | 对齐平台 v1.7：PersonaBot 最小 profile = displayName / tag（岗位）/ description，AC-1.3 向导同步；模型选择为本地策略、不随 SoulSnapshot 发布（ADR-0027）                                                                                |
| v1.3 变更 | 对齐平台 v1.9（ADR-0029/0030 + 0026 增补）：BOT 模式改为聊天优先（点击 BOT 即 DM，session 移右侧面板，workspace 弱化）；Channel/Section/Bridge/Bot Inbox 术语；M3 收敛为 IA + 聊天外壳 + 本地消息存储，Bot Inbox 及 Channel 工具落 v1.1 |
| v1.4 变更 | 对齐平台 v1.10（ADR-0031/0032）：sidebar 区块排序与移动、未分组、默认 blobatar 头像与字形图标、行几何对齐原生实测；自定义头像与头像动效/表情留 v1.1                                                                                     |

## 0. 历史变更（v0.2–v0.9）

- **v0.9**：独立 DSH 插件（不 fork dsh-im）；记忆引入 front-matter、`PERSONA.md` 人属、`visibility`、附件引用即提升、git 每 turn 一 commit；M1 只验 Lark 国际版。
- **v0.8**：GitHub 远端 + GitHub Issues；建立 `CONTEXT.md` 与 ADR。
- **v0.7**：回复位置默认 thread 优先；上游共建延后。
- **v0.6**：不引入 front-matter（v0.9 反转）；目录树注入上限 1000 路径；工具链初始化。
- **v0.5**：工具写、目录树注入、git 版本化方向、入站文件必须可用。
- **v0.4**：文件优先记忆；SQLite 降级；凭据进 DSH credentials；「Bot 即人」。
- **v0.3**：不用 celld；记忆自研；单 Host 形态。
- **v0.2**：长连接出站；插件内配置 UI 为 P0。

## 1. 是什么

**DeepSeekBot** 把 BotHarness 的 PersonaBot 带进 DSH 界面：在 sidebar 里创建、观察、@委派，让它们持续工作；并通过适配器接入 IM（飞书 / Lark），把"群里的同事"落到真实场景。

- 平台能力（实体、记忆、状态、工作方式）见 `docs/botharness.md`，本 PRD 不重复。
- 非目标：平台内核、Live2D（独立 effort）、多 IM 渠道（先飞书）、多工作站。

## 2. 用户故事与验收

### US-1 Roster 与创建（P0）

> 作为用户，我在 DSH 里看到所有 PersonaBot——形象（blobatar）、状态、工作树；能创建/删除/编辑。

- AC-1.1 bot-mode sidebar 平铺列表：头像 + 聚合状态（六态）+ 未读点；头像为 slug 确定性生成的默认 blobatar（DM 行显示 Bot 头像，群 Channel 行用字形），行几何对齐原生实测（ADR-0031/0032）；置顶区仅 BOT。
- AC-1.2 点击 BOT 打开 DM 聊天（IM 样式，本地消息）；BOT 与 Channel（群聊）同列；用户可建可折叠 Channel section 组织 Channel，section 可手排，Channel 可在 section 间拖动或经右键「移动到」菜单归位；未归属的 Channel 落在底部「未分组」（平铺、不可折叠、不参与手动排序）。
- AC-1.3 创建：首次无 BOT 的空状态按钮 → 按需创建 Builder；此后「+」菜单选择「Builder 对话创建」或「表单向导」；表单字段：名字、标签、描述、persona、模型/preset、workspace、头像种子。
- AC-1.4 DM 右侧 session 面板：列出该 BOT 的 sessions（状态 / workspace / 最近活动，含「主会话」），点击切换；只读。
- AC-1.5 排序：每个 scope（section / 未分组）排序方式 `auto` / `manual` / `inherit`（section 默认 `inherit`，未分组恒 `inherit`）；全局默认在 Bots 头部 `...` 菜单设置；首次手动拖拽或拖入切 `manual` 并冻结当前顺序，「恢复自动」回 `inherit`（ADR-0031）。
- AC-1.6 section 操作：section 头 `+` 在区内新建 Channel；`...` = 排序方式 → 重命名（Modal 输入）→ 删除（danger 末位，Modal 红描边确认）；删除 section 只把 Channel 回落到未分组，不删内容（ADR-0031）。

### US-2 委派与持续工作（P0）

> 作为用户，我在 DM 或群聊里给 PersonaBot 发消息，它像同事一样处理并回复；可以同时推进几件事。

- AC-2.1 DM 与 Channel 消息进入该 BOT 的 Bot Inbox（准入按 Channel membership，默认 `all`）；@ 走 immediate、普通走 digest（ADR-0025）。
- AC-2.2 Orchestrator Session 按批次处理 Bot Inbox：回复、派发给已有工作 Session、或新开 Session（ADR-0024；v1.1 交付）。
- AC-2.3 状态实时反映到 sidebar（六态）与右侧 session 面板。
- AC-2.4 完成后在聊天中回复；Human Inbox 聚合需要人工处理的事件。
- AC-2.5 并发多 Session 各自进度独立。

### US-3 记忆（P0；平台实现，应用负责可见）

> 作为用户，我能打开、搜索、编辑、回滚每个 PersonaBot 的记忆。

- AC-3.1 记忆编辑器入口：浏览 / 搜索 / 编辑 / 新建 / 删除 / 导出。
- AC-3.2 显示来源与更新时间；git 历史可查。
- AC-3.3 人类编辑冲突：拒绝保存并展示差异（平台规则 M5）。

### US-4 IM 接入（P1，首个渠道）

> 作为团队，我们把 PersonaBot 接进飞书/Lark，它在群里干活、记住客户。

- AC-4.1 通过 Bridge 绑定外部来源（dsh-im 的 Bot/凭据；**domain=lark 优先验证**）。
- AC-4.2 Lark 群 / thread → Channel 的映射由 Bridge 负责；DM 一等；记忆与 sidebar 同一份。
- AC-4.3 入站文件「引用即提升」为稳定路径。
- AC-4.4 客户跟进北极星：群里聊客户 → 档案持续更新 → 换群/换 thread 引用同一档案。

### US-5 审批与安全（P0）

- AC-5.1 外部副作用 → `waiting`，确认后执行；经 Bridge 的聊天出站默认免审批。
- AC-5.2 密钥只在 DSH credentials；仓库与配置零明文。
- AC-5.3 记忆中疑似密钥告警并脱敏。

## 3. 功能需求（应用层）

| 编号 | 需求                 | 优先级 | 说明                                                         |
| ---- | -------------------- | ------ | ------------------------------------------------------------ |
| FR-1 | bundle 组装          | P0     | core + client + 适配器；一条命令安装                         |
| FR-2 | Roster / 详情 / 新建 | P0     | DSH client 包（React + blobatar + vendored 字形）            |
| FR-3 | @委派与命令          | P0     | composer `@` + `/bot`                                        |
| FR-4 | 记忆编辑器入口       | P0     | 复用平台记忆工具与 git                                       |
| FR-5 | 审批队列             | P0     | `waiting` 展示与确认；approval 需 open turn                  |
| FR-6 | IM 适配器            | P1     | dsh-im 绑定、入站文件、Lark 验证                             |
| FR-7 | 诊断                 | P1     | 连接状态、记忆目录检查、权限清单                             |
| FR-8 | Channel / Bot Inbox  | P0     | 本地消息存储（NDJSON）、Bot Inbox 触发、Channel 工具（v1.1） |
| FR-9 | Builder 创建         | P0     | 对话式创建 BOT；`bot_create` 受工具白名单控制                |

## 4. 非功能需求

| 类别   | 要求                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------- |
| 安全   | 最小权限（附录 A）；审批分级；沙箱隔离执行；凭据仅在 credentials 服务；分享边界在导出时选择（ADR-0021） |
| 密钥   | 仓库与配置零明文；日志/卡片脱敏；UI 不回显密文                                                          |
| 版本   | pin DSH、dsh-im、飞书 SDK、Node；升级过诊断                                                             |
| 可观测 | 结构化日志；DSH session log；记忆写入有来源与时间戳；git 历史可查                                       |
| 性能   | @ 到「已受理」< 2s（复用基座反馈，无则 Reaction）；首字（不含模型）< 5s；目录树注入 < 2k tokens         |
| 兼容   | Node 22+；Linux 优先；客户端为 web                                                                      |
| 可靠性 | 长连接自动重连；事件去重（`message_id`）；记忆原子写（M2）                                              |
| 易用性 | 安装 → UI 向导 → 可用；界面中文优先                                                                     |

## 5. 里程碑

平台里程碑见 `docs/botharness.md` §7；应用主导的交付：

| #    | 应用侧交付                                              |
| ---- | ------------------------------------------------------- |
| M3   | Bot 模式 IA 与聊天外壳（client 包；本地消息存储）       |
| M4   | 文件研究助手演示闭环                                    |
| M5   | Bridge 适配器（dsh-im 绑定、Lark 验证、客户跟进）       |
| v1.1 | Bot Inbox / Orchestrator / Channel 工具 / Bridge（#30） |

## 6. 风险

- 平台风险见 `docs/botharness.md` §8。
- 应用侧补充：客户端 bundle 依赖必须内联（shell 只共享 `react`/`react-dom`）；composer `@` 源目前是全局的（跨会话可见，PoC 可接受）；Lark 国际版长连接若不稳，webhook 例外条款保留（原 AC-5.6）。

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

## 附录 B：命令与界面速览（规划）

```bash
# 安装（规划）
dsh plugin --profile <profile> add -w deepseekbot

# 配置（规划；主要走 UI，CLI 为无头环境兜底）
dsh --profile <profile>            # 启动；浏览器打开 dsh web 进入「设置 → BotHarness」
```

## 附录 C：参考资料

- 平台规格：`docs/botharness.md`
- DeepSeek Harness：https://github.com/deepseek-ai/deepseek-harness
- IM 基座 [dsh-im](https://github.com/xmanrui/dsh-im)；可靠性参考 [dsh-lark-link](https://github.com/amlyczz/dsh-lark-link)；群/线程路由参考 [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge)
- 形象：[blobatar](https://github.com/Alain00/blobatar)；Live2D 后置
- Docker Sandboxes：https://docs.docker.com/ai/sandboxes/

## 附录 D：暂缓项记录

| 项                    | 原因                                                                      | 触发条件                    |
| --------------------- | ------------------------------------------------------------------------- | --------------------------- |
| Live2D 渲染           | 独立插件，消费原始模型/工具/响应信号                                      | 后续单独 grill/wayfinder    |
| Docker `sbx` 沙箱起步 | DSH 内建 sandbox 已覆盖文件隔离                                           | 需要网络白名单 / microVM 时 |
| DM 独立记忆分区       | 单脑 + 导出时选择分享边界（ADR-0021）                                     | 合规要求更严时              |
| 多根 workspace        | 单目录 1:1（ADR-0018）                                                    | 编码场景真实需要时          |
| 跨 PersonaBot 通信    | 目标态经 Orchestrator（ADR-0024）；PoC 只留 seam（registry + 事件）       | 单 Bot 闭环成立后           |
| 无人值守调度          | 委派制先行                                                                | Bot 需要自己发起工作时      |
| 消息保留 / GC         | append-only 文件先落地，保留策略未定（ADR-0030 开放项）                   | 数据量或合规要求出现时      |
| 自定义头像            | 需要设计（预设 / 上传 / 裁剪）；MVP 用 slug 确定性生成（ADR-0032）        | 设计通过后（v1.1）          |
| 头像动效 / 表情       | blobatar motion.css 与 bundle CSS 注入集成未决；Safari 未验证（ADR-0032） | v1.1 单独开票               |

## 附录 E：工程基础设施（v0.6 初始化，v1.0 增补）

| 项                  | 选择                                                                                                        | 来源               |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------ |
| 包管理              | pnpm 12.4.2（`packageManager` 锁定）                                                                        | 复用 GEO-SNS       |
| Node                | `engines: >=22`；`.node-version` = v24.21.0                                                                 | 复用 GEO-SNS       |
| 语言                | TypeScript 7（strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`） | 复用 GEO-SNS       |
| Lint / 格式         | oxlint + oxfmt（printWidth 100、单引号、trailingComma all）                                                 | 复用 GEO-SNS       |
| 测试 / 构建         | vitest · tsdown                                                                                             | 新增               |
| 客户端（v1.0 增补） | `@botharness/client` 使用 **React**（DSH 客户端契约）+ blobatar；依赖必须内联进 bundle                      | DSH client-modules |
| 不使用              | Vite / Cloudflare 工具链                                                                                    | 无独立前端站点     |

常用命令：`pnpm lint` · `pnpm format` · `pnpm format:check` · `pnpm typecheck` · `pnpm test` · `pnpm build`。

## 附录 F：Agent 技能包（v0.7 安装）

- 来源：[mattpocock/skills](https://github.com/mattpocock/skills)（37 个技能，MIT）——安装于 `.agents/skills/`，`.claude/skills/` 为符号链接；`skills-lock.json` 锁定来源与哈希。
- 更新：`npx skills@latest update`。**勿手动格式化这些第三方文件**（oxfmt/oxlint 已忽略 `.agents`、`.claude`、`agent`）。
- 首发技能 **`dsh-plugin-dev`**（全栈 DSH 插件开发：host/client、槽位、RPC、构建与打包）——本仓 `.agents/skills/` 为 canonical，镜像仓 [`BotHarness/dsh-skill`](https://github.com/BotHarness/dsh-skill) 供一键安装（`npx skills add BotHarness/dsh-skill`）；站点渲染为 `botharness.ai/dsh`（DSH Dev Docs）。发布 `pnpm sync:skill` + tag；出处/版本/时间见 skill 的 Provenance（ADR-0033）。
- 技能初始化（对应 `setup-matt-pocock-skills`）：
  - Issue tracker：**GitHub Issues**（`BotHarness/BotHarness`，`gh` CLI；PR 不作 triage 入口）——见 `docs/agents/issue-tracker.md`
  - Triage 标签：默认五角色（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）——见 `docs/agents/triage-labels.md`
  - 领域文档：单 context；根 `CONTEXT.md` + `docs/adr/`（32 篇）——见 `docs/agents/domain.md`
  - `AGENTS.md` 已加入 `## Agent skills` 区块
- 常用技能：`/grill-with-docs`（对齐 + 领域建模）、`/to-spec`、`/to-tickets`、`/tdd`、`/diagnosing-bugs`、`/code-review`、`/research`、`/handoff`、`/wizard`。
