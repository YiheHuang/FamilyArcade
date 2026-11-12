import {
  BIG_JOKER,
  SMALL_JOKER,
  beats,
  detectCombo,
  partnerOf,
  sortHand,
  type Card,
  type Combo,
  type GameState,
  type Rng,
} from '../game/doudizhu';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type HintReason =
  | 'finish'
  | 'beat-cheap'
  | 'bomb-now'
  | 'let-partner'
  | 'pass-high'
  | 'hold'
  | 'lead-low'
  | 'lead-long'
  | 'preserve-bomb'
  | 'open';

export type BidReason = 'strong' | 'steady' | 'thin' | 'raise';

export interface PlayHint {
  cards: string[] | null;
  reason: HintReason;
}

interface Candidate {
  cards: Card[];
  combo: Combo;
}

const HIGH_VALUE: Record<number, number> = {
  [SMALL_JOKER]: 3,
  [BIG_JOKER]: 4,
  15: 1.6,
  14: 1.1,
  13: 0.7,
};

function ranks(cards: Card[]): Map<number, Card[]> {
  const groups = new Map<number, Card[]>();
  for (const card of cards) {
    const list = groups.get(card.rank) ?? [];
    list.push(card);
    groups.set(card.rank, list);
  }
  for (const list of groups.values()) list.sort((a, b) => (a.id < b.id ? -1 : 1));
  return groups;
}

export function handStrength(hand: Card[]): number {
  const groups = ranks(hand);
  let score = 0;
  for (const [rank, group] of groups) {
    score += HIGH_VALUE[rank] ?? 0;
    if (group.length === 4) score += 3.2;
    if (group.length === 3) score += 0.8;
    if (rank === SMALL_JOKER && groups.has(BIG_JOKER)) score += 1.5;
  }
  const values = [...groups.keys()].filter((rank) => rank <= 14).sort((a, b) => a - b);
  let run = 1;
  for (let index = 1; index < values.length; index += 1) {
    run = values[index] === values[index - 1] + 1 ? run + 1 : 1;
    if (run >= 5) score += 0.5;
  }
  return score;
}

function legalValues(state: GameState): number[] {
  const values = [0];
  for (let value = state.highestBid + 1; value <= 3; value += 1) values.push(value);
  return values;
}

export function bidHint(state: GameState, seat: number): { value: number; reason: BidReason } {
  const strength = handStrength(state.hands[seat] ?? []);
  const wanted = strength >= 11 ? 3 : strength >= 7 ? 2 : strength >= 4 ? 1 : 0;
  const values = legalValues(state);
  if (wanted === 0) return { value: 0, reason: 'thin' };
  const value = values.includes(wanted)
    ? wanted
    : state.highestBid < 3
      ? state.highestBid + 1
      : 0;
  if (value === 0) return { value: 0, reason: 'thin' };
  if (value > wanted) return { value, reason: 'raise' };
  return { value, reason: wanted === 3 ? 'strong' : 'steady' };
}

export function chooseBid(state: GameState, seat: number, level: AiLevel, rng: Rng): number {
  const values = legalValues(state);
  const strength = handStrength(state.hands[seat] ?? []);
  if (level === 'easy') {
    if (rng() < 0.5) return 0;
    return values[Math.floor(rng() * values.length)] ?? 0;
  }
  if (level === 'companion') {
    if (strength < 6 || state.highestBid > 0) return 0;
    return values.includes(1) ? 1 : 0;
  }
  if (level === 'normal') {
    const wanted = strength >= 13 ? 3 : strength >= 8 ? 2 : strength >= 5 ? 1 : 0;
    if (wanted === 0) return 0;
    if (values.includes(wanted)) return wanted;
    return rng() < 0.55 && values.length > 1 ? values[values.length - 1] : 0;
  }

  // Hard: bid the strongest legal value its shape supports, and avoid a pointless
  // raise when the hand is only average.
  const wanted = strength >= 12 ? 3 : strength >= 7.5 ? 2 : strength >= 4.3 ? 1 : 0;
  if (wanted === 0) return 0;
  if (values.includes(wanted)) return wanted;
  if (state.highestBid < wanted) return state.highestBid + 1;
  return 0;
}

