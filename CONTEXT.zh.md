# BotHarness 产品术语

一个 DeepSeek Harness 插件层，为 LLM Agent 提供持久产品身份：PersonaBot——身份、Git-backed Memory 与执行归属跨越任何 Session、Chat 或 Workspace 的 bot。

## 语言

### PersonaBot（持久机器人身份）

**PersonaBot**：
由 Host 拥有的一等 bot 实体：一种带 Git-backed Memory Repository、跨越 Session、Chat 与 Workspace，并可同时持有多个 Session 的持久身份。Persona 是 Memory 中的 optional 内容，而不是身份本身。
_避免使用_：bot（单独使用）、agent、assistant、robot

**Archived PersonaBot**：
一种 PersonaBot 状态：禁止新的 admission、wake、Session execution 和 external action，同时保留其身份、所有权、历史记录与审计归属。归档时先关闭这些入口，再停止其 Orchestrator、Assignment Session 以及所拥有的 Subagent；只有整个执行树都进入静止状态，归档才算完成。重新激活绝不会自动恢复旧执行。
_避免使用_：deleted bot、paused UI、purged bot

**Bot as a Person**：
一项原则：PersonaBot 跨 Session 仍是同一个产品身份，其学习所得的持久连续性来自 Memory Repository，而不是 Session 历史。
_避免使用_：session-scoped identity

**PersonaBot ID**：
由 Host 自动生成的稳定 PersonaBot 身份。它适合用于文件系统，但 Human 不需要输入、选择它，也不会把它当作可见的 @ 标签。
_避免使用_：Bot slug、display name、handle、username

**Display name**：
PersonaBot 面向人的名称，也是 `@` 选择器显示的主要标签。名称可以重复；被选中的 mention token 会保留 PersonaBot ID。
_避免使用_：identifier、slug、username

**Role badge**：
显示在 PersonaBot 名称旁的零个或多个岗位或职位标签。Role badge 只描述身份，不授予权限，也不用于识别 PersonaBot。
_避免使用_：Bot tag、permission role、category

**Bot description**：
由 Human 可选填写的简短自我介绍，用来说明 PersonaBot 是谁、负责什么或擅长什么。
_避免使用_：Persona、role badge、system prompt

**Persona**：
用于描述人物特征、表达风格或长期指令的约定式 Memory 内容，通常会被 pin 到 system prompt。它不是特殊文件类型，也没有专属写保护；获得授权的 Agent 与 Human 都可以创建、修改、取消 pin、改名或删除它。
_避免使用_：system prompt、character sheet、profile

**Bot state**：
一个 PersonaBot 当前的呈现状态，由其拥有的 Orchestrator 与 Assignment Session activity 投影而来。Orchestrator 活跃时优先呈现，只有在等待 Assignment 时才呈现后者；多个 Assignment 的 tool kind 相同则使用对应效果，不同则回退到通用 `working`，而 waiting 与 blocked attention 使用独立 indicator，不成为可配置 priority。
_避免使用_：status、mood、presence

**Avatar**：
PersonaBot 在不同 Binding 中共享的视觉形象：根据 PersonaBot ID 确定性生成的 Blobatar media，或 Human 上传的 image media，统一置于表达 Bot state 的 Activity Frame 中。Blobatar 可在 working 或 thinking 时运动；自定义图片保持静止，由外层 frame 呈现活动，Live2D 等后续 renderer 也消费同一状态。
_避免使用_：profile picture、skin

### 支撑与执行

**Harness**：
平台层——即 BotHarness——负责拥有 PersonaBot identity、Memory lifecycle、execution state 与 Workspace authorization，并向其他 Plugin 暴露产品 capability。
_避免使用_：framework、runtime、kernel

**Host**：
运行该 Plugin 与所有 PersonaBot 的单一 DSH 进程。
_避免使用_：server、instance、node、worker

**Agent**：
一个 Session 内部的 DSH executor。绝不指 PersonaBot。
_避免使用_：用这个词指代 PersonaBot

**Subagent**：
由某个 Session 为有界工作启动的 DSH child agent 和 child Session；它继承父 Session 的 PersonaBot ownership，但属于该父级工作，绝不会成为独立 Assignment Session。
_避免使用_：sub-bot、worker、helper

**Session**：
PersonaBot 的一次工作或对话运行——DSH 的执行单元，拥有自己的进度与工作目录。
_避免使用_：conversation、context window、thread

**Session ownership**：
Bot-mode Session 与至多一个 PersonaBot 之间排他、持久的关系；非 Bot 模式的 DSH Session 可以保持无 owner，ownership 仅能通过显式修复变更。
_避免使用_：binding、workspace mapping、cwd inference、session membership

**Assignment**：
一条对 Human 有意义、由 PersonaBot 的 Orchestrator 选择独立推进的持续事项。它没有单独的持久 identity 或 lifecycle；其 canonical runtime identity 是承载它的 Assignment Session 的 DSH Session id。
_避免使用_：Work、work item、task entity、job entity、worker

