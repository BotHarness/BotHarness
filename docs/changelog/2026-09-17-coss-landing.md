---
title: Landing rebuilt on coss ui
date: 2026-09-17T13:00:00+08:00
tags: [docs, design]
---

- The landing moved from Astryx to **coss ui** (Cal.com's official design system: shadcn registry + Base UI + Tailwind v4); all Astryx dependencies were removed.
- COSS components are copied in under `apps/docs/src/components/coss/` (54 of them), with `aliases.ui` pointing there to avoid clashing with Nimbus's own components.
- Style reconciliation stays **additive**: only `dark:` variants are added (aligned with Nimbus's `[data-mode="dark"]`) plus a few missing color mappings; no `--nb-*` token is changed.
- The homepage is pared back to a restrained portal: hero (one-liner + quickstart command + CTA) → three path cards → compact capability block (six-state badges) → recent changelog; pure SSR, zero hydration.
- Navigation icons switch to HugeIcons (`@iconify-json/hugeicons`).
