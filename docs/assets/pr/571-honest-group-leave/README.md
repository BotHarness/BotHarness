# Group departure outcomes — issue #571

Real DSH `0.2.0-rc.1` / DeepSeek model verification, with separate synthetic Profiles and the native Bot-mode Client (Chinese, dark, 1440 × 1200). Baseline: the approved #617 implementation at `d7237b639f23de0b4b7db6e58bfd81b1a9d4f663`, now merged into main as `837a03cbc0599b49184829c4e4cb83f7beda0194`. Candidate: this PR. No private user content, credentials, raw Session logs or Host paths are published.

## Reproduction

1. Start a fresh isolated Profile with the repository's `scripts/dev-instance.mjs`, using its pinned CLI, authenticated API and shared machine-local model credential.
2. Create two synthetic PersonaBots. In the first Bot's Human DM, ask the real model to call `group_create` and `group_invite_bot`. Confirm that the canonical Group records that Bot as creator and that the invited peer has accepted under the default auto-accept policy.
3. Set the creator's Group attention to silent and the peer's to all. Send a synthetic ordinary Group message, leaving a pending admission for the creator.
4. From the creator's Human DM, ask it to execute `group_leave` against the joined Group, repeat that same ID, then test its own Human DM, a missing ID and a Group it has not joined. Ask it to try `channel_read` and `channel_send` against the departed Group, then report actual Tool results through the still-accessible Human DM.
5. Inspect actual DSH Session Tool calls/results, canonical Group membership, placements and Inbox Admissions. Wait for the remaining peer's departure admission to become handled. Open the native Group and its departure receipt.
6. Ask the same model for a shorter report based only on the already completed Tool results, without repeating departure. The report screenshots show that real `channel_send` result; neither screenshots nor DOM content are fabricated.

## Results

| Check                                               | Baseline                               | Candidate                                               |
| --------------------------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| Real model creates Group and invites peer           | PASS                                   | PASS                                                    |
| First departure commits one notice                  | `left:true`                            | `left:true,outcome:changed`                             |
| Repeated departure produces no new notice/admission | `left:false`                           | `left:false,outcome:unchanged,reason:not-member`        |
| Human DM target                                     | Ambiguous `left:false` success         | Native Tool failure: `group_leave: group-required`      |
| Missing target                                      | Ambiguous `left:false` success         | Native Tool failure: `group_leave: channel-unavailable` |
| Existing Group with no current membership           | `left:false`                           | `unchanged/not-member`; no hidden name or roster        |
| Creator-to-Human handoff; peer remains              | PASS                                   | PASS                                                    |
| Creator's pending Group admission revoked           | handled / Group membership revoked     | handled / Group membership revoked                      |
| Departure admission                                 | One peer, handled; none for leaver     | One peer, handled; none for leaver                      |
| Read/send authority after leave                     | Both rejected; no unauthorized message | Both rejected; no unauthorized message                  |
| Shell or Assignment used                            | No                                     | No                                                      |

The baseline model also distinguished the first departure from a repeat; the fix supplies an explicit stable outcome and correct native failures for invalid targets. Screenshots alone are not the authority: the sanitized proof JSON records actual Tool results and native error flags, with canonical membership and admission evidence.

## Compatibility and cost

`channelId` and `left` remain in Tool success results. The application-defined Core return shape stays `{channelId,left}`. Missing/non-Group targets now throw instead of returning an ambiguous success; callers must handle these failures. Canonical departure transactions, source history, wake policies, notification retries and `inbox_ignore`'s final throw are unchanged.

Measurements are UTF-16 characters from real compiled DSH metadata, not token counts. Parameter schema: 123 before and after. Complete Tool metadata: 284 → 457. First success: 60 → 79; repeat: 61 → 104. Invalid-target errors are 34 and 39 characters. This is an explicit-outcome improvement, not a claim of lower total token usage.

## Validation

- Focused production Host + compiled Tool regressions: 19 passed, including duplicate leave, missing/DM/nonmember targets, authority revocation, creator handoff, no duplicate notice/admission, pre-commit exceptions and post-commit publication warnings. Existing self-leave/restart and explicit-ignore regressions pass.
- Full suite: 1,556 passed, one existing skipped test (193 passing files, one skipped; 198.15 seconds, two workers). Skip is not a pass.
- Lint, source policy, formatting, typecheck, build, bilingual release ledgers and Skill ledger checks: PASS. Existing unrelated lint/build warnings remain.
- Public docs: 262 pages built; Chinese OG subset unchanged at 100,444 bytes / 271 glyphs / 168 Han.
- Real model calls, exact canonical departure/admission checks and native Client screenshots: PASS.

One initial new regression sampled a transient peer admission as pending after an awaited Tool call, although the Runtime had already advanced it to running. The final test asserts handled after `whenIdle`; no timeout or implementation assertion was weakened. One initial QA browser did not finish entering Bot mode; it was closed and the native UI was reopened successfully. No model actions or canonical departures were repeated to obtain screenshots.

Human QA remains pending; this PR is a draft and has not been merged.
