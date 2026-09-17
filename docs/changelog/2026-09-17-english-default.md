---
title: English becomes the default · Chinese moves to /zh
date: 2026-09-17T17:00:00+08:00
tags: [docs, i18n]
---

English is now the site's primary language: the root paths (`/`, `/docs/**`, `/dev/**`, `/changelog`) serve English directly, and Chinese moves entirely to `/zh/**` (`/zh`, `/zh/docs/**`, `/zh/dev/**`, `/zh/changelog`); the header's `EN` / `中文` switch preserves the current path (`/docs/overview` ↔ `/zh/docs/overview`).

- **Mechanism**: the `docs` collection holds the English tree (Nimbus `versions.current: "en"`), and `docs-zh` is mounted at `/zh` via `versions.others`; the old `/en/**` routes and the `docs-en` collection are removed.
- **Untranslated pages**: spec / PRD / ADR in the English tree still show the Chinese source with `This page has not been translated yet.` at the top; the reverse case (an English page without Chinese) shows `本页暂未提供中文。` in the `/zh` tree. Neither notice can be dismissed.
- **Generation**: `scripts/sync-docs.mjs` now writes the Chinese repo sources into both trees (the English tree flags the fallback with `untranslated`, the Chinese tree stays clean); the English architecture page goes to the root tree, the Chinese one to the `/zh` tree.
- **Metadata**: the root `llms.txt` describes the English tree and links `/zh/llms.txt`; the root `llms-full.txt` is English; sitemap / canonical / markdown alternates / RSS are correct per tree; Pagefind still indexes both languages.
