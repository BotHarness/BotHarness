# Model

Open **Bot DM → Channel sidebar → Model**. The entry shows the model this Bot uses. The collapsed header shows the Orchestrator `model · effort`, so you can check it without expanding.

![The Model entry in a Bot DM with the Orchestrator and Assignment default rows](/guides/channel-sidebar/14-model-zh.webp)

## Read the rows

| Row                      | What it shows                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Orchestrator model       | The preset name (or **Custom snapshot**), its revision, and `provider / model · effort` for everyday chat.           |
| Assignment default model | The model new task Sessions use when no other model is chosen.                                                       |
| Quick preset switch      | Pick a saved preset, then click **Switch** to apply it to this Bot. Choosing a dropdown entry alone changes nothing. |

## Edit the model

Click either row to open the **Model preset** dialog. It has the same controls the Profile used to have: create a preset, edit the selected preset, customize only this Bot's Orchestrator, and choose the Assignment models and efforts this Bot may use.

![The Model preset dialog opened from the sidebar](/guides/channel-sidebar/15-model-dialog-zh.webp)

[API and Bot model setup](/docs/model-setup) explains every field, preset revisions and independent snapshots. A saved change applies to later turns; an Assignment keeps the model it was created with.

## Hide or move the entry

Use **Edit sidebar** to move **Model** or hide it, like any other entry. See [Display and layout](/docs/channel-sidebar/display).
