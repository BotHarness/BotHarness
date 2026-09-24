# BotHarness Product Context

A DeepSeek Harness plugin layer that gives LLM agents a persistent product identity: PersonaBots — bots whose identity, Git-backed Memory, and execution ownership outlive any Session, Chat, or Workspace.

## Language

### PersonaBots

**PersonaBot**:
A first-class bot entity owned by the Host: a durable identity with a Git-backed Memory Repository that spans Sessions, Chats, and Workspaces and can hold several Sessions at once. Persona is optional content within Memory, not the identity itself.
_Avoid_: bot (bare), agent, assistant, robot

**Archived PersonaBot**:
A PersonaBot whose new admissions, wakes, Session execution, and external actions are disabled while its identity, ownership, history, and audit attribution remain intact. Archiving first closes those gates, then stops its Orchestrator, Assignment Sessions, and owned Subagents; it completes only when that execution tree is quiescent. Reactivation never resumes old execution automatically.
_Avoid_: deleted bot, paused UI, purged bot

**Bot as a Person**:
The principle that a PersonaBot remains one product identity across Sessions, with durable learned continuity coming from its Memory Repository rather than Session history.
_Avoid_: session-scoped identity

**PersonaBot ID**:
The stable, Host-generated identity of a PersonaBot. It is filesystem-safe and never entered, chosen, or used as the visible mention label by a Human.
_Avoid_: Bot slug, display name, handle, username

**Display name**:
The Human-facing name of a PersonaBot and the primary label shown by an `@` picker. Names may repeat; the selected mention token retains the PersonaBot ID.
_Avoid_: identifier, slug, username

**Role badge**:
One of zero or more Human-facing job or position labels shown beside a PersonaBot's display name. Role badges are descriptive only and never grant authority or identify the PersonaBot.
_Avoid_: Bot tag, permission role, category

**Bot description**:
An optional, brief Human-authored self-introduction that explains who a PersonaBot is, what it does, or what it is good at.
_Avoid_: Persona, role badge, system prompt

**Persona**:
Conventional Memory content that describes character, voice, or standing instructions, delivered to a Session's system prompt from a snapshot frozen at that Session's first prompt assembly. It has no special file type or write protection: an authorized Agent or Human may create, revise, rename, or remove it; an edit reaches new Sessions, not one already running.
_Avoid_: system prompt, character sheet, profile

**Bot state**:
The current presentation of one PersonaBot, projected from its owned Orchestrator and Assignment Session activity. Active Orchestrator work is shown unless it is waiting on Assignments; concurrent Assignment tool kinds collapse to one matching effect or generic `working`, while waiting and blocked attention remain independent indicators rather than configurable priorities.
_Avoid_: status, mood, presence

**Avatar**:
A PersonaBot's shared visual representation across its Bindings: deterministic Blobatar media or Human-supplied image media inside one Bot-state Activity Frame. Blobatar media may animate while working or thinking; custom images remain still while the frame carries activity, and later renderers such as Live2D consume the same state.
_Avoid_: profile picture, skin

### Support and execution

**Harness**:
The platform layer — BotHarness — that owns PersonaBot identity, Memory lifecycle, execution state, and Workspace authorization, exposing product capabilities to other Plugins.
_Avoid_: framework, runtime, kernel

**Host**:
The single DSH process that runs the plugin and every PersonaBot.
_Avoid_: server, instance, node, worker

**Agent**:
The DSH executor inside one Session. Never a PersonaBot.
_Avoid_: using this word for PersonaBot

**Subagent**:
A DSH child agent and child Session that a Session starts for bounded work; it inherits the parent Session's PersonaBot ownership but belongs to that parent work, never becoming an independent Assignment Session.
_Avoid_: sub-bot, worker, helper

**Session**:
One run of work or conversation for a PersonaBot — DSH's execution unit, with its own progress and working directory.
_Avoid_: conversation, context window, thread

**Session ownership**:
The exclusive, durable relationship between a Bot-mode Session and at most one PersonaBot; a non-Bot DSH Session may remain unowned, and ownership changes only through explicit repair.
_Avoid_: binding, workspace mapping, cwd inference, session membership

**Assignment**:
A Human-meaningful continuing line of activity that a PersonaBot's Orchestrator chooses to advance independently. It has no separate durable identity or lifecycle; its canonical runtime identity is the DSH Session id of its Assignment Session.
_Avoid_: Work, work item, task entity, job entity, worker

