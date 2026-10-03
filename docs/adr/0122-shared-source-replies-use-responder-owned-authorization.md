# ADR-0122: Shared-source replies use responder-owned authorization

- Status: Accepted
- Date: 2026-10-04

## Context

A receiving PersonaBot publishes one canonical external Source Event in a shared Channel. Another current member can discuss that fact locally but must not borrow the receiver's external identity. #637 requires an explicit reply under that member's independently bound and authorized Lark identity. Receiving a source, reading its shared presentation, and being authorized to answer externally are separate application-defined relationships.

## Decision

Messaging exposes the retained source to a current member of an existing Group placement without creating an Inbox Admission, wake or copied transcript. Inbox-only and inaccessible placements remain private. The shared projection excludes the receiving account's remote context-read evidence. Existing own-Inbox reading, source-route revocation, file and remote-history capabilities retain their receiving-identity boundaries.

An explicit `bridge_reply` chooses the responding PersonaBot's own enabled Binding and exactly one verified Grant for the source's original Provider, platform and external group. No caller-supplied account, recipient or route is accepted. Missing, paused, revoked, changed or ambiguous authority refuses; reading shared content does not grant external group access. A receiving PersonaBot retains its existing source-specific route and legacy idempotency key.

The same-Host dsh-im Service negotiates optional checked reply-context, receipt and final-fence versions. Its Provider reads the exact native message using the responder's own app credentials and verifies conversation, thread, root and parent IDs. Lark Open IDs are app-scoped; only the sender identifier resolved by that exact read replaces the ingress app's sender identifier in the responding route. This is not a contacts lookup or universal identity map. Confirmed missing/deleted messages, permission refusal and unavailable reads remain distinct safe outcomes. Unsupported qualification refuses before dispatch without fallback to the receiving identity or group mainline.

Before qualifying a shared reply, Messaging acquires the responder account's existing exclusive Provider consumer through the same fanout owner. This process-local reply connection does not enable reception: an unconfigured receive scope acknowledges and discards incoming messages, creates no Source Event or Inbox Admission, and remains `off` in Profile. Checked own echoes can still enrich an existing exact Outbox receipt using the verified target's conversation. Identity pause, revocation and Provider disposal cancel the lease; subsequent authorized replies can reacquire it.

The existing Outbox stores the responder's identity/Grant revision, canonical source ID, qualified route and native reply receipt. The new request key is unique per responding PersonaBot and source; each may respond independently while repeats, restarts and unknown outcomes never initiate another send. No automatic claim lock or universal reply winner is introduced. Local Channel discussion remains the place for coordination.

Current membership, Binding revision, Grant revision and Provider Registration are checked at acceptance, dispatch and the synchronous final fence immediately before the Provider's SDK send, after its remote source validation. An already-started effect is recorded honestly and cannot be undone by revocation. Missing or mismatched post-send receipts are unknown outcomes, rather than permission to retry. The native Profile send-details Modal projects sent identity, target, source, topic, receipt and outcome from this Outbox. A checked own echo enriches only an existing exact account/conversation/message correspondence and creates no incoming source or wake.

No SQL schema migration, new content authority, Provider Session runner, recall synchronization or additional platform is required. Text replies are this tracer's scope; shared remote file/history access remains unavailable without its own qualified contract. The provider artifact still requires immutable pin and real qualification before launch. Local contract tests are not evidence of two real Lark applications or actual Human receipt/read.

## Recovery and alternatives

Revert the BotHarness code and its matched immutable Provider pin together; retained optional Outbox reply evidence remains readable as data by a compatible forward build. Existing external replies cannot be recalled by reverting. Do not retry an unknown outcome with another key. Reusing the ingress Grant would violate account ownership; duplicating incoming content for each responder would create another authority; assuming Open IDs match across applications would reject legitimate replies or invent identity provenance.

## References

- [#637](https://github.com/BotHarness/BotHarness/issues/637), [#693](https://github.com/BotHarness/BotHarness/issues/693).
- [ADR-0101](0101-external-grants-require-authenticated-accounts-and-checked-targets.md), [ADR-0111](0111-external-identity-lifecycle-is-independent-of-grants.md), [ADR-0117](0117-external-only-reports-use-owned-outbox-correspondence.md), [ADR-0120](0120-multiple-bridge-routes-retain-canonical-sources.md).
- [Official Lark SDK IM identifiers](https://pkg.go.dev/github.com/larksuite/oapi-sdk-go/v3/service/im/v1), [Lark Open ID documentation](https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-obtain-openid).
