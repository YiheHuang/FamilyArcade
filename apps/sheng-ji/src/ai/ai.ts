/**
 * Four Sheng Ji opponents and the reasoned hint.
 *
 * Every level is deterministic with an injected RNG. The AI sees its own hand,
 * public tricks, points and hand counts; it never reads another seat's real
 * cards. Legal-move generation may consult the full state for throw legality,
 * but the choice heuristics below use only public information.
 */
import {
  categoryOf,
  cardPower,
  countPairs,
  declarationOptions,
  isJoker,
  isLevelCard,
  isPair,
  isTractor,
  isTrump,
  leftOf,
  legalMoves,
  partnerOf,
  play,
  pointValue,
  rankValue,
  teamOf,
  trickPoints,
  trickWinner,
  trumpPower,
  type BidOption,
  type Card,
  type GameState,
  type NormalRank,
  type Rng,
  type Seat,
  type TrumpSuit,
} from '../game/sheng-ji';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export type HintReason =
  | 'hintWinPoints'
  | 'hintPartner'
  | 'hintRuff'
  | 'hintThrow'
  | 'hintFollow'
  | 'hintLead'
  | 'hintBuryVoid'
  | 'hintBuryPoints'
  | 'hintDeclareSuit'
  | 'hintDeclareNt'
  | 'hintPassBid';

export interface DeclarationChoice {
  type: 'declare';
  option: BidOption;
}
export interface PassChoice {
  type: 'pass';
}
export type DeclarationAction = DeclarationChoice | PassChoice;

export interface Hint {
  type: 'play' | 'declare' | 'bury' | 'pass';
  cards: string[];
  option?: BidOption;
  reason: HintReason;
}

function rand(rng: Rng): number {
  const value = rng();
  return Number.isFinite(value) ? Math.max(0, Math.min(0.999999, value)) : 0;
}

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rand(rng) * items.length))];
}

function ids(cards: Card[]): string[] {
  return cards.map((card) => card.id);
}

function suitCards(hand: Card[], suit: Exclude<TrumpSuit, 'NT'>): Card[] {
  return hand.filter((card) => card.suit === suit);
}

function countTractors(cards: Card[], levelRank: NormalRank): number {
  let count = 0;
  for (const suit of ['S', 'H', 'C', 'D'] as const) {
    const suitHand = cards.filter((card) => card.suit === suit);
    const pairRanks = new Set<NormalRank>();
    const groups = new Map<NormalRank, number>();
    for (const card of suitHand) {
      if (isJoker(card) || isLevelCard(card, levelRank)) continue;
      if (typeof card.rank === 'string' && !['BJ', 'SJ'].includes(card.rank)) {
        groups.set(card.rank as NormalRank, (groups.get(card.rank as NormalRank) ?? 0) + 1);
      }
    }
    for (const [rank, amount] of groups) if (amount >= 2) pairRanks.add(rank);
    const sorted = [...pairRanks].sort((a, b) => rankValue(a) - rankValue(b));
    let run = 0;
    let previous = -2;
    for (const rank of sorted) {
      if (rankValue(rank) === previous + 1) run += 1;
      else run = 1;
      if (run >= 2) count += 1;
      previous = rankValue(rank);
    }
  }
  return count;
}

