import { useMemo, useState } from 'react';
import {
  BOARD_BOUNDS,
  CENTRAL,
  HOLES,
  TRIANGLES,
  TRIANGLE_IDS,
  targetTriangle,
  type TriangleId,
} from '../game/board';
import type { GameState, Move } from '../game/types';
import { seatTheme } from './theme';

interface Point {
  x: number;
  y: number;
}

function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (sorted.length <= 2) return sorted;
  const cross = (o: Point, a: Point, b: Point): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

const SHAPES: Record<TriangleId, Point[]> = Object.fromEntries(
  TRIANGLE_IDS.map((id) => [id, hull(TRIANGLES[id].map((h) => HOLES[h]))]),
) as Record<TriangleId, Point[]>;
const CENTER_SHAPE = hull(CENTRAL.map((h) => HOLES[h]));

function pointsAttr(points: Point[]): string {
  return points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
}

function expand(points: Point[], factor: number): Point[] {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points.map((p) => ({ x: cx + (p.x - cx) * factor, y: cy + (p.y - cy) * factor }));
}

function MarkGlyph({ mark, color }: { mark: string; color: string }) {
  if (mark === 'dot') return <circle r={0.075} fill={color} />;
  if (mark === 'plus') {
    return (
      <g stroke={color} strokeWidth={0.055} strokeLinecap="round">
        <line x1={-0.11} y1={0} x2={0.11} y2={0} />
        <line x1={0} y1={-0.11} x2={0} y2={0.11} />
      </g>
    );
  }
  if (mark === 'ring') return <circle r={0.085} fill="none" stroke={color} strokeWidth={0.05} />;
  return (
    <line
      x1={-0.085}
      y1={0.085}
      x2={0.085}
      y2={-0.085}
      stroke={color}
      strokeWidth={0.055}
      strokeLinecap="round"
    />
  );
}

interface BoardProps {
  state: GameState;
  selected?: number | null;
  legal?: Move[];
  hint?: Move | null;
  interactive?: boolean;
  onSelect?: (hole: number | null) => void;
  onMove?: (move: Move) => void;
  compact?: boolean;
}

