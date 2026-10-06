# 分享 Bot 到 Bot 市场

分享 Bot，就是把它的 Memory Repository 发布成一个公开的 GitHub 仓库。别人在 Bot 市场里找到它、点 **安装**，会克隆这个仓库，得到一个带同样记忆的新 Bot。你的 Bot 本身、聊天记录、工作区授权和 IM 连接都不会被分享，之后在你这边的对话也不会自动同步过去。

## 发布前：检查会公开的内容

公开仓库任何人都能看到，包括 Git 历史里已经删掉的文件。Memory 里可能有你告诉 Bot 的个人信息、密钥或私人对话的摘要，发布前先看一遍：

1. 打开 **Bot 私聊 → Channel sidebar → 记忆文件**，逐个打开文件查看。
2. 打开 **记忆演化**，看历史提交里是否出现过不该公开的内容。

![记忆文件里能看到将要公开的全部文件，包括 .botharness/bot.json](/guides/share-bot/01-memory-files-zh.webp)

如果历史里出现过敏感内容，只删除文件不够。下面的提示词里写了处理办法：只推送一个不带历史的新提交。

## 方式一：让 Bot 自己发布（推荐）

前提：运行 DeepSeekBot 的电脑（Host）装了 [GitHub CLI](https://cli.github.com/)，并已经运行过 `gh auth login`。Bot 执行命令前会请你审批，每一步你都能看到。

复制下面这段，在要分享的 Bot 的私聊里发给它：

```text
请把你的 Memory 仓库分享到 BotHarness 的 Bot 市场，按下面的步骤做，每一步做完告诉我结果：

1. 列出 Memory 里的所有文件，并检查文件内容和 Git 历史里有没有密码、token、私人信息或我不想公开的内容。把发现的问题列给我，等我确认后再继续，确认前不要推送任何东西。
2. 如果还没有 README.md，写一份简短的介绍：你是谁、擅长什么、适合怎么用。
3. 确认 .botharness/bot.json 存在（DeepSeekBot 通常已经自动生成）。没有就创建，写上你的名称和 1 到 3 个岗位，格式是 {"name": "名称", "roles": ["岗位"]}；已经有了就保持不变。
4. 用 gh 在我的 GitHub 账号下创建一个公开仓库并推送当前分支。仓库名用你的名称的英文或拼音，先告诉我你打算用的名字。如果第 1 步发现历史里有不该公开的内容，就只推送一个不带历史的新提交。
5. 给仓库加上 botharness-bot 话题：gh repo edit --add-topic botharness-bot
6. 把仓库地址发给我。
```

![把提示词发给要分享的 Bot](/guides/share-bot/02-prompt-zh.webp)

Bot 会先列出检查结果并等你确认。确认后它会创建仓库、推送并加上话题，最后把地址发给你。

## 方式二：自己用命令发布

在 **设置 → 工作区授权** 里找到这个 Bot 的 Memory Repository 路径，然后在终端执行（把 `<路径>` 和 `<仓库名>` 换成你自己的）：

```bash
cd <路径>
gh repo create <仓库名> --public --source . --push
gh repo edit --add-topic botharness-bot
```

也可以在 GitHub 网页上新建一个空的公开仓库，用 `git remote add origin` 和 `git push -u origin HEAD` 推送，然后在仓库首页右侧的 **About → Topics** 里加上 `botharness-bot`。

## 让它出现在 Bot 市场

收录需要仓库是公开的，并且带有 `botharness-bot` 话题。满足条件的仓库每天会被自动收录一次；想马上出现，点 DeepSeekBot 侧栏消息列表上方的 **＋（新建）→ Bot 市场**，在顶部贴入仓库地址，点 **收录**：

![在 Bot 市场贴入仓库地址，立即收录](/guides/share-bot/03-market-paste-zh.webp)

收录后，它会出现在 DeepSeekBot 的 Bot 市场和 [官网 Bot 市场](https://deepseekbot.botharness.ai/market) 里，显示 README、Star 数、更新时间和话题。之后你每次推送，市场会在一小时内更新到最新提交。

![收录后在官网 Bot 市场看到的样子](/guides/share-bot/04-site-market-zh.webp)

收录失败时，Bot 市场会说明原因：

| 提示                              | 下一步                                                     |
| --------------------------------- | ---------------------------------------------------------- |
| 找不到这个仓库 / 这个仓库是私有的 | 确认地址正确，并在 GitHub 把仓库设为 Public。              |
| 缺少 botharness-bot 话题          | 在仓库首页 **About → Topics** 加上 `botharness-bot` 再试。 |
| 这个仓库刚刚收录过                | 同一个仓库 5 分钟内只抓取一次，稍后再试。                  |
| 这个仓库已被屏蔽或因举报隐藏      | 可以在 GitHub 上给 BotHarness 开 Issue 联系我们。          |

## 设置名称、岗位和头像：`.botharness/bot.json`

DeepSeekBot 会自动在每个 Bot 的 Memory 里生成 `.botharness/bot.json`，并保持更新：创建 Bot 时写入，之后每次改名称、岗位或头像都会同步。之前创建的 Bot 会在 DeepSeekBot 下次启动时补上这个文件。市场和安装后的 Bot 都读它，所以显示的名称、岗位和头像和你侧栏里的一致。上传的头像图片会存为旁边的 `.botharness/avatar.png`（或 `.jpg`、`.webp`）。

也可以手动编辑这个文件。你加的其他字段会保留；手动改的内容会一直保留，直到你下次在 DeepSeekBot 里改名称、岗位或头像：

```json
{
  "name": "BotPixel 像素画师",
  "roles": ["像素画", "头像设计"],
  "avatar": { "image": "assets/avatar.png" }
}
```

| 字段     | 说明                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| `name`   | 在市场里显示的名称，最多 60 个字。                                                                              |
| `roles`  | 岗位标签，最多 8 个。                                                                                           |
| `avatar` | 头像：`{ "image": "仓库里的图片路径" }`，PNG、JPEG 或 WebP，最大 128 KiB；或者 `{ "recipe": … }` 像素头像配方。 |

所有字段都可以省略。文件格式不对时整个文件会被忽略，市场改用仓库名和自动生成的像素头像。

相关：[记忆文件](/zh/docs/channel-sidebar/memory-files)、[记忆演化](/zh/docs/channel-sidebar/memory-evolution)。
