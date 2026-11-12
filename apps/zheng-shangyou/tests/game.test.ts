import { describe, expect, it } from 'vitest';
import { chooseAiAction, chooseTributeReturn, decomposeHand, fallbackAction, handPlan } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import {
  DECK,
  allCombos,
  applySeat,
  beginRound,
  canBeat,
  checkPlay,
  detectCombo,
  legalPlays,
  nextRound,
  pass,
  play,
  pointsFor,
  pointsSummary,
  returnTribute,
  setup,
  tributePairs,
  view,
  type Card,
  type GameState,
  type Rng,
} from '../src/game/zheng-shangyou';
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

function ids(list: readonly Card[]): string[] {
  return list.map((card) => card.id);
}

function table(hands: string[][], overrides: Partial<GameState> = {}): GameState {
  const playerCount = hands.length;
  const base = setup(playerCount, () => 0.5, true);
  const dealt = hands.map((hand) => cards(...hand).sort((a, b) => a.rank - b.rank));
  return {
    ...base,
    hands: dealt,
    turn: 0,
    starter: 0,
    mustLeadClubs: false,
    trick: null,
    passes: 0,
    finish: [],
    order: null,
    phase: 'playing',
    scores: Array.from({ length: playerCount }, () => 0),
    roundPoints: Array.from({ length: playerCount }, () => 0),
    tribute: null,
    discard: [],
    last: null,
    ...overrides,
  };
}

function trick(seat: number, cardIds: string[]) {
  const combo = detectCombo(cards(...cardIds));
  if (!combo) throw new Error('invalid test trick');
  return { seat, combo };
}

