# AX shared default model

Use DSH's built-in `opencode-go` route for AX-launched isolated Profiles after a one-time
machine-local setup. The default model is `deepseek-v4-flash`; the setup script checks the model
against the catalog shipped with the worktree's pinned native adapter. This uses no additional
Provider plugin.

## Set the key locally

Run from the worktree in a local interactive terminal:

```bash
node scripts/dev-model.mjs setup
node scripts/dev-model.mjs check
```

The prompt hides the API key. Setup writes `~/.config/botharness/ax-model.json` with mode `0600`
inside a private directory, refuses to overwrite an existing selection, and prints no key. Keep
this file on the machine. If your own script has already supplied `OPENCODE_GO_API_KEY` in its
environment, use `setup --from-env`. Use `--model <id>` to select another installed Go model.

On WSL, run setup and the launcher under the same Linux user and Node environment. Windows and
WSL have separate home directories. The script checks POSIX permissions on WSL/macOS/Linux;
on Windows, protect your user configuration directory with its existing user ACL.

## Reuse in an isolated Profile

```bash
node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port <n> --build
```

Each launch reads the shared selection, injects only `OPENCODE_GO_API_KEY` into its child Host,
and adds a final launch Patch for native `llm-pi-ai` and `agent-default-model`. The Patch contains
the credential reference, preserves other Provider configuration, and selects the requested
model without copying any Profile credential store. It retains DSH's native request attribution
and real Session handling. Existing Profiles and independently launched Hosts are untouched.

A per-run `OPENCODE_GO_API_KEY` environment override takes precedence after setup. The previous
DeepSeek setup remains the fallback when no AX selection exists. To rotate the shared selection,
inspect and remove the private file yourself, then rerun setup; active Hosts keep their inherited
environment until restarted.

Open the launcher's local login URL, create/use a QA PersonaBot and obtain a real DM reply before
claiming model usability. `check` and `/api` health establish configuration and transport only.
Model access and Lark App ID/App Secret are separate credentials; Lark still uses the normal DSH
credentials flow and only one authorized QA receiver.
