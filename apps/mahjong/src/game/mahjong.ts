/**
 * Mahjong · four-player Chinese tile engine.
 *
 * Pure TypeScript: no DOM, network, clock or Math.random. Every shuffle takes an
 * injected RNG. Seats run 0 → 1 → 2 → 3. A seat may chi only the discard of the
 * player immediately before it in that order (its left-hand neighbour).
 */

export type Suit = 'm' | 'p' | 's' | 'z';
export type Seat = 0 | 1 | 2 | 3;
export type Phase = 'discard' | 'claim' | 'over';
export type MeldKind = 'chi' | 'peng' | 'kong' | 'concealed-kong' | 'added-kong';
export type WinMethod = 'self-draw' | 'discard' | 'robbing-kong';
export type WinPattern = 'standard' | 'seven-pairs' | 'thirteen-orphans';
export type FanKey =
  | 'selfDraw'
  | 'concealed'
  | 'allSimples'
  | 'allTriplets'
  | 'mixedSuit'
  | 'pureSuit'
  | 'pureStraight'
  | 'sevenPairs'
  | 'thirteenOrphans'
  | 'seatWind'
  | 'prevalentWind'
  | 'dragonTriplet'
  | 'kongDraw'
  | 'lastTile'
  | 'robbingKong';

export interface Tile {
  suit: Suit;
  rank: number;
}

export interface Meld {
  kind: MeldKind;
  tiles: Tile[];
  from: Seat | -1;
  claimed: Tile | null;
}

export interface Discard {
  seat: Seat;
  tile: Tile;
  claimed: boolean;
  last: boolean;
}

export interface FanItem {
  key: FanKey;
  fan: number;
  count: number;
}

export interface ClaimOption {
  seat: Seat;
  win: boolean;
  winFan: number;
  peng: boolean;
  kong: boolean;
  chi: [Tile, Tile][];
}

export type ClaimAction = 'win' | 'peng' | 'kong' | 'chi' | 'pass';

export interface ClaimDecision {
  action: ClaimAction;
  pair?: [Tile, Tile];
}

export interface ClaimState {
  from: Seat;
  tile: Tile;
  robbing: boolean;
  addedKongIndex: number | null;
  lastTile: boolean;
  options: ClaimOption[];
  decisions: (ClaimDecision | null)[];
  pending: Seat[];
}

export interface WinInfo {
  seat: Seat;
  from: Seat | null;
  method: WinMethod;
  pattern: WinPattern;
  fan: FanItem[];
  totalFan: number;
  minimumFan: number;
  winningTile: Tile;
  selfDraw: boolean;
  robbing: boolean;
  allTriplets: boolean;
  concealed: boolean;
  points: number;
  settlement: [number, number, number, number];
}

export type LogKind =
  | 'deal'
  | 'discard'
  | 'chi'
  | 'peng'
  | 'kong'
  | 'concealed-kong'
  | 'added-kong'
  | 'win'
  | 'draw-game';

export interface LogEntry {
  seat: Seat;
  kind: LogKind;
  tile: Tile | null;
}

export interface GameState {
  phase: Phase;
  turn: Seat | -1;
  dealer: Seat;
  roundWind: number;
  minimumFan: number;
  wall: Tile[];
  hands: Tile[][];
  melds: Meld[][];
  discards: Discard[];
  lastDraw: { seat: Seat; tile: Tile; kong: boolean } | null;
  lastDiscard: { seat: Seat; tile: Tile; last: boolean } | null;
  claim: ClaimState | null;
  winner: Seat | null;
  winInfo: WinInfo | null;
  result: 'win' | 'draw' | null;
  drawReason: 'wall-empty' | null;
  log: LogEntry[];
}

export type GameAction =
  | { type: 'discard'; tile: string }
  | { type: 'win-self' }
  | { type: 'claim'; action: ClaimAction; pair?: [string, string] }
  | { type: 'concealed-kong'; tile: string }
  | { type: 'added-kong'; tile: string };

export type MoveError =
  | 'bad-phase'
  | 'bad-seat'
  | 'wrong-turn'
  | 'not-your-tile'
  | 'not-your-claim'
  | 'bad-claim'
  | 'cannot-win'
  | 'below-minimum'
  | 'bad-kong'
  | 'no-wall';

export interface ActionResult {
  ok: boolean;
  state: GameState;
  error?: MoveError;
}

export interface WinContext {
  selfDraw: boolean;
  robbing: boolean;
  kongDraw: boolean;
  lastTile: boolean;
  seatWind: number;
  prevalentWind: number;
}

export interface WinEvaluation {
  pattern: WinPattern;
  fan: FanItem[];
  totalFan: number;
  allTriplets: boolean;
  concealed: boolean;
  pureStraight: boolean;
}

export interface WinPreview {
  pattern: WinPattern;
  fan: FanItem[];
  totalFan: number;
}

export interface ViewClaim {
  from: Seat;
  tile: Tile;
  robbing: boolean;
  lastTile: boolean;
  pending: Seat[];
  isMyDecision: boolean;
  option: ClaimOption | null;
}

export interface SeatView {
  seat: Seat;
  dealer: Seat;
  roundWind: number;
  seatWind: number;
  minimumFan: number;
  phase: Phase;
  turn: Seat | -1;
  wallCount: number;
  hand: Tile[];
  handCounts: number[];
  melds: Meld[][];
  discards: Discard[];
  lastDraw: { tile: Tile; kong: boolean } | null;
  lastDiscard: { seat: Seat; tile: Tile; last: boolean } | null;
  claim: ViewClaim | null;
  canDiscard: boolean;
  canWinSelf: boolean;
  selfWin: WinPreview | null;
  concealedKongs: string[];
  addedKongs: string[];
  legalDiscards: string[];
  result: 'win' | 'draw' | null;
  winner: Seat | null;
  winInfo: WinInfo | null;
  drawReason: 'wall-empty' | null;
  log: LogEntry[];
}

export type Rng = () => number;

export interface SetupOptions {
  rng: Rng;
  dealer?: Seat;
  roundWind?: number;
  minimumFan?: number;
}

export const SUITS: readonly Suit[] = ['m', 'p', 's', 'z'];
export const WINDS = [1, 2, 3, 4] as const;
export const DRAGONS = [5, 6, 7] as const;

