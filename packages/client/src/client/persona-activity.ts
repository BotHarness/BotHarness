import { normalizePersonaBotActivity, type PersonaBotActivityState } from './avatar.js';
import type { BotSummary, ClientState } from './store.js';

/**
 * Resolve one PersonaBot's current presentation only from the mirrored Host
 * projection. Local selection and sending state are deliberately not a second
 * PersonaBot activity authority.
 */
export function personaBotActivity(
  _state: Pick<ClientState, 'selection' | 'conversation'>,
  bot: Pick<BotSummary, 'slug' | 'aggregateState'>,
): PersonaBotActivityState {
  return normalizePersonaBotActivity(bot.aggregateState);
}
