---
title: DSH conformance & the client bridge decision
date: 2026-09-18T18:00:00+08:00
tags: [spec, adr, plugin]
---

## Config & manifest conformance (ADR-0022)

- `@botharness/core` now uses DSH's canonical config channel: exported `Config` schema + `apply(ctx, config)`, with `enabled: false` registering nothing (a composition-level kill switch). The `ctx.settings.register(...)` call and the static `'settings'` injection are gone, so the plugin no longer stays PENDING in profiles without a settings provider. Settings cards return in M3+ via `ctx.settings.installSection` + dynamic `ctx.inject(['settings'])` — recorded, not implemented.
- `packages/core/package.json` drops the unofficial `dsh.compatibility`; it declares `engines.dsh: 0.1.5-rc.2` and `dsh.manifestVersion: 1` (author intent only — current installers do not enforce them).
- Spec bumped to **v1.5**; boot/architecture docs and diagrams updated to the config signature.

## The client bridge is RPC, not Cordis (ADR-0023)

- The Web Client is a separate browser Cordis app and cannot inject Host services, so the core↔client bridge is an explicit read-model RPC surface over the generic Connection RPC (`botharness/<method>`, `{ ok, value | error }` + change cursor). M3 refreshes after actions and low-frequency polls; no direct `states.on` in the browser, and Typert `@Remote` stays a later candidate.
- New draft spec `docs/client-bridge.md` (method surface, envelope, refresh model, bundle constraints): `@botharness/client` is an independent package with a hand-built lazy-CJS bundle (shell baseline external, everything else inlined) — the M3 top engineering risk.
- Architecture doc corrected: no `provide('botharness') → client` arrow; §8 splits Host-internal Cordis / browser-internal Cordis / cross-process RPC.

## Research

- `docs/research/2026-09-18-dsh-authoring-conformance.md` (plugin-authoring audit; the three must-fix items) and `docs/research/2026-09-18-dsh-client-ui-and-docs-ia.md` (client extension points; the cross-process constraint) drove both decisions.
