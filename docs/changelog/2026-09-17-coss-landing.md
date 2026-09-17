---
title: 站点改用 coss ui（landing 重做）
date: 2026-09-17
tags: [docs, design]
---

- landing 从 Astryx 切到 **coss ui**（Cal.com 官方设计系统：shadcn registry + Base UI + Tailwind v4）；Astryx 相关依赖全部移除。
- COSS 组件以 copy-in 落在 `apps/docs/src/components/coss/`（54 个），`aliases.ui` 指向该目录，避免与 Nimbus 自带组件冲突。
- 样式对账保持 **additive**：只补 `dark:` 变体（对齐 Nimbus 的 `[data-mode="dark"]`）与少量缺失色映射，不改动任何 `--nb-*` token。
- 首页结构收敛为克制门户：hero（一句话 + 快速开始命令 + CTA）→ 三张路径卡 → 紧凑能力区（六态徽章）→ 最近 changelog；纯 SSR、零 hydration。
- 导航图标引入 HugeIcons（`@iconify-json/hugeicons`）。
