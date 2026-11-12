/**
 * Rummy 500 engine.
 *
 * Pure rules: no DOM, no clock, no network and no Math.random. Every shuffle
 * takes an injected random function. The rules follow 500 Rummy / Rummy 500:
 * one 52-card deck, 13 cards each for two players and 7 for three or four,
 * open melds, lay-offs, buried discard takes, ace high or low, and scoring of
 * melded cards minus cards left in hand until a player reaches 500.
 */

export const SUITS = ['S', 'H', 'D', 'C'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type Card = string;

export type Phase = 'draw' | 'meld' | 'round-over' | 'game-over';
export type RoundEndReason = 'went-out' | 'stock-empty';
export type Rng = () => number;

export interface Player {
  name: string;
  hand: Card[];
  score: number;
}

export interface MeldCard {
  card: Card;
  by: number;
}

export interface Meld {
  id: number;
  kind: 'set' | 'run';
  owner: number;
  rank: Rank | null;
  suit: Suit | null;
  /** True when an ace is used as the low card of the run. */
  aceLow: boolean;
  cards: MeldCard[];
}

export interface Drawn {
  card: Card;
  from: 'stock' | 'discard';
  taken: Card[];
}

export interface RoundReport {
  melded: number[];
  deadwood: number[];
  scores: number[];
  totals: number[];
  reason: RoundEndReason;
  wentOut: number | null;
  tie: boolean;
}

export interface GameState {
  players: Player[];
  stock: Card[];
  discard: Card[];
  melds: Meld[];
  turn: number;
  dealer: number;
  phase: Phase;
  round: number;
  drawn: Drawn | null;
  mustMeld: Card | null;
  report: RoundReport | null;
  winner: number | null;
  target: number;
  version: number;
}

export type GameAction =
  | { type: 'draw-stock' }
  | { type: 'take-discard'; index: number }
  | { type: 'meld'; cards: Card[] }
  | { type: 'layoff'; card: Card; meldId: number }
  | { type: 'discard'; card: Card };

export type ActionError =
  | 'game-over'
  | 'round-over'
  | 'wrong-phase'
  | 'wrong-turn'
  | 'bad-index'
  | 'not-in-hand'
  | 'bad-meld'
  | 'bad-layoff'
  | 'cannot-use-discard'
  | 'must-meld'
  | 'unknown';

export interface ActionResult {
  ok: boolean;
  state: GameState;
  error?: ActionError;
}

export interface MeldAnalysis {
  kind: 'set' | 'run';
  rank: Rank | null;
  suit: Suit | null;
  aceLow: boolean;
  cards: Card[];
}

export interface PlayerView {
  seat: number;
  name: string;
  handCount: number;
  score: number;
  isTurn: boolean;
}

export interface SeatView {
  seat: number;
  playerName: string;
  players: PlayerView[];
  hand: Card[];
  stockCount: number;
  discard: Card[];
  takeable: boolean[];
  melds: Meld[];
  turn: number;
  phase: Phase;
  drawn: Drawn | null;
  mustMeld: Card | null;
  round: number;
  dealer: number;
  target: number;
  report: RoundReport | null;
  winner: number | null;
  version: number;
  canAct: boolean;
  canDrawStock: boolean;
  canDiscard: boolean;
  handPoints: number;
  meldedPoints: number;
}

const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

export function rankOf(card: Card): Rank {
  return card[0] as Rank;
}

export function rankValue(rank: Rank): number {
  if (rank === 'A') return 14;
  if (rank === 'T') return 10;
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return 13;
  return Number(rank);
}

export function cardValue(card: Card, aceLow = false): number {
  const rank = rankOf(card);
  if (rank === 'A') return aceLow ? 1 : 15;
  if (rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

export function handValue(hand: Card[]): number {
  return hand.reduce((sum, card) => sum + cardValue(card), 0);
}

export function handSize(playerCount: number): number {
  if (playerCount === 2) return 13;
  if (playerCount === 3 || playerCount === 4) return 7;
  throw new Error('Rummy 500 supports 2 to 4 players');
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[], rng: Rng): Card[] {
  const copy = deck.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const raw = Math.floor(rng() * (index + 1));
    const swap = Math.max(0, Math.min(index, raw));
    const value = copy[index];
    copy[index] = copy[swap];
    copy[swap] = value;
  }
  return copy;
}

function sortValue(card: Card): number {
  const rank = rankOf(card);
  return rank === 'A' ? 1 : rankValue(rank);
}

export function sortHand(hand: Card[]): Card[] {
  return hand.slice().sort((a, b) => {
    const suitDiff = SUIT_ORDER[suitOf(a)] - SUIT_ORDER[suitOf(b)];
    if (suitDiff !== 0) return suitDiff;
    return sortValue(a) - sortValue(b);
  });
}

function uniqueCards(cards: Card[]): boolean {
  return new Set(cards).size === cards.length;
}

function consecutiveValues(values: number[]): boolean {
  if (values.length < 3) return false;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] !== values[index - 1] + 1) return false;
  }
  return true;
}

