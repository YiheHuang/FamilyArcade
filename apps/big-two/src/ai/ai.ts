/**
 * Four Big Two opponents. Every level is deterministic with an injected RNG and
 * sees only its own hand plus public counts and played cards.
 *
 * Companion is gentle and avoids stomping a short-handed child. Easy is loose.
 * Normal uses hand decomposition and saves high control cards. Hard adds danger
 * counting, safe multi-card leads, suit control and endgame pressure.
 */
import {
  decomposeHand,
  handControl,
  handUnits,
  legalCombos,
  pass,
  play,
  type Card,
  type Combo,
  type GameState,
  type PlayerAction,
  type Rng,
} from '../game/big-two';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

function ids(cards: Card[]): string[] {
  return cards.map((card) => card.id);
}

function others(state: GameState, seat: number): number[] {
  return state.hands.map((hand, index) => ({ hand, index }))
    .filter(({ index }) => index !== seat)
    .map(({ hand }) => hand.length);
}

function minOpponent(state: GameState, seat: number): number {
  return Math.min(...others(state, seat));
}

function nextCount(state: GameState, seat: number): number {
  for (let step = 1; step <= 4; step += 1) {
    const target = (seat + step) % 4;
    if (target !== seat && state.hands[target].length > 0) return state.hands[target].length;
  }
  return 13;
}

function groupSizes(hand: readonly Card[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const card of hand) map.set(card.rank, (map.get(card.rank) ?? 0) + 1);
  return map;
}

function breaksGroup(hand: readonly Card[], combo: Combo): boolean {
  const groups = groupSizes(hand);
  const rank = combo.cards[0].rank;
  const size = groups.get(rank) ?? 0;
  if (combo.size === 1 && size > 1) return true;
  if (combo.size === 2 && size > 2) return true;
  return false;
}

interface Scored {
  combo: Combo;
  score: number;
}

function quickLeadScore(hand: readonly Card[], combo: Combo): number {
  let score = 100 - combo.rank * 2.5 - combo.suit * 0.2;
  score += combo.size >= 2 ? 8 : 0;
  score += combo.category * 4;
  if (combo.rank >= 14) score -= 16;
  if (combo.rank === 15) score -= 24;
  if (breaksGroup(hand, combo)) score -= 9;
  if (combo.size >= 2) score += 4;
  return score;
}

function quickFollowScore(hand: readonly Card[], combo: Combo): number {
  let score = 100 - combo.rank * 2.8 - combo.suit * 0.4;
  score += combo.category * 3;
  if (combo.rank >= 14) score -= 12;
  if (combo.rank === 15) score -= 22;
  if (breaksGroup(hand, combo)) score -= 7;
  return score;
}

function quickScore(state: GameState, seat: number, combo: Combo): number {
  return state.trick ? quickFollowScore(state.hands[seat], combo) : quickLeadScore(state.hands[seat], combo);
}

function endgameBonus(state: GameState, seat: number, combo: Combo): number {
  const after = state.hands[seat].length - combo.size;
  const danger = minOpponent(state, seat);
  let score = 0;
  if (after === 0) score += 10000;
  if (after === 1) score += 30;
  if (danger <= 1) {
    // A single gives a one-card opponent a chance to go out; a multi-card
    // combination cannot be followed by a lone card.
    score += combo.size >= 2 ? 36 : -26;
  } else if (danger === 2) {
    score += combo.size >= 3 ? 18 : combo.size === 2 ? 5 : -4;
  }
  if (nextCount(state, seat) <= 2 && combo.size === 1) score -= 18;
  return score;
}

function playValue(state: GameState, seat: number, combo: Combo): number {
  const applied = play(state, seat, ids(combo.cards));
  if (!applied.ok) return -Infinity;
  if (applied.state.phase === 'round-over') {
    return 100000 + (applied.state.result?.gain ?? 0);
  }
  const hand = applied.state.hands[seat];
  const decomposition = decomposeValue(hand);
  let score = -decomposition * 28 - hand.length * 2.5 + handControl(hand) * 1.4;
  score += endgameBonus(state, seat, combo);
  if (state.trick === null) {
    if (combo.size === 1 && combo.rank >= 14 && hand.length > 3) score -= 18;
    if (combo.size === 1 && combo.rank >= 14 && hand.length <= 3) score += 8;
    if (combo.size >= 2) score += 5;
    if (combo.category >= 2) score += combo.category * 3;
    // Suit control: leading a suit where this hand still owns the top card is safe.
    score += suitControlLead(state, seat, combo);
  } else {
    if (combo.rank === 15 && hand.length > 1) score -= 16;
    if (combo.rank === 14 && hand.length > 2) score -= 7;
  }
  return score;
}

function decomposeValue(cards: Card[]): number {
  return Math.min(handUnits(cards), decomposeHand(cards).units);
}

function suitControlLead(state: GameState, seat: number, combo: Combo): number {
  if (combo.size !== 1) return 0;
  const suit = combo.cards[0].suit;
  const own = state.hands[seat];
  const topInSuit = own.filter((card) => card.suit === suit).sort((a, b) => b.rank - a.rank)[0];
  if (topInSuit && topInSuit.rank >= 13) return 5;
  const playedTop = state.discard.filter((card) => card.suit === suit && card.rank >= 14).length;
  return playedTop > 0 ? 2 : 0;
}

