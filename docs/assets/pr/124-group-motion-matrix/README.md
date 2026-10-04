# Group motion and compact member previews — #124

This verification-only slice exercises the shipped Group header/Profile chips and shared BotHarness motion settings. No production UI, Host authority, storage or Gateway behavior changes were required.

## Recorded real DSH run

DSH 0.2.0-rc.1, fresh Windows loopback Profile, configured DeepSeek Flash / low. One owner runs one approved native 180-second timer; four quiet controls remain idle. The one-, three- and five-member Groups share the same actual owner and quiet identities. No uploaded avatars are configured; the existing generated identity fallback is used.

Eight selected cases are recorded (not a full Cartesian matrix):

| Members | Human preference | System preference | Theme / width |
| ------- | ---------------- | ----------------- | ------------- |
| 1, 3, 5 | Full             | No preference     | Light / 1500  |
| 5       | Full             | Reduce            | Dark / 420    |
| 5       | Reduce           | No preference     | Light / 1500  |
| 5       | Reduce           | Reduce            | Dark / 420    |
| 5       | Follow system    | Reduce            | Light / 1500  |
| 5       | Follow system    | No preference     | Dark / 420    |

- Settings are selected through the real Human settings menu. Explicit Reduce and Full also survive page reload against the opposite OS preference; Follow system responds to live OS preference changes.
- Host Activity snapshot and received SSE generation/revision agree. Only the real working owner animates under effective Full; every quiet member stays idle. Effective Reduce stops continuous avatar animation. Header, facepile wrapper and avatar buttons have no independent animation.
- Both previews cap at three, put the active owner first in stable member order and show exact +2 for five members. Profile avatar identity/state is checked against the actual scene and Host states. Long names remain safely truncated; each recorded header and popover fits its viewport and the document has no horizontal overflow.
- The actual native Session records prove exactly one post-request command and a matching successful result. A fresh Group completion follows that success and Host execution returns idle. Raw native logs and authentication remain private.
- Eight screenshots show runtime cases; motion itself is measured by running infinite animation counts in runtime-proof.json. The final identity/order verifier was also reapplied to every recorded case after its last tightening.

## Reproduce / Human QA

Use scripts/dev-instance.mjs to launch a fresh isolated loopback Profile with the linked worktree and machine-local credential injection. Set BH_E2E_ORIGIN, BH_E2E_HOME and BH_E2E_EVIDENCE (use a private directory). Run:

```sh
node scripts/e2e-group-motion-matrix.mjs prepare
node scripts/e2e-group-motion-matrix.mjs check
```

The script submits one real model request, validates the owned Orchestrator and exact native timer input, and approves that single harmless request once. Resume can reuse the newest matching pending request after a browser interruption; do not use it for completed work.

For Human QA, prepare a fresh scene and run human mode. Enter the latest five-member Group. Open the owner's DM and allow “Group motion Human QA”; return to the Group. Header and Profile should show at most three members plus +2, with Orbit first while active. In Settings → Bot mode, toggle Reduce motion and Full motion; quiet members should stay static, and Reduce should stop the owner's motion. Reload after selecting Reduce to check persistence. After roughly three minutes the owner posts GROUP_MOTION_DONE and returns idle. One- and three-member Groups are available for comparison.

This slice does not claim the remaining Group message-grouping/pinned-channel acceptance audit or all possible matrix combinations.
