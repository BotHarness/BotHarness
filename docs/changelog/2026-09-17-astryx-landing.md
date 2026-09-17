---
title: Astryx landing page
date: 2026-09-17T11:00:00+08:00
tags: [docs, design]
---

- The homepage switched to Meta's **Astryx** design system: React 19 components, static SSR output, zero client hydration; docs pages keep Nimbus's own components (split by environment).
- Added a single source of truth for brand tokens, `design/tokens.css`; on the Astryx side, `apps/docs/src/styles/astryx.css` declares the layer order explicitly (`reset, theme, base, astryx-base, astryx-theme, components, utilities, landing`).
- Astryx CSS loads only on the homepage route (build check: 181 KB, referenced only by `index.html`); docs pages carry zero extra weight. If it needs to be leaner later, an Astryx source build can bundle only the components in use.
- Homepage content: hero (Badge / H1 / Lead / CTA), four capability cards (PersonaBot / memory as files / visible state / no fork), why, docs entry points, footer.
