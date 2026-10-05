#!/usr/bin/env node
// Fish Audio voice-over for the promo.
//   node scripts/fish-voice.mjs design [zh|en]       voice design candidates -> voiceover/<lang>/candidates/
//   node scripts/fish-voice.mjs pick <lang> <index>  turn a candidate into a private voice model -> voiceover/voices.json
//   node scripts/fish-voice.mjs tts [zh|en] [cueId]  synthesize cues with s2.1-pro-free -> voiceover/<lang>/cues/
// The key is read from FISH_API_KEY or ~/.config/botharness/fish.env (written by scripts/fish-key-wizard.sh).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vo = path.join(root, 'voiceover');
const script = JSON.parse(fs.readFileSync(path.join(vo, 'script.json'), 'utf8'));
const voicesFile = path.join(vo, 'voices.json');
const API = 'https://api.fish.audio';

function apiKey() {
  if (process.env.FISH_API_KEY) return process.env.FISH_API_KEY.trim();
  const file = path.join(os.homedir(), '.config/botharness/fish.env');
  const m = fs.existsSync(file) && /^(?:export\s+)?FISH_API_KEY=(.+)$/m.exec(fs.readFileSync(file, 'utf8'));
  if (!m) throw new Error('No FISH_API_KEY. Run promo/botharness-town/scripts/fish-key-wizard.sh first.');
  return m[1].trim().replace(/^['"]|['"]$/g, '');
}
const auth = () => ({ Authorization: `Bearer ${apiKey()}` });
const langs = (arg) => (arg ? [arg] : ['zh', 'en']);
const readVoices = () => (fs.existsSync(voicesFile) ? JSON.parse(fs.readFileSync(voicesFile, 'utf8')) : {});

async function design(lang) {
  const v = script.voices[lang];
  const res = await fetch(`${API}/v1/voice-design`, {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': 'application/json', model: 'voice-design-1' },
    body: JSON.stringify({ instruction: v.instruction, reference_text: v.reference_text, language: v.language, n: 4, seed: 7 }),
  });
  if (!res.ok) throw new Error(`voice-design ${lang}: HTTP ${res.status} ${await res.text()}`);
  const { candidates } = await res.json();
  const dir = path.join(vo, lang, 'candidates');
  fs.mkdirSync(dir, { recursive: true });
  for (const c of candidates) {
    const file = path.join(dir, `candidate-${c.index}.wav`);
    fs.writeFileSync(file, Buffer.from(c.audio_base64, 'base64'));
    console.log(`${lang} candidate ${c.index}: ${file} (${c.duration_ms} ms)`);
  }
}

async function pick(lang, index) {
  const file = path.join(vo, lang, 'candidates', `candidate-${index}.wav`);
  const form = new FormData();
  form.append('type', 'tts');
  form.append('title', `BotHarness promo narrator (${lang})`);
  form.append('visibility', 'private');
  form.append('train_mode', 'fast');
  form.append('enhance_audio_quality', 'false');
  form.append('texts', script.voices[lang].reference_text);
  form.append('voices', new Blob([fs.readFileSync(file)], { type: 'audio/wav' }), path.basename(file));
  const res = await fetch(`${API}/model`, { method: 'POST', headers: auth(), body: form });
  if (!res.ok) throw new Error(`create model ${lang}: HTTP ${res.status} ${await res.text()}`);
  const model = await res.json();
  const voices = readVoices();
  voices[lang] = { id: model._id, candidate: Number(index), state: model.state };
  fs.writeFileSync(voicesFile, JSON.stringify(voices, null, 2) + '\n');
  console.log(`${lang} voice model ${model._id} (${model.state})`);
}

async function tts(lang, only) {
  const voice = readVoices()[lang];
  if (!voice) throw new Error(`No ${lang} voice yet: run "pick ${lang} <index>".`);
  const dir = path.join(vo, lang, 'cues');
  fs.mkdirSync(dir, { recursive: true });
  for (const cue of script.cues) {
    if (only && cue.id !== only) continue;
    const speed = cue[`${lang}Speed`] ?? 1;
    const res = await fetch(`${API}/v1/tts`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json', model: 's2.1-pro-free' },
      body: JSON.stringify({ text: cue[lang], reference_id: voice.id, format: 'wav', sample_rate: 44100, normalize: true, latency: 'normal', prosody: { speed } }),
    });
    if (!res.ok) throw new Error(`tts ${lang} ${cue.id}: HTTP ${res.status} ${await res.text()}`);
    fs.writeFileSync(path.join(dir, `${cue.id}.wav`), Buffer.from(await res.arrayBuffer()));
    console.log(`${lang} ${cue.id} ok`);
  }
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'design') for (const l of langs(a)) await design(l);
else if (cmd === 'pick') await pick(a, b ?? '0');
else if (cmd === 'tts') for (const l of langs(a)) await tts(l, b);
else console.log('usage: design [lang] | pick <lang> <index> | tts [lang] [cueId]');