**Assignment Session**:
A PersonaBot-owned independent root Session that executes exactly one Assignment in exactly one working directory in v1, created and managed by its Orchestrator without requiring the Human to open another Conversation. A PersonaBot may have several at once, and a DSH Subagent never counts as one.
_Avoid_: Work Session, Worker Session, Executor Session, task Session, child Session

**Assignment Agent**:
The DSH Agent executing inside one Assignment Session. It reports only to its PersonaBot's Orchestrator through that Session, has no Channel messaging capability, and is neither a durable identity nor a PersonaBot.
_Avoid_: worker, PersonaBot, Orchestrator, Assignment Session

**Assignment Directory**:
The PersonaBot-scoped durable read model through which its current Orchestrator explicitly lists and addresses owned Assignment Sessions, including purpose, Continuity Key, Workspace, DSH-derived activity/last-run facts, dependencies, latest semantic report, and aggregate descendant activity. It keeps execution facts separate from reported outcomes, is rebuilt from Session Ownership and DSH facts, and is queried when needed rather than injected wholesale into every turn. Listings use filtered, ordered, opaque-cursor pagination and never flatten DSH Subagents into top-level Assignment rows.
_Avoid_: task list, AgentHandle map, cwd scan, Orchestrator memory

**Continuity Key**:
A stable PersonaBot-local key explicitly assigned to one continuing line of work. It names at most one resumable Assignment Session and may select it only when ownership, Workspace mapping, model, and dependency requirements still match. An active holder must first become idle/completed or be explicitly stopped and superseded before the key moves.
_Avoid_: title similarity, cwd, most-recent Session, global id

**Assignment Request**:
A durable, addressed, auditable Orchestrator message to one owned Assignment Session, optionally correlated to an Inbox Admission or earlier report. Its semantic mode is `context-update`, `next-step`, or `next-turn`; Assignment Runtime maps that to DSH injection, steer, or follow-up without interrupting the current step.
_Avoid_: Channel message, Subagent prompt, broadcast, inferred Session

**Assignment Delivery Intent**:
The minimal BotHarness-owned durable bridge used while creating a DSH Assignment Session or delivering an Assignment Request across the SQLite/DSH transaction boundary. It carries a stable id for idempotent acceptance and bounded restart reconciliation; it is not a general workflow or retry engine.
_Avoid_: exactly-once delivery, task queue, workflow, AgentHandle state

**Assignment Report**:
A durable Session-origin Source Event by which an Assignment Session proactively or responsively returns meaningful progress, blocked or waiting state, results, and artifact references to its PersonaBot's Orchestrator. Full execution history remains in DSH SessionPersistence; each report stays immutable while unobserved repeats may share one Attention Unit.
_Avoid_: direct Channel reply, copied Session log, ephemeral callback

**Assignment Ask**:
An Assignment Report variant that declares the Assignment is waiting for an Orchestrator reply before continuing. The Assignment ends its turn while it waits, and the Orchestrator's addressed Assignment Request resumes the Session; it is not a blocking call, a Channel message, or a separate lifecycle.
_Avoid_: blocking call, direct Orchestrator message, question queue

**Assignment Lifecycle Notice**:
A durable Host-origin Source Event emitted only for a meaningful execution boundary such as settled, error, or cancellation. It carries DSH-derived last-run facts, a concise safe summary, and report/artifact references when available, but remains distinct from content the Assignment Agent authored.
_Avoid_: Assignment Report, fabricated agent message, per-turn directory snapshot

**Assignment Concurrency Limit**:
The profile-wide maximum number of independent Assignment Sessions allowed to execute concurrently. It is a single Human-configured BotHarness setting in v1; a create or wake attempt beyond the limit fails immediately with machine-readable fields and an LLM-readable explanation, without creating a queue, intent, or DSH Session.
_Avoid_: dispatch queue, per-Bot quota, hidden model budget, total Session count

**Workspace**:
A single host directory a Session works in; it maps one-to-one to a DSH workspace. Several workspaces may be grouped in the UI, but a workspace never spans directories.
_Avoid_: project, multi-root folder, group

