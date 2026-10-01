# Inbox tool approval — real runtime evidence

Issue #550, parent #126. Captured from isolated DSH 0.2.0-rc.1 Web Profiles using the real DeepSeek model, native bash approval and BotHarness Host/Client bridge. These are live UI captures, not mockups.

## Before and after

The baseline uses main at c033f467: two Bots have pending native bash calls; Inbox only offers source navigation. The final feature run includes main through ec2e3a52 and uses the same two-Bot scenario: Inbox offers Review approval and the existing source DM approval card. Baseline and feature use separate isolated Profiles with equivalent QA names and tasks. Light/dark pairs use a 1440 × 900 viewport. The narrow capture uses 900 × 900.

## Verified behavior

- The exact native bash input is visible, with source-only context initially and nearby messages expandable in chronological order.
- Allow once resumes the native tool; the Bot reports the actual `BH_INBOX_APPROVAL_QA` stdout. Reject delivers the rejection to the native caller and the Bot reports denial without retrying.
- Each decision records exactly one canonical Channel audit; the resolved action disappears and other Bot requests remain independent.
- Actions default to oldest first, including first open.
- A separate browser context decides the same request in the source DM. The original Inbox rejects a stale submission, shows expiration and leaves one audit.
- Exact source navigation locates the original request and returns to a live, undecided Human Review QA request for Human QA. The panel title uses the current Bot display name.

`results.json` separates asserted behavior from `screenshot-only` context/theme evidence, which was visually inspected. Other-Bot independence is derived from its actual pending-action assertion. The shared source command is covered by focused Host/Client regression tests, rather than an unasserted E2E boolean. Full Linux CI is the automated gate; Windows full-suite attachment sync and Git-backed fixture failures are recorded privately and are not treated as a passed run.

## Reproduce

Install dependencies and build, then launch an isolated Profile with `scripts/dev-instance.mjs --home <isolated-home> --port <port> --json`. Keep launch credentials private. Set `BH_APPROVAL_QA_HOME` and `BH_APPROVAL_QA_PORT` to that instance, then run `node scripts/e2e-inbox-tool-approval.mjs`. The script creates four QA Bots and performs real model calls; run it in a fresh isolated Profile, never a personal Profile. Use `before` mode against the baseline to capture the comparison.

For manual QA, open Activity Center → Inbox → Needs my action, select Human Review QA → Review approval, expand nearby messages, inspect the exact tool input and choose Allow once or Reject. Open source must locate the original request. Compare the resolved Inbox action and source DM result. Persistent approval choices retain the existing source card's confirmation and Host rules.

## Capture index

| Capture                                             | Scenario                                         |
| --------------------------------------------------- | ------------------------------------------------ |
| `before-list-light.png`, `before-list-dark.png`     | Baseline: source-only Inbox actions              |
| `before-source-dm.png`                              | Existing source DM approval                      |
| `after-list-light.png`, `after-list-dark.png`       | Two independent pending actions, oldest first    |
| `after-approval-light.png`                          | Exact input and permitted decisions inside Inbox |
| `after-context-light.png`, `after-context-dark.png` | Expandable nearby messages                       |
| `after-narrow.png`                                  | Narrow viewport without horizontal overflow      |
| `after-approved.png`, `after-rejected.png`          | Accepted canonical decisions                     |
| `after-exact-source.png`                            | Exact request opened in the source DM            |
| `human-qa-ready.png`                                | Retained live approval for Human QA              |

## Final integration verification

Main integration preserves its original-file access warning alongside Inbox decision feedback. Typecheck, build and all 21 focused Host/Client integration checks passed; full Linux CI also passed on the integration commit.

The first integration capture attempt timed out while creating the second QA Bot. The browser harness now permits a 60-second protocol timeout and a 50-second HTTP timeout. A private continuation first queried canonical Bot/Channel records, reused the two already-created pending native requests and ran the same approval, rejection, two-window race and source-navigation assertions without duplicating their initial sends. All checks passed and all feature captures were refreshed from this integrated runtime. Launch URLs, credentials and raw diagnostic logs remain private.
