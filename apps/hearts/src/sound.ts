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
  osc.stop(start + duration + 0.03);
}

export type SoundKind = 'card' | 'trick' | 'win' | 'moon' | 'click';

export function chime(kind: SoundKind = 'card'): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;
  if (kind === 'card') {
    tone(audio, 620, now, 0.08, 0.035, 'triangle');
    tone(audio, 310, now + 0.01, 0.07, 0.02, 'sine');
  } else if (kind === 'click') {
    tone(audio, 440, now, 0.05, 0.025, 'triangle');
  } else if (kind === 'trick') {
    tone(audio, 523.25, now, 0.16, 0.045);
    tone(audio, 659.25, now + 0.07, 0.18, 0.035);
  } else if (kind === 'moon') {
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      tone(audio, frequency, now + index * 0.09, 0.3, 0.06);
    });
  } else {
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      tone(audio, frequency, now + index * 0.11, 0.35, 0.055);
    });
  }
}
