#!/usr/bin/env node
// Mix the voice-over cues over the BGM: node scripts/mix-voiceover.mjs <lang> <bgm.wav> <out.wav>
// Each cue is loudness-normalised so different voices sit at the same level, then placed at its `at` second.
// While someone speaks, the BGM dips by 5 dB with smooth raised-cosine ramps in and out. Output is stereo.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const FILM_SECONDS = 11640 / 60;
const MUSIC_GAIN = 0.8; // BGM level with nobody speaking
const DUCK_GAIN = 10 ** (-5 / 20); // relative level under speech: -5 dB
const RAMP_IN = 0.45; // seconds of fade down, ending at the first word
const RAMP_OUT = 0.9; // seconds of fade back up after the last word
const BRIDGE = 1.2; // gaps shorter than this stay ducked instead of bouncing

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [lang, bgm, out] = process.argv.slice(2);
const { cues } = JSON.parse(fs.readFileSync(path.join(root, 'voiceover/script.json'), 'utf8'));
const decode = (file, filter = 'anull', channels = 1) =>
  new Float32Array(new Uint8Array(execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-af', filter, '-ac', String(channels), '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 })).buffer);

const total = Math.round(FILM_SECONDS * RATE);
const music = decode(bgm, 'anull', 2); // interleaved L/R
const voice = new Float32Array(total);
const spans = [];
for (const c of cues) {
  const clip = decode(path.join(root, 'voiceover', lang, 'cues', `${c.id}.wav`), 'loudnorm=I=-16:TP=-2:LRA=7');
  const s0 = Math.round(c.at * RATE);
  for (let i = 0; i < clip.length && s0 + i < total; i++) voice[s0 + i] += clip[i];
  spans.push([c.at, c.at + clip.length / RATE]);
}
// merge spans separated by short gaps so the music does not bob between sentences
const merged = [];
for (const [a, b] of spans.sort((x, y) => x[0] - y[0])) {
  const last = merged.at(-1);
  if (last && a - last[1] < BRIDGE) last[1] = Math.max(last[1], b);
  else merged.push([a, b]);
}
const smooth = (k) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k)));
const duckAt = (t) => {
  let d = 0;
  for (const [a, b] of merged) {
    if (t >= a - RAMP_IN && t < a) d = Math.max(d, smooth((t - (a - RAMP_IN)) / RAMP_IN));
    else if (t >= a && t <= b) d = 1;
    else if (t > b && t < b + RAMP_OUT) d = Math.max(d, 1 - smooth((t - b) / RAMP_OUT));
  }
  return d;
};
const mix = new Int16Array(total * 2);
for (let i = 0; i < total; i++) {
  const t = i / RATE;
  const g = MUSIC_GAIN * (1 - (1 - DUCK_GAIN) * duckAt(t));
  for (let c = 0; c < 2; c++) {
    const v = (music[i * 2 + c] ?? 0) * g + voice[i] * 1.05;
    mix[i * 2 + c] = Math.round(Math.tanh(v * 1.05) * 0.95 * 32767);
  }
}
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + mix.length * 2, 4); header.write('WAVE', 8); header.write('fmt ', 12);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(mix.length * 2, 40);
fs.writeFileSync(out, Buffer.concat([header, Buffer.from(mix.buffer)]));
console.log('mixed', out, `${merged.length} speech spans`);
