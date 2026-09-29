export type ChannelSidebarMode = 'dock' | 'overlay' | 'hidden';

export const NARROW_CHANNEL_SIDEBAR_QUERY = '(max-width: 960px)';

export function resolveChannelSidebarMode(input: {
  narrow: boolean;
  docked: boolean;
  overlayOpen: boolean;
}): ChannelSidebarMode {
  if (input.narrow) return input.overlayOpen ? 'overlay' : 'hidden';
  return input.docked ? 'dock' : 'hidden';
}
