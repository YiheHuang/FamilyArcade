import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Backdrop } from "../Backdrop";
import { FadeUp } from "../anim";
import { MarkGlyph } from "../board/MarkGlyph";
import { useCopy } from "../lang";
import { FONT_SANS, FONT_SERIF } from "../fonts";
import { INK, INK_FAINT, PALETTE } from "../theme";

export const S7End: React.FC = () => {
  const { s7: S7 } = useCopy();
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <Backdrop opacity={0.04} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <FadeUp delay={8} duration={30} distance={34}>
          <div
            style={{
              fontFamily: FONT_SERIF,
              fontWeight: 600,
              fontSize: 176,
              lineHeight: 1,
              letterSpacing: "-0.012em",
              color: INK,
              textAlign: "center",
            }}
          >
            {S7.brand}
          </div>
        </FadeUp>

        <FadeUp delay={24} duration={28} distance={18} style={{ marginTop: 26 }}>
          <div
            style={{
              fontFamily: FONT_SANS,
              fontWeight: 500,
              fontSize: 40,
              letterSpacing: "0.44em",
              paddingLeft: "0.44em",
              color: INK,
              textAlign: "center",
            }}
          >
            {S7.subtitle}
          </div>
        </FadeUp>

        <div style={{ display: "flex", gap: 30, marginTop: 54 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                opacity: interpolate(frame, [56 + i * 8, 72 + i * 8], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                translate: interpolate(frame, [56 + i * 8, 72 + i * 8], ["0px 8px", "0px 0px"], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <MarkGlyph player={i} size={13} color={PALETTE[i]} />
            </div>
          ))}
        </div>

        <FadeUp delay={104} duration={26} style={{ marginTop: 58 }}>
          <div style={{ fontFamily: FONT_SANS, fontSize: 30, color: INK_FAINT, letterSpacing: "0.04em" }}>
            {S7.facts}
          </div>
        </FadeUp>
      </AbsoluteFill>

      <Sequence from={324} durationInFrames={60} layout="none">
        <Audio src={staticFile("audio/chime.wav")} volume={0.6} />
      </Sequence>
    </AbsoluteFill>
  );
};
