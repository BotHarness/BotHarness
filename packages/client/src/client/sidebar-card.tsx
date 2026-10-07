import type { ReactElement, ReactNode, Ref } from 'react';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';

export function SidebarCardList({
  label,
  className,
  listRef,
  children,
}: {
  label?: string | undefined;
  className?: string | undefined;
  listRef?: Ref<HTMLUListElement> | undefined;
  children: ReactNode;
}): ReactElement {
  return (
    <ul
      ref={listRef}
      className={className === undefined ? 'bh-card-list' : 'bh-card-list ' + className}
      aria-label={label}
    >
      {children}
    </ul>
  );
}

export interface SidebarCardRowProps {
  icon: string;
  iconLabel?: string | undefined;
  title: ReactNode;
  titleClassName?: string | undefined;
  hint?: string | undefined;
  chips?: ReactNode | undefined;
  meta?: ReactNode | undefined;
  trailing?: ReactNode | undefined;
  detail?: ReactNode | undefined;
  onClick?: () => void | undefined;
  disabled?: boolean | undefined;
  muted?: boolean | undefined;
  mainClassName?: string | undefined;
  dialog?: boolean | undefined;
  expanded?: boolean | undefined;
  controls?: string | undefined;
  state?: string | undefined;
  anchor?: string | undefined;
}

export function SidebarCardRow({
  icon,
  iconLabel,
  title,
  titleClassName,
  hint,
  chips,
  meta,
  trailing,
  detail,
  onClick,
  disabled,
  muted,
  mainClassName,
  dialog,
  expanded,
  controls,
  state,
  anchor,
}: SidebarCardRowProps): ReactElement {
  const body = (
    <>
      <span
        className="bh-card-icon"
        role={iconLabel === undefined ? undefined : 'img'}
        aria-label={iconLabel}
        title={iconLabel}
      >
        <ChannelSidebarIcon name={icon} size={16} />
      </span>
      <span className="bh-card-body">
        <span
          className={
            titleClassName === undefined ? 'bh-card-title' : 'bh-card-title ' + titleClassName
          }
        >
          {title}
        </span>
        {chips === undefined ? null : <span className="bh-card-chips">{chips}</span>}
        {meta === undefined ? null : <span className="bh-card-meta">{meta}</span>}
      </span>
    </>
  );
  const className = mainClassName === undefined ? 'bh-card-main' : 'bh-card-main ' + mainClassName;
  return (
    <li
      className="bh-card-row"
      data-muted={muted === true ? 'true' : undefined}
      data-state={state}
      data-anchor={anchor}
    >
      <div className="bh-card-line">
        {onClick === undefined ? (
          <div className={className} title={hint}>
            {body}
          </div>
        ) : (
          <button
            type="button"
            className={className}
            title={hint}
            disabled={disabled}
            aria-haspopup={dialog === true ? 'dialog' : undefined}
            aria-expanded={expanded}
            aria-controls={controls}
            onClick={onClick}
          >
            {body}
          </button>
        )}
        {trailing === undefined ? null : <span className="bh-card-trailing">{trailing}</span>}
      </div>
      {detail === undefined ? null : (
        <div id={controls} className="bh-card-detail">
          {detail}
        </div>
      )}
    </li>
  );
}
