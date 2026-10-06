# Discord 原文件候选 — #1002

这是已合并 #981 后的开发来源验收。在已有公开 thread、Message Content 关闭的条件下，代理操作的真实模型文件流程通过。独立字节、原生身份／引用、canonical 和冷重启检查通过；已授权的合成文件工作区写权限随后撤销。产品 Provider 提升及发布另行管理。

## 候选与当前检查

- Core 运行／测试输入：`ed3b385e1c2447184defcf96cd7679edbb75d3cd`，基于已合并 `2ea403f5910e798023f57cdec8babcfb3f423f68`。
- Provider：`71be2edbe69bcf8cb160af2a812565134383551e`，基于 Provider #8 合并 `8e1ee97e4b52b062b1ef0f81d1b30ae884f4f5db`。
- Provider 构建／包检查、78 项 Discord 检查及完整 3,606 项测试通过。Host lint、格式、类型、24 项聚焦测试、完整 2,753 项／9 项跳过及构建通过。后续证据／文档提交在 PR 发布前另行检查。
- DSH `0.2.0-rc.1`；持续 QA Profile 复用原 App、本 Bot、Binding、外部收件 Grant、父频道和准确已有公开 thread。原生只读检查确认已有文件上传和 thread 发送权限；App flags 仍为 `0`，Message Content 关闭。
- 激活文件候选后，六张 canonical 表逐字节不变。最终加载的 Provider `lib/index.js` SHA-256 为 `341bd577f5510f7f529f9912416c840cf801e7de479df17e93590c21fedee1c1`，与准确受测候选及 Profile 安装副本一致；真实文件 E2E 使用此最终输入。

## 原生文件与权限边界

明确 opt-in 的独占 consumer 仅接收服务器文字频道或已有公开 thread 中直接提及自身 Bot、携带一个托管附件的 Human 来源。保留 opaque 附件身份、原消息 ID、原生资源 ID、安全名称、正整数声明大小及可选 MIME，不保留签名 URL。Bot／webhook／普通消息及不支持的多附件／临时／非法来源不会取得文件收件资格；旧文本 consumer 的 envelope 保持不变。

读取重新查询准确原生来源，核对作者、父频道／thread、自身提及及全部保留文件元信息。刷新后的签名 URL 必须是准确 HTTPS `cdn.discordapp.com/attachments/<channel>/<attachment>/<filename>` 路线；不转发 Bot 凭据、不跟随跳转。下载有取消、当前 lease、声明／实际大小校验及 20 MiB 上限；撤销会取消阻塞的 reader 并释放流。缺失、被替换或异地来源在文件提交前拒绝。

明确选择的独立结果发送前重查原生来源及 VIEW_CHANNEL、READ_MESSAGE_HISTORY、SEND_MESSAGES（或 SEND_MESSAGES_IN_THREADS）、ATTACH_FILES。Host 在唯一一次不自动重试的 multipart 请求前重查授权，设置 `fail_if_not_exists=true`。成功原生响应必须匹配本 Bot 作者、准确频道、原消息引用及唯一附件身份／名称／大小。明确拒绝与 `reply-result-unknown` 分开记录；未知结果不会盲目重试或回退。

