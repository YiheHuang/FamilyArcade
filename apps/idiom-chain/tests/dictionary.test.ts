import { describe, expect, it } from 'vitest';
import {
  IDIOMS,
  bareSyllable,
  chainCandidates,
  findIdiom,
  firstChar,
  firstSound,
  isRare,
  lastChar,
  lastSound,
  normalizeIdiom,
  startsWithChar,
  syllables,
} from '../src/game/dictionary';

describe('Idiom Chain dictionary', () => {
  it('bundles at least 500 original dictionary entries', () => {
    expect(IDIOMS.length).toBeGreaterThanOrEqual(500);
    expect(IDIOMS.length).toBe(680);
    expect(new Set(IDIOMS.map((idiom) => idiom.text)).size).toBe(IDIOMS.length);
  });

  it('has one pinyin syllable per Chinese character', () => {
    for (const idiom of IDIOMS) {
      expect(syllables(idiom.pinyin), idiom.text).toHaveLength([...idiom.text].length);
    }
  });

  it('has a short gloss and a frequency for every idiom', () => {
    for (const idiom of IDIOMS) {
      expect(idiom.gloss.trim().length, idiom.text).toBeGreaterThan(0);
      expect([1, 2, 3, 4, 5]).toContain(idiom.frequency);
    }
  });

  it('marks a meaningful rare subset', () => {
    const rare = IDIOMS.filter(isRare);
    expect(rare.length).toBeGreaterThan(50);
    expect(rare.length).toBe(274);
    expect(rare.length).toBeLessThan(IDIOMS.length);
  });

  it('finds idioms by text and indexes them by first character', () => {
    const idiom = findIdiom('一心一意');
    expect(idiom?.gloss).toContain('wholeheartedly');
    expect(firstChar(idiom!)).toBe('一');
    expect(lastChar(idiom!)).toBe('意');
    expect(startsWithChar('意').some((item) => item.text === '意气风发')).toBe(true);
    expect(startsWithChar('意').every((item) => item.text.startsWith('意'))).toBe(true);
  });

  it('derives tone-insensitive homophone sounds', () => {
    const one = findIdiom('一意孤行')!;
    const intent = findIdiom('一心一意')!;
    expect(bareSyllable(syllables(one.pinyin)[0])).toBe('yi');
    expect(lastSound(intent)).toBe('yi');
    expect(firstSound(one)).toBe('yi');
  });

  it('searches continuations by last character', () => {
    const previous = findIdiom('一心一意')!;
    const options = chainCandidates(previous, false, new Set());
    expect(options.map((idiom) => idiom.text)).toContain('意气风发');
    expect(options.every((idiom) => idiom.text.startsWith('意'))).toBe(true);
    const filtered = chainCandidates(previous, false, new Set(['意气风发']));
    expect(filtered.map((idiom) => idiom.text)).not.toContain('意气风发');
  });

  it('searches continuations by sound in homophone mode', () => {
    const previous = findIdiom('一心一意')!;
    const options = chainCandidates(previous, true, new Set());
    expect(options.map((idiom) => idiom.text)).toContain('一意孤行');
    expect(options.every((idiom) => firstSound(idiom) === 'yi')).toBe(true);
  });

  it('normalises spaces, punctuation and full-width spaces', () => {
    expect(normalizeIdiom(' 一心 一意 ')).toBe('一心一意');
    expect(normalizeIdiom('「一心一意」。')).toBe('一心一意');
    expect(normalizeIdiom('一心　一意')).toBe('一心一意');
  });

  it('contains every idiom used by the demo and test sequences', () => {
    for (const text of [
      '一心一意',
      '意气风发',
      '发扬光大',
      '大器晚成',
      '成千上万',
      '万紫千红',
      '暗箭伤人',
      '人山人海',
      '海枯石烂',
      '烂醉如泥',
      '泥牛入海',
    ]) {
      expect(findIdiom(text), text).toBeTruthy();
    }
  });
});
