---
Status: Accepted
Date: 2026-10-01
---

# External Grants require authenticated accounts and checked targets

The first outbound slice uses an application-defined Messaging Provider Registration owned by a Cordis Consumer Fiber. Its durable Binding, Human Service Grant, Outbox Intent and one-attempt outcome belong to the existing BotHarness SQLite authority. Provider capabilities do not grant permission. Acceptance and execution both revalidate the active PersonaBot, current Grant, live Registration, authenticated account fingerprint and saved target content digest. One platform account binds one local PersonaBot; one PersonaBot initially binds one account per platform.

An opaque dsh-im Bot ID identifies a local configuration, and a saved Target ID is a mutable alias. Neither proves a stable platform principal or an unchanged destination. BotHarness therefore requires a versioned same-Host public Service with authenticated `describeBot` and `sendChecked` capabilities. The proposed dsh-im extension verifies Feishu/Lark credentials against platform bot identity, derives a non-secret fingerprint from domain, application and Bot Open ID, compares the expected identity inside the account transition, and sends a frozen target route after checking its digest. It never exposes the secret. Ordinary `send`, private JSON, private module imports and browser-supplied native routes cannot substitute for this contract.

**The upstream extension is proposed, not released or accepted by dsh-im.** Released `4.32.0` fails closed for BotHarness authority. The isolated verification Profile may load the explicitly identified source patch; production enablement requires upstream agreement, a pinned compatible artifact and its contract/runtime tests. A version number alone is insufficient: the adapter probes the capability contract. The existing dsh-im settings entry remains available.

Each explicit Human send has a stable request identity and payload hash. The dispatcher commits Intent and attempt-start before the provider call. Success means provider accepted, never delivered or read. Timeout, disposal or interrupted in-flight work remains unknown and is never retried automatically. Revocation cancels not-yet-started work while an already started request retains its original authorization snapshot. Startup cancels pending dispatch and classifies in-flight work as unknown; installing a provider does not replay it. Managed Restore must suspend copied external authority under ADR-0043 before reactivation.

## Considered Options

- Trust the opaque Bot ID or display name as account identity — rejected: configuration identity is not an authenticated platform principal.
- Read a saved target, then send its alias through ordinary `send` — rejected: alias changes can redirect an authorized action.
- Use the undocumented draft signature in production — rejected: the sandbox probe proves current behavior, not a maintained public contract.
- Retry an ambiguous SDK result — rejected: the platform may already have accepted the message and current dsh-im does not expose reconciliation or idempotency evidence.
- Rebuild platform SDKs and credentials in BotHarness — rejected: dsh-im continues to own those resources.

## Consequences

- Human Profile commands cross the existing Typert/API Gateway seam; model tools do not create Grants.
- Provider absence and incompatibility leave historical Binding/Outbox facts readable and external execution disabled.
- Route or account changes require explicit revocation and a new Human authorization, without name-based fallback.
- This outbound slice does not add inbound ownership, trusted Reply Routes or Orchestrator execution; #12 still requires an exclusive authenticated consumer contract.
- Schema generation 38 adds outbound facts without replacing local Source Events or Inbox authority. Downgrading requires a profile backup or forward-compatible build; a code revert does not unsend accepted messages.

## References

- ADR-0038, ADR-0039, ADR-0041, ADR-0043 and ADR-0044.
- [#46](https://github.com/BotHarness/BotHarness/issues/46), [#117](https://github.com/BotHarness/BotHarness/issues/117), [#78](https://github.com/BotHarness/BotHarness/issues/78).
- [Current dsh-im evidence](../research/2026-09-21-dsh-im-integration-strategy.md).
