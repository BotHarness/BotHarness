import { randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

export interface WorkspaceGrant {
  id: string;
  botSlug: string;
  workspaceId: string;
  workspacePath: string;
  workspaceTitle: string;
  createdAt: string;
  revokedAt?: string;
}

export interface AssignmentPermissionSnapshot {
  grantId: string;
  workspaceId: string;
  primaryCwd: string;
  mode: 'workspace-write';
  approval: 'ask';
  presetRevision: 0;
}

export interface DshWorkspace {
  id: string;
  path: string;
  title: string;
  status(): Promise<'ok' | 'missing-dir'>;
}
export interface DshWorkspaceLookup {
  get(id: string): DshWorkspace | undefined;
  list(): DshWorkspace[];
}
export class WorkspaceGrantError extends Error {
  constructor(readonly code: 'unknown-workspace' | 'unavailable-workspace' | 'invalid-grant', message: string) {
    super(message);
    this.name = 'WorkspaceGrantError';
  }
}
export interface WorkspaceGrantStore {
  list(botSlug: string): WorkspaceGrant[];
  create(botSlug: string, workspaceId: string): Promise<WorkspaceGrant>;
  revoke(botSlug: string, grantId: string): WorkspaceGrant;
  requireActive(botSlug: string, grantId: string): WorkspaceGrant;
  availableWorkspaces(): { id: string; path: string; title: string }[];
}

interface GrantRow {
  id: string;
  bot_slug: string;
  workspace_id: string;
  workspace_path: string;
  workspace_title: string;
  created_at: string;
  revoked_at: string | null;
}
function toRecord(row: GrantRow): WorkspaceGrant {
  return {
    id: row.id,
    botSlug: row.bot_slug,
    workspaceId: row.workspace_id,
    workspacePath: row.workspace_path,
    workspaceTitle: row.workspace_title,
    createdAt: row.created_at,
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
  };
}
function isCurrentDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory() && realpathSync(path) === path;
  } catch {
    return false;
  }
}
export function createWorkspaceGrantStore(options: {
  database: OperationalDatabaseModulePort;
  workspaces: () => DshWorkspaceLookup | undefined;
  now?: () => Date;
  createId?: () => string;
}): WorkspaceGrantStore {
  const { database, workspaces } = options;
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  const lookup = (): DshWorkspaceLookup => {
    const current = workspaces();
    if (current === undefined) {
      throw new WorkspaceGrantError('unavailable-workspace', 'DSH Workspace registry is unavailable');
    }
    return current;
  };
  const read = (botSlug: string, grantId: string): WorkspaceGrant | undefined => {
    const row = database.read((connection) =>
      connection.prepare('SELECT * FROM workspace_grants WHERE bot_slug = ? AND id = ?')
        .get(botSlug, grantId),
    ) as GrantRow | undefined;
    return row === undefined ? undefined : toRecord(row);
  };
  return {
    list(botSlug) {
      const rows = database.read((connection) =>
        connection.prepare('SELECT * FROM workspace_grants WHERE bot_slug = ? ORDER BY created_at DESC, id')
          .all(botSlug),
      ) as unknown as GrantRow[];
      return rows.map(toRecord);
    },
    async create(botSlug, workspaceId) {
      const workspace = lookup().get(workspaceId);
      if (workspace === undefined) {
        throw new WorkspaceGrantError('unknown-workspace', 'Unknown DSH Workspace: ' + workspaceId);
      }
      if ((await workspace.status()) !== 'ok' || !isCurrentDirectory(workspace.path)) {
        throw new WorkspaceGrantError('unavailable-workspace', 'DSH Workspace is unavailable: ' + workspaceId);
      }
      const at = now().toISOString();
      const row = database.transaction((connection) => {
        const existing = connection.prepare(
          'SELECT * FROM workspace_grants WHERE bot_slug = ? AND workspace_id = ? AND revoked_at IS NULL',
        ).get(botSlug, workspaceId) as unknown as GrantRow | undefined;
        if (existing !== undefined) return existing;
        const id = createId();
        connection.prepare(
          'INSERT INTO workspace_grants (id, bot_slug, workspace_id, workspace_path, workspace_title, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(id, botSlug, workspaceId, workspace.path, workspace.title, at);
        return connection.prepare('SELECT * FROM workspace_grants WHERE id = ?').get(id) as unknown as GrantRow;
      }, ['workspace-grants']);
      return toRecord(row);
    },
    revoke(botSlug, grantId) {
      const at = now().toISOString();
      const row = database.transaction((connection) => {
        connection.prepare(
          'UPDATE workspace_grants SET revoked_at = COALESCE(revoked_at, ?) WHERE bot_slug = ? AND id = ?',
        ).run(at, botSlug, grantId);
        return connection.prepare('SELECT * FROM workspace_grants WHERE bot_slug = ? AND id = ?')
          .get(botSlug, grantId) as GrantRow | undefined;
      }, ['workspace-grants']);
      if (row === undefined) {
        throw new WorkspaceGrantError('invalid-grant', 'Unknown Workspace Grant: ' + grantId);
      }
      return toRecord(row);
    },
    requireActive(botSlug, grantId) {
      const grant = read(botSlug, grantId);
      if (grant === undefined || grant.revokedAt !== undefined) {
        throw new WorkspaceGrantError('invalid-grant', 'Workspace Grant is missing or revoked: ' + grantId);
      }
      const workspace = lookup().get(grant.workspaceId);
      if (workspace === undefined || workspace.path !== grant.workspacePath || !isCurrentDirectory(workspace.path)) {
        throw new WorkspaceGrantError('unavailable-workspace', 'Workspace Grant target is unavailable: ' + grantId);
      }
      return grant;
    },
    availableWorkspaces() {
      return lookup().list().map(({ id, path, title }) => ({ id, path, title }));
    },
  };
}
