import { describe, expect, it } from 'vitest';
import { achievementsFromFinalState, newlyUnlocked } from '../src/achievements';
import { testGameFixtures } from './helpers';

describe('家庭成就', () => {
  it('本局判定：人类座位获胜才算首胜（AI 获胜不算）', () => {
    const state = testGameFixtures.finished();
    state.winners = [1]; // 只有电脑获胜
    expect(achievementsFromFinalState(state)).not.toContain('firstWin');
    state.winners = [0]; // 人类座位获胜
    expect(achievementsFromFinalState(state)).toContain('firstWin');
  });

  it('双贵族与 18 分：按终局状态判定（只读公开信息）', () => {
    const state = testGameFixtures.finished();
    state.winners = [0];
    const player = state.players[0]!;
    player.nobles = [state.nobles[0] ?? 1, state.nobles[1] ?? 2];
    const ids = achievementsFromFinalState(state);
    expect(ids).toContain('doubleNoble');
    expect(ids).toContain('firstWin');

    // 18 分：把该座位加成拉高（判定只看分数与贵族数）
    player.bonuses = { ...player.bonuses, red: player.bonuses.red + 6 };
    expect(achievementsFromFinalState(state)).toContain('highScore');
  });

  it('新解锁：只报告"之前没有"的成就', () => {
    expect(newlyUnlocked(['firstWin'], ['firstWin', 'streak3'])).toEqual(['streak3']);
    expect(newlyUnlocked(['firstWin', 'streak3'], ['firstWin', 'streak3'])).toEqual([]);
  });
});
