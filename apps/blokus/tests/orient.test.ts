import { describe, expect, it } from 'vitest';
import { PIECES } from '../src/game/pieces';
import { clampIntoPiece, transformCell, transformOrientation, type TransformKind } from '../src/ui/orient';

const KINDS: TransformKind[] = ['cw', 'ccw', 'mirror'];

describe('朝向变换（拖拽旋转的几何基础）', () => {
  it('transformCell 是到目标朝向格点集合的一一映射（全部棋子 × 朝向 × 变换）', () => {
    for (let piece = 0; piece < PIECES.length; piece++) {
      const ors = PIECES[piece].orientations;
      for (let o = 0; o < ors.length; o++) {
        for (const kind of KINDS) {
          const toO = transformOrientation(piece, o, kind);
          expect(toO, `${piece}/${o}/${kind}`).toBeGreaterThanOrEqual(0);
          const target = new Set<string>();
          for (let i = 0; i < ors[toO].cells.length; i += 2) {
            target.add(`${ors[toO].cells[i]},${ors[toO].cells[i + 1]}`);
          }
          const mapped = new Set<string>();
          for (let i = 0; i < ors[o].cells.length; i += 2) {
            const [x, y] = transformCell(piece, o, kind, [ors[o].cells[i], ors[o].cells[i + 1]]);
            mapped.add(`${x},${y}`);
          }
          expect(mapped.size, `${piece}/${o}/${kind}`).toBe(target.size);
          for (const key of mapped) {
            expect(target.has(key), `${piece}/${o}/${kind} -> ${key}`).toBe(true);
          }
        }
      }
    }
  });

  it('顺时针与逆时针互为逆变换（朝向索引与格点都回到原位）', () => {
    for (let piece = 0; piece < PIECES.length; piece++) {
      const ors = PIECES[piece].orientations;
      for (let o = 0; o < ors.length; o++) {
        const afterCw = transformOrientation(piece, o, 'cw');
        const back = transformOrientation(piece, afterCw, 'ccw');
        expect(back, `${piece}/${o}`).toBe(o);
        for (let i = 0; i < ors[o].cells.length; i += 2) {
          const cell: [number, number] = [ors[o].cells[i], ors[o].cells[i + 1]];
          const cw = transformCell(piece, o, 'cw', cell);
          const backCell = transformCell(piece, afterCw, 'ccw', cw);
          expect(backCell, `${piece}/${o}`).toEqual(cell);
        }
      }
    }
  });

  it('两次镜像回到原朝向', () => {
    for (let piece = 0; piece < PIECES.length; piece++) {
      const ors = PIECES[piece].orientations;
      for (let o = 0; o < ors.length; o++) {
        const once = transformOrientation(piece, o, 'mirror');
        const twice = transformOrientation(piece, once, 'mirror');
        expect(twice, `${piece}/${o}`).toBe(o);
      }
    }
  });

  it('clampIntoPiece 把抓取点限制在包围盒内', () => {
    for (let piece = 0; piece < PIECES.length; piece++) {
      const or = PIECES[piece].orientations[0];
      expect(clampIntoPiece(piece, 0, -3, 99)).toEqual([Math.min(0, or.w - 1), or.h - 1]);
      expect(clampIntoPiece(piece, 0, 0, 0)).toEqual([0, 0]);
      expect(clampIntoPiece(piece, 0, or.w + 5, -2)).toEqual([or.w - 1, 0]);
    }
  });
});