function addCandidate(map: Map<string, Candidate>, cards: Card[]): void {
  const combo = detectCombo(cards);
  if (!combo) return;
  const key = cards
    .map((card) => card.id)
    .sort()
    .join(',');
  if (!map.has(key)) map.set(key, { cards: sortHand(cards), combo });
}

export function allCandidates(hand: Card[]): Candidate[] {
  const out = new Map<string, Candidate>();
  const groups = ranks(hand);
  const groupRanks = [...groups.keys()].sort((a, b) => a - b);
  const cards = sortHand(hand);

  for (const card of cards) addCandidate(out, [card]);
  for (const rank of groupRanks) {
    const group = groups.get(rank) ?? [];
    if (group.length >= 2) addCandidate(out, group.slice(0, 2));
    if (group.length >= 3) addCandidate(out, group.slice(0, 3));
    if (group.length >= 4) addCandidate(out, group.slice(0, 4));
  }
  if (groups.has(SMALL_JOKER) && groups.has(BIG_JOKER)) {
    addCandidate(out, [
      ...(groups.get(SMALL_JOKER) ?? []),
      ...(groups.get(BIG_JOKER) ?? []),
    ]);
  }

  // Triple with one or a pair.
  for (const rank of groupRanks) {
    const group = groups.get(rank) ?? [];
    if (group.length < 3) continue;
    for (const kickerRank of groupRanks) {
      if (kickerRank === rank) continue;
      const kickers = groups.get(kickerRank) ?? [];
      addCandidate(out, [...group.slice(0, 3), kickers[0]]);
      if (kickers.length >= 2) addCandidate(out, [...group.slice(0, 3), ...kickers.slice(0, 2)]);
    }
  }

  // Four with two singles or two pairs.
  for (const rank of groupRanks) {
    const group = groups.get(rank) ?? [];
    if (group.length < 4) continue;
    const rest = cards.filter((card) => card.rank !== rank);
    for (let first = 0; first < Math.min(rest.length, 6); first += 1) {
      for (let second = first + 1; second < Math.min(rest.length, 7); second += 1) {
        addCandidate(out, [...group.slice(0, 4), rest[first], rest[second]]);
      }
    }
    const pairRanks = groupRanks.filter(
      (item) => item !== rank && (groups.get(item)?.length ?? 0) >= 2,
    );
    for (let first = 0; first < pairRanks.length; first += 1) {
      for (let second = first + 1; second < pairRanks.length; second += 1) {
        addCandidate(out, [
          ...group.slice(0, 4),
          ...(groups.get(pairRanks[first]) ?? []).slice(0, 2),
          ...(groups.get(pairRanks[second]) ?? []).slice(0, 2),
        ]);
      }
    }
  }

  // Straights.
  for (let start = 3; start <= 10; start += 1) {
    for (let length = 5; start + length - 1 <= 14; length += 1) {
      const picked: Card[] = [];
      let valid = true;
      for (let rank = start; rank < start + length; rank += 1) {
        const group = groups.get(rank);
        if (!group || group.length === 0) {
          valid = false;
          break;
        }
        picked.push(group[0]);
      }
      if (valid) addCandidate(out, picked);
    }
  }

  // Consecutive pairs.
  for (let start = 3; start <= 12; start += 1) {
    for (let length = 3; start + length - 1 <= 14; length += 1) {
      const picked: Card[] = [];
      let valid = true;
      for (let rank = start; rank < start + length; rank += 1) {
        const group = groups.get(rank);
        if (!group || group.length < 2) {
          valid = false;
          break;
        }
        picked.push(group[0], group[1]);
      }
      if (valid) addCandidate(out, picked);
    }
  }

  // Airplanes, bare and with wings. Every consecutive run of triples is a seed.
  for (let start = 3; start <= 14; start += 1) {
    for (let length = 2; start + length - 1 <= 14; length += 1) {
      const tripleRanks: number[] = [];
      let valid = true;
      for (let rank = start; rank < start + length; rank += 1) {
        if ((groups.get(rank)?.length ?? 0) < 3) {
          valid = false;
          break;
        }
        tripleRanks.push(rank);
      }
      if (!valid) continue;
      const triples = tripleRanks.flatMap((rank) => (groups.get(rank) ?? []).slice(0, 3));
      addCandidate(out, triples);

      const tripleIds = new Set(triples.map((card) => card.id));
      const rest = cards.filter((card) => !tripleIds.has(card.id));
      if (rest.length >= length) {
        addCandidate(out, [...triples, ...rest.slice(0, length)]);
        addCandidate(out, [...triples, ...rest.slice(rest.length - length)]);
      }
      const pairRanks = groupRanks.filter(
        (rank) => !tripleRanks.includes(rank) && (groups.get(rank)?.length ?? 0) >= 2,
      );
      if (pairRanks.length >= length) {
        addCandidate(out, [
          ...triples,
          ...pairRanks
            .slice(0, length)
            .flatMap((rank) => (groups.get(rank) ?? []).slice(0, 2)),
        ]);
      }
    }
  }

  return [...out.values()];
}

