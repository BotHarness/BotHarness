# Peer delivery acceptance — #528

Real DSH **0.2.0-rc.1**, `deepseek-official / deepseek-flash / low`; isolated profile, actual model requests. No production behavior or UI was changed in this slice.

## Results

| Source        | Delivery | Held receipt | Held native injection | Final native turns | Proactive reads |
| ------------- | -------- | ------------ | --------------------- | ------------------ | --------------- |
| bot-dm        | steer    | running      | next-step             | 1                  | 0               |
| bot-dm        | turn     | pending      | none                  | 2                  | 0               |
| group-mention | steer    | running      | next-step             | 1                  | 0               |
| group-mention | turn     | pending      | none                  | 2                  | 0               |

The first Turn remains held at native Shell approval for the exact harmless two-second timer, with one `turn/start` and no `turn/end`, before the second source arrives. Bot-DM sources come from another real PersonaBot calling `bot_dm_send` exactly once; their author, causal fields and successful native tool result are recorded. Group messages use a structured direct mention.

The Human first authorizes reporting a peer marker as **data**. Peer content does not authorize Human replies, Shell, delegation or Memory writes. Active delivery must produce a native `agent/inbox/spliced` event targeting `next-step`. Queued delivery must leave the marker pending and absent from native inbox injection while held, then finish in a second native Turn. Native `channel_read` / Inbox read calls are prohibited and asserted absent, so proactive reads cannot masquerade as automatic delivery. Both source receipts must finish handled.

## Runnable verification

Launch a fresh isolated instance through `scripts/dev-instance.mjs`; retain its machine-local cookie. Set these environment variables before running `node scripts/e2e-dm-delivery.mjs`:

```text
BH_E2E_ORIGIN=<isolated origin>
BH_E2E_HOME=<isolated DSH_HOME>
BH_E2E_SOURCE=bot-dm | group-mention
BH_E2E_DELIVERY=steer | turn
BH_E2E_EVIDENCE=docs/assets/pr/528-peer-delivery/<source>-<delivery>
```

Run the four combinations sequentially. The default source remains `human-dm`. The script opens the real policy editor, changes queue mode, sends real sources, approves only the expected timer, records native Session events through `session/follow`, and captures the actual UI. Bot-to-Bot DM opens through the sender’s linked notification; it is not an app-sidebar row. Failed screenshots stay in the ignored task directory; outstanding approval cards are rejected on failure. Screenshots mask only the machine-local working directory on native approval cards.

## Human QA fixtures

### bot-dm-steer

- Receiver: **DM delivery bot-dm steer QA 1790874356173**
- Profile → Attention policy: `bot-dm` should display `steer`.
- Human DM: timer approval settled; visible reply includes `Peer second confirmed bot-dm steer`.
- Sender: **Peer sender steer QA 1790874357492**; click its linked Bot-DM action to inspect the source.
- [Held source](bot-dm-steer/held-source.png) · [Settled source](bot-dm-steer/settled-source.png) · [Human reply](bot-dm-steer/settled.png) · [Policy](bot-dm-steer/final-policy.png) · [Native proof](bot-dm-steer/proof.json)

### bot-dm-turn

- Receiver: **DM delivery bot-dm turn QA 1790874387194**
- Profile → Attention policy: `bot-dm` should display `turn`.
- Human DM: timer approval settled; visible reply includes `Peer second confirmed bot-dm turn`.
- Sender: **Peer sender turn QA 1790874388319**; click its linked Bot-DM action to inspect the source.
- [Held source](bot-dm-turn/held-source.png) · [Settled source](bot-dm-turn/settled-source.png) · [Human reply](bot-dm-turn/settled.png) · [Policy](bot-dm-turn/final-policy.png) · [Native proof](bot-dm-turn/proof.json)

### group-mention-steer

- Receiver: **DM delivery group-mention steer QA 1790874425474**
- Profile → Attention policy: `group-mention` should display `steer`.
- Human DM: timer approval settled; visible reply includes `Peer second confirmed group-mention steer`.
- Group: **Peer Group steer QA 1790874426311**; inspect its structured mention.
- [Held source](group-mention-steer/held-source.png) · [Settled source](group-mention-steer/settled-source.png) · [Human reply](group-mention-steer/settled.png) · [Policy](group-mention-steer/final-policy.png) · [Native proof](group-mention-steer/proof.json)

### group-mention-turn

- Receiver: **DM delivery group-mention turn QA 1790874324745**
- Profile → Attention policy: `group-mention` should display `turn`.
- Human DM: timer approval settled; visible reply includes `Peer second confirmed group-mention turn`.
- Group: **Peer Group turn QA 1790874325544**; inspect its structured mention.
- [Held source](group-mention-turn/held-source.png) · [Settled source](group-mention-turn/settled-source.png) · [Human reply](group-mention-turn/settled.png) · [Policy](group-mention-turn/final-policy.png) · [Native proof](group-mention-turn/proof.json)

## Boundaries

- Focused regression tests: `bot-dm.test.ts` and `group-mention.test.ts`, **17 passed**. Local lint, typecheck, script syntax and changed-file format passed; build succeeded through the isolated launcher. Full Linux CI runs on the PR.
- A preliminary Group queue run actively called `channel_read` and joined its result into the running Turn; this was a fixture confound, not a delivery failure. The final proof prohibits proactive reads and verifies two Turns.
- The external observation → Memory-write trust boundary remains a separate #528 acceptance slice; this PR does not close #528.
- Ordinary acceptance automation/evidence does not change user behavior and has no Release Ledger entry.
