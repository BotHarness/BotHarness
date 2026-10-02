# #122 / #712 — latest safe Activity inside each Session block

Human feedback replaces the former eight-observation Bot-level history with one current safe observation per active Session, rendered inside that Session's compact card. The expanded body does not repeat the Bot name. Multiple same-role Sessions stay separate; multi-Bot groups use a small ownership avatar, without another visible Bot title. Default folded transparent header and inset rounded body remain unchanged.

## Real comparable screenshots

The 1500 × 1180 light Before/After and 420 × 860 narrow pair use the same actual pending Bot, Session, approval, transcript, language and final compatible Host. Before is the actually compiled prior Client (`921f4120`); After is the revised Client. The new Host does not recreate the rejected historical trace for the old Client, which naturally shows its aggregate role/count row and duplicate Bot heading. The pair demonstrates relocation into the Session block and removal of that heading; regression tests and current snapshots prove no historical trace is retained. Machine-local QA working-directory text is redacted before capture.

## Actual execution and recovery

Isolated DSH 0.2.0 RC1, actual DeepSeek V4 Pro/off and production Orchestrator. Approved Browser tabs list completed, then the separate native Shell approval paused a harmless two-second Node timer. The latest Session card shows only the current Shell activity. Refresh/reopen preserves the same opaque display key, timestamp, revision and safe summary. A dark run approved the timer, received the actual `Safe tool activity confirmed` Bot reply, and reached idle with no current Session rows or composer Activity panel, including after refresh. The light fixture leaves that timer approval pending for Human QA.

`session-proof.json` pairs the allowlisted Host Session observations with rendered cards. `dark-proof.json` records actual call/result/turn-end metadata and idle snapshots; `light-proof.json` preserves the pending state. Pinned/Rail summaries, reduced motion and narrow layout also pass.

## Boundary

The existing Host Activity Projection owns the current Session observations and atomic multi-Bot rebuild. Existing authenticated snapshot/SSE and Cordis notifications carry optional current rows. Display IDs are random process-local keys and do not expose native Session IDs or authorize full tool-detail lookup. Done/disposed Sessions disappear; no eight-item history, Session transcript, arguments/results, reasoning, auth cookies or credentials enter these JSON proofs. Native approval cards retain their existing detail contract. Full authorized opaque detail remains later #122 scope; #123/#124/#505 remain deferred.
