import { describe, expect, it } from 'vitest';
import {
  analyzeCards,
  bury,
  declare,
  declarationOptions,
  decomposePlain,
  finishDeal,
  isPair,
  isTractor,
  isTrump,
  legalMoves,
  legalThrows,
  levelRankFor,
  makeDeck,
  nextDeal,
  passDeclaration,
  play,
  pointValue,
  setup,
  teamOf,
  throwIsLegal,
  trickPoints,
  trickWinner,
  trumpPower,
  validatePlay,
  view,
  type Card,
  type GameState,
  type Seat,
} from '../src/game/sheng-ji';
import {
  chooseBury,
  chooseDeclaration,
  choosePlay,
  hintFor,
  type AiLevel,
} from '../src/ai/ai';

const DECK = makeDeck();

function C(id: string): Card {
  const found = DECK.find((card) => card.id === id);
  if (!found) throw new Error(`missing test card ${id}`);
  return { ...found };
}

function H(...ids: string[]): Card[] {
  return ids.map(C);
}

function seeded(seed = 1): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function declareState(hands: Card[][], extra: Partial<GameState> = {}): GameState {
  const base = setup({ rng: seeded(11), dealer: 3 });
  return {
    ...base,
    phase: 'declare',
    declareTurn: 0,
    declarationActions: 0,
    declarations: [],
    declaration: null,
    declarer: null,
    trump: null,
    levelRank: '2',
    levels: [0, 0],
    hands: hands.map((hand) => hand.slice()),
    bottom: H('C3-0', 'C3-1', 'D4-0', 'D4-1', 'H6-0', 'H6-1', 'S9-0', 'S9-1'),
    ...extra,
  };
}

function playState(hands: Card[][], extra: Partial<GameState> = {}): GameState {
  const base = setup({ rng: seeded(23), dealer: 3 });
  return {
    ...base,
    phase: 'play',
    trump: 'S',
    levelRank: '2',
    declarer: 0,
    declareTurn: -1,
    turn: 0,
    hands: hands.map((hand) => hand.slice()),
    bottom: [],
    bottomTaken: true,
    buried: [],
    currentTrick: [],
    tricks: [],
    lastTrick: null,
    points: [0, 0],
    results: [],
    ...extra,
  };
}

describe('deck and ranks', () => {
  it('builds 108 cards with 100 table points and unique ids', () => {
    expect(makeDeck()).toHaveLength(108);
    expect(new Set(makeDeck().map((card) => card.id)).size).toBe(108);
    expect(DECK.reduce((sum, card) => sum + pointValue(card), 0)).toBe(100);
  });

  it('scores one copy of each point face and blanks the duplicate', () => {
    expect(pointValue(C('H5-0'))).toBe(5);
    expect(pointValue(C('H10-0'))).toBe(10);
    expect(pointValue(C('HK-0'))).toBe(10);
    expect(pointValue(C('H5-1'))).toBe(0);
    expect(pointValue(C('H10-1'))).toBe(0);
    expect(pointValue(C('HK-1'))).toBe(0);
    expect(pointValue(C('H4-0'))).toBe(0);
  });

  it('deals 25 to each seat and 8 bottom cards', () => {
    const state = setup({ rng: seeded(2) });
    expect(state.hands.map((hand) => hand.length)).toEqual([25, 25, 25, 25]);
    expect(state.bottom).toHaveLength(8);
    const all = [...state.hands.flat(), ...state.bottom];
    expect(new Set(all.map((card) => card.id)).size).toBe(108);
  });

  it('keeps partnerships and seat order', () => {
    expect(teamOf(0)).toBe(0);
    expect(teamOf(2)).toBe(0);
    expect(teamOf(1)).toBe(1);
    expect(teamOf(3)).toBe(1);
    expect(levelRankFor(0)).toBe('2');
    expect(levelRankFor(12)).toBe('A');
  });

  it('deals deterministically from an injected RNG', () => {
    const a = setup({ rng: seeded(99) });
    const b = setup({ rng: seeded(99) });
    expect(a.hands.map((hand) => hand.map((card) => card.id))).toEqual(
      b.hands.map((hand) => hand.map((card) => card.id)),
    );
  });
});

