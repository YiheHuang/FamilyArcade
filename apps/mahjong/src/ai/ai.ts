import {
  applyAction,
  countsFromTiles,
  leftOf,
  sameTile,
  sortTiles,
  tileAtIndex,
  tileFromKey,
  tileIndex,
  tileKey,
  type ClaimAction,
  type GameAction,
  type GameState,
  type Seat,
  type Tile,
} from '../game/mahjong';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];
type Rng = () => number;

const HONOUR_KEYS = new Set([
  'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7',
]);

function countMap(tiles: Tile[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const tile of tiles) {
    const key = tileKey(tile);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function removeOne(hand: Tile[], key: string): Tile[] | null {
  const copy = hand.slice();
  const index = copy.findIndex((tile) => tileKey(tile) === key);
  if (index < 0) return null;
  copy.splice(index, 1);
  return copy;
}

function removeSeveral(hand: Tile[], key: string, amount: number): Tile[] | null {
  const copy = hand.slice();
  for (let count = 0; count < amount; count += 1) {
    const index = copy.findIndex((tile) => tileKey(tile) === key);
    if (index < 0) return null;
    copy.splice(index, 1);
  }
  return copy;
}

/* ------------------------------------------------------------------ *
 * Shanten
 * ------------------------------------------------------------------ */

function shantenStandardCounts(counts: number[], meldCount: number): number {
  const setLimit = Math.max(0, 4 - meldCount);
  const memo = new Map<string, number>();

  const search = (
    index: number,
    sets: number,
    partials: number,
    pair: number,
  ): number => {
    while (index < 34 && counts[index] === 0) index += 1;
    if (index >= 34) return 2 * (meldCount + sets) + partials + pair;

    const key = `${index}|${counts.join('')}|${sets}|${partials}|${pair}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let best = 0;
    const count = counts[index];

    if (sets < setLimit && count >= 3) {
      counts[index] -= 3;
      best = Math.max(best, search(index, sets + 1, partials, pair));
      counts[index] += 3;
    }

    if (sets < setLimit && index < 27 && index % 9 <= 6) {
      if (counts[index + 1] > 0 && counts[index + 2] > 0) {
        counts[index] -= 1;
        counts[index + 1] -= 1;
        counts[index + 2] -= 1;
        best = Math.max(best, search(index, sets + 1, partials, pair));
        counts[index] += 1;
        counts[index + 1] += 1;
        counts[index + 2] += 1;
      }
    }

    if (pair === 0 && count >= 2) {
      counts[index] -= 2;
      best = Math.max(best, search(index, sets, partials, 1));
      counts[index] += 2;
    }

    if (sets + partials < setLimit && count >= 2) {
      counts[index] -= 2;
      best = Math.max(best, search(index, sets, partials + 1, pair));
      counts[index] += 2;
    }

    if (sets + partials < setLimit && index < 27 && index % 9 <= 7) {
      if (counts[index + 1] > 0) {
        counts[index] -= 1;
        counts[index + 1] -= 1;
        best = Math.max(best, search(index, sets, partials + 1, pair));
        counts[index] += 1;
        counts[index + 1] += 1;
      }
    }

    if (sets + partials < setLimit && index < 27 && index % 9 <= 6) {
      if (counts[index + 2] > 0) {
        counts[index] -= 1;
        counts[index + 2] -= 1;
        best = Math.max(best, search(index, sets, partials + 1, pair));
        counts[index] += 1;
        counts[index + 2] += 1;
      }
    }

    counts[index] -= 1;
    best = Math.max(best, search(index, sets, partials, pair));
    counts[index] += 1;

    memo.set(key, best);
    return best;
  };

  const score = search(0, 0, 0, 0);
  return Math.max(-1, 8 - score);
}

function shantenSevenPairsCounts(counts: number[]): number {
  let pairs = 0;
  for (const count of counts) pairs += Math.floor(count / 2);
  return Math.max(-1, 6 - pairs);
}

const ORPHAN_INDICES = [
  0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33,
];

function shantenOrphansCounts(counts: number[]): number {
  let unique = 0;
  let pair = false;
  for (const index of ORPHAN_INDICES) {
    if (counts[index] > 0) unique += 1;
    if (counts[index] >= 2) pair = true;
  }
  return Math.max(-1, 13 - unique - (pair ? 1 : 0));
}

function bestShantenCounts(counts: number[], meldCount: number): number {
  let value = shantenStandardCounts(counts, meldCount);
  if (meldCount === 0) {
    value = Math.min(value, shantenSevenPairsCounts(counts));
    value = Math.min(value, shantenOrphansCounts(counts));
  }
  return value;
}

/** Shanten for a 13-tile hand (or a 14-tile hand, which is treated as its best discard). */
export function shanten(hand: Tile[], meldCount = 0): number {
  return bestShantenCounts(countsFromTiles(hand), meldCount);
}

export function sevenPairsShanten(hand: Tile[]): number {
  return shantenSevenPairsCounts(countsFromTiles(hand));
}

export function thirteenOrphansShanten(hand: Tile[]): number {
  return shantenOrphansCounts(countsFromTiles(hand));
}

/* ------------------------------------------------------------------ *
 * Visible-tile counting and efficiency
 * ------------------------------------------------------------------ */

export function visibleCounts(state: GameState, _seat: Seat, hand: Tile[]): Map<string, number> {
  const visible = countMap(hand);
  for (const melds of state.melds) {
    for (const meld of melds) {
      for (const tile of meld.tiles) {
        const key = tileKey(tile);
        visible.set(key, (visible.get(key) ?? 0) + 1);
      }
    }
  }
  for (const discard of state.discards) {
    if (discard.claimed) continue;
    const key = tileKey(discard.tile);
    visible.set(key, (visible.get(key) ?? 0) + 1);
  }
  return visible;
}

export function usefulTiles(
  state: GameState,
  seat: Seat,
  hand13: Tile[],
  meldCount: number,
): { tile: Tile; remaining: number }[] {
  const base = shanten(hand13, meldCount);
  const visible = visibleCounts(state, seat, hand13);
  const counts = countsFromTiles(hand13);
  const output: { tile: Tile; remaining: number }[] = [];
  for (let index = 0; index < 34; index += 1) {
    const tile = tileAtIndex(index);
    const key = tileKey(tile);
    const seen = visible.get(key) ?? 0;
    const remaining = Math.max(0, 4 - seen);
    if (remaining === 0) continue;
    counts[index] += 1;
    const next = bestShantenCounts(counts, meldCount);
    counts[index] -= 1;
    if (next < base) output.push({ tile, remaining });
  }
  return output;
}

export function ukeire(state: GameState, seat: Seat, hand13: Tile[], meldCount: number): number {
  return usefulTiles(state, seat, hand13, meldCount).reduce(
    (sum, item) => sum + item.remaining,
    0,
  );
}

/* ------------------------------------------------------------------ *
 * Danger
 * ------------------------------------------------------------------ */

function honourDanger(tile: Tile): number {
  if (tile.suit === 'z' && tile.rank >= 5) return 0.58;
  return 0.44;
}

function tileBaseDanger(tile: Tile): number {
  if (tile.suit === 'z') return honourDanger(tile);
  const rank = tile.rank;
  if (rank === 1 || rank === 9) return 0.16;
  if (rank === 2 || rank === 8) return 0.25;
  if (rank === 3 || rank === 7) return 0.34;
  return 0.48;
}

/** A public-information danger estimate. It never reads another hand. */
export function dangerScore(state: GameState, seat: Seat, tile: Tile): number {
  const key = tileKey(tile);
  let total = 0;
  const visible = visibleCounts(state, seat, state.hands[seat]);
  const seen = visible.get(key) ?? 0;
  for (let other = 0; other < 4; other += 1) {
    if (other === seat) continue;
    const melds = state.melds[other];
    const discards = state.discards.filter((item) => item.seat === other && !item.claimed);
    let threat = 0.14 + melds.length * 0.18 + Math.min(0.24, discards.length * 0.008);
    if (state.hands[other].length <= 4) threat += 0.18;
    threat = Math.min(1, threat);

    let base = tileBaseDanger(tile);
    if (tile.suit === 'z') {
      if (tile.rank === state.roundWind || tile.rank === (other - state.dealer + 4) % 4 + 1) {
        base += 0.06;
      }
      if (seen >= 2) base *= 0.55;
    } else {
      for (const meld of melds) {
        if (meld.kind === 'chi' && meld.tiles[0].suit === tile.suit) base *= 1.22;
        else if (meld.kind !== 'chi' && meld.tiles[0].suit === tile.suit) base *= 1.1;
      }
      const sameSuitDiscards = discards.filter((item) => item.tile.suit === tile.suit).length;
      if (sameSuitDiscards >= 3) base *= 0.76;
    }
    if (discards.some((item) => sameTile(item.tile, tile))) base *= 0.38;
    if (seen >= 4) base *= 0.06;
    else if (seen >= 3) base *= 0.25;
    total += threat * base;
  }
  return Math.max(0, Math.min(1, total / 3));
}

/* ------------------------------------------------------------------ *
 * Discard choice
 * ------------------------------------------------------------------ */

function uniqueKeys(hand: Tile[]): string[] {
  return [...new Set(hand.map((tile) => tileKey(tile)))];
}

function discardScore(
  shantenValue: number,
  useful: number,
  danger: number,
  level: AiLevel,
): number {
  if (level === 'hard') {
    const safetyWeight = shantenValue <= 0 ? 0 : 30;
    return -shantenValue * 100 + useful * 16 - danger * safetyWeight;
  }
  if (level === 'normal') {
    return -shantenValue * 100 + useful * 10 - danger * 8;
  }
  if (level === 'easy') {
    return -shantenValue * 100 + useful * 5;
  }
  return -shantenValue * 100 + useful * 3;
}

export function chooseDiscard(
  state: GameState,
  seat: Seat,
  level: AiLevel,
  rng: Rng = Math.random,
): string {
  const hand = state.hands[seat];
  if (hand.length === 0) return '';
  const keys = uniqueKeys(hand);
  if (keys.length === 1) return keys[0];
  if (level === 'companion' && rng() < 0.2) {
    return keys[Math.min(keys.length - 1, Math.floor(rng() * keys.length))];
  }
  if (level === 'easy' && rng() < 0.12) {
    return keys[Math.min(keys.length - 1, Math.floor(rng() * keys.length))];
  }

  const meldCount = state.melds[seat].length;
  let bestKey = keys[0];
  let bestScore = -Infinity;
  for (const key of keys) {
    const remaining = removeOne(hand, key);
    if (!remaining) continue;
    const sh = shanten(remaining, meldCount);
    const useful =
      level === 'normal' || level === 'hard'
        ? ukeire(state, seat, remaining, meldCount)
        : 0;
    const danger = level === 'hard' ? dangerScore(state, seat, tileFromKey(key) ?? hand[0]) : 0;
    let score = discardScore(sh, useful, danger, level);
    if (level === 'hard') {
      const copies = hand.filter((tile) => tileKey(tile) === key).length;
      if (copies >= 2) score += 0.05;
      if (HONOUR_KEYS.has(key) && copies === 1) score += 0.02;
    }
    score += (rng() - 0.5) * (level === 'hard' ? 0.15 : level === 'normal' ? 1.2 : 6);
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  return bestKey;
}

/* ------------------------------------------------------------------ *
 * Claim choice
 * ------------------------------------------------------------------ */

function postClaimValue(
  _state: GameState,
  _seat: Seat,
  handAfterMelds: Tile[],
  newMeldCount: number,
): number {
  if (handAfterMelds.length === 0) return 0;
  let best = 99;
  for (const key of uniqueKeys(handAfterMelds)) {
    const remaining = removeOne(handAfterMelds, key);
    if (!remaining) continue;
    best = Math.min(best, shanten(remaining, newMeldCount));
  }
  return best === 99 ? shanten(handAfterMelds, newMeldCount) : best;
}

/**
 * The claim option does not carry the discarded tile directly; it is available on
 * the claim state. This helper is replaced at call sites where the tile is known.
 */
function fanPotential(state: GameState, seat: Seat, tile: Tile): number {
  if (tile.suit === 'z') {
    if (tile.rank >= 5) return 0.4;
    if (tile.rank === state.roundWind) return 0.3;
    if (tile.rank === (seat - state.dealer + 4) % 4 + 1) return 0.3;
    return 0.1;
  }
  const numbered = state.hands[seat].filter((item) => item.suit !== 'z');
  if (numbered.length > 0 && numbered.every((item) => item.suit === tile.suit)) {
    return 0.2;
  }
  return 0;
}

export function chooseClaim(
  state: GameState,
  seat: Seat,
  level: AiLevel,
  rng: Rng = Math.random,
): { action: ClaimAction; pair?: [string, string] } {
  const claimState = state.claim;
  if (!claimState) return { action: 'pass' };
  const option = claimState.options.find((item) => item.seat === seat);
  if (!option) return { action: 'pass' };
  const tile = claimState.tile;

  if (option.win) return { action: 'win' };

  if (level === 'companion' && rng() < 0.18) return { action: 'pass' };
  if (level === 'easy' && rng() < 0.16) return { action: 'pass' };

  if (option.kong) {
    const accept =
      level === 'companion' ? 0.42 : level === 'easy' ? 0.66 : level === 'normal' ? 0.86 : 0.8;
    if (rng() < accept) return { action: 'kong' };
  }

  const hand = state.hands[seat];
  const meldCount = state.melds[seat].length;
  const current = shanten(hand, meldCount);
  const special =
    meldCount === 0
      ? Math.min(sevenPairsShanten(hand), thirteenOrphansShanten(hand))
      : 99;
  const potential = fanPotential(state, seat, tile);
  const options: { action: 'peng' | 'chi'; pair?: [Tile, Tile]; post: number; score: number }[] = [];

  if (option.peng) {
    const after = removeSeveral(hand, tileKey(tile), 2);
    if (after) {
      const post = postClaimValue(state, seat, after, meldCount + 1);
      options.push({ action: 'peng', post, score: post - potential * 0.35 });
    }
  }
  for (const pair of option.chi) {
    const after = removeSeveral(hand, tileKey(pair[0]), 1);
    const final = after ? removeSeveral(after, tileKey(pair[1]), 1) : null;
    if (!final) continue;
    const post = postClaimValue(state, seat, final, meldCount + 1);
    options.push({ action: 'chi', pair, post, score: post + current * 0.02 });
  }
  if (options.length === 0) return { action: 'pass' };
  options.sort((a, b) => a.score - b.score);
  const best = options[0];

  const preserveSpecial = special <= 1 && special <= current;
  if (preserveSpecial && level !== 'companion' && level !== 'easy') {
    return { action: 'pass' };
  }

  let accept = false;
  if (level === 'companion') {
    accept = best.post < current && rng() < 0.55;
  } else if (level === 'easy') {
    accept = best.post <= current && rng() < 0.55;
  } else if (level === 'normal') {
    accept = best.post < current || (best.post === current && current >= 2 && potential >= 0.3);
  } else {
    if (best.action === 'chi') {
      accept = best.post < current && current >= 1;
    } else {
      accept =
        best.post < current ||
        (best.post === current && (potential >= 0.2 || current >= 2));
    }
    if (best.post > current) accept = false;
  }

  if (!accept) return { action: 'pass' };
  return best.pair
    ? { action: best.action, pair: [tileKey(best.pair[0]), tileKey(best.pair[1])] }
    : { action: best.action };
}

/* ------------------------------------------------------------------ *
 * Kong and full-action choice
 * ------------------------------------------------------------------ */

function chooseKong(
  state: GameState,
  seat: Seat,
  level: AiLevel,
  rng: Rng,
): { type: 'concealed-kong' | 'added-kong'; tile: string } | null {
  if (state.phase !== 'discard' || state.turn !== seat || state.wall.length === 0) return null;
  const hand = state.hands[seat];
  const counts = countMap(hand);
  const concealed: string[] = [];
  for (const [key, count] of counts) if (count >= 4) concealed.push(key);
  const added: string[] = [];
  for (const meld of state.melds[seat]) {
    if (meld.kind === 'peng' && (counts.get(tileKey(meld.tiles[0])) ?? 0) > 0) {
      added.push(tileKey(meld.tiles[0]));
    }
  }
  if (concealed.length > 0) {
    const chance = level === 'companion' ? 0.3 : level === 'easy' ? 0.55 : level === 'normal' ? 0.82 : 0.9;
    if (rng() < chance) {
      return { type: 'concealed-kong', tile: concealed[0] };
    }
  }
  if (added.length > 0) {
    const chance = level === 'companion' ? 0.25 : level === 'easy' ? 0.5 : level === 'normal' ? 0.8 : 0.72;
    if (rng() < chance) return { type: 'added-kong', tile: added[0] };
  }
  return null;
}

export function chooseAction(
  state: GameState,
  seat: Seat,
  level: AiLevel,
  rng: Rng = Math.random,
): GameAction {
  if (state.phase === 'claim') {
    const choice = chooseClaim(state, seat, level, rng);
    return { type: 'claim', ...choice };
  }
  if (state.phase !== 'discard' || state.turn !== seat) {
    return { type: 'discard', tile: '' };
  }
  const selfWin = applyAction(state, seat, { type: 'win-self' });
  if (selfWin.ok) return { type: 'win-self' };
  const kong = chooseKong(state, seat, level, rng);
  if (kong) {
    const result = applyAction(state, seat, kong);
    if (result.ok) return kong;
  }
  return { type: 'discard', tile: chooseDiscard(state, seat, level, rng) };
}

/* ------------------------------------------------------------------ *
 * Hints
 * ------------------------------------------------------------------ */

export type HintKind =
  | 'win'
  | 'efficiency'
  | 'safety'
  | 'claimWin'
  | 'claimKong'
  | 'claimPeng'
  | 'claimChi'
  | 'pass'
  | 'kong'
  | 'concealedKong'
  | 'addedKong';

export interface Hint {
  action: GameAction;
  kind: HintKind;
  tile?: string;
  shanten?: number;
  ukeire?: number;
  danger?: number;
  fan?: number;
}

export function hint(state: GameState, seat: Seat): Hint | null {
  if (state.phase === 'claim' && state.claim) {
    const option = state.claim.options.find((item) => item.seat === seat);
    if (!option) return null;
    const choice = chooseClaim(state, seat, 'hard', () => 0.5);
    const tile = tileKey(state.claim.tile);
    if (choice.action === 'win') {
      return { action: { type: 'claim', action: 'win' }, kind: 'claimWin', tile, fan: option.winFan };
    }
    if (choice.action === 'kong') {
      return { action: { type: 'claim', action: 'kong' }, kind: 'claimKong', tile };
    }
    if (choice.action === 'peng') {
      return { action: { type: 'claim', action: 'peng' }, kind: 'claimPeng', tile };
    }
    if (choice.action === 'chi') {
      return { action: { type: 'claim', action: 'chi', pair: choice.pair }, kind: 'claimChi', tile };
    }
    return { action: { type: 'claim', action: 'pass' }, kind: 'pass', tile };
  }
  if (state.phase !== 'discard' || state.turn !== seat) return null;
  const win = applyAction(state, seat, { type: 'win-self' });
  if (win.ok) {
    return {
      action: { type: 'win-self' },
      kind: 'win',
      tile: state.lastDraw ? tileKey(state.lastDraw.tile) : undefined,
      fan: win.state.winInfo?.totalFan,
    };
  }
  const kong = chooseKong(state, seat, 'hard', () => 0.5);
  if (kong) {
    const result = applyAction(state, seat, kong);
    if (result.ok) {
      return {
        action: kong,
        kind: kong.type === 'concealed-kong' ? 'concealedKong' : 'addedKong',
        tile: kong.tile,
      };
    }
  }
  const key = chooseDiscard(state, seat, 'hard', () => 0.5);
  const remaining = removeOne(state.hands[seat], key);
  if (!remaining) return null;
  const meldCount = state.melds[seat].length;
  const sh = shanten(remaining, meldCount);
  const useful = ukeire(state, seat, remaining, meldCount);
  const danger = dangerScore(state, seat, tileFromKey(key) ?? state.hands[seat][0]);
  return {
    action: { type: 'discard', tile: key },
    kind: sh >= 1 && danger < 0.24 ? 'safety' : 'efficiency',
    tile: key,
    shanten: sh,
    ukeire: useful,
    danger,
  };
}

/** Sort a hand the same way the engine does; used by the UI and tests. */
export function sorted(hand: Tile[]): Tile[] {
  return sortTiles(hand);
}

/** Exported for tests that want to reason about a seat's left neighbour. */
export function chiSource(seat: Seat): Seat {
  return ((seat + 3) % 4) as Seat;
}

/** Exported for the table UI: which seats are left of a seat. */
export function leftSeat(seat: Seat): Seat {
  return leftOf(seat);
}

/** Lightweight public check used by the hint panel. */
export function isTileInHand(hand: Tile[], key: string): boolean {
  return hand.some((tile) => tileKey(tile) === key);
}

/** Avoid an unused import if tree-shaking is disabled in tests. */
export const TILE_INDEX = tileIndex;
export const TILE_FROM_KEY = tileFromKey;
