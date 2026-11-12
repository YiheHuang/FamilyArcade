import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDeal,
  clearRecord,
  clearSave,
  EMPTY_RECORD,
  loadRecord,
  loadSave,
  normalizeRecord,
  recordDeal,
  saveGame,
} from '../src/storage';
import { finishDeal, setup, type GameState } from '../src/game/sheng-ji';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

function seeded(seed = 1): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function finishedState(): GameState {
  const base = setup({ rng: seeded(4), dealer: 3 });
  return finishDeal({
    ...base,
    phase: 'play',
    trump: 'S',
    levelRank: '2',
    declarer: 0,
    turn: 0,
    hands: [[], [], [], []],
    buried: [],
    points: [80, 20],
  });
}

describe('storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('normalises an empty record', () => {
    expect(normalizeRecord(null)).toEqual(EMPTY_RECORD);
  });

  it('records a completed deal and counts the mode', () => {
    const record = addDeal(EMPTY_RECORD, finishedState().lastResult!, { mode: 'ai', level: 'normal' }, 123);
    expect(record.deals).toBe(1);
    expect(record.byMode.ai).toBe(1);
    expect(record.declarerUpgrades).toBe(1);
    expect(record.biggestJump).toBe(1);
    expect(record.recent[0].success).toBe(true);
    expect(record.recent[0].levels).toEqual([1, 0]);
  });

  it('keeps deal results local and reloads them', () => {
    const state = finishedState();
    const record = recordDeal(state, { mode: 'local' });
    expect(loadRecord().deals).toBe(1);
    expect(loadRecord().lastDeal?.declarerPoints).toBe(80);
    expect(record.byMode.local).toBe(1);
  });

  it('saves and resumes a live deal', () => {
    const state = setup({ rng: seeded(8), dealer: 3 });
    const saved = saveGame({
      state,
      mode: 'ai',
      level: 'hard',
      names: ['@you', '@ai1', '@ai2', '@ai3'],
    });
    expect(saved.version).toBe(1);
    const loaded = loadSave();
    expect(loaded?.state.deal).toBe(state.deal);
    expect(loaded?.level).toBe('hard');
    expect(loaded?.names).toHaveLength(4);
    clearSave();
    expect(loadSave()).toBeNull();
  });

  it('rejects a malformed save', () => {
    localStorage.setItem('familyarcade.sheng-ji.save', JSON.stringify({ version: 1, state: { hands: [] } }));
    expect(loadSave()).toBeNull();
  });

  it('clears the record', () => {
    recordDeal(finishedState(), { mode: 'lan' });
    expect(loadRecord().deals).toBe(1);
    expect(clearRecord()).toEqual(EMPTY_RECORD);
    expect(loadRecord().deals).toBe(0);
  });

  it('keeps the four hands in a saved deal', () => {
    const state = setup({ rng: seeded(9) });
    saveGame({ state, mode: 'local', level: 'easy', names: ['@p1', '@p2', '@p3', '@p4'] });
    expect(loadSave()?.state.hands).toHaveLength(4);
    expect(loadSave()?.state.hands[2]).toHaveLength(25);
  });
});