export const FAN_VALUES: Record<FanKey, number> = {
  selfDraw: 1,
  concealed: 1,
  allSimples: 1,
  allTriplets: 2,
  mixedSuit: 2,
  pureSuit: 4,
  pureStraight: 2,
  sevenPairs: 2,
  thirteenOrphans: 13,
  seatWind: 1,
  prevalentWind: 1,
  dragonTriplet: 1,
  kongDraw: 1,
  lastTile: 1,
  robbingKong: 1,
};

const SUIT_ORDER: Record<Suit, number> = { m: 0, p: 1, s: 2, z: 3 };
const SUIT_BASE: Record<Suit, number> = { m: 0, p: 9, s: 18, z: 27 };
const VALID_RANK: Record<Suit, number> = { m: 9, p: 9, s: 9, z: 7 };

export function tileKey(tile: Tile): string {
  return `${tile.suit}${tile.rank}`;
}

export function tileFromKey(key: string): Tile | null {
  const suit = key.slice(0, 1) as Suit;
  const rank = Number(key.slice(1));
  if (!(suit in SUIT_ORDER)) return null;
  if (!Number.isInteger(rank) || rank < 1 || rank > VALID_RANK[suit]) return null;
  return { suit, rank };
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return tiles
    .slice()
    .sort(
      (a, b) =>
        SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] ||
        a.rank - b.rank,
    );
}

export function makeWall(): Tile[] {
  const wall: Tile[] = [];
  for (const suit of SUITS) {
    const top = VALID_RANK[suit];
    for (let rank = 1; rank <= top; rank += 1) {
      for (let copy = 0; copy < 4; copy += 1) wall.push({ suit, rank });
    }
  }
  return wall;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const raw = Math.floor(rng() * (index + 1));
    const pick = Math.max(0, Math.min(index, raw));
    [copy[index], copy[pick]] = [copy[pick], copy[index]];
  }
  return copy;
}

export function asSeat(value: number): Seat | null {
  return value === 0 || value === 1 || value === 2 || value === 3 ? (value as Seat) : null;
}

export function leftOf(seat: number): Seat {
  return (((seat + 1) % 4) as Seat);
}

export function rightOf(seat: number): Seat {
  return (((seat + 3) % 4) as Seat);
}

/** Seat wind for a seat, given the dealer: 1 East, 2 South, 3 West, 4 North. */
export function windOf(seat: number, dealer: number): number {
  return ((seat - dealer + 4) % 4) + 1;
}

export function suitName(suit: Suit): 'characters' | 'dots' | 'bamboo' | 'honour' {
  if (suit === 'm') return 'characters';
  if (suit === 'p') return 'dots';
  if (suit === 's') return 'bamboo';
  return 'honour';
}

export function isHonour(tile: Tile): boolean {
  return tile.suit === 'z';
}

export function isTerminal(tile: Tile): boolean {
  return tile.suit !== 'z' && (tile.rank === 1 || tile.rank === 9);
}

export function isSimple(tile: Tile): boolean {
  return tile.suit !== 'z' && tile.rank >= 2 && tile.rank <= 8;
}

export function isWind(tile: Tile): boolean {
  return tile.suit === 'z' && tile.rank >= 1 && tile.rank <= 4;
}

export function isDragon(tile: Tile): boolean {
  return tile.suit === 'z' && tile.rank >= 5 && tile.rank <= 7;
}

export function tileIndex(tile: Tile): number {
  return SUIT_BASE[tile.suit] + tile.rank - 1;
}

export function tileAtIndex(index: number): Tile {
  const zero = Math.max(0, Math.min(33, Math.floor(index)));
  if (zero < 9) return { suit: 'm', rank: zero + 1 };
  if (zero < 18) return { suit: 'p', rank: zero - 8 };
  if (zero < 27) return { suit: 's', rank: zero - 17 };
  return { suit: 'z', rank: zero - 26 };
}

export function countsFromTiles(tiles: Tile[]): number[] {
  const counts = new Array<number>(34).fill(0);
  for (const tile of tiles) counts[tileIndex(tile)] += 1;
  return counts;
}

