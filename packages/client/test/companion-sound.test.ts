import { afterEach, expect, it, vi } from 'vitest';
import { CompanionSound, companionBabble } from '../src/client/companion-sound.js';
import { WindowCompanion } from '../src/client/window-companion.js';

class AudioParameter {
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}
class Oscillator {
  type = 'sine';
  frequency = new AudioParameter();
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class Gain {
  gain = new AudioParameter();
  connect = vi.fn();
  disconnect = vi.fn();
}
class NoiseSource extends Oscillator {
  buffer: unknown;
}
class Filter extends Oscillator {
  Q = new AudioParameter();
}
class Audio {
  static instances: Audio[] = [];
  state = 'suspended';
  currentTime = 0;
  destination = {};
  oscillators: Oscillator[] = [];
  gains: Gain[] = [];
  sampleRate = 48000;
  buffers: { getChannelData: () => Float32Array }[] = [];
  noises: NoiseSource[] = [];
  filters: Filter[] = [];
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  constructor() {
    Audio.instances.push(this);
  }
  createOscillator() {
    const oscillator = new Oscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createGain() {
    const gain = new Gain();
    this.gains.push(gain);
    return gain;
  }
  createBuffer(_channels: number, length: number) {
    const samples = new Float32Array(length);
    const buffer = { getChannelData: () => samples };
    this.buffers.push(buffer);
    return buffer;
  }
  createBufferSource() {
    const source = new NoiseSource();
    this.noises.push(source);
    return source;
  }
  createBiquadFilter() {
    const filter = new Filter();
    this.filters.push(filter);
    return filter;
  }
}

afterEach(() => {
  Audio.instances = [];
  vi.unstubAllGlobals();
});

it('reuses a bounded throw-noise buffer and releases its filter after completion or partial allocation failure', () => {
  vi.stubGlobal('AudioContext', Audio);
  const sound = new CompanionSound();
  sound.setEnabled(true);
  sound.unlock();
  const audio = Audio.instances[0]!;
  sound.interact('ada', { kind: 'throw', strength: 1 });
  expect(audio.buffers).toHaveLength(1);
  expect(audio.buffers[0]!.getChannelData().length).toBeLessThan(audio.sampleRate);
  expect(audio.noises[0]!.buffer).toBe(audio.buffers[0]);
  expect(audio.filters[0]!.type).toBe('bandpass');
  audio.noises[0]!.onended!();
  expect(audio.noises[0]!.disconnect).toHaveBeenCalledOnce();
  expect(audio.filters[0]!.disconnect).toHaveBeenCalledOnce();
  vi.spyOn(audio, 'createGain').mockImplementationOnce(() => {
    throw new Error('Unavailable');
  });
  expect(() => sound.interact('ada', { kind: 'throw', strength: 1 })).not.toThrow();
  expect(audio.noises[1]!.disconnect).toHaveBeenCalledOnce();
  expect(audio.filters[1]!.disconnect).toHaveBeenCalledOnce();
  sound.interact('ada', { kind: 'throw', strength: 1 });
  expect(audio.buffers).toHaveLength(1);
  expect(audio.noises[2]!.buffer).toBe(audio.buffers[0]);
  sound.interact('ada', { kind: 'grab', strength: 1 });
  expect(audio.noises[2]!.disconnect).toHaveBeenCalledOnce();
  sound.interact('ada', { kind: 'throw', strength: 1 });
  expect(audio.oscillators.at(-1)!.disconnect).toHaveBeenCalledOnce();
  expect(audio.noises).toHaveLength(4);
  sound.dispose();
  expect(audio.noises[3]!.disconnect).toHaveBeenCalledOnce();
  expect(audio.filters[3]!.disconnect).toHaveBeenCalledOnce();
});

it('shares opt-in, gesture admission and bounded resources between speech and interaction sounds', () => {
  vi.stubGlobal('AudioContext', Audio);
  const sound = new CompanionSound();
  sound.interact('ada', { kind: 'grab', strength: 1 });
  sound.setEnabled(true);
  sound.interact('ada', { kind: 'land', strength: 1 });
  expect(Audio.instances).toHaveLength(0);
  sound.unlock();
  const audio = Audio.instances[0]!;
  sound.play('ada', 'a');
  sound.interact('ada', { kind: 'grab', strength: 1 });
  expect(audio.oscillators).toHaveLength(2);
  expect(audio.oscillators[0]!.disconnect).toHaveBeenCalledOnce();
  expect(audio.oscillators[1]!.type).toBe('triangle');
  sound.stopSpeech('ada');
  expect(audio.oscillators[1]!.disconnect).not.toHaveBeenCalled();
  sound.interact('grace', { kind: 'land', strength: 0.3 });
  sound.interact('third', { kind: 'grab', strength: 1 });
  expect(audio.oscillators).toHaveLength(3);
  sound.setEnabled(false);
  expect(audio.oscillators[1]!.disconnect).toHaveBeenCalledOnce();
  expect(audio.oscillators[2]!.disconnect).toHaveBeenCalledOnce();
  sound.setEnabled(true);
  expect(audio.oscillators).toHaveLength(3);
  sound.dispose();
  expect(audio.close).toHaveBeenCalledOnce();
});

it('requires opt-in and a gesture, drops blocked playback, and never queues it for a later unlock', async () => {
  vi.stubGlobal('AudioContext', Audio);
  const sound = new CompanionSound();
  sound.unlock();
  sound.play('ada', 'a');
  expect(Audio.instances).toHaveLength(0);
  sound.setEnabled(true);
  sound.play('ada', 'a');
  expect(Audio.instances).toHaveLength(0);
  sound.unlock();
  const audio = Audio.instances[0]!;
  audio.state = 'suspended';
  audio.resume.mockRejectedValue(new Error('Autoplay blocked'));
  sound.unlock();
  sound.play('ada', 'a');
  await Promise.resolve();
  expect(audio.oscillators).toHaveLength(0);
  audio.state = 'running';
  sound.unlock();
  expect(audio.oscillators).toHaveLength(0);
  sound.play('ada', 'b');
  expect(audio.oscillators).toHaveLength(1);
  sound.setEnabled(false);
  expect(audio.oscillators[0]!.stop).toHaveBeenLastCalledWith();
  expect(audio.oscillators[0]!.disconnect).toHaveBeenCalledOnce();
  expect(audio.gains[0]!.disconnect).toHaveBeenCalledOnce();
  sound.setEnabled(true);
  expect(audio.oscillators).toHaveLength(1);
  sound.dispose();
  expect(audio.close).toHaveBeenCalledOnce();
});

it('bounds concurrent and per-Bot sound resources, varies syllables, and cancels only the removed Bot', () => {
  vi.stubGlobal('AudioContext', Audio);
  const sound = new CompanionSound();
  sound.setEnabled(true);
  sound.unlock();
  const audio = Audio.instances[0]!;
  sound.play('ada', 'a');
  audio.currentTime = 0.02;
  sound.play('grace', 'g');
  expect(audio.oscillators).toHaveLength(1);
  audio.currentTime = 0.04;
  sound.play('ada', 'b');
  expect(audio.oscillators).toHaveLength(1);
  sound.play('grace', 'g');
  expect(audio.oscillators).toHaveLength(2);
  audio.currentTime = 0.1;
  sound.play('third', 'c');
  expect(audio.oscillators).toHaveLength(2);
  sound.stop('ada');
  expect(audio.oscillators[0]!.onended).toBeNull();
  expect(audio.oscillators[1]!.disconnect).not.toHaveBeenCalled();
  sound.play('third', 'c');
  expect(audio.oscillators).toHaveLength(3);
  expect(audio.oscillators[0]!.frequency.setValueAtTime.mock.calls[0]![0]).not.toBe(
    audio.oscillators[1]!.frequency.setValueAtTime.mock.calls[0]![0],
  );
  audio.oscillators[1]!.onended!();
  expect(audio.gains[1]!.disconnect).toHaveBeenCalledOnce();
  sound.dispose();
  expect(audio.oscillators[2]!.disconnect).toHaveBeenCalledOnce();
  expect(audio.close).toHaveBeenCalledOnce();
});

it('silently degrades without audio support and releases partial allocations after a synthesis failure', () => {
  const sound = new CompanionSound();
  sound.setEnabled(true);
  vi.stubGlobal('AudioContext', undefined);
  expect(() => sound.unlock()).not.toThrow();
  expect(() => sound.play('ada', 'a')).not.toThrow();
  vi.stubGlobal('AudioContext', Audio);
  sound.unlock();
  const audio = Audio.instances[0]!;
  vi.spyOn(audio, 'createGain').mockImplementationOnce(() => {
    throw new Error('Resource unavailable');
  });
  expect(() => sound.play('ada', 'a')).not.toThrow();
  expect(audio.oscillators[0]!.stop).toHaveBeenCalledOnce();
  expect(audio.oscillators[0]!.disconnect).toHaveBeenCalledOnce();
  sound.play('ada', 'b');
  expect(audio.oscillators).toHaveLength(2);
  sound.dispose();
});

it('admits only newly revealed committed graphemes, with silent punctuation and no historical catch-up', async () => {
  const events = new EventTarget();
  const owner = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  const send = (name: string, data: unknown) =>
    events.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) }));
  await owner.start();
  owner.select('ada');
  send('companion/baseline', {
    profileId: 'qa',
    bot: { slug: 'ada', name: 'Ada', paused: false },
    activity: { generation: 'host', revision: 0, bots: [] },
  });
  send('companion/message', {
    generation: 'host',
    botId: 'ada',
    channelId: 'dm',
    channelName: 'Ada',
    messageId: 'fresh',
    body: '你，👩🏽‍💻 A',
    source: 'own-dm',
  });
  const reveal = () => {
    const before = owner.getSnapshot().cards;
    owner.advance(35);
    return companionBabble(before, owner.getSnapshot().cards);
  };
  expect(reveal()).toBe('你');
  expect(reveal()).toBeUndefined();
  expect(reveal()).toBe('👩🏽‍💻');
  expect(reveal()).toBeUndefined();
  expect(reveal()).toBe('A');
  const shown = owner.getSnapshot().cards;
  expect(companionBabble([], shown)).toBeUndefined();
  expect(companionBabble(shown, shown)).toBeUndefined();
  expect(reveal()).toBeUndefined();
  owner.dispose();
});
