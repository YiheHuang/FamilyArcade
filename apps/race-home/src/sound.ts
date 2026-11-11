let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

export type SoundKind = 'roll' | 'move' | 'capture' | 'home' | 'win';

const SEQUENCES: Record<SoundKind, { notes: number[]; type: OscillatorType; gain: number; step: number }> = {
  roll: { notes: [196, 233], type: 'square', gain: 0.025, step: 0.055 },
  move: { notes: [523.25], type: 'sine', gain: 0.05, step: 0.05 },
  capture: { notes: [392, 293.66, 220], type: 'triangle', gain: 0.06, step: 0.07 },
  home: { notes: [523.25, 659.25, 783.99], type: 'sine', gain: 0.065, step: 0.08 },
  win: { notes: [523.25, 659.25, 783.99, 1046.5], type: 'sine', gain: 0.075, step: 0.11 },
};

export function chime(kind: SoundKind = 'move'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const { notes, type, gain, step } = SEQUENCES[kind];
  const now = audio.currentTime;
  notes.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const volume = audio.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    const start = now + index * step;
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + step * 1.9);
    osc.connect(volume).connect(audio.destination);
    osc.start(start);
    osc.stop(start + step * 2);
  });
}
