# Awesome DSH 生态扫描 — BotHarness 可借鉴项

日期：2026-09-21

范围与方法：对 [0xsline/awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness)（README 22 个分类、约 1000 条条目，`main@fae2f165`，2026-09-17；完整目录见其 [CATALOG.md](https://github.com/0xsline/awesome-deepseek-harness/blob/main/CATALOG.md)，367 KB）做主题筛选，只对与 BotHarness 直接相关的五个主题、约 50 个仓库做一手核查。核查方式为 `gh api` 只读拉取 metadata / README / 指定源码文件，未 clone、未安装、未运行；每条结论标注验证等级（代码级 / README 级 / 仅索引）。dsh-external 组织仓库大多不可公开访问，已标出。

## 来源基线

- Awesome 列表本身是二手索引，本文所有机制结论均回到各仓库自己的 README 或源码；索引条目与实现不符之处在正文标出。
- 与我们已有调研的关系：本报告**不重复**以下已定案内容，只标注重叠：
  - `docs/research/2026-09-21-dsh-workspace-and-file-memory.md`（file-first、service-owned Memory 已定案）
  - `docs/research/2026-09-21-dsh-im-integration-strategy.md`（dsh-im 出站 `dshIm` / 入站无 seam / ADR-0011）
  - `docs/research/2026-09-20-dsh-assignment-runtime-seams.md`（`agents.create/resume`、`followup/steer/inject`、projection、`ctx.tools.restrict`）
  - `docs/research/2026-09-19-dsh-community-plugins-survey.md`（论坛 1425 帖扫描）、`docs/research/2026-09-19-dsh-market-deep-dive.md`
- 本轮相对上述文档的增量集中在：Memory 注入与审批的**机制级对照**、委派运行时的**可复用纪律与反模式**、IM 侧的**卡交互归属校验与确定性 session key**、roster 的**客户端扩展面**，以及 10 条候选 DSH 陷阱。

## 结论摘要

1. **Memory 不抄 store，抄三套纪律**：memento 的「审批在 owning module 内部 + 写入前 budget 预检 + 快照冻结」、engramory 的「index + 一事实一文件 + 硬帽只拦增长」、plur 的「注入卫生（sanitize / CJK 预算 / 丢弃阶梯）」。三者都不与「file-first、Git 才是 authority」冲突，反而补上了我们尚未决定的注入与写入细节。
2. **PersonaBot 的身份键没有现成答案，但有一条正确的契约**：所有社区插件最多做到 cwd / `agentPreset` / global 三级；mneme 源码注释给出了最接近的说法——「session 只是载体，`session_id` 永不作为作用域键」，`agent_scope=agentPreset`、`workspace_scope=canonical cwd`。BotHarness 的 scope 键应是 PersonaBot 标识，机械输入可以取自这两者，但不能停在它们。
3. **记忆能「到得了任何预设」的唯一通道是 `agent/pre-step` 合成 user 消息**：`systemPrompt.section()` 会被 persona `complete: true` 压掉，`systemPrompt.context()` 会被 `includeRuntimeContext: false` 压掉；官方 skill-catalog / AGENTS.md / time-context 走的是同一条合成消息路径，并靠 `session.surface.nodes` 逐字节去重。`dsh-plugin-tool-management` 把这条路的坑写成了源码头注释（代码级）。
4. **委派的工程纪律已有可抄的完整清单**：provider capabilities 不足即 fail-closed（toolclub）、staged plan → `Approve & Run` 后才创建 child（agent-teams）、`attempt_id` 单调 + 转派前 revoke/quiesce（agent-teams）、definition/run 分离 + claim 绑定人类消息防重复派遣 + 重启对账为 `interrupted`（toolclub）、完成核验四态且非阻塞（todo-guard）。
5. **三条明确反模式**：① 用自定义 session event 类型承载业务事实——`background-agents` / `team-rooms` 在 `0.1.2-alpha.2+`（含我们锁定的 rc 线）上被 fail-closed，投影退化为空；② monkeypatch `ctx.subagents.*` 或 patch 官方 `@deepseek-ai/dsh-subagent`（agent-teams / routed-subagent），与 ADR-0015 冲突；③ SQLite 作为 Memory 唯一权威（memento/mneme/gate/living/vault），与 file-first + Git authority 冲突。
6. **IM 侧没有入站 seam 这一结论不变**，但审批/提问进 IM 的交互与安全协议已有成熟实现：dsh-reach 的开放 channel registry + deferred answerer waterfall，`PGZXB/dsh-feishu` 的 `InteractionRegistry`（requestId + chatId + messageId 三元归属、once、5 分钟超时、结算后延后一拍改写卡片），以及 dingtalk/im-bridge 的**确定性派生 session id**（sha256 前缀 + epoch + `adopt/resume/create` ladder）。
7. **Roster 有两条现实路线**：消费 `better-sidebar` 的 client service（`ctx.provide('betterSidebar')` + optional peer + `ctx.effect` disposer，28+ 生态插件已验证）；或先用纯 client 的 `conversation.view` / `shell.overlay` 槽做只读第一切片。`ui-layout.sidebar` 槽**占据即替换**，要占必须原样重声明 `sidebar.workspaces` / `sidebar.settings` / `sidebar.brand.*`。
8. **工具链可立刻用起来的四件**：`dsh-plugin-kit`（ProviderRegistry / fail-closed gates / 机械 verify / skeleton）、`dsh-plugin-doctor`（`--profile` 雷区扫描，对应真实 issue 编号）、`dsh-xray`（组合归属 / 依赖图 / cost）、`dsh-claude-move` 的 `sessionPersistence` 双基线兼容清单。

### Top 15 快速索引

| 仓库                            | 主题          | 首选借鉴点                                                                        | 证据   |
| ------------------------------- | ------------- | --------------------------------------------------------------------------------- | ------ |
| PerryLink/dsh-memento           | Memory        | service-owned 审批门 + 冻结快照 + 硬预算 + `source:<name>` 写策略                 | 代码级 |
| tinqiao-oss/engramory           | Memory        | index + 一事实一文件 + `ctx.tools.guard` 只拦增长                                 | 代码级 |
| plur-ai/plur (`packages/dsh`)   | Memory 注入   | section 注入 + off-turn 刷新 + CJK 预算 + sanitize/丢弃阶梯                       | 代码级 |
| slow-stack/dsh-mneme            | Memory scope  | 「session 是载体」身份契约 + human-edit 优先 + `{{}}` 转义                        | 代码级 |
| ZK-Andy/dsh-continual-evolve    | Memory 晋升   | promotion guards + 确定性 rollback + 一次审批可逆归档                             | 代码级 |
| PerryLink/dsh-background-agents | 委派          | `startContinuable` 的 persona/toolFilter/maxDepth + 进度节流 + metrics            | 代码级 |
| NanmiCoder/dsh-agent-teams      | 委派          | staged 审批 + attempt revoke/quiesce + per-agent JSONL inbox                      | 代码级 |
| toolclub/dsh-agent-team-gui     | 委派          | definition/run 分离 + claim 绑定人类消息 + 重启对账 + 官方 tokenUsage             | 代码级 |
| weibaohui/dsh-process           | 委派          | 每环节独立 root session + setup mount preset + pause-on-restart                   | 代码级 |
| a903067276-rgb/dsh-todo-guard   | 委派 UX       | 镜像投影跨 turn 存活 + 证据 `stat` 四态 + 非阻塞 nudge                            | 代码级 |
| PerryLink/dsh-reach             | IM/审批       | 开放 channel registry + deferred answerer + owner/allowlist fail-closed           | 代码级 |
| PGZXB/dsh-feishu                | IM/审批       | 双向 chat↔session map + `InteractionRegistry` 三元归属 + `agent/assistant-stream` | 代码级 |
| ttmouse/dsh-dingtalk-channel    | IM 绑定       | 确定性 `sessionIdFor(key)` + `sessionScope` + approvers 白名单                    | 代码级 |
| omdsh-dev/DSH-better-sidebar    | Roster/扩展面 | client service provider + 原生 `sidebarRight` 适配层                              | 代码级 |
| pure-craft/dsh-capability-panel | 能力绑定      | `tools.restrict` + `system-prompt/assemble` + `tools.guard` + `tools/result` 组合 | 代码级 |

## 1. Memory 与持久身份

### 1.1 写入侧：审批、预算与所有权

**PerryLink/dsh-memento**（★108，Apache-2.0，代码级）——本批最完整的 service-owned 记忆实现：`inject = ['tools','systemPrompt','approval']`，`ctx.provide('memory', service)`，另注册 `memoryAdapters` / `memoryEmbedding` / `memoryRetrieval` 三个 provider registry；写路径统一为 **budget 预检 → approval → budget 复检 → 原子写 → audit row**，审批在 service 内部走 `ctx.waterfall('approval/request')`，`writePolicy: ask|auto|off` 对模型不可见；`writePolicies` 支持按 `source:<name>` 覆盖，天然映射 adapter 来源差异化审批；`approve-what-you-see`（replace/remove 携带完整旧文与新文）；compaction 摘要变成 pending proposal 等人工批，而不是模型私态；快照段带 `used/limit` 用量头，空 store 零 token；`BUDGET_EXCEEDED` 绝不截断。附 `docs/protocol-v1.md` + conformance suite。
可借鉴：审批在 owning module 内部而非 tool 层（README 引用 Hermes #48181 的 late tool injection 教训）；`source:<name>` 粒度写策略；`approve-what-you-see`；用量头与 pending proposal。不适用：单文件 SQLite 权威与我们冲突；两进程共享 `$DSH_HOME` 时 last-writer-wins。[repo](https://github.com/PerryLink/dsh-memento)

**tinqiao-oss/engramory**（★191，MIT，代码级；插件在 subpath `adapters/dsh`）——与 Memory Repository 形态最同构：`MEMORY.md` 索引（一事实一行）+ 一事实一 Markdown 文件，frontmatter 带 `type(user|feedback|project|reference)` / `scope(global|repo)`；软帽 150 行/20 KB、硬帽 200 行/25 KB，靠 `ctx.tools.guard()` 拒绝增长（**只拦增长**，缩小/压缩编辑永远放行，refusal 是 monotonic 的）；写入纪律明确：dedup-before-write、update-don't-duplicate、delete-when-wrong、negative-scope rule、只存稳定指针不存 current state；协议经 `ctx.inject(['skills'])` 注册为 runtime skill，索引自动加载复用宿主 `dsh-agent-instructions`，插件本身不做注入。
可借鉴：index + topic-file 纪律与硬帽的「只拦增长」语义；reader 模式（只读消费他人 store）正合多 PersonaBot/多 adapter 读同一 canonical store；其把 live store **git-ignored** 的选择要反过来（我们要 Git authority）。风险：无多租户隔离（自述会 project bleed）、无 provenance 字段、guard 覆盖不到 shell/MCP 直写（best-effort）。[repo](https://github.com/tinqiao-oss/engramory) · [rules-snippet](https://github.com/tinqiao-oss/engramory/blob/master/rules-snippet.md)

**ZK-Andy/dsh-continual-evolve**（★18，MIT，代码级）——「PersonaBot 本地 ↔ 共享」晋升的最佳安全规则集：`promotionBlockPatterns`（POSIX 绝对路径 / session id / `~/.dsh` 判为项目级永不晋升）、`promotionMinChars`、近重复 Jaccard ≥0.8 拒绝、凭据筛查在**每个 sink**（promotion、global write、mount materialization）执行；确定性 rollback（由 applied result 生成 inverse edits，不再问模型）；`/evolve consolidate` 用一次审批做完全可逆的批量归档；内容段 ≤6 条×180 字符 + 目录索引 15 行帽的双层注入。可借鉴整条晋升守卫清单。[repo](https://github.com/ZK-Andy/dsh-continual-evolve)

**weibaohui/hermes-loop**（★4）——会话后复盘蒸馏成 skill；阈值 + 信号（用户纠正 / 工具连败 / 中断）触发、结论结构化 JSON 后由代码落盘、approval/log-only 模式、Curator 归档不删除。**无 LICENSE（默认保留全部权利），不可复用**，只作模式参考。[repo](https://github.com/weibaohui/hermes-loop)

### 1.2 注入侧：section vs message、预算与脱敏

**plur-ai/plur `packages/dsh`**（入口 repo ★0 是 pointer，真源码 ★290，Apache-2.0，代码级）——注入机制做得最细的参考：

- 一个 section 注册一次、`text: (context) => cache.read(context.agent.id)`；源码注释记录了 DSH 陷阱：**per-agent 同名 section 会按契约抛错**，曾被 catch 掩盖导致 agent 2..N 拿到 agent 1 的记忆。
- 刷新在 turn 外：`agent/pre-step` 且仅该 turn 的 step===1 触发 recall，异步结果供**下一次 assembly**；每次 memory 调用 5s 超时且失败不升级到 turn；`createWriteQueue()` 串行化同进程多 session 读改写。
- 预算：CJK 按 1 token/字、其余 4 字/token；丢弃顺序 `consider → directives`，**CONSTRAINTS 最先放且最后丢**，装不下时写明「WITHHELD — treat them as UNREAD」而不是静默丢弃；`flatten()` 逐条剥离换行/零宽字符/行首 `#`，防止 engram 文本伪造 `## DIRECTIVES`/`<system>` 结构；hash-gate 避免内容未变时重写 prompt 前缀（保 KV-cache）。
- scope：写**永不落 global**，读 = 项目 + global；未配置时按 cwd derive `project:<dir>-<digest>`，显式默认值绝不共用同一字面量（防跨项目泄漏）。
  可借鉴：注入文本 sanitize（防记忆升权为 system-prompt authority）是 BotHarness 必做项；预算估算 + 丢弃阶梯 + constraints 明示；单 section + agent 参数而非 per-agent 名。[repo](https://github.com/plur-ai/dsh-plugin) · [monorepo](https://github.com/plur-ai/plur/tree/main/packages/dsh)

**slow-stack/dsh-mneme**（★114，MIT，代码级；原 `modusensus/dsh-mneme` 已 301）——身份契约最接近 PersonaBot：`scope.js` 注释明确「session 只是载体；`agent_scope = session.header.agentPreset`、`workspace_scope = canonical cwd`；**`session_id` 永不作为作用域键**」，解析失败落 NULL 且绝不阻塞写入，`scope_changes` 表记录人工修正来源 `auto|explicit`；另记录 DSH 陷阱：不能先读 `requestHeader()`，否则 `agentPreset/cwd` 双双取空。注入段对每条内容截断并附「取全文」提示，且**转义 `{{...}}`**，因为 DSH `interpolate()` 扫描所有注入段、未转义会抛错炸整个 turn。SQLite 权威 + Markdown mirror 的架构不适用，但 **human-edit 检测（mirror digest，人工改动优先、机器不覆盖）** 与冲突队列人工裁决值得借。[repo](https://github.com/slow-stack/dsh-mneme)

**ouli-1242/dsh-plugin-tool-management**（★7，MIT，代码级）——**PersonaBot 记忆注入的最近基线**：`src/context-inject.ts` 头注释完整记录预设穿透事实（见结论 3），实现走 `ctx.on('agent/pre-step')` waterfall，每域（memory/mcp/skills/subagents/prompt）插一条合成 `createUserMessage`，来源 `kind` 稳定命名，逐字节对比 `session.surface.nodes` 里本域最新己方消息决定是否重发（被压缩移出即自动重发），正文整体包 `<system-reminder>` 并转义闭合标记，异常一律吞掉不影响 step，按 `delegationDepth` 抑制子会话目录；场景 = `memories/<场景>/<名>.md` 整篇注入。**它的 AGENTS.md 改写与明文密钥备份做法必须去掉**；注入+去重+遥测机制直接采用。[repo](https://github.com/ouli-1242/dsh-plugin-tool-management)

**其余轻量样本**：`weopenfire-git/hme-plugin`（USER.md + per-workspace MEMORY.md，Fibonacci 字符帽 1597/2584，fact-per-line + `§` 结尾，V1/V2/V3 TTL 90–365 天，`move` 显式降级路径；★3）；`rainow/dsh-simple-wiki-memory`（pending/reference/archive 三区 + 追加式 memory-log + git auto-commit + 无人值守只写 pending；★5）；`GIT121995/dsh-memory-gate`（「先裁决再注入」：belief/risk 评分输出 use|verify|ignore，注入 ≤3 条/1200 字符，`shadow→assist→enforce` 灰度，反馈只存词项不存查询原文；★2）；`Shiye-10Pages/dsh-memory-porter`（evidence 由代码回原文核对、三级证据决定自动或待审、导入前 token 费用预估；★1）；`flymysql/dsh-memory`（唯一 `storageDomain` seam 样本，可作「为什么 Memory 不选它」的对照）。[hme](https://github.com/weopenfire-git/hme-plugin) · [wiki-memory](https://github.com/rainow/dsh-simple-wiki-memory) · [memory-gate](https://github.com/GIT121995/dsh-memory-gate) · [porter](https://github.com/Shiye-10Pages/dsh-memory-porter) · [memory-vault](https://github.com/flymysql/dsh-memory)

## 2. 委派、多 Agent 与 Assignment Runtime

**PerryLink/dsh-background-agents**（★16，Apache-2.0，代码级；verified 到 `0.1.5-rc.2`）——`ctx.subagents.startContinuable({ request: { prompt, parent, persona, toolFilter, maxDepth, agentOptions } })` 的完整用法：persona / toolFilter / maxDepth 是请求级参数；节流 progress 注入（默认 15s/300 字，quiet|wakeup）；per-turn metrics（tokens / wall time / errorCount，null=unknown 而非 0）；「目录不可用返回显式 unrecoverable，绝不伪造空列表」；`room_transfer_task` 敏感操作走 approval 且缺 answerer 时 fail closed；每父会话 cap 4。**地雷**：它用 `background-agents/fact` 自定义 session event 承载事实，在 `0.1.2-alpha.2+`（含 rc 线）被 fail-closed 拒写、投影退化为空 fold——**不要抄 fact-event 落盘法**。[repo](https://github.com/PerryLink/dsh-background-agents)

**NanmiCoder/dsh-agent-teams**（★1751，MIT，代码级）——captain 会话 + durable 成员 + 任务 DAG 最完整的社区实现。可抄的语义：**staged plan 在 `Approve & Run` 前不创建任何 child，批准后才建成员**；`attempt_id` 单调，转派先撤销旧 attempt、中断并等旧 worker 静默；per-agent JSONL durable inbox；成员只见 4 个工具（claim/update/send_message/status）；冷启动只自动恢复一次 stranded attempt。**不要抄**：`<workspace>/.agent-teams/team.json` 单进程文件状态、monkeypatch `ctx.subagents.start/startContinuable`、把 persona 当 prompt section（不是持久身份）。[repo](https://github.com/NanmiCoder/dsh-agent-teams)

**toolclub/dsh-agent-team-gui**（★211，MIT，代码级；DSH `>=0.1.5-rc.1 <0.1.6-0`）——五条工程纪律几乎逐条对应我们的委派需求：① **provider capabilities 不足（`toolFilter===false` / `depthLimit===false`）直接 `INVALID_DISPATCH` 拒绝**（fail closed）；② `message_claims` 把自动/模型触发的 dispatch 绑定到最新人类消息，重复 tool call 不能无限建队；③ 重启后 `reconcileInterrupted()` 把 pending/running 成员标 `interrupted`（"Host restarted before this member completed."）；④ 直接复用官方 `sessionProjections.tokenUsage`，coverage 显式 full/partial/unavailable；⑤ definition（含成员定义不可变快照、版本）与 run 分离，retry 新建 linked immutable run。定义/run 落 storage domain 的介质选择不照搬。[repo](https://github.com/toolclub/dsh-agent-team-gui)

**weibaohui/dsh-process**（★1，MIT，代码级）——「每工作单元一个独立 root 子会话」的第三方验证：每环节 `ctx.agents.create({ sessionId, meta:{cwd}, setup: 内 mount agentPresets + `sandbox/mode` })`，**先 `await agent.whenIdle()` 再 followup**（与我们的 spike 结论一致），流转由代码强制（gates / rework 封顶 / 全程步数上限），台账 `runs.json` 原子写，宿主重启 running/awaiting → `paused`，run 冻结工艺 YAML 快照。**必须替换掉它的 `approval/policy: never`**。[repo](https://github.com/weibaohui/dsh-process)

**a903067276-rgb/dsh-todo-guard**（★2，MIT，代码级；verified 到 `0.1.5-rc.2`）——两个最小可复用原语：**镜像投影**（`ctx.inject(['sessionProjections'])` 注册自己的投影，fold 官方 `todo/write`，对 `turn/start` 不清空，随 projection cache 持久化、重启恢复）与**证据核验**（`todo_evidence` 写 tool/call 事件，host 只做 `stat` 从不读内容，四态 verified / evidence-missing / text-only / no-evidence，缺失证据不阻塞只注解；`tools/post-execute` waterfall 追加非阻塞 nudge）。投影契约双语法兼容（0.1.1-rc.1+ `stateSchema+wire` 与旧 `schema+view`）。[repo](https://github.com/a903067276-rgb/dsh-todo-guard)

**PerryLink/dsh-team-rooms**（★1，Apache-2.0，代码级）——跨会话共享对象（消息总线 + 任务板 + 时间线）：storage domain 四表 + 单一 write chain 顺序权威；`agent.followup` 投 live 成员、`agent.inject` 投离线成员，per-member cursor **投递成功后才前进**（至少一次重投）；`room_transfer_task` 审批 fail closed。适合未来跨 PersonaBot 协作域参考，但 membership 是 per-session、无持久名册。[repo](https://github.com/PerryLink/dsh-team-rooms)

**Jokasa7/dsh-product-subagent-console**（★2，MIT，代码级）——不委派、只做「设计—观测—对账—恢复预览」：不可变 plan revision + preflight + approval，`conformance.ts` 把 approved revision 与执行 facts 对账；Rcovery 是只读提案（"This function never performs a runtime action"）；`owned vs observed` 的 handle 所有权语义与 Assignment Runtime 同构。基线 `0.1.1-rc.2` 偏旧。[repo](https://github.com/Jokasa7/dsh-product-subagent-console)

**可作存在性证明但不要采用**：`bpc-oss/dsh-routed-subagent`（child setup 内 `agentPresets.mount` 可让 one-shot child 挂任意 preset，但 continuable+preset 必须 patch 官方包，安装级 junction）、`bpc-oss/dsh-fork-to-preset`（`session.fork({ agentPreset })` 分叉并继承已完成轮次，rc.8+ 可用——**这个 API 值得在我们的 spike 中复验**）。[routed-subagent](https://github.com/bpc-oss/dsh-routed-subagent) · [fork-to-preset](https://github.com/bpc-oss/dsh-fork-to-preset)

## 3. IM、渠道与审批

**PerryLink/dsh-reach**（★0，Apache-2.0，代码级）——审批/提问进 IM 唯一提供开放注册表的实现：`ChannelRegistry` 按 priority + `ownsChatId` 谓词解析 adapter（chat id 前缀归一化）；channel monitor 生命周期由 bridge 拥有（attach/detach，dispose 自动撤监听）；`chatSessions` 持久化 sender→sessionId，支持 `/session new` `/workspace` `/preset` `/perm`；`ctx.on('approval/request' | 'user-questions/request')` 挂 **deferred answerer** 返回持有的 Promise，卡有稳定短 token + 每用户到达号，多卡时裸数字被拦截，超时策略 `delegate|reject|wait`，dispose 时未决卡结算为 `unavailable`；owner/allowlist fail-closed（空 allowlist 拒绝所有人，未授权者审计且不回复）；凭据走 DSH credentials；`POST /reach/api/push` 强制 loopback；卡片按钮值协议 `reach:P{n}:1|2` 可复用。风险：单 owner 假设（卡固定发第一个授权用户）、Feishu 侧 sender 取 chatId 无法归因到人、无 deliver receipt。[repo](https://github.com/PerryLink/dsh-reach)

**PGZXB/dsh-feishu**（★31，MIT，代码级；peer 对齐 `0.1.5-rc.1`）——交互链最完整，可作 Feishu Provider 行为验收基准：`SessionMap`（`session-map.json` 原子写）同时维护 `byChat` / `bySession` **双向索引**，反向索引把 agent 侧事件路由回 chat；**`InteractionRegistry`** 按 `requestId` 索引并记录 `chatId + messageId`，`resolveOnce` 要求回调 chat 与卡片 messageId 都匹配，5 分钟超时 → `cancelled`，late/stale 回调 no-op；流式用 **`agent/assistant-stream`**（0.1.5 起 agent-scoped 发布，注释明确「in-flight stream 已离开 session event log」），throttle 400ms；结算后**延后一拍**改写卡片（避免 ACK 超时导致飞书回滚卡片）；`/sessions` + `/resume <id>` 可把别的 session 搬进 chat。风险：单 app、单实例、自身拥有 session authority（与 dsh-im 同类冲突）、`ctx.provide` 无。[repo](https://github.com/PGZXB/dsh-feishu)

**ttmouse/dsh-dingtalk-channel**（★1，MIT，代码级）——绑定与授权做的最干净：`conversationKey(scope, msg)` + `sessionIdFor(key) = 'ding-' + key` **纯函数确定性、跨重启稳定**，`SessionScope = 'chat' | 'chat-thread' | 'chat-sender'`；`ConversationSessions` 按 **live → resume → create** ladder 取会话，`owned` 标记区分自己创建与他人 live agent（后者不 dispose）；审批 `matchApprovalDecision` + `approvers` 独立白名单，拒绝时**在聊天里保持沉默**（不把机器人变成授权探测 oracle）；`denyTools: [ask_user_question, exit_plan_mode]` 默认禁用；`src/host.ts` 用**结构化类型声明窄宿主契约**对抗 DSH pre-release API 漂移。风险：审批结算靠文本关键词，未绑定卡 token（多人群存在先回先算的竞态，被 approvers + 单卡缓解）。[repo](https://github.com/ttmouse/dsh-dingtalk-channel)

**MHfire/dsh-im-bridge**（★4，MIT，代码级；钉在 `0.1.2-rc.1`）——`wecomSessionId(key, epoch) = wecom-<sha256(key)[0:16]>[-epoch]`，**archived 集合里的会话绝不复活**，`planWecomBind` 返回 `adopt | resume | create`；群缺 chatid 时拒绝而不是合并；plugin 内置 persona 文件（`{{model}}`/`{{cwd}}` 占位符）——唯一把 persona 做成一等配置的仓库，提示我们「桥接侧 persona 投影」必须与 authority 明确分工。兼容风险大。[repo](https://github.com/MHfire/dsh-im-bridge)

**hi-wenw/dsh-telegram-channel**（★11，MIT，代码级）——「外部聊天 = 已有 Session 的远端视图」的所有权纪律：`bindings` 持久化 + `/sessions` 按工作区分层列出、`ensureLiveAgent` 必要时 resume；`/unbind` 只清远端绑定、**从不 dispose 宿主 agent**；allowlist 两者全空 = 谁都不能用（fail-closed，与 dsh-im-hub 的「空 = 放行所有人」相反）。[repo](https://github.com/hi-wenw/dsh-telegram-channel)

**xmanrui/dsh-im（我们的 base）** 本轮复核结论与既有调研一致（HEAD `42776b5`，v4.24.0 未变）：公开 Host seam 仍只有出站 `dshIm.send/listTargets/listBots`；新增的 `inbound-ttl-rpc` / `image-input-rpc` / `bot-alias-rpc` 挂在 `/dsh-im-settings` RPC channel、只服务自家 Client；会话绑定侧有工业级细节可借——`withSessionBindingLock` 串行化绑定、`conversationWorkspaceGeneration` 工作区切换围栏、`WORKSPACE_SESSION_STALE` 时重试整段；Feishu 已有 live CoT 卡片流（`src/channels/feishu/live-cot.mjs`）。[repo](https://github.com/xmanrui/dsh-im)

**仅作对照**：`temotee2103/dsh-overdrive`（session id 编码路由 + 反向解析、每 session 单 pending approval + TTL 按钮；但 README 声称的 native buttons/流式只在旧 gateway 路径，`case 'delta': return; // MVP`——README 声称需按 `packages/gateway-core/src/drivers/*` 复核）、`ThreeBody6666/dsh-im-hub`（会话绑定不持久、空 allowlist 默认放行所有人、依赖已被移除的 `@deepseek-ai/dsh-client-runtime`）、`AbnerAI/dsh-monitor`（idle→`followup` / busy→`inject` 的唤醒分派与有界 notice 摘要，可作 Wake Policy 参考；watcher 不持久）。[overdrive](https://github.com/temotee2103/dsh-overdrive) · [im-hub](https://github.com/ThreeBody6666/dsh-im-hub) · [monitor](https://github.com/AbnerAI/dsh-monitor)

## 4. Roster、Session UX 与客户端扩展面

**omdsh-dev/DSH-better-sidebar**（★3695，MIT，代码级；原 `dsh-external/DSH-better-sidebar`）——目前唯一被大规模消费的 client 扩展 API：client half 启动即 `ctx.provide('betterSidebar', service)`，消费方 `inject: ['betterSidebar']` 后 `registerTab / registerFileViewer / registerFileIcon`，全部返回 disposer 且必须包 `ctx.effect`；`openTab` 有 seed/dedupe/lifecycle 建模；v0.19.0 起右列改由 DSH 原生侧栏承载，`TabDescriptor` 被适配成原生 tab 类型（`ctx.get('sidebarRight')` 探测 + `openResource('dsh-resource://file/…')`）。原生面行为差异多（只有 `onOpen`、布局只在内存、`dedupeKey` 不参与原生去重、path seed 语义曾有 #632 改道 bug）。README 列出 28+ 消费插件（`ChenRuoT/dsh-sidebar-qa`、`omdsh-dev/dsh-mnemon` 等）。[repo](https://github.com/omdsh-dev/DSH-better-sidebar)

**pure-craft/dsh-capability-panel**（★5，MIT，代码级）——PersonaBot「能力面」绑定应走的 sanctioned seams 组合：`tools.restrict({ deny })` 逐工具/整 MCP server 关闭、`system-prompt/assemble` 过滤、`ctx.get('tools')?.guard()` 兜底、`ctx.on('tools/result')` 计数、`agent/created` + `agent-preset/selected` + `tools/change` 设 preset 默认；slot 只占 `settings.section` 与 `conversation.input.right`；状态 `settings.yaml` namespace + `stats.jsonl` + 回环 API；失败显式降级显示 partial。硬边界：`tools.restrict` 注册时拒绝未知工具名；`run_code` 是 Code Mode 保留传输不可 restrict（409）。[repo](https://github.com/pure-craft/dsh-capability-panel)

**Session lineage / continuity**：`ZhengQingJing/dsh-session-tree`（★2，代码级；host 半空实现、纯 client）用 `conversation.view` slot 注册只读谱系树，导航走 `ctx.sessions.subagentAddress(id)` 判分支后 `ctx.sessions.open(id)` 或 `openSubagent(address)`，只读 `SessionSummary.parentId`、不 append event、不建 side store——**「读 native 数据 + 纯投影 + 有界降级 + 卸载零副作用」是 roster 第一切片的最佳形态**；`chouyong/dsh-fork-graph`（★1，代码级）给出 `conversation.session.header.actions` slot 的 fork 拓扑与 lane 布局教训；`WeiYe6/dsh-session-handoff`（★4，host 代码级）的 `/handoff` 用 `ctx.agents.create` 同工作区建新会话、继承 preset、摘要作首消息（其自承 `HANDOFF.md` 落盘是 future work，与我们的 file-first 记忆互补）。[session-tree](https://github.com/ZhengQingJing/dsh-session-tree) · [fork-graph](https://github.com/chouyong/dsh-fork-graph) · [handoff](https://github.com/WeiYe6/dsh-session-handoff)

**挂载点的选择**：`Fayelin12/dsh-office`（★5，代码级）用 `shell.overlay` 挂悬浮「办公室」面板（workspace/session/token/subagent + Agent Mail + 飞书消息流 + 月会/逐字稿），数据流是 host 聚合 + 自有 HTTP prefix route + client 轮询——最接近「PersonaBot roster 一屏总览」的既有形态；`staff-os/dsh-workbench`（★3，代码级抽样）则记录了两条关键契约：**占用 ui-layout 的 `sidebar` 槽 = 替换**，必须原样重声明 `sidebar.workspaces` / `sidebar.settings` / `sidebar.brand.mark|name` / `sidebar.footer.action`；agent preset 当「AI 员工」用**整目录复制**且 `employee.yml` 绑定是「责任声明而非自动接线」。[dsh-office](https://github.com/Fayelin12/dsh-office) · [workbench](https://github.com/staff-os/dsh-workbench)

**persona 类能力集的运行时切换**：`SunQingyuan0/Kabutack`（★3，BSD-3，代码级）用 `ctx.loader.update/create/remove` 做能力 diff 装载/卸载（v1 仅管 `@dsh-external/*`），状态 `roles.json` 原子写 + 审计；`weibaohui/experts-management`（★3，**无 LICENSE**，代码级）证明 roster 可以零目录 token 暴露——专家作为 `modelInvocable:false / userInvocable:true` 的 skills provider，只在用户手势边界由宿主确定性注入 `<skill_content>`，但这也说明「模型发起的委派不能依赖它」。[Kabutack](https://github.com/SunQingyuan0/Kabutack) · [experts-management](https://github.com/weibaohui/experts-management)

## 5. 插件开发与生态工具链

**PerryLink/dsh-plugin-kit**（★0，Apache-2.0，代码级）——可直接改造成我们 CI 门的零依赖 toolkit：`ProviderRegistry<T>`（默认实现 + 命名注册 + `use()`，可逆 fail-loud）、fail-closed 审批 gate（默认 `rejected`，唯一授权路径 `allow-once`）、`makeEventGate` / 未知 session event 优雅跳过（绝不重试到破坏 resume）、`sanitize/pricing/judge` 共享模块、机械 verify CLI、新插件 skeleton（三角色 `src/index.ts` + `dsh.bundle.patch` 指向故意为空的 patch）。[repo](https://github.com/PerryLink/dsh-plugin-kit)

**zoahdev/dsh-plugin-doctor**（★6，MIT，README 级）——发布/安装门前置：`--full` 装进全新 `DSH_HOME` 并核对 `--dump-config`；`--profile` 雷区扫描对应真实 issue——**profile-shadow #1697、manifest-BOM #1842、large-files #1859、entry-points #1965、profile-deps #2081、native-modules #2081**；另有 `audit` 只读证据模式与 `env explain KEY` 密钥安全溯源。[repo](https://github.com/zoahdev/dsh-plugin-doctor)

**alloevil/dsh-xray**（★1，MIT，README 级 + slot 代码级）——组合与成本 X 光：`attribute`（每行归属哪层、谁 patch 过）、`conflicts`、`diff`（声明层栈 vs `--dump-config`）、`snapshot`（内容寻址 lockfile + 漂移 exit 1 可进 CI）、`deps`（服务依赖图 + disable-cascade）、`health`、`cost`（prompt sections + tool schemas token 估算）、`verify`、`why <tool>`；静态命令在 dsh 无法启动时也能跑。[repo](https://github.com/alloevil/dsh-xray)

**PerryLink/dsh-claude-move**（★26，Apache-2.0，README 级）——迁移工具，但**兼容清单可直接进我们的持久层设计**：`sessionPersistence` 存在 legacy（`create/append/readFrom`）与 handle（`create` 返回 `SessionHandle`、`list()/stat()`）**双基线，只能按 API 形状 feature-detect、绝不按版本**；handle 路径每次 append 后 `flush()`（durability barrier）+ 配对 `close()`（single-writer）；合成 `assistant/message` 在 format ≥ 2 时必须带 `stream: []`，否则 V3 `Session.fromRestore` 断言失败（日志可读但不可 resume）。同类迁移器还有 `sjh9714/dsh-movein`（preview → apply 强门、dry until apply）、`mjylfz/dsh-skill-mover`（14 平台技能合并 + 一键回滚，固定 copy 不代跑依赖安装）。[claude-move](https://github.com/PerryLink/dsh-claude-move) · [movein](https://github.com/sjh9714/dsh-movein) · [skill-mover](https://github.com/mjylfz/dsh-skill-mover)

**其他**：`JohnXu22786/hooks-adapter`（Claude Code/Codex/opencode hooks → DSH 事件映射表，`inject = []` 全 `ctx.get` 降级姿势，可作生命周期钩子参考）；`dsh-plugin-tool-management`（见 §1.2，注入机制基线）；市场/索引类（`dsh-plugin-hub`、`dsh-suite`、`awesome-dsh`、`dshmarketplace`）本轮未深入，留待需要时再评估。

## 6. 反模式清单（不要在 BotHarness 采用）

| 反模式                                  | 案例                                                                         | 理由                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| 自定义 session event 承载业务事实       | background-agents / team-rooms 的 `*/fact`                                   | `0.1.2-alpha.2+`（含 rc 线）被 fail-closed，投影空 fold  |
| monkeypatch Host service / patch 官方包 | agent-teams 的 `ctx.subagents.start` 包装；routed-subagent 的 junction patch | 与 ADR-0015 冲突，跨版本即碎                             |
| SQLite 作为 Memory 唯一权威             | memento / mneme / memory-gate / living-memory / vault                        | 与 file-first + Git authority 冲突                       |
| 把记忆作为 user message 追加进对话史    | memsearch                                                                    | 注入随 derived history 累积、从不移除                    |
| 全局单份 store、无租户键                | hme 的 `USER.md`、plur 的 global engram、engramory 的 flat store             | 多 PersonaBot 会互相串                                   |
| 注入不 sanitize / 不转义                | 多仓库正例反证                                                               | 记忆文本可伪造 prompt 结构或触发 `interpolate()` 炸 turn |
| `approval/policy: never`                | dsh-process                                                                  | 无人值守绕过审批，背离 fail-closed                       |
| 明文密钥进 patch/config                 | tool-management（自承）                                                      | 违反 ADR-0006                                            |
| 空 allowlist 默认放行所有人             | dsh-im-hub                                                                   | 与 reach/telegram-channel 的 fail-closed 相反            |
| 单 owner 假设的多审批人模型             | reach 固定发第一个授权用户                                                   | 多 PersonaBot/多人审批不成立                             |

## 7. 建议的下一步切片

按 tracer bullet 原则，每条都是可在真机上验收的最小纵向切片：

1. **TB-Memory-Inject**：把 PersonaBot 记忆注入定为 `agent/pre-step` 合成 user message（预设穿透 + `session.surface.nodes` 去重 + `<system-reminder>` 转义 + CJK 预算与丢弃阶梯），以 `dsh-plugin-tool-management` 为基线、去掉其 AGENTS.md 改写；先在 web-dev profile 里验证「任何 preset 都到得了、被压缩后自动重发」。
2. **TB-Roster**：roster 第一切片用纯 client（`conversation.view` 或 `shell.overlay`）只读投影 PersonaBot 列表 + `ctx.sessions.open` 跳转，host 半先空实现（照 `dsh-session-tree` 形态）；验证后再决定是否消费 `betterSidebar` 或占 `ui-layout.sidebar`（占则重声明）。
3. **TB-Decision-In-Chat**：审批/提问卡进 Feishu：卡 token + `(requestId, chatId, messageId)` 归属校验 + once + 超时 `cancelled` + 结算后延后一拍改写（照 `PGZXB/dsh-feishu`），先只做单向推送 + 单一审批人。
4. **TB-Assignment-Guardrails**：委派前 provider capability preflight（不足即拒绝）、staged plan → Human 批准后才创建 child、attempt 单调 + 转派 revoke/quiesce、重启对账 `interrupted`（照 `toolclub/dsh-agent-team-gui`），与既有 Assignment Runtime 计划合并。
5. **TB-CI-Preflight**：引入 `dsh-plugin-doctor --profile` + `dsh-plugin-kit` 的 verify/fail-closed gate 思路到我们的发布门；`dsh-xray snapshot` 可作 composition 漂移 CI。

## 8. 候选 DSH 陷阱（待本机复验后录入 `.agents/skills/dsh-dev` pitfall log）

以下均为第三方仓库源码注释/实现中记录、证据等级为代码级，但**尚未在本机 web-dev 复验**，故先记在此处；复验后按 AGENTS.md 要求移入 `dsh-dev` 技能：

1. **预设穿透**：`systemPrompt.section()` 被 persona `complete:true` 压掉、`systemPrompt.context()` 被 `includeRuntimeContext:false` 压掉；只有 `agent/pre-step` 合成 user 消息到得了所有预设，且必须扫 `session.surface.nodes` 去重、包 `<system-reminder>` 并转义。来源：[tool-management `src/context-inject.ts`](https://github.com/ouli-1242/dsh-plugin-tool-management)。
2. **`interpolate()` 扫描全部注入段**：注入文本含未转义 `{{...}}` 会抛错炸整个 turn。来源：[mneme `src/inject.js`](https://github.com/slow-stack/dsh-mneme)。
3. **per-agent 同名 systemPrompt section 抛错**：catch 掩盖后会串记忆（agent 2..N 拿到 agent 1 的内容）。来源：[plur `packages/dsh/src/index.ts`](https://github.com/plur-ai/plur)。
4. **`inject: ['logger']` 会让 fiber 永远 pending**：`logger` 是 cordis fork 的内置属性、不是 provide 服务；cordis 对未解析 inject 不报错只 park fiber，整棵插件树/Web boot 失败。来源：[Kabutack 调试日志](https://github.com/SunQingyuan0/Kabutack)。
5. **cordis 无 optional 依赖**：注入宿主不提供的服务会 park fiber 并让 Web boot 失败（不是跳过插件）→ 所有非硬依赖必须 `ctx.get` 探测。
6. **`ctx.subagents` 深度语义**：`request.maxDepth` 是本次创建的绝对深度、不被后续委派继承；member-relative 深度必须自己沿 `session.header.parentSession` 走链。来源：[agent-teams `src/members.ts`](https://github.com/NanmiCoder/dsh-agent-teams)。
7. **`tools.restrict` 边界**：注册时拒绝未知工具名；`run_code` 是 Code Mode 保留传输不可 restrict（409）；只改组装不改历史。来源：[capability-panel `src/host/capabilities.ts`](https://github.com/pure-craft/dsh-capability-panel)。
8. **V3 session resume 断言**：合成 `assistant/message` 在 format ≥ 2 时必须带 `stream: []`，否则 `Session.fromRestore` 断言失败、日志可读不可 resume；`sessionPersistence` 双基线只能按 API 形状 feature-detect。来源：[claude-move README](https://github.com/PerryLink/dsh-claude-move)。
9. **slot 占据即替换**：注册进 ui-layout `sidebar` 槽会替换 ui-sidebar 及内层座位（含 `sidebar.workspaces/settings/brand`），必须原样重声明。来源：[workbench `src/client/contract/slots.ts`](https://github.com/staff-os/dsh-workbench)。
10. **移动端/插件重装**：浏览器端插件 roster 在安装/更新/移除后仍需重启（`dsh-session-tree` README）；pnpm 11/12 的 `minimumReleaseAge`、`approve-builds`、git 源 `allowBuilds`、prepare 撞未发布 `@deepseek-ai/dsh-compact` 等已有部分记录在 `dsh-dev`，注意 `--next` 可能悄悄回退旧版。

## 9. 本轮未深入、按需再看的分类

awesome list 其余分类暂未做一手核查，与 BotHarness 直接相关性较低或已有覆盖：Context & Search（上下文洞察/压缩/搜索，已有多份调研）、Dashboards & Session UX 中的成本计费与 token 面板（大量同质插件）、Models & Inference（模型路由/额度，唯一相关项 `Mutx163/dsh-model-memory` 的 per-channel 模型恢复可作 PersonaBot 模型偏好参考）、Security & Governance、Output & Deliverables、Office & Documents、Fun & Lifestyle、绝大部分 Runtime & Operations（launcher/doctor/备份，`dsh-dev` 已覆盖我们的 dev loop）。
