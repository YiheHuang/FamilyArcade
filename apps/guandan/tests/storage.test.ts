import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_RECORD,
  addRound,
  clearRecord,
  loadRecord,
  loadSave,
  normalizeRecord,
  recordRound,
  saveGame,
  type FamilyRecord,
} from '../src/storage';
import { setup, type GameState } from '../src/game/guandan';
import type { AiLevel } from '../src/ai/ai';

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => {
      memory.clear();
    },
  },
});

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function playedRound(matchWinner: 0 | 1 | null = null): GameState {
  const base = setup(seeded(4));
  return {
    ...base,
    phase: matchWinner === null ? 'round-over' : 'match-over',
    turn: -1,
    order: [0, 2, 1, 3],
    finish: [0, 2, 1, 3],
    matchWinner,
    result: {
      order: [0, 2, 1, 3],
      winnerTeam: 0,
      gain: 3,
      levelsBefore: [2, 2],
      levelsAfter: [5, 2],
      matchWinner,
      nextLevel: 5,
    },
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('Saved game', () => {
  it('round-trips an active solo game', () => {
    const state = setup(seeded(5));
    saveGame({
      state,
      mode: 'ai',
      level: 'normal',
      names: ['@you', '@ai1', '@ai2', '@ai3'],
    });
    const loaded = loadSave();
    expect(loaded?.mode).toBe('ai');
    expect(loaded?.level).toBe('normal');
    expect(loaded?.state.hands.map((hand) => hand.length)).toEqual([27, 27, 27, 27]);
  });

  it('rejects malformed saves', () => {
    localStorage.setItem(
      'familyarcade.guandan.save',
      JSON.stringify({ version: 1, state: { hands: [] }, mode: 'ai', level: 'hard' }),
    );
    expect(loadSave()).toBeNull();
  });
});

describe('Family record', () => {
  it('records rounds, round wins, modes and a match title', () => {
    const record = recordRound(
      playedRound(),
      ['@you', '@ai1', '@ai2', '@ai3'],
      { mode: 'ai', level: 'normal' as AiLevel },
      1_700_000_000_000,
    );
    expect(record.rounds).toBe(1);
    expect(record.roundWins).toEqual([1, 0]);
    expect(record.titles).toEqual([0, 0]);
    expect(record.byMode.ai).toBe(1);
    expect(record.recent[0].order).toEqual(['@you', '@ai2', '@ai1', '@ai3']);

    const match = recordRound(
      playedRound(0),
      ['@you', '@ai1', '@ai2', '@ai3'],
      { mode: 'lan' },
      1_700_000_100_000,
    );
    expect(match.rounds).toBe(2);
    expect(match.matches).toBe(1);
    expect(match.titles).toEqual([1, 0]);
    expect(match.byMode.lan).toBe(1);
    expect(match.recent).toHaveLength(2);
  });

  it('keeps only the eight newest rounds', () => {
    let record: FamilyRecord = { ...EMPTY_RECORD };
    for (let index = 0; index < 12; index += 1) {
      record = addRound(record, playedRound(), ['a', 'b', 'c', 'd'], { mode: 'local' }, index);
    }
    expect(record.rounds).toBe(12);
    expect(record.recent).toHaveLength(8);
    expect(record.recent[0].at).toBe(11);
  });

  it('normalizes malformed legacy records safely', () => {
    const record = normalizeRecord({
      rounds: -3,
      matches: 2.8,
      roundWins: [4, 'oops' as unknown as number],
      titles: [1, 2],
      best: [99, 1],
      byMode: { ai: 2, local: -1, lan: 3 },
      lastWinner: 7 as unknown as 0,
      recent: [{ nonsense: true }],
    } as unknown as Partial<FamilyRecord>);
    expect(record.rounds).toBe(0);
    expect(record.matches).toBe(2);
    expect(record.roundWins).toEqual([4, 0]);
    expect(record.best).toEqual([14, 2]);
    expect(record.byMode).toEqual({ ai: 2, local: 0, lan: 3 });
    expect(record.lastWinner).toBeNull();
    expect(record.recent).toEqual([]);
  });

  it('loads and clears the record', () => {
    recordRound(playedRound(), ['a', 'b', 'c', 'd'], { mode: 'ai' });
    expect(loadRecord().rounds).toBe(1);
    expect(clearRecord().rounds).toBe(0);
    expect(loadRecord().rounds).toBe(0);
  });
});