export function countTiles(tiles: Tile[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const tile of tiles) {
    const key = tileKey(tile);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function removeKey(hand: Tile[], key: string, amount = 1): Tile[] | null {
  const copy = hand.slice();
  for (let count = 0; count < amount; count += 1) {
    const index = copy.findIndex((tile) => tileKey(tile) === key);
    if (index < 0) return null;
    copy.splice(index, 1);
  }
  return copy;
}

export function setup(options: SetupOptions): GameState {
  const dealer = options.dealer ?? 0;
  const roundWind = Math.max(1, Math.min(4, Math.floor(options.roundWind ?? 1)));
  const minimumFan = Math.max(0, Math.min(8, Math.floor(options.minimumFan ?? 1)));
  let wall = shuffle(makeWall(), options.rng);
  const hands: Tile[][] = [[], [], [], []];
  for (let round = 0; round < 13; round += 1) {
    for (let seat = 0; seat < 4; seat += 1) {
      const tile = wall.pop();
      if (tile) hands[seat].push(tile);
    }
  }
  const dealerTile = wall.pop();
  if (dealerTile) hands[dealer].push(dealerTile);
  for (let seat = 0; seat < 4; seat += 1) hands[seat] = sortTiles(hands[seat]);

  return {
    phase: 'discard',
    turn: dealer,
    dealer,
    roundWind,
    minimumFan,
    wall,
    hands,
    melds: [[], [], [], []],
    discards: [],
    lastDraw: dealerTile ? { seat: dealer, tile: dealerTile, kong: false } : null,
    lastDiscard: null,
    claim: null,
    winner: null,
    winInfo: null,
    result: null,
    drawReason: null,
    log: [{ seat: dealer, kind: 'deal', tile: null }],
  };
}

export function activeSeat(state: GameState): number {
  if (state.phase === 'claim' && state.claim && state.claim.pending.length > 0) {
    return state.claim.pending[0];
  }
  return state.turn;
}

interface ParsedSet {
  kind: 'triplet' | 'sequence';
  tiles: Tile[];
}

function meldSet(meld: Meld): ParsedSet {
  if (meld.kind === 'chi') return { kind: 'sequence', tiles: sortTiles(meld.tiles) };
  return { kind: 'triplet', tiles: [meld.tiles[0], meld.tiles[0], meld.tiles[0]] };
}

function decomposeStandard(hand: Tile[], meldCount: number): ParsedSet[][] {
  if (meldCount < 0 || meldCount > 4) return [];
  if (hand.length !== 14 - meldCount * 3) return [];
  const counts = countsFromTiles(hand);
  const setsNeeded = 4 - meldCount;
  const output: ParsedSet[][] = [];

  const walkSets = (setsLeft: number, acc: ParsedSet[]): void => {
    if (setsLeft === 0) {
      if (counts.every((count) => count === 0)) output.push(acc.slice());
      return;
    }
    let first = -1;
    for (let index = 0; index < 34; index += 1) {
      if (counts[index] > 0) {
        first = index;
        break;
      }
    }
    if (first < 0) return;

    if (counts[first] >= 3) {
      const tile = tileAtIndex(first);
      counts[first] -= 3;
      acc.push({ kind: 'triplet', tiles: [tile, tile, tile] });
      walkSets(setsLeft - 1, acc);
      acc.pop();
      counts[first] += 3;
    }

    if (first < 27) {
      const rankIndex = first % 9;
      if (
        rankIndex <= 6 &&
        counts[first + 1] > 0 &&
        counts[first + 2] > 0
      ) {
        const a = tileAtIndex(first);
        const b = tileAtIndex(first + 1);
        const c = tileAtIndex(first + 2);
        counts[first] -= 1;
        counts[first + 1] -= 1;
        counts[first + 2] -= 1;
        acc.push({ kind: 'sequence', tiles: [a, b, c] });
        walkSets(setsLeft - 1, acc);
        acc.pop();
        counts[first] += 1;
        counts[first + 1] += 1;
        counts[first + 2] += 1;
      }
    }
  };

  for (let index = 0; index < 34; index += 1) {
    if (counts[index] < 2) continue;
    counts[index] -= 2;
    walkSets(setsNeeded, []);
    counts[index] += 2;
  }
  return output;
}

function hasSequences123456789(sets: ParsedSet[]): boolean {
  for (const suit of ['m', 'p', 's'] as Suit[]) {
    const starts = new Set<number>();
    for (const set of sets) {
      if (set.kind !== 'sequence') continue;
      if (set.tiles[0].suit !== suit) continue;
      starts.add(Math.min(...set.tiles.map((tile) => tile.rank)));
    }
    if (starts.has(1) && starts.has(4) && starts.has(7)) return true;
  }
  return false;
}

function hasHonourSet(sets: ParsedSet[], rank: number): boolean {
  return sets.some(
    (set) =>
      set.kind === 'triplet' &&
      set.tiles[0].suit === 'z' &&
      set.tiles[0].rank === rank,
  );
}

function hasDragonSet(sets: ParsedSet[], rank: number): boolean {
  return hasHonourSet(sets, rank);
}

function allTilesOf(hand: Tile[], melds: Meld[]): Tile[] {
  const tiles = hand.slice();
  for (const meld of melds) tiles.push(...meld.tiles);
  return tiles;
}

function isConcealed(melds: Meld[]): boolean {
  return melds.every((meld) => meld.kind === 'concealed-kong');
}

function suitFan(all: Tile[]): FanItem[] {
  const numbered = all.filter((tile) => tile.suit !== 'z');
  if (numbered.length === 0) return [];
  const suits = new Set(numbered.map((tile) => tile.suit));
  if (suits.size !== 1) return [];
  const hasHonour = all.some((tile) => tile.suit === 'z');
  if (hasHonour) return [{ key: 'mixedSuit', fan: FAN_VALUES.mixedSuit, count: 1 }];
  return [{ key: 'pureSuit', fan: FAN_VALUES.pureSuit, count: 1 }];
}

function commonFan(all: Tile[], melds: Meld[], ctx: WinContext): FanItem[] {
  const fan: FanItem[] = [];
  if (ctx.selfDraw) fan.push({ key: 'selfDraw', fan: FAN_VALUES.selfDraw, count: 1 });
  if (isConcealed(melds)) fan.push({ key: 'concealed', fan: FAN_VALUES.concealed, count: 1 });
  if (all.every(isSimple)) {
    fan.push({ key: 'allSimples', fan: FAN_VALUES.allSimples, count: 1 });
  }
  fan.push(...suitFan(all));
  if (ctx.kongDraw) fan.push({ key: 'kongDraw', fan: FAN_VALUES.kongDraw, count: 1 });
  if (ctx.lastTile) fan.push({ key: 'lastTile', fan: FAN_VALUES.lastTile, count: 1 });
  if (ctx.robbing) fan.push({ key: 'robbingKong', fan: FAN_VALUES.robbingKong, count: 1 });
  return fan;
}

function windFan(sets: ParsedSet[], ctx: WinContext): FanItem[] {
  const fan: FanItem[] = [];
  if (hasHonourSet(sets, ctx.seatWind)) {
    fan.push({ key: 'seatWind', fan: FAN_VALUES.seatWind, count: 1 });
  }
  if (hasHonourSet(sets, ctx.prevalentWind)) {
    fan.push({ key: 'prevalentWind', fan: FAN_VALUES.prevalentWind, count: 1 });
  }
  for (const rank of DRAGONS) {
    if (hasDragonSet(sets, rank)) {
      fan.push({ key: 'dragonTriplet', fan: FAN_VALUES.dragonTriplet, count: 1 });
    }
  }
  return fan;
}

function totalFan(fan: FanItem[]): number {
  return fan.reduce((sum, item) => sum + item.fan * item.count, 0);
}

function standardEvaluations(
  hand: Tile[],
  melds: Meld[],
  ctx: WinContext,
): WinEvaluation[] {
  const decompositions = decomposeStandard(hand, melds.length);
  if (decompositions.length === 0) return [];
  const all = allTilesOf(hand, melds);
  const exposedSets = melds.map(meldSet);
  const base = commonFan(all, melds, ctx);
  const output: WinEvaluation[] = [];

  for (const decomposition of decompositions) {
    const sets = [...exposedSets, ...decomposition];
    const allTriplets = sets.every((set) => set.kind === 'triplet');
    const pureStraight = hasSequences123456789(sets);
    const fan = base.slice();
    if (allTriplets) {
      fan.push({ key: 'allTriplets', fan: FAN_VALUES.allTriplets, count: 1 });
    }
    if (pureStraight) {
      fan.push({ key: 'pureStraight', fan: FAN_VALUES.pureStraight, count: 1 });
    }
    fan.push(...windFan(sets, ctx));
    output.push({
      pattern: 'standard',
      fan,
      totalFan: totalFan(fan),
      allTriplets,
      concealed: isConcealed(melds),
      pureStraight,
    });
  }
  return output;
}

function sevenPairsEvaluation(
  hand: Tile[],
  melds: Meld[],
  ctx: WinContext,
): WinEvaluation | null {
  if (melds.length !== 0 || hand.length !== 14) return null;
  const counts = countsFromTiles(hand);
  let pairs = 0;
  for (const count of counts) {
    if (count % 2 !== 0) return null;
    pairs += count / 2;
  }
  if (pairs !== 7) return null;
  const all = allTilesOf(hand, melds);
  const fan = commonFan(all, melds, ctx);
  fan.push({ key: 'sevenPairs', fan: FAN_VALUES.sevenPairs, count: 1 });
  return {
    pattern: 'seven-pairs',
    fan,
    totalFan: totalFan(fan),
    allTriplets: false,
    concealed: true,
    pureStraight: false,
  };
}

const ORPHANS: Tile[] = [
  { suit: 'm', rank: 1 },
  { suit: 'm', rank: 9 },
  { suit: 'p', rank: 1 },
  { suit: 'p', rank: 9 },
  { suit: 's', rank: 1 },
  { suit: 's', rank: 9 },
  { suit: 'z', rank: 1 },
  { suit: 'z', rank: 2 },
  { suit: 'z', rank: 3 },
  { suit: 'z', rank: 4 },
  { suit: 'z', rank: 5 },
  { suit: 'z', rank: 6 },
  { suit: 'z', rank: 7 },
];

function thirteenOrphansEvaluation(
  hand: Tile[],
  melds: Meld[],
  ctx: WinContext,
): WinEvaluation | null {
  if (melds.length !== 0 || hand.length !== 14) return null;
  const counts = countTiles(hand);
  let pair = false;
  for (const tile of ORPHANS) {
    const count = counts.get(tileKey(tile)) ?? 0;
    if (count === 0) return null;
    if (count >= 2) pair = true;
  }
  if (!pair) return null;
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total !== 14) return null;
  const all = allTilesOf(hand, melds);
  const fan = commonFan(all, melds, ctx);
  fan.push({
    key: 'thirteenOrphans',
    fan: FAN_VALUES.thirteenOrphans,
    count: 1,
  });
  return {
    pattern: 'thirteen-orphans',
    fan,
    totalFan: totalFan(fan),
    allTriplets: false,
    concealed: true,
    pureStraight: false,
  };
}

/** Score the best interpretation of a complete hand. Returns null if it is not a win. */
export function evaluateWin(
  hand: Tile[],
  melds: Meld[],
  ctx: WinContext,
): WinEvaluation | null {
  const counts = countsFromTiles(hand);
  if (counts.some((count) => count > 4)) return null;
  const candidates: WinEvaluation[] = [
    ...standardEvaluations(hand, melds, ctx),
  ];
  const seven = sevenPairsEvaluation(hand, melds, ctx);
  if (seven) candidates.push(seven);
  const orphans = thirteenOrphansEvaluation(hand, melds, ctx);
  if (orphans) candidates.push(orphans);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.totalFan - a.totalFan);
  return candidates[0];
}

