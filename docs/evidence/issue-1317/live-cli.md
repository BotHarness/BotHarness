# Live CLI qualification — 2026-10-10

Issues: [#1317](https://github.com/BotHarness/DeepSeekBot/issues/1317), [#1347](https://github.com/BotHarness/DeepSeekBot/issues/1347). Base: `73010466`. Task: `codex/local/01a12624-8e95-7fc2-b1de-e65a1d1a01db`.

Qualification used a dedicated Windows Profile, the pinned DSH `0.2.0-rc.1` launcher and a QA PersonaBot. A real `deepseek-official/deepseek-flash` route with low reasoning effort replied through `channel_send`. Tokens, credentials, private launch files, absolute machine paths and raw logs are excluded from this report.

| Path                         | Observed result                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real DM                      | `CLI_P2_REAL_OK` committed and returned as JSON for its exact Human request; default `human-UUID` IDs also worked.                                                                          |
| Formal question              | Native `ask_user_question` created Blue/Green options; status pending, CLI answered Blue once, duplicate answer returned `invalid-input`, and the resumed receipt returned `QA_COLOR_Blue`. |
| Tool refusal                 | Native bash requested approval for a bounded PowerShell date read; reject accepted once, competing allow refused with `invalid-input`, and the Bot returned `QA_TOOL_REJECTED`.             |
| Tool allow                   | A separate bounded `Write-Output QA_APPROVED_EXECUTION` request was allowed once, executed, and returned that actual output; competing reject refused.                                      |
| Release and grants           | Release lifecycle read returned successfully. Workspace options and grant creation used the existing Host owners; the temporary QA grant was revoked afterwards.                            |
| Host down                    | Send returned `host-unreachable`; after stopping the owned Host, a read-only database check found zero Source Events for that attempted message ID.                                         |
| Token rotation               | After restarting the same Profile, the old token file returned `host-unauthorized` before RPC; the new invocation still read the original committed receipt.                                |
| Lease                        | Offline `list` while the Host ran returned `lease-unavailable`. Model-plan and a committed Memory write worked after stopping it.                                                           |
| Online fake credential edits | Put/list/unset of a fake multiline QA ref emitted names only. Native Host boot and subsequent real replies remained usable.                                                                 |

The public CLI executable ran 8 rounds, each followed by a fresh `send-status` invocation, between 14:41:29 and 14:45:27 UTC. All 8 passed exact reply and Source Event correlation; round duration was 2.398–6.242 seconds with 30-second gaps. This is a short soak, not a long-running reliability claim.

A zero-gap follow-up exposed premature return after the first Bot output while its request was still running. The next Human message could steer that turn and had no separately attributable reply. `send` now waits for handled processing before returning. Six immediate sequential rounds then passed, each retaining exact receipt correlation, between 14:51:53 and 14:52:29 UTC (5.345–7.348 seconds per round). Concurrent same-Bot requests still follow the existing Host delivery policy; the CLI refuses to substitute another request's output.

The real Client displayed the CLI conversation and answered question. One older T3 preview tab later stopped producing animation frames despite a visible shell, and its snapshot automation and frame-based startup observer timed out. A fresh native preview tab produced frames, mounted the Bot shell in 792 ms and had no console errors. Its Host diagnostic report later became stale, and preview navigation/status timed out during a follow-up; sustained Client observation is therefore not qualified by this run. Historical failures from controlled rebuilds/restarts remain retained; they are not silently overwritten with the fresh attempt's success.

Automated qualification: 47 original CLI tests; 18 credential regressions (including native-invalid records); 6 carrier/deadline tests; 1 durable reply-association test; 10 bridge/export tests; 14 question/approval/reply owner tests. Lint, format, typecheck, bilingual ledger checks and build passed. The two independent final review axes had zero remaining actionable findings after corrections.

Repeat from the repository root after creating and authorizing an isolated QA Bot:

```bash
pnpm build
node scripts/dev-instance.mjs --home <isolated-home> --port 31917 --json > <private-launch.json>
node scripts/e2e-cli-live.mjs --launch <private-launch.json> --bot <QA-bot-id> --rounds 8 --interval-seconds 30 --output <private-report.json>
node scripts/e2e-cli-live.mjs --launch <private-launch.json> --bot <QA-bot-id> --rounds 6 --interval-seconds 0 --output <private-report.json>
```

The launch file contains the authentication token and stays machine-local. The report contains only request/reply IDs, processing durations, completion and a bounded failure code. Approval/question qualification uses the commands and JSON stdin shape in the [CLI guide](../../bot-cli.md).