**Workspace Grant**:
A durable, revocable, application-defined authorization for one PersonaBot and one resolved Workspace. Its Orchestrator may read that Workspace; an Assignment selected under the Grant may read and write it. The Grant is neither a DSH Workspace nor a per-Assignment prompt.
_Avoid_: Service Grant, Workspace, one-time approval, cwd inference

**Tool Approval Rule**:
A Human-saved, revocable instruction to answer future DSH approval requests automatically for one PersonaBot role and Workspace Grant scope. An exact rule matches the native tool name and complete input; an all-opaque rule covers every opaque native tool in that scope. Each matching call still receives its own DSH approval decision and audit event.
_Avoid_: Workspace Grant, provider Service Grant, sandbox preset, inferred command similarity

**Assignment Access Preset**:
A Human-controlled per-PersonaBot choice applied when a new Assignment is created. The default is DSH workspace-write with ask; dangerous full access is an explicit opt-in to DSH danger-full-access with never. The chosen mode is frozen in each Assignment's permission snapshot, while its selected Workspace Grant remains required.
_Avoid_: Workspace Grant, in-place Session mode switch, Orchestrator permission

**Delegation**:
Handing responsibility to a PersonaBot from a Chat or the Roster. Its Orchestrator may answer directly or create or reuse one or more Assignment Sessions.
_Avoid_: direct Session creation, task entity, job entity

**Binding**:
A PersonaBot's connection to a surface it takes part in — a Channel, a Chat, the sidebar, or a renderer.
_Avoid_: integration, connector, channel binding

**Orchestrator Session**:
The PersonaBot's long-lived dispatch root Session: at most one is active, consuming the Bot Inbox and deciding replies, dispatch, and new Assignment Sessions. Its working directory is always the PersonaBot's Memory Repository; it is the PersonaBot's social voice, not a Human-managed Conversation or an Assignment row. Ordinary Session output remains execution history; only an explicit Channel messaging command authorized from trusted Session ownership and Channel membership speaks to a Human-facing Channel.
_Avoid_: main agent, brain, supervisor

### Computer

**Computer**:
A profile-scoped Linux desktop that every PersonaBot of one profile shares, with one persistent volume holding its files, browser profile (cookies and logins), and CLI credentials. Its isolation boundary is the profile, never a PersonaBot.
_Avoid_: machine, VM, sandbox, desktop, host

**Bot Screen**:
The private work surface one PersonaBot uses on a Computer — the windows and tabs it opened. Observation and action are scoped to its owned windows; it is a visibility scope, not a security boundary.
_Avoid_: display, virtual screen, workspace, desktop

**Computer Provider**:
The Provider that runs one Computer and supplies the observation and action capabilities PersonaBots use on it; exactly one is registered at a time.
_Avoid_: driver, backend, sandbox

**Takeover**:
A human session on a Computer that pauses every PersonaBot acting there and disables model-facing screenshots for its duration. It is initiated from one Bot Screen but always applies to the whole Computer.
_Avoid_: handoff, screen sharing, per-bot takeover

**Computer Export**:
A portable archive of one Computer's persistent volume, produced by an explicit export action and restorable on another Host. It is a profile-scoped facet, never part of a PersonaBot export.
_Avoid_: PersonaBot export, backup file, disk image

### Memory

**Memory**:
Persistent knowledge held as ordinary human-readable Markdown files in the Memory Repository created with every PersonaBot. The Orchestrator works with those files through its Memory-scoped file capability; an accepted Memory Commit makes changes effective. Unconfined Shell, search, and Git tools are unavailable to Bot-owned Sessions while their read boundary cannot be enforced.
_Avoid_: knowledge base, vector store, RAG, database, context

**Memory Repository**:
A PersonaBot-owned Git repository of Memory files, created automatically with the PersonaBot and used as its Orchestrator Session's working directory. Its lifecycle follows the PersonaBot while archive, export, restore, and purge remain explicit operations.
_Avoid_: optional attachment, Session memory, generated index, project Workspace

**Topic file**:
A Memory file devoted to one subject — a customer, a process, a decision — inside a Memory Repository.
_Avoid_: note, document, page, record

**Customer profile**:
The north-star topic file: one per customer, holding timeline, key facts, commitments, and links to related Attachments.
_Avoid_: CRM record, account, contact sheet

**Memory Service**:
The application-defined capability that owns Memory Repository lifecycle, validation, reconciliation, accepted commits, history, and queries. In v1 it serves runtime and Human-facing Consumers but does not expose model-callable Memory read/write Tools.
_Avoid_: Memory tool, filesystem watcher, Git event source, generic repository

