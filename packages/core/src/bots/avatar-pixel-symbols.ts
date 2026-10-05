import type { PixelSymbol } from '@botharness/pixel-avatar';
import type { PersonaBotToolActivity } from '../state/tool-activity.js';

const BY_TOOL_NAME: Record<string, PixelSymbol> = {
  ask_user_question: 'ask',
  read: 'read',
  read_image: 'read',
  skill: 'read',
  write: 'write',
  edit: 'edit',
  str_replace_editor: 'edit',
  bash: 'bash',
  pwsh: 'bash',
  job_kill: 'bash',
  job_list: 'bash',
  job_output: 'bash',
  grep: 'search',
  glob: 'search',
  web_search: 'web',
  web_fetch: 'fetch',
  todo_write: 'todo',
  subagent: 'subagent',
  list_subagent_models: 'subagent',
  workflow: 'workflow',
  create_goal: 'goal',
  get_goal: 'goal',
  update_goal: 'goal',
  present: 'present',
};

const BY_TOOL_KIND: Record<string, PixelSymbol> = {
  read: 'read',
  edit: 'edit',
  delete: 'edit',
  move: 'edit',
  search: 'search',
  fetch: 'fetch',
  execute: 'bash',
};

export function pixelSymbolFor(
  state: string,
  activity: Pick<PersonaBotToolActivity, 'toolName' | 'toolKind'> | undefined,
  approvals: number,
): PixelSymbol | undefined {
  if (approvals > 0 && (state === 'working' || state === 'waiting')) return 'approval';
  if (state === 'thinking') return 'thinking';
  if (state !== 'working') return undefined;
  const name = activity?.toolName;
  if (name !== undefined && Object.hasOwn(BY_TOOL_NAME, name)) return BY_TOOL_NAME[name];
  const kind = activity?.toolKind;
  if (kind !== undefined && Object.hasOwn(BY_TOOL_KIND, kind)) return BY_TOOL_KIND[kind];
  return 'other';
}
