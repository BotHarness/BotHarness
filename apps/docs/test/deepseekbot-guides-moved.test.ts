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
  const rules = redirects
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  it("sends every former guide page to the same guide there", () => {
    expect(guides.length).toBeGreaterThan(0);
    expect(rules).toContain(`/docs/* ${SITE}/en/docs/:splat 301`);
    expect(rules).toContain(`/zh/docs/* ${SITE}/docs/:splat 301`);
  });

  it("sends every former .md twin to the guide page there", () => {
    for (const slug of guides) {
      expect(rules).toContain(`/docs/${slug}.md ${SITE}/en/docs/${slug}/ 301`);
      expect(rules).toContain(`/zh/docs/${slug}.md ${SITE}/docs/${slug}/ 301`);
    }
  });

  it("lists the .md twins before the wildcards that would swallow them", () => {
    const wildcard = rules.indexOf(`/docs/* ${SITE}/en/docs/:splat 301`);
    const zhWildcard = rules.indexOf(`/zh/docs/* ${SITE}/docs/:splat 301`);
    for (const slug of guides) {
      expect(rules.indexOf(`/docs/${slug}.md ${SITE}/en/docs/${slug}/ 301`)).toBeLessThan(wildcard);
      expect(rules.indexOf(`/zh/docs/${slug}.md ${SITE}/docs/${slug}/ 301`)).toBeLessThan(
        zhWildcard,
      );
    }
  });

  it("sends the guide roots to the overview", () => {
    expect(rules).toContain(`/docs ${SITE}/en/docs/overview/ 301`);
    expect(rules).toContain(`/zh/docs ${SITE}/docs/overview/ 301`);
  });

  it("stays within the Cloudflare limit of 100 dynamic redirects", () => {
    const dynamic = rules.filter((rule) => {
      const [from = "", to = ""] = rule.split(/\s+/);
      return /[*:]/.test(from) || /^https?:\/\//.test(to);
    });
    expect(dynamic.length).toBeLessThanOrEqual(100);
  });
});
