---
Status: Accepted
Date: 2026-10-10
Issues: [#1308](https://github.com/BotHarness/DeepSeekBot/issues/1308)
---

# CLI model validation is tiered; key validity stays Host-side

The offline `deepseekbot` CLI applies model presets without the catalog validation the UI performs, because that validation needs the Host-only `dsh-llm` runtime. Blind apply pushes typos (wrong provider/model names) to message-send time, but full validation needs provider keys plus network. We decided that **CLI model validation runs in tiers — shape always, provider existence offline, key validity Host-side — and a skipped tier is always reported, never silent.**

## Decision

- **Shape tier, always.** Every route flag is checked structurally (`provider`/`model` non-blank, effort well-formed); failures are `usage`/`invalid-input` before anything is minted or written.
- **Existence tier, offline.** The CLI links `@deepseek-ai/dsh-llm` for keyless calls only (`listProviders`-level existence of the provider). Model-name existence needs a networked model list, so model names stay shape-checked; an unknown provider fails fast with `invalid-input`.
- **Validity tier, Host-side.** Whether the key works and the model answers is a runtime property. The CLI never reads `$DSH_HOME/.credentials.yaml` to pre-check keys: that file is the DSH credentials service's managed document, and copying key management into the CLI widens the secret surface for a check whose honest form is sending one message. `model-plan` reports readiness `deferred` (`host-only`), and every skip is a visible step, matching the `no-model-yet` precedent from ADR-0156.
- **No DSH-CLI delegation.** The official DSH CLI has no model-configuration surface (boot/plugin/config/diagnostics only), so there is nothing to reuse; the CLI reads provider keys from the launch environment only, per the official precedence chain, and never echoes them.

## Considered Options

- **Skip all validation offline:** rejected. Typo-level errors are the cheapest to catch and the most common in generated pipelines; pushing them to send-time wastes a full Host round trip.
- **Full validation via dsh-llm with env keys:** rejected. It duplicates the Host's key management inside the CLI and still cannot cover grant-type records (OAuth payloads) that only their provider owner can interpret.
- **Read .credentials.yaml for pre-checks:** rejected. Same secret-surface objection, plus the file is versioned and strictly validated — a reader that drifts from the store's parser risks false verdicts.
- **Delegate to the DSH CLI:** rejected. No such surface exists upstream.

## Consequences

- P1a verbs (`model-preset-create`/`model-preset-apply`) implement the shape and existence tiers; anything they cannot check appears as a deferred readiness marker, never as a silent pass.
- Adding a provider upstream means extending the CLI's static existence source alongside the Host catalog; the two lists are reviewed together.
- Key problems surface at first send (P2 `send` verb) or in Bot-mode Settings, both of which already exist as the honest checks.
