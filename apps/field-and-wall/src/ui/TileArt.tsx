import type { ReactNode } from 'react';
import { localFeatures, tileType } from '../game/tiles';
import type { Rotation } from '../game/types';
import { palette, seatTheme } from './theme';

interface TileArtProps {
  typeId: string;
  rot?: Rotation;
  meeple?: number | null;
  meepleFeature?: number | null;
  showMeeples?: boolean;
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} aria-hidden>
      <rect x={-1.2} y={1} width={2.4} height={6} rx={1} fill={palette.trunk} />
      <circle cx={0} cy={-1} r={5.4} fill={palette.treeDark} />
      <circle cx={-1.8} cy={-2.4} r={4.2} fill={palette.tree} />
      <circle cx={1.7} cy={-2.9} r={3.3} fill={palette.treeLight} opacity={0.8} />
    </g>
  );
}

function Sheep({ x, y, flip = false, s = 1 }: { x: number; y: number; flip?: boolean; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} aria-hidden>
      <ellipse cx={0} cy={0} rx={5.2} ry={3.4} fill="#f6f0df" stroke="#b7ab8c" strokeWidth={0.5} />
      <circle cx={4.4} cy={-1.8} r={2.1} fill="#e8ddc4" stroke="#8d7a56" strokeWidth={0.5} />
      <circle cx={5.1} cy={-2.2} r={0.45} fill="#5d513d" />
      <line x1={-2} y1={2.8} x2={-2} y2={5.4} stroke="#8d7a56" strokeWidth={0.8} />
      <line x1={1.5} y1={2.8} x2={1.5} y2={5.4} stroke="#8d7a56" strokeWidth={0.8} />
    </g>
  );
}

function House({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} aria-hidden>
      <rect x={-4.6} y={-1.5} width={9.2} height={7.5} rx={0.8} fill={palette.cityLight} stroke={palette.wall} strokeWidth={0.7} />
      <path d="M -5.8 -1.4 L 0 -6.2 L 5.8 -1.4 Z" fill={palette.roof} stroke={palette.roofDark} strokeWidth={0.6} />
      <rect x={-1.1} y={2.2} width={2.2} height={3.8} fill={palette.wallDark} opacity={0.75} />
    </g>
  );
}

function Tower({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} aria-hidden>
      <rect x={-4} y={-5} width={8} height={10} rx={1} fill={palette.city} stroke={palette.wall} strokeWidth={0.8} />
      <path d="M -5.2 -5 L 0 -11 L 5.2 -5 Z" fill={palette.roof} stroke={palette.roofDark} strokeWidth={0.6} />
      <rect x={-2.4} y={-2.6} width={1.4} height={2.8} fill={palette.wallDark} opacity={0.55} />
      <rect x={1.0} y={-2.6} width={1.4} height={2.8} fill={palette.wallDark} opacity={0.55} />
    </g>
  );
}

function Crenels({
  x1,
  y1,
  x2,
  y2,
  flip = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  flip?: boolean;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (flip ? -1 : 1);
  const ny = (dx / len) * (flip ? -1 : 1);
  const teeth: ReactNode[] = [];
  const count = 6;
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const cx = x1 + dx * t + nx * 1.8;
    const cy = y1 + dy * t + ny * 1.8;
    teeth.push(
      <rect
        key={i}
        x={cx - 1.8}
        y={cy - 1.8}
        width={3.6}
        height={3.6}
        fill={palette.wall}
        opacity={0.9}
      />,
    );
  }
  return (
    <g aria-hidden>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={palette.wall} strokeWidth={2.6} strokeLinecap="round" />
      {teeth}
    </g>
  );
}

