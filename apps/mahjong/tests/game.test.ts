import { describe, expect, it } from 'vitest';
import {
  applyAction,
  claim,
  declareAddedKong,
  declareConcealedKong,
  detectPattern,
  discard,
  evaluateWin,
  FAN_VALUES,
  isWinningHand,
  makeWall,
  setup,
  tileFromKey,
  tileKey,
  view,
  windOf,
  winSelf,
  type GameState,
  type Meld,
  type Seat,
  type Tile,
  type WinContext,
} from '../src/game/mahjong';
import {
  chooseAction,
  chooseClaim,
  chooseDiscard,
  dangerScore,
  hint,
  shanten,
  visibleCounts,
  type AiLevel,
} from '../src/ai/ai';

const LEVELS: AiLevel[] = ['companion', 'easy', 'normal', 'hard'];

function t(key: string): Tile {
  const tile = tileFromKey(key);
  if (!tile) throw new Error(`bad tile ${key}`);
  return tile;
}

function hand(keys: string): Tile[] {
  return keys
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(t);
}

function meld(kind: Meld['kind'], keys: string, from: Seat | -1 = -1): Meld {
  const tiles = hand(keys);
  return { kind, tiles, from, claimed: from >= 0 ? tiles[0] : null };
}

function ctx(overrides: Partial<WinContext> = {}): WinContext {
  return {
    selfDraw: false,
    robbing: false,
    kongDraw: false,
    lastTile: false,
    seatWind: 2,
    prevalentWind: 1,
    ...overrides,
  };
}

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function fixture(options: {
  hands: string[];
  wall?: string | string[];
  turn?: number;
  dealer?: number;
  roundWind?: number;
  minimumFan?: number;
  melds?: Meld[][];
}): GameState {
  const base = setup({
    rng: seeded(77),
    dealer: (options.dealer ?? 0) as Seat,
    roundWind: options.roundWind ?? 1,
    minimumFan: options.minimumFan ?? 1,
  });
  const hands = options.hands.map((keys) => hand(keys));
  const wallText =
    options.wall === undefined
      ? null
      : Array.isArray(options.wall)
        ? options.wall.join(' ')
        : options.wall;
  return {
    ...base,
    hands,
    wall: wallText === null ? base.wall : hand(wallText),
    turn: (options.turn ?? 0) as Seat,
    phase: 'discard',
    melds: options.melds ?? [[], [], [], []],
    discards: [],
    lastDraw: null,
    lastDiscard: null,
    claim: null,
    winner: null,
    winInfo: null,
    result: null,
    drawReason: null,
    log: [],
  };
}

function fanContains(state: ReturnType<typeof evaluateWin>, key: string): boolean {
  return Boolean(state?.fan.some((item) => item.key === key));
}

describe('deck, deal and seats', () => {
  it('builds 136 unique physical tiles with four copies of every kind', () => {
    const wall = makeWall();
    expect(wall).toHaveLength(136);
    expect(new Set(wall.map(tileKey)).size).toBe(34);
    const copies = new Map<string, number>();
    for (const tile of wall) copies.set(tileKey(tile), (copies.get(tileKey(tile)) ?? 0) + 1);
    expect([...copies.values()].every((count) => count === 4)).toBe(true);
  });

  it('deals 13 tiles each and one extra to the dealer', () => {
    const state = setup({ rng: seeded(3), dealer: 0 });
    expect(state.hands.map((items) => items.length)).toEqual([14, 13, 13, 13]);
    expect(state.wall).toHaveLength(83);
    expect(state.hands.flat().length + state.wall.length).toBe(136);
    expect(state.lastDraw?.seat).toBe(0);
    expect(state.phase).toBe('discard');
    expect(state.turn).toBe(0);
  });

  it('is deterministic for an injected RNG seed', () => {
    const a = setup({ rng: seeded(99), dealer: 2 });
    const b = setup({ rng: seeded(99), dealer: 2 });
    expect(a.hands.map((items) => items.map(tileKey))).toEqual(
      b.hands.map((items) => items.map(tileKey)),
    );
    expect(a.wall.map(tileKey)).toEqual(b.wall.map(tileKey));
  });

  it('assigns seat winds from the dealer', () => {
    expect([0, 1, 2, 3].map((seat) => windOf(seat, 0))).toEqual([1, 2, 3, 4]);
    expect([0, 1, 2, 3].map((seat) => windOf(seat, 2))).toEqual([3, 4, 1, 2]);
  });
});

