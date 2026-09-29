export const COMPUTER_SETTINGS_NAMESPACE = 'botharness-computer';

export const COMPUTER_EXPORT_DIR_FIELD = 'exportDir';

export const COMPUTER_IDLE_STOP_FIELD = 'idleStopMinutes';

export const COMPUTER_AUTO_ALLOW_FIELD = 'autoAllowActions';

export interface ComputerSettings {
  exportDir: string;
  idleStopMinutes: number;
  autoAllowActions: boolean;
}
