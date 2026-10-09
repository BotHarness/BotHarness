import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PAGES } from "../../../scripts/sync-docs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("generated guide pages", () => {
  it("are never committed", () => {
    const outputs = PAGES.flatMap((page) => [
      `apps/docs/src/content/docs/${page.slug}.mdx`,
      `apps/docs/src/content/docs-zh/${page.slug}.mdx`,
    ]);
    const tracked = execFileSync("git", ["ls-files", "--", ...outputs], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);

    expect(tracked).toEqual([]);
  });
});
