import { forwardRef, type InputHTMLAttributes, type ReactElement } from 'react';

/**
 * Native WorkspaceBrowser rename field: the shipped dialog uses a plain
 * `<input>` with a feature-local class (not the primitives `Input`), and that
 * class owns the whole box model. Attributes pass through untouched.
 */
export const NameInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function NameInput({ className, ...rest }, ref): ReactElement {
    return (
      <input
        ref={ref}
        className={className === undefined ? 'bh-name-input' : `bh-name-input ${className}`}
        {...rest}
      />
    );
  },
);