function autoRound(start: GameState): GameState {
  let state = start;
  for (let step = 0; step < 4000 && state.phase === 'playing'; step += 1) {
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

describe('Zheng Shangyou deck and deal', () => {
  it('has 52 unique cards and the classic climbing ranks', () => {
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
});

describe('Combination detection', () => {
  it('detects every supported combination', () => {
    expect(detectCombo(cards('C3'))).toMatchObject({ type: 'single', rank: 3, length: 1 });
    expect(detectCombo(cards('C3', 'D3'))).toMatchObject({ type: 'pair', rank: 3, length: 2 });
    expect(detectCombo(cards('C3', 'D3', 'H3'))).toMatchObject({ type: 'triple', rank: 3 });
    expect(detectCombo(cards('C3', 'D3', 'H3', 'S4'))).toMatchObject({
      type: 'triple-single',
      rank: 3,
      length: 4,
    });
    expect(detectCombo(cards('C3', 'D3', 'H3', 'S4', 'D4'))).toMatchObject({
      type: 'triple-pair',
      rank: 3,
      length: 5,
    });
    expect(detectCombo(cards('C3', 'D4', 'H5', 'S6', 'C7'))).toMatchObject({
      type: 'straight',
      rank: 7,
      length: 5,
    });
    expect(detectCombo(cards('C3', 'D3', 'C4', 'D4', 'C5', 'D5'))).toMatchObject({
      type: 'pair-straight',
      rank: 5,
      length: 6,
    });
    expect(detectCombo(cards('C3', 'D3', 'H3', 'S3'))).toMatchObject({
      type: 'bomb',
      rank: 3,
      length: 4,
    });
  });

  it('allows long straights and pair roads up to the ace', () => {
    expect(detectCombo(cards('C3', 'D4', 'H5', 'S6', 'C7', 'D8', 'H9', 'S10', 'C11', 'D12', 'H13', 'S14')))
      .toMatchObject({ type: 'straight', rank: 14, length: 12 });
    expect(detectCombo(cards('C3', 'D3', 'C4', 'D4', 'C5', 'D5', 'C6', 'D6')))
      .toMatchObject({ type: 'pair-straight', rank: 6, length: 8 });
  });

  it('rejects malformed, gapped and two-containing roads', () => {
    expect(detectCombo(cards('C3', 'S4'))).toBeNull();
    expect(detectCombo(cards('C3', 'C3'))).toBeNull();
    expect(detectCombo(cards('C3', 'D3', 'C4', 'D4'))).toBeNull();
    expect(detectCombo(cards('C3', 'C4', 'C5', 'C7', 'C8'))).toBeNull();
    expect(detectCombo(cards('C11', 'C12', 'C13', 'C14', 'C15'))).toBeNull();
    expect(detectCombo(cards('C3', 'D3', 'H3', 'S3', 'C4'))).toBeNull();
    expect(detectCombo(cards('C3', 'D3', 'H3', 'S4', 'D5'))).toBeNull();
  });
});

describe('Beating a trick', () => {
  it('compares only same type and length, strictly higher', () => {
    const single3 = detectCombo(cards('C3'))!;
    const single4 = detectCombo(cards('D4'))!;
    const single2 = detectCombo(cards('C15'))!;
    expect(canBeat(single4, single3)).toBe(true);
    expect(canBeat(single3, single3)).toBe(false);
    expect(canBeat(single3, single4)).toBe(false);
    expect(canBeat(single2, single3)).toBe(true);
    expect(canBeat(detectCombo(cards('C4', 'D4'))!, single3)).toBe(false);
    expect(canBeat(detectCombo(cards('C3', 'D4', 'H5', 'S6', 'C7'))!, detectCombo(cards('C4', 'D5', 'H6', 'S7', 'C8'))!)).toBe(false);
  });

  it('lets a bomb beat any non-bomb and higher bombs beat lower bombs', () => {
    const straight = detectCombo(cards('C3', 'D4', 'H5', 'S6', 'C7'))!;
    const bomb3 = detectCombo(cards('C3', 'D3', 'H3', 'S3'))!;
    const bomb9 = detectCombo(cards('C9', 'D9', 'H9', 'S9'))!;
    expect(canBeat(bomb3, straight)).toBe(true);
    expect(canBeat(straight, bomb3)).toBe(false);
    expect(canBeat(bomb9, bomb3)).toBe(true);
    expect(canBeat(bomb3, bomb9)).toBe(false);
    expect(canBeat(bomb3, bomb3)).toBe(false);
  });

  it('enforces the 3♣ opening lead', () => {
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
    expect(legal.every((cardsToPlay) => cardsToPlay.some((card) => card.id === 'C3'))).toBe(true);
    expect(play(state, 0, ['H4']).error).toBe('must-lead-clubs');
    expect(play(state, 0, ['C3']).ok).toBe(true);
    expect(play(state, 0, ['C3', 'D3']).ok).toBe(true);
  });

  it('rejects wrong turns, foreign cards, empty plays and weaker combos', () => {
    const state = table(
      [
        ['C8', 'D8', 'C9', 'D9', 'C10', 'D10', 'C15', 'D15'],
        ['C3', 'D4'],
        ['C5', 'D6'],
      ],
      {
        turn: 0,
        trick: trick(1, ['H9', 'S9']),
        discard: cards('H9', 'S9'),
      },
    );
    expect(checkPlay(state, 1, ['C3']).error).toBe('wrong-turn');
    expect(checkPlay(state, 0, ['C3']).error).toBe('not-your-card');
    expect(checkPlay(state, 0, []).error).toBe('empty');
    expect(checkPlay(state, 0, ['C8', 'C9']).error).toBe('invalid-combo');
    expect(checkPlay(state, 0, ['C8', 'D8']).error).toBe('does-not-beat');
    expect(checkPlay(state, 0, ['C10', 'D10']).ok).toBe(true);
    expect(checkPlay(state, 0, ['C15', 'D15']).ok).toBe(true);
  });

  it('lists only legal followers and includes a bomb', () => {
    const state = table(
      [
        ['C8', 'D8', 'C9', 'D9', 'C3', 'D3', 'H3', 'S3'],
        ['C4', 'D5'],
        ['C6', 'D7'],
      ],
      { turn: 0, trick: trick(1, ['H8', 'S8']), discard: cards('H8', 'S8') },
    );
    const legal = legalPlays(state, 0);
    expect(legal.some((list) => list.length === 4 && list.every((card) => card.rank === 3))).toBe(true);
    expect(legal.filter((list) => list.length === 2).every((list) => list[0].rank >= 9)).toBe(true);
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
    pass({ ...state, turn: 2, trick: trick(1, ['S4']) }, 2);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('Trick flow and passing', () => {
  it('removes played cards and advances to the next active seat', () => {
    const state = table(
      [
        ['C3', 'H5'],
        ['D6', 'H7'],
        ['D8', 'H9'],
      ],
      { turn: 0 },
    );
    const result = play(state, 0, ['C3']);
    expect(result.ok).toBe(true);
    expect(ids(result.state.hands[0])).toEqual(['H5']);
    expect(result.state.turn).toBe(1);
    expect(result.state.passes).toBe(0);
    expect(result.state.trick?.combo.type).toBe('single');
  });

  it('refuses a pass on a fresh trick', () => {
    const state = table(
      [
        ['C3', 'H4'],
        ['D5', 'H6'],
        ['D7', 'H8'],
      ],
      { turn: 0 },
    );
    expect(pass(state, 0).error).toBe('no-trick');
  });

  it('clears the trick after two consecutive passes', () => {
    const state = table(
      [
        ['C3', 'H5'],
        ['D6', 'H7'],
        ['D8', 'H9'],
      ],
      { turn: 0 },
    );
    const played = play(state, 0, ['C3']);
    const first = pass(played.state, 1);
    expect(first.ok).toBe(true);
    expect(first.state.passes).toBe(1);
    expect(first.state.trick).not.toBeNull();
    expect(first.state.turn).toBe(2);
    const second = pass(first.state, 2);
    expect(second.ok).toBe(true);
    expect(second.state.passes).toBe(0);
    expect(second.state.trick).toBeNull();
    expect(second.state.turn).toBe(0);
  });

  it('uses exactly two passes even with five active seats', () => {
    const state = table(
      [
        ['C3'],
        ['D4'],
        ['D5'],
        ['D6'],
        ['D7'],
      ],
      { turn: 0 },
    );
    const played = play(state, 0, ['C3']);
    const first = pass(played.state, 1);
    const second = pass(first.state, 2);
    expect(second.state.trick).toBeNull();
    expect(second.state.turn).toBe(1);
    expect(second.state.hands[3]).toHaveLength(1);
    expect(second.state.hands[4]).toHaveLength(1);
  });

  it('moves the lead to the next active seat when the trick winner is out', () => {
    const state = table(
      [
        ['C3'],
        ['D4', 'H5'],
        ['D6', 'H7'],
      ],
      { turn: 0 },
    );
    const played = play(state, 0, ['C3']);
    expect(played.state.finish).toEqual([0]);
    const first = pass(played.state, 1);
    const second = pass(first.state, 2);
    expect(second.ok).toBe(true);
    expect(second.state.trick).toBeNull();
    expect(second.state.turn).toBe(1);
    expect(second.state.phase).toBe('playing');
  });
});

describe('Finish order and scoring', () => {
  it('records upstream, middle places and downstream', () => {
    const state = table(
      [
        ['C3'],
        ['D4'],
        ['D6', 'H7'],
      ],
      { turn: 0 },
    );
    let current = play(state, 0, ['C3']).state;
    current = pass(current, 1).state;
    current = pass(current, 2).state;
    current = play(current, 1, ['D4']).state;
    expect(current.phase).toBe('round-over');
    expect(current.order).toEqual([0, 1, 2]);
    expect(current.finish).toEqual([0, 1, 2]);
    expect(current.roundPoints).toEqual([3, 0, -3]);
    expect(current.scores).toEqual([3, 0, -3]);
    expect(play(current, 2, ['D6']).error).toBe('phase');
  });

  it('finishes a complete round for every table size', () => {
    for (const playerCount of [3, 4, 5, 6]) {
      for (let seed = 1; seed <= 2; seed += 1) {
        const state = autoRound(setup(playerCount, seeded(seed * 37 + playerCount), true));
        expect(state.phase).toBe('round-over');
        expect(state.order).toHaveLength(playerCount);
        expect(new Set(state.order).size).toBe(playerCount);
        expect(state.finish).toEqual(state.order);
        expect(state.hands[state.order![playerCount - 1]].length).toBeGreaterThan(0);
        expect(pointsSummary(state.roundPoints)).toBe(0);
        expect(state.scores).toEqual(state.roundPoints);
        expect(state.discard.length + state.hands.reduce((sum, hand) => sum + hand.length, 0)).toBe(52);
      }
    }
  });

  it('uses scaled zero-sum points for every seat count', () => {
    expect(pointsFor(3)).toEqual([3, 0, -3]);
    expect(pointsFor(4)).toEqual([3, 1, -1, -3]);
    expect(pointsFor(5)).toEqual([3, 1, 0, -1, -3]);
    expect(pointsFor(6)).toEqual([3, 2, 1, -1, -2, -3]);
    for (const playerCount of [3, 4, 5, 6]) {
      expect(pointsSummary(pointsFor(playerCount))).toBe(0);
    }
  });

  it('carries cumulative scores across deals', () => {
    const finished = autoRound(setup(4, seeded(77), false));
    const next = nextRound(finished, seeded(78));
    expect(next.scores).toEqual(finished.scores);
    const finishedAgain = autoRound(next);
    expect(finishedAgain.scores).toEqual(
      finished.scores.map((score, seat) => score + finishedAgain.roundPoints[seat]),
    );
  });
});

describe('Tribute and next round', () => {
  it('pairs the bottom of the order with the top', () => {
    expect(tributePairs([0, 1, 2], 3)).toEqual([{ from: 2, to: 0 }]);
    expect(tributePairs([0, 1, 2, 3], 4)).toEqual([{ from: 3, to: 0 }]);
    expect(tributePairs([0, 1, 2, 3, 4], 5)).toEqual([
      { from: 4, to: 0 },
      { from: 3, to: 1 },
    ]);
    expect(tributePairs([0, 1, 2, 3, 4, 5], 6)).toEqual([
      { from: 5, to: 0 },
      { from: 4, to: 1 },
    ]);
  });

  it('pauses the next deal for tribute and moves the highest card', () => {
    const finished = autoRound(setup(4, seeded(90), true));
    const order = finished.order!;
    const next = nextRound(finished, seeded(91));
    expect(next.phase).toBe('tribute');
    expect(next.round).toBe(2);
    expect(next.tribute?.pairs).toHaveLength(1);
    const pair = next.tribute!.pairs[0];
    expect(pair.from).toBe(order[3]);
    expect(pair.to).toBe(order[0]);
    expect(next.hands[pair.to].some((card) => card.id === pair.given.id)).toBe(true);
    const giverHand = next.hands[pair.from];
    expect(Math.max(...giverHand.map((card) => card.rank), pair.given.rank)).toBe(pair.given.rank);
    expect(next.hands.flat()).toHaveLength(52);
    expect(next.hands.reduce((sum, hand) => sum + hand.length, 0)).toBe(52);
  });

  it('makes both downstream seats pay tribute at five and six seats', () => {
    const finished = autoRound(setup(6, seeded(44), true));
    const order = finished.order!;
    const next = nextRound(finished, seeded(45));
    expect(next.tribute?.pairs).toHaveLength(2);
    expect(next.tribute?.pairs[0]).toMatchObject({ from: order[5], to: order[0] });
    expect(next.tribute?.pairs[1]).toMatchObject({ from: order[4], to: order[1] });
  });

  it('returns any card and then starts with the 3♣ holder', () => {
    const finished = autoRound(setup(5, seeded(66), true));
    let next = nextRound(finished, seeded(67));
    expect(next.phase).toBe('tribute');
    let guard = 0;
    while (next.tribute?.pairs.some((pair) => pair.returned === null) && guard < 4) {
      guard += 1;
      const pair = next.tribute.pairs.find((item) => item.returned === null)!;
      const card = next.hands[pair.to][0];
      const result = returnTribute(next, pair.to, card.id);
      expect(result.ok).toBe(true);
      next = result.state;
    }
    expect(guard).toBe(2);
    expect(next.hands.flat()).toHaveLength(52);
    const started = beginRound(next);
    expect(started.phase).toBe('playing');
    expect(started.hands[started.turn].some((card) => card.id === 'C3')).toBe(true);
    expect(started.mustLeadClubs).toBe(true);
  });

  it('can switch tribute off', () => {
    const finished = autoRound(setup(4, seeded(80), false));
    const next = nextRound(finished, seeded(81));
    expect(next.phase).toBe('playing');
    expect(next.tribute).toBeNull();
    expect(next.hands[next.turn].some((card) => card.id === 'C3')).toBe(true);
  });
});

describe('Private seat views', () => {
  it('shows only the requested hand and the public table', () => {
    const state = table(
      [
        ['C3', 'D3', 'H4'],
        ['C6', 'D6', 'H7'],
        ['C8', 'D8', 'H9'],
      ],
      { turn: 1, order: [1, 0, 2], phase: 'round-over', finish: [1, 0, 2] },
    );
    const seatView = view(state, 1, ['@p1', '@p2', '@p3']);
    expect(ids(seatView.hand)).toEqual(['C6', 'D6', 'H7']);
    expect(seatView.handCounts).toEqual([3, 3, 3]);
    expect(seatView.names).toEqual(['@p1', '@p2', '@p3']);
    expect(seatView.order).toEqual([1, 0, 2]);
    expect('hands' in seatView).toBe(false);
    const text = JSON.stringify(seatView);
    expect(text).not.toContain('C3');
    expect(text).not.toContain('H4');
    expect(text).not.toContain('C8');
  });

  it('enforces the seat and exposes the tribute choice only to its receiver', () => {
    const base = table(
      [
        ['C3', 'H4', 'D5'],
        ['C6', 'D6', 'H7'],
        ['C8', 'D8', 'H9'],
      ],
      { turn: 0 },
    );
    expect(applySeat(base, 1, { type: 'play', cards: ['C6'] }).error).toBe('wrong-turn');
    const after = applySeat(base, 0, { type: 'play', cards: ['C3'] });
    expect(after.ok).toBe(true);
    expect(view(after.state, 0).canPlay).toBe(false);
    expect(view(after.state, 1).canPlay).toBe(true);

    const tributeState: GameState = {
      ...base,
      phase: 'tribute',
      turn: 2,
      tribute: {
        pairs: [{ from: 2, to: 0, given: cards('S9')[0], returned: null }],
      },
    };
    expect(view(tributeState, 0).canTribute).toBe(true);
    expect(view(tributeState, 2).canTribute).toBe(false);
    expect(view(tributeState, 1).canTribute).toBe(false);
  });

  it('validates tribute ownership and turn', () => {
    const base = table(
      [
        ['C3', 'H4', 'D5'],
        ['C6', 'D6', 'H7'],
        ['C8', 'D8', 'H9'],
      ],
      {
        phase: 'tribute',
        turn: 0,
        tribute: { pairs: [{ from: 2, to: 0, given: cards('S4')[0], returned: null }] },
      },
    );
    expect(returnTribute(base, 1, 'C6').error).toBe('wrong-turn');
    expect(returnTribute(base, 0, 'C9').error).toBe('not-your-card');
    expect(returnTribute(base, 0, 'H4').ok).toBe(true);
  });
});

describe('AI levels', () => {
  it('returns legal actions at every level', () => {
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      let state = setup(4, seeded(12), true);
      for (let step = 0; step < 6 && state.phase === 'playing'; step += 1) {
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
    expect(chooseAiAction(state, 0, 'hard', seeded(5))).toEqual({
      type: 'play',
      cards: ['C9'],
    });
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
    expect(chooseAiAction(state, 0, 'hard', seeded(71))).toEqual(
      chooseAiAction(state, 0, 'hard', seeded(71)),
    );
  });

  it('does not read opponents hidden cards', () => {
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

  it('keeps Companion gentle with high cards when a low beat exists', () => {
    const state = table(
      [
        ['C7', 'C15'],
        ['D13'],
        ['H14'],
      ],
      {
        turn: 0,
        trick: trick(1, ['S6']),
        discard: cards('S6'),
      },
    );
    const action = chooseAiAction(state, 0, 'companion', seeded(9));
    expect(action?.type).toBe('play');
    if (action?.type === 'play') expect(action.cards).toEqual(['C7']);
  });

  it('returns a low, non-3♣ tribute card when possible', () => {
    const state = table(
      [
        ['C3', 'D4', 'H5'],
        ['C6', 'D6', 'H7'],
        ['C8', 'D8', 'H9'],
      ],
      {
        phase: 'tribute',
        turn: 0,
        tribute: { pairs: [{ from: 2, to: 0, given: cards('S9')[0], returned: null }] },
      },
    );
    expect(chooseTributeReturn(state, 0, 'normal', seeded(3))?.id).toBe('D4');
    expect(chooseTributeReturn(state, 0, 'hard', seeded(3))?.id).toBe('D4');
  });

  it('offers a legal fallback for a dropped LAN seat', () => {
    const state = table(
      [
        ['C3', 'H4'],
        ['D5', 'H6'],
        ['D7', 'H8'],
      ],
      { turn: 0, trick: trick(1, ['S4']), discard: cards('S4') },
    );
    const action = fallbackAction(state, 0);
    expect(action).not.toBeNull();
    expect(applySeat(state, 0, action!).ok).toBe(true);
  });
});

describe('Combo decomposition', () => {
  it('counts a triple with a kicker and a pair as two sets', () => {
    expect(handPlan(cards('C3', 'D3', 'H3', 'S4', 'D4', 'H5'))).toBe(2);
    expect(decomposeHand(cards('C3', 'D3', 'H3', 'S4', 'D4', 'H5'))).toHaveLength(2);
  });

  it('keeps a straight and a pair together', () => {
    expect(handPlan(cards('C3', 'D4', 'H5', 'S6', 'C7', 'D9', 'H9'))).toBe(2);
  });

  it('keeps consecutive pairs as one set', () => {
    expect(handPlan(cards('C3', 'D3', 'C4', 'D4', 'C5', 'D5'))).toBe(1);
  });

  it('finds every legal combination family in a mixed hand', () => {
    const combos = allCombos(cards('C3', 'D3', 'H3', 'S3', 'C4', 'D5', 'H6', 'S7', 'C8'));
    expect(combos.some((combo) => combo.type === 'bomb')).toBe(true);
    expect(combos.some((combo) => combo.type === 'straight')).toBe(true);
    expect(combos.some((combo) => combo.type === 'triple-single')).toBe(true);
  });

  it('keeps every card in valid combinations when kickers are scarce', () => {
    const hand = cards('C3', 'D3', 'H3', 'C4', 'D4', 'H4', 'C5', 'D5');
    const plan = decomposeHand(hand);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.flatMap((combo) => combo.cards)).toHaveLength(hand.length);
    for (const combo of plan) {
      expect(detectCombo(combo.cards), combo.type).not.toBeNull();
    }
  });
});

describe('Hints', () => {
  it('explains the forced 3♣ lead and is legal', () => {
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
      { turn: 0, trick: trick(1, ['S6']), discard: cards('S6') },
    );
    const hint = hintFor(beat, 0);
    expect(hint).not.toBeNull();
    expect(checkPlay(beat, 0, ids(hint!.cards)).ok).toBe(true);
    expect(['low', 'beat', 'control', 'goOut', 'save']).toContain(hint?.kind);

    const forcedPass = table(
      [
        ['C3', 'D4'],
        ['D14'],
        ['H13'],
      ],
      { turn: 0, trick: trick(1, ['S15']), discard: cards('S15') },
    );
    const passHint = hintFor(forcedPass, 0);
    expect(passHint?.kind).toBe('pass');
    expect(passHint?.action.type).toBe('pass');
  });

  it('suggests a tribute return and is legal', () => {
    const state = table(
      [
        ['C3', 'D4', 'H5'],
        ['C6', 'D6', 'H7'],
        ['C8', 'D8', 'H9'],
      ],
      {
        phase: 'tribute',
        turn: 0,
        tribute: { pairs: [{ from: 2, to: 0, given: cards('S9')[0], returned: null }] },
      },
    );
    const hint = hintFor(state, 0);
    expect(hint?.kind).toBe('tribute');
    expect(hint?.action.type).toBe('tribute');
    expect(returnTribute(state, 0, hint!.cards[0].id).ok).toBe(true);
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

describe('Family record', () => {
  const finished = autoRound(setup(4, seeded(55), false));
  const names = ['@p1', '@p2', '@p3', '@p4'];

  it('records the full order, round points and winner', () => {
    const record = addRound(EMPTY_RECORD, finished, names, { mode: 'local' }, 1000);
    expect(record.rounds).toBe(1);
    expect(record.byMode.local).toBe(1);
    expect(record.recent).toHaveLength(1);
    expect(record.recent[0].order).toHaveLength(4);
    expect(record.recent[0].points).toEqual(
      finished.order!.map((seat) => finished.roundPoints[seat]),
    );
    expect(record.finishes[names[0]]).toBe(1);
    expect(record.lastWinner).toBe(names[finished.order![0]]);
    expect(record.points[names[finished.order![0]]]).toBe(
      finished.roundPoints[finished.order![0]],
    );
    expect(record.points[names[finished.order![3]]]).toBe(
      finished.roundPoints[finished.order![3]],
    );
  });

  it('counts modes and keeps only the eight newest rounds', () => {
    let record: FamilyRecord = EMPTY_RECORD;
    for (let index = 0; index < 11; index += 1) {
      record = addRound(
        record,
        finished,
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
      finishes: { '@p1': 3, bad: -1, '@p2': 'x' },
      points: { '@p1': 3, '@p2': -2, bad: 'x' },
      lastWinner: '@p1',
      recent: [
        {
          order: ['@p1', '@p2', '@p3'],
          points: [3, 0, -3],
          playerCount: 3,
          mode: 'local',
          at: 123,
        },
        { order: [], points: [], playerCount: 9, mode: 'nope', at: 0 },
      ],
    } as unknown as Partial<FamilyRecord>);
    expect(record.rounds).toBe(4);
    expect(record.finishes).toEqual({ '@p1': 3 });
    expect(record.points).toEqual({ '@p1': 3, '@p2': -2 });
    expect(record.lastWinner).toBe('@p1');
    expect(record.recent).toHaveLength(1);
    expect(record.byMode).toEqual({ ai: 0, local: 0, lan: 0 });
  });

  it('ignores a round that has not finished', () => {
    const playing = setup(4, seeded(56), false);
    expect(addRound(EMPTY_RECORD, playing, names, { mode: 'local' }, 1000)).toBe(EMPTY_RECORD);
  });
});

describe('Bilingual copy', () => {
  it('keeps Chinese out of the English UI except the language switch', () => {
    for (const [key, value] of Object.entries(MESSAGES.en)) {
      if (key === 'language') continue;
      expect(value, key).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it('keeps English words out of the Chinese UI except the switch and card names', () => {
    const allowed = new Set(['language']);
    for (const [key, value] of Object.entries(MESSAGES.zh)) {
      if (allowed.has(key)) continue;
      const text = value
        .replace(/\{rank\}/g, '')
        .replace(/\{suit\}/g, '')
        .replace(/\{[a-zA-Z]+\}/g, '')
        .replace(/[JQKA]{1,4}/g, '');
      expect(text, key).not.toMatch(/[A-Za-z]{2,}/);
    }
  });
});
