---
title: SoulSnapshot & Soul registry decisions
date: 2026-09-18T12:00:00+08:00
tags: [spec, adr, platform]
---

## Decisions

- **ADR-0019 — the Soul registry is a hosted service.** Sharing PersonaBots runs on Cloudflare Workers + Hyperdrive → PlanetScale (MySQL, Drizzle) with R2 for snapshot objects; accounts use BetterAuth (email OTP via Cloudflare Email + Google). Phase 1 shares single bots; publishing is public by default with automated upload gates (schema, file-type allowlist, size, secret scan hard-reject) and takedown-on-report; the in-harness one-click share and bot sets come later.
- **ADR-0020 — SoulSnapshot is an immutable, content-addressed package.** Export freezes persona + selected memory into a zip (`bot.md` manifest + setup instructions, `PERSONA.md`, optional `memory/`); the registry stores it under its digest and keeps per-Listing Versions behind `@handle/slug`; `botharness.ai/b/<handle>/<slug>` and the `botharness://install/...` deep link are reserved now. Snapshots are never repo pointers — the memory git repo stays local; import always creates a fresh copy.

## Spec v1.1

- M6 memory rule: every memory write carries a `summary` that becomes the git commit message; single-branch repos, history browser (clone + reset) deferred.
- Milestones: M6 SoulSnapshot (export/import, no platform needed) and M7 Soul registry / Marketplace.
- Glossary: Soul, SoulSnapshot, Soul registry, Listing, Version, Handle, Bot set, Export, Import, Publish.
- Risks: default-public abuse (report → takedown → ban), platform cost (free public / paid private), license & provenance on re-export.

Originating research: `docs/research/2026-09-18-grokbot-dev-import-export.md`.
