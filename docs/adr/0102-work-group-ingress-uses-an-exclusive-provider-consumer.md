# Work-group ingress uses an exclusive provider consumer

## Status

Accepted for the first #12 work-group tracer. Runtime integration and real-group acceptance are pending. This amends ADR-0011's blanket no-fork assumption only for the temporary transport extension below; BotHarness remains an independent Plugin.

## Context

The Human prioritizes work-group collaboration over private chat. dsh-im already handles group mentions and topics, but feeds its own Session routing and execution. Its released public Service does not offer exclusive authenticated ingress or an event-scoped checked reply. A second socket listener would compete for delivery and does not transfer authority.

## Decision

BotHarness owns an application-defined Bridge Consumer of the public dshIm Service. dsh-im remains the Provider owning the one SDK connection, credentials, authenticated identities and native operations. The first observable path is Human text @mention in one authorized work group or existing topic → bound PersonaBot Bot Inbox → existing Orchestrator → checked reply in the original group/topic. DM compatibility, complete history synchronization and multi-Bot collaboration follow Human feedback.

A temporary minimal fork may validate this path while the public seam is proposed upstream; upstream acceptance or publication is not required to start isolated verification. The verification baseline is dsh-im upstream `4d41a28`, the checked outbound proposal `ea0e69eb938e528650680f6eddfd48a8136c0403` (upstream PR #293), and the additive local inbound proposal `19d88f14bf85d74d4abf035a0c749d0b4a640257`. These are source proposals, not a released compatible package or real-group acceptance evidence. Production enablement still requires an explicit pinned, verified compatible artifact.

The additive contract exposes `inboundVersion: 1`, `consumeInbound(botId, {expectedFingerprint, onEvent, signal})` and `replyChecked(botId, trustedRoute, text, {expectedFingerprint, signal})`. These are application-defined Provider operations, not DSH-native APIs. No private store read or deep import is a Consumer seam.

- Persist `standalone | external-consumer` per account. The claimed account cannot also run dsh-im Session creation, ask, slash-command or Session Sync authority. Registration loss or Host restart keeps the external mode and fails closed until its Consumer returns.
- Preserve authenticated sender, message/event, group, mention targets and thread/root/parent identities. Mention evidence is a fact; the Provider does not decide PersonaBot attention or wake policy. Another Bot's mention does not identify this PersonaBot as a recipient. Receiving ordinary group content does not itself authorize a reply.
- Messaging atomically commits Source Event, placement, exact policy snapshot and Inbox Admission in `botharness.db`; only that durable acceptance permits acknowledgement. The Consumer does not wait for a model turn before acknowledging. SDK acknowledgement is not a durable replay/resume guarantee; expose possible gaps.
- Reply destination comes from the admitted Source Event, never model-supplied group identifiers. Commit Outbox intent/attempt before the effect, revalidate the account and original message route, retain provider receipt or unknown outcome, and never blindly retry.
- Use explicit binding and authorized group scope. Being mentioned, an SDK capability or an account connection alone grants no PersonaBot membership or Workspace access. SDK objects and secrets stay Host-side.

## Exit conditions

The fork changes only the public consumer/reply seam and its ownership fence; retain SDK connection and standalone behavior. Protect the extension with contract, account/lifecycle, group/topic routing and standalone parity tests. Pin each verification commit and make its unreleased status visible.

When upstream publishes an equivalent seam, verify the public contract and real work-group path, replace the pin and remove the patch. If the seam is rejected or sustaining the patch requires broad transport changes, move the Feishu/Lark Provider to a separately owned Plugin and replace the connection owner. Never run both listeners for the same account or retain an expanding copy of dsh-im.

## Evidence and consequences

The prepared source proposal passed 3465 dsh-im tests, build and package verification. It covers durable-accept waiting, claim loss/restart, another-Bot/ordinary group evidence, checked topic identity and disposal during reply preflight. This is Provider preparation only: it does not prove the Inbox/Orchestrator integration, group permissions, Human-facing binding or a real-group reply.

Refs: #12, #46, #48, #78, #117; ADR-0036–0039, ADR-0074–0077, ADR-0101; [outbound upstream proposal](https://github.com/xmanrui/dsh-im/pull/293).
