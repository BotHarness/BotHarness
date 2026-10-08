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

- After integration with main, final Client suite: **959 passed, 0 failed** (`pnpm exec vitest run packages/client/test --maxWorkers=2`).
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

Before main sync, Client regression: **950 passed**, including four welcome requests through the regular send action, standalone model save without an invented draft, separate save/send, close/restore, failed-save preservation and response-loss deduplication. Focused controller/bridge/view run: **90 passed**. Typecheck, lint, formatting, build and release-ledger checks passed. Previous revision `d48793fd` full Linux CI passed ([run](https://github.com/BotHarness/DeepSeekBot/actions/runs/37763411866)).

Current unmodified Chinese captures use **1559 × 920**:

| View                              | Light                               | Dark                              |
| --------------------------------- | ----------------------------------- | --------------------------------- |
| Four welcome choices              | [Light](choices-after-light.jpg)    | [Dark](choices-after-dark.jpg)    |
| Save model step, pending question | [Light](model-step-after-light.jpg) | [Dark](model-step-after-dark.jpg) |
| Separate send step                | [Light](send-step-after-light.jpg)  | [Dark](send-step-after-dark.jpg)  |

The previous revision’s `card-after-*` and `model-after-*` images are retained as before evidence for this feedback. Model/send-step captures use the fresh first-time Profile, whereas the welcome comparison uses the earlier completed conversation; they are not presented as an identical message-history state.

After merging main’s AX diagnostics change (`455e16b0`), the full Client suite passed **959/959**; typecheck, lint, formatting and build passed again. The related isolated core rerun passed **23/23** (credential readiness, model credential health, onboarding and Plugin integration; one worker, 60-second test limit). The merge retained both bilingual release entries. No onboarding UI source changed during this merge.

## Grouped question choices verification

Further Human feedback applies the Channel sidebar wake-policy grouping to both native question messages and the onboarding welcome. Both now compose the existing `SidebarCardList` and `SidebarCardRow`: one 10px outer radius, joined rows and native border separators. Existing sidebar consumers keep their icons and actions; tracked Browser/Computer bundles were rebuilt because they also embed this shared row.

Single-choice options remain full-row buttons with exclusive `aria-pressed` state and no checkbox. Multiple-choice options use one real checkbox inside a full-row label, so the label and description toggle the same input without nested interactive controls. Their 16px input geometry and focus treatment follow the installed native `Checkbox.module.css`; the native Checkbox wrapper accepts only a string label, so the shared multi-line card owns this label composition. Freeform single answers still replace the selected option; multiple answers retain checked options alongside free text. Explicit submission and resolved/expired disabling remain unchanged.

The message-only card surface reads native `--dsw-alias-bg-base`; it is visibly separate from the surrounding bubble's native active fill. Measured light options were opaque white against the translucent slate bubble, and dark options were RGB 21/21/23 against the translucent white bubble. Selected rows use a theme-derived accent tint and leading marker, retained while hovering. Wake-policy cards retain their existing surface.

A genuine Bot `ask_user_question` call produced one single-choice and one multiple-choice question in the same QA DM. Chrome verification exercised switching the exclusive choice, checking two topics, Space toggling, light/dark rendering, explicit submission, disabled resolved controls and the real follow-up reply “选择已确认”. Exactly one Human answer contained the chosen capability and two topics. No scheduled task was created. The original Follow system theme and normal viewport were restored afterward.

The browser had intermittent CDP observation/screenshot timeouts and one native connection retry warning during the first fresh-tab attempt. The old QA tab was released; the new tab loaded the rebuilt Client and retained the Host's same pending question. Recovery is recorded as browser/runtime evidence, not claimed as a bug fix. Final current-page console inspection found no new error; the earlier retry warning remains in the captured log history.

Validation: full Client **960/960**; focused message/onboarding regression **42/42**; final question and style-token checks **20/20**. Typecheck, lint, format, build, release ledgers and whitespace checks passed. Previous main-sync revision `fdbd33e7` full Linux CI passed ([run](https://github.com/BotHarness/DeepSeekBot/actions/runs/37767473019)). The new UI commit receives its own PR checks.

Unmodified Chinese captures are **1559 × 920**:

| View                               | Before                                      | After                                     |
| ---------------------------------- | ------------------------------------------- | ----------------------------------------- |
| Single + multiple questions, light | [Before](question-options-before-light.jpg) | [After](question-options-after-light.jpg) |
| Single + multiple questions, dark  | [Before](question-options-before-dark.jpg)  | [After](question-options-after-dark.jpg)  |
| Welcome choices, light             | [Before](choices-after-light.jpg)           | [After](question-welcome-after-light.jpg) |
| Welcome choices, dark              | [Before](choices-after-dark.jpg)            | [After](question-welcome-after-dark.jpg)  |

Question pairs use the same live question and selected values (one capability, two topics), with wake-policy grouping visible alongside. The welcome pairs show the same original welcome from the same Profile; the After capture also has the later QA request below it and its pending-question indicator, so the surrounding conversation state is explicitly different. The welcome options and model entry themselves are directly comparable.

## Main integration after grouped-choice feedback

Main `92965cf1` added WeChat defaults at generation 69 and Content Purge completion at generation 70. The unpublished onboarding migration follows them at generation **71**, and its decision is now ADR-0147; main's ADR-0146 and immutable migration bodies remain intact. A new regression upgrades the exact main generation-70 plan and verifies the qualified WeChat defaults revision/body and Content Purge fence survive unchanged. A purged welcome is rendered as a tombstone before considering onboarding actions.

Post-merge validation: full Client **970/970**; related core **36/36** (credential readiness, model credential health, onboarding, Plugin integration, messaging defaults migration and Content Purge completion; one worker and 60-second test limit). Typecheck, lint, formatting, build, bilingual release ledgers and ADR uniqueness pass. Historical Windows failures above remain recorded rather than relabelled as passing.

The generation-69 QA Profiles used for the paired screenshots remain historical evidence and were not reopened with this generation-71 Host. A fresh isolated Profile passed the merged runtime check through the real Chrome Client: one initial welcome, four joined choices, one native single-choice question and one multiple-choice question. Switching the single choice was exclusive; Space toggled a checkbox and clicking its description restored it. Explicit submission produced exactly one answer (“看看今天的新闻” plus “科技, 商业”), disabled the controls, received the genuine Bot reply “选择已确认”, and displayed “已完成第一次对话”. No scheduled task was created. Startup diagnostics reported `shell-ready` with no earlier failures; current console warnings/errors were empty. The QA companion was hidden after its floating control intercepted the first send click; no duplicate request was sent. The older screenshot Profile was preserved. [Pending choices](question-options-71-pending.jpg) and [resolved reply](question-options-71-reply.jpg) are additional dark-mode captures from this new Profile, not replacements for the matched before/after pairs.

## Welcome creation-action contrast

The welcome's Create PersonaBot action previously used a transparent native ghost Button. It now uses the native outlined Button with a scoped theme-accented fill, label and border. The label mixes the native business accent with the native primary label for legibility; normal and hover fills derive from the accent and base surface. Native 36px geometry remains intact, with a visible keyboard focus outline. This changes presentation only; Enter still opens the original creation dialog and Escape closes it without creating a Bot or adding a message.

Verified in the same generation-71 Chrome Profile and conversation, with matching Chinese light/dark viewport captures at **1559 × 865**. Tab reached the creation action, focus was visible, and Enter opened the existing dialog. The original Follow system preference was restored. Full Client regression **970/970**, focused onboarding/token guards **26/26**, typecheck, lint, formatting, build and bilingual ledgers pass.

One deep-theme screenshot attempt timed out; a subsequent DOM/console inspection showed the intact page and a later capture succeeded without reload. The retained console contains one earlier asynchronous-listener/message-channel error, whose initiator is unqualified. Startup diagnostics preserve two earlier short `shell-lost`/`shell-mounted` transitions around Client rebuilds; the current document reports `shell-ready` and has no first failure. These observations are retained as evidence, not claimed as a product fix or an entirely error-free history.

| Theme | Before                            | After                           |
| ----- | --------------------------------- | ------------------------------- |
| Light | [Before](create-before-light.jpg) | [After](create-after-light.jpg) |
| Dark  | [Before](create-before-dark.jpg)  | [After](create-after-dark.jpg)  |

## Compact questions and Developer mode

Question cards now read the existing Bot settings Developer mode preference through both registered Bot main surfaces. The default view omits Session provenance and the short grouping headers; complete questions, details and option descriptions remain visible. Optional custom answers use the native Input placeholder and an accessible name instead of a separate label. A question without options retains its visible input label and required-answer behavior. Answered/cancelled status uses plain user-facing wording. No Host contract, persistence, authority or answer dispatch changed.

The same live two-question request was captured before and after in the generation-71 Profile, Chinese, **1559 × 865**, with one capability and two topics selected. The card width stayed **380px**; its measured height decreased from **734.40px** to **565.94px** (about **23%**). Both captures keep the conversation at its bottom: the taller Before card extends above the viewport, while the After card fits. The viewport was not overridden or resized.

| Theme | Before                             | After                            |
| ----- | ---------------------------------- | -------------------------------- |
| Light | [Before](compact-before-light.jpg) | [After](compact-after-light.jpg) |
| Dark  | [Before](compact-before-dark.jpg)  | [After](compact-after-dark.jpg)  |

In real Bot settings, toggling Developer mode on revealed the collapsed provenance and short headers immediately. Toggling it off removed them without losing the selected capability, two checked topics or the custom draft “设计”. [Developer on](compact-developer-on-dark.jpg) and [Developer off](compact-developer-off-dark.jpg) preserve that state; the taller developer view extends below the composer. The draft was cleared before one explicit submission. Exactly one Human answer contained “了解 Bot 能力” and “科技, 商业”; the controls disabled and the Bot genuinely replied “选择已确认” ([reply](compact-reply-dark.jpg)). No schedule was created. Developer mode was returned to off and the original Follow system theme restored.

Validation: focused questions/Bot main/Human Inbox/preferences/token checks **64/64**, full Client **971/971**, typecheck, lint, formatting, full build, final Client rebuild, bilingual release ledgers and whitespace checks pass. Regression coverage verifies the shared preference reaches the conversation, the provenance is absent from the default DOM, the full detail survives, accessible custom answers still submit, and preference toggles preserve drafts/selection without re-reading question status. The previous head `17479797` passed full Linux CI ([run](https://github.com/BotHarness/DeepSeekBot/actions/runs/37772701086)); this presentation commit receives fresh PR checks.

Browser control had intermittent observation timeouts; a fresh tab in the same connected Chrome loaded the same pending question. A screenshot/settings action reported a timeout after opening Settings, so its resulting state was inspected before continuing. Client rebuilds retained earlier diagnostic attempts, including `shell-lost` and a prior `conversation-session-missing`/`client-runner-failed` attempt. The final current document reports `shell-ready` with no first failure, its question DOM was inspected, and current console warning/error inspection was empty. Earlier failed attempts remain in the Host diagnostic history; this change does not claim to fix the native development reload behavior.

## Runnable review

Launch an isolated Profile with `node scripts/dev-instance.mjs --home <isolated-home> --port <free-port> --build` and open the printed local login URL. Never reuse a production Profile for schema verification. To reproduce missing configuration, point the native provider's `apiKeyEnv` at an unset QA reference through native Settings; do not remove shared credentials.

1. Enter Bot mode. Confirm the default identity, welcome, composer and companion before configuring a Key.
2. Check all four welcome choices. Open Choose a model alone and save: no question or message should appear. With missing configuration, select a welcome question; check the retained request and default-on global option. Restore configuration and save the model: a separate Send question dialog opens without a Human message. Close and refresh, then deliberately review the retained question.
3. In the separate send step, explicitly click Send. Check a real reply, completion and reusable welcome. Open Bot Profile: the model should show Inherit global.
4. Save an individual choice for a second Bot. Change the global default in Bot settings; verify the inheritor follows and the fixed Bot retains its plan. Return the fixed Bot to inheritance with the current revision.
5. Start, close/Escape, continue and skip the guide; re-enter from another Client and verify no automatic highlight. Check keyboard focus and the OS reduced-motion preference.
6. Ask the Bot to present one single-choice and one multiple-choice question. In Bot settings toggle Developer mode on/off: the Session source and short headers should follow immediately, while selected options and custom drafts remain. Submit once and check one answer plus a real reply.
7. With a QA-only invalid credential, send once, repair it and explicitly retry the original failure card. Verify one Human message. Replay after a completed or side-effecting request must be refused.

Schema generation 71 is forward-only. Keep a pre-upgrade backup; a generation-70 binary cannot safely reopen the upgraded Profile. Restore that backup or use a compatible binary for recovery, retaining the independent Purge Ledger and enforcing its monotonic facts. Optional Memory/IM guided breadth remains deferred pending further Human feedback.
