import {
  evaluateWin,
  isSpirit,
  isTenpai,
  kongOptionsFor,
  sortTiles,
  tileRank,
  waitingTiles,
  type ClaimOption,
  type GameState,
  type KongOption,
  type Meld,
  type SpiritInfo,
  type Tile,
  type WinPattern,
} from '../game/nanchang-mahjong';

export const AI_LEVELS = ['companion', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

type Rng = () => number;

export type AiAction =
  | { type: 'draw' }
  | { type: 'discard'; tile: Tile }
  | { type: 'win' }
  | { type: 'kong'; option: KongOption }
  | { type: 'claim'; option: ClaimOption }
  | { type: 'pass' };

export type HintReason =
  | 'win'
  | 'kong'
  | 'claim-win'
  | 'claim-gang'
  | 'claim-peng'
  | 'claim-chi'
  | 'pass'
  | 'discard-tenpai'
  | 'discard-spirit'
  | 'discard-scatter'
  | 'discard-safe'
  | 'discard-isolated';

export interface Hint {
  action: AiAction;
  reason: HintReason;
  tile?: Tile;
  waits?: number;
  pattern?: WinPattern;
  option?: ClaimOption | KongOption;
}

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function uniqueTiles(tiles: Tile[]): Tile[] {
  return [...new Set(tiles)].sort();
}

function countTiles(tiles: Tile[]): Map<Tile, number> {
  const counts = new Map<Tile, number>();
  for (const tile of tiles) counts.set(tile, (counts.get(tile) ?? 0) + 1);
  return counts;
}

/** Heuristic potential of a concealed hand plus exposed melds. */
export function handPotential(hand: Tile[], melds: Meld[], spirit: SpiritInfo): number {
  const counts = countTiles(hand);
  let score = melds.length * 18;
  for (const [tile, amount] of counts) {
    if (isSpirit(tile, spirit)) {
      score += 14 + (amount - 1) * 7;
      continue;
    }
    if (amount >= 3) score += 13;
    else if (amount === 2) score += 7;
    if (tile[0] === 'z') {
      if (amount === 1) score += 2;
      continue;
    }
    const rank = tileRank(tile);
    for (const other of uniqueTiles(hand)) {
      if (other === tile || other[0] !== tile[0] || isSpirit(other, spirit)) continue;
      const gap = Math.abs(tileRank(other) - rank);
      if (gap === 1) score += 3;
      else if (gap === 2) score += 1;
    }
  }
  return score;
}

function maxSpaced(ranks: number[]): number {
  const unique = [...new Set(ranks)].sort((a, b) => a - b);
  let best = 0;
  for (let mask = 0; mask < 1 << unique.length; mask += 1) {
    const chosen: number[] = [];
    for (let index = 0; index < unique.length; index += 1) {
      if (mask & (1 << index)) chosen.push(unique[index]);
    }
    if (chosen.length <= 3 && chosen.every((rank, index) => index === 0 || rank - chosen[index - 1] >= 3)) {
      best = Math.max(best, chosen.length);
    }
  }
  return best;
}

/** How close the hand is to Thirteen Scattered or Seven-Star. */
export function scatterPotential(hand: Tile[], spirit: SpiritInfo): number {
  const naturals = hand.filter((tile) => !isSpirit(tile, spirit));
  const honours = new Set(naturals.filter((tile) => tile[0] === 'z'));
  const suits = { m: [] as number[], p: [] as number[], s: [] as number[] };
  for (const tile of naturals) {
    if (tile[0] === 'z') continue;
    suits[tile[0] as 'm' | 'p' | 's'].push(tileRank(tile));
  }
  let score = honours.size * 3;
  if (honours.size === 7) score += 12;
  for (const suit of ['m', 'p', 's'] as const) score += maxSpaced(suits[suit]);
  return score;
}

function threatOf(state: GameState, opponent: number): number {
  const melds = state.melds[opponent].length;
  const handCount = state.hands[opponent].length;
  return melds * 2 + (handCount <= 5 ? 3 : 0) + (handCount <= 2 ? 4 : 0);
}

function dangerOf(state: GameState, seat: number, tile: Tile, level: AiLevel): number {
  if (level !== 'normal' && level !== 'hard') return 0;
  let danger = 0;
  for (let opponent = 0; opponent < 4; opponent += 1) {
    if (opponent === seat) continue;
    const threat = threatOf(state, opponent);
    if (threat === 0) continue;
    if (state.discards[opponent].includes(tile)) continue;
    let base = 1;
    if (isSpirit(tile, state.spirit)) base = 6;
    else if (tile[0] === 'z') base = 3;
    else {
      const rank = tileRank(tile);
      base = rank >= 3 && rank <= 7 ? 2 : 1;
    }
    danger += base * threat;
  }
  return level === 'hard' ? danger : danger * 0.35;
}

interface DiscardScore {
  tile: Tile;
  value: number;
  tenpai: boolean;
  waits: number;
  potential: number;
  scatter: number;
}

function scoreDiscard(
  state: GameState,
  seat: number,
  tile: Tile,
  level: AiLevel,
): DiscardScore {
  const hand = state.hands[seat];
  const remaining = hand.slice();
  const index = remaining.indexOf(tile);
  if (index >= 0) remaining.splice(index, 1);
  const melds = state.melds[seat];
  const need = 4 - melds.length;
  const ready = remaining.length === need * 3 + 1 && isTenpai(state, seat, remaining, melds);
  const waits = ready ? waitingTiles(state, seat, remaining, melds).length : 0;
  const potential = handPotential(remaining, melds, state.spirit);
  const scatter = scatterPotential(remaining, state.spirit);
  const tenpaiBonus = ready ? 120 + waits * 2 : 0;
  const scatterBonus = scatter >= 12 ? (scatter - 11) * 4 : 0;
  const spiritPenalty = isSpirit(tile, state.spirit) ? 8 : 0;
  const value =
    potential +
    tenpaiBonus +
    scatterBonus -
    spiritPenalty -
    dangerOf(state, seat, tile, level);
  return { tile, value, tenpai: ready, waits, potential, scatter };
}

export function rankDiscards(state: GameState, seat: number, level: AiLevel = 'hard'): DiscardScore[] {
  const scores = uniqueTiles(state.hands[seat]).map((tile) => scoreDiscard(state, seat, tile, level));
  return scores.sort((a, b) => b.value - a.value || a.tile.localeCompare(b.tile));
}

function claimHand(
  hand: Tile[],
  option: ClaimOption,
  discard: Tile,
): Tile[] | null {
  const remaining = hand.slice();
  for (const tile of option.tiles) {
    const index = remaining.indexOf(tile);
    if (index < 0) return null;
    remaining.splice(index, 1);
  }
  if (!discard) return null;
  return sortTiles(remaining);
}

function claimValue(state: GameState, seat: number, option: ClaimOption): number {
  const discard = state.lastDiscard?.tile;
  if (!discard) return -Infinity;
  const before = handPotential(state.hands[seat], state.melds[seat], state.spirit);
  const hand = claimHand(state.hands[seat], option, discard);
  if (!hand) return -Infinity;
  const shape = {
    id: 999,
    kind: option.kind === 'chi' ? 'chi' : option.kind === 'peng' ? 'peng' : 'gang',
    tiles: [...option.tiles, discard],
    owner: seat,
    claimedFrom: state.lastDiscard?.seat ?? null,
    concealed: false,
    added: false,
    target: option.target,
    usedWild: option.usedWild,
    spiritKong: false,
  } as Meld;
  const melds = [...state.melds[seat], shape];
  const potential = handPotential(hand, melds, state.spirit);
  const scatter = scatterPotential(hand, state.spirit);
  const gangBonus = option.kind === 'gang' ? 8 : 0;
  return potential - before + gangBonus + (scatter >= 12 ? 6 : 0);
}

function chooseClaim(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng,
): AiAction {
  const decision = state.phase === 'claim' ? state.claimQueue[state.claimIndex] : null;
  if (!decision || decision.seat !== seat) return { type: 'pass' };
  const win = decision.options.find((option) => option.kind === 'win');
  if (win) return { type: 'claim', option: win };

  const scored = decision.options
    .map((option) => ({ option, value: claimValue(state, seat, option) }))
    .sort((a, b) => b.value - a.value);
  if (scored.length === 0) return { type: 'pass' };
  const best = scored[0];
  const thresholds: Record<AiLevel, number> = {
    companion: 12,
    easy: 7,
    normal: 4,
    hard: 2,
  };
  if (level === 'companion' && rng() < 0.35) return { type: 'pass' };
  if (level === 'easy' && rng() < 0.3) return { type: 'pass' };
  if (best.value < thresholds[level]) return { type: 'pass' };
  return { type: 'claim', option: best.option };
}

function chooseKong(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng,
): KongOption | null {
  const options = kongOptionsFor(state, seat);
  if (options.length === 0) return null;
  const before = rankDiscards(state, seat, level)[0];
  const ranked = options
    .map((option) => {
      const hand = state.hands[seat].slice();
      for (const tile of option.tiles) {
        const index = hand.indexOf(tile);
        if (index >= 0) hand.splice(index, 1);
      }
      const potential = handPotential(hand, state.melds[seat], state.spirit);
      return { option, potential };
    })
    .sort((a, b) => b.potential - a.potential);
  const choice = ranked[0];
  if (level === 'companion' && rng() < 0.4) return null;
  if (level === 'easy' && rng() < 0.25) return null;
  if (level === 'normal' && before?.tenpai && rng() < 0.5) return null;
  return choice.option;
}

export function chooseAiAction(
  state: GameState,
  seat: number,
  level: AiLevel,
  rng: Rng = () => 0.5,
): AiAction | null {
  if (state.phase === 'draw' && state.turn === seat) return { type: 'draw' };
  if (state.phase === 'claim') {
    const decision = state.claimQueue[state.claimIndex];
    if (!decision || decision.seat !== seat) return null;
    return chooseClaim(state, seat, level, rng);
  }
  if (state.phase !== 'discard' || state.turn !== seat) return null;

  const check = evaluateWin(state.hands[seat], state.melds[seat], state.spirit, state.drawn);
  if (check.win) return { type: 'win' };

  const kong = chooseKong(state, seat, level, rng);
  if (kong) return { type: 'kong', option: kong };

  const ranked = rankDiscards(state, seat, level);
  if (ranked.length === 0) return null;
  if (level === 'easy' && rng() < 0.22) return { type: 'discard', tile: pick(uniqueTiles(state.hands[seat]), rng) };
  if (level === 'companion' && rng() < 0.18) return { type: 'discard', tile: pick(uniqueTiles(state.hands[seat]), rng) };
  return { type: 'discard', tile: ranked[0].tile };
}

export function hintFor(state: GameState, seat: number): Hint | null {
  if (state.phase === 'claim') {
    const decision = state.claimQueue[state.claimIndex];
    if (!decision || decision.seat !== seat) return null;
    const action = chooseClaim(state, seat, 'hard', () => 0.5);
    if (action.type === 'claim') {
      const option = action.option;
      const reason =
        option.kind === 'win'
          ? 'claim-win'
          : option.kind === 'gang'
            ? 'claim-gang'
            : option.kind === 'peng'
              ? 'claim-peng'
              : 'claim-chi';
      return { action, reason, option };
    }
    return { action: { type: 'pass' }, reason: 'pass' };
  }
  if (state.phase !== 'discard' || state.turn !== seat) return null;
  const check = evaluateWin(state.hands[seat], state.melds[seat], state.spirit, state.drawn);
  if (check.win) {
    return { action: { type: 'win' }, reason: 'win', pattern: check.bestPattern ?? undefined };
  }
  const kong = chooseKong(state, seat, 'hard', () => 0.5);
  if (kong) return { action: { type: 'kong', option: kong }, reason: 'kong', option: kong };

  const ranked = rankDiscards(state, seat, 'hard');
  if (ranked.length === 0) return null;
  const best = ranked[0];
  let reason: HintReason = 'discard-isolated';
  if (best.tenpai) reason = 'discard-tenpai';
  else if (best.scatter >= 12) reason = 'discard-scatter';
  else if (isSpirit(best.tile, state.spirit)) reason = 'discard-spirit';
  else if (state.discards.some((pile, opponent) => opponent !== seat && pile.includes(best.tile))) {
    reason = 'discard-safe';
  }
  return {
    action: { type: 'discard', tile: best.tile },
    reason,
    tile: best.tile,
    waits: best.waits,
  };
}

