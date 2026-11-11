/**
 * Synthesises the promo's background score: 48.0s at 80 BPM (16 bars), a sparse
 * felt-piano pattern over a warm pad and soft bass, with a small room reverb.
 *
 * Everything is generated here — no samples, no licensing questions.
 * Run: node scripts/gen-bgm.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 48000;
const DURATION = 48;
const BPM = 80;
const BEAT = 60 / BPM; // 0.75s
const BAR = BEAT * 4; // 3s
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "audio");
mkdirSync(outDir, { recursive: true });

// deterministic humanisation
let seed = 20261020;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const n = Math.round(DURATION * SR);
const dry = { l: new Float32Array(n), r: new Float32Array(n) };
const wet = { l: new Float32Array(n), r: new Float32Array(n) };

const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const TWO_PI = Math.PI * 2;

function add(bus, i, v, pan = 0) {
  if (i < 0 || i >= n) return;
  const l = Math.cos(((pan + 1) * Math.PI) / 4);
  const r = Math.sin(((pan + 1) * Math.PI) / 4);
  bus.l[i] += v * l * 1.4142;
  bus.r[i] += v * r * 1.4142;
}

/** felt piano: soft attack, fast-decaying harmonics, a whisper of hammer noise */
function piano(t0, midi, vel, pan) {
  const f = freq(midi);
  const start = Math.round(t0 * SR);
  const len = Math.round(2.6 * SR);
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.62);
    const body =
      Math.sin(TWO_PI * f * t) +
      0.24 * Math.sin(TWO_PI * 2 * f * t) * Math.exp(-t / 0.28) +
      0.08 * Math.sin(TWO_PI * 3 * f * t) * Math.exp(-t / 0.16);
    add(dry, start + k, body * env * 0.16 * vel, pan);
    add(wet, start + k, body * env * 0.16 * vel, pan);
  }
  // hammer noise
  for (let k = 0; k < 0.012 * SR; k++) {
    const t = k / SR;
    add(dry, start + k, (rnd() * 2 - 1) * Math.exp(-t / 0.0022) * 0.02 * vel, pan);
  }
}

/** music-box motif voice (soft, bell-like, an octave above the pad) */
function bell(t0, midi, vel, pan) {
  const f = freq(midi);
  const start = Math.round(t0 * SR);
  const len = Math.round(1.8 * SR);
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const env = (1 - Math.exp(-t / 0.003)) * Math.exp(-t / 0.5);
    const body = Math.sin(TWO_PI * f * t) + 0.12 * Math.sin(TWO_PI * 2.01 * f * t);
    add(dry, start + k, body * env * 0.05 * vel, pan);
    add(wet, start + k, body * env * 0.05 * vel, pan);
  }
}

/** warm sustained pad, one bar per chord */
function pad(t0, midis, vel) {
  const start = Math.round(t0 * SR);
  const len = Math.round((BAR + 1.2) * SR);
  for (const midi of midis) {
    const f = freq(midi);
    const detune = 1 + (rnd() - 0.5) * 0.0016;
    for (let k = 0; k < len; k++) {
      const t = k / SR;
      const attack = Math.min(1, t / 0.5);
      const release = Math.min(1, Math.max(0, (BAR + 1.2 - t) / 0.9));
      const env = attack * release;
      const lfo = 1 + 0.12 * Math.sin(TWO_PI * 0.17 * t);
      add(dry, start + k, Math.sin(TWO_PI * f * detune * t) * env * 0.03 * vel * lfo, -0.3);
      add(dry, start + k, Math.sin(TWO_PI * f * (2 - detune) * t + 0.4) * env * 0.02 * vel * lfo, 0.3);
      add(wet, start + k, Math.sin(TWO_PI * f * detune * t) * env * 0.02 * vel, -0.3);
    }
  }
}

function bass(t0, midi, vel) {
  const f = freq(midi);
  const start = Math.round(t0 * SR);
  const len = Math.round(1.6 * SR);
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const env = (1 - Math.exp(-t / 0.01)) * Math.exp(-t / 0.8);
    const body = Math.sin(TWO_PI * f * t) + 0.12 * Math.sin(TWO_PI * 2 * f * t);
    add(dry, start + k, body * env * 0.1 * vel, 0);
  }
}

