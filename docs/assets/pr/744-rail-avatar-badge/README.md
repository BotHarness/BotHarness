# Numeric avatar badges in the collapsed app Rail — #744

Measured in real isolated DSH 0.2.0-rc.1 / Node 24.21.0 using the two still-live native Tool approvals from the accepted #740 instance. The badge is an approval count, not an unread-message count. Host count semantics and execution activity are unchanged.

## Observed before and after

| State  | Badge bounds         | Native clipping region         | Outcome               |
| ------ | -------------------- | ------------------------------ | --------------------- |
| Before | x=33.5, y=248, 14×14 | x=10, y=250, 35px wide         | right and top clipped |
| After  | x=29.5, y=252, 14×14 | same region and overflow rules | fully visible         |

The shared Avatar uses negative top/right offsets. Only Rail badges now inset both to zero. Changing either alone still clips the other edge; changing both fits. Native sidebar/region overflow and scrolling remain untouched. Expanded/pinned Avatar styling outside Rail keeps the existing offset and semantic colors.

`before.png` and `before-proof.json` were captured by the persisted E2E with the Rail override temporarily absent. It failed specifically with `Rail numeric badge crosses a clipping ancestor` and restored pin preferences. Restoring the fix made the same script pass all four light/dark × ordinary/pinned first-row cases. `proof.json` records the real Host count (2), ancestor bounds and successful pin restoration. The script additionally replaces only rendered badge text with `12` and `99+` to stress label width, checks visibility and restores the original text; these are presentation checks, not fabricated Host approvals. All published screenshots show the actual count 2.

## Reproduce

1. Boot an isolated profile with `scripts/dev-instance.mjs` using this worktree, the pinned DSH version and an isolated home. Arrange a real PersonaBot DM with a live native Tool approval; the existing `scripts/e2e-orchestrator-activity.mjs` approval-attention HOLD path can retain that state.
2. Set `BH_E2E_ORIGIN`, `BH_E2E_HOME`, `BH_E2E_CHANNEL_ID` and `BH_E2E_EVIDENCE`, then run `node scripts/e2e-rail-avatar-badge.mjs` from the checkout. The launcher-owned private cookie jar authenticates the existing API Gateway.
3. The script temporarily toggles only the target Channel pin preference through existing `rosterGet`/`pinsSet`, checks both themes and first-row positions, then restores the original pins in `finally`. It neither decides approvals nor modifies Host attention counts.

Screenshots are direct cropped browser viewport captures. No image editing, authentication, raw Tool arguments or machine paths are published. The borrowed pattern is the existing native 36px Rail button with a 32px PersonaBot Avatar and its semantic count badge; the only deviation is a Rail-local inset to fit the measured native 35px clipping viewport.