**Assignment Session**：
执行且只执行一个 Assignment、由 PersonaBot 拥有的独立 root Session；v1 中它只有一个 working directory。它由 Orchestrator 创建和管理，不要求 Human 另开 Conversation；一个 PersonaBot 可以同时拥有多个 Assignment Session，而 DSH Subagent 永远不算 Assignment Session。
_避免使用_：Work Session、Worker Session、Executor Session、task Session、child Session

**Assignment Agent**：
在一个 Assignment Session 中执行的 DSH Agent。它只能通过该 Session 向其 PersonaBot 的 Orchestrator 回报，没有 Channel messaging capability，且既不是持久 identity，也不是 PersonaBot。
_避免使用_：worker、PersonaBot、Orchestrator、Assignment Session

**Assignment Directory**：
一种以 PersonaBot 为作用域的持久 read model，当前 Orchestrator 通过它显式列出并寻址自己拥有的 Assignment Session，包括 purpose、Continuity Key、Workspace、源自 DSH 的活动状态与 last-run facts、依赖关系、最新语义报告以及后代活动聚合。它将 execution facts 与 reported outcomes 分开，由 Session Ownership 和 DSH facts 重建，并在需要时查询，而不是完整注入每个 turn。列表支持筛选、排序与 opaque-cursor pagination，且绝不会把 DSH Subagent 扁平化为顶层 Assignment。
_避免使用_：task list、AgentHandle map、cwd scan、Orchestrator memory

**Continuity Key**：
显式分配给一条持续工作线、在 PersonaBot 内稳定的 key。它最多命名一个可恢复的 Assignment Session，并且仅当 ownership、Workspace mapping、model 与 dependency requirement 仍然匹配时才可选中该 Session。当前持有者必须先变为 idle/completed，或被显式停止并 supersede，key 才能转移。
_避免使用_：title similarity、cwd、most-recent Session、global id

**Assignment Request**：
Orchestrator 向其拥有的某个 Assignment Session 发送的持久、定向、可审计消息，可选择关联到一个 Inbox Admission 或先前报告。其语义模式为 `context-update`、`next-step` 或 `next-turn`；Assignment Runtime 将它映射为 DSH injection、steer 或 follow-up，且不打断当前 step。
_避免使用_：Channel message、Subagent prompt、broadcast、inferred Session

**Assignment Delivery Intent**：
在跨越 SQLite/DSH 事务边界创建 DSH Assignment Session 或交付 Assignment Request 时使用的、由 BotHarness 拥有的最小持久 bridge。它携带稳定 id，用于幂等接收与有界的重启 reconciliation；它不是通用 workflow 或 retry engine。
_避免使用_：exactly-once delivery、task queue、workflow、AgentHandle state

**Assignment Report**：
一种持久的、源自 Session 的 Source Event，Assignment Session 通过它主动或响应式地向其 PersonaBot 的 Orchestrator 返回有意义的进度、blocked 或 waiting 状态、结果和 artifact reference。完整执行历史仍保留在 DSH SessionPersistence 中；每份 report 保持不可变，而尚未 Observation 的重复报告可共享一个 Attention Unit。
_避免使用_：direct Channel reply、copied Session log、ephemeral callback

**Assignment Ask**：
Assignment Report 的一种变体：Assignment 声明它在继续之前需要 Orchestrator 的答复。等待期间 Assignment 结束自己的 turn，Orchestrator 的一条带地址 Assignment Request 会恢复该 Session；它不是阻塞调用、不是 Channel 消息，也不是独立生命周期。
_避免使用_：blocking call、direct Orchestrator message、question queue

**Assignment Lifecycle Notice**：
一种持久的、源自 Host 的 Source Event，只在 settled、error 或 cancellation 等有意义的执行边界发出。它携带源自 DSH 的 last-run facts、简洁安全的摘要，并在可用时包含 report/artifact reference；但它始终不同于 Assignment Agent 自己撰写的内容。
_避免使用_：Assignment Report、fabricated agent message、per-turn directory snapshot

**Assignment Concurrency Limit**：
整个 Profile 中可并发执行的独立 Assignment Session 数量上限。v1 中它是由 Human 配置的一项 BotHarness 全局设置；超过上限的 create 或 wake 尝试会立即失败，返回 machine-readable fields 与 LLM-readable explanation，同时不会创建 queue、intent 或 DSH Session。
_避免使用_：dispatch queue、per-Bot quota、hidden model budget、total Session count

**Workspace**：
Session 工作所在的单一 Host 目录；它与一个 DSH workspace 一一映射。UI 可以将多个 Workspace 分组展示，但一个 Workspace 绝不会跨越多个目录。
_避免使用_：project、multi-root folder、group

