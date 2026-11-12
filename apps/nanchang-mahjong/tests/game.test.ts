import { describe, expect, it } from 'vitest';
import {
  analyseChi,
  analyseGang,
  analysePeng,
  assignSpirit,
  claim,
  claimOptionsFor,
  declareKong,
  declareWin,
  discard,
  draw,
  evaluateWin,
  kongOptionsFor,
  makeDeck,
  nextHand,
  passClaim,
  scoreHand,
  setup,
  spiritCounts,
  spiritKind,
  view,
  waitingTiles,
  type GameState,
  type Meld,
  type SpiritInfo,
  type Tile,
} from '../src/game/nanchang-mahjong';
import { chooseAiAction, scatterPotential } from '../src/ai/ai';

function rngFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const spirit: SpiritInfo = assignSpirit('m1', [3, 4], 6);

const basicHand: Tile[] = [
  'm3', 'm4', 'm5',
  'p3', 'p4', 'p5',
  's3', 's4', 's5',
  'z1', 'z2', 'z3',
  'p9', 'p9',
];

const filler: Tile[] = [
  'p8', 'p8', 'p8', 's8', 's8', 's8', 'z7', 'z7', 'z7', 'm9', 'm9', 'm9', 'p7',
];

function scoreBase(overrides: Record<string, unknown> = {}) {
  return scoreHand({
    scores: [0, 0, 0, 0],
    dealer: 3,
    winner: 0,
    method: 'self-draw',
    pattern: 'basic',
    patterns: ['basic'],
    spirit,
    hands: [basicHand, filler, filler, filler],
    melds: [[], [], [], []],
    kongPoints: [0, 0, 0, 0],
    usedWild: true,
    from: null,
    ...overrides,
  });
}

function demoState(seed = 7): GameState {
  return setup({ rng: rngFrom(seed), dealer: 0, dice: [3, 4], matchTarget: 1000 });
}

describe('tiles, deal and spirits', () => {
  it('builds a 136-tile deck with four copies of every tile', () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(136);
    const counts = new Map<string, number>();
    for (const tile of deck) counts.set(tile, (counts.get(tile) ?? 0) + 1);
    expect(counts.size).toBe(34);
    expect([...counts.values()].every((value) => value === 4)).toBe(true);
  });

  it('deals 14 to the dealer, 13 to others, and keeps 17 dead-wall stacks', () => {
    const state = demoState();
    expect(state.hands.map((hand) => hand.length)).toEqual([14, 13, 13, 13]);
    expect(state.deadWall).toHaveLength(34);
    expect(state.liveWall).toHaveLength(49);
    const all = [
      ...state.hands.flat(),
      ...state.liveWall,
      ...state.deadWall,
    ];
    expect(all).toHaveLength(136);
  });

  it('puts the flipped indicator in the dead wall and assigns the next tile', () => {
    const state = demoState();
    expect(state.deadWall[state.spirit.stackIndex * 2]).toBe(state.spirit.indicator);
    expect(state.spirit.trueTile).toBe(state.spirit.indicator);
    expect(spiritKind(state.spirit.trueTile, state.spirit)).toBe('true');
    expect(spiritKind(state.spirit.secondaryTile, state.spirit)).toBe('secondary');
    expect(spiritKind(state.spirit.indicator, state.spirit)).toBe('true');
  });

  it('cycles suits and honours separately for the secondary spirit', () => {
    expect(assignSpirit('m9', [1, 1], 0).secondaryTile).toBe('m1');
    expect(assignSpirit('p1', [1, 1], 0).secondaryTile).toBe('p2');
    expect(assignSpirit('z4', [1, 1], 0).secondaryTile).toBe('z1');
    expect(assignSpirit('z7', [1, 1], 0).secondaryTile).toBe('z5');
  });

  it('has exactly three true and four secondary spirits in the wall and hands', () => {
    const state = demoState(11);
    const all = [...state.hands.flat(), ...state.liveWall, ...state.deadWall];
    const counts = spiritCounts(all, state.spirit);
    // The flipped indicator is a true tile but is not a spirit itself.
    expect(counts.trueCount - 1).toBe(3);
    expect(counts.secondaryCount).toBe(4);
  });

  it('deals deterministically from an injected RNG', () => {
    const a = demoState(42);
    const b = demoState(42);
    expect(a.hands).toEqual(b.hands);
    expect(a.spirit).toEqual(b.spirit);
    expect(a.liveWall).toEqual(b.liveWall);
  });

  it('counts true and secondary spirit points', () => {
    expect(spiritCounts(['m1', 'm1', 'm2'], spirit)).toEqual({
      trueCount: 2,
      secondaryCount: 1,
      points: 5,
    });
  });
});

