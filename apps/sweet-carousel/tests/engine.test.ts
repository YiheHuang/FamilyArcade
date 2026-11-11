import { describe, expect, it } from 'vitest';
import {
  apply,
  cloneState,
  deserialize,
  invariants,
  legal,
  result,
  replay,
  score,
  serialize,
  setupFromSeed,
  view,
} from '../src/game/engine';
import { CARD_IDS, HAND_SIZE } from '../src/game/data';
import type { GameState, PickRound, RoundBreakdown } from '../src/game/types';
import { advance, completeRound, config, firstPicks, moveLog, nextRound, playGame, seats } from './helpers';

function pick(state: GameState, seat: number, cardId: number) {
  return apply(state, { kind: 'pick', seat, cardId });
}

/** Every array nested anywhere in a view, used to prove hidden hands do not leak. */
function arraysIn(value: unknown): unknown[][] {
  const found: unknown[][] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      found.push(node);
      for (const item of node) walk(item);
    } else if (node && typeof node === 'object') {
      for (const item of Object.values(node)) walk(item);
    }
  };
  walk(value);
  return found;
}

describe('setup and dealing', () => {
  it('deals eight cards per player for every round', () => {
    for (const count of [2, 3, 4, 5] as const) {
      const state = setupFromSeed(config(count));
      expect(state.version).toBe(1);
      expect(state.phase).toBe('choosing');
      expect(state.round).toBe(1);
      expect(state.pickIndex).toBe(0);
      expect(state.passDirection).toBe('left');
      expect(state.hands).toHaveLength(count);
      for (const hand of state.hands) expect(hand).toHaveLength(HAND_SIZE);
      expect(state.deals).toHaveLength(3);
      for (const round of state.deals) {
        expect(round).toHaveLength(count);
        for (const hand of round) expect(hand).toHaveLength(HAND_SIZE);
        const flat = round.flat();
        expect(new Set(flat).size).toBe(flat.length);
        expect(flat.every((id) => CARD_IDS.includes(id))).toBe(true);
      }
      expect(state.collected.every((cards) => cards.length === 0)).toBe(true);
      expect(invariants(state)).toEqual([]);
    }
  });

  it('is deterministic for the same seed and different for another seed', () => {
    const a = setupFromSeed(config(3, 'same'));
    const b = setupFromSeed(config(3, 'same'));
    const c = setupFromSeed(config(3, 'different'));
    expect(a.hands).toEqual(b.hands);
    expect(a.deals).toEqual(b.deals);
    expect(a.hands).not.toEqual(c.hands);
  });

  it('rejects invalid configurations', () => {
    expect(() => setupFromSeed({ ...config(2), playerCount: 6 as never })).toThrow();
    expect(() => setupFromSeed({ ...config(2), seats: seats(3) })).toThrow();
    expect(() => setupFromSeed({ ...config(2), seats: [{ ...seats(2)[0], name: '  ' }, seats(2)[1]] })).toThrow();
  });
});

