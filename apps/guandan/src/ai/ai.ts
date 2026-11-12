/**
 * Four Guandan opponents. Every level is deterministic with an injected RNG and
 * sees only its own hand, public hand counts, the trick, the discard and the
 * tribute summary. Hard never reads another seat's hidden cards.
 */
import {
  ACE,
  BIG_JOKER,
  DECK,
  SMALL_JOKER,
  type Card,
  type Combo,
  type GameState,
  type PlayerAction,
  type Rng,
  cardPower,
  comboStrength,
  isWild,
  legalPlays,
  partnerOf,
  chooseReturnCard,
  play,
  powerRank,
  sequenceWindows,
  sortHand,
  teamOf,
} from '../game/guandan';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

function ids(cards: readonly Card[]): string[] {
  return cards.map((card) => card.id);
}

function activeCount(state: GameState, seat: number): number {
  return state.hands[seat]?.length ?? 0;
}

function nextActiveAfter(state: GameState, seat: number): number {
  for (let step = 1; step <= 4; step += 1) {
    const next = (seat + step) % 4;
    if (state.hands[next].length > 0 && !state.finish.includes(next)) return next;
  }
  return -1;
}

function wildsIn(cards: readonly Card[], level: number): number {
  return cards.filter((card) => isWild(card, level)).length;
}

function jokersIn(cards: readonly Card[]): number {
  return cards.filter((card) => card.rank >= SMALL_JOKER).length;
}

/** A public-information hand shape score: fewer cards, more structure, more control. */
export function handShape(cards: readonly Card[], level: number): number {
  let score = -cards.length * 5;
  const natural = new Map<number, number>();
  let wilds = 0;
  let levelCards = 0;
  let smallJokers = 0;
  let bigJokers = 0;
  for (const card of cards) {
    if (isWild(card, level)) {
      wilds += 1;
      continue;
    }
    if (card.rank === SMALL_JOKER) {
      smallJokers += 1;
      continue;
    }
    if (card.rank === BIG_JOKER) {
      bigJokers += 1;
      continue;
    }
    if (card.rank === level) levelCards += 1;
    natural.set(card.rank, (natural.get(card.rank) ?? 0) + 1);
  }

  for (const [rank, count] of natural) {
    if (count === 1) score -= 3;
    else if (count === 2) score += 3;
    else if (count === 3) score += 6;
    else score += 13 + (count - 4) * 4;
    if (powerRank(rank, level) >= 13) score += 2;
  }
  score += smallJokers * 7 + bigJokers * 10;
  if (smallJokers >= 2) score += 8;
  if (bigJokers >= 2) score += 10;
  score += wilds * 11;
  score += levelCards * 4;

  for (const window of sequenceWindows(5)) {
    const present = window.ranks.filter((rank) => (natural.get(rank) ?? 0) > 0).length;
    if (present >= 4) score += 5;
  }
  for (const window of sequenceWindows(3)) {
    const pairs = window.ranks.filter((rank) => (natural.get(rank) ?? 0) >= 2).length;
    if (pairs >= 2) score += 4;
  }
  return score;
}

function bombCost(combo: Combo, state: GameState, seat: number): number {
  if (!combo.bomb) return 0;
  const partner = partnerOf(seat);
  const opponents = [0, 1, 2, 3].filter((item) => teamOf(item) !== teamOf(seat));
  const threat = opponents.some((item) => activeCount(state, item) <= 2);
  const late = activeCount(state, seat) <= 6;
  const partnerWinning = state.trick?.seat === partner && activeCount(state, partner) <= 3;
  if (partnerWinning) return 70;
  let cost = 26 + combo.tier * 5;
  if (combo.type === 'straight-flush') cost += 12;
  if (combo.type === 'joker-bomb') cost += 30;
  if (threat) cost -= 18;
  if (late) cost -= 10;
  if (combo.type === 'bomb' && combo.tier <= 5 && activeCount(state, seat) > 12) cost -= 4;
  return Math.max(4, cost);
}

function highCardCost(combo: Combo, level: number): number {
  if (combo.bomb) return 0;
  let cost = 0;
  for (const card of combo.cards) {
    if (card.rank >= SMALL_JOKER) cost += 9;
    else if (card.rank === level) cost += 5;
    else if (card.rank === ACE) cost += 3;
  }
  return cost;
}

