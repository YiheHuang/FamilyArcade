import { describe, expect, it } from 'vitest';
import { chooseAiAction } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import {
  BIG_JOKER,
  DECK,
  SMALL_JOKER,
  applySeat,
  beginRound,
  bestCombo,
  buildTribute,
  cardPower,
  chooseReturnCard,
  comboBeats,
  detectCombos,
  isWild,
  legalPlays,
  nextRound,
  pass,
  play,
  powerRank,
  setup,
  sortHand,
  view,
  type Card,
  type Combo,
  type GameState,
  type Rng,
  type Suit,
} from '../src/game/guandan';

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

function card(rank: number, suit: Suit, deck = 0): Card {
  const found = DECK.find(
    (item) => item.rank === rank && item.suit === suit && item.deck === deck,
  );
  if (!found) throw new Error(`missing card ${suit}${rank}-${deck}`);
  return found;
}

function joker(rank: number, deck = 0): Card {
  return card(rank, 'J', deck);
}

function stateWith(hands: Card[][], overrides: Partial<GameState> = {}): GameState {
  const level = overrides.levelRank ?? 2;
  const base = setup({
    rng: seeded(11),
    level,
    levels: overrides.levels ?? [level, level],
    hands,
    starter: overrides.starter ?? 0,
  });
  const merged: GameState = { ...base, ...overrides };
  merged.hands = base.hands.map((hand) => sortHand(hand, merged.levelRank));
  if (!overrides.passed) merged.passed = [false, false, false, false];
  return merged;
}

function comboOf(cards: Card[], level = 2, type?: string): Combo {
  const combos = detectCombos(cards, level);
  const found = type ? combos.find((item) => item.type === type) : combos[0];
  if (!found) throw new Error(`no combo ${type ?? ''}`);
  return found;
}

describe('Guandan deck and deal', () => {
  it('has 108 unique cards: two decks and four jokers', () => {
    expect(DECK).toHaveLength(108);
    expect(new Set(DECK.map((item) => item.id)).size).toBe(108);
    expect(DECK.filter((item) => item.rank === SMALL_JOKER)).toHaveLength(2);
    expect(DECK.filter((item) => item.rank === BIG_JOKER)).toHaveLength(2);
    expect(DECK.filter((item) => item.suit === 'H' && item.rank === 5)).toHaveLength(2);
  });

  it('deals 27 cards to each of four seats, deterministically', () => {
    const first = setup(seeded(42));
    const second = setup(seeded(42));
    expect(first.hands.map((hand) => hand.length)).toEqual([27, 27, 27, 27]);
    expect(new Set(first.hands.flat().map((item) => item.id)).size).toBe(108);
    expect(second.hands.map((hand) => hand.map((item) => item.id))).toEqual(
      first.hands.map((hand) => hand.map((item) => item.id)),
    );
  });

  it('puts the level card just below the jokers', () => {
    expect(powerRank(5, 5)).toBe(15);
    expect(powerRank(14, 5)).toBe(14);
    expect(powerRank(SMALL_JOKER, 5)).toBe(16);
    expect(powerRank(BIG_JOKER, 5)).toBe(17);
    expect(powerRank(2, 2)).toBe(15);
    expect(cardPower(card(14, 'S'), 2)).toBe(14);
  });

  it('marks exactly the heart level cards as wild', () => {
    expect(isWild(card(5, 'H', 0), 5)).toBe(true);
    expect(isWild(card(5, 'H', 1), 5)).toBe(true);
    expect(isWild(card(5, 'S', 0), 5)).toBe(false);
    expect(isWild(card(6, 'H', 0), 5)).toBe(false);
  });
});

