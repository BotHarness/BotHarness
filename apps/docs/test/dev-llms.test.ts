import { describe, expect, it } from "vitest";

import { cleanMarkdownUrl, renderDevLlms } from "../src/lib/dev-llms";

describe("developer llms index", () => {
  it("uses clean markdown siblings", () => {
    expect(cleanMarkdownUrl("/dev/design/context/")).toBe("/dev/design/context.md");
    expect(cleanMarkdownUrl("/zh/dev")).toBe("/zh/dev.md");
  });

  it("groups pages by the four developer surfaces", () => {
    const body = renderDevLlms({
      origin: "https://botharness.ai",
      language: "en",
      pages: [
        { title: "Dev", url: "/dev" },
        { title: "Context", url: "/dev/design/context" },
        { title: "Bridge", url: "/dev/guides/client-bridge" },
        { title: "Tools", url: "/dev/reference/tools" },
        { title: "ADR", url: "/dev/adr/0001-example" },
      ],
    });

    expect(body).toContain("## Design");
    expect(body).toContain("## Guides");
    expect(body).toContain("## Reference");
    expect(body).toContain("## Decisions");
    expect(body).toContain("https://botharness.ai/dev/design/context.md");
    expect(body).not.toContain("/index.md");
  });

  it("fails when a new unclassified developer subtree appears", () => {
    expect(() =>
      renderDevLlms({
        origin: "https://botharness.ai",
        language: "en",
        pages: [{ title: "Unknown", url: "/dev/unknown/page" }],
      }),
    ).toThrow("Unclassified /dev page");
  });
});
