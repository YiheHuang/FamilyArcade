export type SoundKind = 'roll' | 'ladder' | 'snake' | 'win' | 'click';

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

const NOTES: Record<SoundKind, number[]> = {
  click: [392],
  roll: [330, 392, 523],
  ladder: [523.25, 659.25, 783.99],
  snake: [392, 329.63, 261.63],
  win: [523.25, 659.25, 783.99, 1046.5],
};

export function chime(kind: SoundKind = 'roll'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  const notes = NOTES[kind];
  notes.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = kind === 'snake' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    const start = now + index * (kind === 'win' ? 0.12 : 0.08);
    const length = kind === 'win' ? 0.45 : 0.28;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'click' ? 0.04 : 0.075, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  });
}
