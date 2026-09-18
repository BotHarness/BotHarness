---
title: In-harness UI 采用 DSH design system
date: 2026-09-18T23:10:00+08:00
tags: [adr, spec, client]
---

- **ADR-0028**：in-harness 客户端 UI 使用 DSH design tokens（`--dsw-static-*` / `--dsw-alias-*` / `--dsw-specific-*`，暗色由 `body[data-ds-dark-theme]` 提供）并复用 shell 基线里的 `@deepseek-ai/dsh-client-ui-primitives`；禁止字面颜色与第二套组件库。COSS 留在 botharness.ai（`apps/docs`）——它的 token 桥接 Nimbus，暗色选择器与 DSH 不一致。
- 规格 v1.8：§6 增加客户端设计系统规则。
- 后续票：「M3 UI 原生化：DSH tokens + primitives + 双主题」（挂 #10）：`styles.ts` 迁到 tokens、能用 primitives 的控件替换、`web-dev` 双主题验收。
