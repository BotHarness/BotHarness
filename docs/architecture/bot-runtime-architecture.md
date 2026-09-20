# DSH 上的 BotHarness Runtime 架构

这份由 BotHarness 产品文档拥有的参考，描述构建在 DSH-native Agent、Session、Workspace、Tool 与 Subagent 之上的 **BotHarness-proposed** 产品层。它不是上游 API 清单。产品术语的定义只存在于根目录 [`CONTEXT.md`](/zh/dev/design/context)，DSH/Cordis 术语则归 [DSH 规范 Context](/zh/dsh/context)；本页只解释两层对象在运行时的关系。

## 不变量

> Channel 是 social world；PersonaBot 是 product actor；Session 是 Agent execution context。三者不能互相充当身份。

```text
Channel != PersonaBot != Session != Agent
```

## 三张图

在架构图和数据模型中始终显式分开以下三张图。

### Product IM 图

```text
Human <-> Human
Human <-> PersonaBot
PersonaBot <-> PersonaBot
through Channel/DM and ctx.messaging (proposed)
```

PersonaBot-to-PersonaBot communication 是 peer social communication，不是 Subagent messaging。

### Product ownership 图

```text
PersonaBot
|- one Orchestrator root Session
|- zero or more independent Work root Sessions
`- durable ownership/directory metadata
```

Session Ownership 把每个 root Session 关联到一个 PersonaBot 及其 root role。它不是 DSH `parentSession` delegation edge。

### DSH delegation 图

```text
Work root Session
`- main Work Agent
   `- Subagent Session
      `- nested Subagent Session
```

Subagent Session 表达 Work Session 内的 parent-child delegation。独立 Work Session 是全新的 top-level DSH Session。

## Bot Inbox 与 Agent Inbox

```text
Source Event    = immutable product content/provenance fact
Inbox Admission = durable PersonaBot eligibility/reference fact
Bot Inbox       = Admissions 与 Attention Decisions 之上的 PersonaBot-level view
Agent Inbox     = 在指定 delivery boundary 上使用的 DSH execution queue
```

Internal Channel、external IM、webhook、Work Report、Work Lifecycle Notice 与 system source 都先产生 immutable Source Event。Inbox Trigger 可以为一个或多个 PersonaBot 创建 Admission，但不能复制内容。把内容或忠实、可操作的摘要读入 Orchestrator turn 才算 Observation；只列出 metadata 或 Human UI 查看不算。

Provider edit 或 recall 会产生 Source Revision。Reply 使用 provenance 中可信、非 secret 的 Reply Route；主动 provider-specific Service Action 需要单独选择和授权。Raw external payload 绝不能直接进入 Agent Inbox。

## Wake Policy 与 Delivery Policy

Wake Policy 必须在 Orchestrator 外部运行，因为 sleeping Orchestrator 不能决定是否唤醒自己。随后 Delivery Policy 根据 Wake decision 与当前 Orchestrator liveness 选择安全的 DSH boundary。

```text
provider/internal input
-> 一个 botharness.db transaction：Source Event + optional placement + Admission
-> Wake Policy：immediate / digest / no automatic wake
-> Delivery Policy：next step / next turn / explicit whole-turn abort
-> DSH Agent delivery primitive
```

忽略 Inbox 是 Attention Decision，不是 Wake result。Delivery Policy 根据 Orchestrator 实际 Turn/Step state 选择，而不是只根据 priority 猜测 timing。

必须区分：

- 当前 Turn 结束后交付；
- 下一 Step 前交付；
- 请求取消或中断当前工作。

第三项是独立 capability，并非所有 in-flight Tool/Provider 都支持。

## Orchestrator Session

Orchestrator Session 是 PersonaBot control plane。它负责高层 social behavior，并决定工作如何继续：

- list/read admitted Source Event，并记录 Attention Decision；
- 决定是否回复以及回复到哪里；
- list、inspect、create/reuse、address 与 stop Work Session；
- 接收 Work Report 与 Work Lifecycle Notice；
- 协调 PersonaBot-to-Human 与 PersonaBot-to-PersonaBot messaging；
- 维护高层 goal 与 Channel behavior。

