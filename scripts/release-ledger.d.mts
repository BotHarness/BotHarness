export interface ReleaseLedgerEntry {
  text: string;
  links: string[];
}

export interface ReleaseLedgerSection {
  name: string;
  entries: ReleaseLedgerEntry[];
}

export interface ReleaseLedgerRelease {
  identity: string;
  date?: string;
  summary: string;
  sections: ReleaseLedgerSection[];
  provenance?: {
    skillVersion?: string;
    verifiedAgainst?: string;
    upstreamSha?: string;
    upstreamUrl?: string;
  };
  evidence?: {
    tagUrl?: string;
    installUrl?: string;
  };
}

export interface ReleaseLedgerError {
  source: string;
  code: string;
  message: string;
}

export const DEVELOPMENT_SUMMARY_IDENTITY: 'Development';
export function isPublicPreReleaseIdentity(identity: string): boolean;
export const RELEASE_LEDGER_SECTIONS: readonly string[];
export function parseReleaseLedger(markdown: string): {
  releases: ReleaseLedgerRelease[];
};
export function validateReleaseLedger(markdown: string, source?: string): ReleaseLedgerError[];
export function validateReleaseLedgerPair(english: string, chinese: string): ReleaseLedgerError[];
export function validateDshSkillReleaseLedgerPair(
  english: string,
  chinese: string,
  current?: {
    skillVersion: string;
    verifiedAgainst: string;
    upstreamSha: string;
  },
): ReleaseLedgerError[];