export function isWinningHand(hand: Tile[], melds: Meld[] = []): boolean {
  return (
    evaluateWin(hand, melds, {
      selfDraw: false,
      robbing: false,
      kongDraw: false,
      lastTile: false,
      seatWind: 1,
      prevalentWind: 1,
    }) !== null
  );
}

export function detectPattern(hand: Tile[], melds: Meld[] = []): WinPattern | null {
  const evaluation = evaluateWin(hand, melds, {
    selfDraw: false,
    robbing: false,
    kongDraw: false,
    lastTile: false,
    seatWind: 1,
    prevalentWind: 1,
  });
  return evaluation?.pattern ?? null;
}

function winContext(
  state: GameState,
  seat: Seat,
  options: { selfDraw: boolean; robbing: boolean; kongDraw: boolean; lastTile: boolean },
): WinContext {
  return {
    selfDraw: options.selfDraw,
    robbing: options.robbing,
    kongDraw: options.kongDraw,
    lastTile: options.lastTile,
    seatWind: windOf(seat, state.dealer),
    prevalentWind: state.roundWind,
  };
}

export function previewSelfWin(state: GameState, seat: Seat): WinPreview | null {
  if (state.phase !== 'discard' || state.turn !== seat) return null;
  if (!state.lastDraw || state.lastDraw.seat !== seat) return null;
  const evaluation = evaluateWin(
    state.hands[seat],
    state.melds[seat],
    winContext(state, seat, {
      selfDraw: true,
      robbing: false,
      kongDraw: state.lastDraw.kong,
      lastTile: state.wall.length === 0,
    }),
  );
  if (!evaluation || evaluation.totalFan < state.minimumFan) return null;
  return {
    pattern: evaluation.pattern,
    fan: evaluation.fan,
    totalFan: evaluation.totalFan,
  };
}

