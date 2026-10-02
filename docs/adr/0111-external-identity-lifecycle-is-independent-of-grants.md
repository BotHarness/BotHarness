# ADR-0111: External identity lifecycle is independent of conversation grants

- Status: Accepted
- Date: 2026-10-02

## Context

An authenticated external account identifies who a PersonaBot acts as. A conversation grant authorizes where that identity may operate. Combining binding and authorization made identity pause/unbind indistinguishable from removal of a source route. Spec #693 and tracer #699 require independent management without synthetic listeners or account sharing.

## Decision

Messaging remains the application-defined durable owner. Extend its existing `messaging_bindings` authority with a local display name, enabled preference and optimistic revision (Schema Generation 49); migrate existing names from their recorded grants. Account-only binding verifies authenticated dsh-im `describeBot` metadata, using an optional account inspection Provider method, without a target or conversation grant. Existing unique account/principal/platform constraints remain in force.

Identity operations and conversation authorization are separate Messaging commands consumed through the existing Typert/API Gateway. The PersonaBot Profile exposes an Attention-style identity table and capability-aware Modal. Group Profile owns no identity. Existing source controls retain their route scope; the subsequent Bridge-table tracer is #700.

Pausing commits the identity preference, stops its receiver leases and rejects not-yet-started outbound operations at the same owner gate used by Client and model tools. It does not change conversation scope, accepted source history, harvest policy or started outcomes. Resume/reconnect verifies the same account and each previously authorized target digest; it does not silently accept new credentials, a new identity or a broader grant. Stale revision edits refuse. Provider-dependent validation is bounded, while pausing and unbinding remain possible offline.

Revoking a conversation grant leaves its identity bound. Explicit unbind invalidates all this identity's grants and leaves configuration/history inspectable; it never removes provider-owned shared credentials. Rebinding is explicit and does not restore revoked grants automatically. This first tracer qualifies Lark only; multiple platform identities are represented without inventing a second live integration or universal QR flow.

## Consequences

Recovery from Schema Generation 49 uses a forward fix or compatible database snapshot. A code-only revert against a newer database is unsupported. Bridge and identity pause are separate concepts, and enabled preference differs from current operational availability. No new Session runner, content store, wake scheduler or credential form is introduced.

References: [#699](https://github.com/BotHarness/BotHarness/issues/699), [#693](https://github.com/BotHarness/BotHarness/issues/693), [ADR-0101](0101-external-grants-require-authenticated-accounts-and-checked-targets.md).
