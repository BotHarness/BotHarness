# BotHarness Product Context

A DeepSeek Harness plugin layer that gives LLM agents a persistent identity: PersonaBots — bots with a persona and memory that outlive any session, chat, or workspace.

## Language

### PersonaBots

**PersonaBot**:
A first-class bot entity owned by the Host: a persona plus memory that spans sessions, chats, and workspaces, able to hold several sessions at once.
_Avoid_: bot (bare), agent, assistant, robot

**Archived PersonaBot**:
A PersonaBot whose new admissions, wakes, Session execution, and external actions are disabled while its identity, ownership, history, and audit attribution remain intact. Archiving first closes those gates, then stops its Orchestrator, Work Sessions, and owned Subagents; it completes only when that execution tree is quiescent. Reactivation never resumes old execution automatically.
_Avoid_: deleted bot, paused UI, purged bot

**Bot as a Person**:
The principle that a PersonaBot's continuity comes from its memory files, not from any session history.
_Avoid_: session-scoped identity

**Bot slug**:
A PersonaBot's filesystem-safe identifier — kebab-case, unique per Host.
_Avoid_: display name, title, handle

**Display name**:
The human-facing name of a PersonaBot (`displayName`), distinct from its slug.
_Avoid_: alias, nickname, username

**Bot tag**:
A single human-facing role label for a PersonaBot — its "job title" in lists and chat headers.
_Avoid_: category, label, badge

**Bot description**:
A one-line human-facing summary of what a PersonaBot is for.
_Avoid_: bio, intro, slogan

**Persona**:
The role definition — character, voice, and standing instructions — that shapes how a PersonaBot replies. Human-owned: the Agent may not rewrite it.
_Avoid_: system prompt, character sheet, profile

**Bot state**:
The activity model in two levels: a session carries the detail (`thinking`, `working`, `waiting`, `blocked`, `done`), and the PersonaBot aggregates it (`blocked` > `waiting` > `working` > `thinking` > `idle`; `done` is a session event).
_Avoid_: status, mood, presence

**Avatar**:
A PersonaBot's visual representation; the default is a deterministic blobatar generated from the bot slug (DM Channel rows show the bot's avatar, group Channels show a glyph), and Live2D is a later renderer.
_Avoid_: profile picture, skin

### Support and execution

**Harness**:
The platform layer — BotHarness — that owns PersonaBots, their memory, state, and workspaces, and exposes them to other plugins.
_Avoid_: framework, runtime, kernel

**Host**:
The single DSH process that runs the plugin and every PersonaBot.
_Avoid_: server, instance, node, worker

**Agent**:
The DSH executor inside one Session. Never a PersonaBot.
_Avoid_: using this word for PersonaBot

**Subagent**:
A DSH child agent and child Session that a Session starts for bounded work; it inherits the parent Session's PersonaBot ownership but belongs to that parent work, never becoming an independent Work Session.
_Avoid_: sub-bot, worker, helper

**Session**:
One run of work or conversation for a PersonaBot — DSH's execution unit, with its own progress and working directory.
_Avoid_: conversation, context window, thread

**Session ownership**:
The exclusive, durable relationship between a Bot-mode Session and at most one PersonaBot; a non-Bot DSH Session may remain unowned, and ownership changes only through explicit repair.
_Avoid_: binding, workspace mapping, cwd inference, session membership

**Work Session**:
An independent root Session for one line of a PersonaBot's work. Its DSH Session id is its canonical identity; a PersonaBot may have several at once, and a DSH Subagent never counts as one.
_Avoid_: task, job, child session, worker, separate work id

**Work Session Directory**:
The PersonaBot-scoped durable read model through which its current Orchestrator explicitly lists and addresses owned Work Sessions, including purpose, Continuity Key, Workspace, DSH-derived activity/last-run facts, dependencies, latest semantic report, and aggregate descendant activity. It keeps execution facts separate from reported outcomes, is rebuilt from Session Ownership and DSH facts, and is queried when needed rather than injected wholesale into every turn. Listings use filtered, ordered, opaque-cursor pagination and never flatten DSH Subagents into top-level Work.
_Avoid_: task list, AgentHandle map, cwd scan, Orchestrator memory

