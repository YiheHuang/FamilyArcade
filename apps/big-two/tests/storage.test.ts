import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_RECORD,
  addGame,
  clearRecord,
  clearSave,
  loadRecord,
  loadSave,
  normalizeRecord,
  recordGame,
  saveGame,
} from '../src/storage';
import { play, seededRng, setup, type GameState } from '../src/game/big-two';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, String(value));
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    },
  });
});

function finished(winner = 0): GameState {
  const base = setup(seededRng(88));
  const hands = base.hands.map((hand) => hand.slice());
  const card = hands[winner].find((item) => item.id === 'D3') ?? hands[winner][0];
  hands[winner] = [card];
  const state: GameState = {
    ...base,
    hands,
    turn: winner,
    trick: null,
    passed: [false, false, false, false],
    phase: 'playing',
    winner: null,
    result: null,
    mustLeadDiamond: false,
    starter: winner,
    discard: [],
    last: null,
    actions: 0,
  };
  const result = play(state, winner, [card.id]);
  if (!result.ok) throw new Error('Could not finish test game');
  return result.state;
}

describe('family record', () => {
  it('records a finished game with mode, winner, gain and recent list', () => {
    const state = finished();
    const record = addGame(
      EMPTY_RECORD,
      state,
      ['@you', '@ai1', '@ai2', '@ai3'],
      { mode: 'ai', level: 'hard' },
      1234,
    );
    expect(record.games).toBe(1);
    expect(record.wins).toBe(1);
    expect(record.bestGain).toBe(state.result!.gain);
    expect(record.byMode.ai).toBe(1);
    expect(record.winners['@you']).toBe(1);
    expect(record.lastWinner).toBe('@you');
    expect(record.recent).toHaveLength(1);
    expect(record.recent[0]).toMatchObject({
      winner: '@you',
      mode: 'ai',
      level: 'hard',
      at: 1234,
    });
    expect(record.recent[0].counts).toEqual(state.result!.counts);
  });

  it('increments human wins only for seat zero', () => {
    const first = addGame(EMPTY_RECORD, finished(0), ['@you', '@ai1', '@ai2', '@ai3'], { mode: 'ai' }, 1);
    const second = addGame(first, finished(1), ['@you', '@ai1', '@ai2', '@ai3'], { mode: 'local' }, 2);
    expect(second.games).toBe(2);
    expect(second.wins).toBe(1);
    expect(second.byMode).toEqual({ ai: 1, local: 1, lan: 0 });
    expect(second.winners['@ai1']).toBe(1);
    expect(second.recent).toHaveLength(2);
  });

  it('normalizes malformed records safely', () => {
    const raw = {
      games: -4,
      wins: 2.7,
      bestGain: 12.9,
      byMode: { ai: -1, local: 2, lan: 'x' },
      winners: { '@you': 2, '': 9, tooLongNameThatShouldNotBeKeptBecauseItIsLongerThanFortyCharacters: 3 },
      recent: [{ winner: '', gain: 1 }, { winner: 'ok' }],
      lastWinner: '',
    } as unknown as Parameters<typeof normalizeRecord>[0];
    const record = normalizeRecord(raw);
    expect(record.games).toBe(0);
    expect(record.wins).toBe(2);
    expect(record.bestGain).toBe(12);
    expect(record.byMode).toEqual({ ai: 0, local: 2, lan: 0 });
    expect(record.winners).toEqual({ '@you': 2 });
    expect(record.recent).toEqual([]);
    expect(record.lastWinner).toBeNull();
  });

  it('loads, records and clears the local family record', () => {
    const state = finished();
    const saved = recordGame(
      state,
      ['@you', '@ai1', '@ai2', '@ai3'],
      { mode: 'ai', level: 'normal' },
      99,
    );
    expect(saved.games).toBe(1);
    expect(loadRecord().games).toBe(1);
    const cleared = clearRecord();
    expect(cleared.games).toBe(0);
    expect(loadRecord()).toEqual(EMPTY_RECORD);
  });
});

describe('autosave', () => {
  it('saves and loads a game, and rejects malformed saves', () => {
    const state = setup(seededRng(91));
    saveGame({
      state,
      mode: 'ai',
      level: 'normal',
      names: ['@you', '@ai1', '@ai2', '@ai3'],
    });
    const loaded = loadSave();
    expect(loaded).not.toBeNull();
    expect(loaded?.mode).toBe('ai');
    expect(loaded?.level).toBe('normal');
    expect(loaded?.state.hands[0]).toHaveLength(13);
    expect(loaded?.names).toEqual(['@you', '@ai1', '@ai2', '@ai3']);

    memory.set('familyarcade.big-two.save', JSON.stringify({ version: 2, state }));
    expect(loadSave()).toBeNull();

    memory.set(
      'familyarcade.big-two.save',
      JSON.stringify({
        version: 1,
        mode: 'ai',
        level: 'normal',
        names: [],
        state: { hands: [], playerCount: 4 },
      }),
    );
    expect(loadSave()).toBeNull();
  });

  it('clears the autosave', () => {
    const state = setup(seededRng(92));
    saveGame({ state, mode: 'local', level: 'easy', names: [] });
    expect(loadSave()).not.toBeNull();
    clearSave();
    expect(loadSave()).toBeNull();
  });
});
