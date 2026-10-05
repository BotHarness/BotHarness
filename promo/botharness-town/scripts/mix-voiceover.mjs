#!/usr/bin/env node
// Mix the narrator cues over the BGM: node scripts/mix-voiceover.mjs <lang> <bgm.wav> <out.wav>
// Each cue starts at its `at` second; the BGM ducks under the voice with a sidechain compressor.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [lang, bgm, out] = process.argv.slice(2);
const { cues } = JSON.parse(fs.readFileSync(path.join(root, 'voiceover/script.json'), 'utf8'));
const inputs = ['-i', bgm];
const parts = [];
cues.forEach((c, i) => {
  inputs.push('-i', path.join(root, 'voiceover', lang, 'cues', `${c.id}.wav`));
  const ms = Math.round(c.at * 1000);
  parts.push(`[${i + 1}:a]aresample=44100,aformat=channel_layouts=mono,adelay=${ms}|${ms}[v${i}]`);
});
const voices = cues.map((_, i) => `[v${i}]`).join('');
const graph = [
  ...parts,
  `${voices}amix=inputs=${cues.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad=whole_dur=${(11640 / 60).toFixed(3)},asplit=2[voice][key]`,
  `[0:a]aresample=44100,aformat=channel_layouts=mono,volume=0.6[bgm]`,
  `[bgm][key]sidechaincompress=threshold=0.02:ratio=10:attack=40:release=450:makeup=1[duck]`,
  `[duck][voice]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[out]`,
].join(';');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', graph, '-map', '[out]', '-ar', '44100', '-ac', '1', out], { stdio: 'inherit' });
console.log('mixed', out);