describe('trump and card strength', () => {
  it('marks jokers, level cards and the trump suit', () => {
    expect(isTrump(C('JBJ-0'), 'S', '2')).toBe(true);
    expect(isTrump(C('JSJ-0'), 'S', '2')).toBe(true);
    expect(isTrump(C('H2-0'), 'S', '2')).toBe(true);
    expect(isTrump(C('S5-0'), 'S', '2')).toBe(true);
    expect(isTrump(C('H5-0'), 'S', '2')).toBe(false);
  });

  it('keeps level cards as trump in no-trump', () => {
    expect(isTrump(C('H2-0'), 'NT', '2')).toBe(true);
    expect(isTrump(C('S5-0'), 'NT', '2')).toBe(false);
    expect(isTrump(C('JBJ-0'), 'NT', '2')).toBe(true);
  });

  it('orders big joker, small joker, level cards and the trump suit', () => {
    const big = trumpPower(C('JBJ-0'), 'S', '2');
    const small = trumpPower(C('JSJ-0'), 'S', '2');
    const trumpLevel = trumpPower(C('S2-0'), 'S', '2');
    const offLevel = trumpPower(C('H2-0'), 'S', '2');
    const ace = trumpPower(C('SA-0'), 'S', '2');
    expect(big).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(trumpLevel);
    expect(trumpLevel).toBeGreaterThan(offLevel);
    expect(offLevel).toBeGreaterThan(ace);
  });

  it('recognises pairs only on identical faces', () => {
    expect(isPair(H('S5-0', 'S5-1'))).toBe(true);
    expect(isPair(H('H2-0', 'D2-0'))).toBe(false);
    expect(isPair(H('JBJ-0', 'JBJ-1'))).toBe(true);
  });

  it('recognises consecutive pairs and rejects the level gap', () => {
    expect(isTractor(H('SA-0', 'SK-0', 'SA-1', 'SK-1'), 'S', '2')).toBe(true);
    expect(isTractor(H('S6-0', 'S7-0', 'S6-1', 'S7-1'), 'S', '5')).toBe(true);
    expect(isTractor(H('S4-0', 'S6-0', 'S4-1', 'S6-1'), 'S', '5')).toBe(false);
    expect(isTractor(H('S2-0', 'S3-0', 'S2-1', 'S3-1'), 'S', '2')).toBe(false);
  });

  it('decomposes a plain-suit throw into pairs and singles', () => {
    const components = decomposePlain(H('HA-0', 'HA-1', 'HK-0', 'HQ-0'));
    expect(components.map((component) => component.kind)).toEqual(['pair', 'single', 'single']);
  });
});

