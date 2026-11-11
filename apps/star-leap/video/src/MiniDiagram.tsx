import { SEATS } from './theme';

function Hole({ x, y, color, r = 12 }: { x: number; y: number; color?: string; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#0a111c" stroke="#c9a24b" strokeOpacity={0.38} strokeWidth={1.5} />
      {color && <circle cx={x} cy={y} r={r - 2} fill={color} />}
    </g>
  );
}

export function StepDiagram() {
  return (
    <svg viewBox="0 0 300 120" width="100%" height="100%">
      {[30, 90, 150, 210, 270].map((x) => (
        <Hole key={x} x={x} y={60} color={x === 30 ? SEATS[0].color : undefined} />
      ))}
      <path d="M48 60 H72" stroke="#b08a4f" strokeWidth={2.5} strokeDasharray="4 4" />
      <path d="M72 60 l-6 -5 v10 z" fill="#b08a4f" />
    </svg>
  );
}

export function JumpDiagram() {
  return (
    <svg viewBox="0 0 300 120" width="100%" height="100%">
      {[30, 90, 150, 210, 270].map((x) => (
        <Hole key={x} x={x} y={60} color={x === 30 ? SEATS[0].color : x === 90 ? SEATS[1].color : undefined} />
      ))}
      <path d="M30 38 Q90 2 150 38" fill="none" stroke="#b08a4f" strokeWidth={2.5} strokeDasharray="5 4" />
      <path d="M150 38 l-7 -5 l1 9 z" fill="#b08a4f" />
    </svg>
  );
}

export function HomeDiagram() {
  const rows = [1, 2, 3, 4];
  const holes: { x: number; y: number; filled: boolean }[] = [];
  rows.forEach((count, row) => {
    for (let col = 0; col < count; col++) {
      holes.push({ x: 150 + (col - (count - 1) / 2) * 34, y: 24 + row * 22, filled: !(row === 3 && col === 2) });
    }
  });
  return (
    <svg viewBox="0 0 300 120" width="100%" height="100%">
      {holes.map((h, i) => (
        <Hole key={i} x={h.x} y={h.y} color={h.filled ? SEATS[0].color : undefined} r={10} />
      ))}
      <circle cx={150 + (2 - 1.5) * 34} cy={24 + 3 * 22} r={16} fill="none" stroke="#b08a4f" strokeWidth={2} strokeDasharray="4 3" />
    </svg>
  );
}