// ---------------------------------------------------------------- composition
/** [bass midi, pad chord, piano dyad, upper tone] per bar */
const BARS = [
  { bass: 41, chord: [53, 57, 60, 64], dyad: [57, 64], upper: 60 }, // Fmaj7
  { bass: 40, chord: [52, 55, 60, 64], dyad: [55, 64], upper: 60 }, // C/E
  { bass: 38, chord: [50, 53, 57, 60], dyad: [53, 60], upper: 57 }, // Dm7
  { bass: 43, chord: [55, 59, 62], dyad: [55, 62], upper: 59 }, // G
  { bass: 45, chord: [57, 60, 64], dyad: [60, 64], upper: 57 }, // Am
  { bass: 41, chord: [53, 57, 60, 64], dyad: [57, 64], upper: 60 }, // Fmaj7
  { bass: 36, chord: [48, 52, 55, 60], dyad: [52, 60], upper: 55 }, // C
  { bass: 43, chord: [55, 59, 62], dyad: [55, 62], upper: 59 }, // G
  { bass: 41, chord: [53, 57, 60], dyad: [57, 60], upper: 65 }, // F
  { bass: 43, chord: [55, 59, 62], dyad: [59, 62], upper: 67 }, // G
  { bass: 40, chord: [52, 55, 59, 62], dyad: [55, 62], upper: 64 }, // Em7
  { bass: 45, chord: [57, 60, 64], dyad: [60, 64], upper: 69 }, // Am
  { bass: 38, chord: [50, 53, 57, 60], dyad: [53, 60], upper: 65 }, // Dm7
  { bass: 43, chord: [55, 59, 62], dyad: [55, 62], upper: 62 }, // G
  { bass: 36, chord: [48, 52, 55, 62], dyad: [52, 62], upper: 64 }, // Cadd9
  { bass: 36, chord: [48, 52, 55, 60], dyad: [52, 60], upper: 55 }, // C
];

/** sparse top-line, only through the middle of the film */
const MOTIF = [
  null,
  null,
  null,
  null,
  [64, 2.5],
  [72, 1.0],
  [67, 3.5],
  [62, 2.0],
  [65, 0.5],
  [69, 2.5],
  [67, 1.5],
  [64, 3.5],
  null,
  null,
  null,
  null,
];

const jitter = () => (rnd() - 0.5) * 0.018; // ±9ms
const vel = (base) => base * (0.9 + rnd() * 0.18);

for (let bar = 0; bar < 16; bar++) {
  const t = bar * BAR;
  const c = BARS[bar];
  bass(t + jitter(), c.bass, vel(1));
  bass(t + 2 * BEAT + jitter(), c.bass, vel(0.7));
  pad(t, c.chord, bar < 4 ? 0.8 : 1);
  piano(t + jitter(), c.dyad[0], vel(0.9), -0.16);
  piano(t + BEAT / 2 + jitter(), c.dyad[1], vel(0.6), 0.14);
  piano(t + 2 * BEAT + jitter(), c.upper, vel(0.55), -0.1);
  const m = MOTIF[bar];
  if (m) bell(t + m[1] * BEAT + jitter(), m[0], 0.9, 0.2);
}

// ------------------------------------------------------------------- reverb
function reverbChannel(src, spread) {
  const out = new Float32Array(n);
  const combs = [1557, 1617, 1491, 1422].map((d) => ({
    buf: new Float32Array(Math.round(d * (1 + spread))),
    idx: 0,
    lp: 0,
  }));
  const aps = [225, 556].map((d) => ({
    buf: new Float32Array(Math.round(d * (1 + spread))),
    idx: 0,
  }));
  for (let i = 0; i < n; i++) {
    const x = src[i];
    let y = 0;
    for (const c of combs) {
      const v = c.buf[c.idx];
      c.lp = v * 0.7 + c.lp * 0.3;
      c.buf[c.idx] = x + c.lp * 0.72;
      c.idx = (c.idx + 1) % c.buf.length;
      y += v;
    }
    for (const a of aps) {
      const v = a.buf[a.idx];
      a.buf[a.idx] = y + v * 0.5;
      a.idx = (a.idx + 1) % a.buf.length;
      y = v - y * 0.5;
    }
    out[i] = y;
  }
  return out;
}
const revL = reverbChannel(wet.l, 0.0);
const revR = reverbChannel(wet.r, 0.017);

// --------------------------------------------------------------------- mix
const mix = { l: new Float32Array(n), r: new Float32Array(n) };
for (let i = 0; i < n; i++) {
  const t = i / SR;
  const fadeIn = Math.min(1, t / 1.4);
  const fadeOut = Math.min(1, Math.max(0, (DURATION - t) / 2.6));
  const g = fadeIn * fadeOut;
  mix.l[i] = (dry.l[i] + revL[i] * 0.22) * g;
  mix.r[i] = (dry.r[i] + revR[i] * 0.22) * g;
}

// normalise to a comfortable bed level
let peak = 0;
for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mix.l[i]), Math.abs(mix.r[i]));
const gain = 0.28 / (peak || 1); // ~ -11 dBFS peak: sits under the voice
for (let i = 0; i < n; i++) {
  mix.l[i] *= gain;
  mix.r[i] *= gain;
}

// --------------------------------------------------------------------- write
const data = Buffer.alloc(n * 4);
for (let i = 0; i < n; i++) {
  data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(mix.l[i] * 32767))), i * 4);
  data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(mix.r[i] * 32767))), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);
writeFileSync(join(outDir, "bgm.wav"), Buffer.concat([header, data]));

let outPeak = 0;
let sum = 0;
for (let i = 0; i < n; i++) {
  outPeak = Math.max(outPeak, Math.abs(mix.l[i]), Math.abs(mix.r[i]));
  sum += mix.l[i] * mix.l[i] + mix.r[i] * mix.r[i];
}
console.log(
  `bgm.wav  ${DURATION.toFixed(1)}s  peak ${(20 * Math.log10(outPeak)).toFixed(1)} dBFS  ` +
    `rms ${(10 * Math.log10(sum / (2 * n))).toFixed(1)} dBFS`,
);
