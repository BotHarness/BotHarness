# Group messages and pinned Group avatars — #124

Verification-only slice of the existing production Group shell. The final recorded run uses real DSH 0.2.0-rc.1 with DeepSeek Flash / low. Two actual PersonaBot Orchestrators make eight successful `channel_send` calls; the authenticated public Channel query supplies the ten-message timeline. No Bot-author messages, tool results or UI state are mocked.

## Recorded behavior

| Timeline                              | Expected UI                                  |
| ------------------------------------- | -------------------------------------------- |
| Atlas first / second                  | One identity header/avatar, two bubbles      |
| Boreal first / second                 | New identity group                           |
| Human separator                       | Human presentation; breaks Boreal grouping   |
| Boreal after Human first / second     | New Boreal identity group                    |
| Quiet removed (public member command) | Centered system item; breaks Boreal grouping |
| Boreal after system first / second    | New Boreal identity group                    |

All three separator boundaries fall within the 15-second grouping window. This distinguishes identity/Human/system separation from a timeout-only break. The native call/result times surround each committed Bot message, each result succeeds, and the owning Sessions belong to the corresponding Bots. The actual DOM has exactly one header/avatar per pair, Bot avatars on the left and separate Human/system presentation.

A generated 128×128 WebP test fixture is saved through the existing public Group-avatar command. Existing public pin persistence is used: the Group shows the custom G avatar and a second Group without an avatar shows the hashtag SVG. Both survive page reload, use the existing rounded clipping, and render in the collapsed App Sidebar rail. This checks the existing read model, not a new crop/upload lifecycle.

Five actual screenshots cover the light/wide timeline and pinned avatars, dark/wide rail, and dark/narrow timeline at its top and bottom. The narrow page has no horizontal overflow. Raw native logs, credentials, cookie and one-shot URLs stay private. `runtime-proof.json` contains only bounded QA identities/messages and checks.

## Reproduce

Launch a fresh isolated loopback DSH with `scripts/dev-instance.mjs`, linked to this worktree, and the machine-local model key. Set `BH_E2E_ORIGIN`, `BH_E2E_HOME` and `BH_E2E_EVIDENCE` (a private output directory), then:

```sh
node scripts/e2e-group-shell.mjs prepare
node scripts/e2e-group-shell.mjs check
```

Use a fresh scene for each new run. After interruption, check mode can inspect already committed exact messages, but deliberately rejects separator gaps over 15 seconds. It must not claim a failed/partial scene as success. The script removes its own Quiet QA member and sets two QA pins in the isolated Profile; it does not modify an existing Human deployment. Native reads use authenticated `session/follow` and the installed API Gateway transport.

## Human QA

Open the supplied isolated URL, enter Bot mode and open the newest **Group shell QA 1791124269787**. Check consecutive Atlas/Boreal bubbles share one identity header; Human and Quiet's removal separate Boreal's later pairs. Scroll to the bottom to see the system break. In the left pinned area, G is the custom Group avatar and the hashtag is the empty-avatar Group; collapse the App Sidebar and refresh to check both remain correct. Atlas and Boreal DMs continue to open as ordinary PersonaBot conversations.

## #124 acceptance map

- #782: real multi-Bot activity, own safe summaries, keyboard interaction, native approvals and idle recovery.
- #786: max-three active-first header/Profile chips, accurate +N, keyboard/hover, reconnect and layout.
- #794: simultaneous Orchestrator/Assignment, shared snapshot/revision, reconnect and actual completion.
- #799: one/three/five members, long names, narrow/wide, shared motion choices, quiet isolation and preference persistence.
- This slice: actual author/Human/system grouping and pinned custom-avatar/hashtag fallback with reload/rail.

These are selected runnable acceptance paths, not every Cartesian combination. #124 remains open pending this final Human QA. No sibling scope or production behavior changes were required, so ordinary test/evidence work adds no Release Ledger entry.
