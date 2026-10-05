# #194 — Assignment Report batch acceptance

Real isolated DSH 0.2.0-rc.1 with DeepSeek Flash / low; no production runtime or UI change.

1. [Pending proof](01-pending-proof.json): two successful progress Reports stay independent and pending; exactly one initial Orchestrator Turn, no progress wake; a native one-second timer awaits approval.
2. [Harvest proof](02-harvest-proof.json): one-time timer approval is followed by a completed Report; three successful native Report results, exactly one additional Orchestrator Turn and one model-visible Inbox delivery with `repeats 3`. All three source identities remain, sharing one observation/handling batch, and the DM completion follows successful Report delivery.
3. [Pending source navigation](source-navigation-pending.json) and [handled source navigation](source-navigation-completed.json): actual Source clicks open the owning native Session via `session/follow`, without changing Bot observation or starting another Orchestrator Turn.

| Phase                        | Light                                   | Dark                                   |
| ---------------------------- | --------------------------------------- | -------------------------------------- |
| Two pending progress sources | [Screenshot](pending-inbox-light.png)   | [Screenshot](pending-inbox-dark.png)   |
| Three handled sources        | [Screenshot](completed-inbox-light.png) | [Screenshot](completed-inbox-dark.png) |

These are actual Profile/Channel sidebar screenshots. Only the Assignment group is expanded; tool approval arguments and local workspace paths are outside the view. No UI content or application state was mocked or rewritten.

The first capture attempt selected a `summary` for the top-level Inbox accordion; the actual component uses an accordion button. The prepared runtime scene was retained, the script selector corrected, and capture/source-navigation checks passed. This was a capture-script defect, not a production fix.

Follow the [bilingual verified guide](../../../dev/guides/assignment-report-harvest.md) for reproduction. Public records contain only bounded QA identities/markers, result times and outcomes; credentials, raw tool arguments/results, raw Session snapshots and machine paths remain private. #194 remains open for its other causal/escalation/recovery cases.
