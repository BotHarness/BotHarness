import type { ReactElement } from 'react';

export function LoadingSkeleton({
  kind,
  label,
}: {
  kind: 'roster' | 'messages' | 'sidebar';
  label: string;
}): ReactElement {
  const rows = kind === 'messages' ? 4 : 3;
  return (
    <div className={`bh-skeleton bh-skeleton-${kind}`} role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div className="bh-skeleton-row" aria-hidden="true" key={index}>
          {kind !== 'sidebar' ? <span className="bh-skeleton-avatar" /> : null}
          <span className="bh-skeleton-lines">
            <span className="bh-skeleton-line" />
            <span className="bh-skeleton-line bh-skeleton-line-short" />
          </span>
        </div>
      ))}
    </div>
  );
}
