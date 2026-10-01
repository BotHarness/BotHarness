# Active-Turn Memory observation — #528

Real DSH **0.2.0-rc.1**, `deepseek-official / deepseek-flash / low`, isolated profile, real model requests and native Session events.

## Verified path

1. The first Human DM holds its Orchestrator Turn at approval for one harmless two-second timer. Native evidence has one `turn/start` and no `turn/end`.
2. An external editor writes `external-steer-qa.md` in that Bot’s Memory Repository.
3. A second Human DM steers the held Turn. Its native `agent/inbox/spliced` event targets `next-step` and contains the Memory path summary. The fixture’s file body is asserted absent from the injected context.
4. The durable Memory notification is `processing` while held and `handled` when that same native Turn finishes.
5. Another ordinary DM completes without creating a duplicate Memory notification. Host restart retains the same handled notification and unchanged file, with the Bot idle.

The notification describes net Memory changes without attributing an editor. No independent Memory wake or file-body injection is introduced. Bot Inbox notification history is expanded in the screenshot.

## Evidence

- [Held native approval and steered DM](held-second.png)
- [Real Bot reply after the same Turn](settled.png)
- [Expanded handled Memory notification](memory-inbox.png)
- [Native event and durable-state proof](proof.json)

## Reproduce

Start an isolated instance using `scripts/dev-instance.mjs` and retain its machine-local cookie. Run `node scripts/e2e-dm-delivery.mjs` with:

```text
BH_E2E_ORIGIN=<isolated origin>
BH_E2E_HOME=<isolated DSH_HOME>
BH_E2E_MEMORY=1
BH_E2E_SOURCE=human-dm
BH_E2E_DELIVERY=steer
BH_E2E_EVIDENCE=docs/assets/pr/528-memory-steering
```

After completion, restart that exact Host without changing its profile or bundle version. Query `botAttention` for the fixture Bot: exactly one `memory-change`, the same notification ID, still handled. The file must remain unchanged and the Bot idle.

## Human QA

Open **Memory steering human-dm steer QA 1790878698732** in Bot mode. Its DM contains `Delivery second confirmed` and `Memory next turn confirmed`. Expand **Bot Inbox → System → Handled or ignored**: `external-steer-qa.md` should show **Handled**. Open **Memory files** to inspect that file. Refresh and confirm the one handled notification remains.

## Automated regression

The owning-module fixture holds the active Agent execution and exercises accepted steering, refused steering, interrupted execution and failed Memory admission. It checks same-turn summary delivery without file contents, no duplicate on repeated steering, retry after failure and next-turn recovery. Existing Memory lifecycle and Human DM tests cover between-turn changes, restart recovery and transactional admission.
