import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { collectDevReference } from "../../../scripts/docs-reference.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("generated developer reference", () => {
  const reference = collectDevReference(ROOT);

  it("extracts the core config from its schema and defaults", () => {
    expect(reference.config).toEqual([
      {
        name: "enabled",
        type: "boolean",
        default: true,
        description: "启用 BotHarness core",
        source: "packages/core/src/plugin.ts",
      },
    ]);
  });

  it("extracts every registered memory tool and parameter", () => {
    expect(reference.tools.map((tool) => tool.name)).toEqual([
      "memory_read",
      "memory_search",
      "memory_write",
      "memory_list",
    ]);
    expect(reference.tools.find((tool) => tool.name === "memory_write")?.parameters).toEqual([
      expect.objectContaining({ name: "path", type: "string", required: true }),
      expect.objectContaining({ name: "body", type: "string", required: true }),
      expect.objectContaining({ name: "summary", type: "string", required: true }),
      expect.objectContaining({ name: "sources", type: "array<string>", required: false }),
      expect.objectContaining({ name: "tags", type: "array<string>", required: false }),
    ]);
  });

  it("consumes DSH assistant streams without publishing the in-process BotStateEvent", () => {
    expect(reference.publicEvents.map(({ direction, name, operation }) => ({ direction, name, operation }))).toEqual([
      { direction: "consumes", name: "agent/assistant-stream", operation: "on" },
    ]);
  });
});
