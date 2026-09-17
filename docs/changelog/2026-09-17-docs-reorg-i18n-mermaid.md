---
title: 'Docs site: /docs and /dev restructure · bilingual switch · mermaid pre-rendering'
date: 2026-09-17T15:00:00+08:00
tags: [docs, i18n, diagrams]
---

- **Content restructure**: `/docs` for user docs (overview / quickstart), `/dev` for developers and audit (architecture / spec / ADR), `/changelog` at the top level; both domains (botharness.ai / .dev) serve the same site. The header gains icon+text navigation (Docs / Development & Audit / Changelog) and highlights the current section.
- **Bilingual**: English is mounted at `/en/**` (the `docs-en` collection + Nimbus versions mounting); the header's 中/EN switch preserves the path (`/docs/overview` ↔ `/en/docs/overview`); user-facing pages are translated to English, and `/en/dev/**` plus the changelog fall back to Chinese with “本页暂未提供英文。”; Pagefind indexes both languages (en / zh-hans).
- **mermaid is now pre-rendered SVG**: `docs/architecture/diagrams/*.mmd` are the sources; `pnpm diagrams` renders light + dark versions locally to `rendered/*.svg` (committed, so CI needs no browser); the site uses the `<Diagram>` component with a lightbox and no longer loads mermaid at runtime.
- Known issue: SVG labels use `foreignObject` (needed for multi-line `<br/>`), so Safari's `<img>` may not show the text; `og:locale`/JSON-LD are still hard-coded to zh.
