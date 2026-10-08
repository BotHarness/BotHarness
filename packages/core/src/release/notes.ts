import { parseReleaseLedger } from '../../../../scripts/release-ledger.mjs';
import { compareVersions, isReleaseVersion } from './version.js';

export const RELEASE_REPOSITORY_URL = 'https://github.com/BotHarness/BotHarness';

export interface LocalizedText {
  en: string;
  zh: string;
}

export interface ReleaseNoteSection {
  name: string;
  entries: LocalizedText[];
}

export interface ReleaseNote {
  version: string;
  date: string;
  summary: LocalizedText;
  sections: ReleaseNoteSection[];
}

export const RELEASE_NOTE_SECTION_ORDER = [
  'Added',
  'Changed',
  'Fixed',
  'Security',
  'Documentation',
  'Breaking Changes',
  'Deprecated',
  'Removed',
];

function sectionRank(name: string): number {
  const index = RELEASE_NOTE_SECTION_ORDER.indexOf(name);
  return index === -1 ? RELEASE_NOTE_SECTION_ORDER.length : index;
}

const MARKDOWN_LINK = /(\[[^\]]*\]\()([^)\s]+)(\))/gu;

export function absolutizeLedgerLinks(text: string): string {
  return text.replace(MARKDOWN_LINK, (whole, open: string, target: string, close: string) => {
    if (/^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith('#')) return whole;
    const path = target.replace(/^\.?\//u, '');
    return `${open}${RELEASE_REPOSITORY_URL}/blob/main/${path}${close}`;
  });
}

export function pairReleaseLedgers(english: string, chinese: string): ReleaseNote[] {
  const translated = new Map(
    parseReleaseLedger(chinese).releases.map((release) => [release.identity, release]),
  );
  const notes: ReleaseNote[] = [];
  for (const release of parseReleaseLedger(english).releases) {
    if (!isReleaseVersion(release.identity) || release.date === undefined) continue;
    const zh = translated.get(release.identity);
    notes.push({
      version: release.identity,
      date: release.date,
      summary: {
        en: absolutizeLedgerLinks(release.summary),
        zh: absolutizeLedgerLinks(zh?.summary || release.summary),
      },
      sections: release.sections
        .toSorted((left, right) => sectionRank(left.name) - sectionRank(right.name))
        .map((section) => {
          const zhEntries = zh?.sections.find(
            (candidate) => candidate.name === section.name,
          )?.entries;
          return {
            name: section.name,
            entries: section.entries.map((entry, index) => ({
              en: absolutizeLedgerLinks(entry.text),
              zh: absolutizeLedgerLinks(zhEntries?.[index]?.text ?? entry.text),
            })),
          };
        }),
    });
  }
  return notes.sort((left, right) => compareVersions(right.version, left.version));
}

export function selectReleaseNotes(
  notes: readonly ReleaseNote[],
  range: { after?: string | undefined; through: string },
): ReleaseNote[] {
  return notes.filter(
    (note) =>
      compareVersions(note.version, range.through) <= 0 &&
      (range.after === undefined ||
        !isReleaseVersion(range.after) ||
        compareVersions(note.version, range.after) > 0),
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseText(value: unknown): LocalizedText | undefined {
  const source = record(value);
  return typeof source?.['en'] === 'string' && typeof source['zh'] === 'string'
    ? { en: source['en'], zh: source['zh'] }
    : undefined;
}

function parseSection(value: unknown): ReleaseNoteSection | undefined {
  const source = record(value);
  if (typeof source?.['name'] !== 'string' || !Array.isArray(source['entries'])) return undefined;
  const entries = source['entries'].map(parseText);
  return entries.every((entry): entry is LocalizedText => entry !== undefined)
    ? { name: source['name'], entries }
    : undefined;
}

export function parseReleaseNotes(value: unknown): ReleaseNote[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const notes: ReleaseNote[] = [];
  for (const item of value) {
    const source = record(item);
    const summary = parseText(source?.['summary']);
    const sections = Array.isArray(source?.['sections'])
      ? source['sections'].map(parseSection)
      : undefined;
    if (
      typeof source?.['version'] !== 'string' ||
      typeof source['date'] !== 'string' ||
      summary === undefined ||
      sections === undefined ||
      !sections.every((section): section is ReleaseNoteSection => section !== undefined)
    )
      return undefined;
    notes.push({ version: source['version'], date: source['date'], summary, sections });
  }
  return notes;
}
