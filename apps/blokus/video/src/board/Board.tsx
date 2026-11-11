import type { CSSProperties } from "react";
import { PIECES } from "../../../src/game/pieces";
import type { Game } from "../../../src/game/engine";
import { BAD, BOARD_BG, INK, LINE, PALETTE, withAlpha } from "../theme";
import { CellMark } from "./CellMark";

export interface BoardGhost {
  piece: number;
  o: number;
  x: number;
  y: number;
  opacity: number;
  /** draw the red strike-through 0..1 */
  strike?: number;
}

export interface BoardRing {
  x: number;
  y: number;
  opacity: number;
  color?: string;
  r?: number;
  width?: number;
}

export interface BoardLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity: number;
  color?: string;
  width?: number;
  dashed?: boolean;
}

export interface BoardProps {
  game: Game;
  cell: number;
  gridOpacity?: number;
  showLast?: boolean;
  /** 0..1 reveal of the newest piece (fade + slight rise) */
  lastMoveProgress?: number;
  ghost?: BoardGhost | null;
  rings?: BoardRing[];
  lines?: BoardLine[];
  border?: boolean;
  style?: CSSProperties;
}

/**
 * The board exactly as the app draws it (src/ui/board.ts):
 * rounded cells inset by 4.5%, radius 16%, 1px grid lines, a per-cell
 * colour-blind mark, and the last move outlined in 38% ink.
 */
