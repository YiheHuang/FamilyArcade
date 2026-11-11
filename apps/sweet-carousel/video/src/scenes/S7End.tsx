import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { DEMO } from '../demo';
import { CrownIcon, SceneFade, ScreenshotFrame, Chip } from '../components/Visuals';
import { ACCENT, CARD, GOLD, INK, LINE, MUTED, SERIF } from '../theme';

export function End({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[lang];
  const demo = DEMO[lang];
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const players = demo.ranking.map((seat) => demo.players.find((player) => player.seat === seat)!);

  return (
    <SceneFade>
      <AbsoluteFill>
        <div style={{ position: 'absolute', left: 120, top: 140, width: 780 }}>
          <div style={{ fontSize: 17, letterSpacing: '0.3em', color: ACCENT, textTransform: 'uppercase', opacity: enter }}>
            {copy.finalScore}
          </div>
          <h1
            style={{
              fontFamily: SERIF,
              fontSize: lang === 'zh' ? 100 : 92,
              lineHeight: 1.02,
              letterSpacing: '-0.045em',
              margin: '14px 0 0',
              color: INK,
              opacity: enter,
              translate: `0 ${(1 - enter) * 24}px`,
            }}
          >
            {copy.endTitle}
          </h1>
          <p style={{ fontFamily: SERIF, fontSize: 38, color: ACCENT, marginTop: 10 }}>{copy.endTagline}</p>

          <div
            style={{
              marginTop: 30,
              border: `1px solid ${LINE}`,
              borderRadius: 22,
              background: CARD,
              boxShadow: '0 22px 48px rgba(63,47,28,.09)',
              padding: '16px 22px',
            }}
          >
            {players.map((player, index) => (
              <div
                key={player.seat}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderTop: index === 0 ? 'none' : `1px dashed ${LINE}`,
                  opacity: enter,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: ['#b4634a', '#4f7d72', '#b08a3e'][player.seat % 3],
                  }}
                />
                <span style={{ fontSize: 22, fontWeight: 600, color: INK }}>{player.name}</span>
                {player.crowns > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 15, color: GOLD }}>
                    <CrownIcon size={19} /> {player.crowns}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontFamily: SERIF, fontSize: 36, color: ACCENT }}>{player.total}</span>
                <span style={{ fontSize: 13, color: MUTED, letterSpacing: '0.1em' }}>{copy.points}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
            <Chip>{copy.endFacts}</Chip>
            <Chip color={GOLD} background="rgba(195,154,78,.10)">
              {copy.crown} {demo.crowns.length}
            </Chip>
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            right: 100,
            top: 220,
            opacity: enter,
            rotate: '-1.5deg',
            scale: interpolate(frame, [0, 90], [0.97, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <ScreenshotFrame src={`screens/${lang}/game-over.png`} width={790} height={549} alt="Final ranking" />
        </div>

        <div style={{ position: 'absolute', left: 120, bottom: 120, display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 17, color: MUTED, letterSpacing: '0.04em' }}>{copy.endPrivacy}</span>
          <span style={{ width: 1, height: 16, background: LINE }} />
          <span style={{ fontSize: 14, color: MUTED }}>{copy.disclaimer}</span>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}
