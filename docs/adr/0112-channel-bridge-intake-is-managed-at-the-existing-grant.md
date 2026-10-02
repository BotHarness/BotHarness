# ADR-0112: Channel Bridge intake is managed at the existing grant

- Status: Accepted
- Date: 2026-10-03

## Context

Spec #693 separates a Bot identity from the external sources entering a Channel. Tracer #700 needs a real Group Profile table without duplicating Messaging authority or replacing accepted Source Events. The first slice manages one previously authorized Lark group and one local Group target; multi-source fan-out and DM targets remain #635.

## Decision

Messaging embeds a revisioned `channelBridge` preference (name, enabled, mention/all-text collection) in its existing conversation grant body. Authenticated Human commands require current Human and receiving Bot membership and optimistic grant/configuration revisions. Add/resume verifies the same qualified Provider, account fingerprint and previously granted target digest; all-text requires observed ordinary delivery. The receiving identity is displayed as intake attribution, never a permission for other Bots to act as that account.

Group Profile owns the Attention-style Bridge table and platform-specific Modal; PersonaBot Profile owns its independent identity table and refers configured Group intake back to that Group. Existing legacy intake controls update the same embedded authority. Channel Bridge collection remains separate from existing Bot attention, harvest and wake. No new credential form, Source Event store, Inbox, listener registry or scheduler is introduced.

Pause keeps the exclusive Provider lease, preventing fallback into a provider-owned Session, but ACKs future messages without creating local Source Events or admissions. Already accepted facts, history/context reads and authorized explicit replies remain usable. Resume does not request remote backfill or open a second lease. Identity pause still stops all leases and gates its effects separately.

Delete strips this route's intake scope and local target and increments the grant revision, closing the lease and fencing unstarted old-source effects. It preserves accepted history, the Bot identity and independent outbound conversation authority; no automatic Inbox fallback occurs. Recreating intake is explicit and does not revive old source authority. Started or uncertain external outcomes retain existing Outbox semantics.

Schema Generation 50 migrates prior Group targets into the embedded preference without changing grant revisions or policies and fences older readers which would ignore disabled intake. Recovery requires a forward fix or compatible backup, not a code-only rollback against a newer database.

## Consequences

Enabled preference and operational availability are separate. Source configuration deletion is different from identity unbind or grant revocation. This slice does not expand external permissions, introduce Slack/QQ/Discord adapters, add per-Channel default settings or claim the #635/#637/#638 extensions.

References: [#700](https://github.com/BotHarness/BotHarness/issues/700), [#693](https://github.com/BotHarness/BotHarness/issues/693), [ADR-0108](0108-shared-channel-bridge-places-canonical-external-sources.md), [ADR-0111](0111-external-identity-lifecycle-is-independent-of-grants.md).
