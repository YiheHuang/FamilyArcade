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
  | 'deal'
  | 'check'
  | 'bet'
  | 'raise'
  | 'allin'
  | 'fold'
  | 'win'
  | 'lose'
  | 'showdown'
  | 'next';

const NOTES: Record<SoundKind, number[]> = {
  deal: [392, 523.25],
  check: [392],
  bet: [440, 554.37],
  raise: [493.88, 659.25],
  allin: [523.25, 659.25, 783.99, 1046.5],
  fold: [293.66],
  win: [523.25, 659.25, 783.99, 1046.5],
  lose: [392, 329.63, 261.63],
  showdown: [523.25, 659.25],
  next: [349.23, 440],
};

export function chime(kind: SoundKind = 'deal'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  const notes = NOTES[kind];
  notes.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = kind === 'allin' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    const start = now + index * 0.09;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'allin' ? 0.06 : 0.045, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.32);
  });
}
