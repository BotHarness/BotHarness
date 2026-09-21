/** Layout decisions for the Channel sidebar, kept free of React so tests stay pure. */

export type ChannelSidebarMode = 'dock' | 'overlay' | 'hidden';

/** Width below which the Channel sidebar hides behind an overlay control. */
export const NARROW_CHANNEL_SIDEBAR_QUERY = '(max-width: 960px)';

export function resolveChannelSidebarMode(input: {
  narrow: boolean;
  docked: boolean;
  overlayOpen: boolean;
}): ChannelSidebarMode {
  if (input.narrow) return input.overlayOpen ? 'overlay' : 'hidden';
  return input.docked ? 'dock' : 'hidden';
}
