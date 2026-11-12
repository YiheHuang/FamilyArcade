/**
 * Zheng Shangyou (争上游) — a pure, deterministic engine for 3–6 players.
 *
 * Rules implemented (see docs/rules.md):
 * - one standard 52-card deck, no jokers, dealt as evenly as possible;
 * - rank order 3 low … Ace, 2 highest; suits never compare for play strength;
 * - the holder of 3♣ leads the first trick of every deal and must include 3♣;
 * - combinations: single, pair, triple, triple + single, triple + pair,
 *   straight of five or more (3–A), consecutive pairs (three or more), bomb;
 * - a follower beats the trick with the same type and length at a strictly
 *   higher rank, or with a bomb; bombs compare only with bombs;
 * - two consecutive passes clear the trick and return the lead to the last
 *   player who played (or the next active seat if that player went out);
 * - finish order runs upstream → second → … → downstream;
 * - points are +3 / +1 / −1 / −3 for four seats, scaled for other counts;
 * - the next deal pauses for tribute: the downstream player gives their
 *   highest card to the upstream player, who returns any card. At five or six
 *   seats the bottom two both pay tribute (last→first, second-last→second).
 *
 * No DOM, network, clock or ambient randomness. Dealing uses the injected RNG.
 * `view()` exposes only one seat's hand plus public table information, which is
 * what the LAN host sends to each guest.
 */

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type Rng = () => number;

export interface Card {
  id: string;
  rank: number;
  suit: Suit;
}

export type ComboType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'triple-single'
  | 'triple-pair'
  | 'straight'
  | 'pair-straight'
  | 'bomb';

export interface Combo {
  type: ComboType;
  rank: number;
  length: number;
  cards: Card[];
}

export interface Trick {
  seat: number;
  combo: Combo;
}

export type Phase = 'tribute' | 'playing' | 'round-over';

export interface TributePair {
  from: number;
  to: number;
  given: Card;
  returned: Card | null;
}

export interface TributeSummary {
  pairs: TributePair[];
}

export interface LastAction {
  seat: number;
  kind: 'play' | 'pass';
  type?: ComboType;
  rank?: number;
  count?: number;
}

export interface GameState {
  hands: Card[][];
  playerCount: number;
  turn: number;
  trick: Trick | null;
  /** Consecutive passes since the last play. Two clear the trick. */
  passes: number;
  finish: number[];
  order: number[] | null;
  phase: Phase;
  round: number;
  scores: number[];
  roundPoints: number[];
  starter: number;
  mustLeadClubs: boolean;
  tribute: TributeSummary | null;
  tributeEnabled: boolean;
  actions: number;
  last: LastAction | null;
  discard: Card[];
}

export type MoveError =
  | 'phase'
  | 'wrong-turn'
  | 'finished'
  | 'not-your-card'
  | 'empty'
  | 'invalid-combo'
  | 'must-lead-clubs'
  | 'does-not-beat'
  | 'cannot-pass'
  | 'no-trick'
  | 'not-tribute'
  | 'tribute-done'
  | 'not-ready';

export interface MoveResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export type PlayerAction =
  | { type: 'play'; cards: string[] }
  | { type: 'pass' }
  | { type: 'tribute'; card: string };

export interface SeatView {
  seat: number;
  hand: Card[];
  handCounts: number[];
  names: string[];
  playerCount: number;
  turn: number;
  trick: Trick | null;
  passes: number;
  finish: number[];
  order: number[] | null;
  phase: Phase;
  round: number;
  scores: number[];
  roundPoints: number[];
  starter: number;
  mustLeadClubs: boolean;
  tribute: TributeSummary | null;
  tributeEnabled: boolean;
  actions: number;
  last: LastAction | null;
  discard: Card[];
  canPlay: boolean;
  canPass: boolean;
  canTribute: boolean;
  isTurn: boolean;
  finished: boolean;
}

