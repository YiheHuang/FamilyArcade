/**
 * Nanchang Mahjong · pure four-player engine.
 *
 * No DOM, network, clock or Math.random. Every shuffle and dice roll takes an
 * injected RNG. The engine implements the Nanchang family rules: 136 tiles,
 * 13-tile hands, chi / peng / kong, a 17-stack dead wall, special honour
 * sequences (three different winds or three different dragons), seven spirit
 * tiles (true and secondary), and the published scoring table.
 */

export type Suit = 'm' | 'p' | 's' | 'z';
export type Tile = string;
export type Seat = 0 | 1 | 2 | 3;
export type Rng = () => number;
export type Phase = 'draw' | 'discard' | 'claim' | 'hand-over' | 'game-over';
export type WinMethod = 'self-draw' | 'discard' | 'rob-kong' | 'heavenly' | 'human';
export type WinPattern =
  | 'basic'
  | 'small-seven-pairs'
  | 'big-seven-pairs'
  | 'thirteen-scattered'
  | 'seven-star';

export interface SpiritInfo {
  /** The physical tile flipped from the dead wall. It is not a spirit itself. */
  indicator: Tile;
  trueTile: Tile;
  secondaryTile: Tile;
  dice: [number, number];
  diceSum: number;
  stackIndex: number;
}

export type MeldKind = 'chi' | 'peng' | 'gang';

export interface Meld {
  id: number;
  kind: MeldKind;
  tiles: Tile[];
  owner: number;
  claimedFrom: number | null;
  concealed: boolean;
  added: boolean;
  target: string;
  usedWild: boolean;
  spiritKong: boolean;
}

export interface ClaimOption {
  kind: 'win' | 'gang' | 'peng' | 'chi';
  /** Hand tiles used, excluding the claimed discard. */
  tiles: Tile[];
  target: string;
  usedWild: boolean;
}

export interface ClaimDecision {
  seat: number;
  options: ClaimOption[];
}

export interface KongOption {
  kind: 'concealed' | 'added';
  tiles: Tile[];
  meldId?: number;
  target: string;
  spiritKong: boolean;
}

export interface WinInfo {
  seat: number;
  method: WinMethod;
  from: number | null;
  tile: Tile;
  pattern: WinPattern;
  patterns: WinPattern[];
  usedWild: boolean;
  spiritSingleWait: boolean;
  kongDraw: boolean;
  robbingKong: boolean;
  heavenly: boolean;
  human: boolean;
}

export interface ScoreSheet {
  winner: number | null;
  pattern: WinPattern | null;
  patterns: WinPattern[];
  method: WinMethod | null;
  drawn: boolean;
  unitValue: number;
  patternMultiplier: number;
  flatBonus: number;
  dealer: number;
  payments: number[];
  deltas: number[];
  scoresAfter: number[];
  spiritBase: number[];
  spiritAdjusted: number[];
  kongPoints: number[];
  spiritSprint: number[];
  overlord: boolean;
  german: boolean;
  germanInGerman: boolean;
  spiritSingleWait: boolean;
  kongDraw: boolean;
  robbingKong: boolean;
  heavenly: boolean;
  human: boolean;
}

export interface GameFlags {
  heavenlyAvailable: boolean;
  kongDraw: boolean;
  firstDiscard: boolean;
  humanHandEligible: boolean;
  dealerFirstDiscard: boolean;
}

export interface GameState {
  phase: Phase;
  handNumber: number;
  dealer: number;
  turn: number;
  hands: Tile[][];
  melds: Meld[][];
  discards: Tile[][];
  liveWall: Tile[];
  deadWall: Tile[];
  spirit: SpiritInfo;
  scores: number[];
  matchTarget: number;
  lastDiscard: { seat: number; tile: Tile } | null;
  lastClaim: { seat: number; kind: string; tile: Tile } | null;
  claimQueue: ClaimDecision[];
  claimIndex: number;
  pendingKong: { seat: number; meldId: number; tile: Tile } | null;
  drawn: Tile | null;
  kongPoints: number[];
  flags: GameFlags;
  win: WinInfo | null;
  scoreSheet: ScoreSheet | null;
  matchWinner: number | null;
  version: number;
}

export interface AiView {
  seat: number;
  phase: Phase;
  handNumber: number;
  dealer: number;
  turn: number;
  scores: number[];
  matchTarget: number;
  hand: Tile[];
  handCounts: number[];
  melds: Meld[][];
  discards: Tile[][];
  spirit: SpiritInfo;
  liveWallCount: number;
  deadWallCount: number;
  lastDiscard: { seat: number; tile: Tile } | null;
  lastClaim: { seat: number; kind: string; tile: Tile } | null;
  drawn: Tile | null;
  canDraw: boolean;
  canDiscard: boolean;
  canWin: boolean;
  winPatterns: WinPattern[];
  kongOptions: KongOption[];
  claimOptions: ClaimOption[];
  claimSeat: number | null;
  kongPoints: number[];
  win: WinInfo | null;
  scoreSheet: ScoreSheet | null;
  canNextHand: boolean;
  matchWinner: number | null;
  revealedHands: Tile[][] | null;
  flags: GameFlags;
  pendingKong: { seat: number; meldId: number; tile: Tile } | null;
  version: number;
}

export type SeatView = AiView;

export interface ActionResult {
  ok: boolean;
  state: GameState;
  error?: string;
}

export interface SetupOptions {
  rng: Rng;
  dealer?: number;
  dice?: [number, number];
  matchTarget?: number;
  scores?: number[];
  handNumber?: number;
}

export const TILE_TYPES: readonly Tile[] = (() => {
  const tiles: Tile[] = [];
  for (const suit of ['m', 'p', 's'] as const) {
    for (let rank = 1; rank <= 9; rank += 1) tiles.push(`${suit}${rank}`);
  }
  for (let rank = 1; rank <= 7; rank += 1) tiles.push(`z${rank}`);
  return tiles;
})();

export const WINDS: readonly Tile[] = ['z1', 'z2', 'z3', 'z4'];
export const DRAGONS: readonly Tile[] = ['z5', 'z6', 'z7'];
export const HONOURS: readonly Tile[] = [...WINDS, ...DRAGONS];
export const SEAT_WINDS = ['East', 'South', 'West', 'North'] as const;

const SUIT_ORDER: Record<string, number> = { m: 0, p: 1, s: 2, z: 3 };

export function tileSuit(tile: Tile): Suit {
  return tile[0] as Suit;
}

export function tileRank(tile: Tile): number {
  return Number(tile.slice(1));
}

export function isHonour(tile: Tile): boolean {
  return tile[0] === 'z';
}

export function isWind(tile: Tile): boolean {
  return tile >= 'z1' && tile <= 'z4';
}

export function isDragon(tile: Tile): boolean {
  return tile >= 'z5' && tile <= 'z7';
}

export function nextTileInCycle(tile: Tile): Tile {
  const rank = tileRank(tile);
  if (tile[0] === 'z') {
    if (rank <= 4) return `z${rank === 4 ? 1 : rank + 1}`;
    return `z${rank === 7 ? 5 : rank + 1}`;
  }
  return `${tile[0]}${rank === 9 ? 1 : rank + 1}`;
}

export function makeDeck(): Tile[] {
  const deck: Tile[] = [];
  for (const tile of TILE_TYPES) {
    for (let copy = 0; copy < 4; copy += 1) deck.push(tile);
  }
  return deck;
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const raw = Math.floor(rng() * (index + 1));
    const pick = Math.max(0, Math.min(index, raw));
    [copy[index], copy[pick]] = [copy[pick], copy[index]];
  }
  return copy;
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return tiles.slice().sort((a, b) => {
    const suitDiff = SUIT_ORDER[a[0]] - SUIT_ORDER[b[0]];
    if (suitDiff !== 0) return suitDiff;
    return tileRank(a) - tileRank(b);
  });
}

