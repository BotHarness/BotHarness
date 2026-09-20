# DSH/Cordis 规范 Context

在 plan、PRD、ADR、代码与 review 中使用这些 leading words。每个术语只命名一个边界；不要因为另一个词听起来熟悉就互相替换。

## 来源标签

- **DSH-native** — 存在于固定版本 DeepSeek Harness 源码/API 中。
- **Cordis-native** — 存在于 DSH 所使用的 Cordis framework 中。
- **BotHarness-proposed** — 本仓的产品层设计；除非以后被上游采纳，否则不是 DSH API。
- **durable** — 进程退出后仍能从持久化记录恢复。
- **live/process-local** — 只存在于当前 runtime。

写设计时必须显式标记 proposed API。否则 `ctx.botWork` 会被误读成上游已经保证的能力。

## Runtime composition

### Plugin 与 Fiber

- **Plugin** — 运行时 feature module 与生命周期容器。它可以提供 Service、监听 Event、增加 Registration、创建 child Plugin，也可以完全不提供 Service。
- **Fiber** — 一个 live Plugin instance 及其 lifecycle ownership。Fiber dispose 时，它拥有的 effect 与 Registration 会被撤销。

```text
Plugin != ctx.<service>
Plugin = lifecycle + services + listeners + registrations + effects + children
```

### Bundle、Profile、Patch

- **Bundle** — 一个 package 通过 `dsh.bundle` manifest 与配置层贡献的内容。
- **Profile** — 用户启动的、有顺序的 runtime composition。
- **Patch** — 后续插入或覆盖 Loader row 的配置 overlay。

```text
Bundle = published contribution
Profile = launched composition
Patch = overlay
```

Profile 不是浏览器 profile、用户身份、cookie jar 或 Session 隔离边界。后应用的 Patch 会整对象替换 row 的 `config`。

### 三层 composition

```text
Profile / Bundles    -> 启动哪些 feature package
Plugin tree / Fibers -> 谁拥有 runtime lifecycle
Registries           -> 当前有哪些 live contribution
```

Agent Scope 主要作用于 Registration，而不是 Profile composition。

## Capability seam

### Service Definition、Provider、Consumer

- **Service Definition** — 稳定的 command/query contract：method、input、output、error 与 cancellation semantics。
- **Provider** — Service Definition 的具体实现，例如 local、remote 或 container Shell。
- **Consumer** — Service 的调用方：Tool、Event listener、route/UI adapter、Scheduler/Job 或另一个 Service。
- **Capability seam** — `Consumer -> Service Definition -> Provider`。

**Service** 指通过 `ctx.<name>` 使用的稳定 capability API，不是碰巧提供它的 Plugin。

```text
Tool != Service
Tool = model-facing Consumer
```

改变 capability 的执行位置，意味着替换 Provider，同时保持 Definition 与 Consumer 不变。

## Registry、Registration 与 scope

- **Registry** — 一种通用 pattern：live entry，加上 lookup、precedence、ownership 与 lifecycle。Tool、Skill Provider、System Prompt Section、UI Slot 与 Workspace registry 都是例子。
- **Registration** — 一个 Plugin 向 Registry 提供的一项 runtime contribution。
- **Agent Scope** — scope-aware Registry 的 visibility rule：一个 Agent 能看到哪些 Registration。
- **Service Isolation（Realm）** — dependency-resolution boundary：一个 context subtree 会解析到哪个同名 Service instance。

`Registry` 是通用模式；`ctx.registry` 特指 Cordis Plugin Registry。

```text
Agent Scope       = 这个 Agent 能看到哪些 registration
Service Isolation = 这个 context 会解析到哪个 Service instance
```

两个轴相互独立。只有实现了 scoped resolution 的 subsystem 才会遵守 Agent Scope。

## Cordis Event

**Cordis Event** 是 process-local notification、interception 或 lifecycle coordination。Service call 不会自动变成 Event。

| Dispatch mode | Contract | 常见用途 |
| --- | --- | --- |
| `emit` | 同步广播；不等待 listener 返回的 Promise | fire-and-forget 状态通知 |
| `parallel` | 并发运行 listener；等待全部 settle | 彼此独立但必须完成的准备工作 |
| `serial` | 按顺序等待 listener；可以 bail | 有顺序的处理 |
| `bail` | dispatcher 依次尝试，直到某个 listener claim | handler/Provider 选择 |
| `waterfall` | listener 调用 `next()` 继续，并可包裹或 veto | policy、approval、rewrite |

在 **bail** 中，由 dispatcher 推进。在 **waterfall** 中，由当前 listener 调用 `next()` 推进。

## Session：事实与派生视图

- **SessionEvent** — DSH Session 中 typed、append-only、durable 的事实。Session log 是 Agent execution history 的 canonical source。
- **`session/event`** — SessionEvent commit 后发出的 live Cordis Event。
- **Projection** — 从 SessionEvent history 可重建地 fold 出当前 read model。
- **Session Persistence** — canonical durable Session log 的 Provider，例如 JSONL。
- **Session Query** — Session history 的派生搜索索引，例如 SQLite FTS。
- **Conversation Assembly** — 把 durable event window 与 transient live chunk 组合成与 target 无关的 presentation node，供 Chat/Trajectory renderer 使用。

```text
SessionEvent[] + reducer -> Projection
event window + transient -> Conversation Assembly
```

SessionEvent 不是逐帧 UI bus。Projection 与 Session Query 也不是新的事实来源。

## Execution 与 storage

