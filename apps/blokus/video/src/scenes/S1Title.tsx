import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../Backdrop";
import { FadeUp } from "../anim";
import { useCopy } from "../lang";
import { FONT_SANS, FONT_SERIF } from "../fonts";
import { MarkGlyph } from "../board/MarkGlyph";
import { INK, INK_FAINT, PALETTE, SAFE, SIZE, withAlpha } from "../theme";

/** The wordmark over paper; the four player marks nod to the colour-blind coding. */
export const S1Title: React.FC = () => {
  const { s1: S1 } = useCopy();
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <Backdrop opacity={0.045} fadeIn={50} />

      {/* the four marks sit at the corners of the safe area */}
      {[0, 1, 2, 3].map((i) => {
        const op = interpolate(frame, [56 + i * 9, 76 + i * 9], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const positions = [
          { left: SAFE.x, top: SAFE.y },
          { right: SAFE.x, top: SAFE.y },
          { right: SAFE.x, bottom: SAFE.y },
          { left: SAFE.x, bottom: SAFE.y },
        ];
        return (
          <div key={i} style={{ position: "absolute", ...positions[i], opacity: op }}>
            <MarkGlyph player={i} size={15} color={PALETTE[i]} />
          </div>
        );
      })}

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <FadeUp delay={12} duration={40} distance={44}>
          <div
            style={{
              fontFamily: FONT_SERIF,
              fontWeight: 600,
              fontSize: SIZE.hero,
              lineHeight: 1,
              letterSpacing: "-0.012em",
              color: INK,
              textAlign: "center",
            }}
          >
            {S1.brand}
          </div>
        </FadeUp>

        <FadeUp delay={30} duration={30} distance={22} style={{ marginTop: 34 }}>
          <div
            style={{
              fontFamily: FONT_SANS,
              fontWeight: 500,
              fontSize: 42,
              letterSpacing: "0.42em",
              paddingLeft: "0.42em",
              color: INK,
            }}
          >
            {S1.subtitle}
          </div>
        </FadeUp>

        <FadeUp delay={46} duration={30} distance={18} style={{ marginTop: 26 }}>
          <div
            style={{
              fontFamily: FONT_SANS,
              fontWeight: 400,
              fontSize: SIZE.small,
              letterSpacing: "0.06em",
              color: INK_FAINT,
            }}
          >
            {S1.tag}
          </div>
        </FadeUp>
      </AbsoluteFill>

      {/* a soft paper vignette keeps the eye on the mark */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, rgba(250,247,242,0) 55%, ${withAlpha(
            "#1f1d1a",
            0.035,
          )} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