export function spiritKind(tile: Tile, spirit: SpiritInfo): 'true' | 'secondary' | null {
  if (tile === spirit.trueTile) return 'true';
  if (tile === spirit.secondaryTile) return 'secondary';
  return null;
}

export function isSpirit(tile: Tile, spirit: SpiritInfo): boolean {
  return spiritKind(tile, spirit) !== null;
}

export function spiritCounts(
  tiles: Tile[],
  spirit: SpiritInfo,
): { trueCount: number; secondaryCount: number; points: number } {
  let trueCount = 0;
  let secondaryCount = 0;
  for (const tile of tiles) {
    const kind = spiritKind(tile, spirit);
    if (kind === 'true') trueCount += 1;
    else if (kind === 'secondary') secondaryCount += 1;
  }
  return { trueCount, secondaryCount, points: trueCount * 2 + secondaryCount };
}

export function assignSpirit(indicator: Tile, dice: [number, number], stackIndex: number): SpiritInfo {
  return {
    indicator,
    trueTile: indicator,
    secondaryTile: nextTileInCycle(indicator),
    dice,
    diceSum: dice[0] + dice[1],
    stackIndex,
  };
}

function rollDie(rng: Rng): number {
  return Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1));
}

function asSeat(value: number): Seat | null {
  return value === 0 || value === 1 || value === 2 || value === 3 ? (value as Seat) : null;
}

function nextSeat(seat: number): Seat {
  return ((seat + 1) % 4) as Seat;
}

function seatDistance(from: number, to: number): number {
  return (to - from + 4) % 4;
}

function removeOne(hand: Tile[], tile: Tile): Tile[] | null {
  const index = hand.indexOf(tile);
  if (index < 0) return null;
  const copy = hand.slice();
  copy.splice(index, 1);
  return copy;
}

function countMap(tiles: Tile[]): Map<Tile, number> {
  const counts = new Map<Tile, number>();
  for (const tile of tiles) counts.set(tile, (counts.get(tile) ?? 0) + 1);
  return counts;
}

function countOf(counts: Map<Tile, number>, tile: Tile): number {
  return counts.get(tile) ?? 0;
}

function cloneCounts(counts: Map<Tile, number>): Map<Tile, number> {
  return new Map(counts);
}

function consume(counts: Map<Tile, number>, tile: Tile, amount: number): void {
  const next = (counts.get(tile) ?? 0) - amount;
  if (next <= 0) counts.delete(tile);
  else counts.set(tile, next);
}

