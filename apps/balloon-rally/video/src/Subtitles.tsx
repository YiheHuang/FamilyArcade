import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import narrationEn from './data/narration.en.json';
import narrationZh from './data/narration.zh.json';
import type { Lang } from './copy';
import { SANS } from './theme';

interface Line {
  at: number;
  duration: number;
  text: string;
}

const LINES: Record<Lang, Line[]> = {
  en: narrationEn.lines as Line[],
  zh: narrationZh.lines as Line[],
};

export function Subtitles({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const line = LINES[lang].find(
    (candidate) => time >= candidate.at && time < candidate.at + candidate.duration,
  );
  if (!line) return null;

  const start = line.at * fps;
  const end = (line.at + line.duration) * fps;
  const opacity = Math.min(
    interpolate(frame, [start, start + 10], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
    interpolate(frame, [end - 12, end], [1, 0], {
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
        bottom: 66,
        display: 'flex',
        justifyContent: 'center',
        opacity,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 1480,
          padding: '13px 26px',
          borderRadius: 16,
          background: 'rgba(32,42,46,0.84)',
          color: '#fbf7ee',
          fontFamily: SANS,
          fontSize: lang === 'zh' ? 36 : 34,
          lineHeight: 1.42,
          letterSpacing: lang === 'zh' ? '0.02em' : '0.005em',
          textAlign: 'center',
          boxShadow: '0 18px 40px rgba(20,28,30,.18)',
        }}
      >
        {line.text}
      </div>
    </div>
  );
}
