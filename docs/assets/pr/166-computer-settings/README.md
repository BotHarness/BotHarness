# Computer Settings #166 acceptance

The Client screenshots are raw, unedited JPEGs at 1280×720, English locale. The matched
before/after fallback pairs use the same DSH 0.2.0-rc.1 browse-picker composition, directory,
30-minute idle setting, viewport and theme. The before application code is identical to
base `be11a7a5f15cd4e0db1b06e44f57d324288d0a44` (captured from the existing #493 acceptance checkout).
The browse composition intentionally exercises a Host without a native OS chooser: on this
RC, `uiWorkspace.pickDirectory()` is the native command, while workspace-owned Slots render
the separate browse flow. BotHarness keeps manual entry for this deployment.

## Verified through real production seams

1. Open native Settings → Bot settings → Computer.
2. Trigger an unavailable picker; manual path entry stays available. Enter an absolute
   export directory and Save; the real Host uses it without restart.
3. Set idle stop to 60 minutes. Export shows an explicit authorization step and destination;
   Cancel does not invoke transfer.
4. The isolated Docker volume contains `bh166-proof.txt` with `original-166-proof`.
   Authorize export through Settings; a real TAR is written to the configured directory.
5. Change that isolated volume file to `changed-after-export`.
6. Import lists the real archive. Selecting it requires a separate Authorize and import.
   After accepting, the UI reports success, Docker restarts, and the file again contains
   `original-166-proof`. The read-back probe compares the TAR member and restored volume.
7. Reload Client; export directory and idle stop remain persisted. Inspect light and dark.
8. Real Host probes refuse export/import without `authorize:true`, absolute/traversing archive
   names, and a relative export directory (five HTTP 400 responses).

`complete.json` is the credential-free read-back report. Run `scripts/e2e-computer-settings.mjs`
with `BH_E2E_HOME`, `BH_E2E_ORIGIN`, `BH_E2E_EXPORT_DIR`, `BH_E2E_ARCHIVE`, `BH_E2E_VOLUME`,
`BH_E2E_UI_RESULTS` and `BH_E2E_REPORT` pointing at the isolated QA fixtures. The script only
reads the archive and volume and sends negative probes that must refuse before side effects.
Use a dedicated `botharness-computer-<id>-qa-config` volume and matching container.

## Native system picker: Human QA pending

The native service receiver is preserved and covered by a receiver-dependent registration test.
A real macOS Host then launched its official `Select Workspace Directory` chooser, but the
available automation could not bind that `osascript`-owned system window. **Native selection
and the picker-selected destination across export/import are not E2E PASS.** The authorized
chosen-directory save, save refusal/no-export, cancellation and manual fallback have 46 focused
Client tests; the real Docker round trip above uses manual directory entry. No fake chooser was
used to claim native selection.

For Human QA, the delivery Profile returns to DSH's default auto/native picker. Open Export to…,
select a different directory, verify its name before Authorize and export, then ensure Current
changes and Import… lists the new archive without restarting. Cancel once and confirm the old
directory remains. The Container and volume are isolated; its final state is stopped.

Desktop streaming frames and model-driven actions are outside this Settings acceptance.
