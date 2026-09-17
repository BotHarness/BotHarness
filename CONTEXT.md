# DeepSeekBot

A DeepSeek Harness plugin where one Host runs several Feishu/Lark Bots, each with its own persona and file-based memory that persists across chats, threads, and sessions.

## Language

### Bots and identity

**Bot**:
A Feishu/Lark identity operated by the Host, with its own persona, workspace, model, and memory.
_Avoid_: agent, assistant, robot, app, account

**Bot slug**:
A human-readable name for a Bot — its alias, else its name, else its id.
_Avoid_: handle, username, display id

**Workspace**:
The on-disk home of a Bot: its working area for files and code execution, and the parent of its memory.
_Avoid_: data directory, project, sandbox

**Bot as a Person**:
The principle that a Bot's identity is continuous across chats and sessions; its memory files, not any session history, make it the same Bot.
_Avoid_: persona (that is only its voice)

**Persona**:
The role definition — character, voice, and standing instructions — that shapes how a Bot replies. Human-owned: the Agent may not rewrite it.
_Avoid_: system prompt, character sheet, profile

**Session**:
The DSH conversation a Bot holds with one chat or thread. Message history lives here; Bot identity does not.
_Avoid_: conversation, context window, thread

**Access policy**:
The per-Bot list of users and chats allowed to reach it.
_Avoid_: whitelist, permissions, ACL

### Chats and replies

**Chat**:
A Feishu/Lark conversation — group or p2p — that a Bot takes part in, identified by `chat_id`.
_Avoid_: room, channel, group (when p2p is meant too)

**DM**:
A p2p Chat between a Bot and one user.
_Avoid_: private chat, PM

**Thread**:
A sub-conversation opened by replying to a message inside a Chat.
_Avoid_: topic, sub-chat, channel

**Reply scope**:
Where a Bot's answer lands: under the triggering message in the Chat (root), or inside a new Thread.
_Avoid_: reply mode, answer position, visibility

### Memory

**Memory**:
A Bot's persistent knowledge: human-readable Markdown files under its workspace, shared across every chat, thread, and session.
_Avoid_: knowledge base, vector store, RAG, database, context

**MEMORY.md**:
The entry-point file of a Bot's memory: persona summary, usage notes, and an index of topic files with one-line summaries.
_Avoid_: index, README, manifest

**Topic file**:
A memory file devoted to one subject — a customer, a process, a decision — under the Bot's memory directory.
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
A file or image uploaded into a Chat, archived into the Bot's workspace at a stable path and referenced from context and Memory.
_Avoid_: upload, media, blob

**Visibility**:
Whether a memory entry may surface outside the chat that produced it: `shared` (any chat) or `private` (its author's DMs only).
_Avoid_: scope, ACL, secret

### Host and setup

**Host**:
The single DSH process that runs the plugin and every Bot.
_Avoid_: server, instance, node, worker

**Bot registry**:
The Host's record of Bot definitions: persona, credential reference, workspace, model, memory directory, access policy.
_Avoid_: config file, database, fleet

**Settings UI**:
The in-harness DSH settings surface for the setup wizard, plugin settings, Bot management, memory editing, and diagnostics.
_Avoid_: admin panel, dashboard, web console

**Credential reference**:
A pointer to a Feishu App Secret held by the DSH credentials service; the secret itself never reaches config, repo, or logs.
_Avoid_: secret, API key, token
