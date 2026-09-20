import {
  DEVELOPMENT_SUMMARY_IDENTITY,
  isPublicPreReleaseIdentity,
  parseReleaseLedger,
  validateDshSkillReleaseLedgerPair,
  validateReleaseLedgerPair,
} from './release-ledger.mjs';

export const DEVELOPMENT_STATUS_STATES = [
  'in-progress',
  'merged-awaiting-release',
  'pre-release',
  'released',
];

const ARTIFACTS = [
  { id: 'deepseekbot', label: 'DeepSeekBot' },
  { id: 'dsh-skill', label: 'DSH Skill' },
];

function assertValidPair(artifact, pair) {
  const errors =
    artifact === 'dsh-skill'
      ? validateDshSkillReleaseLedgerPair(pair.english, pair.chinese)
      : validateReleaseLedgerPair(pair.english, pair.chinese);
  if (errors.length === 0) return;
  throw new Error(
    `${artifact} Release Ledger cannot produce Development status:\n${errors
      .map((error) => `${error.source} [${error.code}] ${error.message}`)
      .join('\n')}`,
  );
}

function plainText(markdown) {
  return markdown
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1');
}

function mergedItems(english, chinese) {
  const en = english.find(({ identity }) => identity === 'Unreleased');
  const zh = chinese.find(({ identity }) => identity === 'Unreleased');
  if (!en || !zh) return [];

  return en.sections.flatMap((section, sectionIndex) =>
    section.entries.map((entry, entryIndex) => ({
      kind: 'merged-awaiting-release',
      category: section.name,
      title: {
        en: plainText(entry.text),
        zh: plainText(zh.sections[sectionIndex].entries[entryIndex].text),
      },
      links: entry.links,
    })),
  );
}

function isStableRelease(identity) {
  return !identity.includes('-');
}

function releaseItems(english, chinese, state) {
  return english
    .map((release, index) => ({ release, counterpart: chinese[index] }))
    .filter(({ release }) => release.identity !== 'Unreleased')
    .filter(({ release }) => release.identity !== DEVELOPMENT_SUMMARY_IDENTITY)
    .filter(({ release }) =>
      state === 'pre-release'
        ? isPublicPreReleaseIdentity(release.identity) &&
          release.evidence?.tagUrl &&
          release.evidence?.installUrl
        : isStableRelease(release.identity),
    )
    .map(({ release, counterpart }) => ({
      kind: state,
      version: release.identity,
      date: release.date,
      title: { en: release.summary, zh: counterpart.summary },
      links: [
        ...new Set(
          [
            ...release.sections.flatMap(({ entries }) => entries.flatMap(({ links }) => links)),
            release.evidence?.tagUrl,
            release.evidence?.installUrl,
          ].filter(Boolean),
        ),
      ],
      provenance: release.provenance
        ? {
            verifiedAgainst: release.provenance.verifiedAgainst,
            upstreamSha: release.provenance.upstreamSha,
            upstreamUrl: release.provenance.upstreamUrl,
          }
        : undefined,
    }));
}

function artifactView(definition, projection, pair) {
  assertValidPair(definition.id, pair);
  const english = parseReleaseLedger(pair.english).releases;
  const chinese = parseReleaseLedger(pair.chinese).releases;

  return {
    ...definition,
    states: {
      'in-progress': projection.items
        .filter(({ artifact }) => artifact === definition.id)
        .map(({ title, url, milestone, updatedAt }) => ({
          kind: 'in-progress',
          title: { en: title, zh: title },
          url,
          milestone,
          updatedAt,
        })),
      'merged-awaiting-release': mergedItems(english, chinese),
      'pre-release': releaseItems(english, chinese, 'pre-release'),
      released: releaseItems(english, chinese, 'released'),
    },
  };
}

/** Build the four-state, artifact-separated public Development status model. */
export function buildDevelopmentStatus({ projection, deepSeekBot, dshSkill }) {
  const pairs = { deepseekbot: deepSeekBot, 'dsh-skill': dshSkill };
  return {
    states: [...DEVELOPMENT_STATUS_STATES],
    syncedAt: projection.syncedAt,
    artifacts: ARTIFACTS.map((definition) =>
      artifactView(definition, projection, pairs[definition.id]),
    ),
  };
}
