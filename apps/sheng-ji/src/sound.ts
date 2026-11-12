export type SoundKind = 'deal' | 'play' | 'trick' | 'win' | 'lose';

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  if (context.state === 'suspended') void context.resume();
  return context;
}

function note(ctx: AudioContext, frequency: number, start: number, duration: number, gain: number): void {
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function chime(kind: SoundKind): void {
  const ctx = audioContext();
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;
  if (kind === 'deal') {
    note(ctx, 392, now, 0.1, 0.05);
    note(ctx, 523.25, now + 0.08, 0.12, 0.05);
    note(ctx, 659.25, now + 0.16, 0.14, 0.04);
  } else if (kind === 'play') {
    note(ctx, 330, now, 0.07, 0.035);
  } else if (kind === 'trick') {
    note(ctx, 440, now, 0.09, 0.04);
    note(ctx, 554.37, now + 0.06, 0.1, 0.035);
  } else if (kind === 'win') {
    note(ctx, 523.25, now, 0.14, 0.05);
    note(ctx, 659.25, now + 0.12, 0.14, 0.05);
    note(ctx, 783.99, now + 0.24, 0.22, 0.05);
  } else {
    note(ctx, 293.66, now, 0.16, 0.04);
    note(ctx, 233.08, now + 0.14, 0.22, 0.04);
  }
}
