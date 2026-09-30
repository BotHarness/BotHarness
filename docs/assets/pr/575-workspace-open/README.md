# Workspace Host opening — #575

Verified against DSH **0.2.0-rc.1**, macOS, Chrome, Chinese locale, **1440 × 960**. The base screenshots use merged #574 (`82511e0f`); after screenshots use this Workspace implementation with the same paused QA PersonaBot, authorized Unicode/spaces directory, viewport and themes.

## Real runtime proof

- [before-dark.png](before-dark.png) / [before-light.png](before-light.png): ordinary Workspace path was static text.
- [after-dark.png](after-dark.png) / [after-light.png](after-light.png): the same expanded Workspace path is a menu button; the folder toggle and revoke control remain separate.
- [after-menu-dark.png](after-menu-dark.png) / [after-menu-light.png](after-menu-light.png): click opens DSH's detected directory applications, truthfully labeled as Host actions, plus Copy Host path; no directory download.
- Right-click and Shift+F10 open the same menu. Escape returns focus to its path button; copy uses a trusted browser click and the actual Host-resolved path.
- The real Finder and VS Code choices dispatched through DSH's existing native routes. Computer Use independently observed Finder's directory and README URL, and VS Code's Explorer entry and README URL in that same directory. [finder-workspace.png](finder-workspace.png) and [vscode-workspace.png](vscode-workspace.png) capture the native windows. VS Code remains in its own Restricted Mode.
- After loading a menu, the QA directory was temporarily moved. Selecting Finder showed the Host's `unavailable-workspace` error instead of opening stale data; the directory was restored in `finally`. [after-stale-target.png](after-stale-target.png) captures the failure. The public API Gateway also refused an extra client `path` argument; missing Grant identities and unknown Bots were rejected.
- A task-only Profile Patch disabled `open-in-app`. The real menu then retained exactly Copy Host path and its directory-specific explanation; clipboard copy succeeded. [unavailable-dark.png](unavailable-dark.png) / [unavailable-light.png](unavailable-light.png). The Patch was restored and the normal Host restarted for Human QA.
- Before/after public bridge snapshots are identical for the PersonaBot's Grants, owned Sessions, Assignment Access Preset and Bot path authority. This paused runtime fixture has **zero Sessions**, so it proves no Session is created; focused automated coverage separately seeds an Orchestrator and an Assignment with different cwd references and verifies both remain unchanged.

[e2e-result.json](e2e-result.json) and [unavailable-result.json](unavailable-result.json) record the assertions. The shared Memory menu also passed its existing real DSH E2E: reader selection, native directory/file open/reveal, clipboard, keyboard/context semantics, byte-for-byte Unicode/binary/large downloads, authenticated owner routes and unchanged Git state ([memory-regression-result.json](memory-regression-result.json)). No additional external editor save was claimed for this Workspace slice.

## Regression coverage and Human QA

The Workspace owner tests exercise the real Operational Database, Grant Store and current DSH Workspace Registry adapter: active/wrong-owner/revoked/missing Grants, replacement registry paths, unregistered and vanished directories. Client coverage checks the opaque Grant ID, fresh resolution before dispatch, unchanged Store state, no directory download, copy-only fallback and refused executable actions for revoked targets. The existing Memory menu tests remain in place.

For Human QA, open the isolated task Host, enter Bot mode, choose **Workspace Open QA**, expand **Workspace grants → 工程 project**, then click or right-click its displayed path. Choose Finder or Visual Studio Code, or copy the Host path. Shift+F10 and Escape should work from the focused path. The Bot is paused and its Grant remains active. Login tokens and instance details stay machine-local.

Reproduce with a task-owned dev instance and optional private fixture:

```bash
BH_E2E_INSTANCE=<private-dev-instance.json> \
BH_E2E_FIXTURE=<private-workspace-fixture.json> \
node scripts/e2e-workspace-file-actions.mjs <private-output-directory>
```

Without `BH_E2E_FIXTURE`, the driver creates a paused QA Bot and registered directory inside the isolated DSH home. For the unavailable variant, temporarily disable `open-in-app` in that task Profile, restart its exact Host, add `BH_E2E_UNAVAILABLE=1`, run the same driver, then restore the Patch and restart. The current native handoff proof requires Finder and VS Code installed on macOS; Windows, Linux and a deployed Tailscale/Cloudflare Tunnel were not exercised. All native actions target the Host rather than the browser device.
