import { randomUUID } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

import { dmChannelId } from '../channels/channel.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../database/schema-plan.js';
import { mountOperationalDatabase, type OperationalDatabaseOwner } from '../database/owner.js';
import { resolveDshHome } from '../im/config-store.js';
import { cloneMemoryRepository, parseMemoryGitUrl, type HttpsFallback } from '../memory/clone.js';
import { ensureMemoryRepository } from '../memory/repository.js';
import {
  createModelPresetStore,
  type ModelPreset,
  type ModelRoute,
  type PersonaBotModelPlan,
} from '../models/presets.js';
import {
  BOT_DESCRIPTOR_PATH,
  parseBotDescriptor,
  type BotDescriptor,
} from '../marketplace/descriptor.js';
import { syncBotDescriptor } from './bot-descriptor-sync.js';
import { bundleBotHistory, readBotZip, BOT_ZIP_MAX_BYTES, BOT_ZIP_MAX_ENTRIES } from './bot-zip.js';
import type { PersonaBotRecord } from './persona-bot.js';
import { createPersonaBotRegistry, type PersonaBotRegistry } from './registry.js';
import { ZipArchiveError, type ZipEntry } from './zip-archive.js';

export interface BotCreateCliIo {
  env: NodeJS.ProcessEnv;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  readStdin?: () => Promise<string>;
}

export interface BotCreateStep {
  name: string;
  status: 'ok' | 'deferred';
  code?: string;
  detail?: string;
}

export interface BotCreateResult {
  bot: { id: string; name: string };
  dm: { channelId: string };
  dataDir: string;
  steps: BotCreateStep[];
  next: string[];
  httpsFallback?: { from: string; to: string; reason: string };
}

export interface BotCreateFailure {
  error: { code: string; message: string };
  steps?: BotCreateStep[];
  bot?: { id: string; name: string };
}

export const BOT_CREATE_HELP = `deepseekbot: create PersonaBots without clicking

Usage:
  deepseekbot create --name <name> [--persona <text> | --persona-stdin]
                    [--description <text>] [--role <tag> ...]
                    [--preset <model-preset-id>] [--home <dsh-home>]
  deepseekbot create --name <name> --from-git <url | owner/repo> [...]
  deepseekbot create [--name <name>] --from-zip <file> [...]
  deepseekbot create [--name <name>] --from-dir <directory> [...]
  deepseekbot list [--home <dsh-home>]
  deepseekbot show <id> [--home <dsh-home>]
  deepseekbot model-presets [--home <dsh-home>]
  deepseekbot model-preset-create --name <preset> --orchestrator-provider <p> --orchestrator-model <m>
                                  [--orchestrator-effort <e>] --assignment-provider <p>
                                  --assignment-model <m> [--assignment-effort <e>] [--home <dsh-home>]
  deepseekbot model-preset-apply <id> --preset <preset-id> [--home <dsh-home>]
  deepseekbot model-plan <id> [--home <dsh-home>]
  deepseekbot --help | deepseekbot create --help

Sources (exactly one per create):
  (none)       blank bot; --preset applies a model preset, otherwise the model
               step reports no-model-yet and activation stays a Settings task
  --from-git   clone a Git repository as Memory (HTTPS, SSH, or owner/repo
               shorthand for https://github.com/owner/repo.git)
  --from-zip   import a bot bundle zip (same shape as the bot-zip export)
  --from-dir   import a bot bundle directory (same shape as the bot-zip export;
               a .git subtree is skipped as files but packed as history)

Machine contract:
  stdout carries exactly one JSON document. Success exits 0 with the bot id,
  DM channel, data directory, per-step statuses, and next actions. Failure
  exits non-zero with {"error": {"code", "message"}} using a stable code
  (usage, secret-in-argv, bad-zip, bad-bundle, bad-ref, unknown-preset,
  unknown-bot, duplicate-preset, git-not-found, git-clone-failed, git-clone-timeout,
  memory-unavailable, invalid-input). Human-readable lines go to stderr only.

Models:
  model-presets lists the profile presets; model-preset-create mints one from
  explicit provider/model routes; model-preset-apply and model-plan read and
  write the bot record directly. Routes are shape-checked plus
  provider-existence-checked offline; catalog liveness and readiness
  inspection stay Host-side, and model-plan reports readiness deferred.

Identity:
  The bot name is a label. Every create mints a new bot id, so reusing a name
  always returns a second bot and still exits 0.

Secrets:
  Never pass secrets as arguments: any --api-key/--token/--secret/--password
  style flag is a hard error (secret-in-argv). Model keys and tokens travel in
  the environment (for example DEEPSEEK_API_KEY, GITHUB_TOKEN) or a stdin pipe
  (--persona-stdin); result JSON never contains secret values.

Home:
  --home points at the target DSH_HOME (a fresh directory works with zero
  clicks); without it, DSH_HOME from the environment is used.
`;

