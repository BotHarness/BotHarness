# Issue #741 — Daily Browser read-only borrowing

Issue: [#741](https://github.com/BotHarness/BotHarness/issues/741), native child of [#725](https://github.com/BotHarness/BotHarness/issues/725).

Task: `codex/local/01a0f25f-2150-75e3-8895-23d35394b8d8`.

## Actual runtime verification

Verified on 2026-10-03 with pinned DSH `0.2.0-rc.1`, Chrome for Testing `154.0.8037.57`, the packaged MV3 source, an isolated local Profile and a real DeepSeek PersonaBot turn. Computer Access stayed disabled; Browser auto-allow stayed off. No debugger connection to the Human browser was used.

The synthetic fixture in `scripts/e2e-daily-browser-fixture.py` creates an HttpOnly session cookie after an explicit sign-in. Its page is served on `daily-browser-qa.localhost`, outside the extension's localhost/127.0.0.1 host permissions; reading it requires the extension action's activeTab grant. All account data is synthetic.

1. Sign in as QA Reader in the task browser. The page shows `DAILY-BROWSER-SESSION-REUSED`.
2. Choose Daily Browser, enable only Browser Access, and create a pairing code through the authenticated Channel sidebar.
3. Connect the extension. It shows the intended PersonaBot and current page before a separate Share action; pairing alone leaves the sidebar unshared.
4. Share the current tab read-only. The sidebar shows its actual title and URL.
5. Ask the real PersonaBot to call `browser_observe`. The native Allow once prompt appears. After approval, the Bot reports QA Reader and the marker through `channel_send`.
6. Return through the sidebar. A second real `browser_observe`, with new native approval, refuses with `No daily-browser tab is shared`; the Bot reports that refusal instead of treating the prior snapshot as current authority.
7. Reload the final extension implementation, pair/share again, and observe through another real Bot turn. The account and marker are read again.
8. Human follows the page's link to another URL. The lease is immediately removed, the sidebar shows No shared tab, and the original Human tab remains open.

The final text collector was exercised in step 7. Screenshots of the first successful observation, Return refusal and final navigation state record the key interaction states; native approval cards containing task-local paths are omitted or excluded by capture cropping.

## Screenshots

| File                     | Actual state                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `settings-before.jpg`    | Base #739 Browser Target choices; absence of Daily Browser.                                                                                |
| `settings-after.jpg`     | New Daily Browser choice; same 610 × 827 English/light viewport, same 350 × 159 capture region.                                            |
| `unshared.jpg`           | New entry before pairing/sharing; 1280 × 720.                                                                                              |
| `borrowed.jpg`           | Same entry after explicit Share, before Bot observation; 1280 × 720.                                                                       |
| `daily-page.jpg`         | Native Chrome with the already logged-in synthetic page.                                                                                   |
| `extension-consent.jpg`  | Bot/page confirmation before Share; native popup.                                                                                          |
| `extension-shared.jpg`   | Read-only sharing and Return; same native popup, height follows content.                                                                   |
| `bot-observed.jpg`       | Real approved observation and DM reply; 1280 × 720.                                                                                        |
| `bot-returned.jpg`       | Real observation refusal after Return; 1280 × 720.                                                                                         |
| `navigation-revoked.jpg` | Final implementation's successful re-observation reply and No shared tab after Human navigation; cropped to exclude native approval paths. |

Pairing codes, lease tokens, Host login cookies and credentials are absent from these images.

## Automated validation

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, `pnpm changelog:check`, `pnpm skill:changelog:check`: passed.
- `pnpm test`: **2111 passed, 3 skipped** across **258 passed, 3 skipped** files; original assertions and timeouts retained.
- Focused borrowed authority, Browser Tools, Host service and Container execution: 87 passed.
- New real HTTP boundary tests: origin refusal, preflight, prefix matching, one-use pairing, Origin/token binding, return, methods and body limits.
- New worker tests: immediate Return/re-pair polling and navigation during pending Share.
- New DOM test: password/textarea values and hidden text excluded, bounded rendered output.
- `pnpm og:font` and docs build: passed, 288 generated pages.

An initial full run overlapped a separate docs build and failed from a shared output-directory race; a Group invitation test also exceeded its existing timeout under that load. The Group test passed separately and the full suite passed when rerun serially. Those initial failures were not treated as feature fixes.

## Runnable Human QA

Follow the [English guide](../../daily-browser.md) or [中文指南](../../daily-browser.zh.md). For a disposable logged-in page, run `python3 scripts/e2e-daily-browser-fixture.py`, open `http://daily-browser-qa.localhost:32020/page`, and sign in as QA Reader. Load `packages/browser/extension` unpacked in Chrome, then perform steps 2–8 above against your local DSH address.

The task preview is left with the QA Bot and completed observation/refusal messages, Daily Browser selected, no active lease, Browser Access enabled and Computer Access disabled. Human QA and PR CI are separate from local verification. Edge uses the same MV3 APIs but has not had an independent real-browser E2E in this slice.
