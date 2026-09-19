# DSH 社区插件生态调研 — "Show Your Plugins!" 分类全量扫描（1425 帖）

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题     | GitHub `deepseek-ai/deepseek-harness` 的 Discussions 分类 **"Show Your Plugins!"**（categoryId `DIC_kwDOT3T1g84DDSUe`）里，有哪些值得 BotHarness 学习借鉴的优质插件 repo？我们已评估过的 dsh-im / dsh-lark-link / dsh-lark-bridge 之外还有哪些信号？                                                |
| 上游     | https://github.com/deepseek-ai/deepseek-harness/discussions/categories/show-your-plugins（1425 个讨论，2026-09-19 查询）                                                                                                                                                                            |
| 数据快照 | 2026-09-19；GraphQL `totalCount = 1425`，全量按 `CREATED_AT DESC` 分页抓取（100/页 × 15 页），落成 NDJSON 后本地分析；帖内 repo 元数据（star/push/license）逐仓库 `gh api repos/<owner>/<repo>` 核对（2026-09-19）；所有 URL 访问日期 **2026-09-19**                                                |
| 调研方法 | 一手来源优先：讨论帖**正文**（抽取了约 70 个高热度/高相关帖逐字阅读）→ repo GitHub 元数据 → 少量关键 repo 的 README 前段抽查（agent-team、memento、testkit、agentsoul、contrib-topology）。star 数只作信号不作结论；推断一律标「未验证」。**本次未安装任何插件**；GitHub 侧只读，仓库侧只新增本文件 |
| 已知边界 | 仅覆盖本分类；1395 个去噪后的不同 `owner/repo` 串中绝大多数只做了元数据核对、未读源码；`upvoteCount` 不能作为 orderBy，热度为本地降序排序结果；star 数存在生态级膨胀（见 §5）                                                                                                                       |

一句话结论：**本分类是「自助发布区」——1425 帖里 93% 带仓库链接，但 60% 零评论、80% 不到 2 票，真正同时具备「持续维护 + 一手设计叙述 + 可验证工程质量」的插件是少数。对 BotHarness 最有学习价值的是五条线：持久 Agent 团队的成员身份模型（dsh-agent-team）、fail-closed 的 IM 桥安全姿态（dsh-feishu-bridge）、人格文件 + KV-cache 友好注入（agentsoul / openclaw-persona）、"记忆是编辑出来的"与 service 层审批门（topics-memory / memento）、以及真实宿主生命周期测试门（testkit）。**

---

## 1. 数据总览

### 1.1 规模与时间分布

- 全量 **1425** 帖，时间 **2026-08-13 → 2026-09-19**（DSH 发布后第 1 天即开始爆发）。
- 发帖峰值在 **08-14（186 帖）**，此后持续回落：08 月下旬日均 20–30 帖，09 月中旬降至日均 6–17 帖。生态的"发布潮"已过峰，进入长尾。
- 每天帖数（UTC+8 日期，按 `createdAt` 本地聚合）：

| 日期  | 帖数 | 日期  | 帖数 | 日期  | 帖数 | 日期        |        帖数 |
| ----- | ---: | ----- | ---: | ----- | ---: | ----------- | ----------: |
| 08-13 |   63 | 08-20 |   52 | 08-27 |   21 | 09-03       |          19 |
| 08-14 |  186 | 08-21 |   38 | 08-28 |   24 | 09-04       |          14 |
| 08-15 |  182 | 08-22 |   34 | 08-29 |   26 | 09-05       |          14 |
| 08-16 |  157 | 08-23 |   48 | 08-30 |   19 | 09-06       |          12 |
| 08-17 |   79 | 08-24 |   25 | 08-31 |   25 | 09-07       |          10 |
| 08-18 |   91 | 08-25 |   18 | 09-01 |   30 | 09-08       |          11 |
| 08-19 |   61 | 08-26 |   29 | 09-02 |   20 | 09-09–09-19 | 122（合计） |

### 1.2 热度结构（关键：热度信号很弱）

| 指标                        | 数值                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 含至少 1 个外部 GitHub 链接 | 1325 / 1425（**93.0%**）                                                                                      |
| 去噪后不同 `owner/repo` 数  | **1395** 个（已排除 user-attachments、DSH 自身、issue/blob 等路径）                                           |
| 抽取到的不同 npm 包 spec    | 573 个（含 `dsh plugin add` / `npm i` / `npx` 之后的包名）                                                    |
| 投票                        | 总和 1866，**最高仅 13**（#2004 分类守则，非插件）；均值 1.31；1 票及以下 **1142 帖（80.1%）**，≥2 票仅 19.9% |
| 评论                        | 总和 1354；**零评论 857 帖（60.1%）**；≥5 条评论仅 **51 帖（3.6%）**                                          |

**读法**：upvotes 主要反映"发帖时间早 + 标题党"而不是工程质量；comments 多则说明有人真的在讨论（如 #3456 EasyRewrite 29 条、#2564 witness 套件 25 条、#1565 topology 23 条）。**本次精选以讨论正文的设计叙述 + repo 活跃度/许可证 + 是否使用官方扩展面为主，不以票数为准。**

### 1.3 高票 / 高讨论帖（原始信号）

- 高票插件帖：#2114 GenUI（10u）、#4303 dsh-agent-team（8u）、#505 dsh-codex-provider（8u）、#4813 llm-mantle（8u）、#5931 dsh-opencode-session（8u）。
- 高评论帖：#3456 EasyRewrite（29c）、#2564 crash-surviving 套件（25c）、#1739 dsh-diagnose（23c）、#1565 topology（23c）、#2687 插件市场（21c）、#1597「1700+ 插件怎么找」（19c）、#2038 testkit（17c）。
- 注意：#1588（Termux 补丁，9u）与 #2004（分类守则，13u）不是插件发布。

---

## 2. 精选插件表

> 标准：① 使用官方扩展面（bundle/client/waterfall/slot），不是 fork 内核；② 讨论正文或 README 有一手设计叙述（机制、取舍、验证方式）；③ repo 元数据可核对（license、最近 push）。star 为 2026-09-19 快照。标注「已评估」的见 `docs/research/2026-09-18-dsh-plugin-installation.md`，本文不重复展开。

### 2.1 IM / 渠道桥接