const STATIC_CATALOG_PROVIDER_IDS: ReadonlySet<string> = new Set([
  'amazon-bedrock',
  'ant-ling',
  'anthropic',
  'azure-openai-responses',
  'baseten',
  'cerebras',
  'cloudflare-ai-gateway',
  'cloudflare-workers-ai',
  'deepseek',
  'fireworks',
  'github-copilot',
  'google',
  'google-vertex',
  'groq',
  'huggingface',
  'kimi-coding',
  'minimax',
  'minimax-cn',
  'mistral',
  'moonshotai',
  'moonshotai-cn',
  'nvidia',
  'openai',
  'openai-codex',
  'opencode',
  'opencode-go',
  'openrouter',
  'qwen-token-plan',
  'qwen-token-plan-cn',
  'qwen-token-plan-individual',
  'together',
  'vercel-ai-gateway',
  'xai',
  'xiaomi',
  'xiaomi-token-plan-ams',
  'xiaomi-token-plan-cn',
  'xiaomi-token-plan-sgp',
  'zai',
  'zai-coding-cn',
]);

function assertKnownProvider(
  provider: string,
  carry?: { steps: BotCreateStep[]; bot?: { id: string; name: string } },
): void {
  if (!STATIC_CATALOG_PROVIDER_IDS.has(provider)) {
    throw new CliFailure(
      'invalid-input',
      `Unknown provider: ${provider}. Check the spelling; purely dynamic providers validate at the Host.`,
      1,
      carry?.steps ?? [],
      carry?.bot,
    );
  }
}

const SECRET_ARGV = new Set([
  'api-key',
  'apikey',
  'api_key',
  'token',
  'secret',
  'password',
  'passwd',
  'credential',
  'credentials',
  'private-key',
  'privatekey',
  'auth-token',
  'access-token',
  'client-secret',
  'session-token',
]);

const CREATE_OPTIONS = {
  name: { type: 'string' },
  persona: { type: 'string' },
  'persona-stdin': { type: 'boolean' },
  description: { type: 'string' },
  role: { type: 'string', multiple: true },
  preset: { type: 'string' },
  'from-zip': { type: 'string' },
  'from-dir': { type: 'string' },
  'from-git': { type: 'string' },
  home: { type: 'string' },
  'orchestrator-provider': { type: 'string' },
  'orchestrator-model': { type: 'string' },
  'orchestrator-effort': { type: 'string' },
  'assignment-provider': { type: 'string' },
  'assignment-model': { type: 'string' },
  'assignment-effort': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const;

type CreateValues = ReturnType<
  typeof parseArgs<{ options: typeof CREATE_OPTIONS; allowPositionals: true }>
>['values'];

class CliFailure extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly steps: BotCreateStep[];
  readonly bot: { id: string; name: string } | undefined;

  constructor(
    code: string,
    message: string,
    exitCode: number,
    steps: BotCreateStep[] = [],
    bot?: { id: string; name: string },
  ) {
    super(message);
    this.name = 'CliFailure';
    this.code = code;
    this.exitCode = exitCode;
    this.steps = steps;
    this.bot = bot;
  }
}

function rejectSecretArgv(argv: readonly string[]): void {
  for (const entry of argv) {
    if (!entry.startsWith('-')) continue;
    const bare = entry.replace(/^-+/, '').split('=')[0]?.toLowerCase() ?? '';
    if (SECRET_ARGV.has(bare)) {
      const flag = entry.split('=')[0];
      throw new CliFailure(
        'secret-in-argv',
        `Refusing ${flag}: secrets travel in the environment or a stdin pipe, never in arguments.`,
        2,
      );
    }
  }
}

