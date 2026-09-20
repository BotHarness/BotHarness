import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseReleaseLedger,
  validateReleaseLedger,
  validateReleaseLedgerPair,
} from "../../../scripts/release-ledger.mjs";

describe("DeepSeekBot release ledger", () => {
  it("parses Unreleased and dated SemVer releases through the canonical ledger seam", () => {
    const ledger = parseReleaseLedger(`# DeepSeekBot Changelog

## [Unreleased]

Make the next release easier to understand.

### Documentation

- Added the release-writing contract ([#100](https://github.com/BotHarness/BotHarness/issues/100)).

## [0.1.0] - 2026-09-20

Introduced the first installable DeepSeekBot preview.

### Added

- Added the PersonaBot roster ([#10](https://github.com/BotHarness/BotHarness/issues/10)).
`);

    expect(ledger.releases).toEqual([
      {
        identity: "Unreleased",
        date: undefined,
        summary: "Make the next release easier to understand.",
        sections: [
          {
            name: "Documentation",
            entries: [
              {
                text: "Added the release-writing contract ([#100](https://github.com/BotHarness/BotHarness/issues/100)).",
                links: ["https://github.com/BotHarness/BotHarness/issues/100"],
              },
            ],
          },
        ],
      },
      {
        identity: "0.1.0",
        date: "2026-09-20",
        summary: "Introduced the first installable DeepSeekBot preview.",
        sections: [
          {
            name: "Added",
            entries: [
              {
                text: "Added the PersonaBot roster ([#10](https://github.com/BotHarness/BotHarness/issues/10)).",
                links: ["https://github.com/BotHarness/BotHarness/issues/10"],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("rejects objective structural defects without judging prose quality", () => {
    const errors = validateReleaseLedger(`# DeepSeekBot Changelog

## [Unreleased]

### Highlights

- A launch note with no provenance.

### Security
`);

    expect(errors.map((error) => error.code)).toEqual([
      "missing-summary",
      "unknown-section",
      "missing-provenance",
      "empty-section",
    ]);
  });

  it("requires Unreleased first and rejects content that bypasses change validation", () => {
    const errors = validateReleaseLedger(`# DeepSeekBot Changelog

## [0.1.0] - 2026-09-20

Published the first preview.

### Added

This paragraph bypasses the change-entry contract.

- Added the PersonaBot roster ([#10](https://github.com/BotHarness/BotHarness/issues/10)).

## [Unreleased]

Preparing the next release.
`);

    expect(errors.map((error) => error.code)).toEqual([
      "unreleased-order",
      "unexpected-section-content",
    ]);
  });

  it("treats an indented Markdown continuation as part of its change entry", () => {
    const markdown = `# DeepSeekBot Changelog

## [Unreleased]

Preparing the next release.

### Fixed

- Fixed release validation
  for translated entries ([#100](https://github.com/BotHarness/BotHarness/issues/100)).
`;

    expect(validateReleaseLedger(markdown)).toEqual([]);
    expect(parseReleaseLedger(markdown).releases[0]?.sections[0]?.entries[0]).toEqual({
      text: "Fixed release validation for translated entries ([#100](https://github.com/BotHarness/BotHarness/issues/100)).",
      links: ["https://github.com/BotHarness/BotHarness/issues/100"],
    });
  });

  it("accepts SemVer prereleases and rejects invalid version or calendar date identities", () => {
    const valid = `# DeepSeekBot Changelog

## [Unreleased]

Preparing the next stable release.

## [0.2.0-rc.1+build.5] - 2026-09-30

Published a testable prerelease.

- **Release tag:** [\`v0.2.0-rc.1+build.5\`](https://github.com/BotHarness/BotHarness/releases/tag/v0.2.0-rc.1+build.5)
- **Installable artifact:** [Download bundle](https://github.com/BotHarness/BotHarness/releases/download/v0.2.0-rc.1+build.5/deepseekbot.bundle)

### Added

- Added a preview capability ([#100](https://github.com/BotHarness/BotHarness/issues/100)).
`;
    expect(validateReleaseLedger(valid)).toEqual([]);

    const nonGitHubTag = valid.replace(
      "https://github.com/BotHarness/BotHarness/releases/tag",
      "https://example.com/releases/tag",
    );
    expect(validateReleaseLedger(nonGitHubTag).map((error) => error.code)).toEqual([
      "missing-prerelease-evidence",
    ]);

    const missingRepositoryTag = valid.replace(
      "https://github.com/BotHarness/BotHarness/releases/tag",
      "https://github.com/releases/tag",
    );
    expect(validateReleaseLedger(missingRepositoryTag).map((error) => error.code)).toEqual([
      "missing-prerelease-evidence",
    ]);

    const invalid = valid.replace("0.2.0-rc.1+build.5", "01.2.0").replace(
      "2026-09-30",
      "2026-02-30",
    );
    expect(validateReleaseLedger(invalid).map((error) => error.code)).toEqual([
      "invalid-version",
      "invalid-date",
    ]);
  });

  it("accepts one dated Development summary without treating it as a release version", () => {
    const ledger = `# DeepSeekBot Changelog

## [Unreleased]

Preparing the first public release.

## [Development] - 2026-09-20

Consolidated the implemented work before the first release.

### Documentation

- Published the contributor docs ([#26](https://github.com/BotHarness/BotHarness/issues/26)).
`;

    expect(validateReleaseLedger(ledger)).toEqual([]);
    expect(parseReleaseLedger(ledger).releases.at(-1)).toMatchObject({
      identity: "Development",
      date: "2026-09-20",
    });
  });

  it("allows natural translation while enforcing bilingual release, section, and link parity", () => {
    const english = `# DeepSeekBot Changelog

## [Unreleased]

Make release history easier to scan.

### Documentation

- Added a concise writing contract ([#100](https://github.com/BotHarness/BotHarness/issues/100)).
`;
    const chinese = `# DeepSeekBot 更新日志

## [Unreleased]

让读者更容易浏览发布历史。

### Documentation

- 新增简洁的写作规范（[#100](https://github.com/BotHarness/BotHarness/issues/100)）。
`;

    expect(validateReleaseLedgerPair(english, chinese)).toEqual([]);

    const mismatched = chinese
      .replace("### Documentation", "### Changed")
      .replace("issues/100", "issues/99");
    expect(validateReleaseLedgerPair(english, mismatched).map((error) => error.code)).toEqual([
      "section-parity",
      "link-parity",
    ]);

    const extraEntry = `${chinese.trim()}\n- 再写一条指向同一票的内容（[#100](https://github.com/BotHarness/BotHarness/issues/100)）。\n`;
    expect(validateReleaseLedgerPair(english, extraEntry).map((error) => error.code)).toEqual([
      "entry-parity",
    ]);

    const twoEnglishEntries = english.replace(
      "([#100](https://github.com/BotHarness/BotHarness/issues/100)).",
      "([#100](https://github.com/BotHarness/BotHarness/issues/100), [#99](https://github.com/BotHarness/BotHarness/issues/99)).\n- Added validation fixtures ([#98](https://github.com/BotHarness/BotHarness/issues/98)).",
    );
    const redistributedChineseLinks = chinese.replace(
      "（[#100](https://github.com/BotHarness/BotHarness/issues/100)）。",
      "（[#100](https://github.com/BotHarness/BotHarness/issues/100)）。\n- 新增验证样例（[#99](https://github.com/BotHarness/BotHarness/issues/99)、[#98](https://github.com/BotHarness/BotHarness/issues/98)）。",
    );
    expect(
      validateReleaseLedgerPair(twoEnglishEntries, redistributedChineseLinks).map(
        (error) => error.code,
      ),
    ).toEqual(["link-parity"]);
  });

  it("exposes actionable validation failures through the repository check command", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "botharness-release-ledger-"));
    const englishPath = resolve(directory, "CHANGELOG.md");
    const chinesePath = resolve(directory, "CHANGELOG.zh.md");
    try {
      writeFileSync(
        englishPath,
        `# DeepSeekBot Changelog\n\n## [Unreleased]\n\nSummary.\n\n### Added\n`,
      );
      writeFileSync(
        chinesePath,
        `# DeepSeekBot 更新日志\n\n## [Unreleased]\n\n摘要。\n\n### Added\n`,
      );

      const result = spawnSync(
        process.execPath,
        [resolve("scripts/check-release-ledger.mjs"), englishPath, chinesePath],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "CHANGELOG.md [empty-section] Unreleased / Added must contain a change entry.",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
