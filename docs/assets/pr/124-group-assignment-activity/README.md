# Group Assignment activity verification — #124

This is a verification slice of the existing production Group surface after #786. No production behavior, Host authority, storage or Gateway changes are introduced.

## Recorded run

- DSH 0.2.0-rc.1, Windows isolated loopback Host; configured DeepSeek Flash / low for both root Sessions.
- One PersonaBot has a real Orchestrator and one real Assignment using an explicit Workspace Grant. The other member stays idle throughout.
- Native approval inputs are checked against exact harmless timers: Orchestrator 45 seconds, Assignment 120 seconds. The native tools used are recorded in runtime-proof.json.
- Concurrent work selects only the Host Orchestrator aggregate. The remaining Assignment owns the aggregate after Orchestrator work ends. Header, Profile chips and expanded Group row consume matching snapshot state; one Bot row is shown, without flattening Session payloads.
- Offline/online recovery requires a newly received SSE snapshot matching Host generation/revision.
- A fresh Group completion message is required. Actual durable native tool/call and matching successful tool/result are checked for both owned Sessions. Raw Session logs remain private; public proof retains only bounded snapshots and success summaries.
- Completion returns execution to idle. A remaining informational Assignment notice is allowed and must not be shown as active execution.
- Dark/narrow view has no document horizontal overflow; no Client exceptions.
- Group conversation screenshots include replies from earlier setup attempts. Only the fresh completion item recorded in proof.completion counts toward this run.

## Reproduce

Launch an isolated verified instance with scripts/dev-instance.mjs; use its own cookie file and machine-local credentials. Never reuse an incompatible QA database.

Set BH_E2E_ORIGIN to its loopback origin, BH_E2E_HOME to that instance's home, and BH_E2E_EVIDENCE to a private evidence directory. Then run:

```sh
node scripts/e2e-group-assignment-activity.mjs prepare
node scripts/e2e-group-assignment-activity.mjs check
```

The script submits model work through authenticated public commands, verifies exact native timer inputs and allows each once. The resume mode reuses the latest matching pending QA request after a browser startup interruption. It must not be used for a completed request.

For Human QA, after automated work completes, prepare a fresh Group and run the human mode. This submits the same two timer requests and leaves approvals pending. In the Bot's DM, allow Group Orchestrator activity QA and Group Assignment activity QA; return to the Group. Observe the main-session aggregate, the Assignment handoff after about 45 seconds and completion/idle after about two minutes. Quiet control stays idle. Any retained information notice is separate from execution.

This slice does not claim the remaining #124 motion preference/member-count matrix.