function usageError(message: string): CliFailure {
  return new CliFailure('usage', `${message} Run deepseekbot create --help for usage.`, 2);
}

function trimmed(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next !== undefined && next.length > 0 ? next : undefined;
}

function mintSlug(): string {
  return `bot-${randomUUID().replaceAll('-', '')}`;
}

function expandGitHubRef(value: string): string | undefined {
  const raw = value.trim();
  if (raw.length === 0) return undefined;
  const shorthand = raw.replace(/^github\.com\//iu, '').replace(/\.git$/iu, '');
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(shorthand)) {
    return `https://github.com/${shorthand}.git`;
  }
  return raw;
}

function zipStem(path: string): string | undefined {
  const stem = path
    .split(/[\\/]/u)
    .at(-1)
    ?.replace(/\.zip$/iu, '')
    .trim();
  return stem !== undefined && stem.length > 0 ? [...stem].slice(0, 60).join('') : undefined;
}

const SKIPPED_BASENAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

interface BundleDirectory {
  files: ZipEntry[];
  descriptor: BotDescriptor | undefined;
  history: Buffer | undefined;
  historySkipped: boolean;
}

function readBundleDirectory(root: string): BundleDirectory {
  let absolute: string;
  try {
    absolute = resolve(root);
    if (!lstatSync(absolute).isDirectory()) throw new Error('not-a-directory');
  } catch {
    throw new CliFailure('bad-bundle', `Cannot read bundle directory: ${root}`, 1);
  }
  const files: ZipEntry[] = [];
  let total = 0;
  let gitPresent = false;
  const walk = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const full = join(directory, entry.name);
      const relativePath = relative(absolute, full).split(sep).join('/');
      if (relativePath === '.git' || relativePath.startsWith('.git/')) {
        gitPresent = true;
        continue;
      }
      const top = relativePath.split('/')[0]!;
      if (top === '__MACOSX' || SKIPPED_BASENAMES.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      let data: Buffer;
      try {
        data = readFileSync(full);
      } catch {
        throw new CliFailure('bad-bundle', `Cannot read bundle file: ${relativePath}`, 1);
      }
      total += data.length;
      if (files.length + 1 > BOT_ZIP_MAX_ENTRIES || total > BOT_ZIP_MAX_BYTES) {
        throw new CliFailure('bad-bundle', 'The bundle directory is too large to import', 1);
      }
      files.push({ path: relativePath, data });
    }
  };
  walk(absolute);
  if (files.length === 0) {
    throw new CliFailure('bad-bundle', 'The bundle directory has no files to import', 1);
  }
  const descriptorFile = files.find((file) => file.path === BOT_DESCRIPTOR_PATH);
  const descriptor =
    descriptorFile === undefined
      ? undefined
      : parseBotDescriptor(descriptorFile.data.toString('utf8'));
  let history: Buffer | undefined;
  let historySkipped = false;
  if (gitPresent) {
    try {
      history = bundleBotHistory(absolute);
    } catch {
      historySkipped = true;
    }
  }
  return { files, descriptor, history, historySkipped };
}

function resolveHome(values: CreateValues, io: BotCreateCliIo): string {
  return trimmed(values.home) ?? trimmed(io.env['DSH_HOME']) ?? resolveDshHome(io.env);
}

function openRegistry(dshHome: string): {
  owner: OperationalDatabaseOwner;
  registry: PersonaBotRegistry;
} {
  const owner = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const registry = createPersonaBotRegistry({
    rootDir: join(dshHome, 'botharness', 'bots'),
    database: owner,
    cloneMemory: (destination, url) => cloneMemoryRepository({ destination, url }),
    initializeMemory: (memoryDir) => {
      const repository = ensureMemoryRepository({ memoryDir });
      return repository.ok
        ? { ok: true }
        : {
            ok: false,
            ...(repository.code === 'git-not-found' ? { code: 'git-not-found' as const } : {}),
            message: `${repository.code}: ${repository.message}`,
          };
    },
    syncDescriptor: (memoryDir, record, sync) => {
      try {
        syncBotDescriptor(memoryDir, record, sync);
      } catch {}
    },
  });
  return { owner, registry };
}

