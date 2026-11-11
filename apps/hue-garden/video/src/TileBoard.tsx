import type { PlacedTile } from '../../src/game/types';
import { COLORS, SHAPES } from './theme';

function shape(shapeIndex: number, fill: string, accent: string) {
  const common = { fill, stroke: accent, strokeWidth: 0.012, strokeLinejoin: 'round' as const };
  switch (shapeIndex) {
    case 0:
      return <circle r={0.29} {...common} />;
    case 1:
      return <path d="M0 -0.33 L0.3 0 L0 0.33 L-0.3 0 Z" {...common} />;
    case 2:
      return <path d="M0 -0.34 C0.26 -0.14 0.31 0.1 0.23 0.23 C0.13 0.36 -0.13 0.36 -0.23 0.23 C-0.31 0.1 -0.26 -0.14 0 -0.34 Z" {...common} />;
    case 3: {
      const points = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 === 0 ? 0.34 : 0.145;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        return `${(Math.cos(a) * r).toFixed(4)},${(Math.sin(a) * r).toFixed(4)}`;
      }).join(' ');
      return <polygon points={points} {...common} />;
    }
    case 4:
      return <path d="M0 -0.34 C0.14 -0.12 0.29 0.04 0.29 0.17 A0.29 0.29 0 1 1 -0.29 0.17 C-0.29 0.04 -0.14 -0.12 0 -0.34 Z" {...common} />;
    default:
      return (
        <g>
          {Array.from({ length: 6 }, (_, i) => (
            <ellipse key={i} cx={0} cy={-0.165} rx={0.105} ry={0.155} transform={`rotate(${i * 60})`} {...common} />
          ))}
          <circle r={0.075} fill={accent} />
        </g>
      );
  }
}

export function Tile({
  tile,
  x,
  y,
  opacity = 1,
  scale = 0.94,
}: {
  tile: number;
  x: number;
  y: number;
  opacity?: number;
  scale?: number;
}) {
  const color = COLORS[Math.floor(tile / 6)] ?? COLORS[0];
  const shapeIndex = tile % 6;
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      <rect x={-0.45} y={-0.45} width={0.9} height={0.9} rx={0.1} fill={color.deep} opacity={0.28} transform="translate(0.025 0.05)" />
      <rect x={-0.47} y={-0.47} width={0.94} height={0.94} rx={0.12} fill={`url(#glaze-${color.id})`} stroke={color.deep} strokeWidth={0.018} />
      <rect x={-0.415} y={-0.415} width={0.83} height={0.83} rx={0.08} fill="none" stroke={color.ink} strokeOpacity={0.22} strokeWidth={0.012} />
      <g transform={`translate(0 -0.012) scale(${scale})`}>{shape(shapeIndex, color.ink, color.deep)}</g>
      <circle cx={0.31} cy={0.31} r={0.105} fill={color.deep} opacity={0.92} />
      <text x={0.31} y={0.35} textAnchor="middle" fontSize={0.125} fontFamily="sans-serif" fontWeight={700} fill={color.ink}>
        {color.letter}
      </text>
    </g>
  );
}

export interface Snapshot {
  board: PlacedTile[];
  scores: number[];
  blooms: number[];
  current: number;
  turn: number;
  moves: number;
}

export function Board({
  snapshot,
  width,
  height,
  highlight = [],
}: {
  snapshot: Snapshot;
  width: number;
  height: number;
  highlight?: { x: number; y: number }[];
}) {
  const xs = snapshot.board.map((t) => t.x);
  const ys = snapshot.board.map((t) => t.y);
  const minX = Math.min(...xs, -2) - 1.2;
  const maxX = Math.max(...xs, 2) + 1.2;
  const minY = Math.min(...ys, -2) - 1.2;
  const maxY = Math.max(...ys, 2) + 1.2;
  const span = Math.max(maxX - minX, maxY - minY, 10);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const viewBox = `${cx - span / 2} ${cy - span / 2} ${span} ${span}`;
  const highlighted = new Set(highlight.map((p) => `${p.x},${p.y}`));
  return (
    <svg width={width} height={height} viewBox={viewBox} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        {COLORS.map((c) => (
          <linearGradient key={c.id} id={`glaze-${c.id}`} x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor={c.light} />
            <stop offset="42%" stopColor={c.hex} />
            <stop offset="100%" stopColor={c.deep} />
          </linearGradient>
        ))}
        <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" fill="#efe4d3" />
          <rect x={0.035} y={0.035} width={0.93} height={0.93} rx={0.08} fill="#f8f1e4" />
          <rect x={0.035} y={0.035} width={0.93} height={0.93} rx={0.08} fill="none" stroke="#d8c7ae" strokeWidth={0.012} />
        </pattern>
        <radialGradient id="wash" cx="50%" cy="38%" r="75%">
          <stop offset="0%" stopColor="#fffaf1" stopOpacity={0.95} />
          <stop offset="72%" stopColor="#f3e9d8" stopOpacity={0.7} />
          <stop offset="100%" stopColor="#eadcc5" stopOpacity={0.35} />
        </radialGradient>
      </defs>
      <rect x={cx - span / 2} y={cy - span / 2} width={span} height={span} rx={0.6} fill="url(#wash)" />
      {Array.from({ length: Math.ceil(span) + 2 }, (_, row) =>
        Array.from({ length: Math.ceil(span) + 2 }, (_, col) => {
          const x = Math.floor(cx - span / 2) + col - 1;
          const y = Math.floor(cy - span / 2) + row - 1;
          return <rect key={`${x}-${y}`} x={x - 0.5} y={y - 0.5} width={1} height={1} fill="url(#grid)" opacity={0.7} />;
        }),
      )}
      {snapshot.board.map((t, i) => (
        <g key={`${t.x}-${t.y}-${i}`}>
          {highlighted.has(`${t.x},${t.y}`) && (
            <rect x={t.x - 0.5} y={t.y - 0.5} width={1} height={1} rx={0.12} fill="none" stroke="#b08a4f" strokeWidth={0.06} strokeDasharray="0.12 0.08" />
          )}
          <Tile tile={t.tile} x={t.x} y={t.y} />
        </g>
      ))}
    </svg>
  );
}

export { SHAPES };