**Workspace Grant**：
一种持久、可撤销、application-defined 的 authorization，允许一个 PersonaBot 跨多个 Assignment 使用一个已解析的 Workspace。Human 授权一次后可以复用；它既不是 DSH Workspace，也不是每个 Assignment 都要重复确认的 prompt。
_避免使用_：Service Grant、Workspace、one-time approval、cwd inference

**Delegation**：
从 Chat 或 Roster 把责任交给 PersonaBot。其 Orchestrator 可以直接回答，也可以创建或复用一个或多个 Assignment Session。
_避免使用_：direct Session creation、task entity、job entity

**Binding**：
PersonaBot 与其参与的某个 surface 之间的连接——例如 Channel、Chat、sidebar 或 renderer。
_避免使用_：integration、connector、channel binding

**Orchestrator Session**：
PersonaBot 长期存在的 dispatch root Session：同时至多一个处于 active，负责消费 Bot Inbox，并决定 reply、dispatch 以及是否创建新 Assignment Session。它的 working directory 始终是 PersonaBot 的 Memory Repository；它是 PersonaBot 的对外发声者，不是由 Human 管理的 Conversation，也不是 Assignment 列表中的一行。普通 Session output 只保留为 execution history；只有从可信 Session ownership 推导身份、并经过 Channel membership 授权的显式 Channel messaging command，才会向 Human-facing Channel 发声。
_避免使用_：main agent、brain、supervisor

**Computer**：
一个 profile 级共享的 Linux 桌面，由该 profile 的所有 PersonaBot 共用；它拥有一个持久卷，保存其文件、浏览器 profile（Cookie 与登录态）与 CLI 凭据。它的隔离边界是 profile，绝不是某个 PersonaBot。
_避免使用_：machine、VM、sandbox、desktop、host

**Bot Screen**：
某个 PersonaBot 在 Computer 上使用的私有工作界面——它打开的窗口与标签。观察与操作都限定在它拥有的窗口内；它是可见性作用域，不是安全边界。
_避免使用_：display、virtual screen、workspace、desktop

**Computer Provider**：
运行一台 Computer 并提供 PersonaBot 在其上使用的观察与操作能力的 Provider；同一时刻只注册一个。
_避免使用_：driver、backend、sandbox

**Takeover**：
Human 在一台 Computer 上的接管会话：暂停所有在该 Computer 上行动的 PersonaBot，并在其持续期间关闭面向模型的截图。它由某个 Bot Screen 发起，但始终作用于整台 Computer。
_避免使用_：handoff、screen sharing、per-bot takeover

**Computer Export**：
一台 Computer 持久卷的可携带归档，由显式导出操作产生，可在另一台 Host 上恢复。它是 profile 级 facet，绝不是 PersonaBot export 的一部分。
_避免使用_：PersonaBot export、backup file、disk image

### Memory（记忆）

**Memory**：
保存在每个 PersonaBot 创建时自动生成的 Memory Repository 中、由普通且便于 Human 阅读的 Markdown 文件组成的持久知识。Agent 通过普通 filesystem、Shell、search 与 Git capability 操作这些文件；只有被接受的 Memory Commit 才让变更正式生效。
_避免使用_：knowledge base、vector store、RAG、database、context

**Memory Repository**：
由 PersonaBot 拥有、在 PersonaBot 创建时自动生成，并固定作为其 Orchestrator Session working directory 的 Memory 文件 Git repository。其 lifecycle 跟随 PersonaBot，但 archive、export、restore 与 purge 仍是显式操作。
_避免使用_：optional attachment、Session memory、generated index、project Workspace

**Pinned Memory**：
一种通过带版本 metadata 请求将完整正文注入 system prompt 的 Memory 文件；注入受 Human 可调的 repository budget 与当前 model 最终 context preflight 约束。Persona 在创建时默认 pinned，但仍只是普通 Memory 文件。
_避免使用_：special Persona file、always-loaded MEMORY.md、silent truncation

**Topic file**：
Memory Repository 中专门记录一个主题——例如某个 customer、process 或 decision——的 Memory 文件。
_避免使用_：note、document、page、record

**Customer profile**：
作为 north star 的 Topic file：每位 customer 一份，记录 timeline、key facts、commitments，并链接到相关 Attachment。
_避免使用_：CRM record、account、contact sheet

**Memory Service**：
拥有 Memory Repository lifecycle、validation、pin-budget enforcement、reconciliation、accepted commit、history 与 query 的 application-defined capability。v1 中它服务 runtime 与 Human-facing Consumer，但不暴露 model-callable Memory read/write Tool。
_避免使用_：Memory tool、filesystem watcher、Git event source、generic repository

**Memory Commit**：
一项被接受的 Git commit，以带 actor 与 cause attribution 的方式让一组一致的 Memory 文件变更正式生效。尚未 commit 的 working-tree change 是 provisional state，不改变 pinned context、history projection 或 Memory event。
_避免使用_：file save、filesystem event、raw Git commit、auto-save

