---
title: Changelog 双语化 · 英文为主、中文为译文
date: 2026-09-17T19:00:00+08:00
tags: [docs, i18n]
---

Changelog 条目现在是双语文档对：主文件 `docs/changelog/<date>-<slug>.md` 为英文，`<date>-<slug>.zh.md` 为中文翻译。同步脚本从主文件生成英文树（`/changelog/<slug>`），从 `.zh.md` 生成中文树（`/zh/changelog/<slug>`）；RSS、llms 分区与 markdown alternate 均按各树语言输出。

- **回退**：某一侧缺失时，用另一语言的条目补位并标记 `untranslated`，页面与 feed 条目显示提示横幅（`This page has not been translated yet.` / `本页暂未提供中文。`）并链接到对侧页面。
- **同步 / collection**：`scripts/sync-docs.mjs` 按基础文件名配对，分别写入 `src/content/changelog/**`（`changelog` collection）与 `src/content/changelog-zh/**`（`changelog-zh` collection）；生成的目录保持 gitignore。
- **路由**：英文路由读取 `changelog`，`/zh` 路由与 feed 读取 `changelog-zh`；首页「最近 changelog」仍展示最新条目，标题为英文。
