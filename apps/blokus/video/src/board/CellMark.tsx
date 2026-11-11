import { markKind } from "../../../src/ui/marks";
import { INK, withAlpha } from "../theme";

/**
 * The app's colour-blind double coding, reproduced as SVG geometry:
 * dot / plus / ring / slash inside every placed cell (see src/ui/marks.ts).
 */
export const CellMark: React.FC<{
  player: number;
  cx: number;
  cy: number;
  cell: number;
  opacity?: number;
}> = ({ player, cx, cy, cell, opacity = 1 }) => {
  const s = Math.max(1.6, cell * 0.16);
  const stroke = Math.max(1.1, s * 0.4);
  const color = withAlpha(INK, 0.34);
  const common = {
    stroke: color,
    strokeWidth: stroke,
    fill: "none",
    strokeLinecap: "round" as const,
    opacity,
  };

  switch (markKind(player)) {
    case "dot":
      return <circle cx={cx} cy={cy} r={s * 0.46} fill={color} opacity={opacity} />;
    case "plus":
      return (
        <g {...common}>
          <line x1={cx - s} y1={cy} x2={cx + s} y2={cy} />
          <line x1={cx} y1={cy - s} x2={cx} y2={cy + s} />
        </g>
      );
    case "ring":
      return <circle cx={cx} cy={cy} r={s * 0.7} {...common} />;
    default:
      return (
        <g {...common}>
          <line x1={cx - s * 0.66} y1={cy + s * 0.66} x2={cx + s * 0.66} y2={cy - s * 0.66} />
        </g>
      );
  }
};
