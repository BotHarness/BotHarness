import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  grantExecutionDenial,
  isSafeMemoryDirectoryListing,
  grantToolExecutionDenial,
} from '../src/workspaces/grant-execution.js';

const botSlug = 'ada';
const assignmentSessionId = 'botharness-assignment';
const grantId = 'grant-1';
const cwd = '/tmp/grant-workspace';

function fixture() {
  const resolve = vi.fn((sessionId: string) =>
    sessionId === assignmentSessionId
      ? { sessionId, botSlug, rootRole: 'assignment', parentSessionId: undefined }
      : sessionId === 'botharness-orchestrator'
        ? { sessionId, botSlug, rootRole: 'orchestrator', parentSessionId: undefined }
        : undefined,
  );
  const requireActive = vi.fn(() => ({
    id: grantId,
    workspaceId: 'workspace-1',
    workspacePath: cwd,
  }));
  const getAssignment = vi.fn(() => ({
    permission: {
      grantId,
      workspaceId: 'workspace-1',
      primaryCwd: cwd,
      mode: 'workspace-write',
      approval: 'ask',
      presetRevision: 0,
    },
  }));
  const overrideOf = vi.fn(() => 'ask');
  const memoryDirFor = vi.fn(() => '/tmp/memory');
  const core = {
    ownership: { resolve },
    runtime: { getAssignment },
    grants: { requireActive },
    registry: { memoryDirFor },
  } as never;
  const resolvePolicy = vi.fn(() => ({ mode: 'workspace-write' }));
  const policy = { resolve: resolvePolicy } as never;
  const approval = { overrideOf } as never;
  const assignment = { id: assignmentSessionId, header: { cwd } } as never;
  return {
    core,
    policy,
    approval,
    assignment,
    requireActive,
    resolvePolicy,
    getAssignment,
    overrideOf,
    memoryDirFor,
  };
}

