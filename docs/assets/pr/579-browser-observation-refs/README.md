# Browser observation ref E2E — #579

Baseline: `28731e92b2e3df1da3d761eef6363f6d1ceb8933` (main after #578).
The baseline was built before the runtime fix, then the fixed runtime was rebuilt
and the exact task-owned Host restarted using the same isolated Profile.

Both runs use DSH `0.2.0-rc.1`, a real DeepSeek Orchestrator turn to open and observe
the local fixture, the native scoped tool executor, the real Browser sidebar
Pause/Resume controls, and the managed headed Chrome. The existing QA-only driver
from #569 is opt-in; the application Bundle never composes its route.

1. Observe the intended control and retain its ref.
2. Pause from the real sidebar. Operate the managed Chrome page directly with a
   Human click on `Insert new control`; a different action appears before the
   intended control.
3. Observe again while paused, then Resume and try the earlier ref.
4. Baseline: the earlier `e1` now clicks the different action (`Wrong: 1`), and the
   role-less Upload image control has disappeared from repeated observations.
5. Fixed: the earlier ref is refused with the existing re-observe instruction;
   `Wrong: 0` is preserved and the role-less control remains in the catalog.
6. Observe once more after the refusal, copy the new intended-control ref, and
   click it: `Intended: 1 | Wrong: 0` confirms recovery against the right target.

The Human Chrome input is actual CDP-dispatched input from a separate Puppeteer
connection to the same managed page. The deterministic action driver calls the
native scoped executor on the real owned Agent. It avoids relying on the model
to make the deliberate stale-ref mistake. JSON files retain the results and the
Host's redacted refusal audit.

Screenshots match the same Bot, fixture, Chinese dark-theme sidebar (1440 × 960)
and Chrome page (1200 × 736 CSS/image pixels, scale 1). Setup-turn history
accumulates between runs; compare the Browser preview and fixture counters.
A further real DeepSeek DM completes observe → copy the returned ref → click →
observe and confirms `Intended: 1 | Wrong: 0`; `model-ref-click.json` preserves
the model-authored ref argument. An additional browser-only probe confirms the real snapshot also generates
independent refs on an insecure HTTP origin (`http-context.json`).

## Reproduce in an isolated Profile

Install and build this worktree. Boot `scripts/dev-instance.mjs` with a fresh
`--home` and unused `--port`; stop only the helper's returned PID before editing
that Profile's `cordis.patch.yml`. Add the existing QA driver:

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
node scripts/e2e-browser-observation-refs.mjs
```

Use `--before` only against the baseline-built runtime; it asserts the known
wrong-target behavior. The helper supplies authentication locally. A usable
model and Chrome are required; missing prerequisites fail verification.
