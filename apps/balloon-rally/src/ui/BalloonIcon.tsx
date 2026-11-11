import { useId } from 'react';
import type { Balloon } from '../game/data';

function Pattern({ balloon, patternId }: { balloon: Balloon; patternId: string }) {
  const light = balloon.light;
  switch (balloon.pattern) {
    case 'stripes':
      return (
        <g clipPath={`url(#${patternId})`} stroke={light} strokeWidth={4} opacity={0.85}>
          {[14, 23, 32, 41, 50].map((x) => (
            <path key={x} d={`M${x} 2 C${x - 4} 20, ${x + 4} 44, ${x - 2} 68`} fill="none" />
          ))}
        </g>
      );
    case 'dots':
      return (
        <g clipPath={`url(#${patternId})`} fill={light} opacity={0.9}>
          {[18, 32, 46].map((x) =>
            [18, 32, 46].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={3.4} />),
          )}
        </g>
      );
    case 'zigzag':
      return (
        <g clipPath={`url(#${patternId})`} fill="none" stroke={light} strokeWidth={3.2} opacity={0.9}>
          <path d="M8 24 L18 18 L28 24 L38 18 L48 24 L58 18" />
          <path d="M8 40 L18 34 L28 40 L38 34 L48 40 L58 34" />
          <path d="M8 56 L18 50 L28 56 L38 50 L48 56 L58 50" />
        </g>
      );
    case 'rings':
      return (
        <g clipPath={`url(#${patternId})`} fill="none" stroke={light} strokeWidth={3} opacity={0.85}>
          <ellipse cx={32} cy={34} rx={8} ry={11} />
          <ellipse cx={32} cy={34} rx={16} ry={21} />
          <ellipse cx={32} cy={34} rx={24} ry={31} />
        </g>
      );
    case 'diamonds':
      return (
        <g clipPath={`url(#${patternId})`} fill={light} opacity={0.85}>
          {[16, 32, 48].map((x) =>
            [16, 32, 48].map((y) => (
              <rect
                key={`${x}-${y}`}
                x={x - 4}
                y={y - 4}
                width={8}
                height={8}
                transform={`rotate(45 ${x} ${y})`}
              />
            )),
          )}
        </g>
      );
  }
}

export function BalloonIcon({
  balloon,
  size = 48,
  label,
  className = '',
}: {
  balloon: Balloon;
  size?: number;
  label?: string;
  className?: string;
}) {
  const raw = useId();
  const patternId = `bp-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      className={`balloon-icon ${className}`}
      width={size}
      height={size * 1.35}
      viewBox="0 0 64 88"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {label && <title>{label}</title>}
      <defs>
        <clipPath id={patternId}>
          <path d="M32 5 C16 5 7 18 7 32 C7 46 19 59 32 65 C45 59 57 46 57 32 C57 18 48 5 32 5 Z" />
        </clipPath>
      </defs>
      <path
        d="M32 5 C16 5 7 18 7 32 C7 46 19 59 32 65 C45 59 57 46 57 32 C57 18 48 5 32 5 Z"
        fill={balloon.color}
        stroke={balloon.color}
        strokeWidth={2}
      />
      <Pattern balloon={balloon} patternId={patternId} />
      <ellipse cx={22} cy={20} rx={5} ry={9} fill="rgba(255,255,255,0.34)" transform="rotate(-24 22 20)" />
      <path
        d="M32 65 C16 5 48 5 32 65"
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth={1.2}
      />
      <path d="M26 64 L27 72 M38 64 L37 72" stroke="#7a6247" strokeWidth={1.4} fill="none" />
      <rect x={25} y={72} width={14} height={10} rx={3} fill="#b98a52" stroke="#6e5536" strokeWidth={1.2} />
      <path d="M25 76.5 H39" stroke="#6e5536" strokeWidth={1} opacity={0.6} />
    </svg>
  );
}
