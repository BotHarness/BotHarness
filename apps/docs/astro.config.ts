import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import nimbus, {
  defineConfig as defineNimbusConfig,
} from "@cloudflare/nimbus-docs";
import { tableScroll } from "@cloudflare/nimbus-docs/markdown";

import { syncDocs } from "../../scripts/sync-docs.mjs";

// Generate docs content from the repo sources before Astro scans it. Doing
// this here (instead of a shell pre-step) keeps `astro dev` a single
// framework command, so portless can inject its assigned --port.
syncDocs();

const nimbusConfig = defineNimbusConfig({
  site: "https://botharness.ai",
  title: "BotHarness",
  description:
    "给 LLM agent 一份持久身份的 DSH 插件层：PersonaBot —— 带人格、跨 session 记忆、可并发工作。",
  locale: "zh",
  // Bilingual site. Nimbus has no i18n, but `docs-<slug>` + `versions.others`
  // is the only mechanism that mounts a second prose collection at `/<slug>`
  // with a working sidebar / breadcrumbs / prev-next / llms.txt tree. `en` is
  // a language variant, not an older snapshot, so the version UI is
  // neutralized: no picker is installed, `en` is neither deprecated nor
  // hidden, and the `/en` route disables cross-version SEO alternates
  // (see `suppressVersionAlternates` in `src/layouts/DocsLayout.astro`).
  versions: {
    current: "zh",
    others: ["en"],
  },
  github: null,
  socialImageAlt: "BotHarness 文档预览",
});

export default defineConfig({
  // nimbus:adapter
  output: "static",
  // Tailwind v4 via its Vite plugin (the integration Astro recommends for
  // Tailwind v4 — replaces the PostCSS plugin, which doesn't build under
  // Astro 7's Vite 8 bundler).
  vite: {
    plugins: [tailwindcss()],
  },
  // Hover-prefetch link targets so full-page navigations feel instant without
  // a client-side router.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    react(),
    nimbus(nimbusConfig, {
      // Authoring rules are opt-in by design — your repo, your taste. The
      // two below are the load-bearing pair: frontmatter has to validate
      // against the content schema for the page to render properly, and
      // broken internal links are 404s for your readers. Add the others
      // (heading hierarchy, code-block language, style, etc.) when you're
      // ready to enforce them — see `nimbus-docs lint --help`.
      rules: {
        "nimbus/frontmatter-shape": "error",
        "nimbus/internal-link": "error",
      },
      // Wrap wide tables so they scroll instead of overflowing the page
      // (styled by `.nb-table-scroll` in src/styles/prose.css).
      markdown: {
        hastPlugins: [tableScroll()],
      },
    }),
  ],
});