| 项目                                                | 讨论帖                                                                                                                                                | 做什么                                                                                              | 信号                                                          | 为什么值得看                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **xmanrui/dsh-im**（已评估）                        | [#2308](https://github.com/deepseek-ai/deepseek-harness/discussions/2308) / [#5080](https://github.com/deepseek-ai/deepseek-harness/discussions/5080) | 扫码/凭据接入 9 种 IM，每渠道多 bot，设置页统一管理                                                 | 1390★ · push 09-16 · MIT                                      | 多 bot 管理与设置 UI 的社区参照物；BotHarness IM 适配的基线已在既有调研中                          |
| **wz-heng/dsh-feishu-bridge**                       | [#1284](https://github.com/deepseek-ai/deepseek-harness/discussions/1284)                                                                             | fail-closed 的飞书桥：验签/时间窗/防重放在桥自身边界强制，Allow/Deny 审批卡                         | 4★ · push 09-08 · MIT · Python                                | §4.2 深读：安全姿态与"不信任下游 SDK"的一手案例                                                    |
| **fan56/dsh-feishu** + **fan56/dsh-ask-router**     | [#4610](https://github.com/deepseek-ai/deepseek-harness/discussions/4610)                                                                             | 驱动**已有** DSH 会话：`/resume` 选择器、状态卡、`ask_user_question` 变飞书表单；多端问询先答者胜   | 0★ · push 09-18/09-11 · 仓库暂无 license（帖子称 MIT，见 §5） | §4.4 深读：把"审批/问询"延伸到 IM 的完整交互链                                                     |
| **tencent-connect/dsh-qqbot**                       | [#4818](https://github.com/deepseek-ai/deepseek-harness/discussions/4818)                                                                             | 腾讯官方出品的 QQ 渠道插件，peer-map 即渠道权威源，PR 栈接入渠道投影                                | 101★ · push 09-08 · MIT                                       | 厂商自建适配器的样本；"渠道会话"数据模型（c2c/group 投影）                                         |
| **RGarvel/dsh-channel-view** + **dsh-channel-spec** | [#4818](https://github.com/deepseek-ai/deepseek-harness/discussions/4818)                                                                             | 侧栏 Channels tab 按渠道分组全部会话；配套 RFC-0001（session header `channel` 字段 + 官方渠道视图） | 1★ · push 09-04/08-28 · 未声明 license                        | §6 watchlist：纯官方扩展面（footer.action + sessionProjections + portal）零宿主改动做"roster 视图" |
| **amlyczz/dsh-lark-link**（已评估）                 | 本分类无发帖                                                                                                                                          | 高可靠飞书/Lark 桥：扫码授权、卡片命令、零丢失 outbox、媒体收发                                     | 39★ · push 09-18 · MIT                                        | 可靠性模式（outbox/去重）已在既有调研；无需重复                                                    |
| **imetn/dsh-lark-bridge**（已评估）                 | 本分类无发帖                                                                                                                                          | 双向 Lark 控制器：`/lark` 命令、群/线程路由                                                         | 6★ · push 08-14 · MIT · 自述 tested with 0.1.0-rc.6           | 群/线程路由参考；版本已落后，按只读参考对待                                                        |
| **LamplitIsles/keet-for-agent**                     | [#5806](https://github.com/deepseek-ai/deepseek-harness/discussions/5806)                                                                             | 让 Agent 走 Keet 的 P2P 私聊/群聊（无服务器、无中间人）                                             | 5★ · push 09-18 · Apache-2.0                                  | 非主流渠道形态（P2P）；远程协作场景的另类样本                                                      |
| **STARDUSTLC666/dsh-email**                         | [#528](https://github.com/deepseek-ai/deepseek-harness/discussions/528)                                                                               | IMAP/SMTP 收发/搜索/回复、多账号设置页、Outlook OAuth2、**发信审批**                                | 14★ · push 09-18 · MIT                                        | "agent 邮箱"的完整实现；发信审批 + 凭据管理可参考                                                  |
| **happyren/dsh-agent-messaging**                    | [#544](https://github.com/deepseek-ai/deepseek-harness/discussions/544)                                                                               | 跨会话 agent 消息、claims 与决策账本（防两个会话重复/矛盾/死锁）                                    | 6★ · push 09-12 · MIT                                         | agent-to-agent 协作的账本化思路，和 team/mailbox 路线互补                                          |

其他渠道向：`HiQ-AI/dingtalk-dsh-assistant`（钉钉群助理，6★，无 license）、`AtinyFurina/dsh-adapter-feishu`（长连接飞书适配，1★）、`Culeot/dsh-weixin-bridge`（微信 iLink，仓库描述只有 "test"，2★）、`ly6170/dsh-messager`（多 IM 通知推送，2★）、`LamplitIsles/dsh-mail`（Cloudflare 邮件，1★）。另有一篇不依赖仓库的工程方案值得记结论：[#4733](https://github.com/deepseek-ai/deepseek-harness/discussions/4733) 飞书授权卡片（approval-feishu + 状态文件轮询 + 卡片模式匹配铁律 + 超时竞态修复），与 dsh-im 零修改协作。

### 2.2 Memory / persona / 持久身份

| 项目                                                         | 讨论帖                                                                                                                                                | 做什么                                                                                          | 信号                             | 为什么值得看                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| **PerryLink/dsh-memento**                                    | [#1809](https://github.com/deepseek-ai/deepseek-harness/discussions/1809) / [#2501](https://github.com/deepseek-ai/deepseek-harness/discussions/2501) | typed `ctx.memory` seam + SQLite provider + 冻结快照注入；写操作在 service 层过审批门           | 103★ · push 09-18 · Apache-2.0   | §4.5 深读：记忆作为"能力接缝"而非仓库；含 memory-protocol v1 与适配器       |
| **yuhui-sama/dsh-agentsoul**                                 | [#1478](https://github.com/deepseek-ai/deepseek-harness/discussions/1478)                                                                             | SOUL/IDENTITY/USER/STATE 四层人格文件 + 记忆捕获/蒸馏 + 故障隔离                                | 2★ · push 08-15 · MIT · 35 单测  | §4.6 深读：与 PersonaBot「人格是人写的记忆」最接近的社区实现                |
| **lynsucceed/dsh-openclaw-persona**                          | [#3834](https://github.com/deepseek-ai/deepseek-harness/discussions/3834)                                                                             | OpenClaw 五件套（SOUL/IDENTITY/USER/MEMORY/TOOLS.md）搬进 DSH，侧栏编辑、保存即生效、项目级覆盖 | 1★ · push 08-22 · MIT            | 人格文件的组合顺序与两级回退；mtime 缓存保 KV-cache                         |
| **fan56/dsh-topics-memory**                                  | [#5805](https://github.com/deepseek-ai/deepseek-harness/discussions/5805)                                                                             | "记忆是编辑出来的"：topic = 起始问题+结论+影响+依赖；免 LLM 热路径注入、预算封顶、git 可追溯    | 0★ · push 09-14 · 仓库无 license | §4.8 深读：与我们的 memory tree/注入规则直接对话的一套反面参照              |
| **hr98w/dsh-memory**                                         | [#5678](https://github.com/deepseek-ai/deepseek-harness/discussions/5678)                                                                             | Claude Code auto-memory × Codex session 整理；Global/Workspace MEMORY.md；含 LoCoMo 测评        | 25★ · push 09-10 · MIT           | 文件式记忆 + host 校验/revision check + 诚实的测评边界说明                  |
| **Spirtxiaoqi7/mindspace-dsh-session-memory** + `-local-rag` | [#516](https://github.com/deepseek-ai/deepseek-harness/discussions/516) / [#1109](https://github.com/deepseek-ai/deepseek-harness/discussions/1109)   | 会话隔离的可编辑个性化记忆 + 可治理双库本地 RAG（向量+BM25+/RRF、来源追溯、降级）               | 3★ / 2★ · push 09-14/08-21 · MIT | 双插件解耦、数据归属清晰；RAG 拒绝对每轮 Prompt 强注入                      |
| **dearbld/dsh-living-memory**                                | [#5810](https://github.com/deepseek-ai/deepseek-harness/discussions/5810)                                                                             | 自维护记忆：夜间巡检去重/相似合并/时间衰减/冲突标记 + 七路 RRF 召回 + 知识图谱                  | 1★ · push 09-18 · MIT            | "记忆需要自我维护"的完整机制列表；SQLite 单文件、无遥测                     |
| **plastic-labs/dsh-honcho**                                  | [#6653](https://github.com/deepseek-ai/deepseek-harness/discussions/6653)                                                                             | 服务端 reasoner 构建"关于你的模型"，`session/event` 游标采集、`systemPrompt.context()` 注入     | 3★ · push 09-18 · MIT            | 跨 harness 共享记忆（同一 config 服务 Claude Code/Codex）；架构文档值得一读 |
| **ccch713/deepddw**                                          | [#6787](https://github.com/deepseek-ai/deepseek-harness/discussions/6787)                                                                             | 局域网小团队共享工作台：多用户记忆/知识库隔离 + 团队记忆治理                                    | 9★ · push 09-16 · MIT            | "多租户/团队记忆"边界处理；和我们的 roster/多用户方向相关                   |
| **yj-liuzepeng/dsh-project-brain**                           | [#5121](https://github.com/deepseek-ai/deepseek-harness/discussions/5121)                                                                             | 项目维度、跨 session 的开发维护记忆（架构分析、TODO、可选混合检索）                             | 20★ · push 09-17 · MIT           | "workspace 即记忆边界"的另一种实现                                          |

其他可记：`QIANLING-0831/dsh-memory-plus`（8★，CJK tokenizer 修复 + 工具结果去重，[#3202](https://github.com/deepseek-ai/deepseek-harness/discussions/3202)/[#3206](https://github.com/deepseek-ai/deepseek-harness/discussions/3206)）、`dreamor/MemVault`（Rust/MCP，跨 harness 共享 SQLite + 审核收件箱）、`hyls9527/dsh-plugins`（hermes-agent 的 MEMORY.md/USER.md 移植，**仓库现已 404**，见 §5）。

### 2.3 多 Agent 团队 / 委派

| 项目                                | 讨论帖                                                                    | 做什么                                                                                    | 信号                          | 为什么值得看                                                               |
| ----------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| **wowyuarm/dsh-agent-team**         | [#4303](https://github.com/deepseek-ai/deepseek-harness/discussions/4303) | 持久 Team mode：Agent 一等成员（各自 memory/notes/skills）+ Workspace/Channel/Task Thread | 31★ · push 09-19 · MIT        | §4.1 深读：与 PersonaBot + roster + 委派最同构的社区实现                   |
| **toolclub/dsh-agent-team-gui**     | [#1785](https://github.com/deepseek-ai/deepseek-harness/discussions/1785) | 可复用 planner/implementer/reviewer 团队：成员级模型/工具策略、Run Center、配方导入       | 176★ · push 09-18 · MIT       | §4.3 深读：团队工程化（预算软限制、recipe、显式 Team/Solo/Inherited 模式） |
| **PerryLink/dsh-background-agents** | [#2487](https://github.com/deepseek-ai/deepseek-harness/discussions/2487) | 官方 subagent seam 上的持久子 agent + 团队房间（消息总线/任务板/审批交接/时间线）         | 16★ · push 09-18 · Apache-2.0 | 只用官方接缝做后台续命 agent；侧栏面板可跳转/发消息/打断                   |
| **Mlte0907/dsh-teams-x**            | [#5819](https://github.com/deepseek-ai/deepseek-harness/discussions/5819) | captain/members + 任务 DAG + JSONL mailbox + 尝试-id 能力 + 全 SVG 活动面板               | 0★ · push 09-16 · MIT         | 状态在 `.teams-x/` 原子写 + 自愈索引；`compat.ts` 隔离宿主 API；143 用例   |
| **Hyperionjust/dsh-tool-underseal** | [#498](https://github.com/deepseek-ai/deepseek-harness/discussions/498)   | 委派授权的 hash 密封（多模型协作时防篡改/越权）                                           | 2★ · push 08-14 · Apache-2.0  | 委派链上的授权完整性模式；与审批门互补                                     |
| **ZG2017/dsh-plugin-insight-mode**  | [#5307](https://github.com/deepseek-ai/deepseek-harness/discussions/5307) | master/worker 深度研究：先澄清需求 → 人工批准任务拆分与预算 → 再并行派工                  | 1★ · push 09-01 · MIT         | "审批门在工作开始前"的交互序列；budget 作为委派前置条件                    |
| **february2015/dsh-taskswarm**      | [#1112](https://github.com/deepseek-ai/deepseek-harness/discussions/1112) | waves/lanes 并行 + git worktree 隔离 + 跨模型评审 + 崩溃恢复                              | 3★ · push 08-16 · MIT         | 任务编排的波次模型与 worktree 隔离                                         |
| **1052326311/dsh-plan-lattice**     | [#1577](https://github.com/deepseek-ai/deepseek-harness/discussions/1577) | 长任务"执行期漂移防火墙"（实测：陈旧变更 12/12 → 0/12）                                   | 3★ · push 08-31 · MIT         | 长任务可靠性验证方法（带对照组数字）                                       |
| **pacoyi/dsh-a2a-trust**            | [#6095](https://github.com/deepseek-ai/deepseek-harness/discussions/6095) | 为 spawn 出的 teammate 做四维 EWMA 信任评分账本（按 agent 类型跨会话累积）                | 0★ · push 09-14 · MIT         | 团队协作中的信任/审计视角                                                  |
| **yyyy231209/ai-company-framework** | [#3273](https://github.com/deepseek-ai/deepseek-harness/discussions/3273) | 面向小白的多 Agent "AI 公司" starter kit（14 skills/7 模板，含飞书遥控）                  | 8★ · push 08-22 · MIT         | 声明式公司规格 + 角色技能的组装方式；README 自述不是 runtime（诚实边界）   |

### 2.4 Roster / 客户端 UI

| 项目                                    | 讨论帖                                                                    | 做什么                                                                                | 信号                          | 为什么值得看                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| **miuzel/dsh-subagent-ui**              | [#4876](https://github.com/deepseek-ai/deepseek-harness/discussions/4876) | 会话头部注入"子代理管理"按钮：可搜索面板、按工作区/状态/类型筛选、活跃浮窗            | 3★ · push 09-12 · MIT         | §4.9 深读：最接近 roster 的社区 UI；`{parentSessionId, childSessionId, mode}` 精确寻址 |
| **qidiai/dsh-contrib-topology**         | [#1565](https://github.com/deepseek-ai/deepseek-harness/discussions/1565) | 运行时插件依赖图（plugin/service 节点、inject 边、fiber 生命周期）SVG 可视化          | 1★ · push 08-16 · MIT · 23c   | §4.7 深读：外挂插件接入官方契约（三处 wiring + TS5055 坑）                             |
| **Happy2Git/dsh-compass**               | [#1989](https://github.com/deepseek-ai/deepseek-harness/discussions/1989) | 右侧固定面板：惰性文件树 + 只读 git 提交图 + 本次会话注入的上下文清单 + 日志 ZIP 导出 | 2★ · push 08-18 · MIT · 13c   | "会话上下文透明化"（注入清单）对可观测性有参考                                         |
| **Renzic-Stone/DSH-EasyRewrite**        | [#3456](https://github.com/deepseek-ai/deepseek-harness/discussions/3456) | 气泡内联编辑 + 撤回 + 无痕替换 + 版本翻页；只用官方 keyed 槽/fork RPC/组件            | 115★ · push 09-18 · MIT · 29c | 讨论区最热帖；"只用官方扩展点、卸载即还原"的工程纪律与草稿持久化/备份体系              |
| **SiriLee/dsh-rewind**                  | [#4592](https://github.com/deepseek-ai/deepseek-harness/discussions/4592) | 同窗口原地回退（仅对话 / 对话+代码），追加式日志不删除、写前备份落盘                  | 76★ · push 09-18 · MIT        | "非破坏性回退"的实现契约；npm 同名撞车教训（须装 `dsh-rewind-plugin`）                 |
| **uluckystar/dsh-client-ui-side-tasks** | [#1712](https://github.com/deepseek-ai/deepseek-harness/discussions/1712) | 主对话右侧临时任务面板：fork 当前会话、用完即删零残留、1 小时自动清理                 | 2★ · push 08-14 · 无 license  | 临时任务生命周期管理；对 roster 的"临时成员"设计有参考                                 |
| **wolfsonliu/dsh-file-explorer**        | [#5921](https://github.com/deepseek-ai/deepseek-harness/discussions/5921) | 会话内文件浏览器 + 可扩展预览器（独立预览插件：代码/分子/序列）                       | 0★ · push 09-01 · MIT         | "核心 + 扩展预览器"的插件组合模式                                                      |
| **HarcoChen/dsh-vsc-integration**       | [#5275](https://github.com/deepseek-ai/deepseek-harness/discussions/5275) | VS Code / IntelliJ 集成：原生 diff、工具审批、持续会话、Trace                         | 14★ · push 09-17 · MIT        | 客户端 bridge 的另一条路线（编辑器宿主）                                               |

### 2.5 市场 / 安装 / 兼容

| 项目                                          | 讨论帖                                                                    | 做什么                                                                                        | 信号                               | 为什么值得看                                                |
| --------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| **dsh-market/dsh-market**（已评估）           | 本分类无发帖                                                              | 设置页插件市场：搜索/一键装、热启停、备份恢复、加载顺序诊断；awesome-dsh-plugin 数据源        | 4152★ · push 09-19 · MIT · 84 open | 既有调研已评估（安装机制、限制）；仍是生态市占第一          |
| **LivXue/dsh-plugin-shop**                    | [#5867](https://github.com/deepseek-ai/deepseek-harness/discussions/5867) | 每日全量爬取 npm/GitHub 出目录（9,753 收录/11,614 过滤）；用 DSH 自己的安装器；零特权 UI      | 805★ · push 09-18 · Apache-2.0     | §4.11 深读：catalog 机制与诚实姿态，对 M7 registry 最有参考 |
| **uluckystar/dsh-plugin-market**              | [#2687](https://github.com/deepseek-ai/deepseek-harness/discussions/2687) | 生命周期四分离（装/启/停/卸）+ 不兼容拒绝启用 + 配置备份校验回滚 + 一键自动重启（全环境）     | 2★ · push 08-20 · MIT · 21c        | 状态机与写配置安全；mydsh.dev 数据源                        |
| **Shizuku-keop/dsh-compat-guard**             | [#4487](https://github.com/deepseek-ai/deepseek-harness/discussions/4487) | 升级门（preflight）+ per-profile lockfile/快照/回滚 + 存储格式指纹 + 兼容矩阵 CI              | 1★ · push 08-25 · MIT              | §6 推荐精读：与我们 M3.5 安装验证门同一问题域               |
| **rogerdigital/dsh-vet**                      | [#5423](https://github.com/deepseek-ai/deepseek-harness/discussions/5423) | 安装前静态审计：`dsh-vet/v1` 报告 + 严重度×置信度分级 + 规则公开可辩 + 自审计                 | 2★ · push 09-11 · MIT              | 插件预审的开放标准与"低置信度不计入评级"设计                |
| **moonquake2004/dsh-doctor** + `dsh-security` | [#6678](https://github.com/deepseek-ai/deepseek-harness/discussions/6678) | 40+31 项检查；**dsh 起不来时的离线自救**（boot-check 子进程分类失败、quarantine、safe-add）   | 3★ · push 09-16 · MIT              | 离线诊断/隔离是安装门失败路径的范本                         |
| **KaramachiA217/dsh-bundle-manager**          | [#2875](https://github.com/deepseek-ai/deepseek-harness/discussions/2875) | 运行时挂载/卸载（`ctx.loader.create/remove`）：零重启、不写 profile manifest、预设、看门狗    | 1★ · push 08-19 · MIT              | 与官方"bundle 变更必须重启"的边界直接对照（未验证其稳定性） |
| **sandbaseai/dsh-plugin-store**               | [#3467](https://github.com/deepseek-ai/deepseek-harness/discussions/3467) | 官方 Settings 内的 Community/Installed 双视图 + Live Loader inventory + agent 发现工具        | 3★ · push 08-20 · MIT              | 原生 UI 集成与 leaderboard 信号                             |
| **bobby-sheng/dshget-plugin**                 | [#3274](https://github.com/deepseek-ai/deepseek-harness/discussions/3274) | 会话内搜索/查看/安装 catalog；模型工具**只读**，安装仅人工 slash 命令、固定参数数组不经 shell | 0★ · push 08-19 · MIT              | 安全边界：模型不能自行安装软件                              |
| **czj-git/dsh-plugin-hub**                    | [#4997](https://github.com/deepseek-ai/deepseek-harness/discussions/4997) | 设置页市场 + **可解释排行**（日增 star/总 star/新收录/最近活跃，不做黑盒综合分）              | 1★ · push 09-03 · MIT              | 排行信号的透明化设计                                        |

### 2.6 可靠性 / 通知 / 可观测

| 项目                                         | 讨论帖                                                                                                                                                | 做什么                                                                                     | 信号                                    | 为什么值得看                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------- |
| **iiwish/dsh-testkit**                       | [#2038](https://github.com/deepseek-ai/deepseek-harness/discussions/2038)                                                                             | 真实宿主生命周期测试门：Docker 里装精确 DSH → 启动 → 注册 → 能力调用 → 卸载 → 重启         | 1★ · push 09-12 · MIT · 17c             | §4.10 深读：与我们 M3.5 gate 最同构的工具（当前只支持 rc.6，见 caveat）    |
| **Wang-Lin-Chang/dsh-witness**（6 插件套件） | [#2564](https://github.com/deepseek-ai/deepseek-harness/discussions/2564)                                                                             | 崩溃存活后台任务（文件系统为真源、跨重启接管、autopsy）+ 锚点协议 + 三平台沙箱 + 持久调度  | 0★（witness） · push 08-26 · Apache-2.0 | "每个能力声明带实验编号与对照组"；时钟乱序 fuzz；诚实边界（at-least-once） |
| **bululuburuarua666/dsh-herald**             | [#6624](https://github.com/deepseek-ai/deepseek-harness/discussions/6624)                                                                             | 三通道通知：页内 toast / 浏览器横幅 / **宿主进程直发 OS 通知**（浏览器关闭也送达）         | 2★ · push 09-06 · MIT                   | 通知投递架构（host 是 notifier）+ 防轰炸/注入安全/增量同步                 |
| **PerryLink/dsh-auto-review**                | [#1837](https://github.com/deepseek-ai/deepseek-harness/discussions/1837) / [#5016](https://github.com/deepseek-ai/deepseek-harness/discussions/5016) | 第二模型自动审查审批请求：只读 reviewer 返回结构化 allow/deny，**fail-closed**，全程可审计 | 182★ · push 09-19 · Apache-2.0          | 审批链上的自动审查模式；审计轨迹（asked→verdict→decided）                  |
| **wangxing-git/dsh-autogate**                | [#2678](https://github.com/deepseek-ai/deepseek-harness/discussions/2678)                                                                             | 半自动/全自动审批：确定性规则 + LLM 审查 + 人工兜底；auto 模式不放宽沙箱、fail-closed      | 3★ · push 09-03 · MIT                   | 审批自动化的规则分层与安全默认                                             |
| **Frost-Reed/blocker-notify**                | [#1057](https://github.com/deepseek-ai/deepseek-harness/discussions/1057)                                                                             | Agent 被卡住（审批/沙箱拒绝/等待回答）时横幅 + 侧栏黄点闪烁，回应后自动安静                | 1★ · push 08-14 · MIT                   | "被阻塞"事件的 UI 表达；状态恢复语义                                       |
| **linyp/dsh-plugin-langfuse**                | [#1007](https://github.com/deepseek-ai/deepseek-harness/discussions/1007)                                                                             | 把 agent 会话导出为 OTel GenAI trace tree 到 Langfuse                                      | 13★ · push 09-10 · MIT                  | 标准遥测接入（GenAI semconv）                                              |

### 2.7 元生态 / 分发 / 迁移互操作

| 项目                                                | 讨论帖                                                                                                                                                                                                                                                                                                        | 做什么                                                                                                                                                       | 信号                                      | 为什么值得看                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------ |
| **awesome-dsh-plugin/awesome-dsh-plugin**（已评估） | 被 108 帖引用（如 [#1012](https://github.com/deepseek-ai/deepseek-harness/discussions/1012)）                                                                                                                                                                                                                 | curated 清单/registry，dsh-market 数据源                                                                                                                     | 16202★ · push 09-19 · CC0-1.0             | 生态事实标准清单（既有调研已评估）                                       |
| **sandbaseai/sandbase-harness**                     | [#1918](https://github.com/deepseek-ai/deepseek-harness/discussions/1918)                                                                                                                                                                                                                                     | 自托管 Agent runtime + MCP bridge：持久会话/沙箱/内存/凭据/审计回放 + 本地 Console + Skills 安装器                                                           | 646★ · push 09-19 · Apache-2.0            | 以 MCP 子进程接入 DSH 的"外置 runtime"形态；六个 `mcp__sandbase__*` 工具 |
| **amplifthq/oh-my-dsh**                             | [#3113](https://github.com/deepseek-ai/deepseek-harness/discussions/3113)                                                                                                                                                                                                                                     | overlay 发行版（不是 fork）：层栈在 web-app 之后、用户 patch 之前；治理化自进化（proposal plane + eval）                                                     | 16★ · push 09-05 · MIT                    | "发行版/overlay"打包哲学；`prepare→inspect→approve→commit→verify` 提案面 |
| **PerryLink/dsh-plugin-guide**                      | [#1824](https://github.com/deepseek-ai/deepseek-harness/discussions/1824)                                                                                                                                                                                                                                     | 把插件开发知识库做成可安装 skill：官方文档归档 + 114 repo 档案 + 1654 讨论帖 + 坑位                                                                          | 40★ · push 09-15 · Apache-2.0             | 知识库随版本锚定（anchor 校验），过期会大声失败                          |
| **dsh-import / bridge 系**                          | [#1362](https://github.com/deepseek-ai/deepseek-harness/discussions/1362) / [#5213](https://github.com/deepseek-ai/deepseek-harness/discussions/5213) / [#2833](https://github.com/deepseek-ai/deepseek-harness/discussions/2833) / [#1672](https://github.com/deepseek-ai/deepseek-harness/discussions/1672) | 迁移/兼容：`Chang-Tong/dsh-import-agents`（18★）、`YTyangtao666/dsh-skills-bridge`（2★）、`biedongbin/dsh-claude-compat`（13★）、`sjh9714/dsh-movein`（13★） | 均 MIT（movein 另有 Codex/OpenCode 支持） | 迁移他把 harness 的资产（skills/history/agents）的模式                   |

---

## 3. 已评估项处理

- **xmanrui/dsh-im / amlyczz/dsh-lark-link / imetn/dsh-lark-bridge**：本分类仅 dsh-im 有发布帖（#2308/#5080）；lark-link 与 lark-bridge 在本分类**无帖**（0 命中），按既有调研结论处理，本次只更新元数据（star/push/license）。
- **dsh-market / awesome-dsh-plugin / Noob-stupid/dsh-plugin-gating-hub**：均在本分类之外或以引用出现；沿用 `docs/research/2026-09-18-dsh-plugin-installation.md` 的结论，不重复深读。生态数据点已变：dsh-market 4152★/84 open issues；gating-hub 86★（push 09-19）；awesome 清单 16202★。
- dsh-im 的 GitHub 仓库描述与帖子口径一致（9 渠道），star 从早期快照显著增长（当前 1390★），仍为 MIT、持续更新（push 09-16）。

---

## 4. Top 10 深度解读

### 4.1 wowyuarm/dsh-agent-team — 持久 Agent 团队（`#4303`，31★）

- **形态**：npm bundle（`@wowyuarm/dsh-agent-team`），opt-in 的 Team mode 建在普通 Web UI 里；认证基线 DSH `0.1.5-rc.1`，peer range `>=0.1.5-rc.1 <0.1.6`。
- **关键设计**：
  - **Agent 是一等成员而非会话**：每个成员有独立 memory、notes、skills 与职责边界；所有成员共享一个项目 Workspace，多 Workspace 管理多支团队。
  - **人类管 Channel 与职责**，@mention 路由工作；**Task Thread** 把一行工作的 Claims、交接、人工验收、回复收在同一个持久上下文里。
  - **成员自管上下文**：`context_rollover` 刷新上下文后继续待命，`context_timeline`/`context_checkpoint` 回到旧锚点；切换/重启不丢待决事项。
  - **Human Inbox** 把"需要你的未读 Thread"置顶。
- **可借鉴点**：成员身份跨 session/上下文滚动保持（记忆/笔记/技能随身份走）；"Channel 分责 + Thread 保上下文"的双层信息架构；待决事项跨重启存活。
- **与 BotHarness 的关联**：这是社区里与 PersonaBot（persona + 文件式记忆 + roster）最同构的实现，可作为"团队态 roster"的对照样本；其"人类决定谁在哪个频道"与我们 roster/委派分工同题。
- **Caveat**：0.1.5-rc 系认证，预览期兼容声明不强制；无第三方审计；讨论帖 4 条评论，尚无大规模实证。未安装验证。

### 4.2 wz-heng/dsh-feishu-bridge — fail-closed 飞书桥（`#1284`，4★）

- **形态**：Python 社区插件，通过官方 `deepseek-harness-sdk` 子进程边界驱动 dsh，不 fork 内核；MIT，push 09-08。
- **关键设计**：
  - **白名单默认全拒**（空名单无人可用），杜绝"空配置=全员可用"。
  - **webhook 验证在桥自身边界完成**：`sha256(timestamp+nonce+encrypt_key+body)` 验签 + ±300s 时间窗 + `(timestamp, nonce)` 重放去重，全部在消息处理之前；未配全不允许启动。
  - **会话归创建它的 chat 所有**，无跨 chat 列举/劫持；卡片按钮一次性、绑定身份。
  - **上游安全发现**：`lark-channel-sdk` 未配 encrypt key 时验签静默跳过、不查时间戳新鲜度、不防重放 → 已上报 larksuite/channel-sdk-python#11/#12；本桥的对策是"绝不把下游 SDK 当安全边界"。
  - 诚实边界：按 turn 回复（非流式）、无工具审批 UI、会话仅进程内粘性。
- **可借鉴点**：验证/授权必须发生在自己的边界；依赖库的安全语义必须实测（不能只看文档）；空配置的安全默认值。
- **与 BotHarness 的关联**：直接影响我们飞书适配的威胁模型（验签、重放、会话归属、崩溃后会话粘性）；其"绝不信任下游 SDK"的原则适用于我们的凭据与 webhook 路径。
- **Caveat**：131 测试但真实 SDK smoke 为 opt-in；v1 限制多（无审批 hook）；Python 栈与我们的 TS 栈不同，学模式不学代码。

### 4.3 toolclub/dsh-agent-team-gui — 可复用团队工程化（`#1785`，176★）

- **形态**：Web profile 插件，在 composer 旁选择"已保存的多模型团队"，Run Center 检查计划、成员输出、review/repair 阶段与 provider 报告的 token。
- **关键设计**：
  - 成员级模型/角色/回退路由/工具策略；Team/Solo/Inherited 三种显式模式；凭据无关的 JSON recipe + 版本快照 + **预览优先导入**。
  - Run record：有界计划、取消、链接式重试、可选 review/repair；team budget 是软调度限制。
  - 提供预编译 release tgz 安装路径（绕开 git `prepare`/`allowBuilds`）；声明 DSH range `>=0.1.5-rc.1 <0.1.6`。
- **可借鉴点**：团队配置的可移植格式（recipe + placeholder → 本地映射）；"预览-导入"的安全惯例；成员级模型策略；讨论帖对反馈诉求写得具体（是否安装成功/卡在哪一步/是否复用）——良好的反馈设计。
- **与 BotHarness 的关联**：与"默认可用的 planner/implementer/reviewer 团队 + 每成员模型策略"直接同题；recipe/导入导出可对照我们的配置面（未做建议）。
- **Caveat**：演示为产品截图合成旁白，非真实模型性能基准（帖子自述）；star 176 但讨论仅 6 条；token 报告可能不完整（帖子自述）。

### 4.4 fan56/dsh-feishu + dsh-ask-router — 从 IM 驱动已有会话（`#4610`）

- **形态**：飞书长连接 bot（纯出站 WS，无公网入口）+ 可选 ask-router；npm `@aiwayds/dsh-feishu`。
- **关键设计**：
  - `/new` 与 `/resume`（交互式会话选择器，**永不重复创建**）→ 手机上派活。
  - **实时状态卡**：30s 节拍原位更新 + turn/end 正文推送。
  - **问询卡**：agent 调 `ask_user_question` → 飞书表单卡片（单选/多选/文本）→ 结构化回流；配合 ask-router 实现"桌面 TUI 面板与手机卡片同时弹、先答者胜"。
  - operator 白名单兜底；凭证写 DSH credentials；安装需 `link-closure` 与 profile 手工接线（尚非一键）。
- **可借鉴点**：把"审批/问询"从 UI 弹窗延伸到 IM 的完整回路；多端问询的去重与胜出规则；状态卡原位更新（而非刷屏）；出站长连接避免公网入口。
- **与 BotHarness 的关联**：BotHarness 的"IM 上处理审批与提问"正需要这套交互链；"驱动已有会话"与我们 roster/委派下的人在环模型一致。
- **Caveat**：仓库暂无 license（帖子称 MIT）；两仓库均 0★、单作者；会话选择器与卡片 schema 依赖飞书 API 细节，跟进其 Windows/凭据路径需实测。

### 4.5 PerryLink/dsh-memento — 记忆是能力接缝（`#1809`/`#2501`，103★）

- **形态**：Apache-2.0，npm `dsh-memento`；typed `ctx.memory` seam + 本地零依赖 SQLite（WAL、0600、`$DSH_HOME/dsh-memento/memory.db`）+ `memory` 工具 + 冻结快照注入。
- **关键设计**：
  - **写审批门在 service 层**（`add/replace/remove/seed/consolidate`），模型路径无法绕过；`writePolicy: ask|auto|off` 对模型不可见；被拒写入仍留 `*-denied` 审计行。
  - **有界且诚实**：按 track/layer 硬字符预算（默认 user 2000/agent 4000），超限**结构化报错而非截断**；snapshot 每会话首次组装时冻结、mid-session 不变。
  - **模型可见 ⟺ 可重建**：注入快照逐字进 `system/message`；写入可从 `approval/asked`+`approval/decided`+审计表重建；对宿主未支持 `memory/*` 事件类型的"审计缺口"显式命名并自适应。
  - 0.4.0 起有 `ctx.memoryAdapters` 适配器注册表（mem0、Hermes memory.md、CLAUDE.md——**convert, never extract**）、22 用例一致性套件、双语 protocol-v1 文档与上游化提案。
- **可借鉴点**：把记忆作为"能力接缝"而非又一个仓库；审批门位置（service 内）与"预算失败要大声"；协议/适配器分离；对宿主缺口的诚实标注。
- **与 BotHarness 的关联**：与我们的文件式记忆（ADR 0002/0004、M 规则）是"SQLite seam vs 文件真源"的两条路线对照；其"写走审批 + 预算硬上限 + 快照冻结"与我们的记忆写入规则可直接对照；protocol v1 是可跟踪的上游化信号。
- **Caveat**：README 含 1024 store 渠道等营销行；SQLite 与文件式路线不同，不构成对我们的替代判断；未安装验证。

### 4.6 yuhui-sama/dsh-agentsoul — 人格文件 + 缓存友好注入（`#1478`，2★）

- **形态**：MIT，bundle 安装后自动全局加载；核心（personality/memory/context/distill）与宿主适配层解耦，适配集中在一个文件；35 单测 + CI。
- **关键设计**：
  - **四层人格文件**：SOUL.md（如何判断）/ IDENTITY.md（我是谁）/ USER.md（用户长期信息）/ STATE.md（当前状态），本地 Markdown、可读可改可迁移。
  - **注入策略**：SOUL/IDENTITY/USER 走 system prompt 稳定前缀（字节级恒定，命中 prefix cache）；STATE 与记忆走运行时上下文快照（自动取代、不累积，不击穿缓存）。
  - **记忆捕获/蒸馏**：只记用户文本与助手最终文本、按消息 ID 去重；未蒸馏消息到阈值后后台一次模型调用提炼 persona/episodic/instruction 三型记忆（new/skip/update 去重，单飞互斥 + 失败冷却防烧钱）。
  - **安全边界**：蒸馏只写蒸馏层、绝不改写人格文件；历史标注为不可信参考；人格文件缺失/损坏跳过、异常不阻断 Agent Loop。
- **可借鉴点**：人格文件的四层分工（稳定身份 vs 当前状态分离）；稳定前缀/动态尾部对 KV-cache 的意义；"蒸馏不写人格"的权限边界。
- **与 BotHarness 的关联**：与 PersonaBot 的 persona 定义（人写的记忆，ADR 0014）高度同构；其文件层级与注入顺序可直接对照我们的 persona + memory 注入设计。
- **Caveat**：2★/讨论 2 条，规模小；"字节级恒定"与缓存命中的实际收益未独立验证（帖子自述）；蒸馏用 GLM 免费模型的路径涉及第三方端点（默认走 ctx.llm）。

### 4.7 qidiai/dsh-contrib-topology — 外挂插件接入官方契约（`#1565`，1★/23c）

- **形态**：一个 Host Remote `graph()` 扫 `ctx.loader.entries()` 产出 `TopologySnapshot`，客户端在 Settings → Plugins 画 SVG；帖子同时是一份"三方插件如何进 monorepo"指南。
- **关键设计（帖子最具价值的部分）**：
  - 外挂插件要成为一等公民需动三处：根 tsconfig 双面 references；`dsh-api-remotes` 装配（peer/devDeps + 客户端 remote 注册）；**web roster**（`packages/bundle/web-app/cordis.patch.yml` 的显式清单——不在清单里"能编译但 UI 静默不出现"）。
  - TS5055 坑：双面包共享 `src/types.ts` 双侧输出互相覆盖，需各自 `tsBuildInfoFile`，且共享类型用相对路径导入。
  - 图模型：plugin 节点按 group（core/contrib/third-party）+ fiber 生命周期阶段；service 节点为 hub；`depends-on`/`provides`/`contains`/`disabled` 边。
- **可借鉴点**："编译成功 ≠ 注册成功"的 roster 机制；能力扫描（loader entries + inject 边）作为可观测性数据源；跨包类型构建的坑位清单。
- **与 BotHarness 的关联**：ADR 0022/0023（DSH 一致性 + 客户端 bridge）正好需要理解同一套装配面；该帖是"外挂包如何被官方 UI 看见"的一手经验。
- **Caveat**：该仓库 README 已改为 `ai-bridge` umbrella（描述与讨论帖略有漂移）；浏览器可视化在帖子时期仍待确认；包名用了官方 scope（`@deepseek-ai/dsh-contrib-topology`）但为个人仓库，命名有误导风险。

### 4.8 fan56/dsh-topics-memory — "记忆是编辑出来的"（`#5805`，0★）

- **形态**：OKF bundle，local-first；`/topics` 命令族；v0.9.0（帖子称 MIT，仓库尚无 license）。
- **关键设计（一篇少见的、把哲学写成可执行机制的设计文）**：
  - 每个 topic 只记**起始问题、结论、影响、依赖**（决策最小完备集）；过程不记——理由：过程无法标注时效、自带 priming、成本收益比最差。
  - **免 LLM 热路径注入**：CJK bigram + tag 加权 + depends 图游走，毫秒级、命中才注入；**零命中零注入 + 每轮约 1.5k token 封顶**；每次注入落日志（`/topics stats` 按证据调参）。
  - 知识成图：`depends` 机器可读边 + 正文 wikilink；改结论前先看 backlinks（blast radius）。
  - **git 可追溯**：一次结论变更 = 一个 commit；结论带 status/stale_after/verified 时效字段。
  - 自曝边界：编辑成本、翻案时过程已不在、确有"过程即结论"的题材。
- **可借鉴点**：注入预算化 + 零命中零注入；时效字段族；"起点问题即检索键"的索引观；用蒸馏的一次性注意力换常驻注意力。
- **与 BotHarness 的关联**：直接对话我们的 memory tree 注入（ADR 0004）——"什么值得进提示词"的编辑主义反面参照；其 backlink/blast-radius 与 git 追溯对记忆治理有参考。
- **Caveat**：0★、单作者；仓库无 license（正文称 MIT）——引用其思想前需注意；实测证据来自作者注入日志（未独立验证）。

### 4.9 miuzel/dsh-subagent-ui — 最接近 roster 的客户端插件（`#4876`，3★）

- **形态**：npm `dsh-subagent-workspace-ui`（v1.1.3），Cordis 客户端插件，向 `conversation.session.header.actions` 槽注入入口。
- **关键设计**：
  - 可搜索面板管理"当前运行时代理已发现的子代理"；按工作区/会话/分类/状态/类型筛选分组；本地分类支持自定义正则。
  - **精确寻址**：`{ parentSessionId, childSessionId, mode }` 打开子代理。
  - 活跃子代理浮窗显示实时输出/工具调用/上下文注入，可拖动。
  - **归档为浏览器本地状态，绝不删除 DSH 会话**（单向安全）。
- **可借鉴点**：roster 面板的信息架构（筛选/分组/浮窗）；精确的父子会话寻址；"UI 归档 ≠ 数据删除"的边界；用官方 slots + `ctx.sessions`，不碰内核。
- **与 BotHarness 的关联**：BotHarness 侧边栏 roster 的社区最近似实现，可作为 UI 交互与寻址模型的对照；其只读安全边界值得沿用。
- **Caveat**：3★；分类正则/实时流实现细节未读源码；未在 Windows 或飞书场景验证。

### 4.10 iiwish/dsh-testkit — 真实宿主生命周期测试门（`#2038`，1★/17c）

- **形态**：npm devDependency（`pnpm add -D dsh-testkit`），`dsh-test init` 离线生成 3 个可审核文件（`dsh-testkit.yaml` 场景、最小权限 GitHub workflow、项目内 SKILL.md），`dsh-test` 在一次性 Docker 里执行生命周期。
- **关键设计**：
  - 阶段链：`resolve → install-dsh → package → install-plugin → assemble → boot → register → exercise → update? → uninstall → reboot → recover? → cleanup`，模型无关、无需 API key。
  - 证据保留：JSON/JUnit/Markdown/脱敏日志/阶段证据；覆盖"tarball 缺文件、bundle 注册失败、卸载留残渣"这类编译/单测抓不到的发布问题。
  - `init` 幂等、不修改 package.json/lockfile/AGENTS.md；冲突或 symlink 路径在写入前失败。
  - 明确不宣称：不是安全认证、不是质量评测、不替代单测/静态 preflight。
- **可借鉴点**：把"安装→启动→注册→调用→卸载→重启"变成确定性 CI 证据；离线 scaffold + 最小权限 workflow；真实产物（npm pack）而非源码测试。
- **与 BotHarness 的关联**：与 M3.5 "本机装我们的 bundle 并验证"是同一问题域的现成实现；其阶段链可作为我们验证检查点的对照清单。
- **Caveat**：当前宿主支持写死 `@deepseek-ai/dsh@0.1.0-rc.6`（预览期需逐版本 canary）；需要 Docker；未验证在 WSL/Windows 路径下的表现。

### 4.11 LivXue/dsh-plugin-shop — 每日目录与安装边界（`#5867`，805★）

- **形态**：装进 DSH 的插件商店（Settings → Plugins → Plugin shop），背后是每日全量构建的 git 可审计 catalog：npm 关键词 `dsh-plugin`/`deepseek-harness` + GitHub topics 全量抓取（2026-09-06 构建：9,753 收录 / 11,614 过滤）。
- **关键设计**：
  - **拒绝有名有因**：机械门禁失败会生成带"作者可读原因"的具名拒绝，附在构建产物里，不是静默丢弃。
  - **兼容性在用户机器上解析**：目录只记录 peer 名称、不记录版本范围；安装时用本地 profile 解析（与 loader 挂载时问的问题一致），只有真的缺模块才标 Incompatible。
  - **使用 DSH 自己的安装器**：Install 走 `dsh plugin add`，商店不写 profile；永不提供"任意 URL 安装"按钮。
  - **零特权 UI**：浏览器半边只经少量 `shop/*` RPC，不碰网络/文件系统。
  - 诚实声明：无人工审核条目；每个安装需显式确认；"商店不是沙箱"——插件挂载即拥有完整 ctx。
- **可借鉴点**：catalog 构建（全量抓取 + 机械门禁 + 可审计 diff）；"只记录 peer 名、不判版本"的兼容哲学；安装动作复用官方 CLI；对安全姿态不粉饰。
- **与 BotHarness 的关联**：M7 registry/市场规划的强对照（数据源、审核信号、安装路径、安全文案）；其"catalog 不是沙箱"的边界表述可直接借用为文档口径。
- **Caveat**：805★ 但讨论仅 2u/1c，热度与讨论脱节；每日抓取 1.9 万候选的误收/漏收率未验证；`dsh.catalog` 自声明分类机制未细读。

---

## 5. 反面 / 需警惕样本（甄别用）

1. **链接已死**：`hyls9527/dsh-plugins`（hermes-agent 的 MEMORY.md/USER.md 移植，帖 [#525](https://github.com/deepseek-ai/deepseek-harness/discussions/525)）在 2026-09-19 已 **404**——生态早期 repo 改名/删除常见，任何"精读清单"都应带核对日期。
2. **license 与帖子口径不一致**：`fan56/dsh-topics-memory`、`fan56/dsh-ask-router` 帖子正文均写 MIT，GitHub API 返回 `license: none`（两个仓库，2026-09-19）。引用/移植其设计前需与作者确认。
3. **无 license 的活跃项目**：`HiQ-AI/dingtalk-dsh-assistant`（6★）、`Culeot/dsh-wechat-bot`（1★）、`RGarvel/dsh-channel-view`、`uluckystar/dsh-client-ui-side-tasks`（2★）、`YYTbit/awesome-dsh-bridges`（7★）、`ljsysfurryACE/dsh-memory-director`。另有 `NOASSERTION`：`Fallen0543/dsh-sidebar-files`、`Liyuan1992/memdsl`、`xiaowei2025cqu23phy/dsh-desktop`。
4. **低质发布信号**：`Culeot/dsh-weixin-bridge` 仓库描述就是 "test"（2★，08-15 后未更新）；[#2626](https://github.com/deepseek-ai/deepseek-harness/discussions/2626) memorylake 全文一句话 + "无限上下文"无证据（2u/1c）；#1059/#20 等非插件内容占据高票位。
5. **热度与质量脱节（生态级通胀）**：分类共 1425 帖但总票数仅 1866、最高 13 票、60% 零评论；同时 star 数在生态里普遍高企（awesome 清单 16202★、dsh-market 4152★、dsh-im 1390★；[#1103](https://github.com/deepseek-ai/deepseek-harness/discussions/1103) 记录 DSH 发布 1 天 46.8k star；[#2773](https://github.com/deepseek-ai/deepseek-harness/discussions/2773) 记录 `dsh-plugin` topic 3 天从 1,710 → 6,045）。**高 star ≠ 社区验证**；是否有组织化刷星无法从公开数据判定（未验证）。
6. **命名撞车严重**：至少 4 个不同 owner 的 `dsh-plugin-manager`（liqichen/PelyDeng/huabai-flowerwhite 等）、多份 `dsh-doctor`、`dsh-plugin-hub`（Noob-stupid 与 czj-git 两个）、`dsh-memory`（hr98w/LZMW/Culeot/QIANLING 同名不同物）；npm 上 `dsh-rewind` 是他人同名包，dsh-rewind 实际要装 `dsh-rewind-plugin`（帖内自述）。做 registry/安装门时必须按 owner/来源消歧，不能按包名。
7. **版本漂移风险清单**（非质量问题，但引用前须核）：`imetn/dsh-lark-bridge` 自述 tested with 0.1.0-rc.6（push 08-14）；`iiwish/dsh-testkit` 只支持 rc.6；`PerryLink/dsh-memento` 兼容到 0.1.6-alpha.2（README 2026-09-18 复核）；大量 08 月中旬的插件在 0.1.2+ 后无更新记录。
8. **帖子自述与实测未分离**：不少帖子用"完整/最全/稳如原生"等词但数据来自作者自己的机器（如 `Mlte0907/dsh-teams-x` 的 143 用例、`1052326311/dsh-plan-lattice` 的 12/12 对照组）；这些有具体方法可复核，比无数据的宣称可信，但仍属自证（未验证）。

---

## 6. 后续建议

**建议克隆精读（按优先级）**：

1. `wowyuarm/dsh-agent-team` — 团队/身份/频道/线程模型与本项目最同构（§4.1）。
2. `wz-heng/dsh-feishu-bridge` + `fan56/dsh-feishu`/`dsh-ask-router` — 飞书桥安全姿态与"审批/问询进 IM"完整回路（§4.2/4.4）。
3. `yuhui-sama/dsh-agentsoul` + `lynsucceed/dsh-openclaw-persona` — 人格文件层级与缓存友好注入（§4.6）。
4. `PerryLink/dsh-memento` + `fan56/dsh-topics-memory` — 记忆的 seam/审批/预算 与"编辑主义"两类设计（§4.5/4.8）。
5. `miuzel/dsh-subagent-ui` + `RGarvel/dsh-channel-view` — roster/渠道视图的官方扩展面用法（§4.9、§2.1）。
6. `iiwish/dsh-testkit` + `Shizuku-keop/dsh-compat-guard` + `moonquake2004/dsh-doctor` — M3.5 安装验证门与失败自救的三份现成交叉验证（§4.10、§2.5）。
7. `qidiai/dsh-contrib-topology` + `LivXue/dsh-plugin-shop` — 外挂装配契约与 catalog/registry 机制（§4.7/4.11）。
8. `PerryLink/dsh-background-agents` + `Wang-Lin-Chang/dsh-witness` — 持久子 agent 与崩溃存活任务的可靠性模式（§2.3/2.6）。

**只记结论、不必精读**：各类 provider/OAuth 插件（codex/claude/cursor 系列）、桌面/TUI/壁纸等壳与美化、余额/用量展示类、通知类（除 herald 的宿主直发通知架构）、以及已在既有调研覆盖的 dsh-market/awesome/gating-hub。市场类中 `uluckystar/dsh-plugin-market` 的"生命周期四分离 + 写配置回滚"与 `rogerdigital/dsh-vet` 的报告标准只需要记结论。

**建议持续跟踪（watchlist）**：

- `RGarvel/dsh-channel-spec`（RFC-0001，源自讨论 #3897）+ `tencent-connect/dsh-qqbot` 的渠道投影落地——若上游采纳 `session header channel` 字段，会影响我们渠道会话的数据模型。
- `PerryLink/dsh-memento` 的 `dsh-memory-protocol v1` 上游化提案 + `ctx.memoryAdapters`——若成为官方 seam，会改变记忆插件的生态位。
- `Shizuku-keop/dsh-compat-guard` 的兼容矩阵与 `moonquake2004/dsh-doctor` 的 `dsh-doctor/v1` envelope——预览期版本治理的事实工具链。
- `fan56/dsh-ask-router` 的"多端问询先答者胜"与 `bululuburuarua666/dsh-herald` 的宿主直发通知——人在环与通知投递的可靠路径。
- `dsh-market`（84 open issues）与 `LivXue/dsh-plugin-shop`（每日全量构建）的目录质量数据。

---

## 7. 未验证 / 存疑

1. **`upvoteCount` 是否包含作者自投**未验证；热度分析只做分布描述，不据此下质量结论。
2. **star 数是否被组织化刷高**未验证；仅做快照与 push/issue 活跃度核对。生态级膨胀有据（§5.5），个体无法判定。
3. **绝大多数仓库未读源码、未安装**：质量判断依据 = 讨论帖正文 + 少量 README 前段 + GitHub 元数据（license/push/issues）；「值得看」是学习价值判断，不是可用性认证。
4. **讨论帖正文可能含未兑现承诺**；「活跃」以 `pushed_at` 为准，未区分 force push/自动化提交。
5. 本分类 **无 dsh-lark-link / dsh-lark-bridge 发布帖**（关键词 0 命中），它们在哪个分类未定位。
6. 从正文抽取的 **573 个 npm spec 未逐个与仓库核对**；抽取正则可能漏抓 `-w`/镜像参数后的包名。
7. `qidiai/dsh-contrib-topology` 仓库 README 已转为 `ai-bridge` umbrella，与讨论帖内容存在漂移；帖子所述"接入三处 wiring"来自帖子自述。
8. 数据快照为 **2026-09-19**；此后新增讨论、字段变化（如 license 补写）不在覆盖范围。

---

## 8. 一手来源与访问日期

| 来源                                                                                                                                   | 支撑内容                                                                                 | 访问日期   |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| GitHub GraphQL `deepseek-ai/deepseek-harness` discussions 分类 `DIC_kwDOT3T1g84DDSUe`                                                  | 1425 帖全量（number/title/body/upvoteCount/comments/时间戳），本报告全部统计与引用的基线 | 2026-09-19 |
| 讨论帖 #4303 / #1785 / #5819 / #2487 / #498 / #5307 / #1112 / #1577 / #6095 / #3273                                                    | 团队/委派类设计叙述                                                                      | 2026-09-19 |
| 讨论帖 #1284 / #4610 / #4818 / #5806 / #528 / #544 / #2308 / #5080 / #4733                                                             | IM/渠道类设计叙述与安全发现                                                              | 2026-09-19 |
| 讨论帖 #1809 / #2501 / #1478 / #3834 / #5805 / #5678 / #516 / #1109 / #5810 / #6653 / #6787 / #5121 / #3202                            | Memory/persona 类设计叙述                                                                | 2026-09-19 |
| 讨论帖 #4876 / #1565 / #1989 / #3456 / #4592 / #1712 / #5921 / #5275                                                                   | Roster/客户端 UI 类设计叙述                                                              | 2026-09-19 |
| 讨论帖 #5867 / #2687 / #4487 / #5423 / #6678 / #2875 / #3467 / #3274 / #4997                                                           | 市场/安装/兼容类设计叙述                                                                 | 2026-09-19 |
| 讨论帖 #2038 / #2564 / #6624 / #1837 / #2678 / #1057 / #1007 / #1739                                                                   | 可靠性/通知/可观测类设计叙述                                                             | 2026-09-19 |
| 讨论帖 #3113 / #1918 / #1824 / #1362 / #5213 / #2833 / #1672 / #1103 / #2773 / #2031                                                   | 分发/迁移/生态数据                                                                       | 2026-09-19 |
| `gh api repos/<owner>/<repo>`（94 + 20 个仓库）                                                                                        | star/push/created/license/description/archived/open_issues 元数据快照                    | 2026-09-19 |
| README 抽查：wowyuarm/dsh-agent-team、PerryLink/dsh-memento、iiwish/dsh-testkit、yuhui-sama/dsh-agentsoul、qidiai/dsh-contrib-topology | 与帖子正文互证的关键机制（成员身份、审批门、Docker 生命周期、人格文件、接入契约）        | 2026-09-19 |
| 仓库内 `docs/research/2026-09-18-dsh-plugin-installation.md`                                                                           | 已评估项（dsh-im/lark-link/lark-bridge/dsh-market/awesome/gating-hub）与前序安装机制结论 | 2026-09-19 |