function remainingHand(hand: Card[], played: Card[]): Card[] {
  const used = new Set(played.map((card) => card.id));
  return hand.filter((card) => !used.has(card.id));
}

function handCost(hand: Card[]): number {
  if (hand.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const card of hand) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  let cost = 0;

  // Bombs and the rocket are one turn each.
  for (const [rank, count] of [...counts]) {
    if (count === 4) {
      cost += 1;
      counts.delete(rank);
    }
  }
  if ((counts.get(SMALL_JOKER) ?? 0) > 0 && (counts.get(BIG_JOKER) ?? 0) > 0) {
    cost += 1;
    counts.delete(SMALL_JOKER);
    counts.delete(BIG_JOKER);
  }

  // Greedily lift straights, pair runs and airplanes out of the shape.
  let changed = true;
  while (changed) {
    changed = false;
    for (let start = 3; start <= 10 && !changed; start += 1) {
      for (let length = 5; start + length - 1 <= 14; length += 1) {
        let ok = true;
        for (let rank = start; rank < start + length; rank += 1) {
          if ((counts.get(rank) ?? 0) < 1) {
            ok = false;
            break;
          }
        }
        if (ok) {
          for (let rank = start; rank < start + length; rank += 1) {
            counts.set(rank, (counts.get(rank) ?? 0) - 1);
          }
          cost += 1;
          changed = true;
          break;
        }
      }
    }
  }

  for (const [rank, count] of [...counts]) {
    if (count >= 3 && rank <= 14) {
      const next = counts.get(rank + 1) ?? 0;
      if (next >= 3) {
        counts.set(rank, count - 3);
        counts.set(rank + 1, next - 3);
        cost += 1;
      }
    }
  }

  let pairRun = 0;
  for (let rank = 3; rank <= 14; rank += 1) {
    if ((counts.get(rank) ?? 0) >= 2) {
      pairRun += 1;
    } else {
      if (pairRun >= 3) cost += 1;
      pairRun = 0;
    }
  }
  if (pairRun >= 3) cost += 1;
  for (let rank = 3; rank <= 14; rank += 1) {
    if ((counts.get(rank) ?? 0) >= 2) {
      counts.set(rank, (counts.get(rank) ?? 0) - 2);
    }
  }

  for (const count of counts.values()) {
    if (count > 0) cost += 1;
  }
  return cost;
}

function cardGroupCounts(hand: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of hand) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  return counts;
}

function breaksBomb(hand: Card[], played: Card[]): boolean {
  const before = cardGroupCounts(hand);
  const used = cardGroupCounts(played);
  for (const [rank, count] of used) {
    if (count > 0 && count < 4 && (before.get(rank) ?? 0) === 4) return true;
  }
  return false;
}

