import type { AiLevel } from './ai/ai';
import type { BlindPlan, DeckId } from './game/content';
import type { CompareOutcome } from './game/competition';
import type { RunState } from './game/run';
import type { MessageKey } from './i18n';

export type LocalMode = 'solo' | 'rivals' | 'hotseat';
export type GameMode = LocalMode | 'lan-host' | 'lan-guest';
export type Stage = 'handoff' | 'playing' | 'shop' | 'compare' | 'done' | 'wait';

export interface SeatState {
  /** User-entered name, or empty for a localized default. */
  name: string;
  nameKey: MessageKey | null;
  ai: boolean;
  level: AiLevel | null;
  run: RunState;
  hearts: number;
  eliminated: boolean;
  /** Blind score indexed by blind index. */
  blindScores: number[];
  totalScore: number;
}

export interface LanPlayer {
  seat: number;
  name: string;
}

export interface LanMatch {
  seed: number;
  seedText: string;
  deckId: DeckId;
  plan: BlindPlan[];
  players: LanPlayer[];
  hearts: number[];
  scores: number[];
  totals: number[];
  submitted: boolean[];
  blindIndex: number;
  active: number[];
  matchOver: boolean;
  winner: number | null;
}

export interface LanVerdict extends CompareOutcome {
  kind: 'lan-verdict';
  blindIndex: number;
  scores: number[];
  totals: number[];
  matchOver: boolean;
  winner: number | null;
}

export interface LanInit {
  kind: 'lan-init';
  seed: number;
  seedText: string;
  deckId: DeckId;
  plan: BlindPlan[];
  players: LanPlayer[];
}

export interface SavedGame {
  version: 1;
  mode: LocalMode;
  level: AiLevel;
  deckId: DeckId;
  screen: 'game' | 'shop' | 'compare' | 'handoff';
  soloRun: RunState | null;
  seats: SeatState[] | null;
  active: number;
  stage: Stage;
  compare: CompareOutcome | null;
  shopQueue: number[];
  savedAt: number;
}
