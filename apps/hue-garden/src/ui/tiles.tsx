import { useId, type CSSProperties, type ReactNode } from 'react';
import { tileColor, tileShape } from '../game/tiles';
import { colorTheme, shapeName } from './theme';

interface ShapeProps {
  shape: number;
  fill: string;
  accent: string;
  strokeWidth?: number;
}

/** All six courtyard shapes are code-drawn in a [-0.5, 0.5] box. */
export function ShapeGlyph({ shape, fill, accent, strokeWidth = 0 }: ShapeProps) {
  const common = {
    fill,
    stroke: strokeWidth > 0 ? accent : 'none',
    strokeWidth,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  switch (shape) {
    case 0:
      return <circle r={0.3} {...common} />;
    case 1:
      return <path d="M0 -0.33 L0.3 0 L0 0.33 L-0.3 0 Z" {...common} />;
    case 2:
      return (
        <g>
          <path d="M0 -0.34 C0.26 -0.14 0.31 0.1 0.23 0.23 C0.13 0.36 -0.13 0.36 -0.23 0.23 C-0.31 0.1 -0.26 -0.14 0 -0.34 Z" {...common} />
          <path d="M0 -0.22 L0 0.23" fill="none" stroke={accent} strokeWidth={0.025} strokeLinecap="round" opacity={0.65} />
        </g>
      );
    case 3: {
      const points = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 === 0 ? 0.34 : 0.145;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        return `${(Math.cos(a) * r).toFixed(4)},${(Math.sin(a) * r).toFixed(4)}`;
      }).join(' ');
      return <polygon points={points} {...common} />;
    }
    case 4:
      return (
        <path d="M0 -0.34 C0.14 -0.12 0.29 0.04 0.29 0.17 A0.29 0.29 0 1 1 -0.29 0.17 C-0.29 0.04 -0.14 -0.12 0 -0.34 Z" {...common} />
      );
    default:
      return (
        <g>
          {Array.from({ length: 6 }, (_, i) => (
            <ellipse
              key={i}
              cx={0}
              cy={-0.165}
              rx={0.105}
              ry={0.155}
              transform={`rotate(${i * 60})`}
              {...common}
            />
          ))}
          <circle r={0.075} fill={accent} />
        </g>
      );
  }
}

function tileAria(tile: number, lang: 'zh' | 'en'): string {
  const c = colorTheme(tileColor(tile));
  const s = shapeName(tileShape(tile));
  return `${lang === 'zh' ? c.zh : c.en} ${lang === 'zh' ? s.zh : s.en}`;
}

export function TileFace({
  tile,
  size = 56,
  selected = false,
  dimmed = false,
  onClick,
  ariaLabel,
  testId,
  badge,
  className = '',
  style,
}: {
  tile: number;
  size?: number;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  testId?: string;
  badge?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const color = colorTheme(tileColor(tile));
  const shape = tileShape(tile);
  const id = useId().replaceAll(':', '');
  const css = {
    '--tile-color': color.hex,
    '--tile-deep': color.deep,
    '--tile-light': color.light,
    '--tile-ink': color.ink,
    width: size,
    height: size,
    ...style,
  } as CSSProperties;
  const inner = (
    <>
      <svg className="tile__bits" viewBox="-0.5 -0.5 1 1" aria-hidden>
        <defs>
          <radialGradient id={`shine-${id}`} cx="34%" cy="26%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.48" />
            <stop offset="38%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.12" />
          </radialGradient>
        </defs>
        <rect x={-0.5} y={-0.5} width={1} height={1} rx={0.14} fill="var(--tile-color)" />
        <rect x={-0.5} y={-0.5} width={1} height={1} rx={0.14} fill={`url(#shine-${id})`} />
        <rect
          x={-0.44}
          y={-0.44}
          width={0.88}
          height={0.88}
          rx={0.09}
          fill="none"
          stroke="var(--tile-ink)"
          strokeOpacity={0.24}
          strokeWidth={0.015}
        />
        <g transform="translate(0 -0.015) scale(0.92)">
          <ShapeGlyph shape={shape} fill="var(--tile-ink)" accent="var(--tile-deep)" strokeWidth={0.012} />
        </g>
        <circle cx={0.32} cy={0.32} r={0.105} fill="var(--tile-deep)" opacity={0.9} />
        <text
          x={0.32}
          y={0.36}
          textAnchor="middle"
          fontSize={0.13}
          fontFamily="var(--sans)"
          fontWeight={700}
          fill="var(--tile-ink)"
        >
          {color.letter}
        </text>
      </svg>
      {badge}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={`tile${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''} ${className}`.trim()}
        style={css}
        onClick={onClick}
        aria-label={ariaLabel ?? tileAria(tile, 'en')}
        aria-pressed={selected}
        data-testid={testId}
        data-tile-id={tile}
      >
        {inner}
      </button>
    );
  }
  return (
    <span
      className={`tile${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''} ${className}`.trim()}
      style={css}
      aria-label={ariaLabel ?? tileAria(tile, 'en')}
      data-tile-id={tile}
    >
      {inner}
    </span>
  );
}