function completeWin(
  state: GameState,
  seat: Seat,
  from: Seat | null,
  method: WinMethod,
  winningTile: Tile,
  evaluation: WinEvaluation,
): GameState {
  const selfDraw = method === 'self-draw';
  const robbing = method === 'robbing-kong';
  const fan = evaluation.totalFan;
  const points = fan * 3;
  const settlement: [number, number, number, number] = [0, 0, 0, 0];
  settlement[seat] = points;
  if (selfDraw) {
    for (let other = 0; other < 4; other += 1) {
      if (other !== seat) settlement[other] = -fan;
    }
  } else if (from !== null) {
    settlement[from] = -points;
  }

  const hands = state.hands.map((hand) => hand.slice());
  const discards = state.discards.map((discard) => ({ ...discard }));
  if (!selfDraw) {
    hands[seat].push(winningTile);
    hands[seat] = sortTiles(hands[seat]);
    if (robbing && from !== null) {
      const index = hands[from].findIndex((tile) => sameTile(tile, winningTile));
      if (index >= 0) hands[from].splice(index, 1);
    } else {
      for (let index = discards.length - 1; index >= 0; index -= 1) {
        const discard = discards[index];
        if (discard.seat === from && !discard.claimed && sameTile(discard.tile, winningTile)) {
          discard.claimed = true;
          break;
        }
      }
    }
  }

  const winInfo: WinInfo = {
    seat,
    from,
    method,
    pattern: evaluation.pattern,
    fan: evaluation.fan,
    totalFan: evaluation.totalFan,
    minimumFan: state.minimumFan,
    winningTile,
    selfDraw,
    robbing,
    allTriplets: evaluation.allTriplets,
    concealed: evaluation.concealed,
    points,
    settlement,
  };

  const log: LogEntry[] = [...state.log, { seat, kind: 'win', tile: winningTile }];
  return {
    ...state,
    phase: 'over',
    turn: seat,
    hands,
    discards,
    lastDraw: selfDraw ? state.lastDraw : null,
    lastDiscard: null,
    claim: null,
    winner: seat,
    winInfo,
    result: 'win',
    drawReason: null,
    log,
  };
}

function finishDraw(state: GameState): GameState {
  return {
    ...state,
    phase: 'over',
    turn: -1,
    lastDraw: null,
    lastDiscard: null,
    claim: null,
    winner: null,
    winInfo: null,
    result: 'draw',
    drawReason: 'wall-empty',
    log: [...state.log, { seat: 0, kind: 'draw-game', tile: null }],
  };
}

function drawFor(state: GameState, seat: Seat, kong: boolean): GameState {
  if (state.wall.length === 0) return finishDraw(state);
  const wall = state.wall.slice();
  const tile = wall.pop();
  if (!tile) return finishDraw(state);
  const hands = state.hands.map((hand, index) =>
    index === seat ? sortTiles([...hand, tile]) : hand.slice(),
  );
  return {
    ...state,
    phase: 'discard',
    turn: seat,
    wall,
    hands,
    lastDraw: { seat, tile, kong },
    lastDiscard: null,
    claim: null,
    winner: null,
    winInfo: null,
    result: null,
    drawReason: null,
  };
}

function afterDiscard(state: GameState, from: Seat): GameState {
  if (state.wall.length === 0) return finishDraw(state);
  return drawFor(state, leftOf(from), false);
}

function chiPairs(hand: Tile[], tile: Tile): [Tile, Tile][] {
  if (tile.suit === 'z') return [];
  const counts = countTiles(hand);
  const pairs: [Tile, Tile][] = [];
  const starts = [tile.rank - 2, tile.rank - 1, tile.rank];
  for (const start of starts) {
    if (start < 1 || start > 7) continue;
    const ranks = [start, start + 1, start + 2].filter((rank) => rank !== tile.rank);
    if (ranks.length !== 2) continue;
    const a: Tile = { suit: tile.suit, rank: ranks[0] };
    const b: Tile = { suit: tile.suit, rank: ranks[1] };
    if ((counts.get(tileKey(a)) ?? 0) > 0 && (counts.get(tileKey(b)) ?? 0) > 0) {
      pairs.push([a, b]);
    }
  }
  return pairs;
}

function claimOptionsFor(
  state: GameState,
  from: Seat,
  tile: Tile,
  robbing: boolean,
): ClaimOption[] {
  const options: ClaimOption[] = [];
  for (let offset = 1; offset < 4; offset += 1) {
    const seat = leftOf((from + offset - 1) as number);
    const hand = state.hands[seat];
    const melds = state.melds[seat];
    const handCounts = countTiles(hand);
    const option: ClaimOption = {
      seat,
      win: false,
      winFan: 0,
      peng: false,
      kong: false,
      chi: [],
    };

    const evalWin = evaluateWin(
      [...hand, tile],
      melds,
      winContext(state, seat, {
        selfDraw: false,
        robbing,
        kongDraw: false,
        lastTile: state.wall.length === 0 && !robbing,
      }),
    );
    if (evalWin && evalWin.totalFan >= state.minimumFan) {
      option.win = true;
      option.winFan = evalWin.totalFan;
    }

    if (!robbing && melds.length < 4) {
      const copies = handCounts.get(tileKey(tile)) ?? 0;
      if (copies >= 2) option.peng = true;
      if (copies >= 3 && state.wall.length > 0) option.kong = true;
      if (seat === leftOf(from)) option.chi = chiPairs(hand, tile);
    }

    if (option.win || option.peng || option.kong || option.chi.length > 0) {
      options.push(option);
    }
  }
  return options;
}

function pendingOrder(options: ClaimOption[]): Seat[] {
  return options.map((option) => option.seat);
}

function startClaim(
  state: GameState,
  from: Seat,
  tile: Tile,
  robbing: boolean,
  addedKongIndex: number | null,
): GameState {
  const options = claimOptionsFor(state, from, tile, robbing);
  if (options.length === 0) {
    return robbing ? finishAddedKong(state, from, tile, addedKongIndex as number) : afterDiscard(state, from);
  }
  const pending = pendingOrder(options);
  const decisions: (ClaimDecision | null)[] = [null, null, null, null];
  return {
    ...state,
    phase: 'claim',
    turn: pending[0],
    lastDraw: null,
    lastDiscard: { seat: from, tile, last: state.wall.length === 0 && !robbing },
    claim: {
      from,
      tile,
      robbing,
      addedKongIndex,
      lastTile: state.wall.length === 0 && !robbing,
      options,
      decisions,
      pending,
    },
  };
}

