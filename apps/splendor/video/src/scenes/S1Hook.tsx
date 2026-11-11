import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { GemIcon } from "../board/Gem";
import { EASE_OUT, EASE_SOFT, W, H, withAlpha } from "../theme";

/** a deterministic dust field, so re-renders are identical */
const DUST: Array<[number, number, number, number]> = [
  [0.18, 0.28, 3, 0.2],
  [0.72, 0.18, 2, 1.1],
  [0.81, 0.42, 4, 2.2],
  [0.24, 0.62, 2, 0.7],
  [0.66, 0.71, 3, 1.8],
  [0.42, 0.16, 2, 2.9],
  [0.12, 0.48, 4, 3.6],
  [0.88, 0.66, 2, 0.4],
  [0.35, 0.82, 3, 1.5],
  [0.58, 0.36, 2, 2.5],
  [0.92, 0.22, 3, 3.1],
  [0.48, 0.58, 2, 0.9],
];

const Sparkle: React.FC<{ progress: number; size: number; x: number; y: number }> = ({
  progress,
  size,
  x,
  y,
}) => {
  const s = interpolate(progress, [0, 0.35, 1], [0, 1, 0]);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        translate: "-50% -50%",
        scale: s,
        opacity: s,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          width: 2,
          height: "100%",
          background: "#fff",
          translate: "-50% 0",
          filter: "blur(0.4px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          height: 2,
          width: "100%",
          background: "#fff",
          translate: "0 -50%",
          filter: "blur(0.4px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "38%",
          borderRadius: "50%",
          background: "#fff",
          filter: "blur(2px)",
          opacity: 0.9,
        }}
      />
    </div>
  );
};

/** the cold open: one emerald, a glint, and a bloom into paper */
export const S1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const glow = interpolate(frame, [0, 30, 170, 230], [0, 0.55, 0.55, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const gemScale =
    interpolate(frame, [0, 70], [0.82, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_OUT,
    }) *
    interpolate(frame, [0, 269], [1, 1.035], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const rotate = interpolate(frame, [0, 269], [-7, 5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bloom = interpolate(frame, [188, 238], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_SOFT,
  });
  const paper = interpolate(frame, [220, 258], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_SOFT,
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 46%, #1c2734 0%, #121820 62%, #0d1117 100%)`,
      }}
    >
      {/* dust */}
      {DUST.map(([x, y, size, phase], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x * W,
            top: y * H + Math.sin(t * 0.55 + phase) * 12,
            width: size,
            height: size,
            borderRadius: "50%",
            background: withAlpha("#dcefe6", 0.55),
            opacity: 0.22 + 0.25 * Math.abs(Math.sin(t * 0.4 + phase)),
            filter: "blur(0.6px)",
          }}
        />
      ))}

      {/* emerald glow */}
      <div
        style={{
          position: "absolute",
          left: W / 2 - 430,
          top: H / 2 - 430,
          width: 860,
          height: 860,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${withAlpha("#45b586", 0.42)} 0%, ${withAlpha("#45b586", 0.1)} 42%, rgba(0,0,0,0) 70%)`,
          opacity: glow,
          filter: "blur(6px)",
        }}
      />

      {/* the gem */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            scale: gemScale,
            rotate: `${rotate}deg`,
            filter: "drop-shadow(0 26px 60px rgba(0,0,0,0.55))",
          }}
        >
          <GemIcon color="green" size={350} />
        </div>
      </AbsoluteFill>

      <Sparkle
        progress={interpolate(frame, [36, 70, 108], [0, 1, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
        size={120}
        x={W / 2 + 138}
        y={H / 2 - 142}
      />
      <Sparkle
        progress={interpolate(frame, [78, 108, 142], [0, 1, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
        size={64}
        x={W / 2 - 152}
        y={H / 2 + 88}
      />

      {/* bloom to paper */}
      <div
        style={{
          position: "absolute",
          left: W / 2 - 700,
          top: H / 2 - 700,
          width: 1400,
          height: 1400,
          borderRadius: "50%",
          background: "radial-gradient(circle, #ffffff 0%, #ffffff 42%, rgba(255,255,255,0) 72%)",
          scale: bloom,
          opacity: bloom,
        }}
      />
      <AbsoluteFill style={{ background: "#f2f4f7", opacity: paper }} />
    </AbsoluteFill>
  );
};