Orchestrator 应保持轻量。仓库修改、大型 Tool output、深层 project context 与详细 Worker trace 属于 Work Session。

PersonaBot 与 Orchestrator Session 是 durable identity；live Orchestrator Agent object 可以按需 resume。

## Work Session

Work Session 是一条独立工作线对应的 root DSH Session。它的 DSH Session id 是 canonical identity；BotHarness 不再创建第二个 Work id。它可以带 PersonaBot-local Continuity Key、绑定 Workspace，并使用专门的 model/dependency configuration。

**Work Session Directory** 是 durable read model，基于 Session Ownership 加上 DSH event、projection 与 cold-query fact 构建。它暴露：

```text
canonical Session id、purpose、Continuity Key、Workspace
requested model/dependencies
DSH-derived activity 与 lastRun
latest semantic Work Report
aggregate descendant activity
```

DSH-derived activity 与 semantic reported outcome 必须分开；不能再复制一套 BotHarness Work status lifecycle。列表支持 filter、order、opaque cursor pagination，默认按 `updatedAt DESC` 排序并以 Session id 打破并列；inactive row 只有显式 history filter 才返回。DSH Subagent 绝不会成为 top-level Work row。

Host-lifetime **BotWork Runtime** 拥有 live Work AgentHandle。Orchestrator-scoped code 不拥有它们，因为 Orchestrator Agent teardown 不应隐式结束独立 Work lifetime。通信使用 durable **Work Request**、Session-origin **Work Report** 与 Host-origin **Work Lifecycle Notice**，而不是 `ctx.subagents.sendMessage()`。Work Session 内部仍可使用 DSH-native Subagent。

Work Request mode 是 semantic：`context-update` 贡献 durable context 但不唤醒；`next-step` 等到下一个安全 Step；`next-turn` 在当前 Turn 后排一个 continuation。Runtime 把它们映射为 DSH `inject`、`steer` 或 `followup`；普通 request 永不取消 in-flight Tool 或 model step。

SQLite 与 DSH Session Persistence 无法原子 commit。因此 Work creation 与 delivery 使用最小的 **Work Delivery Intent**：stable id、idempotent acceptance 与 bounded restart reconciliation。它不是通用 queue、workflow engine 或 exactly-once claim。

Work Report 携带有意义的 progress、blocked/waiting state、result 与 artifact reference；完整 execution history 留在 DSH。Work Lifecycle Notice 携带 Host-derived settlement/error/cancellation fact，并使用独立 provenance。两者都是 immutable Source Event，走普通 Inbox Trigger/Wake Policy path；attention coalescing 可以避免重复 wake，但不能删除任何事实。

Profile-wide **Work Concurrency Limit** 默认是 `3`，只计算正在执行的独立 Work root。超过上限的 create 或 idle-wake attempt 立即失败，并返回结构化 machine field 和 LLM 可读说明。被拒绝的 attempt 不创建 queue、intent 或 dormant DSH Session。

## Deep module capability seam

使用小型 command/query interface，不要过早冻结 speculative CRUD：

- **Messaging** 拥有 Source Event ingestion、Channel placement、Reply/Service Action intent、provider routing、provenance、Outbox 与 post-commit fact。
- **Attention/Inbox** 拥有 Inbox Trigger evaluation、Inbox Admission、Attention Unit、Attention Decision、Observation 与 Wake Policy selection。
- **Bot Runtime** 解析 PersonaBot → Orchestrator Session → live/cold Agent，并应用 Delivery Policy。
- **BotWork Runtime** 拥有 Work Session Directory query、Work AgentHandle、Work Request、Work Delivery Intent、report/notice、stop convergence 与 concurrency admission。

