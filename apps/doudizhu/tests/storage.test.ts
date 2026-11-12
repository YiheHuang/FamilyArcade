import { beforeEach, describe, expect, it } from 'vitest';
import { setup } from '../src/game/doudizhu';
import {
  clearRecord,
  clearSave,
  loadRecord,
  loadSave,
  normalizeRecord,
  recordEntry,
  saveGame,
} from '../src/storage';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
});

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

describe('family record', () => {
  it('adds a landlord result and keeps the best stake', () => {
    const first = recordEntry(
      { side: 'landlord', winnerSeat: 0, stake: 6, bombs: 1, spring: false, mode: 'ai', level: 'normal' },
      1000,
    );
    expect(first.games).toBe(1);
    expect(first.landlordWins).toBe(1);
    expect(first.bestStake).toBe(6);
    const second = recordEntry(
      { side: 'farmers', winnerSeat: 2, stake: 12, bombs: 2, spring: true, mode: 'local' },
      2000,
    );
    expect(second.games).toBe(2);
    expect(second.farmerWins).toBe(1);
    expect(second.bestStake).toBe(12);
    expect(second.lastWinner).toBe('farmers');
    expect(second.recent).toHaveLength(2);
  });

  it('normalises malformed stored data to a safe record', () => {
    const record = normalizeRecord({
      games: -4,
      landlordWins: Number.NaN,
      farmerWins: 2.9,
      byMode: { ai: 1, local: 0, lan: 4 },
      recent: [{ side: 'nope' }] as never,
      lastWinner: 'landlord',
    });
    expect(record.games).toBe(0);
    expect(record.landlordWins).toBe(0);
    expect(record.farmerWins).toBe(2);
    expect(record.byMode.lan).toBe(4);
    expect(record.recent).toEqual([]);
  });

  it('clears the stored record', () => {
    recordEntry({ side: 'landlord', winnerSeat: 0, stake: 3, bombs: 0, spring: false, mode: 'ai' });
    expect(loadRecord().games).toBe(1);
    const cleared = clearRecord();
    expect(cleared.games).toBe(0);
    expect(loadRecord().games).toBe(0);
  });
});

describe('autosave', () => {
  it('round-trips a valid game and rejects a malformed one', () => {
    const state = setup({ rng: seeded(77) });
    saveGame({ state, mode: 'ai', level: 'hard' });
    const loaded = loadSave();
    expect(loaded?.mode).toBe('ai');
    expect(loaded?.level).toBe('hard');
    expect(loaded?.state.hands[0]).toHaveLength(17);

    const bad = { ...state, hands: [] };
    store.set('familyarcade.doudizhu.save', JSON.stringify({ version: 1, state: bad }));
    expect(loadSave()).toBeNull();
    clearSave();
    expect(loadSave()).toBeNull();
  });
});