function runValue(card: Card, aceLow: boolean): number {
  const rank = rankOf(card);
  if (rank === 'A') return aceLow ? 1 : 14;
  return rankValue(rank);
}

/**
 * Recognise a complete set or run. When a full A-to-K run can be read either
 * way, the ace is treated as low (the classic 500 Rummy reading).
 */
export function analyzeMeld(cards: Card[]): MeldAnalysis | null {
  if (!Array.isArray(cards) || cards.length < 3 || cards.length > 13) return null;
  if (!uniqueCards(cards)) return null;

  const firstRank = rankOf(cards[0]);
  if (
    cards.length <= 4 &&
    cards.every((card) => rankOf(card) === firstRank) &&
    new Set(cards.map((card) => suitOf(card))).size === cards.length
  ) {
    return {
      kind: 'set',
      rank: firstRank,
      suit: null,
      aceLow: false,
      cards: cards.slice().sort((a, b) => SUIT_ORDER[suitOf(a)] - SUIT_ORDER[suitOf(b)]),
    };
  }

  const firstSuit = suitOf(cards[0]);
  if (!cards.every((card) => suitOf(card) === firstSuit)) return null;

  const lowValues = cards
    .map((card) => (rankOf(card) === 'A' ? 1 : rankValue(rankOf(card))))
    .sort((a, b) => a - b);
  const highValues = cards
    .map((card) => rankValue(rankOf(card)))
    .sort((a, b) => a - b);
  const lowOk = consecutiveValues(lowValues);
  const highOk = consecutiveValues(highValues);
  if (!lowOk && !highOk) return null;

  const hasAce = cards.some((card) => rankOf(card) === 'A');
  const hasTwo = cards.some((card) => rankOf(card) === '2');
  const hasThree = cards.some((card) => rankOf(card) === '3');
  const aceLow = hasAce && lowOk && (!highOk || (hasTwo && hasThree));

  return {
    kind: 'run',
    rank: null,
    suit: firstSuit,
    aceLow,
    cards: cards
      .slice()
      .sort((a, b) => runValue(a, aceLow) - runValue(b, aceLow)),
  };
}

export function meldCardValue(meld: Meld, card: Card): number {
  if (meld.kind === 'run' && rankOf(card) === 'A' && meld.aceLow) return 1;
  return cardValue(card);
}

export function meldPoints(meld: Meld): number {
  return meld.cards.reduce((sum, item) => sum + meldCardValue(meld, item.card), 0);
}

export function meldPointsFor(state: GameState, player: number): number {
  return state.melds.reduce(
    (sum, meld) =>
      sum +
      meld.cards.reduce(
        (meldSum, item) => (item.by === player ? meldSum + meldCardValue(meld, item.card) : meldSum),
        0,
      ),
    0,
  );
}

export function roundScoreFor(state: GameState, player: number): number {
  return meldPointsFor(state, player) - handValue(state.players[player]?.hand ?? []);
}

/**
 * Add one card to a meld, preserving the run's ace position. Returns a new
 * meld, or null when the card does not fit.
 */
