---
Status: Accepted
Date: 2026-10-03
---

# Multiple Bridge routes retain canonical sources

Human confirmed multiple sources per Channel and multiple Channel or direct Bot Inbox targets per source in #635, #629 and #693. A receiving identity and external group authorization retain their existing Messaging Grant authority. Each Grant owns explicit routes with stable IDs, a local Channel or Inbox-only destination, an intake switch, collection override and revision. A route is not another identity or Grant.

## Decisions

The application-defined Messaging module fans out one qualified Provider Consumer lease per verified account to authorized Grants. Subscribers retain independent conversation and live authorization checks. The Provider acknowledges only after all applicable subscribers have persisted or refused the event. Removing the last subscriber disposes the lease; pending registration cancellation completes before replacement. This changes no Provider Session runner or DSH Agent Inbox.

A verified account fingerprint, conversation and native message ID identify one canonical external Source Event. Multiple Channel placements reference that content; uniqueness is per Channel and source. Direct Inbox routes add no Channel transcript. Canonical Human–Bot DMs are explicit Channel targets; Bot–Bot DMs and inaccessible Channels refuse. Binding an identity alone creates no route or transcript. Distinct provider identities are not aliased from matching text or unscoped IDs.

Generation 52 adds immutable per-source, per-Bot, per-route receiving-path snapshots beside existing Inbox Admissions. Each captures authorization and route revisions, collection reason, applicable Channel or source wake rule, platform-default revision and thresholds. The canonical admission remains unique per Bot and source. A ready still-valid path can make that one source ready; silent paths create no additional wake. Digest partitions retain their own path and policy revisions. Handling one member's source updates that member's admission, rather than consuming other members' work.

Current membership, identity, Grant and route gates are rechecked before intake or dispatch. Pausing one route refuses new placement and intake on that route, retaining accepted history and reply authority under the current Grant. Deleting or reenabling a route never adds old sources to new destinations. Removing the final route removes reception scope without an implicit Inbox fallback. Surviving authorized routes remain independent. Historical reads filter Channel paths against current membership; a secondary reader does not acquire the receiving Bot's context, attachment or reply capability.

The native Profile table manages each route independently through the existing authenticated Host command/query seam. A Bot DM clearly distinguishes an explicit DM placement from Inbox-only. Source details render authorized historical receiving paths. Replies remain explicit and use the responder's own checked identity and the source's original external conversation. This slice qualifies Lark; it does not add other providers, recall synchronization or a second Inbox store.

## Migration and recovery

Generation 52 preserves existing Source Events, Admissions and placement revisions, replacing global source-placement uniqueness with per-Channel uniqueness and adding append-only path evidence. Legacy grants retain their original behavior until an explicit route management command converts their existing effective destination. No migration copies message content or creates new placements.

This is a one-way schema door: an older binary cannot represent multiple placements and must refuse the newer generation. Stop the owned Host and save a private pre-upgrade Profile backup before QA or rollout. Recovery uses a forward fix or restoration of that stopped pre-upgrade Profile; restoring loses later accepted local state and does not undo external sends. Do not attempt a code-only rollback after new routes have accepted messages.
