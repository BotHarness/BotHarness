#!/usr/bin/env node
// "Variation" BGM: a frantic 8-bit disco / denpa track, original composition.
// Style cues taken from a reference (tempo ~170, four-on-the-floor kick with a 16th push before each beat,
// off-beat open hats, octave disco bass); no melody or sample from the reference is used.
//   node scripts/bgm-v2.mjs <out.wav>
// Length is fixed to the film (194 s = 140 bars), so the track starts and ends with the film.
import fs from 'node:fs';

const RATE = 44100;
const FILM_SECONDS = 194;
const BARS = 140;
const BPM = (BARS * 4 * 60) / FILM_SECONDS; // ~173.2
const BEAT = 60 / BPM;
const STEP = BEAT / 4; // 16th note
const BAR = BEAT * 4;
const total = Math.round(FILM_SECONDS * RATE);

// buses mixed at the end; `pump` ducks everything except drums on each kick
const drums = new Float32Array(total);
const music = new Float32Array(total);
const pumpKeys = [];

let seed = 1;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (n) => 12 * (Number(n.at(-1)) + 1) + NOTE[n[0]] + (n[1] === '#' ? 1 : n[1] === 'b' ? -1 : 0);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// ----- instruments -----------------------------------------------------------------
function pulse(bus, t, dur, freq, { duty = 0.5, vol = 0.2, attack = 0.002, decay = 0.08, sustain = 0.7, release = 0.03, vib = 0, slideTo = null, crush = 0 } = {}) {
  const start = Math.floor(t * RATE);
  const len = Math.floor((dur + release) * RATE);
  let phase = 0;
  for (let i = 0; i < len && start + i < total; i++) {
    const s = i / RATE;
    let f = freq;
    if (slideTo) f = freq * (slideTo / freq) ** Math.min(1, s / dur);
    if (vib && s > 0.12) f *= 1 + Math.sin(s * 2 * Math.PI * 6.5) * vib;
    phase = (phase + f / RATE) % 1;
    let env = s < attack ? s / attack : s < attack + decay ? 1 - (1 - sustain) * ((s - attack) / decay) : sustain;
    if (s > dur) env *= Math.max(0, 1 - (s - dur) / release);
    let v = phase < duty ? 1 : -1;
    if (crush) v = Math.round(v * env * crush) / crush; else v *= env;
    bus[start + i] += v * vol;
  }
}
function tri(bus, t, dur, freq, { vol = 0.35, release = 0.02 } = {}) {
  const start = Math.floor(t * RATE);
  const len = Math.floor((dur + release) * RATE);
  let phase = 0;
  for (let i = 0; i < len && start + i < total; i++) {
    const s = i / RATE;
    phase = (phase + freq / RATE) % 1;
    const v = Math.round((1 - 4 * Math.abs(phase - 0.5)) * 7.5) / 7.5; // 4-bit triangle
    const env = Math.min(1, s / 0.002) * (s > dur ? Math.max(0, 1 - (s - dur) / release) : 1);
    bus[start + i] += v * env * vol;
  }
}
function kick(t, vol = 0.9) {
  const start = Math.floor(t * RATE);
  let phase = 0;
  for (let i = 0; i < 0.22 * RATE && start + i < total; i++) {
    const s = i / RATE;
    const f = 48 + 170 * Math.exp(-s * 38);
    phase = (phase + f / RATE) % 1;
    const click = s < 0.004 ? (rnd() * 2 - 1) * 0.6 : 0;
    drums[start + i] += (Math.sin(phase * 2 * Math.PI) * Math.exp(-s * 11) + click) * vol;
  }
  pumpKeys.push(t);
}
let lfsr = 0x7fff;
function noise(short) {
  const bit = (lfsr ^ (lfsr >> (short ? 6 : 1))) & 1;
  lfsr = (lfsr >> 1) | (bit << 14);
  return (lfsr & 1) * 2 - 1;
}
function snare(t, vol = 0.45) {
  const start = Math.floor(t * RATE);
  let phase = 0;
  for (let i = 0; i < 0.18 * RATE && start + i < total; i++) {
    const s = i / RATE;
    phase = (phase + (190 - 60 * s) / RATE) % 1;
    const n = i % 2 ? drums[start + i - 1] * 0 + noise(false) : noise(false);
    drums[start + i] += (n * Math.exp(-s * 18) * 0.8 + Math.sin(phase * 2 * Math.PI) * Math.exp(-s * 30) * 0.5) * vol;
  }
}
function clap(t, vol = 0.35) {
  for (const off of [0, 0.011, 0.022]) {
    const start = Math.floor((t + off) * RATE);
    const len = off === 0.022 ? 0.14 : 0.01;
    for (let i = 0; i < len * RATE && start + i < total; i++) drums[start + i] += noise(false) * Math.exp(-(i / RATE) * (off === 0.022 ? 22 : 200)) * vol;
  }
}
function hat(t, open = false, vol = 0.12) {
  const start = Math.floor(t * RATE);
  const len = open ? 0.16 : 0.035;
  let prev = 0;
  for (let i = 0; i < len * RATE && start + i < total; i++) {
    const n = noise(true);
    const hp = n - prev; // crude high-pass for sizzle
    prev = n;
    drums[start + i] += hp * 0.5 * Math.exp(-(i / RATE) * (open ? 14 : 90)) * vol;
  }
}
function crash(t, vol = 0.18) {
  const start = Math.floor(t * RATE);
  let prev = 0;
  for (let i = 0; i < 1.4 * RATE && start + i < total; i++) {
    const n = noise(true);
    drums[start + i] += (n - prev * 0.6) * Math.exp(-(i / RATE) * 2.4) * vol;
    prev = n;
  }
}
function riser(t, dur, vol = 0.12) {
  const start = Math.floor(t * RATE);
  let phase = 0;
  for (let i = 0; i < dur * RATE && start + i < total; i++) {
    const s = i / RATE;
    const k = s / dur;
    phase = (phase + (200 + 1800 * k * k) / RATE) % 1;
    music[start + i] += ((phase < 0.5 ? 1 : -1) * 0.4 + noise(true) * 0.6 * k) * k * vol;
  }
}
function zap(t, from = 2400, to = 120, dur = 0.18, vol = 0.12) {
  pulse(music, t, dur, from, { duty: 0.25, vol, decay: dur, sustain: 0, slideTo: to, release: 0.01 });
}