**Continuity Key**:
A stable PersonaBot-local key explicitly assigned to one continuing line of work. It names at most one resumable Work Session and may select it only when ownership, Workspace mapping, model, and dependency requirements still match. An active holder must first become idle/completed or be explicitly stopped and superseded before the key moves.
_Avoid_: title similarity, cwd, most-recent Session, global id

**Work Request**:
A durable, addressed, auditable Orchestrator message to one owned Work Session, optionally correlated to an Inbox Admission or earlier report. Its semantic mode is `context-update`, `next-step`, or `next-turn`; BotWork Runtime maps that to DSH injection, steer, or follow-up without interrupting the current step.
_Avoid_: Channel message, Subagent prompt, broadcast, inferred Session

**Work Delivery Intent**:
The minimal BotHarness-owned durable bridge used while creating a DSH Work Session or delivering a Work Request across the SQLite/DSH transaction boundary. It carries a stable id for idempotent acceptance and bounded restart reconciliation; it is not a general workflow or retry engine.
_Avoid_: exactly-once delivery, task queue, workflow, AgentHandle state

**Work Report**:
A durable Session-origin Source Event by which a Work Session proactively or responsively returns meaningful progress, blocked or waiting state, results, and artifact references to its PersonaBot's Orchestrator. Full execution history remains in DSH SessionPersistence; each report stays immutable while unobserved repeats may share one Attention Unit.
_Avoid_: direct Channel reply, copied Session log, ephemeral callback

**Work Lifecycle Notice**:
A durable Host-origin Source Event emitted only for a meaningful execution boundary such as settled, error, or cancellation. It carries DSH-derived last-run facts, a concise safe summary, and report/artifact references when available, but remains distinct from content the Work Agent authored.
_Avoid_: Work Report, fabricated agent message, per-turn directory snapshot

**Work Concurrency Limit**:
The profile-wide maximum number of independent Work roots allowed to execute concurrently. It is a single Human-configured BotHarness setting in v1; a create or wake attempt beyond the limit fails immediately with machine-readable fields and an LLM-readable explanation, without creating a queue, intent, or DSH Session.
_Avoid_: dispatch queue, per-Bot quota, hidden model budget, total Session count

**Workspace**:
A single host directory a Session works in; it maps one-to-one to a DSH workspace. Several workspaces may be grouped in the UI, but a workspace never spans directories.
_Avoid_: project, multi-root folder, group

**Delegation**:
Handing a PersonaBot work from a chat or the roster; the work runs in a Session.
_Avoid_: assignment, task, job

**Binding**:
A PersonaBot's connection to a surface it takes part in — a Channel, a Chat, the sidebar, or a renderer.
_Avoid_: integration, connector, channel binding

**Orchestrator Session**:
The PersonaBot's long-lived dispatch root Session: at most one is active, consuming the Bot Inbox and deciding replies, dispatch, and new Work Sessions.
_Avoid_: main agent, brain, supervisor

### Memory

**Memory**:
A PersonaBot's persistent knowledge: human-readable Markdown files in a user-configurable memory directory, shared across every session, chat, and workspace.
_Avoid_: knowledge base, vector store, RAG, database, context

**MEMORY.md**:
The entry-point file of a PersonaBot's memory: persona summary, usage notes, and an index of topic files with one-line summaries.
_Avoid_: index, README, manifest

**Topic file**:
A memory file devoted to one subject — a customer, a process, a decision — under the PersonaBot's memory directory.
_Avoid_: note, document, page, record

**Customer profile**:
The north-star topic file: one per customer, holding timeline, key facts, commitments, and links to related Attachments.
_Avoid_: CRM record, account, contact sheet

