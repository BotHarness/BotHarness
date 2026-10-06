import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { TelemetryExceptionEntry, TelemetryService, TelemetryStackFrame } from './service.js';

export const PENDING_EXCEPTIONS_FILE = 'telemetry-exceptions.json';

const MAX_FRAMES = 50;
const MAX_PENDING = 10;
const MAX_TEXT = 300;
const TYPE = /^[A-Za-z_$][\w$.]{0,63}$/u;
const FRAME_LINE = /^\s*at\s/u;
const FRAME_WITH_FUNCTION = /^\s*at (.+?) \((.*)\)$/u;
const FRAME_LOCATION = /^\s*at (.*)$/u;
const LOCATION = /^(.*):(\d+):(\d+)$/u;
const USER_DIRECTORY = /(?:\/(?:Users|home)\/|[A-Za-z]:\\+Users\\+)[^/\\:)\s]+/gu;

type Mechanism = TelemetryExceptionEntry['mechanism']['type'];

interface PendingException {
  at: string;
  exception: TelemetryExceptionEntry;
}

export interface ExceptionCaptureProcess {
  on(
    event: 'uncaughtExceptionMonitor',
    listener: (error: unknown, origin: string) => void,
  ): unknown;
  off(
    event: 'uncaughtExceptionMonitor',
    listener: (error: unknown, origin: string) => void,
  ): unknown;
  prependListener(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  listenerCount(event: 'unhandledRejection'): number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function scrubHomePaths(text: string, home: string = homedir()): string {
  let result = text;
  const trimmed = home.replace(/[\\/]+$/u, '');
  if (trimmed.length > 1) {
    const variants = new Set([
      trimmed,
      trimmed.replace(/\\/gu, '/'),
      pathToFileURL(trimmed).pathname,
      encodeURI(trimmed.replace(/\\/gu, '/')),
    ]);
    for (const variant of [...variants].sort((left, right) => right.length - left.length)) {
      result = result.replace(new RegExp(escapeRegExp(variant), 'gu'), '~');
    }
  }
  return result.replace(USER_DIRECTORY, '~').slice(0, MAX_TEXT);
}

function exceptionType(error: unknown): string {
  if (!(error instanceof Error)) return 'NonError';
  if (TYPE.test(error.name)) return error.name;
  const constructorName = (error as { constructor?: { name?: unknown } }).constructor?.name;
  return typeof constructorName === 'string' && TYPE.test(constructorName)
    ? constructorName
    : 'Error';
}

function stackLines(error: unknown): string[] {
  if (!(error instanceof Error) || typeof error.stack !== 'string') return [];
  const lines = error.stack.split('\n');
  const frames: string[] = [];
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    if (!FRAME_LINE.test(line)) break;
    frames.unshift(line);
  }
  return frames.slice(0, MAX_FRAMES);
}

export function pluginRoot(start: string = dirname(fileURLToPath(import.meta.url))): string {
  let directory = start;
  while (!existsSync(join(directory, 'package.json'))) {
    const parent = dirname(directory);
    if (parent === directory) return start;
    directory = parent;
  }
  return directory;
}

function normalizedPath(location: string): string {
  let path = location;
  if (path.startsWith('file:')) {
    try {
      path = fileURLToPath(path);
    } catch {
      path = path.slice('file:'.length);
    }
  }
  return path.replace(/\\/gu, '/');
}

function packagePath(path: string): string | undefined {
  const index = path.lastIndexOf('node_modules/');
  return index === -1 ? undefined : path.slice(index + 'node_modules/'.length);
}

function belongsToBotHarness(path: string, ownRoots: readonly string[]): boolean {
  const relative = packagePath(path);
  if (relative !== undefined)
    return relative.startsWith('@botharness/') || relative.startsWith('deepseekbot/');
  return ownRoots.some((root) => {
    const prefix = `${root.replace(/\\/gu, '/').replace(/\/+$/u, '')}/`;
    return prefix.length > 1 && path.startsWith(prefix);
  });
}

function reducedFilename(path: string, home: string): string {
  if (path.startsWith('node:')) return scrubHomePaths(path, home);
  const relative = packagePath(path);
  if (relative !== undefined) return scrubHomePaths(relative, home);
  const base = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  return scrubHomePaths(base, home);
}

function parseFrame(line: string, home: string, ownRoots: readonly string[]): TelemetryStackFrame {
  const named = FRAME_WITH_FUNCTION.exec(line);
  const fn = named?.[1] ?? '<anonymous>';
  const location = named?.[2] ?? FRAME_LOCATION.exec(line)?.[1] ?? '';
  const position = LOCATION.exec(location);
  const path = normalizedPath(position?.[1] ?? location);
  const filename = reducedFilename(path, home);
  return {
    platform: 'node:javascript',
    function: scrubHomePaths(fn, home),
    filename,
    abs_path: filename,
    ...(position === null ? {} : { lineno: Number(position[2]), colno: Number(position[3]) }),
    in_app: belongsToBotHarness(path, ownRoots),
  };
}

export function sanitizeException(
  error: unknown,
  mechanism: Mechanism,
  options: { home?: string; ownRoots?: readonly string[] } = {},
): TelemetryExceptionEntry | undefined {
  const home = options.home ?? homedir();
  const ownRoots = options.ownRoots ?? [pluginRoot()];
  const frames = stackLines(error).map((line) => parseFrame(line, home, ownRoots));
  if (!frames.some((frame) => frame.in_app)) return undefined;
  return {
    type: exceptionType(error),
    mechanism: { type: mechanism, handled: false },
    stacktrace: { type: 'raw', frames: frames.reverse() },
  };
}

function pendingFile(dataDir: string): string {
  return join(dataDir, PENDING_EXCEPTIONS_FILE);
}

function isPending(value: unknown): value is PendingException {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  const exception = entry['exception'] as Record<string, unknown> | undefined;
  return (
    typeof entry['at'] === 'string' &&
    !Number.isNaN(new Date(entry['at']).getTime()) &&
    typeof exception === 'object' &&
    exception !== null &&
    typeof exception['type'] === 'string' &&
    TYPE.test(exception['type']) &&
    typeof exception['stacktrace'] === 'object' &&
    exception['stacktrace'] !== null
  );
}

function readPending(dataDir: string): PendingException[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(pendingFile(dataDir), 'utf8'));
    return Array.isArray(parsed) ? parsed.filter(isPending) : [];
  } catch {
    return [];
  }
}