describe('trick resolution', () => {
  it('lets a higher card of the led suit win', () => {
    const winner = trickWinner(
      [
        { seat: 0 as const, cards: H('H10-0') },
        { seat: 1 as const, cards: H('HA-0') },
        { seat: 2 as const, cards: H('H4-0') },
        { seat: 3 as const, cards: H('H9-0') },
      ],
      'S',
      '2',
    );
    expect(winner).toBe(1);
  });

  it('lets a trump beat a plain-suit lead', () => {
    const winner = trickWinner(
      [
        { seat: 0 as const, cards: H('HA-0') },
        { seat: 1 as const, cards: H('S3-0') },
      ],
      'S',
      '2',
    );
    expect(winner).toBe(1);
  });

  it('lets an off-suit level card beat the trump ace', () => {
    const winner = trickWinner(
      [
        { seat: 0 as const, cards: H('SA-0') },
        { seat: 1 as const, cards: H('H2-0') },
      ],
      'S',
      '2',
    );
    expect(winner).toBe(1);
  });

  it('requires a matching pair to beat a pair lead', () => {
    const lead = [
      { seat: 0 as const, cards: H('H10-0', 'H10-1') },
      { seat: 1 as const, cards: H('S3-0', 'S4-0') },
    ];
    expect(trickWinner(lead, 'S', '2')).toBe(0);
    const ruff = [
      { seat: 0 as const, cards: H('H10-0', 'H10-1') },
      { seat: 1 as const, cards: H('S3-0', 'S3-1') },
    ];
    expect(trickWinner(ruff, 'S', '2')).toBe(1);
  });

  it('requires a same-length tractor to beat a tractor', () => {
    const tractor = [
      { seat: 0 as const, cards: H('H9-0', 'H10-0', 'H9-1', 'H10-1') },
      { seat: 1 as const, cards: H('S3-0', 'S4-0', 'S5-0', 'S6-0') },
    ];
    expect(trickWinner(tractor, 'S', '2')).toBe(0);
    const ruff = [
      { seat: 0 as const, cards: H('H9-0', 'H10-0', 'H9-1', 'H10-1') },
      { seat: 1 as const, cards: H('S3-0', 'S4-0', 'S3-1', 'S4-1') },
    ];
    expect(trickWinner(ruff, 'S', '2')).toBe(1);
  });

  it('does not let a same-suit follow beat a legal throw', () => {
    const winner = trickWinner(
      [
        { seat: 0 as const, cards: H('H5-0', 'H5-1', 'H7-0') },
        { seat: 1 as const, cards: H('H8-0', 'H8-1', 'H9-0') },
      ],
      'S',
      '2',
    );
    expect(winner).toBe(0);
  });

  it('lets a matching trump ruff beat a throw', () => {
    const winner = trickWinner(
      [
        { seat: 0 as const, cards: H('H5-0', 'H5-1', 'H7-0') },
        { seat: 1 as const, cards: H('S3-0', 'S3-1', 'S4-0') },
      ],
      'S',
      '2',
    );
    expect(winner).toBe(1);
  });

  it('does not let a mixed off-suit play win', () => {
    const winner = trickWinner(
      [
        { seat: 0 as const, cards: H('H10-0', 'H10-1') },
        { seat: 1 as const, cards: H('S3-0', 'C4-0') },
      ],
      'S',
      '2',
    );
    expect(winner).toBe(0);
  });

  it('counts point cards in a trick, once per face', () => {
    expect(trickPoints(H('H5-0', 'H10-0', 'HK-0', 'H5-1'))).toBe(25);
  });
});

describe('throws', () => {
  it('accepts a throw whose singles are both highest', () => {
    const state = playState([
      H('HA-0', 'HK-0'),
      H('H5-0'),
      H('H4-0'),
      H('H3-0'),
    ]);
    expect(throwIsLegal(state, 0, H('HA-0', 'HK-0'))).toBe(true);
  });

  it('rejects a throw when an opponent holds a higher component', () => {
    const state = playState([
      H('HA-0', 'HK-0'),
      H('HA-1'),
      H('H4-0'),
      H('H3-0'),
    ]);
    expect(throwIsLegal(state, 0, H('HA-0', 'HK-0'))).toBe(false);
  });

  it('rejects a pair component beaten by a higher opponent pair', () => {
    const state = playState([
      H('H5-0', 'H5-1', 'H7-0'),
      H('H6-0', 'H6-1'),
      H('H3-0'),
      H('H4-0'),
    ]);
    expect(throwIsLegal(state, 0, H('H5-0', 'H5-1', 'H7-0'))).toBe(false);
  });

  it('rejects a tractor component beaten by a higher opponent tractor', () => {
    const state = playState([
      H('H5-0', 'H6-0', 'H5-1', 'H6-1', 'H9-0'),
      H('H7-0', 'H8-0', 'H7-1', 'H8-1'),
      H('H3-0'),
      H('H4-0'),
    ]);
    expect(throwIsLegal(state, 0, H('H5-0', 'H6-0', 'H5-1', 'H6-1', 'H9-0'))).toBe(false);
  });

  it('finds a safe throw for the AI or hint', () => {
    const state = playState([
      H('HA-0', 'HK-0', 'HQ-0', 'C3-0'),
      H('H5-0'),
      H('H4-0'),
      H('H3-0'),
    ]);
    const throws = legalThrows(state, 0);
    expect(throws.length).toBeGreaterThan(0);
    expect(throws.some((cards) => cards.length >= 2)).toBe(true);
  });

  it('refuses an unsafe throw through validatePlay', () => {
    const state = playState([
      H('HA-0', 'HK-0'),
      H('HA-1'),
      H('H4-0'),
      H('H3-0'),
    ]);
    const result = validatePlay(state, 0, ['HA-0', 'HK-0']);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('illegal-throw');
  });

  it('accepts a safe throw through validatePlay', () => {
    const state = playState([
      H('HA-0', 'HK-0'),
      H('H5-0'),
      H('H4-0'),
      H('H3-0'),
    ]);
    const result = validatePlay(state, 0, ['HA-0', 'HK-0']);
    expect(result.ok).toBe(true);
    expect(result.shape?.kind).toBe('throw');
  });
});

