# #194 Host recovery Notice acceptance

Claim: https://github.com/BotHarness/BotHarness/issues/194#issuecomment-5993628335

## Real runtime evidence

Baseline main `a4ca5258e3bdee5d86736ecf64a399730319d938` on isolated Profile port 3166; fixed slice on a different isolated Profile port 3167. Each uses actual official DeepSeek Flash/low requests, one owned Assignment, one successful progress Report and a harmless `sleep 1` native Shell call held at **ungranted** approval. Only the exact task-owned Host is abruptly killed. No timer approval or successful timer result exists, and no SQL or invented SessionEvents creates these states. The acceptance scripts use authenticated API/Session Persistence; their direct SQLite reads verify provenance only.

| Proof                                     | Assignment            | Report                             | System recovery Notice                | Orchestrator Turns     |
| ----------------------------------------- | --------------------- | ---------------------------------- | ------------------------------------- | ---------------------- |
| [Baseline active](baseline-active.json)   | Working, holds key    | Original progress Pending          | None                                  | 1                      |
| [Baseline restart](baseline-restart.json) | Error, key released   | Exact original Pending             | Missing (gap)                         | 1                      |
| [Fixed active](fixed-active.json)         | Working, holds key    | Original progress Pending          | None                                  | 1                      |
| [Recovered](recovered.json)               | Error, key released   | Original progress Handled          | One Handled Host recovery Notice      | 2, one acknowledgement |
| [Second cold restart](restart.json)       | Exact recovered facts | Exact recovered source/state/times | Same one Notice, no duplicate harvest | Same 2                 |

Recovered and second-restart proofs are deeply equal. DSH Session Persistence independently shows one Assignment Turn whose interrupted outcome is retained, but the Host Notice deliberately has **no native Turn/end identity or Report pairing**: stale working state proves only recovery uncertainty. It has System provenance with interrupted/host-recovery, never fabricates a successful completion or claims an external action was undone. Baseline and fixed are different scenarios; their IDs intentionally differ. No automatic Assignment resume, retry, replacement or replay occurs.

**Visual acceptance remains incomplete:** browser-tool security policy explicitly refuses the local page. No alternate driver, browser surface or proxy is used to bypass this. There are no new screenshots or real source-navigation proofs; Draft remains pending Human QA. Private authenticated launch URLs, credentials, scene files and full Session logs are excluded from this artifact.

## Reproduce

Build the checkout and use `scripts/dev-instance.mjs --json --home <isolated-home> --port <free-port> --worktree <checkout>` with launch output redirected privately (`umask 077`). No fault Plugin or production configuration override is needed. Run:

```sh
export BH_E2E_ORIGIN=http://127.0.0.1:<free-port>
export BH_E2E_HOME=<isolated-home>
export BH_E2E_EVIDENCE=<private-proof-directory>
export BH_E2E_STATE=<private-scene-json>
node scripts/e2e-assignment-recovery-notice.mjs prepare
```

Use the launch file's PID; verify its command references this checkout and this port. Abruptly terminate only that exact owned Host after prepare PASS, without granting the timer. Cold-start the same Profile with the helper and run the `recovered` phase. Stop the exact new Host normally, cold-start the same Profile again and run `restart`. The second proof must equal the recovered proof.

For baseline, use the stated main checkout in a separate isolated home and `scripts/e2e-assignment-active-crash.mjs prepare`; interrupt its exact Host, cold-start and run `restart`. This original baseline script intentionally expects the missing Notice, retained Pending Report and no recovery Orchestrator Turn.

## Pending Human review

Open the helper's private authenticated fixed Profile URL (port 3167), select **Recovery notice QA 1791200426136**, and inspect Bot Inbox. The original progress Report and separate System recovery Notice should both be Handled and point to the owned Assignment; the Notice must not show an invented native Turn or successful Report pair. Navigate to the exact Assignment: verify original progress, native interruption, expired timer approval and no successful timer result. Return to Inbox without restarting or replaying work. Capture matched baseline/fixed light/dark before/after and source navigation. Only after actual navigation run `verify` to show it did not mutate or replay runtime facts.

This slice does not close #194: prior cancellation, error and repair screenshots/source navigation remain explicitly unverified.
