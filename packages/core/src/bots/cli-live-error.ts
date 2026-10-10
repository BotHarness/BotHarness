import type { BotCreateStep } from './bot-create-cli.js';

export class CliLiveError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly receipt?: { channelId: string; messageId: string },
    readonly authorization?: { attemptId: string },
    readonly creation?: {
      bot?: { id: string; name: string };
      steps: BotCreateStep[];
      outcome: 'created' | 'not-created' | 'unknown';
    },
  ) {
    super(message);
  }
}