**Memory Commit**:
An accepted Git commit that makes a coherent set of Memory file changes effective, with actor and cause attribution. Uncommitted working-tree changes are provisional and do not change a Session's frozen persona, history projections, or Memory events.
_Avoid_: file save, filesystem event, raw Git commit, auto-save

**Memory Reconciliation**:
The Memory Service process that validates repository state and accepts or rejects candidate Git commits against Memory invariants. Live Cordis Events describe reconciliation and accepted Memory Commits; they never treat `.git` filesystem activity as durable fact.
_Avoid_: filesystem watch, background distillation, event-sourced Git

**Attachment**:
A content-addressed file received with a Source Event and retained once for every Channel or PersonaBot that references it. A PersonaBot owns a separate copy only when it deliberately preserves the file into its Memory or Workspace.
_Avoid_: upload, provider URL, per-Bot inbox copy, database blob

### Soul and sharing

**Soul**:
The selected Memory content of a PersonaBot that may freeze into a SoulSnapshot, including Persona content when present.
_Avoid_: character, profile, data

**SoulSnapshot**:
An immutable, content-addressed package of a Soul: the `bot.md` manifest, setup instructions, and selected Memory files; the unit the registry stores, lists, and imports. No Persona file is required.
_Avoid_: export, backup, bot zip, image

**PersonaBot Export**:
An immutable, versioned transfer package that always contains one SoulSnapshot and may contain explicitly selected operational Export Facets. Its default is Soul only; it never carries credentials or live authority.
_Avoid_: SoulSnapshot, database copy, live clone, registry version

**Export Facet**:
A dependency-closed, schema-versioned optional part of a PersonaBot Export, such as Source Events and Attachments, Inbox and attention facts, Triggers and Wake Policies, a Messaging Archive, disabled Service Grant declarations, or provider account references awaiting rebind.
_Avoid_: arbitrary table dump, credential bundle, active permission

**Messaging Archive**:
A versioned, portable, read-only export of selected Messaging facts, with optional per-Channel NDJSON views derived from the same snapshot. It is not a second authority and contains no credentials.
_Avoid_: Channel authority, database backup, live inbox

**Rebinding Request**:
An inactive imported reference describing a provider account or authority the Human may reconnect and reauthorize locally; until then it cannot admit events, wake a PersonaBot, or execute a Service Action.
_Avoid_: credential, Service Grant, automatic reconnect

**Soul registry**:
The hosted service that stores, versions, and serves SoulSnapshots — the marketplace backend, distinct from the Host's PersonaBot registry.
_Avoid_: hub, store, database

**Listing**:
A bot's presence in the Soul registry: one `@handle/slug` namespace, a description, and its Versions.
_Avoid_: repo, page, entry

**Version**:
A human-named tag pointing at one immutable SoulSnapshot digest under a Listing.
_Avoid_: release, build, revision

**Handle**:
An account's unique public identifier, used as the namespace of its Listings; never the account's email.
_Avoid_: username, account id

**Bot set**:
A named group of Listings meant to be imported together.
_Avoid_: collection, bundle, pack, team

**Export**:
Materializing a PersonaBot Export. The default selects only the Persona plus chosen Memory in its SoulSnapshot; operational Export Facets require explicit selection.
_Avoid_: database dump, live clone, publish

**Import**:
Creating a new PersonaBot from a SoulSnapshot or PersonaBot Export; always a copy, with imported operational authorities disabled until explicitly rebound or reauthorized.
_Avoid_: install, clone, pull, restore

**Publish**:
Uploading a SoulSnapshot to the Soul registry as a Version.
_Avoid_: upload, push, submit

### Collaboration

**Actor**:
A Human or PersonaBot that can participate in Channels and author messages; a Bridge carries an Actor's message but is not itself an Actor.
_Avoid_: client, connector, bridge identity, caller-supplied sender

**Source Event**:
An immutable local fact received from a Channel, Bridge, webhook, Session, or system source, holding the sole local copy of its content and trusted provenance. It may appear in a Channel and may be admitted to any number of Bot Inboxes, but neither relationship owns another copy.
_Avoid_: inbox message, mailbox copy, notification payload, stimulus

