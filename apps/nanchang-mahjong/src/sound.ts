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

export type SoundKind = 'draw' | 'discard' | 'meld' | 'win' | 'lose' | 'draw-hand';

export function chime(kind: SoundKind = 'discard'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  const notes =
    kind === 'win'
      ? [523.25, 659.25, 783.99, 1046.5]
      : kind === 'lose'
        ? [392, 329.63, 261.63]
        : kind === 'draw-hand'
          ? [349.23, 293.66]
          : kind === 'meld'
            ? [392, 523.25]
            : kind === 'draw'
              ? [330]
              : [261.63];
  notes.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = kind === 'discard' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    const start = now + index * 0.1;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'draw' ? 0.035 : 0.06, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  });
}
