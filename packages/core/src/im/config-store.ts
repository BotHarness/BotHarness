import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  emptyWorkspacesDocument,
  resolveBotIdentity,
  type BotResolveResult,
  type ImBotRecord,
  type WorkspacesDocument,
} from './identity.js';

export interface ImStoresSnapshot {
  home: string;
  integrationId: string;
  integrationRoot: string;
  bots: ImBotRecord[];
  workspaces: WorkspacesDocument;
}

export interface ImStoreReaderOptions {
  dshHome?: string;
  integrationId?: string;
  readFile?: (path: string) => string | undefined;
}

export function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env['DSH_HOME']?.trim();
  return fromEnv ? fromEnv : join(homedir(), '.dsh');
}

export function parseImBotsConfig(raw: unknown): ImBotRecord[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const source = raw as Record<string, unknown>;
  const bots = source['bots'];
  const entries = Array.isArray(bots) ? bots : [source];

  const records: ImBotRecord[] = [];
  for (const candidate of entries) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const entry = candidate as Record<string, unknown>;
    const id = typeof entry['id'] === 'string' ? entry['id'].trim() : '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) continue;
    const record: ImBotRecord = { id };
    const botName = typeof entry['botName'] === 'string' ? entry['botName'].trim() : '';
    if (botName) record.botName = botName;
    const appId = typeof entry['appId'] === 'string' ? entry['appId'].trim() : '';
    if (appId) record.appId = appId;
    const domain = entry['domain'];
    if (domain === 'feishu' || domain === 'lark') record.domain = domain;
    records.push(record);
  }
  return records;
}

function stringRecord(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof value !== 'object' || value === null) return result;
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && entry.trim()) result[key] = entry;
  }
  return result;
}

export function parseWorkspacesDocument(raw: unknown): WorkspacesDocument {
  const document = emptyWorkspacesDocument();
  if (typeof raw !== 'object' || raw === null) return document;
  const source = raw as Record<string, unknown>;
  document.workspaces = stringRecord(source['workspaces']);
  document.aliases = stringRecord(source['aliases']);
  const conversation = source['conversationWorkspaces'];
  if (typeof conversation === 'object' && conversation !== null) {
    for (const [botId, value] of Object.entries(conversation)) {
      const paths = stringRecord(value);
      if (Object.keys(paths).length > 0) document.conversationWorkspaces[botId] = paths;
    }
  }
  return document;
}

function parseJson(reader: (path: string) => string | undefined, path: string): unknown {
  const text = reader(path);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function defaultReadFile(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

export function canonicalizeWorkspacePath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

export function createImStoreReader(options: ImStoreReaderOptions = {}) {
  const configuredHome = options.dshHome?.trim();
  const home = configuredHome ? configuredHome : resolveDshHome();
  const integrationId = options.integrationId ?? 'dsh-feishu';
  const integrationRoot = join(home, 'integrations', integrationId);
  const reader = options.readFile ?? defaultReadFile;

  return {
    home,
    integrationId,
    integrationRoot,
    read(): ImStoresSnapshot {
      return {
        home,
        integrationId,
        integrationRoot,
        bots: parseImBotsConfig(parseJson(reader, join(integrationRoot, 'config.json'))),
        workspaces: parseWorkspacesDocument(
          parseJson(reader, join(integrationRoot, 'workspaces.json')),
        ),
      };
    },
  };
}

/** IM binding helper: resolves a PersonaBot identity from the base IM stores' workspaces. */
export function resolveBotFromStores(
  workspacePath: string,
  snapshot: Pick<ImStoresSnapshot, 'bots' | 'workspaces'>,
  conversationKey?: string,
): BotResolveResult {
  return resolveBotIdentity({
    workspacePath,
    bots: snapshot.bots,
    workspaces: snapshot.workspaces,
    ...(conversationKey === undefined ? {} : { conversationKey }),
    canonicalize: canonicalizeWorkspacePath,
  });
}