describe('following rules', () => {
  it('forces a follower to play the led suit when possible', () => {
    const state = playState([H('H10-0'), H('H5-0', 'S3-0'), H(), H()], {
      currentTrick: [{ seat: 0 as const, cards: H('H10-0') }],
      turn: 1,
    });
    expect(validatePlay(state, 1, ['S3-0']).error).toBe('must-follow');
    expect(validatePlay(state, 1, ['H5-0']).ok).toBe(true);
  });

  it('allows a discard when void in the led suit', () => {
    const state = playState([H('H10-0'), H('S3-0', 'C4-0'), H(), H()], {
      currentTrick: [{ seat: 0 as const, cards: H('H10-0') }],
      turn: 1,
    });
    expect(validatePlay(state, 1, ['S3-0']).ok).toBe(true);
  });

  it('does not let a level card count as its plain suit', () => {
    const state = playState([H('H10-0'), H('H2-0', 'H5-0'), H(), H()], {
      currentTrick: [{ seat: 0 as const, cards: H('H10-0') }],
      turn: 1,
    });
    expect(validatePlay(state, 1, ['H2-0']).error).toBe('must-follow');
    expect(validatePlay(state, 1, ['H5-0']).ok).toBe(true);
  });

  it('requires a pair when the follower has a pair', () => {
    const state = playState([H('H10-0', 'H10-1'), H('H5-0', 'H5-1', 'H6-0'), H(), H()], {
      currentTrick: [{ seat: 0 as const, cards: H('H10-0', 'H10-1') }],
      turn: 1,
    });
    expect(validatePlay(state, 1, ['H5-0', 'H6-0']).error).toBe('shape-mismatch');
    expect(validatePlay(state, 1, ['H5-0', 'H5-1']).ok).toBe(true);
  });

  it('requires a same-length tractor when the follower has one', () => {
    const state = playState([
      H('H7-0', 'H7-1', 'H8-0', 'H8-1'),
      H('H5-0', 'H5-1', 'H6-0', 'H6-1', 'H9-0'),
      H(),
      H(),
    ], {
      currentTrick: [{ seat: 0 as const, cards: H('H7-0', 'H7-1', 'H8-0', 'H8-1') }],
      turn: 1,
    });
    expect(validatePlay(state, 1, ['H5-0', 'H5-1', 'H6-0', 'H9-0']).error).toBe('shape-mismatch');
    expect(validatePlay(state, 1, ['H5-0', 'H5-1', 'H6-0', 'H6-1']).ok).toBe(true);
  });

  it('matches the pair count of a throw when possible', () => {
    const state = playState([
      H('H5-0', 'H5-1', 'H7-0'),
      H('H8-0', 'H8-1', 'H9-0', 'H6-0'),
      H(),
      H(),
    ], {
      currentTrick: [{ seat: 0 as const, cards: H('H5-0', 'H5-1', 'H7-0') }],
      turn: 1,
    });
    expect(validatePlay(state, 1, ['H8-0', 'H9-0', 'H6-0']).error).toBe('shape-mismatch');
    expect(validatePlay(state, 1, ['H8-0', 'H8-1', 'H9-0']).ok).toBe(true);
  });

  it('offers only legal cards when following a single', () => {
    const state = playState([H('H10-0'), H('H5-0', 'S3-0'), H(), H()], {
      currentTrick: [{ seat: 0 as const, cards: H('H10-0') }],
      turn: 1,
    });
    const moves = legalMoves(state, 1);
    expect(moves).toHaveLength(1);
    expect(moves[0].map((card) => card.id)).toEqual(['H5-0']);
  });
});