function failureOf(reason: string, detail?: string): CliFailure {
  switch (reason) {
    case 'invalid-git-url':
      return new CliFailure(
        'bad-ref',
        'Provide a Git URL (https://, ssh://, or git@host:path) or a GitHub owner/repo.',
        1,
      );
    case 'git-not-found':
      return new CliFailure('git-not-found', 'A usable Git (2.28 or newer) is missing on PATH.', 1);
    case 'git-clone-failed':
      return new CliFailure(
        'git-clone-failed',
        'The Git repository could not be cloned. Check the ref and network access.',
        1,
      );
    case 'git-clone-timeout':
      return new CliFailure('git-clone-timeout', 'Cloning the Git repository timed out.', 1);
    case 'invalid-zip':
      return new CliFailure('bad-zip', 'The zip file could not be unpacked.', 1);
    case 'memory-unavailable':
      return new CliFailure(
        'memory-unavailable',
        detail === undefined
          ? 'The Bot memory could not be initialized.'
          : `The Bot memory could not be initialized: ${detail}`,
        1,
      );
    case 'duplicate':
      return new CliFailure('invalid-input', 'The minted bot id collided. Retry the command.', 1);
    default:
      return new CliFailure(
        'invalid-input',
        detail === undefined ? 'The bot could not be created.' : detail,
        1,
      );
  }
}

interface ValidatedCreate {
  displayName: string | undefined;
  persona: string | undefined;
  roles: string[] | undefined;
  description: string | undefined;
  presetId: string | undefined;
  source:
    | { kind: 'blank' }
    | { kind: 'git'; gitUrl: string }
    | { kind: 'zip'; path: string }
    | { kind: 'dir'; path: string };
}

async function validatedCreate(
  values: CreateValues,
  readStdin: () => Promise<string>,
): Promise<ValidatedCreate> {
  const zip = trimmed(values['from-zip']);
  const dir = trimmed(values['from-dir']);
  const git = trimmed(values['from-git']);
  const selected =
    (zip === undefined ? 0 : 1) + (dir === undefined ? 0 : 1) + (git === undefined ? 0 : 1);
  if (selected > 1) {
    throw usageError('Pass exactly one of --from-zip, --from-dir, or --from-git.');
  }
  const name = trimmed(values.name);
  const persona = trimmed(values.persona);
  const personaStdin = values['persona-stdin'] === true;
  if (persona !== undefined && personaStdin) {
    throw usageError('Pass --persona or --persona-stdin, not both.');
  }
  const description = trimmed(values.description);
  const roles =
    values.role === undefined
      ? undefined
      : values.role.map((role) => role.trim()).filter((role) => role.length > 0);
  const presetId = trimmed(values.preset);
  if (git !== undefined) {
    if (persona !== undefined || personaStdin) {
      throw usageError('The persona comes from the Git repository, not --persona.');
    }
    if (name === undefined) throw usageError('--name is required with --from-git.');
    const expanded = expandGitHubRef(git);
    if (expanded === undefined || parseMemoryGitUrl(expanded) === undefined) {
      throw new CliFailure(
        'bad-ref',
        'Provide a Git URL (https://, ssh://, or git@host:path) or a GitHub owner/repo.',
        1,
      );
    }
    return {
      displayName: name,
      persona: undefined,
      roles,
      description,
      presetId,
      source: { kind: 'git', gitUrl: expanded },
    };
  }
  if (zip !== undefined) {
    if (persona !== undefined || personaStdin) {
      throw usageError('The persona comes from the bundle, not --persona.');
    }
    return {
      displayName: name,
      persona: undefined,
      roles,
      description,
      presetId,
      source: { kind: 'zip', path: resolve(zip) },
    };
  }
  if (dir !== undefined) {
    if (persona !== undefined || personaStdin) {
      throw usageError('The persona comes from the bundle, not --persona.');
    }
    return {
      displayName: name,
      persona: undefined,
      roles,
      description,
      presetId,
      source: { kind: 'dir', path: resolve(dir) },
    };
  }
  if (name === undefined) throw usageError('--name is required for a blank bot.');
  const piped = personaStdin === true ? (await readStdin()).trim() : '';
  return {
    displayName: name,
    persona: personaStdin === true ? (piped.length > 0 ? piped : undefined) : persona,
    roles,
    description,
    presetId,
    source: { kind: 'blank' },
  };
}

