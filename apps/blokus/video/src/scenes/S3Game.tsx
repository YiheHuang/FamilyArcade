import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Board } from "../board/Board";
import { Backdrop } from "../Backdrop";
import { useCopy } from "../lang";
import { DATA, SNAPSHOTS } from "../data/game";
import { FONT_SANS, FONT_SERIF } from "../fonts";
import { INK, INK_FAINT, LINE, PALETTE, withAlpha } from "../theme";

const CELL = 44;
const BOARD_X = 150;
const BOARD_Y = 96;
const COL_X = 1090;
const COL_W = 670;
const START = 10;
const STEP = 28;
/** the four corner openings are already on the board when the scene cuts in */
const BASE = 4;

export const S3Game: React.FC = () => {
  const { s3: S3 } = useCopy();
  const frame = useCurrentFrame();
  const elapsed = Math.max(0, frame - START);
  const idx = Math.min(DATA.moves.length - BASE, Math.floor(elapsed / STEP));
  const since = frame - (START + Math.max(0, idx - 1) * STEP);
  const reveal = interpolate(since, [0, 9], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const snap = SNAPSHOTS[BASE + idx];
  const scores = snap.scores();
  const lastSeat = idx > 0 ? DATA.moves[BASE + idx - 1].p : -1;
  const push = interpolate(frame, [0, 648], [1, 1.018], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <Backdrop opacity={0.035} />
      <div style={{ position: "absolute", left: BOARD_X, top: BOARD_Y, scale: `${push}` }}>
        <Board
          game={snap}
          cell={CELL}
          lastMoveProgress={idx > 0 ? reveal : undefined}
          showLast={idx > 0 && reveal > 0.55}
        />
      </div>

      <div style={{ position: "absolute", left: COL_X, top: 168, width: COL_W }}>
        <div
          style={{
            fontFamily: FONT_SANS,
            fontWeight: 500,
            fontSize: 26,
            letterSpacing: "0.2em",
            color: INK_FAINT,
          }}
        >
          {S3.label}
        </div>
        <div
          style={{
            marginTop: 22,
            fontFamily: FONT_SERIF,
            fontWeight: 600,
            fontSize: 62,
            lineHeight: 1.2,
            color: INK,
          }}
        >
          {S3.title}
        </div>
        <div style={{ marginTop: 18, fontFamily: FONT_SANS, fontSize: 34, color: INK_FAINT }}>{S3.sub}</div>
      </div>

      {/* running scores */}
      <div style={{ position: "absolute", left: COL_X, top: 452, width: COL_W }}>
        {scores.map((score, seat) => {
          const isMover = seat === lastSeat;
          const bump = isMover
            ? interpolate(since, [0, 8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
            : 0;
          return (
            <div
              key={seat}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                height: 84,
                borderTop: `1px solid ${LINE}`,
                borderBottom: seat === scores.length - 1 ? `1px solid ${LINE}` : undefined,
                position: "relative",
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: PALETTE[seat],
                  flex: "none",
                }}
              />
              <span style={{ fontFamily: FONT_SANS, fontWeight: 500, fontSize: 34, color: INK }}>
                {S3.players[seat]}
              </span>
              <div style={{ flex: 1 }} />
              <span
                style={{
                  fontFamily: FONT_SERIF,
                  fontWeight: 600,
                  fontSize: 50,
                  fontVariantNumeric: "tabular-nums",
                  color: withAlpha(INK, 1 - bump * 0.45),
                  translate: `0px ${bump * 4}px`,
                }}
              >
                {score.total}
              </span>
            </div>
          );
        })}
      </div>

      {/* one tick per real move, pitched by seat */}
      {DATA.moves.slice(BASE).map((mv, i) => (
        <Sequence key={i} from={START + i * STEP} durationInFrames={16} layout="none">
          <Audio src={staticFile(`audio/place-${mv.p}.wav`)} volume={0.28} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
