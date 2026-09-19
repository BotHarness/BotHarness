import type { ReactNode } from 'react';

import { Modal as PrimitiveModal } from '@deepseek-ai/dsh-client-ui-primitives';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * The primitives package resolves its own declaration imports against a second
 * `@types/react` copy (19.x) while this package compiles with React 18 types,
 * so `Modal`'s `ReactPortal` return type is not a valid JSX element here
 * (TS2786). The runtime component is the shipped native one; this re-export
 * restates only the call signature the shell contract uses.
 */
export const Modal = PrimitiveModal as unknown as (props: ModalProps) => ReactNode;
