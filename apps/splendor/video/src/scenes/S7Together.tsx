import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Backdrop } from "../Backdrop";
import { Table } from "../board/Table";
import { GAME } from "../data";
import { FONT_SANS, FONT_SERIF } from "../fonts";
import { useCopy, useLang } from "../lang";
import {
  ACCENT,
  ACCENT_100,
  INK,
  INK_400,
  INK_500,
  PAPER,
  PAPER_200,
  withAlpha,
} from "../theme";
import shotsJson from "../data/shots.json";

const SHOTS = shotsJson as unknown as Record<
  "zh" | "en",
  { code: string; url: string; ip: string }
>;

const PHONE = { x: 1440, y: 150, w: 344, h: 716 };
const SCREEN = { w: 320, h: 692 };

/** four at the table, then a phone joins with a scan */
export const S7Together: React.FC = () => {
  const copy = useCopy();
  const lang = useLang();
  const frame = useCurrentFrame();
  const shots = SHOTS[lang];

  const enter = interpolate(frame, [94, 132], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dim = interpolate(frame, [84, 126], [0, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const joinT = interpolate(frame, [300, 336], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scan = interpolate(frame, [128, 210], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, [0, 540], [1.035, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Backdrop opacity={0.03} fadeIn={24} />
      <Table
        state={GAME.wide}
        copy={copy}
        lang={lang}
        focus={3}
        scale={scale}
        y={-8}
        opacity={1 - dim * 0.3}
      />
      <AbsoluteFill style={{ background: PAPER, opacity: dim }} />

      {/* the phone */}
      <div
        style={{
          position: "absolute",
          left: PHONE.x + (1 - enter) * 460,
          top: PHONE.y + (1 - enter) * 50,
          width: PHONE.w,
          height: PHONE.h,
          borderRadius: 52,
          background: "#1b2430",
          boxShadow: "0 50px 90px -40px rgba(20,28,38,0.65), 0 0 0 1px rgba(255,255,255,0.08) inset",
          padding: 12,
          boxSizing: "border-box",
          opacity: enter,
        }}
      >
        <div
          style={{
            width: SCREEN.w,
            height: SCREEN.h,
            borderRadius: 42,
            background: "#fff",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* status bar */}
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 22,
              right: 22,
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: INK_500,
              fontFamily: FONT_SANS,
              zIndex: 4,
            }}
          >
            <span>9:41</span>
            <span style={{ letterSpacing: "0.12em" }}>●●●</span>
          </div>
          {/* notch */}
          <div
            style={{
              position: "absolute",
              top: 10,
              left: (SCREEN.w - 94) / 2,
              width: 94,
              height: 24,
              borderRadius: 999,
              background: "#1b2430",
              zIndex: 5,
            }}
          />

          {/* scan to join */}
          <div style={{ position: "absolute", inset: 0, opacity: 1 - joinT }}>
            <div
              style={{
                position: "absolute",
                top: 74,
                left: 0,
                right: 0,
                textAlign: "center",
                fontFamily: FONT_SANS,
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "0.18em",
                color: INK_500,
              }}
            >
              {copy.s7.scan}
            </div>
            <div
              style={{
                position: "absolute",
                top: 116,
                left: (SCREEN.w - 236) / 2,
                width: 236,
                height: 236,
                borderRadius: 16,
                background: "#fff",
                border: `1px solid ${PAPER_200}`,
                padding: 8,
                boxSizing: "border-box",
                boxShadow: "0 14px 30px -24px rgba(38,48,62,0.35)",
              }}
            >
              <Img
                src={staticFile(`shots/${lang}/lobby-qr.png`)}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
            <div
              style={{
                position: "absolute",
                top: 392,
                left: 0,
                right: 0,
                textAlign: "center",
                fontFamily: FONT_SANS,
                fontSize: 11,
                letterSpacing: "0.24em",
                color: INK_400,
              }}
            >
              {copy.s7.room}
            </div>
            <div
              style={{
                position: "absolute",
                top: 412,
                left: 0,
                right: 0,
                textAlign: "center",
                fontFamily: FONT_SERIF,
                fontSize: 40,
                fontWeight: 600,
                letterSpacing: "0.32em",
                paddingLeft: "0.32em",
                color: INK,
              }}
            >
              {shots.code}
            </div>
            <div
              style={{
                position: "absolute",
                top: 490,
                left: 0,
                right: 0,
                textAlign: "center",
                fontFamily: FONT_SANS,
                fontSize: 12,
                color: INK_400,
                letterSpacing: "0.04em",
              }}
            >
              {copy.s7.local}
            </div>
            <div
              style={{
                position: "absolute",
                left: 32,
                right: 32,
                bottom: 42,
                height: 44,
                borderRadius: 14,
                background: ACCENT_100,
                border: `1px solid ${ACCENT}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontFamily: FONT_SANS,
                fontSize: 14,
                fontWeight: 600,
                color: "#8f6416",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: ACCENT }} />
              Splendor · {copy.s2.subtitle}
            </div>
          </div>

          {/* the game, after joining */}
          <div style={{ position: "absolute", inset: 0, opacity: joinT }}>
            <Img
              src={staticFile(`shots/${lang}/mobile.png`)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                top: 54,
                left: 18,
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 30,
                padding: "0 12px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.94)",
                border: `1px solid ${PAPER_200}`,
                boxShadow: "0 8px 18px -14px rgba(38,48,62,0.35)",
                fontFamily: FONT_SANS,
                fontSize: 12,
                fontWeight: 600,
                color: INK,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#45b586" }} />
              {copy.s7.joined}
            </div>
          </div>

          {/* scan line */}
          <div
            style={{
              position: "absolute",
              left: 34,
              right: 34,
              top: 128 + scan * 210,
              height: 3,
              borderRadius: 2,
              background: `linear-gradient(90deg, rgba(201,147,46,0) 0%, ${ACCENT} 20%, #ffe3a3 50%, ${ACCENT} 80%, rgba(201,147,46,0) 100%)`,
              boxShadow: `0 0 18px ${withAlpha(ACCENT, 0.7)}`,
              opacity: interpolate(frame, [120, 136, 196, 214], [0, 1, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          />
          {/* screen glare */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 42%)",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>

      {/* captions */}
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 812,
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity: interpolate(frame, [10, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ width: 34, height: 2, background: ACCENT }} />
        <span style={{ fontFamily: FONT_SANS, fontSize: 25, fontWeight: 500, letterSpacing: "0.16em", color: INK_500 }}>
          {copy.s7.label}
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          left: 96,
          top: 866,
          display: "flex",
          alignItems: "center",
          gap: 10,
          opacity: interpolate(frame, [330, 360], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          color: INK_500,
          fontFamily: FONT_SANS,
          fontSize: 19,
          letterSpacing: "0.06em",
        }}
      >
        <span style={{ width: 30, height: 1, background: ACCENT }} />
        {copy.s7.local}
      </div>
    </AbsoluteFill>
  );
};