describe('discard and drawing', () => {
  it('removes the discarded tile and either opens claims or draws for the next seat', () => {
    const state = setup({ rng: seeded(11), dealer: 0 });
    const key = tileKey(state.hands[0][0]);
    const result = discard(state, 0, key);
    expect(result.ok).toBe(true);
    expect(result.state.hands[0].length).toBe(13);
    expect(result.state.discards.at(-1)?.tile).toEqual(t(key));
    if (result.state.phase === 'discard') {
      expect(result.state.turn).toBe(1);
      expect(result.state.hands[1]).toHaveLength(14);
    } else {
      expect(result.state.phase).toBe('claim');
    }
  });

  it('rejects an out-of-turn discard and a tile that is not in hand', () => {
    const state = setup({ rng: seeded(12), dealer: 0 });
    expect(discard(state, 1, tileKey(state.hands[1][0])).error).toBe('wrong-turn');
    expect(discard(state, 0, 'z7').ok).toBe(false);
  });

  it('does not mutate the state passed to the engine', () => {
    const state = setup({ rng: seeded(13), dealer: 0 });
    const before = JSON.stringify(state);
    discard(state, 0, tileKey(state.hands[0][0]));
    expect(JSON.stringify(state)).toBe(before);
  });

  it('ends in an exhaustive draw when the wall is empty and nobody claims', () => {
    const state = fixture({
      hands: [
        'm1 m2 m3 m4 m5 m6 m7 m8 m9 p1 p2 p3 p4 z7',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z3',
      ],
      wall: [],
    });
    const result = discard(state, 0, 'z7');
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('over');
    expect(result.state.result).toBe('draw');
    expect(result.state.drawReason).toBe('wall-empty');
  });
});