function CityBand({ edge, deep }: { edge: number; deep: boolean }) {
  const d = deep ? 36 : 30;
  if (edge === 0) {
    return (
      <g aria-hidden>
        <path
          d={`M5,3 H95 L${95 - (100 - d) * 0.2},${d} Q${95 - (100 - d) * 0.28},${d + 4} ${95 - (100 - d) * 0.42},${d + 4} H${5 + (100 - d) * 0.42} Q${5 + (100 - d) * 0.28},${d + 4} ${5 + (100 - d) * 0.2},${d} Z`}
          fill={palette.city}
        />
        <Crenels x1={14} y1={d + 3} x2={86} y2={d + 3} />
        <line x1={13} y1={4} x2={17} y2={d} stroke={palette.wall} strokeWidth={1.6} />
        <line x1={87} y1={4} x2={83} y2={d} stroke={palette.wall} strokeWidth={1.6} />
        <g stroke={palette.wall} strokeWidth={0.55} opacity={0.22}>
          <path d="M20 13h22 M52 13h20 M26 21h26 M62 21h12 M17 28h18 M44 28h30" />
        </g>
        <Tower x={18} y={d - 2} s={0.8} />
        <Tower x={82} y={d - 2} s={0.8} />
        <House x={34} y={d - 11} s={0.9} />
        <House x={64} y={d - 12} s={0.75} />
      </g>
    );
  }
  if (edge === 1) {
    return (
      <g aria-hidden>
        <path
          d={`M97,5 V95 L${100 - d},${95 - (95 - d) * 0.2} Q${100 - d - 4},${95 - (95 - d) * 0.28} ${100 - d - 4},${95 - (95 - d) * 0.42} V${5 + (95 - d) * 0.42} Q${100 - d - 4},${5 + (95 - d) * 0.28} ${100 - d},${5 + (95 - d) * 0.2} Z`}
          fill={palette.city}
        />
        <Crenels x1={100 - d - 3} y1={14} x2={100 - d - 3} y2={86} flip />
        <line x1={96} y1={13} x2={100 - d} y2={17} stroke={palette.wall} strokeWidth={1.6} />
        <line x1={96} y1={87} x2={100 - d} y2={83} stroke={palette.wall} strokeWidth={1.6} />
        <g stroke={palette.wall} strokeWidth={0.55} opacity={0.22}>
          <path d="M87 20v22 M79 52v20 M72 26v26 M78 62v12 M71 17v18 M71 44v30" />
        </g>
        <Tower x={100 - d + 2} y={18} s={0.8} />
        <Tower x={100 - d + 2} y={82} s={0.8} />
        <House x={100 - d + 11} y={34} s={0.9} />
        <House x={100 - d + 12} y={64} s={0.75} />
      </g>
    );
  }
  if (edge === 2) {
    return (
      <g aria-hidden>
        <path
          d={`M95,97 H5 L${5 + (100 - d) * 0.2},${100 - d} Q${5 + (100 - d) * 0.28},${100 - d - 4} ${5 + (100 - d) * 0.42},${100 - d - 4} H${95 - (100 - d) * 0.42} Q${95 - (100 - d) * 0.28},${100 - d - 4} ${95 - (100 - d) * 0.2},${100 - d} Z`}
          fill={palette.city}
        />
        <Crenels x1={86} y1={100 - d - 3} x2={14} y2={100 - d - 3} flip />
        <line x1={13} y1={96} x2={17} y2={100 - d} stroke={palette.wall} strokeWidth={1.6} />
        <line x1={87} y1={96} x2={83} y2={100 - d} stroke={palette.wall} strokeWidth={1.6} />
        <g stroke={palette.wall} strokeWidth={0.55} opacity={0.22}>
          <path d="M20 87h22 M52 87h20 M26 79h26 M62 79h12 M17 72h18 M44 72h30" />
        </g>
        <Tower x={18} y={100 - d + 2} s={0.8} />
        <Tower x={82} y={100 - d + 2} s={0.8} />
        <House x={34} y={100 - d + 11} s={0.9} />
        <House x={64} y={100 - d + 12} s={0.75} />
      </g>
    );
  }
  return (
    <g aria-hidden>
      <path
        d={`M3,95 V5 L${d},${5 + (95 - d) * 0.2} Q${d + 4},${5 + (95 - d) * 0.28} ${d + 4},${5 + (95 - d) * 0.42} V${95 - (95 - d) * 0.42} Q${d + 4},${95 - (95 - d) * 0.28} ${d},${95 - (95 - d) * 0.2} Z`}
        fill={palette.city}
      />
      <Crenels x1={d + 3} y1={86} x2={d + 3} y2={14} flip />
      <line x1={4} y1={13} x2={d} y2={17} stroke={palette.wall} strokeWidth={1.6} />
      <line x1={4} y1={87} x2={d} y2={83} stroke={palette.wall} strokeWidth={1.6} />
      <g stroke={palette.wall} strokeWidth={0.55} opacity={0.22}>
        <path d="M13 20v22 M21 52v20 M28 26v26 M21 62v12 M29 17v18 M29 44v30" />
      </g>
      <Tower x={d - 2} y={18} s={0.8} />
      <Tower x={d - 2} y={82} s={0.8} />
      <House x={d - 11} y={34} s={0.9} />
      <House x={d - 12} y={64} s={0.75} />
    </g>
  );
}

