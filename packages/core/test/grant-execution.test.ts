import { describe, expect, it, vi } from 'vitest';

import {
  grantExecutionDenial,
  grantToolExecutionDenial,
  requiresHumanToolApproval,
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
  const core = {
    ownership: { resolve },
    runtime: { getAssignment },
    grants: { requireActive },
    registry: { memoryDirFor: vi.fn(() => '/tmp/memory') },
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
  };
}

describe('Workspace Grant execution boundary', () => {
  it('treats Host-checked Bot DM contact tools as internal Messaging tools', () => {
    expect(requiresHumanToolApproval('list_bot_contacts')).toBe(false);
    expect(requiresHumanToolApproval('channel_list')).toBe(false);
    for (const tool of [
      'group_create',
      'group_invite_bot',
      'group_invite_respond',
      'group_rename',
      'group_remove_member',
    ])
      expect(requiresHumanToolApproval(tool)).toBe(false);
    expect(requiresHumanToolApproval('bot_dm_send')).toBe(false);
  });

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
