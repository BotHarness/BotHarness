import type { CompanionCard } from './window-companion.js';
import { companionMessageIdentity } from '../../../core/src/companions/sources.js';
import type { CompanionInteraction } from './companion-motion.js';

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
  kind: 'speech' | 'interaction';
  source: AudioScheduledSourceNode;
  gain: GainNode;
  filter?: BiquadFilterNode;
}

interface Tone {
  type: OscillatorType | 'noise';
  from: number;
  to: number;
  duration: number;
  volume: number;
}

export class CompanionSound {
  private enabled = false;
  private context: AudioContext | undefined;
  private voices = new Set<Voice>();
  private lastAt = -Infinity;
  private lastByBot = new Map<string, number>();
  private noise: AudioBuffer | undefined;

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
    let identity = 0;
    for (const character of botId) identity = (identity * 31 + character.codePointAt(0)!) >>> 0;
    const pitch = 170 + (identity % 7) * 16 + ((text.codePointAt(0) ?? 0) % 11) * 9;
    if (
      this.synthesize(botId, 'speech', {
        type: 'square',
        from: pitch,
        to: pitch * 0.88,
        duration: 0.05,
        volume: 0.018,
      })
    ) {
      this.lastAt = now;
      this.lastByBot.set(botId, now);
    }
  }

  interact(botId: string, event: CompanionInteraction): void {
    if (!this.enabled || this.context?.state !== 'running') return;
    this.stop(botId);
    const tones: Record<CompanionInteraction['kind'], Tone> = {
      grab: { type: 'triangle', from: 680, to: 1200, duration: 0.11, volume: 0.018 },
      drag: { type: 'triangle', from: 900, to: 1300, duration: 0.07, volume: 0.01 },
      throw: { type: 'noise', from: 350, to: 2000, duration: 0.16, volume: 0.018 },
      land: {
        type: 'triangle',
        from: 110,
        to: 45,
        duration: 0.09,
        volume: 0.008 + Math.max(0, Math.min(1, event.strength)) * 0.014,
      },
    };
    this.synthesize(botId, 'interaction', tones[event.kind]);
  }

  private synthesize(botId: string, kind: Voice['kind'], tone: Tone): boolean {
    const context = this.context;
    if (!this.enabled || context?.state !== 'running' || this.voices.size >= 2) return false;
    const now = context.currentTime;
    let source: AudioScheduledSourceNode | undefined;
    let gain: GainNode | undefined;
    let filter: BiquadFilterNode | undefined;
    try {
      if (tone.type === 'noise') {
        const buffer =
          this.noise ??
          context.createBuffer(1, Math.ceil(context.sampleRate * 0.18), context.sampleRate);
        if (!this.noise) {
          const samples = buffer.getChannelData(0);
          for (let index = 0; index < samples.length; index++)
            samples[index] = Math.random() * 2 - 1;
          this.noise = buffer;
        }
        const noise = context.createBufferSource();
        source = noise;
        noise.buffer = buffer;
        filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.setValueAtTime(1.4, now);
        filter.frequency.setValueAtTime(tone.from, now);
        filter.frequency.exponentialRampToValueAtTime(tone.to, now + tone.duration);
        source.connect(filter);
      } else {
        const oscillator = context.createOscillator();
        source = oscillator;
        oscillator.type = tone.type;
        oscillator.frequency.setValueAtTime(tone.from, now);
        oscillator.frequency.exponentialRampToValueAtTime(tone.to, now + tone.duration);
      }
      gain = context.createGain();
      const voice: Voice = { botId, kind, source, gain, ...(filter ? { filter } : {}) };
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(tone.volume, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration);
      (filter ?? source).connect(gain);
      gain.connect(context.destination);
      source.onended = () => this.finish(voice);
      this.voices.add(voice);
      source.start(now);
      source.stop(now + tone.duration + 0.01);
      return true;
    } catch {
      try {
        source?.stop();
      } catch {}
      for (const voice of this.voices) {
        if (voice.source === source) {
          this.finish(voice);
          return false;
        }
      }
      source?.disconnect();
      filter?.disconnect();
      gain?.disconnect();
      return false;
    }
  }

  stopSpeech(botId: string): void {
    for (const voice of [...this.voices]) {
      if (voice.botId === botId && voice.kind === 'speech') this.stopVoice(voice);
    }
  }

  stop(botId?: string): void {
    for (const voice of [...this.voices]) {
      if (botId !== undefined && voice.botId !== botId) continue;
      this.stopVoice(voice);
    }
    if (botId === undefined) {
      this.lastAt = -Infinity;
      this.lastByBot.clear();
    } else this.lastByBot.delete(botId);
  }

  private finish(voice: Voice): void {
    voice.source.onended = null;
    voice.source.disconnect();
    voice.filter?.disconnect();
    voice.gain.disconnect();
    this.voices.delete(voice);
  }

  private stopVoice(voice: Voice): void {
    try {
      voice.source.stop();
    } catch {}
    this.finish(voice);
  }

  dispose(): void {
    this.setEnabled(false);
    const context = this.context;
    this.context = undefined;
    this.noise = undefined;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }
}
