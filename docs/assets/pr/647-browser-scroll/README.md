# Browser native scroll E2E — issue #647

These captures use the real Bot Browser runtime, an isolated DSH Host, the authenticated native Tool execution path, and the same local fixture on both builds.

- Before: main `ef076bca1b2db631ce0c211dd9345ad0a756555e`. The separate baseline checkout at `7c9f5c449598b0c48a9a8f73fea13e171d2811df` was verified to have an identical complete source tree.
- After: this PR's Browser runtime, with focus emulation followed by a pointer move and native wheel dispatch in the owned target's CDP session.
- Both page captures: 2400 × 1472, light theme, English fixture, same profile and fixture data. Client completion capture: 1280 × 720.
- `before-page.jpg` and `after-page.jpg` show the same nested fixture after down 2000, up 300, down 600 CSS-pixel requests. `completed-page.jpg` and `completed-client.png` show the final confirmation state.
- JPEGs are unchanged production observation frames; the PNG is an unchanged in-app browser screenshot.

| Observable result                           | Before    | After             |
| ------------------------------------------- | --------- | ----------------- |
| Document down / up position                 | 600 / 400 | 600 / 400         |
| Nested content down / up / down position    | 0 / 0 / 0 | 1112 / 812 / 1112 |
| Document position while nested pane scrolls | 0         | 0                 |
| Trusted wheel observed by page              | No        | Yes               |
| Confirmation revealed and clicked           | No        | Yes, exactly once |
| Current target retained / owned tabs        | Yes / 1   | Yes / 1           |
| Attributed successful scroll Audit attempts | 5         | 5                 |

The real model first opened and observed the fixture and replied with its title in the DM. The subsequent deterministic probe invokes registered Browser Tools through the live Agent's scoped `ctx.tools.execute` adapter. This proves Tool/runtime behavior, not autonomous model planning of the scroll sequence. No fixture code scrolls the pane or fabricates input events; it only observes movement and trusted wheel delivery, reveals a confirmation control at the bottom, and counts the resulting native click.

## Reproduce

Use a disposable isolated DSH Profile launched with `scripts/dev-instance.mjs`, the pinned CLI, a usable machine-local DeepSeek key, and the built Bundle. Add `scripts/fixtures/browser-queue-qa.mjs` as a native Patch insertion named `browser-queue-qa`. Enable `botharness-browser.autoAllowActions` only in this disposable QA Profile. The helper uses the launcher's private cookie file; keep credentials and its state checkpoint outside the repository.

1. Start `node scripts/e2e-browser-scroll.mjs --serve` on its dedicated loopback port 32010.
2. Set `BH_E2E_ORIGIN`, `BH_E2E_HOME`, and `BH_E2E_STATE` to that isolated Host and a private checkpoint path, then run `node scripts/e2e-browser-scroll.mjs --prepare`.
3. Set `BH_E2E_RESULTS`, optionally `BH_E2E_SCREENSHOT` and `BH_E2E_COMPLETED_SCREENSHOT`, then run `node scripts/e2e-browser-scroll.mjs --probe`. Add `--before` only when probing the verified baseline build.
4. Inspect the JSON positions and confirmation count, and open the Scroll QA DM's Browser panel. A completed probe refuses reuse before dispatching any input; use a fresh prepare for another disposable run.

The probe asserts page readiness, actual movement in fresh observations, trusted wheel delivery, the revealed control, exactly one confirmation, retained current target, and five successful Audit entries attributed to the Bot and Orchestrator Session. The committed JSON reports omit private identity and authentication data.

## Scope and validation

Wheel input targets the viewport center and may also cause hover behavior there. A page can cancel a wheel or have no scrollable content under that point; Tool success means input delivery, so the Bot must observe again to verify displacement. This slice adds no coordinate API or Client layout change.

A wheel-only implementation stalled in background managed Chrome during development; focus emulation and a pointer move before the wheel resolved it without activating an OS window. The final production sequence passed both document and nested-content E2E paths. CDP input coordinates and wheel deltas use CSS pixels: [official Input.dispatchMouseEvent reference](https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchMouseEvent).

Validation on the final implementation: lint, format check, typecheck, build, both release-ledger checks; full suite **1652 passed, 1 existing opt-in test skipped**. Focused Browser suite: **140 passed, 1 skipped**. New runtime regressions failed on the baseline and cover direction, session routing, center coordinates, native input order, focus setup reuse, unavailable viewport refusal, and transport failure.
