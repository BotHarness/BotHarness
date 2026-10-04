# Workspace Grant attention — real isolated DSH

This evidence uses DSH 0.2.0-rc.1, Node 24.21.0 and a real DeepSeek Flash/low model. No Session events or request records were fabricated.

- `before-grant-not-indicated.png`: accepted base build in a separate fresh Profile; the actual model-created request existed, but shared sidebar/composer attention did not include it.
- `grant-pending-light.png` / `grant-pending-dark.png`: pending real request, shared count 1 and idle execution, 1500 × 1000. Final images show the retained Human QA Bot after restart.
- `overview-pending-grant.png`: the same pending count and execution in Activity Center Overview.
- `reconnected-authorized-idle.png`: an authenticated Grant-linked Human reply while the browser was offline, actual model confirmation, then recovered zero attention without a reload. Recaptured after settling to omit the transient reconnect overlay. Only a machine-local workspace path is redacted before capture.
- `before-restart-pending.png` / `restart-pending-grant.png`: unresolved action remains after a real process restart with a new generation and idle execution.
- `restart-authorized-idle.png`: actual post-restart authorization and model reply, count cleared.
- `human-qa-pending-grant.png`: retained pending request for Human operation.

`proof.json` contains bounded Host snapshots, safe stream frames and Overview agreement, including ordinary-text non-resolution, source-key dismissal and offline recovery. `restart-proof.json` records the changed generation and cleared post-authorization snapshot. Neither contains credentials, login URLs, paths or native Session payloads.

Run `scripts/e2e-grant-attention.mjs` with task-local `BH_E2E_ORIGIN`, `BH_E2E_HOME` and `BH_E2E_EVIDENCE`; use `before` against a fresh base Profile, `check` against the PR Profile, restart its verified exact PID, then `restarted`. The automated authorization uses the authenticated public Workspace/Grant and Channel reply commands; Human QA exercises the existing folder-choice action. The first navigation attempt and an attempt to request another Grant on a Bot already authorized failed; private logs are retained. The final independent-Bot run and actual restart both passed.
