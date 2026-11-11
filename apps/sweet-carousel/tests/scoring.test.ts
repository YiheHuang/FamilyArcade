import { describe, expect, it } from 'vitest';
import { CARD_DATA, DESSERT_TYPES, typeOf } from '../src/game/data';
import { buildScoreRows, computeCrowns, scoreCards } from '../src/game/scoring';
import type { RoundBreakdown } from '../src/game/types';

// Card id blocks: macaron 0-11, tart 12-23, eclair 24-35,
// pudding 36-47, candy 48-59, cake 60-71.
const M = (n: number) => n;
const T = (n: number) => 12 + n;
const E = (n: number) => 24 + n;
const P = (n: number) => 36 + n;
const C = (n: number) => 48 + n;
const K = (n: number) => 60 + n;

describe('card data', () => {
  it('has 72 cards, 12 copies of every dessert, and a type for every id', () => {
    expect(CARD_DATA.items).toHaveLength(72);
    expect(DESSERT_TYPES).toHaveLength(6);
    for (const type of DESSERT_TYPES) {
      expect(CARD_DATA.items.filter((item) => item.type === type.id)).toHaveLength(12);
    }
    for (let id = 0; id < 72; id++) {
      expect(typeOf(id)).toBeTruthy();
    }
    expect(() => typeOf(72)).toThrow();
  });
});

describe('the scoring table', () => {
  it('scores a pair as 2, a triple as 6, and a four-of-a-kind as 12', () => {
    expect(scoreCards([M(0), M(1)]).total).toBe(2);
    expect(scoreCards([M(0), M(1), M(2)]).total).toBe(6);
    expect(scoreCards([M(0), M(1), M(2), M(3)]).total).toBe(12);
  });

  it('turns extra copies beyond four into leftovers', () => {
    const five = scoreCards([M(0), M(1), M(2), M(3), M(4)]);
    expect(five.combos).toHaveLength(1);
    expect(five.combos[0].kind).toBe('quad');
    expect(five.combos[0].points).toBe(12);
    expect(five.leftovers).toEqual([M(4)]);
    expect(five.total).toBe(13);

    const six = scoreCards([M(0), M(1), M(2), M(3), M(4), M(5)]);
    expect(six.leftovers).toHaveLength(2);
    expect(six.total).toBe(14);
  });

  it('scores a sampler of three different desserts as 5', () => {
    const sampler = scoreCards([M(0), T(0), E(0)]);
    expect(sampler.combos).toEqual([]);
    expect(sampler.sampler).not.toBeNull();
    expect(sampler.sampler!.desserts).toEqual(['macaron', 'tart', 'eclair']);
    expect(sampler.sampler!.points).toBe(5);
    expect(sampler.leftovers).toEqual([]);
    expect(sampler.total).toBe(5);
  });

  it('keeps a sampler to exactly three dessert types and leaves extras as leftovers', () => {
    const fourTypes = scoreCards([M(0), T(0), E(0), P(0)]);
    expect(fourTypes.sampler).toBeNull();
    expect(fourTypes.leftovers).toHaveLength(4);
    expect(fourTypes.total).toBe(4);

    const withExtra = scoreCards([M(0), M(1), M(2), M(3), M(4), M(5), T(0), E(0)]);
    expect(withExtra.combos).toHaveLength(1);
    expect(withExtra.sampler).not.toBeNull();
    expect(withExtra.leftovers).toEqual([M(5)]);
    expect(withExtra.total).toBe(12 + 5 + 1);
  });

  it('combines matches, a sampler and leftovers in one round', () => {
    const result = scoreCards([M(0), M(1), T(0), T(1), T(2), E(0), P(0), C(0)]);
    expect(result.combos.map((combo) => combo.kind).sort()).toEqual(['pair', 'triple']);
    // 2 + 6 + one sampler (5); the sampler eats the E/P/C singles.
    expect(result.sampler).not.toBeNull();
    expect(result.leftovers).toHaveLength(0);
    expect(result.total).toBe(13);
  });

  it('uses one combo per dessert at most, so eight of a kind is 12 + four leftovers', () => {
    const result = scoreCards([M(0), M(1), M(2), M(3), M(4), M(5), M(6), M(7)]);
    expect(result.combos).toHaveLength(1);
    expect(result.combos[0].kind).toBe('quad');
    expect(result.leftovers).toHaveLength(4);
    expect(result.total).toBe(16);
  });

  it('scores nothing for an empty hand and 1 per leftover', () => {
    expect(scoreCards([]).total).toBe(0);
    const leftovers = scoreCards([M(0), M(1)]);
    expect(leftovers.combos).toHaveLength(1);
    expect(leftovers.leftovers).toHaveLength(0);
    // One single of each of three types is a sampler, not three leftovers.
    expect(scoreCards([M(0), T(0), E(0)]).leftovers).toEqual([]);
    // Two singles of the same type form a pair, not leftovers.
    const twoSingles = scoreCards([M(0), M(1)]);
    expect(twoSingles.total).toBe(2);
  });

  it('never puts a card in two combos or a combo and the leftovers', () => {
    const cards = [M(0), M(1), M(2), M(3), M(4), T(0), T(1), E(0)];
    const result = scoreCards(cards);
    const used = [...result.combos.flatMap((combo) => combo.cards), ...(result.sampler?.cards ?? []), ...result.leftovers];
    expect(used).toHaveLength(cards.length);
    expect(new Set(used).size).toBe(cards.length);
  });

  it('keeps a typical eight-card round in the 5-16 range', () => {
    // Several plausible hands; this is a calibration guard, not a hard rule.
    const hands = [
      [M(0), T(0), E(0), P(0), C(0), K(0), M(1), T(1)],
      [M(0), M(1), M(2), T(0), T(1), E(0), P(0), C(0)],
      [M(0), M(1), T(0), T(1), E(0), E(1), P(0), P(1)],
    ];
    for (const hand of hands) {
      const total = scoreCards(hand).total;
      expect(total).toBeGreaterThanOrEqual(5);
      expect(total).toBeLessThanOrEqual(18);
    }
  });
});

