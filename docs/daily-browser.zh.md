# 分享日常浏览器标签页

Daily Browser 让一个 PersonaBot 读取你在 Chrome 或 Edge 中明确分享的标签页，复用该页当前的登录状态。首版支持只读观察，不能点击、输入、导航或读取其他标签页。你随时可以归还。

## 安装扩展

使用在 `http://127.0.0.1:<端口>` 或 `http://localhost:<端口>` 打开的本地 DSH Web 实例。扩展只连接运行在你电脑上的 DSH Host。

1. 找到 BotHarness 仓库中的 `packages/browser/extension`，或已安装 Browser 包内的 `extension` 目录。
2. 在 Chrome 打开 `chrome://extensions`，或在 Edge 打开 `edge://extensions`。
3. 开启开发者模式，选择“加载已解压的扩展程序”，选择上述目录。
4. 可将 **BotHarness Daily Browser** 固定到工具栏，方便打开。

当前以未打包源码分发；扩展商店发布留待后续。Edge 使用同一组 MV3 API；本切片的真实端到端证据来自 Chrome for Testing，尚未单独完成 Edge E2E。

## 分享并观察

1. 在 Bot settings 中选择 **Browser Target → 日常浏览器**。同一 DSH Profile 的 Bot 共用此设置；切换后需要重新批准动作。
2. 为目标 Bot 开启 Browser Access，并展开 Channel 侧栏的 Browser。无需 Computer Access。
3. 选择“连接浏览器扩展”。配对码五分钟后过期，且只能使用一次。
4. 在日常浏览器打开要分享的页面，点击扩展图标，填写本地 BotHarness 地址和配对码，选择 **Connect**。
5. 核对扩展显示的 Bot 名称和当前页面，再选择 **Share current tab read-only**。仅连接不会分享页面内容。
6. 让该 Bot 调用 `browser_observe`，在原有 Browser 审批出现时批准首次动作。Bot 读取当前文档内有界的可见文字和控件名称，不接收 Cookie 或输入框的值。

侧栏显示当前分享的标题和地址；扩展分享期间显示 **READ**。Human 仍可正常浏览，但修改地址或刷新该文档会结束借用。

## 归还与重连

点击扩展或 BotHarness 侧栏中的“归还标签页”。原标签页保持打开。导航、刷新、关闭标签页、关闭 Browser Access、切换 Browser Target、Host／浏览器重启或断线也会结束借用。单次借用最长三十分钟；四十五秒未轮询的连接失效，每次操作及后台十秒清理间隔都会检查。再次借用需重新配对并明确分享。

浏览器内部页面、扩展页面和浏览器自带查看器不能通过此入口分享。配对失败时检查本地地址、生成新配对码，并在普通 HTTP／HTTPS 页面打开扩展。

## 控制一个已有的日常 Chrome 文档

在 Bot 设置 → Browser 操作目标中选择 **日常 Chrome · 控制**。此选项与上面的只读扩展独立。

1. 在日常使用的 Chrome Profile 安装微软官方 [Playwright 扩展 0.4.0](https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm)。它申请 debugger、tabs、tabGroups 和所有站点权限。
2. 为目标 PersonaBot 开启 Browser Access；Computer Access 可以保持关闭。
3. 在 Browser entry 点 **连接现有页面**，再在 Chrome 官方连接页面选择一个已有 HTTP(S) 标签页。保留每次连接确认；BotHarness 不使用跳过确认的 token。
4. 回到 BotHarness 核对页面标题与 URL。**已连接，尚未允许操作** 时 Bot 仍不能读取或操作；再明确点 **允许控制此页面**。
5. 在 DM 中要求 Bot 读取或编辑此页面，并通过现有原生 Session 审批批准首次 Browser 操作。此目标仅提供读取、文本输入和基于最新观察 ref 的点击。
6. 点 **暂停 Bot** 后可自行编辑页面，再点 **继续**。Bot 必须重新观察后才能操作。
7. 点 **归还标签页** 结束授权；Human 标签保留。

导航／刷新、关闭或移出所选标签、扩展断连、关闭 Access、切换 Target／Profile 和 Host 重启也会结束控制，需要重新连接并授权。向扩展标签组加入其他标签不会扩大 Bot 的文档授权。Human 继续在自己的 Chrome 窗口操作；此目标不提供 Container Viewer、截图、导航或其他受管 Browser 工具。

连接器固定为 `playwright-core@1.64.0-alpha-1790635538000`、官方扩展 protocol 2。等待选择页面时，可在 Browser entry 取消连接。连接错误也显示在那里；缺少扩展时先在 Chrome 实际打开的 Profile 安装后重试。本机／Docker Browser 和只读日常浏览器保留现有功能。

输入和点击会唤起已授权的标签页；观察不会切换标签页。

## Chrome Profile 控制

选择 **Browser Target → 日常 Chrome · 整个 Profile**，明确授权更大的范围。它与只读借用扩展及微软的单文档扩展分别独立。

1. 在 **chrome://extensions → 开发者模式 → 加载已解压的扩展程序** 中选择 `packages/browser/profile-extension`，或已安装 Browser 包中的 `profile-extension`。当前分发方式是源码目录，尚未上架 Chrome 商店；权限包含 tabs、scripting、debugger、本地存储和普通 HTTP(S) 网站，排除无痕标签页。
2. 在 BotHarness 点击 **配对 Chrome Profile**，将本地地址和五分钟内有效的一次性配对码填入 **BotHarness Chrome Profile Control** 扩展，勾选允许整个 Profile 后配对。仅安装不会自动配对或授权 Bot。
3. 为目标 PersonaBot 开启 Browser Access，并批准其原生 Session 操作，除非你明确启用了自动 Browser 审批。此 Profile 内所有已有和新开的普通网页都可发现；导航和刷新后无需重新配对，Computer Access 可以保持关闭。
4. 本切片提供 `browser_tabs` list/select、在选中标签页导航或刷新的 `browser_open`、`browser_observe`、基于 ref 的输入和点击。选择、导航、Human 编辑、继续以及每次修改后都重新观察。创建／关闭标签页、截图、键盘、滚动和上传尚未提供。
5. 编辑前点击 **暂停 Bot**，它等待已发出的操作结束再确认。继续后需要重新观察。多个授权 Bot 共享此 Profile，操作串行，各有选择与引用。
6. 关闭 Browser Access 阻止该 Bot；**解除 Profile 配对** 则撤销所有 Bot 的共享绑定。浏览器或 Host 重启保留配对，但清除选择、引用和原生 Session 授权。连接中断可在扩展点击 Reconnect。DevTools 或其他调试器占用时，Chrome 可能拒绝输入，请关闭冲突调试器再观察。

只支持本机 HTTP Host；45 秒没有轮询则连接不可用，命令超时为 12 秒。页面变化或拒绝后重新观察。输入时可能出现 Chrome 原生调试提示。本切片通过 Chrome for Testing 验证，不代表 Edge 或 Local／Container 的完整工具能力已经相同。
