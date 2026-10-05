#!/usr/bin/env node
// BGM v3: a laid-back nu-disco / synth-pop take, original composition, stereo.
//   node scripts/bgm-v3.mjs <out.wav>
// Drums follow common nu-disco programming: four-on-the-floor kick (heavier on 1 and 3), clap + flammed snare
// on 2 and 4, 8th closed hats with an open hat on the off-beat, a soft swung shaker, small timing and velocity
// variation, and a tom fill only every eighth bar. Synths borrow wavetable-synth ideas (Serum): detuned unison
// saws spread in stereo, low-pass filters driven by envelopes, a filtered pluck, a sub + saw bass, sidechain pump,
// dotted-8th delay and a small reverb. 98 bars at ~121 BPM fill the film's 194 s exactly.
import fs from 'node:fs';

const RATE = 44100;
const FILM_SECONDS = 194;
const BARS = 98;
const BPM = (BARS * 4 * 60) / FILM_SECONDS; // ~121.2
const BEAT = 60 / BPM;
const STEP = BEAT / 4;
const BAR = BEAT * 4;
const SWING = 0.12; // delays every second 16th by 12% of a step
const total = Math.round(FILM_SECONDS * RATE);

const bus = () => [new Float32Array(total), new Float32Array(total)];
const DRUMS = bus();
const MUSIC = bus(); // pumped by the kick
const SEND_VERB = bus();
const SEND_DELAY = bus();
const kicks = [];

const hash = (n) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (n) => 12 * (Number(n.at(-1)) + 1) + NOTE[n[0]] + (n[1] === '#' ? 1 : n[1] === 'b' ? -1 : 0);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const stepTime = (bar, s) => bar * BAR + s * STEP + (s % 2 ? SWING * STEP : 0);

// ----- building blocks -----------------------------------------------------------------
// TPT state-variable low-pass filter (Zavalishin)
function makeLP() {
  let ic1 = 0, ic2 = 0;
  return (x, fc, q = 0.7) => {
    const g = Math.tan((Math.PI * Math.min(fc, RATE * 0.45)) / RATE);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    return v2;
  };
}
const adsr = (s, dur, a, d, su, r) => {
  let e = s < a ? s / a : s < a + d ? 1 - (1 - su) * ((s - a) / d) : su;
  if (s > dur) e *= Math.max(0, 1 - (s - dur) / r);
  return e;
};
function polyBlepSaw(phase, dt) {
  let v = 2 * phase - 1;
  if (phase < dt) { const t = phase / dt; v -= t + t - t * t - 1; } else if (phase > 1 - dt) { const t = (phase - 1) / dt; v -= t * t + t + t + 1; }
  return v;
}
/**
 * Detuned unison synth voice (saw), stereo spread, envelope-driven low-pass.
 * opts: voices, detune (cents spread), width (0..1), cutoff, envAmt (Hz), fDecay, q, amp {a,d,s,r}, vol, out, verb, delay
 */
