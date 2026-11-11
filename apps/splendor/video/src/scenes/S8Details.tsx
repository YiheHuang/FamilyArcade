import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Backdrop } from "../Backdrop";
import { FadeUp, GrowingRule } from "../anim";
import { FONT_SANS } from "../fonts";
import { useCopy, useLang } from "../lang";
import { ACCENT, INK, INK_400, INK_500, PAPER, PAPER_100, PAPER_200 } from "../theme";

const XS = [100, 700, 1300];
const W = 520;
const H = 410;

const POSITION: Record<string, string> = {
  "ai.png": "50% 50%",
  "settings.png": "50% 43%",
  "replay.png": "50% 58%",
};

/** three real UI details, framed like editorial cards */
export const S8Details: React.FC = () => {
  const copy = useCopy();
  const lang = useLang();
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Backdrop opacity={0.04} fadeIn={24} />

      <div style={{ position: "absolute", left: XS[0], top: 126, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 34, height: 2, background: ACCENT }} />
        <span style={{ fontFamily: FONT_SANS, fontSize: 25, fontWeight: 500, letterSpacing: "0.16em", color: INK_500 }}>
          {copy.s8.label}
        </span>
      </div>
      <div style={{ position: "absolute", left: XS[0], top: 176 }}>
        <GrowingRule delay={8} duration={26} width={W * 3 + 160} />
      </div>

      {copy.s8.cards.map((card, i) => (
        <FadeUp key={card.title} delay={12 + i * 36} duration={24} distance={22}>
          <div
            style={{
              position: "absolute",
              left: XS[i],
              top: 248,
              width: W,
              height: H,
              borderRadius: 24,
              background: "#fff",
              border: `1px solid ${PAPER_200}`,
              boxShadow: "0 28px 50px -42px rgba(38,48,62,0.45)",
              padding: 16,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                height: 252,
                borderRadius: 14,
                overflow: "hidden",
                background: PAPER_100,
                border: `1px solid ${PAPER_200}`,
              }}
            >
              <Img
                src={staticFile(`shots/${lang}/${card.shot}`)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: POSITION[card.shot] ?? "50% 50%",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginTop: 18,
              }}
            >
              <span style={{ fontFamily: FONT_SANS, fontSize: 27, fontWeight: 600, color: INK }}>{card.title}</span>
              <span
                style={{
                  fontFamily: FONT_SANS,
                  fontSize: 15,
                  fontWeight: 500,
                  color: INK_400,
                  letterSpacing: "0.12em",
                }}
              >
                0{i + 1}
              </span>
            </div>
            <div style={{ marginTop: 6, fontFamily: FONT_SANS, fontSize: 18, color: INK_500 }}>{card.line}</div>
          </div>
        </FadeUp>
      ))}

      <div
        style={{
          position: "absolute",
          left: XS[0],
          top: 700,
          width: W * 3 + 160,
          textAlign: "center",
          fontFamily: FONT_SANS,
          fontSize: 18,
          color: INK_400,
          letterSpacing: "0.08em",
          opacity: interpolate(frame, [110, 140], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {copy.s9.facts}
      </div>
    </AbsoluteFill>
  );
};
