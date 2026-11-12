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

export function chime(kind: 'place' | 'capture' | 'pass' | 'win' = 'place'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  const notes =
    kind === 'win'
      ? [523.25, 659.25, 783.99, 1046.5]
      : kind === 'capture'
        ? [392, 293.66]
        : kind === 'pass'
          ? [329.63]
          : [523.25];
  notes.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = kind === 'capture' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    const start = now + index * 0.08;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'capture' ? 0.06 : 0.08, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + (kind === 'win' ? 0.4 : 0.28));
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.44);
  });
}
