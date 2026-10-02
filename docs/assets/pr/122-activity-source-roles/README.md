# #122 — trusted execution source evidence

Real native DeepSeek Harness 0.2.0-rc.1, DeepSeek V4 Pro / off, Chinese, 1500 × 1180. Baseline is merged commit `6d477a5bdb3480495cd1eddf40637475c03edcc5`; the after build adds source roles without changing tool effects. Independent isolated instances use the same display names, route, viewport and pending native Shell command. Avatar seeds and earlier message history differ.

## What was exercised

- Orchestrator native `bash` and an actual Orchestrator-created Assignment native `pwsh` each request the harmless `node -e "setTimeout(() => {}, 2000)"` timer.
- Sidebar, composer, pinned keyboard tooltip and Rail hover/focus all consume the same revisioned Host projection. The before UI has a tool summary without a source; after includes 主会话 or 任务会话.
- Keyboard Enter expands native details: the count is working Sessions, separately from concurrent tools. Reduce motion computes avatar animation to `none`.
- Both native color schemes were rendered. The dark runs approved the real tool, observed native `tool/result` and `turn/end`, a fresh exact Bot reply, idle in both views and no retained source detail. New light-theme requests remain pending for Human QA.
- Subagent provenance/rebuild and multi-Session / multi-tool counts are covered by focused projection tests. This slice's live-model proof covers Orchestrator and Assignment, not a new native Subagent workflow.

## Public-safe evidence

`*-proof.json` contains only model route, Bot slug/display name, bounded Activity snapshots, DOM text/effects and native event type/time/allowlisted tool name. No Session ids, arguments, results, reasoning, credentials or absolute machine paths are copied. Screenshots retain the original authorized approval UI; its machine-local workdir and opaque QA references are redacted in the DOM before capture, with no image editing. This does not change Activity payloads.

The source role comes from trusted Session Ownership; neither prompt nor tool data supplies it. The source count is one per Session with pending tools. Role-priority aggregation (#123), group aggregation (#124), public detail, authorized opaque full detail and historical trace remain later slices.

## Reproduction

Build and boot two independent homes with `scripts/dev-instance.mjs`: one at the baseline above, one on this branch. Use the helper's private cookie jar; keep all authentication metadata outside the repository. Run `scripts/e2e-safe-tool-activity.mjs` with:

| Environment                                  | Value                                                       |
| -------------------------------------------- | ----------------------------------------------------------- |
| `BH_E2E_ORIGIN`, `BH_E2E_HOME`               | isolated origin and home                                    |
| `BH_E2E_EVIDENCE`                            | task-local output directory                                 |
| `BH_E2E_MODEL`, `BH_E2E_EFFORT`              | `pro`, `off`                                                |
| `BH_E2E_SOURCE_ROLE`                         | `orchestrator` or `assignment`                              |
| `BH_E2E_PHASE`                               | `before` for baseline; `after` for current                  |
| `BH_E2E_COLOR_SCHEME`                        | `dark` or `light`                                           |
| `BH_E2E_HOLD`                                | `true` to leave the real approval for Human QA              |
| `BH_E2E_RECONNECT_BOT`, `BH_E2E_USE_PENDING` | reuse a Bot; `true` to capture its existing pending request |

Assignment setup uses native `workspace/create`, BotHarness `grantCreate` and the registered `create_assignment` tool, with only an isolated temporary QA directory. There is no injected Activity state or direct database seed.
