export type ViewerKey =
  | 'entry.live'
  | 'entry.noScreen'
  | 'entry.connecting'
  | 'entry.reconnecting'
  | 'entry.reconnect'
  | 'entry.openFullscreen'
  | 'entry.collapseFullscreen'
  | 'entry.interactive.disable'
  | 'entry.interactive.enable'
  | 'entry.watchOnly'
  | 'entry.stop'
  | 'entry.stopping';

export type ViewerTranslate = (key: ViewerKey) => string;
