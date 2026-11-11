/**
 * Triple Find — pure game engine.
 *
 * No DOM, no clock, no network and no Math.random in this file. Shuffling and
 * dealing only use the RNG passed in by the caller, which keeps tests and
 * replays deterministic.
 */

export type Rng = () => number;
export type AttrValue = 0 | 1 | 2;
export type CountValue = 1 | 2 | 3;

export interface Card {
  id: number;
  color: AttrValue;
  shape: AttrValue;
  fill: AttrValue;
  count: CountValue;
}

export interface Player {
  id: number;
  name: string;
  score: number;
  misses: number;
}

export interface FoundSet {
  playerId: number;
  cards: Card[];
  seq: number;
}

export type GameStatus = 'playing' | 'finished';

export interface GameState {
  deck: Card[];
  table: Card[];
  players: Player[];
  found: FoundSet[];
  status: GameStatus;
  deals: number;
  seq: number;
}

export type ClaimError =
  | 'game-finished'
  | 'unknown-player'
  | 'wrong-count'
  | 'duplicate-card'
  | 'card-not-on-table'
  | 'not-a-set';

export interface ClaimResult {
  ok: boolean;
  state: GameState;
  error?: ClaimError;
}

export type DealError = 'game-finished' | 'set-present' | 'deck-empty';

export interface DealResult {
  ok: boolean;
  state: GameState;
  error?: DealError;
}

export type SetIndices = [number, number, number];
export type SetRelation = 'same' | 'different' | 'mixed';
export type Attribute = 'color' | 'shape' | 'fill' | 'count';

export interface SetReason {
  attr: Attribute;
  relation: SetRelation;
}

export const COLORS = ['coral', 'teal', 'indigo'] as const;
export const SHAPES = ['pill', 'diamond', 'star'] as const;
export const FILLS = ['solid', 'stripe', 'open'] as const;
export const ATTRIBUTES: readonly Attribute[] = ['color', 'shape', 'fill', 'count'];
export const TABLE_SIZE = 12;

/** The complete 81-card deck. IDs are stable, so saves and LAN views survive. */
export function fullDeck(): Card[] {
  const deck: Card[] = [];
  let id = 0;
  for (let color = 0; color < 3; color += 1) {
    for (let shape = 0; shape < 3; shape += 1) {
      for (let fill = 0; fill < 3; fill += 1) {
        for (let count = 1; count <= 3; count += 1) {
          deck.push({
            id,
            color: color as AttrValue,
            shape: shape as AttrValue,
            fill: fill as AttrValue,
            count: count as CountValue,
          });
          id += 1;
        }
      }
    }
  }
  return deck;
}

function allSameOrDifferent(a: number, b: number, c: number): boolean {
  return (a === b && b === c) || (a !== b && b !== c && a !== c);
}

/** A set is three cards that are all-same or all-different in every attribute. */
export function isSet(a: Card, b: Card, c: Card): boolean {
  return (
    allSameOrDifferent(a.color, b.color, c.color) &&
    allSameOrDifferent(a.shape, b.shape, c.shape) &&
    allSameOrDifferent(a.fill, b.fill, c.fill) &&
    allSameOrDifferent(a.count, b.count, c.count)
  );
}

/** Enumerate every set on the table as index triples. 18 cards is only 816 checks. */
export function findSets(table: readonly Card[]): SetIndices[] {
  const sets: SetIndices[] = [];
  for (let i = 0; i < table.length - 2; i += 1) {
    for (let j = i + 1; j < table.length - 1; j += 1) {
      for (let k = j + 1; k < table.length; k += 1) {
        if (isSet(table[i], table[j], table[k])) sets.push([i, j, k]);
      }
    }
  }
  return sets;
}

export function findSet(table: readonly Card[]): SetIndices | null {
  for (let i = 0; i < table.length - 2; i += 1) {
    for (let j = i + 1; j < table.length - 1; j += 1) {
      for (let k = j + 1; k < table.length; k += 1) {
        if (isSet(table[i], table[j], table[k])) return [i, j, k];
      }
    }
  }
  return null;
}

