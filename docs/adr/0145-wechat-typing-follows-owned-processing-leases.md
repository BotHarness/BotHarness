# ADR-0145: WeChat typing follows owned processing leases

- Status: Accepted; Windows native qualification and Human QA completed on #911
- Date: 2026-10-07
- Issue: [#911](https://github.com/BotHarness/BotHarness/issues/911)

## Context

The personal WeChat Provider already has native `getConfig` and `sendTyping` operations. Its legacy standalone Harness bridge owns a typing lifecycle, but the canonical BotHarness exclusive Consumer bypasses that bridge. Reusing the bridge's Sessions would create a second execution owner. A successful native response cannot prove the owner saw a typing indicator.

## Decision

Extend the existing DSH Service Definition → Provider → Consumer capability seam with a versioned checked typing lease. This is application-defined live process activity, not a SessionEvent, an Outbox intent, an Inbox Admission or another message store. The Provider alone owns the native typing ticket, private continuation, native API calls and renewal timers.

Canonical Messaging resolves only an available source from the acting Bot's authorized WeChat owner DM, its own enabled Binding, current Grant and current Provider Registration. The source-bound trusted reply route reaches the existing exclusive Consumer. Each initial request and renewal rechecks those authorities. Shared Channel readability does not lend the receiving Bot's identity. Local Channel work without a related authorized external source does not request WeChat typing.

Actual Orchestrator processing, accepted steering and related Assignment work acquire processing handles. Overlapping work for the same Binding/Grant/Registration shares one native lease; the final owner releases it. A queued Assignment follow-up acquires its handle only after native acceptance. Completion, cancellation, failure, Binding edits, Grant revocation, Registration replacement, runtime shutdown and Provider disposal release or invalidate the handle. Native text/file output does not independently cancel a lease while related processing remains active.

Renewal is at most once every five seconds, with a ten-minute hard lifetime. Native configuration/start calls have a five-second operation deadline; cancellation has its own three-second deadline and uses the original ticket even after authority is revoked. No failed renewal is blindly retried. Host startup and cleanup waits are also bounded; late startup results are cleaned once and cannot republish accepted activity. A process killed without disposal cannot prove successful native cleanup, and no undocumented native expiry is promised.

Persist only the identity's enabled preference, defaulting to on in schema generation 67. Do not persist native tickets, runtime handles or accepted activity; a restart begins idle. The existing identity sidebar/modal exposes the preference, capability availability and bounded sanitized diagnostics. “Request accepted” means native API acceptance only; unavailable capability, refusal and unconfirmed cleanup remain distinct. Global defaults and Profile inheritance are the separate #912 slice.

## Qualification boundary

#912 extends the preference through the existing platform-default owner and an explicit
`typing_inherited` marker; see [ADR-0119](0119-external-platform-defaults-retain-explicit-inheritance.md).
Existing choices remain custom. An inherited global change invalidates its live leases
without creating durable activity, changing account authorization or borrowing a sibling
Bot's identity.

Build on the main-qualified Provider input `a0ba2839dadbdcdda9a9bf7511da3094a79eb1fb`, preserving Lark image/cards and the existing checked WeChat media, quote and proactive text capabilities, plus Slack/Discord receive behavior. Promote the fork revision and managed artifact only with corresponding build/package/regression evidence. Genuine native typing visibility, completion/stop cleanup and packaged-product behavior require fresh Human-controlled WeChat E2E; tests and HTTP acceptance cannot substitute for those observations. Merge and deployment remain separate Human decisions.

## Consequences

Schema upgrades are forward-only. A binary supporting only generation 66 cannot safely open a generation-67 profile; reverting code requires a supported newer binary or recovery from the pre-upgrade profile backup. The runtime itself adds no durable activity authority or independent Session lifecycle. Typing failure cannot prevent the underlying authorized message from being processed.