**Provider Echo**:
A provider's inbound reflection of a message BotHarness already sent. When correlated, it enriches the existing Source Event and Outbox receipt rather than creating new attention; an unmatched own-sender echo remains unresolved and cannot wake a PersonaBot.
_Avoid_: new user message, duplicate Channel message, delivery success by assumption

**Source Revision**:
A new Source Event that records an observed edit or retraction of an earlier Source Event while leaving the original fact intact; revisions form one causal chain whose current presentation can be derived.
_Avoid_: in-place edit, overwritten message, replacement body

**Unresolved Revision**:
A Source Revision received before its original Source Event, retained without admission or wake by trusted external identity until the causal chain and target can be linked or reconciled.
_Avoid_: invalid event, orphan to discard, latest by arrival

**Revision Conflict**:
Two or more retained Source Revisions whose current ordering cannot be proven; current-content-dependent external actions remain unavailable until provider reconciliation or Human resolution.
_Avoid_: latest arrival wins, merge guess, retryable error

**Attention Unit**:
A PersonaBot's current consideration of one Source Event revision chain; unobserved revisions coalesce into it, while a change after observation becomes new attention.
_Avoid_: mailbox item, message copy, delivery attempt

**Channel**:
A platform-native conversation space; its type is `dm` (a PersonaBot and one human) or `group chat` (several members; informally a chatroom). A Channel keeps its history locally. Both types participate in the same Channel-section membership, top-level ordering, drag, and move rules; a DM keeps its PersonaBot avatar presentation.
_Avoid_: room, server, board

**Hidden Channel**:
A Channel omitted from expanded and collapsed roster navigation by an explicit Human presentation choice. Hiding retains Channel membership, history, routing, PersonaBot and Memory state, plus its pin, section, and order placement; the Human can restore it from the hidden-Channel manager.
_Avoid_: deleted Channel, archived Channel, muted Channel, Content Purge

**Channel section**:
A user-created, collapsible grouping of Channels in the bot-mode sidebar. Local display arrangement, not part of a Soul.
_Avoid_: folder, category, group

**Section order (区块顺序)**:
The relative order of Channel sections in the bot-mode sidebar: creation order by default, user-arranged afterwards. Ungrouped Channels may occupy top-level positions between sections without becoming sections.
_Avoid_: priority, layout order

