import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { nativeFileToolDenial } from '../src/workspaces/grant-native-tools.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bh-native-grant-'));
  roots.push(root);
  const memory = join(root, 'memory');
  const project = join(root, 'project');
  const outside = join(root, 'outside');
  for (const path of [memory, project, outside]) mkdirSync(path);
  writeFileSync(join(memory, 'memory.txt'), 'memory');
  writeFileSync(join(project, 'project.txt'), 'project');
  writeFileSync(join(outside, 'secret.txt'), 'secret');
  symlinkSync(outside, join(project, 'escape'));
  symlinkSync(join(outside, 'not-yet-created.txt'), join(project, 'dangling'));

  let oldActive = true;
  let newActive = false;
  const oldGrant = {
    id: 'old-grant',
    botSlug: 'ada',
    workspaceId: 'project',
    workspacePath: project,
    workspaceTitle: 'project',
    createdAt: '2026-01-01T00:00:00Z',
  };
  const newGrant = { ...oldGrant, id: 'new-grant', createdAt: '2026-01-02T00:00:00Z' };
  const requireActive = vi.fn((_botSlug: string, grantId: string) => {
    if (grantId === oldGrant.id && oldActive) return oldGrant;
    if (grantId === newGrant.id && newActive) return newGrant;
    throw new Error('Workspace Grant is missing or revoked');
  });
  const core = {
    ownership: {
      resolve: (sessionId: string) => {
        if (sessionId === 'orch') return { sessionId, botSlug: 'ada', rootRole: 'orchestrator' };
        if (sessionId === 'old' || sessionId === 'new') {
          return { sessionId, botSlug: 'ada', rootRole: 'assignment' };
        }
        return undefined;
      },
    },
    registry: { memoryDirFor: () => memory },
    grants: {
      list: () => [
        { ...oldGrant, ...(oldActive ? {} : { revokedAt: '2026-01-03T00:00:00Z' }) },
        ...(newActive ? [newGrant] : []),
      ],
      requireActive,
    },
    runtime: {
      getAssignment: (_botSlug: string, sessionId: string) => ({
        permission: {
          grantId: sessionId === 'new' ? newGrant.id : oldGrant.id,
          workspaceId: 'project',
          primaryCwd: project,
        },
      }),
    },
  } as never;
  const orchestrator = { id: 'orch', header: { cwd: memory } } as never;
  const oldAssignment = { id: 'old', header: { cwd: project } } as never;
  const newAssignment = { id: 'new', header: { cwd: project } } as never;
  const gate = (session: typeof orchestrator, name: string, args: unknown) =>
    nativeFileToolDenial(core, session, name, args);
  return {
    memory,
    project,
    outside,
    orchestrator,
    oldAssignment,
    newAssignment,
    gate,
    revoke: () => {
      oldActive = false;
    },
    reauthorize: () => {
      newActive = true;
    },
  };
}

describe('Grant policy for native DSH file tools', () => {
  it('lets Orchestrator read Memory and active Grants but write only Memory', () => {
    const f = fixture();
    expect(f.gate(f.orchestrator, 'read', { file_path: 'memory.txt' })).toBeUndefined();
    expect(
      f.gate(f.orchestrator, 'read', { file_path: join(f.project, 'project.txt') }),
    ).toBeUndefined();
    expect(f.gate(f.orchestrator, 'read', { file_path: join(f.outside, 'secret.txt') })).toMatch(
      /outside/,
    );
    expect(
      f.gate(f.orchestrator, 'write', { file_path: 'new.txt', content: 'remembered' }),
    ).toBeUndefined();
    expect(f.gate(f.orchestrator, 'edit', { file_path: join(f.project, 'project.txt') })).toMatch(
      /outside/,
    );
    expect(readFileSync(join(f.project, 'project.txt'), 'utf8')).toBe('project');
  });

  it('checks native reads, edits, images, and searches against traversal and symlinks', () => {
    const f = fixture();
    expect(f.gate(f.oldAssignment, 'read', { file_path: 'project.txt' })).toBeUndefined();
    expect(f.gate(f.oldAssignment, 'read_image', { file_path: 'project.txt' })).toBeUndefined();
    expect(f.gate(f.oldAssignment, 'glob', { pattern: '*', path: '.' })).toBeUndefined();
    expect(f.gate(f.oldAssignment, 'grep', { pattern: 'x', path: '.' })).toBeUndefined();
    expect(
      f.gate(f.oldAssignment, 'str_replace_editor', { command: 'view', path: 'project.txt' }),
    ).toBeUndefined();
    expect(
      f.gate(f.oldAssignment, 'str_replace_editor', { command: 'create', path: 'new.txt' }),
    ).toBeUndefined();
    for (const path of ['../outside/secret.txt', 'escape/secret.txt', 'dangling']) {
      expect(f.gate(f.oldAssignment, 'read', { file_path: path })).toMatch(/outside|resolved/);
    }
    expect(f.gate(f.oldAssignment, 'write', { file_path: 'escape/new.txt' })).toMatch(/outside/);
    expect(f.gate(f.oldAssignment, 'write', { file_path: join(f.memory, 'memory.txt') })).toMatch(
      /outside/,
    );
    expect(f.gate(f.oldAssignment, 'read', {})).toMatch(/valid native file path/);
  });

  it('revocation blocks future native calls and a new Grant cannot revive an old Assignment', () => {
    const f = fixture();
    f.revoke();
    expect(f.gate(f.orchestrator, 'read', { file_path: join(f.project, 'project.txt') })).toMatch(
      /outside/,
    );
    expect(f.gate(f.oldAssignment, 'read', { file_path: 'project.txt' })).toMatch(/outside/);
    expect(f.gate(f.oldAssignment, 'write', { file_path: 'project.txt' })).toMatch(/outside/);
    expect(f.gate(f.orchestrator, 'read', { file_path: 'memory.txt' })).toBeUndefined();
    f.reauthorize();
    expect(f.gate(f.oldAssignment, 'read', { file_path: 'project.txt' })).toMatch(/outside/);
    expect(f.gate(f.newAssignment, 'read', { file_path: 'project.txt' })).toBeUndefined();
    expect(
      f.gate(f.orchestrator, 'read', { file_path: join(f.project, 'project.txt') }),
    ).toBeUndefined();
  });
});
