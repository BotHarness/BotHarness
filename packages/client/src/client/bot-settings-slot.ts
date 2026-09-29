declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'botharness.settings.item': {
      kind: 'list';
      scope: 'root';
      owner: BotHarnessSettingsItemOwnerProps;
    };
  }
}

export interface BotHarnessSettingsItemOwnerProps {
  children?: never;
}