function synth(t, dur, freq, o) {
  const v = o.voices ?? 5;
  const start = Math.floor(t * RATE);
  const len = Math.floor((dur + (o.amp?.r ?? 0.1)) * RATE);
  const phases = Array.from({ length: v }, (_, i) => hash(i * 977 + Math.floor(freq)) % 1);
  const detunes = Array.from({ length: v }, (_, i) => (v === 1 ? 0 : (i / (v - 1) - 0.5) * 2) * (o.detune ?? 12));
  const pans = Array.from({ length: v }, (_, i) => (v === 1 ? 0 : (i / (v - 1) - 0.5) * 2) * (o.width ?? 0.8));
  const lpL = makeLP(), lpR = makeLP();
  const { a = 0.005, d = 0.2, s: su = 0.6, r = 0.1 } = o.amp ?? {};
  const out = o.out ?? MUSIC;
  for (let i = 0; i < len && start + i < total; i++) {
    const s = i / RATE;
    let L = 0, R = 0;
    for (let k = 0; k < v; k++) {
      const f = freq * 2 ** (detunes[k] / 1200) * (o.vib && s > 0.15 ? 1 + Math.sin(s * 2 * Math.PI * 5.5) * o.vib : 1);
      const dt = f / RATE;
      phases[k] = (phases[k] + dt) % 1;
      const w = o.square ? (phases[k] < 0.5 ? 1 : -1) : polyBlepSaw(phases[k], dt);
      L += w * (1 - pans[k]) * 0.5;
      R += w * (1 + pans[k]) * 0.5;
    }
    const fc = (o.cutoff ?? 1200) + (o.envAmt ?? 3000) * Math.exp(-s / (o.fDecay ?? 0.25));
    const env = adsr(s, dur, a, d, su, r) * (o.vol ?? 0.1) / Math.sqrt(v);
    const l = lpL(L, fc, o.q ?? 0.8) * env, rr = lpR(R, fc, o.q ?? 0.8) * env;
    out[0][start + i] += l; out[1][start + i] += rr;
    if (o.verb) { SEND_VERB[0][start + i] += l * o.verb; SEND_VERB[1][start + i] += rr * o.verb; }
    if (o.delay) { SEND_DELAY[0][start + i] += l * o.delay; SEND_DELAY[1][start + i] += rr * o.delay; }
  }
}
function sub(t, dur, freq, vol = 0.32) {
  const start = Math.floor(t * RATE);
  for (let i = 0; i < (dur + 0.03) * RATE && start + i < total; i++) {
    const s = i / RATE;
    const e = Math.min(1, s / 0.004) * (s > dur ? Math.max(0, 1 - (s - dur) / 0.03) : 1);
    const v = Math.sin(2 * Math.PI * freq * s) * e * vol;
    MUSIC[0][start + i] += v; MUSIC[1][start + i] += v;
  }
}
// drums
let lfsr = 0x5a5a;
const noise = () => { const bit = (lfsr ^ (lfsr >> 1)) & 1; lfsr = (lfsr >> 1) | (bit << 14); return ((lfsr & 0xff) / 127.5) - 1; };
function addDrum(t, len, fn, pan = 0, verb = 0) {
  const start = Math.floor(t * RATE);
  for (let i = 0; i < len * RATE && start + i < total; i++) {
    const v = fn(i / RATE);
    DRUMS[0][start + i] += v * (1 - pan) * 0.5 * 2; DRUMS[1][start + i] += v * (1 + pan) * 0.5 * 2;
    if (verb) { SEND_VERB[0][start + i] += v * verb; SEND_VERB[1][start + i] += v * verb; }
  }
}
function kick(t, vel = 1) {
  let ph = 0;
  addDrum(t, 0.4, (s) => { ph += (45 + 115 * Math.exp(-s * 30)) / RATE; return (Math.sin(ph * 2 * Math.PI) * Math.exp(-s * 7) + (s < 0.003 ? 0.3 : 0)) * 0.72 * vel; });
  kicks.push(t);
}
function clap(t, vel = 1) {
  for (const [off, dec, g] of [[0, 180, 0.5], [0.009, 180, 0.5], [0.018, 16, 0.7]]) {
    const hp = makeLP();
    addDrum(t + off, off === 0.018 ? 0.25 : 0.012, (s) => { const n = noise(); return (n - hp(n, 1200)) * Math.exp(-s * dec) * g * 0.32 * vel; }, 0, 0.25);
  }
}
function snare(t, vel = 1) {
  const lp = makeLP(); let ph = 0;
  addDrum(t, 0.25, (s) => { ph += 185 / RATE; const n = noise(); return (lp(n, 6000) * Math.exp(-s * 22) * 0.6 + Math.sin(ph * 2 * Math.PI) * Math.exp(-s * 35) * 0.5) * 0.3 * vel; }, 0, 0.18);
}
function hat(t, open, vel = 1, pan = 0.15) {
  const lp = makeLP();
  addDrum(t, open ? 0.28 : 0.05, (s) => { const n = noise(); return (n - lp(n, 7000)) * Math.exp(-s * (open ? 11 : 75)) * (open ? 0.13 : 0.1) * vel; }, pan);
}
function shaker(t, vel = 1) {
  const lp = makeLP();
  addDrum(t, 0.07, (s) => { const n = noise(); const env = Math.sin(Math.PI * Math.min(1, s / 0.06)); return (n - lp(n, 5000)) * env * 0.05 * vel; }, -0.35);
}
function tom(t, freq, pan) {
  let ph = 0;
  addDrum(t, 0.35, (s) => { ph += freq * (1 + 0.5 * Math.exp(-s * 18)) / RATE; return Math.sin(ph * 2 * Math.PI) * Math.exp(-s * 9) * 0.32; }, pan, 0.2);
}
function crash(t, vel = 1) {
  const lp = makeLP();
  addDrum(t, 2.2, (s) => { const n = noise(); return (n - lp(n, 4500)) * Math.exp(-s * 1.8) * 0.11 * vel; }, 0, 0.3);
}
function riser(t, dur) {
  const lpL = makeLP(), lpR = makeLP();
  const start = Math.floor(t * RATE);
  for (let i = 0; i < dur * RATE && start + i < total; i++) {
    const k = i / (dur * RATE);
    const n1 = noise(), n2 = noise();
    const fc = 300 + 9000 * k * k;
    MUSIC[0][start + i] += lpL(n1, fc, 2) * k * 0.12; MUSIC[1][start + i] += lpR(n2, fc, 2) * k * 0.12;
  }
}

