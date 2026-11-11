import { BOARD_BOUNDS, HOLES, TRIANGLES, TRIANGLE_IDS, targetTriangle } from '../../src/game/board';
import type { GameState } from '../../src/game/types';
import { SEATS } from './theme';

interface Point {
  x: number;
  y: number;
}

function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

const SHAPES = Object.fromEntries(
  TRIANGLE_IDS.map((id) => [id, hull(TRIANGLES[id].map((h) => HOLES[h]))]),
) as Record<(typeof TRIANGLE_IDS)[number], Point[]>;
const CENTER = hull(HOLES.map((h) => h).filter((h) => !TRIANGLE_IDS.some((id) => TRIANGLES[id].includes(h.id))));

const pts = (points: Point[]) => points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');

function expand(points: Point[], factor: number): Point[] {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points.map((p) => ({ x: cx + (p.x - cx) * factor, y: cy + (p.y - cy) * factor }));
}

export type Snapshot = {
  board: number[];
  current: number;
  turn: number;
  moves: number;
  home: number[];
  lastPath: number[] | null;
};

export function Board({
  snapshot,
  width = 760,
  height = 760,
  opacity = 1,
}: {
  snapshot: Snapshot;
  width?: number;
  height?: number;
  opacity?: number;
}) {
  const b = BOARD_BOUNDS;
  const pad = 0.7;
  const viewBox = `${(b.minX - pad).toFixed(2)} ${(b.minY - pad).toFixed(2)} ${(b.maxX - b.minX + pad * 2).toFixed(2)} ${(b.maxY - b.minY + pad * 2).toFixed(2)}`;
  const currentTarget = targetTriangle(2, snapshot.current);
  const lastSet = new Set(snapshot.lastPath ?? []);

  return (
    <svg width={width} height={height} viewBox={viewBox} style={{ display: 'block', opacity, overflow: 'visible' }}>
      <defs>
        <radialGradient id="vb-board" gradientUnits="userSpaceOnUse" cx="0" cy="-2" r="9">
          <stop offset="0%" stopColor="#26344a" />
          <stop offset="60%" stopColor="#172233" />
          <stop offset="100%" stopColor="#0d1521" />
        </radialGradient>
        <pattern id="vb-stars" width="0.9" height="0.9" patternUnits="userSpaceOnUse">
          <circle cx="0.18" cy="0.22" r="0.012" fill="#f5e7c8" opacity="0.5" />
          <circle cx="0.7" cy="0.62" r="0.009" fill="#f5e7c8" opacity="0.35" />
        </pattern>
        {SEATS.map((s, i) => (
          <radialGradient key={i} id={`vb-marble-${i}`} cx="36%" cy="30%" r="70%">
            <stop offset="0%" stopColor={s.light} />
            <stop offset="42%" stopColor={s.color} />
            <stop offset="100%" stopColor={s.deep} />
          </radialGradient>
        ))}
      </defs>

      <polygon points={pts(CENTER)} fill="url(#vb-board)" stroke="#c9a24b" strokeOpacity={0.22} strokeWidth={0.025} />
      {TRIANGLE_IDS.map((id) => (
        <polygon
          key={id}
          points={pts(expand(SHAPES[id], 1.035))}
          fill="url(#vb-board)"
          stroke="#c9a24b"
          strokeOpacity={0.22}
          strokeWidth={0.025}
        />
      ))}
      <polygon points={pts(CENTER)} fill="url(#vb-stars)" opacity={0.7} />
      {TRIANGLE_IDS.map((id) => (
        <polygon key={`s-${id}`} points={pts(expand(SHAPES[id], 1.035))} fill="url(#vb-stars)" opacity={0.7} />
      ))}

      {SEATS.slice(0, 2).map((s, seat) => {
        const tri = targetTriangle(2, seat);
        return (
          <polygon
            key={seat}
            points={pts(SHAPES[tri])}
            fill={s.color}
            fillOpacity={tri === currentTarget ? 0.11 : 0.05}
            stroke={s.color}
            strokeOpacity={tri === currentTarget ? 0.55 : 0.25}
            strokeWidth={tri === currentTarget ? 0.035 : 0.02}
            strokeDasharray={tri === currentTarget ? undefined : '0.12 0.1'}
          />
        );
      })}

      {HOLES.map((h) => {
        const owner = snapshot.board[h.id];
        const isLast = lastSet.has(h.id);
        return (
          <g key={h.id} transform={`translate(${h.x.toFixed(3)} ${h.y.toFixed(3)})`}>
            <circle r={0.15} fill="#0a111c" stroke="#c9a24b" strokeOpacity={0.33} strokeWidth={0.022} />
            <circle r={0.115} fill="#05090f" opacity={0.55} />
            {isLast && <circle r={0.22} fill="none" stroke="#f5e7c8" strokeOpacity={0.5} strokeWidth={0.022} />}
            {owner > 0 && (
              <g>
                <ellipse cx={0.03} cy={0.11} rx={0.3} ry={0.13} fill="#000" opacity={0.25} />
                <circle r={0.31} fill={`url(#vb-marble-${owner - 1})`} stroke={SEATS[owner - 1].deep} strokeWidth={0.018} />
                <circle cx={-0.09} cy={-0.1} r={0.085} fill="#fff" opacity={0.42} />
                {SEATS[owner - 1].mark === 'dot' && <circle r={0.07} fill="#fff" opacity={0.9} />}
                {SEATS[owner - 1].mark === 'plus' && (
                  <g stroke="#fff" strokeWidth={0.05} strokeLinecap="round" opacity={0.9}>
                    <line x1={-0.1} y1={0} x2={0.1} y2={0} />
                    <line x1={0} y1={-0.1} x2={0} y2={0.1} />
                  </g>
                )}
                {SEATS[owner - 1].mark === 'ring' && (
                  <circle r={0.08} fill="none" stroke="#fff" strokeWidth={0.045} opacity={0.9} />
                )}
                {SEATS[owner - 1].mark === 'slash' && (
                  <line x1={-0.08} y1={0.08} x2={0.08} y2={-0.08} stroke="#fff" strokeWidth={0.05} opacity={0.9} />
                )}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export type { GameState };