这些是建立在既有 canonical Attachment／Workspace Grant／Outbox 上的应用定义 checked Service 能力。没有新持久化存储、schema、原生 Session、收件目标或 thread。原生依据：[Discord 附件／消息契约](https://docs.discord.com/developers/resources/message)、[签名 CDN／multipart 契约](https://docs.discord.com/developers/reference#signed-attachment-cdn-urls)、[权限](https://docs.discord.com/developers/topics/permissions)。

## 真实文件验收与清理

真实浏览器上传／直接提及产生 Human 原生来源 `1556949377308954655`，canonical 来源 `im-2f0f979e6a57b4d870a2f23774c3fff6d6bdc27696d55ac4a4a770f60a40df22`。实际 DeepSeek Pro/off 模型成功执行七个工具：`bridge_read`、`bridge_attachment_save`、原生 `read`、原生 `write`、原生 `read`、`channel_attachment_import`，最后一次 `bridge_reply_file`。模型读到三行原件后，另建结果，把 SOURCE 改为 RESULT、`blueberry-41` 改为大写、count 从 7 增到 8；导入前再次读回结果。没有 Shell、文本回复、DM post 或新 thread。

独立原生消息 `1556949481541472256` 来自本 Bot `1556613973846007899`，位于准确已有 thread `1556622420222283798`，引用刚才的 Human 来源，并携带一个新的 `discord-1002-result.txt`。独立无凭据下载确认输入与输出各 **41 字节**，完全符合预期。canonical 原件与工作副本的 SHA-256 均为 `ad8c254acefa4370f2f733b7bad0bc05982fc7aa82b6eb7b4877933bc1048285`；导入结果与原生输出均为 `3b84ec649ef4be88bf9619adcfa7f1597c25f82ace7a5b28b09218620f631328`。原件与结果的 canonical 文件身份不同。

canonical 对比仅新增一个 Source Event、一次 Admission、一个 provider-accepted 文件 Intent。每条原有记录逐字节不变；Binding、外部收件 Grant、Channel placement 不变。稳定总数为 1 Binding／1 外部 Grant／26 Sources／8 Admissions／6 Outbox 回复／2 placements；累计数包含之前的 DM 与 Memory 设置。本次结果没有本地 DM 镜像。

专用合成文件工作区写 Grant 在 Human 明确授权后开启，字节验证后撤销写权限。撤销与冷重启均保持六张 canonical 表逐字节一致；重启后工作区写权限仍为 false。原生 App flags 始终为 `0`，Message Content 全程关闭。真实覆盖限于公开 thread 中一个小托管文本文件；非法／多附件／大小／权限／撤销／未知回执有自动化覆盖，不声称完整新原生矩阵或图片视觉已完成。

**Before — 相同 1230 × 820、深色中文原生 thread，已有文本检查点，尚无文件请求／结果。**

![文件交互前](../../assets/pr/1002-discord-files/before-original-thread.jpg)

**After — 接收原件与本 Bot 的原 thread 新结果，包含原生文件预览。**

![真实模型原文件与结果](../../assets/pr/1002-discord-files/after-file-model-native.jpg)

[安全的实际 Tool／原生／字节／canonical／重启证据](../../assets/pr/1002-discord-files/file-model-native-proof.json) 记录真实调用 ID、独立文件身份、原生来源／回复／附件 ID、hash 与权限清理，不包含签名 URL 或凭据。代理 E2E 验收完成；merge、产品 Provider 提升、发布及部署另行授权。

## 最新 Provider 集成

Provider 主线随后合并了独立 Lark 私聊定位修复（#9）。候选完整保留该源码／测试并重新生成 Host 产物；集成 Provider `7a2f01ff18bd6a185796ed950352f751fd445149` 的构建、包验证与 **3,607 项测试**通过。实际加载产物 SHA-256 为 `38c08d20f48157525aa4247621f51c5e674f9aec6d388f5c1764bc153b6336f6`。

在 Core 运行输入 `82d14bbe3c6aff34ed9bf3b058880deaa562f489` 上，通过浏览器再次发送独立文件／直接提及，Turn 8 的同样七个实际工具均成功。原生 Human 触发 `1556952778536919162` 带一个原附件；自己 Bot 的结果 `1556952872799969311` 在相同既有 thread 引用该新触发，并附 `discord-1002-integrated-result.txt`。独立下载再次匹配同样的 41 字节预期输入／输出与哈希。新原件 `file:2fcd64b4-9af7-48a3-8334-b699986ec7ec` 与导入结果 `file:9b467bb9-da5f-4010-93d4-35ccb8edd4f7` 身份不同；Intent `4b9217cb-a966-4d74-832f-0aeac82180a9` 为 provider-accepted。

该独立用例只增加 1 Source／1 Admission／1 Outbox，全部既有行、Binding、外部 Grant 与 placements 保持不变；累计为 1／1／27／9／7／2。同一已授权合成目录的写权限已再次撤销；撤销和冷重启保持六张表完全一致，写权限仍为 false，Message Content 全程 OFF。原件与第一次结果未改动。

![集成 Provider 的真实文件结果](../../assets/pr/1002-discord-files/after-integrated-file-model-native.jpg)

[脱敏集成工具／原生／字节／canonical／重启证据](../../assets/pr/1002-discord-files/integrated-file-model-native-proof.json) 精确对应第二次实际 Core／Provider 输入；第一份证据继续保留第一次独立通过的用例。

## Core 主线集成

Core 集成 `9584e20bf8517149da14bb4a0428c49392b2399a` 保留最新主线 `1f9f6458f7e92654c5b88d87036ad70352a7e8c8` 的既有改动。真实文件证据精确对应上文两次运行输入。集成检查定位了遥测测试的随机 UUID 偶然包含短测试名 `ada` 的误报；测试 recorder 固定匿名 ID，继续检查全部事件内容。运行代码未因此改变。最终 PR 的 CI 与构建结果单独列出，不替代实际工具／原生文件证据。