function CentralKeep() {
  return (
    <g aria-hidden>
      <rect x={31} y={31} width={38} height={38} rx={7} fill={palette.city} stroke={palette.wall} strokeWidth={1.2} />
      <rect x={35} y={35} width={30} height={30} rx={4} fill={palette.cityLight} opacity={0.65} />
      <rect x={40} y={40} width={20} height={18} rx={1.5} fill={palette.city} stroke={palette.wall} strokeWidth={1} />
      <path d="M 39 40 L 50 32 L 61 40 Z" fill={palette.roof} stroke={palette.roofDark} strokeWidth={0.7} />
      <rect x={45} y={24} width={10} height={17} rx={1} fill={palette.cityLight} stroke={palette.wall} strokeWidth={0.9} />
      <path d="M 43.5 24 L 50 17.5 L 56.5 24 Z" fill={palette.roofDark} />
      <circle cx={50} cy={29} r={1.1} fill={palette.gold} />
      <rect x={47} y={44} width={6} height={9} rx={2.5} fill={palette.wallDark} opacity={0.6} />
      <line x1={40} y1={40} x2={44} y2={40} stroke={palette.wall} strokeWidth={1} />
      <line x1={56} y1={40} x2={60} y2={40} stroke={palette.wall} strokeWidth={1} />
    </g>
  );
}

function roadStroke(path: string, width: number, color: string, dash?: string) {
  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dash}
    />
  );
}

function RoadPaths({ edges, centerRoad }: { edges: string[]; centerRoad: boolean }) {
  const roads: number[] = [];
  edges.forEach((edge, i) => {
    if (edge === 'road') roads.push(i);
  });
  const mid: Record<number, [number, number]> = {
    0: [50, 0],
    1: [100, 50],
    2: [50, 100],
    3: [0, 50],
  };
  const paths: string[] = [];
  if (centerRoad) {
    if (roads.length === 2) {
      const [a, b] = roads;
      if ((a + 2) % 4 === b) {
        const [x1, y1] = mid[a];
        const [x2, y2] = mid[b];
        paths.push(`M${x1},${y1} L${x2},${y2}`);
      } else {
        const [x1, y1] = mid[a];
        const [x2, y2] = mid[b];
        paths.push(`M${x1},${y1} Q50,50 ${x2},${y2}`);
      }
    } else if (roads.length === 1) {
      const [x, y] = mid[roads[0]];
      paths.push(`M${x},${y} L${50},${50}`);
    } else {
      for (const edge of roads) {
        const [x, y] = mid[edge];
        paths.push(`M${x},${y} L50,50`);
      }
    }
  } else {
    for (const edge of roads) {
      const [x, y] = mid[edge];
      const dx = 50 - x;
      const dy = 50 - y;
      paths.push(`M${x},${y} L${x + dx * 0.58},${y + dy * 0.58}`);
    }
  }
  return (
    <g aria-hidden>
      {paths.map((d, i) => (
        <g key={i}>
          {roadStroke(d, 15, palette.roadEdge)}
          {roadStroke(d, 10.5, palette.road)}
          {roadStroke(d, 1.5, palette.roadDash, '4 7')}
        </g>
      ))}
      {centerRoad && roads.length >= 3 && (
        <g>
          <circle cx={50} cy={50} r={5.6} fill={palette.cityLight} stroke={palette.wall} strokeWidth={1.2} />
          <circle cx={50} cy={50} r={2.4} fill={palette.roadEdge} opacity={0.5} />
        </g>
      )}
      {!centerRoad &&
        roads.map((edge) => {
          const [x, y] = mid[edge];
          const dx = (50 - x) * 0.58;
          const dy = (50 - y) * 0.58;
          return <House key={edge} x={x + dx} y={y + dy} s={0.9} />;
        })}
    </g>
  );
}

