---
title: Complete Chinese coverage for DSH Dev Docs
date: 2026-09-20
tags: [docs, dsh, i18n, skills]
---

Every DSH Dev Docs reference now has a maintained Chinese counterpart: canonical Context, Decision Tree, Bot Runtime architecture, the full guide, Host, Client, Slots, and community UI patterns.

The docs generator now reads an explicit source for each language and rejects an incomplete DSH page pair instead of silently publishing English under `/zh/dsh/**`. Cross-page links stay in the reader's selected language. The installable `dsh-plugin-dev` skill ships the same Chinese references while preserving canonical DSH, Cordis, and BotHarness identifiers.