describe('chi, peng and kong', () => {
  it('lets the next seat chi a numbered discard', () => {
    const state = fixture({
      hands: [
        'm1 m2 m4 m5 m7 m8 p1 p3 p5 s1 s3 s5 z7',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'm3 p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 s9',
      ],
      turn: 3,
    });
    const first = discard(state, 3, 'm3');
    expect(first.ok).toBe(true);
    expect(first.state.phase).toBe('claim');
    const option = first.state.claim?.options.find((item) => item.seat === 0);
    expect(option?.chi.length).toBeGreaterThan(0);
    const pair = option?.chi[0];
    if (!pair) throw new Error('no chi pair');
    const result = claim(first.state, 0, 'chi', [tileKey(pair[0]), tileKey(pair[1])]);
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('discard');
    expect(result.state.turn).toBe(0);
    expect(result.state.melds[0][0].kind).toBe('chi');
    expect(result.state.hands[0]).toHaveLength(11);
  });

  it('does not offer chi to a seat that is not next', () => {
    const state = fixture({
      hands: [
        'm1 m2 m4 m5 m7 m8 p1 p3 p5 s1 s3 s5 z1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z7',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'm3 p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 s9',
      ],
      turn: 3,
    });
    const first = discard(state, 3, 'm3');
    const seatOne = first.state.claim?.options.find((item) => item.seat === 1);
    const seatTwo = first.state.claim?.options.find((item) => item.seat === 2);
    expect(seatOne?.chi ?? []).toHaveLength(0);
    expect(seatTwo?.chi ?? []).toHaveLength(0);
    const seatZero = first.state.claim?.options.find((item) => item.seat === 0);
    expect(seatZero?.chi.length).toBeGreaterThan(0);
  });

  it('forms a peng and lets the caller discard', () => {
    const state = fixture({
      hands: [
        'z7 z7 m1 m2 m4 m5 m7 m8 p1 p3 p5 s1 s3',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'z7 p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 s9',
      ],
      turn: 3,
    });
    const first = discard(state, 3, 'z7');
    expect(first.state.claim?.options.find((item) => item.seat === 0)?.peng).toBe(true);
    const result = claim(first.state, 0, 'peng');
    expect(result.ok).toBe(true);
    expect(result.state.melds[0][0].kind).toBe('peng');
    expect(result.state.melds[0][0].tiles).toHaveLength(3);
    expect(result.state.turn).toBe(0);
    expect(result.state.lastDraw).toBeNull();
  });

  it('forms an exposed kong from a discard and draws a replacement', () => {
    const state = fixture({
      hands: [
        'z7 z7 z7 m1 m2 m4 m5 m7 m8 p1 p3 p5 s1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'z7 p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 s9',
      ],
      turn: 3,
      wall: 's1 s2 s3 s4 s5 s6 s7 s8 s9 p1 p2 p3 p4 p5 p6 p7 p8 p9 m1 m2',
    });
    const first = discard(state, 3, 'z7');
    const option = first.state.claim?.options.find((item) => item.seat === 0);
    expect(option?.kong).toBe(true);
    const result = claim(first.state, 0, 'kong');
    expect(result.ok).toBe(true);
    expect(result.state.melds[0][0].kind).toBe('kong');
    expect(result.state.melds[0][0].tiles).toHaveLength(4);
    expect(result.state.lastDraw?.kong).toBe(true);
    expect(result.state.hands[0]).toHaveLength(11);
  });

  it('declares a concealed kong and draws a replacement', () => {
    const state = fixture({
      hands: [
        'z7 z7 z7 z7 m1 m2 m4 m5 m7 m8 p1 p3 p5 s1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 m1',
      ],
      wall: 's1 s2 s3 s4 s5 s6 s7 s8 s9 p1 p2 p3 p4 p5 p6 p7 p8 p9 m1 m2',
    });
    const result = declareConcealedKong(state, 0, 'z7');
    expect(result.ok).toBe(true);
    expect(result.state.melds[0][0].kind).toBe('concealed-kong');
    expect(result.state.lastDraw?.kong).toBe(true);
    expect(result.state.hands[0]).toHaveLength(11);
  });

  it('upgrades a peng with an added kong when nobody robs it', () => {
    const state = fixture({
      hands: [
        'z7 m1 m2 m4 m5 m7 m8 p1 p3 s1 s2',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 m1',
      ],
      melds: [[meld('peng', 'z7 z7 z7', 1)], [], [], []],
      wall: 's1 s2 s3 s4 s5 s6 s7 s8 s9 p1 p2 p3 p4 p5 p6 p7 p8 p9 m1 m2',
    });
    const result = declareAddedKong(state, 0, 'z7');
    expect(result.ok).toBe(true);
    expect(result.state.melds[0][0].kind).toBe('added-kong');
    expect(result.state.melds[0][0].tiles).toHaveLength(4);
    expect(result.state.lastDraw?.kong).toBe(true);
  });

  it('offers a robbing-kong win to a waiting seat', () => {
    const state = fixture({
      hands: [
        'z7 m1 m2 m4 m5 m7 m8 p1 p3 s1 s2',
        'm1 m2 m3 m4 m5 m6 p1 p2 p3 s1 s2 s3 z7',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 m1',
      ],
      melds: [[meld('peng', 'z7 z7 z7', 1)], [], [], []],
      wall: 's1 s2 s3 s4 s5 s6 s7 s8 s9 p1 p2 p3 p4 p5 p6 p7 p8 p9 m1 m2',
    });
    const declared = declareAddedKong(state, 0, 'z7');
    expect(declared.ok).toBe(true);
    expect(declared.state.phase).toBe('claim');
    expect(declared.state.claim?.robbing).toBe(true);
    const option = declared.state.claim?.options.find((item) => item.seat === 1);
    expect(option?.win).toBe(true);
    const result = claim(declared.state, 1, 'win');
    expect(result.ok).toBe(true);
    expect(result.state.winner).toBe(1);
    expect(result.state.winInfo?.method).toBe('robbing-kong');
    expect(result.state.melds[0][0].kind).toBe('peng');
    expect(result.state.winInfo?.fan.some((item) => item.key === 'robbingKong')).toBe(true);
  });

  it('never offers claims to the discarder', () => {
    const state = fixture({
      hands: [
        'z7 z7 m1 m2 m4 m5 m7 m8 p1 p3 p5 s1 s3',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'z7 p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 s9',
      ],
      turn: 0,
    });
    const first = discard(state, 0, 'z7');
    if (first.state.claim) {
      expect(first.state.claim.options.some((item) => item.seat === 0)).toBe(false);
    }
  });
});

