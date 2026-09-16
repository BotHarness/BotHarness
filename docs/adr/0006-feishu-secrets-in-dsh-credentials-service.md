# Feishu app secrets live in the DSH credentials service

Each Bot's App Secret is stored in the DSH credentials service and referenced from Bot config through a credential reference; it never enters config files, SQLite, logs, cards, or the repository. This follows what every candidate base does and makes "zero secrets in the repo" a structural property rather than a review promise.

## Considered Options

- **Config file or SQLite** — rejected: plaintext secrets on disk and in backups.
- **Environment variable** — accepted only as a reference/override, not as storage.
