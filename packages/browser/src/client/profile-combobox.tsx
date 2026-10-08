import type { ReactElement } from 'react';

import { Combobox } from '../../../client/src/client/combobox.js';
import type { BrowserTranslate } from './locale.js';

export function ProfileCombobox({
  value,
  profiles,
  disabled,
  invalid,
  errorId,
  onSelect,
  t,
}: {
  readonly value: string;
  readonly profiles: readonly string[];
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly errorId: string;
  readonly onSelect: (name: string) => void;
  readonly t: BrowserTranslate;
}): ReactElement {
  const names = [...new Set(['default', ...profiles, value === '' ? 'default' : value])];
  return (
    <Combobox
      className="bh-browser-profile-combobox"
      value={value}
      options={names.map((name) => ({ value: name, label: name }))}
      onSelect={onSelect}
      label={t('entry.profile.label')}
      toggleLabel={t('entry.profile.choose')}
      disabled={disabled}
      invalid={invalid}
      errorId={errorId}
      fallbackValue="default"
      createLabel={(name) => t('entry.profile.create', { name })}
    />
  );
}
