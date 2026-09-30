# 在 Host 上打开文件

点击显示的 Memory Repository 或已授权 Workspace 路径，选择系统检测到的软件。Memory 文件行提供右键菜单和更多按钮。当前文件可以在文件管理器中显示、在编辑器中打开、复制 Host 路径，或下载到当前设备。

新发送的消息附件使用相同操作：点击文件卡片、右键文件或图片，或使用更多按钮。点击图片仍打开预览。菜单明确标示 Host 电脑；使用 Tailscale 或 Cloudflare Tunnel 时，编辑器／文件管理器在运行 DSH 的电脑上打开，下载则把当前字节传到浏览器所在设备。编辑下载文件不会写回 Host。无法原生打开时，仍可下载与复制路径。

发送会把文件传输到一个 profile 管理的真实目标位置。打开与保存附件直接修改这个目标文件；原消息下次读取、预览或下载使用当前字节、文件名、MIME 和大小。保存后刷新 Channel，可刷新显示的元数据。上传源文件独立。即使内容相同，两次独立上传也互不联动；只有显式复用同一个附件身份，多个消息才会引用同一个文件。

外部保存不创建附件版本、通知、Source Revision、Inbox Admission 或 Bot wake。目标文件缺失时报告不可用，不从原上传字节重建。旧 hash 附件仍可读取与下载；直接编辑等待独立的 legacy 迁移切片。Memory 保留既有 Git 行为。

## 存储与集成

新引用为 `{fileId,name,mime,size}`，旧引用为 `{hash,name,mime,size}`，身份必须二选一。不可变的消息 envelope 保留发送时引用，消息查询投影当前元数据。`channel_read_image` 用 `attachment_id` 传入返回的 `fileId`，旧图片仍使用 `hash`。Host 验证 Bot 当前 Channel 成员资格与消息归属后，读取符合大小限制的当前图片；模型不会获得附件 Host 路径。可信 Channel 转发复用这份引用契约，目的地确认仍由 [#570](https://github.com/BotHarness/BotHarness/issues/570) 推进。

`$DSH_HOME/botharness/attachments/files/<uuid>/` 下的 `data/<安全文件名>` 就是真实目标，`record.json` 持久保存身份与传输回执。回执仅保存用于上传重试的校验值，不保存历史文件字节。Composer 重试复用同一个上传 key，不覆盖已经编辑的目标。发送验证 profile 归属；每次原生打开或下载重新解析 `channelId + messageId + fileId`。认证下载使用 `no-store`、服务器嗅探的 MIME 和 `nosniff`。

未完成传输的清理保持独立。引用感知清理从所有保留的 Source Event envelope（含已移除 Channel）标记身份，保护仍可达文件，之后才删除过期孤儿目标与记录；不启用自动保留期。后续 Profile Backup、选定 Export 与显式 Purge 必须覆盖当前引用文件及记录，保留共享身份，不能删除仍被保留事实引用的文件；明确导出捕获当时字节，不建立持续版本档案。本切片不新增这些产品。

设计见 [ADR-0100](adr/0100-file-open-actions-target-real-host-files.md)。可运行验收入口是 `scripts/e2e-real-attachment-files.mjs`：通过真实 composer 准备，在外部编辑器保存，验证原消息、独立上传和共享引用，重启同一 Profile，再验证缺失文件拒绝。登录地址与私有 fixture 留在 Git 外，只发布合成测试数据的截图。
