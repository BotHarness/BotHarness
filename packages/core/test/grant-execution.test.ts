import { describe, expect, it, vi } from 'vitest';

import {
  grantExecutionDenial,
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
  const core = {
    ownership: { resolve },
    runtime: {
      getAssignment: vi.fn(() => ({
        permission: { grantId, workspaceId: 'workspace-1', primaryCwd: cwd },
      })),
    },
    grants: { requireActive },
    registry: { memoryDirFor: vi.fn(() => '/tmp/memory') },
  } as never;
  const resolvePolicy = vi.fn(() => ({ mode: 'workspace-write' }));
  const policy = { resolve: resolvePolicy } as never;
  const approval = { overrideOf: vi.fn(() => 'ask') } as never;
  const assignment = { id: assignmentSessionId, header: { cwd } } as never;
  return { core, policy, approval, assignment, requireActive, resolvePolicy };
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
    ).toMatch(/workspace-write/);
  });

  it('denies per-tool sandbox escalation even when standing policy remains safe', () => {
    const state = fixture();
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, {
        command: 'touch /outside',
        sandbox_permissions: 'danger-full-access',
        justification: 'retry',
      }),
    ).toMatch(/cannot request sandbox permission escalation/);
    expect(
      grantToolExecutionDenial(state.core, state.assignment, state.policy, state.approval, {
        command: 'pwd',
      }),
    ).toBeUndefined();
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
      grantToolExecutionDenial(state.core, ordinary, state.policy, state.approval, {
        sandbox_permissions: 'danger-full-access',
      }),
    ).toBeUndefined();
  });
});