describe('simultaneous picks', () => {
  it('offers one legal pick per card in hand and none after a pick', () => {
    const state = setupFromSeed(config(3));
    expect(legal(state, 0)).toHaveLength(8);
    expect(legal(state, 1)).toHaveLength(8);
    const card = state.hands[0][0];
    const out = pick(state, 0, card);
    if (!out.ok) throw new Error('pick failed');
    expect(legal(out.state, 0)).toEqual([]);
    expect(legal(out.state, 1)).toHaveLength(8);
    expect(legal(out.state, 3)).toEqual([]);
    expect(legal(out.state, -1)).toEqual([]);
  });

  it('accepts one hidden pick per seat and reveals only when everyone has picked', () => {
    let state = setupFromSeed(config(3));
    const picks = state.hands.map((hand) => hand[0]);
    const out0 = pick(state, 0, picks[0]);
    expect(out0.ok).toBe(true);
    if (!out0.ok) return;
    state = out0.state;
    expect(state.phase).toBe('choosing');
    expect(state.pending).toEqual([picks[0], null, null]);
    expect(state.hands[0]).toContain(picks[0]);
    expect(view(state, 1).myPending).toBeNull();

    const out1 = pick(state, 1, picks[1]);
    expect(out1.ok).toBe(true);
    if (!out1.ok) return;
    state = out1.state;
    expect(state.phase).toBe('choosing');

    const out2 = pick(state, 2, picks[2]);
    expect(out2.ok).toBe(true);
    if (!out2.ok) return;
    state = out2.state;
    expect(state.phase).toBe('reveal');
    expect(state.revealed.map((entry) => entry.cardId)).toEqual(picks);
    expect(state.hands.every((hand) => hand.length === HAND_SIZE - 1)).toBe(true);
    expect(state.roundCollected.map((cards) => cards[0])).toEqual(picks);
    expect(invariants(state)).toEqual([]);
  });

  it('rejects picks with explainable error codes', () => {
    const state = setupFromSeed(config(2));
    const card = state.hands[0][0];
    expect(apply(state, { kind: 'pick', seat: 0, cardId: card })).toMatchObject({ ok: true });

    const after = pick(state, 0, card);
    if (!after.ok) throw new Error('setup pick failed');
    expect(pick(after.state, 0, after.state.hands[0][1])).toEqual({
      ok: false,
      reason: 'already-picked',
      params: { seat: 0 },
    });
    expect(pick(state, 2, card)).toMatchObject({ ok: false, reason: 'bad-seat' });
    expect(pick(state, -1, card)).toMatchObject({ ok: false, reason: 'bad-seat' });
    expect(pick(state, 0, 9999)).toMatchObject({ ok: false, reason: 'card-not-in-hand' });
    expect(pick(state, 1, state.hands[0][0])).toMatchObject({ ok: false, reason: 'card-not-in-hand' });
  });

  it('rejects advance before the reveal and next-round before the round ends', () => {
    const state = setupFromSeed(config(2));
    expect(apply(state, { kind: 'advance' })).toMatchObject({ ok: false, reason: 'wrong-phase' });
    expect(apply(state, { kind: 'next-round' })).toMatchObject({ ok: false, reason: 'wrong-phase' });
    const revealed = firstPicks(state);
    expect(apply(revealed, { kind: 'next-round' })).toMatchObject({ ok: false, reason: 'wrong-phase' });
  });

  it('does not mutate the input state', () => {
    const state = setupFromSeed(config(2));
    const before = serialize(state);
    const out = pick(state, 0, state.hands[0][0]);
    expect(out.ok).toBe(true);
    expect(serialize(state)).toBe(before);
    if (out.ok) expect(out.state).not.toBe(state);
  });
});

