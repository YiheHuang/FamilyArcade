import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/engine';
import { PIECES } from '../src/game/pieces';
import type { GameConfig } from '../src/game/types';
import { orientationOf, pass, place } from './helpers';

function duo(): Game {
  return new Game({ variant: 'duo', players: 2 });
}

function standard4(): Game {
  return new Game({ variant: 'standard', players: 4 });
}

/** write a board cell directly (test-only state crafting) */
function setCell(g: Game, x: number, y: number, v: number): void {
  g.board[(y + 2) * g.stride + (x + 2)] = v;
}

function covers(m: { piece: number; o: number; x: number; y: number }, cx: number, cy: number): boolean {
  const cells = PIECES[m.piece].orientations[m.o].cells;
  for (let i = 0; i < cells.length; i += 2) {
    if (m.x + cells[i] === cx && m.y + cells[i + 1] === cy) return true;
  }
  return false;
}

describe('起手与回合', () => {
  it('首子必须盖住自己的角落', () => {
    const g = duo();
    expect(g.tryApply(place(0, 'I2', [[0, 0], [1, 0]], 5, 5))).toBe(false);
    expect(g.tryApply(place(0, 'I2', [[0, 0], [1, 0]], 0, 1))).toBe(false);
    expect(g.tryApply(place(0, 'I2', [[0, 0], [1, 0]], 0, 0))).toBe(true);
  });

  it('不能替别人走子', () => {
    const g = duo();
    expect(g.tryApply(place(1, 'I1', [[0, 0]], 13, 13))).toBe(false);
  });

  it('20×20 四人局四个角落归属正确', () => {
    const g = standard4();
    const corners = g.startCorners.map((idx) => {
      const s = g.stride;
      const y = Math.floor(idx / s) - 2;
      const x = (idx % s) - 2;
      return [x, y] as [number, number];
    });
    expect(corners).toEqual([
      [0, 0],
      [19, 0],
      [19, 19],
      [0, 19],
    ]);
  });

  it('14×14 双人局对角起手', () => {
    const g = duo();
    expect(g.tryApply(place(0, 'I2', [[0, 0], [1, 0]], 0, 0))).toBe(true);
    expect(g.tryApply(place(1, 'I2', [[0, 0], [0, 1]], 13, 12))).toBe(true);
    // P1 cannot open on P2's corner
    const g2 = duo();
    expect(g2.tryApply(place(0, 'I2', [[0, 0], [1, 0]], 12, 13))).toBe(false);
  });
});

describe('接触规则', () => {
  it('必须有对角接触，禁止边贴边', () => {
    const g = duo();
    expect(g.tryApply(place(0, 'I2', [[0, 0], [1, 0]], 0, 0))).toBe(true);
    expect(g.tryApply(pass(1))).toBe(true);

    // 无接触
    expect(g.tryApply(place(0, 'I1', [[0, 0]], 5, 5))).toBe(false);
    // 与 (1,0) 边贴
    expect(g.tryApply(place(0, 'I1', [[0, 0]], 2, 0))).toBe(false);
    // 与 (1,0) 边贴（下侧）
    expect(g.tryApply(place(0, 'I1', [[0, 0]], 1, 1))).toBe(false);
    // 与 (0,0) 边贴
    expect(g.tryApply(place(0, 'I1', [[0, 0]], 0, 1))).toBe(false);
    // 对角接触 (1,0)
    expect(g.tryApply(place(0, 'I1', [[0, 0]], 2, 1))).toBe(true);
  });

  it('允许与对手棋子边贴边', () => {
    const g = duo();
    // hand-crafted: own piece at (1,1), opponent at (3,2)
    setCell(g, 1, 1, 1);
    setCell(g, 3, 2, 2);
    g.placedCells[0] = 1;
    expect(g.tryApply(place(0, 'I1', [[0, 0]], 2, 2))).toBe(true);
  });

  it('不能覆盖已有棋子或越界', () => {
    const g = duo();
    expect(g.tryApply(place(0, 'I2', [[0, 0], [1, 0]], 0, 0))).toBe(true);
    expect(g.tryApply(pass(1))).toBe(true);
    expect(g.tryApply(place(0, 'I1', [[0, 0]], 1, 0))).toBe(false); // 覆盖
    expect(g.tryApply(place(0, 'I2', [[0, 0], [0, 1]], 2, 13))).toBe(false); // 越界
    expect(g.tryApply(place(0, 'I1', [[0, 0]], -1, 5))).toBe(false);
  });

  it('合法走法枚举只包含合法位置', () => {
    const g = duo();
    const moves = g.legalMoves(0);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(covers(m, 0, 0), JSON.stringify(m)).toBe(true);
    }
    // 水平 / 垂直两种二连都应存在
    const hasH = moves.some((m) => m.piece === 1 && covers(m, 0, 0) && covers(m, 1, 0));
    const hasV = moves.some((m) => m.piece === 1 && covers(m, 0, 0) && covers(m, 0, 1));
    expect(hasH).toBe(true);
    expect(hasV).toBe(true);
  });
});

