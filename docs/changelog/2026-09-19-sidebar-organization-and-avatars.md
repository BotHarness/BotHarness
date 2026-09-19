---
title: Sidebar organization and avatar strategy (ADRs 0031/0032; spec v1.10)
date: 2026-09-19T12:00:00+08:00
tags: [spec, prd, adr, client]
---

- **ADR-0031 — Sidebar organization**: pinned BOT grid (unchanged, manual) → user-created Channel sections (collapsible, manually ordered, creation order by default) → 未分组 fixed at the bottom. Per-scope **sort mode** `auto` / `manual` / `inherit` (sections default to inherit, 未分组 always inherits, global default in the Bots `...` menu); the first manual drag or drop flips a scope to manual and freezes its order, the source scope is unchanged, and 恢复自动 returns to inherit. Header icons follow the native order `search → ... → +`; section `+` creates a Channel inside that section, `...` = sort mode → rename (Modal input) → delete (Modal confirm with a red outline button, Channels fall back to 未分组). Movement is native HTML5 drag-and-drop replicating `ui-workspace` plus a `移动到 ▸` context submenu on `Menu`; Channel rename/delete are deferred. Display config stays browser-local in `roster.json`; row geometry matches the measured native sidebar (34px section header, 32px rows, `padding: 0 8px`, 2px/4px gaps, no extra indentation).
- **ADR-0032 — Avatars and icons**: the default avatar is a static blobatar generated deterministically from the bot slug; DM Channel rows show the bot avatar, group Channels a glyph. Missing DSH glyphs (hash/group chat first) are vendored Lucide (ISC) first-party components, and `packages/client/THIRD_PARTY_NOTICES.md` ships in the package `files`. Custom avatars and motion/expressions become v1.1 tickets; the Grok Bot identity is not cloned (bloub's MIT covers code only), and the repo still needs a root `LICENSE` before any MIT code is copied.
- ADR-0028 update: vendored external glyphs fill icon-set gaps; our UI still uses DSH tokens and primitives only, no component library.
- Research: `docs/research/2026-09-19-avatar-and-icon-references.md` (blobatar, bloub, icon-set comparison, the grokbot article fact-check).
- Spec v1.10, PRD v1.4; M3 tickets drafted for row styling, section management, sort modes, move, avatars/icons, and the license/notices gap.
