import type { InputHTMLAttributes, ReactElement } from 'react';

/**
 * Native WorkspaceBrowser rename field: the shipped dialog uses a plain
 * `<input>` with a feature-local class (not the primitives `Input`), and that
 * class owns the whole box model. Attributes pass through untouched.
 */
export function NameInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>): ReactElement {
  return (
    <input
      className={className === undefined ? 'bh-name-input' : `bh-name-input ${className}`}
      {...rest}
    />
  );
}
