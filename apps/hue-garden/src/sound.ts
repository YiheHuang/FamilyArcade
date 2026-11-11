import type { SoundLevel } from './storage';

type Tone = 'sine' | 'triangle' | 'square';

/** Tiny Web Audio synth: no files, no network. Sound is always optional. */
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
    return this.level === 'low' ? 0.3 : 1;
  }

  select(): void {
    this.tone(620, 0.05, 'sine', 0.03 * this.volume());
  }

  place(index = 0): void {
    this.tone(250 + index * 28, 0.06, 'triangle', 0.045 * this.volume());
    this.tone(500 + index * 40, 0.04, 'sine', 0.018 * this.volume(), 0.01);
  }

  bloom(): void {
    const notes = [659.25, 783.99, 987.77, 1318.51];
    notes.forEach((f, i) => this.tone(f, 0.28, 'sine', 0.045 * this.volume(), i * 0.065));
    this.tone(329.63, 0.5, 'triangle', 0.02 * this.volume(), 0.05);
  }

  swap(): void {
    this.tone(420, 0.06, 'sine', 0.03 * this.volume());
    this.tone(300, 0.07, 'sine', 0.02 * this.volume(), 0.04);
  }

  pass(): void {
    this.tone(180, 0.12, 'sine', 0.025 * this.volume());
  }

  win(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, 0.35, 'sine', 0.06 * this.volume(), i * 0.09));
    this.tone(261.63, 0.9, 'triangle', 0.02 * this.volume(), 0.1);
  }

  error(): void {
    this.tone(140, 0.12, 'square', 0.022 * this.volume());
    this.tone(110, 0.16, 'square', 0.018 * this.volume(), 0.05);
  }

  click(): void {
    this.tone(700, 0.035, 'sine', 0.022 * this.volume());
  }
}

export const sound = new SoundPlayer();