/** SVG tile for the board, drawn at unit scale. */
export function TileGlyph({
  tile,
  x,
  y,
  opacity = 1,
  ghost = false,
  scale = 0.94,
}: {
  tile: number;
  x: number;
  y: number;
  opacity?: number;
  ghost?: boolean;
  scale?: number;
}) {
  const color = colorTheme(tileColor(tile));
  const shape = tileShape(tile);
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity} pointerEvents="none">
      <rect x={-0.44} y={-0.44} width={0.88} height={0.88} rx={0.11} fill={color.deep} opacity={0.35} transform="translate(0.02 0.05)" />
      <rect x={-0.47} y={-0.47} width={0.94} height={0.94} rx={0.12} fill={`url(#hg-glaze-${color.id})`} stroke={color.deep} strokeWidth={0.02} strokeOpacity={0.7} />
      <rect x={-0.47} y={-0.47} width={0.94} height={0.94} rx={0.12} fill="url(#hg-shine)" />
      <rect x={-0.415} y={-0.415} width={0.83} height={0.83} rx={0.08} fill="none" stroke={color.ink} strokeOpacity={0.22} strokeWidth={0.012} />
      <g transform={`translate(0 -0.012) scale(${scale})`}>
        <ShapeGlyph shape={shape} fill={color.ink} accent={color.deep} strokeWidth={0.012} />
      </g>
      <circle cx={0.31} cy={0.31} r={0.105} fill={color.deep} opacity={0.92} />
      <text x={0.31} y={0.35} textAnchor="middle" fontSize={0.125} fontFamily="sans-serif" fontWeight={700} fill={color.ink}>
        {color.letter}
      </text>
      {ghost && (
        <rect x={-0.49} y={-0.49} width={0.98} height={0.98} rx={0.13} fill="none" stroke="var(--accent, #b08a4f)" strokeWidth={0.04} strokeDasharray="0.12 0.08" />
      )}
    </g>
  );
}

/** Decorative tile row used on the home screen and setup preview. */
export function MiniGarden({ tiles, compact = false }: { tiles: readonly { x: number; y: number; tile: number }[]; compact?: boolean }) {
  const xs = tiles.map((t) => t.x);
  const ys = tiles.map((t) => t.y);
  const minX = Math.min(...xs, 0) - 1;
  const maxX = Math.max(...xs, 0) + 1;
  const minY = Math.min(...ys, 0) - 1;
  const maxY = Math.max(...ys, 0) + 1;
  return (
    <svg
      className={`mini-garden${compact ? ' mini-garden--compact' : ''}`}
      viewBox={`${minX} ${minY} ${maxX - minX + 1} ${maxY - minY + 1}`}
      role="img"
      aria-label="Hue Garden tile courtyard"
    >
      <defs>{glazeDefs()}</defs>
      <rect x={minX} y={minY} width={maxX - minX + 1} height={maxY - minY + 1} fill="url(#hg-paper)" />
      {Array.from({ length: maxY - minY + 2 }, (_, row) =>
        Array.from({ length: maxX - minX + 2 }, (_, col) => (
          <rect
            key={`${row}-${col}`}
            x={minX + col - 0.5}
            y={minY + row - 0.5}
            width={1}
            height={1}
            fill="none"
            stroke="#c9b89f"
            strokeOpacity={0.28}
            strokeWidth={0.02}
          />
        )),
      )}
      {tiles.map((t, i) => (
        <TileGlyph key={i} tile={t.tile} x={t.x} y={t.y} />
      ))}
    </svg>
  );
}

export function glazeDefs() {
  return (
    <>
      <radialGradient id="hg-paper" cx="50%" cy="35%" r="80%">
        <stop offset="0%" stopColor="#fffaf0" />
        <stop offset="100%" stopColor="#efe3d0" />
      </radialGradient>
      <linearGradient id="hg-shine" x1="0" y1="0" x2="0.7" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.38" />
        <stop offset="45%" stopColor="#ffffff" stopOpacity="0.06" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.12" />
      </linearGradient>
      {(['terracotta', 'saffron', 'olive', 'sea', 'indigo', 'plum'] as const).map((id) => {
        const c = colorTheme(['terracotta', 'saffron', 'olive', 'sea', 'indigo', 'plum'].indexOf(id));
        return (
          <linearGradient key={id} id={`hg-glaze-${id}`} x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor={c.light} />
            <stop offset="42%" stopColor={c.hex} />
            <stop offset="100%" stopColor={c.deep} />
          </linearGradient>
        );
      })}
    </>
  );
}

/** A little six-shape legend used in rules and tutorial screens. */
export function ShapeLegend({ lang }: { lang: 'zh' | 'en' }) {
  const c = colorTheme(0);
  return (
    <div className="shape-legend">
      {[0, 1, 2, 3, 4, 5].map((shape) => (
        <span className="shape-legend__item" key={shape}>
          <svg viewBox="-0.5 -0.5 1 1" aria-hidden>
            <ShapeGlyph shape={shape} fill={c.hex} accent={c.deep} />
          </svg>
          {lang === 'zh' ? shapeName(shape).zh : shapeName(shape).en}
        </span>
      ))}
    </div>
  );
}
