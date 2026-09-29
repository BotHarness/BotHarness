import { forwardRef, type InputHTMLAttributes, type ReactElement } from 'react';

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