describe('declarations', () => {
  it('offers a single or pair of the team level card', () => {
    const state = declareState([H('S2-0', 'S2-1', 'H5-0'), H(), H(), H()]);
    const options = declarationOptions(state, 0);
    expect(options.some((option) => option.kind === 'suit' && option.suit === 'S' && option.strength === 1)).toBe(true);
    expect(options.some((option) => option.kind === 'suit' && option.suit === 'S' && option.strength === 2)).toBe(true);
  });

  it('offers no-trump only with a pair of identical jokers', () => {
    const pairState = declareState([H('JBJ-0', 'JBJ-1'), H(), H(), H()]);
    expect(declarationOptions(pairState, 0).some((option) => option.kind === 'nt')).toBe(true);
    const mixedState = declareState([H('JBJ-0', 'JSJ-0'), H(), H(), H()]);
    expect(declarationOptions(mixedState, 0).some((option) => option.kind === 'nt')).toBe(false);
  });

  it('does not allow a declaration without a level card', () => {
    const state = declareState([H('SA-0', 'SK-0'), H(), H(), H()]);
    expect(declarationOptions(state, 0)).toHaveLength(0);
    const result = declare(state, 0, { kind: 'suit', suit: 'S', strength: 1, cards: ['SA-0'] });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('bad-bid');
  });

  it('lets a pair overcall a single but not an equal single', () => {
    const declaration = {
      seat: 0 as Seat,
      kind: 'suit' as const,
      suit: 'S' as const,
      strength: 1 as const,
      cards: ['S2-0'],
    };
    const state = declareState([H(), H('S2-0', 'S2-1'), H(), H()], {
      declaration,
      declarations: [declaration],
      declarationActions: 1,
      declareTurn: 1,
    });
    const options = declarationOptions(state, 1);
    const single = options.find((option) => option.strength === 1);
    const pair = options.find((option) => option.strength === 2);
    expect(single).toBeTruthy();
    expect(pair).toBeTruthy();
    expect(declare(state, 1, single!).error).toBe('bid-too-low');
    expect(declare(state, 1, pair!).ok).toBe(true);
  });

  it('finalises the declarer, adds the bottom and opens the bury', () => {
    const hand = H('S2-0', 'SA-0', 'SK-0', 'SQ-0', 'SJ-0', 'H5-0', 'H6-0', 'H7-0');
    const state = declareState([hand, H(), H(), H()], {
      declarationActions: 3,
      declareTurn: 0,
    });
    const option = declarationOptions(state, 0).find((item) => item.strength === 1);
    expect(option).toBeTruthy();
    const result = declare(state, 0, option!);
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('bury');
    expect(result.state.declarer).toBe(0);
    expect(result.state.trump).toBe('S');
    expect(result.state.levelRank).toBe('2');
    expect(result.state.hands[0]).toHaveLength(16);
    expect(result.state.turn).toBe(0);
  });

  it('redeals when all four seats pass', () => {
    let state = declareState([H('SA-0'), H('SK-0'), H('SQ-0'), H('SJ-0')]);
    const before = state.deal;
    const seededRng = seeded(77);
    for (let seat = 0; seat < 4; seat += 1) {
      const result = passDeclaration(state, seat, seededRng);
      expect(result.ok).toBe(true);
      state = result.state;
    }
    expect(state.deal).toBe(before + 1);
    expect(state.phase).toBe('declare');
    expect(state.levels).toEqual([0, 0]);
  });

  it('rejects an illegal declaration object', () => {
    const state = declareState([H('S2-0'), H(), H(), H()]);
    const result = declare(state, 0, { kind: 'suit', suit: 'H', strength: 2, cards: ['H2-0'] });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('bad-bid');
  });
});

