---
Status: Proposed
Date: 2026-10-09
---

# Bot Self-Records keep Memory commits and Bot actions in the timeline and Bot Inbox

A PersonaBot forgets what it did once its tool calls are compacted or a new Orchestrator Session starts. Today it can recover that only partly: Channels hold its conversations, and `git log` holds its Memory history, but nothing durable says "I committed this", "I messaged Nova because of that Group" or "I changed this schedule". The Human, meanwhile, sees Memory change only in the Memory sidebar, and a `bot_dm_send` caused by a Group request shows up in the sender's private DM rather than in the Group that asked for it. We decided that **each real Memory commit and each Bot action made through a BotHarness-defined tool becomes one Bot Self-Record: one Source Event, placed as a muted line in the Channel where the Human expects it and admitted to the PersonaBot's own Bot Inbox already handled, so it is history the Bot can search but never attention that wakes it.** A new Inbox history tool lets the Bot read those records across Sessions.

The Human set the direction on 2026-10-09 (#1272). This ADR records the shape.

## Decision

### One Source Event, two views

- A **Bot Self-Record** is a Source Event about the PersonaBot itself, not a message to anyone. Under ADR-0037, its content lives once. The same transaction adds a Channel placement for the visible line and an Inbox Admission for the owning Bot.
- The admission carries a record reason (`memory-commit` or `bot-action`) and is inserted with `attempt_state = 'handled'` and no wake fields. It is born handled. It is never pending, never deferred, never collected into a turn harvest, never steered into a running turn, and never counted as Bot attention. This is the first admission that starts handled, so every selector that gathers work must keep filtering on pending or retryable states. Tests prove that no turn starts.
- ADR-0065 says that "the sending Bot does not admit its own output". That still holds for attention. A self-record admission is history, not attention, and it never wakes the Bot that produced it.
- Self-record lines are presentation-only for the Human. Human Inbox unread, mention and informational items, delivery receipts, Channel activity counts (ADR-0098) and notification policies exclude them. This also fixes today's gap: `botDmAction` notices already skip the activity chart, but they still count as Human Inbox unread.

### A. Memory commit lines (Bot's Human DM only)

- Memory Service keeps a per-Bot **commit cursor** in the operational database, next to the ADR-0092 checkpoint. At every point where it already scans (Host startup, before a turn, before steering), and also at turn completion and after a trusted Memory tool operation, it lists commits that are reachable from the checked-out branch's HEAD and not from the cursor, oldest first (`git rev-list --reverse HEAD ^cursor`). It skips any sha it has already recorded for that Bot (a unique key on `(bot, sha)`), writes one self-record per new commit, and advances the cursor in the same transaction.
- The first observation sets a silent baseline. Existing history never floods the DM.
- Recorded fields are bounded and contain no file bodies: sha, subject (truncated), Git author name (not email), author time, and up to 20 changed paths with +/- line counts plus a count of the remaining paths. The line names the commit and its Git author. Like ADR-0092, it does not claim whether the Human or the Bot made the commit.
- The line is placed only in the Bot's Human DM, as a system-authored `memoryCommit` message: a centred muted line with a vendored Lucide `git-commit-vertical` icon (ADR-0032). Clicking it opens that commit in the Channel sidebar's Memory history. Group Channels never get Memory lines.
- History edits are handled without duplicates:
  - **Amend** creates a new sha and adds one line. The old line stays, because that commit really existed.
  - **Revert** is a new commit and adds one line.
  - **Reset** or checkout to an ancestor finds no new commits; the cursor moves back silently.
  - **Reset** to an unrelated line records only commits not already recorded.
  - **Branch switch** (`memory_switch_branch`, or an external checkout) moves the cursor to the new HEAD without recording that branch's existing commits. The switch itself is a Bot action record when the Bot made it (C).
- **Startup catch-up.** Commits made while the Host was stopped are written in commit order, capped at 20 lines per scan. If there are more, the oldest ones are folded into a single "+N earlier commits" line placed before the first individual line.
- Uncommitted working-tree changes never create a line.

### B. Relationship to ADR-0092: coexist, not replace

The ADR-0092 `memory-change` Admission stays as it is. It is the nudge that wakes nothing but enters the next turn, saying "your Memory changed, look at it". It covers what commit records deliberately leave out: uncommitted edits, index changes and branch moves.

The per-commit self-records are the durable history. Both come from the same scan transaction. When a net change includes new commits, the `memory-change` summary names how many commit records were added, so the turn does not repeat their details. Replacing the nudge with per-commit records was rejected: the Bot would stop hearing about uncommitted Human edits, and history records would have to become attention.

### C. Bot action records: BotHarness-defined tools only

- `bot_dm_send` keeps writing its `botDmAction` notice, but placement follows its cause:
  - If the turn's `botCausation.parentSourceEventId` belongs to a Group Channel and the sender is still a member, the notice goes into **that Group**, reading "Mira sent a message to Nova".
  - Otherwise it goes into the sender's Human DM, as ADR-0065 decided.

  The notice gets no admissions for other Group members, so it never wakes them, but it stays part of that Group's history.

- The same Source Event receives the sender's born-handled `bot-action` admission.
- Later tools use the same rails without a new decision: `bot_schedule_create`, `bot_schedule_update` and `bot_schedule_delete` (a line in the Bot's Human DM, e.g. "Created a scheduled task"), and `memory_switch_branch` and `memory_continue_from_commit`. Each needs only its own bounded action payload.
- Native DSH tool calls never become self-records. DMs still show no thinking or tool traces (`concepts.mdx`), and only BotHarness-owned actions with Host-checked effects qualify.

### D. Reading Inbox history

- A new Orchestrator tool, `inbox_history`, lists and searches the calling Bot's own admissions, handled ones included. It can filter by kind (memory commit, Bot action, schedule, DM, mention, and so on), time range and text. Results are newest first, cursor-paged and capped at 50 per page.
- Each result returns bounded fields: Source Event id, time, kind, state, Channel id, and a summary of at most 300 characters. Full Channel content still goes through `channel_read`.
- Listing and searching never change Attention Decisions. They are history reads, not Observation of pending work, so a pending item found in history is still handled by the ordinary turn.
- The Orchestrator prompt names the three sources and when to use each:
  - **Channels:** what was said with people and other Bots.
  - **Bot Inbox:** a diary of its own actions and changes, through `inbox_history`.
  - **Memory Repository:** the distilled long-term version, through Git.

## Considered Options

- **Separate Channel line and Inbox entry for each commit:** rejected. Two Source Events for one fact break ADR-0037's single content authority and can drift.
- **No admission; the history tool queries Source Events by kind:** rejected. The Bot Inbox is the Bot's view of what concerns it, and Bot action notices placed in a Group would be indistinguishable from Group traffic. An admission also gives the Human's Bot Inbox view one consistent history.
- **Replace the ADR-0092 `memory-change` Admission with per-commit records:** rejected, as described in B.
- **Show Memory lines in Groups too:** rejected by the Human. Memory is private to the Bot and its Human.
- **Record every tool call, native ones included:** rejected. It leaks traces that DMs deliberately hide and turns history into noise.

## Consequences

- Schema: a new `source_kind` (`self-record`), the admission reasons `memory-commit` and `bot-action`, a per-Bot commit cursor, and a unique `(bot, sha)` record key. This is a Profile schema Generation bump with a Release Ledger backup note.
- `isChannelMessage` must accept a system-authored `memoryCommit` line alongside `memberDeparture` and `onboardingWelcome`. The client parser in `bridge.ts` must add the field explicitly. Human attention, receipt and activity queries share one self-record exclusion predicate.
- An external Human commit made while the Bot is idle appears at the next scan: opening the Bot DM, Memory sidebar refresh, the next turn or restart. A filesystem watch on refs is deferred until that lag proves to matter.
- Profile backup carries the lines because it snapshots the database. Bot zip export carries Memory and its Git history but no Channel history, so on import the commits are present but the DM lines are not. A fresh baseline prevents re-recording imported history.
- This revises ADR-0065 (Bot DM notice placement) and ADR-0092 (adds per-commit history beside the nudge), and extends ADR-0070's Bot Inbox with history that starts handled.
- Delivery is split into child issues: A+B Memory commit lines and records, C `bot_dm_send` placement and record, D `inbox_history` and prompt guidance.