function extendMeld(meld: Meld, card: Card, by: number): Meld | null {
  if (meld.cards.some((item) => item.card === card)) return null;

  if (meld.kind === 'set') {
    if (meld.cards.length >= 4) return null;
    if (rankOf(card) !== meld.rank) return null;
    if (meld.cards.some((item) => suitOf(item.card) === suitOf(card))) return null;
    return {
      ...meld,
      cards: [...meld.cards, { card, by }].sort(
        (a, b) => SUIT_ORDER[suitOf(a.card)] - SUIT_ORDER[suitOf(b.card)],
      ),
    };
  }

  if (suitOf(card) !== meld.suit) return null;
  const values = meld.cards.map((item) => runValue(item.card, meld.aceLow));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const rank = rankOf(card);

  let nextValue: number | null = null;
  let nextAceLow = meld.aceLow;
  if (rank === 'A') {
    // Prefer the high placement when both ends are open (the player scores 15).
    if (high + 1 === 14) {
      nextValue = 14;
      nextAceLow = false;
    } else if (low - 1 === 1) {
      nextValue = 1;
      nextAceLow = true;
    }
  } else {
    const value = rankValue(rank);
    if (value === low - 1 || value === high + 1) {
      nextValue = value;
      nextAceLow = meld.aceLow;
    }
  }
  if (nextValue === null) return null;

  const cards = [...meld.cards, { card, by }].sort(
    (a, b) => runValue(a.card, nextAceLow) - runValue(b.card, nextAceLow),
  );
  return { ...meld, aceLow: nextAceLow, cards };
}

export function meldAcceptsCard(meld: Meld, card: Card): boolean {
  return extendMeld(meld, card, 0) !== null;
}

export function sortActionCards(action: { type: 'meld'; cards: Card[] }): Card[] {
  return action.cards.slice().sort();
}

/** Generate every legal new meld from the current hand. */
export function legalMeldActions(state: GameState): { type: 'meld'; cards: Card[] }[] {
  if (state.phase !== 'meld') return [];
  const hand = state.players[state.turn]?.hand ?? [];
  const actions: { type: 'meld'; cards: Card[] }[] = [];
  const seen = new Set<string>();
  const add = (cards: Card[]) => {
    const analysis = analyzeMeld(cards);
    if (!analysis) return;
    const key = analysis.cards.slice().sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    actions.push({ type: 'meld', cards: analysis.cards });
  };

  const byRank = new Map<Rank, Card[]>();
  for (const card of hand) {
    const list = byRank.get(rankOf(card)) ?? [];
    list.push(card);
    byRank.set(rankOf(card), list);
  }
  for (const list of byRank.values()) {
    if (list.length === 4) add(list.slice());
    if (list.length >= 3) {
      for (let a = 0; a < list.length - 2; a += 1) {
        for (let b = a + 1; b < list.length - 1; b += 1) {
          for (let c = b + 1; c < list.length; c += 1) {
            add([list[a], list[b], list[c]]);
          }
        }
      }
    }
  }

  for (const suit of SUITS) {
    const suitCards = hand.filter((card) => suitOf(card) === suit);
    if (suitCards.length < 3) continue;
    const byValue = new Map<number, Card>();
    for (const card of suitCards) {
      if (rankOf(card) === 'A') {
        byValue.set(1, card);
        byValue.set(14, card);
      } else {
        byValue.set(rankValue(rankOf(card)), card);
      }
    }
    for (let start = 1; start <= 12; start += 1) {
      for (let end = start + 2; end <= 14; end += 1) {
        const cards: Card[] = [];
        let complete = true;
        for (let value = start; value <= end; value += 1) {
          const card = byValue.get(value);
          if (!card) {
            complete = false;
            break;
          }
          if (!cards.includes(card)) cards.push(card);
        }
        if (complete && cards.length === end - start + 1) add(cards);
      }
    }
  }

  return actions.sort((a, b) => b.cards.length - a.cards.length || a.cards.join().localeCompare(b.cards.join()));
}

export function legalLayoffActions(state: GameState): { type: 'layoff'; card: Card; meldId: number }[] {
  if (state.phase !== 'meld') return [];
  const hand = state.players[state.turn]?.hand ?? [];
  const actions: { type: 'layoff'; card: Card; meldId: number }[] = [];
  for (const card of hand) {
    for (const meld of state.melds) {
      if (meldAcceptsCard(meld, card)) actions.push({ type: 'layoff', card, meldId: meld.id });
    }
  }
  return actions;
}

