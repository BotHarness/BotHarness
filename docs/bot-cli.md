# Create Bots from the command line

`deepseekbot create` makes a new PersonaBot without clicking: blank, from a bot bundle (a directory or a zip with the same shape as the [bot-zip export](docs/bot-zip.md)), or from GitHub. It is built for external coding agents driving a DSH install, so its output is machine-first.

## Usage

```bash
deepseekbot create --name <name> [--persona <text> | --persona-stdin]
                   [--description <text>] [--role <tag> ...]
                   [--preset <model-preset-id>] [--home <dsh-home>]
deepseekbot create --name <name> --from-git <url | owner/repo> [...]
deepseekbot create [--name <name>] --from-zip <file> [...]
deepseekbot create [--name <name>] --from-dir <directory> [...]
deepseekbot list [--home <dsh-home>]
deepseekbot show <id> [--home <dsh-home>]
deepseekbot model-presets [--home <dsh-home>]
deepseekbot model-preset-create --name <preset> --orchestrator-provider <p> --orchestrator-model <m>
                                [--orchestrator-effort <e>] --assignment-provider <p>
                                --assignment-model <m> [--assignment-effort <e>] [--home <dsh-home>]
deepseekbot model-preset-apply <id> --preset <preset-id> [--home <dsh-home>]
deepseekbot model-plan <id> [--home <dsh-home>]
```

Exactly one source per create. `--name` is required for blank and GitHub bots; for bundle imports it overrides the name from `.botharness/bot.json` (or the file name). A `--from-git` value accepts a full Git URL (`https://`, `ssh://`, `git@host:path`) or an `owner/repo` shorthand for `https://github.com/owner/repo.git`, which also covers Bot Marketplace entries through their clone URL. A `--from-dir` bundle skips `.git` as files but packs it as history when present.

`--home` points at the target `DSH_HOME`; a fresh directory works with zero clicks. Without it, `DSH_HOME` from the environment is used. Stop the Host first when targeting a live profile: the profile writer lease is exclusive, and every verb fails coded (`lease-unavailable`) while the Host holds it.

## Machine contract

Stdout carries exactly one JSON document. Success exits 0:

```json
{
  "bot": { "id": "bot-…", "name": "…" },
  "dm": { "channelId": "dm-bot-…" },
  "dataDir": "<dsh-home>/botharness/bots/bot-…/memory",
  "steps": [{ "name": "create-bot", "status": "ok" }],
  "next": ["Open DM dm-bot-… in the DSH web client …"]
}
```

Failure exits non-zero with `{"error": {"code", "message"}}` using a stable code (`usage`, `secret-in-argv`, `bad-zip`, `bad-bundle`, `bad-ref`, `unknown-preset`, `unknown-bot`, `duplicate-preset`, `git-not-found`, `git-clone-failed`, `git-clone-timeout`, `memory-unavailable`, `invalid-input`). Human-readable lines go to stderr only, so stdout stays parseable in both cases.

## Identity

The bot name is a label; identity is the id. Every create mints a new bot, so reusing a name returns a second bot and still exits 0.

## Secrets

Never pass secrets as arguments: any `--api-key` / `--token` / `--secret` / `--password` style flag is a hard error (`secret-in-argv`). Model keys and tokens travel in the environment (for example `DEEPSEEK_API_KEY`, `GITHUB_TOKEN`) or a stdin pipe (`--persona-stdin`); result JSON never contains secret values.

## Models

Without `--preset`, creation still succeeds and the `model` step reports `no-model-yet`: authorize a model in Bot-mode Settings, then message the Bot to verify a live reply. With `--preset <model-preset-id>`, that preset is applied at creation; an unknown id fails with `unknown-preset` before any bot is minted.

The model verbs manage the same records afterwards: `model-presets` lists the profile presets, `model-preset-create` mints one from explicit provider/model routes, `model-preset-apply` puts it on a Bot, and `model-plan` shows the active plan. Routes are shape-checked plus provider-existence-checked offline (unknown providers fail fast); catalog liveness and readiness inspection stay Host-side, so `model-plan` reports readiness deferred. See ADR-0157.

## Memory

`memory-snapshot`, `memory-file --path`, `memory-history [--limit]`, and `memory-diff --sha` read the Bot memory store; `memory-save --path (--body | --body-stdin)` writes one file and commits it. `--expected-head` defaults to the current HEAD (pass it explicitly for compare-and-swap); `--edit-id` defaults to a fresh UUID and makes repeat submissions idempotent. A stale head or a no-change write fails with `memory-conflict`, a missing file reads back `null`, and malformed shas fail `invalid-input`.
