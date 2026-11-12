import { describe, expect, it } from 'vitest';
import { chooseAiAction, fallbackAction, handPlan } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import {
  DECK,
  applySeat,
  beginRound,
  checkPlay,
  legalPlays,
  nextRound,
  pass,
  performExchange,
  play,
  rolesFor,
  setup,
  view,
  type Card,
  type GameState,
  type Rng,
  type Trick,
} from '../src/game/president';
import { MESSAGES } from '../src/i18n';
import {
  EMPTY_RECORD,
  addRound,
  normalizeRecord,
  type FamilyRecord,
} from '../src/storage';

function seeded(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cards(...ids: string[]): Card[] {
  return ids.map((id) => {
    const card = DECK.find((item) => item.id === id);
    if (!card) throw new Error(`unknown card ${id}`);
    return card;
  });
}

function ids(cardsToUse: readonly Card[]): string[] {
  return cardsToUse.map((card) => card.id);
}

function table(hands: string[][], overrides: Partial<GameState> = {}): GameState {
  const playerCount = hands.length;
  const base = setup(playerCount, () => 0.5, false);
  const dealt = hands.map((hand) => cards(...hand).sort((a, b) => a.rank - b.rank));
  const trick = overrides.trick ?? null;
  return {
    ...base,
    hands: dealt,
    turn: 0,
    starter: 0,
    passed: Array.from({ length: playerCount }, () => false),
    mustLeadClubs: false,
    discard: trick ? trick.cards.slice() : [],
    ...overrides,
  };
}

function trick(seat: number, rank: number, count: number, cardIds: string[]): Trick {
  return { seat, rank, count, cards: cards(...cardIds) };
}

function autoRound(start: GameState): GameState {
  let state = start;
  for (let step = 0; step < 2500 && state.phase === 'playing'; step += 1) {
    const legal = legalPlays(state, state.turn);
    const result =
      legal.length > 0
        ? play(state, state.turn, ids(legal[0]))
        : pass(state, state.turn);
    if (!result.ok) throw new Error(`auto play failed: ${result.error}`);
    state = result.state;
  }
  return state;
}

describe('President deck and deal', () => {
  it('has 52 unique cards and the classic rank order', () => {
    expect(DECK).toHaveLength(52);
    expect(new Set(DECK.map((card) => card.id)).size).toBe(52);
    for (const suit of ['clubs', 'diamonds', 'hearts', 'spades']) {
      expect(DECK.filter((card) => card.suit === suit)).toHaveLength(13);
    }
    for (const rank of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
      expect(DECK.filter((card) => card.rank === rank)).toHaveLength(4);
    }
  });

  for (const playerCount of [3, 4, 5, 6]) {
    it(`deals all 52 cards as evenly as possible to ${playerCount} players`, () => {
      const state = setup(playerCount, seeded(100 + playerCount), true);
      const all = state.hands.flat();
      expect(all).toHaveLength(52);
      expect(new Set(all.map((card) => card.id)).size).toBe(52);
      const sizes = state.hands.map((hand) => hand.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(state.hands[state.starter].some((card) => card.id === 'C3')).toBe(true);
      expect(state.turn).toBe(state.starter);
      expect(state.mustLeadClubs).toBe(true);
    });
  }

  it('forces the first lead to include the 3 of clubs', () => {
    const state = table(
      [
        ['C3', 'D3', 'H4', 'S5'],
        ['C6', 'D7'],
        ['C8', 'D9'],
      ],
      { mustLeadClubs: true, starter: 0, turn: 0 },
    );
    const legal = legalPlays(state, 0);
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.every((cardsToPlay) => cardsToPlay.some((card) => card.id === 'C3'))).toBe(
      true,
    );
    expect(play(state, 0, ['H4']).error).toBe('must-lead-clubs');
    expect(play(state, 0, ['C3']).ok).toBe(true);
  });
});

describe('President trick rules', () => {
  it('rejects wrong turns, foreign cards, mixed ranks, quads and empty plays', () => {
    const state = table(
      [
        ['C3', 'D3', 'H3', 'S4', 'D5'],
        ['C6', 'D6', 'H7'],
        ['C8', 'D9'],
      ],
      { turn: 0 },
    );
    expect(checkPlay(state, 1, ['C6']).error).toBe('wrong-turn');
    expect(checkPlay(state, 0, ['C6']).error).toBe('not-your-card');
    expect(checkPlay(state, 0, ['C3', 'S4']).error).toBe('mixed-rank');
    expect(checkPlay(state, 0, ['C3', 'D3', 'H3', 'S4']).error).toBe('too-many');
    expect(checkPlay(state, 0, []).error).toBe('empty');
    expect(checkPlay(state, 0, ['C3', 'C3']).error).toBe('not-your-card');
  });

  it('allows equal or higher ranks but requires the same count', () => {
    const state = table(
      [
        ['C8', 'D8', 'C9', 'D9', 'C10', 'D10', 'C15', 'D15'],
        ['C3', 'D4'],
        ['C5', 'D6'],
      ],
      {
        turn: 0,
        trick: trick(1, 9, 2, ['H9', 'S9']),
        discard: cards('H9', 'S9'),
      },
    );
    expect(play(state, 0, ['C8', 'D8']).error).toBe('too-low');
    expect(play(state, 0, ['C10']).error).toBe('count-mismatch');
    expect(play(state, 0, ['C9', 'D9']).ok).toBe(true);
    expect(play(state, 0, ['C10', 'D10']).ok).toBe(true);
    expect(play(state, 0, ['C15', 'D15']).ok).toBe(true);
  });

  it('lets the holder of the 2 take a trick and refuses lower cards', () => {
    const state = table(
      [
        ['C15'],
        ['D14'],
        ['C13'],
      ],
      { turn: 0, trick: trick(1, 14, 1, ['H14']) },
    );
    expect(play(state, 0, ['C15']).ok).toBe(true);
    const blocked = table(
      [
        ['C13'],
        ['D14'],
        ['C15'],
      ],
      { turn: 0, trick: trick(1, 14, 1, ['H14']) },
    );
    expect(play(blocked, 0, ['C13']).error).toBe('too-low');
  });

  it('locks a player out after passing until the trick clears', () => {
    const state = table(
      [
        ['C3', 'H5'],
        ['D6', 'H7'],
        ['D8', 'H9'],
      ],
      { turn: 0 },
    );
    const played = play(state, 0, ['C3']);
    expect(played.ok).toBe(true);
    const firstPass = pass(played.state, 1);
    expect(firstPass.ok).toBe(true);
    expect(firstPass.state.passed[1]).toBe(true);
    const locked = { ...firstPass.state, turn: 1 };
    expect(play(locked, 1, ['D6']).error).toBe('already-passed');
    const secondPass = pass(firstPass.state, 2);
    expect(secondPass.ok).toBe(true);
    expect(secondPass.state.trick).toBeNull();
    expect(secondPass.state.turn).toBe(0);
    expect(secondPass.state.passed.every((value) => !value)).toBe(true);
  });

  it('clears the trick and moves the lead when the last player is already out', () => {
    const state = table(
      [
        ['C3'],
        ['D4', 'H5'],
        ['D6', 'H7'],
      ],
      { turn: 0, mustLeadClubs: true, starter: 0 },
    );
    const played = play(state, 0, ['C3']);
    expect(played.state.finish).toEqual([0]);
    const firstPass = pass(played.state, 1);
    const secondPass = pass(firstPass.state, 2);
    expect(secondPass.ok).toBe(true);
    expect(secondPass.state.trick).toBeNull();
    expect(secondPass.state.turn).toBe(1);
    expect(secondPass.state.phase).toBe('playing');
  });

  it('refuses a pass on a fresh trick and a pass with no trick', () => {
    const state = table(
      [
        ['C3', 'H4'],
        ['D5', 'H6'],
        ['D7', 'H8'],
      ],
      { turn: 0, mustLeadClubs: true, starter: 0 },
    );
    expect(pass(state, 0).error).toBe('no-trick');
  });

  it('never mutates the state passed into play or pass', () => {
    const state = table(
      [
        ['C3', 'H5'],
        ['D6', 'H7'],
        ['D8', 'H9'],
      ],
      { turn: 0 },
    );
    const snapshot = JSON.stringify(state);
    play(state, 0, ['C3']);
    pass({ ...state, turn: 2, trick: trick(1, 4, 1, ['S4']) }, 2);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('President finishing and ranks', () => {
  it('sets President, finish order and Scum, then stops play', () => {
    const state = table(
      [
        ['C3'],
        ['D4'],
        ['D6', 'H7'],
      ],
      { turn: 0, mustLeadClubs: true, starter: 0 },
    );
    let current = play(state, 0, ['C3']).state;
    current = pass(current, 1).state;
    current = pass(current, 2).state;
    current = play(current, 1, ['D4']).state;
    expect(current.phase).toBe('round-over');
    expect(current.order).toEqual([0, 1, 2]);
    expect(current.finish).toEqual([0, 1, 2]);
    expect(current.turn).toBe(2);
    expect(play(current, 2, ['D6']).error).toBe('phase');
  });

  it('turns finishing positions into the five roles', () => {
    expect(rolesFor([2, 0, 1], 3)).toEqual(['citizen', 'scum', 'president']);
    expect(rolesFor([1, 2, 3, 0], 4)).toEqual([
      'scum',
      'president',
      'vice',
      'vice-scum',
    ]);
    expect(rolesFor([2, 4, 0, 1, 3], 5)).toEqual([
      'citizen',
      'vice-scum',
      'president',
      'scum',
      'vice',
    ]);
    expect(rolesFor(null, 4)).toEqual([null, null, null, null]);
  });

  it('finishes a complete round for every table size', () => {
    for (const playerCount of [3, 4, 5, 6]) {
      for (let seed = 1; seed <= 3; seed += 1) {
        const state = autoRound(setup(playerCount, seeded(seed * 31 + playerCount), true));
        expect(state.phase).toBe('round-over');
        expect(state.order).toHaveLength(playerCount);
        expect(new Set(state.order).size).toBe(playerCount);
        expect(state.finish).toEqual(state.order);
        expect(state.hands[state.order![playerCount - 1]].length).toBeGreaterThan(0);
        const played = state.discard.length;
        const remaining = state.hands.reduce((sum, hand) => sum + hand.length, 0);
        expect(played + remaining).toBe(52);
      }
    }
  });
});

describe('President exchange and next round', () => {
  it('deals the next round to the President with exchange disabled', () => {
    const finished = autoRound(setup(4, seeded(77), false));
    const next = nextRound(finished, seeded(78));
    expect(next.phase).toBe('playing');
    expect(next.round).toBe(2);
    expect(next.turn).toBe(finished.order?.[0]);
    expect(next.starter).toBe(finished.order?.[0]);
    expect(next.order).toEqual(finished.order);
    expect(next.hands.flat()).toHaveLength(52);
    expect(next.mustLeadClubs).toBe(false);
    expect(next.finish).toEqual([]);
  });

  it('runs the next round through the exchange screen', () => {
    const finished = autoRound(setup(5, seeded(90), true));
    const next = nextRound(finished, seeded(91));
    expect(next.phase).toBe('exchange');
    expect(next.exchange).not.toBeNull();
    expect(next.exchange?.president).toBe(finished.order?.[0]);
    expect(next.exchange?.scum).toBe(finished.order?.[4]);
    expect(next.exchange?.count).toBe(2);
    expect(next.exchange?.vice).toBe(finished.order?.[1]);
    expect(next.exchange?.viceScum).toBe(finished.order?.[3]);
    const started = beginRound(next);
    expect(started.phase).toBe('playing');
    expect(started.turn).toBe(finished.order?.[0]);
    expect(started.trick).toBeNull();
  });

  it('moves the Scum best cards to the President and returns the lowest cards', () => {
    const hands = [
      cards('C3', 'D3', 'H4', 'S5'),
      cards('C6', 'D7'),
      cards('C8', 'D9'),
    ];
    const summary = performExchange(hands, [0, 2, 1], 3);
    expect(summary).toEqual({
      president: 0,
      scum: 1,
      count: 2,
      vice: null,
      viceScum: null,
      viceCount: 0,
    });
    expect(ids(hands[1])).toEqual(['C3', 'D3']);
    expect(ids(hands[0])).toEqual(['H4', 'S5', 'C6', 'D7']);
    expect(hands[0]).toHaveLength(4);
    expect(hands[1]).toHaveLength(2);
  });

  it('also swaps one card between the Vice President and Vice-Scum', () => {
    const hands = [
      cards('C3', 'D3', 'H4', 'S5', 'C6'),
      cards('D4', 'H5', 'S6', 'C7', 'D8'),
      cards('H6', 'S7', 'C8', 'D9', 'H10'),
      cards('S8', 'C9', 'D10', 'H11', 'S12'),
      cards('C10', 'D11', 'H12', 'S13', 'C14'),
    ];
    const summary = performExchange(hands, [0, 1, 2, 3, 4], 5);
    expect(summary.vice).toBe(1);
    expect(summary.viceScum).toBe(3);
    expect(summary.viceCount).toBe(1);
    expect(hands[3]).toHaveLength(5);
    expect(hands[1]).toHaveLength(5);
    expect(hands[0]).toHaveLength(5);
    expect(hands[4]).toHaveLength(5);
  });
});

describe('President private views', () => {
  it('shows only the requested hand and the public table', () => {
    const state = table(
      [
        ['C3', 'D3', 'H4'],
        ['C6', 'D6', 'H7'],
        ['C8', 'D8', 'H9'],
      ],
      { order: [1, 0, 2], turn: 1 },
    );
    const seatView = view(state, 1, ['@p1', '@p2', '@p3']);
    expect(ids(seatView.hand)).toEqual(['C6', 'D6', 'H7']);
    expect(seatView.handCounts).toEqual([3, 3, 3]);
    expect(seatView.roles).toEqual(['citizen', 'president', 'scum']);
    expect(seatView.names).toEqual(['@p1', '@p2', '@p3']);
    expect(seatView.canPlay).toBe(true);
    expect(seatView.canPass).toBe(false);
    expect(JSON.stringify(seatView)).not.toContain('C3');
    expect(JSON.stringify(seatView)).not.toContain('H4');
    expect('hands' in seatView).toBe(false);
  });

  it('enforces the seat on applySeat and gives a separate view to each player', () => {
    const state = table(
      [
        ['C3', 'H4'],
        ['D5', 'H6'],
        ['D7', 'H8'],
      ],
      { turn: 0 },
    );
    expect(applySeat(state, 1, { type: 'play', cards: ['D5'] }).error).toBe('wrong-turn');
    const after = applySeat(state, 0, { type: 'play', cards: ['C3'] });
    expect(after.ok).toBe(true);
    expect(view(after.state, 0).canPlay).toBe(false);
    expect(view(after.state, 1).canPlay).toBe(true);
  });
});

describe('President AI', () => {
  it('returns legal actions at every level', () => {
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      let state = setup(4, seeded(12), true);
      for (let step = 0; step < 12 && state.phase === 'playing'; step += 1) {
        const action = chooseAiAction(state, state.turn, level, seeded(400 + step));
        expect(action).not.toBeNull();
        if (!action) break;
        const result = applySeat(state, state.turn, action);
        expect(result.ok).toBe(true);
        state = result.state;
      }
    }
  });

  it('takes a legal out on Hard instead of passing', () => {
    const state = table(
      [
        ['C9'],
        ['D10'],
        ['H11'],
      ],
      { turn: 0 },
    );
    const action = chooseAiAction(state, 0, 'hard', seeded(5));
    expect(action).toEqual({ type: 'play', cards: ['C9'] });
  });

  it('keeps Companion gentle with a 2 when a low card is enough', () => {
    const state = table(
      [
        ['C7', 'C15'],
        ['D13'],
        ['H14'],
      ],
      {
        turn: 0,
        trick: trick(1, 6, 1, ['S6']),
        discard: cards('S6'),
      },
    );
    const action = chooseAiAction(state, 0, 'companion', seeded(9));
    expect(action).not.toBeNull();
    if (action?.type === 'play') {
      expect(action.cards).toEqual(['C7']);
    } else {
      expect(action).toEqual({ type: 'pass' });
    }
  });

  it('is deterministic with an injected RNG', () => {
    const state = table(
      [
        ['C7', 'D7', 'H9', 'S10', 'C12'],
        ['C6', 'D8', 'H8'],
        ['C9', 'D9', 'H10', 'S11'],
      ],
      { turn: 0 },
    );
    const first = chooseAiAction(state, 0, 'hard', seeded(71));
    const second = chooseAiAction(state, 0, 'hard', seeded(71));
    expect(second).toEqual(first);
  });

  it('does not read the opponents hidden cards', () => {
    const first = table(
      [
        ['C7', 'D7', 'H9', 'S10', 'C12'],
        ['C6', 'D8', 'H8'],
        ['C9', 'D9', 'H10', 'S11'],
      ],
      { turn: 0 },
    );
    const second: GameState = {
      ...first,
      hands: [
        first.hands[0],
        cards('S3', 'H4', 'D5'),
        cards('C4', 'S5', 'H6', 'D6'),
      ],
    };
    expect(chooseAiAction(second, 0, 'hard', seeded(72))).toEqual(
      chooseAiAction(first, 0, 'hard', seeded(72)),
    );
  });

  it('offers a legal fallback for a dropped LAN seat', () => {
    const state = table(
      [
        ['C3', 'H4'],
        ['D5', 'H6'],
        ['D7', 'H8'],
      ],
      { turn: 0, trick: trick(1, 4, 1, ['S4']), discard: cards('S4') },
    );
    const action = fallbackAction(state, 0);
    expect(action).not.toBeNull();
    expect(applySeat(state, 0, action!).ok).toBe(true);
  });

  it('plans hands by the minimum number of legal sets', () => {
    expect(handPlan(cards('C3', 'D3', 'H3', 'S4', 'D4', 'H5'))).toBe(3);
    expect(handPlan(cards('C15', 'D15'))).toBe(1);
  });
});

describe('President hints', () => {
  it('explains the forced club lead and is legal', () => {
    const state = table(
      [
        ['C3', 'D4', 'H5'],
        ['C6', 'D7'],
        ['C8', 'D9'],
      ],
      { turn: 0, mustLeadClubs: true, starter: 0 },
    );
    const hint = hintFor(state, 0);
    expect(hint?.kind).toBe('clubs');
    expect(hint?.cards.some((card) => card.id === 'C3')).toBe(true);
    expect(checkPlay(state, 0, ids(hint!.cards)).ok).toBe(true);
  });

  it('recommends a legal beat and a legal pass', () => {
    const beat = table(
      [
        ['C7', 'D7'],
        ['D13'],
        ['H14'],
      ],
      { turn: 0, trick: trick(1, 6, 1, ['S6']), discard: cards('S6') },
    );
    const hint = hintFor(beat, 0);
    expect(hint).not.toBeNull();
    expect(checkPlay(beat, 0, ids(hint!.cards)).ok).toBe(true);
    expect(['low', 'beat', 'control', 'goOut']).toContain(hint?.kind);

    const forcedPass = table(
      [
        ['C3', 'D4'],
        ['D14'],
        ['H13'],
      ],
      { turn: 0, trick: trick(1, 14, 1, ['S14']), discard: cards('S14') },
    );
    const passHint = hintFor(forcedPass, 0);
    expect(passHint?.kind).toBe('pass');
    expect(passHint?.action.type).toBe('pass');
  });

  it('returns no hint out of turn or after the round', () => {
    const state = table(
      [
        ['C3', 'H4'],
        ['D5', 'H6'],
        ['D7', 'H8'],
      ],
      { turn: 1 },
    );
    expect(hintFor(state, 0)).toBeNull();
    const finished = autoRound(setup(3, seeded(33), false));
    expect(hintFor(finished, 0)).toBeNull();
  });
});

describe('President family record', () => {
  const state = autoRound(setup(4, seeded(55), false));
  const names = ['@p1', '@p2', '@p3', '@p4'];

  it('records the President, Scum and full order', () => {
    const record = addRound(EMPTY_RECORD, state, names, { mode: 'local' }, 1000);
    expect(record.rounds).toBe(1);
    expect(record.byMode.local).toBe(1);
    expect(record.recent).toHaveLength(1);
    expect(record.recent[0].order).toHaveLength(4);
    expect(record.presidents[record.recent[0].president]).toBe(1);
    expect(record.scums[record.recent[0].scum]).toBe(1);
    expect(record.lastPresident).toBe(record.recent[0].president);
  });

  it('counts modes, level and only the eight newest rounds', () => {
    let record: FamilyRecord = EMPTY_RECORD;
    for (let index = 0; index < 11; index += 1) {
      record = addRound(
        record,
        state,
        names,
        { mode: index % 2 === 0 ? 'ai' : 'lan', ...(index % 2 === 0 ? { level: 'normal' } : {}) },
        1000 + index,
      );
    }
    expect(record.rounds).toBe(11);
    expect(record.byMode.ai).toBe(6);
    expect(record.byMode.lan).toBe(5);
    expect(record.recent).toHaveLength(8);
    expect(record.recent[0].at).toBe(1010);
    expect(record.recent[0].level).toBe('normal');
  });

  it('normalizes malformed and legacy records', () => {
    const record = normalizeRecord({
      rounds: 4.9,
      presidents: { '@p1': 3, bad: -1, '@p2': 'x' },
      scums: { '@p3': 2 },
      lastPresident: '@p1',
      recent: [
        {
          president: '@p1',
          scum: '@p2',
          order: ['@p1', '@p2', '@p3'],
          playerCount: 3,
          mode: 'local',
          at: 123,
        },
        { president: '', scum: 'x', order: [], playerCount: 9, mode: 'nope', at: 0 },
      ],
    } as unknown as Partial<FamilyRecord>);
    expect(record.rounds).toBe(4);
    expect(record.presidents).toEqual({ '@p1': 3 });
    expect(record.scums).toEqual({ '@p3': 2 });
    expect(record.lastPresident).toBe('@p1');
    expect(record.recent).toHaveLength(1);
    expect(record.byMode).toEqual({ ai: 0, local: 0, lan: 0 });
  });

  it('ignores a round that has not finished', () => {
    const playing = setup(4, seeded(56), false);
    expect(addRound(EMPTY_RECORD, playing, names, { mode: 'local' }, 1000)).toBe(
      EMPTY_RECORD,
    );
  });
});

describe('Bilingual copy', () => {
  it('keeps Chinese out of the English UI except the language switch', () => {
    for (const [key, value] of Object.entries(MESSAGES.en)) {
      if (key === 'language') continue;
      expect(value, key).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it('keeps English words out of the Chinese UI except the language switch', () => {
    const allowed = new Set(['language']);
    for (const [key, value] of Object.entries(MESSAGES.zh)) {
      if (allowed.has(key)) continue;
      const text = value.replace(/\{[a-zA-Z]+\}/g, '');
      expect(text, key).not.toMatch(/[A-Za-z]{2,}/);
    }
  });
});
