---
Status: Accepted
Date: 2026-10-07
---

# Lark private approvals rejoin the native owner through checked controls

An operator should handle a community Bot's tool approval in an explicitly selected management DM without granting community users execution authority. This is the runnable private Allow once/Reject slice of [#1019](https://github.com/BotHarness/BotHarness/issues/1019), tracked by [#1029](https://github.com/BotHarness/BotHarness/issues/1029). Questions, saved rules, groups, other platforms and releasing native waits remain separate issues.

## Decision

The application-defined approval notification owner is `messaging/approval-messaging.ts`. It subscribes to committed request/settlement notifications from the existing `ChannelToolApproval` broker and consumes native `session/event` Tool results. The broker continues to complete the native DSH approval request; the native Session owns `approval/asked`, `approval/decided` and `tool/result`. Neither IM acknowledgement nor a card receipt is a decision or evidence of tool execution.

The authenticated Typert/API Gateway and Client Profile select one approved pairing by its genuine Provider name and receiving account. No raw chat ID is needed. Selecting a destination does not approve the user: Web pairing review remains the initial grant authority (ADR-0136). The destination must be the paired Lark DM on the current enabled Binding, with approve or reject capability and the same pairing revision. Changes and disabling use monotonic route revisions, so returning to the same person never revives an old card.

The existing exclusive account Consumer fanout dispatches card actions separately from text intake. It does not produce a Source Event, Inbox Admission, model wake or Memory write. The qualified dsh-im Provider owns the official SDK, credentials, callback transport and platform qualification. A versioned `approvalCardChecked` capability supports bounded plain-text send/update and a checked native receipt. Creating a card rechecks the original paired DM message, real sender and native private-conversation metadata; updating rechecks that the original receipt is an own-Bot interactive message in that conversation. A final synchronous Host fence runs immediately before each platform write. Consumers without all three checked send/update/action capabilities remain unavailable.

The official SDK callback supplies the actual operator and context, never the proposed actor in button data. A fixed namespace, request locator and exactly two offered actions are accepted. The Provider's callback deadline is below the platform deadline and aborts late processing. The acknowledgement only means queued or refused; deciding continues outside the Provider's account transition queue.

The notification owner checks the actual Provider/account fingerprint, current Bot/Binding/pairing/capability/revision, configured DM, stored card receipt and committed live broker request. The broker checks Session ownership, original tool identity, complete arguments and scope, commits actor attribution through the canonical Channel and completes the native outcome. Allow once retains a current authorization guard that the existing execution fence checks immediately before native execution. Revocation, replaced Binding, pause, changed route or arguments cannot authorize a later call. Web and IM share the same one-winner broker. Buttons do not grant capabilities or save rules.

## Durable references and outcomes

Operational Database generation 60 appends `messaging_approval_routes` and `messaging_approval_deliveries` after published generation 59. The notification projection contains canonical request/Session/call references, a complete-operation hash, route revision, expiry, attempts, checked receipt, actual actor and result sequence. Request contents and approval decisions remain in the existing Channel/Session authorities. An in-process bounded result excerpt supports card updates; it is not another durable result store or authority. Pairings and existing messaging defaults are preserved by the staged migration owner.

Each distinct committed request creates one notification; duplicate subscription delivery does not create another. Known-unsent attempts are bounded to three, with short retry delays; uncertain sends are never automatically retried or used as authorization. Web distinguishes notification delivery, decision acceptance, native execution result and card-update uncertainty, and offers the native Session for complete inspection. No grouped digest suppresses an independent request.

A request expires after 24 hours or earlier cancellation/loss of its native owner. Restart cannot restore the native Promise: old pending cards become expired, interrupted sends/updates become unknown and approved-but-unconfirmed executions remain unconfirmed. Old controls are refused. No second queue resumes tool execution from a notification row. The native approval still waits in this slice; unrelated Inbox processing is not claimed to be non-blocking.

The Profile migration is a one-way schema writer boundary: an old Bundle must use its matching pre-upgrade snapshot rather than opening generation 60. External sends/decisions are observable effects that code reversion cannot erase. Operator pairing and all notification state stay private Profile data, outside exported Bot Memory.

## Qualification

The released dsh-im package version alone does not prove these capabilities. Use an exact qualified source/runtime digest for development; a production artifact update requires independent qualification and Human QA. Actual Lark configuration must enable `card.action.trigger` callbacks on the long connection and permit `im:chat:read` for native DM qualification, alongside the existing message read/send scopes. Enabling app scopes or callbacks requires explicit authorization and app publication.

Real platform testing requires one exclusive app receiver. As in ADR-0136, the supervisor can reconnect a disconnected account, so either use a dedicated test application or explicitly authorize a bounded Host shutdown. Restore the original receiver after testing. Local SDK fixtures and native Web proof are distinct from real Lark callback/execution proof.