- **Execution World** — 程序运行的位置：local OS、container、remote host、microVM 或 cloud sandbox。
- **Sandbox** — 当前的 `ctx.sandbox` 限制同一 Execution World 内 subprocess 的 filesystem effect。不同的 Execution World 是 sibling Provider，不是 Sandbox mode。
- **Shell** — 命令式 Service，例如 `ctx.shell`。
- **Subprocess** — argv/process primitive，例如 `ctx.subprocess`；它不是 shell command string。
- **Job** — 有 identity，并支持 status/collect/stop lifecycle 的长时工作。
- **Terminal/PTY** — 带 controlling terminal 的交互式进程。
- **Schedule** — 未来的 delivery time；不是正在运行的 Job。
- **Spill** — 为过大的 Tool Result 提供外部存储，只在 model context 中留下 preview/locator。
- **Storage Domain** — 可路由到 JSON/SQLite 的 typed、non-Session 产品数据。它不是通用 ORM，也不是 Session Persistence。

```text
bash Tool -> Shell Service -> Shell Provider -> Subprocess Service -> Provider -> OS
```

## Host/client 边界

- **Slots** — 浏览器 UI composition seam。`single`、`list`、`keyed`、`chain` 编码冲突或共存规则。
- **Typert** — Host/client call 使用的 typed remote Service protocol 与 registry。
- **API Gateway** — `/api` interceptor 的唯一 owner；它负责 claim Typert endpoint。

浏览器是独立的 Cordis application。Client Plugin 不能注入 Host Service。在 BotHarness 中，remote method 由 `TypertRemoteService` 暴露；再次注册 `connection.rpc.intercept('/api', …)` 会遮蔽原生 API。

## BotHarness 产品词汇

以下术语除非另有说明，均为 **BotHarness-proposed**：

- **Actor** — 能参与 Channel 并 author message 的 Human 或 PersonaBot。
- **PersonaBot** — 长期存在的产品 actor identity；绝不是 Session 或 live Agent object。
- **Channel** — 平台原生的 group-chat 或 DM social space。
- **Bridge** — 面向 Channel 或 PersonaBot Inbox 的已配置外部连接；它传输 Actor 的事实，但自身不是 Actor。
- **Source Event** — 来自 Channel、Bridge、webhook、Session 或 system source 的 immutable local fact；是内容与可信 provenance 在本地的唯一副本。
- **Source Revision** — 新的 Source Event，用于记录已观察到的编辑或撤回，同时保留原始 causal fact。
- **Inbox Admission** — durable reference，说明为什么某个 Source Event 有资格进入某个 PersonaBot 的 attention；它不复制内容。
- **Bot Inbox** — PersonaBot 级别、基于 admitted Source Event 的视图；不是 queue、mailbox 或第二份 content store。
- **Attention Unit** — 一个 PersonaBot 当前对一条 Source Event revision chain 的考虑单元；尚未 Observation 的 revision 可以合并。
- **Attention Decision** — 可审计的 observed/deferred/ignored/handled fact；pending 由事实推导。
- **Reply Route** — Host 用来回复 Source Event origin 的非 secret capability reference。
- **Reply** — 通过 Host 选定的可信 Reply Route 发出的响应。
- **Service Action** — 有意选择的 provider-specific 操作，例如主动发布；与 Reply 分开。
- **Provider Capability** — 某个已配置 provider account 能支持的 operation/event；表示 availability，不表示 authorization。
- **Service Grant** — Human 对特定 provider target 上具名 Service Action 的显式授权。
- **Agent Inbox** — DSH-native execution queue，控制选定工作何时进入 Turn/Step。
- **Wake Policy** — deterministic Host policy，为 Admission 选择 immediate wake、digest 或 no automatic wake。
- **Delivery Policy** — Host 根据 Wake Policy decision 与 Orchestrator liveness，把交付映射到 next-step、next-turn 或显式 whole-turn abort。
- **Orchestrator Session** — PersonaBot 长期存在的 control-plane root Session。
- **Work Session** — 一条独立 work line 对应的 top-level DSH Session；其 DSH Session id 是 canonical identity。
- **Work Session Directory** — PersonaBot-scoped durable read model，基于 Session Ownership 与 DSH fact 构建并按需查询。
- **Work Request** — durable、定向给 Orchestrator 的消息，semantic mode 为 `context-update`、`next-step` 或 `next-turn`。
- **Work Report** — immutable、Session-origin Source Event，包含有意义的 progress/result 与 artifact reference。
- **Work Lifecycle Notice** — 独立的 Host-origin Source Event，表示有意义的 settlement、error 或 cancellation。
- **Subagent Session** — Work Session delegation tree 内的 DSH-native delegated child Session。
- **BotHarness operational database** — profile-scoped 的单一 `botharness.db` transactional owner；各 deep module 保持独立 interface 与 table ownership。

```text
Channel != PersonaBot != Session != Agent
Bot Inbox != Agent Inbox
Work Session != Subagent Session
```

规范角色：

```text
Channel              = social world
Source Event         = immutable content/provenance fact
Inbox Admission      = PersonaBot eligibility relationship
Bot Inbox            = Admissions 与 Attention Decisions 的视图
Orchestrator Session = PersonaBot control plane
Work Session         = 独立 work line context
Subagent Session     = Work 内部的 delegated child context
```

Proposed deep-module capability 包括 Messaging、Attention/Inbox、Bot Runtime 与 BotWork Runtime。`ctx.messaging`、`ctx.botWork` 之类名称是 proposed capability seam，不是已经稳定的 CRUD contract。DSH-native execution 使用 `ctx.agents`、Agent delivery method、`ctx.subagents`、SessionEvent、Workspace 与 scoped Tool。

## 一句话模型

> Plugin 是 lifecycle container；Service 是 capability entrance；Provider 是实现；Consumer 使用它；Cordis Event 协调 live reaction；Registry 组合 runtime entry；Registration 是其中一项；SessionEvent 是 durable truth；Projection 是可重建的 read model；Bundle/Profile/Patch 决定加载哪些 Plugin。
