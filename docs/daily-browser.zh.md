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
