let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

export function chime(kind: 'place' | 'roll' | 'hit' | 'win' = 'place'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  const notes =
    kind === 'win'
      ? [523.25, 659.25, 783.99, 1046.5]
      : kind === 'hit'
        ? [392, 293.66]
        : kind === 'roll'
          ? [349.23, 440]
          : [523.25];
  notes.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = kind === 'hit' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    const start = now + index * 0.075;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'hit' ? 0.06 : 0.08, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.28);
  });
}
