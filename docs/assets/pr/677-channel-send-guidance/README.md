# #677 — registered attachment Tool guidance and #560 closeout evidence

The integrated `channel_send` description named `channel_read_content`, although no such Tool is registered, and denied local-file import despite the existing `channel_attachment_import`. Runtime source `1b8d47555648e64ad6b0933e6e2689d9d0f2520e` corrects the description and bilingual living architecture; parameters, rendering, send/attachment owners and permission checks are unchanged.

## Real DSH proof

DSH `0.2.0-rc.1`, `deepseek-official` / `deepseek-flash`, reasoning `high`; isolated local QA Profile with no IM provider. Actual Session request/header metadata has 66 model-visible Tools in both runs, including native preset Tools outside the 38-definition adapter inventory. It includes `channel_read` and `channel_attachment_import`, and excludes `channel_read_content`. The exact `channel_send` description from the candidate Session matches the committed source and pinned conversion.

Each real model was asked to quote the attachment-source guidance and use the existing import Tool to send one selected synthetic `receipt.txt` from an explicitly granted QA folder to its Human DM. Both used `channel_attachment_import` once and `channel_send` once, kept the original unchanged, and reached native `turn/end` with reason `completed`. The baseline transfer already worked; this PR corrects misleading model guidance, not a previously broken byte-transfer implementation.

The real Human-facing file chip's native menu was clicked, then **Download to this device** downloaded the file in Chrome. Independent authenticated attachment-route read-back and the actual menu download both matched the original **60 bytes**, SHA-256 `2433a9613acba1e759f06d4926b8b8e9718558887b4ae83cb4ecf515918738ff`. The two imported file IDs are independent; each DM contains exactly one attachment send.

Unmodified native screenshots are 1440 × 1200, Chinese, dark. Before/after are two synthetic PersonaBots in the same isolated Profile; names, IDs, additional QA roster row, timestamps and model prose differ. The baseline records were captured after a cold Host reload with identical Client source. Screenshot captions/prose are illustrations; native Tool metadata, calls/results, terminal events and byte read-back are the authority.

- `before-dm.png` / `after-dm.png`: actual model quote of old/new attachment-source guidance and the committed result attachment.
- `before-download-menu.png` / `after-download-menu.png`: native file-menu download entry exercised in both runs.
- `before-result.json` / `after-result.json`: committed identity, independent file reference, bytes/hash, original preservation, one send, native terminal event and browser menu download.
- `native-contract-proof.json`: selected real request/header Tool definition, registered names, exact import/send calls/results and native terminal proof. Synthetic local paths in text fields are replaced by `QA_WORKSPACE`; raw Session logs, credentials and other private paths are not published.

## Integrated audit and character metric

`audit.md` records the original nine merged children, their 47 accessible real DSH screenshots, the fixed-main 74-test / 13-file regression audit, scope boundaries and full 38-definition schema inventory. The Hub remains open until this PR passes Human QA and merges; final main inventory must then be refreshed.

The metric is UTF-16 code units of compact `JSON.stringify({description,parameters})` after pinned `defineTool` conversion. The correction changes only `channel_send`: **1,829 → 1,856** (+27); complete metadata including name is 1,878. This does not claim fixed-schema token savings, total Provider prompt reduction or whole-task cost improvement. The same original 20 names sum to 14,083; 37 Orchestrator definitions sum to 24,109 in this candidate. `schema-comparison.json` compares the original audit baseline, integrated main and candidate; `tool-inventory.json` contains all implicit descriptions/parameters and exact counts/anchors.

With lockfile dependencies installed, run the safe AST/conversion reproducer from the repo root:

```bash
node docs/assets/pr/677-channel-send-guidance/measure-tools.cjs . /tmp/tool-inventory.json
```

It never calls a production Tool execute callback. Check the exact revision before comparing counts.

## Validation

- Fixed integrated main `222770648139a7fb97925ae77085cf8f0893463e`: 74 tests in 13 focused files, no skips; nine original children completed, nine PRs merged, all 47 screenshot URLs return PNG/HTTP 200. Latest merged integration CI succeeded.
- Candidate: 16 existing production-seam attachment forwarding/file import/bounded message-read tests in three files passed, no skips; lint/source policy (existing unrelated warnings), typecheck, format, build and both release ledgers passed. No new test mirrors the description implementation.
- Own frozen dependency install and full docs build passed: 270 pages. Chinese OG subset regenerated after sync and remained byte-identical to main. No generated documentation or dependency file was committed.
- Real baseline and candidate model turns, one-time reviewed read-only Shell decisions, actual import/send metadata, native menu download, exact bytes/hash and terminal event passed. No IM connection was installed, enabled or taken from another task.

## Retained diagnostics

Initial QA setup supplied `provider:model` as a legacy model string; the existing Host rejected that route. The driver was corrected to use the Profile's working modern default, without product changes. A baseline driver deadline expired while waiting for legitimate one-time Shell decisions; it resumed the same request after reviewing only `pwd`, bounded directory lists and selected-file metadata commands. No attachment request was resent. A private proof collector tried non-public `session/inspect`; raw native Session artifacts were then read frame-by-frame using Zstandard consumed-byte boundaries. A one-frame decode was rejected as incomplete. Native menu matching was corrected from an exact short translation to its full download label. The private cross-checkout dependency links caused pnpm task-state and Astro physical-path errors; this worktree's frozen offline install corrected the environment and the required docs build then passed. Client evidence was captured after this task's exact Host PID was cold-restarted. These setup/collector failures are not production fixes or passes, and no assertion/permission check was weakened.

## Human QA

Open the isolated QA runtime, select **QA677 Contract after**, inspect its quoted registered Tool guidance and `receipt.txt`, then use the file chip's **Download to this device** menu and compare the two-line content. Sessions → native trajectory shows the single import/send calls and their exact reference/acknowledgement. **QA677 Contract before** retains the original misleading quote for comparison. No further file operation or IM send is needed. The goal pauses after this reviewable PR, pending Human QA; merge and Hub closure follow that feedback.
