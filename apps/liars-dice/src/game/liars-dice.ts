/**
 * Liar's Dice · a pure, deterministic engine for 2–6 players.
 *
 * Five dice per player, hidden under cups. A turn raises the bid (quantity or
 * face) or challenges the previous bid. A challenge reveals every cup: a true
 * bid costs the challenger one die, a false bid costs the bidder one die. A
 * player with no dice is out; the last player standing wins. The optional
 * "spot on" table rule can end a round on an exact count.
 *
 * No DOM, network, clock or Math.random. Every roll takes an injected RNG.
 * `view()` exposes one seat's dice only; the full dice array never leaves the
 * engine except through a completed reveal.
 */

export type Rng = () => number;
export type Phase = 'bidding' | 'reveal' | 'game-over';
export type RevealKind = 'challenge' | 'spot-on';

export interface Bid {
  seat: number;
  quantity: number;
  /** 1–6. Ones are wild unless the table option says otherwise. */
  face: number;
}

export interface BidValue {
  quantity: number;
  face: number;
}

export interface Reveal {
  bid: Bid;
  challenger: number;
  kind: RevealKind;
  /** Actual number of matching dice, with the table's wild-one rule applied. */
  count: number;
  /** The bid quantity was reached (challenge) or matched exactly (spot on). */
  bidTrue: boolean;
  /** The caller's call succeeded and the bidder lost a die. */
  callerWon: boolean;
  loser: number;
  /** Snapshot before the loser's die was removed. */
  dice: number[][];
  /** The loser had one die and is now out. */
  eliminated: boolean;
  round: number;
}

export interface Tendency {
  bids: number;
  challenges: number;
  challengeWins: number;
  falseBids: number;
  spots: number;
  spotHits: number;
  spotMisses: number;
}

export interface GameState {
  playerCount: number;
  dice: number[][];
  turn: number;
  phase: Phase;
  round: number;
  starter: number;
  nextStarter: number;
  currentBid: Bid | null;
  /** Bids made in the current round, in order. */
  bids: Bid[];
  lastReveal: Reveal | null;
  winner: number | null;
  /** Seats in the order they were eliminated (first out first). */
  outOrder: number[];
  onesWild: boolean;
  spotOn: boolean;
  /** Public behavioural counters. The AI may use these; they never hold dice. */
  tendencies: Tendency[];
  /** Monotonic action counter, used to reject stale LAN intents. */
  actions: number;
}

export interface ActionBid {
  type: 'bid';
  quantity: number;
  face: number;
}
export interface ActionChallenge {
  type: 'challenge';
}
export interface ActionSpotOn {
  type: 'spot-on';
}
export type PlayerAction = ActionBid | ActionChallenge | ActionSpotOn;

export interface ActionResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export type MoveError =
  | 'bad-phase'
  | 'bad-seat'
  | 'wrong-turn'
  | 'bad-action'
  | 'bad-quantity'
  | 'bad-face'
  | 'not-higher'
  | 'no-bid'
  | 'spot-disabled';

export interface SetupOptions {
  rng: Rng;
  playerCount?: number;
  starter?: number;
  onesWild?: boolean;
  spotOn?: boolean;
}

export interface SeatView {
  seat: number;
  names: string[];
  playerCount: number;
  phase: Phase;
  round: number;
  turn: number;
  starter: number;
  nextStarter: number;
  /** Only this seat's dice. Other dice are never present in a view. */
  ownDice: number[];
  diceCounts: number[];
  alive: boolean[];
  outOrder: number[];
  currentBid: Bid | null;
  bids: Bid[];
  /** All dice, but only after a round has been revealed. */
  lastReveal: Reveal | null;
  winner: number | null;
  onesWild: boolean;
  spotOn: boolean;
  tendencies: Tendency[];
  actions: number;
  maxQuantity: number;
  legalBids: BidValue[];
  canAct: boolean;
  canChallenge: boolean;
  canSpotOn: boolean;
}

