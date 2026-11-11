import { interpolate, useCurrentFrame } from "remotion";
import { H, INK, W, withAlpha } from "./theme";

/**
 * The paper backdrop: a whisper of the game's tier-1 dot pattern, a very soft
 * vignette and nothing else. It keeps the frame from feeling like a flat slide.
 */
export const Backdrop: React.FC<{
  opacity?: number;
  cell?: number;
  fadeIn?: number;
  vignette?: number;
}> = ({ opacity = 0.05, cell = 48, fadeIn = 40, vignette = 0.035 }) => {
  const frame = useCurrentFrame();
  const now = interpolate(frame, [0, fadeIn], [0, opacity], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ position: "absolute", inset: 0 }}
        aria-hidden
      >
        <defs>
          <pattern id="promo-dots" width={cell} height={cell} patternUnits="userSpaceOnUse">
            <circle cx={1.1} cy={1.1} r={1.1} fill={withAlpha(INK, 1)} />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#promo-dots)" opacity={now} />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at 50% 45%, rgba(255,255,255,0) 48%, ${withAlpha(INK, vignette)} 100%)`,
          pointerEvents: "none",
        }}
      />
    </>
  );
};
