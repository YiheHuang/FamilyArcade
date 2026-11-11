import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RATE = 44100;
const DURATION = 45;
const outDir = path.resolve(import.meta.dirname, '..', 'public', 'audio');
mkdirSync(outDir, { recursive: true });

function writeWav(name, samples, rate = RATE) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) => {
    const clamped = Math.max(-1, Math.min(1, value));
    data.writeInt16LE(Math.round(clamped * 32767), i * 2);
  });
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path.join(outDir, name), Buffer.concat([header, data]));
  console.log(`${name}: ${(samples.length / rate).toFixed(1)}s`);
}

const chords = [
  [130.81, 196.0, 261.63],
  [98.0, 146.83, 196.0],
  [110.0, 164.81, 220.0],
  [87.31, 130.81, 174.61],
];
const melody = [523.25, 587.33, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33];
const samples = new Float32Array(RATE * DURATION);
let noiseSeed = 1234567;
function noise() {
  noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7fffffff;
  return (noiseSeed / 0x7fffffff) * 2 - 1;
}

for (let i = 0; i < samples.length; i++) {
  const t = i / RATE;
  const chordIndex = Math.floor(t / 4) % chords.length;
  const local = t % 4;
  const chord = chords[chordIndex];
  const padEnvelope = Math.min(1, local / 0.8, (4 - local) / 0.8);
  let value = 0;
  chord.forEach((frequency, index) => {
    const gain = 0.075 / (index + 1);
    value += Math.sin(2 * Math.PI * frequency * t) * gain * Math.max(0, padEnvelope);
    value += Math.sin(2 * Math.PI * frequency * 2 * t + 0.3) * gain * 0.25 * Math.max(0, padEnvelope);
  });
  const beat = Math.floor(t / 1.5);
  const beatLocal = t % 1.5;
  const note = melody[beat % melody.length];
  const pluck = Math.exp(-beatLocal * 4.2) * 0.055;
  value += Math.sin(2 * Math.PI * note * t) * pluck;
  value += Math.sin(2 * Math.PI * note * 2 * t) * pluck * 0.2;
  value += noise() * 0.0035 * (0.4 + 0.6 * Math.sin(t * 0.7) ** 2);
  const fadeIn = Math.min(1, t / 1.5);
  const fadeOut = Math.min(1, (DURATION - t) / 2.5);
  samples[i] = value * 0.55 * Math.max(0, fadeIn) * Math.max(0, fadeOut);
}

writeWav('bed.wav', samples);

const chime = new Float32Array(Math.round(RATE * 1.6));
[659.25, 880.0, 1046.5].forEach((frequency, index) => {
  const start = index * 0.11;
  for (let i = 0; i < chime.length; i++) {
    const t = i / RATE;
    if (t < start) continue;
    const local = t - start;
    chime[i] += Math.sin(2 * Math.PI * frequency * local) * Math.exp(-local * 3.4) * 0.16;
    chime[i] += Math.sin(2 * Math.PI * frequency * 2.01 * local) * Math.exp(-local * 5.2) * 0.04;
  }
});
writeWav('chime.wav', chime);

const wind = new Float32Array(Math.round(RATE * 1.2));
let smooth = 0;
for (let i = 0; i < wind.length; i++) {
  const t = i / RATE;
  smooth = smooth * 0.96 + noise() * 0.04;
  const envelope = Math.sin(Math.min(1, t / 1.2) * Math.PI);
  wind[i] = smooth * envelope * 0.38;
}
writeWav('wind.wav', wind);
