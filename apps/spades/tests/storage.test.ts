import { describe, expect, it } from 'vitest';
import {
  EMPTY_RECORD,
  addResult,
  normalizeRecord,
  type FamilyRecord,
} from '../src/storage';

describe('Spades family record', () => {
  it('counts a first match, its winner, scores, rounds and mode', () => {
    const record = addResult(
      EMPTY_RECORD,
      { winner: 0, scores: [510, 430], rounds: 4 },
      { mode: 'ai', level: 'normal' },
      1000,
    );
    expect(record.matches).toBe(1);
    expect(record.winsA).toBe(1);
    expect(record.winsB).toBe(0);
    expect(record.rounds).toBe(4);
    expect(record.byMode).toEqual({ ai: 1, local: 0, lan: 0 });
    expect(record.recent[0]).toMatchObject({
      winner: 0,
      scores: [510, 430],
      rounds: 4,
      mode: 'ai',
      level: 'normal',
      at: 1000,
    });
  });

  it('tracks both partnerships and the last winner', () => {
    const first = addResult(
      EMPTY_RECORD,
      { winner: 0, scores: [500, 480], rounds: 3 },
      { mode: 'local' },
      1000,
    );
    const second = addResult(
      first,
      { winner: 1, scores: [420, 505], rounds: 5 },
      { mode: 'lan' },
      2000,
    );
    expect(second.matches).toBe(2);
    expect(second.winsA).toBe(1);
    expect(second.winsB).toBe(1);
    expect(second.rounds).toBe(8);
    expect(second.byMode).toEqual({ ai: 0, local: 1, lan: 1 });
    expect(second.lastWinner).toBe(1);
    expect(second.recent.map((entry) => entry.winner)).toEqual([1, 0]);
  });

  it('keeps only the eight most recent matches', () => {
    let record: FamilyRecord = EMPTY_RECORD;
    for (let index = 0; index < 11; index += 1) {
      record = addResult(
        record,
        { winner: (index % 2) as 0 | 1, scores: [500 + index, 400], rounds: index + 1 },
        { mode: 'ai', level: 'easy' },
        1000 + index,
      );
    }
    expect(record.matches).toBe(11);
    expect(record.recent).toHaveLength(8);
    expect(record.recent[0].at).toBe(1010);
    expect(record.recent[7].at).toBe(1003);
  });

  it('normalises a partial legacy record', () => {
    const record = normalizeRecord({
      matches: 4,
      winsA: 3,
      winsB: 1,
      rounds: 19,
      lastWinner: 0,
    });
    expect(record.matches).toBe(4);
    expect(record.winsA).toBe(3);
    expect(record.winsB).toBe(1);
    expect(record.rounds).toBe(19);
    expect(record.byMode).toEqual({ ai: 0, local: 0, lan: 0 });
    expect(record.recent).toEqual([]);
  });

  it('rejects junk values and bad recent entries', () => {
    const record = normalizeRecord({
      matches: Number.NaN,
      winsA: -2,
      winsB: 2.9,
      lastWinner: 7 as unknown as 0,
      byMode: { ai: 4, local: Number.POSITIVE_INFINITY, lan: 1 },
      recent: [
        { winner: 0, scores: [500, 400], rounds: 3, mode: 'ai', at: 1 },
        { winner: 9, scores: [1, 2], rounds: 1, mode: 'bogus', at: 2 },
      ] as never,
    });
    expect(record.matches).toBe(0);
    expect(record.winsA).toBe(0);
    expect(record.winsB).toBe(2);
    expect(record.lastWinner).toBeNull();
    expect(record.byMode).toEqual({ ai: 4, local: 0, lan: 1 });
    expect(record.recent).toHaveLength(1);
  });
});
