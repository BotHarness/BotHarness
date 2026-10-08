import type { CompanionCard } from './window-companion.js';
import { companionMessageIdentity } from '../../../core/src/companions/sources.js';

export function companionBabble(
  before: readonly CompanionCard[],
  after: readonly CompanionCard[],
): string | undefined {
  for (const card of [...after].reverse()) {
    const identity = companionMessageIdentity(card.channelId, card.messageId);
    const prior = before.find(
      (item) => companionMessageIdentity(item.channelId, item.messageId) === identity,
    );
    if (!prior || card.shown <= prior.shown) continue;
    const index = card.boundaries.indexOf(card.shown);
    const text = card.body.slice(card.boundaries[index - 1], card.shown);
    if (/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(text)) return text;
  }
  return;
}

interface Voice {
  botId: string;
  oscillator: OscillatorNode;
  gain: GainNode;
}

export class CompanionSound {
  private enabled = false;
  private context: AudioContext | undefined;
  private voices = new Set<Voice>();
  private lastAt = -Infinity;
  private lastByBot = new Map<string, number>();

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  unlock(): void {
    if (!this.enabled) return;
    try {
      this.context ??= typeof AudioContext === 'undefined' ? undefined : new AudioContext();
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined);
    } catch {}
  }

  play(botId: string, text: string): void {
    const context = this.context;
    if (!this.enabled || !context || context.state !== 'running') return;
    const now = context.currentTime;
    if (
      this.voices.size >= 2 ||
      now - this.lastAt < 0.03 ||
      now - (this.lastByBot.get(botId) ?? -Infinity) < 0.075
    )
      return;
    let oscillator: OscillatorNode | undefined;
    let gain: GainNode | undefined;
    try {
      oscillator = context.createOscillator();
      gain = context.createGain();
      const voice: Voice = { botId, oscillator, gain };
      let identity = 0;
      for (const character of botId) identity = (identity * 31 + character.codePointAt(0)!) >>> 0;
      const pitch = 170 + (identity % 7) * 16 + ((text.codePointAt(0) ?? 0) % 11) * 9;
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(pitch, now);
      oscillator.frequency.exponentialRampToValueAtTime(pitch * 0.88, now + 0.05);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.018, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => this.finish(voice);
      this.voices.add(voice);
      oscillator.start(now);
      oscillator.stop(now + 0.06);
      this.lastAt = now;
      this.lastByBot.set(botId, now);
    } catch {
      try {
        oscillator?.stop();
      } catch {}
      for (const voice of this.voices) {
        if (voice.oscillator === oscillator) {
          this.finish(voice);
          return;
        }
      }
      oscillator?.disconnect();
      gain?.disconnect();
    }
  }

  stop(botId?: string): void {
    for (const voice of [...this.voices]) {
      if (botId !== undefined && voice.botId !== botId) continue;
      try {
        voice.oscillator.stop();
      } catch {}
      this.finish(voice);
    }
    if (botId === undefined) {
      this.lastAt = -Infinity;
      this.lastByBot.clear();
    } else this.lastByBot.delete(botId);
  }

  private finish(voice: Voice): void {
    voice.oscillator.onended = null;
    voice.oscillator.disconnect();
    voice.gain.disconnect();
    this.voices.delete(voice);
  }

  dispose(): void {
    this.setEnabled(false);
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }
}