export function discard(state: GameState, seat: number, tile: string): ActionResult {
  if (state.phase !== 'discard') return { ok: false, state, error: 'bad-phase' };
  if (asSeat(seat) === null) return { ok: false, state, error: 'bad-seat' };
  const safeSeat = seat as Seat;
  if (state.turn !== safeSeat) return { ok: false, state, error: 'wrong-turn' };
  const hand = state.hands[safeSeat];
  const index = hand.findIndex((item) => tileKey(item) === tile);
  if (index < 0) return { ok: false, state, error: 'not-your-tile' };
  const discarded = hand[index];
  const hands = state.hands.map((items, seatIndex) =>
    seatIndex === safeSeat ? items.filter((_, itemIndex) => itemIndex !== index) : items.slice(),
  );
  const last = state.wall.length === 0;
  const discards: Discard[] = [
    ...state.discards.map((item) => ({ ...item })),
    { seat: safeSeat, tile: discarded, claimed: false, last },
  ];
  const base: GameState = {
    ...state,
    hands,
    discards,
    lastDraw: null,
    lastDiscard: { seat: safeSeat, tile: discarded, last },
    claim: null,
    log: [...state.log, { seat: safeSeat, kind: 'discard', tile: discarded }],
  };
  const options = claimOptionsFor(base, safeSeat, discarded, false);
  if (options.length === 0) return { ok: true, state: afterDiscard(base, safeSeat) };
  return {
    ok: true,
    state: startClaim(base, safeSeat, discarded, false, null),
  };
}

function parsePair(pair: [string, string] | undefined): [Tile, Tile] | null {
  if (!pair) return null;
  const a = tileFromKey(pair[0]);
  const b = tileFromKey(pair[1]);
  if (!a || !b) return null;
  return [a, b];
}

function pairMatches(a: [Tile, Tile], b: [Tile, Tile]): boolean {
  const first = [tileKey(a[0]), tileKey(a[1])].sort().join('|');
  const second = [tileKey(b[0]), tileKey(b[1])].sort().join('|');
  return first === second;
}

function removeDiscard(state: GameState, from: Seat, tile: Tile): Discard[] {
  const discards = state.discards.map((item) => ({ ...item }));
  for (let index = discards.length - 1; index >= 0; index -= 1) {
    const item = discards[index];
    if (item.seat === from && !item.claimed && sameTile(item.tile, tile)) {
      item.claimed = true;
      break;
    }
  }
  return discards;
}

function executeMeldClaim(
  state: GameState,
  claim: ClaimState,
  seat: Seat,
  action: ClaimAction,
  pair: [Tile, Tile] | null,
): ActionResult {
  const option = claim.options.find((item) => item.seat === seat);
  if (!option) return { ok: false, state, error: 'not-your-claim' };
  let hands = state.hands.map((hand) => hand.slice());
  const melds = state.melds.map((items) => items.slice());
  let meld: Meld;
  let kind: LogKind;

  if (action === 'chi') {
    if (!pair || !option.chi.some((item) => pairMatches(item, pair))) {
      return { ok: false, state, error: 'bad-claim' };
    }
    const next = removeKey(hands[seat], tileKey(pair[0]));
    if (!next) return { ok: false, state, error: 'bad-claim' };
    const final = removeKey(next, tileKey(pair[1]));
    if (!final) return { ok: false, state, error: 'bad-claim' };
    hands[seat] = final;
    meld = {
      kind: 'chi',
      tiles: sortTiles([pair[0], pair[1], claim.tile]),
      from: claim.from,
      claimed: claim.tile,
    };
    kind = 'chi';
  } else if (action === 'peng' || action === 'kong') {
    const copies = action === 'kong' ? 3 : 2;
    const next = removeKey(hands[seat], tileKey(claim.tile), copies);
    if (!next) return { ok: false, state, error: 'bad-claim' };
    hands[seat] = next;
    meld = {
      kind: action === 'kong' ? 'kong' : 'peng',
      tiles: Array.from({ length: action === 'kong' ? 4 : 3 }, () => claim.tile),
      from: claim.from,
      claimed: claim.tile,
    };
    kind = action === 'kong' ? 'kong' : 'peng';
  } else {
    return { ok: false, state, error: 'bad-claim' };
  }

  melds[seat].push(meld);
  const discards = removeDiscard(state, claim.from, claim.tile);
  const base: GameState = {
    ...state,
    phase: 'discard',
    turn: seat,
    hands,
    melds,
    discards,
    lastDiscard: null,
    claim: null,
    log: [...state.log, { seat, kind, tile: claim.tile }],
  };
  if (action === 'kong') {
    if (state.wall.length === 0) return { ok: true, state: finishDraw(base) };
    return { ok: true, state: drawFor({ ...base, lastDraw: null }, seat, true) };
  }
  return {
    ok: true,
    state: {
      ...base,
      lastDraw: null,
    },
  };
}

function finishAddedKong(
  state: GameState,
  seat: Seat,
  tile: Tile,
  meldIndex: number,
): GameState {
  const hands = state.hands.map((items) => items.slice());
  const next = removeKey(hands[seat], tileKey(tile));
  if (!next) return state;
  hands[seat] = next;
  const melds = state.melds.map((items) => items.slice());
  const meld = melds[seat][meldIndex];
  if (!meld) return state;
  melds[seat][meldIndex] = {
    ...meld,
    kind: 'added-kong',
    tiles: [...meld.tiles, tile],
  };
  const base: GameState = {
    ...state,
    hands,
    melds,
    lastDraw: null,
    lastDiscard: null,
    claim: null,
    log: [...state.log, { seat, kind: 'added-kong', tile }],
  };
  if (state.wall.length === 0) return finishDraw(base);
  return drawFor(base, seat, true);
}

