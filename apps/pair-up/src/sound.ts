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

type Chime = 'flip' | 'match' | 'miss' | 'hint' | 'win' | 'tie';

const NOTES: Record<Chime, number[]> = {
  flip: [587.33],
  match: [659.25, 880],
  miss: [311.13, 277.18],
  hint: [783.99, 1046.5],
  win: [523.25, 659.25, 783.99, 1046.5],
  tie: [523.25, 392, 523.25],
};

export function chime(kind: Chime = 'flip'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  const notes = NOTES[kind];
  notes.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = kind === 'miss' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    const start = now + index * 0.085;
    const length = kind === 'win' ? 0.42 : kind === 'flip' ? 0.12 : 0.3;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'flip' ? 0.035 : 0.075, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  });
}