function Monastery() {
  return (
    <g aria-hidden>
      <rect x={26} y={26} width={48} height={48} rx={4} fill="none" stroke={palette.wall} strokeWidth={1.1} strokeDasharray="6 4" opacity={0.8} />
      <path d="M 26 40 H 34 M 66 40 H 74 M 26 60 H 34 M 66 60 H 74" stroke={palette.wall} strokeWidth={1.4} opacity={0.55} />
      <rect x={37} y={42} width={24} height={18} rx={1.5} fill={palette.monastery} stroke={palette.wall} strokeWidth={1} />
      <path d="M 35 42 L 49 32 L 63 42 Z" fill={palette.roof} stroke={palette.roofDark} strokeWidth={0.7} />
      <rect x={45} y={25} width={9} height={18} rx={1} fill={palette.monastery} stroke={palette.wall} strokeWidth={0.9} />
      <path d="M 43.5 25 L 49.5 18.5 L 55.5 25 Z" fill={palette.roofDark} />
      <circle cx={49.5} cy={31} r={1.2} fill={palette.gold} stroke={palette.goldDeep} strokeWidth={0.4} />
      <path d="M 46 60 V 54 Q 49.5 50 53 54 V 60 Z" fill={palette.wallDark} opacity={0.6} />
      <Tree x={30} y={30} s={0.62} />
      <Tree x={70} y={31} s={0.55} />
      <Tree x={69} y={69} s={0.62} />
      <Tree x={30} y={68} s={0.5} />
      <Sheep x={60} y={69} s={0.7} flip />
    </g>
  );
}

function FieldDetails({ typeId }: { typeId: string }) {
  const type = tileType(typeId);
  const fieldEdges = type.edges.map((e, i) => (e === 'field' ? i : -1)).filter((i) => i >= 0);
  const nothing = type.center === 'field' && fieldEdges.length === 4;
  if (nothing) {
    return (
      <g aria-hidden>
        <Tree x={18} y={24} s={0.9} />
        <Tree x={80} y={20} s={0.72} />
        <Tree x={22} y={78} s={0.65} />
        <Tree x={78} y={80} s={0.9} />
        <Sheep x={44} y={58} s={0.85} />
        <Sheep x={60} y={43} s={0.7} flip />
        <path d="M 8 66 Q 22 62 34 66" fill="none" stroke={palette.wall} strokeWidth={1.2} opacity={0.45} strokeDasharray="3 3" />
      </g>
    );
  }
  const corners: { x: number; y: number; a: number; b: number }[] = [
    { x: 16, y: 16, a: 0, b: 3 },
    { x: 84, y: 16, a: 0, b: 1 },
    { x: 16, y: 84, a: 2, b: 3 },
    { x: 84, y: 84, a: 2, b: 1 },
  ];
  return (
    <g aria-hidden>
      {corners.map((corner) => {
        if (type.edges[corner.a] !== 'field' || type.edges[corner.b] !== 'field') return null;
        return <Tree key={`${corner.x}-${corner.y}`} x={corner.x} y={corner.y} s={0.7} />;
      })}
    </g>
  );
}

function Mark({ seat }: { seat: number }) {
  const theme = seatTheme(seat);
  const color = '#f8f1e0';
  if (theme.mark === 'dot') return <circle cx={0} cy={0.6} r={1.5} fill={color} />;
  if (theme.mark === 'plus') {
    return (
      <g stroke={color} strokeWidth={1.2} strokeLinecap="round">
        <line x1={-2.2} y1={0.6} x2={2.2} y2={0.6} />
        <line x1={0} y1={-1.6} x2={0} y2={2.8} />
      </g>
    );
  }
  if (theme.mark === 'ring') {
    return <circle cx={0} cy={0.6} r={1.9} fill="none" stroke={color} strokeWidth={1.1} />;
  }
  return (
    <line x1={-2} y1={2} x2={2} y2={-1} stroke={color} strokeWidth={1.2} strokeLinecap="round" />
  );
}