**Memory Reconciliation**：
Memory Service 用于校验 repository state，并依据 Memory invariant 接受或拒绝 candidate Git commit 的过程。live Cordis Event 描述 reconciliation 与 accepted Memory Commit，绝不会把 `.git` filesystem activity 当作 durable fact。
_避免使用_：filesystem watch、background distillation、event-sourced Git

**Attachment**：
随 Source Event 接收的 content-addressed 文件；所有引用它的 Channel 或 PersonaBot 共同保留唯一一份。只有 PersonaBot 主动将该文件保存在自己的 Memory 或 Workspace 中时，它才拥有单独副本。
_避免使用_：upload、provider URL、per-Bot inbox copy、database blob

### Soul（身份内容）与分享

**Soul**：
PersonaBot 可选择固化为 SoulSnapshot 的 Memory 内容；存在 Persona 内容时也包含在内。
_避免使用_：character、profile、data

**SoulSnapshot**：
Soul 的不可变 content-addressed package：包含 `bot.md` manifest、setup instructions 与选定的 Memory 文件；它是 registry 存储、列出与导入的单元，不要求存在 Persona 文件。
_避免使用_：export、backup、bot zip、image

**PersonaBot Export**：
不可变、带版本的 transfer package，始终包含一个 SoulSnapshot，并可包含显式选择的 operational Export Facet。默认仅包含 Soul；它绝不携带 credential 或 live authority。
_避免使用_：SoulSnapshot、database copy、live clone、registry version

**Export Facet**：
PersonaBot Export 中 dependency-closed、带 schema version 的可选部分，例如 Source Event 与 Attachment、Inbox 与 attention facts、Trigger 与 Wake Policy、Messaging Archive、disabled Service Grant declaration，或等待 rebind 的 provider account reference。
_避免使用_：arbitrary table dump、credential bundle、active permission

**Messaging Archive**：
选定 Messaging facts 的带版本、可移植、只读导出，可选择包含从同一 snapshot 派生的 per-Channel NDJSON view。它不是第二个 authority，也不包含 credential。
_避免使用_：Channel authority、database backup、live inbox

**Rebinding Request**：
一种 inactive 的导入 reference，用来描述 Human 可以在本地重新连接并授权的 provider account 或 authority；在此之前，它不能 admit event、wake PersonaBot 或执行 Service Action。
_避免使用_：credential、Service Grant、automatic reconnect

**Soul registry**：
存储、版本化并提供 SoulSnapshot 的 hosted service——即 marketplace backend，与 Host 的 PersonaBot registry 不同。
_避免使用_：hub、store、database

**Listing**：
bot 在 Soul registry 中的存在形式：一个 `@handle/slug` namespace、一段 description 以及它的 Version。
_避免使用_：repo、page、entry

**Version**：
一个由 Human 命名的 tag，指向某个 Listing 下一个不可变 SoulSnapshot digest。
_避免使用_：release、build、revision

**Handle**：
account 唯一的公开标识符，作为其 Listing 的 namespace；绝不使用 account email。
_避免使用_：username、account id

**Bot set**：
一组计划一同导入、带名称的 Listing。
_避免使用_：collection、bundle、pack、team

**Export**：
生成 PersonaBot Export。默认仅在其 SoulSnapshot 中选择 Persona 加上指定 Memory；operational Export Facet 必须显式选择。
_避免使用_：database dump、live clone、publish

**Import**：
从 SoulSnapshot 或 PersonaBot Export 创建新的 PersonaBot；始终产生副本，导入的 operational authority 会保持 disabled，直到被显式 rebind 或 reauthorize。
_避免使用_：install、clone、pull、restore

**Publish**：
将 SoulSnapshot 作为一个 Version 上传到 Soul registry。
_避免使用_：upload、push、submit

### 协作

**Actor**：
能够参与 Channel 并创作 message 的 Human 或 PersonaBot；Bridge 负责承载 Actor 的 message，但自身不是 Actor。
_避免使用_：client、connector、bridge identity、caller-supplied sender

**Source Event**：
从 Channel、Bridge、webhook、Session 或 system source 接收的不可变本地事实，保存其内容唯一的本地副本与可信 provenance。它可以出现在 Channel 中，也可以被 admit 到任意数量的 Bot Inbox，但两种关系都不拥有另一份内容副本。
_避免使用_：inbox message、mailbox copy、notification payload、stimulus

**Provider Echo**：
provider 对 BotHarness 已发送 message 的 inbound reflection。成功关联时，它会丰富既有 Source Event 与 Outbox receipt，而不会产生新的 attention；无法匹配、但 sender 是自身的 echo 保持 unresolved，且不能 wake PersonaBot。
_避免使用_：new user message、duplicate Channel message、delivery success by assumption

