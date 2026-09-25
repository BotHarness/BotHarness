# Optional PR Lens diagrams for visual-pr

Use this supplement when the pull request changes ownership across modules, a service boundary, or a data flow that is hard to explain in the visual-pr outline. A local edit, styling change, or short linear call path is sufficiently explained by the visual-pr description.

1. Read the complete diff against the merge base. Identify the changed units and the unchanged units needed to explain the path. Ground every node and edge in a file or verified runtime contract.
2. If a diagram would make the change easier to review, create a PR Lens graph document in the ignored `.humanlayer/tasks/<task>/` directory. Use the [PR Lens graph contract](https://github.com/coldteadotai/pr-lens/blob/main/skills/pr-lens/references/graph-document.md) and choose only the architecture or data-flow views that answer a reviewer question.
3. Validate and render locally with the PR Lens CLI. Inspect both themes and compare the result with the diff. Correct missing boundaries, misleading arrows, or unsupported claims before sharing. Keep the generated graph and SVGs as local artifacts until they are accurate.

   ```bash
   npx --yes @coldtea/pr-lens-cli@0.7.0 validate .humanlayer/tasks/<task>/graph.json
   npx --yes @coldtea/pr-lens-cli@0.7.0 render .humanlayer/tasks/<task>/graph.json --out .humanlayer/tasks/<task>/rendered --theme both --no-config
   ```

4. Keep visual-pr's PR body template and `gh pr edit --body-file` as the description authority. When the diagram adds value, attach the validated SVGs in a separate PR comment with `gh pr comment --body-file ... --attach ...`, linking back to the PR's relevant code. Otherwise finish with the visual-pr description alone.

Run the CLI's local validate/render path by default. Its hosted canvas, GitHub Action, and model-powered analyze path are separate integrations; use them only when the task specifically needs them. The local trial on [PR #269](https://github.com/BotHarness/BotHarness/pull/269) validated this boundary: a six-node architecture view and a commit-inspection flow made the Memory Git → Host RPC → Channel UI path legible without changing the PR body.
