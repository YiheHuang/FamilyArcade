import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../Backdrop";
import { FadeUp, GrowingRule } from "../anim";
import { Card } from "../board/Card";
import { GemIcon } from "../board/Gem";
import { cardOf, GAME } from "../data";
import { FONT_SANS, FONT_SERIF } from "../fonts";
import { useCopy } from "../lang";
import { ACCENT, ACCENT_100, ACCENT_700, INK, INK_400, INK_500, PAPER, PAPER_200 } from "../theme";

const CARD_W = 480;
const CARD_H = 360;
const XS = [192, 720, 1248];

/** three rules, three cards, no wall of text */
export const S3Rules: React.FC = () => {
  const copy = useCopy();
  const frame = useCurrentFrame();
  const finalChip = interpolate(frame, [205, 225], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Backdrop opacity={0.045} fadeIn={30} />

      <div style={{ position: "absolute", left: XS[0], top: 138, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 34, height: 2, background: ACCENT }} />
        <span
          style={{
            fontFamily: FONT_SANS,
            fontSize: 25,
            fontWeight: 500,
            letterSpacing: "0.16em",
            color: INK_500,
          }}
        >
          {copy.s3.label}
        </span>
      </div>
      <div style={{ position: "absolute", left: XS[0], top: 188 }}>
        <GrowingRule delay={8} duration={26} width={CARD_W * 3 + 96} />
      </div>

      {copy.s3.cards.map((card, i) => (
        <FadeUp key={card.no} delay={15 + i * 45} duration={26} distance={26}>
          <div
            style={{
              position: "absolute",
              left: XS[i],
              top: 250,
              width: CARD_W,
              height: CARD_H,
              borderRadius: 24,
              background: "#fff",
              border: `1px solid ${PAPER_200}`,
              boxShadow: "0 26px 48px -38px rgba(38,48,62,0.45)",
              boxSizing: "border-box",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 30,
                top: 24,
                fontFamily: FONT_SANS,
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "0.22em",
                color: ACCENT_700,
              }}
            >
              {card.no}
            </span>

            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 62,
                height: 112,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              {i === 0 && (
                <>
                  <GemIcon color="green" size={48} />
                  <GemIcon color="blue" size={48} />
                  <GemIcon color="red" size={48} />
                </>
              )}
              {i === 1 && GAME.buy.card && <Card card={cardOf(GAME.buy.card.id)} w={80} />}
              {i === 2 && (
                <div
                  style={{
                    width: 104,
                    height: 104,
                    borderRadius: "50%",
                    background: INK,
                    color: "#ffd98a",
                    display: "grid",
                    placeItems: "center",
                    fontFamily: FONT_SERIF,
                    fontSize: 46,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    boxShadow: "0 10px 24px -14px rgba(38,48,62,0.55)",
                  }}
                >
                  15
                </div>
              )}
            </div>

            <div
              style={{
                position: "absolute",
                left: 30,
                right: 30,
                top: 196,
                textAlign: "center",
                fontFamily: FONT_SANS,
                fontSize: 44,
                fontWeight: 500,
                color: INK,
                letterSpacing: "0.01em",
                lineHeight: 1.15,
              }}
            >
              {card.title}
            </div>
            <div
              style={{
                position: "absolute",
                left: 30,
                right: 30,
                top: 258,
                textAlign: "center",
                fontFamily: FONT_SANS,
                fontSize: 23,
                fontWeight: 400,
                color: INK_500,
                lineHeight: 1.45,
              }}
            >
              {card.line}
            </div>

            {i === 2 && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 314,
                  display: "flex",
                  justifyContent: "center",
                  opacity: finalChip,
                  translate: `0 ${(1 - finalChip) * 8}px`,
                }}
              >
                <span
                  style={{
                    height: 32,
                    padding: "0 14px",
                    borderRadius: 999,
                    background: ACCENT_100,
                    border: `1px solid ${ACCENT}`,
                    color: ACCENT_700,
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  {copy.s3.finalRound}
                </span>
              </div>
            )}
          </div>
        </FadeUp>
      ))}
      <div
        style={{
          position: "absolute",
          left: XS[0],
          top: 706,
          width: CARD_W * 3 + 96,
          textAlign: "center",
          fontFamily: FONT_SANS,
          fontSize: 19,
          color: INK_400,
          letterSpacing: "0.08em",
          opacity: interpolate(frame, [120, 150], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {copy.s3.note}
      </div>
    </AbsoluteFill>
  );
};
