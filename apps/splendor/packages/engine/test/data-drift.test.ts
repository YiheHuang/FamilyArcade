import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARDS, NOBLES } from '../src/data/index.js';

/** 防止 cards.ts / nobles.ts 与 JSON 审计文件漂移 */
describe('数据模块与 JSON 审计文件一致', () => {
  it('cards.ts == cards.json', () => {
    const json = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url), 'utf8')) as {
      cards: unknown[];
    };
    expect(JSON.stringify(json.cards)).toBe(JSON.stringify(CARDS));
  });

  it('nobles.ts == nobles.json', () => {
    const json = JSON.parse(readFileSync(new URL('../src/data/nobles.json', import.meta.url), 'utf8')) as {
      nobles: unknown[];
    };
    expect(JSON.stringify(json.nobles)).toBe(JSON.stringify(NOBLES));
  });
});
