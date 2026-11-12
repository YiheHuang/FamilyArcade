/**
 * Four Zheng Shangyou opponents. Every level is deterministic with an injected
 * RNG and sees only its own hand, public hand counts, the trick and the discard.
 * Hard samples the unseen cards and rolls the round forward; it never reads
 * another seat's real hand.
 */
import {
  DECK,
  allCombos,
  applySeat,
  canBeat,
  legalPlays,
  pass,
  play,
  sortHand,
  type Card,
  type Combo,
  type GameState,
  type PlayerAction,
  type Rng,
} from '../game/zheng-shangyou';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

function ids(cards: readonly Card[]): string[] {
  return cards.map((card) => card.id);
}

function groupByRank(hand: readonly Card[]): Map<number, Card[]> {
  const groups = new Map<number, Card[]>();
  for (const card of hand) {
    const list = groups.get(card.rank) ?? [];
    list.push(card);
    groups.set(card.rank, list);
  }
  for (const list of groups.values()) list.sort((a, b) => a.rank - b.rank || a.suit.localeCompare(b.suit));
  return groups;
}

function findRun(ranks: readonly number[], minimum: number, available: (rank: number) => boolean): number[] {
  let best: number[] = [];
  for (let index = 0; index < ranks.length; index += 1) {
    if (!available(ranks[index])) continue;
    const run = [ranks[index]];
    for (let next = index + 1; next < ranks.length; next += 1) {
      if (ranks[next] !== run[run.length - 1] + 1) break;
      if (ranks[next] > 14) break;
      if (!available(ranks[next])) break;
      run.push(ranks[next]);
    }
    if (run.length >= minimum && run.length > best.length) best = run;
  }
  return best;
}

/**
 * Greedy hand decomposition used by scoring and tests. It extracts bombs,
 * consecutive pairs, straights, triples with kickers, pairs and singles. The
 * result is a safe upper bound on the number of turns needed to shed the hand.
 */
export function decomposeHand(hand: readonly Card[]): Combo[] {
  const groups = groupByRank(hand);
  const counts = new Map<number, Card[]>();
  for (const [rank, cards] of groups) counts.set(rank, cards.slice());
  const result: Combo[] = [];

  const take = (rank: number, count: number): Card[] => {
    const cards = (counts.get(rank) ?? []).splice(0, count);
    if ((counts.get(rank) ?? []).length === 0) counts.delete(rank);
    return cards;
  };
  const ranks = (): number[] => [...counts.keys()].sort((a, b) => a - b);

  for (const rank of ranks()) {
    const cards = counts.get(rank) ?? [];
    if (cards.length === 4) {
      result.push({ type: 'bomb', rank, length: 4, cards: take(rank, 4) });
    }
  }

  // Consecutive pairs: longest run first.
  for (;;) {
    const run = findRun(ranks(), 3, (rank) => rank <= 14 && (counts.get(rank)?.length ?? 0) >= 2);
    if (run.length < 3) break;
    const cards = run.flatMap((rank) => take(rank, 2));
    result.push({ type: 'pair-straight', rank: run[run.length - 1], length: cards.length, cards });
  }

  // Straights: longest run of single ranks.
  for (;;) {
    const run = findRun(ranks(), 5, (rank) => rank <= 14 && (counts.get(rank)?.length ?? 0) >= 1);
    if (run.length < 5) break;
    const cards = run.flatMap((rank) => take(rank, 1));
    result.push({ type: 'straight', rank: run[run.length - 1], length: cards.length, cards });
  }

  const tripleRanks = ranks().filter((rank) => (counts.get(rank)?.length ?? 0) >= 3);
  for (const rank of tripleRanks) {
    const triple = take(rank, 3);
    const singleRank = ranks().find((item) => (counts.get(item)?.length ?? 0) === 1);
    if (singleRank !== undefined) {
      const kicker = take(singleRank, 1);
      result.push({
        type: 'triple-single',
        rank,
        length: 4,
        cards: sortHand([...triple, ...kicker]),
      });
      continue;
    }
    const pairRank = ranks().find((item) => (counts.get(item)?.length ?? 0) === 2);
    if (pairRank !== undefined) {
      const kicker = take(pairRank, 2);
      result.push({
        type: 'triple-pair',
        rank,
        length: 5,
        cards: sortHand([...triple, ...kicker]),
      });
    } else {
      result.push({ type: 'triple', rank, length: 3, cards: triple });
    }
  }

  for (const rank of ranks()) {
    const cards = counts.get(rank) ?? [];
    while (cards.length >= 2) {
      result.push({ type: 'pair', rank, length: 2, cards: take(rank, 2) });
    }
  }
  for (const rank of ranks()) {
    while ((counts.get(rank)?.length ?? 0) > 0) {
      result.push({ type: 'single', rank, length: 1, cards: take(rank, 1) });
    }
  }
  return result;
}