function nextActions(
  channelId: string,
  name: string,
  slug: string,
  modelDeferred: boolean,
): string[] {
  const actions = [`Open DM ${channelId} in the DSH web client to talk to ${name}.`];
  if (modelDeferred) {
    actions.push(
      `Authorize a model in Bot-mode Settings, then message ${name} to verify a live reply.`,
    );
  } else {
    actions.push(`Message ${name} in DM ${channelId} to verify a live reply.`);
  }
  actions.push(`Run \`deepseekbot show ${slug}\` to inspect this bot again.`);
  return actions;
}

async function runCreate(
  values: CreateValues,
  io: BotCreateCliIo,
  readStdin: () => Promise<string>,
): Promise<BotCreateResult> {
  const validated = await validatedCreate(values, readStdin);
  const dshHome = resolveHome(values, io);
  const steps: BotCreateStep[] = [{ name: 'validate', status: 'ok' }];
  const { owner, registry } = openRegistry(dshHome);
  try {
    if (validated.presetId !== undefined) {
      const presets = createModelPresetStore({
        rootDir: join(dshHome, 'botharness'),
        database: owner,
      });
      const preset = presets.get(validated.presetId);
      if (preset === undefined) {
        throw new CliFailure(
          'unknown-preset',
          `Unknown model preset: ${validated.presetId}`,
          1,
          steps,
        );
      }
      assertKnownProvider(preset.orchestrator.provider, { steps });
      assertKnownProvider(preset.assignmentDefault.provider, { steps });
    }
    let slug = mintSlug();
    steps.push({ name: 'allocate-id', status: 'ok' });
    const base = {
      ...(validated.roles === undefined ? {} : { roles: validated.roles }),
      ...(validated.description === undefined ? {} : { description: validated.description }),
    };
    if (validated.source.kind === 'blank') {
      const attempt = (candidate: string): ReturnType<PersonaBotRegistry['create']> =>
        registry.create({
          slug: candidate,
          displayName: validated.displayName!,
          ...(validated.persona === undefined ? {} : { persona: validated.persona }),
          ...base,
        });
      let created = attempt(slug);
      if (!created.ok && created.reason === 'duplicate') {
        slug = mintSlug();
        created = attempt(slug);
      }
      if (!created.ok) throw failureOf(created.reason, created.detail);
      steps.push({ name: 'create-bot', status: 'ok' });
      return finishCreate(
        owner,
        registry,
        dshHome,
        slug,
        created.record,
        steps,
        validated.presetId,
      );
    }
    if (validated.source.kind === 'git') {
      const gitUrl = validated.source.gitUrl;
      const attempt = (
        candidate: string,
      ): Promise<Awaited<ReturnType<PersonaBotRegistry['createFromGit']>>> =>
        registry.createFromGit({
          slug: candidate,
          displayName: validated.displayName!,
          gitUrl,
          ...base,
        });
      let created = await attempt(slug);
      if (!created.ok && created.reason === 'duplicate') {
        slug = mintSlug();
        created = await attempt(slug);
      }
      if (!created.ok) throw failureOf(created.reason, created.detail);
      steps.push({ name: 'clone', status: 'ok' });
      steps.push({ name: 'create-bot', status: 'ok' });
      const httpsFallback: HttpsFallback | undefined = created.httpsFallback;
      const result = await finishCreate(
        owner,
        registry,
        dshHome,
        slug,
        created.record,
        steps,
        validated.presetId,
      );
      if (httpsFallback !== undefined) {
        steps.push({
          name: 'clone-fallback',
          status: 'ok',
          detail: `SSH failed (${httpsFallback.reason}); retried over HTTPS.`,
        });
        return {
          ...result,
          httpsFallback: {
            from: httpsFallback.from,
            to: httpsFallback.to,
            reason: httpsFallback.reason,
          },
        };
      }
      return result;
    }
    let bundle: {
      files: ZipEntry[];
      descriptor: BotDescriptor | undefined;
      history: Buffer | undefined;
      historySkipped: boolean;
    };
    if (validated.source.kind === 'zip') {
      bundle = readZipBundle(validated.source.path);
    } else if (validated.source.kind === 'dir') {
      bundle = readDirBundle(validated.source.path);
    } else {
      throw failureOf('invalid-input', 'Select a bundle with --from-zip or --from-dir.');
    }
    const displayName =
      validated.displayName ??
      bundle.descriptor?.name?.trim() ??
      (validated.source.kind === 'zip' ? zipStem(validated.source.path) : undefined) ??
      'Bot';
    const roles = validated.roles ?? bundle.descriptor?.tags;
    const botDescription = validated.description ?? bundle.descriptor?.bio;
    const attempt = (
      candidate: string,
    ): Promise<Awaited<ReturnType<PersonaBotRegistry['createFromFiles']>>> =>
      registry.createFromFiles({
        slug: candidate,
        displayName,
        files: bundle.files,
        ...(bundle.history === undefined ? {} : { history: bundle.history }),
        ...(roles === undefined ? {} : { roles }),
        ...(botDescription === undefined ? {} : { description: botDescription }),
      });
    let created = await attempt(slug);
    if (!created.ok && created.reason === 'duplicate') {
      slug = mintSlug();
      created = await attempt(slug);
    }
    if (!created.ok) throw failureOf(created.reason, created.detail);
    steps.push({
      name: 'read-bundle',
      status: 'ok',
      ...(bundle.historySkipped
        ? { detail: 'Git history was unavailable; imported files only.' }
        : {}),
    });
    steps.push({ name: 'create-bot', status: 'ok' });
    return finishCreate(owner, registry, dshHome, slug, created.record, steps, validated.presetId);
  } finally {
    owner.close();
  }
}

