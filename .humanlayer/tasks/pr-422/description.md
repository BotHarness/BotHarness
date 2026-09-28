[#419](https://github.com/BotHarness/BotHarness/issues/419) | [#420](https://github.com/BotHarness/BotHarness/issues/420) | [#421](https://github.com/BotHarness/BotHarness/issues/421)

## Why the change

DSH `0.2.0-rc.1` is the current `next` release, so BotHarness's pins, engines, dev loop, and verification docs move from `0.1.7-rc.2` to the new RC in one reviewed change.

## Special things to note

- Merge risk: **two-way door** — revert this commit and reinstall at `0.1.7-rc.2`; **medium blast radius** — every workspace package, the lockfile, and the local dev loop move together, and an existing 0.1.7 dev Profile must be recreated. Review focus: the version surface and the e2e adaptations that carry the macOS verification.
- macOS evidence on this branch: `lint`, `typecheck`, `test` (135 files / 1157 tests) and `build` green; a fresh isolated Profile reports a healthy authenticated API on 0.2.0-rc.1; `e2e-sidebar-preview` PASS; `e2e-personabot-first-dm --expect-reply --expect-stream` PASS with a real model reply; `e2e-personabot-create --with-dm` PASS across a Host restart; a dev-client rebuild triggers the full-page reload and Bot mode returns. Screenshots: `docs/assets/pr/422-dsh-020-macos/bot-mode.png`, `docs/assets/pr/422-dsh-020-macos/first-dm-reply.png`. Windows (WSL2) verification is tracked in #421.
- Native Windows Desktop HMR was measured on 0.1.7 RC2 only; the docs label those claims as historical and keep the Desktop path out of scope.

## Change outline

Every DSH pin, engine, and release-age exemption moves together; the lockfile resolves the 0.2.0-rc.1 closure (pnpm also appended six generated exemptions for packages new to the closure).

```diff
 package.json
-  "@deepseek-ai/dsh": "0.1.7-rc.2"
+  "@deepseek-ai/dsh": "0.2.0-rc.1"
 packages/{core,client,computer,deepseekbot}/package.json
-  "@deepseek-ai/dsh-*": "0.1.7-rc.2", engines.dsh: "0.1.7-rc.2"
+  "@deepseek-ai/dsh-*": "0.2.0-rc.1", engines.dsh: "0.2.0-rc.1"
 pnpm-workspace.yaml
-  packageExtensions + minimumReleaseAgeExclude … 0.1.7-rc.2
+  packageExtensions + minimumReleaseAgeExclude … 0.2.0-rc.1
+  (+6 pnpm-generated exemptions: otel, product analytics, computer-use, …)
 pnpm-lock.yaml
   resolved 0.2.0-rc.1 closure
```

No Host or Client source adaptation was needed for the type surface; the browser e2e scripts needed three timing/localization fixes that the new RC's UI surfaced.

```diff
 scripts/e2e-*.mjs
-  button.textContent?.trim() === 'Continue'
+  ['Continue', '继续'].includes(button.textContent?.trim() ?? '')

 scripts/e2e-personabot-first-dm.mjs
-  dismiss the notice and click Bot mode in one tick
-  type into textarea[placeholder^="发消息给"]
+  wait for .bh-root, then wait for [role="menuitem"] before clicking it
+  wait for the composer to settle, then type into the textarea
+  or the rich [role="textbox"] the composer swaps to
```

The dev-loop documentation moves to the new RC; claims that were only measured on 0.1.7 RC2 stay clearly historical.

```text
AGENTS.md / docs/client-bridge.md §7 / .agents/skills/dsh-dev/SKILL.md
├── pinned CLI and Profile version     0.1.7-rc.2 → 0.2.0-rc.1
├── dev-client-refresh comment         RC2-scoped → version-neutral (verified on 0.2.0 RC1)
├── Desktop HMR claims                 labelled 0.1.7 RC2 measured, 0.2.0 RC1 not re-verified
└── pitfall log #26                    localized notice, animated menu, rich composer
CHANGELOG.md / CHANGELOG.zh.md         Unreleased › Changed: supported DSH runtime moved
scripts/e2e-rc2-personabot-create.mjs → scripts/e2e-personabot-create.mjs
```