export function handPlan(hand: readonly Card[]): number {
  return decomposeHand(hand).length;
}

function controlValue(hand: readonly Card[]): number {
  let value = 0;
  for (const card of hand) {
    if (card.rank === 15) value += 4;
    else if (card.rank === 14) value += 3;
    else if (card.rank === 13) value += 1.5;
  }
  return value;
}

function positionScore(state: GameState, me: number): number {
  if (state.phase === 'round-over' && state.order) {
    const place = state.order.indexOf(me);
    if (place >= 0) {
      return (state.playerCount - place) * 1000 + (state.roundPoints[me] ?? 0) * 40;
    }
  }
  if (state.finish.includes(me)) {
    const place = state.finish.indexOf(me);
    return (state.playerCount - place) * 800;
  }
  const hand = state.hands[me] ?? [];
  let score = -handPlan(hand) * 13 - hand.length * 2 + controlValue(hand);
  const opponents = state.hands
    .map((cards, seat) => ({ cards, seat }))
    .filter(({ seat, cards }) => seat !== me && cards.length > 0 && !state.finish.includes(seat));
  const nearest = Math.min(...opponents.map(({ cards }) => cards.length), 99);
  if (nearest <= 2) {
    score -= state.hands[me].length > 2 ? 16 : 4;
    score += controlValue(hand) * 1.5;
  }
  if (state.trick?.seat === me) score += 9;
  return score;
}

function afterPlayScore(
  state: GameState,
  me: number,
  cards: readonly Card[],
  before: GameState,
): number {
  if (state.phase === 'round-over') return positionScore(state, me) + 20000;
  let score = positionScore(state, me);
  const combo = state.trick?.combo;
  if (combo?.type === 'bomb') {
    const opponentClose = state.hands.some(
      (hand, seat) => seat !== me && hand.length > 0 && hand.length <= 2,
    );
    if (!opponentClose && state.hands[me].length > 0) score -= 26;
  }
  const high = cards.some((card) => card.rank >= 15);
  if (high && state.hands[me].length > 1) {
    const opponentClose = state.hands.some(
      (hand, seat) => seat !== me && hand.length > 0 && hand.length <= 2,
    );
    if (!opponentClose) score -= 12;
  }
  const beforePlan = handPlan(before.hands[me]);
  const afterPlan = handPlan(state.hands[me]);
  if (afterPlan > beforePlan - 1 && state.hands[me].length > 0) score -= 6;
  return score;
}

function passScore(state: GameState, me: number): number {
  let score = positionScore(state, me);
  if (!state.trick) score -= 20;
  const owner = state.trick?.seat;
  if (owner !== undefined && owner !== me && (state.hands[owner]?.length ?? 0) <= 2) {
    score -= 14;
  }
  if (state.trick?.combo.type === 'bomb') score += 10;
  if (state.hands[me].length <= 3) score -= 12;
  return score;
}

function sampleHidden(state: GameState, me: number, rng: Rng): GameState {
  const mine = new Set(state.hands[me].map((card) => card.id));
  const seen = new Set(state.discard.map((card) => card.id));
  const unseen = DECK.filter((card) => !mine.has(card.id) && !seen.has(card.id));
  for (let i = unseen.length - 1; i > 0; i -= 1) {
    const raw = rng();
    const value = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999, raw)) : 0;
    const j = Math.floor(value * (i + 1));
    const swap = unseen[i];
    unseen[i] = unseen[j];
    unseen[j] = swap;
  }
  const hands = state.hands.map((hand) => hand.slice());
  let cursor = 0;
  for (let seat = 0; seat < state.playerCount; seat += 1) {
    if (seat === me) continue;
    const count = state.hands[seat].length;
    hands[seat] = unseen.slice(cursor, cursor + count);
    cursor += count;
  }
  return { ...state, hands };
}