describe('Combination detection', () => {
  it('detects singles, pairs and triples, including joker pairs', () => {
    expect(comboOf([card(7, 'S')]).type).toBe('single');
    expect(comboOf([card(7, 'S'), card(7, 'D')]).type).toBe('pair');
    expect(comboOf([card(7, 'S'), card(7, 'D'), card(7, 'C')]).type).toBe('triple');
    const jokerPair = comboOf([joker(SMALL_JOKER, 0), joker(SMALL_JOKER, 1)]);
    expect(jokerPair).toMatchObject({ type: 'pair', rank: 16 });
    expect(detectCombos([joker(SMALL_JOKER), joker(BIG_JOKER)], 2).some((item) => item.type === 'pair')).toBe(false);
  });

  it('makes a level pair beat a pair of aces', () => {
    const levelPair = comboOf([card(5, 'S'), card(5, 'D')], 5);
    const acePair = comboOf([card(14, 'S'), card(14, 'D')], 5);
    expect(levelPair.rank).toBe(15);
    expect(acePair.rank).toBe(14);
    expect(comboBeats(levelPair, acePair)).toBe(true);
    expect(comboBeats(acePair, levelPair)).toBe(false);
  });

  it('uses a wildcard in a pair and a triple, but never as a joker', () => {
    const wild = card(5, 'H', 0);
    expect(comboOf([wild, card(7, 'S')], 5)).toMatchObject({ type: 'pair', rank: 7 });
    expect(comboOf([wild, card(5, 'S')], 5)).toMatchObject({ type: 'pair', rank: 15 });
    expect(comboOf([wild, card(7, 'S'), card(7, 'D')], 5)).toMatchObject({ type: 'triple', rank: 7 });
    expect(detectCombos([wild, card(7, 'S'), card(8, 'D')], 5)).toHaveLength(0);
    expect(detectCombos([wild, joker(SMALL_JOKER)], 5).some((item) => item.type === 'pair')).toBe(false);
  });

  it('detects a full house and a wildcard full house', () => {
    expect(comboOf([card(7, 'S'), card(7, 'D'), card(7, 'C'), card(8, 'S'), card(8, 'D')])).toMatchObject({
      type: 'full-house',
      rank: 7,
      pairRank: 8,
    });
    expect(comboOf([card(7, 'S'), card(7, 'D'), card(5, 'H', 0), card(8, 'S'), card(8, 'D')], 5)).toMatchObject({
      type: 'full-house',
      rank: 7,
    });
  });

  it('accepts A2345 and 10JQKA but not JQKA2', () => {
    expect(comboOf([card(14, 'S'), card(2, 'D'), card(3, 'C'), card(4, 'S'), card(5, 'H')])).toMatchObject({
      type: 'straight',
      rank: 1,
    });
    expect(comboOf([card(10, 'S'), card(11, 'D'), card(12, 'C'), card(13, 'S'), card(14, 'H')])).toMatchObject({
      type: 'straight',
      rank: 10,
    });
    expect(detectCombos([card(11, 'S'), card(12, 'D'), card(13, 'C'), card(14, 'S'), card(2, 'C')], 2).some((item) => item.type === 'straight')).toBe(false);
  });

  it('fills a missing straight card with the wildcard', () => {
    const straight = comboOf(
      [card(3, 'S'), card(4, 'D'), card(5, 'H', 0), card(6, 'C'), card(7, 'S')],
      5,
      'straight',
    );
    expect(straight).toMatchObject({ type: 'straight', rank: 3, high: 7 });
    expect(detectCombos([card(4, 'D'), card(5, 'H', 0), card(6, 'C'), card(7, 'S'), card(8, 'D')], 5).some((item) => item.type === 'straight' && item.rank === 4)).toBe(true);
  });

  it('detects three consecutive pairs and two consecutive triples', () => {
    expect(
      comboOf([
        card(3, 'S'), card(3, 'D'),
        card(4, 'S'), card(4, 'D'),
        card(5, 'S'), card(5, 'D'),
      ]),
    ).toMatchObject({ type: 'pair-chain', rank: 3, high: 5 });
    expect(
      comboOf([
        card(3, 'S'), card(3, 'D'), card(3, 'C'),
        card(4, 'S'), card(4, 'D'), card(4, 'C'),
      ]),
    ).toMatchObject({ type: 'triple-chain', rank: 3, high: 4 });
  });

  it('detects bombs of four through ten cards', () => {
    const sevens = DECK.filter((item) => item.rank === 7);
    expect(comboOf(sevens.slice(0, 4))).toMatchObject({ type: 'bomb', tier: 4, rank: 7 });
    expect(comboOf(sevens.slice(0, 8))).toMatchObject({ type: 'bomb', tier: 8 });
    expect(comboOf([...sevens, card(5, 'H', 0), card(5, 'H', 1)], 5)).toMatchObject({
      type: 'bomb',
      tier: 10,
    });
  });

  it('detects a straight flush and a joker bomb', () => {
    const flush = comboOf([
      card(3, 'S'), card(4, 'S'), card(5, 'S'), card(6, 'S'), card(7, 'S'),
    ], 2, 'straight-flush');
    expect(flush).toMatchObject({ type: 'straight-flush', tier: 5.5, rank: 3, suit: 'S' });
    const jokerBomb = comboOf([
      joker(SMALL_JOKER, 0), joker(SMALL_JOKER, 1),
      joker(BIG_JOKER, 0), joker(BIG_JOKER, 1),
    ]);
    expect(jokerBomb).toMatchObject({ type: 'joker-bomb', tier: 100 });
  });

  it('orders bombs: four < five < straight flush < six < … < joker bomb', () => {
    const sevens = DECK.filter((item) => item.rank === 7);
    const four = comboOf(sevens.slice(0, 4));
    const five = comboOf(sevens.slice(0, 5));
    const flush = comboOf([
      card(3, 'S'), card(4, 'S'), card(5, 'S'), card(6, 'S'), card(7, 'S'),
    ], 2, 'straight-flush');
    const six = comboOf(sevens.slice(0, 6));
    const ten = comboOf([...sevens, card(5, 'H', 0), card(5, 'H', 1)], 5);
    const jokerBomb = comboOf([
      joker(SMALL_JOKER, 0), joker(SMALL_JOKER, 1),
      joker(BIG_JOKER, 0), joker(BIG_JOKER, 1),
    ]);
    expect(comboBeats(five, four)).toBe(true);
    expect(comboBeats(flush, five)).toBe(true);
    expect(comboBeats(six, flush)).toBe(true);
    expect(comboBeats(ten, six)).toBe(true);
    expect(comboBeats(jokerBomb, ten)).toBe(true);
    expect(comboBeats(four, flush)).toBe(false);
  });

  it('lets a bomb beat a non-bomb and rejects a non-bomb against a bomb', () => {
    const bomb = comboOf(DECK.filter((item) => item.rank === 7).slice(0, 4));
    const pair = comboOf([card(14, 'S'), card(14, 'D')]);
    const straight = comboOf([
      card(10, 'S'), card(11, 'D'), card(12, 'C'), card(13, 'S'), card(14, 'H'),
    ]);
    expect(comboBeats(bomb, pair)).toBe(true);
    expect(comboBeats(bomb, straight)).toBe(true);
    expect(comboBeats(pair, bomb)).toBe(false);
    expect(comboBeats(straight, bomb)).toBe(false);
  });

  it('requires the same non-bomb type and a strictly higher rank', () => {
    const pair7 = comboOf([card(7, 'S'), card(7, 'D')]);
    const pair8 = comboOf([card(8, 'S'), card(8, 'D')]);
    const triple8 = comboOf([card(8, 'S'), card(8, 'D'), card(8, 'C')]);
    expect(comboBeats(pair8, pair7)).toBe(true);
    expect(comboBeats(pair7, pair7)).toBe(false);
    expect(comboBeats(triple8, pair7)).toBe(false);
  });

  it('prefers a straight flush when leading but can use the straight interpretation when following', () => {
    const cards = [
      card(3, 'S'), card(4, 'S'), card(5, 'S'), card(6, 'S'), card(7, 'S'),
    ];
    const leading = bestCombo(cards, 2, null);
    expect(leading?.type).toBe('straight-flush');
    const previous = comboOf([
      card(2, 'S'), card(3, 'D'), card(4, 'C'), card(5, 'H'), card(6, 'D'),
    ], 2, 'straight');
    const following = bestCombo(cards, 2, previous);
    expect(following?.type).toBe('straight');
  });
});

