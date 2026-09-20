# BotHarness

[中文](./README.md) ｜ **English**

A DeepSeek Harness (DSH) plugin layer that gives LLM agents a persistent identity: **PersonaBots** — bots with a persona and memory that spans sessions, able to work concurrently.

- **BotHarness** (this repo): the platform layer — PersonaBot entities, memory, state, and how work happens (SDK + bundle; **no DSH fork**, ADR-0015)
- **DeepSeekBot**: the first app — brings PersonaBots into the DSH sidebar (create, @delegate, keep working) and connects Feishu / Lark

## Docs

- Architecture & data flow (living doc): [docs/architecture/botharness-architecture.md](docs/architecture/botharness-architecture.md) · site https://botharness.ai
- BotHarness Product Context: [CONTEXT.md](CONTEXT.md) · Decisions: [docs/adr/](docs/adr/)
- Milestones & tickets: repository Issues and Projects

## Status

- v1.1 spec: SoulSnapshot / Soul registry decisions (ADR-0019/0020)
- **M1 BotHarness skeleton** merged (PR #13; `@botharness/core`: PersonaBot registry / bot home / state events; 38 tests green)
- **M2 memory MVP** implemented (#9; front-matter / tree injection / `memory_*` / git)
- Next: M3 roster & delegation (#10) → M6 SoulSnapshot (#17)

## Inspiration

- **Grok Bot**: every Bot has its own computer, memory, state, and works autonomously
- **DeepSeek Harness**: a plugin host that carries other plugins

## Development

Toolchain: pnpm 12.4.2 · Node ≥22 · TypeScript 7 · oxlint / oxfmt · vitest · tsdown; the client package (`@botharness/client`) uses React (DSH client contract) + blobatar.

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm build
```

Local docs preview (WSL-friendly, stable URL):

```bash
pnpm dev           # → https://docs.botharness.localhost (first run creates + trusts a local CA; may ask for sudo)
PORTLESS_PORT=8788 PORTLESS_HTTPS=0 pnpm dev   # no-sudo variant → http://docs.botharness.localhost:8788
pnpm docs:dev      # direct fallback → http://localhost:4321
```

> portless runs from the `apps/docs` package (display name lives in that package's `portless` field); avoid Windows Hyper-V reserved port ranges (e.g. 1349–1448).

Repository layout (monorepo):

```text
packages/core        @botharness/core   # PersonaBot registry / state (memory lands in M2)
packages/client      @botharness/client # React: roster / detail / delegation entry (M3)
packages/im          @botharness/im     # IM adapter (M5)
packages/deepseekbot deepseekbot        # bundle + app (later)
```

The M1 scaffold (plugin entry, workspace→bot resolution) now lives in `packages/core`; the resolver is kept as the IM binding helper.

## License

MIT — see [LICENSE](./LICENSE); third-party works distributed inside the client bundle are listed in [packages/client/THIRD_PARTY_NOTICES.md](./packages/client/THIRD_PARTY_NOTICES.md).