function lowestBomb(hand: readonly Card[], above = 0): Card[] | null {
  const groups = groupByRank(hand);
  const ranks = [...groups.keys()].sort((a, b) => a - b);
  for (const rank of ranks) {
    if (rank <= above) continue;
    const group = groups.get(rank) ?? [];
    if (group.length === 4) return group.slice();
  }
  return null;
}

function cheapestStraight(hand: readonly Card[], length: number, above: number): Card[] | null {
  const groups = groupByRank(hand);
  for (let top = Math.max(above + 1, 3 + length - 1); top <= 14; top += 1) {
    const start = top - length + 1;
    if (start < 3) continue;
    const cards: Card[] = [];
    for (let rank = start; rank <= top; rank += 1) {
      const group = groups.get(rank) ?? [];
      if (group.length === 0) break;
      cards.push(group[0]);
    }
    if (cards.length === length) return cards;
  }
  return null;
}

function cheapestPairStraight(hand: readonly Card[], length: number, above: number): Card[] | null {
  const groups = groupByRank(hand);
  const pairs = length / 2;
  for (let top = Math.max(above + 1, 3 + pairs - 1); top <= 14; top += 1) {
    const start = top - pairs + 1;
    if (start < 3) continue;
    const cards: Card[] = [];
    for (let rank = start; rank <= top; rank += 1) {
      const group = groups.get(rank) ?? [];
      if (group.length < 2) break;
      cards.push(...group.slice(0, 2));
    }
    if (cards.length === length) return cards;
  }
  return null;
}

/**
 * A deliberately cheap policy for the Hard rollout. It finds singles, pairs,
 * triples, kickers and roads directly, which keeps the search responsive in a
 * browser. It never needs the full combination list.
 */
function cheapAction(state: GameState, seat: number): PlayerAction | null {
  const hand = state.hands[seat] ?? [];
  if (hand.length === 0) return null;
  if (!state.trick) {
    const clubs = hand.find((card) => card.id === 'C3');
    if (state.mustLeadClubs && clubs) return { type: 'play', cards: [clubs.id] };
    return { type: 'play', cards: [hand[0].id] };
  }
  const target = state.trick.combo;
  const groups = groupByRank(hand);
  const ranks = [...groups.keys()].sort((a, b) => a - b);
  if (target.type === 'single') {
    const card = hand.find((item) => item.rank > target.rank);
    if (card) return { type: 'play', cards: [card.id] };
    const bomb = lowestBomb(hand);
    return bomb ? { type: 'play', cards: ids(bomb) } : { type: 'pass' };
  }
  if (target.type === 'pair' || target.type === 'triple') {
    const size = target.type === 'pair' ? 2 : 3;
    for (const rank of ranks) {
      const group = groups.get(rank) ?? [];
      if (rank > target.rank && group.length >= size) {
        return { type: 'play', cards: ids(group.slice(0, size)) };
      }
    }
    const bomb = lowestBomb(hand);
    return bomb ? { type: 'play', cards: ids(bomb) } : { type: 'pass' };
  }
  if (target.type === 'triple-single' || target.type === 'triple-pair') {
    for (const rank of ranks) {
      const triple = groups.get(rank) ?? [];
      if (rank <= target.rank || triple.length < 3) continue;
      const kickerRank = ranks.find((item) => {
        if (item === rank) return false;
        const group = groups.get(item) ?? [];
        return target.type === 'triple-single' ? group.length >= 1 : group.length >= 2;
      });
      if (kickerRank === undefined) continue;
      const kicker = (groups.get(kickerRank) ?? []).slice(
        0,
        target.type === 'triple-single' ? 1 : 2,
      );
      return { type: 'play', cards: ids([...triple.slice(0, 3), ...kicker]) };
    }
    const bomb = lowestBomb(hand);
    return bomb ? { type: 'play', cards: ids(bomb) } : { type: 'pass' };
  }
  if (target.type === 'straight') {
    const road = cheapestStraight(hand, target.length, target.rank);
    if (road) return { type: 'play', cards: ids(road) };
    const bomb = lowestBomb(hand);
    return bomb ? { type: 'play', cards: ids(bomb) } : { type: 'pass' };
  }
  if (target.type === 'pair-straight') {
    const road = cheapestPairStraight(hand, target.length, target.rank);
    if (road) return { type: 'play', cards: ids(road) };
    const bomb = lowestBomb(hand);
    return bomb ? { type: 'play', cards: ids(bomb) } : { type: 'pass' };
  }
  if (target.type === 'bomb') {
    const bomb = lowestBomb(hand, target.rank);
    return bomb ? { type: 'play', cards: ids(bomb) } : { type: 'pass' };
  }
  return { type: 'pass' };
}