**Source Revision**：
一种新的 Source Event，用于记录观测到的、针对较早 Source Event 的 edit 或 retraction，同时保持原事实不变；各 revision 组成一条 causal chain，可从中派生当前呈现。
_避免使用_：in-place edit、overwritten message、replacement body

**Unresolved Revision**：
在其原始 Source Event 之前收到的 Source Revision；在 causal chain 与 target 被链接或 reconcile 前，它会根据可信 external identity 被保留，但不会 admission 或 wake。
_避免使用_：invalid event、orphan to discard、latest by arrival

**Revision Conflict**：
两个或更多已保留的 Source Revision，无法证明它们当前的先后顺序；依赖 current content 的 external action 保持不可用，直到 provider reconciliation 或 Human resolution 完成。
_避免使用_：latest arrival wins、merge guess、retryable error

**Attention Unit**：
PersonaBot 当前对一条 Source Event revision chain 的一次 consideration；尚未 Observation 的 revision 合并进同一个 Attention Unit，而 Observation 之后发生的变更会形成新的 attention。
_避免使用_：mailbox item、message copy、delivery attempt

**Channel**：
平台原生的 conversation space；类型为 `dm`（一个 PersonaBot 与一位 Human）或 `group chat`（多个 member；非正式称为 chatroom）。Channel 在本地保留自己的历史。两种类型遵循同一套 Channel section 归属、顶层顺序、拖拽与移动规则；DM 保留其 PersonaBot 头像表现。
_避免使用_：room、server、board

**Hidden Channel**：
由 Human 明确选择、从展开与折叠 roster navigation 中省略的 Channel。隐藏会保留 Channel membership、history、routing、PersonaBot 与 Memory 状态，也会保留它的 pin、section 和 order placement；Human 可从隐藏频道管理器恢复它。
_避免使用_：deleted Channel、archived Channel、muted Channel、Content Purge

**Channel section**：
用户创建、可折叠的 Channel 分组，显示在 bot-mode sidebar 中。它只是本地 display arrangement，不属于 Soul。
_避免使用_：folder、category、group

**Section order (区块顺序)**：
bot-mode sidebar 中 Channel section 的相对顺序：默认按创建顺序，之后可由用户排列。未分组 Channel 可以占据 section 之间的顶层位置，但不会因此成为 section。
_避免使用_：priority、layout order

**Sort mode (排序模式)**：
sidebar scope 对其行进行排序的方式：`auto`（最新 message 优先）、`manual`（用户冻结的顺序）或 `inherit`（遵循全局默认值）。
_避免使用_：ordering、sort preference、sorter

**未分组 (Ungrouped)**：
Channel 不属于任何 Channel section 时的 membership state。未分组 Channel 以松散顶层行呈现，可位于 section 之间；它没有 bucket header 或折叠状态。
_避免使用_：default folder、inbox、fixed bottom bucket

**Bridge**：
从 external source 到某个显式 Channel 或 PersonaBot Inbox target 的已配置连接；它承载 inbound delivery 并暴露 outbound capability，但不会成为 Actor。
_避免使用_：integration、connector、adapter

**Bot Inbox**：
PersonaBot 层级的 view，包含被 admit 供其 attention 的 Source Event，无论 event 是否属于某个 Channel。它不是第二个 content store：读取是一项显式行为，也允许 ignore。
_避免使用_：queue、mailbox、backlog

**Inbox Admission**：
一种持久关系，用来说明一条 Source Event 为何有资格进入某个 PersonaBot 的 attention，并记录该 Bot 的 read、defer 或 ignore facts。它引用 Source Event，绝不复制其内容。
_避免使用_：inbox item body、delivery job、message copy

**Inbox Trigger**：
由 PersonaBot 拥有的持久 Host rule，负责匹配 Source Event 并创建 Inbox Admission，包括 admission reason、priority 与 Wake Policy selection。shared template 可以创建它，但 Bridge 绝不拥有它，也不会调用 Agent。
_避免使用_：bridge、wake policy、model trigger、scheduler

**Messaging Policy**：
一种带版本的 Host rule 或 authorization，其精确 revision 必须参与 Messaging transaction，包括 Inbox Trigger、Wake Policy selection、provider account reference 与 Service Grant。它属于 Messaging store；无关的 PersonaBot、Session、Roster 与 UI state 不属于其中。
_避免使用_：all bot state、model instruction、settings（单独使用）

**Attention Decision**：
一项可审计的 PersonaBot fact，表示某个 Inbox Admission 已被 observe、defer、ignore 或 handle；pending state 从这些 fact 中派生，而不是作为 delivery lifecycle 存储。
_避免使用_：mailbox status、Agent delivery state、consumed flag

**Observation**：
可执行的 Source Event content 或忠实、可执行的 summary 进入 Orchestrator turn context，或被 Orchestrator 显式读取的时刻。transport queuing、metadata listing 与 Human UI viewing 都不是 Observation。
_避免使用_：delivery、notification、human read receipt、outbox success