export function recordPendingException(
  dataDir: string,
  exception: TelemetryExceptionEntry,
  at: Date,
): void {
  try {
    const pending = [...readPending(dataDir), { at: at.toISOString(), exception }].slice(
      -MAX_PENDING,
    );
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(pendingFile(dataDir), `${JSON.stringify(pending)}\n`, { mode: 0o600 });
  } catch {
    return;
  }
}

export function deliverPendingExceptions(
  telemetry: Pick<TelemetryService, 'enabled' | 'captureException'>,
  dataDir: string,
): number {
  const pending = telemetry.enabled ? readPending(dataDir) : [];
  try {
    rmSync(pendingFile(dataDir), { force: true });
  } catch {
    return 0;
  }
  for (const entry of pending) telemetry.captureException(entry.exception, new Date(entry.at));
  return pending.length;
}

export function installExceptionCapture(options: {
  dataDir: string;
  proc?: ExceptionCaptureProcess;
  home?: string;
  ownRoots?: readonly string[];
  now?: () => Date;
}): () => void {
  const proc = options.proc ?? process;
  const now = options.now ?? (() => new Date());
  const sanitize = {
    ...(options.home === undefined ? {} : { home: options.home }),
    ownRoots: options.ownRoots ?? [pluginRoot()],
  };
  const record = (error: unknown, mechanism: Mechanism): void => {
    try {
      const exception = sanitizeException(error, mechanism, sanitize);
      if (exception !== undefined) recordPendingException(options.dataDir, exception, now());
    } catch {
      return;
    }
  };
  const onMonitor = (error: unknown, origin: string): void => {
    record(error, origin === 'unhandledRejection' ? 'onunhandledrejection' : 'onuncaughtexception');
  };
  const onRejection = (reason: unknown): void => {
    record(reason, 'onunhandledrejection');
  };
  proc.on('uncaughtExceptionMonitor', onMonitor);
  const observeRejections = proc.listenerCount('unhandledRejection') > 0;
  if (observeRejections) proc.prependListener('unhandledRejection', onRejection);
  return () => {
    proc.off('uncaughtExceptionMonitor', onMonitor);
    if (observeRejections) proc.off('unhandledRejection', onRejection);
  };
}
