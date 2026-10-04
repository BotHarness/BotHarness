# Assignment concurrency Settings — #825

Real isolated DSH `0.2.0-rc.1`, built BotHarness Bundle, native Settings and Config Editor, and a live `deepseek-official/deepseek-flash` model. Screenshots are unmodified browser captures at 1500 × 1000, Chinese locale. The implementation was `6511c1c9`; the final evidence commit also integrates the architecture explanation.

## Evidence

| Capture                     | Observable behavior                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `before.png`                | Prior #821 Bot Settings had no concurrency control; the baseline uses its own QA workspace.                                                                   |
| `after-default.png`         | A Profile without the field exposes default 3 in the same native Settings section.                                                                            |
| `after-raised-two.png`      | Saving 2 confirms the Host value and permits resuming the original waiting Assignment.                                                                        |
| `after-lowered-one.png`     | Saving 1 while two Assignments are working does not cancel either one.                                                                                        |
| `capacity-refused.png`      | At limit 1, a real addressed wake is refused while another Assignment is working.                                                                             |
| `after-restart.png`         | A new Host process and a fresh browser retain saved value 1 in the same Profile.                                                                              |
| `cold-restart-capacity.png` | After restart, native creation of a second Assignment returns `assignment-capacity`, `activeCount=1`, `limit=1`.                                              |
| `invalid-value.png`         | Fractional input has destructive validation feedback.                                                                                                         |
| `failed-save.png`           | A controlled browser transport failure of `/api/settings/mutate` leaves draft 2 visibly uncommitted; a separate native Settings query confirms saved value 1. |
| `after-dark.png`            | The same control in dark theme.                                                                                                                               |

`e2e-results.json` contains allowlisted native Tool results and checked state facts, rather than relying on the model's summary. The refused wake preserved the complete Assignment snapshot, including its open ask. Raising the limit resumed the same canonical Session. Its subsequent report completed, with access and model snapshots unchanged. B and the cold-restart test slot were stopped through `stop_assignment`; no QA Assignment is left working or stopping. Shell approvals used the normal allow-once path and were not disabled.

Unauthenticated native mutation returned HTTP 401. Authenticated native mutations of 0, 33 and 1.5 returned `settings/rejected`; saved value remained 1. A transport failure is deliberate browser fault injection, not a claim that the Host failed during ordinary saving.

## Repeat through the real UI

1. Build and launch an isolated Profile with `scripts/dev-instance.mjs`; use a real provider and grant a temporary QA workspace to a test Bot.
2. Open global Settings → Bot Settings. On an older/new Profile, verify 3. Save 1; reopen Settings in another client and verify 1. Invalid 0, 33 or 1.5 must not commit.
3. Ask the Orchestrator to create A, report `waiting-human` with an ask, then finish its turn. Create B with a temporary workspace wait command so it remains working; use normal Human approvals.
4. Ask the Orchestrator to answer A using `send_assignment_request` with the original `answer_to`. At limit 1 it must refuse, report the current limit, and preserve A's ask and access/model facts.
5. Save 2 and retry the same request. A must use the original Session and become working. Keep it working briefly with a second temporary wait command.
6. Save 1 while A and B are working. Both stay working; a new create or idle wake is refused with `activeCount=2`, `limit=1`.
7. Release the QA wait commands. Verify A's completed report in its original Session, then stop any remaining QA work. Restart only this isolated Host, retaining its Profile. Settings must remain 1; hold one new Assignment and confirm a second creation is refused at limit 1. Stop the test slot.

Saving affects subsequent admission, including cross-Bot use. Unit coverage separately exercises live readers, shared admission paths, keyed reuse, cold wake, validation, non-writable/unavailable settings, pending save deduplication and failure/retry behavior. This slice depends on #811; it does not implement #812's answer-delivery settlement change.

Validation: 2376 tests passed, 9 skipped; final focused suite 88 passed. Lint/source policy, formatting, typecheck, build, bilingual release ledger and docs build (314 pages) passed. Standards review's living-architecture omission was corrected in both languages; specification review passed. Human QA remains pending.
