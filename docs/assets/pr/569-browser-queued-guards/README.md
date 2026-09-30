# Browser queue guard E2E — #569

Baseline: `cb2461c9295728a7af81533e20d139e7d46f3732` (main after #559).
The baseline was built before the provider fix, then the fixed provider was rebuilt
and the exact task-owned Host was restarted using the same isolated Profile.

Both runs use DSH `0.2.0-rc.1`, a real DeepSeek turn to create the owned Orchestrator
Agent and open/observe the fixture, the native scoped tool executor, the actual
Human Browser sidebar controls, and the managed headed Chrome. The deterministic
queue driver is a QA-only Plugin, never part of the application Bundle.

The driver holds the per-Bot queue with `browser_wait(4000)`, submits a click while
the wait is active, checks that it has not settled, and clicks Human Pause. Before,
the click succeeds and the fixture displays `Clicks: 1`; after, it is refused and
`Clicks: 0` stays visible. Paused observation works. Resume, fresh observation,
and another click succeed. A second wait/queued-open sequence clicks Browser
Access off: the baseline opens the URL, the fixed version refuses it. The Host
records both fixed refusals on its existing bounded, redacted audit surface.

Screenshots use the same Chinese light-theme sidebar at 1440 × 960, with the same
Bot and fixture. Chrome page frames are 2400 × 1472 (1200 × 736 CSS pixels at 2×).
Conversation history includes the successive setup turns; the Browser state and
fixture content are the comparison. JSON files retain native executor results and
the selected refusal audit events.

## Reproduce in an isolated Profile

Install and build this worktree. Boot with `scripts/dev-instance.mjs` using a fresh
`--home` and unused `--port`; stop only its returned PID before changing the Patch.
Add these entries to that Profile's `cordis.patch.yml` (resolve the QA module to
this worktree's absolute path):

```yaml
- id: botharness-browser
  config:
    autoAllowActions: true
- insert:
    - id: browser-queue-qa
      name: /absolute/worktree/scripts/fixtures/browser-queue-qa.mjs
```

Restart with the helper, then run:

```sh
BH_E2E_HOME=/isolated/profile/home \
BH_E2E_ORIGIN=http://127.0.0.1:unused-port \
node scripts/e2e-browser-queued-guards.mjs
```

Use `--before` only with the baseline-built provider; it asserts the known bad
behavior. The helper supplies authentication locally; no secret is passed to the
script. A usable model and Chrome are required. Missing runtime prerequisites
fail the verification rather than count as a pass.
