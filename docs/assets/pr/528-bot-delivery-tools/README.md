# Bot-operated delivery policy acceptance

Refs #528. Task: `codex/local/01a0e445-0c0f-70e1-bad4-fd99c8cfaa21`.

## Real DSH path

DSH 0.2.0-rc.1, isolated Profile, existing application-owned source policy store.
The real DeepSeek Flash / low Orchestrator called `source_attention_set` three
times to select `turn` for Human DM, Bot DM and Group mention, then
`source_attention_reset` once to restore Human DM. Native Session history shows
four successful policy Tool results in two completed Turns. No Shell approval or
alternate policy store is involved.

| State     | Human DM                                 | Bot DM / Group mention      |
| --------- | ---------------------------------------- | --------------------------- |
| Before    | steer, revision 1, built-in              | steer, revision 1, built-in |
| Bot save  | turn, revision 2, Bot                    | turn, revision 2, Bot       |
| Bot reset | steer, revision 3, Bot, restored default | turn, revision 2, Bot       |

The screenshots use the same fixture, dark theme, locale, 1500 × 1000 viewport
and Human-DM audit dialog. The visible rule and audit change; surrounding
activity totals increase because these are real model Turns. Before was captured
from the base Host Bundle; after uses this PR's Bundle. The UI itself is unchanged.
`after-restart.png` and `restart-policies.json` verify a real Host restart retained
the expected rules and Bot attribution.

## Reproduce

Set `BH_E2E_ORIGIN`, `BH_E2E_HOME`, `BH_E2E_EVIDENCE` and run
`node scripts/e2e-bot-delivery-tools.mjs`. For matched revision captures, run
`BH_E2E_STAGE=before` against the base Bundle, restart that task-owned Host on the
PR Bundle, then run `BH_E2E_STAGE=complete`. Restart once more and run
`BH_E2E_STAGE=verify`. The local helper's private cookie jar provides authentication;
no token or credential is included in this directory.

## Remaining #528

This proves Bot policy Tool wiring and persistent visible results. Live Bot-DM
steering, unchanged Group-mention steering and the external Memory observation
boundary remain separate acceptance slices; this PR does not close #528.