export function hasSet(table: readonly Card[]): boolean {
  return findSet(table) !== null;
}

/** Fisher–Yates with the caller's RNG; never touches Math.random. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

export function createGame(names: readonly string[], rng: Rng): GameState {
  const deck = shuffle(fullDeck(), rng);
  const table = deck.splice(0, Math.min(TABLE_SIZE, deck.length));
  return {
    deck,
    table,
    players: names.map((name, id) => ({
      id,
      name: name.trim() || `Player ${id + 1}`,
      score: 0,
      misses: 0,
    })),
    found: [],
    status: 'playing',
    deals: 0,
    seq: 0,
  };
}

/**
 * Claim three cards for one player.
 * On success the cards leave the table, the player scores, and the table is
 * refilled to 12 while the deck lasts. A dead table ends the game.
 */
export function claimSet(
  state: GameState,
  playerId: number,
  cardIds: readonly number[],
): ClaimResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-finished' };
  if (!state.players.some((player) => player.id === playerId)) {
    return { ok: false, state, error: 'unknown-player' };
  }
  if (cardIds.length !== 3) return { ok: false, state, error: 'wrong-count' };
  if (new Set(cardIds).size !== 3) return { ok: false, state, error: 'duplicate-card' };

  const cards: Card[] = [];
  for (const id of cardIds) {
    const card = state.table.find((item) => item.id === id);
    if (!card) return { ok: false, state, error: 'card-not-on-table' };
    cards.push(card);
  }
  if (!isSet(cards[0], cards[1], cards[2])) return { ok: false, state, error: 'not-a-set' };

  const table = state.table.filter((card) => !cardIds.includes(card.id));
  const deck = state.deck.slice();
  const refill = Math.min(TABLE_SIZE - table.length, deck.length);
  if (refill > 0) table.push(...deck.splice(0, refill));

  const players = state.players.map((player) =>
    player.id === playerId ? { ...player, score: player.score + 1 } : player,
  );
  const next: GameState = {
    ...state,
    deck,
    table,
    players,
    found: [...state.found, { playerId, cards, seq: state.seq }],
    seq: state.seq + 1,
  };

  if (next.table.length === 0 || (next.deck.length === 0 && !hasSet(next.table))) {
    next.status = 'finished';
  }
  return { ok: true, state: next };
}

/** The “nobody can call” rule: add three more cards when the table has no set. */
export function dealExtra(state: GameState): DealResult {
  if (state.status !== 'playing') return { ok: false, state, error: 'game-finished' };
  if (hasSet(state.table)) return { ok: false, state, error: 'set-present' };
  if (state.deck.length === 0) return { ok: false, state, error: 'deck-empty' };

  const deck = state.deck.slice();
  const table = state.table.slice();
  table.push(...deck.splice(0, Math.min(3, deck.length)));
  const next: GameState = { ...state, deck, table, deals: state.deals + 1 };
  if (next.deck.length === 0 && !hasSet(next.table)) next.status = 'finished';
  return { ok: true, state: next };
}

export function finishGame(state: GameState): GameState {
  if (state.status === 'finished') return state;
  return { ...state, status: 'finished' };
}

/** Human-readable relation for a hint: colour all different, shape all same… */
export function setReason(cards: readonly [Card, Card, Card]): SetReason[] {
  return ATTRIBUTES.map((attr) => {
    const a = cards[0][attr];
    const b = cards[1][attr];
    const c = cards[2][attr];
    const relation: SetRelation =
      a === b && b === c ? 'same' : a !== b && b !== c && a !== c ? 'different' : 'mixed';
    return { attr, relation };
  });
}

export function standings(state: GameState): Player[] {
  return state.players
    .slice()
    .sort((a, b) => b.score - a.score || a.id - b.id);
}

/** Highest score wins; more than one top score is a family draw. */
export function winners(state: GameState): Player[] {
  const sorted = standings(state);
  const top = sorted[0]?.score ?? 0;
  return sorted.filter((player) => player.score === top);
}

export function isDraw(state: GameState): boolean {
  return winners(state).length !== 1;
}