describe('Turn engine', () => {
  it('rejects wrong turns, foreign cards, duplicate cards, empty plays and mixed sets', () => {
    const state = stateWith([
      [card(3, 'S'), card(4, 'S')],
      [card(5, 'S')],
      [card(6, 'S')],
      [card(7, 'S')],
    ]);
    expect(play(state, 1, [card(5, 'S').id]).error).toBe('wrong-turn');
    expect(play(state, 0, [card(9, 'S').id]).error).toBe('not-your-card');
    expect(play(state, 0, [card(3, 'S').id, card(3, 'S').id]).error).toBe('duplicate-card');
    expect(play(state, 0, []).error).toBe('empty');
    expect(play(state, 0, [card(3, 'S').id, card(4, 'S').id]).error).toBe('invalid-combo');
  });

  it('requires a follower to match the type and beat the rank', () => {
    const state = stateWith([
      [card(7, 'S'), card(3, 'S')],
      [card(8, 'S'), card(6, 'S')],
      [card(9, 'S')],
      [card(10, 'S')],
    ]);
    const afterLead = play(state, 0, [card(7, 'S').id]);
    expect(afterLead.ok).toBe(true);
    expect(play(afterLead.state, 1, [card(6, 'S').id]).error).toBe('does-not-beat');
    expect(play(afterLead.state, 1, [card(8, 'S').id]).ok).toBe(true);
  });

  it('resets a trick after three passes to the last player', () => {
    const state = stateWith([
      [card(3, 'S'), card(9, 'S')],
      [card(4, 'S')],
      [card(5, 'S')],
      [card(6, 'S')],
    ]);
    let current = play(state, 0, [card(3, 'S').id]).state;
    expect(current.turn).toBe(1);
    current = pass(current, 1).state;
    current = pass(current, 2).state;
    current = pass(current, 3).state;
    expect(current.trick).toBeNull();
    expect(current.turn).toBe(0);
    expect(current.passed).toEqual([false, false, false, false]);
  });

  it('gives the lead to the finishing player’s partner when everyone passes', () => {
    const state = stateWith([
      [card(3, 'S')],
      [card(4, 'S'), card(8, 'S')],
      [card(5, 'S')],
      [card(6, 'S')],
    ]);
    let current = play(state, 0, [card(3, 'S').id]).state;
    expect(current.finish).toEqual([0]);
    current = pass(current, 1).state;
    current = pass(current, 2).state;
    current = pass(current, 3).state;
    expect(current.trick).toBeNull();
    expect(current.turn).toBe(2);
  });

  it('skips a finished player when advancing the turn', () => {
    const state = stateWith([
      [card(3, 'S'), card(9, 'S')],
      [],
      [card(5, 'S'), card(8, 'S')],
      [card(6, 'S')],
    ], { finish: [1], turn: 2 });
    const result = play(state, 2, [card(5, 'S').id]);
    expect(result.ok).toBe(true);
    expect(result.state.turn).toBe(3);
  });

  it('finds legal plays only from the current hand', () => {
    const state = setup(seeded(23));
    const plays = legalPlays(state, 0);
    expect(plays.length).toBeGreaterThan(0);
    const hand = new Set(state.hands[0].map((item) => item.id));
    for (const combo of plays.slice(0, 20)) {
      expect(combo.cards.every((item) => hand.has(item.id))).toBe(true);
      expect(bestCombo(combo.cards, state.levelRank, null)).not.toBeNull();
    }
  });
});

