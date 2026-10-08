# Issue #1208: one-time onboarding reminder

This tracer belongs to [the Bot-mode onboarding spec #1174](https://github.com/BotHarness/DeepSeekBot/issues/1174).

## Runtime path

Use the pinned DSH 0.2.0-rc.1 launcher with a fresh isolated Profile and a usable native model, enter Bot mode, and choose the welcome's ten-minute reminder. The option shows **Once only · This DM · the browser time zone** before selection. If a model needs setup, save it, review the preserved request and explicitly send. With no detected time zone, the request asks the Bot to confirm one first.

The ordinary Human message reaches the real PersonaBot Orchestrator. Its existing `bot_schedule_create` Tool accepts `once_in_minutes` with an explicit `time_zone`; the Bot Schedule owner computes a local `once` trigger from its clock. Native minute precision rounds the deadline up, never down. The owner checks that the native occurrence matches the computed instant; an ambiguous autumn clock overlap is refused rather than silently selecting an earlier occurrence. Existing absolute `once_at` and recurring forms remain available.

The scheduled prompt retains the exact current DM destination. Creation confirmation names the actual local date/time, time zone and DM, explains that the app must remain running and that firing may use the model, and avoids internal IDs. A real planned firing must then deliver in that DM, disable the schedule and clear its next due time. Confirmation alone does not prove firing.

## Evidence and limits

- Final implementation: 70 focused Client/controller, adapter Tool and Bot Schedule tests passed. They cover deliberate dispatch, duplicate-click protection, missing-model setup without auto-send, unknown time zone, explicit relative Tool arguments, midnight, minute rounding, spring DST and refusal of ambiguous autumn deadlines.
- Production build, type checking, lint, formatting and bilingual Release Ledger checks pass. A full local Windows test run was stopped after repeated Group/runtime timeouts under parallel load; it is not a full-suite pass. The PR's CI is the complete-suite check.
- In the isolated real Host using `deepseek-official/deepseek-flash`, the final request was admitted at **2026-10-08 15:57:22 UTC**. The model created one PersonaBot-owned, enabled `once` task at **15:57:29 UTC**, due **16:08:00 UTC / 2026-10-09 01:08 Asia/Tokyo**, with the exact DM destination retained in its prompt. Its concise confirmation arrived at **15:57:30 UTC** and completed onboarding through the canonical Bot reply.
- The final planned-firing outcome is recorded in [PR #1221](https://github.com/BotHarness/DeepSeekBot/pull/1221) and the issue handoff. Earlier real iterations delivered their planned reminders and disabled the one-time task, and exposed the minute-rounding issue fixed here.

## UI capture exception

Matched light/dark before/after screenshots and a final real Client click are outstanding. Chrome reopened the old local Host, but the next accessibility read timed out and reset page control. A fresh Chrome tab for the new isolated Host then returned `net::ERR_BLOCKED_BY_CLIENT`. The in-app browser had also blocked loopback pages in the preceding tracer. No browser restriction was bypassed, no synthetic UI screenshot is presented, and no rendered-UI pass is claimed.

The real-model evidence above uses the authenticated normal `channelSend` API with the welcome's exact translated request; it does not create schedules directly or substitute Run now for a planned firing. To complete visual review, open the launcher's local login URL in a connected browser, enter Bot mode, compare the welcome at the same viewport in light/dark themes, select the reminder, inspect the actual confirmation and wait for the scheduled DM message. Keep the isolated Host running throughout.
