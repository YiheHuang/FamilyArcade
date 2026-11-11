import { useId } from 'react';
import type { Balloon } from '../../src/game/data';

function Pattern({ balloon, clipId }: { balloon: Balloon; clipId: string }) {
  const light = 'rgba(255,253,248,0.72)';
  switch (balloon.pattern) {
    case 'stripes':
      return (
        <g clipPath={`url(#${clipId})`} stroke={light} strokeWidth={5} opacity={0.82}>
          {[16, 26, 36, 46].map((x) => (
            <path key={x} d={`M${x} 0 C${x - 6} 22, ${x + 6} 48, ${x - 3} 78`} fill="none" />
          ))}
        </g>
      );
    case 'dots':
      return (
        <g clipPath={`url(#${clipId})`} fill={light} opacity={0.9}>
          {[18, 34, 50].map((x) =>
            [16, 34, 52].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={4.2} />),
          )}
        </g>
      );
    case 'zigzag':
      return (
        <g clipPath={`url(#${clipId})`} fill="none" stroke={light} strokeWidth={4} opacity={0.84}>
          <path d="M4 22 L18 14 L32 22 L46 14 L60 22" />
          <path d="M4 40 L18 32 L32 40 L46 32 L60 40" />
          <path d="M4 58 L18 50 L32 58 L46 50 L60 58" />
        </g>
      );
    case 'rings':
      return (
        <g clipPath={`url(#${clipId})`} fill="none" stroke={light} strokeWidth={3.4} opacity={0.84}>
          <ellipse cx={32} cy={36} rx={9} ry={13} />
          <ellipse cx={32} cy={36} rx={18} ry={24} />
          <ellipse cx={32} cy={36} rx={27} ry={35} />
        </g>
      );
    case 'diamonds':
      return (
        <g clipPath={`url(#${clipId})`} fill={light} opacity={0.82}>
          {[16, 32, 48].map((x) =>
            [16, 32, 48].map((y) => (
              <rect key={`${x}-${y}`} x={x - 5} y={y - 5} width={10} height={10} transform={`rotate(45 ${x} ${y})`} />
            )),
          )}
        </g>
      );
  }
}

export function BalloonArt({
  balloon,
  size = 100,
  opacity = 1,
}: {
  balloon: Balloon;
  size?: number;
  opacity?: number;
}) {
  const raw = useId();
  const clipId = `vid-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      width={size}
      height={size * 1.36}
      viewBox="0 0 64 88"
      style={{ opacity, display: 'block' }}
      aria-hidden
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M32 5 C16 5 7 18 7 32 C7 46 19 59 32 65 C45 59 57 46 57 32 C57 18 48 5 32 5 Z" />
        </clipPath>
      </defs>
      <path
        d="M32 5 C16 5 7 18 7 32 C7 46 19 59 32 65 C45 59 57 46 57 32 C57 18 48 5 32 5 Z"
        fill={balloon.color}
        stroke={balloon.color}
        strokeWidth={2}
      />
      <Pattern balloon={balloon} clipId={clipId} />
      <ellipse cx={22} cy={20} rx={5.4} ry={10} fill="rgba(255,255,255,0.32)" transform="rotate(-24 22 20)" />
      <path d="M26 64 L27 72 M38 64 L37 72" stroke="#7a6247" strokeWidth={1.6} fill="none" />
      <rect x={25} y={72} width={14} height={10} rx={3} fill="#b98a52" stroke="#6e5536" strokeWidth={1.2} />
      <path d="M25 76.5 H39" stroke="#6e5536" strokeWidth={1} opacity={0.55} />
    </svg>
  );
}