function resolveClaims(state: GameState): ActionResult {
  const claim = state.claim;
  if (!claim) return { ok: false, state, error: 'bad-claim' };
  const order: Seat[] = [leftOf(claim.from), leftOf(leftOf(claim.from)), leftOf(leftOf(leftOf(claim.from)))];
  const decisionFor = (seat: Seat): ClaimDecision | null => claim.decisions[seat];

  const winner = order.find((seat) => decisionFor(seat)?.action === 'win');
  if (winner !== undefined) {
    const evaluation = evaluateWin(
      [...state.hands[winner], claim.tile],
      state.melds[winner],
      winContext(state, winner, {
        selfDraw: false,
        robbing: claim.robbing,
        kongDraw: false,
        lastTile: claim.lastTile,
      }),
    );
    if (evaluation && evaluation.totalFan >= state.minimumFan) {
      return {
        ok: true,
        state: completeWin(
          state,
          winner,
          claim.from,
          claim.robbing ? 'robbing-kong' : 'discard',
          claim.tile,
          evaluation,
        ),
      };
    }
  }

  for (const action of ['kong', 'peng'] as ClaimAction[]) {
    const seat = order.find((item) => decisionFor(item)?.action === action);
    if (seat !== undefined) {
      return executeMeldClaim(state, claim, seat, action, null);
    }
  }

  const chiSeat = order.find(
    (seat) => decisionFor(seat)?.action === 'chi' && seat === leftOf(claim.from),
  );
  if (chiSeat !== undefined) {
    const pair = decisionFor(chiSeat)?.pair ?? null;
    if (pair) return executeMeldClaim(state, claim, chiSeat, 'chi', pair);
  }

  if (claim.robbing && claim.addedKongIndex !== null) {
    return {
      ok: true,
      state: finishAddedKong(state, claim.from, claim.tile, claim.addedKongIndex),
    };
  }
  return { ok: true, state: afterDiscard({ ...state, claim: null }, claim.from) };
}

export function claim(
  state: GameState,
  seat: number,
  action: ClaimAction,
  pairKey?: [string, string],
): ActionResult {
  if (state.phase !== 'claim' || !state.claim) return { ok: false, state, error: 'bad-phase' };
  if (asSeat(seat) === null) return { ok: false, state, error: 'bad-seat' };
  const safeSeat = seat as Seat;
  const claimState = state.claim;
  if (!claimState.pending.includes(safeSeat)) return { ok: false, state, error: 'not-your-claim' };
  const option = claimState.options.find((item) => item.seat === safeSeat);
  if (!option) return { ok: false, state, error: 'not-your-claim' };

  let decision: ClaimDecision;
  if (action === 'pass') {
    decision = { action: 'pass' };
  } else if (action === 'win') {
    if (!option.win) return { ok: false, state, error: 'bad-claim' };
    decision = { action: 'win' };
  } else if (action === 'peng') {
    if (!option.peng) return { ok: false, state, error: 'bad-claim' };
    decision = { action: 'peng' };
  } else if (action === 'kong') {
    if (!option.kong) return { ok: false, state, error: 'bad-claim' };
    decision = { action: 'kong' };
  } else if (action === 'chi') {
    const pair = parsePair(pairKey);
    if (!pair || !option.chi.some((item) => pairMatches(item, pair))) {
      return { ok: false, state, error: 'bad-claim' };
    }
    decision = { action: 'chi', pair };
  } else {
    return { ok: false, state, error: 'bad-claim' };
  }

  const decisions = claimState.decisions.slice();
  decisions[safeSeat] = decision;
  const pending = claimState.pending.filter((item) => item !== safeSeat);
  if (pending.length > 0) {
    return {
      ok: true,
      state: {
        ...state,
        turn: pending[0],
        claim: { ...claimState, decisions, pending },
      },
    };
  }

  const resolved = resolveClaims({ ...state, claim: { ...claimState, decisions, pending } });
  return resolved;
}

export function winSelf(state: GameState, seat: number): ActionResult {
  if (state.phase !== 'discard') return { ok: false, state, error: 'bad-phase' };
  if (asSeat(seat) === null) return { ok: false, state, error: 'bad-seat' };
  const safeSeat = seat as Seat;
  if (state.turn !== safeSeat) return { ok: false, state, error: 'wrong-turn' };
  if (!state.lastDraw || state.lastDraw.seat !== safeSeat) {
    return { ok: false, state, error: 'cannot-win' };
  }
  const evaluation = evaluateWin(
    state.hands[safeSeat],
    state.melds[safeSeat],
    winContext(state, safeSeat, {
      selfDraw: true,
      robbing: false,
      kongDraw: state.lastDraw.kong,
      lastTile: state.wall.length === 0,
    }),
  );
  if (!evaluation) return { ok: false, state, error: 'cannot-win' };
  if (evaluation.totalFan < state.minimumFan) {
    return { ok: false, state, error: 'below-minimum' };
  }
  return {
    ok: true,
    state: completeWin(
      state,
      safeSeat,
      null,
      'self-draw',
      state.lastDraw.tile,
      evaluation,
    ),
  };
}

function kongCandidates(state: GameState, seat: Seat): {
  concealed: string[];
  added: string[];
} {
  if (state.phase !== 'discard' || state.turn !== seat || state.wall.length === 0) {
    return { concealed: [], added: [] };
  }
  const counts = countTiles(state.hands[seat]);
  const concealed: string[] = [];
  for (const [key, count] of counts) {
    if (count >= 4) concealed.push(key);
  }
  const added: string[] = [];
  for (const meld of state.melds[seat]) {
    if (meld.kind !== 'peng') continue;
    const key = tileKey(meld.tiles[0]);
    if ((counts.get(key) ?? 0) > 0) added.push(key);
  }
  return { concealed, added };
}

export function declareConcealedKong(
  state: GameState,
  seat: number,
  tileKeyValue: string,
): ActionResult {
  if (state.phase !== 'discard') return { ok: false, state, error: 'bad-phase' };
  if (asSeat(seat) === null) return { ok: false, state, error: 'bad-seat' };
  const safeSeat = seat as Seat;
  if (state.turn !== safeSeat) return { ok: false, state, error: 'wrong-turn' };
  if (state.wall.length === 0) return { ok: false, state, error: 'no-wall' };
  const { concealed } = kongCandidates(state, safeSeat);
  if (!concealed.includes(tileKeyValue)) return { ok: false, state, error: 'bad-kong' };
  const tile = tileFromKey(tileKeyValue);
  if (!tile) return { ok: false, state, error: 'bad-kong' };
  const hands = state.hands.map((items) => items.slice());
  const next = removeKey(hands[safeSeat], tileKeyValue, 4);
  if (!next) return { ok: false, state, error: 'bad-kong' };
  hands[safeSeat] = next;
  const melds = state.melds.map((items) => items.slice());
  melds[safeSeat].push({
    kind: 'concealed-kong',
    tiles: [tile, tile, tile, tile],
    from: -1,
    claimed: null,
  });
  const base: GameState = {
    ...state,
    hands,
    melds,
    lastDraw: null,
    lastDiscard: null,
    claim: null,
    log: [...state.log, { seat: safeSeat, kind: 'concealed-kong', tile }],
  };
  return { ok: true, state: drawFor(base, safeSeat, true) };
}

