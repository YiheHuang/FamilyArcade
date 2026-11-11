import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Cell, LastMove, Move } from '../game/mill';

/** Grid coordinates on a 7 × 7 lattice; the SVG uses a 600 × 600 viewBox. */
export const POINT_COORDS: readonly { x: number; y: number }[] = [
  { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3 },
  { x: 6, y: 6 }, { x: 3, y: 6 }, { x: 0, y: 6 }, { x: 0, y: 3 },
  { x: 1, y: 1 }, { x: 3, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 3 },
  { x: 5, y: 5 }, { x: 3, y: 5 }, { x: 1, y: 5 }, { x: 1, y: 3 },
  { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 3 },
  { x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }, { x: 2, y: 3 },
];

const EDGES: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0],
  [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 15], [15, 8],
  [16, 17], [17, 18], [18, 19], [19, 20], [20, 21], [21, 22], [22, 23], [23, 16],
  [1, 9], [9, 17], [3, 11], [11, 19], [5, 13], [13, 21], [7, 15], [15, 23],
];

const PAD = 60;
const STEP = 80;

function xy(point: number): { x: number; y: number } {
  const coord = POINT_COORDS[point];
  return { x: PAD + coord.x * STEP, y: PAD + coord.y * STEP };
}

function percent(point: number): { left: string; top: string } {
  const coord = POINT_COORDS[point];
  return {
    left: `${((PAD + coord.x * STEP) / 600) * 100}%`,
    top: `${((PAD + coord.y * STEP) / 600) * 100}%`,
  };
}

function moveTarget(move: Move | null): number | null {
  if (!move) return null;
  if (move.type === 'place' || move.type === 'capture') return move.point;
  return move.to;
}

export function Board({
  board,
  last = null,
  hint = null,
  selected = null,
  targets = [],
  capturable = [],
  millLine = null,
  disabled = false,
  preview = false,
  onPoint,
  labels,
}: {
  board: readonly Cell[];
  last?: LastMove | null;
  hint?: Move | null;
  selected?: number | null;
  targets?: readonly number[];
  capturable?: readonly number[];
  millLine?: readonly number[] | null;
  disabled?: boolean;
  preview?: boolean;
  onPoint?: (point: number) => void;
  labels?: { empty: string; white: string; black: string; board: string };
}) {
  const targetSet = new Set(targets);
  const captureSet = new Set(capturable);
  const millSet = new Set(millLine ?? []);
  const hintFrom = hint?.type === 'move' ? hint.from : null;
  const hintTo = moveTarget(hint);
  const aria = labels ?? { empty: 'empty', white: 'white man', black: 'black man', board: 'Mill board' };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (preview) return;
    const target = event.target as HTMLElement;
    const pointButton = target.closest<HTMLButtonElement>('.point');
    if (!pointButton) return;
    const point = Number(pointButton.dataset.point);
    if (!Number.isInteger(point)) return;
    const direction =
      event.key === 'ArrowRight'
        ? [1, 0]
        : event.key === 'ArrowLeft'
          ? [-1, 0]
          : event.key === 'ArrowDown'
            ? [0, 1]
            : event.key === 'ArrowUp'
              ? [0, -1]
              : null;
    if (!direction) return;
    event.preventDefault();
    const origin = POINT_COORDS[point];
    let best = -1;
    let bestScore = Infinity;
    POINT_COORDS.forEach((coord, candidate) => {
      if (candidate === point) return;
      const dx = coord.x - origin.x;
      const dy = coord.y - origin.y;
      if (direction[0] !== 0 && Math.sign(dx) !== direction[0]) return;
      if (direction[1] !== 0 && Math.sign(dy) !== direction[1]) return;
      const score = Math.abs(dx) + Math.abs(dy) * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    });
    if (best >= 0) {
      document.querySelector<HTMLButtonElement>(`.point[data-point="${best}"]`)?.focus();
    }
  };

  return (
    <div
      className={`mill-board${preview ? ' preview' : ''}`}
      role={preview ? undefined : 'group'}
      aria-label={preview ? undefined : aria.board}
      aria-hidden={preview || undefined}
      onKeyDown={onKeyDown}
    >
      <svg className="board-lines" viewBox="0 0 600 600" aria-hidden="true" focusable="false">
        <rect className="board-frame" x="44" y="44" width="512" height="512" rx="18" />
        {EDGES.map(([a, b]) => {
          const from = xy(a);
          const to = xy(b);
          return (
            <line
              key={`${a}-${b}`}
              className="board-line"
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          );
        })}
        {millLine && millLine.length >= 2 ? (
          <line
            className="mill-glow"
            x1={xy(millLine[0]).x}
            y1={xy(millLine[0]).y}
            x2={xy(millLine[millLine.length - 1]).x}
            y2={xy(millLine[millLine.length - 1]).y}
          />
        ) : null}
        {POINT_COORDS.map((_, point) => {
          const at = xy(point);
          return <circle key={point} className="board-dot" cx={at.x} cy={at.y} r="5" />;
        })}
      </svg>

      {board.map((cell, point) => {
        const at = percent(point);
        const isLast = last?.to === point;
        const isLastFrom = last?.from === point;
        const isTarget = targetSet.has(point);
        const isCapturable = captureSet.has(point);
        const classes = [
          'point',
          cell ? `p-${cell.toLowerCase()}` : 'is-empty',
          selected === point ? 'selected' : '',
          isTarget ? 'target' : '',
          isCapturable ? 'capture-target' : '',
          isLast ? 'last-point' : '',
          isLastFrom ? 'last-from' : '',
          millSet.has(point) ? 'mill-point' : '',
          hintFrom === point ? 'hint-from' : '',
          hintTo === point ? 'hint-point' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const label = cell === 'W' ? aria.white : cell === 'B' ? aria.black : aria.empty;

        if (preview) {
          return (
            <span key={point} className={classes} style={at} data-point={point}>
              {cell ? <Stone player={cell} /> : null}
            </span>
          );
        }

        return (
          <button
            key={point}
            type="button"
            className={classes}
            style={at}
            data-point={point}
            disabled={disabled}
            aria-label={`${point + 1}, ${label}`}
            aria-pressed={selected === point || undefined}
            onClick={() => onPoint?.(point)}
          >
            {cell ? <Stone player={cell} /> : <span className="point-seat" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

function Stone({ player }: { player: Exclude<Cell, null> }) {
  return (
    <span className={`stone stone-${player === 'W' ? 'w' : 'b'}`} aria-hidden="true">
      <span className="stone-shine" />
    </span>
  );
}
