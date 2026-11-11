import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { SceneFade, ScreenshotFrame, Chip, GoldRule } from '../components/Visuals';
import { ACCENT, INK, MUTED, SERIF } from '../theme';

export function Hook({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[lang];
  const enter = (delay: number) =>
    spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 200, mass: 0.8 } });
  const rise = (delay: number) => (1 - enter(delay)) * 26;

  return (
    <SceneFade>
      <AbsoluteFill>
        <div style={{ position: 'absolute', left: 120, top: 190, width: 780 }}>
          <div
            style={{
              fontSize: 18,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: ACCENT,
              opacity: enter(0),
            }}
          >
            {copy.eyebrow}
          </div>
          <h1
            style={{
              fontFamily: SERIF,
              fontSize: 118,
              lineHeight: 0.98,
              letterSpacing: '-0.045em',
              color: INK,
              margin: '24px 0 0',
              fontWeight: 600,
            }}
          >
            <span style={{ display: 'block', opacity: enter(6), translate: `0 ${rise(6)}px` }}>{copy.hookA}</span>
            <span style={{ display: 'block', opacity: enter(14), translate: `0 ${rise(14)}px` }}>{copy.hookB}</span>
            <span
              style={{
                display: 'block',
                opacity: enter(22),
                translate: `0 ${rise(22)}px`,
                color: ACCENT,
              }}
            >
              {copy.hookC}
            </span>
          </h1>
          <GoldRule width={interpolate(frame, [28, 70], [0, 260], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
          <p style={{ fontSize: 36, color: MUTED, marginTop: 26, opacity: enter(34), translate: `0 ${rise(34)}px` }}>
            {copy.tagline}
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 42, opacity: enter(46) }}>
            <Chip>{copy.cards72}</Chip>
            <Chip>{copy.facts}</Chip>
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            right: 60,
            top: 160,
            opacity: enter(8),
            scale: interpolate(frame, [0, 300], [1.05, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          <ScreenshotFrame src={`screens/${lang}/home.png`} width={780} height={542} rotate={-3} alt="Sweet Carousel home screen" />
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}
