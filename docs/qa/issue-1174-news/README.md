# Issue 1174 — capability-aware news welcome

Base: `a7b8524639dbec5d354aa94f504f1ed25fd6845a` (merged daily check-in slice).
Pinned Host: DSH `0.2.0-rc.1`. This slice changes the existing welcome choice and request; it adds no credential store, search Provider, completion condition or persisted readiness state.

## Deterministic coverage

62 focused tests cover Host readiness, the public onboarding projection and Client request behavior: a chat credential alone is insufficient; missing Services, unsupported configuration, missing search credentials and a preset without `web_search` fall back; scope leases are released; repaired configuration is re-read; Chinese/English news sends the complete sourced-search request once; model setup preserves it for explicit sending; refreshed readiness switches the existing card without sending. Lint, format check, typecheck and production build pass.

## Real isolated Host

An isolated, authenticated Profile was launched on the Human-authorized origin `http://127.0.0.1:4175`, using the native DeepSeek chat and search Services. No production Profile or standing approval policy was changed.

- At 2026-10-08 18:06:49 UTC, the public onboarding query returned `newsAvailable: true` and `completed: false`.
- Through native Settings, only the isolated search credential reference was temporarily set to an unconfigured reference. The chat model remained configured, while the public onboarding query changed to `newsAvailable: false`. Restoring the original reference changed it back to `true`.
- At 18:07:03 UTC, the exact Chinese news request from the welcome was admitted as an ordinary Human DM request through the public Channel API. Normal one-call tool approvals remained in place. Canonical SessionEvents show native `web_search` results with source metadata; final-response qualification is recorded below.

This proves public Host admission and real native execution. It does not prove a click in the actual Client.

## Real reply and source provenance

At 2026-10-08 18:24:40 UTC, the real Bot reply arrived in the same DM. Its heading identified the local date as October 9 while qualifying that the material was mostly October 7–8. It explicitly disclosed an approval-refused search and incomplete coverage. The public onboarding query then returned `completed: true` at 18:25:16 UTC. After restarting with the final production build, the same Profile still returned `newsAvailable: true` and `completed: true` at 18:26:29 UTC.

Canonical native events contain four successful search results with eight source records each, seven successful fetch results, one failed fetch and one approval-refused additional search. All nine unique URLs cited in the final DM reply occur in actual tool outputs, including the returned CLS source URL rather than its failed alternate host. This checks source provenance and truthful disclosure of the refused search; it does not independently certify every news claim or establish a search-outage/empty-result model qualification.

## UI capture blocker and runnable review path

The in-app browser refused the authenticated local page with `ERR_BLOCKED_BY_CLIENT` on the already authorized origin. Host Client diagnostics returned `unobserved`, with zero Client connection attempts. Comparable before/after Client screenshots could not be captured; no mock screenshot or API result is presented as visual evidence.

To review, launch separate fresh isolated Profiles for the base and PR revisions using `node scripts/dev-instance.mjs --home <isolated-home> --port <authorized-port> --worktree <checkout> --build`, then open each launcher's private login URL. Keep the same viewport, theme, locale and Profile state for each pair:

1. Enter Bot mode with a usable chat model but without native search credentials. Before: the welcome offers news. After: its second shared card offers general work planning and sends that ordinary request when explicitly clicked.
2. Configure the native DeepSeek search credential reference in existing settings, keeping the Bot preset's `web_search` Tool enabled. After refresh: the second card offers today's AI news. Click once, retain ordinary tool approvals, and verify the real DM reply includes sources from actual search results or explains failure/empty results honestly.
3. Remove/repair only the search reference and wait for the existing receipt refresh. Verify the card switches without sending. Repeat in Chinese/English and light/dark themes.
4. With search configured but chat model missing, select news, save the model, then explicitly send. Verify the full sourced-search request is retained and model save alone sends nothing.

## Qualification boundary

RC1 exposes no public search-provider inventory/readiness query. This adapter conservatively qualifies the known active native DeepSeek search configuration, redacted credential presence and actual Bot preset Tool scope. Unsupported custom/isolated providers and account-only authentication fall back to the general example. Configuration readiness does not guarantee credential validity, connectivity, current news availability or a successful subsequent search. The normal request explicitly asks for actual sources and truthful failure reporting; it does not substitute a fabricated reply.
