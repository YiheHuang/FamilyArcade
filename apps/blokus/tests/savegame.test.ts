import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game/engine';
import {
  canContinue,
  clearInProgress,
  loadInProgress,
  saveInProgress,
  type SavedGame,
} from '../src/savegame';

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

function sample(): SavedGame {
  const config = { variant: 'duo' as const, players: 2 as const };
  const g = new Game(config);
  g.tryApply({ kind: 'place', p: 0, piece: 1, o: 0, x: 0, y: 0 });
  g.tryApply({ kind: 'pass', p: 1 });
  return {
    v: 1,
    savedAt: 1700000000000,
    mode: 'ai',
    config,
    seats: [
      { name: '你', kind: 'human' },
      { name: '电脑', kind: 'ai' },
    ],
    localSeats: [0],
    difficulty: 'normal',
    history: g.history.slice(),
  };
}

describe('进行中对局的自动保存', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  });

  it('保存后可读回，完整还原历史', () => {
    const save = sample();
    saveInProgress(save);
    const back = loadInProgress();
    expect(back).not.toBeNull();
    expect(back?.history).toEqual(save.history);
    expect(back?.seats).toEqual(save.seats);
    expect(back?.difficulty).toBe('normal');
    // the restored history must replay into the same position
    const g1 = new Game(save.config, back?.history ?? []);
    const g2 = new Game(save.config, save.history);
    expect(g1.turn).toBe(g2.turn);
    expect(Array.from(g1.board)).toEqual(Array.from(g2.board));
  });

  it('没有存档时返回 null；清除后不再出现', () => {
    expect(loadInProgress()).toBeNull();
    saveInProgress(sample());
    clearInProgress();
    expect(loadInProgress()).toBeNull();
  });

  it('未知格式版本或损坏的历史 → 安全忽略', () => {
    const save = sample();
    localStorage.setItem('blokus.current', JSON.stringify({ ...save, v: 99 }));
    expect(loadInProgress()).toBeNull();
    // an illegal history must not throw on load
    localStorage.setItem(
      'blokus.current',
      JSON.stringify({ ...save, history: [{ kind: 'place', p: 0, piece: 1, o: 0, x: 9, y: 9 }] }),
    );
    expect(loadInProgress()).toBeNull();
    localStorage.setItem('blokus.current', '{oops');
    expect(loadInProgress()).toBeNull();
  });

  it('联机局不能延续，只能复盘', () => {
    const save = sample();
    expect(canContinue(save)).toBe(true);
    expect(canContinue({ ...save, mode: 'lan' })).toBe(false);
  });
});
