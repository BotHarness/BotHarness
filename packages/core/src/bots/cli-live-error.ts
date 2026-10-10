export class CliLiveError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly receipt?: { channelId: string; messageId: string },
    readonly authorization?: { attemptId: string },
  ) {
    super(message);
  }
}