function unseenHigher(state: GameState, seat: number, combo: Combo, level: number): number {
  const own = new Set(state.hands[seat].map((card) => card.id));
  const seen = new Set(state.discard.map((card) => card.id));
  const unseen = DECK.filter((card) => !own.has(card.id) && !seen.has(card.id));
  if (combo.bomb) {
    return unseen.filter((card) => card.rank >= SMALL_JOKER).length;
  }
  if (combo.type === 'single' || combo.type === 'pair' || combo.type === 'triple') {
    const need = combo.size;
    const higher = unseen.filter((card) => cardPower(card, level) > combo.rank);
    const byRank = new Map<number, number>();
    for (const card of higher) {
      const key = cardPower(card, level);
      byRank.set(key, (byRank.get(key) ?? 0) + 1);
    }
    return [...byRank.values()].some((count) => count >= need) ? 1 : 0;
  }
  if (combo.type === 'full-house') {
    return unseen.filter((card) => cardPower(card, level) > combo.rank).length >= 3 ? 1 : 0;
  }
  return 0;
}

function partnershipAdjustment(
  state: GameState,
  seat: number,
  combo: Combo | null,
  isPass: boolean,
): number {
  const partner = partnerOf(seat);
  const partnerCount = activeCount(state, partner);
  const opponents = [0, 1, 2, 3].filter((item) => teamOf(item) !== teamOf(seat));
  const opponentThreat = opponents.some((item) => activeCount(state, item) <= 2);
  const partnerWinning = state.trick?.seat === partner;
  let value = 0;

  if (partnerWinning) {
    if (isPass) value += partnerCount <= 2 ? 34 : 14;
    else value -= partnerCount <= 2 ? 38 : 12;
  }
  if (isPass && opponentThreat) value -= 26;
  if (!isPass && combo && opponentThreat) value += combo.bomb ? 5 : 8;
  if (partnerCount === 1 && !isPass && state.trick?.seat !== partner) value += 3;
  return value;
}

function playScore(
  state: GameState,
  seat: number,
  combo: Combo,
  level: number,
  aiLevel: AiLevel,
): number {
  const selected = new Set(combo.cards.map((card) => card.id));
  const remaining = sortHand(
    state.hands[seat].filter((card) => !selected.has(card.id)),
    level,
  );
  if (remaining.length === 0) return 100000;

  let score = handShape(remaining, level);
  const wilds = wildsIn(combo.cards, level);
  const jokers = jokersIn(combo.cards);
  score -= wilds * (aiLevel === 'companion' ? 16 : 10);
  score -= jokers * 4;
  score -= highCardCost(combo, level);
  score -= bombCost(combo, state, seat);
  score += partnershipAdjustment(state, seat, combo, false);

  if (!state.trick) {
    score += combo.size * 2.5;
    if (combo.type === 'single') score -= 5;
    if (combo.bomb) score -= 8;
  }

  const next = nextActiveAfter(state, seat);
  if (next >= 0) {
    const nextPartner = next === partnerOf(seat);
    const nextCount = activeCount(state, next);
    if (!nextPartner && nextCount <= 2) score += combo.bomb ? 12 : 6;
    if (nextPartner && nextCount <= 2) score -= 5;
  }

  if (aiLevel === 'companion') {
    if (combo.bomb) score -= 22;
    if (combo.type === 'single' && combo.rank >= 15) score -= 20;
  }

  if (aiLevel === 'hard') {
    const control = unseenHigher(state, seat, combo, level);
    if (control === 0 && combo.size <= 3) score += 9;
    if (control === 0 && combo.type === 'full-house') score += 5;
    if (combo.bomb && combo.tier >= 5.5) score += 2;
    if (wilds === 0 && remaining.length <= 6) score += 3;
  }

  return score;
}

function passScore(state: GameState, seat: number, level: number): number {
  let score = handShape(state.hands[seat], level);
  score += partnershipAdjustment(state, seat, null, true);
  const opponents = [0, 1, 2, 3].filter((item) => teamOf(item) !== teamOf(seat));
  if (opponents.some((item) => activeCount(state, item) <= 1)) score -= 18;
  const partner = partnerOf(seat);
  if (state.trick?.seat === partner && activeCount(state, partner) <= 1) score += 18;
  return score;
}

