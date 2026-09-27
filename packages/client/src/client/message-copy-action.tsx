import { useEffect, useRef, useState, type ReactElement } from 'react';

import {
  IconCheckOutlineRegular,
  IconCopyOutlineRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BotHarnessTranslate } from './locale.js';

const COPY_SUCCESS_MS = 2_000;

export function MessageCopyAction({
  body,
  t,
}: {
  body: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const [copiedBody, setCopiedBody] = useState<string | undefined>(undefined);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempt = useRef(0);

  useEffect(() => {
    setCopiedBody(undefined);
    return () => {
      attempt.current += 1;
      if (resetTimer.current !== undefined) clearTimeout(resetTimer.current);
      resetTimer.current = undefined;
    };
  }, [body]);

  const copy = async () => {
    const currentAttempt = ++attempt.current;
    if (resetTimer.current !== undefined) clearTimeout(resetTimer.current);
    resetTimer.current = undefined;
    setCopiedBody(undefined);
    if (navigator.clipboard?.writeText === undefined) return;

    try {
      await navigator.clipboard.writeText(body);
      if (currentAttempt !== attempt.current) return;
      setCopiedBody(body);
      resetTimer.current = setTimeout(() => {
        setCopiedBody(undefined);
        resetTimer.current = undefined;
      }, COPY_SUCCESS_MS);
    } catch {
      // A denied clipboard write must never display success or reject the click handler.
    }
  };

  const copied = copiedBody === body;
  const label = t(copied ? 'message.copied' : 'message.copy');
  return (
    <Tooltip label={label} side="top" portal delayMs={400}>
      <button
        type="button"
        className="bh-bubble-action"
        aria-label={label}
        onClick={() => {
          void copy();
        }}
      >
        {copied ? <IconCheckOutlineRegular size={16} /> : <IconCopyOutlineRegular size={16} />}
      </button>
    </Tooltip>
  );
}
