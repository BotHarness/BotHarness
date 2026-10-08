# Optional onboarding Bind app — acceptance record

Scope: [#1203](https://github.com/BotHarness/DeepSeekBot/issues/1203), child of [#1174](https://github.com/BotHarness/DeepSeekBot/issues/1174).

## Delivered behavior

A completed welcome in an active Human–PersonaBot DM offers Bind app beside Create PersonaBot and Explore memory. The voluntary action mounts the same ExternalIdentityList modal used by Channel sidebar, with a short optionality hint and Not now. It reuses existing scoped Messaging queries, explicit identity commands, app capability/ownership checks, website preparation tutorials and native settings navigation. There is no new binding, credential or completion authority.

## Automated verification

- All 991 Client tests in 137 files passed, including eight new onboarding-binding cases and the existing shared identity-modal regression tests.
- The new coverage exercises eligibility, deliberate opening, quiet dismissal, native-settings return, empty/failed account discovery, supported QQ selection, disabled offline/owned/unsupported accounts, explicit scoped binding, refusal feedback, and actual connecting/unavailable/receiving state.
- Local lint, formatting, type checking, bilingual Release Ledger checks and the production build passed.
- The full repository test/build/documentation result is reported by the PR's GitHub CI. No full local Windows-suite pass is claimed.

The QQ and success-state cases use explicit test fixtures at the existing Host action seam. They prove the Client contract; they are not a claim that a real external QQ account was bound or that a platform message was received.

## Isolated Host verification

The final build was cold-started through the pinned isolated development launcher. Authenticated API health passed, and reads of the existing acceptance PersonaBot retained first-conversation completion before and after its actual Messaging snapshot query. That Profile currently has zero external accounts and zero bindings. No external credential, binding, permission grant or message was created during this verification.

## Browser blocker and remaining Human check

Real UI acceptance for this change remains outstanding. Chrome page control repeatedly timed out; after the Human reopened Chrome, its extension connection was unavailable. At the Human's request the agent tried the Codex in-app browser, which refused navigation to the loopback acceptance address with a client navigation block. These are browser-control/navigation failures, not evidence of a product crash or of a healthy rendered Client. The fresh Host correctly reports Client state as unobserved.

The prior Memory tracer's immutable light/dark completed-welcome screenshots show the baseline without a Bind app action. No after screenshot, native Escape/focus acceptance or live settings-return acceptance is claimed for this tracer. The PR remains a draft for these checks.

## Runnable review path

From this branch with dependencies installed:

```sh
pnpm build
node scripts/dev-instance.mjs --home .humanlayer/qa-1203-binding --port 3202 --json
```

Open the private local login URL printed by the launcher in a normal browser. Deliberately enter Bot mode, configure the model if needed, and complete one real DM reply. For an existing completed Profile, use its current active PersonaBot instead.

1. Confirm the welcome offers Bind app and that no modal opens automatically.
2. Click Bind app. Check the same compact app picker, website tutorials and native Add app entry as Channel sidebar; the cancellation says Not now.
3. With no configured apps, confirm binding is disabled and no success state appears. Open Add app, then close native settings: the existing binding modal should return and refresh the catalog.
4. Choose Not now, then reopen and press Escape. Confirm focus returns, no message or binding was submitted, and first-conversation completion remains intact.
5. Reload/restart and confirm the modal does not reopen. Repeat in light and dark themes and capture matched 1559 × 865 Chinese before/after screenshots.
6. With an existing authorized supported account, select it and explicitly bind. Confirm the original scoped Host command runs, errors remain visible, and the displayed reception state agrees with the canonical snapshot. QQ is eligible when the installed Provider exposes a supported QQ account; setup and real receipt/reply qualification remain with their existing platform issues.

Keep login URLs, credentials and private machine paths out of published evidence.
