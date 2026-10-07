# 模型

打开 **Bot 私聊 → Channel sidebar → 模型**。这里显示这个 Bot 使用的模型；收起时，标题右侧也会显示 Orchestrator 的「模型 · effort」，不用展开就能核对。

![Bot 私聊侧栏中的模型分区，显示 Orchestrator 与 Assignment 默认模型](/guides/channel-sidebar/14-model-zh.webp)

## 读懂每一行

| 行                  | 显示内容                                                                              |
| ------------------- | ------------------------------------------------------------------------------------- |
| Orchestrator 模型   | 预设名称（或「自定义快照」）、修订号，以及日常对话所用的 `provider / 模型 · effort`。 |
| Assignment 默认模型 | 新任务会话未另选模型时使用的默认项。                                                  |
| 快速切换预设        | 选择已保存的预设后点 **切换**，才会应用到这个 Bot；只选下拉项不会生效。               |

## 修改模型

点击任一行，打开 **模型预设** 弹窗。弹窗里的控件与原来 Profile 中的一致：创建预设、编辑所选预设、仅为此 Bot 修改 Orchestrator，以及选择这个 Bot 允许的 Assignment 模型与 effort。

![从侧栏打开的模型预设弹窗](/guides/channel-sidebar/15-model-dialog-zh.webp)

每个字段、预设修订与独立快照的说明见 [模型教程](/zh/docs/model-setup)。保存后从之后的回合生效；已创建的 Assignment 继续使用创建时的模型。

## 隐藏或移动

和其他分区一样，可以在 **编辑侧栏** 中移动或隐藏 **模型**，见 [显示与布局](/zh/docs/channel-sidebar/display)。
