import {
  AI_LEVELS,
  resolveTile,
  rollDie,
  type AiLevel,
  type GameState,
  type RollPreview,
} from '../game/ladder-run';

export { AI_LEVELS };
export type { AiLevel };

export type AiMood = 'win' | 'ladder' | 'snake' | 'overshoot' | 'safe';

export type AiLineKey =
  | 'aiCompanionCheer'
  | 'aiEasyWin'
  | 'aiEasyLadder'
  | 'aiEasySnake'
  | 'aiEasySafe'
  | 'aiEasyOver'
  | 'aiNormalWin'
  | 'aiNormalLadder'
  | 'aiNormalSnake'
  | 'aiNormalSafe'
  | 'aiNormalOver'
  | 'aiHardWin'
  | 'aiHardLadder'
  | 'aiHardSnake'
  | 'aiHardSafe'
  | 'aiHardOver';

export interface AiChoice {
  die: number;
  mood: AiMood;
  level: AiLevel;
  line: AiLineKey;
}

export function moodFor(preview: Pick<RollPreview, 'wins' | 'transport' | 'overshoot'>): AiMood {
  if (preview.wins) return 'win';
  if (preview.transport === 'ladder') return 'ladder';
  if (preview.transport === 'snake') return 'snake';
  if (preview.overshoot) return 'overshoot';
  return 'safe';
}

const KEYS: Record<Exclude<AiLevel, 'companion'>, Record<AiMood, AiLineKey>> = {
  easy: {
    win: 'aiEasyWin',
    ladder: 'aiEasyLadder',
    snake: 'aiEasySnake',
    overshoot: 'aiEasyOver',
    safe: 'aiEasySafe',
  },
  normal: {
    win: 'aiNormalWin',
    ladder: 'aiNormalLadder',
    snake: 'aiNormalSnake',
    overshoot: 'aiNormalOver',
    safe: 'aiNormalSafe',
  },
  hard: {
    win: 'aiHardWin',
    ladder: 'aiHardLadder',
    snake: 'aiHardSnake',
    overshoot: 'aiHardOver',
    safe: 'aiHardSafe',
  },
};

/** Flavour changes with the level. Companion always cheers; it never pokes fun. */
export function lineForMove(level: AiLevel, preview: Pick<RollPreview, 'wins' | 'transport' | 'overshoot'>): AiLineKey {
  if (level === 'companion') return 'aiCompanionCheer';
  return KEYS[level][moodFor(preview)];
}

/**
 * The AI has no decision to make in snakes and ladders: it rolls. The level is
 * deliberately flavour-only, exactly as the game brief asks. Same RNG means the
 * same die at every level.
 */
export function chooseRoll(state: GameState, level: AiLevel, rng: () => number = Math.random): AiChoice {
  const die = rollDie(rng);
  const player = state.players[state.turn];
  const preview = player ? resolveTile(player.position, die) : null;
  return {
    die,
    mood: preview ? moodFor(preview) : 'safe',
    level,
    line: preview ? lineForMove(level, preview) : 'aiCompanionCheer',
  };
}

/** RNG that makes rollDie() return a chosen die value (handy for the app and tests). */
export function dieRng(die: number): () => number {
  const safe = Math.min(6, Math.max(1, Math.round(die)));
  return () => (safe - 0.5) / 6;
}

/** A companion comment for anybody's roll, not only the AI's own. */
export function companionCheer(): AiLineKey {
  return 'aiCompanionCheer';
}
