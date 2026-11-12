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
  | 'tile'
  | 'draw'
  | 'claim'
  | 'kong'
  | 'win'
  | 'lose'
  | 'draw-game';

const NOTES: Record<SoundKind, number[]> = {
  tile: [392],
  draw: [440, 494],
  claim: [523.25, 659.25],
  kong: [196, 261.63, 392],
  win: [523.25, 659.25, 783.99, 1046.5],
  lose: [392, 329.63, 261.63],
  'draw-game': [329.63, 293.66],
};

export function chime(kind: SoundKind = 'tile'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  const notes = NOTES[kind];
  notes.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = kind === 'kong' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    const start = now + index * 0.085;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.07, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.28);
  });
}
