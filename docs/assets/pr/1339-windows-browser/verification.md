# Windows Bot Browser verification — #1339

Verified on native Windows 11 Pro x64 (build 26200), Node 24.21.0, pnpm 12.4.2, DSH 0.2.0-rc.1 and pinned Chrome 154.0.8037.57. Baseline: PR #1338 at `9d1334240abab2cd6b45c2108010795fec0efbdc`.

## Cold install

The machine has installed browsers. To exercise fallback without changing them, a task-only Host preload redirects `ProgramFiles`, `ProgramFiles(x86)` and `LOCALAPPDATA` discovery to empty task directories. The task owns a separate Profile and cache; unrelated Profiles are untouched. This verifies an empty discovery result on native Windows, rather than a browser-free Windows image.

In the isolated Profile, enable the Browser Plugin with local/current driver, empty `browserPath` and `headless: false`. Create a PersonaBot, enable its Browser Access, expand Browser, then click Open. Start each cold run with an empty task cache. All user actions use the visible panel; setup and fault injection are developer operations.

Two baseline downloads completed while the panel showed only Opening. Host progress reached 25/50/75/100%, and a separate authenticated observation returned downloaded bytes immediately, while the panel observation took about 81 seconds. After making the duplicate development-refresh SSE explicitly opt-in, another genuine cold download displayed **38% (75.4 MB / 196.3 MB)** and reached Running. Observation responses during download took 4–5ms. This is consistent with HTTP/1 per-origin connection starvation; the exact number of wire connections was not measured.

The separate real fallback acceptance test downloaded 205,808,814 bytes. On a fresh browser profile, the baseline repeatedly failed its first background tab with the CDP response `Failed to open new tab - no browser is open`. This is not stderr. Omitting explicit `newWindow: false` preserves background/focus behavior and lets Chrome choose or create the first window. The regression failed before the fix and passed after it; the original fallback acceptance test then passed.

## Mark-of-web

Stop the task's Browser. Immediately before the next original native spawn, the task-only preload writes the binary's `Zone.Identifier` alternate data stream with `ZoneId=3`. The actual ADS was read back. Direct spawn emitted a DevTools endpoint and the panel reached Running. This does not test a GUI double-click or every SmartScreen policy.

## Simulated antivirus quarantine

Stop the task's Browser. Immediately before the next original native spawn, rename only the task cache's `chrome.exe` to `chrome.exe.qa-quarantined`. The original Node spawn returned **ENOENT / errno -4058**; a missing executable emitted no browser stderr. The panel displayed the existing `startup-spawn-failed` title, cause and allow-list action, with Details collapsed and no raw ENOENT in the main notice. Restore that file and click Open; the panel reaches Running again.

This is controlled filesystem quarantine, not a claim that Defender itself quarantined the executable. No new named failure kind, platform-specific copy or macOS change was justified or added.

## Evidence

The PNGs are real 1280 × 800, dark-theme, English captures from the same isolated Profile and Bot:

- `before-opening.png`: a baseline cold download, with no visible progress.
- `after-progress.png`: repaired cold download with percent and MB.
- `after-running.png`: repaired cold install reached Running.
- `quarantine-spawn-failed.png`: existing cause/action after controlled quarantine.

## Automated checks

- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build` and the bilingual release-ledger checks pass.
- `pnpm vitest run packages/browser packages/client/test/apply.test.ts packages/client/test/client-bundle.test.ts`: 352 passed, 8 skipped.
- With `BROWSER_FALLBACK_E2E=1` and a task-owned `BROWSER_FALLBACK_CACHE`, `pnpm vitest run packages/browser/test/runtime.test.ts packages/browser/test/fallback-acceptance.e2e.test.ts`: 86 passed, including real native Chrome.
- An additional full `pnpm test` run was stopped after unrelated Windows failures; it did not pass. A separate untouched baseline checkout at `9d133424` reproduced 42 failures out of 44 in `packages/core/test/registry.test.ts` and `packages/core/test/bot-runtime.test.ts`, reporting EPERM during directory cleanup. These baseline teardown failures are outside this repair; no full-suite success is claimed.
