import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import narrationEn from './data/narration.en.json';
import narrationZh from './data/narration.zh.json';
import type { Lang } from './copy';

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
  const lines = LINES[lang];
  let line: Line | null = null;
  for (const item of lines) {
    if (time >= item.at) line = item;
  }
  if (!line || time > line.at + line.duration + 0.6) return null;

  const start = line.at * fps;
  const end = (line.at + line.duration + 0.6) * fps;
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
        bottom: 52,
        display: 'flex',
        justifyContent: 'center',
        opacity,
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      <div
        style={{
          maxWidth: 1460,
          padding: '14px 28px',
          borderRadius: 18,
          background: 'rgba(43, 37, 32, 0.84)',
          color: '#fbf7ee',
          fontSize: lang === 'zh' ? 34 : 32,
          lineHeight: 1.45,
          letterSpacing: lang === 'zh' ? '0.02em' : 0,
          textAlign: 'center',
          boxShadow: '0 16px 36px rgba(20,14,8,.18)',
          whiteSpace: 'pre-wrap',
        }}
      >
        <span
          style={{
            color: 'rgba(251,247,238,.52)',
            marginRight: 14,
            fontSize: 17,
            letterSpacing: '0.16em',
            fontFamily: 'Consolas, monospace',
          }}
        >
          {lang === 'zh' ? '字幕' : 'VO'}
        </span>
        <span>{line.text}</span>
      </div>
    </div>
  );
}
