# Concurrent Assignment Activity verification

Issue #123; task `codex/local/01a0e445-0c0f-70e1-bad4-fd99c8cfaa21`.

## Scope

The production change only canonicalizes the ordering of opaque Tool detail references before applying the existing 256-reference bound. It does not change Session identity, native execution facts, Tool disclosure authorization, UI layout or motion. References are generation-local capabilities, not persistent public identifiers; no order equality across process restarts is claimed.

The regression initially fails eight of nine new cases. The fixed suite passes all six arrival/completion permutations, same-kind and mixed-kind aggregation, duplicate references, bounding, immutable caller data and event/query revision agreement. Existing authorization, TTL/revocation, Orchestrator waiting and native replay tests also pass.

## Real DSH path

A fresh isolated DSH 0.2.0-rc.1 Profile runs the actual DeepSeek model. The Orchestrator creates two real Assignments before explicitly waiting. The Assignments request native Shell timers (40 and 60 seconds), receive explicit once-only Human approval through existing public commands, actually execute, report completed, and the Orchestrator sends CONCURRENT_VERIFIED.

`proof.json` records only public Activity fields: two selected executing Assignment sources, canonical references, an authenticated post-offline Activity baseline, one remaining Assignment, restored Orchestrator frames, and final idle with no active Session source labels. An existing idle summary row may remain because the two reports are informational attention. Screenshots verify shared sidebar/composer effects and compact native Session cards. A machine-local Workspace path is redacted before capture; command arguments shown are only the authorized bounded timers.

This is a Host aggregation correction without a UI redesign. Images are state-sequence E2E evidence, not cosmetic before/after claims: before the operation, two pending tools, two actually executing tools after reconnect, one remaining tool, and settled idle. Mixed tool kinds and all completion orders are checked automatically; the real model scenario uses two execute-kind tools.

The strengthened script initially assumed the idle summary row would be absent and produced a false negative after both real Assignments had completed. Its final assertion was corrected; `settled` resumed that exact completed scene and verified Host idle, absent active Session labels, matching live state, restored Orchestrator frames and the actual Channel reply. `proof.json` records this recovery explicitly.

## Reproduction

Build and start a fresh task-owned Profile with `scripts/dev-instance.mjs`, then set BH_E2E_ORIGIN, BH_E2E_HOME and BH_E2E_EVIDENCE and run `node scripts/e2e-concurrent-activity.mjs`. The launcher cookie remains private. No credentials or local login URLs belong in published evidence.

For Human QA, open the retained Bot, ask it to repeat the concurrent Assignment verification using two new continuity keys, approve the two bounded timer calls, and observe two executing cards, then one, then idle. The Orchestrator explicitly waits throughout. Do not infer execution from pending approval counts alone.
