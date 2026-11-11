let ctx: AudioContext | null = null;

export type Chime = 'place' | 'shot' | 'hit' | 'sunk' | 'miss' | 'win' | 'sunkLose';

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

const NOTES: Record<Chime, { hz: number; at: number; len: number; type?: OscillatorType; gain?: number }[]> = {
  place: [{ hz: 392, at: 0, len: 0.12, gain: 0.05 }],
  shot: [{ hz: 150, at: 0, len: 0.16, type: 'triangle', gain: 0.08 }],
  miss: [{ hz: 220, at: 0, len: 0.14, type: 'sine', gain: 0.05 }],
  hit: [
    { hz: 392, at: 0, len: 0.18, type: 'triangle', gain: 0.08 },
    { hz: 587.33, at: 0.07, len: 0.22, type: 'triangle', gain: 0.07 },
  ],
  sunk: [
    { hz: 329.63, at: 0, len: 0.2, type: 'triangle', gain: 0.08 },
    { hz: 246.94, at: 0.1, len: 0.26, type: 'triangle', gain: 0.07 },
    { hz: 164.81, at: 0.2, len: 0.32, type: 'sine', gain: 0.06 },
  ],
  sunkLose: [
    { hz: 246.94, at: 0, len: 0.24, type: 'sine', gain: 0.07 },
    { hz: 196, at: 0.13, len: 0.3, type: 'sine', gain: 0.06 },
    { hz: 146.83, at: 0.27, len: 0.42, type: 'sine', gain: 0.05 },
  ],
  win: [
    { hz: 523.25, at: 0, len: 0.24, type: 'triangle', gain: 0.07 },
    { hz: 659.25, at: 0.12, len: 0.26, type: 'triangle', gain: 0.07 },
    { hz: 783.99, at: 0.24, len: 0.3, type: 'triangle', gain: 0.06 },
    { hz: 1046.5, at: 0.38, len: 0.5, type: 'triangle', gain: 0.05 },
  ],
};

export function chime(kind: Chime = 'place'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  for (const note of NOTES[kind]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = note.type ?? 'sine';
    osc.frequency.value = note.hz;
    const start = now + note.at;
    const level = note.gain ?? 0.06;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.len);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + note.len + 0.02);
  }
}
