# Bot-mode onboarding first tracer — verification

Issue: [#1175](https://github.com/BotHarness/DeepSeekBot/issues/1175). Parent: [#1174](https://github.com/BotHarness/DeepSeekBot/issues/1174). Verified 2026-10-08 with the pinned DSH 0.2.0-rc.1, Windows, Node 24.14.0 and pnpm 12.4.2.

## Original runtime behavior before the separate model/send revision

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

- After integration with main, final Client suite: **950 passed, 0 failed** (`pnpm exec vitest run packages/client/test --maxWorkers=2`).
- Before integration with main, related core run: **23 passed, 0 failed**, covering onboarding, credential readiness, plugin registration, credential health and PersonaBot output. After integration, the combined run including Content Purge was **37 passed, 5 failed**: four onboarding timeouts and one Content Purge filesystem `fsync` EPERM. The isolated final core rerun then passed **23/23** with one worker and a 60-second per-test limit; this does not make the default-limit combined run green.
- The final recovery regression commits a Human message before losing the transport response, refreshes canonical history and tries to continue the old draft: only the original message remains. Draft ownership transfers to the normal message chain when its message ID is allocated. A send stopped before allocation preserves the draft; a failed readiness lookup preserves text and displays an error.
- Typecheck, lint (existing warnings), format check, build, bilingual release-ledger checks, ADR uniqueness and `git diff --check` passed.
- The earlier complete Windows run was **2653 passed, 549 failed, 29 pending**. It included read-only filesystem/SQLite cleanup EPERM failures and resource/time-limit failures as well as regressions subsequently repaired and rerun above. It is not a passing full-suite result, and was not repeated after the last corrections.
- A baseline spot-check at `895153357ba11c1729a8f9df2c3e5093401ab968` produced **16 passed, 13 failed** in `bridge-rpc`, `channel-model-read`, `dev-model` and browser `container-driver`. This establishes representative pre-existing Windows failures, not that every failure in the full run is pre-existing. Linux full-repository CI passed at `14d8feed` ([run](https://github.com/BotHarness/DeepSeekBot/actions/runs/37758142165)); the PR checks track the subsequent recovery correction.

## Visual evidence

The original feature images below are unmodified captures from the real DSH Client, Chinese locale, **1559 × 865** viewport. The before images use the separate baseline checkout. The absence state is the predecessor for the new welcome and confirmation views. The dark welcome capture includes a retained unsent question; this is labelled rather than presented as identical draft state to the baseline.

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

## Welcome/model UI feedback verification

After the spacing/card feedback, the same generation-69 Profile and canonical conversation were reviewed in the real Chrome Client. The welcome used a 12px grid gap plus paragraph margins of 13px + 13px and 12px + 12px, adding 50px of unintended spacing. The new scoped paragraphs have zero margins and 20px line height; the measured welcome body is 299.33px high, previously 328.94px, including the new full-row model card.

The welcome and provider entry use the existing Channel sidebar card components. Bot model editing, onboarding confirmation and global-default editing share the same searchable ModelPicker and native reasoning segmented control. Provider/Key editing opens native Models settings; its internal editor is not copied or imported through an unsupported interface.

The live walkthrough verified provider-name search, keyboard model selection, High reasoning selection, Escape closing with focus restored to the model card, default-on global checkbox and the retained unsent request. Opening native Models showed the configured DeepSeek provider and its existing edit/add controls. Opening global-default settings showed the same shared model controls with Save global default, without a send action. No additional Human message was submitted during these UI checks. Theme was restored to Follow system after capture.

The added integration regression exercises provider search, model-dependent reasoning controls, checkbox changes and explicit final confirmation. Final Client regression: **947 passed**; typecheck, lint, format and build passed.

New images are unmodified Chinese Client captures at **1559 × 920**. Each pair uses the same Profile and conversation; the unsent-question header can differ because opening the model dialog creates a local draft. Original feature screenshots above retain their earlier viewport and provenance.

| View                      | Before                           | After                          |
| ------------------------- | -------------------------------- | ------------------------------ |
| Welcome, light            | [Before](card-before-light.jpg)  | [After](card-after-light.jpg)  |
| Welcome, dark             | [Before](card-before-dark.jpg)   | [After](card-after-dark.jpg)   |
| Model confirmation, light | [Before](model-before-light.jpg) | [After](model-after-light.jpg) |
| Model confirmation, dark  | [Before](model-before-dark.jpg)  | [After](model-after-dark.jpg)  |

Additional current captures: [native provider settings](provider-settings-after.jpg), [global default model](global-model-after.jpg). These resolve the Settings capture limitation above for model/provider presentation; fixed/inherited Bot controls, cross-client/skip walkthrough and actual OS reduced-motion switching remain Human review items.

## Welcome choices and separate model/send verification

After further Human feedback, the welcome offers capability introduction, today’s news, a daily 9am news summary and a ten-minute reminder to test scheduled tasks. They remain ordinary Human DM requests handled by the existing execution capabilities; no news subsystem or scheduler store was added.

The model card and dialog now say Choose a model, with Save model as the only final action. Standalone model setup invents no question. A pending question reaches a separate Send question dialog after saving, with its own Send action; closing it preserves the local question. Review unsent question reopens that send step and allows returning to model selection. The final send rechecks current model readiness through the normal send path.

Real Chrome verification used the existing completed QA Profile for the same-conversation welcome comparison and a separate fresh Profile for the blocked first-request path. In the fresh Profile, the native provider reference temporarily pointed to an unset QA environment variable. Selecting the introduction retained the question and opened model setup without a Human message. Restoring only the reference, refreshing models and clicking Save model opened the separate send step; canonical history still contained just one system welcome. Escape closed the send step, Review restored it, and Choose a model returned to the first step. Only the later explicit Send submitted the introduction: canonical history then contained one welcome, exactly one Human request and a genuine Bot reply, and onboarding completed. No scheduled request was executed during these checks.

Final Client regression: **950 passed**, including four welcome requests through the regular send action, standalone model save without an invented draft, separate save/send, close/restore, failed-save preservation and response-loss deduplication. Focused controller/bridge/view run: **90 passed**. Typecheck, lint, formatting, build and release-ledger checks passed. Previous revision `d48793fd` full Linux CI passed ([run](https://github.com/BotHarness/DeepSeekBot/actions/runs/37763411866)).

Current unmodified Chinese captures use **1559 × 920**:

| View                              | Light                               | Dark                              |
| --------------------------------- | ----------------------------------- | --------------------------------- |
| Four welcome choices              | [Light](choices-after-light.jpg)    | [Dark](choices-after-dark.jpg)    |
| Save model step, pending question | [Light](model-step-after-light.jpg) | [Dark](model-step-after-dark.jpg) |
| Separate send step                | [Light](send-step-after-light.jpg)  | [Dark](send-step-after-dark.jpg)  |

The previous revision’s `card-after-*` and `model-after-*` images are retained as before evidence for this feedback. Model/send-step captures use the fresh first-time Profile, whereas the welcome comparison uses the earlier completed conversation; they are not presented as an identical message-history state.

## Runnable review

Launch an isolated Profile with `node scripts/dev-instance.mjs --home <isolated-home> --port <free-port> --build` and open the printed local login URL. Never reuse a production Profile for schema verification. To reproduce missing configuration, point the native provider's `apiKeyEnv` at an unset QA reference through native Settings; do not remove shared credentials.

1. Enter Bot mode. Confirm the default identity, welcome, composer and companion before configuring a Key.
2. Check all four welcome choices. Open Choose a model alone and save: no question or message should appear. With missing configuration, select a welcome question; check the retained request and default-on global option. Restore configuration and save the model: a separate Send question dialog opens without a Human message. Close and refresh, then deliberately review the retained question.
3. In the separate send step, explicitly click Send. Check a real reply, completion and reusable welcome. Open Bot Profile: the model should show Inherit global.
4. Save an individual choice for a second Bot. Change the global default in Bot settings; verify the inheritor follows and the fixed Bot retains its plan. Return the fixed Bot to inheritance with the current revision.
5. Start, close/Escape, continue and skip the guide; re-enter from another Client and verify no automatic highlight. Check keyboard focus and the OS reduced-motion preference.
6. With a QA-only invalid credential, send once, repair it and explicitly retry the original failure card. Verify one Human message. Replay after a completed or side-effecting request must be refused.

Schema generation 69 is forward-only. Keep a pre-upgrade backup; a generation-68 binary cannot safely reopen the upgraded Profile. Restore that backup or use a compatible binary for recovery, retaining the independent Purge Ledger and enforcing its monotonic facts. Optional Memory/IM guided breadth remains deferred pending further Human feedback.
