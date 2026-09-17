# Ship BotHarness as a DSH plugin layer, not a fork

DSH is a plugin host with no persistent identity: agents are per-session and personas are prompt-level preset content, so a Bot/Persona layer is an extension rather than a new runtime. BotHarness therefore ships as publishable packages plus a DSH bundle that composes them; DeepSeekBot is the app/bundle built on it, and DSH core stays untouched.

## Considered Options

- **Fork or supersede DSH** — rejected: preview-period churn and maintenance cost, while the plugin seams already cover tools, prompt context, storage, credentials, client UI, agents, jobs, and sandbox.
- **One opaque plugin** — rejected: the harness must be consumable by other plugins (IM, Live2D, future apps), so its core needs a published package boundary.

## Consequences

- Packages published from one monorepo: `@botharness/core` (host domain), `@botharness/client` (React panel), `@botharness/im` (adapter, later), `deepseekbot` (bundle + docs). The repo splits only when a second consumer appears.
- The sidebar roster needs a DSH client bundle, so the earlier "no React toolchain" decision is retired.
- Live2D is explicitly out of this design: a separate, deferred plugin consumes raw model/tool/response signals to drive animation.
