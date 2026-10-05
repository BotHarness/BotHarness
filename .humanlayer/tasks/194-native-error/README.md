# #194 native execution-error acceptance

Claim: https://github.com/BotHarness/BotHarness/issues/194#issuecomment-5993095767

## Evidence and limits

Baseline: main `070b74a1a69e26a2d4f082170587d488725f2857`, isolated DSH 0.2.0-rc.1 Profile, port 3164. Fixed: this PR, separate isolated Profile on port 3165. Both use actual official DeepSeek Flash/low requests and one real Assignment-authored progress Report. The explicit QA Plugin throws at the documented read-only native `llm/stream` middleware boundary only after the matching Report's successful Tool result. DSH itself commits the error Turn. This demonstrates post-acceptance native execution failure; it does **not** demonstrate a real provider outage. No SQL or invented Session Events create the scenario. The script reads SQLite only to verify canonical Notice provenance.

| Proof                        | Report                                  | Host Notice                         | Continuity Key | Orchestrator Turns / acknowledgement |
| ---------------------------- | --------------------------------------- | ----------------------------------- | -------------- | ------------------------------------ |
| [Baseline](baseline.json)    | Original progress, Pending              | None                                | Retained (gap) | 1 / 0                                |
| [Fixed](failed.json)         | Same progress, Handled                  | One System failed/native-turn-error | Released       | 2 / 1                                |
| [Cold restart](restart.json) | Exact fixed identity and handling facts | Exact same Notice                   | Released       | 2 / 1, no replay                     |

The fixed and restart proofs are deeply equal. There is one Assignment, no replacement or additional Assignment Turn, no successful pairing, and no raw native error text in the Notice. Baseline and fixed are separate scenarios; their IDs are intentionally different. Earlier isolated setup attempts are excluded from these proofs. Private scene files, authenticated launch URLs, credentials and full Session logs are not published.

**UI evidence remains blocked.** The browser tool explicitly refuses the local URL under its security policy. No alternate driver or app is used to bypass the refusal. Before/after screenshots and actual Human source navigation are unverified; the PR stays Draft. These runtime/API facts are not UI-click evidence.

## Reproduce through the pinned Host

Use a new isolated home and a free port. Build this checkout, launch through `scripts/dev-instance.mjs --json --home <qa-home> --port <qa-port> --worktree <checkout>` with output redirected to a private local file (`umask 077`); never publish its authenticated URL. Verify the exact task PID from that file before stopping it. Preserve existing Profile Patch entries; on a new home the native Patch is an empty YAML array. Explicitly append this opt-in insert to `<qa-home>/profiles/web-dev/cordis.patch.yml`, replacing the checkout placeholder with its absolute path:

```yaml
- insert:
    - id: assignment-error-qa
      name: file://<absolute-checkout>/scripts/fixtures/assignment-execution-error.mjs
```

Restart the same home once through the helper. The fixture is not referenced by any production manifest. Run:

```sh
export BH_E2E_ORIGIN=http://127.0.0.1:<qa-port>
export BH_E2E_HOME=<qa-home>
export BH_E2E_EVIDENCE=<private-proof-directory>
export BH_E2E_STATE=<private-scene-json>
node scripts/e2e-assignment-native-error.mjs prepare
node scripts/e2e-assignment-native-error.mjs failed
```

Stop only that exact owned Host PID, cold-start the same home with the helper, then run the `restart` phase. To reproduce the baseline, use a separate checkout of the stated baseline with these two QA scripts copied into it, a separate home, the same explicit QA Patch, and the `baseline` phase after `prepare`. The baseline intentionally expects the retained Continuity Key and missing Notice.

## Pending Human review

Open the authenticated URL privately printed for the fixed QA Profile (port 3165), choose **Native execution error QA**, and inspect Bot Inbox. The original progress Report and safe System execution-error Notice should both be Handled and reference the same Assignment Turn 1 without a successful-completion pair. Open each source: confirm exact Assignment Session, retained progress Report and the committed native error Turn. Revisit Inbox and confirm no new acknowledgement/Assignment appears. Capture matched baseline/fixed light/dark screens and the source-navigation state. Only after this actual UI review may the script's `verify` phase be used to prove navigation did not mutate or replay the runtime facts.

Crash-recovery Lifecycle Notices and the earlier cancellation/repair UI acceptance remain tracked separately in #194.