export function Board({
  state,
  selected = null,
  legal = [],
  hint = null,
  interactive = true,
  onSelect,
  onMove,
  compact = false,
}: BoardProps) {
  const [hover, setHover] = useState<number | null>(null);
  const bounds = BOARD_BOUNDS;
  const pad = 0.65;
  const viewBox = `${(bounds.minX - pad).toFixed(2)} ${(bounds.minY - pad).toFixed(2)} ${(bounds.maxX - bounds.minX + pad * 2).toFixed(2)} ${(bounds.maxY - bounds.minY + pad * 2).toFixed(2)}`;

  const byTo = useMemo(() => {
    const map = new Map<number, Move>();
    for (const m of legal) if (!map.has(m.to)) map.set(m.to, m);
    return map;
  }, [legal]);

  const currentTarget = targetTriangle(state.config.playerCount, state.current);

  const lastPath = state.lastMove && state.lastMove.kind !== 'pass' ? state.lastMove.path : null;
  const hintPath = hint && hint.kind !== 'pass' ? hint.path : null;
  const hoverMove = hover != null ? byTo.get(hover) : undefined;
  const previewPath = hoverMove && hoverMove.kind === 'jump' ? hoverMove.path : null;

  const onHoleClick = (hole: number): void => {
    if (!interactive) return;
    const own = state.board[hole] === state.current + 1;
    const move = byTo.get(hole);
    if (selected != null) {
      if (move) {
        onMove?.(move);
        return;
      }
      if (own) {
        onSelect?.(hole);
        return;
      }
      onSelect?.(null);
      return;
    }
    if (own) onSelect?.(hole);
  };

  return (
    <svg
      className={`board-svg${compact ? ' board-svg--compact' : ''}`}
      viewBox={viewBox}
      role="group"
      aria-label="Chinese Checkers board"
    >
      <defs>
        <radialGradient id="sl-board" gradientUnits="userSpaceOnUse" cx="0" cy="-2" r="9">
          <stop offset="0%" stopColor="#26344a" />
          <stop offset="60%" stopColor="#172233" />
          <stop offset="100%" stopColor="#0d1521" />
        </radialGradient>
        <radialGradient id="sl-glow" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="7">
          <stop offset="0%" stopColor="#6f8db5" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#6f8db5" stopOpacity="0" />
        </radialGradient>
        <pattern id="sl-stars" width="0.9" height="0.9" patternUnits="userSpaceOnUse">
          <circle cx="0.18" cy="0.22" r="0.012" fill="#f5e7c8" opacity="0.5" />
          <circle cx="0.7" cy="0.62" r="0.009" fill="#f5e7c8" opacity="0.35" />
        </pattern>
        {state.config.seats.map((_, seat) => {
          const th = seatTheme(seat);
          return (
            <radialGradient key={seat} id={`sl-marble-${seat}`} cx="36%" cy="30%" r="70%">
              <stop offset="0%" stopColor={th.light} />
              <stop offset="42%" stopColor={th.color} />
              <stop offset="100%" stopColor={th.deep} />
            </radialGradient>
          );
        })}
      </defs>

      <g className="board-body">
        <polygon points={pointsAttr(CENTER_SHAPE)} fill="url(#sl-board)" stroke="#c9a24b" strokeOpacity="0.18" strokeWidth="0.025" />
        {TRIANGLE_IDS.map((id) => (
          <polygon
            key={id}
            points={pointsAttr(expand(SHAPES[id], 1.035))}
            fill="url(#sl-board)"
            stroke="#c9a24b"
            strokeOpacity="0.18"
            strokeWidth="0.025"
          />
        ))}
        <polygon points={pointsAttr(CENTER_SHAPE)} fill="url(#sl-stars)" opacity="0.7" />
        {TRIANGLE_IDS.map((id) => (
          <polygon key={`stars-${id}`} points={pointsAttr(expand(SHAPES[id], 1.035))} fill="url(#sl-stars)" opacity="0.7" />
        ))}
        <polygon points={pointsAttr(CENTER_SHAPE)} fill="url(#sl-glow)" />
      </g>

      {state.config.seats.map((_, seat) => {
        const th = seatTheme(seat);
        const tri = targetTriangle(state.config.playerCount, seat);
        return (
          <polygon
            key={`target-${seat}`}
            points={pointsAttr(SHAPES[tri])}
            fill={th.color}
            fillOpacity={tri === currentTarget ? 0.1 : 0.05}
            stroke={th.color}
            strokeOpacity={tri === currentTarget ? 0.55 : 0.25}
            strokeWidth={tri === currentTarget ? 0.035 : 0.02}
            strokeDasharray={tri === currentTarget ? undefined : '0.12 0.1'}
            pointerEvents="none"
          />
        );
      })}

      {HOLES.map((h) => {
        const owner = state.board[h.id];
        const isSelected = selected === h.id;
        const isLegal = byTo.has(h.id);
        const isLast = lastPath?.includes(h.id) ?? false;
        const isHint = hintPath?.includes(h.id) ?? false;
        const own = owner === state.current + 1;
        return (
          <g
            key={h.id}
            data-hole={h.id}
            className={`hole${isLegal ? ' is-legal' : ''}${isSelected ? ' is-selected' : ''}`}
            transform={`translate(${h.x.toFixed(3)} ${h.y.toFixed(3)})`}
            onClick={() => onHoleClick(h.id)}
            onMouseEnter={() => setHover(h.id)}
            onMouseLeave={() => setHover((v) => (v === h.id ? null : v))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onHoleClick(h.id);
                return;
              }
              if (e.key.startsWith('Arrow')) {
                e.preventDefault();
                const focusables = Array.from(
                  document.querySelectorAll<SVGGElement>('g.hole[tabindex="0"]'),
                );
                const at = focusables.indexOf(e.currentTarget);
                if (at < 0) return;
                const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
                const next = focusables[(at + delta + focusables.length) % focusables.length];
                next?.focus();
              }
            }}
            role={interactive && (own || isLegal) ? 'button' : undefined}
            tabIndex={interactive && (own || isLegal) ? 0 : -1}
            aria-label={
              owner === 0
                ? `Empty hole ${h.id + 1}${isLegal ? ', legal destination' : ''}`
                : `Hole ${h.id + 1}, ${seatTheme(owner - 1).en} marble`
            }
            style={{ cursor: interactive && (own || isLegal) ? 'pointer' : 'default' }}
          >
            <circle className="hole-hit" r={0.32} fill="transparent" />
            <circle className="hole-base" r={0.15} fill="#0a111c" stroke="#c9a24b" strokeOpacity={isLegal ? 0.75 : 0.32} strokeWidth={0.022} />
            <circle className="hole-inner" r={0.115} fill="#05090f" opacity={0.55} />
            {isLast && <circle className="last-ring" r={0.19} fill="none" stroke="#f5e7c8" strokeOpacity={0.32} strokeWidth={0.018} />}
            {isHint && <circle className="hint-ring" r={0.23} fill="none" stroke="#f5e7c8" strokeOpacity={0.7} strokeWidth={0.022} />}
            {isSelected && <circle className="selected-ring" r={0.39} fill="none" stroke="#f5e7c8" strokeOpacity={0.9} strokeWidth={0.03} />}

            {owner > 0 && (
              <g className="marble">
                <ellipse cx={0.03} cy={0.11} rx={0.3} ry={0.13} fill="#000" opacity={0.22} />
                <circle r={0.31} fill={`url(#sl-marble-${owner - 1})`} stroke={seatTheme(owner - 1).deep} strokeWidth={0.018} />
                <circle cx={-0.09} cy={-0.1} r={0.085} fill="#fff" opacity={0.38} />
                <g opacity={0.88}>
                  <MarkGlyph mark={seatTheme(owner - 1).mark} color="#fff" />
                </g>
              </g>
            )}

            {isLegal && owner === 0 && (
              <g className="legal-dot" pointerEvents="none">
                <circle r={0.105} fill="#f5e7c8" opacity={0.92} />
                <circle r={0.16} fill="none" stroke="#f5e7c8" strokeOpacity={0.28} strokeWidth={0.018} />
              </g>
            )}
          </g>
        );
      })}

      {previewPath && (
        <polyline
          points={previewPath.map((id) => `${HOLES[id].x.toFixed(3)},${HOLES[id].y.toFixed(3)}`).join(' ')}
          fill="none"
          stroke="#f5e7c8"
          strokeOpacity={0.75}
          strokeWidth={0.045}
          strokeDasharray="0.12 0.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}

      {hintPath && (
        <polyline
          points={hintPath.map((id) => `${HOLES[id].x.toFixed(3)},${HOLES[id].y.toFixed(3)}`).join(' ')}
          fill="none"
          stroke="#f5e7c8"
          strokeOpacity={0.6}
          strokeWidth={0.04}
          strokeDasharray="0.16 0.12"
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
