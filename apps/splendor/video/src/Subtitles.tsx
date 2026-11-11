import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useLang } from "./lang";
import { FONT_SANS } from "./fonts";
import { INK, PAPER, withAlpha } from "./theme";
import zh from "./data/narration.zh.json";
import en from "./data/narration.en.json";

type Line = { at: number; duration: number; text: string };
const LINES: Record<"zh" | "en", Line[]> = {
  zh: zh.lines as Line[],
  en: en.lines as Line[],
};

/**
 * Burned-in subtitles, exactly the narration text. They sit in their own band
 * below y=960, so no scene content ever competes with them. The dark hook gets
 * a dark scrim; every other scene gets the paper scrim.
 */
export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lang = useLang();
  const seconds = frame / fps;
  const lines = LINES[lang];
  const line = lines.find(
    (item) => seconds >= item.at - 0.12 && seconds <= item.at + item.duration + 0.4,
  );
  if (!line) return null;

  const dark = lines[0] === line;
  const opacity = interpolate(
    seconds,
    [
      line.at - 0.12,
      line.at + 0.14,
      line.at + line.duration + 0.18,
      line.at + line.duration + 0.4,
    ],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 168,
          background: dark
            ? `linear-gradient(to bottom, rgba(18,23,31,0) 0%, rgba(18,23,31,0.86) 72%, rgba(18,23,31,0.94) 100%)`
            : `linear-gradient(to bottom, ${withAlpha(PAPER, 0)} 0%, ${withAlpha(PAPER, 0.9)} 62%, ${withAlpha(PAPER, 0.98)} 100%)`,
          opacity,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 160,
          right: 160,
          top: 986,
          display: "flex",
          justifyContent: "center",
          opacity,
        }}
      >
        <span
          style={{
            fontFamily: FONT_SANS,
            fontWeight: 500,
            fontSize: lang === "zh" ? 33 : 30,
            lineHeight: 1.45,
            letterSpacing: lang === "zh" ? "0.015em" : "0.005em",
            color: dark ? "#f7f9fc" : INK,
            textAlign: "center",
            textShadow: dark ? "0 1px 12px rgba(0,0,0,0.35)" : "none",
            maxWidth: 1500,
          }}
        >
          {line.text}
        </span>
      </div>
    </AbsoluteFill>
  );
};