describe('bury and views', () => {
  function buryState(): GameState {
    const hand = [
      ...H('S2-0', 'SA-0', 'SK-0', 'SQ-0', 'SJ-0', 'H5-0', 'H6-0'),
      ...DECK.filter((card) => !['S2-0', 'SA-0', 'SK-0', 'SQ-0', 'SJ-0', 'H5-0', 'H6-0'].includes(card.id)).slice(0, 26),
    ];
    return declareState([hand, H(), H(), H()], {
      phase: 'bury',
      declarer: 0,
      declarationActions: 4,
      declaration: {
        seat: 0,
        kind: 'suit',
        suit: 'S',
        strength: 1,
        cards: ['S2-0'],
      },
      declarations: [
        { seat: 0, kind: 'suit', suit: 'S', strength: 1, cards: ['S2-0'] },
      ],
      trump: 'S',
      levelRank: '2',
      declareTurn: -1,
      turn: 0,
    });
  }

  it('requires exactly eight unique cards from the declarer', () => {
    const state = buryState();
    expect(state.hands[0]).toHaveLength(33);
    expect(bury(state, 0, state.hands[0].slice(0, 7).map((card) => card.id)).error).toBe('bad-bury');
    expect(bury(state, 1, state.hands[0].slice(0, 8).map((card) => card.id)).error).toBe('not-declarer');
    const result = bury(state, 0, state.hands[0].slice(0, 8).map((card) => card.id));
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('play');
    expect(result.state.hands[0]).toHaveLength(25);
    expect(result.state.buried).toHaveLength(8);
    expect(result.state.turn).toBe(0);
  });

  it('keeps other hands and buried cards out of a seat view', () => {
    const state = buryState();
    const ownIds = new Set(state.hands[0].map((card) => card.id));
    state.hands[1] = DECK.filter((card) => !ownIds.has(card.id)).slice(0, 25);
    const own = view(state, 0, ['@p1', '@p2', '@p3', '@p4']);
    const other = view(state, 1, ['@p1', '@p2', '@p3', '@p4']);
    expect(own.hand).toHaveLength(33);
    expect(other.hand).toHaveLength(25);
    expect(own.buried).toHaveLength(0);
    expect(other.buried).toBeNull();
    expect(own.names).toHaveLength(4);
    const ownHandIds = new Set(own.hand.map((card) => card.id));
    expect(other.hand.some((card) => ownHandIds.has(card.id))).toBe(false);
  });

  it('hides the buried cards from opponents after the bury', () => {
    const state = buryState();
    const buried = state.hands[0].slice(0, 8).map((card) => card.id);
    const result = bury(state, 0, buried);
    expect(result.ok).toBe(true);
    expect(view(result.state, 0).buried?.length).toBe(8);
    expect(view(result.state, 1).buried).toBeNull();
    expect(view(result.state, 1).pointsAvailable).toBeNull();
  });
});

describe('scoring and match', () => {
  function finished(points: [number, number], levels: [number, number], buried: Card[] = []): GameState {
    return finishDeal({
      ...playState([H(), H(), H(), H()], {
        points,
        levels,
        buried,
        declarer: 0,
        trump: 'S',
        levelRank: '2',
      }),
    });
  }

  it('upgrades the declarers at 80 points', () => {
    const state = finished([80, 20], [0, 0]);
    expect(state.phase).toBe('deal-over');
    expect(state.lastResult?.success).toBe(true);
    expect(state.levels).toEqual([1, 0]);
    expect(state.matchWinner).toBeNull();
  });

  it('holds the declarers at 40–79 with no level change', () => {
    const state = finished([40, 60], [3, 3]);
    expect(state.lastResult?.success).toBe(false);
    expect(state.lastResult?.reason).toBe('held');
    expect(state.levels).toEqual([3, 3]);
  });

  it('gives the defenders one level below 40', () => {
    const state = finished([39, 61], [3, 3]);
    expect(state.lastResult?.reason).toBe('defenders');
    expect(state.levels).toEqual([3, 4]);
  });

  it('gives the defenders a three-level jump on a shutout', () => {
    const state = finished([0, 100], [3, 3]);
    expect(state.lastResult?.reason).toBe('shutout');
    expect(state.lastResult?.jump).toBe(3);
    expect(state.levels).toEqual([3, 6]);
  });

  it('wins the match by making a deal at A', () => {
    const state = finished([80, 20], [12, 5]);
    expect(state.matchWinner).toBe(0);
    expect(state.levels).toEqual([12, 5]);
  });

  it('does not drop a team that fails at A', () => {
    const state = finished([40, 60], [12, 5]);
    expect(state.matchWinner).toBeNull();
    expect(state.levels).toEqual([12, 5]);
  });

  it('removes buried point cards from the available total', () => {
    const state = finished([70, 5], [0, 0], H('H5-0', 'H10-0', 'HK-0', 'C3-0', 'C4-0', 'D6-0', 'D7-0', 'D8-0'));
    expect(state.lastResult?.buriedPoints).toBe(25);
    expect(state.lastResult?.availablePoints).toBe(75);
  });

  it('rotates the dealer and keeps levels between deals', () => {
    const done = finished([80, 20], [4, 6]);
    const result = nextDeal(done, seeded(5));
    expect(result.ok).toBe(true);
    expect(result.state.dealer).toBe(0);
    expect(result.state.levels).toEqual([5, 6]);
    expect(result.state.deal).toBe(done.deal + 1);
    expect(result.state.phase).toBe('declare');
  });
});

