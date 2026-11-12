let ctx: AudioContext | null = null;

export type SoundKind = 'deal' | 'bid' | 'play' | 'pass' | 'bomb' | 'win' | 'lose';

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

export function chime(kind: SoundKind = 'play'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  const notes: Record<SoundKind, number[]> = {
    deal: [392, 523.25],
    bid: [440, 554.37],
    play: [523.25],
    pass: [349.23],
    bomb: [130.81, 196, 261.63],
    win: [523.25, 659.25, 783.99, 1046.5],
    lose: [392, 329.63, 261.63],
  };
  const tune = notes[kind];
  tune.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = kind === 'bomb' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    const start = now + index * (kind === 'win' ? 0.11 : 0.08);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'bomb' ? 0.12 : 0.07, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + (kind === 'bomb' ? 0.48 : 0.3));
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + (kind === 'bomb' ? 0.52 : 0.34));
  });
}
