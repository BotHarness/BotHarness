const RELEASE_HEADING = /^## \[([^\]]+)](?: - (\d{4}-\d{2}-\d{2}))?$/;
const SECTION_HEADING = /^### (.+)$/;
const MARKDOWN_LINK = /\[[^\]]*]\(([^)]+)\)/g;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const PROVENANCE_LINK = /^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:issues|pull)\/\d+(?:[?#].*)?$/;

export const RELEASE_LEDGER_SECTIONS = [
  'Added',
  'Changed',
  'Fixed',
  'Documentation',
  'Breaking Changes',
  'Deprecated',
  'Removed',
  'Security',
];

function linksIn(text) {
  return [...text.matchAll(MARKDOWN_LINK)].map((match) => match[1]);
}

function isCalendarDate(value) {
  if (!value) return false;
  const instant = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(instant.valueOf()) && instant.toISOString().slice(0, 10) === value;
}

function parseReleaseLedgerDocument(markdown) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const releases = [];
  const unexpectedContent = [];
  let release;
  let section;

  for (const [index, line] of lines.entries()) {
    const releaseMatch = line.match(RELEASE_HEADING);
    if (releaseMatch) {
      release = {
        identity: releaseMatch[1],
        date: releaseMatch[2],
        summary: '',
        sections: [],
      };
      releases.push(release);
      section = undefined;
      continue;
    }

    if (!release) continue;

    const sectionMatch = line.match(SECTION_HEADING);
    if (sectionMatch) {
      section = { name: sectionMatch[1], entries: [] };
      release.sections.push(section);
      continue;
    }

    if (line.startsWith('- ') && section) {
      const text = line.slice(2);
      section.entries.push({ text, links: linksIn(text) });
      continue;
    }

    if (/^\s{2,}\S/.test(line) && section && section.entries.length > 0) {
      const entry = section.entries.at(-1);
      entry.text = `${entry.text} ${line.trim()}`;
      entry.links = linksIn(entry.text);
      continue;
    }

    if (!release.summary && !section && line.trim()) {
      release.summary = line.trim();
      continue;
    }

    if (section && line.trim()) {
      unexpectedContent.push({
        releaseIdentity: release.identity,
        sectionName: section.name,
        line: index + 1,
      });
    }
  }

  return { releases, unexpectedContent };
}

/** Parse a canonical DeepSeekBot Release Ledger into its public release shape. */
export function parseReleaseLedger(markdown) {
  const { releases } = parseReleaseLedgerDocument(markdown);
  return { releases };
}

/** Validate the objective structure of one canonical Release Ledger. */
export function validateReleaseLedger(markdown, source = 'ledger') {
  const errors = [];
  const { releases, unexpectedContent } = parseReleaseLedgerDocument(markdown);
  const headings = markdown.match(/^## .+$/gm) ?? [];

  if (releases.length === 0) {
    errors.push({ source, code: 'missing-release', message: 'No release sections found.' });
  }
  if (headings.length !== releases.length) {
    errors.push({
      source,
      code: 'invalid-release-heading',
      message: 'Release headings must use ## [Unreleased] or ## [X.Y.Z] - YYYY-MM-DD.',
    });
  }
  if (releases[0]?.identity !== 'Unreleased') {
    errors.push({
      source,
      code: 'unreleased-order',
      message: 'Unreleased must be the first release section.',
    });
  }

  for (const unexpected of unexpectedContent) {
    errors.push({
      source,
      code: 'unexpected-section-content',
      message: `${unexpected.releaseIdentity} / ${unexpected.sectionName} line ${unexpected.line} must be a change entry starting with "- ".`,
    });
  }

  const identities = new Set();
  for (const release of releases) {
    if (identities.has(release.identity)) {
      errors.push({
        source,
        code: 'duplicate-release',
        message: `Release ${release.identity} appears more than once.`,
      });
    }
    identities.add(release.identity);

    if (release.identity === 'Unreleased') {
      if (release.date) {
        errors.push({
          source,
          code: 'unreleased-date',
          message: 'Unreleased must not have a release date.',
        });
      }
    } else {
      if (!SEMVER.test(release.identity)) {
        errors.push({
          source,
          code: 'invalid-version',
          message: `${release.identity} is not a SemVer release identity.`,
        });
      }
      if (!release.date) {
        errors.push({
          source,
          code: 'missing-date',
          message: `Release ${release.identity} needs an ISO release date.`,
        });
      } else if (!isCalendarDate(release.date)) {
        errors.push({
          source,
          code: 'invalid-date',
          message: `${release.date} is not a valid ISO calendar date.`,
        });
      }
    }

    if (!release.summary) {
      errors.push({
        source,
        code: 'missing-summary',
        message: `Release ${release.identity} needs a one-line summary.`,
      });
    }

    const sectionNames = new Set();
    for (const section of release.sections) {
      if (!RELEASE_LEDGER_SECTIONS.includes(section.name)) {
        errors.push({
          source,
          code: 'unknown-section',
          message: `${section.name} is not an allowed release section.`,
        });
      }
      if (sectionNames.has(section.name)) {
        errors.push({
          source,
          code: 'duplicate-section',
          message: `${release.identity} repeats the ${section.name} section.`,
        });
      }
      sectionNames.add(section.name);

      for (const entry of section.entries) {
        if (!entry.links.some((link) => PROVENANCE_LINK.test(link))) {
          errors.push({
            source,
            code: 'missing-provenance',
            message: `${release.identity} / ${section.name} has an entry without an Issue or PR link.`,
          });
        }
      }
      if (section.entries.length === 0) {
        errors.push({
          source,
          code: 'empty-section',
          message: `${release.identity} / ${section.name} must contain a change entry.`,
        });
      }
    }
  }

  return errors;
}

function sameValues(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Validate the English authority and Chinese counterpart as one release ledger. */
export function validateReleaseLedgerPair(english, chinese) {
  const errors = [
    ...validateReleaseLedger(english, 'CHANGELOG.md'),
    ...validateReleaseLedger(chinese, 'CHANGELOG.zh.md'),
  ];
  const en = parseReleaseLedger(english).releases;
  const zh = parseReleaseLedger(chinese).releases;

  const enIdentity = en.map(({ identity, date }) => [identity, date]);
  const zhIdentity = zh.map(({ identity, date }) => [identity, date]);
  if (!sameValues(enIdentity, zhIdentity)) {
    errors.push({
      source: 'bilingual',
      code: 'release-parity',
      message: 'English and Chinese release identities or dates differ.',
    });
  }

  const count = Math.min(en.length, zh.length);
  for (let index = 0; index < count; index += 1) {
    const enRelease = en[index];
    const zhRelease = zh[index];
    const enSections = enRelease.sections.map((section) => section.name);
    const zhSections = zhRelease.sections.map((section) => section.name);
    if (!sameValues(enSections, zhSections)) {
      errors.push({
        source: 'bilingual',
        code: 'section-parity',
        message: `${enRelease.identity} has different English and Chinese sections.`,
      });
    }

    const enEntryCounts = enRelease.sections.map((section) => section.entries.length);
    const zhEntryCounts = zhRelease.sections.map((section) => section.entries.length);
    if (!sameValues(enEntryCounts, zhEntryCounts)) {
      errors.push({
        source: 'bilingual',
        code: 'entry-parity',
        message: `${enRelease.identity} has different English and Chinese entry counts.`,
      });
    }

    const correspondingLinksDiffer = enRelease.sections.some((enSection, sectionIndex) => {
      const zhSection = zhRelease.sections[sectionIndex];
      if (!zhSection) return false;
      return enSection.entries.some((enEntry, entryIndex) => {
        const zhEntry = zhSection.entries[entryIndex];
        return zhEntry ? !sameValues(enEntry.links, zhEntry.links) : false;
      });
    });
    if (correspondingLinksDiffer) {
      errors.push({
        source: 'bilingual',
        code: 'link-parity',
        message: `${enRelease.identity} has different English and Chinese link targets in corresponding entries.`,
      });
    }
  }

  return errors;
}
