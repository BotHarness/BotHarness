# UI/UX PR visual evidence

Use this guide when a PR changes a rendered screen or user interaction: layout, styling, visible copy, navigation, forms, feedback states, or responsive behavior. The PR description keeps the headings from `visual-pr`; put this evidence inside its **Change outline**, next to the relevant structural view.

## Capture

1. Run the base revision and the PR revision through the real UI. Capture the baseline before editing when possible; otherwise use a separate base checkout. Take a **Before** and **After** screenshot for each materially changed view or interaction state. Include each viewport whose behavior changes.
2. Match viewport dimensions, theme, locale, test data, and UI state across each pair. Use representative data and remove secrets or personal information before publishing. For a new screen with no direct predecessor, show the prior entry point or absence state as **Before** and label it clearly.
3. Check the images side by side. They should show the actual change without relying on a mockup or a code diff. For motion or a multi-step interaction, capture the key states and add a short recording or exact reproduction steps.

## Put the evidence in the PR

Place each pair directly in **Change outline**, with a short heading that names the view or interaction and viewport:

```markdown
### Channel composer — 390 × 844, attachment selected

**Before** — The attachment preview covered the send control.

![Before: Channel composer with attachment selected](https://...)

**After** — The preview and send control are both visible.

![After: Channel composer with attachment selected](https://...)
```

Use image URLs that render for a reviewer in GitHub; local file paths are not PR evidence. Keep the images visible in the body, with a short caption pointing to the change. If capture is impossible, state the concrete blocker and a runnable review path in **Change outline**. The section is complete when every affected view or state has a comparable pair, or a clearly explained capture blocker, and the published images render in the PR.
