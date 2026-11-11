import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Board } from '../Board';
import { COPY, type Lang } from '../copy';
import game from '../data/game.json';
import { ACCENT, INK, MUTED } from '../theme';

const snapshots = game.snapshots as Parameters<typeof Board>[0]['snapshot'][];

export function End({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const copy = COPY[lang];
  const fade = interpolate(t, [0, 0.7], [0, 1], { extrapolateRight: 'clamp' });
  const lift = interpolate(t, [0, 0.9], [18, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', right: -240, bottom: -260, opacity: 0.12, transform: 'rotate(-8deg)' }}>
        <Board snapshot={snapshots[4]} width={900} height={900} />
      </div>
      <div style={{ textAlign: 'center', opacity: fade, transform: `translateY(${lift}px)` }}>
        <div
          style={{
            fontFamily: '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", "Songti SC", "SimSun", Georgia, serif',
            fontSize: lang === 'zh' ? 170 : 150,
            lineHeight: 0.95,
            letterSpacing: '-0.05em',
            color: INK,
            fontWeight: 600,
          }}
        >
          {copy.endTitle}
        </div>
        <div style={{ marginTop: 20, fontSize: 32, color: MUTED }}>{copy.endTagline}</div>
        <div style={{ marginTop: 42, display: 'flex', gap: 14, justifyContent: 'center' }}>
          <span style={{ height: 2, width: 64, background: ACCENT, alignSelf: 'center', opacity: 0.6 }} />
          <span style={{ fontSize: 22, letterSpacing: '0.14em', color: ACCENT, textTransform: 'uppercase' }}>{copy.endFacts}</span>
          <span style={{ height: 2, width: 64, background: ACCENT, alignSelf: 'center', opacity: 0.6 }} />
        </div>
        <div style={{ marginTop: 26, fontSize: 24, color: MUTED }}>{copy.endPrivacy}</div>
      </div>
    </AbsoluteFill>
  );
}
