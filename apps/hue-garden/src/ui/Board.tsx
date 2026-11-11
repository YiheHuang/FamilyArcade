import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Move, MoveScore, PlacedTile } from '../game/types';
import { Button, type T } from './components';
import { glazeDefs, TileGlyph } from './tiles';

export interface StagedPlay {
  move: Extract<Move, { kind: 'play' }>;
  score: MoveScore;
}

interface BoardProps {
  board: PlacedTile[];
  legalCells?: { x: number; y: number }[];
  staged?: StagedPlay | null;
  hint?: Extract<Move, { kind: 'play' }> | null;
  lastMove?: Move | null;
  interactive?: boolean;
  onCellClick?: (cell: { x: number; y: number }, hasTile: boolean) => void;
  t: T;
  compact?: boolean;
}

interface ViewState {
  cx: number;
  cy: number;
  zoom: number;
}

function boardSignature(board: readonly PlacedTile[]): string {
  if (board.length === 0) return 'empty';
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of board) {
    minX = Math.min(minX, t.x);
    maxX = Math.max(maxX, t.x);
    minY = Math.min(minY, t.y);
    maxY = Math.max(maxY, t.y);
  }
  return `${board.length}:${minX},${maxX},${minY},${maxY}`;
}

export function Board({
  board,
  legalCells = [],
  staged = null,
  hint = null,
  lastMove = null,
  interactive = true,
  onCellClick,
  t,
  compact = false,
}: BoardProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [view, setView] = useState<ViewState>({ cx: 0.5, cy: 0.5, zoom: 1 });

  const bounds = useMemo(() => {
    const points = [...board];
    if (staged) for (const p of staged.move.placements) points.push(p);
    if (hint) for (const p of hint.placements) points.push(p);
    if (points.length === 0) return { minX: -3, maxX: 3, minY: -3, maxY: 3 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    return { minX, maxX, minY, maxY };
  }, [board, staged, hint]);

  const baseSpan = Math.max(bounds.maxX - bounds.minX + 4.2, bounds.maxY - bounds.minY + 4.2, 8.5);
  const span = baseSpan / view.zoom;
  const signature = boardSignature(board);

  useEffect(() => {
    setView({
      cx: (bounds.minX + bounds.maxX) / 2,
      cy: (bounds.minY + bounds.maxY) / 2,
      zoom: 1,
    });
    // Auto-fit only when the courtyard actually grows or a new game begins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const viewBox = `${(view.cx - span / 2).toFixed(3)} ${(view.cy - span / 2).toFixed(3)} ${span.toFixed(3)} ${span.toFixed(3)}`;

  const lastCells = useMemo(() => {
    if (!lastMove || lastMove.kind !== 'play') return new Set<string>();
    return new Set(lastMove.placements.map((p) => `${p.x},${p.y}`));
  }, [lastMove]);

  const hintSet = useMemo(() => {
    if (!hint) return new Set<string>();
    return new Set(hint.placements.map((p) => `${p.x},${p.y}`));
  }, [hint]);

  const cells = useMemo(() => {
    const x0 = bounds.minX - 2;
    const x1 = bounds.maxX + 2;
    const y0 = bounds.minY - 2;
    const y1 = bounds.maxY + 2;
    const out: { x: number; y: number }[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) out.push({ x, y });
    }
    return out;
  }, [bounds]);

  const onZoom = (factor: number): void => {
    setView((prev) => {
      const next = Math.min(3, Math.max(0.55, prev.zoom * factor));
      return { ...prev, zoom: next };
    });
  };

  const fit = (): void => {
    setView({
      cx: (bounds.minX + bounds.maxX) / 2,
      cy: (bounds.minY + bounds.maxY) / 2,
      zoom: 1,
    });
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!interactive) return;
    const target = event.target as Element;
    if (target.closest('.cell-action')) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      cx: view.cx,
      cy: view.cy,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current;
    if (!drag || !svgRef.current) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    suppressClick.current = true;
    const rect = svgRef.current.getBoundingClientRect();
    const unit = span / Math.max(1, rect.width);
    setView((prev) => ({
      ...prev,
      cx: drag.cx - dx * unit,
      cy: drag.cy - dy * unit,
    }));
  };

  const onPointerUp = (): void => {
    dragRef.current = null;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 60);
  };

  const clickCell = (cell: { x: number; y: number }, hasTile: boolean): void => {
    if (suppressClick.current) return;
    if (!interactive) return;
    onCellClick?.(cell, hasTile);
  };

  return (
    <div className={`board-wrap${compact ? ' board-wrap--compact' : ''}`}>
      <svg
        ref={svgRef}
        className="board-svg"
        viewBox={viewBox}
        role="group"
        aria-label={t('game.boardLabel')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          {glazeDefs()}
          <pattern id="hg-grout" width="1" height="1" patternUnits="userSpaceOnUse">
            <rect width="1" height="1" fill="#efe4d3" />
            <rect x="0.04" y="0.04" width="0.92" height="0.92" rx="0.08" fill="#f8f1e4" />
            <rect x="0.04" y="0.04" width="0.92" height="0.92" rx="0.08" fill="none" stroke="#d8c7ae" strokeWidth="0.012" />
          </pattern>
          <radialGradient id="hg-board-wash" cx="50%" cy="38%" r="75%">
            <stop offset="0%" stopColor="#fffaf1" stopOpacity="0.92" />
            <stop offset="72%" stopColor="#f3e9d8" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#eadcc5" stopOpacity="0.4" />
          </radialGradient>
        </defs>

        <rect
          x={bounds.minX - 2.5}
          y={bounds.minY - 2.5}
          width={bounds.maxX - bounds.minX + 5}
          height={bounds.maxY - bounds.minY + 5}
          rx={0.6}
          fill="url(#hg-board-wash)"
        />
        {cells.map((cell) => {
          const hasTile = board.some((t) => t.x === cell.x && t.y === cell.y);
          return (
            <rect
              key={`c-${cell.x}-${cell.y}`}
              x={cell.x - 0.5}
              y={cell.y - 0.5}
              width={1}
              height={1}
              fill="url(#hg-grout)"
              opacity={0.72}
              onClick={() => clickCell(cell, hasTile)}
              className="board-cell"
            />
          );
        })}

        {/* Scored lines from the staged play. */}
        {staged &&
          staged.score.lines.map((line, i) => {
            const minX = Math.min(line.from.x, line.to.x) - 0.56;
            const maxX = Math.max(line.from.x, line.to.x) + 0.56;
            const minY = Math.min(line.from.y, line.to.y) - 0.56;
            const maxY = Math.max(line.from.y, line.to.y) + 0.56;
            return (
              <g key={`line-${i}`} pointerEvents="none">
                <rect
                  x={minX}
                  y={minY}
                  width={maxX - minX}
                  height={maxY - minY}
                  rx={0.24}
                  fill={line.bloom ? 'rgba(176,138,79,0.14)' : 'rgba(176,138,79,0.06)'}
                  stroke="#b08a4f"
                  strokeOpacity={line.bloom ? 0.85 : 0.5}
                  strokeWidth={0.045}
                  strokeDasharray="0.18 0.12"
                />
                <text
                  x={(minX + maxX) / 2}
                  y={minY - 0.12}
                  textAnchor="middle"
                  fontSize={0.26}
                  fontFamily="serif"
                  fontWeight={700}
                  fill="#8a6a34"
                >
                  +{line.points}
                </text>
              </g>
            );
          })}

        {board.map((t, i) => (
          <g key={`tile-${t.x}-${t.y}-${i}`} className="board-tile">
            <TileGlyph tile={t.tile} x={t.x} y={t.y} />
            {(lastCells.has(`${t.x},${t.y}`) || hintSet.has(`${t.x},${t.y}`)) && (
              <rect
                x={t.x - 0.49}
                y={t.y - 0.49}
                width={0.98}
                height={0.98}
                rx={0.13}
                fill="none"
                stroke={hintSet.has(`${t.x},${t.y}`) ? '#b08a4f' : '#f8f1e4'}
                strokeWidth={0.035}
                strokeOpacity={0.85}
                strokeDasharray={hintSet.has(`${t.x},${t.y}`) ? '0.12 0.08' : undefined}
                pointerEvents="none"
              />
            )}
            {interactive && (
              <rect
                x={t.x - 0.5}
                y={t.y - 0.5}
                width={1}
                height={1}
                fill="transparent"
                className="cell-action"
                onClick={(e) => {
                  e.stopPropagation();
                  clickCell({ x: t.x, y: t.y }, true);
                }}
              />
            )}
          </g>
        ))}

        {/* Staged ghost tiles. */}
        {staged?.move.placements.map((p) => (
          <g key={`ghost-${p.x}-${p.y}`} opacity={0.86} pointerEvents="none">
            <TileGlyph tile={p.tile} x={p.x} y={p.y} ghost />
          </g>
        ))}
        {hint?.placements.map((p) => (
          <g key={`hint-${p.x}-${p.y}`} opacity={0.5} pointerEvents="none">
            <TileGlyph tile={p.tile} x={p.x} y={p.y} ghost />
          </g>
        ))}

        {legalCells.map((cell) => {
          const label = `${t('game.cellEmpty', { x: cell.x, y: cell.y })} · ${t('game.legalHint')}`;
          return (
            <g
              key={`legal-${cell.x}-${cell.y}`}
              className="cell-action legal-cell"
              transform={`translate(${cell.x} ${cell.y})`}
              role="button"
              tabIndex={interactive ? 0 : -1}
              aria-label={label}
              onClick={(e) => {
                e.stopPropagation();
                clickCell(cell, false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  clickCell(cell, false);
                }
              }}
            >
              <circle r={0.34} fill="transparent" />
              <circle r={0.13} fill="#b08a4f" opacity={0.95} />
              <circle r={0.21} fill="none" stroke="#b08a4f" strokeOpacity={0.36} strokeWidth={0.025} />
            </g>
          );
        })}
      </svg>

      <div className="board-tools" role="group" aria-label={t('game.boardLabel')}>
        <Button variant="ghost" onClick={() => onZoom(1.22)} ariaLabel={t('game.zoomIn')} testId="board-zoom-in">
          +
        </Button>
        <Button variant="ghost" onClick={() => onZoom(1 / 1.22)} ariaLabel={t('game.zoomOut')} testId="board-zoom-out">
          −
        </Button>
        <Button variant="ghost" onClick={fit} ariaLabel={t('game.fit')} testId="board-fit">
          ⤢
        </Button>
      </div>
    </div>
  );
}
