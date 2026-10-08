export type TutorialAction = 'start' | 'pause' | 'skip' | 'continue' | 'restart';
export interface OnboardingSnapshot {
  profileId: string;
  tutorial: 'not-started' | 'active' | 'paused' | 'skipped';
  completed: boolean;
  defaultBotSlug?: string;
  channelId?: string;
  preparation: 'requested' | 'ready';
}
