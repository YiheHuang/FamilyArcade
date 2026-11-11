import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { DEMO } from '../demo';
import { SceneFade, ScreenshotFrame, Chip } from '../components/Visuals';
import { ACCENT, CARD, GOLD, INK, LINE, MUTED, SERIF } from '../theme';

export function Game({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[lang];
  const demo = DEMO[lang];
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const screenshotScale = interpolate(frame, [0, 300], [1.035, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <SceneFade>
      <AbsoluteFill>
        <div
          style={{
            position: 'absolute',
            left: 90,
            top: 150,
            scale: screenshotScale,
            opacity: enter,
          }}
        >
          <ScreenshotFrame src={`screens/${lang}/game.png`} width={1180} height={819} rotate={-1} alt="Real Sweet Carousel game" />
        </div>

        <div style={{ position: 'absolute', left: 1320, top: 180, width: 500 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: ACCENT, boxShadow: '0 0 0 6px rgba(180,99,74,.14)' }} />
            <span style={{ fontSize: 17, letterSpacing: '0.24em', color: ACCENT, textTransform: 'uppercase' }}>
              {copy.gameLabel}
            </span>
          </div>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 64,
              lineHeight: 1.04,
              letterSpacing: '-0.04em',
              margin: '18px 0 0',
              color: INK,
            }}
          >
            {copy.gameTitle}
          </h2>
          <p style={{ fontSize: 24, color: MUTED, marginTop: 12, lineHeight: 1.5 }}>{copy.gameCaption}</p>

          <div
            style={{
              marginTop: 30,
              borderRadius: 22,
              border: `1px solid ${LINE}`,
              background: CARD,
              boxShadow: '0 18px 44px rgba(63,47,28,.08)',
              padding: '22px 24px',
            }}
          >
            {[
              [lang === 'zh' ? '人数' : 'PLAYERS', String(demo.facts.players)],
              [lang === 'zh' ? '轮数' : 'ROUNDS', String(demo.facts.rounds)],
              [lang === 'zh' ? '每轮选牌' : 'PICKS EACH', String(demo.facts.picksPerRound)],
              [lang === 'zh' ? '牌库' : 'CARDS', String(demo.facts.cards)],
            ].map(([label, value], index) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderTop: index === 0 ? 'none' : `1px dashed ${LINE}`,
                }}
              >
                <span style={{ fontSize: 16, letterSpacing: '0.14em', color: MUTED }}>{label}</span>
                <span style={{ fontFamily: SERIF, fontSize: 32, color: INK }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 24 }}>
            <Chip color={ACCENT} background="rgba(180,99,74,.08)">
              ↺ {copy.passLeft}
            </Chip>
            <Chip color={GOLD} background="rgba(195,154,78,.09)">
              ↻ {copy.passRight}
            </Chip>
            <Chip color={ACCENT} background="rgba(180,99,74,.08)">
              ↺ {copy.passLeft}
            </Chip>
          </div>
          <div style={{ fontSize: 16, color: MUTED, marginTop: 18, letterSpacing: '0.04em' }}>
            {lang === 'zh' ? '截图来自真实应用 · 1440×1000' : 'Screenshot from the real app · 1440×1000'}
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}
