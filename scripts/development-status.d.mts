export interface DevelopmentStatusItem {
  artifact: string;
  title: string;
  url: string;
  milestone: string | null;
  updatedAt: string;
}

export interface DevelopmentStatusProjection {
  schemaVersion: 1;
  syncedAt: string;
  items: DevelopmentStatusItem[];
}

export type DevelopmentStatusQuery = (options: { cursor: string | null }) => Promise<unknown>;

export function projectDevelopmentStatus(
  snapshot: unknown,
  syncedAt: string,
): DevelopmentStatusProjection;

export function githubProjectDevelopmentStatus(options: {
  syncedAt: string;
  queryProjectPage: DevelopmentStatusQuery;
}): Promise<DevelopmentStatusProjection>;

export function syncDevelopmentStatus(options?: {
  syncedAt?: string;
  queryProjectPage?: DevelopmentStatusQuery;
  output?: string | null;
}): Promise<DevelopmentStatusProjection | string>;