function readZipBundle(path: string): {
  files: ZipEntry[];
  descriptor: BotDescriptor | undefined;
  history: Buffer | undefined;
  historySkipped: boolean;
} {
  let archive: Buffer;
  try {
    archive = readFileSync(path);
  } catch {
    throw new CliFailure('bad-zip', `Cannot read zip file: ${path}`, 1);
  }
  try {
    const contents = readBotZip(archive);
    return {
      files: contents.files,
      descriptor: contents.descriptor,
      history: contents.history,
      historySkipped: false,
    };
  } catch (error) {
    if (error instanceof ZipArchiveError) {
      throw new CliFailure('bad-zip', error.message, 1);
    }
    throw new CliFailure('bad-zip', `Cannot read zip file: ${path}`, 1);
  }
}

function readDirBundle(path: string): {
  files: ZipEntry[];
  descriptor: BotDescriptor | undefined;
  history: Buffer | undefined;
  historySkipped: boolean;
} {
  const bundle = readBundleDirectory(path);
  return {
    files: bundle.files,
    descriptor: bundle.descriptor,
    history: bundle.history,
    historySkipped: bundle.historySkipped,
  };
}

async function finishCreate(
  owner: OperationalDatabaseOwner,
  registry: PersonaBotRegistry,
  dshHome: string,
  slug: string,
  record: PersonaBotRecord,
  steps: BotCreateStep[],
  presetId: string | undefined,
): Promise<BotCreateResult> {
  if (presetId !== undefined) {
    const presets = createModelPresetStore({
      rootDir: join(dshHome, 'botharness'),
      database: owner,
    });
    const preset = presets.get(presetId);
    if (preset === undefined) {
      throw new CliFailure('unknown-preset', `Unknown model preset: ${presetId}`, 1, steps, {
        id: slug,
        name: record.displayName,
      });
    }
    const minted = { id: slug, name: record.displayName };
    assertKnownProvider(preset.orchestrator.provider, { steps, bot: minted });
    assertKnownProvider(preset.assignmentDefault.provider, { steps, bot: minted });
    const applied = registry.applyModelPreset(slug, preset);
    if (!applied.ok) {
      throw new CliFailure('unknown-preset', `Unknown model preset: ${presetId}`, 1, steps, {
        id: slug,
        name: record.displayName,
      });
    }
    steps.push({ name: 'model', status: 'ok', detail: `Applied model preset "${preset.name}".` });
  } else {
    steps.push({
      name: 'model',
      status: 'deferred',
      code: 'no-model-yet',
      detail: 'No model preset applied; authorize a model in Bot-mode Settings.',
    });
  }
  const dataDir =
    registry.memoryDirFor(slug) ?? join(dshHome, 'botharness', 'bots', slug, 'memory');
  const channelId = dmChannelId(slug);
  const deferred = steps.some((step) => step.code === 'no-model-yet');
  return {
    bot: { id: slug, name: record.displayName },
    dm: { channelId },
    dataDir,
    steps,
    next: nextActions(channelId, record.displayName, slug, deferred),
  };
}

