import { beforeEach, describe, expect, it } from 'vitest';
import { makeDemoState } from '../src/demo';
import {
  EMPTY_RECORD,
  addResult,
  clearRecord,
  clearSave,
  loadRecord,
  loadSave,
  normalizeRecord,
  recordResult,
  saveGame,
} from '../src/storage';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

beforeEach(() => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
});

describe('family record', () => {
  it('starts empty', () => {
    expect(normalizeRecord(null)).toEqual(EMPTY_RECORD);
  });

  it('adds a hand, a win and a recent entry', () => {
    const next = addResult(
      EMPTY_RECORD,
      { winner: 2, pattern: 'basic', deltas: [-3, -3, 12, -6], hand: 3 },
      { mode: 'ai', level: 'hard' },
      1000,
    );
    expect(next.hands).toBe(1);
    expect(next.wins).toEqual([0, 0, 1, 0]);
    expect(next.byMode.ai).toBe(1);
    expect(next.bestScore).toBe(12);
    expect(next.lastWinner).toBe(2);
    expect(next.recent[0].pattern).toBe('basic');
    expect(next.recent[0].level).toBe('hard');
  });

  it('keeps only eight recent hands and counts all modes', () => {
    let record = EMPTY_RECORD;
    for (let index = 0; index < 10; index += 1) {
      record = addResult(
        record,
        { winner: index % 4, pattern: null, deltas: [0, 0, 0, 0], hand: index + 1 },
        { mode: index % 3 === 0 ? 'lan' : index % 3 === 1 ? 'local' : 'ai' },
        index,
      );
    }
    expect(record.hands).toBe(10);
    expect(record.recent).toHaveLength(8);
    expect(record.byMode.ai + record.byMode.local + record.byMode.lan).toBe(10);
  });

  it('filters malformed recent entries and counters', () => {
    const record = normalizeRecord({
      hands: 4,
      wins: [1, 0, 2, 0],
      bestScore: 9,
      byMode: { ai: 2, local: 1, lan: 1 },
      lastWinner: 2,
      recent: [
        { winner: 0, pattern: 'basic', deltas: [1, 1, 1, 1], hand: 1, mode: 'ai', at: 1 },
        { winner: 9, pattern: 'basic', deltas: [1, 1, 1, 1], hand: 1, mode: 'ai', at: 1 },
      ] as never,
    });
    expect(record.recent).toHaveLength(1);
    expect(record.hands).toBe(4);
  });

  it('records and clears through storage', () => {
    const after = recordResult(
      { winner: 0, pattern: 'seven-star', deltas: [20, -8, -4, -8], hand: 2 },
      { mode: 'local' },
      500,
    );
    expect(after.hands).toBe(1);
    expect(loadRecord().wins[0]).toBe(1);
    expect(clearRecord()).toEqual(EMPTY_RECORD);
    expect(loadRecord()).toEqual(EMPTY_RECORD);
  });
});

describe('autosave', () => {
  it('saves and loads a live hand', () => {
    const state = makeDemoState('mid');
    const saved = saveGame({ state, mode: 'ai', level: 'normal' });
    expect(saved.version).toBe(1);
    const loaded = loadSave();
    expect(loaded?.state.handNumber).toBe(state.handNumber);
    expect(loaded?.state.hands[0]).toEqual(state.hands[0]);
    expect(loaded?.level).toBe('normal');
    clearSave();
    expect(loadSave()).toBeNull();
  });

  it('rejects a malformed save', () => {
    localStorage.setItem(
      'familyarcade.nanchang-mahjong.save',
      JSON.stringify({ version: 1, state: { hands: [] }, mode: 'ai', level: 'easy', savedAt: 1 }),
    );
    expect(loadSave()).toBeNull();
  });
});