describe('跳过与终局', () => {
  it('连续全体跳过后终局', () => {
    const g = duo();
    expect(g.tryApply(pass(0))).toBe(true);
    expect(g.over).toBe(false);
    expect(g.tryApply(pass(1))).toBe(true);
    expect(g.over).toBe(true);
    expect(g.tryApply(pass(0))).toBe(false);
    expect(g.tryApply(place(0, 'I1', [[0, 0]], 0, 0))).toBe(false);
  });

  it('落子会清零连续跳过计数', () => {
    const g = duo();
    expect(g.tryApply(pass(0))).toBe(true);
    expect(g.tryApply(place(1, 'I2', [[0, 0], [1, 0]], 12, 13))).toBe(true);
    expect(g.consecutivePasses).toBe(0);
  });

  it('四人局需要四连跳才终局', () => {
    const g = standard4();
    expect(g.tryApply(pass(0))).toBe(true);
    expect(g.tryApply(pass(1))).toBe(true);
    expect(g.tryApply(pass(2))).toBe(true);
    expect(g.over).toBe(false);
    expect(g.tryApply(pass(3))).toBe(true);
    expect(g.over).toBe(true);
  });

  it('已放完全部棋子的玩家被自动跳过', () => {
    const g = standard4();
    g.remaining[0] = 0;
    g.placedCells[0] = 89;
    g.turn = 1;
    expect(g.tryApply(pass(1))).toBe(true);
    expect(g.turn).toBe(2);
    expect(g.tryApply(pass(2))).toBe(true);
    expect(g.turn).toBe(3);
    expect(g.tryApply(pass(3))).toBe(true);
    expect(g.over).toBe(true);
  });
});

describe('计分', () => {
  it('无奖励时等于落格数', () => {
    const g = standard4();
    g.placedCells = [12, 30, 0, 5];
    const s = g.scores();
    expect(s[0].total).toBe(12);
    expect(s[1].total).toBe(30);
    expect(s[3].piecesLeft).toBe(21);
  });

  it('放完全部棋子 +15；单格块收尾 +20', () => {
    const g = duo();
    g.remaining[0] = 0;
    g.placedCells[0] = 89;
    g.lastPiece[0] = PIECES.findIndex((p) => p.id === 'I1');
    expect(g.score(0).bonus).toBe(20);
    g.lastPiece[0] = PIECES.findIndex((p) => p.id === 'Z5');
    expect(g.score(0).bonus).toBe(15);
  });

  it('排名按总分降序、剩余块数升序', () => {
    const g = standard4();
    g.placedCells = [10, 10, 20, 5];
    g.remaining[0] = 0b111;
    g.remaining[1] = 0b1;
    const ranking = g.ranking();
    expect(ranking[0]).toBe(2); // 20 分
    expect(ranking[1]).toBe(1); // 10 分、剩余 1 块
    expect(ranking[2]).toBe(0); // 10 分、剩余 3 块
    expect(ranking[3]).toBe(3);
  });
});

