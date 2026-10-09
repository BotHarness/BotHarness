---
Status: Accepted
Date: 2026-10-09
---

# Bot Self-Records keep Memory commits and Bot actions where their cause happened

A PersonaBot forgets what it did once its tool calls are compacted or a new Orchestrator Session starts. Channels hold its conversations and `git log` holds its Memory, but nothing durable says "I committed this because of what Ana said in the Group", "I messaged Nova because of that Group", or "I created a schedule because Nova asked in our DM". When several Bots collaborate, the Human also cannot see, in the conversation that started it, what each Bot did as a result.

We decided that **each real Memory commit and each Bot action made through a BotHarness-defined tool becomes one Bot Self-Record.** A self-record is one Source Event with two views:

- It is a **Channel Notice** in the Channel of the Source Event that caused it.
- It is a **record** in the acting Bot's own Bot Inbox, admitted already handled.

The Bot can later search what it did and why, across Sessions, and the Human sees each consequence next to its cause. A self-record is never conversation, never unread, and never wakes anyone.

The Human set the direction on 2026-10-09 (#1272) and refined it the same day: records follow their cause, Channel Notices are a separate kind of history line, and Inbox history is searched with FTS5.

## Decision

### Cause: the Source Event that started the work

- Every self-record names its **cause**: the Source Event the acting Bot was handling. This is the cause the Host already uses for `botCausation`.
  - **Orchestrator turns:** the cause is the turn's wake Source Event.
  - **Messages that joined the turn:** a send into a Channel where one of the turn's own Source Events arrived (for example, a Bot DM steered into a Group-woken turn) takes that event as its cause. The send answers that conversation, not the event that woke the turn.
  - **BotHarness tools:** a tool that acts on several harvested events may name one of the turn's own Source Events as its cause. The Host rejects any other id.
- The **Cause Channel** is that Source Event's Channel: a Group, a Human–PersonaBot DM, or a Bot-to-Bot DM.
  - The notice goes there when the Channel still exists and the Bot is still a member.
  - When the cause has no Channel or the Channel can't be used, the notice goes to the Bot's Human DM. That covers a schedule firing, an Assignment report, an external Bridge message, a Memory edit made outside any turn, a deleted Channel, and a Bot that has left the Group.
- **A reply inside its own cause is not a self-record.** When the action's effect lands in the Cause Channel itself (a Bot answering in the Bot DM where the other Bot just wrote), the message is already visible where it belongs. That send writes neither a notice nor a record, like an ordinary `channel_send` reply. The exchange stays traceable through the notice where it began.
- **Chains across Bots.** Suppose Ana writes in the Group, Mira DMs Nova, and Nova creates a schedule.
  - Mira's notice "Mira sent a message to Nova" goes to the Group.
  - Nova's notice "Nova created a scheduled task" goes to the Mira–Nova Bot DM, because that is Nova's cause. The Human can open that DM read-only.
  - Nova's notice also links to the Group through the root of its `botCausation`. Each Bot's record therefore stays in its own context, while the chain stays navigable from the Group.

### Channel Notice: a history line, not a message

- A Channel Notice is a typed, system-presented line in a Channel's history, such as `memoryCommit` or `botAction` (today's `botDmAction` is the first). It is not something anyone said, so it has no read or unread state.
- Human Inbox unread, mention and informational items, delivery receipts, Channel activity counts (ADR-0098), the Channel's last-message preview and notification policies all exclude it. One shared predicate defines this exclusion. This also fixes today's gap: `botDmAction` is excluded from the activity chart but still counts as Human Inbox unread.
- A notice gets no Inbox Admission for other Channel members, so it never wakes them. It remains part of the Channel history they can read through `channel_read`.
- Clicking a notice opens its object: the commit in Memory history, the target message of a Bot DM, or the schedule.

### Inbox record: history that is born handled

- The acting Bot gets an Inbox Admission with a record reason (`memory-commit` or `bot-action`). It is inserted with `attempt_state = 'handled'` and no wake fields.
  - It is never pending or deferred.
  - It is never harvested into a turn or steered into a running one.
  - It never counts as Bot attention.
- This is the first admission that starts handled, so every selector that gathers work must keep filtering on pending or retryable states. Tests prove that no turn starts.
- ADR-0065's rule that "the sending Bot does not admit its own output" still holds for attention. A record is history, not attention.
- Under ADR-0037, the record and the notice share one Source Event and one copy of content, written in one transaction.

### A. Memory commits

- **Finding new commits.** Memory Service keeps a per-Bot commit cursor next to the ADR-0092 checkpoint.
  - It scans at the existing points (Host startup, before a turn, before steering), at turn completion, and after a trusted Memory tool operation.
  - Each scan lists commits that are reachable from the checked-out HEAD and not from the cursor, oldest first. It skips any sha already recorded for that Bot (unique key `(bot, sha)`), writes one self-record per new commit, and advances the cursor in the same transaction.
  - The first observation is a silent baseline.
- **Cause.**
  - A commit observed at a turn's completion, or by a Memory tool during the turn, takes that turn's cause. Memory usually changes because of what someone said in that Channel, so the line appears right after that conversation, in the Group, the Human DM or the Bot DM.
  - A commit observed before a turn, or at startup, has no turn cause. Its line goes to the Bot's Human DM.
  - Like ADR-0092, the line does not claim whether the Human or the Bot made the commit. It shows the Git author.
