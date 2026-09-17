import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
    "A DSH plugin layer that gives LLM agents a persistent identity: the PersonaBot — a persona, cross-session memory, and concurrent work.",
  locale: "en",
  // Bilingual site. Nimbus has no i18n, but `docs-<slug>` + `versions.others`
  // is the only mechanism that mounts a second prose collection at `/<slug>`
  // with a working sidebar / breadcrumbs / prev-next / llms.txt tree. English
  // is the primary tree at the root; `zh` is a language variant, not an older
  // snapshot, so the version UI is neutralized: no picker is installed, `zh`
  // is neither deprecated nor hidden, and the `/zh` route disables
  // cross-version SEO alternates (see `suppressVersionAlternates` in
  // `src/layouts/DocsLayout.astro`).
  versions: {
    current: "en",
    others: ["zh"],
  },
  github: "https://github.com/BotHarness/BotHarness",
  // `/docs` and `/dev` are separate audiences: scope the rail to the current
  // top-level section so one section never leaks into the other's sidebar
  // (works for both the English root and the `/zh` tree).
  sidebar: {
    scope: "section",
  },
  socialImageAlt: "BotHarness documentation preview",
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
    // Cloudflare Workers static assets serves the closest `404.html` for a
    // miss. Astro only special-cases the root `404.astro` → `404.html`; the
    // `/zh` page lands at `zh/404/index.html`, so mirror it to
    // `dist/zh/404.html` for `/zh/**` misses.
    {
      name: "nested-zh-404",
      hooks: {
        "astro:build:done": ({ dir }) => {
          const dist = fileURLToPath(dir);
          const source = join(dist, "zh", "404", "index.html");
          if (existsSync(source)) copyFileSync(source, join(dist, "zh", "404.html"));
        },
      },
    },
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
      // `/zh/404` is a real route backing the copied `dist/zh/404.html`; a
      // not-found page must never be advertised to crawlers.
      sitemap: {
        serialize: (item) =>
          new URL(item.url).pathname.replace(/\/+$/, "") === "/zh/404" ? null : item,
      },
      // Wrap wide tables so they scroll instead of overflowing the page
      // (styled by `.nb-table-scroll` in src/styles/prose.css).
      markdown: {
        hastPlugins: [tableScroll()],
      },
    }),
  ],
});