export function canTakeDiscard(state: GameState, index: number): boolean {
  if (state.phase !== 'draw') return false;
  if (!Number.isInteger(index) || index < 0 || index >= state.discard.length) return false;
  const player = state.players[state.turn];
  if (!player) return false;
  const chosen = state.discard[index];
  const hand = [...player.hand, ...state.discard.slice(index)];
  if (state.melds.some((meld) => meldAcceptsCard(meld, chosen))) return true;
  for (let a = 0; a < hand.length - 1; a += 1) {
    for (let b = a + 1; b < hand.length; b += 1) {
      if (hand[a] === chosen || hand[b] === chosen) continue;
      if (suitOf(hand[a]) !== suitOf(hand[b])) continue;
      if (analyzeMeld([chosen, hand[a], hand[b]])) return true;
    }
  }
  const sameRank = hand.filter((card) => card !== chosen && rankOf(card) === rankOf(chosen));
  return sameRank.length >= 2;
}

export function takeableDiscardIndexes(state: GameState): boolean[] {
  if (state.phase !== 'draw') return state.discard.map(() => false);
  return state.discard.map((_, index) => canTakeDiscard(state, index));
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player, hand: player.hand.slice() })),
    stock: state.stock.slice(),
    discard: state.discard.slice(),
    melds: state.melds.map((meld) => ({ ...meld, cards: meld.cards.slice() })),
    drawn: state.drawn ? { ...state.drawn, taken: state.drawn.taken.slice() } : null,
    report: state.report
      ? {
          ...state.report,
          melded: state.report.melded.slice(),
          deadwood: state.report.deadwood.slice(),
          scores: state.report.scores.slice(),
          totals: state.report.totals.slice(),
        }
      : null,
  };
}

function finishRound(state: GameState, reason: RoundEndReason): GameState {
  if (state.phase !== 'draw' && state.phase !== 'meld') return state;
  const melded = state.players.map((_, seat) => meldPointsFor(state, seat));
  const deadwood = state.players.map((player) => handValue(player.hand));
  const scores = melded.map((value, seat) => value - deadwood[seat]);
  const players = state.players.map((player, seat) => ({
    ...player,
    score: player.score + scores[seat],
  }));
  const totals = players.map((player) => player.score);
  const top = Math.max(...totals);
  const leaders = totals
    .map((score, seat) => (score === top ? seat : -1))
    .filter((seat) => seat >= 0);
  const hitTarget = top >= state.target;
  const tie = hitTarget && leaders.length > 1;
  const gameOver = hitTarget && leaders.length === 1;
  const wentOut = state.players.findIndex((player) => player.hand.length === 0);

  return {
    ...state,
    players,
    phase: gameOver ? 'game-over' : 'round-over',
    winner: gameOver ? leaders[0] : null,
    drawn: null,
    mustMeld: null,
    report: {
      melded,
      deadwood,
      scores,
      totals,
      reason,
      wentOut: wentOut >= 0 ? wentOut : null,
      tie,
    },
    version: state.version + 1,
  };
}

function applyDrawStock(state: GameState): ActionResult {
  if (state.phase !== 'draw') return { ok: false, state, error: 'wrong-phase' };
  if (state.stock.length === 0) {
    return { ok: true, state: finishRound(state, 'stock-empty') };
  }
  const next = cloneState(state);
  const card = next.stock.pop();
  if (!card) return { ok: false, state, error: 'unknown' };
  next.players[next.turn].hand = sortHand([...next.players[next.turn].hand, card]);
  next.phase = 'meld';
  next.drawn = { card, from: 'stock', taken: [card] };
  next.mustMeld = null;
  next.version += 1;
  return { ok: true, state: next };
}