describe('play and trick flow', () => {
  it('plays a card, advances the turn and collects trick points', () => {
    const state = playState([
      H('HK-0', 'H10-1', 'S3-0', 'S4-0'),
      H('H5-0', 'H5-1', 'S5-0', 'S6-0'),
      H('H10-0', 'H6-1', 'S7-0', 'S8-0'),
      H('H7-0', 'H7-1', 'S9-0', 'S10-0'),
    ], {
      currentTrick: [
        { seat: 0 as const, cards: H('HK-0') },
        { seat: 1 as const, cards: H('H5-0') },
        { seat: 2 as const, cards: H('H10-0') },
      ],
      turn: 3,
    });
    const result = play(state, 3, ['H7-0']);
    expect(result.ok).toBe(true);
    expect(result.state.tricks).toHaveLength(1);
    expect(result.state.points[0]).toBe(25);
    expect(result.state.turn).toBe(0);
    expect(result.state.currentTrick).toHaveLength(0);
  });

  it('rejects a card that is not in the hand', () => {
    const state = playState([H('S3-0'), H(), H(), H()]);
    expect(play(state, 0, ['SA-0']).error).toBe('not-your-card');
  });

  it('offers a tractor in legal leads', () => {
    const state = playState([
      H('SA-0', 'SK-0', 'SA-1', 'SK-1', 'H5-0'),
      H(), H(), H(),
    ]);
    const moves = legalMoves(state, 0);
    expect(moves.some((cards) => cards.length === 4 && isTractor(cards, 'S', '2'))).toBe(true);
  });
});

