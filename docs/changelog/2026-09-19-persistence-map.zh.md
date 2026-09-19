---
title: 持久化地图与主客分界（ADR-0034；spec v1.11）
date: 2026-09-19T18:00:00+08:00
tags: [spec, adr, storage, client]
---

- **ADR-0034 — 持久化地图**：一类状态一个家。Bot 身份/人格/记忆仍是 `$DSH_HOME/botharness/bots/<slug>/` 下的用户文件（可 git、是 M6/M7 的打包单元）；Channel 元数据与消息仍是 `…/channels/<id>/{channel.json, messages.ndjson}`，append-only 日志为权威（ADR-0030）；名册陈列（section 成员/名称/顺序、pins）移到 Host，存 DSH storage 域 `botharness_roster`（`version 1`、`layout: single`，global 槽 `{ pins, sectionOrder }` + `sections` 表，key 为**主机生成**的 id）；排序偏好（全局 + 每 section）移到 DSH settings 命名空间 `ui-bot-mode`（`settings.yaml`、per-profile、跨浏览器），客户端经 `ctx.settingsScope.bind({ namespace: 'ui-bot-mode' })` 读写、`settings/document-updated` 刷新，并在 Settings → General 暴露一行 `settings.general.item`；只有 `collapsed` 留在浏览器 localStorage。派生分析（未读、计数、搜索、dashboard）走可重建的 SQLite 索引（ADR-0005）——`dsh-storage-sqlite` 当前未安装。客户端不直接触碰 Host 陈列：`botharness` typert 命名空间上的七个细粒度桥方法（`rosterGet`、`sectionCreate`、`sectionRename`、`sectionRemove`、`channelAssign`、`sectionReorder`、`pinsSet`），动作型与 `ui-workspace` 的 remote 对齐，section id 由 `sectionCreate` 返回。存储是可选能力（`ctx.inject(['storageDomain'], cb)`）；迁移单向且保守（主机域为空 + 存在旧 `roster.json` → 只迁一次，浏览器键保留作备份）。实时是 v1.1 的 `mode: 'stream'` remote 方法（先 roster 后 channel 消息）；`domain/changed` 仅进程内、不可转发。注意：非 loopback 页面的 settings 写入仅进程内（DSH 既有行为）。
- ADR-0031 增补：section/pins/顺序移到 Host（照此地图），排序偏好进 `ui-bot-mode` settings；`collapsed` 留在本地——仍不进 SoulSnapshot。General 设置行只是新增入口，不迁移任何 sidebar UI。
- 规格 v1.11：§2.1 持久化地图（含目录约定）、§5 sidebar/存储/排序措辞与设置行入口、§8 风险（陈列在 Host / 非 loopback settings 仅进程内）与 SQLite 索引开放项。
- 已起草票：#66（M3）域 + 7 桥方法 + 客户端切换 + 主机生成 id + 迁移 + 容错（ready-for-agent）；#67（v1.1）实时同步流（needs-triage）；#68（M3）`ui-bot-mode` settings 命名空间 + General 设置行 + 排序迁移（ready-for-agent）。
