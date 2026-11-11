import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../Backdrop";
import { FadeUp } from "../anim";
import { FONT_SANS, FONT_SERIF } from "../fonts";
import { useCopy } from "../lang";
import { ACCENT, INK, INK_400, INK_500, PAPER } from "../theme";
import { GemIcon } from "../board/Gem";

const GEMS = ["white", "blue", "green", "red", "black", "gold"] as const;

/** the closing card: wordmark, one line, three facts */
export const S9End: React.FC = () => {
  const copy = useCopy();
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [200, 224], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, opacity: fade }}>
      <Backdrop opacity={0.035} fadeIn={26} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 820,
          background: "radial-gradient(ellipse at 50% 38%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 65%)",
        }}
      />

      <AbsoluteFill style={{ alignItems: "center", paddingTop: 232 }}>
        <div style={{ display: "flex", gap: 13, height: 32, alignItems: "center" }}>
          {GEMS.map((color, i) => {
            const opacity = interpolate(frame, [10 + i * 4, 24 + i * 4], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div key={color} style={{ opacity, display: "flex" }}>
                <GemIcon color={color} size={28} />
              </div>
            );
          })}
        </div>

        <FadeUp delay={14} duration={26} distance={26} style={{ marginTop: 20 }}>
          <div
            style={{
              fontFamily: FONT_SERIF,
              fontWeight: 600,
              fontSize: 122,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: INK,
            }}
          >
            {copy.s9.title}
          </div>
        </FadeUp>

        <FadeUp delay={24} duration={24} distance={12} style={{ marginTop: 18 }}>
          <div
            style={{
              fontFamily: FONT_SANS,
              fontWeight: 500,
              fontSize: 30,
              letterSpacing: "0.38em",
              paddingLeft: "0.38em",
              color: INK_500,
            }}
          >
            {copy.s9.family}
          </div>
        </FadeUp>

        <div style={{ marginTop: 30, width: 170, height: 1, background: ACCENT, opacity: interpolate(frame, [30, 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }} />

        <FadeUp delay={40} duration={26} distance={14} style={{ marginTop: 30 }}>
          <div
            style={{
              fontFamily: FONT_SERIF,
              fontWeight: 600,
              fontSize: 44,
              color: INK,
              letterSpacing: "0.01em",
              textAlign: "center",
              maxWidth: 1400,
            }}
          >
            {copy.s9.tagline}
          </div>
        </FadeUp>

        <FadeUp delay={56} duration={22} distance={10} style={{ marginTop: 42 }}>
          <div
            style={{
              fontFamily: FONT_SANS,
              fontSize: 24,
              letterSpacing: "0.08em",
              color: INK_400,
            }}
          >
            {copy.s9.facts}
          </div>
        </FadeUp>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
