import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/engine';
import { mulberry32, randInt, type Rng } from '../src/game/rng';
import type { GameConfig } from '../src/game/types';

const CONFIGS: GameConfig[] = [
  { variant: 'duo', players: 2 },
  { variant: 'standard', players: 4 },
  { variant: 'standard', players: 3 },
  { variant: 'standard', players: 2 },
];

/** play random legal moves until the game ends; pass only when forced */
function randomPlayout(g: Game, rng: Rng, maxActions = 600): number {
  let n = 0;
  while (!g.over && n < maxActions) {
    const p = g.turn;
    const moves = g.legalMoves(p);
    if (moves.length === 0) {
      if (!g.tryApply({ kind: 'pass', p })) throw new Error('pass rejected');
    } else {
      if (!g.tryApply(moves[randInt(rng, moves.length)])) throw new Error('legal move rejected');
    }
    n++;
  }
  if (!g.over) throw new Error(`playout did not finish in ${maxActions} actions`);
  return n;
}

describe('引擎：随机对局', () => {
  it.each(CONFIGS.map((c) => [`${c.variant}-${c.players}p`, c] as const))(
    '随机对局能正常终局并保持一致（%s）',
    (_name, config) => {
      const rng = mulberry32(42);
      const g = new Game(config);
      const actions = randomPlayout(g, rng);

      // end condition: every player is stuck (mobility only shrinks over time)
      for (let p = 0; p < g.playerCount; p++) {
        expect(g.mustPass(p), `player ${p} still has moves`).toBe(true);
      }

      // scores consistent with the board
      const scores = g.scores();
      let totalCells = 0;
      for (let p = 0; p < g.playerCount; p++) {
        let cellsOnBoard = 0;
        for (let y = 0; y < g.size; y++) {
          for (let x = 0; x < g.size; x++) {
            if (g.at(x, y) === p + 1) cellsOnBoard++;
          }
        }
        expect(cellsOnBoard).toBe(scores[p].cells);
        expect(scores[p].cells).toBeLessThanOrEqual(89);
        totalCells += cellsOnBoard;
      }
      expect(totalCells).toBeLessThanOrEqual(g.playerCount * 89);

      // history length exactly matches actions taken (placements + passes)
      expect(g.history.length).toBe(actions);
    },
  );

  it('相同种子产生完全相同的对局（确定性）', () => {
    const run = (): Game => {
      const g = new Game(CONFIGS[1]);
      randomPlayout(g, mulberry32(7));
      return g;
    };
    const a = run();
    const b = run();
    expect([...a.board]).toEqual([...b.board]);
    expect(a.history).toEqual(b.history);
  });
});

describe('引擎：序列化', () => {
  it('序列化 → 反序列化保持状态一致', () => {
    const g = new Game(CONFIGS[1]);
    randomPlayout(g, mulberry32(99));
    const s = g.serialize();
    const g2 = Game.deserialize(JSON.parse(JSON.stringify(s)));
    expect([...g2.board]).toEqual([...g.board]);
    expect(g2.scores()).toEqual(g.scores());
    expect(g2.turn).toBe(g.turn);
    expect(g2.over).toBe(g.over);
    expect(g2.history).toEqual(g.history);
  });

  it('clone 与原状态独立', () => {
    const g = new Game(CONFIGS[0]);
    g.tryApply(g.legalMoves(0)[0]);
    const c = g.clone();
    c.tryApply(c.legalMoves(1)[0]);
    expect([...c.board]).not.toEqual([...g.board]);
    expect(g.turn).toBe(1);
    expect(c.turn).toBe(0);
  });

  it('拒绝非法历史记录与未知版本', () => {
    const g = new Game(CONFIGS[0]);
    const bad = g.serialize();
    bad.history.push({ kind: 'place', p: 1, piece: 0, o: 0, x: 5, y: 5 });
    expect(() => Game.deserialize(bad)).toThrow();
    expect(() => Game.deserialize({ v: 9, config: CONFIGS[0], history: [] } as never)).toThrow();
  });
});

describe('引擎：合法走法枚举', () => {
  it('hasMove 与 legalMoves 一致', () => {
    const g = new Game(CONFIGS[1]);
    const rng = mulberry32(1234);
    for (let i = 0; i < 40 && !g.over; i++) {
      for (let p = 0; p < g.playerCount; p++) {
        expect(g.hasMove(p)).toBe(g.legalMoves(p).length > 0);
      }
      const moves = g.legalMoves(g.turn);
      if (moves.length === 0) g.tryApply({ kind: 'pass', p: g.turn });
      else g.tryApply(moves[randInt(rng, moves.length)]);
    }
  });

  it('所有枚举出的走法都能被合法应用（黑盒一致性）', () => {
    const g = new Game(CONFIGS[3]);
    const rng = mulberry32(555);
    for (let i = 0; i < 10; i++) {
      const moves = g.legalMoves(g.turn);
      if (moves.length === 0) {
        g.tryApply({ kind: 'pass', p: g.turn });
        continue;
      }
      for (const m of moves) {
        const c = g.clone();
        expect(c.tryApply(m), JSON.stringify(m)).toBe(true);
      }
      g.tryApply(moves[randInt(rng, moves.length)]);
    }
  });
});
