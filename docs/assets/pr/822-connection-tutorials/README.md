# Connection tutorial UI evidence

Captured from real isolated DSH Hosts on 2026-10-08. All images are unmodified 1280 × 720 browser captures, with the same generic Bot (Deletion review), empty DM and no connected IM accounts.

- Before: checkout `006c0fa3`, isolated profile `bh923-ui-before` on localhost:31924. The external-entries and external-identity-list components are identical to PR base `6f3a2bad` (verified with git diff).
- After: branch `codex/connection-tutorial-links`, isolated profile `bh-tutorial-ui` on localhost:31925.
- `dark`: English, dark theme. `light`: Chinese, light theme.
- `sidebar`: External identities expanded; the standalone Lark setup card is removed.
- `modal`: Bind app open; platform setup paragraphs are replaced by website tutorial links.

Runtime checks: clicked the Chinese WeChat tutorial and observed the official Chinese tutorial in a new tab while the binding dialog remained open. Escape closed the dialog and returned focus to Bind app. All eight localized tutorial URLs returned HTTP 200. No binding, credential or message operation was performed.
