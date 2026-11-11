import { COLORS } from './types.js';
import type { AiLevel, Color, Cost, GameState, PlayerKind, PlayerState, Tokens } from './types.js';
import { CARDS, NOBLES } from './data/index.js';
import { randomSeed, rngFromString, shuffle } from './rng.js';

export interface PlayerConfig {
  name?: string;
  kind?: PlayerKind;
  aiLevel?: AiLevel;
}

export interface GameOptions {
  seed?: string;
  startingPlayer?: number;
}

/** 各人数下银行每种宝石的枚数（金币恒为 5） */
const GEMS_PER_COLOR: Record<number, number> = { 2: 4, 3: 5, 4: 7 };

export function gemsPerColorFor(playerCount: number): number {
  const v = GEMS_PER_COLOR[playerCount];
  if (!v) throw new Error(`不支持的玩家数：${playerCount}（仅支持 2~4 人）`);
  return v;
}

/** 桌面上展示的贵族数量：玩家数 + 1 */
export function noblesFor(playerCount: number): number {
  return playerCount + 1;
}

export function emptyTokens(): Tokens {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 };
}

export function emptyCost(): Cost {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0 };
}

export function setupGame(players: PlayerConfig[], opts: GameOptions = {}): GameState {
  const n = players.length;
  if (n < 2 || n > 4) throw new Error(`不支持的玩家数：${n}（仅支持 2~4 人）`);

  const seed = opts.seed ?? randomSeed();
  const rng = rngFromString(seed);

  const bank = emptyTokens();
  const perColor = gemsPerColorFor(n);
  for (const c of COLORS) bank[c] = perColor;
  bank.gold = 5;

  // 各档独立洗牌；数组末尾视为牌堆顶（pop 取牌）
  const decks: number[][] = [1, 2, 3].map((tier) =>
    shuffle(
      CARDS.filter((c) => c.tier === tier).map((c) => c.id),
      rng,
    ),
  );

  // 每档亮出 4 张
  const board: (number | null)[][] = [0, 1, 2].map((i) => {
    const row: (number | null)[] = [];
    for (let slot = 0; slot < 4; slot++) row.push(decks[i]!.pop() ?? null);
    return row;
  });

  const nobles = shuffle(
    NOBLES.map((nb) => nb.id),
    rng,
  ).slice(0, noblesFor(n));

  const playerStates: PlayerState[] = players.map((p, i) => ({
    seat: i,
    name: p.name ?? `玩家${i + 1}`,
    kind: p.kind ?? 'human',
    aiLevel: p.aiLevel ?? 'normal',
    tokens: emptyTokens(),
    bonuses: emptyCost(),
    cardPoints: 0,
    purchased: [],
    reserved: [],
    nobles: [],
  }));

  const startingPlayer = opts.startingPlayer ?? 0;
  if (startingPlayer < 0 || startingPlayer >= n) throw new Error(`非法起始座位：${startingPlayer}`);

  return {
    version: 1,
    seed,
    playerCount: n,
    players: playerStates,
    bank,
    board,
    decks,
    nobles,
    current: startingPlayer,
    turn: 1,
    turnsTaken: players.map(() => 0),
    phase: 'playing',
    pending: null,
    finalRound: false,
    finalTriggered: null,
    consecutivePasses: 0,
    endReason: null,
    winners: null,
    log: [],
    moves: [],
  };
}

export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.current]!;
}

export function playerColors(state: GameState, seat: number): Color[] {
  return COLORS.filter((c) => state.players[seat]!.bonuses[c] > 0);
}
