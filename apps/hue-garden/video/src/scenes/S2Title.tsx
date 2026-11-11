import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { ACCENT, INK, MUTED, SERIF, SANS } from '../theme';
import { TileStrip } from '../Diagrams';

export function Title({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const copy = COPY[lang];
  const fade = interpolate(t, [0, 0.7], [0, 1], { extrapolateRight: 'clamp' });
  const lift = interpolate(t, [0, 0.9], [20, 0], { extrapolateRight: 'clamp' });
  const strip = interpolate(t, [0.3, 1.1], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: fade }}>
      <div style={{ textAlign: 'center', transform: `translateY(${lift}px)` }}>
        <div style={{ fontSize: 18, letterSpacing: '0.28em', color: ACCENT, textTransform: 'uppercase' }}>
          {lang === 'zh' ? '彩庭' : 'HUE GARDEN'}
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: lang === 'zh' ? 190 : 154,
            lineHeight: 0.96,
            letterSpacing: '-0.055em',
            color: INK,
            marginTop: 18,
            fontWeight: 600,
          }}
        >
          {copy.title}
        </div>
        <div
          style={{
            fontFamily: SANS,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: ACCENT,
            marginTop: 18,
          }}
        >
          {copy.titleEn}
        </div>
        <div style={{ marginTop: 26, fontSize: 30, color: MUTED }}>{copy.tagline}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 34, opacity: strip }}>
          <span style={{ border: '1px solid #d9cbb6', borderRadius: 999, padding: '7px 16px', fontSize: 16, letterSpacing: '0.08em', color: MUTED }}>
            {copy.factPlayers}
          </span>
          <span style={{ border: '1px solid #d9cbb6', borderRadius: 999, padding: '7px 16px', fontSize: 16, letterSpacing: '0.08em', color: MUTED }}>
            {copy.factTime}
          </span>
          <span style={{ border: '1px solid #d9cbb6', borderRadius: 999, padding: '7px 16px', fontSize: 16, letterSpacing: '0.08em', color: MUTED }}>
            {copy.factAge}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 42, opacity: strip }}>
          <TileStrip tiles={[0, 7, 14, 21, 28, 35]} size={74} />
        </div>
      </div>
    </AbsoluteFill>
  );
}
