/**
 * Runtime-editable Computer configuration, shared by the Host settings
 * registration and the browser scope. Kept free of schemastery so the client
 * bundle pulls only constants and types.
 */

/** Settings namespace owning the Computer's runtime-editable fields. */
export const COMPUTER_SETTINGS_NAMESPACE = 'botharness-computer';

/** Field carrying the directory that holds Computer exports. */
export const COMPUTER_EXPORT_DIR_FIELD = 'exportDir';

/** Field carrying the idle stop minutes. */
export const COMPUTER_IDLE_STOP_FIELD = 'idleStopMinutes';

/** The subset of Computer configuration a Human may change without a restart. */
export interface ComputerSettings {
  /** Directory that holds Computer exports; empty disables export/import. */
  exportDir: string;
  /** Minutes without viewers before the Computer stops itself. */
  idleStopMinutes: number;
}
