/**
 * Synthesises every sound in the promo — no third-party audio.
 *
 * The timbres follow the app's own Web Audio recipes (packages/client/src/ui/sfx.ts):
 * triangle/sine plucks with exponential decays. A soft filtered-noise whoosh is
 * added for the paper transitions.
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
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
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

const TWO_PI = Math.PI * 2;
const decay = (t, attack, tau) => {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) / tau);
};

/** one pluck with an optional pitch slide, in the app's triangle/sine language */
function pluck(name, { from, to = from, seconds = 0.4, gain = 0.16, type = "triangle" }) {
  const buf = buffer(seconds);
  for (let i = 0; i < buf.l.length; i++) {
    const t = i / SR;
    const f = from + (to - from) * Math.min(1, t / 0.09);
    const phase = TWO_PI * f * t;
    const wave =
      type === "triangle"
        ? (2 / Math.PI) * Math.asin(Math.sin(phase))
        : type === "sine"
          ? Math.sin(phase)
          : Math.sin(phase);
    const env = decay(t, 0.004, seconds * 0.28);
    const body = wave * 0.7 + Math.sin(phase * 2) * 0.06;
    render(buf, i, body * env * gain);
  }
  writeWav(name, buf);
}

// gem pick: 900 → 1250 triangle, three gentle transpositions for a three-gem take
pluck("gem-0.wav", { from: 900, to: 1250, seconds: 0.24, gain: 0.15 });
pluck("gem-1.wav", { from: 990, to: 1375, seconds: 0.24, gain: 0.14 });
pluck("gem-2.wav", { from: 1080, to: 1500, seconds: 0.26, gain: 0.13 });

// gem take: 520 + 790 (the app's two-tone confirmation)
{
  const buf = buffer(0.4);
  for (let i = 0; i < buf.l.length; i++) {
    const t = i / SR;
    render(buf, i, Math.sin(TWO_PI * 520 * t) * 0.14 * decay(t, 0.004, 0.09));
    if (t >= 0.055) {
      const u = t - 0.055;
      render(buf, i, Math.sin(TWO_PI * 790 * u) * 0.1 * decay(u, 0.004, 0.11));
    }
  }
  writeWav("gem-take.wav", buf);
}

// buy: 523 / 659 / 784 (three-note rise)
{
  const buf = buffer(0.9);
  const notes = [
    { f: 523.25, at: 0 },
    { f: 659.25, at: 0.065 },
    { f: 783.99, at: 0.13 },
  ];
  for (const note of notes) {
    const start = Math.round(note.at * SR);
    for (let i = start; i < buf.l.length; i++) {
      const t = (i - start) / SR;
      render(buf, i, Math.sin(TWO_PI * note.f * t) * 0.105 * decay(t, 0.004, 0.22));
    }
  }
  writeWav("buy.wav", buf);
}

// noble: 523 / 659 / 880, longer tails
{
  const buf = buffer(1.4);
  const notes = [
    { f: 523.25, at: 0 },
    { f: 659.25, at: 0.09 },
    { f: 880.0, at: 0.18 },
  ];
  for (const note of notes) {
    const start = Math.round(note.at * SR);
    for (let i = start; i < buf.l.length; i++) {
      const t = (i - start) / SR;
      render(buf, i, Math.sin(TWO_PI * note.f * t) * 0.1 * decay(t, 0.006, 0.42));
    }
  }
  writeWav("noble.wav", buf);
}

// join: 740 / 988 (the app's "your turn")
{
  const buf = buffer(0.6);
  for (let i = 0; i < buf.l.length; i++) {
    const t = i / SR;
    render(buf, i, Math.sin(TWO_PI * 740 * t) * 0.09 * decay(t, 0.003, 0.07));
    if (t >= 0.08) {
      const u = t - 0.08;
      render(buf, i, Math.sin(TWO_PI * 988 * u) * 0.085 * decay(u, 0.003, 0.14));
    }
  }
  writeWav("join.wav", buf);
}

// score ding: 880 + 1318
{
  const buf = buffer(0.8);
  for (const f of [880, 1318.5]) {
    for (let i = 0; i < buf.l.length; i++) {
      const t = i / SR;
      render(buf, i, Math.sin(TWO_PI * f * t) * 0.07 * decay(t, 0.005, 0.22));
    }
  }
  writeWav("score.wav", buf);
}

// ui tick
{
  const buf = buffer(0.18);
  for (let i = 0; i < buf.l.length; i++) {
    const t = i / SR;
    render(buf, i, Math.sin(TWO_PI * 1200 * t) * 0.06 * decay(t, 0.002, 0.024));
  }
  writeWav("tick.wav", buf);
}

// paper transition whoosh: band-passed noise, slow rise and fall
{
  const seconds = 1.1;
  const buf = buffer(seconds);
  let low = 0;
  let high = 0;
  for (let i = 0; i < buf.l.length; i++) {
    const t = i / SR;
    const noise = Math.random() * 2 - 1;
    low = low * 0.86 + noise * 0.14;
    high = noise - low;
    const band = low * 0.7 + high * 0.3;
    const env = Math.sin(Math.min(1, t / seconds) * Math.PI) ** 2;
    render(buf, i, band * env * 0.12);
  }
  writeWav("whoosh.wav", buf);
}

// end chime: 659 / 880 / 1318, long tail
{
  const seconds = 2.8;
  const buf = buffer(seconds);
  const notes = [
    { f: 659.25, at: 0 },
    { f: 880.0, at: 0.16 },
    { f: 1318.51, at: 0.34 },
  ];
  for (const note of notes) {
    const start = Math.round(note.at * SR);
    for (let i = start; i < buf.l.length; i++) {
      const t = (i - start) / SR;
      render(buf, i, Math.sin(TWO_PI * note.f * t) * 0.085 * decay(t, 0.008, 0.62));
    }
  }
  writeWav("chime.wav", buf);
}

console.log(`written to ${outDir}`);
