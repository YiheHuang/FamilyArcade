#!/usr/bin/env node
/** Original 49-second synth bed for the Sweet Carousel promo. No samples. */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SAMPLE_RATE = 44100;
const SECONDS = 49;
const TOTAL = SAMPLE_RATE * SECONDS;
const data = new Float64Array(TOTAL);

const chords = [
  [261.63, 329.63, 392.0], // C
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [196.0, 246.94, 293.66], // G
];
const tones = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63];

for (let i = 0; i < TOTAL; i++) {
  const t = i / SAMPLE_RATE;
  const chord = chords[Math.floor(t / 4) % chords.length];
  const local = t % 4;
  const envelope = Math.min(1, local / 0.35) * Math.min(1, (4 - local) / 0.6);
  let value = 0;
  for (const frequency of chord) {
    value += Math.sin(2 * Math.PI * frequency * t) * 0.018;
  }
  value *= envelope;
  const step = Math.floor(t / 0.5);
  const bellLocal = t % 0.5;
  if (bellLocal < 1.4) {
    const bellFreq = tones[step % tones.length];
    const bellEnv = Math.exp(-bellLocal * 3.2) * Math.min(1, bellLocal / 0.01);
    value += Math.sin(2 * Math.PI * bellFreq * 2 * t) * 0.052 * bellEnv;
    value += Math.sin(2 * Math.PI * bellFreq * 3.01 * t) * 0.018 * bellEnv;
  }
  // Gentle low pulse every two seconds.
  value += Math.sin(2 * Math.PI * 65.4 * t) * 0.012 * (0.5 + 0.5 * Math.sin(2 * Math.PI * t * 0.25));
  data[i] = Math.max(-0.8, Math.min(0.8, value));
}

const bytes = Buffer.alloc(44 + TOTAL * 2);
bytes.write('RIFF', 0);
bytes.writeUInt32LE(36 + TOTAL * 2, 4);
bytes.write('WAVE', 8);
bytes.write('fmt ', 12);
bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20);
bytes.writeUInt16LE(1, 22);
bytes.writeUInt32LE(SAMPLE_RATE, 24);
bytes.writeUInt32LE(SAMPLE_RATE * 2, 28);
bytes.writeUInt16LE(2, 32);
bytes.writeUInt16LE(16, 34);
bytes.write('data', 36);
bytes.writeUInt32LE(TOTAL * 2, 40);
for (let i = 0; i < TOTAL; i++) {
  bytes.writeInt16LE(Math.round(data[i] * 32767), 44 + i * 2);
}
mkdirSync(path.resolve('public/audio'), { recursive: true });
writeFileSync(path.resolve('public/audio/bgm.wav'), bytes);
console.log('public/audio/bgm.wav', bytes.length, 'bytes');
