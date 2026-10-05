import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PAGES } from "../../../scripts/sync-docs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SITE = "https://deepseekbot.botharness.ai";

const guides = [
  ...PAGES.filter((page) => page.slug.startsWith("docs/")).map((page) =>
    page.slug.replace(/^docs\//, "").replace(/\/index$/, ""),
  ),
  ...readdirSync(resolve(ROOT, "apps/docs/src/content/docs/docs")).map((file) =>
    file.replace(/\.mdx$/, ""),
  ),
];

describe("DeepSeekBot guides on the product site", () => {
  const redirects = readFileSync(resolve(ROOT, "apps/docs/public/_redirects"), "utf8");

  it("sends every former guide URL to the same guide there", () => {
    expect(guides.length).toBeGreaterThan(0);
    for (const slug of guides) {
      for (const form of ["", "/", ".md"]) {
        expect(redirects).toContain(`/docs/${slug}${form} ${SITE}/en/docs/${slug}/ 301`);
        expect(redirects).toContain(`/zh/docs/${slug}${form} ${SITE}/docs/${slug}/ 301`);
      }
    }
  });

  it("sends the guide roots to the overview", () => {
    for (const form of ["", "/"]) {
      expect(redirects).toContain(`/docs${form} ${SITE}/en/docs/overview/ 301`);
      expect(redirects).toContain(`/zh/docs${form} ${SITE}/docs/overview/ 301`);
    }
  });
});
