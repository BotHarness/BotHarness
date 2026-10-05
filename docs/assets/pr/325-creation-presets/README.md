# Creation persona starting points — #325

The creation form offers Blank, Colleague and Roleplay. Each keeps its own editable draft; changing the memory source to Git hides this editor and does not submit the local persona. The default remains Blank. The selected draft is sent as the existing `create.persona` string and persisted into canonical PERSONA.md; no archetype identifier is stored or used by runtime permissions or model selection.

## Verification

- 117 focused tests pass: form edit/switch/submit and Git isolation; Bridge forwarding; registry persona persistence; token guard.
- Real DSH 0.2.0-rc.1 API creation: edited Chinese colleague text, edited English roleplay text and blank through the production API Gateway/Typert creation endpoint. The canonical files exactly match the submitted text; blank retains the existing empty-memory path. No extra model preset or Workspace is assigned.
- The same isolated Profile was actually cold restarted. `prepare.json` and `restart.json` are equal, retaining identities and exact persona hashes. These are backend runtime proofs, not browser click or visual proof.

Run `scripts/e2e-persona-creation-presets.mjs prepare` against a fresh isolated Profile, using BH_E2E_ORIGIN, BH_E2E_HOME and BH_E2E_EVIDENCE; restart that exact Host/Profile, then run the `restart` phase. Launch with `scripts/dev-instance.mjs`; keep its login URL and cookie jar private.

## Human UI QA still required

Agent browser tooling explicitly refused access to the local page. It was not bypassed with another driver, browser or proxy. No synthetic screenshot replaces real UI evidence; the PR stays Draft pending Human screenshots and visual acceptance.

1. In the isolated DSH instance, enter Bot mode and choose New PersonaBot. Capture the existing base creation dialog separately for a Before comparison where available.
2. Select Colleague, edit the identity and collaboration text; switch to Roleplay and then back. Confirm the edited colleague draft is retained. Capture the picker and edited text in the actual dialog (light and dark).
3. Create the Bot. Verify its name, Profile and canonical PERSONA.md contain the exact submitted text, and normal tools/permissions are unchanged.
4. Repeat with Roleplay and Blank. Blank may remain empty; confirm a blank Bot creates normally. Git import must hide the persona editor and retain the imported persona.

There is no implementation screenshot or completed full-UI E2E claim until those Human captures are supplied.