**Reply Route**：
一种非 secret 的 capability reference，使 Host 能通过正确的 Channel 或 Bridge service 回应 Source Event 的 origin。
_避免使用_：provider credentials、model-selected adapter、callback URL

**Reply**：
通过可信 Reply Route 对已有 Source Event 作出的响应；provider 与 destination 由 Host 而不是 model 选择。
_避免使用_：provider tool call、proactive post、arbitrary send

**Service Action**：
PersonaBot 有意调用的 provider-specific capability，例如向指定 Feishu channel 或 thread 发帖；即使 target 是从 Source Event 中发现的，它也有自己独立的 authorization。
_避免使用_：reply、automatic routing、raw provider API

**Provider Capability**：
某个已配置 provider account 的 adapter 声明可支持的 operation 或 event，例如 recall event、current-message fetch、reply 或 proactive posting。Capability 只代表可用性，绝不代表 authorization。
_避免使用_：permission、grant、installed plugin、tool visibility

**Provider Account Fingerprint**：
由已认证 adapter 根据 provider 签发的 tenant 或 organization、application 或 bot，以及 account identifier 派生的稳定、非 secret provider identity。Managed Restore 使用精确匹配并经过 Human confirmation 来重新绑定 suspended authority；credential reference 与 display name 永远不能作为 identity。
_避免使用_：credential reference、secret hash、account label、guessed provider identity

**Service Grant**：
Human 对 PersonaBot 的显式 authorization：允许它通过某个 provider account，对精确、分组或显式 wildcard 的 target scope 执行指定 Service Action；在接受 intent 时与执行 side effect 时都必须验证。
_避免使用_：provider capability、plugin installation、discovered target、blanket consent

**Content Purge**：
从 Messaging authority 中显式、破坏性地移除 Source Event body 与非共享 Attachment，同时保留因果关系与审计所需的最小 event envelope 和 tombstone。
_避免使用_：recall、hide、archive、garbage collection

**Purge Everywhere**：
一项需要单独确认的破坏性操作：执行 Content Purge，并删除 dependency report 披露的、选定的 managed Memory、Workspace 与 export derivative；BotHarness 控制之外的副本仍由 Human 负责。
_避免使用_：content purge、automatic cascade、external recall

**Purge Ledger**：
Content Purge 的单调递增记录；Managed Restore 会先合并并应用该记录，再开放 Messaging。独立 offline backup 只能保证其中所含的 purge checkpoint；手动保留的旧文件仍不受后续 purge 控制。
_避免使用_：database snapshot、deletion queue、audit log（单独使用）

**Outbox Intent**：
针对一次 external side effect 的持久 request，绑定到 idempotency identity、当前 Source Revision、Provider Capability，以及在需要时绑定 Service Grant。
_避免使用_：message、retry attempt、delivery notification

**Unknown Outcome**：
一种需要 Human resolution 的 Outbox state：provider request 已经开始，但在完成所有可用 reconciliation 后仍无法证明成功或失败；PersonaBot 不能自行安全 retry，也不能宣称成功。
_避免使用_：failure、timeout、retryable error、success

**Wake Policy**：
确定性的 Host policy，决定已 admit 的 event 是立即 wake PersonaBot、并入 digest，还是不触发 automatic wake。
_避免使用_：model decision、delivery mechanism、scheduler

**Delivery Policy**：
Host policy，依据 Wake Policy decision 与 Orchestrator liveness，将后续动作映射到 next step、next turn 或显式 whole-turn abort。
_避免使用_：wake policy、inferred step state、message priority

**Human Inbox**：
面向 Human 的 attention projection，把 Channel Attention 与 PersonaBot Attention 分类为 action-required 或 informational。它引用各自的权威事实，不复制 Channel 内容，也不会把每一条 Bot Inbox item 都摊平成 Human 工作。
_避免使用_：notifications、dashboard list

**Channel Attention**：
由 Channel activity 产生的 Human Inbox item，例如未读消息、mention 或 reply；它引用所属 Source Event，除非被归类为 action-required，否则 Human 可以忽略。
_避免使用_：Channel Inbox、copied message、Bot Inbox Admission

**PersonaBot Attention**：
由 PersonaBot 等待 Human、进入 blocked、需要 approval 或发送 informational report 所产生的 Human Inbox item。
_避免使用_：personal attention、Bot state、notification

**Channel membership**：
Actor 对 Channel 的参与关系，携带 owner/member role 以及在其中 read 或 send 的 authority。
_避免使用_：subscription、notification policy、caller claim

**Bot Channel subscription**：
PersonaBot 对其已加入 Channel 的 attention preference：`all`、`mentions` 或 `muted`，独立于 membership 与 send authority。
_避免使用_：membership、digest schedule、wake decision