function usesJoker(cards: Card[]): boolean {
  return cards.some((card) => card.rank >= SMALL_JOKER);
}

function opponents(state: GameState, seat: number): number[] {
  return [0, 1, 2].filter((item) => item !== seat && item !== partnerOf(state, seat));
}

function escapingOpponent(state: GameState, seat: number): boolean {
  return opponents(state, seat).some((item) => state.hands[item].length <= 2);
}

function scoreCandidate(
  state: GameState,
  seat: number,
  candidate: Candidate,
  hand: Card[],
): number {
  const rest = remainingHand(hand, candidate.cards);
  const cost = handCost(rest);
  let score = 1000 - cost * 12 - candidate.combo.rank * 0.2;
  score += candidate.cards.length * 0.25;
  if (rest.length === 0) score += 5000;
  if (candidate.combo.kind === 'bomb' || candidate.combo.kind === 'rocket') {
    score -= escapingOpponent(state, seat) ? 8 : 60;
  } else if (breaksBomb(hand, candidate.cards)) {
    score -= 28;
  }
  if (usesJoker(candidate.cards)) score -= 8;
  if (state.lastPlay) score -= candidate.combo.rank * 0.35;
  if (state.lastPlay && state.lastPlay.seat === partnerOf(state, seat)) score -= 10000;
  return score;
}

function pickByScore(
  state: GameState,
  seat: number,
  choices: Candidate[],
  hand: Card[],
  rng: Rng,
  jitter: number,
): Candidate {
  let best = -Infinity;
  let picks: Candidate[] = [];
  for (const choice of choices) {
    const score = scoreCandidate(state, seat, choice, hand) + jitter * rng();
    if (score > best + 1e-9) {
      best = score;
      picks = [choice];
    } else if (Math.abs(score - best) < 1e-9) {
      picks.push(choice);
    }
  }
  return picks[Math.floor(rng() * picks.length)] ?? choices[0];
}

function finishCandidate(choices: Candidate[], hand: Card[]): Candidate | null {
  return choices.find((choice) => choice.cards.length === hand.length) ?? null;
}

function sortCheap(choices: Candidate[]): Candidate[] {
  return choices.slice().sort((a, b) => {
    const bombA = a.combo.kind === 'bomb' || a.combo.kind === 'rocket' ? 1 : 0;
    const bombB = b.combo.kind === 'bomb' || b.combo.kind === 'rocket' ? 1 : 0;
    if (bombA !== bombB) return bombA - bombB;
    if (a.combo.rank !== b.combo.rank) return a.combo.rank - b.combo.rank;
    return a.cards.length - b.cards.length;
  });
}

export function hintPlay(state: GameState, seat: number): PlayHint {
  if (state.phase !== 'playing' || state.turn !== seat) return { cards: null, reason: 'pass-high' };
  const hand = state.hands[seat] ?? [];
  let candidates = allCandidates(hand);
  const following = Boolean(state.lastPlay);
  const partner = partnerOf(state, seat);
  const partnerOwnsTrick = following && state.lastPlay?.seat === partner;

  if (following && state.lastPlay) {
    candidates = candidates.filter((candidate) => beats(candidate.combo, state.lastPlay?.combo ?? null));
  }

  if (candidates.length === 0) return { cards: null, reason: 'pass-high' };

  const finished = finishCandidate(candidates, hand);
  if (finished) return { cards: finished.cards.map((card) => card.id), reason: 'finish' };

  if (partnerOwnsTrick) {
    return { cards: null, reason: 'let-partner' };
  }

  const safe = candidates.filter(
    (candidate) =>
      candidate.combo.kind !== 'bomb' &&
      candidate.combo.kind !== 'rocket' &&
      !breaksBomb(hand, candidate.cards),
  );

  if (safe.length > 0) {
    const partnerLow = partner >= 0 && state.hands[partner].length <= 5;
    if (!following && partnerLow) {
      const lowLead = sortCheap(
        safe.filter((candidate) => candidate.cards.length <= 2 && candidate.combo.rank <= 12),
      )[0];
      if (lowLead) {
        return { cards: lowLead.cards.map((card) => card.id), reason: 'lead-low' };
      }
    }
    const pick = following ? sortCheap(safe)[0] : sortCheap(safe)[0];
    return {
      cards: pick.cards.map((card) => card.id),
      reason: following ? 'beat-cheap' : pick.cards.length >= 5 ? 'lead-long' : 'lead-low',
    };
  }

  // Only bombs or bomb-breaking plays remain. The hint keeps the bomb for a
  // moment where it can actually change the hand.
  const escaping = escapingOpponent(state, seat);
  const bomb = candidates.find(
    (candidate) => candidate.combo.kind === 'bomb' || candidate.combo.kind === 'rocket',
  );
  if (bomb && (escaping || !following)) {
    return { cards: bomb.cards.map((card) => card.id), reason: 'bomb-now' };
  }
  if (following) return { cards: null, reason: 'preserve-bomb' };
  const pick = sortCheap(candidates)[0];
  return { cards: pick.cards.map((card) => card.id), reason: 'open' };
}

