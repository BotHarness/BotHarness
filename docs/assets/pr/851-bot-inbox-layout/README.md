# Bot Inbox sidebar layout E2E

Issue #851, using the real installed DSH 0.2.0-rc.1 Client and canonical QA data from #194 / PR #849.

- Before: main `58de22c1228b00691f388edfd875e5f0859b44c8`.
- After: the Client layout in this PR, with the same Profile, Bot, source records and UI state.
- Viewport: 520 × 827; sidebar: 320px. Sidebar screenshots directly capture x=200, y=0, width=320, height=650. The narrow shell opens the native sidebar overlay.
- Locale: English; light/dark pairs captured through native Appearance settings. Relative timestamps advance during verification.
- Only synthetic QA content is shown. Images are direct captures without editing; the sidebar crop excludes local workspace paths in the unrelated expired approval card.

## Human path

1. Open the QA Bot's DM and expand its Channel sidebar → Bot Inbox.
2. Read the full-width summary, source/report metadata, and separate Needs repair/time line.
3. Collapse/reopen the source group and expand Handled or ignored history.
4. Click `OBSERVED_REPORT: Research remains available.` → native Assignment Session; `source-session.jpg` shows its actual response.
5. Return to the Bot and reopen Inbox: both active items still need repair.

`source-proof.json` records authenticated Host/native Session checks after navigation: the same progress Report and its observation timestamp survive, with one exposure, two Orchestrator turns and one Assignment turn; no consumption, new run or automatic replay occurred. The read-only verification reuses PR #849's observed-restart driver; #851 adds no Host behavior.

Client regressions cover source navigation, readable roster names for DM sources, unavailable source, active-group auto-expansion and external-source reopening races. Real narrow-shell measurement confirmed no sidebar or summary horizontal overflow in either theme.