// ----- harmony ----------------------------------------------------------------------
const CH = {
  Am7: ['A2', 'C4', 'E4', 'G4'], Dm7: ['D3', 'C4', 'F4', 'A4'], G6: ['G2', 'B3', 'D4', 'E4'], Cmaj7: ['C3', 'B3', 'E4', 'G4'],
  Fmaj7: ['F2', 'A3', 'C4', 'E4'], Em7: ['E2', 'B3', 'D4', 'G4'], E7: ['E2', 'G#3', 'D4', 'B3'], Bbmaj7: ['Bb2', 'A3', 'D4', 'F4'],
};
const PROG_A = ['Am7', 'Dm7', 'G6', 'Cmaj7'];
const PROG_B = ['Fmaj7', 'Em7', 'Dm7', 'E7'];
const PROG_ADV = ['Am7', 'Fmaj7', 'Bbmaj7', 'E7'];
const MOTIF = {
  hookA1: 'A5 A5 . A5 C6 . A5 . G5 . E5 G5 A5 . . .',
  hookA2: 'A5 A5 . A5 D6 . C6 . A5 . G5 . E5 D5 E5 .',
  runB1: 'E6 D6 C6 A5 G5 A5 C6 D6 E6 . D6 . C6 . A5 .',
  runB2: 'G5 A5 C6 D6 E6 G6 E6 D6 C6 D6 C6 A5 G5 . A5 -',
  dropC1: 'A5 . A6 . G6 . E6 . D6 E6 . C6 . D6 . .',
  dropC2: 'A5 . A6 . G6 . A6 C7 . A6 . G6 E6 . . .',
  dropC3: 'F6 . E6 . D6 . C6 D6 . E6 . G6 . E6 D6 .',
  dropC4: 'E6 . D6 . B5 . G#5 . B5 D6 . E6 - - . .',
  advD1: 'A5 B5 C6 E6 A6 . E6 C6 B5 . A5 . E5 . A5 .',
  advD2: 'F5 A5 C6 F6 A6 . F6 C6 E6 . D6 C6 B5 . G#5 .',
};
function parseLine(line) {
  const out = [];
  line.split(/\s+/).forEach((tok, i) => {
    if (tok === '-') { if (out.length) out.at(-1).len += 1; return; }
    if (tok === '.') return;
    out.push({ step: i, len: 1, m: midi(tok) });
  });
  return out;
}

