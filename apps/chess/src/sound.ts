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

const NOTES: Record<'place' | 'capture' | 'check' | 'win' | 'draw', number[]> = {
  place: [523.25],
  capture: [392, 523.25],
  check: [493.88, 659.25],
  win: [523.25, 659.25, 783.99, 1046.5],
  draw: [392, 329.63],
};

export function chime(kind: keyof typeof NOTES = 'place'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  const notes = NOTES[kind];
  notes.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const start = now + index * 0.085;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.075, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.28);
  });
}