function runList(
  values: CreateValues,
  io: BotCreateCliIo,
): { bots: Array<{ id: string; name: string; createdAt: string }> } {
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    return {
      bots: registry.list().map((record) => ({
        id: record.slug,
        name: record.displayName,
        createdAt: record.createdAt,
      })),
    };
  } finally {
    owner.close();
  }
}

function runShow(id: string, values: CreateValues, io: BotCreateCliIo): BotCreateResult {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('show needs a bot id.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = registry.get(slug);
    if (record === undefined) {
      throw new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1);
    }
    const channelId = dmChannelId(slug);
    return {
      bot: { id: slug, name: record.displayName },
      dm: { channelId },
      dataDir: registry.memoryDirFor(slug) ?? join(dshHome, 'botharness', 'bots', slug, 'memory'),
      steps: [{ name: 'show', status: 'ok' }],
      next: nextActions(
        channelId,
        record.displayName,
        slug,
        record.modelPlan === undefined && record.model === undefined,
      ),
    };
  } finally {
    owner.close();
  }
}

function modelStore(dshHome: string, owner: OperationalDatabaseOwner) {
  return createModelPresetStore({ rootDir: join(dshHome, 'botharness'), database: owner });
}

function runModelPresets(values: CreateValues, io: BotCreateCliIo): { presets: ModelPreset[] } {
  const dshHome = resolveHome(values, io);
  const { owner } = openRegistry(dshHome);
  try {
    return { presets: modelStore(dshHome, owner).list() };
  } finally {
    owner.close();
  }
}

function parseRoute(values: CreateValues, prefix: 'orchestrator' | 'assignment'): ModelRoute {
  const provider = trimmed(values[`${prefix}-provider`]);
  const model = trimmed(values[`${prefix}-model`]);
  const effort = trimmed(values[`${prefix}-effort`]);
  if (provider === undefined || model === undefined) {
    throw usageError(`--${prefix}-provider and --${prefix}-model are required.`);
  }
  return { provider, model, ...(effort === undefined ? {} : { reasoningEffort: effort }) };
}

function runModelPresetCreate(values: CreateValues, io: BotCreateCliIo): { preset: ModelPreset } {
  const name = trimmed(values.name);
  if (name === undefined) throw usageError('--name is required for a model preset.');
  const orchestrator = parseRoute(values, 'orchestrator');
  const assignmentDefault = parseRoute(values, 'assignment');
  assertKnownProvider(orchestrator.provider);
  assertKnownProvider(assignmentDefault.provider);
  const dshHome = resolveHome(values, io);
  const { owner } = openRegistry(dshHome);
  try {
    try {
      const preset = modelStore(dshHome, owner).create({ name, orchestrator, assignmentDefault });
      io.stderr(`deepseekbot: created model preset ${preset.id} ("${preset.name}")`);
      return { preset };
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        throw new CliFailure('duplicate-preset', `Model preset already exists: ${name}`, 1);
      }
      throw new CliFailure(
        'invalid-input',
        error instanceof Error ? error.message : 'The model preset could not be created.',
        1,
      );
    }
  } finally {
    owner.close();
  }
}

function runModelPresetApply(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; plan: PersonaBotModelPlan | null } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('model-preset-apply needs exactly one bot id.');
  const presetId = trimmed(values.preset);
  if (presetId === undefined) throw usageError('--preset is required to apply a model preset.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = registry.get(slug);
    if (record === undefined) throw new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1);
    const preset = modelStore(dshHome, owner).get(presetId);
    if (preset === undefined) {
      throw new CliFailure('unknown-preset', `Unknown model preset: ${presetId}`, 1);
    }
    assertKnownProvider(preset.orchestrator.provider);
    assertKnownProvider(preset.assignmentDefault.provider);
    const applied = registry.applyModelPreset(slug, preset);
    if (!applied.ok) {
      throw new CliFailure('unknown-preset', `Unknown model preset: ${presetId}`, 1);
    }
    io.stderr(`deepseekbot: applied model preset "${preset.name}" to ${slug}`);
    return {
      bot: { id: slug, name: applied.record.displayName },
      plan: applied.record.modelPlan ?? null,
    };
  } finally {
    owner.close();
  }
}