function applyTakeDiscard(state: GameState, index: number): ActionResult {
  if (state.phase !== 'draw') return { ok: false, state, error: 'wrong-phase' };
  if (!Number.isInteger(index) || index < 0 || index >= state.discard.length) {
    return { ok: false, state, error: 'bad-index' };
  }
  if (!canTakeDiscard(state, index)) {
    return { ok: false, state, error: 'cannot-use-discard' };
  }
  const next = cloneState(state);
  const taken = next.discard.slice(index);
  const chosen = taken[0];
  next.discard = next.discard.slice(0, index);
  next.players[next.turn].hand = sortHand([...next.players[next.turn].hand, ...taken]);
  next.phase = 'meld';
  next.drawn = { card: chosen, from: 'discard', taken };
  next.mustMeld = chosen;
  next.version += 1;
  return { ok: true, state: next };
}

function applyMeld(state: GameState, cards: Card[]): ActionResult {
  if (state.phase !== 'meld') return { ok: false, state, error: 'wrong-phase' };
  if (!Array.isArray(cards) || !uniqueCards(cards)) return { ok: false, state, error: 'bad-meld' };
  const hand = state.players[state.turn].hand;
  if (!cards.every((card) => hand.includes(card))) return { ok: false, state, error: 'not-in-hand' };
  const analysis = analyzeMeld(cards);
  if (!analysis) return { ok: false, state, error: 'bad-meld' };

  const next = cloneState(state);
  const player = next.players[next.turn];
  player.hand = player.hand.filter((card) => !cards.includes(card));
  const id = next.melds.reduce((max, meld) => Math.max(max, meld.id), 0) + 1;
  next.melds.push({
    id,
    kind: analysis.kind,
    owner: next.turn,
    rank: analysis.rank,
    suit: analysis.suit,
    aceLow: analysis.aceLow,
    cards: analysis.cards.map((card) => ({ card, by: next.turn })),
  });
  if (next.mustMeld && cards.includes(next.mustMeld)) next.mustMeld = null;
  next.drawn = null;
  next.version += 1;
  if (player.hand.length === 0) return { ok: true, state: finishRound(next, 'went-out') };
  return { ok: true, state: next };
}

function applyLayoff(state: GameState, card: Card, meldId: number): ActionResult {
  if (state.phase !== 'meld') return { ok: false, state, error: 'wrong-phase' };
  const player = state.players[state.turn];
  if (!player.hand.includes(card)) return { ok: false, state, error: 'not-in-hand' };
  const meld = state.melds.find((item) => item.id === meldId);
  if (!meld) return { ok: false, state, error: 'bad-layoff' };
  const extended = extendMeld(meld, card, state.turn);
  if (!extended) return { ok: false, state, error: 'bad-layoff' };

  const next = cloneState(state);
  const nextPlayer = next.players[next.turn];
  nextPlayer.hand = nextPlayer.hand.filter((item) => item !== card);
  next.melds = next.melds.map((item) => (item.id === meldId ? extended : item));
  if (next.mustMeld === card) next.mustMeld = null;
  next.drawn = null;
  next.version += 1;
  if (nextPlayer.hand.length === 0) return { ok: true, state: finishRound(next, 'went-out') };
  return { ok: true, state: next };
}

function applyDiscard(state: GameState, card: Card): ActionResult {
  if (state.phase !== 'meld') return { ok: false, state, error: 'wrong-phase' };
  const player = state.players[state.turn];
  if (!player.hand.includes(card)) return { ok: false, state, error: 'not-in-hand' };
  if (state.mustMeld) return { ok: false, state, error: 'must-meld' };

  const next = cloneState(state);
  const nextPlayer = next.players[next.turn];
  nextPlayer.hand = nextPlayer.hand.filter((item) => item !== card);
  next.discard = [...next.discard, card];
  next.drawn = null;
  next.mustMeld = null;
  next.version += 1;
  if (nextPlayer.hand.length === 0) return { ok: true, state: finishRound(next, 'went-out') };
  next.turn = (next.turn + 1) % next.players.length;
  next.phase = 'draw';
  return { ok: true, state: next };
}

export function applyAction(state: GameState, action: GameAction): ActionResult {
  if (state.phase === 'game-over') return { ok: false, state, error: 'game-over' };
  if (state.phase === 'round-over') return { ok: false, state, error: 'round-over' };
  switch (action.type) {
    case 'draw-stock':
      return applyDrawStock(state);
    case 'take-discard':
      return applyTakeDiscard(state, action.index);
    case 'meld':
      return applyMeld(state, action.cards);
    case 'layoff':
      return applyLayoff(state, action.card, action.meldId);
    case 'discard':
      return applyDiscard(state, action.card);
    default:
      return { ok: false, state, error: 'unknown' };
  }
}

