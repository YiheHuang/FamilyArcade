import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Board } from '../Board';
import { COPY, type Lang } from '../copy';
import game from '../data/game.json';
import { ACCENT, INK, MUTED } from '../theme';

const snapshots = game.snapshots as Parameters<typeof Board>[0]['snapshot'][];

export function Title({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const copy = COPY[lang];
  const fade = interpolate(t, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' });
  const lift = interpolate(t, [0, 1], [18, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', opacity: 0.13, transform: 'scale(1.4) translateY(60px)' }}>
        <Board snapshot={snapshots[0]} width={980} height={980} />
      </div>
      <div style={{ textAlign: 'center', opacity: fade, transform: `translateY(${lift}px)` }}>
        <div
          style={{
            fontFamily: '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", "Songti SC", "SimSun", Georgia, serif',
            fontSize: lang === 'zh' ? 220 : 190,
            lineHeight: 0.95,
            letterSpacing: '-0.05em',
            color: INK,
            fontWeight: 600,
          }}
        >
          {copy.title}
        </div>
        <div
          style={{
            marginTop: 26,
            fontSize: 24,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: ACCENT,
            fontWeight: 600,
          }}
        >
          {copy.titleEn}
        </div>
        <div style={{ marginTop: 24, fontSize: 34, color: MUTED }}>{copy.tagline}</div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 40 }}>
          {[copy.factPlayers, copy.factTime, copy.factAi].map((fact) => (
            <span
              key={fact}
              style={{
                border: '1px solid rgba(29,36,48,.18)',
                background: 'rgba(255,253,248,.65)',
                borderRadius: 999,
                padding: '10px 20px',
                fontSize: 20,
                color: MUTED,
                letterSpacing: '0.04em',
              }}
            >
              {fact}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}
