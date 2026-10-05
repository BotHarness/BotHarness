---
status: accepted
date: 2026-10-02
---

# External Thread following is scoped and explicit

## Context

External groups default to mention-only collection. A PersonaBot needs to deliberately participate in one Thread without receiving every conversation in that group. A reply alone does not express that choice. Group-only platforms cannot promise a Thread capability.

## Decision

Messaging owns an application-defined, append-only Thread reception policy scoped to a Service Grant, authenticated Chat/Thread/root identity and provider account fingerprint. A command anchors in a Source Event already admitted to the requesting PersonaBot, rechecks the current grant/consumer/account, and compares the expected policy revision. Enabling follow requires live delivery evidence for an unmentioned reply in that exact Thread and root through the current checked Consumer; a group-wide probe is insufficient.

Bot tools follow or inherit group rules. Human controls can follow, exclude ordinary replies, or restore group rules. An explicit Human follow/exclude overrides Bot changes until Human restores inheritance. Direct mentions retain their existing addressed handling. Ordinary replies first use the Thread collection override, then the group collection default. Following inherits the group's ordinary wake unless it supplies its own bounded wake policy; the absent group preference is digest. Unfollow restores group collection, including full collection when enabled.

The Source Event and Bot Inbox remain canonical. Each Admission records its exact Thread and group policy revisions and effective wake/count/interval before acknowledgement. Policy changes never rewrite older admissions, backfill excluded messages, grant a new reply destination, or mark a provider message read. Scoped policies survive restart while process-local delivery qualification is re-established by the current Consumer. Revocation, archive, an inactive Consumer and stale grant/source revisions remain stronger gates than follow. Root mismatch fails closed.

The first production tracer qualified Lark Thread events. The Slack extension reuses this policy authority with native `thread_ts` as Thread/root and no synthetic parent ID. A Slack root message can anchor a future topic; only an actual unmentioned child reply (`ts != thread_ts`) proves ordinary reply delivery. Lark retains its Thread/root/parent contract. The Human Profile displays the latest 50 Inbox-anchored Threads with participation, actor and a configuration Modal; it does not fabricate Thread rows for group-only providers. The native DSH Tool registry and Typert/API Gateway remain Consumers of the owning application-defined Messaging Service.

## Consequences

Schema Generation 48 adds immutable Thread policy revisions and an optional Admission revision field. Existing groups retain mention-only collection and no Thread overrides. Runtime follows recover from existing authority; reverting to an older schema requires restoring a compatible database snapshot or a forward fix. Second-provider hierarchy and multi-route management remain separate tracers.

The Slack extension adds no schema generation, independent Thread store or receiver. Group/member Attention and Human override precedence remain unchanged.

References: [#614](https://github.com/BotHarness/BotHarness/issues/614), [#854](https://github.com/BotHarness/BotHarness/issues/854), [#693](https://github.com/BotHarness/BotHarness/issues/693), [ADR-0109](0109-external-group-collection-is-separate-from-wake.md).
