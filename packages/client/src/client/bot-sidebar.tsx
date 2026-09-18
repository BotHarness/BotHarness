import { useSyncExternalStore, type ReactElement } from 'react';

import { Blobatar } from './avatar.js';
import { ChatIcon, DashboardIcon, PlusIcon, RobotIcon, SearchIcon } from './icons.js';
import { needsYou, STATE_LABELS, toBotState } from './labels.js';
import { store, type BotSummary, type ClientState } from './store.js';

export function useClientState(): ClientState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

function workspaceNames(bots: readonly BotSummary[]): string[] {
  const names = new Set<string>();
  for (const bot of bots) {
    for (const workspace of bot.workspaces) {
      const name = workspace
        .replace(/[\\/]+$/, '')
        .split(/[\\/]/)
        .pop();
      if (name !== undefined && name.length > 0) names.add(name);
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

export function BotSidebar({ wide }: { wide: boolean }): ReactElement {
  const state = useClientState();
  if (!wide) return <div className="bh-root bh-region bh-region-rail" />;

  const query = state.query.trim().toLowerCase();
  const bots = state.bots;
  const contacts = bots.filter(
    (bot) =>
      query.length === 0 ||
      bot.displayName.toLowerCase().includes(query) ||
      (bot.tag ?? '').toLowerCase().includes(query) ||
      bot.slug.includes(query),
  );
  const pinned = bots.slice(0, 4);
  const workspaces = workspaceNames(bots);
  const needsYouCount = bots.filter((bot) => needsYou(toBotState(bot.aggregateState))).length;

  return (
    <div className="bh-root bh-region">
      <div className="bh-search-row">
        <button
          type="button"
          className="bh-icon-btn"
          title="Dashboard"
          onClick={() => store.select(undefined)}
        >
          <DashboardIcon size={16} />
        </button>
        <label className="bh-search-box">
          <SearchIcon size={14} />
          <input
            type="search"
            placeholder="搜索 Bot"
            value={state.query}
            onChange={(event) => store.setQuery(event.target.value)}
          />
        </label>
        <button type="button" className="bh-icon-btn" title="新建 PersonaBot（尚未接入）">
          <PlusIcon size={16} />
        </button>
      </div>

      {state.status === 'loading' && bots.length === 0 ? (
        <div className="bh-note">正在加载 PersonaBots…</div>
      ) : null}
      {state.status === 'error' && state.error !== undefined ? (
        <div className="bh-error">名册加载失败：{state.error}</div>
      ) : null}
      {state.status === 'ready' && bots.length === 0 ? (
        <div className="bh-note">还没有 PersonaBot。创建向导尚未接入。</div>
      ) : null}

      {pinned.length > 0 ? (
        <div className="bh-pinned-grid">
          {pinned.map((bot) => {
            const botState = toBotState(bot.aggregateState);
            const selected = state.selectedSlug === bot.slug;
            return (
              <button
                key={bot.slug}
                type="button"
                className={`bh-pinned${selected ? ' bh-selected' : ''}`}
                onClick={() => store.select(bot.slug)}
              >
                <span className="bh-presence" data-state={botState} />
                <Blobatar seed={bot.slug} size={54} />
                <span className="bh-name">{bot.displayName}</span>
                {bot.tag !== undefined ? <span className="bh-tag">{bot.tag}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="bh-side-head">
        对话 <span className="bh-count">{contacts.length}</span>
      </div>
      {contacts.map((bot) => {
        const botState = toBotState(bot.aggregateState);
        const selected = state.selectedSlug === bot.slug;
        return (
          <button
            key={bot.slug}
            type="button"
            className={`bh-contact${selected ? ' bh-selected' : ''}`}
            onClick={() => store.select(bot.slug)}
          >
            <Blobatar seed={bot.slug} size={34} />
            <span className="bh-body">
              <span className="bh-top">
                <span className="bh-name">{bot.displayName}</span>
                {bot.tag !== undefined ? <span className="bh-tag">{bot.tag}</span> : null}
              </span>
              <span className="bh-msg">{bot.description ?? STATE_LABELS[botState]}</span>
            </span>
            {needsYou(botState) ? <span className="bh-unread" title="需要你" /> : null}
          </button>
        );
      })}
      {contacts.length === 0 && bots.length > 0 ? (
        <div className="bh-note">没有匹配的 Bot</div>
      ) : null}

      <div className="bh-side-head" style={{ marginTop: 8 }}>
        工作区 <span className="bh-count">{workspaces.length}</span>
        {needsYouCount > 0 ? (
          <span className="bh-count bh-warn">{needsYouCount} 需要你</span>
        ) : null}
      </div>
      {workspaces.length === 0 ? (
        <div className="bh-note">还没有绑定工作区</div>
      ) : (
        workspaces.map((name) => (
          <div className="bh-ws-row" key={name}>
            <span aria-hidden="true">📁</span>
            <span className="bh-name">{name}</span>
            <span className="bh-meta">0 个会话</span>
          </div>
        ))
      )}
    </div>
  );
}

export function BotModeToggle({
  wide,
  toggleMode,
}: {
  wide: boolean;
  toggleMode: () => void;
}): ReactElement {
  const mode = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().mode,
    () => 'dsh' as const,
  );
  const label = mode === 'bot' ? 'DSH 模式' : 'BOT 模式';
  return (
    <button type="button" className="bh-root bh-mode-switch" title={label} onClick={toggleMode}>
      {mode === 'bot' ? <ChatIcon size={15} /> : <RobotIcon size={15} />}
      {wide ? <span className="bh-grow">{label}</span> : null}
    </button>
  );
}
