let ctx: AudioContext | null = null;

export type ChimeKind = 'roll' | 'hold' | 'score' | 'win' | 'tie';

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

const NOTES: Record<ChimeKind, number[]> = {
  roll: [196, 246.94, 293.66],
  hold: [523.25],
  score: [392, 523.25],
  win: [523.25, 659.25, 783.99, 1046.5],
  tie: [392, 392],
};

const LENGTHS: Record<ChimeKind, number> = {
  roll: 0.09,
  hold: 0.1,
  score: 0.18,
  win: 0.22,
  tie: 0.3,
};

export function chime(kind: ChimeKind = 'score'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  const notes = NOTES[kind];
  const length = LENGTHS[kind];
  notes.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = kind === 'roll' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    const start = now + index * (kind === 'roll' ? 0.045 : 0.085);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'roll' ? 0.035 : 0.075, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + length + 0.03);
  });
}