export const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
export const RANKS: readonly number[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const PLAYER_COUNTS: readonly number[] = [3, 4, 5, 6];

const SUIT_ORDER: Record<Suit, number> = {
  clubs: 0,
  diamonds: 1,
  hearts: 2,
  spades: 3,
};

const RANK_LABEL: Record<number, string> = {
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
  15: '2',
};

const SCORE_TABLE: Record<number, readonly number[]> = {
  3: [3, 0, -3],
  4: [3, 1, -1, -3],
  5: [3, 1, 0, -1, -3],
  6: [3, 2, 1, -1, -2, -3],
};

export function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

export function suitSymbol(suit: Suit): string {
  return suit === 'clubs' ? '♣' : suit === 'diamonds' ? '♦' : suit === 'hearts' ? '♥' : '♠';
}

export function suitName(suit: Suit): string {
  return suit;
}

function makeDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${suit[0].toUpperCase()}${rank}`, rank, suit });
    }
  }
  return cards;
}

export const DECK: readonly Card[] = makeDeck();

function compareCard(a: Card, b: Card): number {
  return a.rank - b.rank || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
}

export function sortHand(cards: readonly Card[]): Card[] {
  return cards.slice().sort(compareCard);
}

function shuffle(cards: Card[], rng: Rng): Card[] {
  const deck = cards.slice();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const raw = rng();
    const value = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999, raw)) : 0;
    const j = Math.floor(value * (i + 1));
    const swap = deck[i];
    deck[i] = deck[j];
    deck[j] = swap;
  }
  return deck;
}

function deal(playerCount: number, rng: Rng): Card[][] {
  const deck = shuffle([...DECK], rng);
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  deck.forEach((card, index) => {
    hands[index % playerCount].push(card);
  });
  return hands.map(sortHand);
}

function zeroes(playerCount: number): number[] {
  return Array.from({ length: playerCount }, () => 0);
}

function clubsHolder(hands: readonly Card[][]): number {
  return hands.findIndex((hand) => hand.some((card) => card.id === 'C3'));
}

export function pointsFor(playerCount: number): number[] {
  const table = SCORE_TABLE[playerCount] ?? SCORE_TABLE[4];
  return table.slice();
}

function activeSeats(state: GameState): number[] {
  return state.hands
    .map((hand, seat) => ({ hand, seat }))
    .filter(({ hand, seat }) => hand.length > 0 && !state.finish.includes(seat))
    .map(({ seat }) => seat);
}

function nextActive(state: GameState, from: number): number {
  for (let step = 1; step <= state.playerCount; step += 1) {
    const seat = (from + step) % state.playerCount;
    if (state.hands[seat].length > 0 && !state.finish.includes(seat)) return seat;
  }
  return -1;
}

function removeCardIds(hand: readonly Card[], ids: Set<string>): Card[] {
  return hand.filter((card) => !ids.has(card.id));
}

function highestCard(hand: readonly Card[]): Card | null {
  if (hand.length === 0) return null;
  return hand
    .slice()
    .sort((a, b) => b.rank - a.rank || SUIT_ORDER[b.suit] - SUIT_ORDER[a.suit])[0];
}

function takeHighest(hand: readonly Card[]): Card | null {
  const card = highestCard(hand);
  return card;
}

function addCards(hand: readonly Card[], cards: readonly Card[]): Card[] {
  return sortHand([...hand, ...cards]);
}

function groupCards(cards: readonly Card[]): Map<number, Card[]> {
  const groups = new Map<number, Card[]>();
  for (const card of cards) {
    const list = groups.get(card.rank) ?? [];
    list.push(card);
    groups.set(card.rank, list);
  }
  for (const list of groups.values()) list.sort(compareCard);
  return groups;
}

function isConsecutive(ranks: readonly number[]): boolean {
  if (ranks.length === 0) return false;
  for (let index = 1; index < ranks.length; index += 1) {
    if (ranks[index] !== ranks[index - 1] + 1) return false;
  }
  return true;
}

/** Detect the legal combination in a set of cards, or null if it is not legal. */
export function detectCombo(cards: readonly Card[]): Combo | null {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  if (new Set(cards.map((card) => card.id)).size !== cards.length) return null;
  const sorted = sortHand(cards);
  const length = sorted.length;

  if (length === 1) {
    return { type: 'single', rank: sorted[0].rank, length, cards: sorted };
  }

  const groups = groupCards(sorted);
  const shapes = [...groups.values()]
    .map((group) => ({ size: group.length, rank: group[0].rank }))
    .sort((a, b) => b.size - a.size || a.rank - b.rank);

  if (length === 2 && shapes.length === 1) {
    return { type: 'pair', rank: sorted[0].rank, length, cards: sorted };
  }
  if (length === 3 && shapes.length === 1) {
    return { type: 'triple', rank: sorted[0].rank, length, cards: sorted };
  }
  if (length === 4 && shapes.length === 1) {
    return { type: 'bomb', rank: sorted[0].rank, length, cards: sorted };
  }
  if (length === 4 && shapes[0]?.size === 3 && shapes[1]?.size === 1) {
    return { type: 'triple-single', rank: shapes[0].rank, length, cards: sorted };
  }
  if (length === 5 && shapes[0]?.size === 3 && shapes[1]?.size === 2) {
    return { type: 'triple-pair', rank: shapes[0].rank, length, cards: sorted };
  }

  const ranks = [...groups.keys()].sort((a, b) => a - b);
  if (
    length >= 5 &&
    shapes.every((group) => group.size === 1) &&
    ranks[ranks.length - 1] <= 14 &&
    isConsecutive(ranks)
  ) {
    return {
      type: 'straight',
      rank: ranks[ranks.length - 1],
      length,
      cards: sorted,
    };
  }
  if (
    length >= 6 &&
    length % 2 === 0 &&
    shapes.length >= 3 &&
    shapes.every((group) => group.size === 2) &&
    ranks[ranks.length - 1] <= 14 &&
    isConsecutive(ranks)
  ) {
    return {
      type: 'pair-straight',
      rank: ranks[ranks.length - 1],
      length,
      cards: sorted,
    };
  }

  return null;
}

export function canBeat(candidate: Combo, target: Combo | null): boolean {
  if (!target) return true;
  if (candidate.type === 'bomb' && target.type !== 'bomb') return true;
  if (candidate.type !== 'bomb' && target.type === 'bomb') return false;
  if (candidate.type !== target.type) return false;
  if (candidate.length !== target.length) return false;
  return candidate.rank > target.rank;
}

export function setup(
  playerCount: number,
  rng: Rng,
  tributeEnabled = true,
): GameState {
  const count = PLAYER_COUNTS.includes(playerCount) ? playerCount : 4;
  const hands = deal(count, rng);
  const starter = Math.max(0, clubsHolder(hands));
  return {
    hands,
    playerCount: count,
    turn: starter,
    trick: null,
    passes: 0,
    finish: [],
    order: null,
    phase: 'playing',
    round: 1,
    scores: zeroes(count),
    roundPoints: zeroes(count),
    starter,
    mustLeadClubs: true,
    tribute: null,
    tributeEnabled,
    actions: 0,
    last: null,
    discard: [],
  };
}

/**
 * Build the tribute pairs for a finished order. One downstream at three or
 * four seats; at five or six the bottom two both pay tribute.
 */
export function tributePairs(order: readonly number[], playerCount: number): { from: number; to: number }[] {
  if (order.length !== playerCount || playerCount < 3) return [];
  const pairs = [{ from: order[playerCount - 1], to: order[0] }];
  if (playerCount >= 5) {
    pairs.push({ from: order[playerCount - 2], to: order[1] });
  }
  return pairs;
}

/** Deal the next round. The previous finish order supplies the tribute pairs. */
export function nextRound(state: GameState, rng: Rng): GameState {
  if (state.phase !== 'round-over' || !state.order || state.order.length !== state.playerCount) {
    return state;
  }
  const previousOrder = state.order.slice();
  const hands = deal(state.playerCount, rng);
  let tribute: TributeSummary | null = null;

  if (state.tributeEnabled && previousOrder.length === state.playerCount) {
    const pairs: TributePair[] = [];
    for (const pair of tributePairs(previousOrder, state.playerCount)) {
      const given = takeHighest(hands[pair.from]);
      if (!given) continue;
      hands[pair.from] = removeCardIds(hands[pair.from], new Set([given.id]));
      hands[pair.to] = addCards(hands[pair.to], [given]);
      pairs.push({ from: pair.from, to: pair.to, given, returned: null });
    }
    if (pairs.length > 0) tribute = { pairs };
  }

  const pending = tribute?.pairs.find((pair) => pair.returned === null) ?? null;
  const starter = Math.max(0, clubsHolder(hands));
  return {
    ...state,
    hands,
    phase: tribute ? 'tribute' : 'playing',
    turn: pending ? pending.to : starter,
    trick: null,
    passes: 0,
    finish: [],
    order: null,
    round: state.round + 1,
    scores: state.scores.slice(),
    roundPoints: zeroes(state.playerCount),
    starter,
    mustLeadClubs: true,
    tribute,
    actions: state.actions + 1,
    last: null,
    discard: [],
  };
}

function pendingTributePair(state: GameState, seat?: number): TributePair | null {
  if (state.phase !== 'tribute' || !state.tribute) return null;
  return (
    state.tribute.pairs.find(
      (pair) => pair.returned === null && (seat === undefined || pair.to === seat),
    ) ?? null
  );
}

/** The receiver returns any card from their hand to the tribute giver. */
export function returnTribute(state: GameState, seat: number, cardId: string): MoveResult {
  if (state.phase !== 'tribute' || !state.tribute) {
    return { ok: false, state, error: 'not-tribute' };
  }
  const pair = pendingTributePair(state, seat);
  if (!pair) {
    const hasPair = state.tribute.pairs.some((item) => item.to === seat);
    return { ok: false, state, error: hasPair ? 'tribute-done' : 'wrong-turn' };
  }
  const card = state.hands[seat].find((item) => item.id === cardId);
  if (!card) return { ok: false, state, error: 'not-your-card' };

  const hands = state.hands.map((hand) => hand.slice());
  hands[seat] = removeCardIds(hands[seat], new Set([card.id]));
  hands[pair.from] = addCards(hands[pair.from], [card]);
  const pairs = state.tribute.pairs.map((item) =>
    item.from === pair.from && item.to === pair.to && item.returned === null
      ? { ...item, returned: card }
      : item,
  );
  const tribute: TributeSummary = { pairs };
  const next = pairs.find((item) => item.returned === null) ?? null;
  return {
    ok: true,
    state: {
      ...state,
      hands,
      tribute,
      turn: next ? next.to : state.turn,
      actions: state.actions + 1,
      last: null,
    },
  };
}

/** Leave the tribute screen and begin the first trick. */
export function beginRound(state: GameState): GameState {
  if (state.phase !== 'tribute') return state;
  if (state.tribute?.pairs.some((pair) => pair.returned === null)) return state;
  const starter = Math.max(0, clubsHolder(state.hands));
  return {
    ...state,
    phase: 'playing',
    turn: starter,
    starter,
    trick: null,
    passes: 0,
    mustLeadClubs: true,
    actions: state.actions + 1,
    last: null,
  };
}

export interface PlayCheck {
  ok: boolean;
  error?: MoveError;
  combo: Combo | null;
}

export function checkPlay(
  state: GameState,
  seat: number,
  cardIds: readonly string[],
): PlayCheck {
  if (state.phase !== 'playing') return { ok: false, error: 'phase', combo: null };
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.playerCount) {
    return { ok: false, error: 'wrong-turn', combo: null };
  }
  if (state.turn !== seat) return { ok: false, error: 'wrong-turn', combo: null };
  if (state.finish.includes(seat) || state.hands[seat].length === 0) {
    return { ok: false, error: 'finished', combo: null };
  }
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return { ok: false, error: 'empty', combo: null };
  }

  const hand = state.hands[seat];
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const id of cardIds) {
    if (seen.has(id)) return { ok: false, error: 'not-your-card', combo: null };
    seen.add(id);
    const card = hand.find((item) => item.id === id);
    if (!card) return { ok: false, error: 'not-your-card', combo: null };
    cards.push(card);
  }

  const combo = detectCombo(cards);
  if (!combo) return { ok: false, error: 'invalid-combo', combo: null };

  if (!state.trick && state.mustLeadClubs && !cards.some((card) => card.id === 'C3')) {
    return { ok: false, error: 'must-lead-clubs', combo };
  }
  if (state.trick && !canBeat(combo, state.trick.combo)) {
    return { ok: false, error: 'does-not-beat', combo };
  }
  return { ok: true, combo };
}

function nextActiveFrom(state: GameState, from: number): number {
  return nextActive(state, from);
}

function clearTrick(state: GameState): GameState {
  const trickSeat = state.trick?.seat ?? state.turn;
  const leader = state.hands[trickSeat]?.length > 0 && !state.finish.includes(trickSeat)
    ? trickSeat
    : nextActiveFrom(state, trickSeat);
  return {
    ...state,
    trick: null,
    passes: 0,
    turn: leader >= 0 ? leader : state.turn,
    mustLeadClubs: false,
  };
}

function completeOrder(state: GameState): number[] {
  const order = state.finish.slice();
  for (const seat of activeSeats(state)) {
    if (!order.includes(seat)) order.push(seat);
  }
  return order;
}

function finishRound(state: GameState): GameState {
  const order = completeOrder(state);
  const points = pointsFor(state.playerCount);
  const roundPoints = state.scores.map((_, seat) => {
    const place = order.indexOf(seat);
    return place >= 0 ? points[place] : 0;
  });
  const scores = state.scores.map((score, seat) => score + roundPoints[seat]);
  return {
    ...state,
    finish: order,
    order,
    phase: 'round-over',
    trick: null,
    passes: 0,
    scores,
    roundPoints,
  };
}

export function play(state: GameState, seat: number, cardIds: readonly string[]): MoveResult {
  const check = checkPlay(state, seat, cardIds);
  if (!check.ok || !check.combo) return { ok: false, state, error: check.error };
  const combo = check.combo;
  const ids = new Set(combo.cards.map((card) => card.id));
  const hands = state.hands.map((hand, index) =>
    index === seat ? removeCardIds(hand, ids) : hand,
  );
  const finish =
    hands[seat].length === 0 && !state.finish.includes(seat)
      ? [...state.finish, seat]
      : state.finish.slice();
  const base: GameState = {
    ...state,
    hands,
    trick: { seat, combo },
    passes: 0,
    finish,
    mustLeadClubs: false,
    actions: state.actions + 1,
    last: { seat, kind: 'play', type: combo.type, rank: combo.rank, count: combo.length },
    discard: [...state.discard, ...combo.cards],
  };

  if (finish.length >= state.playerCount - 1) {
    return { ok: true, state: finishRound(base) };
  }

  const next = nextActiveFrom(base, seat);
  if (next < 0) return { ok: true, state: finishRound(base) };
  return { ok: true, state: { ...base, turn: next } };
}

export function pass(state: GameState, seat: number): MoveResult {
  if (state.phase !== 'playing') return { ok: false, state, error: 'phase' };
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  if (state.finish.includes(seat) || state.hands[seat].length === 0) {
    return { ok: false, state, error: 'finished' };
  }
  if (!state.trick) return { ok: false, state, error: 'no-trick' };

  const passes = state.passes + 1;
  const base: GameState = {
    ...state,
    passes,
    actions: state.actions + 1,
    last: { seat, kind: 'pass' },
  };
  const next = nextActiveFrom(base, seat);
  const onlyOwnerLeft =
    activeSeats(base).filter((item) => item !== base.trick?.seat).length === 0;
  const backToOwner = next === base.trick?.seat;
  if (passes >= 2 || onlyOwnerLeft || backToOwner) {
    return { ok: true, state: clearTrick(base) };
  }
  return { ok: true, state: { ...base, turn: next >= 0 ? next : seat } };
}

export function applySeat(state: GameState, seat: number, action: PlayerAction): MoveResult {
  if (!action || typeof action !== 'object') return { ok: false, state, error: 'phase' };
  if (action.type === 'play') {
    if (!Array.isArray(action.cards)) return { ok: false, state, error: 'not-your-card' };
    return play(state, seat, action.cards);
  }
  if (action.type === 'pass') return pass(state, seat);
  if (action.type === 'tribute') {
    if (typeof action.card !== 'string') return { ok: false, state, error: 'not-your-card' };
    return returnTribute(state, seat, action.card);
  }
  return { ok: false, state, error: 'phase' };
}

/** Every legal combination in a hand. Used by the AI, hints and tests. */
export function allCombos(hand: readonly Card[]): Combo[] {
  const sorted = sortHand(hand);
  const groups = groupCards(sorted);
  const ranks = [...groups.keys()].sort((a, b) => a - b);
  const combos: Combo[] = [];
  const seen = new Set<string>();
  const push = (cards: Card[]): void => {
    const combo = detectCombo(cards);
    if (!combo) return;
    const key = combo.cards.map((card) => card.id).sort().join(',');
    if (seen.has(key)) return;
    seen.add(key);
    combos.push(combo);
  };

  for (const card of sorted) push([card]);
  for (const rank of ranks) {
    const group = groups.get(rank) ?? [];
    if (group.length >= 2) push(group.slice(0, 2));
    if (group.length >= 3) push(group.slice(0, 3));
    if (group.length >= 4) push(group.slice(0, 4));
  }

  for (const rank of ranks) {
    const triple = groups.get(rank) ?? [];
    if (triple.length < 3) continue;
    for (const other of ranks) {
      if (other === rank) continue;
      const group = groups.get(other) ?? [];
      for (const card of group) push([...triple.slice(0, 3), card]);
      if (group.length >= 2) push([...triple.slice(0, 3), ...group.slice(0, 2)]);
    }
  }

  for (let start = 0; start < ranks.length; start += 1) {
    const run = [ranks[start]];
    for (let next = start + 1; next < ranks.length; next += 1) {
      if (ranks[next] !== run[run.length - 1] + 1) break;
      if (ranks[next] > 14) break;
      run.push(ranks[next]);
      if (run.length >= 5) {
        const cards = run.flatMap((rank) => (groups.get(rank) ?? []).slice(0, 1));
        if (cards.length === run.length) push(cards);
      }
    }
  }

  const pairRanks = ranks.filter((rank) => rank <= 14 && (groups.get(rank)?.length ?? 0) >= 2);
  for (let start = 0; start < pairRanks.length; start += 1) {
    const run = [pairRanks[start]];
    for (let next = start + 1; next < pairRanks.length; next += 1) {
      if (pairRanks[next] !== run[run.length - 1] + 1) break;
      run.push(pairRanks[next]);
      if (run.length >= 3) {
        const cards = run.flatMap((rank) => (groups.get(rank) ?? []).slice(0, 2));
        if (cards.length === run.length * 2) push(cards);
      }
    }
  }

  return combos;
}

export function legalPlays(state: GameState, seat: number): Card[][] {
  if (state.phase !== 'playing' || state.turn !== seat) return [];
  if (state.finish.includes(seat) || state.hands[seat].length === 0) return [];
  const target = state.trick?.combo ?? null;
  const combos = allCombos(state.hands[seat]).filter((combo) => canBeat(combo, target));
  const legal =
    !state.trick && state.mustLeadClubs
      ? combos.filter((combo) => combo.cards.some((card) => card.id === 'C3'))
      : combos;
  return legal
    .slice()
    .sort(
      (a, b) =>
        a.length - b.length ||
        a.rank - b.rank ||
        (a.type === 'bomb' ? 1 : 0) - (b.type === 'bomb' ? 1 : 0),
    )
    .map((combo) => combo.cards);
}

export function view(state: GameState, seat: number, names: string[] = []): SeatView {
  const safeSeat = Number.isInteger(seat) && seat >= 0 && seat < state.playerCount ? seat : 0;
  const finished = state.finish.includes(safeSeat);
  const canPlay =
    state.phase === 'playing' &&
    state.turn === safeSeat &&
    !finished &&
    state.hands[safeSeat].length > 0;
  const canTribute =
    state.phase === 'tribute' &&
    state.tribute !== null &&
    state.tribute.pairs.some((pair) => pair.to === safeSeat && pair.returned === null);
  return {
    seat: safeSeat,
    hand: sortHand(state.hands[safeSeat] ?? []),
    handCounts: state.hands.map((hand) => hand.length),
    names: names.slice(0, state.playerCount),
    playerCount: state.playerCount,
    turn: state.turn,
    trick: state.trick
      ? {
          seat: state.trick.seat,
          combo: {
            ...state.trick.combo,
            cards: state.trick.combo.cards.slice(),
          },
        }
      : null,
    passes: state.passes,
    finish: state.finish.slice(),
    order: state.order ? state.order.slice() : null,
    phase: state.phase,
    round: state.round,
    scores: state.scores.slice(),
    roundPoints: state.roundPoints.slice(),
    starter: state.starter,
    mustLeadClubs:
      state.phase === 'playing' &&
      state.mustLeadClubs &&
      state.trick === null &&
      state.turn === safeSeat,
    tribute: state.tribute
      ? {
          pairs: state.tribute.pairs.map((pair) => ({ ...pair })),
        }
      : null,
    tributeEnabled: state.tributeEnabled,
    actions: state.actions,
    last: state.last ? { ...state.last } : null,
    discard: state.discard.slice(),
    canPlay,
    canPass: canPlay && state.trick !== null,
    canTribute,
    isTurn: (state.phase === 'playing' && state.turn === safeSeat) ||
      (state.phase === 'tribute' && state.turn === safeSeat),
    finished,
  };
}

export function pointsSummary(scores: readonly number[]): number {
  return scores.reduce((total, value) => total + value, 0);
}
