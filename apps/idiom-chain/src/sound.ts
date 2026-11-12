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

export type SoundKind = 'valid' | 'rare' | 'bonus' | 'miss' | 'win' | 'lose' | 'click';

export function chime(kind: SoundKind = 'valid'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  const notes: number[] =
    kind === 'win'
      ? [523.25, 659.25, 783.99, 1046.5]
      : kind === 'lose'
        ? [392, 349.23, 293.66]
        : kind === 'miss'
          ? [196, 164.81]
          : kind === 'rare'
            ? [659.25, 783.99, 987.77]
            : kind === 'bonus'
              ? [783.99, 987.77, 1174.66]
              : kind === 'click'
                ? [392]
                : [523.25];
  const gap = kind === 'win' || kind === 'rare' || kind === 'bonus' ? 0.075 : 0.09;
  notes.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = kind === 'miss' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    const start = now + index * gap;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'miss' ? 0.05 : 0.08, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.32);
  });
}
