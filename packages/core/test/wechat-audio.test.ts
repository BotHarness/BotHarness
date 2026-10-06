import { expect, it } from 'vitest';
import { encode } from 'silk-wasm';
import { decodeWeChatVoice, MAX_VOICE_INPUT_BYTES } from '../src/attachments/wechat-audio.js';

const voice = { transcript: 'unavailable', encodeType: 6 } as const;
const signal = () => new AbortController().signal;
async function original() {
  const pcm = Buffer.alloc(24000 * 2);
  for (let frame = 0; frame < 24000; frame++)
    pcm.writeInt16LE(Math.round(4000 * Math.sin((frame * 440 * Math.PI * 2) / 24000)), frame * 2);
  return (await encode(pcm, 24000)).data;
}

it('decodes actual SILK packets to independently inspectable mono PCM WAV without inventing native metadata', async () => {
  const bytes = await original();
  const wav = Buffer.from(await decodeWeChatVoice(bytes, voice, signal()));
  expect(wav.subarray(0, 4).toString()).toBe('RIFF');
  expect(wav.subarray(8, 12).toString()).toBe('WAVE');
  expect(wav.readUInt16LE(22)).toBe(1);
  expect(wav.readUInt32LE(24)).toBe(24000);
  expect(wav.readUInt16LE(34)).toBe(16);
  expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
  expect((wav.length - 44) / 48000).toBeGreaterThan(0.8);
  expect((wav.length - 44) / 48000).toBeLessThan(1.1);
  expect(wav.subarray(44).some((byte) => byte !== 0)).toBe(true);
  expect(voice).toEqual({ transcript: 'unavailable', encodeType: 6 });
});

it('refuses contradictory codecs, malformed packets and oversized input before decoding', async () => {
  const bytes = await original();
  await expect(
    decodeWeChatVoice(bytes, { ...voice, encodeType: 5 }, signal()),
  ).rejects.toMatchObject({ code: 'audio-codec-unsupported' });
  await expect(
    decodeWeChatVoice(Buffer.from('not an audio file'), voice, signal()),
  ).rejects.toMatchObject({ code: 'audio-codec-unsupported' });
  await expect(
    decodeWeChatVoice(Buffer.from('#!SILK_V3\u0001'), voice, signal()),
  ).rejects.toMatchObject({ code: 'audio-decode-failed' });
  await expect(
    decodeWeChatVoice(new Uint8Array(MAX_VOICE_INPUT_BYTES + 1), voice, signal()),
  ).rejects.toMatchObject({ code: 'audio-too-large' });
});

it('cancels a running decoder and refuses an already cancelled request', async () => {
  const bytes = await original();
  const controller = new AbortController();
  const running = decodeWeChatVoice(bytes, voice, controller.signal);
  controller.abort(new Error('closed preview'));
  await expect(running).rejects.toThrow('closed preview');
  await expect(decodeWeChatVoice(bytes, voice, controller.signal)).rejects.toThrow(
    'closed preview',
  );
});

it('accepts observed WeChat encodeType 4 only with validated SILK packets, retaining native fields', async () => {
  const bytes = await original();
  const native = { ...voice, encodeType: 4, sampleRate: 16000, bitsPerSample: 16 };
  const wav = Buffer.from(await decodeWeChatVoice(bytes, native, signal()));
  expect(wav.subarray(0, 4).toString()).toBe('RIFF');
  expect(wav.readUInt32LE(24)).toBe(24000);
  expect(wav.readUInt32LE(40)).toBeGreaterThan(0);
  expect(native).toEqual({
    transcript: 'unavailable',
    encodeType: 4,
    sampleRate: 16000,
    bitsPerSample: 16,
  });
  await expect(decodeWeChatVoice(Buffer.from('not SILK'), native, signal())).rejects.toMatchObject({
    code: 'audio-codec-unsupported',
  });
});