describe('Finish order, levels and match', () => {
  function endgame(
    finish: number[],
    hands: Card[][],
    turn: number,
    levels: [number, number] = [2, 2],
  ): GameState {
    return stateWith(hands, {
      finish,
      turn,
      levels,
      levelRank: levels[0],
      phase: 'playing',
      order: null,
    });
  }

  it('scores partners first and second as +3', () => {
    const state = endgame(
      [0, 2],
      [[], [card(4, 'S')], [], [card(5, 'S')]],
      1,
    );
    const result = play(state, 1, [card(4, 'S').id]);
    expect(result.ok).toBe(true);
    expect(result.state.result?.order).toEqual([0, 2, 1, 3]);
    expect(result.state.result?.gain).toBe(3);
    expect(result.state.phase).toBe('round-over');
  });

  it('scores partners first and third as +2', () => {
    const state = endgame(
      [0, 1],
      [[], [], [card(5, 'S')], [card(6, 'S')]],
      2,
    );
    const result = play(state, 2, [card(5, 'S').id]);
    expect(result.state.result?.order).toEqual([0, 1, 2, 3]);
    expect(result.state.result?.gain).toBe(2);
  });

  it('scores partners first and fourth as +1', () => {
    const state = endgame(
      [0, 1],
      [[], [], [card(5, 'S')], [card(6, 'S')]],
      3,
    );
    const result = play(state, 3, [card(6, 'S').id]);
    expect(result.state.result?.order).toEqual([0, 1, 3, 2]);
    expect(result.state.result?.gain).toBe(1);
  });

  it('promotes the winning team, caps at A, and then wins the match at A', () => {
    const state = endgame(
      [0, 1],
      [[], [], [card(5, 'S')], [card(6, 'S')]],
      3,
      [13, 5],
    );
    const first = play(state, 3, [card(6, 'S').id]).state;
    expect(first.result?.levelsAfter).toEqual([14, 5]);
    expect(first.matchWinner).toBeNull();
    expect(first.phase).toBe('round-over');
    expect(first.result?.nextLevel).toBe(14);

    const atA = endgame(
      [0, 1],
      [[], [], [card(5, 'S')], [card(6, 'S')]],
      3,
      [14, 5],
    );
    const won = play(atA, 3, [card(6, 'S').id]).state;
    expect(won.matchWinner).toBe(0);
    expect(won.phase).toBe('match-over');
  });

  it('makes the winner’s new level the next level card', () => {
    const state = endgame(
      [0, 1],
      [[], [], [card(5, 'S')], [card(6, 'S')]],
      3,
      [5, 9],
    );
    const over = play(state, 3, [card(6, 'S').id]).state;
    const next = nextRound(over, seeded(99));
    expect(next.ok).toBe(true);
    expect(next.state.levelRank).toBe(6);
    expect(next.state.round).toBe(2);
    expect(next.state.hands.map((hand) => hand.length)).toEqual([27, 27, 27, 27]);
    if (next.state.phase === 'tribute') {
      const begun = beginRound(next.state);
      expect(begun.phase).toBe('playing');
    }
  });
});

