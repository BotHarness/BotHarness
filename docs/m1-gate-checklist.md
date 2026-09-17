# M1 验证清单（Lark 国际版）

> 出口标准见 PRD §7。gate ②③⑤ 需要真实 Lark 自建应用与浏览器；执行后在每个 gate 下追加「日期 / 结果 / 证据」。

## 前置步骤

1. Lark 开放平台创建**自建应用**（国际版域名 `open.larksuite.com`），按 PRD 附录 A 开通权限并订阅 `im.message.receive_v1`。
2. 安装到 profile：`dsh plugin --profile <p> add -w <repo 路径>`；在「设置 → dsh-im」里以 `domain = lark` 绑定 App（扫码或手填 appId/appSecret）。
3. 绑定 ≥2 个 Bot（各自独立自建应用），各自设置 workspace（写入 `workspaces.json` 的 `workspaces[botId]`）。
4. 如不用默认 `~/.dsh`，在环境或 DSH credentials 中配置 `DSH_HOME`。

## Gate ① 双 Bot 在线互不串扰

- 步骤：两个群分别 @ 两个 Bot，交叉询问只有各自上下文能回答的问题；断开其中一个再重连。
- 预期：两条长连接同时在线；Bot A 的消息不出现在 Bot B 的会话；重连互不影响。
- 结果：

## Gate ② Lark 国际版收发

- 步骤：在 Lark 群 @ Bot 提问，观察流式卡片。
- 预期：@ 到「已受理」< 2s、首字 < 5s（不含模型）；日志无 domain 相关报错。
- 结果：

## Gate ③ 凭据与定义管理

- 步骤：设置页查看 Bot 列表并增删/改工作区；检查 `$DSH_HOME/integrations/dsh-feishu/config.json` 只有 `secretRef`、无明文；credentials 服务存在对应条目。
- 预期：UI 可管理；仓库与配置零明文。
- 结果：

## Gate ④ session→bot 稳定识别

- 代码侧证据：`test/bot-identity.test.ts`（默认工作区、会话覆盖优先级、歧义/未命中、realpath 规范化）。
- 实机步骤：对每个 Bot 发起一次会话；核对 DSH session 的 `cwd` 与 `workspaces.json` 中该 Bot 的工作区一致；`resolveBotFromStores(cwd)` 返回对应 botId。
- 预期：无歧义（两个 Bot 不共享工作区）；配置了 `conversationWorkspaces` 覆盖时同样命中。
- 注意：解析器按 dsh-im 的**默认**路径读取；若基座配置过 `dataDir` / `workspacesPath` 覆盖，记录偏差。
- 结果：

## Gate ⑤ 流式卡片 + 「已受理」反馈

- 步骤：群内提问观察卡片；确认基座是否在首个 token 前给出可见反馈（卡片占位或 Reaction）。
- 预期：卡片在群与话题内均可用；若基座没有即时反馈，补一个 Reaction（记录决定，见 PRD §9.2-9）。
- 结果：

## Gate ⑥ 国际版长连接失败时的 webhook 例外

- 步骤：若 ①/② 失败，记录错误码（如 `1000040351`）并确认是否 domain 配错。
- 预期：书面结论——若被迫走 webhook，按 AC-5.6 例外处理（一个公网回调域名），并更新 PRD §9.1。
- 结果：