export function applySeatAction(state: GameState, seat: number, action: GameAction): ActionResult {
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players.length) {
    return { ok: false, state, error: 'wrong-turn' };
  }
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  return applyAction(state, action);
}

function dealRound(
  players: Player[],
  dealer: number,
  round: number,
  target: number,
  rng: Rng,
  version: number,
): GameState {
  const count = players.length;
  const deck = shuffleDeck(makeDeck(), rng);
  const first = (dealer + 1) % count;
  const hands: Card[][] = players.map(() => []);
  for (let pick = 0; pick < handSize(count); pick += 1) {
    for (let offset = 0; offset < count; offset += 1) {
      const seat = (first + offset) % count;
      const card = deck.pop();
      if (card) hands[seat].push(card);
    }
  }
  const upcard = deck.pop();
  const discard = upcard ? [upcard] : [];
  return {
    players: players.map((player, seat) => ({
      ...player,
      hand: sortHand(hands[seat]),
    })),
    stock: deck,
    discard,
    melds: [],
    turn: first,
    dealer: ((dealer % count) + count) % count,
    phase: 'draw',
    round,
    drawn: null,
    mustMeld: null,
    report: null,
    winner: null,
    target,
    version,
  };
}

export function setupGame(
  names: string[],
  rng: Rng,
  dealer = names.length - 1,
  target = 500,
): GameState {
  if (names.length < 2 || names.length > 4) {
    throw new Error('Rummy 500 supports 2 to 4 players');
  }
  if (!Number.isFinite(target) || target <= 0) throw new Error('Target must be positive');
  const players: Player[] = names.map((name) => ({ name, hand: [], score: 0 }));
  const count = players.length;
  const firstDealer = ((dealer % count) + count) % count;
  return dealRound(players, firstDealer, 1, target, rng, 0);
}

export function nextRound(state: GameState, rng: Rng): ActionResult {
  if (state.phase === 'game-over') return { ok: false, state, error: 'game-over' };
  if (state.phase !== 'round-over') return { ok: false, state, error: 'wrong-phase' };
  const dealer = (state.dealer + 1) % state.players.length;
  const players = state.players.map((player) => ({ ...player, hand: [] as Card[] }));
  const next = dealRound(players, dealer, state.round + 1, state.target, rng, state.version + 1);
  return { ok: true, state: next };
}

export function view(state: GameState, seat: number): SeatView {
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players.length) {
    throw new Error('Seat out of range');
  }
  const canAct = state.turn === seat && (state.phase === 'draw' || state.phase === 'meld');
  const takeable = state.phase === 'draw' && canAct ? takeableDiscardIndexes(state) : state.discard.map(() => false);
  return {
    seat,
    playerName: state.players[seat].name,
    players: state.players.map((player, index) => ({
      seat: index,
      name: player.name,
      handCount: player.hand.length,
      score: player.score,
      isTurn: state.turn === index,
    })),
    hand: state.players[seat].hand.slice(),
    stockCount: state.stock.length,
    discard: state.discard.slice(),
    takeable,
    melds: state.melds.map((meld) => ({ ...meld, cards: meld.cards.map((item) => ({ ...item })) })),
    turn: state.turn,
    phase: state.phase,
    drawn: state.drawn ? { ...state.drawn, taken: state.drawn.taken.slice() } : null,
    mustMeld: state.mustMeld,
    round: state.round,
    dealer: state.dealer,
    target: state.target,
    report: state.report
      ? {
          ...state.report,
          melded: state.report.melded.slice(),
          deadwood: state.report.deadwood.slice(),
          scores: state.report.scores.slice(),
          totals: state.report.totals.slice(),
        }
      : null,
    winner: state.winner,
    version: state.version,
    canAct,
    canDrawStock: canAct && state.phase === 'draw',
    canDiscard: canAct && state.phase === 'meld' && state.mustMeld === null,
    handPoints: handValue(state.players[seat].hand),
    meldedPoints: meldPointsFor(state, seat),
  };
}
