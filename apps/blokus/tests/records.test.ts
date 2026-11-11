import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game/engine';
import { mulberry32, randInt } from '../src/game/rng';
import type { GameRecord } from '../src/records';
import {
  clearRecords,
  favoriteSeat,
  loadRecords,
  loadStats,
  saveGameRecord,
  totalGames,
} from '../src/records';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

/** play a random duo game to the end and build a record out of it */
function finishedRecord(names: string[], seed: number): GameRecord {
  const config = { variant: 'duo' as const, players: 2 as const };
  const g = new Game(config);
  const rng = mulberry32(seed);
  while (!g.over) {
    const moves = g.legalMoves(g.turn);
    if (moves.length === 0) {
      g.tryApply({ kind: 'pass', p: g.turn });
    } else {
      g.tryApply(moves[randInt(rng, moves.length)]);
    }
  }
  return {
    id: `t${seed}`,
    at: Date.now(),
    mode: 'hotseat',
    config,
    seats: names,
    localSeats: [0, 1],
    scores: g.scores(),
    ranking: g.ranking(),
    history: g.history.slice(),
  };
}

describe('对局记录与战绩', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  });

  it('保存后可读取，最多保留 10 局', () => {
    for (let i = 0; i < 12; i++) {
      const rec = finishedRecord(['A', 'B'], 100 + i);
      rec.id = `r${i}`;
      saveGameRecord(rec);
    }
    const list = loadRecords();
    expect(list.length).toBe(10);
    expect(list[0].id).toBe('r11'); // newest first
  });

  it('胜场、连胜、最高分与最爱颜色都会被累计', () => {
    const a = finishedRecord(['A', 'B'], 1);
    saveGameRecord(a);
    const winner = a.seats[a.ranking[0]];
    const loser = a.seats[a.ranking[0] === 0 ? 1 : 0];
    let st = loadStats();
    expect(totalGames(st)).toBe(1);
    expect(st.players[winner].wins).toBe(1);
    expect(st.players[winner].streak).toBe(1);
    expect(st.players[loser].wins).toBe(0);
    expect(st.players[loser].streak).toBe(0);
    expect(st.players[winner].best).toBeGreaterThanOrEqual(0);

    const b = finishedRecord(['A', 'B'], 2);
    saveGameRecord(b);
    st = loadStats();
    expect(totalGames(st)).toBe(2);
    const fav = favoriteSeat(st);
    expect(fav).not.toBeNull();
    expect(st.seatWins.reduce((s, w) => s + w, 0)).toBe(2);
  });

  it('清空后一切归零', () => {
    saveGameRecord(finishedRecord(['A', 'B'], 3));
    clearRecords();
    expect(loadRecords()).toEqual([]);
    expect(totalGames(loadStats())).toBe(0);
    expect(favoriteSeat(loadStats())).toBeNull();
  });

  it('损坏的存储不会抛异常', () => {
    (globalThis as unknown as { localStorage: MemStorage }).localStorage.setItem(
      'blokus.records',
      '{oops',
    );
    expect(loadRecords()).toEqual([]);
    expect(totalGames(loadStats())).toBe(0);
  });
});
