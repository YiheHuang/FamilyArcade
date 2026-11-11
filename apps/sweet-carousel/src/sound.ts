import type { SoundLevel } from './storage';

type SoundName = 'click' | 'pick' | 'reveal' | 'pass' | 'score' | 'win' | 'error';

class SoundBoard {
  private ctx: AudioContext | null = null;
  private level: SoundLevel = 'off';

  setLevel(level: SoundLevel): void {
    this.level = level;
  }

  private context(): AudioContext | null {
    if (this.level === 'off') return null;
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private tone(frequency: number, duration: number, gain: number, type: OscillatorType, delay = 0): void {
    const ctx = this.context();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    const peak = gain * (this.level === 'low' ? 0.28 : 0.62);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  play(name: SoundName): void {
    if (this.level === 'off') return;
    switch (name) {
      case 'click':
        this.tone(520, 0.05, 0.12, 'sine');
        break;
      case 'pick':
        this.tone(660, 0.09, 0.18, 'sine');
        this.tone(880, 0.12, 0.1, 'sine', 0.05);
        break;
      case 'reveal':
        this.tone(392, 0.16, 0.16, 'triangle');
        this.tone(523.25, 0.18, 0.14, 'triangle', 0.08);
        this.tone(659.25, 0.2, 0.12, 'triangle', 0.16);
        break;
      case 'pass':
        this.tone(300, 0.12, 0.1, 'sine');
        this.tone(240, 0.14, 0.08, 'sine', 0.08);
        break;
      case 'score':
        this.tone(523.25, 0.12, 0.14, 'sine');
        this.tone(783.99, 0.18, 0.12, 'sine', 0.1);
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          this.tone(frequency, 0.3, 0.14, 'triangle', index * 0.12);
        });
        break;
      case 'error':
        this.tone(180, 0.16, 0.14, 'sawtooth');
        break;
    }
  }
}

export const sound = new SoundBoard();
