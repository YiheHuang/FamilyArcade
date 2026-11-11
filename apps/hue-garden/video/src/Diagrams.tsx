import { COLORS, SHAPES, SHAPE_NAME } from './theme';
import { Tile } from './TileBoard';

export function TileSvg({ tile, size, opacity = 1 }: { tile: number; size: number; opacity?: number }) {
  const color = COLORS[Math.floor(tile / 6)] ?? COLORS[0];
  const shape = tile % 6;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-0.56 -0.56 1.12 1.12"
      style={{ display: 'block', opacity, filter: 'drop-shadow(0 10px 16px rgba(48,35,20,.22))' }}
    >
      <defs>
        {COLORS.map((c) => (
          <linearGradient key={c.id} id={`glaze-${c.id}`} x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor={c.light} />
            <stop offset="42%" stopColor={c.hex} />
            <stop offset="100%" stopColor={c.deep} />
          </linearGradient>
        ))}
      </defs>
      <Tile tile={tile} x={0} y={0} />
      <title>{`${color.en} ${SHAPE_NAME[SHAPES[shape]]?.en ?? ''}`}</title>
    </svg>
  );
}

export function TileStrip({ tiles, size = 84 }: { tiles: number[]; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      {tiles.map((tile, i) => (
        <TileSvg key={`${tile}-${i}`} tile={tile} size={size} />
      ))}
    </div>
  );
}
