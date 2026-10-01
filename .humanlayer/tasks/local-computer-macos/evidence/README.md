# Local Computer QA evidence

Issue: #694. Status: **draft — native PersonaBot acceptance awaits Human authorization**.

These are raw screenshots from two isolated, running DSH 0.2.0-rc.1 Profiles, with the same English locale, mascot, Computer export fixture directory, idle duration and action approval setting. Both settings pairs use a 610 × 827 viewport. Before is the previously approved #692 build; after is this implementation. The original Computer settings are the absence-state entry point for the new Local Computer view.

## Verified

- Native Settings target selection persists through the Profile Patch and switches the running Host between local and container.
- Actual local setup installs/validates the pinned 0.28.0 binary and both runtime libraries; `doctor` and `check_permissions({prompt:false})` succeed with the existing Accessibility and Screen Recording grants.
- Actual local HTTP archive endpoints refuse with `400 container-only`; stale setup requests refuse with `409 target-changed`.
- Switching to container re-registers the upload route in streaming mode; its actual token/upload HTTP path saved 25 task-owned test bytes exactly. This is byte-transfer proof, not TAR import or Docker startup proof.
- The isolated Local QA PersonaBot replied through a real model Turn; its Computer Access and Browser Access remain off.
- Full suite: 1,855 passed, 2 optional native tests skipped before the final lifecycle changes. Final focused suite: 216 passed. Lint, format, typecheck and build passed; lint retains pre-existing warnings. Exact-head CI is tracked on the PR.

## Not run

- A model-facing native desktop observation or screenshot.
- A PersonaBot editing and saving the task-owned Cocoa window.
- Live OS permission revocation. Refusal and access revocation have automated regression coverage, but this is not a live OS revocation receipt.
- Channel Local Computer surface screenshots, because opening that surface requires enabling the Bot's Computer Access.

`native-before.jpg` shows the prepared test window, not successful Bot action. The Computer Use policy requires action-time confirmation before granting an agent new desktop access. No OS permission was enabled or revoked for this test. Do not mark #694 complete or merge this draft until the missing native acceptance succeeds.

## Runnable Human QA path

1. Use the existing task-owned isolated Profile and Local QA PersonaBot. Keep Auto-allow Computer actions off.
2. In Settings → Bot settings, select Local Computer and Check permissions. Container-only export/import and viewer controls should disappear. Switch to Docker Computer and back, then restart the same task-owned Host to confirm persistence.
3. After Human explicitly permits temporary desktop access, enable Computer Access only for Local QA.
4. Keep `scripts/fixtures/local-computer-qa.swift`'s Cocoa window open. Ask the Bot to use only that window, observe its accessibility tree without a whole-desktop screenshot, enter a unique proof string, and click Save proof. Approve its first action through the native DSH approval card.
5. Verify the window's Saved label and the fixture's proof file, capture raw before/after and the native approval evidence, then disable Local QA's Computer Access and verify refusal.
6. Run the read-only status probe with `BH_E2E_HOME`, `BH_E2E_ORIGIN` and `BH_E2E_REPORT` set to the isolated instance: `node scripts/e2e-local-computer.mjs`. Its pending-action fields describe that probe's scope; replace them only with separately captured real Bot acceptance evidence.