describe('melds and honour sequences', () => {
  it('accepts ordinary number chi and peng', () => {
    expect(analyseChi(['m3', 'm4', 'm5'], spirit)?.kind).toBe('chi');
    expect(analysePeng(['p4', 'p4', 'p4'], spirit)?.kind).toBe('peng');
    expect(analyseGang(['s3', 's3', 's3', 's3'], spirit)?.kind).toBe('gang');
  });

  it('accepts any three different winds or three different dragons', () => {
    expect(analyseChi(['z1', 'z2', 'z4'], spirit)?.kind).toBe('chi');
    expect(analyseChi(['z5', 'z6', 'z7'], spirit)?.kind).toBe('chi');
  });

  it('rejects mixed or repeated honour sequences', () => {
    expect(analyseChi(['z1', 'z2', 'z5'], spirit)).toBeNull();
    expect(analyseChi(['z1', 'z1', 'z2'], spirit)).toBeNull();
    expect(analyseChi(['z1', 'z2', 'm3'], spirit)).toBeNull();
  });

  it('uses spirits as wildcards in chi, peng and gang', () => {
    const chi = analyseChi(['m3', 'm4', 'm1'], spirit);
    expect(chi?.kind).toBe('chi');
    expect(chi?.usedWild).toBe(true);
    const peng = analysePeng(['p4', 'p4', 'm1'], spirit);
    expect(peng?.kind).toBe('peng');
    expect(peng?.usedWild).toBe(true);
    const gang = analyseGang(['s3', 's3', 's3', 'm1'], spirit);
    expect(gang?.kind).toBe('gang');
    expect(gang?.usedWild).toBe(true);
  });

  it('does not count a spirit as a wildcard when it fits naturally', () => {
    const shape = analyseChi(['m1', 'm2', 'm3'], spirit);
    expect(shape?.kind).toBe('chi');
    expect(shape?.usedWild).toBe(false);
  });
});

describe('winning patterns', () => {
  it('detects four melds and a pair, including an honour sequence', () => {
    const check = evaluateWin(basicHand, [], spirit);
    expect(check.win).toBe(true);
    expect(check.bestPattern).toBe('basic');
    expect(check.canBasic).toBe(true);
  });

  it('uses a spirit as a wildcard for a basic win', () => {
    const hand = basicHand.slice();
    hand[4] = 'm1';
    const check = evaluateWin(hand, [], spirit);
    expect(check.win).toBe(true);
    expect(check.usedWild).toBe(true);
  });

  it('detects small seven pairs, counting a four-of-a-kind as two pairs', () => {
    const hand: Tile[] = [
      'm3', 'm3', 'm3', 'm3',
      'p4', 'p4', 's5', 's5',
      'z1', 'z1', 'z2', 'z2', 'z3', 'z3',
    ];
    const check = evaluateWin(hand, [], spirit);
    expect(check.win).toBe(true);
    expect(check.canSmallSevenPairs).toBe(true);
    expect(check.patterns).toContain('small-seven-pairs');
  });

  it('detects big seven pairs as four concealed triplets and a pair', () => {
    const hand: Tile[] = [
      'm3', 'm3', 'm3',
      'p4', 'p4', 'p4',
      's5', 's5', 's5',
      'z1', 'z1', 'z1',
      'p9', 'p9',
    ];
    const check = evaluateWin(hand, [], spirit);
    expect(check.win).toBe(true);
    expect(check.canBigSevenPairs).toBe(true);
    expect(check.bestPattern).toBe('big-seven-pairs');
  });

  it('detects thirteen scattered with seven honours and spaced numbers', () => {
    const hand: Tile[] = [
      'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7',
      'm3', 'm6', 'm9', 'p1', 'p4', 's2', 's5',
    ];
    const check = evaluateWin(hand, [], spirit);
    expect(check.win).toBe(true);
    expect(check.canThirteenScattered).toBe(true);
    expect(check.bestPattern).toBe('seven-star');
  });

  it('rejects scattered hands with a repeated honour or a close number', () => {
    const repeated: Tile[] = [
      'z1', 'z1', 'z3', 'z4', 'z5', 'z6', 'z7',
      'm3', 'm6', 'm9', 'p1', 'p4', 's2', 's5',
    ];
    expect(evaluateWin(repeated, [], spirit).canThirteenScattered).toBe(false);
    const close: Tile[] = [
      'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7',
      'm3', 'm5', 'm9', 'p1', 'p4', 's2', 's5',
    ];
    expect(evaluateWin(close, [], spirit).canThirteenScattered).toBe(false);
  });

  it('requires genuine honours for seven-star thirteen scattered', () => {
    const hand: Tile[] = [
      'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7',
      'm3', 'm6', 'm9', 'p1', 'p4', 's2', 's5',
    ];
    const check = evaluateWin(hand, [], spirit);
    expect(check.canSevenStar).toBe(true);
    // Replace a genuine honour with a spirit: regular scattered may survive,
    // but seven-star must not.
    const replaced = hand.slice();
    replaced[0] = 'm1';
    const replacedCheck = evaluateWin(replaced, [], spirit);
    expect(replacedCheck.canSevenStar).toBe(false);
  });

  it('finds waits for a tenpai hand', () => {
    const state = demoState();
    const hand: Tile[] = [
      'm3', 'm4', 'm5',
      'p3', 'p4', 'p5',
      's3', 's4', 's5',
      'z1', 'z2', 'z3', 'p9',
    ];
    state.hands[0] = hand;
    const waits = waitingTiles(state, 0, hand, []);
    expect(waits).toContain('p9');
  });
});

