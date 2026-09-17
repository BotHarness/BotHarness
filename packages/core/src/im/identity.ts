export type BotDomain = 'feishu' | 'lark';

export interface ImBotRecord {
  id: string;
  botName?: string;
  appId?: string;
  domain?: BotDomain;
}

export interface WorkspacesDocument {
  workspaces: Record<string, string>;
  aliases: Record<string, string>;
  conversationWorkspaces: Record<string, Record<string, string>>;
}

export interface BotIdentity {
  id: string;
  displayName: string;
  workspace: string;
  alias?: string;
  botName?: string;
  domain?: BotDomain;
}

export type BotResolveResult =
  | { ok: true; identity: BotIdentity }
  | { ok: false; reason: 'not-found' | 'ambiguous'; matches: BotIdentity[] };

export interface ResolveBotIdentityInput {
  workspacePath: string;
  bots: readonly ImBotRecord[];
  workspaces: WorkspacesDocument;
  conversationKey?: string;
  canonicalize?: (path: string) => string;
}

interface BotNames {
  alias?: string;
  botName?: string;
}

export function emptyWorkspacesDocument(): WorkspacesDocument {
  return { workspaces: {}, aliases: {}, conversationWorkspaces: {} };
}

function namesFor(bot: ImBotRecord, workspaces: WorkspacesDocument): BotNames {
  const alias = workspaces.aliases[bot.id]?.trim() || undefined;
  const botName = bot.botName?.trim() || undefined;
  return {
    ...(alias === undefined ? {} : { alias }),
    ...(botName === undefined ? {} : { botName }),
  };
}

function displayNameFrom(names: BotNames, id: string): string {
  return names.alias ?? names.botName ?? id;
}

export function displayNameForBot(bot: ImBotRecord, workspaces: WorkspacesDocument): string {
  return displayNameFrom(namesFor(bot, workspaces), bot.id);
}

function normalizeWorkspacePath(value: string, canonicalize: (path: string) => string): string {
  let normalized = value.trim();
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return canonicalize(normalized);
}

function toIdentity(
  bot: ImBotRecord,
  workspace: string,
  workspaces: WorkspacesDocument,
): BotIdentity {
  const names = namesFor(bot, workspaces);
  return {
    id: bot.id,
    displayName: displayNameFrom(names, bot.id),
    workspace,
    ...names,
    ...(bot.domain === undefined ? {} : { domain: bot.domain }),
  };
}

export function resolveBotIdentity(input: ResolveBotIdentityInput): BotResolveResult {
  const canonicalize = input.canonicalize ?? ((path: string) => path);
  const target = normalizeWorkspacePath(input.workspacePath, canonicalize);
  const overridesTier: BotIdentity[] = [];
  const defaultTier: BotIdentity[] = [];

  for (const bot of input.bots) {
    const candidates: Array<{ path: string; tier: 0 | 1 }> = [];
    if (input.conversationKey !== undefined) {
      const override = input.workspaces.conversationWorkspaces[bot.id]?.[input.conversationKey];
      if (override?.trim()) candidates.push({ path: override, tier: 0 });
    }
    const base = input.workspaces.workspaces[bot.id];
    if (base?.trim()) candidates.push({ path: base, tier: 1 });

    for (const candidate of candidates) {
      const normalized = normalizeWorkspacePath(candidate.path, canonicalize);
      if (normalized === target) {
        const tier = candidate.tier === 0 ? overridesTier : defaultTier;
        tier.push(toIdentity(bot, normalized, input.workspaces));
        break;
      }
    }
  }

  for (const tier of [overridesTier, defaultTier]) {
    const first = tier[0];
    if (first !== undefined && tier.length === 1) {
      return { ok: true, identity: first };
    }
    if (tier.length > 1) {
      return { ok: false, reason: 'ambiguous', matches: tier };
    }
  }
  return { ok: false, reason: 'not-found', matches: [] };
}