function passValue(state: GameState, seat: number): number {
  const applied = pass(state, seat);
  if (!applied.ok) return -Infinity;
  const hand = state.hands[seat];
  let score = -decomposeValue(hand) * 28 - hand.length * 2.5 + handControl(hand) * 1.4;
  const danger = minOpponent(state, seat);
  if (danger <= 1) score -= 18;
  if (state.trick && state.trick.seat !== seat && state.hands[state.trick.seat].length <= 2) {
    score -= 8;
  }
  return score + 3;
}

function chooseBest(options: Scored[], rng: Rng): Combo | null {
  if (options.length === 0) return null;
  const best = Math.max(...options.map((item) => item.score));
  const top = options.filter((item) => Math.abs(item.score - best) < 1e-9);
  return (top[Math.floor(rng() * top.length)] ?? top[0]).combo;
}

function easyAction(state: GameState, seat: number, combos: Combo[], rng: Rng): PlayerAction {
  if (state.trick && rng() < 0.24) return { type: 'pass' };
  if (rng() < 0.6) {
    const sorted = combos.slice().sort((a, b) => quickScore(state, seat, b) - quickScore(state, seat, a));
    const pick = sorted[Math.floor(rng() * Math.min(4, sorted.length))] ?? combos[0];
    return { type: 'play', cards: ids(pick.cards) };
  }
  const pick = combos[Math.floor(rng() * combos.length)] ?? combos[0];
  return { type: 'play', cards: ids(pick.cards) };
}

function companionAction(state: GameState, seat: number, combos: Combo[], rng: Rng): PlayerAction {
  const human = state.hands[0]?.length ?? 0;
  if (
    state.trick &&
    seat !== 0 &&
    human > 0 &&
    human <= 2 &&
    combos.every((combo) => combo.rank >= 14)
  ) {
    return { type: 'pass' };
  }
  if (state.trick && rng() < 0.16) return { type: 'pass' };
  const scored: Scored[] = combos.map((combo) => {
    let score = 100 - combo.rank * 4 - combo.suit * 0.5;
    score += combo.size >= 2 ? 6 : 0;
    if (combo.rank === 15) score -= 60;
    if (combo.rank === 14) score -= 20;
    if (breaksGroup(state.hands[seat], combo)) score -= 12;
    return { combo, score };
  });
  const pick = chooseBest(scored, rng) ?? combos[0];
  return { type: 'play', cards: ids(pick.cards) };
}

function normalAction(state: GameState, seat: number, combos: Combo[], rng: Rng): PlayerAction {
  const scored: Scored[] = combos.map((combo) => ({
    combo,
    score: playValue(state, seat, combo),
  }));
  const passScore = state.trick ? passValue(state, seat) : -Infinity;
  const bestCombo = chooseBest(scored, rng);
  if (!bestCombo) return state.trick ? { type: 'pass' } : { type: 'play', cards: [] };
  const comboScore = Math.max(...scored.map((item) => item.score));
  if (state.trick && passScore > comboScore + 2) return { type: 'pass' };
  // Small deliberate looseness keeps Normal from feeling robotic.
  if (state.trick && rng() < 0.05) {
    const pick = combos[Math.floor(rng() * combos.length)] ?? combos[0];
    return { type: 'play', cards: ids(pick.cards) };
  }
  return { type: 'play', cards: ids(bestCombo.cards) };
}

function hardAction(state: GameState, seat: number, combos: Combo[], rng: Rng): PlayerAction {
  const handSize = state.hands[seat].length;
  const out = combos.find((combo) => combo.cards.length === handSize);
  if (out) return { type: 'play', cards: ids(out.cards) };

  // Keep the search small: rank the cheap heuristic first, then spend the
  // decomposition lookahead on the most plausible plays.
  const ranked = combos
    .map((combo) => ({ combo, score: quickScore(state, seat, combo) }))
    .sort((a, b) => b.score - a.score);
  const shortlist = ranked.slice(0, 44);
  const scored: Scored[] = shortlist.map((item) => ({
    combo: item.combo,
    score: playValue(state, seat, item.combo),
  }));
  const bestScore = Math.max(...scored.map((item) => item.score));
  if (state.trick) {
    // Pass is always a real candidate; it is often correct in Big Two.
    const passScore = passValue(state, seat);
    if (passScore > bestScore + 1.5) return { type: 'pass' };
  }
  const best = chooseBest(scored, rng);
  if (!best) return state.trick ? { type: 'pass' } : { type: 'play', cards: ids(combos[0].cards) };
  return { type: 'play', cards: ids(best.cards) };
}

export function chooseAiAction(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng = Math.random,
): PlayerAction | null {
  if (state.phase !== 'playing' || state.turn !== seat) return null;
  if (state.hands[seat].length === 0) return null;
  const combos = legalCombos(state, seat);
  if (combos.length === 0) return state.trick ? { type: 'pass' } : null;

  const handSize = state.hands[seat].length;
  const winning = combos.find((combo) => combo.cards.length === handSize);
  if (winning) return { type: 'play', cards: ids(winning.cards) };

  if (level === 'easy') return easyAction(state, seat, combos, rng);
  if (level === 'companion') return companionAction(state, seat, combos, rng);
  if (level === 'normal') return normalAction(state, seat, combos, rng);
  return hardAction(state, seat, combos, rng);
}
