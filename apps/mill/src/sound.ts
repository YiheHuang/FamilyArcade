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

export type SoundKind = 'select' | 'place' | 'mill' | 'capture' | 'win' | 'draw' | 'error';

const NOTES: Record<SoundKind, { hz: number[]; gap: number; length: number; gain: number }> = {
  select: { hz: [660], gap: 0, length: 0.09, gain: 0.035 },
  place: { hz: [392, 523.25], gap: 0.035, length: 0.12, gain: 0.055 },
  mill: { hz: [523.25, 659.25, 783.99], gap: 0.07, length: 0.22, gain: 0.065 },
  capture: { hz: [196, 146.83], gap: 0.055, length: 0.2, gain: 0.06 },
  win: { hz: [523.25, 659.25, 783.99, 1046.5], gap: 0.1, length: 0.32, gain: 0.07 },
  draw: { hz: [392, 349.23], gap: 0.12, length: 0.3, gain: 0.055 },
  error: { hz: [174.61], gap: 0, length: 0.12, gain: 0.04 },
};

export function chime(kind: SoundKind = 'place'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  const spec = NOTES[kind];
  spec.hz.forEach((frequency, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = kind === 'capture' || kind === 'error' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    const start = now + index * spec.gap;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(spec.gain, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + spec.length);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + spec.length + 0.03);
  });
}
