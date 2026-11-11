/**
 * Synthesises every sound in the promo — no third-party audio.
 *
 * The timbres follow the app's own WebAudio recipe (sine/triangle plucks with
 * exponential decays), so the video sounds like the game feels.
 *
 * Run: node scripts/gen-audio.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 48000;
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "audio");
mkdirSync(outDir, { recursive: true });

/** create a stereo buffer of `seconds` */
const buffer = (seconds) => ({
  l: new Float32Array(Math.ceil(seconds * SR)),
  r: new Float32Array(Math.ceil(seconds * SR)),
});

function render(buf, i, v) {
  if (i < 0 || i >= buf.l.length) return;
  buf.l[i] += v;
  buf.r[i] += v;
}

function writeWav(name, buf) {
  const frames = buf.l.length;
  const data = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, buf.l[i]));
    const r = Math.max(-1, Math.min(1, buf.r[i]));
    data.writeInt16LE((l * 32767) | 0, i * 4);
    data.writeInt16LE((r * 32767) | 0, i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(2, 22); // stereo
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(join(outDir, name), Buffer.concat([header, data]));
  let peak = 0;
  for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(buf.l[i]), Math.abs(buf.r[i]));
  console.log(`${name.padEnd(16)} ${(frames / SR).toFixed(2)}s  peak ${(20 * Math.log10(peak || 1e-9)).toFixed(1)} dBFS`);
}

/** exponential decay envelope, sampled at t seconds after the onset */
const decay = (t, attack, tau) => {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) / tau);
};

const TWO_PI = Math.PI * 2;

// (ambience now lives in gen-bgm.mjs ? the score replaces the old drone)
// ------------------------------------------------------------- piece placement
const placeFreqs = [523.25, 587.33, 659.25, 783.99]; // one pitch per seat
placeFreqs.forEach((f, seat) => {
  const seconds = 0.34;
  const buf = buffer(seconds);
  const n = buf.l.length;
  // a tiny wooden click
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (t > 0.012) break;
    render(buf, i, (Math.random() * 2 - 1) * 0.11 * Math.exp(-t / 0.0025));
  }
  // the pluck
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = decay(t, 0.004, 0.085);
    const body = Math.sin(TWO_PI * f * t) * 0.13 + Math.sin(TWO_PI * f * 2 * t) * 0.026;
    render(buf, i, body * env);
  }
  writeWav(`place-${seat}.wav`, buf);
});

// ----------------------------------------------------------------- invalid move
{
  const seconds = 0.3;
  const buf = buffer(seconds);
  for (let i = 0; i < buf.l.length; i++) {
    const t = i / SR;
    const env = decay(t, 0.003, 0.075);
    render(buf, i, Math.sin(TWO_PI * 174.61 * t) * 0.16 * env + (t < 0.02 ? (Math.random() * 2 - 1) * 0.05 : 0));
  }
  writeWav("invalid.wav", buf);
}

// -------------------------------------------------------------------- highlights
function dingFile(name, freqs) {
  const seconds = 0.85;
  const buf = buffer(seconds);
  for (const f of freqs) {
    for (let i = 0; i < buf.l.length; i++) {
      const t = i / SR;
      render(buf, i, Math.sin(TWO_PI * f * t) * 0.085 * decay(t, 0.006, 0.22));
    }
  }
  writeWav(name, buf);
}
dingFile("ding-15.wav", [880, 1318.5]);
dingFile("ding-20.wav", [987.77, 1480]);

// -------------------------------------------------------------------- end chime
{
  const seconds = 2.6;
  const buf = buffer(seconds);
  const notes = [
    { f: 659.25, at: 0.0 },
    { f: 880.0, at: 0.16 },
    { f: 1318.51, at: 0.34 },
  ];
  for (const note of notes) {
    const start = Math.floor(note.at * SR);
    for (let i = start; i < buf.l.length; i++) {
      const t = (i - start) / SR;
      render(buf, i, Math.sin(TWO_PI * note.f * t) * 0.075 * decay(t, 0.008, 0.55));
    }
  }
  writeWav("chime.wav", buf);
}

// ---------------------------------------------------------------------- ui ticks
{
  const seconds = 0.16;
  const buf = buffer(seconds);
  for (let i = 0; i < buf.l.length; i++) {
    const t = i / SR;
    render(buf, i, Math.sin(TWO_PI * 1200 * t) * 0.05 * decay(t, 0.002, 0.02));
  }
  writeWav("tick.wav", buf);
}

console.log(`written to ${outDir}`);