describe('Workspace Grant execution boundary', () => {
  it('allows a valid Assignment and rejects native resume after revoke', () => {
    const state = fixture();
    expect(
      grantExecutionDenial(state.core, state.assignment, state.policy, state.approval),
    ).toBeUndefined();
    state.requireActive.mockImplementation(() => {
      throw new Error('revoked');
    });
    expect(
      grantExecutionDenial(state.core, state.assignment, state.policy, state.approval),
    ).toMatch(/revoked/);
  });

  it('denies a mid-step native danger mode switch before a tool body', () => {
    const state = fixture();
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    expect(
      grantExecutionDenial(state.core, state.assignment, state.policy, state.approval),
    ).toMatch(/mode differs/);
  });

  it('honors an immutable dangerous Assignment snapshot but still checks its Grant', () => {
    const state = fixture();
    state.getAssignment.mockReturnValue({
      permission: {
        grantId,
        workspaceId: 'workspace-1',
        primaryCwd: cwd,
        mode: 'danger-full-access',
        approval: 'never',
        presetRevision: 1,
      },
    });
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    state.overrideOf.mockReturnValue('never');
    expect(
      grantExecutionDenial(state.core, state.assignment, state.policy, state.approval),
    ).toBeUndefined();
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, 'read', {
        file_path: '/outside/secret.txt',
      }),
    ).toBeUndefined();
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, 'bash', {
        command: 'pwd',
      }),
    ).toBeUndefined();
    state.requireActive.mockImplementation(() => {
      throw new Error('revoked');
    });
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, 'bash', {
        command: 'pwd',
      }),
    ).toMatch(/revoked/);
  });

  it('lets an Orchestrator list its own Memory directory without a Human approval', () => {
    const state = fixture();
    const memory = mkdtempSync(join(tmpdir(), 'botharness-memory-listing-'));
    state.memoryDirFor.mockReturnValue(memory);
    const orchestrator = { id: 'botharness-orchestrator', header: { cwd: memory } } as never;
    const allowed = { command: 'ls -la', description: 'List memory repository contents' };
    try {
      expect(isSafeMemoryDirectoryListing(state.core, orchestrator, 'bash', allowed)).toBe(true);
      expect(
        grantToolExecutionDenial(
          state.core,
          orchestrator,
          state.policy,
          state.approval,
          'bash',
          allowed,
        ),
      ).toBeUndefined();
      for (const args of [
        { command: 'ls -la /tmp' },
        { command: 'ls -la; cat /etc/passwd' },
        { command: 'ls -la', workdir: '/tmp' },
        { command: 'ls -la', run_in_background: true },
      ]) {
        expect(isSafeMemoryDirectoryListing(state.core, orchestrator, 'bash', args)).toBe(false);
        expect(
          grantToolExecutionDenial(
            state.core,
            orchestrator,
            state.policy,
            state.approval,
            'bash',
            args,
          ),
        ).toMatch(/unconfined native tool/);
      }
      const assignment = { id: assignmentSessionId, header: { cwd: memory } } as never;
      expect(isSafeMemoryDirectoryListing(state.core, assignment, 'bash', allowed)).toBe(false);
      const redirected = join(tmpdir(), 'botharness-memory-redirect-' + Date.now());
      symlinkSync(memory, redirected);
      try {
        state.memoryDirFor.mockReturnValue(redirected);
        const symlinked = { id: 'botharness-orchestrator', header: { cwd: redirected } } as never;
        expect(isSafeMemoryDirectoryListing(state.core, symlinked, 'bash', allowed)).toBe(false);
      } finally {
        rmSync(redirected);
      }
    } finally {
      rmSync(memory, { recursive: true, force: true });
    }
  });

  it('lets only the Orchestrator reach the native Human-question answerer', () => {
    const state = fixture();
    const orchestrator = { id: 'botharness-orchestrator', header: { cwd: '/tmp/memory' } } as never;
    expect(
      grantToolExecutionDenial(
        state.core,
        orchestrator,
        state.policy,
        state.approval,
        'ask_user_question',
        {},
      ),
    ).toBeUndefined();
    expect(
      grantToolExecutionDenial(
        state.core,
        state.assignment,
        state.policy,
        state.approval,
        'ask_user_question',
        {},
      ),
    ).toMatch(/Orchestrator/);
  });

  it('denies per-tool sandbox escalation even when standing policy remains safe', () => {
    const state = fixture();
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, 'bash', {
        command: 'touch /outside',
        sandbox_permissions: 'danger-full-access',
        justification: 'retry',
      }),
    ).toMatch(/cannot request sandbox permission escalation/);
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, 'bash', {
        command: 'pwd',
      }),
    ).toMatch(/unconfined native tool/);
    expect(
      grantToolExecutionDenial(
        state.core,
        state.assignment,
        state.policy,
        state.approval,
        'bash',
        { command: 'pwd' },
        true,
      ),
    ).toBeUndefined();
    state.requireActive.mockImplementation(() => {
      throw new Error('revoked');
    });
    expect(
      grantToolExecutionDenial(
        state.core,
        state.assignment,
        state.policy,
        state.approval,
        'bash',
        { command: 'pwd' },
        true,
      ),
    ).toMatch(/revoked/);
  });
  it('keeps DSH native file tools and denies unconfined execution capabilities', () => {
    const state = fixture();
    for (const name of ['bash', 'terminal', 'run_code', 'create_subagent']) {
      expect(
        grantToolExecutionDenial(
          state.core,
          state.assignment,
          state.policy,
          state.approval,
          name,
          {},
        ),
      ).toMatch(/unconfined native tool/);
    }
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, 'read', {
        file_path: 'missing.txt',
      }),
    ).toMatch(/cannot be resolved|outside/);
  });
  it('fails closed if a BotHarness-created Session loses its durable owner', () => {
    const state = fixture();
    const orphaned = { id: 'botharness-orphaned', header: { cwd } } as never;
    expect(grantExecutionDenial(state.core, orphaned, state.policy, state.approval)).toMatch(
      /no durable owner/,
    );
  });
  it('fails closed for an unclaimed native fork of an owned Session', () => {
    const state = fixture();
    const fork = {
      id: 'native-fork-id',
      header: { cwd, parentSession: assignmentSessionId },
    } as never;
    expect(grantExecutionDenial(state.core, fork, state.policy, state.approval)).toMatch(
      /no durable owner/,
    );
  });
  it('denies a native Orchestrator mode switch and ignores unrelated DSH sessions', () => {
    const state = fixture();
    state.resolvePolicy.mockReturnValue({ mode: 'danger-full-access' });
    const orchestrator = { id: 'botharness-orchestrator', header: { cwd: '/tmp/memory' } } as never;
    expect(grantExecutionDenial(state.core, orchestrator, state.policy, state.approval)).toMatch(
      /workspace-write/,
    );
    const ordinary = { id: 'native-dsh', header: { cwd } } as never;
    expect(
      grantExecutionDenial(state.core, ordinary, state.policy, state.approval),
    ).toBeUndefined();
    expect(
      grantToolExecutionDenial(state.core, ordinary, state.policy, state.approval, 'bash', {
        sandbox_permissions: 'danger-full-access',
      }),
    ).toBeUndefined();
  });
});