- **Content.** Fields are bounded and contain no file bodies: sha, truncated subject, Git author name (not email), author time, and up to 20 changed paths with +/- counts plus a count of the rest. The line uses a vendored Lucide `git-commit-vertical` icon (ADR-0032).
- **History edits are handled without duplicates.**
  - **Amend** creates a new sha and adds one line. The old line stays, because that commit existed.
  - **Revert** is a new commit and adds one line.
  - **Reset** to an ancestor adds nothing; the cursor moves back silently.
  - **Reset** to an unrelated line records only commits not already recorded.
  - **Branch switch** moves the cursor to the new HEAD without recording that branch's existing commits.
- **Startup catch-up** writes commits in order, capped at 20 lines, with one "+N earlier commits" line before them.
- Uncommitted working-tree changes never create a line.

### B. Relationship to ADR-0092: coexist

The `memory-change` Admission stays as the nudge that enters the next turn. It covers what commit records leave out: uncommitted edits, index changes and branch moves. Both come from the same scan transaction. When the net change includes new commits, the nudge only says how many commit records were added.

### C. Bot actions: BotHarness-defined tools only

- **`bot_dm_send`.** Its `botDmAction` notice moves from "always the sender's Human DM" (ADR-0065) to the Cause Channel, and the sender gets a record.
- **Later tools** use the same rails without a new decision. Each needs only a bounded action payload and a notice label:
  - `bot_schedule_create`, `bot_schedule_update` and `bot_schedule_delete`
  - `memory_switch_branch` and `memory_continue_from_commit`
  - Group management actions
- **Native DSH tool calls never become self-records.** DMs still show no thinking or tool traces (`concepts.mdx`). Only BotHarness-owned actions with Host-checked effects qualify, and a notice states the effect, not the call's arguments or results.

### D. Reading Inbox history

- **Tool.** A new Orchestrator tool, `inbox_history`, lists and searches the calling Bot's own admissions, handled ones and records included.
- **Filters.** Kind (memory commit, Bot action, schedule, DM, mention and so on), Channel, cause, and time range.
- **Text search** uses an SQLite FTS5 index over each admitted Source Event's searchable text. That text is the message body, or a self-record's notice text and commit subject and paths.
  - The index is a derived projection in the operational database. It is maintained in the same transaction as the Source Event and rebuildable from it.
  - Purge and retraction remove an event's index rows with its body (ADR-0037), and access stays scoped to the calling Bot's admissions.
- **Results** are ordered newest first, or by FTS5 rank when searching. They are cursor-paged, at most 50 per page, and each returns bounded fields: Source Event id, time, kind, state, Channel, cause, and a snippet of at most 300 characters. Full Channel content still goes through `channel_read`.
- **History reads never change Attention Decisions.** They are not Observation of pending work.
- **The Orchestrator prompt** names the three sources:
  - **Channels:** what was said with people and other Bots.
  - **Bot Inbox:** a diary of what it did and why, through `inbox_history`.
  - **Memory Repository:** distilled long-term memory, through Git.

## Considered Options

- **Memory lines only in the Bot's Human DM:** superseded by the Human. Memory usually changes because of a specific conversation, and the record belongs next to it.
- **A notice in every Channel the turn harvested:** rejected. One action would appear several times. A tool can name a more precise cause instead.
- **Separate Source Events for the line and the Inbox entry:** rejected. Two copies of one fact break ADR-0037's single content authority.
- **No admission; the tool queries Source Events by kind:** rejected. The Bot Inbox is the Bot's view of what concerns it, and Group notices would be indistinguishable from Group traffic.
- **`LIKE` search or a vector index:** rejected. FTS5 ships with Node's SQLite, ranks results, and stays a rebuildable projection.
- **Record every tool call, native ones included:** rejected. It leaks traces that DMs hide and turns history into noise.

## Consequences

- **Schema:**
  - a `self-record` source kind
  - the `memory-commit` and `bot-action` admission reasons
  - a typed Channel Notice field family
  - a per-Bot commit cursor and a `(bot, sha)` key
  - the FTS5 table and its triggers

  Together these are one Profile schema Generation bump, with a backup note in the Release Ledger.

- **Message model.** `isChannelMessage` and the client parser must accept system-presented notices. Human attention, receipts, previews and activity share one notice-exclusion predicate.
- **Commits made outside any turn** appear in the Human DM at the next scan. A filesystem watch on refs is deferred.
- **Backups and export.** Profile backup carries notices and records. Bot zip export carries Memory but no Channel history, so on import the commits stay and the notices do not. A fresh baseline prevents re-recording.
- **Other ADRs.** This revises ADR-0065 (notice placement) and ADR-0092 (adds per-commit history beside the nudge), and extends ADR-0070's Bot Inbox with handled records.
- **Delivery** is split into child issues:
  - Cause and Channel Notice foundation, with `bot_dm_send` as the first tracer
  - A+B Memory commits
  - D `inbox_history` with FTS5 and prompt guidance
  - Later Bot actions
