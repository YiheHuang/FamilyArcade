import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Board } from "../board/Board";
import { Backdrop } from "../Backdrop";
import { FadeWindow } from "../anim";
import { useCopy } from "../lang";
import { DATA, DEMO_FIRST, DEMO_SECOND, diagonalContact } from "../data/game";
import { FONT_SANS, FONT_SERIF } from "../fonts";
import { ACCENT, INK, INK_FAINT, LINE, SAFE, withAlpha } from "../theme";

const CELL = 41;
const BOARD_X = SAFE.x;
const BOARD_Y = 170;
const COL_X = 1020;
const COL_W = 740;

const BEATS = [24, 210, 392];
const END = 564;

/** Three rules, three beats — the board shows exactly what each sentence means. */
export const S2Rules: React.FC = () => {
  const { s2: S2 } = useCopy();
  const frame = useCurrentFrame();
  const contact = diagonalContact();
  const illegal = DATA.demo.illegal;

  const reveal1 = interpolate(frame, [BEATS[0], BEATS[0] + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const reveal2 = interpolate(frame, [BEATS[1] + 4, BEATS[1] + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ring = interpolate(frame, [BEATS[0] + 22, BEATS[0] + 40, BEATS[0] + 84, BEATS[0] + 104], [0, 0.75, 0.75, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ringR = interpolate(frame, [BEATS[0] + 22, BEATS[0] + 104], [0.5, 0.78], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const contactLine =
    interpolate(frame, [BEATS[1] + 30, BEATS[1] + 46], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) *
    interpolate(frame, [BEATS[2] - 6, BEATS[2] + 8], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const ghost = interpolate(frame, [BEATS[2] + 6, BEATS[2] + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const strike = interpolate(frame, [BEATS[2] + 34, BEATS[2] + 56], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const note2 =
    interpolate(frame, [BEATS[1] + 40, BEATS[1] + 56], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) *
    interpolate(frame, [BEATS[2] - 6, BEATS[2] + 8], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const note3 = interpolate(frame, [BEATS[2] + 46, BEATS[2] + 62], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const push = interpolate(frame, [0, END], [1, 1.055], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const secondBeat = frame >= BEATS[1];
  const game = secondBeat ? DEMO_SECOND : DEMO_FIRST;
  const newest = secondBeat ? reveal2 : reveal1;

  return (
    <AbsoluteFill>
      <Backdrop opacity={0.04} />
      <div style={{ position: "absolute", left: BOARD_X, top: BOARD_Y, scale: `${push}` }}>
        <Board
          game={game}
          cell={CELL}
          showLast={newest > 0.6}
          lastMoveProgress={secondBeat ? reveal2 : reveal1}
          rings={[{ x: 0, y: 0, opacity: ring, r: CELL * ringR, width: 2, color: withAlpha(INK, 0.6) }]}
          lines={[
            {
              x1: contact.a[0],
              y1: contact.a[1],
              x2: contact.b[0],
              y2: contact.b[1],
              opacity: contactLine,
              color: withAlpha(ACCENT, 0.95),
              width: 2.4,
            },
          ]}
          ghost={
            frame >= BEATS[2]
              ? {
                  ...DATA.demo.illegal,
                  opacity: ghost,
                  strike,
                }
              : null
          }
        />
      </div>

      {/* diagram annotations, in board cell coordinates */}
      <BoardNote
        text={S2.annotations.contact}
        cell={CELL}
        origin={{ x: BOARD_X, y: BOARD_Y }}
        at={{ x: contact.b[0] + 2.6, y: contact.b[1] - 0.9 }}
        target={{ x: contact.b[0] + 0.5, y: contact.b[1] + 0.5 }}
        opacity={note2}
        scale={push}
        center={{ x: BOARD_X + (20 * CELL) / 2, y: BOARD_Y + (20 * CELL) / 2 }}
      />
      <BoardNote
        text={S2.annotations.edge}
        color="#b0604a"
        cell={CELL}
        origin={{ x: BOARD_X, y: BOARD_Y }}
        at={{ x: illegal.x + 1.8, y: illegal.y + 0.7 }}
        target={{ x: illegal.x + 0.5, y: illegal.y + 0.5 }}
        opacity={note3}
        scale={push}
        center={{ x: BOARD_X + (20 * CELL) / 2, y: BOARD_Y + (20 * CELL) / 2 }}
      />

      {/* text column */}
      <div style={{ position: "absolute", left: COL_X, top: BOARD_Y, width: COL_W }}>
        <div
          style={{
            fontFamily: FONT_SANS,
            fontWeight: 500,
            fontSize: 28,
            letterSpacing: "0.18em",
            color: INK_FAINT,
          }}
        >
          {S2.label}
        </div>
      </div>

      {S2.steps.map((step, i) => (
        <FadeWindow
          key={step.no}
          from={BEATS[i] + 2}
          to={i === 2 ? END : BEATS[i + 1] - 2}
          fade={16}
          style={{ position: "absolute", left: COL_X, top: BOARD_Y + 120, width: COL_W }}
        >
          <div
            style={{
              fontFamily: FONT_SANS,
              fontWeight: 500,
              fontSize: 27,
              letterSpacing: "0.16em",
              color: INK_FAINT,
              marginBottom: 26,
            }}
          >
            {step.no} · {step.key}
          </div>
          <div
            style={{
              fontFamily: FONT_SERIF,
              fontWeight: 600,
              fontSize: 66,
              lineHeight: 1.36,
              color: INK,
            }}
          >
            {step.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
          {step.note ? (
            <div
              style={{
                marginTop: 30,
                fontFamily: FONT_SANS,
                fontWeight: 400,
                fontSize: 32,
                color: INK_FAINT,
              }}
            >
              {step.note}
            </div>
          ) : null}
        </FadeWindow>
      ))}

      <Sequence from={BEATS[0] + 4} durationInFrames={14} layout="none">
        <Audio src={staticFile("audio/place-0.wav")} volume={0.3} />
      </Sequence>
      <Sequence from={BEATS[1] + 10} durationInFrames={14} layout="none">
        <Audio src={staticFile("audio/place-0.wav")} volume={0.3} />
      </Sequence>
      <Sequence from={BEATS[2] + 18} durationInFrames={16} layout="none">
        <Audio src={staticFile("audio/invalid.wav")} volume={0.38} />
      </Sequence>

      {/* beat progress */}
      <div style={{ position: "absolute", left: COL_X, top: 940, width: COL_W, display: "flex", gap: 12 }}>
        {BEATS.map((start, i) => {
          const end = i === 2 ? END : BEATS[i + 1] - 2;
          const fill = interpolate(frame, [start, end], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div key={i} style={{ width: 120, height: 2, background: LINE, position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${fill * 100}%`,
                  background: withAlpha(INK, 0.55),
                }}
              />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** a small diagram label with a hairline leader pointing at a board cell */
const BoardNote: React.FC<{
  text: string;
  cell: number;
  origin: { x: number; y: number };
  at: { x: number; y: number };
  target: { x: number; y: number };
  opacity: number;
  color?: string;
  scale?: number;
  center?: { x: number; y: number };
}> = ({ text, cell, origin, at, target, opacity, color = withAlpha(INK, 0.62), scale = 1, center }) => {
  const c = center ?? { x: origin.x, y: origin.y };
  const sx = (v: number) => c.x + (v - c.x) * scale;
  const sy = (v: number) => c.y + (v - c.y) * scale;
  const px = sx(origin.x + at.x * cell);
  const py = sy(origin.y + at.y * cell);
  const tx = sx(origin.x + target.x * cell);
  const ty = sy(origin.y + target.y * cell);
  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <line x1={px} y1={py} x2={tx} y2={ty} stroke={withAlpha(INK, 0.22)} strokeWidth={1.2} />
        <circle cx={tx} cy={ty} r={3.2} fill={withAlpha(INK, 0.3)} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: px,
          top: py - 16,
          fontFamily: FONT_SANS,
          fontWeight: 400,
          fontSize: 23,
          letterSpacing: "0.08em",
          color,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </div>
  );
};
