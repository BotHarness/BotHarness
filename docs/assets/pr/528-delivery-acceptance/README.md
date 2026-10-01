# DM delivery acceptance — #528

This first acceptance slice repairs the public Remote adapter for the existing Human-editable source policies. The Gateway rejected the Client `delivery` argument before the owning method ran. The canonical Source Policy store, revision/actor audit and existing steering lifecycle are retained.

## Real DSH proof

- DSH 0.2.0-rc.1, DeepSeek Flash / low, isolated Web Profile.
- `steer/proof.json`: a real Shell approval holds Turn 1; a second Human DM is admitted while that Turn is open, both messages finish, and native Session history contains exactly one Turn start/end.
- `turn/edit-turn.png` and `turn/final-policy.png`: Human changes the existing Profile modal to queue-only, saves and sees revision 2; `turn/proof.json` contains exactly two native Turn starts/ends, and both DMs are handled.
- A queued prompt can already have a claimed/running Admission while waiting for Turn 1 to end; native Turn events distinguish queue delivery from a steer. The test does not infer Turn identity from a receipt or activity label.
- Approval is restricted to the exact harmless command `node -e "setTimeout(() => {}, 2000)"`, for this fixture's Orchestrator; machine-local approval directory text is redacted in screenshots.

## Reproduce

Launch an isolated Host using `scripts/dev-instance.mjs`. Pass its origin, home and output directory as `BH_E2E_ORIGIN`, `BH_E2E_HOME` and `BH_E2E_EVIDENCE`, then run `node scripts/e2e-dm-delivery.mjs`. `BH_E2E_DELIVERY=steer` is the default; use `turn` to exercise the actual Profile modal. Authentication stays in the machine-local helper cookie jar. Native Turn records are read through DSH's existing `session/follow` Remote stream; no debug endpoint or alternate store is added.

The regression also covers all three editable immediate source classes through the public bridge and real operational database, including reset audit. The issue remains open for Bot-operated policy tools and sibling live Bot-DM / Group-mention acceptance after this Human slice is validated.
