---
title: DSH Dev Docs 已完整提供中文对应页
date: 2026-09-20
tags: [docs, dsh, i18n, skills]
---

DSH Dev Docs 的每份参考现在都有持续维护的中文对应页：规范 Context、Decision Tree、Bot Runtime 架构、完整指南、Host、Client、Slots 与社区 UI 实践。

文档生成器现在要求每个 DSH 页面显式提供中英文源文件；缺少任一语言会直接失败，不会再在 `/zh/dsh/**` 下静默发布英文。跨页链接会留在读者选择的语言中。可安装的 `dsh-plugin-dev` skill 也会携带同一组中文参考，同时保持 DSH、Cordis 与 BotHarness 规范标识不变。