function firstTile(counts: Map<Tile, number>): Tile | null {
  let best: Tile | null = null;
  for (const [tile, amount] of counts) {
    if (amount <= 0) continue;
    if (best === null || sortTiles([best, tile])[0] === tile) best = tile;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Meld recognition                                                    */
/* ------------------------------------------------------------------ */

function assignmentWild(
  tiles: Tile[],
  targets: Tile[],
  spirit: SpiritInfo,
): boolean | null {
  if (tiles.length !== targets.length) return null;
  let best: boolean | null = null;
  const used = new Array<boolean>(targets.length).fill(false);
  const walk = (index: number, usedWild: boolean): void => {
    if (index === tiles.length) {
      best = best === null ? usedWild : best && usedWild;
      return;
    }
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      if (used[targetIndex]) continue;
      const tile = tiles[index];
      const target = targets[targetIndex];
      const wildcard = spiritKind(tile, spirit) !== null;
      if (tile !== target && !wildcard) continue;
      used[targetIndex] = true;
      walk(index + 1, usedWild || (wildcard && tile !== target));
      used[targetIndex] = false;
    }
  };
  walk(0, false);
  return best;
}

function honourGroup(tile: Tile): 'wind' | 'dragon' | null {
  if (isWind(tile)) return 'wind';
  if (isDragon(tile)) return 'dragon';
  return null;
}

function threeSubsets(items: readonly Tile[]): Tile[][] {
  const result: Tile[][] = [];
  for (let a = 0; a < items.length - 2; a += 1) {
    for (let b = a + 1; b < items.length - 1; b += 1) {
      for (let c = b + 1; c < items.length; c += 1) {
        result.push([items[a], items[b], items[c]]);
      }
    }
  }
  return result;
}

export interface MeldShape {
  kind: MeldKind;
  target: string;
  usedWild: boolean;
}

export function analyseChi(tiles: Tile[], spirit: SpiritInfo): MeldShape | null {
  if (tiles.length !== 3) return null;
  const naturals = tiles.filter((tile) => !isSpirit(tile, spirit));
  if (naturals.length === 0) {
    return { kind: 'chi', target: 'chi:spirit', usedWild: true };
  }
  const numberNaturals = naturals.filter((tile) => !isHonour(tile));
  if (numberNaturals.length === naturals.length) {
    const suit = numberNaturals[0][0];
    if (!numberNaturals.every((tile) => tile[0] === suit)) return null;
    let best: MeldShape | null = null;
    for (let start = 1; start <= 7; start += 1) {
      const targets = [0, 1, 2].map((offset) => `${suit}${start + offset}`);
      const wild = assignmentWild(tiles, targets, spirit);
      if (wild === null) continue;
      if (
        best === null ||
        Number(wild) < Number(best.usedWild) ||
        (wild === best.usedWild && `chi:${suit}${start}` < best.target)
      ) {
        best = { kind: 'chi', target: `chi:${suit}${start}`, usedWild: wild };
      }
    }
    return best;
  }
  const honourNaturals = naturals.filter((tile) => isHonour(tile));
  if (honourNaturals.length !== naturals.length) return null;
  const group = honourGroup(honourNaturals[0]);
  if (group === null || !honourNaturals.every((tile) => honourGroup(tile) === group)) {
    return null;
  }
  const pool = group === 'wind' ? WINDS : DRAGONS;
  let best: MeldShape | null = null;
  for (const subset of threeSubsets(pool)) {
    const wild = assignmentWild(tiles, subset, spirit);
    if (wild === null) continue;
    const target = `chi:${group}:${subset.join(',')}`;
    if (
      best === null ||
      Number(wild) < Number(best.usedWild) ||
      (wild === best.usedWild && target < best.target)
    ) {
      best = { kind: 'chi', target, usedWild: wild };
    }
  }
  return best;
}

export function analysePeng(tiles: Tile[], spirit: SpiritInfo): MeldShape | null {
  if (tiles.length !== 3) return null;
  const naturals = tiles.filter((tile) => !isSpirit(tile, spirit));
  if (naturals.length === 0) {
    const target = tiles[0];
    const usedWild = tiles.some((tile) => tile !== target);
    return { kind: 'peng', target: `peng:${target}`, usedWild };
  }
  const target = naturals[0];
  if (!naturals.every((tile) => tile === target)) return null;
  const usedWild = tiles.some((tile) => spiritKind(tile, spirit) !== null && tile !== target);
  return { kind: 'peng', target: `peng:${target}`, usedWild };
}

export function analyseGang(tiles: Tile[], spirit: SpiritInfo): MeldShape | null {
  if (tiles.length !== 4) return null;
  const naturals = tiles.filter((tile) => !isSpirit(tile, spirit));
  if (naturals.length === 0) {
    const target = tiles[0];
    const usedWild = tiles.some((tile) => tile !== target);
    return { kind: 'gang', target: `gang:${target}`, usedWild };
  }
  const target = naturals[0];
  if (!naturals.every((tile) => tile === target)) return null;
  const usedWild = tiles.some((tile) => spiritKind(tile, spirit) !== null && tile !== target);
  return { kind: 'gang', target: `gang:${target}`, usedWild };
}

export function analyseMeld(tiles: Tile[], spirit: SpiritInfo): MeldShape | null {
  if (tiles.length === 4) return analyseGang(tiles, spirit);
  if (tiles.length !== 3) return null;
  const naturals = tiles.filter((tile) => !isSpirit(tile, spirit));
  const allSame = naturals.length === 0 || naturals.every((tile) => tile === naturals[0]);
  if (allSame) {
    const peng = analysePeng(tiles, spirit);
    if (peng) return peng;
  }
  return analyseChi(tiles, spirit);
}

/* ------------------------------------------------------------------ */
/* Win solving                                                         */
/* ------------------------------------------------------------------ */

function meldKey(counts: Map<Tile, number>, wilds: number, need: number, tripletsOnly: boolean): string {
  const parts: string[] = [];
  for (const tile of TILE_TYPES) {
    const amount = counts.get(tile) ?? 0;
    if (amount > 0) parts.push(`${tile}:${amount}`);
  }
  return `${parts.join(',')}|${wilds}|${need}|${tripletsOnly ? 't' : 'a'}`;
}

function solveMeldsInner(
  counts: Map<Tile, number>,
  wilds: number,
  need: number,
  tripletsOnly: boolean,
  failed: Set<string>,
): boolean {
  if (need === 0) {
    for (const amount of counts.values()) if (amount > 0) return false;
    return wilds === 0;
  }
  const key = meldKey(counts, wilds, need, tripletsOnly);
  if (failed.has(key)) return false;

  const tile = firstTile(counts);
  if (tile === null) {
    const ok = wilds >= need * 3;
    if (!ok) failed.add(key);
    return ok;
  }

  const available = countOf(counts, tile);
  const useNatural = Math.min(3, available);
  const useWild = 3 - useNatural;
  if (useWild <= wilds) {
    const next = cloneCounts(counts);
    consume(next, tile, useNatural);
    if (solveMeldsInner(next, wilds - useWild, need - 1, tripletsOnly, failed)) return true;
  }

  if (!tripletsOnly && !isHonour(tile)) {
    const rank = tileRank(tile);
    const suit = tile[0];
    for (let start = rank - 2; start <= rank; start += 1) {
      if (start < 1 || start > 7) continue;
      const next = cloneCounts(counts);
      let wildUse = 0;
      for (let offset = 0; offset < 3; offset += 1) {
        const target = `${suit}${start + offset}`;
        if (countOf(next, target) > 0) consume(next, target, 1);
        else wildUse += 1;
      }
      if (wildUse <= wilds && solveMeldsInner(next, wilds - wildUse, need - 1, tripletsOnly, failed)) {
        return true;
      }
    }
  }

  if (!tripletsOnly && isHonour(tile)) {
    const group = honourGroup(tile);
    const pool = group === 'wind' ? WINDS : group === 'dragon' ? DRAGONS : null;
    if (pool) {
      for (const subset of threeSubsets(pool)) {
        if (!subset.includes(tile)) continue;
        const next = cloneCounts(counts);
        let wildUse = 0;
        for (const target of subset) {
          if (countOf(next, target) > 0) consume(next, target, 1);
          else wildUse += 1;
        }
        if (wildUse <= wilds && solveMeldsInner(next, wilds - wildUse, need - 1, tripletsOnly, failed)) {
          return true;
        }
      }
    }
  }

  failed.add(key);
  return false;
}

function canFormMelds(
  counts: Map<Tile, number>,
  wilds: number,
  need: number,
  tripletsOnly = false,
): boolean {
  return solveMeldsInner(counts, wilds, need, tripletsOnly, new Set());
}

interface BasicSolution {
  ok: boolean;
  allTriplets: boolean;
}

function solveBasic(
  tiles: Tile[],
  spirit: SpiritInfo,
  need: number,
  naturalMode: boolean,
): BasicSolution {
  const wilds = naturalMode ? 0 : tiles.filter((tile) => isSpirit(tile, spirit)).length;
  const counts = naturalMode
    ? countMap(tiles)
    : countMap(tiles.filter((tile) => !isSpirit(tile, spirit)));
  if (tiles.length !== need * 3 + 2) return { ok: false, allTriplets: false };

  const pairChoices: { counts: Map<Tile, number>; wilds: number }[] = [];
  for (const [tile, amount] of counts) {
    if (amount >= 2) {
      const next = cloneCounts(counts);
      consume(next, tile, 2);
      pairChoices.push({ counts: next, wilds });
    }
    if (amount >= 1 && wilds >= 1) {
      const next = cloneCounts(counts);
      consume(next, tile, 1);
      pairChoices.push({ counts: next, wilds: wilds - 1 });
    }
  }
  if (wilds >= 2) pairChoices.push({ counts: cloneCounts(counts), wilds: wilds - 2 });

  let normal = false;
  let allTriplets = false;
  for (const pair of pairChoices) {
    if (!normal && canFormMelds(pair.counts, pair.wilds, need)) normal = true;
    if (canFormMelds(pair.counts, pair.wilds, need, true)) allTriplets = true;
    if (normal && allTriplets) break;
  }
  return { ok: normal, allTriplets };
}

function solveSingleWait(tiles: Tile[], spirit: SpiritInfo, need: number): boolean {
  if (tiles.length !== need * 3 + 1) return false;
  const wilds = tiles.filter((tile) => isSpirit(tile, spirit)).length;
  const counts = countMap(tiles.filter((tile) => !isSpirit(tile, spirit)));
  const candidates = new Set<Tile>(tiles.filter((tile) => !isSpirit(tile, spirit)));
  for (const tile of candidates) {
    const next = cloneCounts(counts);
    consume(next, tile, 1);
    if (canFormMelds(next, wilds, need)) return true;
  }
  if (wilds > 0) {
    if (canFormMelds(counts, wilds - 1, need)) return true;
  }
  return false;
}

function isSevenPairs(tiles: Tile[], spirit: SpiritInfo, naturalMode: boolean): boolean {
  if (tiles.length !== 14) return false;
  const wilds = naturalMode ? 0 : tiles.filter((tile) => isSpirit(tile, spirit)).length;
  const counts = naturalMode
    ? countMap(tiles)
    : countMap(tiles.filter((tile) => !isSpirit(tile, spirit)));
  let pairs = 0;
  let singles = 0;
  for (const amount of counts.values()) {
    pairs += Math.floor(amount / 2);
    if (amount % 2 === 1) singles += 1;
  }
  if (wilds < singles) return false;
  return (wilds - singles) % 2 === 0 && pairs + singles + (wilds - singles) / 2 === 7;
}

/* Thirteen Scattered ------------------------------------------------- */

const SPACED_BY_SUIT: number[][] = (() => {
  const sets: number[][] = [];
  for (let mask = 0; mask < 1 << 9; mask += 1) {
    const ranks: number[] = [];
    for (let index = 0; index < 9; index += 1) {
      if (mask & (1 << index)) ranks.push(index + 1);
    }
    if (ranks.length > 3) continue;
    if (ranks.every((rank, index) => index === 0 || rank - ranks[index - 1] >= 3)) {
      sets.push(ranks);
    }
  }
  return sets;
})();

function feasibleSizes(ranks: number[]): boolean[] {
  const feasible = [false, false, false, false];
  const unique = new Set(ranks);
  if (unique.size !== ranks.length) return feasible;
  for (let index = 1; index < ranks.length; index += 1) {
    if (ranks[index] - ranks[index - 1] < 3) return feasible;
  }
  for (const set of SPACED_BY_SUIT) {
    if (ranks.every((rank) => set.includes(rank))) feasible[set.length] = true;
  }
  return feasible;
}

function numberSizesPossible(
  groups: Record<'m' | 'p' | 's', number[]>,
  total: number,
): boolean {
  const m = feasibleSizes(groups.m);
  const p = feasibleSizes(groups.p);
  const s = feasibleSizes(groups.s);
  for (let a = 0; a <= 3; a += 1) {
    for (let b = 0; b <= 3; b += 1) {
      for (let c = 0; c <= 3; c += 1) {
        if (a + b + c === total && m[a] && p[b] && s[c]) return true;
      }
    }
  }
  return false;
}

function isScattered(
  tiles: Tile[],
  spirit: SpiritInfo,
  sevenStar: boolean,
  naturalMode: boolean,
): boolean {
  if (tiles.length !== 14) return false;
  const naturals = naturalMode ? tiles.slice() : tiles.filter((tile) => !isSpirit(tile, spirit));
  const honourTiles = naturals.filter((tile) => isHonour(tile));
  if (new Set(honourTiles).size !== honourTiles.length) return false;
  if (sevenStar && honourTiles.length !== 7) return false;
  if (!sevenStar && honourTiles.length > 7) return false;

  const groups: Record<'m' | 'p' | 's', number[]> = { m: [], p: [], s: [] };
  for (const tile of naturals) {
    if (isHonour(tile)) continue;
    groups[tile[0] as 'm' | 'p' | 's'].push(tileRank(tile));
  }
  for (const suit of ['m', 'p', 's'] as const) groups[suit].sort((a, b) => a - b);

  if (sevenStar) return numberSizesPossible(groups, 7);

  for (let numberCount = 7; numberCount <= 9; numberCount += 1) {
    const honourCount = 14 - numberCount;
    if (honourTiles.length > honourCount) continue;
    if (numberSizesPossible(groups, numberCount)) return true;
  }
  return false;
}

export interface WinCheck {
  win: boolean;
  patterns: WinPattern[];
  bestPattern: WinPattern | null;
  usedWild: boolean;
  natural: boolean;
  spiritPairWait: boolean;
  canBasic: boolean;
  canSmallSevenPairs: boolean;
  canBigSevenPairs: boolean;
  canThirteenScattered: boolean;
  canSevenStar: boolean;
}

const PATTERN_RANK: Record<WinPattern, number> = {
  basic: 0,
  'small-seven-pairs': 2,
  'big-seven-pairs': 3,
  'thirteen-scattered': 1,
  'seven-star': 4,
};

export function evaluateWin(
  tiles: Tile[],
  melds: Meld[],
  spirit: SpiritInfo,
  winningTile: Tile | null = null,
): WinCheck {
  const need = 4 - melds.length;
  const basic = solveBasic(tiles, spirit, need, false);
  const smallSevenPairs =
    melds.length === 0 && isSevenPairs(tiles, spirit, false);
  const bigSevenPairs =
    melds.length === 0 && basic.ok && basic.allTriplets;
  const thirteenScattered =
    melds.length === 0 && isScattered(tiles, spirit, false, false);
  const sevenStar =
    melds.length === 0 && isScattered(tiles, spirit, true, false);

  const patterns: WinPattern[] = [];
  if (sevenStar) patterns.push('seven-star');
  if (bigSevenPairs) patterns.push('big-seven-pairs');
  if (smallSevenPairs) patterns.push('small-seven-pairs');
  if (thirteenScattered) patterns.push('thirteen-scattered');
  if (basic.ok) patterns.push('basic');

  const bestPattern =
    patterns.length === 0
      ? null
      : patterns.slice().sort((a, b) => PATTERN_RANK[b] - PATTERN_RANK[a])[0];

  const naturalBasic = solveBasic(tiles, spirit, need, true).ok;
  const naturalSmall = melds.length === 0 && isSevenPairs(tiles, spirit, true);
  const naturalThirteen = melds.length === 0 && isScattered(tiles, spirit, false, true);
  const naturalSevenStar = melds.length === 0 && isScattered(tiles, spirit, true, true);
  const natural =
    (naturalBasic && !melds.some((meld) => meld.usedWild)) ||
    naturalSmall ||
    naturalThirteen ||
    naturalSevenStar;

  let spiritPairWait = false;
  if (winningTile !== null && isSpirit(winningTile, spirit) && melds.length <= 4) {
    const without = removeOne(tiles, winningTile);
    if (without !== null) spiritPairWait = solveSingleWait(without, spirit, need);
  }

  return {
    win: patterns.length > 0,
    patterns,
    bestPattern,
    usedWild: !natural,
    natural,
    spiritPairWait,
    canBasic: basic.ok,
    canSmallSevenPairs: smallSevenPairs,
    canBigSevenPairs: bigSevenPairs,
    canThirteenScattered: thirteenScattered,
    canSevenStar: sevenStar,
  };
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

const PATTERN_MULTIPLIER: Record<WinPattern, number> = {
  basic: 1,
  'small-seven-pairs': 2,
  'big-seven-pairs': 2,
  'thirteen-scattered': 2,
  'seven-star': 4,
};

export interface ScoreInput {
  scores: number[];
  dealer: number;
  winner: number | null;
  method: WinMethod | null;
  pattern: WinPattern | null;
  patterns: WinPattern[];
  spirit: SpiritInfo;
  hands: Tile[][];
  melds: Meld[][];
  kongPoints: number[];
  matchTarget?: number;
  from?: number | null;
  usedWild?: boolean;
  spiritSingleWait?: boolean;
  kongDraw?: boolean;
  robbingKong?: boolean;
  heavenly?: boolean;
  human?: boolean;
  drawn?: boolean;
}

export function scoreHand(input: ScoreInput): ScoreSheet {
  const spiritBase = [0, 0, 0, 0];
  const kongPoints = input.kongPoints.slice();
  const spiritAdjusted = [0, 0, 0, 0];
  const spiritSprint = [1, 1, 1, 1];

  for (let seat = 0; seat < 4; seat += 1) {
    const tiles = [
      ...(input.hands[seat] ?? []),
      ...(input.melds[seat] ?? []).flatMap((meld) => meld.tiles),
    ];
    spiritBase[seat] = spiritCounts(tiles, input.spirit).points;
  }

  const owners = spiritBase.map((points, seat) => (points > 0 ? seat : -1)).filter((seat) => seat >= 0);
  const overlord = owners.length === 1;
  for (let seat = 0; seat < 4; seat += 1) {
    if (spiritBase[seat] >= 5) spiritSprint[seat] = spiritBase[seat] - 3;
    const overlordFactor = overlord && spiritBase[seat] > 0 ? 2 : 1;
    spiritAdjusted[seat] = spiritBase[seat] * spiritSprint[seat] * overlordFactor;
  }

  const deltas = [0, 0, 0, 0];
  let unitValue = 0;
  let patternMultiplier = 0;
  let flatBonus = 0;

  const isHeavenly = Boolean(input.heavenly || input.method === 'heavenly');
  const isHuman = Boolean(input.human || input.method === 'human');
  const isRob = Boolean(input.robbingKong || input.method === 'rob-kong');
  const germanPotential =
    input.winner !== null &&
    input.usedWild === false &&
    !isHeavenly &&
    !isHuman;
  const germanInGermanPotential =
    germanPotential &&
    input.hands.every((hand, seat) =>
      [...hand, ...(input.melds[seat] ?? []).flatMap((meld) => meld.tiles)].every(
        (tile) => !isSpirit(tile, input.spirit),
      ),
    );

  if (input.winner !== null && input.pattern !== null) {
    patternMultiplier = PATTERN_MULTIPLIER[input.pattern];
    flatBonus = 0;
    if (isHeavenly || isHuman) {
      patternMultiplier *= 20;
    } else if (input.usedWild === false) {
      if (germanInGermanPotential) {
        patternMultiplier *= 4;
        flatBonus += 5;
      } else {
        patternMultiplier *= 2;
        flatBonus += 5;
      }
    }
    if (input.spiritSingleWait) {
      patternMultiplier *= 2;
      flatBonus += 5;
    }
    if (input.kongDraw) patternMultiplier *= 4;
    unitValue = 1 * patternMultiplier + flatBonus;

    const method = input.method ?? 'self-draw';
    const from = input.from ?? -1;
    for (let payer = 0; payer < 4; payer += 1) {
      if (payer === input.winner) continue;
      let methodMultiplier = 1;
      if (method === 'self-draw') methodMultiplier = 2;
      else if (method === 'discard') methodMultiplier = payer === from ? 2 : 1;
      else if (method === 'human') methodMultiplier = payer === from ? 2 : 1;
      else if (method === 'rob-kong') methodMultiplier = payer === from ? 4 : 1;
      else methodMultiplier = 1;
      const dealerMultiplier =
        input.winner === input.dealer || payer === input.dealer ? 2 : 1;
      const payment = unitValue * methodMultiplier * dealerMultiplier;
      deltas[payer] -= payment;
      deltas[input.winner] += payment;
    }
  }

  for (let a = 0; a < 4; a += 1) {
    for (let b = a + 1; b < 4; b += 1) {
      const combinedA = spiritAdjusted[a] + kongPoints[a];
      const combinedB = spiritAdjusted[b] + kongPoints[b];
      const diff = combinedA - combinedB;
      deltas[a] += diff;
      deltas[b] -= diff;
    }
  }

  const scoresAfter = input.scores.map((score, seat) => score + deltas[seat]);
  const german = germanPotential;
  const germanInGerman = germanInGermanPotential;

  return {
    winner: input.winner,
    pattern: input.pattern,
    patterns: input.patterns.slice(),
    method: input.method,
    drawn: Boolean(input.drawn),
    unitValue,
    patternMultiplier,
    flatBonus,
    dealer: input.dealer,
    payments: deltas.slice(),
    deltas,
    scoresAfter,
    spiritBase,
    spiritAdjusted,
    kongPoints,
    spiritSprint,
    overlord,
    german,
    germanInGerman,
    spiritSingleWait: Boolean(input.spiritSingleWait),
    kongDraw: Boolean(input.kongDraw),
    robbingKong: isRob,
    heavenly: isHeavenly,
    human: isHuman,
  };
}

/* ------------------------------------------------------------------ */
/* Deal and setup                                                      */
/* ------------------------------------------------------------------ */

function deal(
  rng: Rng,
  dealer: number,
  dice: [number, number] | undefined,
): {
  hands: Tile[][];
  liveWall: Tile[];
  deadWall: Tile[];
  spirit: SpiritInfo;
} {
  const deck = shuffle(makeDeck(), rng);
  const hands: Tile[][] = [[], [], [], []];
  for (let round = 0; round < 13; round += 1) {
    for (let offset = 0; offset < 4; offset += 1) {
      const seat = (dealer + offset) % 4;
      const tile = deck.pop();
      if (tile) hands[seat].push(tile);
    }
  }
  const dealerTile = deck.pop();
  if (dealerTile) hands[dealer].push(dealerTile);

  const deadWall = deck.slice(-34);
  const liveWall = deck.slice(0, -34);
  const rolled: [number, number] = dice ?? [rollDie(rng), rollDie(rng)];
  const stackIndex = Math.min(16, Math.max(0, rolled[0] + rolled[1] - 1));
  const indicator = deadWall[stackIndex * 2] ?? TILE_TYPES[0];
  const spirit = assignSpirit(indicator, rolled, stackIndex);
  return {
    hands: hands.map((hand) => sortTiles(hand)),
    liveWall,
    deadWall,
    spirit,
  };
}

export function setup(options: SetupOptions): GameState {
  const dealer = asSeat(options.dealer ?? 0) ?? 0;
  const dealt = deal(options.rng, dealer, options.dice);
  const scores = (options.scores ?? [0, 0, 0, 0]).slice();
  const state: GameState = {
    phase: 'discard',
    handNumber: options.handNumber ?? 1,
    dealer,
    turn: dealer,
    hands: dealt.hands,
    melds: [[], [], [], []],
    discards: [[], [], [], []],
    liveWall: dealt.liveWall,
    deadWall: dealt.deadWall,
    spirit: dealt.spirit,
    scores,
    matchTarget: options.matchTarget ?? 100,
    lastDiscard: null,
    lastClaim: null,
    claimQueue: [],
    claimIndex: 0,
    pendingKong: null,
    drawn: null,
    kongPoints: [0, 0, 0, 0],
    flags: {
      heavenlyAvailable: evaluateWin(dealt.hands[dealer], [], dealt.spirit).win,
      kongDraw: false,
      firstDiscard: true,
      humanHandEligible: true,
      dealerFirstDiscard: false,
    },
    win: null,
    scoreSheet: null,
    matchWinner: null,
    version: 0,
  };
  return state;
}

/* ------------------------------------------------------------------ */
/* Claims                                                              */
/* ------------------------------------------------------------------ */

const CLAIM_PRIORITY: Record<ClaimOption['kind'], number> = {
  win: 4,
  gang: 3,
  peng: 2,
  chi: 1,
};

function uniqueCombos(hand: Tile[], size: number): Tile[][] {
  const result: Tile[][] = [];
  const seen = new Set<string>();
  const walk = (start: number, chosen: Tile[]): void => {
    if (chosen.length === size) {
      const sorted = chosen.slice().sort();
      const key = sorted.join('|');
      if (!seen.has(key)) {
        seen.add(key);
        result.push(sorted);
      }
      return;
    }
    for (let index = start; index < hand.length; index += 1) {
      chosen.push(hand[index]);
      walk(index + 1, chosen);
      chosen.pop();
    }
  };
  walk(0, []);
  return result;
}

export function claimOptionsFor(
  seat: number,
  hand: Tile[],
  melds: Meld[],
  discard: Tile,
  from: number,
  spirit: SpiritInfo,
): ClaimOption[] {
  if (seat === from) return [];
  const options: ClaimOption[] = [];
  const seen = new Set<string>();

  const withWin = [...hand, discard];
  const win = evaluateWin(withWin, melds, spirit, discard);
  if (win.win) {
    options.push({ kind: 'win', tiles: [], target: 'win', usedWild: win.usedWild });
    seen.add('win');
  }

  for (const combo of uniqueCombos(hand, 3)) {
    const shape = analyseGang([...combo, discard], spirit);
    if (!shape) continue;
    const key = `gang:${combo.join(',')}:${shape.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ kind: 'gang', tiles: combo, target: shape.target, usedWild: shape.usedWild });
  }

  for (const combo of uniqueCombos(hand, 2)) {
    const shape = analysePeng([...combo, discard], spirit);
    if (shape) {
      const key = `peng:${combo.join(',')}:${shape.target}`;
      if (!seen.has(key)) {
        seen.add(key);
        options.push({ kind: 'peng', tiles: combo, target: shape.target, usedWild: shape.usedWild });
      }
    }
    if (seat === nextSeat(from)) {
      const chi = analyseChi([...combo, discard], spirit);
      if (chi) {
        const key = `chi:${combo.join(',')}:${chi.target}`;
        if (!seen.has(key)) {
          seen.add(key);
          options.push({ kind: 'chi', tiles: combo, target: chi.target, usedWild: chi.usedWild });
        }
      }
    }
  }

  return options.sort(
    (a, b) =>
      CLAIM_PRIORITY[b.kind] - CLAIM_PRIORITY[a.kind] ||
      a.target.localeCompare(b.target) ||
      a.tiles.join(',').localeCompare(b.tiles.join(',')),
  );
}

function buildClaimQueue(
  state: GameState,
  from: number,
  tile: Tile,
  onlyWin = false,
): ClaimDecision[] {
  const decisions: ClaimDecision[] = [];
  for (let seat = 0; seat < 4; seat += 1) {
    if (seat === from) continue;
    const options = claimOptionsFor(seat, state.hands[seat], state.melds[seat], tile, from, state.spirit);
    const filtered = onlyWin ? options.filter((option) => option.kind === 'win') : options;
    if (filtered.length > 0) decisions.push({ seat, options: filtered });
  }
  return decisions.sort((a, b) => {
    const priorityA = Math.max(...a.options.map((option) => CLAIM_PRIORITY[option.kind]));
    const priorityB = Math.max(...b.options.map((option) => CLAIM_PRIORITY[option.kind]));
    return priorityB - priorityA || seatDistance(from, a.seat) - seatDistance(from, b.seat);
  });
}

/* ------------------------------------------------------------------ */
/* State transitions                                                   */
/* ------------------------------------------------------------------ */

function result(state: GameState, error?: string): ActionResult {
  return error ? { ok: false, state, error } : { ok: true, state };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    hands: state.hands.map((hand) => hand.slice()),
    melds: state.melds.map((list) =>
      list.map((meld) => ({ ...meld, tiles: meld.tiles.slice() })),
    ),
    discards: state.discards.map((list) => list.slice()),
    liveWall: state.liveWall.slice(),
    deadWall: state.deadWall.slice(),
    scores: state.scores.slice(),
    kongPoints: state.kongPoints.slice(),
    claimQueue: state.claimQueue.map((decision) => ({
      seat: decision.seat,
      options: decision.options.map((option) => ({ ...option, tiles: option.tiles.slice() })),
    })),
    pendingKong: state.pendingKong ? { ...state.pendingKong } : null,
    flags: { ...state.flags },
    win: state.win ? { ...state.win, patterns: state.win.patterns.slice() } : null,
    scoreSheet: state.scoreSheet
      ? {
          ...state.scoreSheet,
          patterns: state.scoreSheet.patterns.slice(),
          payments: state.scoreSheet.payments.slice(),
          deltas: state.scoreSheet.deltas.slice(),
          scoresAfter: state.scoreSheet.scoresAfter.slice(),
          spiritBase: state.scoreSheet.spiritBase.slice(),
          spiritAdjusted: state.scoreSheet.spiritAdjusted.slice(),
          kongPoints: state.scoreSheet.kongPoints.slice(),
          spiritSprint: state.scoreSheet.spiritSprint.slice(),
        }
      : null,
  };
}

function nextMeldId(state: GameState): number {
  let max = 0;
  for (const list of state.melds) for (const meld of list) max = Math.max(max, meld.id);
  return max + 1;
}

function makeMeld(
  id: number,
  kind: MeldKind,
  tiles: Tile[],
  owner: number,
  claimedFrom: number | null,
  concealed: boolean,
  added: boolean,
  shape: MeldShape,
  spirit: SpiritInfo,
): Meld {
  return {
    id,
    kind,
    tiles: sortTiles(tiles),
    owner,
    claimedFrom,
    concealed,
    added,
    target: shape.target,
    usedWild: shape.usedWild,
    spiritKong: kind === 'gang' && tiles.length === 4 && tiles.every((tile) => isSpirit(tile, spirit)),
  };
}

function finishHand(state: GameState, win: WinInfo | null): GameState {
  const next = cloneState(state);
  next.phase = 'hand-over';
  next.turn = -1;
  next.win = win;
  next.claimQueue = [];
  next.claimIndex = 0;
  next.pendingKong = null;
  next.drawn = null;

  const winner = win?.seat ?? null;
  const scoreSheet = scoreHand({
    scores: next.scores,
    dealer: next.dealer,
    winner,
    method: win?.method ?? null,
    pattern: win?.pattern ?? null,
    patterns: win?.patterns ?? [],
    spirit: next.spirit,
    hands: next.hands,
    melds: next.melds,
    kongPoints: next.kongPoints,
    matchTarget: next.matchTarget,
    usedWild: win ? win.usedWild : undefined,
    spiritSingleWait: win ? win.spiritSingleWait : false,
    kongDraw: win ? win.kongDraw : false,
    robbingKong: win ? win.robbingKong : false,
    heavenly: win ? win.heavenly : false,
    human: win ? win.human : false,
    drawn: win === null,
    from: win?.from ?? null,
  });
  next.scoreSheet = scoreSheet;
  next.scores = scoreSheet.scoresAfter;
  const top = Math.max(...next.scores);
  const leaders = next.scores
    .map((score, seat) => (score === top ? seat : -1))
    .filter((seat) => seat >= 0);
  if (top >= next.matchTarget && leaders.length === 1) {
    next.phase = 'game-over';
    next.matchWinner = leaders[0];
  }
  next.version += 1;
  return next;
}

function advanceAfterPass(state: GameState): GameState {
  const next = cloneState(state);
  if (next.pendingKong) {
    const pending = next.pendingKong;
    next.pendingKong = null;
    const meld = next.melds[pending.seat].find((item) => item.id === pending.meldId);
    if (meld && meld.kind === 'peng') {
      const shape = analyseGang([...meld.tiles, pending.tile], next.spirit);
      if (shape) {
        meld.kind = 'gang';
        meld.tiles = sortTiles([...meld.tiles, pending.tile]);
        meld.added = true;
        meld.target = shape.target;
        meld.usedWild = shape.usedWild;
        meld.spiritKong =
          meld.tiles.length === 4 && meld.tiles.every((tile) => isSpirit(tile, next.spirit));
        next.kongPoints[pending.seat] += meld.spiritKong ? 10 : 2;
      }
    }
    return drawReplacement(next, pending.seat);
  }
  const from = next.lastDiscard?.seat ?? next.turn;
  next.phase = 'draw';
  next.turn = from >= 0 ? nextSeat(from) : 0;
  next.claimQueue = [];
  next.claimIndex = 0;
  next.flags.humanHandEligible = false;
  next.flags.firstDiscard = false;
  next.version += 1;
  return next;
}

function drawReplacement(state: GameState, seat: number): GameState {
  const next = cloneState(state);
  if (next.liveWall.length === 0) {
    return finishHand(next, null);
  }
  const tile = next.liveWall.pop();
  if (!tile) return finishHand(next, null);
  next.hands[seat] = sortTiles([...next.hands[seat], tile]);
  next.turn = seat;
  next.phase = 'discard';
  next.drawn = tile;
  next.flags.kongDraw = true;
  next.flags.heavenlyAvailable = false;
  next.version += 1;
  return next;
}

export function draw(state: GameState, seat: number): ActionResult {
  if (state.phase !== 'draw') return result(state, 'bad-phase');
  if (asSeat(seat) === null || state.turn !== seat) return result(state, 'wrong-turn');
  if (state.liveWall.length === 0) return result(finishHand(state, null));
  const next = cloneState(state);
  const tile = next.liveWall.pop();
  if (!tile) return result(finishHand(state, null));
  next.hands[seat] = sortTiles([...next.hands[seat], tile]);
  next.turn = seat;
  next.phase = 'discard';
  next.drawn = tile;
  next.flags.kongDraw = false;
  next.flags.heavenlyAvailable = false;
  next.version += 1;
  return result(next);
}

export function discard(state: GameState, seat: number, tile: Tile): ActionResult {
  if (state.phase !== 'discard') return result(state, 'bad-phase');
  if (state.turn !== seat) return result(state, 'wrong-turn');
  const hand = state.hands[seat] ?? [];
  if (!hand.includes(tile)) return result(state, 'not-in-hand');
  const next = cloneState(state);
  const remaining = removeOne(hand, tile);
  if (!remaining) return result(state, 'not-in-hand');
  next.hands[seat] = remaining;
  next.discards[seat].push(tile);
  next.lastDiscard = { seat, tile };
  next.drawn = null;
  next.flags.heavenlyAvailable = false;
  next.flags.kongDraw = false;
  next.flags.dealerFirstDiscard = next.flags.firstDiscard && seat === next.dealer;
  next.flags.firstDiscard = false;
  const queue = buildClaimQueue(next, seat, tile);
  if (queue.length > 0) {
    next.phase = 'claim';
    next.claimQueue = queue;
    next.claimIndex = 0;
    next.turn = -1;
  } else {
    next.phase = 'draw';
    next.turn = nextSeat(seat);
    next.flags.humanHandEligible = false;
  }
  next.version += 1;
  return result(next);
}

export function currentClaim(state: GameState): ClaimDecision | null {
  if (state.phase !== 'claim') return null;
  return state.claimQueue[state.claimIndex] ?? null;
}

export function passClaim(state: GameState, seat: number): ActionResult {
  if (state.phase !== 'claim') return result(state, 'bad-phase');
  const decision = currentClaim(state);
  if (!decision || decision.seat !== seat) return result(state, 'wrong-turn');
  const next = cloneState(state);
  next.claimIndex += 1;
  if (next.claimIndex < next.claimQueue.length) {
    next.version += 1;
    return result(next);
  }
  return result(advanceAfterPass(next));
}

export function claim(state: GameState, seat: number, option: ClaimOption): ActionResult {
  if (state.phase !== 'claim') return result(state, 'bad-phase');
  const decision = currentClaim(state);
  if (!decision || decision.seat !== seat) return result(state, 'wrong-turn');
  const chosen = decision.options.find(
    (item) =>
      item.kind === option.kind &&
      item.target === option.target &&
      item.tiles.join('|') === option.tiles.join('|'),
  );
  if (!chosen) return result(state, 'bad-claim');
  const from = state.lastDiscard?.seat ?? -1;
  let discardTile = state.lastDiscard?.tile ?? '';
  const next = cloneState(state);
  next.claimQueue = [];
  next.claimIndex = 0;
  next.lastClaim = { seat, kind: chosen.kind, tile: discardTile };

  if (chosen.kind === 'win') {
    if (next.pendingKong) {
      discardTile = next.pendingKong.tile;
      next.pendingKong = null;
      next.lastClaim = { seat, kind: 'rob-kong', tile: discardTile };
    } else if (from >= 0) {
      const pile = next.discards[from];
      if (pile.length > 0 && pile[pile.length - 1] === discardTile) pile.pop();
    }
    next.hands[seat] = sortTiles([...next.hands[seat], discardTile]);
    next.turn = -1;
    next.pendingKong = null;
    const check = evaluateWin(next.hands[seat], next.melds[seat], next.spirit, discardTile);
    if (!check.win || check.bestPattern === null) return result(state, 'no-win');
    const isRob = state.pendingKong !== null;
    const isHuman =
      !isRob &&
      state.flags.humanHandEligible &&
      state.flags.dealerFirstDiscard &&
      seat !== state.dealer;
    const win: WinInfo = {
      seat,
      method: isRob ? 'rob-kong' : isHuman ? 'human' : 'discard',
      from: isRob ? (state.pendingKong?.seat ?? from) : from,
      tile: discardTile,
      pattern: check.bestPattern,
      patterns: check.patterns,
      usedWild: check.usedWild,
      spiritSingleWait: false,
      kongDraw: false,
      robbingKong: isRob,
      heavenly: false,
      human: isHuman,
    };
    return result(finishHand(next, win));
  }

  // Remove the claimed discard from the pile.
  if (from >= 0) {
    const pile = next.discards[from];
    if (pile.length > 0 && pile[pile.length - 1] === discardTile) pile.pop();
  }
  const usedTiles = chosen.tiles.slice();
  next.hands[seat] = next.hands[seat].filter((tile) => {
    const index = usedTiles.indexOf(tile);
    if (index < 0) return true;
    usedTiles.splice(index, 1);
    return false;
  });
  const meldTiles = [...chosen.tiles, discardTile];
  const shape =
    chosen.kind === 'gang'
      ? analyseGang(meldTiles, next.spirit)
      : chosen.kind === 'peng'
        ? analysePeng(meldTiles, next.spirit)
        : analyseChi(meldTiles, next.spirit);
  if (!shape) return result(state, 'bad-claim');
  const meld = makeMeld(
    nextMeldId(next),
    chosen.kind === 'chi' ? 'chi' : chosen.kind === 'peng' ? 'peng' : 'gang',
    meldTiles,
    seat,
    from,
    false,
    false,
    shape,
    next.spirit,
  );
  next.melds[seat].push(meld);
  if (meld.kind === 'gang') {
    next.kongPoints[seat] += meld.spiritKong ? 10 : 2;
    next.drawn = null;
    next.turn = seat;
    next.phase = 'discard';
    next.version += 1;
    return result(drawReplacement(next, seat));
  }
  next.turn = seat;
  next.phase = 'discard';
  next.drawn = null;
  next.flags.heavenlyAvailable = false;
  next.flags.humanHandEligible = false;
  next.version += 1;
  return result(next);
}

export function kongOptionsFor(state: GameState, seat: number): KongOption[] {
  if (state.phase !== 'discard' || state.turn !== seat) return [];
  const hand = state.hands[seat] ?? [];
  const options: KongOption[] = [];
  const seen = new Set<string>();
  for (const combo of uniqueCombos(hand, 4)) {
    const shape = analyseGang(combo, state.spirit);
    if (!shape) continue;
    const key = `c:${combo.join(',')}:${shape.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      kind: 'concealed',
      tiles: combo,
      target: shape.target,
      spiritKong: combo.every((tile) => isSpirit(tile, state.spirit)),
    });
  }
  for (const meld of state.melds[seat] ?? []) {
    if (meld.kind !== 'peng') continue;
    for (const tile of new Set(hand)) {
      const shape = analyseGang([...meld.tiles, tile], state.spirit);
      if (!shape) continue;
      const key = `a:${meld.id}:${tile}:${shape.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        kind: 'added',
        tiles: [tile],
        meldId: meld.id,
        target: shape.target,
        spiritKong: [...meld.tiles, tile].every((item) => isSpirit(item, state.spirit)),
      });
    }
  }
  return options;
}

export function declareKong(state: GameState, seat: number, option: KongOption): ActionResult {
  if (state.phase !== 'discard' || state.turn !== seat) return result(state, 'bad-phase');
  const next = cloneState(state);
  if (option.kind === 'concealed') {
    for (const tile of option.tiles) {
      const hand = removeOne(next.hands[seat], tile);
      if (!hand) return result(state, 'not-in-hand');
      next.hands[seat] = hand;
    }
    const shape = analyseGang(option.tiles, next.spirit);
    if (!shape) return result(state, 'bad-kong');
    const meld = makeMeld(
      nextMeldId(next),
      'gang',
      option.tiles,
      seat,
      null,
      true,
      false,
      shape,
      next.spirit,
    );
    next.melds[seat].push(meld);
    next.kongPoints[seat] += meld.spiritKong ? 10 : 2;
    next.drawn = null;
    next.turn = seat;
    next.phase = 'discard';
    next.version += 1;
    return result(drawReplacement(next, seat));
  }

  const meld = next.melds[seat].find((item) => item.id === option.meldId);
  if (!meld || meld.kind !== 'peng') return result(state, 'bad-kong');
  const tile = option.tiles[0];
  const hand = removeOne(next.hands[seat], tile);
  if (!hand) return result(state, 'not-in-hand');
  next.hands[seat] = hand;
  const shape = analyseGang([...meld.tiles, tile], next.spirit);
  if (!shape) return result(state, 'bad-kong');
  next.pendingKong = { seat, meldId: meld.id, tile };
  const queue = buildClaimQueue(next, seat, tile, true);
  if (queue.length > 0) {
    next.phase = 'claim';
    next.claimQueue = queue;
    next.claimIndex = 0;
    next.turn = -1;
    next.version += 1;
    return result(next);
  }
  next.pendingKong = null;
  meld.kind = 'gang';
  meld.tiles = sortTiles([...meld.tiles, tile]);
  meld.added = true;
  meld.target = shape.target;
  meld.usedWild = shape.usedWild;
  meld.spiritKong = meld.tiles.length === 4 && meld.tiles.every((item) => isSpirit(item, next.spirit));
  next.kongPoints[seat] += meld.spiritKong ? 10 : 2;
  next.drawn = null;
  next.turn = seat;
  next.phase = 'discard';
  next.version += 1;
  return result(drawReplacement(next, seat));
}

export function declareWin(state: GameState, seat: number): ActionResult {
  if (state.phase !== 'discard' || state.turn !== seat) return result(state, 'bad-phase');
  const check = evaluateWin(state.hands[seat], state.melds[seat], state.spirit, state.drawn);
  if (!check.win || check.bestPattern === null) return result(state, 'no-win');
  const heavenly = state.flags.heavenlyAvailable && seat === state.dealer;
  const win: WinInfo = {
    seat,
    method: heavenly ? 'heavenly' : 'self-draw',
    from: null,
    tile: state.drawn ?? state.hands[seat][state.hands[seat].length - 1] ?? '',
    pattern: check.bestPattern,
    patterns: check.patterns,
    usedWild: check.usedWild,
    spiritSingleWait: !heavenly && check.spiritPairWait,
    kongDraw: state.flags.kongDraw,
    robbingKong: false,
    heavenly,
    human: false,
  };
  return result(finishHand(state, win));
}

export function nextHand(state: GameState, rng: Rng, dice?: [number, number]): ActionResult {
  if (state.phase !== 'hand-over') return result(state, 'bad-phase');
  if (state.scores.some((score) => score >= state.matchTarget)) {
    return result(state, 'match-over');
  }
  const dealer = nextSeat(state.dealer);
  const dealt = deal(rng, dealer, dice);
  const next: GameState = {
    ...cloneState(state),
    phase: 'discard',
    handNumber: state.handNumber + 1,
    dealer,
    turn: dealer,
    hands: dealt.hands,
    melds: [[], [], [], []],
    discards: [[], [], [], []],
    liveWall: dealt.liveWall,
    deadWall: dealt.deadWall,
    spirit: dealt.spirit,
    lastDiscard: null,
    lastClaim: null,
    claimQueue: [],
    claimIndex: 0,
    pendingKong: null,
    drawn: null,
    kongPoints: [0, 0, 0, 0],
    flags: {
      heavenlyAvailable: evaluateWin(dealt.hands[dealer], [], dealt.spirit).win,
      kongDraw: false,
      firstDiscard: true,
      humanHandEligible: true,
      dealerFirstDiscard: false,
    },
    win: null,
    scoreSheet: null,
    matchWinner: null,
    version: state.version + 1,
  };
  return result(next);
}

/* ------------------------------------------------------------------ */
/* Per-seat view                                                       */
/* ------------------------------------------------------------------ */

export function view(state: GameState, seat: number): SeatView {
  const safeSeat = asSeat(seat) ?? 0;
  const claim = currentClaim(state);
  const canDraw = state.phase === 'draw' && state.turn === safeSeat;
  const canDiscard = state.phase === 'discard' && state.turn === safeSeat;
  const winCheck = canDiscard
    ? evaluateWin(state.hands[safeSeat], state.melds[safeSeat], state.spirit, state.drawn)
    : null;
  const claimOptions =
    state.phase === 'claim' && claim?.seat === safeSeat ? claim.options : [];
  const revealed =
    state.phase === 'hand-over' || state.phase === 'game-over'
      ? state.hands.map((hand) => hand.slice())
      : null;
  return {
    seat: safeSeat,
    phase: state.phase,
    handNumber: state.handNumber,
    dealer: state.dealer,
    turn: state.turn,
    scores: state.scores.slice(),
    matchTarget: state.matchTarget,
    hand: state.hands[safeSeat].slice(),
    handCounts: state.hands.map((hand) => hand.length),
    melds: state.melds.map((list) =>
      list.map((meld) => ({ ...meld, tiles: meld.tiles.slice() })),
    ),
    discards: state.discards.map((list) => list.slice()),
    spirit: { ...state.spirit, dice: [state.spirit.dice[0], state.spirit.dice[1]] },
    liveWallCount: state.liveWall.length,
    deadWallCount: state.deadWall.length,
    lastDiscard: state.lastDiscard ? { ...state.lastDiscard } : null,
    lastClaim: state.lastClaim ? { ...state.lastClaim } : null,
    drawn: state.drawn,
    canDraw,
    canDiscard,
    canWin: Boolean(winCheck?.win),
    winPatterns: winCheck?.patterns.slice() ?? [],
    kongOptions: canDiscard ? kongOptionsFor(state, safeSeat) : [],
    claimOptions,
    claimSeat: claim?.seat ?? null,
    kongPoints: state.kongPoints.slice(),
    win: state.win
      ? { ...state.win, patterns: state.win.patterns.slice() }
      : null,
    scoreSheet: state.scoreSheet
      ? {
          ...state.scoreSheet,
          patterns: state.scoreSheet.patterns.slice(),
          payments: state.scoreSheet.payments.slice(),
          deltas: state.scoreSheet.deltas.slice(),
          scoresAfter: state.scoreSheet.scoresAfter.slice(),
          spiritBase: state.scoreSheet.spiritBase.slice(),
          spiritAdjusted: state.scoreSheet.spiritAdjusted.slice(),
          kongPoints: state.scoreSheet.kongPoints.slice(),
          spiritSprint: state.scoreSheet.spiritSprint.slice(),
        }
      : null,
    canNextHand: state.phase === 'hand-over',
    matchWinner: state.matchWinner,
    revealedHands: revealed,
    flags: { ...state.flags },
    pendingKong: state.pendingKong ? { ...state.pendingKong } : null,
    version: state.version,
  };
}

/* ------------------------------------------------------------------ */
/* Convenience helpers for AI, hints and UI                            */
/* ------------------------------------------------------------------ */

export function handTiles(state: GameState, seat: number): Tile[] {
  return state.hands[seat] ?? [];
}

export function meldTiles(state: GameState, seat: number): Tile[] {
  return (state.melds[seat] ?? []).flatMap((meld) => meld.tiles);
}

export function visibleTileCounts(state: GameState, seat: number): Map<Tile, number> {
  const counts = countMap([
    ...state.discards.flat(),
    ...state.melds.flatMap((list) => list.flatMap((meld) => meld.tiles)),
    ...state.hands[seat],
  ]);
  return counts;
}

export function remainingCopies(state: GameState, tile: Tile): number {
  const visible = visibleTileCounts(state, 0);
  return Math.max(0, 4 - (visible.get(tile) ?? 0));
}

export function waitingTiles(
  state: GameState,
  seat: number,
  hand: Tile[] = state.hands[seat],
  melds: Meld[] = state.melds[seat],
): Tile[] {
  const waits: Tile[] = [];
  for (const tile of TILE_TYPES) {
    const check = evaluateWin([...hand, tile], melds, state.spirit, tile);
    if (check.win) waits.push(tile);
  }
  return waits;
}

export function isTenpai(
  state: GameState,
  seat: number,
  hand: Tile[] = state.hands[seat],
  melds: Meld[] = state.melds[seat],
): boolean {
  const need = 4 - melds.length;
  if (hand.length !== need * 3 + 1) return false;
  return waitingTiles(state, seat, hand, melds).length > 0;
}

export function patternMultiplier(pattern: WinPattern | null): number {
  return pattern ? PATTERN_MULTIPLIER[pattern] : 0;
}

export function tileLabel(tile: Tile, lang: 'en' | 'zh' = 'en'): string {
  const rank = tileRank(tile);
  if (tile[0] === 'z') {
    const names = lang === 'zh'
      ? ['东', '南', '西', '北', '中', '发', '白']
      : ['East', 'South', 'West', 'North', 'Red', 'Green', 'White'];
    return names[rank - 1] ?? tile;
  }
  const suit = tile[0];
  if (lang === 'zh') {
    const suitName = suit === 'm' ? '万' : suit === 'p' ? '筒' : '条';
    return `${rank}${suitName}`;
  }
  const suitName = suit === 'm' ? 'character' : suit === 'p' ? 'dot' : 'bamboo';
  return `${rank} ${suitName}`;
}

export function tileFace(tile: Tile): string {
  const rank = tileRank(tile);
  if (tile[0] === 'z') {
    return ['東', '南', '西', '北', '中', '發', '白'][rank - 1] ?? tile;
  }
  return String(rank);
}

export function suitGlyph(tile: Tile): string {
  if (tile[0] === 'm') return '萬';
  if (tile[0] === 'p') return '筒';
  if (tile[0] === 's') return '條';
  return '';
}

export function seatName(seat: number, lang: 'en' | 'zh' = 'en'): string {
  if (lang === 'zh') return ['东', '南', '西', '北'][seat] ?? `${seat}`;
  return ['East', 'South', 'West', 'North'][seat] ?? `${seat}`;
}

export function windOfSeat(seat: number, dealer: number): Tile {
  return WINDS[(seat - dealer + 4) % 4];
}