describe('Tribute and anti-tribute', () => {
  it('runs a double tribute: both losers give their highest card and get one back', () => {
    const level = 5;
    const hands: Card[][] = [
      [card(3, 'S'), card(4, 'S')],
      [card(6, 'S'), card(7, 'S')],
      [card(13, 'S'), card(9, 'S')],
      [card(14, 'S'), card(5, 'H', 0)],
    ];
    const before = hands.map((hand) => hand.map((item) => item.id));
    const result = {
      order: [0, 1, 2, 3],
      winnerTeam: 0 as const,
      gain: 3,
      levelsBefore: [level, 2] as [number, number],
      levelsAfter: [level + 3, 2] as [number, number],
      matchWinner: null,
      nextLevel: level + 3,
    };
    const summary = buildTribute(hands, result, level);
    expect(summary.kind).toBe('double');
    expect(summary.moves).toHaveLength(2);
    expect(summary.moves[0].card.rank).toBe(14);
    expect(summary.moves[0].card.suit).not.toBe('H');
    expect(summary.moves[1].card.rank).toBe(13);
    expect(summary.leader).toBe(0);
    const after = hands.map((hand) => hand.map((item) => item.id));
    expect(after.map((hand) => hand.length)).toEqual([2, 2, 2, 2]);
    expect(before).not.toEqual(after);
  });

  it('runs a single tribute for a +2 round', () => {
    const hands: Card[][] = [
      [card(3, 'S'), card(4, 'S')],
      [card(6, 'S'), card(7, 'S')],
      [card(10, 'S'), card(9, 'S')],
      [card(14, 'S'), card(11, 'S')],
    ];
    const result = {
      order: [0, 1, 2, 3],
      winnerTeam: 0 as const,
      gain: 2,
      levelsBefore: [2, 2] as [number, number],
      levelsAfter: [4, 2] as [number, number],
      matchWinner: null,
      nextLevel: 4,
    };
    const summary = buildTribute(hands, result, 2);
    expect(summary.kind).toBe('single');
    expect(summary.moves).toHaveLength(1);
    expect(summary.moves[0].from).toBe(3);
    expect(summary.moves[0].to).toBe(0);
    expect(summary.moves[0].card.rank).toBe(14);
  });

  it('allows anti-tribute when the paying side holds both big jokers', () => {
    const hands: Card[][] = [
      [card(3, 'S')],
      [card(4, 'S')],
      [joker(BIG_JOKER, 1), card(9, 'S')],
      [joker(BIG_JOKER, 0), card(14, 'S')],
    ];
    const result = {
      order: [0, 1, 2, 3],
      winnerTeam: 0 as const,
      gain: 3,
      levelsBefore: [2, 2] as [number, number],
      levelsAfter: [5, 2] as [number, number],
      matchWinner: null,
      nextLevel: 5,
    };
    const summary = buildTribute(hands, result, 5);
    expect(summary.kind).toBe('anti');
    expect(summary.moves).toHaveLength(0);
    expect(summary.leader).toBe(3);
    expect(hands[2].map((item) => item.rank)).toContain(BIG_JOKER);
    expect(hands[3].map((item) => item.rank)).toContain(BIG_JOKER);
  });

  it('returns a low singleton instead of breaking a pair or giving a wildcard', () => {
    const hand = [
      card(14, 'S'),
      card(13, 'S'),
      card(13, 'D'),
      card(5, 'H', 0),
      joker(BIG_JOKER, 0),
    ];
    const returned = chooseReturnCard(hand, 5);
    expect(returned.rank).toBe(14);
    expect(isWild(returned, 5)).toBe(false);
    expect(returned.rank).not.toBe(BIG_JOKER);
  });

  it('skips tribute when the last player is on the winning team', () => {
    const hands: Card[][] = [[card(3, 'S')], [card(4, 'S')], [card(5, 'S')], [card(6, 'S')]];
    const result = {
      order: [0, 1, 3, 2],
      winnerTeam: 0 as const,
      gain: 1,
      levelsBefore: [2, 2] as [number, number],
      levelsAfter: [3, 2] as [number, number],
      matchWinner: null,
      nextLevel: 3,
    };
    const summary = buildTribute(hands, result, 3);
    expect(summary.kind).toBe('none');
    expect(summary.moves).toHaveLength(0);
    expect(summary.leader).toBe(0);
  });
});

