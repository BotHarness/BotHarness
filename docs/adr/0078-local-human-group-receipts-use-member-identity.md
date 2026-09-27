---
Status: Accepted
Date: 2026-09-27
---

# Local Human Group receipts use member identity

A Group Channel records its local Human member in the Messaging authority with a stable Host-owned identity, display name, join time, and first visible revision. Human read positions are keyed by Channel ID and Human ID. The existing Channel-only read position migrates to the local Human identity; existing Groups grant that Human visibility from their first message. The browser cannot supply or choose a Human ID.

For each committed Group message, the Host projects a Human recipient only when membership makes that revision visible and the Human is not its author. A position at or beyond that revision means read; otherwise it means unread. Bot recipient states still come exclusively from Inbox Admissions. The existing message receipt pie combines these distinct projections without storing a second receipt ledger. A Human author is the sender, never a recipient of their own message. Advancing the Human position emits one Channel read event with its revision; reconnect sends the current position as a baseline. Committed message projections carry their placement revision so each Client updates its loaded window without one event per historical message.

The first delivery has one local Human across browser tabs. It establishes the identity-keyed schema without claiming cross-account authentication or online membership. A later multi-Human Channel would need its own authenticated principal, join/leave and history policy, and authorization before exposing another person's member or read facts. Native online Groups remain an open idea (#377); dsh-im provider Groups (#48) may serve that use case first.

## Why

The old Channel-only read position could express where the one local Human stopped reading, but it could not prove _who_ read a Bot message. A browser tab is not a durable person, and a Bot's Inbox handling status is not a Human read receipt. The Messaging authority is the place that already owns Channel membership, placement revisions, and Human read positions.

## Considered options

- **Infer Human readership from the shared position or active browser tabs** — rejected because neither identifies a durable member.
- **Treat every Group member as a Bot admission** — rejected because a Human read and a Bot's processing lifecycle mean different things.
- **Wait for cross-account infrastructure before showing the local Human** — rejected because the local Host can truthfully identify its one Human now, while the remote collaboration need remains unvalidated.