**Message provenance**：
Channel message 的可信 origin 与 causal identity——包括它的 Actor、ingress surface 与 external identity，以及任何 reply 或 Bot-to-Bot chain。
_避免使用_：caller-supplied author、transport metadata（单独使用）

### 聊天与回复

**Chat**：
PersonaBot 参与的 Feishu/Lark conversation——group 或 p2p——通过 `chat_id` 识别。
_避免使用_：room、channel、group（当含义也包括 p2p 时）

**DM**：
PersonaBot 与一位 Human 之间的一对一 conversation——即 `dm` 类型的 Channel，或它的 bridged equivalent。
_避免使用_：private chat、PM

**Thread**：
通过回复 Chat 或 Channel 中某条 message 而开启的 sub-conversation。
_避免使用_：topic、sub-chat、channel

**Reply scope**：
PersonaBot answer 的落点：位于 Chat 中 triggering message 下方（root），或进入新 Thread。
_避免使用_：reply mode、answer position、visibility

### Host（宿主）与设置

**PersonaBot registry**：
拥有 PersonaBot definition、archive state、binding 与 Session ownership 的 Host module；其 operational record 存储在 BotHarness operational database 中，而 Soul content 仍保存在文件中。
_避免使用_：config file、database、fleet

**BotHarness operational database**：
整个 Profile 共用的单一 `botharness.db`，物理存储全部 BotHarness operational record，同时各 deep module 保持独立 interface 与 table ownership。它保存对 Soul file、attachment content、DSH Session log、credential 与 DSH-native setting 的引用，但绝不取代这些对象。
_避免使用_：Messaging database、DSH storage domain、Soul store、generic repository

**Profile Backup**：
一种自包含、带版本、压缩的 `.botharness-backup` 文件，包含完整 operational-database snapshot、所有 Soul/Memory file、所有 reachable CAS object、integrity manifest，并可选择包含通过 SessionPersistence 生成的 DSH Session facet；它仅由 Human 显式 export 创建，绝不会由 scheduler 或 dangerous-operation hook 自动创建。
_避免使用_：PersonaBot Export、copied database、SoulSnapshot

**Managed Restore**：
Profile Backup 的 identity-preserving recovery path；在挂载 operational state 之前执行 compatibility、identity-conflict、integrity 与 Purge Ledger 检查。
_避免使用_：import、clone、PersonaBot Export

**Runtime Dependency Manifest**：
一种非 secret declaration，列出 restored profile 可能需要的 provider adapter、model、plugin、tool、Skill 以及其他 target-local capability；包括 required-versus-optional scope 与 compatibility identifier，但绝不包含 executable code。
_避免使用_：plugin bundle、credential inventory、historical tool log、package installer

**Dependency Contract**：
由 Host 拥有的稳定 capability identifier，加上所支持的 interface 与 persisted-schema version range。它用于判断 compatibility，而不要求 producer 使用完全相同的 plugin build；security-critical 或 integrity-critical requirement 不能被 imported package 降级。
_避免使用_：exact package lock、display name、exporter-defined trust、implementation version

**Desired Dependency Reference**：
对 PersonaBot 想要使用的 model、provider、plugin capability、Skill、tool 或 Workspace identity 的可移植 declaration；它的保留独立于当前 Host 如何满足该需求。
_避免使用_：installed package、local path、resolved credential、runtime handle

**Target Resolution**：
经过 Human confirmation、仅对当前 Host 有效的 mapping，将 Desired Dependency Reference 映射到可用的 model、adapter、plugin capability、Skill、tool、credential reference 或 Workspace。新的 Host 必须重新完成 resolution。
_避免使用_：portable authority、overwritten desired configuration、automatic fallback

**Activation Readiness**：
将 restored declaration 与当前可用 dependency 和 mapping 对照后得到的 target-local projection。它按 capability 划分，并报告为 `ready`、`degraded` 或 `blocked`；它不会改变 profile data 是否成功 restore。
_避免使用_：restore result、PersonaBot activity、plugin installation state

**PersonaBot Activation**：
restore 后由 Human 发出的显式 command：接受当前 Activation Readiness，创建全新的 Orchestrator Session，并且只开放 dependency-ready 且已授权的 execution path。它绝不恢复旧 Session。
_避免使用_：profile data activation、dependency installation、automatic resume、unarchive

**Profile Writer Lease**：
一个 Host 对 Profile operational database 进行 write mount 的、由操作系统支持的排他权。第二个 Host 可以提供 diagnostics，但不能运行 PersonaBot 或修改 operational state。
_避免使用_：SQLite busy timeout、timestamp lock、browser leader

**Schema Generation**：
整个 operational database 唯一、单调递增的 compatibility version；各 deep module 提供有序 migration step，但 database owner 负责验证并应用一次 generation transition。
_避免使用_：per-table version、plugin version、migration filename

