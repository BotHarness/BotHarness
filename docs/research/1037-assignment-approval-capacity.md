# Assignment approval capacity: bounded RC1 tracer

The #1037 candidate preserves the original native approval wait while releasing a
quiescent independent Assignment's application running permit. It does not add the
missing same-Orchestrator approval continuation, resolve Group privacy acceptance,
upgrade production DSH, or clear #1036/#1038's overall gates.

## Verified scope

The original merged base `0036c7389ed78cb69de23ebdf9b22b8ca8e1b258`, the final
current-main comparison `f1e6fc6182abe74f004dca528b68ccf5c48a6766` and candidate use
DSH `0.2.0-rc.1`, isolated Profiles, real `deepseek-official/deepseek-flash` model
replies, authenticated native API Gateway calls and real browser approval controls.
No mocked model, approval result, tool execution or Channel receipt counts as E2E.

| Scenario, running limit 1          | Required observation                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact merged base                  | Unrelated real DM reply succeeds while approval waits; a second Assignment is capacity-refused.                                                                           |
| Candidate, approval pending        | Original remains unexecuted; unrelated real DM reply succeeds; a second Assignment actually starts its approved native command.                                           |
| Candidate, original approved       | Channel decision commits promptly; original native outcome remains unresolved and card shows waiting for a running slot; no original effect exists yet.                   |
| Capacity released                  | Same original Session/call/Turn receives one native decision and one actual successful result, after the competing command settles; the result is relayed to the Channel. |
| Grant revoked during capacity wait | Human approval remains auditable, but native outcome is unavailable and original tool result is an error; the original effect file never appears.                         |

The harmless native commands write opaque test markers only in the isolated Workspace.
The competitor writes its start marker before a 45-second wait, proving actual body
execution rather than admission alone. `checkApprovalCapacity` checks the exact native
call arguments, original approval ID, one result in the original Turn, actual unrelated
model provenance, canonical Channel send receipt, one competing running Assignment,
unresolved native outcome during capacity wait and effect-file absence/presence.
Only its explicit, public-safe result fields are exported under
[`docs/evidence/issue-1037`](../evidence/issue-1037/).

## Ownership and resource boundaries

- Native approval and the existing Channel broker retain decision authority. The new
  process-local module accounts for running permits; no schema, approval database,
  ordinary input, replacement Session or second executor is introduced.
- The durable Directory stays `working` while `executionWait` projects waiting-human
  or waiting-capacity. A Human decision can be committed before the native outcome
  is released, so approval alone never claims that execution happened.
- Tool bodies and prepared approved calls retain capacity. This slice conservatively
  retains the permit for every Assignment with owned descendants, including idle
  descendants, because it does not establish their quiescence.
- At most 32 Assignment Sessions may await approval independently of the Human's
  running limit. New dispatches and idle wakes remain immediate capacity refusals;
  only already admitted live waits may await a permit.
- Resumption rechecks current owner, identity, Workspace Grant and Source Event.
  The final tool-body guard repeats exact-operation and current authority checks
  after any capacity await. Model steps are gated too. Abort and stop end original
  waits; existing cold recovery marks interrupted work for inspection and never
  reconstructs a live lease or replays a tool.

## Reproduction and evidence history

Build the worktree and use `scripts/dev-instance.mjs` to launch an isolated RC1 Profile.
Set `BH_WAIT_LAUNCH` to its private JSON launch summary, then run:

```text
node scripts/e2e-approval-capacity.mjs candidate
node scripts/e2e-approval-capacity.mjs revoked
```

Run `baseline` against the exact base fixture instead. The runner uses the native
Settings Service to set the isolated Profile's running limit to 1, then creates its
own Bot, model preset, Workspace and Grant. Raw native snapshots, launch credentials,
prompts and local paths remain in ignored task files. Public screenshots redact the
local task path before capture; native inputs and tool execution remain untouched.
Screenshots use Chinese locale, 1500 × 1100, both native light and dark themes, with
the original approval card scrolled into view. GitHub-rendered images live in the PR.

The first UI navigation attempt did not reach Bot mode and ran no model operation.
A later attempt observed the competing request via RPC before its approval button
had loaded, so it failed and left two native waits. Both were explicitly cancelled
through native Session control; the runner now waits for that exact enabled button
before listening for and submitting its decision. Those failed attempts remain
private bounded history; recovery does not claim a product fix.

An added interrupted-card assertion was initially placed before the revocation
step. That review attempt was aborted and its own Bot's three Sessions were
cancelled through native control. The assertion now runs after revocation and
the actual error result; only the corrected, passing run is exported.

A final-build run reached the competing command's actual result, then a loopback
RPC failed with `ECONNRESET` before verification completed. Another run reproduced
the reset. The Host was still alive on inspection and had no crash diagnostic.
A mistaken restart while it was alive was refused with `EADDRINUSE`. The task
then verified and stopped that exact Host PID before a clean restart and rerun.
Neither failed attempt counts as successful E2E evidence.

A minimized 120-request, read-only loop against that Host reproduced one reset
and two timeouts with Node 24.14's default fetch connection reuse. A paired
20-request comparison using fresh connections passed with both native HTTP and
fetch, and a second 120-request loop with fresh connections had zero failures;
the complete real approval E2E then passed with connection reuse disabled.
The capacity runner therefore opts into fresh loopback RPC connections and does
not retry decisions, tool calls or failed reads. This is a qualified test-transport
workaround, not evidence of a production approval fix or a proven Host root cause.

Focused automated coverage includes parallel tool bodies, prepared sibling calls,
competing accepted waits, live limit changes, authority loss, abort, the separate
waiting bound, acquisition microtask races, stale leases, Client waiting-state
transitions and a cold snapshot taken while a permit was released. Wider Human
acceptance of #1037 and the same-Orchestrator/group requirements remain separate.
