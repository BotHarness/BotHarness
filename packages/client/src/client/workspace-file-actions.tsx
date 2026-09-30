import { useMemo, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { HostFileActionButton, type HostFileCommands } from './host-file-menu.js';

export type WorkspaceFileCommands = Pick<
  BridgeActions,
  'workspaceFileTarget' | 'workspaceFileApplications' | 'workspaceFileOpen'
>;

export function WorkspaceFileActionButton({
  actions,
  slug,
  grantId,
  text,
  t,
}: {
  actions: WorkspaceFileCommands;
  slug: string;
  grantId: string;
  text: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const commands = useMemo<HostFileCommands>(
    () => ({
      target: actions.workspaceFileTarget,
      applications: actions.workspaceFileApplications,
      open: actions.workspaceFileOpen,
    }),
    [actions],
  );
  return (
    <HostFileActionButton
      actions={commands}
      slug={slug}
      path={grantId}
      text={text}
      className="bh-workspace-folder-path"
      t={t}
    />
  );
}
