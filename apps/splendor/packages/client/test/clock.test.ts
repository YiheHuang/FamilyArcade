import { describe, expect, it } from 'vitest';
import { displaySeconds, formatRemaining, isValidLimit, limitLabel, ratioOf, TURN_LIMITS, urgencyOf } from '../src/clock';

describe('思考时间：档位与读秒纯函数', () => {
  it('档位为 不限/30/45/60/90', () => {
    expect([...TURN_LIMITS]).toEqual([0, 30, 45, 60, 90]);
    expect(limitLabel(0)).toBe('不限');
    expect(limitLabel(60)).toBe('60 秒');
    expect(isValidLimit(45)).toBe(true);
    expect(isValidLimit(33)).toBe(false);
  });

  it('紧急度：>10 秒正常、≤10 琥珀、≤5 红色、≤0 超时', () => {
    expect(urgencyOf(60)).toBe('normal');
    expect(urgencyOf(11)).toBe('normal');
    expect(urgencyOf(10)).toBe('warn');
    expect(urgencyOf(6)).toBe('warn');
    expect(urgencyOf(5)).toBe('danger');
    expect(urgencyOf(1)).toBe('danger');
    expect(urgencyOf(0)).toBe('over');
    expect(urgencyOf(-8)).toBe('over');
  });

  it('显示秒数：剩余向上取整，超时至少 +1 并持续正计时', () => {
    expect(displaySeconds(60)).toBe(60);
    expect(displaySeconds(59.2)).toBe(60);
    expect(displaySeconds(0.4)).toBe(1);
    expect(displaySeconds(0)).toBe(-1);
    expect(displaySeconds(-0.4)).toBe(-1);
    expect(displaySeconds(-12.3)).toBe(-13);
    expect(formatRemaining(42)).toBe('42 秒');
    expect(formatRemaining(-12)).toBe('超时 +12 秒');
  });

  it('进度比例在 0~1 之间且超时为 0', () => {
    expect(ratioOf(30, 60)).toBe(0.5);
    expect(ratioOf(-5, 60)).toBe(0);
    expect(ratioOf(90, 60)).toBe(1);
    expect(ratioOf(10, 0)).toBe(1);
  });
});
