import { beforeEach, describe, expect, it } from 'vitest';
import { cycleSoundMode, initSound, soundMode } from '../src/sound';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

describe('音效设置', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  });

  it('默认开启，循环顺序为 开 → 低 → 关 → 开', () => {
    initSound();
    expect(soundMode()).toBe('normal');
    expect(cycleSoundMode()).toBe('low');
    expect(cycleSoundMode()).toBe('off');
    expect(cycleSoundMode()).toBe('normal');
  });

  it('选择会被持久化并能在重启后读回', () => {
    initSound();
    cycleSoundMode(); // low
    initSound();
    expect(soundMode()).toBe('low');
    cycleSoundMode(); // off
    initSound();
    expect(soundMode()).toBe('off');
  });

  it('非法存储值回退为默认开启', () => {
    (globalThis as unknown as { localStorage: MemStorage }).localStorage.setItem(
      'blokus.sound',
      'loud',
    );
    initSound();
    expect(soundMode()).toBe('normal');
  });
});
