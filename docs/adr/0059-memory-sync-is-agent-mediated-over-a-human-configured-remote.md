---
Status: Accepted
Date: 2026-09-22
---

# Memory sync is agent-mediated over a Human-configured remote

One Human wants one PersonaBot's Memory to follow them across their own devices. We decided cross-device Memory Sync is Agent-executed with ordinary Git capabilities under a first-party Skill, against a Human-configured provider-agnostic Memory Remote, with bring-your-own remote and bring-your-own git login. The dialogue request is the authorization; v0 has no OAuth, no UI binding, and no Host-owned remote operations. This keeps credentials out of BotHarness entirely and stays inside the file-first direction: modern LLMs need only the background statement that Memory is git-versioned content, then they guide the setup step by step.

## Decisions

- Scope is one Human's own private remote across their own devices (Dropbox-like personal sync). Multi-writer shared Memory is deferred.
- Content scope is all files under the Memory Repository. PersonaBot identity, Sessions, Bindings, credentials, and Channel history do not sync: the device-B bot is the same Memory under a different identity. Device-B onboarding is a new PersonaBot plus a confirmed reset to the remote branch (handles unrelated histories and discards the seed commit).
- The carrier is a first-party Skill (Orchestrator scope, slash-invokable) plus user docs, with zero Host/Client changes. No elaborate guided dialogue is built; the Skill states the background and the red lines, and the LLM conducts the interaction.
- Pushed commits keep the repository-local bot identity with actor/cause attribution (per ADR-0047) and never borrow the Human's global git identity.
- Red lines live in the Skill body: no `--force` or branch deletion, no credentials in files or commits, `GIT_TERMINAL_PROMPT=0` fail-fast, persona/pinned conflicts are reported rather than silently overwritten, never push a dirty tree, and echo remote plus branch plus direction before executing.
- v0 is bring-your-own remote plus bring-your-own git login; BotHarness never sees the credential. Optimization for ordinary users happens in guidance quality, not in auth machinery.

## Considered Options

- **Host-owned sync service holding the token in DSH credentials** — rejected for v0: it creates a second authority beside the accepted-Memory-Commit boundary, and piping a Host-held secret into agent shell violates the credential isolation behind ADR-0006.
- **GitHub OAuth login plus in-harness binding** — rejected: the product has no account concept (single-user local product), GitHub is not an identity path (ADR-0019), and OAuth cannot create GitHub accounts, so it would serve only users who already have one.
- **GitHub-exclusive transport** — rejected: agent plus bash is provider-agnostic by construction; GitHub appears only as a documentation example.
- **Multi-writer shared repository now** — deferred: untrusted writers reach pinned context, which is a prompt-injection channel; it needs a trust boundary first.
- **Host-assisted credential setup later** — acknowledged as a separate future architecture, not a v0 extension: once the Host holds the secret, execution must move back to the Host, which reopens this decision.

## Consequences

- Credential onboarding burden stays with the Human; the Skill documents the common setups (private repo, PAT or SSH, OS credential helper) without touching secrets.
- Device-B onboarding is destructive to the seed commit by design; the Skill requires explicit confirmation before the reset.
- Two mechanism facts remain unverified for implementation: the DSH Skill installation and Agent Scope path that delivers this Skill to Orchestrator Sessions, and shell environment inheritance (`HOME`, ssh-agent, credential helpers) in the default Execution World.
- A future one-click or Host-owned sync must revisit this ADR explicitly; it cannot be added as a compatible extension.
