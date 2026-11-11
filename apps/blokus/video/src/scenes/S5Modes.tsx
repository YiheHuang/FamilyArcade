import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Backdrop } from "../Backdrop";
import { GrowingRule } from "../anim";
import { useCopy } from "../lang";
import { FONT_SANS, FONT_SERIF } from "../fonts";
import { INK, INK_FAINT, LINE, SAFE } from "../theme";

const CARD_W = 480;
const CARD_IMG_H = 328;
const GAP = 48;
const START_X = (1920 - (CARD_W * 3 + GAP * 2)) / 2;

export const S5Modes: React.FC = () => {
  const { s5: S5 } = useCopy();
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
          {S5.label}
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
          {S5.title}
        </div>
      </div>
      <GrowingRule delay={22} duration={28} width={1600} style={{ position: "absolute", left: SAFE.x, top: 268 }} />

      {S5.cards.map((card, i) => {
        const delay = 34 + i * 13;
        const imgScale = interpolate(frame, [delay, delay + 70], [1.045, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={card.title}
            style={{
              position: "absolute",
              left: START_X + i * (CARD_W + GAP),
              top: 318,
              width: CARD_W,
              opacity: interpolate(frame, [delay, delay + 24], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(frame, [delay, delay + 24], ["0px 30px", "0px 0px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div
              style={{
                border: `1px solid ${LINE}`,
                borderRadius: 14,
                overflow: "hidden",
                background: "#fffdf9",
                boxShadow: "0 18px 44px rgba(31,29,26,0.05)",
              }}
            >
              <div style={{ width: CARD_W, height: CARD_IMG_H, overflow: "hidden" }}>
                <Img
                  src={staticFile(`${S5.shotsDir}/${card.shot}`)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    scale: `${imgScale}`,
                  }}
                />
              </div>
              <div style={{ padding: "20px 22px 22px" }}>
                <div style={{ fontFamily: FONT_SANS, fontWeight: 500, fontSize: 32, color: INK }}>
                  {card.title}
                </div>
                <div style={{ marginTop: 8 }}>
                  {card.lines.map((line) => (
                    <div
                      key={line}
                      style={{ fontFamily: FONT_SANS, fontSize: 23, lineHeight: 1.55, color: INK_FAINT }}
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <Sequence from={delay} durationInFrames={12} layout="none">
              <Audio src={staticFile("audio/tick.wav")} volume={0.26} />
            </Sequence>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
