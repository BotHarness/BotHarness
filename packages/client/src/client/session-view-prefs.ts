import { defaultStorage, type ConfigStorage } from './roster-config.js';

export type SessionScope = 'current' | 'all';
export type SessionLayout = 'flat' | 'workspace';

export interface SessionViewPreference {
  scope: SessionScope;
  layout: SessionLayout;
  collapsedWorkspaces: string[];
}

export const SESSION_VIEW_PREFERENCES_KEY = 'botharness/session-views.v1';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function allPreferences(storage: ConfigStorage | undefined): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(storage?.getItem(SESSION_VIEW_PREFERENCES_KEY) ?? '{}')) ?? {};
  } catch {
    return {};
  }
}

export function readSessionViewPreference(
  botSlug: string,
  storage: ConfigStorage | undefined = defaultStorage(),
): SessionViewPreference {
  const record = asRecord(allPreferences(storage)[botSlug]);
  const collapsed = record?.['collapsedWorkspaces'];
  return {
    scope: record?.['scope'] === 'all' ? 'all' : 'current',
    layout: record?.['layout'] === 'workspace' ? 'workspace' : 'flat',
    collapsedWorkspaces: Array.isArray(collapsed)
      ? [
          ...new Set(
            collapsed.filter((key): key is string => typeof key === 'string' && key.length <= 4096),
          ),
        ].slice(0, 200)
      : [],
  };
}

export function writeSessionViewPreference(
  botSlug: string,
  preference: SessionViewPreference,
  storage: ConfigStorage | undefined = defaultStorage(),
): void {
  if (storage === undefined) return;
  try {
    const records = allPreferences(storage);
    records[botSlug] = preference;
    storage.setItem(SESSION_VIEW_PREFERENCES_KEY, JSON.stringify(records));
  } catch {
    // Browser storage can be denied or full. The view remains usable in this tab.
  }
}
