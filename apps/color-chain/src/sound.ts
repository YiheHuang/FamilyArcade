let ctx: AudioContext | null = null;

export type ChimeKind = 'play' | 'draw' | 'win' | 'lose' | 'round' | 'turn';

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
  play: [523.25, 659.25],
  draw: [392, 329.63],
  win: [523.25, 659.25, 783.99, 1046.5],
  lose: [392, 349.23, 293.66],
  round: [523.25, 587.33, 783.99],
  turn: [440],
};

export function chime(kind: ChimeKind = 'play'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  NOTES[kind].forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = kind === 'draw' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    const start = now + index * (kind === 'win' ? 0.1 : 0.085);
    const length = kind === 'win' ? 0.36 : 0.24;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'draw' ? 0.035 : 0.065, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  });
}
