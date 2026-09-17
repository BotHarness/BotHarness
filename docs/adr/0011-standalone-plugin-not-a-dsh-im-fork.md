# Integrate as a standalone DSH plugin, not a dsh-im fork

dsh-im already provides multi-Bot management, session routing (`group:<chatId>`, `group:<chatId>:thread:<threadId>`, managed topics), a settings UI, per-Bot context enhancement, and inbound-file staging — but it exposes no extension seam for routing, reply scope, or per-Bot memory, and its Feishu bridge is a ~243 KB JavaScript module. The PoC therefore ships as a standalone DSH plugin using Harness seams only (tools, system prompt, settings, credentials, storage), identifying a Bot from its session's workspace; forking dsh-im or upstreaming routing hooks is revisited at M2 only if a hard need appears. PRD §5.1's Bot registry, session router, channel adapter, and most of the settings UI are delegated to the base rather than rebuilt.

## Consequences

- AC-3.2's model-facing reply-scope tool is deferred: the PoC's thread-first default comes from the base's per-Bot `groupTopicReply` config, and the override tool moves to the M6 upstream evaluation (ADR-0009 amended accordingly).
- M1 must verify a stable session→Bot identification; memory scoping and persona injection both depend on it.
- The PRD's `groupSessionScope` concept is retired in favour of the base's `groupTopicReply` — one less config knob to invent and maintain.
- Bot identification reads the base's own stores (`$DSH_HOME/integrations/<channel>/{config,workspaces}.json`) because the base exposes no session→Bot seam; the coupling is isolated in one module and must be re-verified on every base bump.
