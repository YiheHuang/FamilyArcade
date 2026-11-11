import { describe, expect, it } from 'vitest';
import { chooseFlip, suggest } from '../src/ai/ai';
import {
  createState,
  deserialize,
  flip,
  flipForSeat,
  isDeck,
  legalFlips,
  MAX_PLAYERS,
  resolve,
  serialize,
  setup,
  view,
  type GameState,
} from '../src/game/pair-up';

const ADJACENT = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7];
const SPREAD = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7];

function flipAt(state: GameState, index: number): GameState {
  const result = flip(state, index);
  expect(result.ok, `flip ${index} should be legal`).toBe(true);
  return result.state;
}

function turnPair(state: GameState, a: number, b: number): GameState {
  let next = flipAt(state, a);
  next = flipAt(next, b);
  return next.phase === 'resolve' ? resolve(next) : next;
}

function playMatches(state: GameState, pairs: [number, number][]): GameState {
  let next = state;
  for (const [a, b] of pairs) next = turnPair(next, a, b);
  return next;
}

function seatRng(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

/** Seat 0 has seen 0 & 1, seat 1 has seen 8 & 2, so the 0/8 pair is known. */
function knownPairTurn(): GameState {
  let state = createState(SPREAD, 2, 0);
  state = turnPair(state, 0, 1);
  state = turnPair(state, 8, 2);
  return state;
}

/** Seat 0 has seen 12 & 0, seat 1 has seen 2 & 3, then seat 0 flips 4. */
function seenTurn(): GameState {
  let state = createState(SPREAD, 2, 0);
  state = turnPair(state, 12, 0);
  state = turnPair(state, 2, 3);
  state = flipAt(state, 4);
  return state;
}

/** Seat 0 has seen 12 (value 4) and 0, seat 1 has seen 2 & 3. */
function firstFlipWithKnownMate(): GameState {
  return seenTurn();
}

describe('Pair Up engine — setup', () => {
  it('deals 8 pairs face down to 2 players on a 4×4 table', () => {
    const state = setup({ size: 4, players: 2 }, seatRng([0.1, 0.9, 0.4]));
    expect(state.deck).toHaveLength(16);
    expect(state.matchedBy).toHaveLength(16);
    expect(state.pairsLeft).toBe(8);
    expect(state.playerCount).toBe(2);
    expect(state.turn).toBe(0);
    expect(state.phase).toBe('choose');
    expect(state.status).toBe('playing');
    expect(new Set(state.deck).size).toBe(8);
    expect(isDeck(state.deck)).toBe(true);
  });

  it('deals 18 pairs and accepts six players on a 6×6 table', () => {
    const state = setup({ size: 6, players: MAX_PLAYERS }, () => 0.32);
    expect(state.deck).toHaveLength(36);
    expect(state.pairsLeft).toBe(18);
    expect(state.playerCount).toBe(6);
    expect(state.scores).toEqual([0, 0, 0, 0, 0, 0]);
    expect(isDeck(state.deck)).toBe(true);
  });

  it('is deterministic when the RNG is injected', () => {
    const a = setup({ size: 6, players: 3 }, seatRng([0.7, 0.2, 0.9, 0.4, 0.1]));
    const b = setup({ size: 6, players: 3 }, seatRng([0.7, 0.2, 0.9, 0.4, 0.1]));
    expect(a.deck).toEqual(b.deck);
  });

  it('rejects impossible sizes, player counts and starting seats', () => {
    expect(() => setup({ size: 5 as unknown as 4, players: 2 }, () => 0.5)).toThrow(RangeError);
    expect(() => setup({ size: 4, players: 1 }, () => 0.5)).toThrow(RangeError);
    expect(() => setup({ size: 4, players: 7 }, () => 0.5)).toThrow(RangeError);
    expect(() => setup({ size: 4, players: 2, first: 2 }, () => 0.5)).toThrow(RangeError);
  });

  it('honours the starting seat', () => {
    const state = setup({ size: 4, players: 4, first: 3 }, () => 0.5);
    expect(state.turn).toBe(3);
    expect(state.first).toBe(3);
  });

  it('rejects an invalid exact deck', () => {
    expect(isDeck([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7])).toBe(true);
    expect(isDeck([0, 0, 1, 1])).toBe(false);
    expect(isDeck([...ADJACENT.slice(0, 15), 0])).toBe(false);
    expect(() => createState([0, 1, 2, 3], 2)).toThrow();
    expect(() => createState(ADJACENT, 1)).toThrow(RangeError);
  });
});

describe('Pair Up engine — flips and turns', () => {
  it('opens the first card without changing the turn', () => {
    const state = flipAt(createState(SPREAD), 0);
    expect(state.flipped).toEqual([0]);
    expect(state.turn).toBe(0);
    expect(state.phase).toBe('choose');
    expect(legalFlips(state)).not.toContain(0);
    expect(legalFlips(state)).toHaveLength(15);
  });

  it('rejects duplicates, matched cards and out-of-range flips', () => {
    const state = flipAt(createState(SPREAD), 0);
    expect(flip(state, 0).error).toBe('already-up');
    expect(flip(state, 16).error).toBe('bad-tile');
    expect(flip(state, -1).error).toBe('bad-tile');
    expect(flip(state, 1.5).error).toBe('bad-tile');
  });

  it('scores a matching pair, keeps the turn and leaves the cards open', () => {
    const state = turnPair(createState(ADJACENT), 0, 1);
    expect(state.phase).toBe('choose');
    expect(state.turn).toBe(0);
    expect(state.scores).toEqual([1, 0]);
    expect(state.matchedBy[0]).toBe(0);
    expect(state.matchedBy[1]).toBe(0);
    expect(state.flipped).toEqual([]);
    expect(state.pairsLeft).toBe(7);
    expect(state.moves).toBe(1);
    expect(state.lastEvent?.kind).toBe('match');
    expect(flip(state, 0).error).toBe('matched');
  });

  it('puts a miss into resolve and waits for the caller', () => {
    let state = flipAt(createState(SPREAD), 0);
    state = flipAt(state, 1);
    expect(state.phase).toBe('resolve');
    expect(state.turn).toBe(0);
    expect(state.flipped).toEqual([0, 1]);
    expect(state.misses).toEqual([1, 0]);
    expect(state.moves).toBe(1);
    expect(flip(state, 2).error).toBe('resolve');
    expect(legalFlips(state)).toEqual([]);
    const shown = view(state, 0);
    expect(shown.tiles[0].value).toBe(0);
    expect(shown.tiles[1].value).toBe(1);
  });

  it('resolve closes a miss and advances to the next player', () => {
    let state = turnPair(createState(SPREAD), 0, 1);
    expect(state.turn).toBe(1);
    expect(state.flipped).toEqual([]);
    expect(state.phase).toBe('choose');
    expect(state.matchedBy.every((owner) => owner === null)).toBe(true);
    const again = resolve(state);
    expect(again).toBe(state);
  });

  it('rotates turns through six players in order', () => {
    let state = createState(SPREAD, 6, 0);
    for (let seat = 0; seat < 6; seat++) {
      expect(state.turn).toBe(seat);
      state = flipAt(state, seat);
      state = flipAt(state, 8 + ((seat + 1) % 8));
      state = resolve(state);
    }
    expect(state.turn).toBe(0);
    expect(state.misses).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('enforces the seat on the wire path', () => {
    const state = createState(SPREAD, 3, 0);
    expect(flipForSeat(state, 1, 0).error).toBe('wrong-turn');
    expect(flipForSeat(state, 9, 0).error).toBe('wrong-turn');
    const after = flipForSeat(state, 0, 0);
    expect(after.ok).toBe(true);
    expect(flipForSeat(after.state, 1, 1).error).toBe('wrong-turn');
    const second = flipForSeat(after.state, 0, 1);
    expect(second.ok).toBe(true);
    const next = resolve(second.state);
    expect(flipForSeat(next, 0, 2).error).toBe('wrong-turn');
    expect(flipForSeat(next, 1, 2).ok).toBe(true);
  });

  it('records who saw every reveal, including misses', () => {
    let state = createState(SPREAD, 3, 0);
    state = turnPair(state, 0, 1);
    state = turnPair(state, 2, 3);
    expect(state.reveals).toHaveLength(4);
    expect(state.reveals.map((reveal) => reveal.seat)).toEqual([0, 0, 1, 1]);
    expect(state.reveals.map((reveal) => reveal.value)).toEqual([0, 1, 2, 3]);
  });
});

describe('Pair Up engine — finishing', () => {
  it('plays a complete 4×4 game to a unique winner', () => {
    const pairs: [number, number][] = Array.from({ length: 8 }, (_, value) => [
      value * 2,
      value * 2 + 1,
    ]);
    const state = playMatches(createState(ADJACENT, 2, 0), pairs);
    expect(state.status).toBe('finished');
    expect(state.phase).toBe('over');
    expect(state.pairsLeft).toBe(0);
    expect(state.scores).toEqual([8, 0]);
    expect(state.winner).toBe(0);
    expect(state.ties).toEqual([]);
    expect(flip(state, 0).error).toBe('game-over');
  });

  it('shares the win when the top score is tied', () => {
    let state = createState(ADJACENT, 2, 0);
    state = playMatches(state, [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ]);
    state = turnPair(state, 8, 10); // deliberate miss: values 4 and 5
    state = playMatches(state, [
      [8, 9],
      [10, 11],
      [12, 13],
      [14, 15],
    ]);
    expect(state.status).toBe('finished');
    expect(state.scores).toEqual([4, 4]);
    expect(state.winner).toBeNull();
    expect(state.ties).toEqual([0, 1]);
    expect(state.lastEvent?.kind).toBe('match');
  });

  it('finishes immediately after the last pair, even on a 6×6 deck', () => {
    let state = setup({ size: 6, players: 2 }, () => 0.25);
    while (state.status === 'playing') {
      const candidates = legalFlips(state);
      const a = candidates[0];
      const b = candidates.find(
        (index) => state.deck[index] === state.deck[a] && index !== a,
      );
      state = flipAt(state, a);
      state = flipAt(state, b as number);
      if (state.phase === 'resolve') state = resolve(state);
    }
    expect(state.pairsLeft).toBe(0);
    expect(state.status).toBe('finished');
    expect(state.scores.reduce((sum, score) => sum + score, 0)).toBe(18);
    expect(state.reveals).toHaveLength(36);
  });
});

describe('Pair Up engine — hidden-information views', () => {
  it('hides every face-down value but shows open and matched cards', () => {
    let state = createState(ADJACENT, 2, 0);
    state = turnPair(state, 0, 1);
    state = flipAt(state, 2);
    const shown = view(state, 1);
    expect(shown.tiles[0]).toEqual({ value: 0, matchedBy: 0 });
    expect(shown.tiles[1]).toEqual({ value: 0, matchedBy: 0 });
    expect(shown.tiles[2]).toEqual({ value: 1, matchedBy: null });
    expect(shown.tiles[3]).toEqual({ value: null, matchedBy: null });
    expect(JSON.stringify(shown)).not.toContain('"deck"');
    expect(shown.scores).toEqual([1, 0]);
  });

  it('gives each seat its own canFlip and myTurn flags', () => {
    let state = createState(SPREAD, 3, 0);
    expect(view(state, 0).canFlip).toBe(true);
    expect(view(state, 1).canFlip).toBe(false);
    expect(view(state, 1).myTurn).toBe(false);
    state = flipAt(state, 0);
    state = flipAt(state, 1);
    expect(view(state, 0).canFlip).toBe(false);
    state = resolve(state);
    expect(view(state, 1).canFlip).toBe(true);
    expect(view(state, 1).myTurn).toBe(true);
    expect(view(state, 0).canFlip).toBe(false);
  });

  it('marks the owner on a matched pair in every view', () => {
    let state = createState(ADJACENT, 3, 2);
    state = turnPair(state, 0, 1);
    const shown = view(state, 1);
    expect(shown.matchedBy[0]).toBe(2);
    expect(shown.matchedBy[1]).toBe(2);
    expect(shown.tiles[0]).toEqual({ value: 0, matchedBy: 2 });
    expect(shown.turn).toBe(2);
  });

  it('round-trips a full state through serialise and deserialise', () => {
    const state = setup({ size: 6, players: 4, first: 1 }, () => 0.63);
    const restored = deserialize(serialize(state));
    expect(restored).toEqual(state);
    expect(deserialize('not json')).toBeNull();
    expect(deserialize(JSON.stringify({ ...state, version: 9 }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...state, deck: ADJACENT }))).toBeNull();
  });
});

describe('Pair Up AI', () => {
  it('only returns legal, face-down flips on every level', () => {
    let state = createState(SPREAD, 4, 1);
    state = flipAt(state, 1);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseFlip(state, level, () => 0.4);
      expect(move).toBeGreaterThanOrEqual(0);
      expect(legalFlips(state)).toContain(move);
    }
  });

  it('returns -1 when it is not its turn or the turn is resolving', () => {
    let state = createState(SPREAD, 2, 0);
    expect(chooseFlip(state, 'hard', () => 0.5)).toBeGreaterThanOrEqual(0);
    state = flipAt(state, 0);
    state = flipAt(state, 1);
    expect(chooseFlip(state, 'hard', () => 0.5)).toBe(-1);
    state = resolve(state);
    expect(chooseFlip(state, 'hard', () => 0.5)).toBeGreaterThanOrEqual(0);
  });

  it('Hard recalls every public reveal and opens a known pair', () => {
    const state = knownPairTurn();
    const move = chooseFlip(state, 'hard', () => 0);
    expect([0, 8]).toContain(move);
    expect(legalFlips(state)).toContain(move);
  });

  it('Normal remembers its own reveals but not another seat’s', () => {
    // Seat 0 has seen 0 & 1; seat 1 has seen 8 & 2. The 0/8 pair is therefore
    // only known to Hard. Normal explores an unknown card instead.
    const state = knownPairTurn();
    const hard = chooseFlip(state, 'hard', () => 0);
    expect([0, 8]).toContain(hard);
    const normal = chooseFlip(state, 'normal', () => 0);
    expect(normal).not.toBe(0);
    expect(normal).not.toBe(8);
    expect(normal).toBe(2);
  });

  it('Hard uses the face-up card plus memory to complete a pair', () => {
    const state = firstFlipWithKnownMate();
    expect(state.flipped).toEqual([4]);
    expect(chooseFlip(state, 'hard', () => 0)).toBe(12); // value 4 was seen at 12
  });

  it('Normal also uses its own seen card to complete a pair', () => {
    const state = firstFlipWithKnownMate();
    expect(chooseFlip(state, 'normal', () => 0)).toBe(12);
  });

  it('Companion chooses to forget sometimes, giving children a chance', () => {
    const state = firstFlipWithKnownMate();
    expect(chooseFlip(state, 'companion', seatRng([0.9, 0]))).toBe(12);
    const forgot = chooseFlip(state, 'companion', seatRng([0.05, 0]));
    expect(forgot).not.toBe(12);
  });

  it('Easy has a short, unreliable memory', () => {
    const state = firstFlipWithKnownMate();
    expect(chooseFlip(state, 'easy', seatRng([0.1, 0]))).toBe(12);
    const forgot = chooseFlip(state, 'easy', seatRng([0.9, 0]));
    expect(forgot).not.toBe(12);
  });

  it('is deterministic for the same state and RNG sequence', () => {
    const state = seenTurn();
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const a = chooseFlip(state, level, seatRng([0.2, 0.7, 0.4]));
      const b = chooseFlip(state, level, seatRng([0.2, 0.7, 0.4]));
      expect(a).toBe(b);
    }
  });

  it('a complete AI memory can clear the board', () => {
    let state = createState(ADJACENT, 2, 0);
    let guard = 0;
    while (state.status === 'playing' && guard++ < 80) {
      const move = chooseFlip(state, 'hard', () => 0);
      expect(legalFlips(state)).toContain(move);
      state = flipAt(state, move);
      if (state.phase === 'resolve') state = resolve(state);
    }
    expect(state.status).toBe('finished');
    expect(state.scores[0] + state.scores[1]).toBe(8);
  });
});