function declarationScore(
  hand: Card[],
  option: BidOption,
  levels: [number, number],
  seat: Seat,
): number {
  const team = teamOf(seat);
  const rank = (['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const)[
    levels[team]
  ];
  const jokers = hand.filter(isJoker).length;
  const levelCards = hand.filter((card) => isLevelCard(card, rank)).length;
  const pairs = countPairs(hand);
  const tractors = countTractors(hand, rank);
  if (option.kind === 'nt') {
    return jokers * 7 + pairs * 2.5 + tractors * 5 + levelCards * 2 + hand.filter((card) => card.rank === 'A').length * 2;
  }
  const suit = option.suit as Exclude<TrumpSuit, 'NT'>;
  const trumps = hand.filter(
    (card) => card.suit === suit || isJoker(card) || isLevelCard(card, rank),
  ).length;
  const suitHigh = suitCards(hand, suit).filter(
    (card) => typeof card.rank === 'string' && ['A', 'K', 'Q'].includes(card.rank),
  ).length;
  const suitPairs = countPairs(suitCards(hand, suit));
  const suitTractors = countTractors(suitCards(hand, suit), rank);
  const pointKeep = hand.reduce((sum, card) => sum + pointValue(card), 0);
  return (
    trumps * 2 +
    suitHigh * 2.2 +
    suitPairs * 2.5 +
    suitTractors * 4 +
    jokers * 5 +
    levelCards * 2 +
    (option.strength === 2 ? 9 : 0) +
    (option.strength === 3 ? 14 : 0) +
    pointKeep * 0.03
  );
}

export function chooseDeclaration(
  state: GameState,
  seat: Seat,
  level: AiLevel,
  rng: Rng,
): DeclarationAction {
  const options = declarationOptions(state, seat).filter(
    (option) => !state.declaration || option.strength > state.declaration.strength,
  );
  if (options.length === 0) return { type: 'pass' };

  const scored = options.map((option) => ({
    option,
    score:
      declarationScore(state.hands[seat], option, state.levels, seat) +
      (state.declaration && teamOf(state.declaration.seat) === teamOf(seat) ? -8 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (level === 'easy') {
    if (rand(rng) < 0.3) return { type: 'pass' };
    return { type: 'declare', option: pick(options, rng) };
  }
  if (level === 'companion') {
    if (best.score < 34) return { type: 'pass' };
    return { type: 'declare', option: best.option };
  }
  if (level === 'normal') {
    if (!state.declaration && best.score < 24) return { type: 'pass' };
    if (state.declaration && best.score < 30 + state.declaration.strength * 5) return { type: 'pass' };
    return { type: 'declare', option: best.option };
  }
  if (!state.declaration && best.score < 20) return { type: 'pass' };
  if (state.declaration && best.score < 26 + state.declaration.strength * 4) return { type: 'pass' };
  return { type: 'declare', option: best.option };
}

function keepValue(card: Card, hand: Card[], trump: TrumpSuit, levelRank: NormalRank): number {
  const isT = isTrump(card, trump, levelRank);
  let value = 0;
  if (card.rank === 'BJ') value += 1000;
  else if (card.rank === 'SJ') value += 900;
  else if (isLevelCard(card, levelRank)) value += 760;
  else if (isT) value += 430 + rankValue(card.rank) * 2;
  else value += rankValue(card.rank) * 2;
  value += pointValue(card) * 24;
  const same = hand.filter((other) => other.suit === card.suit && other.rank === card.rank);
  if (same.length >= 2) value += 110;
  if (!isT && isNormalSuit(card.suit)) {
    const suitSize = hand.filter((other) => other.suit === card.suit).length;
    if (suitSize <= 3) value -= 36;
  }
  if (isT && card.rank !== 'BJ' && card.rank !== 'SJ') value += 25;
  return value;
}

function isNormalSuit(suit: string): boolean {
  return suit === 'S' || suit === 'H' || suit === 'C' || suit === 'D';
}

export function chooseBury(
  state: GameState,
  seat: Seat,
  level: AiLevel,
  rng: Rng,
): string[] {
  const hand = state.hands[seat];
  if (hand.length !== 33) return [];
  const trump = state.trump ?? 'NT';
  const scored = hand.map((card) => ({
    card,
    keep: keepValue(card, hand, trump, state.levelRank),
  }));
  scored.sort((a, b) => a.keep - b.keep || a.card.id.localeCompare(b.card.id));
  const chosen = scored.slice(0, 8).map((item) => item.card);
  if (level === 'easy' && rand(rng) < 0.35) {
    const shuffled = scored.slice(0, 12).slice().sort(() => rand(rng) - 0.5);
    return shuffled.slice(0, 8).map((item) => item.card.id);
  }
  if (level === 'hard') {
    // Try one swap that turns a short plain suit into a void without burying a
    // point card or a joker.
    const suitCounts = new Map<string, number>();
    for (const card of hand) suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
    for (const [suit, count] of suitCounts) {
      if (!isNormalSuit(suit) || count > 3) continue;
      const suitCardsInBury = chosen.filter((card) => card.suit === suit);
      if (suitCardsInBury.length < count) continue;
      const chosenIds = new Set(chosen.map((card) => card.id));
      const outside = scored.find(
        (item) =>
          !chosenIds.has(item.card.id) &&
          item.card.suit !== suit &&
          pointValue(item.card) === 0 &&
          !isJoker(item.card),
      );
      if (!outside) continue;
      const replacement = chosen.find(
        (card) => card.suit === suit && pointValue(card) === 0 && !isJoker(card),
      );
      if (!replacement) continue;
      const result = chosen.filter((card) => card.id !== replacement.id);
      result.push(outside.card);
      return result.map((card) => card.id);
    }
  }
  return chosen.map((card) => card.id);
}

interface ScoreContext {
  state: GameState;
  seat: Seat;
  level: AiLevel;
  rng: Rng;
  trump: TrumpSuit;
  lead: ReturnType<typeof analyseLeadLite>;
  partner: Seat;
  team: number;
  tablePoints: number;
  currentBest: Seat;
  lastToPlay: boolean;
}

function analyseLeadLite(cards: Card[], trump: TrumpSuit, levelRank: NormalRank) {
  if (cards.length === 0) return null;
  const category = categoryOf(cards[0], trump, levelRank);
  const allSame = cards.every((card) => categoryOf(card, trump, levelRank) === category);
  if (!allSame) return null;
  return {
    category,
    size: cards.length,
    pairNeed: countPairs(cards),
    power: Math.max(...cards.map((card) => cardPower(card, trump, levelRank))),
    tractor: isTractor(cards, trump, levelRank),
    pair: isPair(cards),
  };
}

function currentBestSeat(state: GameState, seat: Seat, candidate: Card[]): Seat {
  const trick = candidate.length > 0 ? [...state.currentTrick, { seat, cards: candidate }] : state.currentTrick;
  if (trick.length === 0) return seat;
  return trickWinner(trick, state.trump ?? 'NT', state.levelRank);
}

function cardPoints(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + pointValue(card), 0);
}

function scoreCandidate(context: ScoreContext, candidate: Card[]): number {
  const { state, seat, level, trump, partner, team } = context;
  const applied = play(state, seat, ids(candidate));
  if (!applied.ok) return -Infinity;
  const willFinish = state.currentTrick.length + 1 === 4;
  const tablePoints = context.tablePoints + cardPoints(candidate);
  const winningNow = currentBestSeat(state, seat, candidate);
  const winningTeam = teamOf(winningNow);
  const weWin = winningTeam === team;
  const partnerWins = winningNow === partner;
  const partnerWasWinning = context.currentBest === partner;
  const handSize = state.hands[seat].length;
  let score = 0;

  if (willFinish) {
    if (weWin) {
      score += tablePoints * 11 + 16;
      if (partnerWins) score += 8;
    } else {
      score -= tablePoints * 10 + 10;
    }
  } else {
    if (weWin) score += tablePoints * 2.4 + 4;
    else if (winningTeam !== team) score -= tablePoints * 1.8;
    if (partnerWins) score += 7;
  }

  // Partner cover: keep a winning partner in front, and feed point cards.
  if (partnerWasWinning) {
    if (winningNow === partner) {
      score += level === 'companion' ? 26 : 18;
    } else if (winningNow === seat) {
      score -= 30;
    }
  }

  // Trump economy: spend small trumps first, keep jokers and level cards.
  for (const card of candidate) {
    if (!isTrump(card, trump, state.levelRank)) continue;
    const power = trumpPower(card, trump, state.levelRank);
    const penalty = power >= 380 ? 34 : power >= 300 ? 16 : Math.max(0, (power - 200) * 0.08);
    score -= penalty * (level === 'companion' ? 1.5 : level === 'hard' ? 0.8 : 1);
  }

  // Points in a discard: feed a winning partner, never feed an opponent.
  if (!weWin && !partnerWins && tablePoints > 0) {
    score -= cardPoints(candidate) * 5;
  }
  if (partnerWins || (winningTeam === team && !weWin)) {
    score += cardPoints(candidate) * (partnerWasWinning ? 6 : 2.2);
  }

  // Leading: low cards from long suits; a safe throw is strong.
  if (state.currentTrick.length === 0) {
    const low = Math.min(...candidate.map((card) => cardPower(card, trump, state.levelRank)));
    score += (15 - Math.min(14, low)) * 0.7;
    if (candidate.length >= 2) {
      const isLeadThrow = !isPair(candidate) && !isTractor(candidate, trump, state.levelRank);
      if (isLeadThrow) {
        score += 8 + cardPoints(candidate) * 0.9;
        score += level === 'companion' ? -3 : 2;
      }
    }
    if (isTrump(candidate[0], trump, state.levelRank) && candidate.every((card) => isTrump(card, trump, state.levelRank))) {
      score -= 5;
    }
    if (handSize <= 6) score += candidate.length * 1.4;
  } else {
    // Ruffing: worth it when points are on the table, expensive otherwise.
    const lead = context.lead;
    if (lead && lead.category !== 'T' && candidate.every((card) => isTrump(card, trump, state.levelRank))) {
      score += tablePoints > 0 ? tablePoints * 1.7 - 4 : -8;
    }
  }

  // Point tracking: both teams want the point cards, but the declarers need 80.
  const declarerTeam = state.declarer === null ? null : teamOf(state.declarer);
  const ourPoints = state.points[team];
  if (declarerTeam === team && ourPoints >= 60 && tablePoints > 0) score += 4;
  if (declarerTeam !== null && declarerTeam !== team && state.points[declarerTeam] >= 60 && tablePoints > 0) {
    score += 5;
  }

  // A tiny deterministic jitter keeps equal choices from freezing the table.
  const jitter = level === 'easy' ? 14 : level === 'companion' ? 3 : 1.2;
  score += rand(context.rng) * jitter;

  if (level === 'companion') {
    // The companion avoids spending a joker or a level card on a small trick.
    if (candidate.some((card) => card.rank === 'BJ' || card.rank === 'SJ') && tablePoints === 0) {
      score -= 40;
    }
    if (candidate.some((card) => isLevelCard(card, state.levelRank)) && tablePoints === 0) {
      score -= 18;
    }
  }
  if (level === 'hard' && state.currentTrick.length > 0) {
    // A thin current win with opponents still to play is less safe. This uses
    // only the public trick and the size of our own play.
    const remaining = 4 - (state.currentTrick.length + 1);
    if (remaining > 0 && winningNow === seat) {
      const top = Math.max(...candidate.map((card) => cardPower(card, trump, state.levelRank)));
      const lead = context.lead;
      if (lead) {
        const margin = top - lead.power;
        if (margin < 6) score -= remaining * (6 - margin) * 0.4;
      }
    }
  }
  return score;
}

function refillContext(state: GameState, seat: Seat, level: AiLevel, rng: Rng): ScoreContext {
  const trump = state.trump ?? 'NT';
  const partner = partnerOf(seat);
  const lead = state.currentTrick.length
    ? analyseLeadLite(state.currentTrick[0].cards, trump, state.levelRank)
    : null;
  const tablePoints = trickPoints(
    state.currentTrick.flatMap((playItem) => playItem.cards),
  );
  const currentBest = state.currentTrick.length
    ? currentBestSeat(state, seat, [])
    : seat;
  return {
    state,
    seat,
    level,
    rng,
    trump,
    lead,
    partner,
    team: teamOf(seat),
    tablePoints,
    currentBest,
    lastToPlay: state.currentTrick.length === 3,
  };
}

export function choosePlay(
  state: GameState,
  seat: Seat,
  level: AiLevel,
  rng: Rng,
): string[] | null {
  if (state.phase !== 'play' || state.turn !== seat) return null;
  const candidates = legalMoves(state, seat);
  if (candidates.length === 0) return null;
  const context = refillContext(state, seat, level, rng);

  if (level === 'easy') {
    if (rand(rng) < 0.58) return ids(pick(candidates, rng));
    const scored = candidates.map((candidate) => ({ candidate, score: scoreCandidate(context, candidate) }));
    scored.sort((a, b) => b.score - a.score);
    return ids(pick(scored.slice(0, Math.min(3, scored.length)).map((item) => item.candidate), rng));
  }

  const scored = candidates.map((candidate) => ({ candidate, score: scoreCandidate(context, candidate) }));
  scored.sort((a, b) => b.score - a.score);
  if (level === 'companion') {
    // A gentle opponent still takes a clear point trick, but it will not dump a
    // big trump on an empty table.
    return ids(scored[0].candidate);
  }
  return ids(scored[0].candidate);
}

export function hintFor(state: GameState, seat: Seat): Hint | null {
  if (state.phase === 'declare') {
    const choice = chooseDeclaration(state, seat, 'hard', () => 0.42);
    if (choice.type === 'declare') {
      return {
        type: 'declare',
        cards: choice.option.cards.slice(),
        option: choice.option,
        reason: choice.option.kind === 'nt' ? 'hintDeclareNt' : 'hintDeclareSuit',
      };
    }
    return { type: 'pass', cards: [], reason: 'hintPassBid' };
  }
  if (state.phase === 'bury') {
    const cards = chooseBury(state, seat, 'hard', () => 0.37);
    const buried = state.hands[seat].filter((card) => cards.includes(card.id));
    const points = buried.reduce((sum, card) => sum + pointValue(card), 0);
    const suitCounts = new Map<string, number>();
    for (const card of state.hands[seat]) suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
    const voidSuit = [...suitCounts.entries()].some(
      ([suit, count]) => suit !== 'J' && count <= 3 && buried.filter((card) => card.suit === suit).length === count,
    );
    return { type: 'bury', cards, reason: voidSuit ? 'hintBuryVoid' : points > 0 ? 'hintBuryPoints' : 'hintBuryVoid' };
  }
  if (state.phase !== 'play' || state.turn !== seat) return null;
  const choice = choosePlay(state, seat, 'hard', () => 0.31);
  if (!choice) return null;
  const cards = state.hands[seat].filter((card) => choice.includes(card.id));
  const trump = state.trump ?? 'NT';
  const tablePoints = trickPoints(state.currentTrick.flatMap((playItem) => playItem.cards));
  const winningSeat = currentBestSeat(state, seat, cards);
  const partnerWinning = winningSeat === partnerOf(seat);
  const lead = state.currentTrick.length
    ? analyseLeadLite(state.currentTrick[0].cards, trump, state.levelRank)
    : null;
  if (partnerWinning && state.currentTrick.length > 0) {
    return { type: 'play', cards: choice, reason: 'hintPartner' };
  }
  if (lead && lead.category !== 'T' && cards.length > 0 && cards.every((card) => isTrump(card, trump, state.levelRank))) {
    return { type: 'play', cards: choice, reason: 'hintRuff' };
  }
  if (state.currentTrick.length === 0) {
    const isThrow = cards.length >= 2 && !isPair(cards) && !isTractor(cards, trump, state.levelRank);
    return { type: 'play', cards: choice, reason: isThrow ? 'hintThrow' : 'hintLead' };
  }
  if (tablePoints > 0 && winningSeat === seat) {
    return { type: 'play', cards: choice, reason: 'hintWinPoints' };
  }
  return { type: 'play', cards: choice, reason: 'hintFollow' };
}

/** A legal fallback for a dropped LAN seat: lowest legal play. */
export function fallbackPlay(state: GameState, seat: Seat): string[] | null {
  if (state.phase !== 'play' || state.turn !== seat) return null;
  const moves = legalMoves(state, seat);
  if (moves.length === 0) return null;
  const trump = state.trump ?? 'NT';
  moves.sort((a, b) => {
    const pa = Math.min(...a.map((card) => cardPower(card, trump, state.levelRank)));
    const pb = Math.min(...b.map((card) => cardPower(card, trump, state.levelRank)));
    return pa - pb;
  });
  return ids(moves[0]);
}

export function nextSeat(seat: Seat): Seat {
  return leftOf(seat);
}

export function pointCardsIn(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + pointValue(card), 0);
}
