# Shared Container Viewer — issue #736

Issue: https://github.com/BotHarness/BotHarness/issues/736

Agent task: `codex/local/01a0f25f-2150-75e3-8895-23d35394b8d8`

Claim: https://github.com/BotHarness/BotHarness/issues/736#issuecomment-5965176982

## Capture conditions

Captured through the real authenticated DSH Client on 2026-10-03 (Asia/Tokyo), using native browser input and unmodified browser screenshots. The isolated QA Profile uses a synthetic PersonaBot, a Docker Browser and a Docker Computer. No personal desktop content or credentials are included.

- Before: `97f5941a61527ffb12f417321c72f6c32e80c0f1`, the UI revision merged as PR #735 (`aab3239e1fb8cc2c68594e921a7fcd3d06c713fb`).
- After: `964a1389b4721d544569a345d830fa6661366abb`.
- Native viewport: 610 × 827; light theme; English locale; Browser profile `default`.
- Docked screenshots use the same 320 × 827 sidebar clip (x=290, y=0) to exclude unrelated chat messages. Fullscreen screenshots include the complete 610 × 827 viewport.
- Browser pairs show `about:blank`, Bot paused (`Resume` visible), Human input disabled. Before is the existing Modal and snapshot entry; After is the shared fullscreen and live docked stream.
- Computer pairs show the same empty XFCE desktop, input disabled; the desktop clock naturally differs between captures. The shared fullscreen header also fixes the narrow sidebar toggle obscuring the collapse control.

## Before / After files

| View                       | Before                                                           | After                                                          |
| -------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| Browser docked entry       | [browser-docked-before.jpg](browser-docked-before.jpg)           | [browser-docked-after.jpg](browser-docked-after.jpg)           |
| Browser fullscreen         | [browser-fullscreen-before.jpg](browser-fullscreen-before.jpg)   | [browser-fullscreen-after.jpg](browser-fullscreen-after.jpg)   |
| Docker Computer docked     | [computer-docked-before.jpg](computer-docked-before.jpg)         | [computer-docked-after.jpg](computer-docked-after.jpg)         |
| Docker Computer fullscreen | [computer-fullscreen-before.jpg](computer-fullscreen-before.jpg) | [computer-fullscreen-after.jpg](computer-fullscreen-after.jpg) |

## Real runtime interaction

Browser (synthetic fixture `scripts/e2e-browser-container-fixture.py` on container loopback):

1. Open the Container Browser Viewer and enable interaction. The Host acknowledges Browser Pause before Human input becomes enabled; `Resume` is visible.
2. Navigate in the actual Chrome address bar to the fixture `/page`.
3. Type `viewer qa` through native individual key events into Search — [input screenshot](browser-interaction-form.jpg).
4. Click Search — [results screenshot](browser-search-result.jpg), address `/results?q=viewer+qa`.
5. Click the first result — [result screenshot](browser-takeover-result.jpg), title `Aurora field notes`, marker `INTERACTION-FIRST-RESULT`.
6. Independently read the fixture counter from inside the Browser container: `queries: ["viewer qa"]`, `firstResultOpens: 1` on the final source revision.
7. Disable interaction — [watch-only result screenshot](browser-watch-only-result.jpg). Collapse restores focus to `Open fullscreen`, unlocks body scrolling, and leaves Pause active. The iframe is inert with pointer events disabled.
8. Use Enter to open and collapse fullscreen; focus returns to `Open fullscreen` after the animation frame.

Docker Computer:

1. Select Docker Computer for the synthetic QA Bot, open Computer and authorize its real container startup.
2. Use Enter on `Open fullscreen`, enable input and click the XFCE Terminal icon.
3. Type `echo viewer-computer-qa` through native key events and press Return — [actual output screenshot](computer-interaction-result.jpg).
4. Stop input, click Leave fullscreen and verify focus returns to `Open fullscreen` and body scrolling is restored.
5. Close the task-created terminal and return to the read-only desktop for the matched screenshots.

These screenshots prove Human keyboard/mouse interaction through the streamed Viewer. They do not claim a new autonomous Bot tool capability; Browser and Computer continue to use their existing Host adapters and authorization.

## Validation

- Full local regression: 2,089 passed, 3 skipped (253 test files).
- Final focused Browser/Computer/Channel sidebar regressions after the overlay stacking adjustment: 49 passed.
- Build, lint, formatting, type checks, bilingual changelog checks and documentation build passed; docs generated 284 pages.
- Independent Spec and Standards reviews: zero remaining findings.
- Human QA remains pending; PR creation is the handoff, not merge approval.
