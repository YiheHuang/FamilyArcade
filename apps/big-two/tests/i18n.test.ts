import { describe, expect, it } from 'vitest';
import { MESSAGES, detectLang, t } from '../src/i18n';

function placeholdersRemoved(text: string): string {
  return text.replace(/\{[a-zA-Z]+\}/g, '');
}

describe('bilingual UI copy', () => {
  it('keeps Chinese out of the English UI except the language switch', () => {
    const body = Object.values(MESSAGES.en).join(' ').replaceAll('中文', '');
    expect(/[\u4e00-\u9fff]/.test(body)).toBe(false);
  });

  it('keeps English words out of the Chinese UI except the switch and card ranks', () => {
    const body = placeholdersRemoved(Object.values(MESSAGES.zh).join(' '))
      .replaceAll('English', '')
      .replace(/[JQKA]/g, '');
    expect(/[A-Za-z]/.test(body)).toBe(false);
  });

  it('interpolates values and keeps both dictionaries in step', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES.zh).sort());
    expect(t('en', 'cardsLeft', { n: 7 })).toBe('7 cards');
    expect(t('zh', 'cardsLeft', { n: 7 })).toBe('7 张');
    expect(t('en', 'winnerIs', { name: 'Ada' })).toBe('Ada wins');
    expect(t('zh', 'winnerIs', { name: '阿达' })).toBe('阿达 获胜');
  });

  it('detects an explicit saved language', () => {
    const store = new Map<string, string>([['familyarcade.lang', 'zh']]);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
    expect(detectLang()).toBe('zh');
    store.set('familyarcade.lang', 'en');
    expect(detectLang()).toBe('en');
  });
});
