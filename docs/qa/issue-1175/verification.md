# Bot-mode onboarding first tracer — verification

Issue: [#1175](https://github.com/BotHarness/DeepSeekBot/issues/1175). Parent: [#1174](https://github.com/BotHarness/DeepSeekBot/issues/1174). Verified 2026-10-08 with the pinned DSH 0.2.0-rc.1, Windows, Node 24.14.0 and pnpm 12.4.2.

## Observed runtime behavior

- Fresh Profile, before deliberate Bot-mode entry: no PersonaBot. Entry prepares one enabled DeepSeek Bot, its real Git Memory Repository, a Human DM, one product-authored system welcome and the local companion. No model call is needed for this state.
- With no usable credential reference, the welcome choice opens model confirmation. The selected question is retained locally; the Profile-default checkbox is checked, and final submission is disabled until configuration is available.
- Refresh retains the unsent question behind Review unsent question. No Human message or model request is submitted on refresh. Native DSH may show its own credential invitation; Later dismisses it without sending.
- Explicit confirmation saves the native Profile default with readback and leaves the current Bot inheriting it. A deliberately invalid QA credential produces an AUTH failure card, without completing onboarding. Repair changes only the native QA Profile's credential reference to the existing machine-local key; no secret value is read, copied into a file or published.
- Clicking Retry this message after repair obtains a real visible DeepSeek reply and the First conversation completed status. The canonical DM contains exactly one Human message, one welcome, one failure card and one model reply. The welcome remains reusable.
- A separate Profile created with the baseline revision already contained Returning Bot. Starting this implementation reuses its identity and DM and does not create DeepSeek Bot. Its normal Human DM request is sent through the public bridge; this is Host API verification, not an additional completed Client walkthrough.
- Starting the tutorial focuses its close button; Escape removes the highlight, persists paused progress and restores focus to the welcome control. Reduced-motion behavior is covered by the existing internal-tour regression with reduced motion enabled. Actual OS preference switching was not exercised.
- Final Client presentation requires a local explicit Start/Continue/Restart action even if another Client reports an active tutorial. Skip remains available after starting. Automated coverage verifies this shared-progress/local-presentation boundary.

The integrated generation-69 Host was also started with a new isolated Profile. Public bridge verification confirmed exactly one Bot and one welcome before sending, effective native global selection and Bot inheritance. The real DeepSeek reply was `引导验证通过。`; the DM retained exactly one Human request, one welcome and one model reply, and Profile completion became true. This final integration proof uses the real Host/model APIs; the earlier screenshots and Client walkthrough were captured before the schema-number integration.

## Automated checks

- After integration with main, final Client suite: **946 passed, 0 failed** (`pnpm exec vitest run packages/client/test --maxWorkers=2`).
- Before integration with main, related core run: **23 passed, 0 failed**, covering onboarding, credential readiness, plugin registration, credential health and PersonaBot output. After integration, the combined run including Content Purge was **37 passed, 5 failed**: four onboarding timeouts and one Content Purge filesystem `fsync` EPERM. The isolated final core rerun then passed **23/23** with one worker and a 60-second per-test limit; this does not make the default-limit combined run green.
- The final recovery regression commits a Human message before losing the transport response, refreshes canonical history and tries to continue the old draft: only the original message remains. Draft ownership transfers to the normal message chain when its message ID is allocated. A send stopped before allocation preserves the draft; a failed readiness lookup preserves text and displays an error.
- Typecheck, lint (existing warnings), format check, build, bilingual release-ledger checks, ADR uniqueness and `git diff --check` passed.
- The earlier complete Windows run was **2653 passed, 549 failed, 29 pending**. It included read-only filesystem/SQLite cleanup EPERM failures and resource/time-limit failures as well as regressions subsequently repaired and rerun above. It is not a passing full-suite result, and was not repeated after the last corrections.
- A baseline spot-check at `895153357ba11c1729a8f9df2c3e5093401ab968` produced **16 passed, 13 failed** in `bridge-rpc`, `channel-model-read`, `dev-model` and browser `container-driver`. This establishes representative pre-existing Windows failures, not that every failure in the full run is pre-existing. Linux full-repository CI passed at `14d8feed` ([run](https://github.com/BotHarness/DeepSeekBot/actions/runs/37758142165)); the PR checks track the subsequent recovery correction.

## Visual evidence

All committed images are unmodified captures from the real DSH Client, Chinese locale, **1559 × 865** viewport. The before images use the separate baseline checkout. The absence state is the predecessor for the new welcome and confirmation views. The dark welcome capture includes a retained unsent question; this is labelled rather than presented as identical draft state to the baseline.

| State                                                   | Evidence                                                  |
| ------------------------------------------------------- | --------------------------------------------------------- |
| Before, empty Bot mode, light                           | [Before light](onboarding-before-light.jpg)               |
| After, no-Key welcome, light                            | [After light](onboarding-after-light.jpg)                 |
| Before, empty Bot mode, dark                            | [Before dark](onboarding-before-dark.jpg)                 |
| After, no-Key welcome with retained draft, dark         | [After dark](onboarding-no-key-dark.jpg)                  |
| No-Key confirmation, global option checked, light       | [Missing configuration](onboarding-model-light.jpg)       |
| Restored question ready for explicit confirmation, dark | [Confirm](onboarding-confirm-dark.jpg)                    |
| Real invalid-credential failure, dark                   | [Failure](onboarding-failure-dark.jpg)                    |
| Real reply after manual original-message retry, dark    | [Reply and completion](onboarding-retry-success-dark.jpg) |

Browser automation later intermittently lost its debugger connection and timed out in DOM and screenshot operations, including fresh-tab recovery. The final inheritance Profile and global-default Settings views, final cross-client/skip UI walkthrough and a separate existing-Bot Client walkthrough were not captured. Their Host/controller behavior is covered above, but they remain explicit Human review items before merge.

## Runnable review

Launch an isolated Profile with `node scripts/dev-instance.mjs --home <isolated-home> --port <free-port> --build` and open the printed local login URL. Never reuse a production Profile for schema verification. To reproduce missing configuration, point the native provider's `apiKeyEnv` at an unset QA reference through native Settings; do not remove shared credentials.

1. Enter Bot mode. Confirm the default identity, welcome, composer and companion before configuring a Key.
2. Click the welcome question; check the selected request, default-on global option and explicit final send. Close and refresh, then deliberately continue the retained question.
3. Configure a usable model through native Models/Credentials and confirm. Check a real reply, completion and reusable welcome. Open Bot Profile: the model should show Inherit global.
4. Save an individual choice for a second Bot. Change the global default in Bot settings; verify the inheritor follows and the fixed Bot retains its plan. Return the fixed Bot to inheritance with the current revision.
5. Start, close/Escape, continue and skip the guide; re-enter from another Client and verify no automatic highlight. Check keyboard focus and the OS reduced-motion preference.
6. With a QA-only invalid credential, send once, repair it and explicitly retry the original failure card. Verify one Human message. Replay after a completed or side-effecting request must be refused.

Schema generation 69 is forward-only. Keep a pre-upgrade backup; a generation-68 binary cannot safely reopen the upgraded Profile. Restore that backup or use a compatible binary for recovery, retaining the independent Purge Ledger and enforcing its monotonic facts. Do not expand news/schedules/optional Memory/IM guidance until Human feedback on this slice.
