# Compact Attention policy — #670

Real DSH 0.2.0-rc.1 Web Profile, same PersonaBot and policies, Chinese locale.

- Before/after dark and light pairs: 1500 × 1000 viewport; the same Attention policy is expanded. The shorter final section fits at the bottom of the Profile, so the viewport naturally includes more preceding Profile content.
- Before/after narrow pair: 1100 × 1000 viewport, 464px Channel content. No page-level horizontal overflow.
- Nine source classes, five edit actions, four explicitly read-only rows. The section remains initially collapsed.
- `before-measurements.json` / `after-measurements.json`: desktop section height 1526.5 → 538px (~65% reduction); narrow height 1526.5 → 549px. Full body width equals viewport width.
- `audit.png`, `edit.png`, `restored-audit.png` / `interaction-proof.json`: keyboard Tab/Enter opens Human DM audit details; Escape closes the dialog while preserving Profile. The existing modal saves queue delivery as Human revision 4 and resets to steer revision 5; a full reload retains the restored policy. Group digest inputs and Group override explanation remain reachable.
- The E2E uses the owning public API and real operational database, without mocking policy data. Existing real model/Turn proof for this fixture is in #667; this UI change does not create new model execution behavior.

Reproduce on an isolated helper-owned instance with `node scripts/e2e-source-policy-table.mjs`, setting `BH_E2E_ORIGIN`, `BH_E2E_HOME` and `BH_E2E_EVIDENCE`. An optional `BH_E2E_BOT_SLUG` selects an existing fixture; otherwise the script creates its own PersonaBot. Authentication stays in the machine-local cookie jar. Follow the PR's manual QA path to compare density, edit a rule and inspect its audit details.