export const DICE_PER_PLAYER = 5;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const FACES: readonly number[] = [1, 2, 3, 4, 5, 6];

const EMPTY_TENDENCY: Tendency = {
  bids: 0,
  challenges: 0,
  challengeWins: 0,
  falseBids: 0,
  spots: 0,
  spotHits: 0,
  spotMisses: 0,
};

function clampRng(rng: Rng): number {
  const raw = rng();
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(0.999999, raw));
}

export function rollDie(rng: Rng): number {
  return 1 + Math.floor(clampRng(rng) * 6);
}

export function rollDice(count: number, rng: Rng): number[] {
  const safe = Math.max(0, Math.floor(count));
  return Array.from({ length: safe }, () => rollDie(rng));
}

export function totalDice(state: GameState): number {
  return state.dice.reduce((sum, dice) => sum + dice.length, 0);
}

export function aliveSeats(state: GameState): number[] {
  return state.dice.flatMap((dice, seat) => (dice.length > 0 ? [seat] : []));
}

export function nextAlive(state: GameState, from: number): number {
  for (let step = 1; step <= state.playerCount; step += 1) {
    const seat = (from + step) % state.playerCount;
    if (state.dice[seat]?.length > 0) return seat;
  }
  return -1;
}

function nextAliveIn(dice: number[][], from: number): number {
  for (let step = 1; step <= dice.length; step += 1) {
    const seat = (from + step) % dice.length;
    if (dice[seat]?.length > 0) return seat;
  }
  return -1;
}

function asSeat(state: GameState, seat: number): boolean {
  return Number.isInteger(seat) && seat >= 0 && seat < state.playerCount;
}

export function setup(options: SetupOptions): GameState {
  const rawCount = Number.isFinite(options.playerCount) ? Math.floor(options.playerCount as number) : 4;
  const playerCount = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, rawCount));
  const starter =
    Number.isInteger(options.starter) &&
    (options.starter as number) >= 0 &&
    (options.starter as number) < playerCount
      ? (options.starter as number)
      : 0;
  const dice = Array.from({ length: playerCount }, () =>
    rollDice(DICE_PER_PLAYER, options.rng),
  );
  return {
    playerCount,
    dice,
    turn: starter,
    phase: 'bidding',
    round: 1,
    starter,
    nextStarter: starter,
    currentBid: null,
    bids: [],
    lastReveal: null,
    winner: null,
    outOrder: [],
    onesWild: options.onesWild ?? true,
    spotOn: options.spotOn ?? false,
    tendencies: Array.from({ length: playerCount }, () => ({ ...EMPTY_TENDENCY })),
    actions: 0,
  };
}

/**
 * Count matching dice across the supplied hands. With wild ones, a one matches
 * every face except a bid on ones itself.
 */
export function countFace(
  dice: number[][],
  face: number,
  onesWild: boolean,
): number {
  let count = 0;
  for (const hand of dice) {
    for (const die of hand) {
      if (die === face) count += 1;
      else if (onesWild && die === 1 && face !== 1) count += 1;
    }
  }
  return count;
}

export function higherBid(
  current: Bid | null,
  quantity: number,
  face: number,
): boolean {
  if (!current) return quantity >= 1 && face >= 1;
  if (quantity > current.quantity) return true;
  if (quantity === current.quantity && face > current.face) return true;
  return false;
}

/** All legal raises for the current table. Turn-independent. */
export function bidOptions(state: GameState): BidValue[] {
  if (state.phase !== 'bidding') return [];
  const max = totalDice(state);
  const options: BidValue[] = [];
  for (let quantity = 1; quantity <= max; quantity += 1) {
    for (const face of FACES) {
      if (higherBid(state.currentBid, quantity, face)) options.push({ quantity, face });
    }
  }
  return options;
}