// ----- harmony & melody -----------------------------------------------------------------
const CH = {
  Am7: ['A2', 'C4', 'E4', 'G4'], Dm7: ['D2', 'C4', 'F4', 'A4'], G6: ['G2', 'B3', 'D4', 'E4'], Cmaj7: ['C3', 'B3', 'E4', 'G4'],
  Fmaj7: ['F2', 'A3', 'C4', 'E4'], Em7: ['E2', 'B3', 'D4', 'G4'], E7: ['E2', 'G#3', 'D4', 'B3'], Bbmaj7: ['Bb2', 'A3', 'D4', 'F4'],
};
const PROG = ['Am7', 'Dm7', 'G6', 'Cmaj7', 'Fmaj7', 'Em7', 'Dm7', 'E7'];
const PROG_ADV = ['Am7', 'Fmaj7', 'Bbmaj7', 'E7'];
const HOOK = [
  'A5 - - C6 E6 - . . D6 - C6 - A5 - . .',
  'F5 - - A5 C6 - . . A5 - G5 - F5 - . .',
  'G5 - - B5 D6 - . . E6 - D6 - B5 - . .',
  'C6 - - - B5 - - - G5 - - - . . . .',
  'A5 - - C6 E6 - . . F6 - E6 - C6 - . .',
  'B5 - - D6 E6 - . . G6 - E6 - D6 - . .',
  'F6 - E6 - D6 - C6 - A5 - - - C6 - D6 -',
  'E6 - - - D6 - - - B5 - - - G#5 - - -',
];
const ADV = [
  'E5 - - - A5 - - - C6 - B5 - A5 - - -',
  'C6 - - - F6 - - - E6 - D6 - C6 - - -',
  'D6 - - - F6 - - - A6 - G6 - F6 - - -',
  'E6 - - - - - - - G#5 - B5 - D6 - - -',
];
const parse = (line) => {
  const out = [];
  line.split(/\s+/).forEach((tok, i) => {
    if (tok === '-') { if (out.length) out.at(-1).len += 1; return; }
    if (tok !== '.') out.push({ step: i, len: 1, m: midi(tok) });
  });
  return out;
};

// ----- arrangement -------------------------------------------------------------------------
const s2b = (s) => Math.round(s / BAR);
const SECTIONS = [
  ['intro', 0, 12], ['memory', 12, 44], ['lift', 44, 48], ['market', 48, 84], ['connect', 84, 128],
  ['adventure', 128, 148], ['wall', 148, 156], ['build', 156, 170], ['town', 170, 188], ['end', 188, 194],
].map(([name, a, b]) => ({ name, from: s2b(a), to: name === 'end' ? BARS : s2b(b) }));
const sectionAt = (bar) => SECTIONS.find((s) => bar >= s.from && bar < s.to) ?? SECTIONS.at(-1);

