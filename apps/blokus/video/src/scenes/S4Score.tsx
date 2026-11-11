import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Board } from "../board/Board";
import { Backdrop } from "../Backdrop";
import { FadeUp, GrowingRule } from "../anim";
import { useCopy } from "../lang";
import { DATA, SNAPSHOTS } from "../data/game";
import { FONT_SANS, FONT_SERIF } from "../fonts";
import { INK, INK_FAINT } from "../theme";

const CELL = 44;
const COL_X = 1090;
const COL_W = 670;

export const S4Score: React.FC = () => {
  const { s4: S4 } = useCopy();
  const frame = useCurrentFrame();
  const dim = interpolate(frame, [0, 20], [0.5, 0.18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <Backdrop opacity={0.03} />
      <div style={{ position: "absolute", left: 150, top: 96, opacity: dim, scale: "1.018" }}>
        <Board game={SNAPSHOTS[DATA.moves.length]} cell={CELL} showLast={false} />
      </div>

      <div style={{ position: "absolute", left: COL_X, top: 176, width: COL_W }}>
        <FadeUp delay={8} duration={26}>
          <div style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 62, color: INK }}>
            {S4.title}
          </div>
        </FadeUp>
        <GrowingRule delay={22} duration={26} width={COL_W} style={{ marginTop: 30 }} />
      </div>

      <div style={{ position: "absolute", left: COL_X, top: 322, width: COL_W }}>
        <FadeUp delay={26} duration={30} distance={34} style={{ display: "flex", alignItems: "baseline", gap: 34 }}>
          <div
            style={{
              fontFamily: FONT_SERIF,
              fontWeight: 600,
              fontSize: 138,
              lineHeight: 1,
              color: INK,
              letterSpacing: "-0.02em",
            }}
          >
            {S4.bonus}
          </div>
          <div style={{ fontFamily: FONT_SANS, fontSize: 34, lineHeight: 1.5, color: INK_FAINT }}>
            {S4.bonusText.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        </FadeUp>

        <FadeUp delay={86} duration={30} distance={34} style={{ display: "flex", alignItems: "baseline", gap: 34, marginTop: 54 }}>
          <div
            style={{
              fontFamily: FONT_SERIF,
              fontWeight: 600,
              fontSize: 138,
              lineHeight: 1,
              color: INK,
              letterSpacing: "-0.02em",
            }}
          >
            {S4.extra}
          </div>
          <div style={{ fontFamily: FONT_SANS, fontSize: 34, lineHeight: 1.5, color: INK_FAINT }}>
            {S4.extraText.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        </FadeUp>

        <FadeUp delay={150} duration={28} style={{ marginTop: 56 }}>
          <div style={{ fontFamily: FONT_SANS, fontSize: 30, color: INK_FAINT, letterSpacing: "0.06em" }}>
            {S4.note}
          </div>
          <div style={{ marginTop: 14, fontFamily: FONT_SANS, fontSize: 25, color: INK_FAINT }}>
            {S4.endNote}
          </div>
        </FadeUp>
      </div>

      <Sequence from={32} durationInFrames={40} layout="none">
        <Audio src={staticFile("audio/ding-15.wav")} volume={0.42} />
      </Sequence>
      <Sequence from={92} durationInFrames={40} layout="none">
        <Audio src={staticFile("audio/ding-20.wav")} volume={0.42} />
      </Sequence>
    </AbsoluteFill>
  );
};
