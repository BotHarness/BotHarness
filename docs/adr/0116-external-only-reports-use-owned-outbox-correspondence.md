# ADR-0116: External-only reports use owned Outbox correspondence

Status: Accepted

## Decision

An explicitly authorized Orchestrator may send a requested report with `bridge_post`, selecting a saved Grant returned by `bridge_targets`. Messaging reuses its existing checked Binding/Grant and durable Outbox transaction/attempt lifecycle. The Outbox intent is canonical sent content and author/receiving-platform evidence; sending does not create a Source Event, Channel placement, Bot Inbox admission or Human DM mirror. This one-off operation adds no scheduler.

A receipt-qualified Provider preserves the native group message ID and conversation ID through an opt-in checked send. Legacy sending keeps its existing acknowledgement shape. Unsupported receipt capability fails before platform dispatch; missing/mismatched receipt after dispatch stays an unknown outcome without retry. Acceptance is not receipt by a Human or read status. Reports preserve a snapshot of Bot identity, account fingerprint and target alongside their receipt, so bounded own Outbox queries remain readable after unbinding/revocation. A stable request key plus owned Grant/content rejects conflicts and prevents duplicate dispatch.

A genuine eligible Human reply remains a canonical bridge-message Source Event and independent Inbox admission. Its parent/root IDs are resolved against an existing report under the same Bot, Provider, account fingerprint and external conversation. The projection reads original content/outcome from the Outbox rather than duplicating a report transcript. A fabricated parent, another account or conversation cannot become report context. Existing mention/following/intake and turn/steer policy still decide admission; posting does not implicitly follow a thread.

Own-application text echoes have a separate optional checked callback. They may enrich an existing matching Outbox receipt using native message ID, identity, conversation and exact content; they do not create incoming sources, attention or a second authority. Unknown or early unmatched echoes do not promote an unknown send by guessing from content. The first real Lark qualification verifies create receipt and Human reply, not own-echo delivery, which the platform may not emit. Replay/idempotence is covered by focused contract tests.

The Client exposes sent content, identity, target and truthful outcome in a native Profile Modal. Received-source details include the associated original report. Native Orchestrator Tools preserve active-run side-effect fences; late or foreign-owner queries cannot send. Already-started platform effects remain inspectable even after revocation, while not-yet-started effects recheck current identity, Grant and Registration.

## Rationale and alternatives

Mirroring a report into a local DM would conflate Human conversation with an external task. A new sent-message table or provider Session runner would introduce a second lifecycle. Matching replies by text, author display name or time would invent provenance. The existing Outbox and native receipt are the narrow reusable seam.

## References

- [#639](https://github.com/BotHarness/BotHarness/issues/639), [#629](https://github.com/BotHarness/BotHarness/issues/629).
- [ADR-0039](0039-external-outbox-is-idempotent-but-not-exactly-once.md), [ADR-0101](0101-external-grants-require-authenticated-accounts-and-checked-targets.md), [ADR-0106](0106-exclusive-im-intake-commits-bot-inbox-before-acknowledgement.md).