for (let bar = 0; bar < BARS; bar++) {
  const sec = sectionAt(bar);
  const local = bar - sec.from;
  const name = sec.name;
  const chorus = name === 'market' || name === 'town';
  const prog = name === 'adventure' ? PROG_ADV : PROG;
  const chord = CH[prog[bar % prog.length]].map(midi);
  const t0 = bar * BAR;
  const last8 = (bar + 1) % 8 === 0;
  const endBar = name === 'end';

  // --- drums
  if (local === 0 && ['memory', 'market', 'connect', 'adventure', 'town'].includes(name)) crash(t0);
  if (endBar) { if (local === 0) { kick(t0); crash(t0, 1.2); } }
  else if (name === 'wall') { /* breakdown: no drums */ }
  else {
    for (let s = 0; s < 16; s++) {
      const t = stepTime(bar, s) + (hash(bar * 16 + s) - 0.5) * 0.006; // ±3 ms
      const vel = 0.9 + (hash(bar * 31 + s) - 0.5) * 0.2;
      const beatStep = s % 4 === 0;
      if (name === 'build') {
        if (beatStep) kick(t, s % 8 === 0 ? 1 : 0.85);
        const every = local < 4 ? 8 : local < 8 ? 4 : 2;
        if (s % every === 0 && local >= 2) snare(t, 0.4 + 0.6 * (local / (sec.to - sec.from)));
        if (s % 2 === 0) hat(t, false, 0.6 * vel);
        continue;
      }
      if (name === 'intro') {
        if (local >= 2 && beatStep) kick(t, s % 8 === 0 ? 0.9 : 0.75);
        if (s % 2 === 0) shaker(t, vel * 0.8);
        continue;
      }
      if (beatStep) kick(t, s % 8 === 0 ? 1 : 0.86);
      if (s === 4 || s === 12) { clap(t, vel); snare(t + 0.01, 0.55 * vel); }
      if (s % 4 === 2) hat(t, true, 0.85 * vel); else if (s % 2 === 0) hat(t, false, (beatStep ? 0.55 : 0.75) * vel);
      if (chorus || name === 'adventure') shaker(t, s % 2 ? 0.6 * vel : 0.9 * vel);
      if (last8 && s >= 12 && name !== 'memory') {
        if (s === 12) tom(t, 190, -0.4); if (s === 13) tom(t, 150, 0); if (s === 14) tom(t, 115, 0.4);
      }
    }
  }

  // --- bass: sub + filtered detuned saw, octave disco pattern in 8ths (no 16th push)
  if (!['wall', 'intro'].includes(name) || (name === 'intro' && local >= 4)) {
    const root = chord[0] < 36 ? chord[0] + 12 : chord[0];
    const pat = endBar ? [[0, 0, 8]] : name === 'memory' && local < 4
      ? [[0, 0, 3], [8, 0, 3]]
      : [[0, 0, 1.6], [2, 12, 1.6], [4, 0, 1.6], [6, 12, 1.6], [8, 0, 1.6], [10, 12, 1.6], [12, 0, 1.6], [14, 7, 1.6]];
    for (const [s, o, len] of pat) {
      if (endBar && local > 0) break;
      const t = stepTime(bar, s);
      const dur = len * STEP;
      sub(t, dur, hz(root + o - 12), 0.26);
      synth(t, dur, hz(root + o), { voices: 2, detune: 8, width: 0.2, cutoff: 260, envAmt: 1400, fDecay: 0.09, q: 1.1, amp: { a: 0.003, d: 0.1, s: 0.7, r: 0.04 }, vol: 0.16 });
    }
  }

  // --- pad: wide supersaw, slow filter, in the calm and the big parts
  if (['intro', 'memory', 'wall', 'build', 'market', 'town', 'end', 'adventure'].includes(name) && !(endBar && local > 0)) {
    const vol = name === 'memory' ? 0.05 : chorus ? 0.06 : 0.07;
    const cutoff = name === 'intro' ? 500 + local * 120 : name === 'build' ? 600 + local * 300 : 1400;
    for (const m of chord.slice(1)) synth(t0, endBar ? BAR * 2.5 : BAR, hz(m), { voices: 7, detune: 18, width: 0.95, cutoff, envAmt: 400, fDecay: 0.8, q: 0.6, amp: { a: 0.25, d: 0.4, s: 0.8, r: endBar ? 1.6 : 0.35 }, vol, verb: 0.35 });
  }

  // --- pluck chords: off-beat stabs, disco style (connect / choruses)
  if (['connect', 'market', 'town', 'adventure'].includes(name)) {
    for (const s of [2, 6, 10, 14]) {
      if (name === 'connect' && s === 6 && local % 2) continue;
      for (const m of chord.slice(1)) synth(stepTime(bar, s), STEP * 1.2, hz(m + 12), { voices: 4, detune: 10, width: 0.7, cutoff: 500, envAmt: 4200, fDecay: 0.12, q: 0.9, amp: { a: 0.002, d: 0.18, s: 0, r: 0.08 }, vol: 0.06, verb: 0.15, delay: 0.12 });
    }
  }

  // --- gentle 8th arp texture in memory / wall (quiet, filtered, keeps motion under the voice)
  if (name === 'memory' || name === 'wall' || name === 'lift') {
    const tones = [chord[1] + 12, chord[2] + 12, chord[3] + 12, chord[2] + 24];
    for (let s = 0; s < 16; s += 2) synth(stepTime(bar, s), STEP * 1.5, hz(tones[(s / 2) % 4]), { voices: 3, detune: 7, width: 0.6, cutoff: 900, envAmt: 2200, fDecay: 0.1, amp: { a: 0.002, d: 0.2, s: 0, r: 0.1 }, vol: 0.045, delay: 0.25, verb: 0.2 });
  }

  // --- lead hook only in the two choruses; a calmer line in the adventure
  const lines = chorus ? HOOK : name === 'adventure' ? ADV : null;
  if (lines) {
    for (const n of parse(lines[local % lines.length])) {
      const t = stepTime(bar, n.step);
      synth(t, n.len * STEP * 0.95, hz(n.m), { voices: 3, detune: 9, width: 0.5, square: true, cutoff: 1800, envAmt: 2500, fDecay: 0.2, q: 0.8, vib: n.len > 2 ? 0.006 : 0, amp: { a: 0.01, d: 0.25, s: 0.65, r: 0.12 }, vol: 0.085, delay: 0.3, verb: 0.25 });
    }
  }

  if (name === 'lift' || (name === 'build' && local === sec.to - sec.from - 2)) riser(t0, name === 'lift' ? BAR * (sec.to - sec.from) : BAR * 2);
}