Provider boundary 仍是 capability seam。Feishu Provider 声明 Provider Capability，并解析非 secret account/Chat/Thread reference；Reply 由 Host 根据可信 provenance route，主动 Service Action 则要求匹配的 Service Grant。

## Command、fact 与 event

Command/query 使用 Service；post-commit notification 使用 Event。

```text
Messaging command
-> 按需验证 Messaging Policy / Provider Capability / Service Grant
-> 原子持久化 Source Event、reference、Outbox Intent 与 policy revision
-> commit
-> 发出 live post-commit notification
```

Cordis notification 不是 durable authority。Source Event、Admission、Attention Decision、Work Delivery Intent、report/notice、Outbox 与 audit fact 都保留在 operational database 中。

外部 edit/recall event 产生 Source Revision。它们可以更新尚未 Observation 的 Attention Unit，或在 Observation 后产生新的 attention。若 audit/order 很重要，从 provider 读取当前状态不能替代记录已收到的事实。

## Tool 边界

面向 Orchestrator 的 Tool 把 messaging、Inbox 与 Work-control capability 适配给模型。Work control 恰好是 `list_work`、`inspect_work`、`create_work`、`send_work_request` 与 `stop_work`；唤醒兼容的 idle Work 本身就是 Work Request，因此不另设 resume tool。面向 Work 的 Tool 适配 filesystem、Shell、LSP、web、code runtime 与 DSH Subagent。Work Session 获得 `report_to_orchestrator`；其 Subagent 默认不获得。

默认姿态：

- Orchestrator 拥有外部 social identity 与 outbound Channel action。
- Work Session 只在需要时获得 source-scoped Channel read。
- Work Session 不获得任意 Bot Inbox 或 top-level Work-control authority；v1 的 Work-to-Work coordination 由 Orchestrator 居中协调。
- Tool visibility 由 Agent Scope 决定；authorization 仍由 Service Provider 强制执行。

## Persistence 边界

- DSH Session Persistence 拥有 Agent execution SessionEvent。
- 一个 profile-scoped `$DSH_HOME/botharness/botharness.db` 实体拥有全部 BotHarness operational record：PersonaBot registry/Session Ownership、Channel、Source Event/Revision、Admission/Attention、policy、grant、Outbox、Work metadata 与 audit。
- Deep module 通过小型 interface 与明确 table ownership 保持分离；caller 永远不拿 generic SQL，也不自行组合 transaction。
- Soul/Memory file、Attachment CAS byte、DSH Session log、credential 与 DSH-native Setting 位于数据库之外，由各自 authority 管理。
- Projection 与 search index 是 derived、可重建数据。
- 外部 side effect 使用 idempotency 与 outbox/reconciliation contract；本地 transaction 无法让外部 provider call exactly once。

Database owner 持有 Profile Writer Lease、串行化 write、拥有唯一 Schema Generation，并且只在 commit 后发出 Cordis notification。`botharness.db` 不是 DSH Storage Domain；复制 live raw file 也不是 backup interface。

## 防止循环

多 PersonaBot 通信需要 deterministic control，例如 causation/correlation/root message identifier、hop count、per-Channel rate limit、cooldown 与 budget。Prompt instruction 可以补充这些控制，但不能替代它们。

## Native/proposed 对照

DSH-native building block：

```text
ctx.agents create/resume 与 Agent delivery method
ctx.subagents delegation API
ctx.tools scoped Registration/restriction
Workspace registry 与 Session attachment
Session、SessionEvent、Session Persistence、Projection
```

BotHarness-proposed layer：

```text
Messaging、Attention/Inbox、Bot Runtime、BotWork Runtime capability seam
PersonaBot/Channel/Source Event/Inbox Admission/Attention Decision
Inbox Trigger/Wake Policy/Delivery Policy
Orchestrator Session 与 Work Session 产品角色
Work Session Directory/Continuity Key/Work Request/Work Report/Work Lifecycle Notice
botharness.db operational authority 与 model-facing Tool
```

讨论上游不存在的 API 时，必须始终保留 proposed 标签。