**Sort mode (排序模式)**:
How a sidebar scope orders its rows: `auto` (newest message first), `manual` (the user's frozen order), or `inherit` (follow the global default).
_Avoid_: ordering, sort preference, sorter

**未分组 (Ungrouped)**:
The membership state of a Channel that belongs to no Channel section. Ungrouped Channels render as loose top-level rows, may sit between sections, and have no bucket header or collapse state.
_Avoid_: default folder, inbox, fixed bottom bucket

**Bridge**:
A configured connection from an external source to an explicit Channel or PersonaBot Inbox target; it carries inbound delivery and exposes outbound capabilities without becoming the Actor.
_Avoid_: integration, connector, adapter

**Bot Inbox**:
The PersonaBot-level view of Source Events admitted for its attention, whether or not an event belongs to a Channel. It is not a second content store: reading is an explicit act, and ignoring is allowed.
_Avoid_: queue, mailbox, backlog

**Inbox Admission**:
The durable relationship saying why a Source Event is eligible for one PersonaBot's attention, together with that Bot's read, defer, or ignore facts. It references the Source Event and never copies its content.
_Avoid_: inbox item body, delivery job, message copy

**Inbox Trigger**:
A PersonaBot-owned durable Host rule that matches Source Events and creates Inbox Admissions, including the admission reason, priority, and Wake Policy selection. Shared templates may create it, but a Bridge never owns it or invokes the Agent.
_Avoid_: bridge, wake policy, model trigger, scheduler

**Messaging Policy**:
A versioned Host rule or authorization whose exact revision must participate in a Messaging transaction, including Inbox Triggers, Wake Policy selection, provider account references, and Service Grants. It belongs in the Messaging store; unrelated PersonaBot, Session, roster, and UI state do not.
_Avoid_: all bot state, model instruction, settings (bare)

**Attention Decision**:
An auditable PersonaBot fact that an Inbox Admission was observed, deferred, ignored, or handled; pending state is derived from these facts rather than stored as a delivery lifecycle.
_Avoid_: mailbox status, Agent delivery state, consumed flag

**Observation**:
The moment actionable Source Event content or a faithful actionable summary enters the Orchestrator's turn context or is explicitly read by it. Transport queuing, metadata listing, and Human UI viewing are not Observation.
_Avoid_: delivery, notification, human read receipt, outbox success

**Reply Route**:
The non-secret capability reference that lets the Host answer the origin of a Source Event through the correct Channel or Bridge service.
_Avoid_: provider credentials, model-selected adapter, callback URL

**Reply**:
A response to an existing Source Event sent through its trusted Reply Route; the Host, not the model, selects the provider and destination.
_Avoid_: provider tool call, proactive post, arbitrary send

**Service Action**:
A provider-specific capability a PersonaBot invokes deliberately, such as posting to a selected Feishu channel or thread; it has its own authorization even when the target was discovered from a Source Event.
_Avoid_: reply, automatic routing, raw provider API

**Provider Capability**:
An operation or event that one configured provider account's adapter declares it can support, such as recall events, current-message fetch, replies, or proactive posting. Capability is availability, never authorization.
_Avoid_: permission, grant, installed plugin, tool visibility

**Provider Account Fingerprint**:
A stable, non-secret provider identity derived by an authenticated adapter from provider-issued tenant or organization, application or bot, and account identifiers. Managed Restore uses an exact match plus Human confirmation to rebind suspended authority; credential references and display names never count as identity.
_Avoid_: credential reference, secret hash, account label, guessed provider identity

**Service Grant**:
Explicit Human authorization for a PersonaBot to perform named Service Actions through one provider account against an exact, grouped, or explicitly wildcarded target scope, validated both when intent is accepted and when its side effect executes.
_Avoid_: provider capability, plugin installation, discovered target, blanket consent

**Content Purge**:
An explicit destructive removal of Source Event bodies and unshared Attachments from Messaging authority while retaining the minimum event envelope and tombstone required for causality and audit.
_Avoid_: recall, hide, archive, garbage collection

**Purge Everywhere**:
A separately confirmed destructive operation that applies Content Purge and removes selected managed Memory, Workspace, and export derivatives disclosed by a dependency report; copies outside BotHarness control remain the Human's responsibility.
_Avoid_: content purge, automatic cascade, external recall

**Purge Ledger**:
The monotonic record of Content Purges that Managed Restore merges and applies before Messaging becomes available. A standalone offline backup can guarantee only the purge checkpoint it contains; manually retained older files remain outside later purge control.
_Avoid_: database snapshot, deletion queue, audit log (bare)

**Outbox Intent**:
A durable request for one external side effect, bound to an idempotency identity, current Source Revision, Provider Capability, and Service Grant where required.
_Avoid_: message, retry attempt, delivery notification

**Unknown Outcome**:
A Human-resolved Outbox state whose provider request started but whose success or failure cannot be proven after available reconciliation; it is not safe for the PersonaBot to retry or declare success on its own.
_Avoid_: failure, timeout, retryable error, success

**Wake Policy**:
The deterministic Host policy that decides whether an admitted event wakes a PersonaBot now, joins a digest, or causes no automatic wake.
_Avoid_: model decision, delivery mechanism, scheduler

**Delivery Policy**:
The Host policy that maps a Wake Policy decision and Orchestrator liveness to the next step, the next turn, or an explicit whole-turn abort.
_Avoid_: wake policy, inferred step state, message priority

**Human Inbox**:
A Human-level attention projection that classifies Channel Attention and PersonaBot Attention as either action-required or informational. It references their owning facts and does not copy Channel content or flatten every Bot Inbox item into Human work.
_Avoid_: notifications, dashboard list

**Channel Attention**:
A Human Inbox item caused by Channel activity such as an unread message, mention, or reply; it references the owning Source Event and may be ignored unless classified action-required.
_Avoid_: Channel Inbox, copied message, Bot Inbox Admission

**PersonaBot Attention**:
A Human Inbox item caused by a PersonaBot waiting for the Human, becoming blocked, requiring approval, or issuing an informational report.
_Avoid_: personal attention, Bot state, notification

**Channel membership**:
An Actor's participation in a Channel, carrying its owner/member role and authority to read or send there.
_Avoid_: subscription, notification policy, caller claim

**Bot Channel subscription**:
A PersonaBot's attention preference for a Channel it has joined: `all`, `mentions`, or `muted`, independent of membership and send authority.
_Avoid_: membership, digest schedule, wake decision

**Message provenance**:
The trusted origin and causal identity of a Channel message — its Actor, ingress surface and external identity, plus any reply or Bot-to-Bot chain.
_Avoid_: caller-supplied author, transport metadata (bare)

### Chats and replies

**Chat**:
A Feishu/Lark conversation — group or p2p — that a PersonaBot takes part in, identified by `chat_id`.
_Avoid_: room, channel, group (when p2p is meant too)

**DM**:
A 1:1 conversation between a PersonaBot and one human — a Channel of type `dm`, or its bridged equivalent.
_Avoid_: private chat, PM

**Thread**:
A sub-conversation opened by replying to a message inside a Chat or a Channel.
_Avoid_: topic, sub-chat, channel

**Reply scope**:
Where a PersonaBot's answer lands: under the triggering message in the Chat (root), or inside a new Thread.
_Avoid_: reply mode, answer position, visibility

### Host and setup

**PersonaBot registry**:
The Host module that owns PersonaBot definitions, archive state, bindings, and Session ownership; its operational records live in the BotHarness operational database while Soul content remains in files.
_Avoid_: config file, database, fleet

**BotHarness operational database**:
The one profile-scoped `botharness.db` that physically stores every BotHarness operational record while deep modules retain separate interfaces and table ownership. It stores references to, but never replaces, Soul files, attachment content, DSH Session logs, credentials, or DSH-native settings.
_Avoid_: Messaging database, DSH storage domain, Soul store, generic repository

**Profile Backup**:
A self-contained, versioned, compressed `.botharness-backup` file containing the complete operational-database snapshot, every Soul/Memory file, every reachable CAS object, an integrity manifest, and optionally a DSH Session facet produced through SessionPersistence; created only by an explicit Human export, never by a scheduler or dangerous-operation hook.
_Avoid_: PersonaBot Export, copied database, SoulSnapshot

**Managed Restore**:
The identity-preserving recovery path for a Profile Backup, including compatibility, identity-conflict, integrity, and Purge Ledger checks before operational state mounts.
_Avoid_: import, clone, PersonaBot Export

**Runtime Dependency Manifest**:
The non-secret declaration of provider adapters, models, plugins, tools, Skills, and other target-local capabilities a restored profile may require, including required-versus-optional scope and compatibility identifiers but never executable code.
_Avoid_: plugin bundle, credential inventory, historical tool log, package installer

**Dependency Contract**:
A Host-owned stable capability identifier plus supported interface and persisted-schema version ranges. It determines compatibility without requiring the producer's exact plugin build; security- or integrity-critical requirements cannot be downgraded by an imported package.
_Avoid_: exact package lock, display name, exporter-defined trust, implementation version

**Desired Dependency Reference**:
The portable declaration of the model, provider, plugin capability, Skill, tool, or Workspace identity a PersonaBot intends to use, retained independently from how the current Host satisfies it.
_Avoid_: installed package, local path, resolved credential, runtime handle

**Target Resolution**:
The Human-confirmed, Host-local mapping from a Desired Dependency Reference to an available model, adapter, plugin capability, Skill, tool, credential reference, or Workspace. A new Host must resolve it again.
_Avoid_: portable authority, overwritten desired configuration, automatic fallback

**Activation Readiness**:
The target-local projection of restored declarations against currently available dependencies and mappings. It is capability-scoped and reported as `ready`, `degraded`, or `blocked`; it does not change whether profile data restored successfully.
_Avoid_: restore result, PersonaBot activity, plugin installation state

**PersonaBot Activation**:
The explicit Human command after restore that accepts the current Activation Readiness, creates a fresh Orchestrator Session, and opens only dependency-ready and authorized execution paths. It never resumes an old Session.
_Avoid_: profile data activation, dependency installation, automatic resume, unarchive

**Profile Writer Lease**:
The exclusive, operating-system-backed right for one Host to mount a profile's operational database for writes. A second Host may expose diagnostics but cannot run PersonaBots or mutate operational state.
_Avoid_: SQLite busy timeout, timestamp lock, browser leader

**Schema Generation**:
The single monotonic compatibility version for the whole operational database; deep modules contribute ordered migration steps, but the database owner validates and applies one generation transition.
_Avoid_: per-table version, plugin version, migration filename

**Export Origin**:
Structured provenance on cloned records — export id, source installation id, and source local id — retained while every imported object receives a fresh local id.
_Avoid_: preserved local id, provider authority, display label

**Backup Barrier**:
A short profile-wide mutation pause that drains BotHarness transactions, flushes selected DSH Sessions to recorded durable cursors, fixes Soul/Memory and CAS references, and starts a consistent database snapshot without stopping active turns.
_Avoid_: Host shutdown, PersonaBot archive, fuzzy copy

**Unavailable Session Reference**:
A preserved Session ownership/audit record whose DSH Session content was omitted or unsupported in a Profile Backup; it cannot resume until an explicit repair or relink succeeds.
_Avoid_: deleted Session, empty Session, unowned Session

**Unavailable Workspace Reference**:
A restored Workspace locator whose target directory has not been explicitly mapped and verified on the current Host. Its source path and identity hints remain evidence, but its Assignment Sessions cannot resume.
_Avoid_: missing directory to auto-create, broken Session, trusted absolute path

**Redaction Tombstone**:
A typed export placeholder that preserves identity, dependency, hash, and provenance while deliberately omitting sensitive content, so an Export Facet never contains a dangling reference.
_Avoid_: missing row, empty string, Content Purge

**Import Receipt**:
The durable result keyed by destination profile and export id that makes ordinary PersonaBot import idempotent; an explicitly requested additional Clone receives a separate receipt and fresh local ids.
_Avoid_: Export Origin, registry Version, retry token

**Profile Transfer**:
The planned identity-preserving move of one profile generation from a source Host to a target Host, leaving the source Transferred Out so both installations cannot run the same PersonaBots.
_Avoid_: Profile Backup, clone, sync

**Transfer Generation**:
The unique generation that links one quiesced source, its Profile Backup, and one target activation during Profile Transfer.
_Avoid_: Schema Generation, backup timestamp, export id

**Transferred-out Profile**:
A source profile that has completed its side of Profile Transfer and therefore cannot run PersonaBots, receive provider events, or execute external actions unless a later explicit recovery protocol grants it a new active generation.
_Avoid_: Archived PersonaBot, stopped Host, backup source

**Disaster Restore**:
Managed Restore performed without proving the old profile is deactivated; restored provider bindings, provider-bound Triggers, and Service Grants remain suspended until the Human resolves possible split brain.
_Avoid_: Profile Transfer, clone, ordinary restore

**Roster**:
The bot-mode sidebar list of PersonaBots and Channels, with their state.
_Avoid_: dashboard, bot list

**App Sidebar**:
The DSH-native left column of the client, which in Bot mode renders the Roster. It is named to distinguish it from the Channel sidebar on the right.
_Avoid_: left sidebar, main sidebar, navigation

**Channel sidebar**:
The right-side region of the Bot mode panel, scoped to the currently selected Channel: a group Channel shows its membership and Channel management entries, and a PersonaBot DM shows that PersonaBot's own entries such as Assignments, Memory, and its Bot Inbox. It is not the DSH session-scoped native right column.
_Avoid_: PersonaBot navigation, right panel, session panel, inspector, workbench

**Channel body**:
The center region of the Bot mode panel: the selected Channel's header, primary content, and composer. A DM renders its Chat here.
_Avoid_: main pane, conversation view, chat panel

**Channel sidebar entry**:
One registered, collapsible item of a Channel sidebar: a stable id, label, order, scope, and a renderer that may display information, offer controls, or both. An unavailable entry is absent rather than a placeholder.
_Avoid_: widget, card, tab, destination, Channel section

**Client bridge**:
The RPC surface through which the Web Client reads PersonaBots and invokes separate mutation commands without sharing Host services.
_Avoid_: remote, IPC, gateway

**Settings UI**:
The in-harness DSH settings surface for setup, global/plugin settings, PersonaBot administration, Memory diagnostics, and links into Memory. Ordinary Memory use belongs to the Channel sidebar.
_Avoid_: admin panel, dashboard, web console

**Access policy**:
The per-PersonaBot list of users and chats allowed to reach it.
_Avoid_: whitelist, permissions, ACL

**Credential reference**:
A pointer to a Feishu App Secret held by the DSH credentials service; the secret itself never reaches config, repo, or logs.
_Avoid_: secret, API key, token
