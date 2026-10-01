# Human-closed tab selection — #623

## Evidence

The baseline is `01b6dba47813ceb30f8096f0051fa2e4b7e90395` (merged #615).
The fixed build uses this PR's Browser Provider change. Both runs use the same
isolated DSH 0.2.0-rc.1 Profile, native Client, named Browser profile, and local fixture.
The Client captures are 1280 × 720, light theme, English shell, collapsed main
sidebar and 320 px Channel sidebar. DM setup replies differ between real model turns;
the fixture, Browser controls and pre-action confirmation count are identical.
All images are unmodified native captures with no credentials or personal data.

| Capture                | Observable result                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `before.jpg`           | After selecting the Human-closed candidate, the live original tab remains listed but is no longer current; Follow the Bot shows “No frame yet”. |
| `after.jpg`            | After the same failed selection, the original tab remains current and its preview is available; no page action has been taken.                  |
| `completed.jpg`        | The Client still previews that same original target after a successful Session Tool action.                                                     |
| `completed-native.jpg` | Chrome shows “Original work confirmed (1)” on the original fixture page; the closed candidate is absent.                                        |

The corresponding public JSON records assert the original/current target identity,
live tabs, preview availability and fixture counter. They exclude authentication,
DSH Session IDs, private state paths and model request details. Target IDs differ
between runs because each run opens fresh real Chrome targets.

## Reproduce

1. Install frozen dependencies and build this revision. Launch an isolated instance
   using `scripts/dev-instance.mjs`; retain its private login/cookie material locally.
2. In that isolated Profile only, enable Browser `autoAllowActions` for the disposable
   fixture and insert `scripts/fixtures/browser-queue-qa.mjs`. This existing opt-in QA
   adapter invokes native Session Tools through the owning Provider; it is not shipped
   in the production Bundle.
3. Run `node scripts/e2e-browser-closed-tab.mjs --serve` (fixture port 32006).
   Set `BH_E2E_ORIGIN`, `BH_E2E_HOME`, and a private `BH_E2E_STATE` path.
4. Run the helper with `--prepare`. A real Human DM/model turn opens and observes the
   original page. Native Session Tools open the candidate and reselect the original.
5. Open the Closed Tab QA DM in the real Client, expand Browser, preview “Closed
   candidate QA”, and use “Open Bot Browser”. Check Chrome's selected title and URL
   are the disposable `/candidate`, then close that tab with Chrome's native tab close
   button. Do not call the Provider's `browser_tabs close` operation: that would remove
   ownership and miss the regression.
6. Reload the Client and return to that DM/Browser so Follow the Bot follows its
   original current target. Run `--probe` (or `--probe --before` on the baseline).
   The fixed probe checks readable recovery guidance, retained current work/preview,
   and a repeated selection refusing the pruned candidate.
7. Capture the Client before further actions. Then run `--complete`; fresh native
   Session Tools observe, click and observe the original page. It must retain the
   exact original target and increment the fixture counter from 0 to 1. Capture the
   Client and use “Open Bot Browser” again to capture the readable native result.

`BH_E2E_RESULT` optionally saves each public result JSON. Completion requires a
successful fixed probe, and repeating completion refuses before a Browser mutation;
that guard was verified with the counter still 1. Real model setup is verified;
the failed selection and subsequent action are deterministic native Session Tool
calls, rather than a claim of autonomous model recovery.

## Checks

- Three new Provider regressions fail on the baseline and pass on this change;
  all 55 Provider tests pass.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm changelog:check` and
  `pnpm build` pass. Lint retains existing repository warnings.
- `pnpm test`: 194 files / 1581 tests pass; one opt-in Browser controls Chrome E2E
  is skipped by its existing environment gate. This PR's real Client/Host/Chrome
  path above is separately verified.
- No schema, permission, Client styling, API Gateway or Browser lifecycle changes.