export function choosePlay(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng,
): string[] | null {
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  const hand = state.hands[seat] ?? [];
  let candidates = allCandidates(hand);
  const following = Boolean(state.lastPlay);
  const partner = partnerOf(state, seat);
  const partnerOwnsTrick = following && state.lastPlay?.seat === partner;
  if (following && state.lastPlay) {
    candidates = candidates.filter((candidate) => beats(candidate.combo, state.lastPlay?.combo ?? null));
  }
  if (candidates.length === 0) return null;

  const finished = finishCandidate(candidates, hand);
  if (finished) return finished.cards.map((card) => card.id);

  if (partnerOwnsTrick) {
    if (level === 'easy' && rng() < 0.2) {
      const pick = sortCheap(candidates)[0];
      return pick.cards.map((card) => card.id);
    }
    return null;
  }

  if (level === 'companion') {
    if (following && rng() < 0.18) return null;
    const safe = candidates.filter(
      (candidate) =>
        candidate.combo.kind !== 'bomb' &&
        candidate.combo.kind !== 'rocket' &&
        !breaksBomb(hand, candidate.cards),
    );
    if (safe.length === 0) return null;
    const pick = sortCheap(safe)[0];
    return pick.cards.map((card) => card.id);
  }

  if (level === 'easy') {
    if (following && rng() < 0.25) return null;
    const pool = candidates.filter((candidate) => {
      if (candidate.combo.kind === 'bomb' || candidate.combo.kind === 'rocket') {
        return rng() < 0.2;
      }
      return true;
    });
    const pick = pool[Math.floor(rng() * pool.length)] ?? candidates[0];
    return pick.cards.map((card) => card.id);
  }

  const safe = candidates.filter(
    (candidate) =>
      candidate.combo.kind !== 'bomb' &&
      candidate.combo.kind !== 'rocket' &&
      !breaksBomb(hand, candidate.cards),
  );
  const escaping = escapingOpponent(state, seat);
  let pool = safe;
  if (pool.length === 0 && escaping) pool = candidates;
  if (pool.length === 0) {
    if (level === 'normal') return null;
    const bomb = candidates.find(
      (candidate) => candidate.combo.kind === 'bomb' || candidate.combo.kind === 'rocket',
    );
    return bomb ? bomb.cards.map((card) => card.id) : null;
  }

  const pick = pickByScore(
    state,
    seat,
    pool,
    hand,
    rng,
    level === 'hard' ? 0.4 : 3,
  );
  return pick.cards.map((card) => card.id);
}

export function chooseCards(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng,
): Card[] | null {
  const ids = choosePlay(state, seat, level, rng);
  if (!ids) return null;
  return (state.hands[seat] ?? []).filter((card) => ids.includes(card.id));
}

export type { Candidate };
