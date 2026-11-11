import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import narrationZh from './data/narration.zh.json';
import narrationEn from './data/narration.en.json';
import type { Lang } from './copy';

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
  const lines = LINES[lang];
  const line = lines.find((l) => time >= l.at && time < l.at + l.duration + 0.7);
  if (!line) return null;

  const start = line.at * fps;
  const end = (line.at + line.duration + 0.7) * fps;
  const opacity = Math.min(
    interpolate(frame, [start, start + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(frame, [end - 10, end], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 48,
        display: 'flex',
        justifyContent: 'center',
        opacity,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 1480,
          padding: '14px 26px',
          borderRadius: 18,
          background: 'rgba(20, 27, 38, 0.78)',
          color: '#fbf7ee',
          fontSize: lang === 'zh' ? 36 : 34,
          lineHeight: 1.45,
          letterSpacing: lang === 'zh' ? '0.02em' : 0,
          textAlign: 'center',
          boxShadow: '0 16px 36px rgba(10,15,22,.18)',
        }}
      >
        <span style={{ color: 'rgba(251,247,238,.55)', marginRight: 14, fontSize: 20, verticalAlign: '2px' }}>
          {lang === 'zh' ? '旁白' : 'VO'}
        </span>
        <span style={{ color: '#fbf7ee' }}>{line.text}</span>
      </div>
    </div>
  );
}
