import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import narrationZh from './data/narration.zh.json';
import narrationEn from './data/narration.en.json';
import type { Lang } from './copy';
import { CARD, INK, LINE, MUTED, SANS, SERIF } from './theme';

interface Line {
  at: number;
  duration: number;
  text: string;
}

const LINES: Record<Lang, Line[]> = {
  zh: narrationZh.lines as Line[],
  en: narrationEn.lines as Line[],
};

export function Subtitles({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const line = LINES[lang].find((l) => time >= l.at && time < l.at + l.duration + 0.55);
  if (!line) return null;

  const start = line.at * fps;
  const end = (line.at + line.duration + 0.55) * fps;
  const opacity = Math.min(
    interpolate(frame, [start, start + 8], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
    interpolate(frame, [end - 10, end], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 54,
        display: 'flex',
        justifyContent: 'center',
        opacity,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 1430,
          padding: '15px 28px',
          borderRadius: 18,
          border: `1px solid ${LINE}`,
          background: 'rgba(255,253,247,0.92)',
          color: INK,
          fontFamily: SERIF,
          fontSize: lang === 'zh' ? 37 : 34,
          lineHeight: 1.45,
          letterSpacing: lang === 'zh' ? '0.02em' : 0,
          textAlign: 'center',
          boxShadow: '0 16px 38px rgba(48,39,26,.14)',
        }}
      >
        <span
          style={{
            fontFamily: SANS,
            color: MUTED,
            marginRight: 14,
            fontSize: 17,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          {lang === 'zh' ? '旁白' : 'VO'}
        </span>
        <span style={{ color: INK }}>{line.text}</span>
      </div>
    </div>
  );
}
