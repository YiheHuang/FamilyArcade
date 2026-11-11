let ctx: AudioContext | null = null;

export type SoundKind = 'select' | 'score' | 'error' | 'deal' | 'win';

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

function tone(
  audio: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function chime(kind: SoundKind = 'select'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;

  if (kind === 'select') {
    tone(audio, 660, now, 0.08, 0.05, 'triangle');
    return;
  }
  if (kind === 'score') {
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      tone(audio, frequency, now + index * 0.07, 0.22, 0.07);
    });
    return;
  }
  if (kind === 'error') {
    tone(audio, 196, now, 0.16, 0.06, 'sawtooth');
    tone(audio, 155.56, now + 0.1, 0.2, 0.05, 'sawtooth');
    return;
  }
  if (kind === 'deal') {
    tone(audio, 392, now, 0.1, 0.04, 'triangle');
    tone(audio, 440, now + 0.08, 0.12, 0.04, 'triangle');
    return;
  }
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
    tone(audio, frequency, now + index * 0.12, 0.45, 0.07);
  });
}
