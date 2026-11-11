import { DESSERT_IDS, type Combo, type Crown, type DessertId, type RoundBreakdown, type Sampler, type ScoreRow } from './types';
import { typeOf } from './data';

export const COMBO_POINTS = {
  pair: 2,
  triple: 6,
  quad: 12,
} as const;

export const SAMPLER_POINTS = 5 as const;
export const LEFTOVER_POINTS = 1 as const;
export const CROWN_POINTS = 6 as const;
/** A strict table leader needs at least this many copies to earn a crown. */
export const CROWN_MIN = 6;

/**
 * Score one round of eight (or fewer, for a partial preview) cards.
 *
 * A dessert type contributes at most one same-type combo per round:
 *   4+ copies -> four-of-a-kind 12, extra copies become leftovers
 *   3 copies  -> triple 6
 *   2 copies  -> pair 2
 *   1 copy    -> leftover 1
 * Then one sampler (three different leftover desserts) is worth 5 and
 * consumes one card of each of three types. All other cards are leftovers (1 each).
 */
export function scoreCards(cardIds: readonly number[], seat = 0): RoundBreakdown {
  const groups = new Map<DessertId, number[]>();
  for (const dessert of DESSERT_IDS) groups.set(dessert, []);
  for (const id of [...cardIds].sort((a, b) => a - b)) {
    groups.get(typeOf(id))!.push(id);
  }

  const combos: Combo[] = [];
  const leftoverPool: number[] = [];

  for (const dessert of DESSERT_IDS) {
    const ids = groups.get(dessert)!;
    if (ids.length >= 4) {
      combos.push({ kind: 'quad', dessert, cards: ids.slice(0, 4), points: COMBO_POINTS.quad });
      leftoverPool.push(...ids.slice(4));
    } else if (ids.length === 3) {
      combos.push({ kind: 'triple', dessert, cards: ids, points: COMBO_POINTS.triple });
    } else if (ids.length === 2) {
      combos.push({ kind: 'pair', dessert, cards: ids, points: COMBO_POINTS.pair });
    } else {
      leftoverPool.push(...ids);
    }
  }

  // A sampler is one card from each of three different leftover desserts.
  // Pick the types with the most leftover copies first, then dessert order.
  const leftoverCounts = new Map<DessertId, number>();
  for (const id of leftoverPool) {
    const dessert = typeOf(id);
    leftoverCounts.set(dessert, (leftoverCounts.get(dessert) ?? 0) + 1);
  }
  const samplerTypes = [...leftoverCounts.keys()].sort((a, b) => {
    const diff = (leftoverCounts.get(b) ?? 0) - (leftoverCounts.get(a) ?? 0);
    return diff !== 0 ? diff : DESSERT_IDS.indexOf(a) - DESSERT_IDS.indexOf(b);
  });

  let sampler: Sampler | null = null;
  let leftovers = leftoverPool;
  if (samplerTypes.length === 3) {
    const chosen = samplerTypes.slice(0, 3);
    const cards = chosen.map((dessert) => leftoverPool.find((id) => typeOf(id) === dessert)!);
    const consumed = new Set(cards);
    leftovers = leftoverPool.filter((id) => !consumed.has(id));
    sampler = { desserts: chosen, cards, points: SAMPLER_POINTS };
  }

  const leftoverPoints = leftovers.length * LEFTOVER_POINTS;
  const total = combos.reduce((sum, combo) => sum + combo.points, 0) + (sampler?.points ?? 0) + leftoverPoints;

  return { seat, combos, sampler, leftovers, leftoverPoints, total };
}

export function setPointsOf(breakdown: RoundBreakdown): number {
  return breakdown.combos.reduce((sum, combo) => sum + combo.points, 0);
}

export function countTypes(cardIds: readonly number[]): number {
  return new Set(cardIds.map(typeOf)).size;
}

/**
 * Majority crowns are awarded once at the very end of the game.
 * For each dessert type, the unique player with the most copies earns 6 points,
 * provided they have at least CROWN_MIN copies. A tie awards no crown.
 */
export function computeCrowns(collected: readonly number[][]): Crown[] {
  const crowns: Crown[] = [];
  for (const dessert of DESSERT_IDS) {
    const counts = collected.map((cards) => cards.filter((id) => typeOf(id) === dessert).length);
    const max = Math.max(0, ...counts);
    if (max < CROWN_MIN) continue;
    const leaders = counts
      .map((count, seat) => ({ count, seat }))
      .filter((row) => row.count === max);
    if (leaders.length !== 1) continue;
    crowns.push({ dessert, seat: leaders[0].seat, count: max, points: CROWN_POINTS });
  }
  return crowns;
}

export function emptyScoreRow(seat: number, name: string): ScoreRow {
  return {
    seat,
    name,
    total: 0,
    roundScores: [],
    setPoints: 0,
    samplerPoints: 0,
    leftoverPoints: 0,
    crownPoints: 0,
    majorities: 0,
    types: 0,
    cards: 0,
  };
}

export function buildScoreRows(
  names: readonly string[],
  rounds: readonly { breakdowns: RoundBreakdown[] }[],
  currentBreakdowns: readonly RoundBreakdown[] | null,
  collected: readonly number[][],
  crowns: readonly Crown[],
): ScoreRow[] {
  return names.map((name, seat) => {
    const roundBreakdowns = rounds.map((round) => round.breakdowns[seat]);
    const roundScores = roundBreakdowns.map((breakdown) => breakdown.total);
    if (currentBreakdowns && currentBreakdowns[seat]) {
      roundScores.push(currentBreakdowns[seat].total);
    }
    const allBreakdowns = currentBreakdowns
      ? [...roundBreakdowns, currentBreakdowns[seat]]
      : roundBreakdowns;
    const seatCrowns = crowns.filter((crown) => crown.seat === seat);
    const setPoints = allBreakdowns.reduce((sum, breakdown) => sum + setPointsOf(breakdown), 0);
    const samplerPoints = allBreakdowns.reduce((sum, breakdown) => sum + (breakdown.sampler?.points ?? 0), 0);
    const leftoverPoints = allBreakdowns.reduce((sum, breakdown) => sum + breakdown.leftoverPoints, 0);
    const crownPoints = seatCrowns.length * CROWN_POINTS;
    const roundTotal = allBreakdowns.reduce((sum, breakdown) => sum + breakdown.total, 0);
    return {
      seat,
      name,
      total: roundTotal + crownPoints,
      roundScores,
      setPoints,
      samplerPoints,
      leftoverPoints,
      crownPoints,
      majorities: seatCrowns.length,
      types: countTypes(collected[seat] ?? []),
      cards: collected[seat]?.length ?? 0,
    };
  });
}
