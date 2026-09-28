Closes #407

## Why the change

Net-new in-harness UI was composed without a design precedent, so agents reached for existing components and still shipped crude hierarchy, density, and states; the `dsh-ui` skill now forces a composition pass against the sources the project trusts.

## Special things to note

- Merge risk: **two-way door** — revert this commit to drop the guidance; **small blast radius** — agent-facing docs only (one new reference file, one build-order step, one `AGENTS.md` line), no runtime or generated artifacts; `oxfmt --check` clean and `pnpm lint` green (pre-existing warnings only). Review focus: whether the borrow/leave boundaries match ADR-0028/0032 and the linked research docs.
- Deliberate omission: the docs-site half (`apps/docs/AGENT.md` coss landing note) stays out of this slice; COSS remains the docs-site surface per ADR-0028.

## Change outline

The skill gains a composition step between tokens and layout, with the precedents disclosed to one reference file.

```diff
 .agents/skills/dsh-ui/
 ├── SKILL.md                       # build order gains step 3 Composition; new reference listed
 └── references/
     ├── native-contract.md         # unchanged
+    └── design-references.md       # NEW — borrow/leave per source, composition bar, reading rules
 AGENTS.md                          # UI guidelines names the file and the four sources
```

Build order change:

```diff
 2. **Tokens** — every colour, font, and radius reads from `--dsw-*` …
+3. **Composition** — for a net-new surface or control, pick the closest precedent in `references/design-references.md` before choosing layout; borrow composition, hierarchy, and states, not styling. Done when the PR names the borrowed pattern and every deliberate deviation.
 4. **Layout** — apply the native inset contract in `references/native-contract.md` …
```

What the reference file holds:

```text
# Design references
├── What to borrow, what stays out   # coss.com/ui · beautifului.dev · shadcn/ui · Lucide
├── The composition bar              # task first · shell scale · full states
└── Reading a reference              # name the precedent → express in tokens → shell pattern wins → record in PR
```
