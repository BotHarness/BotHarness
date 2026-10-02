# Safe tool Activity — real DSH evidence

Refs #122. Base: `e16e79fd`; after: this PR. DSH `0.2.0-rc.1`, actual DeepSeek V4 Pro / off, Chinese UI, dark and light themes, 1500 × 1180.

Independent isolated instances use the same fixture display name and harmless two-second native Shell timer. Their generated avatar seeds and retained message histories differ; activity state and viewport are matched. The machine-local QA directory is redacted in the authorized approval UI before capture.

| State                                    | Before              | After              |
| ---------------------------------------- | ------------------- | ------------------ |
| Ordinary sidebar + composer              | `before.png`        | `after.png`        |
| Pinned keyboard focus                    | `before-pinned.png` | `after-pinned.png` |
| Rail hover                               | `before-rail.png`   | `after-rail.png`   |
| System reduced motion                    | `before-reduce.png` | `after-reduce.png` |
| Keyboard disclosure                      | Absent in baseline  | `details.png`      |
| Actual tool result, real Bot reply, idle | Existing lifecycle  | `settled.png`      |

`before-proof.json` and `after-proof.json` contain allowlisted Activity snapshots, DOM labels, native event types/times and tool identifiers only. They exclude raw arguments, results, credentials and reasoning. The original Shell approval is authorized Session UI; its synthetic timer is shown there, not in the Activity payload or disclosure.

Verified: execute → executing in ordinary/pinned/rail/composer; keyboard focus reveals the native tooltip; Enter opens the safe current summary; Reduce motion keeps text and disables avatar animation; approval executes the real timer, the Bot sends its exact confirmation, and a native Turn end returns both views to idle. Unit coverage additionally verifies exhaustive/fallback kind mapping, concurrent pairing, mixed kinds, same-state revisions, post-commit Cordis notifications, rebuild and disposal.

Run `scripts/e2e-safe-tool-activity.mjs` with `BH_E2E_ORIGIN`, `BH_E2E_HOME`, `BH_E2E_EVIDENCE`; it uses the isolated instance cookie jar. `BH_E2E_PHASE=before` captures the unmodified baseline; `BH_E2E_HOLD=true` preserves the real pending approval for Human QA. Optional `BH_E2E_RECONNECT_BOT`, `BH_E2E_USE_PENDING`, `BH_E2E_MODEL`, `BH_E2E_EFFORT` reuse a fixture and registered route. Never publish the cookie jar or token URL.

The `light-*` images and allowlisted proof repeat the same real pending tool in the native system light theme; the native summary, focus tooltip, rail card and reduced-motion rendering were inspected. The disclosure borrows the COSS/shadcn compact collapsible convention but uses native HTML details/summary plus DSH chevron and tokens; no external accordion or transcript panel is added.

`rail-focus.png` and `light-rail-focus.png` verify focus after moving the pointer away: the native inline HoverCard opens, and the Rail button accessible name contains the same safe summary. The final execution verifier requires a fresh Bot confirmation after this approval and limits native proof to the current call window.