**Memory tree injection**:
The turn-start injection of the memory directory tree — paths, one-line summaries, and updated-at times — with file bodies fetched only on demand.
_Avoid_: memory dump, prefetch, embedding

**Memory tool**:
A model-callable tool that reads, searches, or writes Memory; every Memory change goes through one.
_Avoid_: memory plugin, hook, background job

**Tool-write**:
The rule that Memory changes only when the model explicitly calls a Memory tool; there is no background distillation.
_Avoid_: auto-summary, auto-extract, distillation

**Attachment**:
A content-addressed file received with a Source Event and retained once for every Channel or PersonaBot that references it. A PersonaBot owns a separate copy only when it deliberately preserves the file into its Memory or Workspace.
_Avoid_: upload, provider URL, per-Bot inbox copy, database blob

### Soul and sharing

**Soul**:
A PersonaBot's persona plus its memory — the identity content that spans sessions and freezes into a SoulSnapshot.
_Avoid_: character, profile, data

**SoulSnapshot**:
An immutable, content-addressed package of a Soul: the `bot.md` manifest, setup instructions, `PERSONA.md`, and selected memory; the unit the registry stores, lists, and imports.
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
A platform-native conversation space; its type is `dm` (a PersonaBot and one human) or `group chat` (several members; informally a chatroom). A Channel keeps its history locally.
_Avoid_: room, server, board

**Channel section**:
A user-created, collapsible grouping of Channels in the bot-mode sidebar. Local display arrangement, not part of a Soul.
_Avoid_: folder, category, group

**Section order (区块顺序)**:
The order of Channel sections in the bot-mode sidebar: creation order by default, user-arranged afterwards.
_Avoid_: priority, layout order

**Sort mode (排序模式)**:
How a sidebar scope orders its rows: `auto` (newest message first), `manual` (the user's frozen order), or `inherit` (follow the global default).
_Avoid_: ordering, sort preference, sorter

**未分组 (Ungrouped)**:
The fixed bottom bucket of the bot-mode sidebar for Channels that belong to no Channel section; flat, not collapsible, and always sorted by the global default.
_Avoid_: default folder, inbox, loose channels

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
The dashboard aggregate of every Bot Inbox: what currently needs the human.
_Avoid_: notifications, dashboard list

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
A restored Workspace locator whose target directory has not been explicitly mapped and verified on the current Host. Its source path and identity hints remain evidence, but its Work Sessions cannot resume.
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

**Client bridge**:
The RPC surface through which the Web Client reads PersonaBots and invokes separate mutation commands without sharing Host services.
_Avoid_: remote, IPC, gateway

**Settings UI**:
The in-harness DSH settings surface for the setup wizard, plugin settings, PersonaBot management, memory editing, and diagnostics.
_Avoid_: admin panel, dashboard, web console

**Access policy**:
The per-PersonaBot list of users and chats allowed to reach it.
_Avoid_: whitelist, permissions, ACL

**Credential reference**:
A pointer to a Feishu App Secret held by the DSH credentials service; the secret itself never reaches config, repo, or logs.
_Avoid_: secret, API key, token

### Developer docs and distribution

**DSH Dev Docs**:
The `/dsh` section of the BotHarness docs site that teaches external developers how to build DSH plugins.
_Avoid_: tutorials, handbook, dev portal, wiki

**dsh-plugin-dev**:
The agent-facing skill with our full-stack DSH plugin authoring guide (host + client); the one artifact that DSH Dev Docs renders and that external developers download.
_Avoid_: prompt, guide, doc

**dsh-skill**:
The standalone GitHub repo (`BotHarness/dsh-skill`) whose root is dsh-plugin-dev itself — the one-line install source, mirrored from this monorepo, never hand-edited.
_Avoid_: package, plugin, marketplace

**Provenance**:
The source, version, and time stamp every published skill artifact and DSH Dev Docs page carries, stating which DSH version (and upstream revision) its claims were verified against, and when.
_Avoid_: disclaimer, changelog, metadata (bare)
