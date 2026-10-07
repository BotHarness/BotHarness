import {
  act,
  createElement,
  forwardRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
} from 'react';

export function comboboxPrimitives() {
  return {
    Input: (props: InputHTMLAttributes<HTMLInputElement>) =>
      createElement('span', null, createElement('input', props)),
    IconChevronDownOutlineRegular: () => null,
    MenuSurface: forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { compact?: boolean }>(
      ({ compact: _compact, ...props }, ref) => createElement('div', { ...props, ref }),
    ),
    useAnchoredPosition: () => ({ top: 0, left: 0 }),
    useDismissOnOutsidePointer: () => undefined,
  };
}

export function combobox(label: string, root: ParentNode = document): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>(
    `input[role="combobox"][aria-label="${label}"]`,
  );
  if (input === null) throw new Error(`No combobox labelled ${label}`);
  return input;
}

export function comboboxOption(value: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (option) => option.dataset.value === value,
  );
}

export async function openCombobox(label: string, root: ParentNode = document): Promise<void> {
  const input = combobox(label, root);
  await act(async () => input.click());
}

export async function chooseOption(
  label: string,
  value: string,
  root: ParentNode = document,
): Promise<void> {
  await openCombobox(label, root);
  const option = comboboxOption(value);
  if (option === undefined) throw new Error(`No option ${value} in ${label}`);
  await act(async () => option.click());
}