export function Meeple({ seat, x, y, scale = 1.42 }: { seat: number; x: number; y: number; scale?: number }) {
  const theme = seatTheme(seat);
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} aria-hidden>
      <ellipse cx={0.4} cy={8.6} rx={7.2} ry={2.2} fill={palette.shadow} opacity={0.4} />
      <circle cx={0} cy={-6.1} r={3.7} fill={theme.color} stroke={theme.deep} strokeWidth={0.9} />
      <path
        d="M -3.2 -2.7 L -7.8 0.9 L -6.5 3.6 L -3.0 0.9 L -3.0 8.0 L -1.1 8.0 L 0 4.7 L 1.1 8.0 L 3.0 8.0 L 3.0 0.9 L 6.5 3.6 L 7.8 0.9 L 3.2 -2.7 Z"
        fill={theme.color}
        stroke={theme.deep}
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
      <ellipse cx={-1.2} cy={-7.1} rx={1.1} ry={0.8} fill="#fff" opacity={0.32} />
      <Mark seat={seat} />
    </g>
  );
}

export function TileArt({ typeId, rot = 0, meeple = null, meepleFeature = null, showMeeples = true }: TileArtProps) {
  let type;
  try {
    type = tileType(typeId);
  } catch {
    return (
      <g>
        <rect width={100} height={100} fill="#ddd" stroke="#999" />
      </g>
    );
  }
  const edges = type.edges;
  const center = type.center;
  const features = localFeatures(typeId, rot);
  const local = meeple != null && meepleFeature != null ? features[meepleFeature] : null;

  return (
    <g>
      <rect x={0.6} y={0.6} width={98.8} height={98.8} rx={4} fill={palette.field} />
      <g transform={`rotate(${rot * 90} 50 50)`}>
        <rect x={2} y={2} width={96} height={96} rx={3} fill={palette.fieldLight} />
        {/* paper-map contour lines */}
        <g stroke={palette.fieldDark} strokeWidth={0.75} fill="none" opacity={0.42}>
          <path d="M 2 20 Q 22 14 42 20 T 98 18" />
          <path d="M 2 47 Q 26 41 48 47 T 98 45" />
          <path d="M 2 75 Q 24 69 46 75 T 98 73" />
        </g>
        <g stroke={palette.fieldDark} strokeWidth={0.6} strokeLinecap="round" opacity={0.45}>
          <path d="M 11 12 l 2 -4 M 15 12 l 1 -3" />
          <path d="M 83 57 l 2 -4 M 87 57 l 1 -3" />
          <path d="M 13 55 l 2 -4 M 17 55 l 1 -3" />
          <path d="M 62 88 l 2 -4 M 66 88 l 1 -3" />
        </g>
        <FieldDetails typeId={typeId} />
        <RoadPaths edges={edges} centerRoad={center === 'road'} />
        {edges.map((edge, i) =>
          edge === 'city' ? <CityBand key={i} edge={i} deep={center === 'city'} /> : null,
        )}
        {center === 'city' && <CentralKeep />}
        {center === 'monastery' && <Monastery />}
      </g>
      <rect x={0.9} y={0.9} width={98.2} height={98.2} rx={4} fill="none" stroke={palette.wall} strokeWidth={1.6} opacity={0.88} />
      <rect x={3} y={3} width={94} height={94} rx={2.5} fill="none" stroke="#fff9e8" strokeWidth={0.7} opacity={0.35} />
      {showMeeples && meeple != null && local && (
        <Meeple seat={meeple} x={local.anchor.x * 100} y={local.anchor.y * 100} />
      )}
    </g>
  );
}

export function TilePreview({
  typeId,
  rot = 0,
  size = 120,
}: {
  typeId: string;
  rot?: Rotation;
  size?: number;
}) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="tile-preview" role="img" aria-label={`${typeId} tile`}>
      <TileArt typeId={typeId} rot={rot} />
    </svg>
  );
}
