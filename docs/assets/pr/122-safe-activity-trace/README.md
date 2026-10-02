# #122 — bounded current-activity trace

Real isolated DSH 0.2.0 RC1, actual DeepSeek V4 Pro/off, production Orchestrator Session and registered Browser/Shell tools. No Activity state or model reply was mocked.

## Matched visual comparison

`light-before-expanded.png` and `light-after-expanded.png` use the same pending Bot (`Activity trace QA light`), same transcript, language, light theme, 1500 × 1180 viewport and expanded composer disclosure. `narrow-before.png` and `narrow-after.png` repeat this at 420 × 860. The Before runs the actually compiled Client from PR #710 (`c9946657`) against the same compatible final Host; it naturally ignores the optional trace. The After runs this PR's Client against that exact Host and pending approval. Native transcript content shifts vertically to accommodate the taller expanded panel.

The default folded header remains transparent. The expanded panel stays inset, rounded and narrower than the Channel body. Four real observations appear in order: thinking → Browser tabs list → thinking → Shell execution. The trace holds at most eight distinct safe aggregate transitions for the current non-idle episode. It is not Session history or tool arguments/results/reasoning.

## Actual execution and refresh

- Browser tabs list was approved once and completed through its registered Provider.
- A distinct native Shell approval pauses a harmless Node two-second timer. This separates approvals reliably across Tool categories.
- `trace-proof.json` records the allowlisted Host entries and corresponding rendered rows; a page reload preserved the same current entries.
- The dark run approved the Shell once, received the actual Bot reply `Safe tool activity confirmed`, then observed idle with neither current Tool Activity nor trace. Another page reload stayed idle. See `dark-proof.json` and `completed-idle.png`.
- The light run intentionally leaves the Shell approval pending for Human QA. See `light-proof.json`.
- Pinned/Rail avatar summaries agree with the composer, and the 420px panel wraps without horizontal overflow. Reduced motion remains honored.

Evidence contains only synthetic Bot names, safe Activity fields, layout measurements and native event type/time/tool-name metadata. Machine-local working-directory text was redacted before screenshot capture. No credentials, auth cookies, Session IDs, raw tool arguments/results or reasoning are included in the JSON evidence. The visible native approval card and synthetic reproduction prompt retain their existing tool-detail contract; the Activity panel does not copy them.

## Host authority and recovery

The existing Host Activity Projection owns the process-local bounded trace, including timestamps and revisions. Existing authenticated snapshot/SSE and Cordis notifications carry it. Idle clears it; restart creates a fresh complete current baseline. A multi-Bot rebuild commits all baselines before any publication and advances revision even when recovered current rows are unchanged. Focused tests cover bounded eviction, duplicates, poisoning, stale revisions, idle/reset, safe escaped UI and atomic multi-Bot rebuilds.

Authorized opaque full-tool detail remains later #122 scope; this slice does not implement #123/#124 or a durable history store.
