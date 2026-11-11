import { beforeEach, describe, expect, it } from 'vitest';
import { rollWithDie, setup } from '../src/game/ladder-run';
import {
  clearRecord,
  clearSave,
  emptyRecord,
  loadRecord,
  loadSave,
  recordResult,
  saveGame,
} from '../src/storage';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  },
});

function wonState(winner = 0) {
  const state = setup({ players: 2, names: ['Mia', 'Leo'] });
  state.turn = winner;
  state.players[winner].position = 99;
  return rollWithDie(state, 1).state;
}

beforeEach(() => {
  store.clear();
});

describe('Ladder Run storage', () => {
  it('round-trips a saved game', () => {
    const state = setup({ players: 3, names: ['Mia', 'Leo', 'Zoe'] });
    const next = rollWithDie(state, 4).state;
    saveGame({ state: next, mode: 'local', level: 'normal' });
    const loaded = loadSave();
    expect(loaded?.version).toBe(2);
    expect(loaded?.mode).toBe('local');
    expect(loaded?.state.players[0].position).toBe(4);
    expect(loaded?.state.players).toHaveLength(3);
  });

  it('rejects old or broken saves', () => {
    store.set('familyarcade.ladder-run.save', JSON.stringify({ version: 1, state: setup() }));
    expect(loadSave()).toBeNull();
    store.set(
      'familyarcade.ladder-run.save',
      JSON.stringify({ version: 2, mode: 'local', savedAt: 1, state: { ...setup(), turn: 9 } }),
    );
    expect(loadSave()).toBeNull();
    store.set('familyarcade.ladder-run.save', '{bad json');
    expect(loadSave()).toBeNull();
  });

  it('clears a save', () => {
    saveGame({ state: setup(), mode: 'ai', level: 'easy' });
    expect(loadSave()).not.toBeNull();
    clearSave();
    expect(loadSave()).toBeNull();
  });

  it('starts with an empty family record', () => {
    expect(loadRecord()).toEqual(emptyRecord());
    expect(loadRecord().wins).toHaveLength(4);
  });

  it('records a win, streak and best streak', () => {
    const first = recordResult(wonState(0));
    expect(first.games).toBe(1);
    expect(first.wins).toEqual([1, 0, 0, 0]);
    expect(first.lastWinnerName).toBe('Mia');
    expect(first.streak).toBe(1);

    const second = recordResult(wonState(0));
    expect(second.wins[0]).toBe(2);
    expect(second.streak).toBe(2);
    expect(second.bestStreak).toBe(2);

    const third = recordResult(wonState(1));
    expect(third.wins).toEqual([2, 1, 0, 0]);
    expect(third.streak).toBe(1);
    expect(third.bestStreak).toBe(2);
    expect(third.lastWinnerName).toBe('Leo');
  });

  it('ignores unfinished states and clears the record', () => {
    expect(recordResult(setup()).games).toBe(0);
    recordResult(wonState(0));
    expect(clearRecord()).toEqual(emptyRecord());
    expect(loadRecord().games).toBe(0);
  });

  it('repairs partial record data', () => {
    store.set(
      'familyarcade.ladder-run.record',
      JSON.stringify({ games: 3, wins: [2, 1], streak: 2, bestStreak: 3, lastWinner: 7 }),
    );
    const record = loadRecord();
    expect(record.games).toBe(3);
    expect(record.wins).toEqual([2, 1, 0, 0]);
    expect(record.lastWinner).toBeNull();
  });
});
