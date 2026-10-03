# #123 — Overview shares Host execution; attention remains independent

Real isolated DSH 0.2.0-rc.1 with actual DeepSeek V4 Pro/off Orchestrator and Assignment Sessions. No mock UI, SessionEvents or model replies. The committed captures and proof were refreshed against integrated main `aab3239e`, including the newly merged member Channel harvest and Container Browser changes, on 2026-10-03. All 12 assertions passed again in a fresh isolated home; the prior Human QA home was preserved.

1. Human grants one isolated workspace. Orchestrator creates a bounded Assignment then calls native `browser_tabs/list`; Assignment calls native Shell for exactly `node -e "setTimeout(() => {}, 2000)"`.
2. Both actual native approval cards remain pending. Overview and sidebar/composer select Orchestrator and the same safe registered Tool summary. Overview separately displays two Human actions and two live owned root Session cards.
3. Page reload reconnect retains the exact Activity snapshot, defaults the composer disclosure closed, and Overview retains both independent actions and roots.
4. Approve browser list once. Orchestrator ends its Turn; Overview and sidebar/composer hand off to Assignment Shell, retaining one pending Human action and one executing root.
5. Approve only the exact two-second timer once. Assignment reports completion, Orchestrator sends the real Channel reply `Concurrent activity confirmed`, and all execution surfaces settle idle with zero pending actions/roots.

All 12 observed assertions are in `proof.json`. Screenshots capture the actual native Client; no images were edited. Machine-local directories are redacted from rendered approval details before composer screenshots; the committed Overview screenshots contain no Tool inputs or local paths. Failed verifier screenshots and private auth/QA identifiers are excluded.

Run `scripts/e2e-orchestrator-activity.mjs` with private `BH_E2E_ORIGIN`, fresh `BH_E2E_HOME`, and `BH_E2E_EVIDENCE`. It reads the private cookie jar written by the existing isolated-instance helper. `BH_E2E_HOLD=true` retains pending approvals for Human QA. `BH_E2E_RECONNECT_BOT` resumes an existing QA Bot without creating/applying configuration or re-sending its task. Only safe queries and read-only native UI opening retry after transient connection/rerender; sends and approval decisions never retry automatically.

Scope: canonical Host-selected header state and bounded registered Tool summary; independent Human action facts; live owned root cards and native Session navigation. Overview's existing action/liveness query and refresh cadence remain. Explicit waiting-on-Assignment signaling and a complete shared attention-axis DTO remain #123 follow-ups. This slice does not close #123 or add #124/Backup/Export.
