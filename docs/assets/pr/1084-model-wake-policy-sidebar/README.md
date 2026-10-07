# #1084 Model and Wake policy in the DM Channel sidebar

Captured at 1440 × 960 from isolated DSH 0.2.0-rc.1 Profiles: **Before** runs `main` at 52a0cc3, **After** runs this branch. Both use a fresh Bot named Aurora with no API key. The After Bot has a preset applied (`日常助手`) and an ordinary Group digest of 8 messages / 60 s, set through the same bridge methods the sidebar calls.

## DM Channel sidebar

Before: no Model or Wake policy entries.

|     | Light                                                    | Dark                                                   |
| --- | -------------------------------------------------------- | ------------------------------------------------------ |
| zh  | ![before-sidebar zh light](before-sidebar-zh-light.webp) | ![before-sidebar zh dark](before-sidebar-zh-dark.webp) |
| en  | ![before-sidebar en light](before-sidebar-en-light.webp) | ![before-sidebar en dark](before-sidebar-en-dark.webp) |

After: **模型 / Model** and **唤醒策略 / Wake policy** follow Workspace Grants; collapsed headers show `model · effort` and the ordinary Group rule.

|     | Light                                                  | Dark                                                 |
| --- | ------------------------------------------------------ | ---------------------------------------------------- |
| zh  | ![after-sidebar zh light](after-sidebar-zh-light.webp) | ![after-sidebar zh dark](after-sidebar-zh-dark.webp) |
| en  | ![after-sidebar en light](after-sidebar-en-light.webp) | ![after-sidebar en dark](after-sidebar-en-dark.webp) |

## Edit dialogs (After)

|     | Light                                                            | Dark                                                           |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| zh  | ![after-model-dialog zh light](after-model-dialog-zh-light.webp) | ![after-model-dialog zh dark](after-model-dialog-zh-dark.webp) |
| en  | ![after-model-dialog en light](after-model-dialog-en-light.webp) | ![after-model-dialog en dark](after-model-dialog-en-dark.webp) |
| zh  | ![after-wake-dialog zh light](after-wake-dialog-zh-light.webp)   | ![after-wake-dialog zh dark](after-wake-dialog-zh-dark.webp)   |
| en  | ![after-wake-dialog en light](after-wake-dialog-en-light.webp)   | ![after-wake-dialog en dark](after-wake-dialog-en-dark.webp)   |

## PersonaBot Profile, scrolled to the bottom

Before: the Profile ends with **Attention policy**; Model preset sits above it.

|     | Light                                                    | Dark                                                   |
| --- | -------------------------------------------------------- | ------------------------------------------------------ |
| zh  | ![before-profile zh light](before-profile-zh-light.webp) | ![before-profile zh dark](before-profile-zh-dark.webp) |
| en  | ![before-profile en light](before-profile-en-light.webp) | ![before-profile en dark](before-profile-en-dark.webp) |

After: both sections are gone.

|     | Light                                                  | Dark                                                 |
| --- | ------------------------------------------------------ | ---------------------------------------------------- |
| zh  | ![after-profile zh light](after-profile-zh-light.webp) | ![after-profile zh dark](after-profile-zh-dark.webp) |
| en  | ![after-profile en light](after-profile-en-light.webp) | ![after-profile en dark](after-profile-en-dark.webp) |
