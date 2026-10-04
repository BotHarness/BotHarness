# Assignment capacity E2E — #811

Real DSH 0.2.0 RC1, DeepSeek-V41-Flash, isolated Profiles, native Workspace Grants and one-call Human Shell approvals. These captures are from the running application, with a 1500 × 1000 viewport, light theme and Chinese locale.

## Scenario and evidence

1. Human sends a DM asking the Orchestrator to create Assignment A. A reports `waiting-human` with `expects_reply=true`, then becomes idle.
2. Human asks for independent B/C/D Assignments. Each runs a real native Bash loop waiting for its own release file in the granted temporary workspace. All three are approved once and remain working.
3. Human asks the Orchestrator to answer A's original ask through `send_assignment_request`.
   - **Before**, main `1bf56698`: delivery succeeds, the ask disappears and four Assignments are working. A receives a wait instruction to keep the over-limit state visible for capture.
   - **After**, this PR: `assignment-capacity`, `activeCount=3`, `limit=3`, `retryable=true`. A stays idle with the original ask. No additional Session starts.
4. Human creates B's release file. B exits its actual Shell loop, reports completed and releases a slot. The Orchestrator retries the original answer. A continues in the same Session, reports completed and has no remaining open ask; permission and model snapshots are unchanged.
5. The QA Orchestrators stop the remaining fixture Assignments through the existing `stop_assignment` Tool. Both Profiles retain their Session and Channel history.

| Capture                             | Observable result                                                           |
| ----------------------------------- | --------------------------------------------------------------------------- |
| [Before](before-over-limit.png)     | Four working independent Assignments despite the default three-slot limit.  |
| [After refusal](after-capacity.png) | Structured capacity refusal, three running Assignments and A still waiting. |
| [After retry](after-resumed.png)    | The original A Session completed after B released a slot.                   |

[proof.json](proof.json) includes allowlisted Host Assignment Directory snapshots and the actual DSH SessionPersistence `tool/result` values for refusal and successful retry. Model-authored Channel prose is supplementary; the proof checks the owning Host facts and native Tool results independently. No credentials or private raw logs are included.

## Regression coverage

Focused coverage exercises one/three-slot limits, addressed and keyed idle wake, cross-Bot capacity, cold restart, synchronous reservation before adapter entry, unchanged waiting state on refusal, running updates, release/retry and synchronous adapter refusal releasing its reservation. Adapter coverage checks the structured facts reaching the model.

Delivery rejection before acceptance still clearing an ask is the separate sibling #812; this PR preserves an ask on capacity refusal and does not change answer-delivery settlement.
