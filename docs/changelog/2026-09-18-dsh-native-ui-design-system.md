---
title: In-harness UI follows the DSH design system
date: 2026-09-18T23:10:00+08:00
tags: [adr, spec, client]
---

- **ADR-0028**: the in-harness client UI styles with DSH design tokens (`--dsw-static-*` / `--dsw-alias-*` / `--dsw-specific-*`, dark via `body[data-ds-dark-theme]`) and reuses `@deepseek-ai/dsh-client-ui-primitives` from the shell baseline. Hand-rolled literal colours and a second component library are out. COSS stays on botharness.ai (`apps/docs`) — its tokens bridge to Nimbus and its dark selector differs from DSH's.
- Spec v1.8 adds the client design-system rule to §6.
- Follow-up tracked as "M3 UI 原生化：DSH tokens + primitives + 双主题" under #10: rewrite `styles.ts` onto tokens, adopt primitives where they fit, and verify both themes in the `web-dev` profile.
