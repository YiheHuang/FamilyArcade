import {
  cardValue,
  freshDeck,
  makeRng,
  pegPlayScore,
  rankOf,
  suitOf,
  type Card,
  type GameState,
} from '../game/cribbage';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

export function aiRng(state: GameState, seat: number, salt = 0): Rng {
  const mixed =
    (state.seed ^
      Math.imul(state.handNo, 0x9e3779b1) ^
      Math.imul(seat + 1, 0x85ebca6b) ^
      Math.imul(salt + 1, 0xc2b2ae35)) >>>
    0;
  return makeRng(mixed);
}

function combinations<T>(items: T[], choose: number): T[][] {
  const result: T[][] = [];
  const walk = (start: number, picked: T[]) => {
    if (picked.length === choose) {
      result.push(picked.slice());
      return;
    }
    for (let index = start; index <= items.length - (choose - picked.length); index += 1) {
      picked.push(items[index]);
      walk(index + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return result;
}

/** Rough value of the cards a player is giving to a crib. */
export function cribHeuristic(cards: Card[]): number {
  let value = cards.length * 0.35;
  const rankCounts = new Map<number, number>();
  const suits = new Map<number, number>();
  for (const card of cards) {
    const rank = rankOf(card);
    rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
    suits.set(suitOf(card), (suits.get(suitOf(card)) ?? 0) + 1);
    if (rank === 5) value += 0.85;
    if (rank >= 11) value += 0.2;
  }
  for (const amount of rankCounts.values()) value += ((amount * (amount - 1)) / 2) * 1.25;

  const ranks = [...rankCounts.keys()].sort((a, b) => a - b);
  for (let index = 1; index < ranks.length; index += 1) {
    if (ranks[index] - ranks[index - 1] <= 2) value += 0.45;
  }

  const subsets = 1 << cards.length;
  for (let mask = 1; mask < subsets; mask += 1) {
    let sum = 0;
    for (let index = 0; index < cards.length; index += 1) {
      if (mask & (1 << index)) sum += cardValue(cards[index]);
    }
    if (sum === 15) value += 0.9;
  }
  for (const amount of suits.values()) {
    if (amount >= 2) value += (amount - 1) * 0.25;
  }
  return value;
}

function averageHandScore(keep: Card[], unseen: Card[]): number {
  if (keep.length === 0 || unseen.length === 0) return 0;
  let total = 0;
  for (const starter of unseen) {
    let fifteen = 0;
    const all = [...keep, starter];
    const rankCounts = new Map<number, number>();
    for (const card of all) {
      const rank = rankOf(card);
      rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
    }
    const subsets = 1 << all.length;
    for (let mask = 1; mask < subsets; mask += 1) {
      let sum = 0;
      for (let index = 0; index < all.length; index += 1) {
        if (mask & (1 << index)) sum += cardValue(all[index]);
      }
      if (sum === 15) fifteen += 1;
    }
    let pairs = 0;
    for (const amount of rankCounts.values()) pairs += (amount * (amount - 1)) / 2;

    const ranks = [...rankCounts.keys()].sort((a, b) => a - b);
    let runs = 0;
    let index = 0;
    while (index < ranks.length) {
      let end = index;
      while (end + 1 < ranks.length && ranks[end + 1] === ranks[end] + 1) end += 1;
      const length = end - index + 1;
      if (length >= 3) {
        let ways = 1;
        for (let rankIndex = index; rankIndex <= end; rankIndex += 1) {
          ways *= rankCounts.get(ranks[rankIndex]) ?? 1;
        }
        runs += length * ways;
      }
      index = end + 1;
    }

    const handSuit = suitOf(keep[0]);
    const flush =
      keep.every((card) => suitOf(card) === handSuit) && suitOf(starter) === handSuit
        ? keep.length + 1
        : keep.every((card) => suitOf(card) === handSuit)
          ? keep.length
          : 0;
    const nobs = keep.some((card) => rankOf(card) === 11 && suitOf(card) === suitOf(starter)) ? 1 : 0;
    total += fifteen * 2 + pairs * 2 + runs + flush + nobs;
  }
  return total / unseen.length;
}

function pegPotential(keep: Card[]): number {
  return keep.reduce((sum, card) => {
    const value = cardValue(card);
    return sum + (value <= 4 ? 0.45 : value <= 6 ? 0.2 : 0);
  }, 0);
}

export interface DiscardChoice {
  cards: Card[];
  keep: Card[];
  value: number;
  keepEv: number;
  crib: number;
}

export function rankDiscards(state: GameState, seat: number): DiscardChoice[] {
  if (state.phase !== 'discard' || seat < 0 || seat >= state.players) return [];
  const hand = state.seats[seat].hand;
  const own = seat === state.dealer;
  const unseen = freshDeck().filter((card) => !hand.includes(card));
  const choices = combinations(hand, state.discardCount).map((cards) => {
    const thrown = new Set(cards);
    const keep = hand.filter((card) => !thrown.has(card));
    const keepEv = averageHandScore(keep, unseen);
    const crib = cribHeuristic(cards);
    const value = keepEv + pegPotential(keep) * 0.12 + (own ? crib : -crib * 0.9);
    return { cards: cards.slice().sort((a, b) => a - b), keep, value, keepEv, crib };
  });
  return choices.sort((a, b) => {
    if (Math.abs(b.value - a.value) > 1e-9) return b.value - a.value;
    const left = a.cards.join(',');
    const right = b.cards.join(',');
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

export function chooseDiscard(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng = aiRng(state, seat),
): Card[] {
  const choices = rankDiscards(state, seat);
  if (choices.length === 0) return [];
  const pick = (items: DiscardChoice[]) =>
    items[Math.min(items.length - 1, Math.floor(rng() * items.length))] ?? items[0];

  if (level === 'hard') return choices[0].cards;

  if (level === 'normal') {
    if (rng() < 0.12) return pick(choices).cards;
    return choices[0].cards;
  }

  if (level === 'easy') {
    if (rng() < 0.5) return pick(choices).cards;
    const noisy = choices
      .map((choice) => ({ choice, noise: choice.value + rng() * 4 }))
      .sort((a, b) => b.noise - a.noise);
    return noisy[0].choice.cards;
  }

  // Companion stays competent but gives the human a little breathing room.
  if (rng() < 0.55) return choices[0].cards;
  return choices[Math.min(choices.length - 1, 1)].cards;
}

export function choosePlay(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng = aiRng(state, seat),
): Card | null {
  if (state.phase !== 'pegging' || state.turn !== seat) return null;
  const hand = state.seats[seat].hand;
  const legal = hand.filter((card) => state.count + cardValue(card) <= 31);
  if (legal.length === 0) return null;

  const tableCards = new Set<Card>(state.pegged.map((item) => item.card));
  if (state.starter !== null) tableCards.add(state.starter);
  const unseen = freshDeck().filter((card) => !hand.includes(card) && !tableCards.has(card));

  const options = legal.map((card) => {
    const peg = pegPlayScore(state.sequence, state.count, card);
    let riskTotal = 0;
    let riskCount = 0;
    for (const reply of unseen) {
      if (peg.count + cardValue(reply) > 31) continue;
      riskTotal += pegPlayScore([...state.sequence, card], peg.count, reply).points;
      riskCount += 1;
    }
    const risk = riskCount > 0 ? riskTotal / riskCount : 0;
    const leavesFifteen = [5, 10, 15, 20, 25, 30].includes(peg.count) ? 0.6 : 0;
    const value = cardValue(card);
    return {
      card,
      immediate: peg.points,
      value,
      score: peg.points - risk * 0.75 - leavesFifteen + value * 0.03,
    };
  });

  options.sort(
    (a, b) =>
      b.score - a.score ||
      a.value - b.value ||
      a.card - b.card,
  );
  const pickRandom = () => legal[Math.floor(rng() * legal.length)] ?? legal[0];

  if (level === 'hard') return options[0].card;

  if (level === 'normal') {
    if (rng() < 0.15) return pickRandom();
    return options[0].card;
  }

  if (level === 'easy') {
    if (rng() < 0.45) return pickRandom();
    return options[Math.min(options.length - 1, Math.floor(rng() * 2))].card;
  }

  // Companion: take the win if it is there, otherwise keep the pegging gentle.
  const winning = options.find((option) => state.seats[seat].score + option.immediate >= 121);
  if (winning) return winning.card;
  if (rng() < 0.35) return options[0].card;
  const gentle = options
    .slice()
    .sort(
      (a, b) =>
        a.immediate - b.immediate ||
        a.value - b.value ||
        a.card - b.card,
    );
  return gentle[0].card;
}

/** A simple, deterministic cut choice used by the UI. */
export function chooseCut(state: GameState, seat: number): boolean {
  return state.phase === 'cut' && state.turn === seat;
}
