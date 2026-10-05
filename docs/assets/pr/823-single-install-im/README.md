# Single-install product qualification — #823

The actual local npm tarballs install Core, Client and the scoped IM Provider
through one `deepseekbot` Bundle, using the official DSH `0.2.0-rc.1` CLI outside
the source workspace. This is qualification evidence, not an npm publication.

- Runtime revision: `ee00fbea`, integrating main `4db250db`.
- Final product: `0.0.0-test.823.6`; Provider: `4.32.0-botharness.2`.
- Provider source: `b442da91b267412e84a4d18224adc30777024862`.
- Exact tarball SHA-512 and rebuilt Provider digest: [artifacts.json](artifacts.json).
- BotHarness: 2,439 passed / 9 skipped; registered Provider tests: 3,553 passed.
- Typecheck, build, lint, format and both release-ledger checks passed.
- Twenty-five product tests cover artifact integrity, exact composition,
  conflicting activation, retained settings and managed-update refusal.

## Actual Client screenshots

`before-provider-updates.webp` and `after-provider-updates.webp` show the same
1280 × 720 light-theme, English, empty Feishu settings state. The baseline uses
the standalone qualified fork at `b020d3b`, version `4.32.0`; the final product
replaces its independent updater with “Updates with BotHarness”.

`single-install-components.webp` shows the real final product version and three
running components. `real-lark-source.webp` shows the actual final @mention
received as the dedicated QA Bot, with its original Lark group and topic.
Images are compressed WebP; no image-generation or simulated UI was used.

## Real messaging and retained state

All connection, identity binding, saved target, explicit Grant and group reception
operations used the actual Client. Human test messages were sent through the
existing authorized Lark CLI identity in `BotHarness IM QA #78`; no new Lark
application or permission was created for this installation tracer.

[e2e-proof.json](e2e-proof.json) matches three handled canonical Inbox Admissions
to source message IDs, responder-owned Outbox receipts and independently read
Lark messages in the same `omt_19a4a9df4a0f1944` topic. The final response is
`BH823-FINAL-MAIN-OK`, sent by app `cli_aa37adda29f89e15`.

[retained-profile-upgrade.json](retained-profile-upgrade.json) compares full
canonical row hashes and credential hashes before/after the representative
upgrade, retaining accepted sources, admissions, bindings, Grant and Outbox.
The `canonicalIdsUnchanged` flag compares full records, not just IDs. No historical
backfill or duplicate receipt appeared before the subsequent new test message.
[empty-profile.json](empty-profile.json) records zero initial authority rows;
the fresh Client also showed no connected account.

[public-update-proof.json](public-update-proof.json) records the actual loopback
public status response and refusal of independent update check/install calls.
The composed native Patch also refused an additional Provider alias before a
competing Host started; focused regressions retain this guard.

Native Lark client automation could read the QA window but could not open its
topic via clicks. Platform outcomes therefore use independent Lark reads paired
with actual Client screenshots; no unrelated group content or private logs are
included. The Human QA product Profile remains available locally.

## Human reproduction

1. Follow [the artifact guide](../../../product-im-installation.md) to build and
   install one product into an isolated Profile.
2. Open Plugins → deepseekbot: verify the version and three running components.
3. Open Settings → IM bots → Feishu, select Lark (international), and connect
   an existing dedicated QA application through the native secret field.
4. Save its test group under More settings → Delivery settings. In the
   PersonaBot Profile, bind that app identity, authorize the saved group and
   enable reception; retain the default @mention-only policy.
5. Send a real @mention in a QA topic. Inspect the handled Inbox source and
   independently confirm the responder and original topic in Lark.
6. Restart or install a new product artifact version into the same home;
   verify retained configuration/history and another real topic reply.

First-time real Lark application creation and guided onboarding remain #824.
Merge, public npm publication and deployment require separate authorization.
