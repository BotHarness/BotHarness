import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { Blobatar } from './avatar.js';
import { StateDistributionChart } from './bot-chart.js';
import { useClientState } from './bot-sidebar.js';
import {
  needsYou,
  STATE_COLORS,
  STATE_LABELS,
  STATE_ORDER,
  toBotState,
  type BotState,
} from './labels.js';
import { store, type BotSummary, type ClientState } from './store.js';

const EVENT_FILTERS: readonly { key: 'all' | 'unread' | 'need'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' },
  { key: 'need', label: '需要你' },
];

function countStates(bots: readonly BotSummary[]): Record<BotState, number> {
  const counts: Record<BotState, number> = {
    thinking: 0,
    working: 0,
    waiting: 0,
    blocked: 0,
    idle: 0,
  };
  for (const bot of bots) counts[toBotState(bot.aggregateState)] += 1;
  return counts;
}

function workspaceCount(bots: readonly BotSummary[]): number {
  const paths = new Set<string>();
  for (const bot of bots) {
    for (const workspace of bot.workspaces) paths.add(workspace.replace(/[\\/]+$/, ''));
  }
  return paths.size;
}

function Kpi({ num, label, warn }: { num: number; label: string; warn?: boolean }): ReactElement {
  return (
    <div className={`bh-kpi${warn === true ? ' bh-warn' : ''}`}>
      <div className="bh-num">{num}</div>
      <div className="bh-lbl">{label}</div>
    </div>
  );
}

function Dashboard({ state }: { state: ClientState }): ReactElement {
  const counts = useMemo(() => countStates(state.bots), [state.bots]);
  const attention = state.bots.filter((bot) => needsYou(toBotState(bot.aggregateState))).length;
  return (
    <div className="bh-root bh-main">
      <div className="bh-topbar">
        <span className="bh-title">Bot Dashboard</span>
        <span className="bh-pill">全体 PersonaBot 概况</span>
      </div>
      <div className="bh-content">
        <div className="bh-dash">
          <h2>概况</h2>
          <div className="bh-kpis">
            <Kpi num={state.bots.length} label="Bots" />
            <Kpi num={attention} label="需要你" warn={attention > 0} />
            <Kpi num={workspaceCount(state.bots)} label="Workspaces" />
            <Kpi num={0} label="Sessions" />
          </div>
          {state.status === 'loading' && state.bots.length === 0 ? (
            <div className="bh-note">正在加载 PersonaBots…</div>
          ) : null}
          {state.status === 'error' && state.error !== undefined ? (
            <div className="bh-error">名册加载失败：{state.error}</div>
          ) : null}
          {state.status === 'ready' && state.bots.length === 0 ? (
            <div className="bh-note">还没有 PersonaBot。创建向导尚未接入。</div>
          ) : null}
          {state.bots.length > 0 ? (
            <div className="bh-panel">
              <h3>
                Bot 状态分布 <span className="bh-sub">真实数据</span>
              </h3>
              <StateDistributionChart counts={counts} />
              <div className="bh-legend">
                {STATE_ORDER.map((state) => (
                  <span key={state}>
                    <span className="bh-sw" style={{ background: STATE_COLORS[state] }} />
                    {STATE_LABELS[state]}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="bh-panel">
            <h3>
              Inbox · 需要你处理 <span className="bh-sub">0 条</span>
            </h3>
            <div className="bh-inbox-empty">Inbox 上线后显示事件流</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BotView({ bot }: { bot: BotSummary }): ReactElement {
  const [filter, setFilter] = useState<'all' | 'unread' | 'need'>('all');
  const botState = toBotState(bot.aggregateState);
  return (
    <div className="bh-root bh-main">
      <div className="bh-topbar">
        <Blobatar seed={bot.slug} size={22} />
        <span className="bh-title">{bot.displayName}</span>
        {bot.tag !== undefined ? <span className="bh-tag">{bot.tag}</span> : null}
        <span className="bh-pill">对话 + 事件流</span>
      </div>
      <div className="bh-content">
        <div className="bh-bot-view">
          <section className="bh-chat-pane">
            <div className="bh-chat-body">
              <div className="bh-placeholder">
                <Blobatar seed={bot.slug} size={72} />
                <div className="bh-big">DSH 会话视图</div>
                <div>委派会话接入后，在这里与 {bot.displayName} 对话</div>
                <div style={{ color: '#9ca3af' }}>记忆 / 审批入口后续接入</div>
              </div>
            </div>
            <div className="bh-composer">在 DSH 会话里回复 · 委派与记忆入口后续接入</div>
          </section>
          <aside className="bh-events-pane">
            <div className="bh-events-head">
              <h3>
                {bot.displayName} 的事件流 <span className="bh-dot" data-state={botState} />
              </h3>
              <div className="bh-filters">
                {EVENT_FILTERS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`bh-chip${filter === item.key ? ' bh-on' : ''}`}
                    onClick={() => setFilter(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="bh-events">
              <div className="bh-placeholder">
                <div className="bh-big">还没有事件</div>
                <div>Inbox 上线后显示事件流</div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function BotMain(): ReactElement {
  const state = useClientState();
  const selected =
    state.selectedSlug === undefined
      ? undefined
      : state.bots.find((bot) => bot.slug === state.selectedSlug);
  return selected === undefined ? <Dashboard state={state} /> : <BotView bot={selected} />;
}

export function BotPanel(): ReactElement {
  useEffect(() => {
    store.setMode('bot');
    return () => {
      store.setMode('dsh');
    };
  }, []);
  return <BotMain />;
}
