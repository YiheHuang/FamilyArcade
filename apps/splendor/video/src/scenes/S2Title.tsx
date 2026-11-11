import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../Backdrop";
import { FadeUp, GrowingRule } from "../anim";
import { Table } from "../board/Table";
import { GAME } from "../data";
import { FONT_SANS, FONT_SERIF } from "../fonts";
import { useCopy, useLang } from "../lang";
import { ACCENT, INK, INK_400, INK_500, PAPER, SIZE } from "../theme";
import { GemIcon } from "../board/Gem";

const GEMS = ["white", "blue", "green", "red", "black", "gold"] as const;

/** the wordmark over a quiet, defocused table */
export const S2Title: React.FC = () => {
  const copy = useCopy();
  const lang = useLang();
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Backdrop opacity={0.05} fadeIn={30} />
      <Table state={GAME.wide} copy={copy} lang={lang} showPlayers={false} opacity={0.14} blur={6} />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 48%, rgba(242,244,247,0.25) 0%, rgba(242,244,247,0.82) 46%, rgba(242,244,247,0.96) 72%)",
        }}
      />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 40 }}>
        <FadeUp delay={10} duration={28} distance={30}>
          <div
            style={{
              fontFamily: FONT_SERIF,
              fontWeight: 600,
              fontSize: SIZE.hero,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: INK,
              textAlign: "center",
            }}
          >
            {copy.s2.title}
          </div>
        </FadeUp>

        <div style={{ display: "flex", gap: 14, marginTop: 34, height: 34, alignItems: "center" }}>
          {GEMS.map((color, i) => {
            const opacity = interpolate(frame, [26 + i * 6, 42 + i * 6], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const s = interpolate(frame, [26 + i * 6, 46 + i * 6], [0.5, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div key={color} style={{ opacity, scale: s, display: "flex" }}>
                <GemIcon color={color} size={30} />
              </div>
            );
          })}
        </div>

        <FadeUp delay={40} duration={26} distance={16} style={{ marginTop: 22 }}>
          <div
            style={{
              fontFamily: FONT_SANS,
              fontWeight: 500,
              fontSize: lang === "zh" ? 38 : 30,
              letterSpacing: lang === "zh" ? "0.32em" : "0.42em",
              paddingLeft: lang === "zh" ? "0.32em" : "0.42em",
              color: INK_500,
              textAlign: "center",
            }}
          >
            {copy.s2.subtitle}
          </div>
        </FadeUp>

        <div style={{ marginTop: 30 }}>
          <GrowingRule delay={54} duration={26} width={170} color={ACCENT} />
        </div>

        <FadeUp delay={66} duration={24} distance={12} style={{ marginTop: 24 }}>
          <div
            style={{
              fontFamily: FONT_SANS,
              fontWeight: 400,
              fontSize: SIZE.small,
              letterSpacing: "0.08em",
              color: INK_400,
            }}
          >
            {copy.s2.spec}
          </div>
        </FadeUp>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
