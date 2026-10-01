# Browser observation + Human Pause acceptance (#461)

These are actual Client and managed Bot Browser captures from an isolated pinned DSH
`0.2.0-rc.1` Host, with Computer Access off and Browser Access on.
All page content is synthetic. No credentials, session IDs, or raw private logs are published.

## Evidence

| File                    | Observable state                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `before-human-edit.png` | 1280 × 720 Client, paused, original item, live preview still available.                                               |
| `paused-human-edit.png` | Same viewport/theme/locale, still paused, original owned tab now shows the Human-updated item and zero confirmations. |
| `after-resume.png`      | Same Client, resumed; actual model reply and live frame show the updated item confirmed exactly once.                 |
| `browser-completed.jpg` | Final authenticated frame from the managed Bot Browser, showing the actual confirmation.                              |
| `results.json`          | Public assertions from the real Host verification script.                                                             |

The screenshot sequence demonstrates the Human workflow; it is **not a base-vs-PR visual
comparison** of the concurrent screenshot defect. No Client layout was changed. The old
behavior returned a pending image after Pause (including Pause → Resume); deterministic
capture-boundary tests failed twice on the base implementation. The new guards also cover
queue admission and native attachment processing, with one final error Audit entry.

## Verified boundaries

- A real model opened and observed the page, then returned a native image attachment.
  The canonical attachment bytes, hash, size, and dimensions were checked. Session events
  contained no raw base64; the unauthenticated frame route returned 401.
- Client Pause refused model-facing screenshots and clicks. Authenticated Human frames and
  read-only `browser_observe` remained available. The current tab was retained.
- Human UI changed the synthetic item while paused. After Client Resume, the old opaque
  ref was refused before any confirmation. The real model re-observed, confirmed the updated
  item once, took another screenshot, and sent a reply. Browser Audit was attributed to the
  correct Bot/Session and contained neither page contents nor images/attachment hashes.
- **Human input surface limitation:** macOS CUA could not target the managed Chrome process
  separately from the other Chrome instance. Human typing and clicking used a separate CUA
  view of the same synthetic fixture. Its shared server state updated the original owned
  Bot tab. Client Open Browser was exercised; the authenticated Open route returned the
  original target ID and retained the Bot's current tab. Direct typing in that revealed
  native window remains a Human QA check. This does not claim that CUA typed into that window.
- The live model route supported images (`readableModelFallback: false` denotes this branch).
  The negative route uses the **installed native MCP implementation** with stubbed text-only
  model metadata in `browser-tools.test.ts`; it yields a readable fallback and no image
  attachment save. A second live text-only provider was not exercised.
- Capture/attachment operations already issued are awaited. Rejected images are not returned
  to the caller, but the guards do not undo already completed file or attachment writes.

## Reproduce

1. Build the checkout and start an isolated instance with `scripts/dev-instance.mjs`.
   Use its private login URL; keep credentials and cookie files local.
2. Add `scripts/fixtures/browser-queue-qa.mjs` as a Patch insertion in that isolated Profile,
   then restart the same instance. This existing QA adapter executes the registered native
   tool definitions in the actual Bot Session; it is not part of the shipped Bundle.
3. Start a fresh synthetic fixture: `node scripts/e2e-browser-observation.mjs --serve`.
   Set `BH_E2E_FIXTURE_PORT` when using a different loopback port.
4. Set `BH_E2E_HOME`, `BH_E2E_ORIGIN`, and a private `BH_E2E_STATE` path. Run the script
   with `--prepare`; approve the first Browser action in the Client, then run `--ready`.
5. Open Observation QA in Bot mode and its Browser section. Click Pause Bot, then run
   `--paused`. The screenshot and click refusals are checked against the real registered tools.
6. Click Open Browser. In the synthetic page, change Human edit to `Updated by Human` and
   click Apply Human edit. Verify the original live preview updates while still paused.
7. Click Resume. Set `BH_E2E_RESULTS` to a public-safe result JSON path (and optionally
   `BH_E2E_SCREENSHOT` to a JPEG path), then run `--resume`. It checks the stale-ref refusal,
   actual model tool order, exactly one confirmation, attachments, retained tab, and redacted Audit.
8. For deterministic races and text-only fallback, run
   `pnpm exec vitest run packages/browser/test/browser-tools.test.ts`.

Use a fresh fixture and Profile for a complete rerun: the fixture counter intentionally has
no reset endpoint. The delivered Human QA instance is preserved at `http://127.0.0.1:3127/`,
with Observation QA selected and the completed page available.