describe('passing and round flow', () => {
  it('passes the remaining hand left in round 1, right in round 2, left in round 3', () => {
    let state = setupFromSeed(config(3));
    const firstHands = state.hands.map((hand) => [...hand].sort((a, b) => a - b));
    state = firstPicks(state);
    state = advance(state);
    // Round 1: seat 0's old hand goes to seat 1.
    expect([...state.hands[1]].sort((a, b) => a - b)).toEqual(
      firstHands[0].filter((id) => id !== state.roundPicks[0][0].cardId),
    );
    expect(state.pickIndex).toBe(1);
    expect(state.phase).toBe('choosing');

    // Finish round 1.
    state = completeRound(state);
    expect(state.phase).toBe('round-end');
    expect(state.rounds).toHaveLength(1);
    expect(state.rounds[0].breakdowns).toHaveLength(3);
    expect(state.hands.every((hand) => hand.length === 0)).toBe(true);
    expect(state.roundCollected.every((cards) => cards.length === 8)).toBe(true);

    state = nextRound(state);
    expect(state.round).toBe(2);
    expect(state.passDirection).toBe('right');
    expect(state.pickIndex).toBe(0);
    expect(state.phase).toBe('choosing');

    const round2Hands = state.hands.map((hand) => [...hand].sort((a, b) => a - b));
    state = firstPicks(state);
    state = advance(state);
    // Round 2: seat 0's old hand goes to seat 2 (right).
    expect([...state.hands[2]].sort((a, b) => a - b)).toEqual(
      round2Hands[0].filter((id) => id !== state.roundPicks[0][0].cardId),
    );

    state = completeRound(state);
    state = nextRound(state);
    expect(state.round).toBe(3);
    expect(state.passDirection).toBe('left');
  });

  it('finishes after exactly three rounds and produces a ranking', () => {
    let state = setupFromSeed(config(4));
    for (let round = 1; round <= 3; round++) {
      state = completeRound(state);
      expect(state.phase).toBe('round-end');
      expect(state.rounds).toHaveLength(round);
      expect(state.rounds[round - 1].breakdowns).toHaveLength(4);
      state = nextRound(state);
      if (round < 3) expect(state.phase).toBe('choosing');
    }
    expect(state.phase).toBe('ended');
    expect(state.collected.every((cards) => cards.length === 24)).toBe(true);
    expect(invariants(state)).toEqual([]);
    const res = result(state);
    expect(res).not.toBeNull();
    expect(res!.ranking).toHaveLength(4);
    expect(res!.winner).not.toBeNull();
    expect(res!.crowns.length).toBeGreaterThanOrEqual(0);
    expect(apply(state, { kind: 'next-round' })).toEqual({ ok: false, reason: 'game-over' });
  });

  it('rejects an advance after the game is over', () => {
    const state = playGame(2, 'over');
    expect(apply(state, { kind: 'advance' })).toEqual({ ok: false, reason: 'game-over' });
  });
});

describe('serialization, replay and invariants', () => {
  it('round-trips every phase of a game', () => {
    let state = setupFromSeed(config(3, 'save'));
    for (let step = 0; step < 30; step++) {
      const copy = deserialize(serialize(state));
      expect(copy).toEqual(state);
      expect(invariants(copy)).toEqual([]);
      if (state.phase === 'ended') break;
      if (state.phase === 'choosing') state = firstPicks(state);
      else if (state.phase === 'reveal') state = advance(state);
      else state = nextRound(state);
    }
  });

  it('replays a finished game to the same state', () => {
    const finished = playGame(3, 'replay-me');
    const log = moveLog(finished);
    const replayed = replay(finished.config, log);
    expect(replayed.phase).toBe('ended');
    expect(replayed.collected).toEqual(finished.collected);
    expect(score(replayed).map((row) => row.total)).toEqual(score(finished).map((row) => row.total));
  });

  it('rejects corrupted and unsupported saves', () => {
    expect(() => deserialize('{')).toThrow(/invalid-save/);
    expect(() => deserialize('{"version":2}')).toThrow(/unsupported save version/);
    const state = setupFromSeed(config(2));
    const raw = JSON.parse(serialize(state)) as Record<string, unknown>;
    raw.version = 99;
    expect(() => deserialize(JSON.stringify(raw))).toThrow(/unsupported save version/);
    const broken = JSON.parse(serialize(state)) as Record<string, unknown>;
    broken.hands = 'nope';
    expect(() => deserialize(JSON.stringify(broken))).toThrow(/invalid-save/);
  });

  it('keeps every invariant after each step of a full game', () => {
    let state = setupFromSeed(config(5, 'invariants'));
    let steps = 0;
    while (state.phase !== 'ended' && steps < 500) {
      expect(invariants(state)).toEqual([]);
      if (state.phase === 'choosing') state = firstPicks(state);
      else if (state.phase === 'reveal') state = advance(state);
      else state = nextRound(state);
      steps++;
    }
    expect(state.phase).toBe('ended');
    expect(invariants(state)).toEqual([]);
  });
});

