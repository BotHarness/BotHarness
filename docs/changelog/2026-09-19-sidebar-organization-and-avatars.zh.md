---
title: Sidebar 组织模型与头像策略（ADR-0031/0032；spec v1.10）
date: 2026-09-19T12:00:00+08:00
tags: [spec, prd, adr, client]
---

- **ADR-0031 — Sidebar 组织**：置顶 BOT 网格（不变，始终手动）→ 用户自建 Channel section（可折叠、手排，默认创建顺序）→ **未分组**固定底部。每个 scope 有**排序模式** `auto` / `manual` / `inherit`（section 默认 inherit，未分组恒定 inherit，全局默认在 Bots `...` 菜单）；首次手动拖拽或拖入切 manual 并冻结当前顺序，源 scope 模式不变，「恢复自动」回 inherit。头部图标按原生顺序 `search → ... → +`；section 头 `+` 在区内建 Channel，`...` = 排序方式 → 重命名（Modal 输入）→ 删除（Modal 红描边确认，Channel 回落未分组）。移动 = 复刻 `ui-workspace` 的原生 HTML5 DnD ＋ `Menu` 右键「移动到 ▸」子菜单；Channel 重命名/删除暂缓。展示配置只存浏览器本地 `roster.json`；行几何对齐原生实测（section 头 34px、行 32px、`padding: 0 8px`、行距/区块距 2px/4px、无额外缩进）。
- **ADR-0032 — 头像与图标**：默认头像 = 由 slug 确定性生成的静态 blobatar；DM Channel 行显示 Bot 头像，群 Channel 行用字形。DSH 字形缺口（hash / 群聊先行）以 vendored Lucide（ISC）首方组件补齐；`packages/client/THIRD_PARTY_NOTICES.md` 随包发布（`files`）。自定义头像与动效/表情转为 v1.1 票；不复刻 Grok Bot 身份（bloub 的 MIT 只覆盖代码）；仓库根 `LICENSE` 补齐之前不复制任何 MIT 代码。
- ADR-0028 增补：外部字形 vendoring 补图标缺口；我们的 UI 仍只用 DSH tokens 与 primitives，不引入组件库。
- 调研：`docs/research/2026-09-19-avatar-and-icon-references.md`（blobatar、bloub、图标库对比、grokbot 文章事实核查）。
- 规格 v1.10、PRD v1.4；M3 票已起草：行样式、section 管理、排序模式、移动、头像/图标、许可与 notices。
