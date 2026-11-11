import type { SoundLevel } from './storage';

type Tone = 'sine' | 'triangle' | 'square';

/** Tiny Web Audio synth: no assets, no downloads, no third-party sounds. */
export class SoundPlayer {
  private ctx: AudioContext | null = null;
  private level: SoundLevel = 'on';

  setLevel(level: SoundLevel): void {
    this.level = level;
  }

  private ensure(): AudioContext | null {
    if (this.level === 'off') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, duration: number, type: Tone, gain: number, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), start + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private volume(): number {
    return this.level === 'low' ? 0.35 : 1;
  }

  select(): void {
    this.tone(540, 0.06, 'sine', 0.035 * this.volume());
  }

  lock(): void {
    this.tone(330, 0.08, 'triangle', 0.05 * this.volume());
    this.tone(495, 0.1, 'sine', 0.03 * this.volume(), 0.04);
  }

  wind(step = 0): void {
    const base = 420 + step * 45;
    this.tone(base, 0.12, 'sine', 0.03 * this.volume());
    this.tone(base * 1.26, 0.16, 'triangle', 0.018 * this.volume(), 0.03);
  }

  score(): void {
    this.tone(660, 0.14, 'sine', 0.04 * this.volume());
    this.tone(880, 0.2, 'sine', 0.03 * this.volume(), 0.08);
  }

  win(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, 0.35, 'sine', 0.055 * this.volume(), i * 0.09));
    this.tone(261.63, 0.9, 'triangle', 0.018 * this.volume(), 0.1);
  }

  error(): void {
    this.tone(140, 0.12, 'square', 0.025 * this.volume());
    this.tone(110, 0.16, 'square', 0.02 * this.volume(), 0.05);
  }

  click(): void {
    this.tone(700, 0.035, 'sine', 0.022 * this.volume());
  }
}

export const sound = new SoundPlayer();
