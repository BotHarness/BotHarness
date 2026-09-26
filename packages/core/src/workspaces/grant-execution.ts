import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Session } from '@deepseek-ai/dsh-session';
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy';
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval';

import type { BotHarnessCore } from '../plugin.js';
import { NATIVE_FILE_TOOL_NAMES, nativeFileToolDenial } from './grant-native-tools.js';

/** One Host-owned check used before both model steps and individual tool calls. */
export function grantExecutionDenial(
  core: Pick<BotHarnessCore, 'ownership' | 'runtime' | 'grants' | 'registry'>,
  session: Session,
  policy: SandboxPolicyService | undefined,
  approval: ApprovalService | undefined,
): string | undefined {
  let owner = core.ownership.resolve(session.id);
  if (owner === undefined) {
    const parent = session.header.parentSession;
    return session.id.startsWith('botharness-') ||
      (parent !== undefined && core.ownership.resolve(parent) !== undefined)
      ? 'BotHarness Session has no durable owner'
      : undefined;
  }
  const seen = new Set<string>();
  while (owner.parentSessionId !== undefined) {
    if (seen.has(owner.sessionId)) return 'BotHarness Session ownership is cyclic';
    seen.add(owner.sessionId);
    const parent = core.ownership.resolve(owner.parentSessionId);
    if (parent === undefined || parent.botSlug !== owner.botSlug) {
      return 'BotHarness Session parent ownership is missing or inconsistent';
    }
    owner = parent;
  }
  if (policy === undefined || approval === undefined) {
    return 'DSH permission services are unavailable for BotHarness Session';
  }
  const mode = policy.resolve({ session }).mode;
  const approvalPolicy = approval.overrideOf(session);
  if (owner.rootRole === 'orchestrator') {
    if (mode !== 'workspace-write' || approvalPolicy !== 'ask') {
      return 'Orchestrator Session requires workspace-write and ask';
    }
    const memoryCwd = core.registry.memoryDirFor(owner.botSlug);
    return memoryCwd !== undefined && session.header.cwd === memoryCwd
      ? undefined
      : 'Orchestrator Session requires its Memory working directory';
  }
  if (owner.rootRole !== 'assignment') return 'Unknown BotHarness Session role';
  const assignment = core.runtime.getAssignment(owner.botSlug, owner.sessionId);
  const permission = assignment?.permission;
  if (permission === undefined || session.header.cwd !== permission.primaryCwd) {
    return 'Assignment Session permission snapshot is missing or mismatched';
  }
  if (mode !== permission.mode || approvalPolicy !== permission.approval) {
    return 'Assignment Session permission mode differs from its snapshot';
  }
  try {
    const grant = core.grants.requireActive(owner.botSlug, permission.grantId);
    if (
      grant.workspaceId !== permission.workspaceId ||
      grant.workspacePath !== permission.primaryCwd
    ) {
      return 'Assignment Workspace Grant no longer matches its permission snapshot';
    }
  } catch {
    return 'Assignment Workspace Grant is missing, revoked, or unavailable';
  }
  return undefined;
}

const BOT_TOOL_NAMES = new Set([
  'create_assignment',
  'request_workspace_grant',
  'list_workspace_grants',
  'list_assignments',
  'inspect_assignment',
  'send_assignment_request',
  'stop_assignment',
  'channel_list',
  'channel_read',
  'inbox_ignore',
  'channel_read_image',
  'list_bot_contacts',
  'group_create',
  'group_invite_bot',
  'group_invite_respond',
  'group_join_request',
  'group_join_decide',
  'group_rename',
  'group_remove_member',
  'bot_dm_send',
  'channel_send',
  // Native DSH question transport does not access the filesystem.
  'ask_user_question',
  'memory_switch_branch',
  'memory_continue_from_commit',
  'report_to_orchestrator',
]);

export function requiresHumanToolApproval(name: string): boolean {
  return !BOT_TOOL_NAMES.has(name) && !NATIVE_FILE_TOOL_NAMES.has(name);
}

export function isSafeMemoryDirectoryListing(
  core: Pick<BotHarnessCore, 'ownership' | 'registry'>,
  session: Session,
  name: string,
  args: unknown,
): boolean {
  if (name !== 'bash' || typeof args !== 'object' || args === null) return false;
  const owner = core.ownership.resolve(session.id);
  if (owner?.rootRole !== 'orchestrator') return false;
  const memory = core.registry.memoryDirFor(owner.botSlug);
  if (memory === undefined || session.header.cwd !== memory) return false;
  try {
    if (realpathSync(memory) !== resolve(memory)) return false;
  } catch {
    return false;
  }
  const input = args as Record<string, unknown>;
  // Bash is otherwise opaque. Only a literal listing of the current Memory
  // directory is known to have no path escape or write effect.
  return (
    typeof input.command === 'string' &&
    /^(?:ls(?: -la)?|pwd)$/.test(input.command.trim()) &&
    (input.workdir === undefined || input.workdir === '.' || input.workdir === memory) &&
    input.run_in_background !== true &&
    input.sandbox_permissions === undefined &&
    input.justification === undefined
  );
}

/** The final DSH tool gate denies every unconfined native capability for Bot-owned Sessions. */
export function grantToolExecutionDenial(
  core: Pick<BotHarnessCore, 'ownership' | 'runtime' | 'grants' | 'registry'>,
  session: Session,
  policy: SandboxPolicyService | undefined,
  approval: ApprovalService | undefined,
  name: string,
  args: unknown,
  allowedOnce = false,
): string | undefined {
  const denial = grantExecutionDenial(core, session, policy, approval);
  if (denial !== undefined) return denial;
  if (core.ownership.resolve(session.id) === undefined) return undefined;
  if (typeof args === 'object' && args !== null && 'sandbox_permissions' in args) {
    return 'BotHarness Session cannot request sandbox permission escalation';
  }
  if (
    name === 'ask_user_question' &&
    core.ownership.resolve(session.id)?.rootRole !== 'orchestrator'
  )
    return 'Assignment questions must go through the Orchestrator';
  if (BOT_TOOL_NAMES.has(name)) return undefined;
  const owner = core.ownership.resolve(session.id);
  if (
    owner?.rootRole === 'assignment' &&
    core.runtime.getAssignment(owner.botSlug, owner.sessionId)?.permission?.mode ===
      'danger-full-access'
  )
    return undefined;
  if (NATIVE_FILE_TOOL_NAMES.has(name)) return nativeFileToolDenial(core, session, name, args);
  if (isSafeMemoryDirectoryListing(core, session, name, args)) return undefined;
  if (allowedOnce) return undefined;
  return 'BotHarness Session cannot run an unconfined native tool: ' + name;
}