describe('scoring table', () => {
  it('pays a basic self-draw from every seat and doubles the dealer side', () => {
    const sheet = scoreBase();
    expect(sheet.unitValue).toBe(1);
    expect(sheet.deltas).toEqual([8, -2, -2, -4]);
  });

  it('pays a discard win with the discarder and dealer doubled', () => {
    const sheet = scoreBase({ method: 'discard', from: 1 });
    expect(sheet.deltas).toEqual([5, -2, -1, -2]);
  });

  it('doubles the dealer side', () => {
    const dealerWin = scoreBase({ dealer: 0, winner: 0 });
    expect(dealerWin.deltas).toEqual([12, -4, -4, -4]);
    const dealerPays = scoreBase({ dealer: 3, method: 'discard', from: 3 });
    expect(dealerPays.deltas).toEqual([6, -1, -1, -4]);
  });

  it('settles true and secondary spirit points pairwise', () => {
    const hands = [['m1', 'm2'], ['p1', 'p1'], ['p9'], ['s9']];
    const sheet = scoreHand({
      scores: [0, 0, 0, 0],
      dealer: 3,
      winner: null,
      method: null,
      pattern: null,
      patterns: [],
      spirit,
      hands,
      melds: [[], [], [], []],
      kongPoints: [0, 0, 0, 0],
      drawn: true,
    });
    expect(sheet.spiritBase).toEqual([3, 0, 0, 0]);
    expect(sheet.overlord).toBe(true);
    expect(sheet.spiritAdjusted[0]).toBe(6);
    expect(sheet.deltas).toEqual([18, -6, -6, -6]);
  });

  it('applies overlord spirit only when one player has spirits', () => {
    const hands = [['m1', 'm2'], ['m2'], ['p9'], ['s9']];
    const sheet = scoreHand({
      scores: [0, 0, 0, 0],
      dealer: 3,
      winner: null,
      method: null,
      pattern: null,
      patterns: [],
      spirit,
      hands,
      melds: [[], [], [], []],
      kongPoints: [0, 0, 0, 0],
      drawn: true,
    });
    expect(sheet.overlord).toBe(false);
    expect(sheet.spiritAdjusted[0]).toBe(3);
    expect(sheet.spiritAdjusted[1]).toBe(1);
  });

  it('applies spirit sprint at five or more spirit points', () => {
    const hands = [['m1', 'm1', 'm2'], ['m2'], ['p9'], ['s9']];
    const sheet = scoreHand({
      scores: [0, 0, 0, 0],
      dealer: 3,
      winner: null,
      method: null,
      pattern: null,
      patterns: [],
      spirit,
      hands,
      melds: [[], [], [], []],
      kongPoints: [0, 0, 0, 0],
      drawn: true,
    });
    expect(sheet.spiritBase[0]).toBe(5);
    expect(sheet.spiritSprint[0]).toBe(2);
    expect(sheet.spiritAdjusted[0]).toBe(10);
  });

  it('settles ordinary and spirit kong points', () => {
    const sheet = scoreHand({
      scores: [0, 0, 0, 0],
      dealer: 3,
      winner: null,
      method: null,
      pattern: null,
      patterns: [],
      spirit,
      hands: [['p9'], ['p8'], ['s8'], ['m9']],
      melds: [[], [], [], []],
      kongPoints: [2, 0, 0, 0],
      drawn: true,
    });
    expect(sheet.deltas).toEqual([6, -2, -2, -2]);
    const spiritKong = scoreHand({
      scores: [0, 0, 0, 0],
      dealer: 3,
      winner: null,
      method: null,
      pattern: null,
      patterns: [],
      spirit,
      hands: [['p9'], ['p8'], ['s8'], ['m9']],
      melds: [[], [], [], []],
      kongPoints: [10, 0, 0, 0],
      drawn: true,
    });
    expect(spiritKong.deltas).toEqual([30, -10, -10, -10]);
  });

  it('scores German as ×2+5 and German-in-German as ×4+5', () => {
    const german = scoreBase({
      hands: [basicHand, [...filler.slice(0, 12), 'm2'], filler, filler],
      usedWild: false,
    });
    expect(german.german).toBe(true);
    expect(german.germanInGerman).toBe(false);
    expect(german.patternMultiplier).toBe(2);
    expect(german.flatBonus).toBe(5);
    expect(german.unitValue).toBe(7);
    const inGerman = scoreBase({ usedWild: false });
    expect(inGerman.german).toBe(true);
    expect(inGerman.germanInGerman).toBe(true);
    expect(inGerman.patternMultiplier).toBe(4);
    expect(inGerman.unitValue).toBe(9);
    expect(inGerman.deltas).toEqual([72, -18, -18, -36]);
  });

  it('scores spirit single-wait as ×2+5', () => {
    const sheet = scoreBase({ spiritSingleWait: true, usedWild: true });
    expect(sheet.unitValue).toBe(7);
    expect(sheet.deltas).toEqual([56, -14, -14, -28]);
  });

  it('scores a kong draw as ×4 and stacks self-draw', () => {
    const sheet = scoreBase({ kongDraw: true, usedWild: true });
    expect(sheet.unitValue).toBe(4);
    expect(sheet.deltas).toEqual([32, -8, -8, -16]);
  });

  it('scores robbing a kong with the kong player paying ×4', () => {
    const sheet = scoreBase({ method: 'rob-kong', from: 1, usedWild: true });
    expect(sheet.deltas).toEqual([7, -4, -1, -2]);
    expect(sheet.robbingKong).toBe(true);
  });

  it('scores heavenly and human hands at ×20', () => {
    const heavenly = scoreBase({ method: 'heavenly', dealer: 0, winner: 0, usedWild: true });
    expect(heavenly.unitValue).toBe(20);
    expect(heavenly.deltas).toEqual([120, -40, -40, -40]);
    const human = scoreBase({ method: 'human', dealer: 0, winner: 1, from: 0, usedWild: true });
    expect(human.unitValue).toBe(20);
    expect(human.deltas).toEqual([-80, 120, -20, -20]);
  });

  it('scores seven pairs, thirteen scattered and seven-star', () => {
    const seven = scoreBase({ pattern: 'small-seven-pairs', patterns: ['small-seven-pairs'], usedWild: true });
    expect(seven.unitValue).toBe(2);
    expect(seven.deltas).toEqual([16, -4, -4, -8]);
    const scattered = scoreBase({
      pattern: 'thirteen-scattered',
      patterns: ['thirteen-scattered'],
      method: 'discard',
      from: 1,
      usedWild: true,
    });
    expect(scattered.unitValue).toBe(2);
    expect(scattered.deltas).toEqual([10, -4, -2, -4]);
    const star = scoreBase({
      pattern: 'seven-star',
      patterns: ['seven-star'],
      method: 'discard',
      from: 1,
      usedWild: true,
    });
    expect(star.unitValue).toBe(4);
    expect(star.deltas).toEqual([20, -8, -4, -8]);
  });
});

