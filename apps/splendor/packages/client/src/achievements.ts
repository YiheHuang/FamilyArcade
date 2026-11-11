/**
 * 家庭成就：纯函数 + localStorage 记录。
 *
 * - 与战绩一样按"家庭"聚合（家里任一玩家达成即解锁）；
 * - 需要重放的判定（双贵族 / 18 分）只看最近的若干局，避免拖慢界面；
 * - 判定只依赖已存记录与当前终局状态，可单测。
 */
import type { GameState } from '@splendor/engine';
import { buildFrames, type GameRecord } from './records';
import { totalPointsOfView } from './logic';
import { computeStats } from './stats';

export type AchievementId = 'firstWin' | 'streak3' | 'doubleNoble' | 'highScore';

export const ACHIEVEMENT_IDS: AchievementId[] = ['firstWin', 'streak3', 'doubleNoble', 'highScore'];

const STORAGE_KEY = 'splendor.achievements.v1';

/** 需要重放记录才能判定的成就，最多回溯的局数 */
const DEEP_LIMIT = 40;

export function loadUnlocked(): AchievementId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((id): id is AchievementId => ACHIEVEMENT_IDS.includes(id as AchievementId));
  } catch {
    return [];
  }
}

export function saveUnlocked(ids: AchievementId[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* ignore */
  }
}

/** 本局（终局状态）达成的候选成就 */
export function achievementsFromFinalState(state: GameState): AchievementId[] {
  const out: AchievementId[] = [];
  const winners = state.winners ?? [];
  const humanWinners = winners.filter((seat) => state.players[seat]?.kind === 'human');
  if (humanWinners.length > 0) out.push('firstWin');
  for (const player of state.players) {
    if (player.kind !== 'human') continue;
    if (player.nobles.length >= 2) out.push('doubleNoble');
    if (totalPointsOfView(player) >= 18) out.push('highScore');
  }
  return [...new Set(out)];
}

/** 从历史记录判定已解锁的成就（家庭维度） */
export function achievementsFromRecords(records: GameRecord[], deepLimit = DEEP_LIMIT): AchievementId[] {
  const out = new Set<AchievementId>();
  if (records.length === 0) return [];
  // 首胜：任一局的人类玩家获胜
  const humanWin = records.some((rec) => rec.winners.some((seat) => rec.seats[seat]?.kind === 'human'));
  if (humanWin) out.add('firstWin');
  // 三连胜：复用战绩的连胜计算
  const stats = computeStats(records, { deepLimit: 0 });
  if (stats.players.some((p) => p.bestStreak >= 3)) out.add('streak3');
  // 双贵族 / 18 分：重放最近若干局
  const recent = [...records].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, deepLimit);
  for (const rec of recent) {
    let finalState: GameState | null = null;
    try {
      const frames = buildFrames(rec);
      finalState = frames[frames.length - 1]?.state ?? null;
    } catch {
      finalState = null;
    }
    if (!finalState) continue;
    for (const id of achievementsFromFinalState(finalState)) out.add(id);
  }
  return ACHIEVEMENT_IDS.filter((id) => out.has(id));
}

/** 新解锁的成就（用于庆祝） */
export function newlyUnlocked(previous: AchievementId[], current: AchievementId[]): AchievementId[] {
  const before = new Set(previous);
  return current.filter((id) => !before.has(id));
}

export function labelOf(id: AchievementId, t: { achievements: Record<string, string> }): string {
  return t.achievements[id] ?? id;
}

export function descOf(id: AchievementId, t: { achievements: Record<string, string> }): string {
  return t.achievements[`${id}Desc`] ?? '';
}
