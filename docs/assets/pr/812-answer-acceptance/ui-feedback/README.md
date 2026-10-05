# Human QA follow-up: Inbox layout

Base PR head: `8e7db6a42508a2d1fe38137de3fa865e6cfbe6ce`. UI implementation: `7c5f64e0`.

The existing shell's master/detail pattern is reused. In Activity Center, both the row and its primary action open the same inline detail. Compact per-Bot Overview entries keep the native Modal; its published default 380px width is overridden to 760px, capped by the native overlay padding box, with scrollable content. No new dialog implementation or design tokens are introduced.

The actual Inbox list at 1141 × 827 had a 285px row: its horizontal action buttons left the title only 39.57px wide. The row now has two grid rows: the title spans both columns on the first row, with summary and actions below. Its full title width is 253.20px and its height falls from 263px to 104px.

## Captures

- `before-split.jpg` / `after-split.jpg`: matching viewport, English locale, light theme, synthetic QA Profile and same original ask. Title wrapping and the inline reply are directly comparable.
- `before-modal.jpg` / `after-split.jpg`: the prior Activity Center action opened a narrow modal; the same action now selects the inline detail.
- `after-modal.jpg` and `after-modal-dark.jpg`: retained compact Overview entry, actual native 760px dialog in light and dark. This entry remains modal because it is embedded in a small Bot overview card.
- `after-split-dark.jpg`: dark pass of the new full Inbox layout.
- `after-inline-submitted.jpg` / `after-inline-completed.jpg`: actual submission from the new inline form, then empty Actions after the original Assignment completed.
- `e2e-results.json`: geometry and allowlisted native facts. One additional answer was accepted, and the original Session completed with unchanged permission/model.

Validation: 72 related Client tests passed, including actual native-question and approval command routing, Assignment replies, source navigation and token guards. Lint, formatting, typecheck, ledger checks and build passed. Visual approval remains Human QA.
