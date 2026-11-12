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

export type SoundKind = 'select' | 'play' | 'score' | 'discard' | 'coin' | 'win' | 'lose';

const NOTES: Record<SoundKind, number[]> = {
  select: [392],
  play: [440, 523.25],
  score: [523.25, 659.25, 783.99],
  discard: [293.66, 246.94],
  coin: [880, 1174.66],
  win: [523.25, 659.25, 783.99, 1046.5],
  lose: [392, 329.63, 261.63],
};

export function chime(kind: SoundKind = 'play'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  const notes = NOTES[kind];
  notes.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = kind === 'discard' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    const start = now + index * 0.08;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'select' ? 0.025 : 0.06, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.28);
  });
}
