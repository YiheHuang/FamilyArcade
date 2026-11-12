import { describe, expect, it } from 'vitest';
import { MESSAGES_EN, MESSAGES_ZH, t } from '../src/i18n';

describe('Bilingual copy', () => {
  it('has the same keys in both languages', () => {
    expect(Object.keys(MESSAGES_ZH).sort()).toEqual(Object.keys(MESSAGES_EN).sort());
  });

  it('keeps Chinese out of the English UI except the language switch', () => {
    for (const [key, value] of Object.entries(MESSAGES_EN)) {
      if (key === 'language') {
        expect(value).toBe('中文');
        continue;
      }
      expect(/[\u4e00-\u9fff]/.test(value)).toBe(false);
    }
  });

  it('keeps English words out of the Chinese UI except the switch and card keys', () => {
    const allowed = new Set([
      'Esc',
      'P',
      'H',
      'U',
      'A',
      'English',
    ]);
    for (const [key, value] of Object.entries(MESSAGES_ZH)) {
      if (key === 'language') {
        expect(value).toBe('English');
        continue;
      }
      const text = value.replace(/\{[a-zA-Z]+\}/g, '');
      const words = text.match(/[A-Za-z]+/g) ?? [];
      for (const word of words) {
        expect(allowed.has(word)).toBe(true);
      }
    }
  });

  it('interpolates parameters in both languages', () => {
    expect(t('en', 'roundN', { n: 3 })).toContain('3');
    expect(t('zh', 'roundN', { n: 3 })).toContain('3');
    expect(t('en', 'mustBeat', { combo: 'Pair 7' })).toContain('Pair 7');
    expect(t('zh', 'mustBeat', { combo: '对子 7' })).toContain('对子 7');
  });
});
