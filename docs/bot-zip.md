# Export and import a Bot

A Bot can be packed into a zip file to send to a friend or colleague, or to move to another computer. Importing it gives the other person a new Bot with the same memory. Unlike [sharing a Bot to the Bot Marketplace](/docs/share-bot), this needs no GitHub and publishes nothing: the zip only leaves your computer when you send it to someone.

## What is in the zip

| Included                                                      | Never included                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| The Bot's Memory files, uncommitted changes included          | Files ignored by `.gitignore`, symbolic links                 |
| `.botharness/bot.json` (name, tags, bio) and the avatar image | Sessions, chat history, the Bot Inbox                         |
| Optional: Git history (every branch, tag and commit)          | IM connections, Workspace grants, model settings, credentials |
|                                                               | Git remotes, Git config and recovery checkpoints              |

## Export

1. Open the DM of the Bot you want to export and click the Bot's name at the top to open its profile.
2. Click **Share** at the top right of the profile. You can also right-click the Bot in the sidebar's message list and choose **Share**.

![Share at the top right of the Bot profile](/guides/bot-zip/02-export-section-en.webp)

3. In the export window, choose the files to put in the zip. Everything is ticked by default. Click the arrow in front of a folder to expand it, and untick files or whole folders you don't want to share, or use **Select all** and **Select none**. `.botharness/bot.json` and the avatar are always included and can't be unticked.
4. To let the other person see how the Bot's memory changed over time, tick **Include Git history**.
5. Click **Export**. Your browser downloads a zip named after the Bot.

![The export window: choose files and tick Include Git history](/guides/bot-zip/03-export-window-en.webp)

### Check before you share

Memory can hold passwords, API keys, personal details you told the Bot, or summaries of private conversations. Before sending it to anyone, look through each file in **Bot DM → Channel sidebar → [Memory files](/docs/channel-sidebar/memory-files)** and untick the ones you don't want to give away.

Git history also keeps older content that was deleted or changed. That is why **Include Git history** is only available when every file is ticked: as soon as you untick any file it is greyed out, because the history would still show the files you left out. When in doubt, leave the history out.

## Import

1. Above the sidebar's message list, click **+ (New) → Create Bot → Import from zip**.

![The Create Bot submenu: Start empty, Import from GitHub, Import from zip](/guides/bot-zip/01-create-menu-en.webp)

2. Click **Choose zip file**, pick the zip you received and click **Import**.

![Import from zip: choose the file, then click Import](/guides/bot-zip/04-import-en.webp)

Importing creates a new Bot and opens its DM:

- Its name, tags, bio and avatar come from `.botharness/bot.json` in the zip; `roles` in an older zip are imported as tags. Without that file, the zip's file name becomes the Bot's name.
- A zip without Git history gives the new Bot's Memory a single initial commit.
- A zip with Git history keeps every branch, tag and commit and checks out the branch the Bot was on when exported; changes that were uncommitted then are still uncommitted. You can see them in [Memory evolution](/docs/channel-sidebar/memory-evolution).

![After importing with history, Memory evolution shows the original branches and commits](/guides/bot-zip/05-imported-history-en.webp)

The imported Bot and the original are independent; later chats and memory on either side are not synced. Set up IM connections, Workspace grants and model settings again on the new Bot.

### Only import zips you trust

The files in the zip become the new Bot's Memory and may contain harmful content, or text the Bot will follow as instructions. Make sure you trust where it came from, and look through **Memory files** after importing.

An unsafe or damaged zip is refused, and nothing is left behind:

| Message                                         | Cause and next step                                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| This is not a valid zip file, or it is damaged. | The download was incomplete or the zip was changed. Download it again, or ask for a new export.             |
| The zip has unsafe paths …                      | A file tries to write outside the Bot's folder (such as `../`) or is a symbolic link. Ask for a new export. |
| The zip is too large …                          | Over 100 MB or 20,000 files. Ask the sender to untick large files or leave the history out.                 |
| The zip has no files.                           | The wrong file was chosen, or the zip is empty.                                                             |

A folder zipped with your system's own compression tool can be imported too: if every file sits in one top-level folder, that folder is unwrapped, and `__MACOSX` and `.DS_Store` are skipped.

Related: [Share a Bot to the Bot Marketplace](/docs/share-bot), [Memory files](/docs/channel-sidebar/memory-files), [Memory evolution](/docs/channel-sidebar/memory-evolution).