describe('AI levels', () => {
  const levels: AiLevel[] = ['companion', 'easy', 'normal', 'hard'];

  it('declares a strong trump suit', () => {
    const state = declareState([
      H('S2-0', 'S2-1', 'SA-0', 'SK-0', 'SQ-0', 'SJ-0', 'H5-0', 'H5-1'),
      H(), H(), H(),
    ]);
    const choice = chooseDeclaration(state, 0, 'hard', seeded(3));
    expect(choice.type).toBe('declare');
    if (choice.type === 'declare') {
      expect(choice.option.kind).toBe('suit');
      expect(choice.option.suit).toBe('S');
    }
  });

  it('keeps the big joker and point cards out of the bury', () => {
    const hand = [
      C('JBJ-0'),
      ...H('S2-0', 'S2-1', 'H5-0', 'H10-0', 'HK-0', 'H6-0', 'H7-0'),
      ...DECK.filter((card) => !['JBJ-0', 'S2-0', 'S2-1', 'H5-0', 'H10-0', 'HK-0', 'H6-0', 'H7-0'].includes(card.id)).slice(0, 25),
    ];
    const state = playState([hand, H(), H(), H()], {
      phase: 'bury',
      declarer: 0,
      turn: 0,
      declareTurn: -1,
      trump: 'S',
      levelRank: '2',
    });
    expect(state.hands[0]).toHaveLength(33);
    const cards = chooseBury(state, 0, 'hard', seeded(8));
    expect(cards).toHaveLength(8);
    expect(new Set(cards).size).toBe(8);
    expect(cards).not.toContain('JBJ-0');
    const buried = state.hands[0].filter((card) => cards.includes(card.id));
    expect(buried.reduce((sum, card) => sum + pointValue(card), 0)).toBeLessThan(20);
  });

  it('returns a legal play at every level', () => {
    for (const level of levels) {
      const state = playState([
        H('H10-0', 'H9-0', 'S3-0', 'S4-0'),
        H('H5-0', 'H6-0', 'S5-0', 'S6-0'),
        H('H7-0', 'H8-0', 'S7-0', 'S8-0'),
        H('H4-0', 'H3-0', 'S9-0', 'S10-0'),
      ], {
        currentTrick: [{ seat: 0 as const, cards: H('H10-0') }],
        turn: 1,
      });
      const cards = choosePlay(state, 1, level, seeded(12));
      expect(cards).not.toBeNull();
      expect(validatePlay(state, 1, cards!).ok).toBe(true);
    }
  });

  it('does not overtake a winning partner on an empty table', () => {
    const state = playState([
      H('H7-0', 'S3-0'),
      H('H6-0', 'S4-0'),
      H('H8-0', 'H3-0'),
      H('H4-0', 'S5-0'),
    ], {
      currentTrick: [
        { seat: 0 as const, cards: H('H7-0') },
        { seat: 1 as const, cards: H('H6-0') },
      ],
      turn: 2,
    });
    const cards = choosePlay(state, 2, 'normal', seeded(5));
    expect(cards).toEqual(['H3-0']);
  });

  it('gives a legal, reasoned hint', () => {
    const state = playState([
      H('H10-0', 'H9-0', 'S3-0', 'S4-0'),
      H('H5-0', 'H6-0', 'S5-0', 'S6-0'),
      H('H7-0', 'H8-0', 'S7-0', 'S8-0'),
      H('H4-0', 'H3-0', 'S9-0', 'S10-0'),
    ], {
      currentTrick: [{ seat: 0 as const, cards: H('H10-0') }],
      turn: 1,
    });
    const hint = hintFor(state, 1);
    expect(hint?.type).toBe('play');
    expect(hint?.reason).toBeTruthy();
    expect(validatePlay(state, 1, hint!.cards).ok).toBe(true);
  });

  it('plays a complete deal to a scored result', () => {
    let state = setup({ rng: seeded(2026), dealer: 3 });
    let guard = 0;
    const rng = seeded(404);
    while (state.phase !== 'deal-over' && guard < 400) {
      guard += 1;
      if (state.phase === 'declare') {
        const seat = state.declareTurn;
        if (seat === -1) break;
        const choice = chooseDeclaration(state, seat, 'hard', rng);
        const result = choice.type === 'declare'
          ? declare(state, seat, choice.option)
          : passDeclaration(state, seat, rng);
        expect(result.ok).toBe(true);
        state = result.state;
      } else if (state.phase === 'bury') {
        const seat = state.declarer;
        if (seat === null) break;
        const cards = chooseBury(state, seat, 'hard', rng);
        const result = bury(state, seat, cards);
        expect(result.ok).toBe(true);
        state = result.state;
      } else if (state.phase === 'play') {
        const seat = state.turn;
        if (seat === -1) break;
        const cards = choosePlay(state, seat, 'normal', rng);
        expect(cards).not.toBeNull();
        const result = play(state, seat, cards!);
        expect(result.ok).toBe(true);
        state = result.state;
      }
    }
    expect(state.phase).toBe('deal-over');
    expect(state.hands.every((hand) => hand.length === 0)).toBe(true);
    expect(state.tricks.length).toBeGreaterThan(0);
    expect(state.lastResult).toBeTruthy();
    const total = state.points[0] + state.points[1];
    expect(total).toBe(100 - (state.lastResult?.buriedPoints ?? 0));
  });
});

describe('rule audit helpers', () => {
  it('analyses singles, pairs, tractors and throws', () => {
    expect(analyzeCards(H('SA-0'), 'S', '2')?.kind).toBe('single');
    expect(analyzeCards(H('SA-0', 'SA-1'), 'S', '2')?.kind).toBe('pair');
    expect(analyzeCards(H('SA-0', 'SK-0', 'SA-1', 'SK-1'), 'S', '2')?.kind).toBe('tractor');
    expect(analyzeCards(H('HA-0', 'HK-0'), 'S', '2')?.kind).toBe('throw');
  });

  it('reports a throw pair need and tractor lengths', () => {
    const shape = analyzeCards(H('H5-0', 'H6-0', 'H5-1', 'H6-1', 'H9-0'), 'S', '2');
    expect(shape?.kind).toBe('throw');
    expect(shape?.pairNeed).toBe(2);
    expect(shape?.tractorLengths).toEqual([4]);
  });
});
