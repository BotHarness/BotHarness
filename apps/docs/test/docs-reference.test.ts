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
      {
        name: "agentPreset",
        type: "string",
        default: "standard",
        description:
          "PersonaBot 会话加入的 DSH agent preset（提供 file/Shell/grep 等普通工具）",
        source: "packages/core/src/plugin.ts",
      },
    ]);
  });

  it("publishes no model-visible memory tools in V1", () => {
    expect(reference.tools).toEqual([]);
  });

  it("publishes the consumed DSH events, not the in-process BotStateEvent", () => {
    expect(
      reference.publicEvents.map(({ name, direction, operation }) => ({
        name,
        direction,
        operation,
      })),
    ).toEqual([
      { name: "agent/assistant-stream", direction: "consumes", operation: "on" },
      { name: "agent/created", direction: "consumes", operation: "on" },
      { name: "agent/disposed", direction: "consumes", operation: "on" },
      { name: "agent/pre-step", direction: "consumes", operation: "on" },
      { name: "approval/request", direction: "consumes", operation: "on" },
      { name: "session/event", direction: "consumes", operation: "on" },
      { name: "tools/pre-execute", direction: "consumes", operation: "on" },
      { name: "tools/result", direction: "consumes", operation: "on" },
      { name: "user-questions/request", direction: "consumes", operation: "on" },
    ]);
  });
});