describe('Pair Up hints', () => {
  it('points at a remembered pair when one exists', () => {
    const state = knownPairTurn();
    const hint = suggest(state, () => 0);
    expect(hint?.reason).toBe('pair');
    expect(hint?.tiles).toHaveLength(2);
    expect(hint?.tiles).toEqual([0, 8]);
  });

  it('finds the mate of the already-open card', () => {
    const state = firstFlipWithKnownMate();
    const hint = suggest(state, () => 0);
    expect(hint).toEqual({ tiles: [4, 12], reason: 'pair' });
  });

  it('falls back to an explore hint with only one card early on', () => {
    const state = createState(SPREAD);
    const hint = suggest(state, () => 0);
    expect(hint?.reason).toBe('explore');
    expect(hint?.tiles).toHaveLength(1);
    expect(legalFlips(state)).toContain(hint?.tiles[0]);
  });

  it('never points at a face-up or matched card', () => {
    let state = createState(ADJACENT, 2, 0);
    state = turnPair(state, 0, 1);
    state = flipAt(state, 2);
    const hint = suggest(state, () => 0.4);
    for (const tile of hint?.tiles ?? []) {
      expect(state.matchedBy[tile]).toBeNull();
      expect(state.flipped).not.toContain(tile);
    }
  });
});
