/** 五种宝石颜色（官方顺序：白、蓝、绿、红、黑） */
export const COLORS = ['white', 'blue', 'green', 'red', 'black'] as const;
export type Color = (typeof COLORS)[number];

/** 令牌颜色（宝石 + 金币万能） */
export type TokenColor = Color | 'gold';

export type Tier = 1 | 2 | 3;

/** AI 难度档位：陪玩 / 简单 / 普通 / 困难 */
export const AI_LEVELS = ['friendly', 'easy', 'normal', 'hard'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export const AI_LEVEL_LABELS: Record<AiLevel, string> = {
  friendly: '陪玩',
  easy: '简单',
  normal: '普通',
  hard: '困难',
};

/** 成本 / 加成要求：五色计数 */
export type Cost = Record<Color, number>;

/** 令牌持有量：五色 + 金币 */
export type Tokens = Record<TokenColor, number>;

export interface CardDef {
  id: number;
  tier: Tier;
  bonus: Color;
  points: number;
  cost: Cost;
}

export interface NobleDef {
  id: number;
  name: string;
  points: number;
  requirement: Cost;
}

/** 玩家预定的卡；fromDeck=true 表示从牌堆盲抽，对其他玩家保密 */
export interface ReservedCard {
  cardId: number;
  fromDeck: boolean;
}

export type PlayerKind = 'human' | 'ai';

export interface PlayerState {
  seat: number;
  name: string;
  kind: PlayerKind;
  aiLevel: AiLevel;
  tokens: Tokens;
  /** 各色永久加成数量（已购卡数量按色统计） */
  bonuses: Cost;
  /** 已购卡带来的分数（不含贵族） */
  cardPoints: number;
  /** 已购卡 id（按购买顺序） */
  purchased: number[];
  reserved: ReservedCard[];
  /** 已获得的贵族 id */
  nobles: number[];
}

export interface PendingDiscard {
  player: number;
  /** 当前持有令牌总数 */
  total: number;
}

export interface PendingNoble {
  player: number;
  /** 可选择的贵族 id 列表 */
  options: number[];
}

export type Phase = 'playing' | 'discarding' | 'choosing-noble' | 'ended';

export interface LogEntry {
  turn: number;
  seat: number | null;
  key: string;
  params?: Record<string, string | number | boolean>;
}

export interface GameState {
  version: 1;
  seed: string;
  playerCount: number;
  players: PlayerState[];
  /** 银行剩余令牌（含金币） */
  bank: Tokens;
  /** 桌面明牌：board[tier-1][slot]，null 表示牌堆耗尽的空位 */
  board: (number | null)[][];
  /** 各档剩余牌堆，末尾为牌堆顶 */
  decks: number[][];
  /** 桌面可用贵族 id（顺序即展示顺序） */
  nobles: number[];
  /** 当前行动座位 */
  current: number;
  /** 全局回合计数（从 1 开始） */
  turn: number;
  /** 每位玩家已完成的回合数（终局等回合判定用） */
  turnsTaken: number[];
  phase: Phase;
  pending: PendingDiscard | PendingNoble | null;
  /** 是否已触发终局（有人达到 15 分） */
  finalRound: boolean;
  /** 触发终局的座位 */
  finalTriggered: number | null;
  /** 连续 pass 计数（银行与桌面完全死锁时用于按分数结算） */
  consecutivePasses: number;
  /** 结束原因：normal = 正常终局；deadlock = 死锁按分数结算 */
  endReason: 'normal' | 'deadlock' | null;
  /** 胜者座位（终局后写入；可多人并列） */
  winners: number[] | null;
  log: LogEntry[];
  /** 完整走法记录（配合 seed 可完整回放） */
  moves: Move[];
}

// ---------------- 走法 ----------------

export type Target =
  | { kind: 'board'; tier: Tier; slot: number }
  | { kind: 'deck'; tier: Tier }
  | { kind: 'reserved'; index: number };

export type Move =
  /** 拿 1~3 枚不同色宝石 */
  | { type: 'take'; colors: Color[] }
  /** 拿 2 枚同色宝石（银行该色 ≥4 时才合法） */
  | { type: 'take2'; color: Color }
  /** 预定一张卡（桌面明牌或牌堆顶），若银行有金币则同时获得 1 枚金币 */
  | { type: 'reserve'; target: Target }
  /** 购买一张卡（桌面或自己预定区）；pay 缺省时引擎自动选择支付方案 */
  | { type: 'buy'; target: Target; pay?: Partial<Tokens> }
  /** 超过 10 枚令牌时归还，必须恰好归还到 10 枚 */
  | { type: 'discard'; tokens: Partial<Tokens> }
  /** 多个贵族同时满足时选择其一 */
  | { type: 'chooseNoble'; nobleId: number }
  /** 极端局面兜底：无任何合法动作时（银行耗尽且无法购卡/预定）唯一可用，直接结束回合 */
  | { type: 'pass' };

export type GameEvent =
  | { type: 'turn-start'; seat: number }
  | { type: 'tokens-taken'; seat: number; tokens: Tokens }
  | { type: 'tokens-returned'; seat: number; tokens: Tokens }
  | { type: 'card-reserved'; seat: number; cardId: number; fromDeck: boolean; goldTaken: boolean; tier: Tier }
  | { type: 'card-bought'; seat: number; cardId: number; paid: Tokens }
  | { type: 'board-refilled'; tier: Tier; slot: number }
  | { type: 'noble-visit'; seat: number; nobleId: number }
  | { type: 'discard-required'; seat: number; total: number }
  | { type: 'noble-choice-required'; seat: number; options: number[] }
  | { type: 'final-round'; triggeredBy: number }
  | { type: 'game-end'; winners: number[] };