/** Legal raises for the seat whose turn it is. */
export function legalBids(state: GameState, seat: number): BidValue[] {
  if (state.phase !== 'bidding' || state.turn !== seat) return [];
  return bidOptions(state);
}

function bump(state: GameState, seat: number, field: keyof Tendency, amount = 1): Tendency[] {
  return state.tendencies.map((item, index) =>
    index === seat ? { ...item, [field]: item[field] + amount } : { ...item },
  );
}

export function bid(
  state: GameState,
  seat: number,
  quantity: number,
  face: number,
): ActionResult {
  if (state.phase !== 'bidding') return { ok: false, state, error: 'bad-phase' };
  if (!asSeat(state, seat)) return { ok: false, state, error: 'bad-seat' };
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > totalDice(state)) {
    return { ok: false, state, error: 'bad-quantity' };
  }
  if (!Number.isInteger(face) || face < 1 || face > 6) {
    return { ok: false, state, error: 'bad-face' };
  }
  if (!higherBid(state.currentBid, quantity, face)) {
    return { ok: false, state, error: 'not-higher' };
  }
  const entry: Bid = { seat, quantity, face };
  const next = nextAlive(state, seat);
  return {
    ok: true,
    state: {
      ...state,
      currentBid: entry,
      bids: [...state.bids, entry],
      turn: next,
      tendencies: bump(state, seat, 'bids'),
      actions: state.actions + 1,
    },
  };
}

function resolve(
  state: GameState,
  challenger: number,
  kind: RevealKind,
): ActionResult {
  const current = state.currentBid;
  if (!current) return { ok: false, state, error: 'no-bid' };
  const snapshot = state.dice.map((dice) => dice.slice());
  const count = countFace(snapshot, current.face, state.onesWild);
  const bidTrue = kind === 'challenge' ? count >= current.quantity : count === current.quantity;
  const callerWon = kind === 'challenge' ? !bidTrue : bidTrue;
  const loser = callerWon ? current.seat : challenger;

  const dice = snapshot.map((hand) => hand.slice());
  dice[loser].pop();
  const eliminated = dice[loser].length === 0;
  const outOrder = eliminated ? [...state.outOrder, loser] : state.outOrder.slice();
  const alive = dice.flatMap((hand, seat) => (hand.length > 0 ? [seat] : []));
  const winner = alive.length === 1 ? alive[0] : null;
  const nextStarter = eliminated ? nextAliveIn(dice, loser) : loser;

  let tendencies = bump(state, challenger, kind === 'challenge' ? 'challenges' : 'spots');
  tendencies = tendencies.map((item, index) => {
    if (index !== challenger) return item;
    if (kind === 'challenge') {
      return { ...item, challengeWins: item.challengeWins + (callerWon ? 1 : 0) };
    }
    return {
      ...item,
      spotHits: item.spotHits + (callerWon ? 1 : 0),
      spotMisses: item.spotMisses + (callerWon ? 0 : 1),
    };
  });
  if (kind === 'challenge' && callerWon) {
    tendencies = tendencies.map((item, index) =>
      index === current.seat ? { ...item, falseBids: item.falseBids + 1 } : item,
    );
  }

  const reveal: Reveal = {
    bid: { ...current },
    challenger,
    kind,
    count,
    bidTrue,
    callerWon,
    loser,
    dice: snapshot,
    eliminated,
    round: state.round,
  };

  return {
    ok: true,
    state: {
      ...state,
      dice,
      turn: -1,
      phase: winner === null ? 'reveal' : 'game-over',
      currentBid: current,
      lastReveal: reveal,
      winner,
      outOrder,
      nextStarter: winner === null ? nextStarter : winner,
      tendencies,
      actions: state.actions + 1,
    },
  };
}

export function challenge(state: GameState, seat: number): ActionResult {
  if (state.phase !== 'bidding') return { ok: false, state, error: 'bad-phase' };
  if (!asSeat(state, seat)) return { ok: false, state, error: 'bad-seat' };
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  if (!state.currentBid) return { ok: false, state, error: 'no-bid' };
  return resolve(state, seat, 'challenge');
}

