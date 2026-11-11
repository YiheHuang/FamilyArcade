import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Board } from '../Board';
import { COPY, type Lang } from '../copy';
import game from '../data/game.json';
import { ACCENT, INK, MUTED } from '../theme';

const snapshots = game.snapshots as Parameters<typeof Board>[0]['snapshot'][];

export function Hook({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const copy = COPY[lang];
  const fade = interpolate(t, [0, 0.8], [0, 1], { extrapolateRight: 'clamp' });
  const rise = interpolate(t, [0, 1.2], [24, 0], { extrapolateRight: 'clamp' });
  const scale = interpolate(t, [0, 4.5], [1.12, 1.02]);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          right: -260,
          top: -160,
          transform: `scale(${scale})`,
          opacity: 0.98,
          filter: 'drop-shadow(0 40px 60px rgba(20,28,40,.28))',
        }}
      >
        <Board snapshot={snapshots[2]} width={1280} height={1280} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 250,
          maxWidth: 760,
          opacity: fade,
          transform: `translateY(${rise}px)`,
        }}
      >
        <div style={{ fontSize: 18, letterSpacing: '0.26em', color: ACCENT, textTransform: 'uppercase' }}>
          {copy.eyebrow}
        </div>
        <h1
          style={{
            fontFamily: '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", "Songti SC", "SimSun", Georgia, serif',
            fontSize: 128,
            lineHeight: 1.02,
            letterSpacing: '-0.045em',
            color: INK,
            margin: '24px 0 0',
            fontWeight: 600,
          }}
        >
          {copy.hookA}
          <br />
          {copy.hookB}
        </h1>
        <div style={{ marginTop: 26, height: 1, width: 220, background: ACCENT, opacity: 0.55 }} />
        <div style={{ marginTop: 22, fontSize: 28, color: MUTED }}>{copy.tagline}</div>
      </div>
    </AbsoluteFill>
  );
}
