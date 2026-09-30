---
Status: Accepted
Date: 2026-10-01
---

# Model Channel reads budget content before consumption

The application-defined `channel_read` Tool consumes an application-owned model projection rather than the Human Channel presentation record. It retains Channel and message identity, author, timestamp, complete body, reply context, trusted attachment references and action/card references; it excludes delivery states, Human receipts and Channel revisions. Canonical Channel records and the Human Client bridge remain unchanged.

The owning Host applies a fixed 12,000 JavaScript UTF-16 code-unit budget to the complete serialized JSON Tool result before observing any returned message. The existing message limit remains an additional ceiling. A page contains the largest fitting chronological-query prefix, plus its filter-bound continuation and an explicit count of omitted candidates in that fetched page. Omitted messages remain pending under ADR-0077. The count does not claim to be a total across all matching history. The Tool adapter returns the Host result without further truncation.

An oversized first message returns no message content, an explicit `readContent` locator and, when older results exist, a `nextCursor` past that message. The Bot retrieves the omitted message through the same Tool with `channel_id` and `message_id`, then follows `contentCursor` in `content_cursor`. That path returns bounded, ordered JSON fragments of the complete actionable projection, including a large action card or reply preview. It never substitutes a lossy summary for instructions. Each fragment rechecks current membership; its cursor binds a SHA-256 of the projection and its offset, so a changed message, different target or invalid offset cannot reuse the cursor.

Partial content does not join the active turn's consumption set. Per-turn live coverage records only the contiguous prefix actually returned in that turn; returning the complete payload after that prefix joins that exact message ID. Skipping ahead or resuming only a final fragment in a later turn does not consume the message. A Bot may restart from `message_id` without a cursor to read it completely in the current turn. Coverage is transient execution bookkeeping, not a second durable Inbox authority. Successful and failed turns retain ADR-0077's handled/needs-repair settlement for the exact included IDs.

## Why

A smaller Tool renderer alone cannot bound consumption: the existing history query observes its returned IDs before rendering. Truncating that result later would falsely handle unseen messages. Moving selection into the owning Host before observation preserves the Inbox contract and gives the model deterministic access to everything omitted.

## Considered options

- Returning complete Human presentation records: preserves content but spends output on receipts and delivery/revision bookkeeping and has no character ceiling.
- Cropping the adapter's rendered output: rejected because the owning query would already have observed omitted messages.
- Truncating individual instructions or cards and treating the prefix as handled: rejected because a prefix is not a faithful actionable summary.
- Compact text: evaluated alongside JSON using real DSH reads, reply targets, search and trusted image references; JSON keeps existing field names and machine-readable action/reference structure. The evidence and character measurements live with the delivery PR.
- DSH Spill as the only recovery path: deferred because external spill retrieval would need a matching exact-content consumption boundary; the canonical Channel message already supplies a membership-checked retrieval path.

## Consequences

- `channel_read` adds `outputLimit`, `omitted` and complete-content fragment fields; existing Channel/message nesting and filter/page-size semantics remain recognizable.
- A read can return fewer messages than its numeric limit, or zero if the first message is oversized.
- `query` and `read` retain their internal full-history contracts; the model Tool uses `readModel`, sharing the same membership/filter/cursor query Provider and the existing Inbox observer.
- JSON escaping and continuation metadata count toward the budget; image bytes use the separate existing `channel_read_image` limit and trusted attachment seam.
- Inbox metadata lookups, Human UI reads and partial fragments never consume content. No database migration, permission change or second message store is introduced.
