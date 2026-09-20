export type DevelopmentStatusState =
  | 'in-progress'
  | 'merged-awaiting-release'
  | 'pre-release'
  | 'released';

export interface LocalizedText {
  en: string;
  zh: string;
}

export interface InProgressStatusItem {
  kind: 'in-progress';
  title: LocalizedText;
  url: string;
  milestone: string;
  updatedAt: string;
}

export interface MergedStatusItem {
  kind: 'merged-awaiting-release';
  category: string;
  title: LocalizedText;
  links: string[];
}

export interface ReleaseStatusItem {
  kind: 'pre-release' | 'released';
  version: string;
  date: string;
  title: LocalizedText;
  links: string[];
  provenance?: {
    verifiedAgainst?: string;
    upstreamSha?: string;
    upstreamUrl?: string;
  };
}

export interface DevelopmentStatusArtifact {
  id: 'deepseekbot' | 'dsh-skill';
  label: string;
  states: {
    'in-progress': InProgressStatusItem[];
    'merged-awaiting-release': MergedStatusItem[];
    'pre-release': ReleaseStatusItem[];
    released: ReleaseStatusItem[];
  };
}

export interface DevelopmentStatusModel {
  states: DevelopmentStatusState[];
  syncedAt: string;
  artifacts: DevelopmentStatusArtifact[];
}

export const DEVELOPMENT_STATUS_STATES: DevelopmentStatusState[];

export function buildDevelopmentStatus(input: {
  projection: {
    schemaVersion: number;
    syncedAt: string;
    items: Array<{
      artifact: 'deepseekbot' | 'dsh-skill';
      title: string;
      url: string;
      milestone: string;
      updatedAt: string;
    }>;
  };
  deepSeekBot: { english: string; chinese: string };
  dshSkill: { english: string; chinese: string };
}): DevelopmentStatusModel;
