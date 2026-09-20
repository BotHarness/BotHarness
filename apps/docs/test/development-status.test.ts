import { describe, expect, it } from "vitest";

import {
  githubProjectDevelopmentStatus,
  projectDevelopmentStatus,
} from "../../../scripts/development-status.mjs";

const fields = [
  {
    name: "Status",
    type: "ProjectV2SingleSelectField",
    options: ["Todo", "In Progress", "Done"],
  },
  {
    name: "Artifact",
    type: "ProjectV2SingleSelectField",
    options: ["DeepSeekBot", "DSH Skill"],
  },
];

describe("Project-backed Development status projection", () => {
  it("publishes only explicitly in-progress public artifacts", () => {
    const projection = projectDevelopmentStatus(
      {
        fields,
        items: [
          {
            status: "In Progress",
            artifact: "DeepSeekBot",
            content: {
              type: "Issue",
              repositoryVisibility: "PUBLIC",
              title: "Ship the roster",
              url: "https://github.com/BotHarness/BotHarness/issues/100",
              milestone: "v1.0",
              updatedAt: "2026-09-20T07:00:00Z",
              body: "private Project notes must not leak",
              assignees: ["maintainer"],
              eta: "tomorrow",
            },
          },
          {
            status: "Todo",
            artifact: "DeepSeekBot",
            content: {
              type: "Issue",
              repositoryVisibility: "PUBLIC",
              title: "Unconfirmed backlog",
              url: "https://github.com/BotHarness/BotHarness/issues/101",
              milestone: "v1.1",
              updatedAt: "2026-09-20T08:00:00Z",
            },
          },
          {
            status: "In Progress",
            artifact: "DSH Skill",
            content: {
              type: "Issue",
              repositoryVisibility: "PRIVATE",
              title: "Private work",
              url: "https://github.com/BotHarness/private/issues/1",
              milestone: null,
              updatedAt: "2026-09-20T09:00:00Z",
            },
          },
          {
            status: "In Progress",
            artifact: null,
            content: {
              type: "PullRequest",
              repositoryVisibility: "PUBLIC",
              title: "Infrastructure without an artifact scope",
              url: "https://github.com/BotHarness/BotHarness/pull/102",
              milestone: null,
              updatedAt: "2026-09-20T10:00:00Z",
            },
          },
          {
            status: "In Progress",
            artifact: "DeepSeekBot",
            content: {
              type: "DraftIssue",
              repositoryVisibility: "PUBLIC",
              title: "Project note",
              url: null,
              milestone: null,
              updatedAt: "2026-09-20T11:00:00Z",
            },
          },
        ],
      },
      "2026-09-20T12:00:00Z",
    );

    expect(projection).toEqual({
      schemaVersion: 1,
      syncedAt: "2026-09-20T12:00:00Z",
      items: [
        {
          artifact: "deepseekbot",
          title: "Ship the roster",
          url: "https://github.com/BotHarness/BotHarness/issues/100",
          milestone: "v1.0",
          updatedAt: "2026-09-20T07:00:00Z",
        },
      ],
    });
  });

  it("sorts deterministically by latest update, URL, then title", () => {
    const item = (
      artifact: "DeepSeekBot" | "DSH Skill",
      title: string,
      url: string,
      updatedAt: string,
    ) => ({
      status: "In Progress",
      artifact,
      content: {
        type: "Issue",
        repositoryVisibility: "PUBLIC",
        title,
        url,
        milestone: null,
        updatedAt,
      },
    });

    const projection = projectDevelopmentStatus(
      {
        fields,
        items: [
          item(
            "DeepSeekBot",
            "Later URL",
            "https://github.com/BotHarness/BotHarness/issues/12",
            "2026-09-20T10:00:00Z",
          ),
          item(
            "DeepSeekBot",
            "Zulu",
            "https://github.com/BotHarness/BotHarness/issues/10",
            "2026-09-20T10:00:00Z",
          ),
          item(
            "DeepSeekBot",
            "Alpha",
            "https://github.com/BotHarness/BotHarness/issues/10",
            "2026-09-20T10:00:00Z",
          ),
          item(
            "DSH Skill",
            "Newest",
            "https://github.com/BotHarness/BotHarness/pull/11",
            "2026-09-20T11:00:00Z",
          ),
          item(
            "DeepSeekBot",
            "Fractional second",
            "https://github.com/BotHarness/BotHarness/issues/13",
            "2026-09-20T10:00:00.500Z",
          ),
        ],
      },
      "2026-09-20T12:00:00Z",
    );

    expect(projection.items.map(({ artifact, title }) => ({ artifact, title }))).toEqual([
      { artifact: "dsh-skill", title: "Newest" },
      { artifact: "deepseekbot", title: "Fractional second" },
      { artifact: "deepseekbot", title: "Alpha" },
      { artifact: "deepseekbot", title: "Zulu" },
      { artifact: "deepseekbot", title: "Later URL" },
    ]);
  });

  it("fails closed when a selected Project item does not match the public schema", () => {
    expect(() =>
      projectDevelopmentStatus(
        {
          fields,
          items: [
            {
              status: "In Progress",
              artifact: "DeepSeekBot",
              content: {
                type: "Issue",
                repositoryVisibility: "PUBLIC",
                title: "Missing update time",
                url: "https://github.com/BotHarness/BotHarness/issues/104",
                milestone: "v1.0",
                updatedAt: null,
              },
            },
          ],
        },
        "2026-09-20T12:00:00Z",
      ),
    ).toThrow(
      "Development status Project schema mismatch: selected item updatedAt must be an ISO timestamp",
    );
  });

  it.each([
    ["title", null, "selected item title must be a non-empty string"],
    ["url", null, "selected item URL must be a public GitHub Issue or Pull Request URL"],
  ])("rejects a selected public item with an invalid %s", (field, value, message) => {
    const content = {
      type: "Issue",
      repositoryVisibility: "PUBLIC",
      title: "Visible work",
      url: "https://github.com/BotHarness/BotHarness/issues/104",
      milestone: "v1.0",
      updatedAt: "2026-09-20T11:00:00Z",
      [field]: value,
    };

    expect(() =>
      projectDevelopmentStatus(
        {
          fields,
          items: [{ status: "In Progress", artifact: "DeepSeekBot", content }],
        },
        "2026-09-20T12:00:00Z",
      ),
    ).toThrow(`Development status Project schema mismatch: ${message}`);
  });

  it("gives maintainers an explicit authority error without echoing private details", async () => {
    const result = githubProjectDevelopmentStatus({
      syncedAt: "2026-09-20T12:00:00Z",
      queryProjectPage: async () => {
        throw new Error("HTTP 403: token abc-secret cannot access private project notes");
      },
    });

    await expect(result).rejects.toThrow(
      "Development status sync could not read Roadmap Project #1. Authenticate GitHub CLI with the read:project scope and retry.",
    );
    await expect(result).rejects.not.toThrow(/abc-secret|private project notes/);
  });

  it("adapts GitHub Project fields and public Issue content without copying private metadata", async () => {
    const projection = await githubProjectDevelopmentStatus({
      syncedAt: "2026-09-20T12:00:00Z",
      queryProjectPage: async () => ({
        data: {
          organization: {
            projectV2: {
              fields: {
                pageInfo: { hasNextPage: false },
                nodes: fields.map((field) => ({
                  __typename: field.type,
                  name: field.name,
                  options: field.options.map((name) => ({ name })),
                })),
              },
              items: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    fieldValues: {
                      pageInfo: { hasNextPage: false },
                      nodes: [
                        {
                          __typename: "ProjectV2ItemFieldSingleSelectValue",
                          name: "In Progress",
                          field: { name: "Status" },
                        },
                        {
                          __typename: "ProjectV2ItemFieldSingleSelectValue",
                          name: "DSH Skill",
                          field: { name: "Artifact" },
                        },
                      ],
                    },
                    content: {
                      __typename: "PullRequest",
                      title: "Clarify the DSH context",
                      url: "https://github.com/BotHarness/BotHarness/pull/110",
                      updatedAt: "2026-09-20T11:00:00Z",
                      milestone: { title: "v1.0" },
                      repository: { visibility: "PUBLIC" },
                      body: "must not be copied",
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    });

    expect(projection).toEqual({
      schemaVersion: 1,
      syncedAt: "2026-09-20T12:00:00Z",
      items: [
        {
          artifact: "dsh-skill",
          title: "Clarify the DSH context",
          url: "https://github.com/BotHarness/BotHarness/pull/110",
          milestone: "v1.0",
          updatedAt: "2026-09-20T11:00:00Z",
        },
      ],
    });
  });

  it("follows Project pagination before publishing the projection", async () => {
    const content = (number: number, updatedAt: string) => ({
      __typename: "Issue",
      title: `Issue ${number}`,
      url: `https://github.com/BotHarness/BotHarness/issues/${number}`,
      updatedAt,
      milestone: null,
      repository: { visibility: "PUBLIC" },
    });
    const node = (artifact: "DeepSeekBot" | "DSH Skill", issue: object) => ({
      fieldValues: {
        pageInfo: { hasNextPage: false },
        nodes: [
          {
            __typename: "ProjectV2ItemFieldSingleSelectValue",
            name: "In Progress",
            field: { name: "Status" },
          },
          {
            __typename: "ProjectV2ItemFieldSingleSelectValue",
            name: artifact,
            field: { name: "Artifact" },
          },
        ],
      },
      content: issue,
    });
    const projectFields = fields.map((field) => ({
      __typename: field.type,
      name: field.name,
      options: field.options.map((name) => ({ name })),
    }));

    const projection = await githubProjectDevelopmentStatus({
      syncedAt: "2026-09-20T12:00:00Z",
      queryProjectPage: async ({ cursor }) => ({
        data: {
          organization: {
            projectV2: {
              fields: { pageInfo: { hasNextPage: false }, nodes: projectFields },
              items:
                cursor === null
                  ? {
                      pageInfo: { hasNextPage: true, endCursor: "page-2" },
                      nodes: [node("DeepSeekBot", content(100, "2026-09-20T10:00:00Z"))],
                    }
                  : {
                      pageInfo: { hasNextPage: false, endCursor: null },
                      nodes: [node("DSH Skill", content(102, "2026-09-20T11:00:00Z"))],
                    },
            },
          },
        },
      }),
    });

    expect(projection.items.map(({ artifact, title }) => ({ artifact, title }))).toEqual([
      { artifact: "dsh-skill", title: "Issue 102" },
      { artifact: "deepseekbot", title: "Issue 100" },
    ]);
  });

  it("fails closed when the required Project fields change", () => {
    expect(() =>
      projectDevelopmentStatus(
        { fields: fields.filter((field) => field.name !== "Artifact"), items: [] },
        "2026-09-20T12:00:00Z",
      ),
    ).toThrow("Development status Project schema mismatch: Artifact must exist exactly once");
  });

  it("fails closed when a required Project field name is ambiguous", () => {
    expect(() =>
      projectDevelopmentStatus(
        { fields: [...fields, { ...fields[1] }], items: [] },
        "2026-09-20T12:00:00Z",
      ),
    ).toThrow(
      "Development status Project schema mismatch: Artifact must exist exactly once",
    );
  });

  it("does not echo an unsupported private Artifact value in its schema error", () => {
    const run = () =>
      projectDevelopmentStatus(
        {
          fields,
          items: [
            {
              status: "In Progress",
              artifact: "confidential-roadmap",
              content: {
                type: "Issue",
                repositoryVisibility: "PUBLIC",
                title: "Visible work",
                url: "https://github.com/BotHarness/BotHarness/issues/104",
                milestone: "v1.0",
                updatedAt: "2026-09-20T11:00:00Z",
              },
            },
          ],
        },
        "2026-09-20T12:00:00Z",
      );

    expect(run).toThrow(
      "Development status Project schema mismatch: selected item has an unsupported Artifact value",
    );
    expect(run).not.toThrow(/confidential-roadmap/);
  });

  it("fails closed instead of truncating nested Project field values", async () => {
    const result = githubProjectDevelopmentStatus({
      syncedAt: "2026-09-20T12:00:00Z",
      queryProjectPage: async () => ({
        data: {
          organization: {
            projectV2: {
              fields: {
                pageInfo: { hasNextPage: false },
                nodes: fields.map((field) => ({
                  __typename: field.type,
                  name: field.name,
                  options: field.options.map((name) => ({ name })),
                })),
              },
              items: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    fieldValues: {
                      pageInfo: { hasNextPage: true },
                      nodes: [],
                    },
                    content: null,
                  },
                ],
              },
            },
          },
        },
      }),
    });

    await expect(result).rejects.toThrow(
      "Development status Project schema mismatch: GitHub response truncated an item's Project field values",
    );
  });

  it("fails closed instead of truncating the Project field schema", async () => {
    const result = githubProjectDevelopmentStatus({
      syncedAt: "2026-09-20T12:00:00Z",
      queryProjectPage: async () => ({
        data: {
          organization: {
            projectV2: {
              fields: { pageInfo: { hasNextPage: true }, nodes: [] },
              items: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [],
              },
            },
          },
        },
      }),
    });

    await expect(result).rejects.toThrow(
      "Development status Project schema mismatch: GitHub response truncated the Project field schema",
    );
  });

  it("fails closed when an item's Project field values are malformed", async () => {
    const result = githubProjectDevelopmentStatus({
      syncedAt: "2026-09-20T12:00:00Z",
      queryProjectPage: async () => ({
        data: {
          organization: {
            projectV2: {
              fields: {
                pageInfo: { hasNextPage: false },
                nodes: fields.map((field) => ({
                  __typename: field.type,
                  name: field.name,
                  options: field.options.map((name) => ({ name })),
                })),
              },
              items: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ fieldValues: { pageInfo: { hasNextPage: false } }, content: null }],
              },
            },
          },
        },
      }),
    });

    await expect(result).rejects.toThrow(
      "Development status Project schema mismatch: GitHub response is missing an item's Project field values",
    );
  });
});
