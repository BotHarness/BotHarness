interface BrowserKey {
  readonly key: string;
  readonly code: string;
  readonly windowsVirtualKeyCode: number;
  readonly text?: string;
}

const NAMED_KEYS: Readonly<Record<string, number>> = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Escape: 27,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Insert: 45,
  Delete: 46,
};

const PUNCTUATION: readonly [string, string, number][] = [
  [';:', 'Semicolon', 186],
  ['=+', 'Equal', 187],
  [',<', 'Comma', 188],
  ['-_', 'Minus', 189],
  ['.>', 'Period', 190],
  ['/?', 'Slash', 191],
  ['`~', 'Backquote', 192],
  ['[{', 'BracketLeft', 219],
  ['\\|', 'Backslash', 220],
  [']}', 'BracketRight', 221],
  ['\'"', 'Quote', 222],
];

export function browserKey(input: string): BrowserKey {
  const named = Object.hasOwn(NAMED_KEYS, input) ? NAMED_KEYS[input] : undefined;
  if (named !== undefined) {
    return {
      key: input,
      code: input,
      windowsVirtualKeyCode: named,
      ...(input === 'Enter' ? { text: '\r' } : {}),
    };
  }
  if (/^F(?:[1-9]|1[0-2])$/.test(input)) {
    return { key: input, code: input, windowsVirtualKeyCode: 111 + Number(input.slice(1)) };
  }
  if (input === 'Space' || input === ' ') {
    return { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' };
  }
  if (/^[a-z]$/i.test(input)) {
    const upper = input.toUpperCase();
    return {
      key: input,
      code: `Key${upper}`,
      windowsVirtualKeyCode: upper.charCodeAt(0),
      text: input,
    };
  }
  if (/^[0-9]$/.test(input)) {
    return {
      key: input,
      code: `Digit${input}`,
      windowsVirtualKeyCode: input.charCodeAt(0),
      text: input,
    };
  }
  const shiftedDigit = '!@#$%^&*()'.indexOf(input);
  if (input.length === 1 && shiftedDigit >= 0) {
    const digit = String((shiftedDigit + 1) % 10);
    return {
      key: input,
      code: `Digit${digit}`,
      windowsVirtualKeyCode: digit.charCodeAt(0),
      text: input,
    };
  }
  const punctuation =
    input.length === 1 ? PUNCTUATION.find(([keys]) => keys.includes(input)) : undefined;
  if (punctuation) {
    return { key: input, code: punctuation[1], windowsVirtualKeyCode: punctuation[2], text: input };
  }
  throw new Error(
    'Unsupported browser key; use Enter, Tab, Escape, Backspace, Delete, Arrow keys, Home, End, PageUp, PageDown, Insert, F1–F12, Space or one printable ASCII character. Key chords are not supported',
  );
}
