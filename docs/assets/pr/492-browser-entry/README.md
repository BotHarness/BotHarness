# Original Browser entry acceptance (#492)

These are unedited CUA captures of the real DSH Client with an isolated Host, the
managed installed Chrome, native Browser Tools and real DeepSeek DM turns.
Only synthetic loopback pages and task values are used. No mock observation or
manually drawn frame is substituted. The loopback fixture records the completed
Bot task; `complete.json` contains the asserted receipt and separately observed
Client checks.

## Reproduce

1. Build this revision and launch an isolated Profile with `scripts/dev-instance.mjs`.
   Enable `botharness-browser` with `headless: false`, `autoAllowActions: false` and
   an idle timeout long enough for Human QA. Preserve the private launcher output
   and login cookie; do not commit them. Finish builds before starting UI verification.
2. Run `node scripts/e2e-browser-entry.mjs --serve` (loopback port 32021 by default).
   For subsequent modes set `BH_E2E_HOME`, `BH_E2E_ORIGIN`, `BH_E2E_STATE` and, if
   changed, `BH_E2E_FIXTURE_PORT`. The state file stays private, outside the repository.
3. Run `--prepare`, select **Browser entry QA** in Bot mode, verify Access off
   disables expansion and leaves the switch visible. Enable Access in the header;
   it must expand immediately. Turning it off while idle collapses and locks it.
4. Run `--ready`, approve only the displayed synthetic `browser_open` once in the
   DM, and let the real model finish. The Bot owns home/work; work is current.
   Capture the entry in light and dark themes with Follow on. Current work appears
   first; both title and URL are visible without hovering, with no extra status hints.
5. Run `--select-home`. With Follow on, the frame must change to home. Turn Follow
   off without clicking a row, then run `--open-new`. The model opens next as its
   current work; the Client must retain the home frame. Current next is pinned first.
6. Click work and then home in the Client list. Follow remains off and each frame
   changes; Provider current stays next. Run `--preview-task`: the real model types
   CURRENT-NEXT and clicks Complete task on next while Human preview remains home.
   The server must receive exactly `{page: "next", token: "CURRENT-NEXT"}` once.
7. Re-enable Follow: the frame must show next with Completed: 1. Pause and Resume
   through the entry, verifying the button and Host state change. Record each Client
   assertion from CUA in `BH_E2E_UI_RESULTS`; do not infer it from Host-only results.
   Run `--complete` with that file and `BH_E2E_RESULTS` to assert and save the report.

`--restore` restores a two-tab home/work capture state after a Host restart or a
setup cancellation. Close only disposable next targets first if repeating this run.
The completed QA profile is retained for Human acceptance; do not stop other runs.

## Evidence

Baseline: main `0ada01e2c74dd8f5f04d54c53247b37d967dccd6` before edits.
Before/after pairs match 1280 × 720, English shell, theme, Bot and the two owned
home/work pages with current work and Follow on. A Host restart recreated target
IDs and the center DM shows setup progression; the reviewed view is the Browser
entry on the right. Before header: Access enabled but still collapsed. After:
enabling expands. Light/dark pairs show visible URLs and pinned current work.

- `before-header.png` / `after-header.png`: automatic expansion.
- `before-light.png` / `after-light.png`: current-first title/URL rows.
- `before-dark.png` / `after-dark.png`: same view in dark theme.
- `after-off.png`: switch remains visible; expansion disabled while off.
- `follow-select.png`: Follow tracks a real model selection of home.
- `follow-off.png`: real model opens next; Human frame remains home.
- `click-preview.png`: Human previews work while next stays current.
- `task-preview.png`: Human previews home while the model completes next once.
- `follow-task.png`: Follow returns to the completed current next page.
- `pause.png`: the separate Pause command changes to Resume.

The final report is model/native functional evidence plus recorded real Client
observations. Optional native Browser test skips are not counted as passes.
Local full-suite timeout evidence is retained privately and reported in the PR;
it is not treated as a Browser regression or silently reclassified as fixed.
