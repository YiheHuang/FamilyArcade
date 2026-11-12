let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

export type SoundKind =
  | 'place'
  | 'win'
  | 'draw'
  | 'roll'
  | 'bid'
  | 'reveal'
  | 'lose';

const NOTES: Record<SoundKind, number[]> = {
  place: [523.25],
  win: [523.25, 659.25, 783.99],
  draw: [392, 329.63],
  roll: [196, 246.94, 293.66],
  bid: [660, 880],
  reveal: [440, 329.63],
  lose: [220, 164.81],
};

const LENGTH: Record<SoundKind, number> = {
  place: 0.24,
  win: 0.32,
  draw: 0.3,
  roll: 0.12,
  bid: 0.14,
  reveal: 0.3,
  lose: 0.36,
};

export function chime(kind: SoundKind = 'place'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  const notes = NOTES[kind] ?? NOTES.place;
  notes.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = kind === 'roll' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    const start = now + index * (kind === 'roll' ? 0.05 : 0.08);
    const length = LENGTH[kind] ?? 0.25;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'roll' ? 0.05 : 0.07, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  });
}
