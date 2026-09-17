---
title: 文档站：/docs 与 /dev 重排 · 双语切换 · mermaid 预渲染
date: 2026-09-17
tags: [docs, i18n, diagrams]
---

- **内容重排**：`/docs` 用户文档（overview / quickstart）、`/dev` 开发者与审计（architecture / spec / ADR）、`/changelog` 顶层；两个域名（botharness.ai / .dev）服务同一份站点。顶栏新增 HugeIcons 图标+文字导航（文档 / 开发与审计 / Changelog）并高亮当前区块。
- **双语**：英文挂 `/en/**`（`docs-en` collection + Nimbus versions 挂载机制）；顶栏 中/EN 切换会保持路径（`/docs/overview` ↔ `/en/docs/overview`）；用户向页面英译，`/en/dev/**` 与 changelog 回退中文并显示「本页暂未提供英文。」；Pagefind 双语言索引（en / zh-hans）。
- **mermaid 改为预渲染 SVG**：`docs/architecture/diagrams/*.mmd` 为源，`pnpm diagrams` 本地渲染 light + dark 两版到 `rendered/*.svg`（已提交，CI 不需要浏览器）；站点用 `<Diagram>` 组件 + 灯箱放大，不再运行时加载 mermaid。
- 遗留：SVG 标签使用 `foreignObject`（多行 `<br/>` 所需），Safari 的 `<img>` 可能不显示文字；`og:locale`/JSON-LD 仍固定 zh。
