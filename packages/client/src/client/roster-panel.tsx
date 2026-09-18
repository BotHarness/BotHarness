import { useEffect, useState, type ReactElement } from 'react';

export interface RosterPanelFace {
  list(query?: string): Promise<unknown>;
}

interface BotRow {
  slug: string;
  displayName: string;
  aggregateState: string;
}

type PanelState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; bots: BotRow[] };

function parseBots(value: unknown): BotRow[] {
  const bots = (value as { bots?: unknown }).bots;
  if (!Array.isArray(bots)) return [];
  return bots.flatMap((entry) => {
    const record = entry as { slug?: unknown; displayName?: unknown; aggregateState?: unknown };
    if (typeof record.slug !== 'string' || typeof record.displayName !== 'string') return [];
    return [
      {
        slug: record.slug,
        displayName: record.displayName,
        aggregateState: typeof record.aggregateState === 'string' ? record.aggregateState : 'idle',
      },
    ];
  });
}

export function RosterPanel({ list }: RosterPanelFace): ReactElement {
  const [state, setState] = useState<PanelState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    list()
      .then((value) => {
        if (!cancelled) setState({ status: 'ready', bots: parseBots(value) });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [list]);

  if (state.status === 'loading') return <div>正在加载 PersonaBot 名册…</div>;
  if (state.status === 'error') return <div>名册加载失败：{state.message}</div>;
  if (state.bots.length === 0) return <div>还没有 PersonaBot。创建向导尚未接入。</div>;

  return (
    <ul>
      {state.bots.map((bot) => (
        <li key={bot.slug}>
          {bot.displayName}（{bot.slug}）· {bot.aggregateState}
        </li>
      ))}
    </ul>
  );
}
