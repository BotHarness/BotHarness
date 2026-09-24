import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { Session } from '@deepseek-ai/dsh-session';

import type { BotHarnessCore } from '../plugin.js';

type GrantCore = Pick<BotHarnessCore, 'ownership' | 'runtime' | 'grants' | 'registry'>;
type AccessKind = 'read' | 'write';

export const NATIVE_FILE_TOOL_NAMES = new Set([
  'read',
  'read_image',
  'write',
  'edit',
  'str_replace_editor',
  'glob',
  'grep',
]);

function within(root: string, target: string): boolean {
  const tail = relative(root, target);
  return tail === '' || (tail !== '..' && !tail.startsWith('..' + sep) && !isAbsolute(tail));
}

/** A missing leaf may be created; its parent must already resolve inside a root. */
function canonicalTarget(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return undefined;
    try {
      // A dangling symlink must not be treated as an ordinary missing leaf.
      lstatSync(path);
      return undefined;
    } catch (leafError) {
      if ((leafError as NodeJS.ErrnoException).code !== 'ENOENT') return undefined;
    }
    try {
      return join(realpathSync(dirname(path)), basename(path));
    } catch {
      return undefined;
    }
  }
}

function currentRoots(core: GrantCore, session: Session, kind: AccessKind): string[] {
  let owner = core.ownership.resolve(session.id);
  if (owner === undefined) return [];
  const seen = new Set<string>();
  while (owner.parentSessionId !== undefined) {
    if (seen.has(owner.sessionId)) return [];
    seen.add(owner.sessionId);
    const parent = core.ownership.resolve(owner.parentSessionId);
    if (parent === undefined) return [];
    owner = parent;
  }
  if (owner.rootRole === 'orchestrator') {
    const memory = core.registry.memoryDirFor(owner.botSlug);
    if (memory === undefined) return [];
    if (kind === 'write') return [memory];
    const active = core.grants
      .list(owner.botSlug)
      .filter((grant) => grant.revokedAt === undefined)
      .flatMap((grant) => {
        try {
          return [core.grants.requireActive(owner.botSlug, grant.id).workspacePath];
        } catch {
          return [];
        }
      });
    return [memory, ...active];
  }
  if (owner.rootRole !== 'assignment') return [];
  const permission = core.runtime.getAssignment(owner.botSlug, owner.sessionId)?.permission;
  if (permission === undefined || permission.primaryCwd !== session.header.cwd) return [];
  try {
    const grant = core.grants.requireActive(owner.botSlug, permission.grantId);
    return grant.workspaceId === permission.workspaceId &&
      grant.workspacePath === permission.primaryCwd
      ? [grant.workspacePath]
      : [];
  } catch {
    return [];
  }
}

function nativePath(name: string, args: unknown): { path: string; kind: AccessKind } | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const input = args as Record<string, unknown>;
  if (name === 'glob' || name === 'grep') {
    return {
      path: typeof input.path === 'string' ? input.path : '.',
      kind: 'read',
    };
  }
  const path = name === 'str_replace_editor' ? input.path : input.file_path;
  if (typeof path !== 'string' || path.trim() === '') return undefined;
  if (name === 'str_replace_editor') {
    if (input.command === 'view') return { path, kind: 'read' };
    if (['create', 'str_replace', 'insert'].includes(String(input.command))) {
      return { path, kind: 'write' };
    }
    return undefined;
  }
  return { path, kind: name === 'write' || name === 'edit' ? 'write' : 'read' };
}

/** Synchronous final gate before an existing DSH file tool reaches its body. */
export function nativeFileToolDenial(
  core: GrantCore,
  session: Session,
  name: string,
  args: unknown,
): string | undefined {
  const request = nativePath(name, args);
  if (request === undefined) return 'BotHarness Session requires a valid native file path';
  const cwd = session.header.cwd;
  if (cwd === undefined) return 'BotHarness Session working directory is unavailable';
  const target = canonicalTarget(resolve(cwd, request.path));
  if (target === undefined) return 'BotHarness Session file path cannot be resolved';
  const roots = currentRoots(core, session, request.kind);
  for (const root of roots) {
    try {
      const canonicalRoot = realpathSync(root);
      // A replaced or redirected Grant root cannot silently change authority.
      if (canonicalRoot === resolve(root) && within(canonicalRoot, target)) return undefined;
    } catch {
      // Missing roots confer no access.
    }
  }
  return "Path is outside this Session's authorized workspace";
}