describe('Privacy and immutability', () => {
  it('shows only the requested hand and public table data', () => {
    const state = stateWith([
      [card(3, 'S'), card(4, 'S')],
      [card(5, 'S'), card(6, 'S')],
      [card(7, 'S'), card(8, 'S')],
      [card(9, 'S'), card(10, 'S')],
    ]);
    const seatView = view(state, 1);
    expect(seatView.hand.map((item) => item.id).sort()).toEqual(
      [card(5, 'S').id, card(6, 'S').id].sort(),
    );
    expect('hands' in seatView).toBe(false);
    const serialized = JSON.stringify(seatView);
    expect(serialized).not.toContain(card(3, 'S').id);
    expect(serialized).not.toContain(card(9, 'S').id);
  });

  it('never mutates the previous state on a play or pass', () => {
    const state = stateWith([
      [card(3, 'S'), card(4, 'S')],
      [card(5, 'S')],
      [card(6, 'S')],
      [card(7, 'S')],
    ]);
    const snapshot = JSON.stringify(state);
    const result = play(state, 0, [card(3, 'S').id]);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(state)).toBe(snapshot);
    const trick = play(
      stateWith([
        [card(3, 'S'), card(9, 'S')],
        [card(4, 'S')],
        [card(5, 'S')],
        [card(6, 'S')],
      ]),
      0,
      [card(3, 'S').id],
    ).state;
    const passSnapshot = JSON.stringify(trick);
    expect(pass(trick, 1).ok).toBe(true);
    expect(JSON.stringify(trick)).toBe(passSnapshot);
  });
});

