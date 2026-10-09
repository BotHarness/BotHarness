# Issue #1228: daily evening onboarding check-in

Part of [Bot-mode onboarding #1174](https://github.com/BotHarness/DeepSeekBot/issues/1174).

## Runnable path

Start a fresh isolated Profile with the pinned `scripts/dev-instance.mjs` helper, enter Bot mode, configure a usable model and choose **Check in with me every evening at 9**. The existing grouped card shows **Daily at 21:00 · This DM · browser time zone**. A deliberate click sends the expanded ordinary Human request through the existing onboarding controller. Missing-model setup retains that request and requires a separate explicit send. Unknown browser time zones ask for a zone before schedule creation.

The existing PersonaBot Orchestrator and Bot Schedule owner create the recurring daily trigger. Confirm the saved cadence, zone, next occurrence and exact DM destination; creation does not prove a later firing. The check-in does not require search configuration.

## Real Host and model evidence

On 2026-10-08 UTC, a fresh isolated pinned DSH 0.2.0-rc.1 Host passed authenticated health. Its native `deepseek-official/deepseek-flash` model received the exact Chinese welcome request with Asia/Tokyo through the public `channelSend` API; this was an API admission, **not an actual browser click**. No direct schedule-create call, fake clock or Run now was used.

- The canonical Human message was admitted at **17:26:03.347 UTC**.
- The model created one PersonaBot-owned enabled task at **17:26:22.507 UTC**, with `{ kind: daily, time: 21:00, timeZone: Asia/Tokyo }`.
- Its next occurrence was **2026-10-09 12:00 UTC / 21:00 Asia/Tokyo**. Its saved prompt retained the exact current DM Channel ID and required explicit `channel_send` to that destination.
- A genuine Bot-authored DM confirmation arrived at **17:26:24.477 UTC**, naming the daily time, next date/time and current DM, plus application-running, enabled-Bot and usable-model requirements. The canonical real reply completed core onboarding independently of tutorial participation.
- After inspection, the test task was disabled through the existing public schedule-update operation; no future test greeting remains armed. This qualification does **not** claim natural daily firing or delivery.

Client/controller and existing Tool regression: **51 tests pass**, covering both languages, no send before selection, rapid repeated clicks, missing-model deferred intent and unknown time zones. Type checking and production build pass; the PR links complete CI.

## Visual capture exception

The in-app browser refused the explicitly Human-authorized `http://127.0.0.1:6501` login navigation with `ERR_BLOCKED_BY_CLIENT`. The Host Client-diagnostics reader remained **unobserved** with no browser attempts. API health and the real model response certify neither rendered Client readiness nor a browser interaction. No local screenshot was captured, and no permission, admission or browser security protection was changed. See the merged [AX browser qualification runbook](../../agents/ax-browser.md).

For matching before/after review, compare base **8940165faf2b833b1535a5107b78fb0cc8c476a4** with this PR in separate fresh isolated Profiles. Use identical viewport, locale, light/dark theme and initial Bot/DM state. The base offers a generic morning news summary; the PR offers an evening check-in with explicit daily/time-zone/current-DM metadata. Operate the reminder option and model-setup continuation in the real Client when browser navigation is available. Disable each qualification task afterward through the ordinary schedule controls.
