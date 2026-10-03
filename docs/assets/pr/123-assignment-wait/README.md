# Explicit Assignment wait — real DSH evidence

DSH 0.2.0-rc.1, isolated loopback Profile, 1500 × 1000, native light/dark themes.
`e2e-assignment-wait.mjs` creates a real PersonaBot, model preset, Workspace Grant and Assignment through authenticated APIs. The model calls `wait_for_assignment` while its Assignment runs the exact harmless 25-second Node timer, then commits a completed report. No fabricated SessionEvents or direct database writes are used.

- `before-wait-operation.png`: prior entry state, before requesting the new wait operation.
- `assignment-selected-waiting-{light,dark}.png`: actual Assignment Shell approval, while Orchestrator's native Tool call explicitly waits; sidebar/composer show Assignment execution and independent approval count.
- `reconnected-assignment-working.png`: browser went offline during the exact approval decision, then reconnects and clears the badge while real Assignment execution continues.
- `report-returned-idle.png`: report returned, Orchestrator sent `WAIT_VERIFIED`, both Turns settled.
- `proof.json`: bounded Host snapshots plus authenticated Activity stream frames; later frames restore Orchestrator selection before final idle.

Only the machine-local Workspace path is replaced with `[isolated QA workspace]` at capture time. All state, controls and execution evidence are from the real UI. The new wait operation has no previous UI state; the Before image therefore shows its entry point before it starts, rather than simulating an unavailable Tool on the base revision.

Focused automated coverage checks report/settlement races, timeout, cancellation, Runtime close, ownership refusal, parallel Orchestrator work and stale lease cleanup. A Host restart does not reconstruct a process-local wait lease from historical Tool names.