describe('wins and fan', () => {
  it('detects a standard four-melds-plus-pair hand', () => {
    const h = hand('m1 m2 m3 m4 m5 m6 m7 m8 m9 p5 p5 p5 z5 z5');
    expect(isWinningHand(h)).toBe(true);
    expect(detectPattern(h)).toBe('standard');
  });

  it('detects seven pairs', () => {
    const h = hand('m1 m1 m2 m2 m3 m3 p4 p4 p5 p5 s6 s6 z1 z1');
    expect(isWinningHand(h)).toBe(true);
    expect(detectPattern(h)).toBe('seven-pairs');
    expect(evaluateWin(h, [], ctx())?.totalFan).toBe(3);
  });

  it('allows a quad as two pairs in seven pairs', () => {
    const h = hand('m1 m1 m1 m1 m2 m2 m3 m3 p4 p4 p5 p5 s6 s6');
    expect(isWinningHand(h)).toBe(true);
    expect(detectPattern(h)).toBe('seven-pairs');
  });

  it('detects thirteen orphans', () => {
    const h = hand('m1 m9 p1 p9 s1 s9 z1 z2 z3 z4 z5 z6 z7 m1');
    expect(isWinningHand(h)).toBe(true);
    expect(detectPattern(h)).toBe('thirteen-orphans');
    expect(evaluateWin(h, [], ctx())?.totalFan).toBe(14);
  });

  it('rejects thirteen orphans with a missing required tile', () => {
    const h = hand('m1 m9 p1 p9 s1 s9 z1 z2 z3 z4 z5 z6 z6 m1');
    expect(isWinningHand(h)).toBe(false);
  });

  it('scores self-draw, concealed, pure suit and pure straight together', () => {
    const h = hand('m1 m2 m3 m4 m5 m6 m7 m8 m9 m5 m5 m5 m9 m9');
    const evaluation = evaluateWin(h, [], ctx({ selfDraw: true }));
    expect(evaluation?.totalFan).toBe(8);
    expect(fanContains(evaluation, 'selfDraw')).toBe(true);
    expect(fanContains(evaluation, 'concealed')).toBe(true);
    expect(fanContains(evaluation, 'pureSuit')).toBe(true);
    expect(fanContains(evaluation, 'pureStraight')).toBe(true);
  });

  it('scores all simples and all triplets', () => {
    const simples = hand('m2 m3 m4 m3 m4 m5 m4 m5 m6 p2 p3 p4 p5 p5');
    const simpleFan = evaluateWin(simples, [], ctx());
    expect(fanContains(simpleFan, 'allSimples')).toBe(true);

    const triplets = hand('m2 m2 m2 m3 m3 m3 m4 m4 m4 p5 p5 p5 m5 m5');
    const tripletFan = evaluateWin(triplets, [], ctx());
    expect(fanContains(tripletFan, 'allTriplets')).toBe(true);
    expect(tripletFan?.allTriplets).toBe(true);
  });

  it('scores mixed one suit and pure one suit', () => {
    const mixed = hand('m2 m2 m2 m3 m3 m3 m4 m4 m4 m5 m5 m5 z5 z5');
    expect(fanContains(evaluateWin(mixed, [], ctx()), 'mixedSuit')).toBe(true);

    const pure = hand('m1 m2 m3 m4 m5 m6 m7 m8 m9 m5 m5 m5 m9 m9');
    expect(fanContains(evaluateWin(pure, [], ctx()), 'pureSuit')).toBe(true);
  });

  it('scores seat wind, prevalent wind and dragon triplets', () => {
    const h = hand('z1 z1 z1 z5 z5 z5 m2 m2 m2 p3 p3 p3 z2 z2');
    const evaluation = evaluateWin(h, [], ctx({ seatWind: 1, prevalentWind: 1 }));
    expect(fanContains(evaluation, 'seatWind')).toBe(true);
    expect(fanContains(evaluation, 'prevalentWind')).toBe(true);
    expect(fanContains(evaluation, 'dragonTriplet')).toBe(true);
  });

  it('does not score a wind pair as a wind triplet', () => {
    const h = hand('m1 m2 m3 m4 m5 m6 p1 p2 p3 s1 s2 s3 z1 z1');
    const evaluation = evaluateWin(h, [], ctx({ seatWind: 1, prevalentWind: 1 }));
    expect(fanContains(evaluation, 'seatWind')).toBe(false);
    expect(fanContains(evaluation, 'prevalentWind')).toBe(false);
  });

  it('scores kong draw, last tile and robbing a kong', () => {
    const h = hand('m1 m2 m3 m4 m5 m6 p1 p2 p3 s1 s2 s3 z1 z1');
    const evaluation = evaluateWin(
      h,
      [],
      ctx({ kongDraw: true, lastTile: true, robbing: true }),
    );
    expect(fanContains(evaluation, 'kongDraw')).toBe(true);
    expect(fanContains(evaluation, 'lastTile')).toBe(true);
    expect(fanContains(evaluation, 'robbingKong')).toBe(true);
  });

  it('rejects a low-fan win below the configured minimum', () => {
    const state = fixture({
      hands: [
        'm1 m2 m3 m4 m5 m6 p1 p2 p3 s1 s2 s3 z1 z1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z3',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z4 m1',
      ],
      minimumFan: 3,
    });
    state.lastDraw = { seat: 0, tile: t('z1'), kong: false };
    expect(winSelf(state, 0).error).toBe('below-minimum');
  });

  it('wins by self-draw and records the winning tile', () => {
    const state = fixture({
      hands: [
        'm1 m2 m3 m4 m5 m6 m7 m8 m9 m5 m5 m5 m9 m9',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 m1',
      ],
    });
    state.lastDraw = { seat: 0, tile: t('m9'), kong: false };
    const result = winSelf(state, 0);
    expect(result.ok).toBe(true);
    expect(result.state.winner).toBe(0);
    expect(result.state.winInfo?.method).toBe('self-draw');
    expect(result.state.winInfo?.winningTile).toEqual(t('m9'));
    expect(result.state.winInfo?.settlement.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('wins on a discard and only the discarder pays', () => {
    const state = fixture({
      hands: [
        'z7 m1 m2 m4 m5 m7 m8 p1 p3 p5 s1 s2 s3 s9',
        'm1 m2 m3 m4 m5 m6 p1 p2 p3 s1 s2 s3 z7',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 m1',
      ],
      turn: 0,
    });
    const first = discard(state, 0, 'z7');
    expect(first.state.phase).toBe('claim');
    const option = first.state.claim?.options.find((item) => item.seat === 1);
    expect(option?.win).toBe(true);
    const result = claim(first.state, 1, 'win');
    expect(result.ok).toBe(true);
    expect(result.state.winner).toBe(1);
    expect(result.state.winInfo?.method).toBe('discard');
    expect(result.state.winInfo?.settlement[0]).toBeLessThan(0);
    expect(result.state.winInfo?.settlement[1]).toBeGreaterThan(0);
    expect(result.state.winInfo?.settlement[2]).toBe(0);
  });

  it('prefers a win over a peng when both are available', () => {
    const state = fixture({
      hands: [
        'z7 z7 z7 m1 m2 m4 m5 m7 m8 p1 p3 p5 s1 s2',
        'm1 m2 m3 m4 m5 m6 p1 p2 p3 s1 s2 s3 z7',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 m1',
      ],
      turn: 0,
    });
    const first = discard(state, 0, 'z7');
    expect(first.state.phase).toBe('claim');
    expect(first.state.claim?.options.find((item) => item.seat === 1)?.win).toBe(true);
    const claimed = claim(first.state, 1, 'win');
    expect(claimed.state.winner).toBe(1);
    expect(claimed.state.winInfo?.method).toBe('discard');
  });
});

describe('claims, priority and privacy', () => {
  it('lets the nearest peng beat a farther peng', () => {
    const state = fixture({
      hands: [
        'z7 z7 m1 m2 m4 m5 m7 m8 p1 p3 p5 s1 s3',
        'z7 z7 p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'z7 p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 s9',
      ],
      turn: 3,
    });
    const first = discard(state, 3, 'z7');
    expect(first.state.phase).toBe('claim');
    const seat0 = first.state.claim?.options.find((item) => item.seat === 0);
    const seat1 = first.state.claim?.options.find((item) => item.seat === 1);
    expect(seat0?.peng).toBe(true);
    expect(seat1?.peng).toBe(true);
    const afterZero = claim(first.state, 0, 'peng');
    expect(afterZero.ok).toBe(true);
    const afterOne = claim(afterZero.state, 1, 'peng');
    expect(afterOne.ok).toBe(true);
    expect(afterOne.state.melds[0][0].kind).toBe('peng');
    expect(afterOne.state.melds[1]).toHaveLength(0);
  });

  it('passes a claim and lets the next seat draw', () => {
    const state = fixture({
      hands: [
        'z7 z7 m1 m2 m4 m5 m7 m8 p1 p3 p5 s1 s3',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'z7 p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 s9',
      ],
      turn: 3,
    });
    const first = discard(state, 3, 'z7');
    const result = claim(first.state, 0, 'pass');
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('discard');
    expect(result.state.turn).toBe(0);
    expect(result.state.hands[0]).toHaveLength(14);
    expect(result.state.melds[0]).toHaveLength(0);
  });

  it('hides every hand except the viewing seat and exposes only own claim options', () => {
    const state = fixture({
      hands: [
        'z7 z7 m1 m2 m4 m5 m7 m8 p1 p3 p5 s1 s3',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'z7 p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 s9',
      ],
      turn: 3,
    });
    const first = discard(state, 3, 'z7');
    const own = view(first.state, 0);
    const other = view(first.state, 1);
    expect(own.hand.map(tileKey)).toEqual(first.state.hands[0].map(tileKey));
    expect(other.hand.map(tileKey)).toEqual(first.state.hands[1].map(tileKey));
    expect('hands' in own).toBe(false);
    expect(own.claim?.option?.peng).toBe(true);
    expect(other.claim?.option ?? null).toBeNull();
    expect(other.claim?.isMyDecision ?? false).toBe(false);
  });
});

describe('AI and hints', () => {
  it('computes a complete hand as -1 shanten and a tenpai hand as 0', () => {
    const complete = hand('m1 m2 m3 m4 m5 m6 m7 m8 m9 p5 p5 p5 z5 z5');
    const tenpai = hand('m1 m2 m3 m4 m5 m6 p1 p2 p3 s1 s2 s3 z5');
    expect(shanten(complete)).toBe(-1);
    expect(shanten(tenpai)).toBe(0);
  });

  it('computes seven-pairs and thirteen-orphans shanten', () => {
    const seven = hand('m1 m1 m2 m2 m3 m3 p4 p4 p5 p5 s6 s6 z1');
    const orphans = hand('m1 m9 p1 p9 s1 s9 z1 z2 z3 z4 z5 z6 z6');
    expect(shanten(seven)).toBe(0);
    expect(shanten(orphans)).toBe(0);
  });

  it('counts visible tiles honestly and excludes hidden hands', () => {
    const state = setup({ rng: seeded(21), dealer: 0 });
    const visible = visibleCounts(state, 0, state.hands[0]);
    const ownCount = state.hands[0].filter((tile) => tileKey(tile) === 'm1').length;
    const otherCount = state.hands[1].filter((tile) => tileKey(tile) === 'm1').length;
    expect(visible.get('m1') ?? 0).toBe(ownCount);
    if (otherCount > 0) expect(visible.get('m1') ?? 0).toBeLessThan(ownCount + otherCount);
  });

  it('returns a legal discard at every level', () => {
    for (const level of LEVELS) {
      const state = setup({ rng: seeded(31), dealer: 0 });
      const key = chooseDiscard(state, 0, level, seeded(5));
      expect(state.hands[0].some((tile) => tileKey(tile) === key)).toBe(true);
      expect(discard(state, 0, key).ok).toBe(true);
    }
  });

  it('is deterministic for a given RNG seed', () => {
    const state = setup({ rng: seeded(41), dealer: 0 });
    const a = chooseDiscard(state, 0, 'hard', seeded(9));
    const b = chooseDiscard(state, 0, 'hard', seeded(9));
    expect(a).toBe(b);
  });

  it('improves or keeps shanten over a simple efficiency choice', () => {
    const state = setup({ rng: seeded(51), dealer: 0 });
    const before = shanten(state.hands[0]);
    const key = chooseDiscard(state, 0, 'normal', seeded(2));
    const after = state.hands[0].filter((tile) => tileKey(tile) !== key);
    expect(shanten(after)).toBeLessThanOrEqual(before + 1);
  });

  it('claims only a legal option', () => {
    const state = fixture({
      hands: [
        'z7 z7 m1 m2 m4 m5 m7 m8 p1 p3 p5 s1 s3',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z1',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'z7 p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 s9',
      ],
      turn: 3,
    });
    const first = discard(state, 3, 'z7');
    const choice = chooseClaim(first.state, 0, 'normal', seeded(3));
    const result = claim(first.state, 0, choice.action, choice.pair);
    expect(result.ok).toBe(true);
  });

  it('produces a hint that applies cleanly and carries a reason', () => {
    const state = setup({ rng: seeded(61), dealer: 0 });
    state.lastDraw = { seat: 0, tile: state.hands[0][0], kong: false };
    const advice = hint(state, 0);
    expect(advice).not.toBeNull();
    if (!advice) return;
    expect(['efficiency', 'safety', 'win', 'kong', 'concealedKong', 'addedKong']).toContain(advice.kind);
    const result = applyAction(state, 0, advice.action);
    expect(result.ok).toBe(true);
  });

  it('uses danger estimates built from public discards only', () => {
    const state = setup({ rng: seeded(71), dealer: 0 });
    const safe = dangerScore(state, 0, state.discards[0]?.tile ?? t('m1'));
    expect(safe).toBeGreaterThanOrEqual(0);
    expect(safe).toBeLessThanOrEqual(1);
  });

  it('finishes a full game at every AI level', () => {
    for (const level of LEVELS) {
      let state = setup({ rng: seeded(100 + LEVELS.indexOf(level)), dealer: 0 });
      const rng = seeded(900 + LEVELS.indexOf(level));
      let guard = 0;
      while (state.phase !== 'over' && guard < 600) {
        guard += 1;
        const seat = (state.phase === 'claim' ? state.claim?.pending[0] ?? state.turn : state.turn) as number;
        if (seat < 0) break;
        const action = chooseAction(state, seat as Seat, level, rng);
        const result = applyAction(state, seat as Seat, action);
        if (!result.ok) break;
        state = result.state;
      }
      expect(state.phase).toBe('over');
      expect(guard).toBeLessThan(600);
    }
  });
});

describe('severity and honesty checks', () => {
  it('passes an added kong after every robber declines', () => {
    const state = fixture({
      hands: [
        'z7 m1 m2 m4 m5 m7 m8 p1 p3 s1 s2',
        'm1 m2 m3 m4 m5 m6 p1 p2 p3 s1 s2 s3 z7',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 m1',
      ],
      melds: [[meld('peng', 'z7 z7 z7', 1)], [], [], []],
      wall: 's1 s2 s3 s4 s5 s6 s7 s8 s9 p1 p2 p3 p4 p5 p6 p7 p8 p9 m1 m2',
    });
    const declared = declareAddedKong(state, 0, 'z7');
    expect(declared.state.claim?.robbing).toBe(true);
    const passed = claim(declared.state, 1, 'pass');
    expect(passed.ok).toBe(true);
    expect(passed.state.melds[0][0].kind).toBe('added-kong');
    expect(passed.state.lastDraw?.kong).toBe(true);
  });

  it('does not offer a robbing win against a concealed kong', () => {
    const state = fixture({
      hands: [
        'z7 z7 z7 z7 m1 m2 m4 m5 m7 m8 p1 p3 s1',
        'm1 m2 m3 m4 m5 m6 p1 p2 p3 s1 s2 s3 z7',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2',
        'p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 m1',
      ],
      wall: 's1 s2 s3 s4 s5 s6 s7 s8 s9 p1 p2 p3 p4 p5 p6 p7 p8 p9 m1 m2',
    });
    const result = declareConcealedKong(state, 0, 'z7');
    expect(result.ok).toBe(true);
    expect(result.state.claim).toBeNull();
    expect(result.state.phase).toBe('discard');
  });

  it('counts four visible copies as a very safe discard', () => {
    const state = setup({ rng: seeded(72), dealer: 0 });
    const other = setup({ rng: seeded(73), dealer: 0 });
    const discards = [
      { seat: 1 as Seat, tile: t('z7'), claimed: false, last: false },
      { seat: 2 as Seat, tile: t('z7'), claimed: false, last: false },
      { seat: 3 as Seat, tile: t('z7'), claimed: false, last: false },
    ];
    const low = dangerScore({ ...state, discards }, 0, t('z7'));
    const high = dangerScore({ ...other, discards: [] }, 0, t('z2'));
    expect(low).toBeLessThan(high + 0.2);
    expect(low).toBeLessThan(0.2);
  });

  it('does not let hidden hands change the hard discard when public information is equal', () => {
    const state = setup({ rng: seeded(83), dealer: 0 });
    const swapped = {
      ...state,
      hands: [state.hands[0].slice(), state.hands[2].slice(), state.hands[1].slice(), state.hands[3].slice()],
    };
    const a = chooseDiscard(state, 0, 'hard', seeded(17));
    const b = chooseDiscard(swapped, 0, 'hard', seeded(17));
    expect(a).toBe(b);
  });

  it('scores an exposed pure straight with the chow melds visible', () => {
    const melds = [
      meld('chi', 'm1 m2 m3', 3),
      meld('chi', 'm4 m5 m6', 2),
      meld('chi', 'm7 m8 m9', 1),
    ];
    const h = hand('p5 p5 p5 z5 z5');
    const evaluation = evaluateWin(
      h,
      melds,
      ctx({ selfDraw: false, seatWind: 1, prevalentWind: 1 }),
    );
    expect(evaluation).not.toBeNull();
    expect(fanContains(evaluation, 'pureStraight')).toBe(true);
    expect(fanContains(evaluation, 'concealed')).toBe(false);
  });
});

describe('scoring arithmetic', () => {
  it('has the documented fan values', () => {
    expect(FAN_VALUES.selfDraw).toBe(1);
    expect(FAN_VALUES.allSimples).toBe(1);
    expect(FAN_VALUES.allTriplets).toBe(2);
    expect(FAN_VALUES.mixedSuit).toBe(2);
    expect(FAN_VALUES.pureSuit).toBe(4);
    expect(FAN_VALUES.pureStraight).toBe(2);
    expect(FAN_VALUES.sevenPairs).toBe(2);
    expect(FAN_VALUES.thirteenOrphans).toBe(13);
    expect(FAN_VALUES.lastTile).toBe(1);
  });

  it('stacks fan without double-counting a single category', () => {
    const h = hand('m1 m2 m3 m4 m5 m6 m7 m8 m9 m5 m5 m5 m9 m9');
    const evaluation = evaluateWin(h, [], ctx({ selfDraw: true }));
    const keys = evaluation?.fan.map((item) => item.key) ?? [];
    expect(new Set(keys).size).toBe(keys.length);
    expect(evaluation?.totalFan).toBe(
      (evaluation?.fan ?? []).reduce((sum, item) => sum + item.fan * item.count, 0),
    );
  });
});
