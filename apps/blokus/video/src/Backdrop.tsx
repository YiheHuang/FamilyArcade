import { interpolate, useCurrentFrame } from "remotion";
import { INK, W, H, withAlpha } from "./theme";

/** the paper backdrop: a whisper of the board grid behind every scene */
export const Backdrop: React.FC<{
  opacity: number;
  cell?: number;
  fadeIn?: number;
}> = ({ opacity, cell = 96, fadeIn = 40 }) => {
  const frame = useCurrentFrame();
  const now = interpolate(frame, [0, fadeIn], [0, opacity], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden
    >
      <g stroke={withAlpha(INK, 1)} strokeWidth={1} opacity={now}>
        {Array.from({ length: cols }, (_, i) => (
          <line key={`v${i}`} x1={(i + 1) * cell} y1={0} x2={(i + 1) * cell} y2={H} />
        ))}
        {Array.from({ length: rows }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={(i + 1) * cell} x2={W} y2={(i + 1) * cell} />
        ))}
      </g>
    </svg>
  );
};