describe('turns, views and kongs', () => {
  it('rejects a draw when the dealer already holds fourteen tiles', () => {
    const state = demoState();
    expect(draw(state, 0).ok).toBe(false);
    expect(discard(state, 1, state.hands[1][0]).ok).toBe(false);
  });

  it('draws and discards, then advances or opens a claim window', () => {
    const state = demoState();
    const tile = state.hands[0][0];
    const afterDiscard = discard(state, 0, tile);
    expect(afterDiscard.ok).toBe(true);
    expect(afterDiscard.state.hands[0]).toHaveLength(13);
    if (afterDiscard.state.phase === 'draw') {
      expect(afterDiscard.state.turn).toBe(1);
      const afterDraw = draw(afterDiscard.state, 1);
      expect(afterDraw.ok).toBe(true);
      expect(afterDraw.state.hands[1]).toHaveLength(14);
    } else {
      expect(afterDiscard.state.phase).toBe('claim');
      expect(afterDiscard.state.claimQueue.length).toBeGreaterThan(0);
    }
  });

  it('draws for seat zero as well as the other seats', () => {
    const state = demoState();
    state.phase = 'draw';
    state.turn = 0;
    const before = state.hands[0].length;
    const result = draw(state, 0);
    expect(result.ok).toBe(true);
    expect(result.state.hands[0]).toHaveLength(before + 1);
    expect(result.state.phase).toBe('discard');
  });

  it('keeps each live seat view private', () => {
    const state = demoState();
    const seat0 = view(state, 0);
    const seat1 = view(state, 1);
    expect(seat0.hand).toEqual(state.hands[0]);
    expect(seat1.hand).toEqual(state.hands[1]);
    expect(seat0.hand).not.toEqual(seat1.hand);
    expect(seat0.revealedHands).toBeNull();
  });

  it('transfers a claimed spirit to the new owner', () => {
    const state = demoState();
    state.spirit = spirit;
    state.hands[0] = ['m1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 's2', 's3', 's4', 's5', 's6', 's7'];
    state.hands[1] = ['m1', 'm1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 's2', 's3', 's4', 's5'];
    state.phase = 'discard';
    state.turn = 0;
    const afterDiscard = discard(state, 0, 'm1');
    expect(afterDiscard.ok).toBe(true);
    expect(afterDiscard.state.phase).toBe('claim');
    const decision = afterDiscard.state.claimQueue.find((item) => item.seat === 1);
    expect(decision).toBeTruthy();
    const peng = decision?.options.find((option) => option.kind === 'peng' && option.tiles.length === 2);
    expect(peng).toBeTruthy();
    const onlySeat1: GameState = {
      ...afterDiscard.state,
      claimQueue: [{ seat: 1, options: decision!.options }],
      claimIndex: 0,
    };
    const claimed = claim(onlySeat1, 1, peng!);
    expect(claimed.ok).toBe(true);
    const meld = claimed.state.melds[1][0];
    expect(meld.tiles.filter((tile) => tile === 'm1')).toHaveLength(3);
    expect(spiritCounts(meld.tiles, claimed.state.spirit).points).toBe(6);
  });

  it('scores a kong made of four spirits as ten points', () => {
    const state = demoState();
    state.spirit = spirit;
    state.hands[0] = ['m1', 'm1', 'm1', 'm1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 's2', 's3', 's4'];
    state.phase = 'discard';
    state.turn = 0;
    const options = kongOptionsFor(state, 0);
    const spiritOption = options.find((option) => option.spiritKong);
    expect(spiritOption).toBeTruthy();
    const result = declareKong(state, 0, spiritOption!);
    expect(result.ok).toBe(true);
    expect(result.state.kongPoints[0]).toBe(10);
  });

  it('marks a dealer opening hand as heavenly', () => {
    const state = demoState();
    state.hands[0] = basicHand.slice();
    state.phase = 'discard';
    state.turn = 0;
    state.flags.heavenlyAvailable = true;
    const won = declareWin(state, 0);
    expect(won.ok).toBe(true);
    expect(won.state.win?.method).toBe('heavenly');
    expect(won.state.win?.heavenly).toBe(true);
  });

  it('provides legal concealed kong options and awards kong points', () => {
    const state = demoState();
    state.hands[0] = ['p5', 'p5', 'p5', 'p5', 'm3', 'm4', 'm6', 'p2', 'p8', 's4', 's7', 'z2', 'z6', 'z7'];
    state.phase = 'discard';
    state.turn = 0;
    const options = kongOptionsFor(state, 0);
    expect(options.length).toBeGreaterThan(0);
    const result = declareKong(state, 0, options[0]);
    expect(result.ok).toBe(true);
    expect(result.state.melds[0][0].kind).toBe('gang');
    expect(result.state.kongPoints[0]).toBe(2);
    expect(result.state.hands[0]).toHaveLength(11);
  });

  it('lets another seat rob an added kong', () => {
    const state = demoState();
    const peng: Meld = {
      id: 1,
      kind: 'peng',
      tiles: ['p6', 'p6', 'p6'],
      owner: 0,
      claimedFrom: 1,
      concealed: false,
      added: false,
      target: 'peng:p6',
      usedWild: false,
      spiritKong: false,
    };
    state.melds[0] = [peng];
    state.hands[0] = ['p6', 'm3', 'm4', 'm6', 'p2', 'p8', 's4', 's7', 'z2', 'z6', 'z7'];
    state.hands[1] = [
      'm3', 'm4', 'm5',
      's3', 's4', 's5',
      'z1', 'z2', 'z3',
      'p4', 'p5', 'z5', 'z5',
    ];
    state.phase = 'discard';
    state.turn = 0;
    const options = kongOptionsFor(state, 0).filter((option) => option.kind === 'added');
    expect(options.length).toBeGreaterThan(0);
    const pending = declareKong(state, 0, options[0]);
    expect(pending.ok).toBe(true);
    expect(pending.state.phase).toBe('claim');
    const decision = pending.state.claimQueue[0];
    expect(decision.seat).toBe(1);
    const winOption = decision.options.find((option) => option.kind === 'win');
    expect(winOption).toBeTruthy();
    const robbed = claim(pending.state, 1, winOption!);
    expect(robbed.ok).toBe(true);
    expect(robbed.state.phase).toBe('hand-over');
    expect(robbed.state.win?.method).toBe('rob-kong');
    expect(robbed.state.win?.robbingKong).toBe(true);
  });

  it('declares a self-drawn win and moves to the next hand', () => {
    const state = demoState();
    state.hands[0] = basicHand.slice();
    state.phase = 'discard';
    state.turn = 0;
    const won = declareWin(state, 0);
    expect(won.ok).toBe(true);
    expect(won.state.phase).toBe('hand-over');
    expect(won.state.win?.pattern).toBe('basic');
    expect(won.state.scoreSheet).not.toBeNull();
    const next = nextHand(won.state, rngFrom(9), [2, 3]);
    expect(next.ok).toBe(true);
    expect(next.state.handNumber).toBe(2);
    expect(next.state.dealer).toBe(1);
    expect(next.state.scores).toEqual(won.state.scores);
  });

  it('shows all hands after the hand ends', () => {
    const state = demoState();
    state.hands[0] = basicHand.slice();
    state.phase = 'discard';
    state.turn = 0;
    const won = declareWin(state, 0).state;
    const view0 = view(won, 0);
    expect(view0.revealedHands).not.toBeNull();
    expect(view0.revealedHands?.[2]).toEqual(won.hands[2]);
  });

  it('exposes claim options only to the seat on the clock', () => {
    const state = demoState();
    state.phase = 'claim';
    state.turn = -1;
    state.lastDiscard = { seat: 0, tile: 'p5' };
    state.claimQueue = [
      { seat: 2, options: [{ kind: 'peng', tiles: ['p5', 'p5'], target: 'peng:p5', usedWild: false }] },
      { seat: 3, options: [{ kind: 'win', tiles: [], target: 'win', usedWild: false }] },
    ];
    state.claimIndex = 0;
    expect(view(state, 2).claimOptions).toHaveLength(1);
    expect(view(state, 3).claimOptions).toHaveLength(0);
  });

  it('passes a claim and moves to the next seat', () => {
    const state = demoState();
    state.phase = 'claim';
    state.turn = -1;
    state.lastDiscard = { seat: 0, tile: 'p5' };
    state.claimQueue = [
      { seat: 2, options: [{ kind: 'peng', tiles: ['p5', 'p5'], target: 'peng:p5', usedWild: false }] },
    ];
    state.claimIndex = 0;
    const passed = passClaim(state, 2);
    expect(passed.ok).toBe(true);
    expect(passed.state.phase).toBe('draw');
    expect(passed.state.turn).toBe(1);
  });
});

function playAiHand(seed: number, target = 20): GameState {
  let state = setup({ rng: rngFrom(seed), dealer: 0, dice: [3, 4], matchTarget: target });
  for (let step = 0; step < 900; step += 1) {
    if (state.phase === 'hand-over' || state.phase === 'game-over') return state;
    const seat = state.phase === 'claim'
      ? state.claimQueue[state.claimIndex]?.seat
      : state.turn;
    if (seat === undefined || seat < 0) break;
    const action = chooseAiAction(state, seat, 'hard', rngFrom(seed + step));
    if (!action) break;
    let result;
    if (action.type === 'draw') result = draw(state, seat);
    else if (action.type === 'discard') result = discard(state, seat, action.tile);
    else if (action.type === 'win') result = declareWin(state, seat);
    else if (action.type === 'kong') result = declareKong(state, seat, action.option);
    else if (action.type === 'claim') result = claim(state, seat, action.option);
    else result = passClaim(state, seat);
    if (!result.ok) throw new Error(`AI action failed: ${action.type} ${result.error ?? ''}`);
    state = result.state;
  }
  return state;
}

describe('full hands', () => {
  it('finishes a complete AI hand for several seeds', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const finished = playAiHand(seed);
      expect(['hand-over', 'game-over']).toContain(finished.phase);
      expect(finished.scoreSheet).not.toBeNull();
    }
  }, 30000);

  it('deals the next hand after an AI hand', () => {
    const finished = playAiHand(8, 1000);
    expect(finished.phase).toBe('hand-over');
    const next = nextHand(finished, rngFrom(21), [2, 4]);
    expect(next.ok).toBe(true);
    expect(next.state.handNumber).toBe(finished.handNumber + 1);
    expect(next.state.hands.map((hand) => hand.length)).toEqual([13, 14, 13, 13]);
  }, 30000);
});

describe('AI levels', () => {
  it('returns legal actions for all four levels', () => {
    const state = demoState();
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const action = chooseAiAction(state, 0, level, rngFrom(3));
      expect(action).not.toBeNull();
      expect(['draw', 'discard', 'win', 'kong', 'claim', 'pass']).toContain(action?.type);
    }
  });

  it('takes a winning hand at every level', () => {
    const state = demoState();
    state.hands[0] = basicHand.slice();
    state.phase = 'discard';
    state.turn = 0;
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      expect(chooseAiAction(state, 0, level, rngFrom(5))?.type).toBe('win');
    }
  });

  it('is deterministic with the same injected RNG', () => {
    const state = demoState();
    const a = chooseAiAction(state, 0, 'hard', rngFrom(12));
    const b = chooseAiAction(state, 0, 'hard', rngFrom(12));
    expect(a).toEqual(b);
  });

  it('detects thirteen-scattered potential', () => {
    const scattered: Tile[] = [
      'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7',
      'm3', 'm6', 'm9', 'p1', 'p4', 's2', 's5',
    ];
    expect(scatterPotential(scattered, spirit)).toBeGreaterThanOrEqual(35);
  });

  it('lets a claim seat win when a discard completes its hand', () => {
    const state = demoState();
    state.hands[1] = [
      'm3', 'm4', 'm5',
      'p3', 'p4', 'p5',
      's3', 's4', 's5',
      'z1', 'z2', 'z3', 'p5',
    ];
    state.phase = 'claim';
    state.turn = -1;
    state.lastDiscard = { seat: 0, tile: 'p5' };
    state.claimQueue = [
      { seat: 1, options: claimOptionsFor(1, state.hands[1], [], 'p5', 0, state.spirit) },
    ];
    state.claimIndex = 0;
    const action = chooseAiAction(state, 1, 'hard', rngFrom(4));
    expect(action?.type).toBe('claim');
    if (action?.type === 'claim') expect(action.option.kind).toBe('win');
  });
});
