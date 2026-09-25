/**
 * The BotHarness settings section's child slot: one seat per optional feature
 * package that owns BotHarness-adjacent settings. The section itself declares
 * the slot (it owns the page) and the feature registers its rows into it, so
 * `@botharness/ui` never depends on the Computer being installed.
 */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One row group contributed to the BotHarness settings page. Registrants
     * draw their own rows, including any heading, through their own inject
     * face and settings scope.
     */
    'botharness.settings.item': {
      kind: 'list';
      scope: 'root';
      owner: BotHarnessSettingsItemOwnerProps;
    };
  }
}

/** Owner share of a BotHarness settings row (the section supplies nothing). */
export interface BotHarnessSettingsItemOwnerProps {
  /** Marker field: item owner props are intentionally empty. */
  children?: never;
}
