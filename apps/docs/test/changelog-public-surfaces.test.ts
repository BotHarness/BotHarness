import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DOCS = resolve(ROOT, "apps/docs");
const DIST = resolve(DOCS, "dist");

function built(path: string): string {
  return readFileSync(resolve(DIST, path), "utf8");
}

describe("built release-level changelog surfaces", () => {
  it(
    "exposes one concise bilingual history unit across human and agent routes",
    { timeout: 30_000 },
    () => {
      execFileSync(process.execPath, [resolve(DOCS, "node_modules/astro/bin/astro.mjs"), "build"], {
        cwd: DOCS,
        env: { ...process.env, NO_COLOR: "1" },
        stdio: "pipe",
      });

      const englishFeed = built("changelog/index.html");
      const chineseFeed = built("zh/changelog/index.html");
      expect(englishFeed).toContain("Pre-release development");
      expect(englishFeed).toContain("this is development history, not a released or installable version");
      expect(englishFeed).not.toContain("Added durable PersonaBot identity");
      expect(englishFeed).not.toContain("Unreleased");
      expect(chineseFeed).toContain("首个版本前的开发进展");
      expect(chineseFeed).not.toContain("新增持久的 PersonaBot identity");

      const englishDetail = built("changelog/development/index.html");
      const chineseDetail = built("zh/changelog/development/index.html");
      expect(englishDetail).toContain("Added durable PersonaBot identity");
      expect(chineseDetail).toContain("新增持久的 PersonaBot identity");
      expect(englishDetail).toContain('hreflang="zh-Hans"');
      expect(chineseDetail).toContain('hreflang="en"');
      expect(englishDetail).toContain('/changelog/development/index.md');
      expect(chineseDetail).toContain('/zh/changelog/development/index.md');

      const englishRss = built("changelog/rss.xml");
      const chineseRss = built("zh/changelog/rss.xml");
      expect(englishRss.match(/<item>/g)).toHaveLength(1);
      expect(chineseRss.match(/<item>/g)).toHaveLength(1);
      expect(englishRss).toContain("/changelog/development/");
      expect(chineseRss).toContain("/zh/changelog/development/");

      expect(built("changelog/llms.txt")).toContain(
        "https://botharness.ai/changelog/development/index.md",
      );
      expect(built("zh/changelog/llms.txt")).toContain(
        "https://botharness.ai/zh/changelog/development/index.md",
      );
      expect(built("changelog/development/index.md")).toContain(
        "Added durable PersonaBot identity",
      );
      expect(built("index.html")).toContain("Pre-release development");
      expect(built("zh/index.html")).toContain("首个版本前的开发进展");

      expect(statSync(resolve(DIST, "og/changelog/development.png")).size).toBeGreaterThan(0);
      expect(statSync(resolve(DIST, "og/zh/changelog/development.png")).size).toBeGreaterThan(0);
      expect(existsSync(resolve(DIST, "changelog/2026-09-20-roster-storage"))).toBe(false);
    },
  );
});
