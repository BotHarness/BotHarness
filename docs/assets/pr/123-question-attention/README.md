# Native question attention — real DSH evidence

Isolated DSH 0.2.0-rc.1 with a real DeepSeek Flash / low Orchestrator, captured 2026-10-03.

- `pending-question-light.png` / `pending-question-dark.png`: a new native `ask_user_question` request after recovery; sidebar and composer show one question, while execution remains working.
- `overview-question-attention.png`: the same live attention in the existing activity overview.
- `reconnected-answer-cleared.png`: answer committed while the browser was offline, then recovery without reloading clears the badge; a genuine model reply reports Canary.
- `native-cancel-cleared.png`: authenticated native `session/cancel` clears the pending question.
- `restarted-history-no-attention.png`: process restart retains history but expires its old request; no attention is replayed.
- `human-qa-pending-question.png`: a fresh native question left open for Human QA.
- `proof.json`: bounded public Activity snapshots/revisions and captured SSE frames, offline answer and cancellation results. No question contents, Tool arguments/results or credentials are in the Activity projection.
- `restart-proof.json`: new Host generation, idle baseline and expired historical request.

Reproduce with `scripts/dev-instance.mjs` using a fresh isolated home, then set `BH_E2E_ORIGIN`, `BH_E2E_HOME`, `BH_E2E_EVIDENCE` and run `node scripts/e2e-question-attention.mjs`. Restart only that verified QA Host, then run the script with `restarted`. Authentication comes from the machine-local launcher cookie jar and is never committed. The browser cookie is scoped to the local Host.

Focused regression coverage: 30 tests pass, including persistence failure/abort races, overlapping request counts, independent Tool approvals, Agent disposal, close, historical non-replay, safe Client parsing and execution/attention independence. Local full tests hit the existing Windows `fsync` EPERM in attachment upload; the same four failures in bridge/runtime tests reproduce on pre-change code (69 other tests in those files pass). The local full run later encountered worker termination/time-out failures and was interrupted; it is not recorded as passing. PR CI is the complete Linux test gate.