describe('majority crowns', () => {
  it('awards 6 points to a unique leader with at least six copies', () => {
    const crowns = computeCrowns([
      [M(0), M(1), M(2), M(3), M(4), M(5), T(0)],
      [T(1), T(2), T(3), T(4), T(5), T(6)],
      [E(0)],
    ]);
    expect(crowns).toEqual([
      { dessert: 'macaron', seat: 0, count: 6, points: 6 },
      { dessert: 'tart', seat: 1, count: 6, points: 6 },
    ]);
  });

  it('awards no crown for a tie or for fewer than six copies', () => {
    expect(
      computeCrowns([
        [M(0), M(1), M(2), M(3), M(4), M(5)],
        [M(6), M(7), M(8), M(9), M(10), M(11)],
      ]),
    ).toEqual([]);
    expect(computeCrowns([[M(0), M(1), M(2), M(3), M(4)], [T(0)]])).toEqual([]);
  });

  it('counts copies across all three rounds', () => {
    const crowns = computeCrowns([
      [M(0), M(1), M(2), M(3), M(4), M(5), M(6), T(0)],
      [T(1), T(2)],
      [E(0)],
    ]);
    expect(crowns[0]).toMatchObject({ dessert: 'macaron', count: 7, seat: 0 });
  });
});

describe('score rows', () => {
  it('sums rounds and adds crown points only when supplied', () => {
    const breakdown = (seat: number, total: number): RoundBreakdown => ({
      seat,
      combos: [],
      sampler: null,
      leftovers: [],
      leftoverPoints: total,
      total,
    });
    const rounds = [
      { breakdowns: [breakdown(0, 5), breakdown(1, 4)] },
      { breakdowns: [breakdown(0, 6), breakdown(1, 7)] },
    ];
    const rows = buildScoreRows(
      ['A', 'B'],
      rounds,
      null,
      [[M(0), M(1), T(0)], [T(1), T(2), E(0), E(1)]],
      [{ dessert: 'macaron', seat: 0, count: 4, points: 6 }],
    );
    expect(rows[0].roundScores).toEqual([5, 6]);
    expect(rows[0].total).toBe(11 + 6);
    expect(rows[0].majorities).toBe(1);
    expect(rows[0].types).toBe(2);
    expect(rows[1].total).toBe(11);
    expect(rows[1].types).toBe(2);
  });
});
