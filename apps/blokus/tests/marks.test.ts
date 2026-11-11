import { describe, expect, it } from 'vitest';
import { PLAYER_MARKS, markKind } from '../src/ui/marks';

describe('色盲双编码', () => {
  it('四名玩家记号各不相同且循环映射', () => {
    expect(new Set(PLAYER_MARKS).size).toBe(4);
    expect([0, 1, 2, 3, 4].map(markKind)).toEqual(['dot', 'plus', 'ring', 'slash', 'dot']);
  });
});
