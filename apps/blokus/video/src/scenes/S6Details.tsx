import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Backdrop } from "../Backdrop";
import { GrowingRule } from "../anim";
import { useCopy } from "../lang";
import { FONT_SANS, FONT_SERIF } from "../fonts";
import { INK, INK_FAINT, SAFE } from "../theme";

const ROW_X = 380;
const ROW_W = 1160;

export const S6Details: React.FC = () => {
  const { s6: S6 } = useCopy();
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <Backdrop opacity={0.03} />
      <div style={{ position: "absolute", left: SAFE.x, top: 108 }}>
        <div
          style={{
            fontFamily: FONT_SANS,
            fontWeight: 500,
            fontSize: 26,
            letterSpacing: "0.2em",
            color: INK_FAINT,
          }}
        >
          {S6.label}
        </div>
        <div
          style={{
            marginTop: 20,
            fontFamily: FONT_SERIF,
            fontWeight: 600,
            fontSize: 60,
            color: INK,
          }}
        >
          {S6.title}
        </div>
      </div>

      {S6.rows.map((row, i) => {
        const delay = 40 + i * 20;
        return (
          <div key={row.key} style={{ position: "absolute", left: ROW_X, top: 470 + i * 210, width: ROW_W }}>
            <GrowingRule delay={delay - 10} duration={26} width={ROW_W} />
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 60,
                paddingTop: 38,
                opacity: interpolate(frame, [delay, delay + 22], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                translate: interpolate(frame, [delay, delay + 22], ["0px 18px", "0px 0px"], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div
                style={{
                  width: 300,
                  fontFamily: FONT_SERIF,
                  fontWeight: 600,
                  fontSize: 52,
                  color: INK,
                }}
              >
                {row.key}
              </div>
              <div style={{ fontFamily: FONT_SANS, fontSize: 34, color: INK_FAINT }}>{row.value}</div>
            </div>
            <Sequence from={delay} durationInFrames={12} layout="none">
              <Audio src={staticFile("audio/tick.wav")} volume={0.2} />
            </Sequence>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
