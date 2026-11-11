import { describe, expect, it } from 'vitest';
import {
  assertCourseData,
  BALLOONS,
  BALLOON_COUNT,
  COURSE,
  ROUNDS,
  SCORING,
  TRACK_LENGTH,
  WIND_CARDS,
} from '../src/game/data';
import { ALL_KEYS, DICTS, translate } from '../src/i18n';

describe('course.json', () => {
  it('has five original balloons, 20 spaces, five winds and four rounds', () => {
    expect(BALLOON_COUNT).toBe(5);
    expect(BALLOONS).toHaveLength(5);
    expect(TRACK_LENGTH).toBe(20);
    expect(ROUNDS).toBe(4);
    expect(WIND_CARDS).toHaveLength(5);
    expect(WIND_CARDS.every((value) => value >= 1 && value <= 3)).toBe(true);
    expect([...WIND_CARDS].sort()).toEqual([1, 2, 2, 3, 3]);
    expect(COURSE.startPositions).toEqual([0, 0, 0, 0, 0]);
    expect(COURSE.tailwindPerPlayer).toBe(2);
    expect(COURSE.count).toBe(5);
    expect(COURSE.source.length).toBeGreaterThan(10);
    expect(() => assertCourseData(COURSE)).not.toThrow();
  });

  it('uses unique balloon ids and readable bilingual names', () => {
    const ids = new Set(BALLOONS.map((balloon) => balloon.id));
    expect(ids.size).toBe(5);
    for (const balloon of BALLOONS) {
      expect(balloon.nameEn.length).toBeGreaterThan(1);
      expect(balloon.nameZh.length).toBeGreaterThan(0);
      expect(balloon.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('keeps the published scoring values', () => {
    expect(SCORING).toEqual({ roundLeader: 3, roundSecond: 1, overallLeader: 5, unusedTailwind: 1 });
  });

  it('rejects a corrupted course', () => {
    expect(() => assertCourseData({ ...COURSE, rounds: 3 })).toThrow(/four rounds/);
    expect(() => assertCourseData({ ...COURSE, trackLength: 18 })).toThrow(/20/);
    expect(() =>
      assertCourseData({ ...COURSE, windCards: [1, 1, 1, 1, 1] }),
    ).toThrow(/missing/);
  });
});

describe('bilingual copy', () => {
  it('has the same keys in Chinese and English', () => {
    const zh = Object.keys(DICTS.zh).sort();
    const en = Object.keys(DICTS.en).sort();
    expect(en).toEqual(zh);
    expect(ALL_KEYS.length).toBeGreaterThan(160);
  });

  it('interpolates parameters and falls back safely', () => {
    expect(translate('en', 'game.round', { n: 2, total: 4 })).toBe('Round 2 / 4');
    expect(translate('zh', 'game.round', { n: 2, total: 4 })).toBe('第 2 / 4 轮');
    expect(translate('en', 'missing.key')).toBe('missing.key');
  });

  it('keeps family-unsafe game vocabulary out of both dictionaries', () => {
    const banned = [/下注/, /筹码/, /赌博/, /gambl/i, /\bbet\b/i, /\bchips?\b/i, /\bmoney\b/i];
    for (const dict of [DICTS.zh, DICTS.en]) {
      for (const text of Object.values(dict)) {
        for (const pattern of banned) expect(text).not.toMatch(pattern);
      }
    }
  });
});
