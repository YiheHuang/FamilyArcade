import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RATE = 44100;
const root = process.cwd();

function writeWav(rel, samples, rate = RATE) {
  const file = path.join(root, 'public', 'audio', rel);
  mkdirSync(path.dirname(file), { recursive: true });
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  writeFileSync(file, buffer);
  console.log('audio', rel, `${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
}

function bgm() {
  const seconds = 50;
  const total = seconds * RATE;
  const out = new Float32Array(total);
  const chords = [
    [110, 164.81, 220, 277.18],
    [98, 146.83, 196, 246.94],
    [87.31, 130.81, 174.61, 220],
    [98, 146.83, 196, 293.66],
    [110, 164.81, 220, 329.63],
    [98, 146.83, 196, 246.94],
  ];
  for (let s = 0; s < total; s++) {
    const t = s / RATE;
    const chordIndex = Math.min(chords.length - 1, Math.floor((t / seconds) * chords.length));
    const chord = chords[chordIndex];
    const next = chords[Math.min(chords.length - 1, chordIndex + 1)];
    const local = (t / seconds) * chords.length - chordIndex;
    const blend = Math.min(1, Math.max(0, (local - 0.82) / 0.18));
    let value = 0;
    for (let i = 0; i < chord.length; i++) {
      const f = chord[i] * (1 - blend) + next[i] * blend;
      value += Math.sin(2 * Math.PI * f * t) * (0.036 / (i + 1));
      value += Math.sin(2 * Math.PI * f * 0.5 * t + 1.3) * (0.012 / (i + 1));
    }
    const tremolo = 0.82 + 0.18 * Math.sin(2 * Math.PI * 0.11 * t);
    const fade = Math.min(1, t / 2.2) * Math.min(1, (seconds - t) / 2.5);
    out[s] = value * tremolo * fade;
  }
  writeWav('bgm.wav', out);
}

function place() {
  const total = Math.round(0.28 * RATE);
  const out = new Float32Array(total);
  for (let s = 0; s < total; s++) {
    const t = s / RATE;
    const env = Math.exp(-t * 22);
    out[s] = (Math.sin(2 * Math.PI * 640 * t) * 0.16 + Math.sin(2 * Math.PI * 960 * t) * 0.06) * env;
  }
  writeWav('place.wav', out);
}

function chime() {
  const total = Math.round(1.8 * RATE);
  const out = new Float32Array(total);
  const notes = [659.25, 783.99, 987.77, 1318.51];
  for (let s = 0; s < total; s++) {
    const t = s / RATE;
    let value = 0;
    notes.forEach((f, i) => {
      const start = i * 0.07;
      if (t < start) return;
      const local = t - start;
      value += Math.sin(2 * Math.PI * f * local) * Math.exp(-local * 3.4) * 0.075;
    });
    out[s] = value;
  }
  writeWav('chime.wav', out);
}

function tick() {
  const total = Math.round(0.1 * RATE);
  const out = new Float32Array(total);
  for (let s = 0; s < total; s++) {
    const t = s / RATE;
    out[s] = Math.sin(2 * Math.PI * 1180 * t) * Math.exp(-t * 60) * 0.1;
  }
  writeWav('tick.wav', out);
}

bgm();
place();
chime();
tick();