function rollout(state: GameState, rng: Rng): GameState {
  let current = state;
  for (let step = 0; step < 110 && current.phase === 'playing'; step += 1) {
    const action = cheapAction(current, current.turn);
    if (!action) break;
    const result = applySeat(current, current.turn, action);
    if (!result.ok) break;
    current = result.state;
  }
  // Keep the RNG in the signature so callers provide the same deterministic
  // stream even if the cheap policy does not need to break ties.
  void rng;
  return current;
}

function candidateValue(
  state: GameState,
  me: number,
  cards: readonly Card[],
  level: 'companion' | 'normal',
): number {
  const applied = play(state, me, ids(cards));
  if (!applied.ok) return -Infinity;
  let score = afterPlayScore(applied.state, me, cards, state);
  if (level === 'companion') {
    score -= cards[0].rank * 6;
    if (cards.some((card) => card.rank >= 15)) score -= 70;
    if (cards.some((card) => card.rank >= 13)) score -= 14;
    if (applied.state.trick?.combo.type === 'bomb') score -= 90;
    if (applied.state.phase === 'round-over') score += 5000;
  } else {
    if (applied.state.phase === 'round-over') score += 5000;
  }
  return score;
}

function heuristicAction(
  state: GameState,
  seat: number,
  level: 'companion' | 'normal',
  rng: Rng,
  candidates: Card[][],
): PlayerAction {
  const options: { action: PlayerAction; score: number }[] = candidates.map((cards) => ({
    action: { type: 'play', cards: ids(cards) },
    score: candidateValue(state, seat, cards, level),
  }));
  if (state.trick) {
    const applied = pass(state, seat);
    if (applied.ok) {
      options.push({
        action: { type: 'pass' },
        score: passScore(applied.state, seat) + (level === 'companion' ? -4 : 0),
      });
    }
  }
  const best = Math.max(...options.map((option) => option.score));
  const top = options.filter((option) => option.score >= best - 1e-9);
  return (top[Math.floor(rng() * top.length)] ?? top[0]).action;
}

