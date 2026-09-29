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

export const Modal = PrimitiveModal as unknown as (props: ModalProps) => ReactNode;
