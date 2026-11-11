import { describe, expect, it } from 'vitest';
import {
  claimSet,
  createGame,
  dealExtra,
  finishGame,
  findSet,
  findSets,
  fullDeck,
  isDraw,
  isSet,
  setReason,
  shuffle,
  standings,
  winners,
  type Card,
  type GameState,
} from '../src/game/cards';
import {
  aiDelay,
  aiNames,
  chooseSet,
  mulberry32,
  type AiLevel,
} from '../src/ai/ai';

const deck = fullDeck();

function pick(
  color: Card['color'],
  shape: Card['shape'],
  fill: Card['fill'],
  count: Card['count'],
): Card {
  const card = deck.find(
    (item) =>
      item.color === color &&
      item.shape === shape &&
      item.fill === fill &&
      item.count === count,
  );
  if (!card) throw new Error('card not in deck');
  return card;
}

const A = pick(0, 0, 0, 1); // coral pill solid 1
const B = pick(1, 1, 1, 2); // teal diamond striped 2
const C = pick(2, 2, 2, 3); // indigo star open 3
const SAME_A = pick(0, 0, 0, 1);
const SAME_B = pick(0, 0, 0, 2);
const SAME_C = pick(0, 0, 0, 3);
const BAD_A = pick(0, 0, 0, 1);
const BAD_B = pick(0, 0, 0, 2);
const BAD_C = pick(0, 0, 1, 3);

function stateOf(
  table: Card[],
  extraDeck: Card[] = [],
  names: string[] = ['Mia', 'Ren'],
): GameState {
  return {
    deck: extraDeck,
    table,
    players: names.map((name, id) => ({ id, name, score: 0, misses: 0 })),
    found: [],
    status: 'playing',
    deals: 0,
    seq: 0,
  };
}

