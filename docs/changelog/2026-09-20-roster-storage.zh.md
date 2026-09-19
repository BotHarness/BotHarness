---
title: 名册陈列迁 Host（ADR-0034；spec v1.13；client-bridge v0.6）
date: 2026-09-20T10:00:00+08:00
tags: [spec, storage, client, migration]
---

- **`botharness_roster` 存储域（#66）**：名册陈列——section 名称/成员/顺序与 pins——从浏览器 localStorage 移到 DSH storage 域 `botharness_roster`（json 后端、`version 1`、`layout: single`）：global 槽 `{ pins, sectionOrder }` + `sections` 表（key = 主机生成的 uuid）`{ name, channelIds }`。客户端不自造 id、不碰 Host 文件；七个细粒度桥方法（`rosterGet`、`sectionCreate`、`sectionRename`、`sectionRemove`、`channelAssign`、`sectionReorder`、`pinsSet`）在 `botharness` typert 命名空间暴露读写，zod 校验，每次写入返回即已落盘，客户端写后重拉 `rosterGet`（无乐观状态）。
- **可选能力与诚实降级**：storage 是可选能力（`ctx.inject(['storageDomain'], cb)`）；没有它插件照常加载，roster 读写都回 `storage-unavailable`（新增 `RemoteErrorDetailsMap` 错误码）——`rosterGet` 不假装空陈列。客户端首次加载即渲染只读提示，后端可用后重载清除。
- **可回滚的一次性迁移**：Host 陈列为空且存在旧 `roster.json` 时，客户端按旧顺序建 section、按序归属 channel、落 section 顺序与 pins，并把 `ui-bot-mode` 的 `sortModes` 从旧 section id 重映射到主机生成 id。任一步失败即回滚本次写入的 section 与 pins，Host 保持为空、下次加载干净重试；全部成功后才备份旧记录（`botharness/roster.json.backup`）、把本地键清为 `{ collapsed }` 并写 `botharness/roster.migrated`。只有 `collapsed` 留浏览器本地；#55 的手动顺序缝改为经 `channelAssign` 定位冻结顺序，不再写本地 `channels` 数组。
- 规格 v1.13（§2.1/§5）与 client-bridge v0.6（十九个方法、新错误码）同步；ADR-0034 的后果清单与临时缝更新已修正。
