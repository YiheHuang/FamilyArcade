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
    return this.level === 'low' ? 0.32 : 1;
  }

  tile(): void {
    this.tone(190, 0.055, 'triangle', 0.055 * this.volume());
    this.tone(95, 0.09, 'sine', 0.04 * this.volume(), 0.012);
    this.tone(520, 0.02, 'square', 0.012 * this.volume(), 0.005);
  }

  rotate(): void {
    this.tone(380, 0.035, 'sine', 0.02 * this.volume());
  }

  meeple(): void {
    this.tone(310, 0.055, 'triangle', 0.04 * this.volume());
    this.tone(470, 0.07, 'sine', 0.025 * this.volume(), 0.04);
  }

  score(): void {
    this.tone(523.25, 0.22, 'sine', 0.05 * this.volume());
    this.tone(659.25, 0.24, 'sine', 0.045 * this.volume(), 0.08);
    this.tone(783.99, 0.32, 'sine', 0.04 * this.volume(), 0.16);
  }

  win(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, 0.42, 'sine', 0.05 * this.volume(), i * 0.11));
    this.tone(261.63, 1.0, 'triangle', 0.018 * this.volume(), 0.12);
  }

  error(): void {
    this.tone(150, 0.1, 'square', 0.022 * this.volume());
    this.tone(115, 0.14, 'square', 0.018 * this.volume(), 0.05);
  }

  click(): void {
    this.tone(680, 0.03, 'sine', 0.022 * this.volume());
  }

  discard(): void {
    this.tone(250, 0.08, 'triangle', 0.035 * this.volume());
    this.tone(170, 0.1, 'sine', 0.026 * this.volume(), 0.04);
  }
}

export const sound = new SoundPlayer();
