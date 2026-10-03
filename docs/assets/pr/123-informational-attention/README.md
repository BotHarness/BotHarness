# Informational Assignment Activity evidence (#123)

## Verified behavior

A real DeepSeek model creates an Assignment and calls `report_to_orchestrator` with a completed report. The existing canonical Human Inbox info query supplies a nonzero `informationalCount` to the same Host Activity snapshot and stream. Idle remains idle. Shared sidebar, composer, Overview and Rail render a neutral `i`; informational reports do not contribute to the red action-required number. Hover and accessible summaries state the count.

The default Overview includes an idle Bot with an information update. Browser reload retains the same Host revision. Ignoring the exact completed report through the existing authenticated command while the browser is offline clears the indicator on reconnect. A real Host process restart restores undismissed information with a new generation and idle execution. Ignoring after restart clears it. Rail measurement confirms the 14px marker is not clipped by scroll ancestors.

Focused coverage also verifies independent action counts, multiple latest reports, exact source-key dismissal, idempotent ignore, unchanged execution, bounded public fields and English/Chinese labels. The query keeps existing latest-report/ignore/dismissal eligibility; opening a report alone does not acknowledge it.

## Reproduction

Build this worktree. Launch a fresh isolated Profile with `scripts/dev-instance.mjs`. Set the task-local `BH_E2E_ORIGIN`, `BH_E2E_HOME` and `BH_E2E_EVIDENCE`, then run `node scripts/e2e-informational-attention.mjs`. Stop that exact task Host PID, restart its own Profile with the same worktree, then run the script with `restarted`. The launcher's private authenticated cookie jar is reused. `before` runs against a separate fresh base-revision Profile. `rail` and `rail-before` capture collapsed navigation.

The retained Human QA Bot has one genuine completed Assignment report. Open Activity Center → Inbox → Info and ignore its report, then return to its DM. The neutral indicator should disappear and execution remain idle.

## Assets

- `before-report-not-indicated.png` / `informational-idle-light.png`: 1500 × 1000 real base/changed DM state; separate fresh Profiles with equivalent one-report data. Generated Bot identities and their deterministic avatars differ.
- `informational-idle-dark.png`: settled dark UI.
- `overview-informational.png`: default Overview includes an idle information-bearing Bot.
- `reconnected-ignored-idle.png`: ignored while offline, restored online without reloading.
- `restart-informational-idle.png` / `restart-ignored-idle.png`: genuine Host restart recovery and exact acknowledgement.
- `human-qa-informational.png`: retained genuine report for Human QA.
- `before-rail-information.png` / `rail-information.png`: real collapsed navigation and hover summary.
- `proof.json`, `restart-proof.json`, `rail-proof.json`: bounded state, revision/generation and geometry evidence; no credentials, raw Tool payloads or Session transcript.

The initial automation failures were a hidden idle composer selector, an Overview entry selector/default idle filtering, and duplicate fixture preset names. Production fixes address the neutral marker styling and information-bearing Overview eligibility; fixture fixes retain unique preset names and optional hidden idle status. Automated acknowledgement uses public commands; Human QA verifies the existing Inbox UI action. Local authorization URLs and cookie jars remain private.
