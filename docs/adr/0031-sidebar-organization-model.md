---
Status: Accepted
Date: 2026-09-19
---

# Sidebar organization is per scope: sections, sort modes, and 未分组

Bot-mode sidebar order is: the pinned BOT grid (unchanged, always manual), then user-created **Channel sections** (collapsible, manually ordered, creation order until the user arranges them), then **未分组** at the bottom — flat, not collapsible, fixed position. Each scope carries a **sort mode**: `auto` (newest message first, by the Channel's `updatedAt`), `manual` (the user's frozen order), or `inherit` (follow the global default). Sections default to `inherit` and 未分组 always inherits; the global default is set from the Bots header `...` menu. The first manual drag inside a scope, or a drop into it, flips that scope to `manual` and freezes the order current at that moment — the source scope's mode is untouched — and 恢复自动 returns the scope to `inherit`.

The header copies the native Workspaces header: a `Bots` label on the left, icons on the right in native order **search → ellipsis (sort menu) → plus (create menu)**. The plus menu offers 创建 BOT (disabled placeholder until #41), 创建 Channel, and 创建 Channel section. A section header carries `+` (create a Channel that lands in that section) and `...` = 排序方式 (auto/manual/inherit, trailing check) → 重命名 → 删除, delete last in the danger slot. Rename opens a **Modal with an input** and delete a **Modal confirm with a red outline button** — DSH has no in-place rename and no two-click confirm, and `RiskConfirmation` is reserved for permission escalation. Deleting a section never deletes Channels: they fall back to 未分组. Moving is native HTML5 drag-and-drop replicating `ui-workspace` (insert-line gradient, half-row drop detection) plus a right-click `移动到 ▸ [sections + 未分组]` menu built on the `Menu` primitive (one-level submenu, cursor anchoring via the JsonTree proxy-rect recipe). Channel rename/delete are deferred.

All of this is display configuration and lives browser-local in `roster.json` (pins, sections, order, sort modes) — it extends the existing local-display-config decision and never enters Host storage, `bot.json`, or a SoulSnapshot. Row styling aligns with the measured native sidebar: section header 34px (`projectRow`), channel/session row 32px, `padding: 0 8px`, inter-row `margin-top: 2px`, section blocks 4px apart, hover/selected `--dsw-alias-interactive-bg-hover`, disclosure `IconTriangleRightFill14` rotating 90°, action glyphs only on hover, and no extra indentation for Channels under a section (native has none).

## Considered Options

- **Flat list, no ungrouped bucket** — rejected: Channels dropped out of a section would have nowhere stable to land; a bottom bucket makes removal non-destructive.
- **Store the arrangement on the Host** — rejected: ordering is per-browser display state; Host storage would leak it into exports and conflate display with Soul data.
- **Drag-only movement (no context menu)** — rejected: drag has no keyboard path; the `Menu` submenu keeps the action discoverable and is already a primitive.
- **One fixed sort (always newest-first)** — rejected: users arrange Channels by workflow; manual freeze with an explicit 恢复自动 escape matches the native feel.
- **In-place rename / two-click delete** — rejected: no such native pattern exists; Modal input and Modal confirm are the shell's affordances (ADR-0028).
- **A second dropdown/DnD library** — rejected: no component library in-harness; native HTML5 DnD plus primitives covers it (ADR-0028).

## Consequences

- `roster.json` grows a global default and per-scope `order`/`sortMode`; parsing stays defensive, with unknown shapes falling back to defaults.
- New client work splits into tickets: row styling, section management, sort modes, and move (drag + context menu).
- Spec §2/§5 and PRD US-1 carry the model; ADR-0028's update records the vendored-glyph exception.
- `CONTEXT.md` gains Section order / Sort mode / 未分组; "未分组" is a product term, not a synonym for a folder.

## Update (2026-09-19) — arrangement moves host-side

The second paragraph's "all of this is display configuration and lives browser-local in `roster.json`" no longer holds for the arrangement. Sections (name, membership, order) and pins move into the DSH storage domain `botharness_roster` on the host, exposed to the client through fine-grained `botharness/*` bridge methods; the rejected "store the arrangement on the Host" option is superseded — the arrangement is durable per-host data, like workspace order in `ui-workspace`. The sort mode moves into the DSH settings namespace `ui-bot-mode` (per-profile, cross-browser) so it can also appear as a General settings row, with the sidebar `...` menu reading and writing the same scope; only `collapsed` remains browser-local view state. The SoulSnapshot avoidance still holds — nothing here enters `bot.json` or a snapshot. The legacy browser `roster.json` is migrated once (arrangement into the domain, sort mode into the settings namespace) and kept as a backup. Details and the full map: ADR-0034.
