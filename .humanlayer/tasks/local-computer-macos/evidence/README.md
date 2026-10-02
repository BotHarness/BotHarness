# Local Computer QA evidence

Issue: #694. Status: **real native PersonaBot acceptance passed; awaiting Human QA**.

## Actual native acceptance

After explicit Human authorization, the isolated Local QA PersonaBot used the existing Computer Provider and native DSH approval card. Its real model Turn 4 performed six pid-scoped Computer calls against only the task-owned Cocoa window: list windows, observe AX, background input, observe AX, background Save proof, observe AX. Every action token came from the latest observation. The field and Saved label both contained `BH694-NATIVE-20261002-LOCAL-QA`; an independent read of the saved file matched exactly. No Shell, Browser, other app, whole-desktop capture, foreground input or OS permission change was used.

Computer Access was then disabled. The real next Turn 5 request exposed zero Computer tools and made zero Computer calls; the Bot reported that Access was off and stopped desktop operations. Browser Access and Auto-allow also remain off. Six actual Computer Audit events contain neither input text nor element tokens.

`native-acceptance.json` is a sanitized receipt asserted against canonical Native Session events, actual proof-file bytes and actual Computer Audit rows. `native-approval.jpg` shows the native first-action approval; `native-success-channel.jpg` shows the Bot's verified result; `access-revoked.jpg` shows the disabled Access and subsequent reply. Raw session logs remain private.

The first attempt, Turn 3, returned only a window count to the model and stopped without guessing or editing. Pinned DSH's Native MCP projection reads text/image `content`, while the driver also returns window IDs and element tokens in `structuredContent`. Computer now mirrors that payload into model-visible JSON text, retains the canonical value and image blocks, and excludes observations from Audit. A regression exercises the actual Native output renderer. The successful Turn 4 used this fix; the first failure is preserved in the receipt rather than treated as a flaky pass.

## Other verified behavior

- Native Settings target selection persists through the Profile Patch and switches the running Host between local and container.
- Actual local setup validates pinned 0.28.0 and both runtime libraries; `doctor` and `check_permissions({prompt:false})` succeed with existing Accessibility and Screen Recording grants.
- Actual local HTTP archive endpoints refuse with `400 container-only`; stale setup requests refuse with `409 target-changed`.
- Container switching re-registers the streaming upload route; its actual token/upload HTTP path saved 25 task-owned bytes exactly. This is transfer proof, not TAR import or Docker startup proof.
- Focused Computer/Core suite: **217 passed**. Final Native renderer regression suite: **16 passed**. Lint, format, typecheck, build and release ledgers passed; lint retains pre-existing warnings. Full required checks run on the PR's exact head in CI. The earlier local full suite had 1,855 passes and two optional native skips before final lifecycle changes; it is not an exact-head full-suite receipt.

`local-readback.json` separately records the post-revocation read-only Host probe. Its native action/capture fields describe only that probe, not the model acceptance above. `stream-compat.json` records the actual container upload bytes.

## Screenshots and scope

Settings pairs are raw captures of two isolated running DSH 0.2.0-rc.1 Profiles at 610 × 827, with matched English locale, theme and representative configuration. Before is approved #692; after is this implementation. The original container Settings view is the entry point for the new Local view.

`native-before.jpg` and `native-after.jpg` are raw 1560 × 904 captures of the task-owned fixture before input and after saving. They are functional evidence, not a styling comparison: the earlier prepared fixture used dark appearance and the successful fixture used light appearance. The Bot operated through background AX while the window was minimized; the verified saved window was raised only for readable evidence capture, after Access was disabled. These captures came from the independent CUA native window surface, not from the PersonaBot driver.

**Not run:** driver screenshot capture and live OS permission revocation. This slice proves native AX observation/edit/save and live per-Bot Access revocation. Automated tests cover missing OS grants and target revision refusal; they do not substitute for either unrun native modality. No OS permissions were changed.

## Runnable Human QA

1. Open the isolated QA Profile and Local QA DM. Computer Access, Browser Access and Auto-allow should be off; the final reply confirms Access revocation. The task-owned window shows the saved proof.
2. In Settings → Bot settings, select Local Computer and Check permissions. Container-only viewer, transfer and idle-stop controls disappear. Switch to Docker Computer and back; explicit selection persists through restarting this isolated Host.
3. To repeat native actions, explicitly authorize temporary Local QA desktop access, enable only its Computer Access and keep Auto-allow off. Use `scripts/fixtures/local-computer-qa.swift`'s window and approve the first native tool through the DSH card.
4. Ask the Bot to observe only that window without screenshots, input a unique proof through a fresh AX token, click Save proof and re-observe. Compare the field, Saved label and proof-file bytes; disable Access and verify a subsequent Turn exposes no Computer tools.
5. The separate read-only Host probe runs with `BH_E2E_HOME`, `BH_E2E_ORIGIN` and `BH_E2E_REPORT`: `node scripts/e2e-local-computer.mjs`. Its output does not itself prove native Bot action.
