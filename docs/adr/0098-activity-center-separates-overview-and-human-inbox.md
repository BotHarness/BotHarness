---
Status: Accepted
Date: 2026-09-30
---

# Activity Center separates overview from the personal Human Inbox

The Bot mode Activity Center has two views: Overview answers what is happening across PersonaBots and Channels, while Human Inbox answers what the current Human has not read and what requires a decision. This extends ADR-0071's first Human Inbox projection without copying Source Event content, Bot Inbox Admissions, DSH Session logs, or usage facts into a second authority. The first delivery slice is local to the existing Human identity; read positions and projections remain keyed by Human identity so later multi-Human support does not share a person's unread state.

Overview shows the count of unresolved explicit Human actions, each PersonaBot's live state, and currently executing Orchestrator and Assignment Sessions. A Bot opens its DM; a Session opens that exact Session in DSH's original mode. Waiting, blocked, and idle Sessions remain visible through status or action attention but are not called active work. Today's Channel chart counts committed messages once per Channel, splits Human and Bot authors, and offers per-author detail. Token usage is shown globally and per PersonaBot, with a seven-day trend; it is never estimated per Channel. Memory activity shows seven-day committed-change counts and a separate current uncommitted-change indicator. These cards consume the owning activity, Channel, usage, and Memory read models; unavailable data is not presented as zero.

Human Inbox separates explicit actions, mentions and replies, other unread Channel activity, informational updates, and handled history. An action is an unresolved question, approval, join or Grant decision, blocked or waiting Assignment, or another typed request that truly requires the Human; a mention or unread message alone does not increase the action count. Action cards are ordered by longest waiting first; mentions and unread Channels by recent activity. A busy Channel folds into one summary with exact links to mentioned or replied-to messages. Native Channels do not yet have Thread grouping; a later Thread view requires a stable source Thread identity and navigation.

Unread is a Human fact, independent of PersonaBot observation and Wake Policy. The Activity Center entry displays the number of distinct unread Channel Source Events and a separate pending-action indicator; mentions and reports do not double-count the same event. Expanding a summary does not advance the Human's Channel read position. Viewing concrete message content through its position, or explicitly marking it read, advances that canonical position only as far as the content actually viewed or chosen. A Bot DM report that is also unread appears once with a report label; a report without Channel placement stays an informational update.

An action card shows the exact request, choices or response input, a short expandable source context, and an Open source path. The Human can use the same authorized response and decision operation in the Inbox as at the source; an expired or already resolved request cannot be submitted from stale UI. Resolving a card removes it from active actions but leaves a filterable handled view that links the canonical request and answer. One Channel message involving several Bots appears once in Human Channel attention; genuinely distinct requests from those Bots remain distinct action cards. A Group request is answerable by a named Human, or explicitly by eligible Group Humans; the first valid response resolves one shared request across personal projections. Group-answerable does not imply an all-members mention.

## Why

The earlier first slice and issue #126 treated Human Inbox mainly as an action and informational list and did not compute unread totals. In a Slack-like multi-Bot workload the Human also needs personal unread and mention triage, inline answers to many live questions, and a quick operational overview. Keeping Overview and Inbox as separate views under one entry makes those jobs legible while retaining canonical ownership and restart-safe projections.

## Consequences

- Extend #126 through narrow vertical slices, beginning with local-Human Group unread summary, source navigation, and read-position behavior; then add Human mentions/replies and inline actions.
- Give cross-Bot Overview its own issue (#541). Reuse the PersonaBot usage read model (#34/#39) and Group message-count authority (#424), rather than duplicating either statistic.
- Human mentions require a trusted Human target in Channel message provenance; the current ChannelMention type targets only PersonaBots.
- The original Bot Inbox remains each PersonaBot's event and attention timeline. Human Inbox does not mirror every Bot Inbox event.
