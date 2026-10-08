# First-conversation onboarding acceptance follow-up

Issue: [#1175](https://github.com/BotHarness/DeepSeekBot/issues/1175), parent [#1174](https://github.com/BotHarness/DeepSeekBot/issues/1174). Base: `43a655724eaaf2b9d71abe1c0ea62c163029d0d1` (merged #1186). Task: `codex/local/01a11a57-0b00-7791-8785-38df79fe4099`.

This closes the first real-conversation tracer together with the [original implementation and qualification](../issue-1175/verification.md). It does not claim delivery of optional guided Memory/IM breadth or capability-aware search/schedule execution retained by the parent.

## Fixes found through the delivered Client

- An observing window had no local highlight but still paused the shared tutorial when it left Bot mode, opened model setup or prepared a send. Only a window with its own open highlight now persists an incidental pause; an explicit shared Skip still dismisses other windows.
- A completed receipt prevented an explicit Restart from opening highlights, and a completed user who never started the tutorial had no Restart entry. Explicit replay now works through polling and Escape while preserving completion. First successful completion still ends the initial guide, and a fresh window remains quiet.
- Saving an individual model left an already-open sidebar showing Inherit global. Successful saves now invalidate the Client projection and reread the canonical Model Plan; both the open card and collapsed badge refresh. Direct return to inheritance clears the same cache. Host revisions and durable authority are unchanged.

## Live acceptance

Windows Chrome, pinned DSH `0.2.0-rc.1`, built worktree Client, Chinese locale, normal **1559 × 865** viewport. Two isolated Profiles were used; production Profiles and other sessions' Hosts were untouched. Public Host API calls below are named separately from browser actions. No credentials, cookies or login URLs are published.

| Path                               | Observed result                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh empty Profile                | Opening the normal shell did not create a Bot. Deliberate Bot-mode entry created one identity, real Memory repository, DM and reusable four-choice preset welcome. Local companion initialized once.                                                                                                                                                                                               |
| Multiple windows                   | Window A started a guide; B observed active progress without its own overlay. B leaving Bot mode no longer paused A. B explicitly skipping did dismiss A. Host snapshots qualified the shared active/paused/skipped states.                                                                                                                                                                        |
| Close / replay                     | Escape and the close control paused the owning guide and restored focus. Explicit Restart after completion reopened the highlight, survived polling, and retained completion/history. Cold re-entry did not reopen it.                                                                                                                                                                             |
| Model setup                        | Standalone Choose model saved without a question or Human message. The global option was checked initially. Saving unchecked showed the individual plan immediately in the already-open sidebar; saving checked and direct Inherit global both immediately restored inheritance and cleared the old badge.                                                                                         |
| Global revisions                   | Public native settings/model APIs changed the global default to Pro while an individual Flash plan remained unchanged. A stale revision was rejected. Returning to inheritance with the current revision followed Pro; the global default was restored to Flash.                                                                                                                                   |
| Genuine completion                 | A normal composer request received the real model reply “引导验收通过”. Completion then became true. An earlier accepted request that produced no visible reply did not complete onboarding. No fabricated reply was inserted.                                                                                                                                                                     |
| Failure after success              | A QA-only unset native `apiKeyEnv` reference produced a visible `MISSING_CREDENTIAL` failure while historical completion stayed visible. The original reference was restored without reading or replacing its secret.                                                                                                                                                                              |
| Original-message recovery          | Clicking Retry this message after repair produced the genuine reply “恢复验收通过。” There were three Human messages overall, including exactly one recovery request, one failure notice and two real Bot replies. A subsequent public retry of the completed request was refused with unchanged history.                                                                                          |
| Existing Bot, fresh Client         | Before first Bot-mode entry in the second Profile, public `create` prepared one existing Bot and native model setup supplied reusable configuration. The real Client reused that Bot, created no default replacement, sent from the normal composer, received “已有 Bot 验收通过。” and displayed completion. Restart was available despite never having started a tutorial, and Escape closed it. |
| Persisted identity and preferences | Cold Host restarts retained identity, welcome and completion. Model references were restored, the original Follow system preference was restored, and local companion removal was respected.                                                                                                                                                                                                       |

The earlier report retains the no-Key configuration/draft/send walkthrough, managed Git/identity and recovery coverage, companion checks, keyboard question interactions and light/dark UI pairs. This follow-up adds the remaining live fixed/inherited revision matrix, actual failure/repair/original-message retry, existing-Bot completion and multi-window/tutorial replay checks.

## Screenshots

Unmodified captures. The paired dark images use the same Profile, conversation, locale, viewport and relevant interaction state; companion animation may differ. The tutorial pair shows A after B leaves: before, A lost the guide; after, A retains it. The model pair shows the same saved individual choice: before, the open sidebar remained inherited; after, it displays the actual individual plan.

| View                                    | Before                              | After                              |
| --------------------------------------- | ----------------------------------- | ---------------------------------- |
| Observing window leaves                 | [Dark](tutorial-before-dark.jpg)    | [Dark](tutorial-after-dark.jpg)    |
| Save individual model with sidebar open | [Dark](model-scope-before-dark.jpg) | [Dark](model-scope-after-dark.jpg) |

Additional key states: [light tutorial](tutorial-light.jpg), [light individual model](model-scope-after-light.jpg), [completed tutorial replay](restart-completed-light.jpg), [failure with historical completion](completed-current-failure-light.jpg), [existing Bot real reply](existing-bot-reply.jpg), [explicit replay after that reply](existing-bot-restart.jpg).

Capture exception: no comparable base-revision completed-replay screenshot was retained before rebuilding the isolated Client. The original failure was qualified by the regression test; the two existing-Bot images show the current interaction before and after Restart, not a base/PR comparison. Reproduce on the base with a completed receipt: Restart is absent when the tutorial was never started, or produces no highlight when present. On this branch it opens a highlight while retaining “已完成第一次对话”. OS reduced-motion preference switching is unavailable through the connected browser-only controls; the existing tour test exercises `prefers-reduced-motion: reduce`, but this is not claimed as a manual OS setting check.

## Automated checks

- Full Client suite: **976/976**, 133 files, including the five new regressions.
- Final focused controller/model-card rerun: **23/23**.
- Related Host suites (onboarding, credential readiness, model credential health): **9/9**, one worker with 60-second test timeout.
- Full build, typecheck, lint, formatting, bilingual Release Ledger and whitespace checks pass. Lint retains existing warnings.
- After syncing main `52d68d66`, the full Client suite passed **976/976**, 135 files, and all required local checks/build passed again; a cold restart of the same existing-Bot Profile retained the real reply/completion, stayed quiet on entry and reopened the guide only after explicit Restart; see the PR for its new CI result. The merged onboarding base passed [full Linux CI](https://github.com/BotHarness/DeepSeekBot/actions/runs/37774779801); the new PR gets its own required checks. This does not relabel prior Windows full-repository limitations as passing.

## Runtime limitations retained

Native development rebuild/reconnect attempts on the earlier port produced `SlotAssemblyError` for `session-maybe`, cancelled gateway requests and shell/runner failures. Their cause is unqualified and this Client fix does not claim to resolve them. Cold restarting the same isolated Profile on a fresh port restored the working shell without replacing its data. Two screenshot requests timed out while accessibility remained available; later unmodified captures succeeded. Final inspected current-page console warning/error entries were empty. Earlier failed attempts remain in private diagnostic history.

## Runnable review

Launch the branch with `node scripts/dev-instance.mjs --home <new-isolated-home> --port <free-port> --build` and use its local login URL. Enter Bot mode, open the welcome, then click the roster Bot to expose its PersonaBot model sidebar. Keep the Model section expanded while using the welcome model picker: save an unchecked global option, then save checked or click Inherit global. Verify immediate card/badge updates and no message from a standalone save.

Use two browser origins/windows against that Host: A starts the tutorial, B observes and leaves Bot mode. A must stay active; explicit Skip in B must still close it. Send a normal DM request, wait for a genuine reply, then Restart and Escape. Completion and conversation must remain. For retry qualification, use only a disposable Profile and an unset QA provider reference; repair it, retry the existing failure card and confirm one Human request.
