# Group activity: first #124 slice

Base: 116645be4c8f8885d2db812a98ffd4c757aad763. DSH 0.2.0-rc.1, real DeepSeek Flash/low Orchestrator Sessions. Both phases use the same four-member Group, Chinese locale, desktop 1500 × 1000/light and mobile 420 × 860/dark. Message history and timestamps differ because each phase uses fresh real model Turns.

## Evidence

Before: the collapsed summary only counts Bots, and expanded Session rows both say Orchestrator without naming their Bot. After: the collapsed summary identifies both active Bots and the expanded list shows one named aggregate row per Bot. Hover or focus an avatar for its safe shared summary; press Enter to toggle the native disclosure. The disclosure starts closed.

The other two members stay idle. The top header retains its existing three avatars plus +1 overflow. Each avatar consumes its own Host state.

The verifier sends structured mentions to Orbit and Nova, approves native Shell requests in their own DM Channels, and observes concurrent bounded 45-second timers. It checks both fresh, uniquely marked Group replies and both Bots returning to idle. It also forces the browser offline for 1.2 seconds, reconnects, and checks the live view against the current Host snapshot. `proof.json` records safe Activity snapshot generation/revisions, per-Bot states, summary labels, no horizontal overflow and no client exceptions. No cookie or provider credential is published.

## Reproduce

Boot an isolated instance from this branch with `scripts/dev-instance.mjs`. Set BH_E2E_ORIGIN, BH_E2E_HOME and BH_E2E_EVIDENCE, then run `node scripts/e2e-group-activity.mjs before` on the base revision and `node scripts/e2e-group-activity.mjs check` on this revision using the same isolated QA fixture. The first run creates four Bots and the Group through authenticated public commands. Each model run has native approval and provider cost.

The final successful verifier uses native DM approval locations, visible facepile counts and fresh reply IDs; earlier verifier attempts were corrected when those assertions targeted the wrong surface.

## Scope

This PR is the first Human-testable Group composer slice, not completion of #124. Assignment aggregation, custom Group-avatar variants, header keyboard affordances, consecutive-author grouping and the full motion matrix remain for subsequent contract audits after Human feedback. Host authority, Gateway authorization, shared motion policy and DM Session rows are unchanged.
