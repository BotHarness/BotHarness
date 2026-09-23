/** Web keymap: Ctrl/Command+digits belong to browser tabs, so channels use Alt. */
export function webChannelShortcutIndex(
  code: string,
  keys: {
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    altGraph?: boolean;
    composing?: boolean;
    repeat?: boolean;
    prevented?: boolean;
  },
): number | undefined {
  if (
    !keys.alt ||
    keys.ctrl ||
    keys.meta ||
    keys.shift ||
    keys.altGraph ||
    keys.composing ||
    keys.repeat ||
    keys.prevented
  ) {
    return undefined;
  }
  const match = /^Digit([0-9])$/u.exec(code);
  if (match === null) return undefined;
  return match[1] === '0' ? 9 : Number(match[1]) - 1;
}

export function webChannelShortcutLabel(index: number): string | undefined {
  if (!Number.isInteger(index) || index < 0 || index > 9) return undefined;
  return `Alt+${index === 9 ? 0 : index + 1}`;
}

/** The physical key left of Digit1 toggles the Bot panel while Alt is held. */
export function webBotModeShortcut(
  code: string,
  keys: {
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    altGraph?: boolean;
    composing?: boolean;
    repeat?: boolean;
    prevented?: boolean;
  },
): boolean {
  return (
    code === 'Backquote' &&
    keys.alt &&
    !keys.ctrl &&
    !keys.meta &&
    !keys.shift &&
    !keys.altGraph &&
    !keys.composing &&
    !keys.repeat &&
    !keys.prevented
  );
}
