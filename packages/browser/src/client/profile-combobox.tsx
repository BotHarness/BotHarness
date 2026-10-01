import { useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import {
  IconChevronDownOutlineRegular,
  Input,
  MenuSurface,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives';

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
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | undefined>(undefined);
  const [active, setActive] = useState<string | undefined>(undefined);
  const names = [...new Set(['default', ...profiles, value === '' ? 'default' : value])];
  const trimmed = query?.trim() ?? '';
  const matches = names.filter((name) => name.toLowerCase().includes(trimmed.toLowerCase()));
  const options = matches.map((name) => ({ name, label: name }));
  if (trimmed !== '' && !names.includes(trimmed)) {
    options.push({ name: trimmed, label: t('entry.profile.create', { name: trimmed }) });
  }
  const highlighted = options.findIndex((option) => option.name === active);
  const position = useAnchoredPosition({
    open,
    anchorRef: root,
    panelRef: panel,
    gap: 4,
    margin: 12,
  });
  useDismissOnOutsidePointer(root, open, setOpen, panel);

  const dismiss = (): void => {
    setOpen(false);
    setQuery(undefined);
    setActive(undefined);
  };
  const select = (name: string): void => {
    dismiss();
    onSelect(name);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      const index =
        highlighted < 0
          ? offset === 1
            ? 0
            : options.length - 1
          : (highlighted + offset + options.length) % options.length;
      setActive(options[index]?.name);
      document.getElementById(`${listId}-${index}`)?.scrollIntoView?.({ block: 'nearest' });
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      const choice =
        options[highlighted]?.name ??
        (query === undefined ? (value === '' ? 'default' : value) : trimmed || 'default');
      select(choice);
    }
  };

  return (
    <div className="bh-browser-profile-combobox" ref={root}>
      <Input
        className="bh-browser-profile-input"
        role="combobox"
        aria-label={t('entry.profile.label')}
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        value={query ?? (value === '' ? 'default' : value)}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(undefined);
          setOpen(true);
        }}
        onBlur={dismiss}
        onKeyDown={onKeyDown}
      />
      <button
        className="bh-browser-profile-toggle"
        type="button"
        aria-label={t('entry.profile.choose')}
        disabled={disabled}
        tabIndex={-1}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          if (open) dismiss();
          else {
            root.current?.querySelector('input')?.focus();
            setOpen(true);
          }
        }}
      >
        <IconChevronDownOutlineRegular size={16} />
      </button>
      {open && !disabled
        ? createPortal(
            <MenuSurface
              compact
              ref={panel}
              id={listId}
              role="listbox"
              aria-label={t('entry.profile.label')}
              className="bh-browser-profiles"
              style={{
                ...position,
                width: root.current?.getBoundingClientRect().width ?? 200,
                visibility: position === null ? 'hidden' : undefined,
              }}
            >
              {options.map((option, index) => (
                <button
                  key={option.name}
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={option.name === (value === '' ? 'default' : value)}
                  data-active={index === highlighted || undefined}
                  tabIndex={-1}
                  onPointerDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(option.name)}
                  onClick={() => select(option.name)}
                >
                  {option.label}
                </button>
              ))}
            </MenuSurface>,
            document.body,
          )
        : null}
    </div>
  );
}
