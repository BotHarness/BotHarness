# Browser Profile reset E2E — #595

Baseline: `462b2b228b49bd48554a0c8ee783d435826e11ff` (merged #594).

All screenshots are actual DSH Client captures at **746 × 827**, English shell, dark theme, the same isolated local Profile and two QA Bots. The DM transcript contains one additional real-model setup turn after the fix; this is setup history, not the behavior under review. No credentials or personal browsing data are present.

## Comparable interaction

1. A real DeepSeek DM opens and observes the shared-profile fixture through the native Agent-scoped Tools Service.
2. The primary Bot owns two tabs; a second Bot owns a separate tab in the same default browser profile.
3. Use the Client's **Pause Bot** button, then change its native **Profile** field to `work`.
4. Before: the sidebar still offers **Resume** and reports paused actions; the next `browser_open` refuses work. See `before-sidebar.jpg` and `before-results.json`.
5. After: the sidebar offers **Pause Bot** with no inherited tabs or pause hint. See `after-reset-sidebar.jpg`. Native `browser_open`, `browser_observe`, `browser_click`, and another observe complete the fixture task. See `after-completed-sidebar.jpg` and `after-results.json`.

The work profile has an isolated sign-in marker: the default fixture writes only a nonsecret QA cookie, and the named profile does not inherit it. The peer Bot's selected tab and Human open target remain unchanged. Access off/on refuses tools while off and retains the selected work tab when restored. A native switch back to default clears the pointer before a successful fresh open; it does not adopt the old two tabs or the peer's ownership.

## Reproduce

Start an isolated instance with `scripts/dev-instance.mjs` and opt in to the existing `scripts/fixtures/browser-queue-qa.mjs` verification Plugin in that local Profile's patch. The Plugin invokes only its allowlisted native tools, using trusted persisted Session ownership. It is not shipped in the product Bundle.

```sh
node scripts/e2e-browser-profile-reset.mjs --serve
BH_E2E_ORIGIN=<local-origin> BH_E2E_HOME=<isolated-home> BH_E2E_STATE=<private-state-file> node scripts/e2e-browser-profile-reset.mjs --prepare
# In the Client: Pause Bot, then set Profile to work.
BH_E2E_ORIGIN=<local-origin> BH_E2E_HOME=<isolated-home> BH_E2E_STATE=<private-state-file> node scripts/e2e-browser-profile-reset.mjs --verify
# In the Client: set Profile back to default.
BH_E2E_ORIGIN=<local-origin> BH_E2E_HOME=<isolated-home> BH_E2E_STATE=<private-state-file> node scripts/e2e-browser-profile-reset.mjs --verify-return
```

Use `--verify --before` on the baseline to assert the original failure. `BH_E2E_RESULT` optionally writes a public-safe result file. State and authentication stay outside the repository. The harness exercises Host APIs and native tools; the Profile and Pause interactions above were performed through the real Client using Codex browser controls, not mocked UI or harness-only profile changes.

## Validation

- Published Host service regression failed on the baseline: old focused tab and Pause remained after reset through the service consumed by Core.
- Focused Browser tests: **37 passed** after the fix.
- Full suite: **179 files passed, 1 skipped; 1442 tests passed, 1 skipped**. The skipped test is not counted as a pass.
- Lint, formatting, typecheck, bilingual release ledgers and build passed.
- Baseline runtime reproduced the refused open; fixed runtime completed the named-profile task, preserved peer ownership and Access continuity, and passed the native default-return check.
