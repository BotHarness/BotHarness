# Human default names — genuine DSH evidence (#621)

This scene uses an isolated DSH Profile on port 31990 with the local BotHarness bundle. A real PersonaBot used `channel_list` and `channel_send` to commit a trusted Human mention before either actor was renamed. The Human then saved “教授 🐻” in plugin settings and gave the Bot the same name.

## Verified interactions

- Optional name: unset Human → save Unicode name → restore Human → save again.
- Historical typed Human and Bot mentions and authors show current names, while ordinary `@Human` text remains unchanged.
- An independent browser window updates through the existing roster stream.
- Inbox reply context works in light and dark themes; the 900px layout has no horizontal overflow.
- Raw message bodies, stored mention spans, Channel revision and personal attention snapshots are unchanged by rename.
- Cold Host restart (a new verified process) retains the name and original message/revision.

## Screenshots

| Scene                          | Evidence                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Before                         | [Settings](before-settings.png), [historical Channel messages](before-channel.png)             |
| Save the Human name            | [Settings after save](after-settings.png)                                                      |
| Both actors have the same name | [Channel light](after-channel-light.png), [Channel dark](after-channel-dark.png)               |
| Inbox source context           | [Light](after-inbox-light.png), [dark](after-inbox-dark.png), [900px layout](after-narrow.png) |
| Clear / restart                | [Restored default](after-default.png), [after cold restart](after-restart.png)                 |

## Human QA

1. Open the isolated DSH instance at `http://127.0.0.1:31990/`.
2. In Settings → Bot settings, change “My default name” and save. Close/reopen settings and check the committed value.
3. Open the “Roleplay names QA” Channel whose Bot is “教授 🐻”. The older Human/Bot mention chips resolve the new names; plain body text still says `@Human`.
4. Open Inbox → Mentions and replies, choose that Bot, click Reply and expand nearby messages. Check both author names and typed mention targets.
5. Use Restore default; Human names return to Human. Reapply a name and compare another window.

The verified emoji is U+1F43B (BEAR FACE); its glyph is rendered by the platform font. Exact saved text and code points are recorded in results.json. This evidence was recaptured after integrating main, with Human names at schema generation 41 following main usage retention generation 40.

The resumable verifier is `scripts/e2e-human-names.mjs`; `check` exercises the real scene and `restart` checks the persisted scene after a cold restart. Private authentication URLs and local logs are excluded from these artifacts.