export function declareAddedKong(
  state: GameState,
  seat: number,
  tileKeyValue: string,
): ActionResult {
  if (state.phase !== 'discard') return { ok: false, state, error: 'bad-phase' };
  if (asSeat(seat) === null) return { ok: false, state, error: 'bad-seat' };
  const safeSeat = seat as Seat;
  if (state.turn !== safeSeat) return { ok: false, state, error: 'wrong-turn' };
  if (state.wall.length === 0) return { ok: false, state, error: 'no-wall' };
  const { added } = kongCandidates(state, safeSeat);
  if (!added.includes(tileKeyValue)) return { ok: false, state, error: 'bad-kong' };
  const tile = tileFromKey(tileKeyValue);
  if (!tile) return { ok: false, state, error: 'bad-kong' };
  const meldIndex = state.melds[safeSeat].findIndex(
    (meld) => meld.kind === 'peng' && tileKey(meld.tiles[0]) === tileKeyValue,
  );
  if (meldIndex < 0) return { ok: false, state, error: 'bad-kong' };

  const robOptions: ClaimOption[] = [];
  for (let offset = 1; offset < 4; offset += 1) {
    const other = leftOf((safeSeat + offset - 1) as number);
    const evaluation = evaluateWin(
      [...state.hands[other], tile],
      state.melds[other],
      winContext(state, other, {
        selfDraw: false,
        robbing: true,
        kongDraw: false,
        lastTile: false,
      }),
    );
    if (evaluation && evaluation.totalFan >= state.minimumFan) {
      robOptions.push({
        seat: other,
        win: true,
        winFan: evaluation.totalFan,
        peng: false,
        kong: false,
        chi: [],
      });
    }
  }

  if (robOptions.length > 0) {
    const pending = robOptions.map((option) => option.seat);
    return {
      ok: true,
      state: {
        ...state,
        phase: 'claim',
        turn: pending[0],
        lastDraw: null,
        lastDiscard: { seat: safeSeat, tile, last: false },
        claim: {
          from: safeSeat,
          tile,
          robbing: true,
          addedKongIndex: meldIndex,
          lastTile: false,
          options: robOptions,
          decisions: [null, null, null, null],
          pending,
        },
        log: [...state.log, { seat: safeSeat, kind: 'added-kong', tile }],
      },
    };
  }

  return { ok: true, state: finishAddedKong(state, safeSeat, tile, meldIndex) };
}

export function applyAction(state: GameState, seat: number, action: GameAction): ActionResult {
  if (action.type === 'discard') return discard(state, seat, action.tile);
  if (action.type === 'win-self') return winSelf(state, seat);
  if (action.type === 'claim') return claim(state, seat, action.action, action.pair);
  if (action.type === 'concealed-kong') {
    return declareConcealedKong(state, seat, action.tile);
  }
  if (action.type === 'added-kong') return declareAddedKong(state, seat, action.tile);
  return { ok: false, state, error: 'bad-phase' };
}

export function view(state: GameState, seat: number): SeatView {
  const safeSeat = (asSeat(seat) ?? 0) as Seat;
  const hand = state.hands[safeSeat].map((tile) => ({ ...tile }));
  const selfWin = previewSelfWin(state, safeSeat);
  const kongs = kongCandidates(state, safeSeat);
  const claimState = state.claim;
  const option = claimState?.options.find((item) => item.seat === safeSeat) ?? null;
  const pending = claimState?.pending.slice() ?? [];
  const isMyDecision = Boolean(claimState && pending[0] === safeSeat);
  const legalDiscards =
    state.phase === 'discard' && state.turn === safeSeat
      ? [...new Set(hand.map((tile) => tileKey(tile)))]
      : [];

  return {
    seat: safeSeat,
    dealer: state.dealer,
    roundWind: state.roundWind,
    seatWind: windOf(safeSeat, state.dealer),
    minimumFan: state.minimumFan,
    phase: state.phase,
    turn: state.turn,
    wallCount: state.wall.length,
    hand,
    handCounts: state.hands.map((items) => items.length),
    melds: state.melds.map((items) => items.map((meld) => ({
      ...meld,
      tiles: meld.tiles.map((tile) => ({ ...tile })),
    }))),
    discards: state.discards.map((item) => ({
      ...item,
      tile: { ...item.tile },
    })),
    lastDraw:
      state.lastDraw && state.lastDraw.seat === safeSeat
        ? { tile: { ...state.lastDraw.tile }, kong: state.lastDraw.kong }
        : null,
    lastDiscard: state.lastDiscard
      ? { ...state.lastDiscard, tile: { ...state.lastDiscard.tile } }
      : null,
    claim: claimState
      ? {
          from: claimState.from,
          tile: { ...claimState.tile },
          robbing: claimState.robbing,
          lastTile: claimState.lastTile,
          pending,
          isMyDecision,
          option: option
            ? {
                ...option,
                chi: option.chi.map(([a, b]) => [{ ...a }, { ...b }]),
              }
            : null,
        }
      : null,
    canDiscard: state.phase === 'discard' && state.turn === safeSeat,
    canWinSelf: Boolean(selfWin),
    selfWin,
    concealedKongs: kongs.concealed,
    addedKongs: kongs.added,
    legalDiscards,
    result: state.result,
    winner: state.winner,
    winInfo: state.winInfo,
    drawReason: state.drawReason,
    log: state.log.map((entry) => ({
      ...entry,
      tile: entry.tile ? { ...entry.tile } : null,
    })),
  };
}

/** The full public table view used by LAN host tests and screenshots. */
export function publicTable(state: GameState): {
  wallCount: number;
  discards: Discard[];
  handCounts: number[];
  melds: Meld[][];
} {
  return {
    wallCount: state.wall.length,
    discards: state.discards.map((item) => ({ ...item, tile: { ...item.tile } })),
    handCounts: state.hands.map((items) => items.length),
    melds: state.melds.map((items) => items.map((meld) => ({
      ...meld,
      tiles: meld.tiles.map((tile) => ({ ...tile })),
    }))),
  };
}