// ----- arrangement by bar -----------------------------------------------------------
const s2b = (s) => Math.round(s / BAR);
const SECTIONS = [
  { name: 'intro', from: 0, to: s2b(12) },
  { name: 'memory', from: s2b(12), to: s2b(44) },
  { name: 'lift', from: s2b(44), to: s2b(48) },
  { name: 'market', from: s2b(48), to: s2b(84) },
  { name: 'connect', from: s2b(84), to: s2b(128) },
  { name: 'adventure', from: s2b(128), to: s2b(148) },
  { name: 'wall', from: s2b(148), to: s2b(156) },
  { name: 'build', from: s2b(156), to: s2b(170) },
  { name: 'town', from: s2b(170), to: s2b(188) },
  { name: 'end', from: s2b(188), to: BARS },
];
const sectionAt = (bar) => SECTIONS.find((s) => bar >= s.from && bar < s.to) ?? SECTIONS.at(-1);

for (let bar = 0; bar < BARS; bar++) {
  const sec = sectionAt(bar);
  const local = bar - sec.from;
  const t0 = bar * BAR;
  const prog = sec.name === 'adventure' ? PROG_ADV : Math.floor(bar / 4) % 2 ? PROG_B : PROG_A;
  const chord = CH[prog[bar % 4]].map(midi);
  const lastOfPhrase = (local + 1) % 4 === 0;
  const firstOfSection = local === 0;
  const big = ['market', 'town'].includes(sec.name);
  const groove = !['intro', 'wall', 'end'].includes(sec.name) || (sec.name === 'intro' && local >= 4);

  // drums
  if (firstOfSection && sec.name !== 'intro' && sec.name !== 'wall') crash(t0);
  if (big && local % 8 === 0 && !firstOfSection) crash(t0, 0.12);
  for (let s = 0; s < 16; s++) {
    const t = t0 + s * STEP;
    if (sec.name === 'end' && bar > sec.from) break;
    const fourFloor = s % 4 === 0;
    const push = s % 4 === 3 && !(lastOfPhrase && s === 15);
    if (sec.name === 'wall') { if (s === 0 && local % 2 === 0) kick(t, 0.5); continue; }
    if (sec.name === 'build') {
      // accelerating snare roll across the build, kicks on every beat
      if (fourFloor) kick(t, 0.8);
      const density = local < 4 ? 4 : local < 8 ? 2 : 1;
      if (s % density === 0) snare(t, 0.18 + 0.3 * (local / (sec.to - sec.from)));
      continue;
    }
    if (sec.name === 'intro' && local < 4) { if (s % 2 === 0) hat(t, false, 0.07); continue; }
    if (fourFloor) kick(t);
    if (push && groove && sec.name !== 'intro') kick(t, 0.7);
    if (s === 4 || s === 12) { clap(t); if (big || sec.name === 'adventure') snare(t, 0.25); }
    if (s % 4 === 2) hat(t, true, big ? 0.13 : 0.1);
    else hat(t, false, sec.name === 'adventure' || big ? 0.1 : 0.07);
    if (lastOfPhrase && s >= 12 && (big || sec.name === 'connect' || sec.name === 'adventure')) snare(t, 0.22 + (s - 12) * 0.05);
  }

  // bass: disco octaves with the 16th push before each beat
  if (sec.name !== 'wall' && !(sec.name === 'intro' && local < 4) && !(sec.name === 'end' && bar > sec.from)) {
    const root = chord[0] - 12 < 28 ? chord[0] : chord[0] - 12;
    const pat = sec.name === 'adventure' ? [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 7] : [0, null, 12, 0, null, null, 12, 0, 0, null, 12, 0, null, null, 12, 7];
    pat.forEach((o, s) => {
      if (o === null) return;
      if (sec.name === 'end') { if (s === 0) tri(music, t0, BAR * 2, hz(root), { vol: 0.4, release: 0.6 }); return; }
      tri(music, t0 + s * STEP, STEP * 0.85, hz(root + o), { vol: 0.42 });
      pulse(music, t0 + s * STEP, STEP * 0.5, hz(root + o + 12), { duty: 0.125, vol: 0.05, decay: 0.05, sustain: 0.2 });
    });
  }

  // chord stabs on the off-beat 8ths (R&B / disco)
  if (groove && sec.name !== 'build' && !(sec.name === 'end' && bar > sec.from)) {
    for (const s of [2, 6, 10, 14]) {
      if (sec.name === 'memory' && s % 4 === 2 && local % 2) continue;
      for (const m of chord.slice(1)) pulse(music, t0 + s * STEP, STEP * 0.7, hz(m), { duty: 0.25, vol: 0.045, decay: 0.06, sustain: 0.3 });
    }
  }
  if (sec.name === 'end' && bar === sec.from) {
    crash(t0, 0.22);
    for (const m of chord) pulse(music, t0, BAR * 2.5, hz(m + 12), { duty: 0.25, vol: 0.06, decay: 1.5, sustain: 0.2, release: 1.2 });
  }

  // arpeggio: 16ths normally, 32nds ("frantic") in the big sections and the build
  if (sec.name !== 'end') {
    const fast = big || sec.name === 'build' || sec.name === 'adventure';
    const n = fast ? 32 : 16;
    const tones = [chord[1] + 12, chord[2] + 12, chord[3] + 12, chord[1] + 24];
    const vol = sec.name === 'memory' ? 0.035 : sec.name === 'wall' ? 0.06 : 0.045;
    for (let i = 0; i < n; i++) {
      const order = fast ? [0, 2, 1, 3, 2, 0, 3, 1] : [0, 1, 2, 3, 2, 1, 3, 1];
      pulse(music, t0 + (i * BAR) / n, (BAR / n) * 0.8, hz(tones[order[i % 8]]), { duty: 0.125, vol, decay: 0.03, sustain: 0.4, release: 0.01 });
    }
  }

  // lead
  let line = null;
  if (sec.name === 'memory') line = [MOTIF.hookA1, MOTIF.hookA2, MOTIF.runB1, MOTIF.runB2][local % 4];
  if (sec.name === 'connect') line = [MOTIF.hookA1, MOTIF.hookA2, MOTIF.hookA1, MOTIF.runB2][local % 4];
  if (big) line = [MOTIF.dropC1, MOTIF.dropC2, MOTIF.dropC3, MOTIF.dropC4][local % 4];
  if (sec.name === 'adventure') line = [MOTIF.advD1, MOTIF.advD2][local % 2];
  if (sec.name === 'intro' && local >= 6) line = MOTIF.hookA1;
  if (line) {
    const leadVol = sec.name === 'memory' ? 0.07 : 0.1;
    for (const n of parseLine(line)) {
      const t = t0 + n.step * STEP;
      const dur = n.len * STEP * 0.9;
      pulse(music, t, dur, hz(n.m), { duty: big ? 0.5 : 0.25, vol: leadVol, vib: n.len > 1 ? 0.012 : 0, crush: 6 });
      if (big) pulse(music, t + STEP * 0.75, dur * 0.8, hz(n.m), { duty: 0.125, vol: leadVol * 0.35, crush: 6 }); // 8-bit echo
    }
  }

  // ear candy: laser zaps on phrase turns, risers into the big sections
  if (lastOfPhrase && (big || sec.name === 'connect')) zap(t0 + 15 * STEP, 2600, 140);
  if (sec.name === 'lift') riser(t0, BAR, 0.1 + 0.05 * local);
  if (sec.name === 'build' && local === sec.to - sec.from - 2) riser(t0, BAR * 2, 0.16);
  if (sec.name === 'wall' && local % 2 === 1) for (let k = 0; k < 4; k++) zap(t0 + (8 + k) * STEP, 1600 - k * 200, 400, 0.06, 0.07);
}