export const Board: React.FC<BoardProps> = ({
  game,
  cell,
  gridOpacity = 1,
  showLast = true,
  lastMoveProgress,
  ghost = null,
  rings = [],
  lines = [],
  border = true,
  style,
}) => {
  const size = game.size;
  const px = size * cell;
  const inset = Math.max(0.7, cell * 0.045);
  const radius = Math.max(2, cell * 0.16);

  const last = game.history[game.history.length - 1];
  const lastPlace = last && last.kind === "place" ? last : null;
  const lastKey = lastPlace
    ? new Set(
        PIECES[lastPlace.piece].orientations[lastPlace.o].cells.reduce<number[]>((acc, _, i, arr) => {
          if (i % 2 === 0) acc.push((lastPlace.y + arr[i + 1]) * size + (lastPlace.x + arr[i]));
          return acc;
        }, []),
      )
    : null;

  const cells: React.ReactNode[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = game.at(x, y);
      if (v === 0 || v >= 15) continue;
      if (lastKey && lastMoveProgress !== undefined && lastKey.has(y * size + x)) continue;
      cells.push(
        <g key={`${x}-${y}`}>
          <rect
            x={x * cell + inset}
            y={y * cell + inset}
            width={cell - inset * 2}
            height={cell - inset * 2}
            rx={radius}
            fill={PALETTE[v - 1]}
          />
          <CellMark player={v - 1} cx={(x + 0.5) * cell} cy={(y + 0.5) * cell} cell={cell} />
        </g>,
      );
    }
  }

  const newest: React.ReactNode[] = [];
  if (lastPlace && lastMoveProgress !== undefined) {
    const or = PIECES[lastPlace.piece].orientations[lastPlace.o];
    for (let i = 0; i < or.cells.length; i += 2) {
      const x = lastPlace.x + or.cells[i];
      const y = lastPlace.y + or.cells[i + 1];
      newest.push(
        <g key={`n-${i}`}>
          <rect
            x={x * cell + inset}
            y={y * cell + inset}
            width={cell - inset * 2}
            height={cell - inset * 2}
            rx={radius}
            fill={PALETTE[lastPlace.p]}
          />
          <CellMark player={lastPlace.p} cx={(x + 0.5) * cell} cy={(y + 0.5) * cell} cell={cell} />
        </g>,
      );
    }
  }

  // ghost piece + optional strike-through
  let ghostRect: { x0: number; y0: number; x1: number; y1: number } | null = null;
  if (ghost) {
    const or = PIECES[ghost.piece].orientations[ghost.o];
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < or.cells.length; i += 2) {
      const gx = ghost.x + or.cells[i];
      const gy = ghost.y + or.cells[i + 1];
      x0 = Math.min(x0, gx);
      y0 = Math.min(y0, gy);
      x1 = Math.max(x1, gx + 1);
      y1 = Math.max(y1, gy + 1);
    }
    ghostRect = { x0, y0, x1, y1 };
  }
  const strikeProgress = ghost?.strike ?? 0;
  const strike = ghostRect
    ? {
        x1: (ghostRect.x0 - 0.18) * cell,
        y1: (ghostRect.y0 - 0.18) * cell,
        x2: (ghostRect.x1 + 0.18) * cell,
        y2: (ghostRect.y1 + 0.18) * cell,
      }
    : null;
  const strikeNow = strike
    ? {
        x2: strike.x1 + (strike.x2 - strike.x1) * strikeProgress,
        y2: strike.y1 + (strike.y2 - strike.y1) * strikeProgress,
      }
    : null;

  return (
    <svg
      width={px}
      height={px}
      viewBox={`0 0 ${px} ${px}`}
      style={{
        display: "block",
        border: border ? `1px solid ${LINE}` : undefined,
        borderRadius: border ? 6 : undefined,
        background: BOARD_BG,
        boxShadow: border ? "0 10px 30px rgba(31, 29, 26, 0.04)" : undefined,
        ...style,
      }}
    >
      {cells}
      {newest.length > 0 && (
        <g
          opacity={lastMoveProgress}
          style={{
            translate: `0px ${(1 - (lastMoveProgress ?? 0)) * cell * 0.12}px`,
          }}
        >
          {newest}
        </g>
      )}
      {gridOpacity > 0 && (
        <g stroke={LINE} strokeWidth={1} shapeRendering="crispEdges" opacity={gridOpacity}>
          {Array.from({ length: size - 1 }, (_, i) => (
            <g key={i}>
              <line x1={(i + 1) * cell} y1={0} x2={(i + 1) * cell} y2={px} />
              <line x1={0} y1={(i + 1) * cell} x2={px} y2={(i + 1) * cell} />
            </g>
          ))}
        </g>
      )}
      {lastPlace && showLast && (
        <g stroke={withAlpha(INK, 0.38)} strokeWidth={1.4} fill="none">
          {(() => {
            const or = PIECES[lastPlace.piece].orientations[lastPlace.o];
            const rects = [];
            for (let i = 0; i < or.cells.length; i += 2) {
              const x = lastPlace.x + or.cells[i];
              const y = lastPlace.y + or.cells[i + 1];
              rects.push(
                <rect
                  key={`l-${i}`}
                  x={x * cell + 1.2}
                  y={y * cell + 1.2}
                  width={cell - 2.4}
                  height={cell - 2.4}
                  rx={radius * 0.8}
                />,
              );
            }
            return rects;
          })()}
        </g>
      )}
      {ghost && ghostRect && (
        <g opacity={ghost.opacity}>
          {(() => {
            const or = PIECES[ghost.piece].orientations[ghost.o];
            const items = [];
            for (let i = 0; i < or.cells.length; i += 2) {
              const x = ghost.x + or.cells[i];
              const y = ghost.y + or.cells[i + 1];
              items.push(
                <rect
                  key={`g-${i}`}
                  x={x * cell + inset}
                  y={y * cell + inset}
                  width={cell - inset * 2}
                  height={cell - inset * 2}
                  rx={radius}
                  fill={withAlpha(BAD, 0.13)}
                  stroke={BAD}
                  strokeWidth={2.2}
                />,
              );
            }
            return items;
          })()}
        </g>
      )}
      {strikeNow && (
        <line
          x1={strike!.x1}
          y1={strike!.y1}
          x2={strikeNow.x2}
          y2={strikeNow.y2}
          stroke={BAD}
          strokeWidth={3.4}
          strokeLinecap="round"
          opacity={ghost ? ghost.opacity : 1}
        />
      )}
      {rings.map((r, i) => (
        <circle
          key={`r-${i}`}
          cx={(r.x + 0.5) * cell}
          cy={(r.y + 0.5) * cell}
          r={r.r ?? cell * 0.62}
          fill="none"
          stroke={r.color ?? withAlpha(INK, 0.45)}
          strokeWidth={r.width ?? 2}
          opacity={r.opacity}
        />
      ))}
      {lines.map((l, i) => (
        <line
          key={`ln-${i}`}
          x1={(l.x1 + 0.5) * cell}
          y1={(l.y1 + 0.5) * cell}
          x2={(l.x2 + 0.5) * cell}
          y2={(l.y2 + 0.5) * cell}
          stroke={l.color ?? withAlpha(INK, 0.4)}
          strokeWidth={l.width ?? 1.6}
          strokeDasharray={l.dashed ? `${cell * 0.16} ${cell * 0.12}` : undefined}
          opacity={l.opacity}
        />
      ))}
    </svg>
  );
};
