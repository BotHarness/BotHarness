# Authorized Activity Tool details — real DSH evidence

Issue [#122](https://github.com/BotHarness/BotHarness/issues/122), PR [#727](https://github.com/BotHarness/BotHarness/pull/727).

## Real execution

DSH 0.2.0-rc.1, a fresh isolated Profile, DeepSeek V4 Pro / off. The model called the native Shell Tool for a harmless two-second Node timer, paused for Human approval, then sent a real Channel reply and returned to idle. These are captured runtime pages, not mockups. Machine-local working-directory text is explicitly redacted.

- [Pending native approval and safe per-Session Activity](details.png)
- [Settled real reply and idle state](settled.png)
- [Real Host Consumer assertions](capability-proof.json)

The committed dev-only Consumer fixture contains two actual Cordis Plugins: the deployment allowlists `botharness-tool-detail-qa`, while `botharness-tool-detail-denied-qa` is not allowlisted. Both consume the safe cross-Plugin `botharness/personabot/activity` notification. The allowed Plugin uses only opaque references to read canonical arguments and the completed result; the denied Plugin receives `unauthorized`. A remembered reference refuses after Turn end and an unknown reference refuses. Neither Consumer parses UI or native Session logs, and the proof saves booleans only. Raw tool payloads never enter the public evidence or safe Activity event.

## Reproduce

1. Build the checkout and use `scripts/dev-instance.mjs` to create a fresh isolated Profile.
2. In its Profile patch, configure `botharness-core.activityDetailConsumers: [botharness-tool-detail-qa]`, then insert `scripts/fixtures/activity-detail-consumers.mjs` using its absolute file URL. Set that fixture's `proofPath` to `tool-detail-proof.json` inside the isolated home. Restart only that isolated Host.
3. Set `BH_E2E_ORIGIN`, `BH_E2E_HOME` and `BH_E2E_EVIDENCE`, plus `BH_E2E_MODEL=pro` and `BH_E2E_EFFORT=off`; run `node scripts/e2e-tool-detail-capability.mjs`.

The wrapper runs the existing real model/approval/Activity UI verifier and then asserts every Host Consumer proof value is true. Tests separately cover TTL, capacity, complete-size refusal, canonical loss and permanent ownership-repair round trips with or without an intervening read.
