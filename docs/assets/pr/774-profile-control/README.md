# #774 — Daily Chrome Profile control evidence

Implementation revision: `2c7246af5775b895ce725486586684b6ca91fdb9`.
Baseline entry revision: `904d279b6360226b10bd35ab82aaddf376ac5b1e`.
Runtime: DSH `0.2.0-rc.1`, Chrome for Testing `153.0.8010.36`, Profile Control extension `0.1.2`, actual PersonaBot using `deepseek-official/deepseek-flash`.

All browser content is a synthetic, loopback-only fixture. Personal Chrome was not used. Screenshots came from native Chrome or the real DSH Client via Codex computer use; no mocked UI or injected screenshot state. Computer Access stayed off. The isolated Chrome debug port and accessibility flag were QA tooling only; installation and the product bridge require neither flag.

## Captured states

- `before-entry.jpg`: prior single-document entry, before implementation. This is the entry-point baseline for the new Profile-wide surface, not an already-paired Profile.
- `after-entry.jpg`: paired Profile, four ordinary tabs, explicit scope, Forget and Pause. Both entry images use English, light theme and a 320 × 827 sidebar crop from a 610 × 827 viewport.
- `after-entry-dark.jpg`: same Profile surface in native DSH dark theme.
- `target-menu.jpg`: real target selector with the separate Entire Profile choice; existing single-document mode remains available.
- `paused.jpg`: real paused state with Resume.
- `resumed.png`: final native Chrome page showing `Saved: RESUMED-774` after Human editing during Pause, reconnect, new Session approval, Resume and fresh observation.

## Functional results

`browser-tool-trace.json` contains only selected Browser calls and their original text results, preserving event sequence and timestamp. It excludes system prompts, credentials, private paths and unrelated tools. It is an extract, not a rewritten model report.

| Case                                      | Runtime proof                                                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Navigate and reload without pairing again | Turn 6: existing signed-in tab navigates and reloads; an old ref is refused before a fresh observation.                                                                                    |
| Human opens another ordinary tab          | Turn 8 lists `/third`, opened through native Chrome UI.                                                                                                                                    |
| Cross-tab input and save                  | Turn 10: existing `/account` saves `PROFILE-A-774`, another existing tab navigates to `/second` and saves `PROFILE-B-774`; observe → type → observe → click → observe succeeds throughout. |
| Pause refuses mutation                    | Turns 7 and 11: `MUST-NOT-WRITE-774` is refused with Browser Pause active.                                                                                                                 |
| Human edit → Resume → save                | Turn 13: observes the actual Human-edited value beginning `HUMAN-FINAL-PAUSED-774`, writes with fresh refs and confirms `Saved: RESUMED-774`.                                              |
| Access off                                | Turn 14: Browser tools disappear from the real Bot tool set; no Browser call or alternative control is executed. See `access-off-report.json`.                                             |
| Independent save verification             | `fixture-readback.json` comes directly from the fixture server, not the Bot: final records include A, B and RESUMED.                                                                       |
| Durable pairing, transient approval       | Owned Host/Chrome restarts retained pairing. A fresh extension connection invalidated refs and requested a new native Session approval. Pause remained visible across reconnect.           |

Earlier QA exposed background native-click delivery, delayed blur-change ref invalidation and missing injection results. These were corrected and regression-tested before the final successful turns 10/13. Turn 8 retains an earlier refusal in the extract rather than hiding it. A later QA prompt initially selected the wrong Human-edited tab and stopped without writing; the final native edit and turn 13 use `/second`. Intermediate runs are not presented as passes.

## Reproduce

1. Start the pinned isolated DSH instance following `docs/client-bridge.md` §7, using this revision.
2. Run `BH_E2E_FIXTURE_PORT=32022 python3 scripts/e2e-daily-control-fixture.py`.
3. Use a disposable Chrome Profile. Visit the fixture `/signin` and open `/account` and `/second` there.
4. Load `packages/browser/profile-extension` unpacked. Choose **Daily Chrome · Entire Profile** in Bot settings; enable Browser Access for one QA Bot. Generate the pairing code and explicitly accept Profile-wide scope in the extension popup.
5. Ask that real Bot to select each existing tab, observe, type a distinct note, observe again, click Save note and observe the saved status. Approve the initial Session request. Check the independent `/state` response.
6. Navigate/reload, then attempt an old ref; open a new tab yourself. No additional pairing should be needed, and the old ref must fail.
7. Pause in the Browser entry. Ask for a mutation and verify refusal. Edit the fixture field yourself; Resume, freshly observe, type and save. Restart the extension while paused to check retained pairing/Pause and invalidated live authorization.
8. Turn Browser Access off and ask for observation: Browser tools must be unavailable. Do not use Computer or another Browser target to bypass it.

## Automated validation

At the implementation revision, the full suite passed: **276 files, 2,213 tests; 3 files/tests skipped**. Lint/source policy, format, typecheck, build, Release Ledger, Skill Ledger and ADR uniqueness checks passed. Earlier unrelated suite timeouts were rerun unchanged; the final full suite passed. Independent specification review found no actionable issues; standards review found zero hard violations and zero smells.

This slice exposes five Browser tools: tabs list/select, open, observe, type and click. It does not claim full Local/Container Browser parity, screenshot/key/scroll/upload support, tab creation/closing, subframe control or Context Sharing.
