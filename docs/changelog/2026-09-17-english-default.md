---
title: 默认语言翻转为英文 · 中文移至 /zh
date: 2026-09-17
tags: [docs, i18n]
---

英文成为站点主语言：根路径（`/`、`/docs/**`、`/dev/**`、`/changelog`）直接提供英文内容，中文整体迁到 `/zh/**`（`/zh`、`/zh/docs/**`、`/zh/dev/**`、`/zh/changelog`）；顶栏 `EN` / `中文` 切换保持当前路径（`/docs/overview` ↔ `/zh/docs/overview`）。

- **机制**：`docs` collection 承载英文树（Nimbus `versions.current: "en"`），`docs-zh` 通过 `versions.others` 挂载到 `/zh`；旧的 `/en/**` 路由与 `docs-en` collection 移除。
- **未翻译页面**：英文树中的 spec / PRD / ADR 仍显示中文源，页面顶部显示 `This page has not been translated yet.`；反向情况（英文页缺中文）在 `/zh` 树显示 `本页暂未提供中文。`。两个提示均不可关闭。
- **生成**：`scripts/sync-docs.mjs` 改为把仓库中文源同时生成到两棵树（英文树带 `untranslated` 标记，中文树干净）；英文架构页写入根树，中文架构页写入 `/zh` 树。
- **元数据**：根 `llms.txt` 描述英文树并链接 `/zh/llms.txt`，根 `llms-full.txt` 改为英文内容；sitemap / canonical / markdown alternate / RSS 按树各自正确；Pagefind 仍索引两种语言。