**Export Origin**：
cloned record 上的结构化 provenance——包括 export id、source installation id 与 source local id——并且在保留这些信息的同时，为每个 imported object 分配新的 local id。
_避免使用_：preserved local id、provider authority、display label

**Backup Barrier**：
一次短暂的、Profile-wide mutation pause：drain BotHarness transaction，将选定 DSH Session flush 到已记录的 durable cursor，固定 Soul/Memory 与 CAS reference，并启动一致的 database snapshot，但不停止 active turn。
_避免使用_：Host shutdown、PersonaBot archive、fuzzy copy

**Unavailable Session Reference**：
一份保留的 Session ownership/audit record，其 DSH Session content 未包含在 Profile Backup 中或不受支持；只有显式 repair 或 relink 成功后才可以恢复。
_避免使用_：deleted Session、empty Session、unowned Session

**Unavailable Workspace Reference**：
已 restore 的 Workspace locator，但其 target directory 尚未在当前 Host 上完成显式 mapping 与 verification。它的 source path 与 identity hint 仍作为 evidence 保留，但相关 Assignment Session 无法恢复。
_避免使用_：missing directory to auto-create、broken Session、trusted absolute path

**Redaction Tombstone**：
一种 typed export placeholder，在有意省略 sensitive content 的同时保留 identity、dependency、hash 与 provenance，使 Export Facet 永远不会包含 dangling reference。
_避免使用_：missing row、empty string、Content Purge

**Import Receipt**：
以 destination profile 与 export id 为 key 的持久 result，用于保证普通 PersonaBot import 幂等；显式请求的额外 Clone 会获得独立 receipt 与新的 local id。
_避免使用_：Export Origin、registry Version、retry token

**Profile Transfer**：
将一个 Profile generation 从 source Host identity-preserving 地移动到 target Host 的规划流程；完成后 source 保持 Transferred Out，防止两个 installation 同时运行同一批 PersonaBot。
_避免使用_：Profile Backup、clone、sync

**Transfer Generation**：
在 Profile Transfer 过程中，将一个已 quiesce 的 source、其 Profile Backup 与一次 target activation 关联起来的唯一 generation。
_避免使用_：Schema Generation、backup timestamp、export id

**Transferred-out Profile**：
已经完成 Profile Transfer 源端流程的 source profile，因此不能运行 PersonaBot、接收 provider event 或执行 external action；除非后续显式 recovery protocol 为其授予新的 active generation。
_避免使用_：Archived PersonaBot、stopped Host、backup source

**Disaster Restore**：
在无法证明旧 Profile 已 deactivate 的情况下执行的 Managed Restore；已 restore 的 provider binding、provider-bound Trigger 与 Service Grant 保持 suspended，直到 Human 解决潜在 split brain。
_避免使用_：Profile Transfer、clone、ordinary restore

**Roster**：
bot-mode sidebar 中展示 PersonaBot 与 Channel 及其 state 的列表。
_避免使用_：dashboard、bot list

**App Sidebar**：
DSH 原生 client 的左侧栏；在 Bot mode 中呈现 Roster。采用此名称是为了与右侧的 Channel sidebar 区分。
_避免使用_：left sidebar、main sidebar、navigation

**Channel sidebar**：
Bot mode panel 中由当前所选 Channel 决定 scope 的右侧区域：group Channel 显示 membership 与 Channel management entry，PersonaBot DM 显示该 PersonaBot 自己的 Assignment、Memory、Bot Inbox 等 entry。它不是 DSH 原生、由 Session 决定 scope 的右侧栏。
_避免使用_：PersonaBot navigation、right panel、session panel、inspector、workbench

**Channel body**：
Bot mode panel 的中间区域，包含所选 Channel 的 header、primary content 与 composer；DM 在这里呈现 Chat。
_避免使用_：main pane、conversation view、chat panel

**Channel sidebar entry**：
Channel sidebar 中一个已注册、可折叠的 item，具有稳定 id、label、order、scope 与 renderer，可用于展示信息、提供 control，或同时承担两者。不可用的 entry 直接缺席，不显示 placeholder。
_避免使用_：widget、card、tab、destination、Channel section

**Client bridge**：
Web Client 用于读取 PersonaBot 并调用各自独立 mutation command 的 RPC surface，不与 Client 共享 Host service。
_避免使用_：remote、IPC、gateway

**Settings UI**：
harness 内部的 DSH settings surface，用于 setup、全局/plugin setting、PersonaBot administration、Memory diagnostics，以及进入 Memory 的链接。日常 Memory 使用属于 Channel sidebar。
_避免使用_：admin panel、dashboard、web console

**Access policy**：
每个 PersonaBot 各自维护、允许访问它的 user 与 Chat 列表。
_避免使用_：whitelist、permissions、ACL

**Credential reference**：
指向由 DSH credentials service 保存的 Feishu App Secret 的引用；secret 本身永远不会进入 config、repo 或 log。
_避免使用_：secret、API key、token
