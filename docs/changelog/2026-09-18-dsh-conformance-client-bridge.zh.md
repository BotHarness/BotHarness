---
title: DSH 符合性整改与客户端桥决策
date: 2026-09-18T18:00:00+08:00
tags: [spec, adr, plugin]
---

## 配置与清单符合性（ADR-0022）

- `@botharness/core` 改用 DSH 规范配置通道：导出 `Config` schema + `apply(ctx, config)`，`enabled: false` 时不注册任何东西（组合层开关）。`ctx.settings.register(...)` 与静态 `'settings'` 注入移除，插件在没有 settings provider 的 profile 里不再永久 PENDING。settings 卡片推迟到 M3+，以 `ctx.settings.installSection` + 动态 `ctx.inject(['settings'])` 回归——只记录、不实现。
- `packages/core/package.json` 删除非官方 `dsh.compatibility`；声明 `engines.dsh: 0.1.5-rc.2` 与 `dsh.manifestVersion: 1`（仅作者意图，当前安装器不强制）。
- 规格升 **v1.5**；装载/架构文档与图同步为 config 签名。

## 客户端桥是 RPC，不是 Cordis（ADR-0023）

- Web Client 是独立的浏览器 Cordis 应用，不能注入 Host 服务；core ↔ client 的桥因此是一组显式读模型 RPC（通用 Connection RPC：`botharness/<method>`、`{ ok, value | error }` + 变更游标）。M3 用动作后刷新 + 低频轮询；浏览器不直接订阅 `states.on`；Typert `@Remote` 留作后续候选。
- 新增初稿规格 `docs/client-bridge.md`（方法面、信封、刷新模型、bundle 约束）：`@botharness/client` 为独立包，手写 lazy-CJS bundle（shell 基线外置，其余全部内联）——M3 最大工程风险。
- 架构文档修正：删除 `provide('botharness') → client` 箭头；§8 拆为 Host 内 Cordis / 浏览器内 Cordis / 跨进程 RPC。

## 调研

- `docs/research/2026-09-18-dsh-authoring-conformance.md`（插件作者规范审计；三项必须调整）与 `docs/research/2026-09-18-dsh-client-ui-and-docs-ia.md`（客户端扩展点；跨进程约束）支撑了以上两项决策。