describe('AI and hints', () => {
  it('returns legal actions at every level and is deterministic with an RNG', () => {
    const state = setup(seeded(7));
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const action = chooseAiAction(state, 0, level, seeded(5));
      expect(action).not.toBeNull();
      if (action) expect(applySeat(state, 0, action).ok).toBe(true);
    }
    const first = chooseAiAction(state, 0, 'normal', seeded(123));
    const second = chooseAiAction(state, 0, 'normal', seeded(123));
    expect(second).toEqual(first);
  });

  it('lets a partner keep the trick instead of overtaking', () => {
    const ten = card(10, 'S');
    const state = stateWith([
      [card(14, 'S'), card(3, 'S')],
      [card(4, 'S')],
      [card(11, 'S')],
      [card(5, 'S')],
    ], {
      turn: 0,
      trick: { seat: 2, combo: comboOf([ten]), cards: [ten] },
    });
    const action = chooseAiAction(state, 0, 'companion', seeded(1));
    expect(action).toEqual({ type: 'pass' });
  });

  it('does not spend a bomb on an early lead when a low card is enough', () => {
    const sevens = DECK.filter((item) => item.rank === 7);
    const state = stateWith([
      [...sevens.slice(0, 4), card(3, 'S'), card(3, 'D')],
      [card(4, 'S'), card(5, 'S')],
      [card(6, 'S'), card(8, 'S')],
      [card(9, 'S'), card(10, 'S')],
    ]);
    const action = chooseAiAction(state, 0, 'hard', seeded(9));
    expect(action).not.toBeNull();
    if (action && action.type === 'play') {
      const result = play(state, 0, action.cards);
      expect(result.ok).toBe(true);
      expect(result.state.last?.combo?.bomb).not.toBe(true);
    }
  });

  it('uses a wildcard to finish a hand', () => {
    const state = stateWith([
      [card(5, 'H', 0), card(7, 'S')],
      [card(4, 'S')],
      [card(6, 'S')],
      [card(8, 'S')],
    ], { levelRank: 5, levels: [5, 5] });
    const action = chooseAiAction(state, 0, 'hard', seeded(3));
    expect(action).not.toBeNull();
    if (action && action.type === 'play') {
      expect(action.cards).toHaveLength(2);
      const result = play(state, 0, action.cards);
      expect(result.ok).toBe(true);
      expect(result.state.finish).toContain(0);
    }
  });

  it('returns a reasoned legal hint', () => {
    const state = setup(seeded(31));
    const hint = hintFor(state, 0);
    expect(hint).not.toBeNull();
    if (hint) {
      expect(applySeat(state, 0, hint.action).ok).toBe(true);
      expect(['finish', 'partner', 'bomb', 'wild', 'control', 'lead', 'beat', 'pass']).toContain(hint.kind);
    }
  });

  it('plays a complete round with four AI seats', () => {
    let state = setup(seeded(2026));
    const rng = seeded(77);
    let steps = 0;
    while (state.phase === 'playing' && steps < 1600) {
      const action = chooseAiAction(state, state.turn, 'easy', rng);
      expect(action).not.toBeNull();
      if (!action) break;
      const result = applySeat(state, state.turn, action);
      expect(result.ok).toBe(true);
      state = result.state;
      steps += 1;
    }
    expect(state.phase).toBe('round-over');
    expect(state.result?.order).toHaveLength(4);
    expect(new Set(state.result?.order).size).toBe(4);
    expect(state.result?.gain).toBeGreaterThanOrEqual(1);
    expect(state.result?.gain).toBeLessThanOrEqual(3);
  });

  it('plays a complete round with four Hard seats', () => {
    let state = setup(seeded(909));
    const rng = seeded(91);
    let steps = 0;
    while (state.phase === 'playing' && steps < 1600) {
      const action = chooseAiAction(state, state.turn, 'hard', rng);
      expect(action).not.toBeNull();
      if (!action) break;
      const result = applySeat(state, state.turn, action);
      expect(result.ok).toBe(true);
      state = result.state;
      steps += 1;
    }
    expect(state.phase).toBe('round-over');
    expect(state.result?.order).toHaveLength(4);
    expect(new Set(state.result?.order).size).toBe(4);
  }, 30000);
});
