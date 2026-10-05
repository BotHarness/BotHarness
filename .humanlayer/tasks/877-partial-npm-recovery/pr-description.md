[Refs #877](https://github.com/BotHarness/BotHarness/issues/877) | [Claim](https://github.com/BotHarness/BotHarness/issues/877#issuecomment-5996093332)

Task: `codex/local/01a10b34-b414-7852-bbac-af4fc24b90fe`.

## Why the change

When main advances during a partial npm publication, allow maintainers to finish the original approved immutable packages without rebuilding them with newer features.

## Special things to note

- Merge risk: **two-way workflow change** — revert restores strict current-main preparation; **medium release-only blast radius** — an incorrect recovery could publish a stale package, while npm versions remain immutable. Review focus: explicit recovery opt-in, main ancestry, original successful manual-main run, clean plan, all byte matches and an already published product component; the token stays in the final publishing step.
- Default publication remains current-main-only; recovery checks out the exact approved source and executes its existing verifier/publisher without rebuilding. A reused Provider alone does not qualify recovery, and PR previews cannot become publication sources. Tag cleanup, registry propagation retries and generated-source diagnosis remain #877 follow-up scope.
- Validation: lint, format, typecheck, bilingual ledgers and 26 focused release tests passed. A credential-free check against preparation `37310663091`, the approved plan/tarballs and public npm confirmed the three matching dependency packages; this check did not publish anything. Remote checks are pending.

## Change outline

```text
manual publisher on current main
  verify successful manual-main preparation + source/run agreement
  historical source?
    require resume_partial=true + source is a main ancestor
  check out the exact reviewed source
  download and verify original tarballs + clean plan + SHA-256/SHA-512
  partial recovery?
    verify every existing version; require matching Core/Client/product
  supply NPM_TOKEN only to the original publisher
    skip identical versions → publish missing dependencies/product in order
```

PR preparation keeps its artifacts separate from immutable public versions:

```diff
- 0.1.0-alpha.1 for every PR preview
+ 0.1.0-alpha.1-preview.<PR>.<run> (never eligible for publication)
```
