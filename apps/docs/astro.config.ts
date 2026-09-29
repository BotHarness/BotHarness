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

syncDocs();

const nimbusConfig = defineNimbusConfig({
  site: "https://botharness.ai",
  title: "BotHarness",
  description:
    "A DSH plugin layer that gives LLM agents a persistent identity: the PersonaBot — a persona, cross-session memory, and concurrent work.",
  locale: "en",
  versions: {
    current: "en",
    others: ["zh"],
  },
  github: "https://github.com/BotHarness/BotHarness",
  sidebar: {
    scope: "section",
    defaultCollapsed: true,
  },
  socialImageAlt: "BotHarness documentation preview",
});

export default defineConfig({
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
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
      rules: {
        "nimbus/frontmatter-shape": "error",
        "nimbus/internal-link": "error",
      },
      sitemap: {
        serialize: (item) =>
          new URL(item.url).pathname.replace(/\/+$/, "") === "/zh/404" ? null : item,
      },
      markdown: {
        hastPlugins: [tableScroll()],
      },
    }),
  ],
});
