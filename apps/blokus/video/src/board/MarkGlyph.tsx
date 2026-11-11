import { markKind } from "../../../src/ui/marks";

/**
 * A standalone color-blind mark (dot / plus / ring / slash) at an arbitrary
 * size — used as a quiet signature on the title and end cards.
 */
export const MarkGlyph: React.FC<{
  player: number;
  size: number;
  color: string;
  opacity?: number;
}> = ({ player, size, color, opacity = 1 }) => {
  const s = size;
  const stroke = Math.max(1.6, s * 0.34);
  const box = s * 2.8;
  const c = box / 2;

  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} style={{ overflow: "visible", opacity }}>
      {(() => {
        switch (markKind(player)) {
          case "dot":
            return <circle cx={c} cy={c} r={s * 0.46} fill={color} />;
          case "plus":
            return (
              <g stroke={color} strokeWidth={stroke} strokeLinecap="round">
                <line x1={c - s} y1={c} x2={c + s} y2={c} />
                <line x1={c} y1={c - s} x2={c} y2={c + s} />
              </g>
            );
          case "ring":
            return (
              <circle
                cx={c}
                cy={c}
                r={s * 0.7}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
              />
            );
          default:
            return (
              <g stroke={color} strokeWidth={stroke} strokeLinecap="round">
                <line x1={c - s * 0.66} y1={c + s * 0.66} x2={c + s * 0.66} y2={c - s * 0.66} />
              </g>
            );
        }
      })()}
    </svg>
  );
};
