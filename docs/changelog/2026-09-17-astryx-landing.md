---
title: Astryx 首页（landing）
date: 2026-09-17
tags: [docs, design]
---

- 站点首页改用 Meta **Astryx** 设计系统：React 19 组件、SSR 静态输出、零客户端 hydration；docs 页面继续用 Nimbus 自带组件（按环境分工）。
- 新增品牌 token 单一来源 `design/tokens.css`，Astryx 侧经 `apps/docs/src/styles/astryx.css` 显式声明 layer 顺序（`reset, theme, base, astryx-base, astryx-theme, components, utilities, landing`）。
- Astryx CSS 只在首页路由加载（构建验证：181 KB，仅 `index.html` 引用）；docs 页面零额外体积。后续若需要更瘦，可切 Astryx source build 只打包用到的组件。
- 首页内容：hero（Badge / H1 / Lead / CTA）、四张能力卡（PersonaBot / 记忆即文件 / 状态可见 / 不 fork）、为什么、文档入口、footer。
