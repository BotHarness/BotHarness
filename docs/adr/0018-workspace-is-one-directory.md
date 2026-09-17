# A workspace is a single directory

BotHarness workspaces map one-to-one to DSH workspaces: one host directory, which becomes the session's cwd and the root that DSH's sandbox and file tools already use. Multi-directory needs are met by multiple workspaces — the UI may group them, and a common parent directory is the recommended layout — not by a multi-root workspace.

## Considered Options

- **Workspace as a named group of directories** — rejected: DSH's fs/shell/sandbox assume one root, so the extra directories would be visible only through BotHarness tools — a half-visible filesystem that is hard to explain or test.
- **BotHarness-provided multi-root file tools** — rejected for the PoC: duplicating DSH's file layer and restricting the built-in tools conflicts with sharing host tools by default.

## Consequences

- Sessions always run with one cwd; moving to another directory means another workspace.
- Grouping is presentation only; no semantics attach to a group.