describe('tie-breaks', () => {
  function zeroBreakdown(seat: number, total = 0): RoundBreakdown {
    return {
      seat,
      combos: [],
      sampler: null,
      leftovers: [],
      leftoverPoints: total,
      total,
    };
  }

  function endedState(overrides: Partial<GameState>): GameState {
    const base = setupFromSeed(config(2, 'tie'));
    const round: PickRound = {
      round: 1,
      passDirection: 'left',
      picks: [],
      breakdowns: [zeroBreakdown(0), zeroBreakdown(1)],
    };
    return {
      ...base,
      phase: 'ended',
      round: 3,
      pickIndex: 8,
      hands: [[], []],
      pending: [null, null],
      roundCollected: [[], []],
      rounds: [round],
      ...overrides,
    };
  }

  it('uses total score first', () => {
    const state = endedState({
      rounds: [
        {
          round: 1,
          passDirection: 'left',
          picks: [],
          breakdowns: [zeroBreakdown(0, 3), zeroBreakdown(1, 9)],
        },
      ],
      collected: [[0], [12]],
    });
    const res = result(state)!;
    expect(res.winner).toBe(1);
    expect(res.tieBreak).toBe('score');
  });

  it('breaks a total tie by majorities, then types, then seat', () => {
    const majority = endedState({
      rounds: [
        {
          round: 1,
          passDirection: 'left',
          picks: [],
          breakdowns: [zeroBreakdown(0, 0), zeroBreakdown(1, 6)],
        },
      ],
      collected: [[0, 1, 2, 3], [12, 13]],
      crowns: [{ dessert: 'macaron', seat: 0, count: 4, points: 6 }],
    });
    expect(result(majority)!.winner).toBe(0);
    expect(result(majority)!.tieBreak).toBe('majorities');

    const types = endedState({
      collected: [[0, 12, 24], [0, 12]],
      crowns: [],
    });
    expect(result(types)!.winner).toBe(0);
    expect(result(types)!.tieBreak).toBe('types');

    const seat = endedState({ collected: [[0, 12], [0, 12]], crowns: [] });
    expect(result(seat)!.winner).toBe(0);
    expect(result(seat)!.tieBreak).toBe('seat');
  });
});

describe('view privacy', () => {
  it('exposes only the requesting seat hand and hides future deals', () => {
    const state = setupFromSeed(config(4, 'privacy'));
    const seatView = view(state, 1);
    expect(seatView.myHand).toEqual(state.hands[1]);
    expect(seatView.mySeat).toBe(1);
    expect(seatView.seats.map((seat) => seat.handCount)).toEqual([8, 8, 8, 8]);
    const json = JSON.stringify(seatView);
    expect(json).not.toContain('deals');
    expect(json).not.toContain('"hands"');
    const nested = arraysIn(seatView);
    for (let seat = 0; seat < 4; seat++) {
      if (seat === 1) continue;
      // No nested array may equal another seat's hand.
      expect(nested).not.toContainEqual(state.hands[seat]);
    }
  });

  it('hides a pending pick from other seats until the reveal', () => {
    const state = setupFromSeed(config(3, 'pending'));
    const card = state.hands[0][0];
    const out = pick(state, 0, card);
    if (!out.ok) throw new Error('pick failed');
    const view1 = view(out.state, 1);
    expect(view1.myPending).toBeNull();
    expect(arraysIn(view1).some((nested) => nested.includes(card))).toBe(false);
    expect(view1.seats[0].hasPicked).toBe(true);
    expect(view1.seats[1].hasPicked).toBe(false);
    expect(view(out.state, 0).myPending).toBe(card);
  });

  it('shows revealed picks to everyone and no hand after the reveal', () => {
    const state = firstPicks(setupFromSeed(config(2, 'reveal-view')));
    const revealed = view(state, 0);
    expect(revealed.phase).toBe('reveal');
    expect(revealed.revealed).toHaveLength(2);
    expect(revealed.myHand).toEqual([]);
    expect(revealed.roundBreakdowns).not.toBeNull();
    expect(view(state, null).myHand).toEqual([]);
  });

  it('clones state safely', () => {
    const state = setupFromSeed(config(2));
    const copy = cloneState(state);
    copy.hands[0].push(99);
    expect(state.hands[0]).not.toContain(99);
  });
});
