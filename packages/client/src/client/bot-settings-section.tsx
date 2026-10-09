import type { ReactElement } from 'react';

import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';

export type BotSettingsSectionProps = PropsRuntime<'settings.section'> &
  PropsLocale<'botharness'> &
  InjectFace<{ openBotSettings(): void }>;

export function BotSettingsSection({
  close,
  openBotSettings,
  t,
}: BotSettingsSectionProps): ReactElement {
  return (
    <div className="bh-settings-rows">
      <div className="bh-settings-row">
        <div className="bh-settings-row-text">
          <div className="bh-settings-row-desc">{t('settings.moved')}</div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            close();
            openBotSettings();
          }}
        >
          {t('settings.open')}
        </Button>
      </div>
    </div>
  );
}
