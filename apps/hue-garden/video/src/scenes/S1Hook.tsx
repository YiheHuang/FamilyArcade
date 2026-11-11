import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { ACCENT, INK, MUTED, SERIF } from '../theme';
import { TileSvg } from '../Diagrams';

export function Hook({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const copy = COPY[lang];
  const fade = interpolate(t, [0, 0.8], [0, 1], { extrapolateRight: 'clamp' });
  const rise = interpolate(t, [0, 1.1], [28, 0], { extrapolateRight: 'clamp' });
  const bigScale = interpolate(t, [0, 4.5], [0.94, 1.06]);
  const bigRotate = interpolate(t, [0, 4.5], [-7, 3]);
  const float = Math.sin(t * 1.2) * 9;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 250,
          maxWidth: 880,
          opacity: fade,
          transform: `translateY(${rise}px)`,
        }}
      >
        <div style={{ fontSize: 19, letterSpacing: '0.26em', color: ACCENT, textTransform: 'uppercase' }}>
          {copy.eyebrow}
        </div>
        <h1
          style={{
            fontFamily: SERIF,
            fontSize: lang === 'zh' ? 128 : 116,
            lineHeight: 1.02,
            letterSpacing: '-0.05em',
            color: INK,
            margin: '26px 0 0',
            fontWeight: 600,
          }}
        >
          {copy.hookA}
          <br />
          {copy.hookB}
        </h1>
        <div style={{ marginTop: 28, height: 1, width: 230, background: ACCENT, opacity: 0.55 }} />
        <div style={{ marginTop: 22, fontSize: 28, color: MUTED }}>{copy.tagline}</div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 130,
          top: 140 + float,
          transform: `scale(${bigScale}) rotate(${bigRotate}deg)`,
          filter: 'drop-shadow(0 40px 55px rgba(48,35,20,.24))',
        }}
      >
        <TileSvg tile={35} size={560} />
      </div>
      <div style={{ position: 'absolute', right: 520, top: 600, transform: `rotate(${-12 + float * 0.2}deg)` }}>
        <TileSvg tile={18} size={170} />
      </div>
      <div style={{ position: 'absolute', right: 60, top: 690, transform: `rotate(${12 - float * 0.15}deg)` }}>
        <TileSvg tile={21} size={190} />
      </div>
    </AbsoluteFill>
  );
}
