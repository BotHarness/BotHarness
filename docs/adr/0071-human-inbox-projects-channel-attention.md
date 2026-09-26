---
Status: Accepted
Date: 2026-09-26
---

# Human Inbox projects canonical Channel attention

The Human Inbox is an independent Bot mode view. It reads operational facts owned by Messaging instead of storing a second copy of messages or requests. Its first action-required item is a pending Group join request from a live Channel record; approving or declining uses the existing atomic Group decision. Live native DSH questions and tool approvals are action items derived from their Bot DM request Source Events, the absence of a durable answer or decision, and the existing live request services. An Assignment with a live `waiting-human` open ask is another action item, projected directly from the Assignment Directory; it carries an Assignment Session reference and opens the Bot's Assignment detail. Answering the ask or stopping the Assignment removes the action. Its first informational item is a new Bot-authored Human DM message after that Channel's durable Human read position. Opening the source returns to the Channel, and acknowledging an informational item advances the same read position used by the conversation.

The query is profile-scoped, ordered by event time and stable item ID, cursor-paged, and filterable by category, Bot, and Channel. A cursor is bound to its filters. Typed failure and Grant notices do not fall into the generic informational bucket; they require their own action projection and resolution rules in later #126 slices.

## Why

A separate Inbox table would become a competing authority for read state and Group membership decisions. Projecting the canonical facts keeps the item, its source, and its resolution coherent after restart. The first slice reaches the Host, bridge, Client, and an operable Human path while the broader Attention Decision model in #47 grows.

## Consequences

The action and informational tabs can be independently paged without copying message bodies. Marking a DM message read clears it from the informational tab; a Group join request remains until a decision or cancellation changes its durable status. Question and tool approval actions open their exact DM cards and disappear after the Human decision or loss of the live DSH request; expired requests do not become false actions after restart. The first slice does not yet aggregate all Channel and PersonaBot attention types or offer a cross-source ignore decision. It does not compute an unread badge.
