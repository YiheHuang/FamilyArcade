import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { ACCENT, COLORS, INK, MUTED, SERIF, SANS } from '../theme';
import { Board, type Snapshot } from '../TileBoard';
import game from '../data/game.json';

const snapshots = game.snapshots as Snapshot[];

export function End({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const copy = COPY[lang];
  const fade = interpolate(t, [0, 0.75], [0, 1], { extrapolateRight: 'clamp' });
  const lift = interpolate(t, [0, 0.9], [20, 0], { extrapolateRight: 'clamp' });
  const strip = interpolate(t, [0.5, 1.1], [0, 1], { extrapolateRight: 'clamp' });
  const final = snapshots[snapshots.length - 1];

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', right: -300, bottom: -360, opacity: 0.13, transform: 'rotate(-9deg)' }}>
        <Board snapshot={final} width={1100} height={1100} />
      </div>
      <div style={{ textAlign: 'center', opacity: fade, transform: `translateY(${lift}px)` }}>
        <div style={{ fontSize: 18, letterSpacing: '0.28em', color: ACCENT, textTransform: 'uppercase' }}>
          {lang === 'zh' ? '彩庭 · HUE GARDEN' : 'HUE GARDEN · 彩庭'}
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: lang === 'zh' ? 184 : 150,
            lineHeight: 0.96,
            letterSpacing: '-0.055em',
            color: INK,
            marginTop: 16,
            fontWeight: 600,
          }}
        >
          {copy.endTitle}
        </div>
        <div style={{ marginTop: 20, fontSize: 31, color: MUTED }}>{copy.endTagline}</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 38 }}>
          <span style={{ height: 2, width: 64, background: ACCENT, opacity: 0.55 }} />
          <span style={{ fontFamily: SANS, fontSize: 17, letterSpacing: '0.15em', color: ACCENT, textTransform: 'uppercase' }}>
            {copy.endFacts}
          </span>
          <span style={{ height: 2, width: 64, background: ACCENT, opacity: 0.55 }} />
        </div>
        <div style={{ marginTop: 22, fontSize: 23, color: MUTED }}>{copy.endPrivacy}</div>
        <div style={{ marginTop: 10, fontSize: 16, letterSpacing: '0.08em', color: MUTED, opacity: 0.8 }}>
          {copy.endStatus}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 26, opacity: strip }}>
          {[0, 1, 2, 3, 4, 5].map((shape) => (
            <span
              key={shape}
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                background: COLORS[shape].hex,
                display: 'inline-block',
                transform: `rotate(${shape * 12}deg)`,
              }}
            />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}
