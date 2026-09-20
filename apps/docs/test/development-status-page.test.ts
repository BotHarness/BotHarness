import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildDevelopmentStatus } from "../../../scripts/development-status-view.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const deepSeekBotEnglish = `# DeepSeekBot Changelog

## [Unreleased]

Preparing the next release.

### Added

- Added the next capability ([#1](https://github.com/BotHarness/BotHarness/pull/1)).

## [1.0.0-rc.1] - 2026-09-19

Published a candidate.

- **Release tag:** [\`v1.0.0-rc.1\`](https://github.com/BotHarness/BotHarness/releases/tag/v1.0.0-rc.1)
- **Installable artifact:** [Download bundle](https://github.com/BotHarness/BotHarness/releases/download/v1.0.0-rc.1/deepseekbot.bundle)

### Added

- Added the candidate feature ([#2](https://github.com/BotHarness/BotHarness/pull/2)).

## [0.9.0] - 2026-09-18

Published the stable baseline.

### Added

- Added the baseline ([#3](https://github.com/BotHarness/BotHarness/pull/3)).

## [1.1.0-nightly.1] - 2026-09-18

Recorded a non-installable development build.

### Added

- Added an internal build ([#7](https://github.com/BotHarness/BotHarness/pull/7)).

## [Development] - 2026-09-17

Historical development only.

### Added

- Added old work ([#4](https://github.com/BotHarness/BotHarness/pull/4)).
`;

const deepSeekBotChinese = `# DeepSeekBot 更新日志

## [Unreleased]

准备下一个版本。

### Added

- 新增下一项能力（[#1](https://github.com/BotHarness/BotHarness/pull/1)）。

## [1.0.0-rc.1] - 2026-09-19

发布候选版本。

- **发布 tag：** [\`v1.0.0-rc.1\`](https://github.com/BotHarness/BotHarness/releases/tag/v1.0.0-rc.1)
- **可安装 artifact：** [下载 bundle](https://github.com/BotHarness/BotHarness/releases/download/v1.0.0-rc.1/deepseekbot.bundle)

### Added

- 新增候选功能（[#2](https://github.com/BotHarness/BotHarness/pull/2)）。

## [0.9.0] - 2026-09-18

发布稳定基线。

### Added

- 新增稳定基线（[#3](https://github.com/BotHarness/BotHarness/pull/3)）。

## [1.1.0-nightly.1] - 2026-09-18

记录不可安装的开发构建。

### Added

- 新增内部构建（[#7](https://github.com/BotHarness/BotHarness/pull/7)）。

## [Development] - 2026-09-17

仅作为历史开发记录。

### Added

- 新增早期工作（[#4](https://github.com/BotHarness/BotHarness/pull/4)）。
`;

const dshEnglish = `# DSH Skill Changelog

## [Unreleased]

Preparing the next skill release.

### Documentation

- Documented the next decision ([#5](https://github.com/BotHarness/BotHarness/issues/5)).

## [0.3.4] - 2026-09-20

Published the stable skill.

- **Skill version:** \`0.3.4\`
- **Verified against DSH:** \`dsh 0.1.6-alpha.2\`
- **Upstream revision:** [\`ddefc45fbc7f8e46dd73185e68295696d1297887\`](https://github.com/deepseek-ai/deepseek-harness/commit/ddefc45fbc7f8e46dd73185e68295696d1297887)

### Changed

- Refined the skill ([#6](https://github.com/BotHarness/BotHarness/issues/6)).
`;

const dshChinese = `# DSH Skill 更新日志

## [Unreleased]

准备下一个 Skill 版本。

### Documentation

- 记录下一项决策（[#5](https://github.com/BotHarness/BotHarness/issues/5)）。

## [0.3.4] - 2026-09-20

发布稳定 Skill。

- **Skill 版本：** \`0.3.4\`
- **核验的 DSH 版本：** \`dsh 0.1.6-alpha.2\`
- **上游 revision：** [\`ddefc45fbc7f8e46dd73185e68295696d1297887\`](https://github.com/deepseek-ai/deepseek-harness/commit/ddefc45fbc7f8e46dd73185e68295696d1297887)

### Changed

- 优化 Skill（[#6](https://github.com/BotHarness/BotHarness/issues/6)）。
`;

describe("Development status page model", () => {
  it("maps each authority to exactly four states without mixing artifacts", () => {
    const projection: Parameters<typeof buildDevelopmentStatus>[0]["projection"] = {
      schemaVersion: 1,
      syncedAt: "2026-09-20T15:00:00Z",
      items: [
        {
          artifact: "deepseekbot",
          title: "Build the page",
          url: "https://github.com/BotHarness/BotHarness/issues/105",
          milestone: "v1.0",
          updatedAt: "2026-09-20T14:00:00Z",
        },
      ],
    };

    const status = buildDevelopmentStatus({
      projection,
      deepSeekBot: { english: deepSeekBotEnglish, chinese: deepSeekBotChinese },
      dshSkill: { english: dshEnglish, chinese: dshChinese },
    });

    expect(status.states).toEqual([
      "in-progress",
      "merged-awaiting-release",
      "pre-release",
      "released",
    ]);
    expect(status.artifacts.map(({ id }) => id)).toEqual(["deepseekbot", "dsh-skill"]);

    const bot = status.artifacts[0]!;
    expect(bot.states["in-progress"]).toEqual([
      expect.objectContaining({
        title: { en: "Build the page", zh: "Build the page" },
        milestone: "v1.0",
        updatedAt: "2026-09-20T14:00:00Z",
      }),
    ]);
    expect(bot.states["merged-awaiting-release"][0]).toMatchObject({
      category: "Added",
      title: { en: "Added the next capability (#1).", zh: "新增下一项能力（#1）。" },
      links: ["https://github.com/BotHarness/BotHarness/pull/1"],
    });
    expect(bot.states["pre-release"].map(({ version }) => version)).toEqual(["1.0.0-rc.1"]);
    expect(bot.states.released.map(({ version }) => version)).toEqual(["0.9.0"]);
    expect(bot.states.released.map(({ version }) => version)).not.toContain("Development");

    const skill = status.artifacts[1]!;
    expect(skill.states["in-progress"]).toEqual([]);
    expect(skill.states["merged-awaiting-release"][0]).toMatchObject({
      category: "Documentation",
      links: ["https://github.com/BotHarness/BotHarness/issues/5"],
    });
    expect(skill.states["pre-release"]).toEqual([]);
    expect(skill.states.released[0]).toMatchObject({
      version: "0.3.4",
      date: "2026-09-20",
      provenance: {
        verifiedAgainst: "dsh 0.1.6-alpha.2",
        upstreamSha: "ddefc45fbc7f8e46dd73185e68295696d1297887",
      },
    });
  });

  it("builds the repository ledgers and committed projection without inventing a prerelease", () => {
    const status = buildDevelopmentStatus({
      projection: JSON.parse(
        readFileSync(resolve(ROOT, "apps/docs/src/data/development-status.json"), "utf8"),
      ),
      deepSeekBot: {
        english: readFileSync(resolve(ROOT, "CHANGELOG.md"), "utf8"),
        chinese: readFileSync(resolve(ROOT, "CHANGELOG.zh.md"), "utf8"),
      },
      dshSkill: {
        english: readFileSync(
          resolve(ROOT, ".agents/skills/dsh-plugin-dev/CHANGELOG.md"),
          "utf8",
        ),
        chinese: readFileSync(
          resolve(ROOT, ".agents/skills/dsh-plugin-dev/CHANGELOG.zh.md"),
          "utf8",
        ),
      },
    });

    for (const artifact of status.artifacts) {
      expect(artifact.states["in-progress"]).toEqual([]);
      expect(artifact.states["pre-release"]).toEqual([]);
    }
    expect(status.artifacts.find(({ id }) => id === "dsh-skill")?.states.released).toEqual([
      expect.objectContaining({ version: "0.3.4" }),
    ]);
  });

  it("rejects an alpha, beta, or RC ledger section without tag and install evidence", () => {
    const english = deepSeekBotEnglish
      .replace(/^\- \*\*Release tag:.*\n/m, "")
      .replace(/^\- \*\*Installable artifact:.*\n/m, "");
    const chinese = deepSeekBotChinese
      .replace(/^\- \*\*发布 tag：.*\n/m, "")
      .replace(/^\- \*\*可安装 artifact：.*\n/m, "");

    expect(() =>
      buildDevelopmentStatus({
        projection: { schemaVersion: 1, syncedAt: "2026-09-20T15:00:00Z", items: [] },
        deepSeekBot: { english, chinese },
        dshSkill: { english: dshEnglish, chinese: dshChinese },
      }),
    ).toThrow(/tagged and installable evidence/);
  });
});