function hardAction(
  state: GameState,
  seat: number,
  rng: Rng,
  candidates: Card[][],
): PlayerAction {
  const ranked = candidates
    .map((cards) => ({ cards, value: candidateValue(state, seat, cards, 'normal') }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((item) => item.cards);
  const options: { action: PlayerAction; cards: Card[] }[] = ranked.map((cards) => ({
    action: { type: 'play', cards: ids(cards) },
    cards,
  }));
  if (state.trick) options.push({ action: { type: 'pass' }, cards: [] });

  let bestScore = -Infinity;
  let bestOptions: PlayerAction[] = [];
  for (const option of options) {
    const applied =
      option.action.type === 'play'
        ? play(state, seat, option.action.cards)
        : pass(state, seat);
    if (!applied.ok) continue;
    if (applied.state.phase === 'round-over') {
      const value = positionScore(applied.state, seat) + 30000;
      if (value > bestScore) {
        bestScore = value;
        bestOptions = [option.action];
      }
      continue;
    }
    const hidden = sampleHidden(applied.state, seat, rng);
    const finished = rollout(hidden, rng);
    let value = positionScore(finished, seat);
    if (option.action.type === 'play') {
      value += afterPlayScore(applied.state, seat, option.cards, state) / 45;
    } else {
      value += passScore(applied.state, seat) / 45;
    }
    if (value > bestScore + 1e-9) {
      bestScore = value;
      bestOptions = [option.action];
    } else if (Math.abs(value - bestScore) < 1e-9) {
      bestOptions.push(option.action);
    }
  }
  if (bestOptions.length === 0) {
    return candidates[0] ? { type: 'play', cards: ids(candidates[0]) } : { type: 'pass' };
  }
  return bestOptions[Math.floor(rng() * bestOptions.length)] ?? bestOptions[0];
}

export function chooseAiAction(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng = Math.random,
): PlayerAction | null {
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  if (state.finish.includes(seat) || state.hands[seat].length === 0) return null;
  const candidates = legalPlays(state, seat);
  const canPass = state.trick !== null;

  if (candidates.length === 0) return canPass ? { type: 'pass' } : null;

  const out = candidates.find((cards) => cards.length === state.hands[seat].length);
  if (out) return { type: 'play', cards: ids(out) };

  if (level === 'easy') {
    if (canPass && rng() < 0.24) return { type: 'pass' };
    if (rng() < 0.58) {
      const low = candidates
        .slice()
        .sort((a, b) => a.length - b.length || a[0].rank - b[0].rank)
        .slice(0, Math.max(1, Math.ceil(candidates.length * 0.4)));
      return { type: 'play', cards: ids(low[Math.floor(rng() * low.length)] ?? low[0]) };
    }
    return { type: 'play', cards: ids(candidates[Math.floor(rng() * candidates.length)] ?? candidates[0]) };
  }

  if (level === 'companion') {
    const human = state.hands[0]?.length ?? 0;
    if (
      canPass &&
      seat !== 0 &&
      human > 0 &&
      human <= 2 &&
      (state.hands[seat]?.length ?? 0) > 1
    ) {
      return { type: 'pass' };
    }
    if (canPass && rng() < 0.13) return { type: 'pass' };
    return heuristicAction(state, seat, 'companion', rng, candidates);
  }

  if (level === 'normal') {
    return heuristicAction(state, seat, 'normal', rng, candidates);
  }

  return hardAction(state, seat, rng, candidates);
}

/**
 * Choose the card a tribute receiver returns. All levels avoid giving away a
 * pair or the 3♣ lead when a harmless low singleton exists.
 */
export function chooseTributeReturn(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng = Math.random,
): Card | null {
  const pair = state.tribute?.pairs.find((item) => item.to === seat && item.returned === null);
  if (!pair) return null;
  const hand = state.hands[seat] ?? [];
  if (hand.length === 0) return null;
  const groups = groupByRank(hand);
  const singletons = hand.filter((card) => (groups.get(card.rank)?.length ?? 0) === 1);
  const safe = (cards: readonly Card[]) => cards.filter((card) => card.id !== 'C3');
  let pool = safe(singletons);
  if (pool.length === 0) pool = safe(hand);
  if (pool.length === 0) pool = hand.slice();
  pool = pool.slice().sort((a, b) => a.rank - b.rank || a.suit.localeCompare(b.suit));
  if (level === 'easy') {
    const low = pool.slice(0, Math.max(1, Math.ceil(pool.length / 2)));
    return low[Math.floor(rng() * low.length)] ?? low[0];
  }
  return pool[0] ?? hand[0];
}

/** A legal action for a seat whose LAN guest has dropped off. */
export function fallbackAction(state: GameState, seat: number): PlayerAction | null {
  if (state.phase === 'tribute') {
    const pair = state.tribute?.pairs.find((item) => item.to === seat && item.returned === null);
    if (pair) {
      const card = chooseTributeReturn(state, seat, 'easy', () => 0.5);
      return card ? { type: 'tribute', card: card.id } : null;
    }
    return null;
  }
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  const candidates = legalPlays(state, seat);
  if (candidates.length > 0) return { type: 'play', cards: ids(candidates[0]) };
  if (state.trick) return { type: 'pass' };
  return null;
}

/** Exposed for tests that want to reason about any legal combination. */
export function combosFor(hand: readonly Card[]): Combo[] {
  return allCombos(hand).filter((combo) => canBeat(combo, null));
}
