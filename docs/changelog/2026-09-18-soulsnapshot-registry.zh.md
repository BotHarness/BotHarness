---
title: SoulSnapshot 与 Soul registry 决策
date: 2026-09-18T12:00:00+08:00
tags: [spec, adr, platform]
---

## 决策

- **ADR-0019 — Soul registry 是一个托管服务。** PersonaBot 分享运行在 Cloudflare Workers + Hyperdrive → PlanetScale（MySQL、Drizzle）上，快照对象存 R2；账号用 BetterAuth（Cloudflare Email 的 email OTP + Google）。第一阶段只分享单个 Bot；默认公开发布，上传自动闸门（schema、类型白名单、大小、密钥扫描硬拒绝）+ 举报下架；插件一键分享与 bot set 后置。
- **ADR-0020 — SoulSnapshot 是不可变、内容寻址的包。** 导出把 persona + 选定记忆冻结为 zip（`bot.md` 清单 + setup instructions、`PERSONA.md`、可选 `memory/`）；registry 按 digest 存储，Listing 以 `@handle/slug` 为命名空间、下挂 Version；`botharness.ai/b/<handle>/<slug>` 与 `botharness://install/...` 深链现在即预留。快照永不作为仓库指针——记忆 git repo 只留本地；导入总是创建全新副本。

## 规格 v1.1

- M6 记忆规则：每次记忆写入必须带 `summary`，作为 git commit message；单分支 repo，历史浏览器（clone + reset）后置。
- 里程碑：M6 SoulSnapshot（导出/导入，不依赖平台）、M7 Soul registry / Marketplace。
- 词表：Soul、SoulSnapshot、Soul registry、Listing、Version、Handle、Bot set、Export、Import、Publish。
- 风险：默认公开的滥用（举报 → 下架 → 封号）、平台成本（公开免费 / 私有付费）、再导出时的许可与溯源。

来源调研：`docs/research/2026-09-18-grokbot-dev-import-export.md`。
