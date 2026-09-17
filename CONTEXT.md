# BotHarness

A DeepSeek Harness plugin layer that gives LLM agents a persistent identity: PersonaBots — bots with a persona and memory that outlive any session, chat, or workspace.

## Language

### PersonaBots

**PersonaBot**:
A first-class bot entity owned by the Host: a persona plus memory that spans sessions, chats, and workspaces, able to hold several sessions at once.
_Avoid_: bot (bare), agent, assistant, robot

**Bot as a Person**:
The principle that a PersonaBot's continuity comes from its memory files, not from any session history.
_Avoid_: session-scoped identity

**Bot slug**:
A PersonaBot's filesystem-safe identifier — kebab-case, unique per Host.
_Avoid_: display name, title, handle

**Display name**:
The human-facing name of a PersonaBot (`displayName`), distinct from its slug.
_Avoid_: alias, nickname, username

**Persona**:
The role definition — character, voice, and standing instructions — that shapes how a PersonaBot replies. Human-owned: the Agent may not rewrite it.
_Avoid_: system prompt, character sheet, profile

**Bot state**:
The activity model in two levels: a session carries the detail (`thinking`, `working`, `waiting`, `blocked`, `done`), and the PersonaBot aggregates it (`blocked` > `waiting` > `working` > `thinking` > `idle`; `done` is a session event).
_Avoid_: status, mood, presence

**Avatar**:
A PersonaBot's visual representation; the MVP uses deterministic blobatars, Live2D is a later renderer.
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

**Session**:
One run of work or conversation for a PersonaBot — DSH's execution unit, with its own progress and working directory.
_Avoid_: conversation, context window, thread

**Workspace**:
A single host directory a Session works in; it maps one-to-one to a DSH workspace. Several workspaces may be grouped in the UI, but a workspace never spans directories.
_Avoid_: project, multi-root folder, group

**Delegation**:
Handing a PersonaBot work from a chat or the roster; the work runs in a Session.
_Avoid_: assignment, task, job

**Channel binding**:
A PersonaBot's connection to an external surface — an IM app, the sidebar, or a renderer.
_Avoid_: integration, connector

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

**Visibility**:
Whether a memory entry may surface outside the chat that produced it: `shared` (any chat) or `private` (its author's DMs only).
_Avoid_: scope, ACL, secret

**Attachment**:
A file or image uploaded into a Chat, archived into the PersonaBot's workspace at a stable path and referenced from context and Memory.
_Avoid_: upload, media, blob

### Chats and replies

**Chat**:
A Feishu/Lark conversation — group or p2p — that a PersonaBot takes part in, identified by `chat_id`.
_Avoid_: room, channel, group (when p2p is meant too)

**DM**:
A p2p Chat between a PersonaBot and one user.
_Avoid_: private chat, PM

**Thread**:
A sub-conversation opened by replying to a message inside a Chat.
_Avoid_: topic, sub-chat, channel

**Reply scope**:
Where a PersonaBot's answer lands: under the triggering message in the Chat (root), or inside a new Thread.
_Avoid_: reply mode, answer position, visibility

### Host and setup

**PersonaBot registry**:
The Host's record of PersonaBot definitions and their channel bindings.
_Avoid_: config file, database, fleet

**Roster**:
The in-harness panel listing PersonaBots, their state, and their sessions.
_Avoid_: dashboard, bot list

**Settings UI**:
The in-harness DSH settings surface for the setup wizard, plugin settings, PersonaBot management, memory editing, and diagnostics.
_Avoid_: admin panel, dashboard, web console

**Access policy**:
The per-PersonaBot list of users and chats allowed to reach it.
_Avoid_: whitelist, permissions, ACL

**Credential reference**:
A pointer to a Feishu App Secret held by the DSH credentials service; the secret itself never reaches config, repo, or logs.
_Avoid_: secret, API key, token