export function spotOn(state: GameState, seat: number): ActionResult {
  if (state.phase !== 'bidding') return { ok: false, state, error: 'bad-phase' };
  if (!asSeat(state, seat)) return { ok: false, state, error: 'bad-seat' };
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  if (!state.currentBid) return { ok: false, state, error: 'no-bid' };
  if (!state.spotOn) return { ok: false, state, error: 'spot-disabled' };
  return resolve(state, seat, 'spot-on');
}

export function nextRound(state: GameState, rng: Rng): ActionResult {
  if (state.phase !== 'reveal') return { ok: false, state, error: 'bad-phase' };
  const alive = aliveSeats(state);
  if (alive.length < 2) return { ok: false, state, error: 'bad-phase' };
  const dice = state.dice.map((hand) => (hand.length > 0 ? rollDice(hand.length, rng) : []));
  const starter = state.nextStarter >= 0 && dice[state.nextStarter]?.length > 0
    ? state.nextStarter
    : alive[0];
  return {
    ok: true,
    state: {
      ...state,
      dice,
      phase: 'bidding',
      round: state.round + 1,
      starter,
      turn: starter,
      nextStarter: starter,
      currentBid: null,
      bids: [],
      lastReveal: null,
      winner: null,
      actions: state.actions + 1,
    },
  };
}

export function applySeat(
  state: GameState,
  seat: number,
  action: PlayerAction,
): ActionResult {
  if (!action || typeof action !== 'object') return { ok: false, state, error: 'bad-action' };
  if (state.turn !== seat) return { ok: false, state, error: 'wrong-turn' };
  if (action.type === 'bid') {
    return bid(state, seat, action.quantity, action.face);
  }
  if (action.type === 'challenge') return challenge(state, seat);
  if (action.type === 'spot-on') return spotOn(state, seat);
  return { ok: false, state, error: 'bad-action' };
}

export function view(state: GameState, seat: number, names: string[] = []): SeatView {
  const safeSeat = Number.isInteger(seat) && seat >= 0 && seat < state.playerCount ? seat : 0;
  const bidding = state.phase === 'bidding';
  const canAct = bidding && state.turn === safeSeat && state.dice[safeSeat].length > 0;
  const revealed = state.phase === 'reveal' || state.phase === 'game-over';
  return {
    seat: safeSeat,
    names: names.slice(0, state.playerCount),
    playerCount: state.playerCount,
    phase: state.phase,
    round: state.round,
    turn: state.turn,
    starter: state.starter,
    nextStarter: state.nextStarter,
    ownDice: state.dice[safeSeat].slice(),
    diceCounts: state.dice.map((dice) => dice.length),
    alive: state.dice.map((dice) => dice.length > 0),
    outOrder: state.outOrder.slice(),
    currentBid: state.currentBid ? { ...state.currentBid } : null,
    bids: state.bids.map((item) => ({ ...item })),
    lastReveal: revealed && state.lastReveal
      ? {
          ...state.lastReveal,
          bid: { ...state.lastReveal.bid },
          dice: state.lastReveal.dice.map((hand) => hand.slice()),
        }
      : null,
    winner: state.winner,
    onesWild: state.onesWild,
    spotOn: state.spotOn,
    tendencies: state.tendencies.map((item) => ({ ...item })),
    actions: state.actions,
    maxQuantity: totalDice(state),
    legalBids: canAct ? bidOptions(state) : [],
    canAct,
    canChallenge: canAct && state.currentBid !== null,
    canSpotOn: canAct && state.currentBid !== null && state.spotOn,
  };
}

/** A short label for logs and tests; the UI translates the face itself. */
export function bidLabel(bid: Bid | null): string {
  return bid ? `${bid.quantity}x${bid.face}` : '';
}
