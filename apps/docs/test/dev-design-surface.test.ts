import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PAGES } from "../../../scripts/sync-docs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("developer design surface", () => {
  it("publishes stable architecture and product language, not mutable planning snapshots", () => {
    const designPages = PAGES.filter((page) => page.slug.startsWith("dev/design/"))
      .sort((a, b) => a.order - b.order)
      .map((page) => page.slug);

    expect(designPages).toEqual([
      "dev/design/index",
      "dev/design/architecture",
      "dev/design/context",
      "dev/design/bot-runtime",
    ]);
    expect(designPages).not.toContain("dev/design/platform");
    expect(designPages).not.toContain("dev/design/app-prd");
  });

  it("publishes maintained BotHarness product language in each locale", () => {
    const context = PAGES.find((page) => page.slug === "dev/design/context");

    expect(context?.en?.title).toBe("BotHarness Product Context");
    expect(context?.en?.source).toBe("CONTEXT.md");
    expect(context?.zh?.title).toBe("BotHarness 产品术语");
    expect(context?.zh?.source).toBe("CONTEXT.zh.md");

    const english = readFileSync(resolve(ROOT, "CONTEXT.md"), "utf8");
    const chinese = readFileSync(resolve(ROOT, "CONTEXT.zh.md"), "utf8");
    const leadingWords = (source: string) =>
      [...source.matchAll(/^\*\*(.+)\*\*[:：]/gm)].map((match) => match[1]);

    expect(chinese).toMatch(/^# BotHarness 产品术语$/m);
    expect(leadingWords(chinese)).toEqual(leadingWords(english));
  });

  it("redirects retired planning pages to the integrated architecture", () => {
    const redirects = readFileSync(resolve(ROOT, "apps/docs/public/_redirects"), "utf8");

    expect(redirects).toContain("/dev/design/platform /dev/design/architecture 301");
    expect(redirects).toContain(
      "/dev/design/platform.md /dev/design/architecture.md 301",
    );
    expect(redirects).toContain("/dev/design/app-prd /dev/design/architecture 301");
    expect(redirects).toContain(
      "/dev/design/app-prd.md /dev/design/architecture.md 301",
    );
    expect(redirects).toContain(
      "/zh/dev/design/platform /zh/dev/design/architecture 301",
    );
    expect(redirects).toContain(
      "/zh/dev/design/platform.md /zh/dev/design/architecture.md 301",
    );
    expect(redirects).toContain(
      "/zh/dev/design/app-prd /zh/dev/design/architecture 301",
    );
    expect(redirects).toContain(
      "/zh/dev/design/app-prd.md /zh/dev/design/architecture.md 301",
    );
  });
});