describe('Triple Find cards and sets', () => {
  it('builds an 81-card deck where every card is unique', () => {
    expect(deck).toHaveLength(81);
    expect(new Set(deck.map((card) => card.id)).size).toBe(81);
    const combinations = new Set(
      deck.map((card) => `${card.color}/${card.shape}/${card.fill}/${card.count}`),
    );
    expect(combinations.size).toBe(81);
  });

  it('accepts sets that are all different in all four attributes', () => {
    expect(isSet(A, B, C)).toBe(true);
    expect(findSets([A, B, C])).toEqual([[0, 1, 2]]);
  });

  it('accepts sets that are all the same in three attributes', () => {
    expect(isSet(SAME_A, SAME_B, SAME_C)).toBe(true);
    expect(findSets([SAME_A, SAME_B, SAME_C])).toHaveLength(1);
  });

  it('rejects a mixed attribute even when the other three work', () => {
    expect(isSet(BAD_A, BAD_B, BAD_C)).toBe(false);
    expect(findSets([BAD_A, BAD_B, BAD_C])).toEqual([]);
  });

  it('finds no set on an empty table and one on a valid table', () => {
    expect(findSet([])).toBeNull();
    expect(findSet([BAD_A, BAD_B, BAD_C])).toBeNull();
    expect(findSet([A, B, C])).toEqual([0, 1, 2]);
  });

  it('shuffles without mutating its input and repeats with the same seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const once = shuffle(input, mulberry32(9));
    const twice = shuffle(input, mulberry32(9));
    expect(once).toEqual(twice);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('Triple Find game setup', () => {
  it('deals twelve cards and leaves sixty-nine in the deck', () => {
    const game = createGame(['Mia', 'Ren'], mulberry32(3));
    expect(game.table).toHaveLength(12);
    expect(game.deck).toHaveLength(69);
    expect(game.players.map((player) => player.score)).toEqual([0, 0]);
    expect(game.status).toBe('playing');
  });

  it('is deterministic for the same injected RNG seed', () => {
    const one = createGame(['A', 'B'], mulberry32(42));
    const two = createGame(['A', 'B'], mulberry32(42));
    expect(one.table.map((card) => card.id)).toEqual(two.table.map((card) => card.id));
    expect(one.deck.map((card) => card.id)).toEqual(two.deck.map((card) => card.id));
  });

  it('uses the injected RNG rather than a hidden random source', () => {
    const zeros = createGame(['A', 'B'], () => 0);
    const almost = createGame(['A', 'B'], () => 0.999999);
    expect(zeros.table.map((card) => card.id)).not.toEqual(almost.table.map((card) => card.id));
  });
});

describe('Triple Find claims', () => {
  it('scores, records and refills the table after a valid claim', () => {
    const game = stateOf([A, B, C], [pick(2, 0, 0, 1), pick(2, 0, 0, 2), pick(2, 0, 0, 3)]);
    const result = claimSet(game, 0, [A.id, B.id, C.id]);
    expect(result.ok).toBe(true);
    expect(result.state.players[0].score).toBe(1);
    expect(result.state.found).toHaveLength(1);
    expect(result.state.found[0].cards.map((card) => card.id)).toEqual([A.id, B.id, C.id]);
    expect(result.state.table).toHaveLength(3);
    expect(result.state.deck).toHaveLength(0);
  });

  it('refills to twelve when the deck has enough cards', () => {
    const extras = [pick(2, 0, 0, 1), pick(2, 0, 0, 2), pick(2, 0, 0, 3)];
    const game = stateOf(
      [A, B, C, pick(1, 2, 0, 3), pick(1, 0, 1, 1), pick(1, 1, 2, 2), pick(1, 2, 1, 1), pick(2, 0, 1, 2), pick(2, 1, 0, 1), pick(2, 2, 1, 3), pick(0, 1, 0, 2), pick(0, 2, 1, 1)],
      extras,
    );
    const result = claimSet(game, 1, [A.id, B.id, C.id]);
    expect(result.ok).toBe(true);
    expect(result.state.table).toHaveLength(12);
    expect(result.state.deck).toHaveLength(0);
    expect(result.state.players[1].score).toBe(1);
  });

  it('rejects a non-set without mutating the table', () => {
    const game = stateOf([BAD_A, BAD_B, BAD_C]);
    const result = claimSet(game, 0, [BAD_A.id, BAD_B.id, BAD_C.id]);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('not-a-set');
    expect(result.state).toBe(game);
    expect(game.players[0].score).toBe(0);
  });

  it('rejects the wrong number of cards', () => {
    expect(claimSet(stateOf([A, B, C]), 0, [A.id, B.id]).error).toBe('wrong-count');
  });

  it('rejects a duplicate card id', () => {
    expect(claimSet(stateOf([A, B, C]), 0, [A.id, A.id, B.id]).error).toBe('duplicate-card');
  });

  it('rejects a card that is not on this table', () => {
    expect(claimSet(stateOf([A, B, C]), 0, [A.id, B.id, 889]).error).toBe('card-not-on-table');
  });

  it('rejects an unknown player', () => {
    expect(claimSet(stateOf([A, B, C]), 7, [A.id, B.id, C.id]).error).toBe('unknown-player');
  });

  it('rejects every claim after the game is finished', () => {
    const game = finishGame(stateOf([A, B, C]));
    expect(claimSet(game, 0, [A.id, B.id, C.id]).error).toBe('game-finished');
  });

  it('shrinks the table and finishes when the last cards contain no set', () => {
    const leftovers = [pick(1, 0, 0, 1), pick(1, 0, 0, 2), pick(1, 0, 1, 3)];
    const game = stateOf([A, B, C, ...leftovers]);
    const result = claimSet(game, 0, [A.id, B.id, C.id]);
    expect(result.ok).toBe(true);
    expect(result.state.table).toHaveLength(3);
    expect(result.state.deck).toHaveLength(0);
    expect(result.state.status).toBe('finished');
  });

  it('starts from a table of six and ends when the last set is claimed', () => {
    const leftovers = [pick(1, 0, 0, 1), pick(1, 0, 0, 2), pick(1, 0, 1, 3)];
    const game = stateOf([A, B, C, ...leftovers]);
    const first = claimSet(game, 0, [A.id, B.id, C.id]);
    expect(first.state.status).toBe('finished');
    expect(first.state.table).toHaveLength(3);
    expect(first.state.players[0].score).toBe(1);
  });
});

describe('Triple Find dealing and ending', () => {
  it('deals three more when the table has no set', () => {
    const extras = [pick(2, 0, 0, 1), pick(2, 0, 0, 2), pick(2, 0, 0, 3)];
    const game = stateOf([BAD_A, BAD_B, BAD_C], extras);
    const result = dealExtra(game);
    expect(result.ok).toBe(true);
    expect(result.state.table).toHaveLength(6);
    expect(result.state.deck).toHaveLength(0);
    expect(result.state.deals).toBe(1);
  });

  it('refuses to deal when a set is already visible', () => {
    const game = stateOf([A, B, C], [pick(2, 0, 0, 1)]);
    expect(dealExtra(game).error).toBe('set-present');
  });

  it('refuses to deal from an empty deck', () => {
    expect(dealExtra(stateOf([BAD_A, BAD_B, BAD_C])).error).toBe('deck-empty');
  });

  it('finishes if the final deal still leaves no set', () => {
    const pair = [BAD_A, BAD_B];
    const extra = [pick(2, 2, 2, 3)];
    const game = stateOf(pair, extra);
    const result = dealExtra(game);
    expect(result.ok).toBe(true);
    expect(result.state.table).toHaveLength(3);
    expect(result.state.status).toBe('finished');
  });

  it('finishes once and keeps the same object on repeat calls', () => {
    const game = stateOf([A, B, C]);
    const ended = finishGame(game);
    expect(ended.status).toBe('finished');
    expect(finishGame(ended)).toBe(ended);
  });

  it('sorts standings and reports tied winners as a draw', () => {
    const game = stateOf([A, B, C], [], ['Mia', 'Ren', 'Ada']);
    game.players[0].score = 2;
    game.players[1].score = 2;
    game.players[2].score = 1;
    expect(standings(game).map((player) => player.name)).toEqual(['Mia', 'Ren', 'Ada']);
    expect(winners(game).map((player) => player.name)).toEqual(['Mia', 'Ren']);
    expect(isDraw(game)).toBe(true);
  });
});

describe('Triple Find hint reasons', () => {
  it('explains every attribute for a valid set', () => {
    const reasons = setReason([A, B, C]);
    expect(reasons).toHaveLength(4);
    expect(reasons.every((reason) => reason.relation === 'different')).toBe(true);
  });

  it('explains an all-same set', () => {
    const reasons = setReason([SAME_A, SAME_B, SAME_C]);
    expect(reasons.filter((reason) => reason.attr !== 'count').every((reason) => reason.relation === 'same')).toBe(true);
    expect(reasons.find((reason) => reason.attr === 'count')?.relation).toBe('different');
  });

  it('marks a broken attribute as mixed', () => {
    const mixed = setReason([BAD_A, BAD_B, BAD_C]);
    expect(mixed.find((reason) => reason.attr === 'fill')?.relation).toBe('mixed');
  });
});

describe('Triple Find AI', () => {
  const table = [A, B, C, BAD_A, BAD_B, BAD_C];

  it('returns null when the table has no set', () => {
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      expect(chooseSet([BAD_A, BAD_B, BAD_C], level, mulberry32(1))).toBeNull();
    }
  });

  it('always returns a valid set on every level', () => {
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const indexes = chooseSet(table, level, mulberry32(5));
      expect(indexes).not.toBeNull();
      if (!indexes) continue;
      expect(isSet(table[indexes[0]], table[indexes[1]], table[indexes[2]])).toBe(true);
    }
  });

  it('is deterministic for the same table, level and RNG seed', () => {
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const one = chooseSet(table, level, mulberry32(77));
      const two = chooseSet(table, level, mulberry32(77));
      expect(one).toEqual(two);
    }
  });

  it('lets Hard take the first available set', () => {
    expect(chooseSet(table, 'hard', mulberry32(1))).toEqual(findSets(table)[0]);
  });

  it('orders reaction delays from Hard to Companion', () => {
    const delays = (['hard', 'normal', 'easy', 'companion'] as AiLevel[]).map((level) =>
      aiDelay(level, mulberry32(12)),
    );
    expect(delays[0]).toBeLessThan(delays[1]);
    expect(delays[1]).toBeLessThan(delays[2]);
    expect(delays[2]).toBeLessThan(delays[3]);
  });

  it('keeps seeded RNG draws in the unit interval', () => {
    const rng = mulberry32(123);
    for (let index = 0; index < 50; index += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(mulberry32(123)()).toBe(mulberry32(123)());
  });

  it('names exactly as many AI players as requested', () => {
    expect(aiNames('hard', 3, 'en')).toHaveLength(3);
    expect(aiNames('companion', 2, 'zh')).toHaveLength(2);
  });
});
