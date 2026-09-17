---
title: Bilingual changelog · English primary, Chinese translation
date: 2026-09-17T19:00:00+08:00
tags: [docs, i18n]
---

Changelog entries are now bilingual pairs: the primary file `docs/changelog/<date>-<slug>.md` is English, and `<date>-<slug>.zh.md` is the Chinese translation. The sync script generates the English tree (`/changelog/<slug>`) from the primary file and the Chinese tree (`/zh/changelog/<slug>`) from the `.zh.md` side; RSS, llms sections, and markdown alternates follow each tree's language.

- **Fallback**: when one side of a pair is missing, the other language's entry fills the gap flagged `untranslated`, and the page plus its feed entry show the notice banner (`This page has not been translated yet.` / `本页暂未提供中文。`) linking to the counterpart.
- **Sync / collections**: `scripts/sync-docs.mjs` pairs repo files by base name and writes `src/content/changelog/**` (the `changelog` collection) and `src/content/changelog-zh/**` (the `changelog-zh` collection); both generated trees stay gitignored.
- **Routes**: the English routes read `changelog`, the `/zh` routes and feeds read `changelog-zh`; the landing's recent-changelog block still shows the newest entries, now with English titles.
