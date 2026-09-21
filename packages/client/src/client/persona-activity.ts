import { normalizePersonaBotActivity, type PersonaBotActivityState } from './avatar.js';
import type { BotSummary, ClientState } from './store.js';

/**
 * Resolve one PersonaBot's current presentation from the mirrored Host
 * projection, with the in-flight DM request as a short-lived local bridge
 * until the next Host activity revision arrives.
 */
export function personaBotActivity(
  state: Pick<ClientState, 'selection' | 'conversation'>,
  bot: Pick<BotSummary, 'slug' | 'aggregateState'>,
): PersonaBotActivityState {
  const projected = normalizePersonaBotActivity(bot.aggregateState);
  if (projected !== 'idle') return projected;
  return state.selection?.kind === 'bot' &&
    state.selection.slug === bot.slug &&
    state.conversation.sending
    ? 'working'
    : 'idle';
}