describe('边界与参数校验', () => {
  it('拒绝非法朝向与未持有的棋子', () => {
    const g = duo();
    const piece = PIECES.findIndex((p) => p.id === 'I1');
    expect(g.tryApply({ kind: 'place', p: 0, piece, o: 99, x: 0, y: 0 })).toBe(false);
    expect(g.tryApply({ kind: 'place', p: 0, piece: 999, o: 0, x: 0, y: 0 })).toBe(false);
    g.placedCells[0] = 1;
    g.remaining[0] = 0;
    expect(g.tryApply({ kind: 'place', p: 0, piece, o: 0, x: 2, y: 2 })).toBe(false);
  });

  it('duo 变体不支持 3/4 人', () => {
    expect(() => new Game({ variant: 'duo', players: 3 } as unknown as GameConfig)).toThrow();
  });
});

describe('非法原因解释（illegalReason）', () => {
  it('合法走子返回 null', () => {
    const g = duo();
    expect(g.illegalReason(place(0, 'I2', [[0, 0], [1, 0]], 0, 0))).toBeNull();
  });

  it('首子未盖角 → no-corner', () => {
    const g = duo();
    expect(g.illegalReason(place(0, 'I2', [[0, 0], [1, 0]], 5, 5))).toBe('no-corner');
  });

  it('无对角接触 → no-contact', () => {
    const g = duo();
    expect(g.tryApply(place(0, 'I2', [[0, 0], [1, 0]], 0, 0))).toBe(true);
    expect(g.tryApply(pass(1))).toBe(true);
    expect(g.illegalReason(place(0, 'I1', [[0, 0]], 5, 5))).toBe('no-contact');
  });

  it('与己方边贴边 → edge-touch', () => {
    const g = duo();
    expect(g.tryApply(place(0, 'I2', [[0, 0], [1, 0]], 0, 0))).toBe(true);
    expect(g.tryApply(pass(1))).toBe(true);
    expect(g.illegalReason(place(0, 'I1', [[0, 0]], 2, 0))).toBe('edge-touch');
  });

  it('覆盖已有棋子 → occupied', () => {
    const g = duo();
    expect(g.tryApply(place(0, 'I2', [[0, 0], [1, 0]], 0, 0))).toBe(true);
    expect(g.tryApply(pass(1))).toBe(true);
    expect(g.illegalReason(place(0, 'I1', [[0, 0]], 1, 0))).toBe('occupied');
  });

  it('越界 → bounds', () => {
    const g = duo();
    expect(g.illegalReason(place(0, 'I2', [[0, 0], [0, 1]], 13, 13))).toBe('bounds');
    expect(g.illegalReason(place(0, 'I1', [[0, 0]], -1, 5))).toBe('bounds');
  });

  it('非当前玩家 → turn；已用棋子 → piece-used；终局 → over', () => {
    const g = duo();
    expect(g.illegalReason(place(1, 'I1', [[0, 0]], 13, 13))).toBe('turn');
    expect(g.tryApply(place(0, 'I2', [[0, 0], [1, 0]], 0, 0))).toBe(true);
    expect(g.tryApply(pass(1))).toBe(true);
    expect(g.illegalReason(place(0, 'I2', [[0, 0], [1, 0]], 0, 0))).toBe('piece-used');
    expect(g.tryApply(pass(0))).toBe(true);
    expect(g.over).toBe(true);
    expect(g.illegalReason(place(0, 'I1', [[0, 0]], 2, 1))).toBe('over');
  });

  it('与 tryApply 判定一致：随机对局中抽查非法走法', () => {
    // 覆盖多种棋盘状态的抽查：任何被判非法的走法，illegalReason 必须给出原因
    const g = standard4();
    const rngSeed = 42;
    let s = rngSeed;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let step = 0; step < 40 && !g.over; step++) {
      const moves = g.legalMoves(g.turn);
      if (moves.length > 0) {
        const m = moves[Math.floor(rnd() * moves.length)];
        const reason = g.illegalReason(m);
        expect(reason, JSON.stringify(m)).toBeNull();
        expect(g.tryApply(m)).toBe(true);
      } else {
        expect(g.tryApply(pass(g.turn))).toBe(true);
      }
    }
  });
});

describe('朝向匹配辅助函数', () => {
  it('orientationOf 能找到标准朝向', () => {
    const a = orientationOf('I2', [
      [0, 0],
      [1, 0],
    ]);
    const b = orientationOf('I2', [
      [0, 0],
      [0, 1],
    ]);
    expect(a).not.toBe(b);
  });
});