function runModelPlan(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): {
  bot: { id: string; name: string };
  plan: PersonaBotModelPlan | null;
  revision: number;
  readiness: { status: 'deferred'; code: string; detail: string };
} {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('model-plan needs exactly one bot id.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = registry.get(slug);
    if (record === undefined) throw new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1);
    return {
      bot: { id: slug, name: record.displayName },
      plan: record.modelPlan ?? null,
      revision: record.modelPlan?.revision ?? record.modelPlanRevision ?? 0,
      readiness: {
        status: 'deferred',
        code: 'host-only',
        detail: 'Model readiness inspection needs a running Host.',
      },
    };
  } finally {
    owner.close();
  }
}

export async function runBotCreateCli(
  argv: readonly string[],
  io: BotCreateCliIo,
): Promise<number> {
  const readStdin = io.readStdin ?? (async () => '');
  try {
    rejectSecretArgv(argv);
    const { values, positionals } = parseArgs({
      args: [...argv],
      options: CREATE_OPTIONS,
      allowPositionals: true,
      strict: true,
    });
    const [command, ...rest] = positionals;
    if (values.help === true || command === undefined || command === 'help') {
      io.stdout(BOT_CREATE_HELP.trimEnd());
      return 0;
    }
    if (command === 'list') {
      if (rest.length > 0) throw usageError('list takes no bot id.');
      io.stdout(JSON.stringify(runList(values, io), null, 2));
      return 0;
    }
    if (command === 'show') {
      if (rest.length !== 1) throw usageError('show needs exactly one bot id.');
      io.stdout(JSON.stringify(runShow(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'model-presets') {
      if (rest.length > 0) throw usageError('model-presets takes no bot id.');
      io.stdout(JSON.stringify(runModelPresets(values, io), null, 2));
      return 0;
    }
    if (command === 'model-preset-create') {
      if (rest.length > 0) throw usageError('model-preset-create takes no positional arguments.');
      io.stdout(JSON.stringify(runModelPresetCreate(values, io), null, 2));
      return 0;
    }
    if (command === 'model-preset-apply') {
      if (rest.length !== 1) throw usageError('model-preset-apply needs exactly one bot id.');
      io.stdout(JSON.stringify(runModelPresetApply(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'model-plan') {
      if (rest.length !== 1) throw usageError('model-plan needs exactly one bot id.');
      io.stdout(JSON.stringify(runModelPlan(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command !== 'create') throw usageError('Unknown command.');
    if (rest.length > 0) throw usageError('create takes no positional arguments.');
    const startedAt = performance.now();
    const result = await runCreate(values, io, readStdin);
    io.stdout(JSON.stringify(result, null, 2));
    io.stderr(
      `deepseekbot: created ${result.bot.id} ("${result.bot.name}") in ${Math.round(performance.now() - startedAt)}ms`,
    );
    return 0;
  } catch (error) {
    if (error instanceof CliFailure) {
      const failure: BotCreateFailure = {
        error: { code: error.code, message: error.message },
        ...(error.steps.length === 0 ? {} : { steps: error.steps }),
        ...(error.bot === undefined ? {} : { bot: error.bot }),
      };
      io.stdout(JSON.stringify(failure, null, 2));
      io.stderr(`deepseekbot: ${error.message}`);
      return error.exitCode;
    }
    if (
      error instanceof TypeError &&
      'code' in error &&
      String(error.code).startsWith('ERR_PARSE_ARGS')
    ) {
      const failure: BotCreateFailure = {
        error: {
          code: 'usage',
          message: `${error.message} Run deepseekbot create --help for usage.`,
        },
      };
      io.stdout(JSON.stringify(failure, null, 2));
      io.stderr(`deepseekbot: ${error.message}`);
      return 2;
    }
    const failure: BotCreateFailure = {
      error: { code: 'internal-error', message: 'The command failed before producing a result.' },
    };
    io.stdout(JSON.stringify(failure, null, 2));
    io.stderr(`deepseekbot: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
