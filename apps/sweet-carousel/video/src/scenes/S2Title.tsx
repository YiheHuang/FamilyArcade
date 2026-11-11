import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { SceneFade, ScreenshotFrame, Chip, GoldRule } from '../components/Visuals';
import { ACCENT, ACCENT_DEEP, GOLD, INK, MUTED, SERIF } from '../theme';

export function Title({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[lang];
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const posterScale = interpolate(frame, [0, 90], [0.95, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const posterRotate = interpolate(frame, [0, 90], [4, 1.5], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <SceneFade>
      <AbsoluteFill>
        <div style={{ position: 'absolute', left: 120, top: 250, width: 820 }}>
          <div style={{ fontSize: 17, letterSpacing: '0.3em', color: ACCENT, textTransform: 'uppercase', opacity: enter }}>
            {copy.tagline}
          </div>
          <h1
            style={{
              fontFamily: SERIF,
              fontSize: lang === 'zh' ? 132 : 112,
              lineHeight: 1.02,
              letterSpacing: '-0.045em',
              color: INK,
              margin: '26px 0 0',
              fontWeight: 600,
              opacity: enter,
              translate: `0 ${(1 - enter) * 28}px`,
            }}
          >
            {copy.title}
          </h1>
          <div
            style={{
              marginTop: 18,
              fontFamily: SERIF,
              fontSize: 22,
              letterSpacing: '0.32em',
              color: ACCENT_DEEP,
              textTransform: 'uppercase',
            }}
          >
            {copy.titleEn}
          </div>
          <GoldRule width={interpolate(frame, [18, 70], [0, 300], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
          <p style={{ fontSize: 36, color: MUTED, marginTop: 28 }}>{copy.tagline}</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 34 }}>
            <Chip>{copy.facts}</Chip>
            <Chip color={GOLD} background="rgba(195,154,78,.10)">
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
              {copy.noInstall}
            </Chip>
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            right: 150,
            top: 90,
            scale: posterScale,
            rotate: `${posterRotate}deg`,
            opacity: enter,
          }}
        >
          <ScreenshotFrame src={`screens/poster-${lang}.png`} width={610} height={812} alt="Sweet Carousel poster" />
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}