// ----- mix: sidechain pump on the music bus, soft clip, fade ends -------------------
const pump = new Float32Array(total).fill(1);
for (const t of pumpKeys) {
  const s0 = Math.floor(t * RATE);
  for (let i = 0; i < 0.16 * RATE && s0 + i < total; i++) pump[s0 + i] = Math.min(pump[s0 + i], 0.45 + 0.55 * Math.min(1, i / (0.16 * RATE)) ** 1.5);
}
const out = new Int16Array(total);
let dc = 0;
for (let i = 0; i < total; i++) {
  let v = drums[i] * 0.85 + music[i] * pump[i];
  dc += (v - dc) * 0.0005;
  v = Math.tanh((v - dc) * 1.1);
  const fade = Math.min(1, i / (0.05 * RATE), (total - i) / (1.5 * RATE));
  out[i] = Math.max(-32767, Math.min(32767, v * fade * 0.89 * 32767));
}
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + out.length * 2, 4); header.write('WAVE', 8); header.write('fmt ', 12);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(out.length * 2, 40);
fs.writeFileSync(process.argv[2] ?? 'bgm-v2.wav', Buffer.concat([header, Buffer.from(out.buffer)]));
console.log(`bgm v2: ${BPM.toFixed(2)} BPM, ${BARS} bars, ${FILM_SECONDS}s`);
