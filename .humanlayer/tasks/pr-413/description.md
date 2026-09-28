Closes #411

## Why the change

Agents editing the docs landing had to infer the coss setup from `components.json` and the installed skills, so `apps/docs/AGENT.md` now carries the landing workflow next to the Nimbus rules.

## Special things to note

- Merge risk: **two-way door** — revert this commit; **small blast radius** — one agent guidance file, no runtime or generated output. Review focus: whether the command, paths, and icon split match the installed coss setup.
- Follow-up to #407 (in-harness design references): this is the docs-site half that was deliberately left out of that slice.

## Change outline

One section inserted between the docs-authoring rules and the section table:

```diff
 apps/docs/AGENT.md
+## Landing page (coss)
+   surface:  src/pages/index.astro → design/tokens.css + src/components/landing/Landing.tsx
+   add:      pnpm dlx shadcn@latest add @coss/<name>   # @coss registry in components.json
+   usage:    coss / coss-particles skills; coss.com/ui is the API source
+   icons:    lucide-react inside coss components; HugeIcons via @iconify/react for page glyphs
+   boundary: COSS stays on the landing; docs = Nimbus; in-harness = DSH (ADR-0028)
```

No other file changed.
