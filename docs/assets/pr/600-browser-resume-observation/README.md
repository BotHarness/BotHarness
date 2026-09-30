# Post-Resume Browser observation — #600

Baseline: `37abf58f5ebf6be042299a80a4fd7304298b3fa8` (merged #597).

Screenshots are actual DSH Client captures at **1280 × 720**, light theme, English shell, the same isolated Profile and QA Bot. The after transcript contains additional identical real-model setup turns; this setup history differs, while the browser state under comparison and viewport are matched. The fixture contains no real account, credentials or personal browsing data.

## Actual interaction and result

1. A real DeepSeek DM opens and observes `Original item` through the native Agent-scoped Tools Service.
2. Codex browser controls press the Client's **Pause Bot**; the local Human-controls page changes the fixture to `Updated by Human`; the Client's **Resume** releases Pause.
3. The QA Plugin invokes `browser_click` with the ref saved before Pause, without another observation.
4. Baseline: the stale-context click succeeds and the preview shows `Confirmed Updated by Human (1)`. See `before-sidebar.jpg` and `before-results.json`.
5. Fix: the same click is refused with `Browser Resume requires a fresh browser_observe of the current page before acting`; the fixture count stays zero and preview shows `Awaiting confirmation`. See `after-refusal-sidebar.jpg` and `after-refusal-results.json`.
6. Native `browser_observe` then reads `Updated by Human`; clicking the newly returned ref and observing again completes `Confirmed Updated by Human (1)`. The same current tab remains selected. See `after-completed-sidebar.jpg` and `after-completed-results.json`.

The script exercises owning Host APIs and native scoped tools; Pause, Human change and Resume were performed through actual UI controls, not simulated flags. The existing allowlisted QA Plugin is opt-in for this local verification Profile, never part of the product Bundle.

## Reproduce

Start an isolated instance with `scripts/dev-instance.mjs`, enable the local `scripts/fixtures/browser-queue-qa.mjs` Plugin, then:

```sh
node scripts/e2e-browser-resume-observation.mjs --serve
BH_E2E_ORIGIN=<local-origin> BH_E2E_HOME=<isolated-home> BH_E2E_STATE=<private-state-file> node scripts/e2e-browser-resume-observation.mjs --prepare
# Client: Pause Bot.
# Human-controls page at the fixture origin's /controls: Change item while Bot paused.
# Client: Resume.
BH_E2E_ORIGIN=<local-origin> BH_E2E_HOME=<isolated-home> BH_E2E_STATE=<private-state-file> node scripts/e2e-browser-resume-observation.mjs --verify --refusal-only
BH_E2E_ORIGIN=<local-origin> BH_E2E_HOME=<isolated-home> BH_E2E_STATE=<private-state-file> node scripts/e2e-browser-resume-observation.mjs --verify
```

Use `--verify --before` instead on the baseline. `BH_E2E_RESULT` writes an optional public-safe JSON result. Authentication and state stay in private local files outside the repository. Run `--prepare` to reset the fixture before repeating; each completed run must have exactly one confirmation.

## Validation and limits

- Initial baseline regression: **8 failed, 36 passed**, because page interactions were allowed after Resume; those strict assertions passed after the fix.
- Final focused Provider and published Host-service coverage: **48 passed**. Covers ref/coordinate clicks, typing, keys, scroll, upload, paused and in-flight reads, failed reads, Access cycling, recovery navigation and peer independence.
- Final full suite: **184 files passed, 1 skipped; 1485 tests passed, 1 skipped**. A skipped test is not a pass.
- Lint, format, typecheck, bilingual release ledgers and build passed.
- First final-build E2E completion assertion ran before the fixture's asynchronous request and DOM update had rendered its completion text. The harness now waits at most five seconds through native observations for that same exact text, without another click; the zero/one confirmation assertions remain strict. This is fixture synchronization, not a claim that a product defect was repaired by retrying.
- This enforces fresh observation after Pause/Resume. It does not cancel an interaction that already started before Pause, and does not add a general detector for every possible Human input outside Pause.