// ----- effects & mix ------------------------------------------------------------------------
// dotted-8th stereo ping-pong delay
{
  const d = Math.round(STEP * 3 * RATE);
  for (let i = d; i < total; i++) {
    SEND_DELAY[0][i] += SEND_DELAY[1][i - d] * 0.38;
    SEND_DELAY[1][i] += SEND_DELAY[0][i - d] * 0.38;
  }
}
// small Freeverb-style reverb: 4 combs + 2 allpasses per side
function reverb(input, offset) {
  const combs = [1116, 1188, 1277, 1356].map((n) => ({ buf: new Float32Array(n + offset), i: 0, lp: 0 }));
  const aps = [556, 441].map((n) => ({ buf: new Float32Array(n + offset), i: 0 }));
  const out = new Float32Array(total);
  for (let n = 0; n < total; n++) {
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * 0.6 + c.lp * 0.4;
      c.buf[c.i] = input[n] * 0.5 + c.lp * 0.8;
      c.i = (c.i + 1) % c.buf.length;
      acc += y;
    }
    for (const a of aps) {
      const b = a.buf[a.i];
      a.buf[a.i] = acc + b * 0.5;
      acc = b - acc * 0.5;
      a.i = (a.i + 1) % a.buf.length;
    }
    out[n] = acc * 0.25;
  }
  return out;
}
const verbL = reverb(SEND_VERB[0], 0);
const verbR = reverb(SEND_VERB[1], 23);
// sidechain pump on the music bus (~230 ms release)
const pump = new Float32Array(total).fill(1);
for (const t of kicks) {
  const s0 = Math.floor(t * RATE), rel = 0.23 * RATE;
  for (let i = 0; i < rel && s0 + i < total; i++) pump[s0 + i] = Math.min(pump[s0 + i], 0.62 + 0.38 * (i / rel) ** 1.6);
}
const out = new Int16Array(total * 2);
let peak = 0;
const mixed = [new Float32Array(total), new Float32Array(total)];
for (let i = 0; i < total; i++) {
  for (let c = 0; c < 2; c++) {
    const v = DRUMS[c][i] * 0.9 + MUSIC[c][i] * pump[i] + SEND_DELAY[c][i] * 0.6 + (c ? verbR[i] : verbL[i]) * 0.8;
    mixed[c][i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
}
const gain = 0.85 / peak;
for (let i = 0; i < total; i++) {
  const fade = Math.min(1, i / (0.03 * RATE), (total - i) / (1.2 * RATE));
  for (let c = 0; c < 2; c++) out[i * 2 + c] = Math.round(Math.tanh(mixed[c][i] * gain * 1.15) * 0.92 * fade * 32767);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + out.length * 2, 4); header.write('WAVE', 8); header.write('fmt ', 12);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(out.length * 2, 40);
fs.writeFileSync(process.argv[2] ?? 'bgm-v3.wav', Buffer.concat([header, Buffer.from(out.buffer)]));
console.log(`bgm v3: ${BPM.toFixed(2)} BPM, ${BARS} bars, ${FILM_SECONDS}s, stereo`);