function chooseFromScores<T>(entries: { value: T; score: number }[], rng: Rng, tieWindow = 0.001): T | null {
  if (entries.length === 0) return null;
  const best = Math.max(...entries.map((entry) => entry.score));
  const top = entries.filter((entry) => entry.score >= best - tieWindow);
  return top[Math.floor(rng() * top.length)]?.value ?? top[0].value;
}

function lowestPlay(plays: Combo[]): Combo {
  return plays.slice().sort((a, b) => comboStrength(a) - comboStrength(b) || a.rank - b.rank)[0];
}

function emptyHandPlay(plays: Combo[], hand: readonly Card[]): Combo | null {
  const handSize = hand.length;
  return plays.find((combo) => combo.cards.length === handSize) ?? null;
}

export function chooseAiAction(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng = Math.random,
): PlayerAction | null {
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  if (state.finish.includes(seat) || state.hands[seat].length === 0) return null;
  const plays = legalPlays(state, seat);
  const canPass = state.trick !== null;

  if (plays.length === 0) return canPass ? { type: 'pass' } : null;

  const finisher = emptyHandPlay(plays, state.hands[seat]);
  if (finisher) return { type: 'play', cards: ids(finisher.cards) };

  if (level === 'easy') {
    if (canPass && rng() < 0.24) return { type: 'pass' };
    const low = plays
      .slice()
      .sort((a, b) => comboStrength(a) - comboStrength(b) || a.rank - b.rank)
      .slice(0, Math.min(4, plays.length));
    if (rng() < 0.58) return { type: 'play', cards: ids(low[0].cards) };
    const pick = low[Math.floor(rng() * low.length)] ?? low[0];
    return { type: 'play', cards: ids(pick.cards) };
  }

  const choices: { value: PlayerAction; score: number }[] = plays.map((combo) => ({
    value: { type: 'play', cards: ids(combo.cards) },
    score: playScore(state, seat, combo, state.levelRank, level),
  }));
  if (canPass) {
    choices.push({ value: { type: 'pass' }, score: passScore(state, seat, state.levelRank) });
  }

  if (level === 'companion') {
    const partnerWinning = state.trick?.seat === partnerOf(seat);
    if (canPass && partnerWinning && rng() < 0.82) return { type: 'pass' };
    if (canPass && rng() < 0.1) return { type: 'pass' };
  }

  if (level === 'hard') {
    // One deterministic step of public-information lookahead for the top three
    // candidates. It never samples or reads another hand.
    const top = choices.slice().sort((a, b) => b.score - a.score).slice(0, 3);
    const refined = top.map((choice) => {
      if (choice.value.type === 'pass') return choice;
      const applied = play(state, seat, choice.value.cards);
      if (!applied.ok) return { value: choice.value, score: -Infinity };
      if (applied.state.phase !== 'playing') {
        return { value: choice.value, score: choice.score + 500 };
      }
      const nextTurn = applied.state.turn;
      if (nextTurn < 0) return { value: choice.value, score: choice.score + 500 };
      const nextPartner = nextTurn === partnerOf(seat);
      let bonus = 0;
      if (nextPartner) bonus += 6;
      if (activeCount(applied.state, nextTurn) <= 2 && !nextPartner) bonus += 8;
      if (applied.state.finish.includes(seat)) bonus += 500;
      return { value: choice.value, score: choice.score + bonus };
    });
    return chooseFromScores(refined, rng, 0.001);
  }

  return chooseFromScores(choices, rng, level === 'normal' ? 4 : 0.5);
}

/** A legal fallback for a disconnected LAN guest. */
export function fallbackAction(state: GameState, seat: number): PlayerAction | null {
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  const plays = legalPlays(state, seat);
  if (plays.length > 0) return { type: 'play', cards: ids(lowestPlay(plays).cards) };
  if (state.trick) return { type: 'pass' };
  return null;
}

/** The hand-aware card an AI winner returns after tribute. */
export function tributeReturn(hand: readonly Card[], level: number): Card {
  return chooseReturnCard(hand, level);
}
