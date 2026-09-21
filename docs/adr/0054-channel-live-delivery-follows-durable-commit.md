---
Status: Accepted
Date: 2026-09-22
---

# Channel live delivery follows durable commit

For #141, the current Channel message log is the durable authority. A **committed Channel message** becomes visible to other clients only after its append succeeds. The Host then publishes a process-local notification to subscribers of that Channel. An Orchestrator `channel_send` call may also have a presentation-only draft while its arguments stream; the draft is never a Channel message, Source Event, Inbox input, or second live-message store.

The Client first reads a Channel snapshot through `botharness/channelMessages`, including a monotonically increasing Channel revision. While that Channel is selected, it keeps one authenticated SSE connection at `/api/botharness/stream`. Each `channel/message` frame contains the committed message and revision. The Host replays committed rows after the requested revision when the stream opens, including reconnects via `Last-Event-ID`. The Client ignores duplicate revisions and message IDs, and re-reads the authoritative snapshot on a revision gap or invalid cursor. Local send reconciliation is immediate and does not wait for Orchestrator or Assignment work.

For a live PersonaBot reply, the Host observes DSH's process-local `agent/assistant-stream` for the active Orchestrator Session and extracts only the explicit `channel_send` tool-call `body` fragments. It checks the trusted run's Channel access before publishing `channel/draft` frames with no SSE event ID or durable revision. Assignment output and ordinary Orchestrator final text never enter this path. The Client may render a draft bubble, but replaces it with the authoritative message after `channel_send` commits; abandoned attempts and completed runs remove the draft. A reconnect in the same Host process can receive the current transient draft baseline, but a Host restart intentionally cannot replay it from Channel history. Other durable consumers, including TTS and Inbox, see only committed messages.

The SSE route is registered through DSH Connection Fetch with the **full** `/api/…` pathname; it does not intercept the API gateway's single `/api` RPC slot. This keeps unary commands and reads on the existing Typert bridge. Channel authorization remains the current authenticated local-profile boundary; per-actor Channel access controls follow the Messaging authority in later slices.

When #46 moves Channel facts to the operational database, the transaction commit replaces the NDJSON append as the publication boundary, and the revision/replay contract must follow the new authority without dual writes. Presence, activity, and unread projections are not `channel/message` frames.
