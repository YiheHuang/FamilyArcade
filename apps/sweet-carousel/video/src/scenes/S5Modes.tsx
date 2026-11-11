import type { ReactNode } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { DEMO } from '../demo';
import { Chip, SceneFade, ScreenshotFrame } from '../components/Visuals';
import { ACCENT, CARD, GOLD, INK, LINE, MUTED, SERIF } from '../theme';

function ModeCard({
  index,
  title,
  body,
  children,
}: {
  index: number;
  title: string;
  body: string;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: Math.max(0, frame - index * 14), fps, config: { damping: 200 } });
  return (
    <div
      style={{
        width: 790,
        height: 260,
        borderRadius: 24,
        border: `1px solid ${LINE}`,
        background: CARD,
        boxShadow: '0 22px 48px rgba(63,47,28,.09)',
        padding: '26px 30px',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        opacity: enter,
        translate: `0 ${(1 - enter) * 30}px`,
      }}
    >
      <div
        style={{
          width: 92,
          height: 92,
          borderRadius: 20,
          background: index === 0 ? 'rgba(180,99,74,.10)' : 'rgba(195,154,78,.12)',
          border: `1px solid ${LINE}`,
          display: 'grid',
          placeItems: 'center',
          flex: '0 0 auto',
        }}
      >
        {children}
      </div>
      <div>
        <div style={{ fontFamily: SERIF, fontSize: 38, color: INK, fontWeight: 600 }}>{title}</div>
        <p style={{ fontSize: 21, lineHeight: 1.5, color: MUTED, marginTop: 7 }}>{body}</p>
      </div>
    </div>
  );
}

export function Modes({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[lang];
  const demo = DEMO[lang];
  const enter = spring({ frame, fps, config: { damping: 200 } });

  return (
    <SceneFade>
      <AbsoluteFill>
        <div style={{ position: 'absolute', left: 120, top: 76, width: 900 }}>
          <div style={{ fontSize: 17, letterSpacing: '0.28em', color: ACCENT, textTransform: 'uppercase' }}>
            {lang === 'zh' ? '一张桌子' : 'ONE TABLE'}
          </div>
          <h2 style={{ fontFamily: SERIF, fontSize: 70, lineHeight: 1.05, letterSpacing: '-0.04em', margin: '12px 0 0', color: INK }}>
            {copy.modesTitle}
          </h2>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <Chip>{copy.facts}</Chip>
          </div>
        </div>

        <div style={{ position: 'absolute', left: 120, top: 350, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <ModeCard index={0} title={copy.hotseat} body={copy.hotseatBody}>
            <div style={{ position: 'relative', width: 58, height: 52 }}>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 6,
                  width: 40,
                  height: 44,
                  borderRadius: 7,
                  background: '#d9a45a',
                  border: '1px solid #7d4a17',
                  rotate: '-10deg',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 22,
                  top: 0,
                  width: 36,
                  height: 42,
                  borderRadius: 7,
                  background: '#c76d85',
                  border: '1px solid #7f3449',
                  rotate: '8deg',
                }}
              />
            </div>
          </ModeCard>
          <ModeCard index={1} title={copy.solo} body={copy.soloBody}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              {[0, 1, 2, 3].map((item) => (
                <span
                  key={item}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: [ACCENT, GOLD, '#5f9b88', '#8e6fa8'][item],
                    opacity: 0.85,
                  }}
                />
              ))}
            </div>
          </ModeCard>
        </div>

        <div
          style={{
            position: 'absolute',
            right: 120,
            top: 120,
            opacity: enter,
            scale: interpolate(frame, [0, 90], [0.96, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: -26,
              top: 24,
              border: `1px solid ${LINE}`,
              borderRadius: 999,
              background: 'rgba(255,250,240,.92)',
              color: ACCENT,
              fontSize: 15,
              letterSpacing: '0.14em',
              padding: '7px 13px',
              zIndex: 3,
            }}
          >
            {copy.privacy}
          </div>
          <ScreenshotFrame src={`screens/${lang}/game-mobile.png`} width={330} height={714} rotate={2} alt="Mobile game with privacy cover" />
          <div style={{ position: 'absolute', bottom: -26, right: 0, fontFamily: 'Consolas, monospace', fontSize: 14, color: MUTED }}>
            {lang === 'zh' ? '390 × 844 · 2×' : '390 × 844 · 2×'}
          </div>
        </div>

        <div style={{ position: 'absolute', left: 120, bottom: 52, fontSize: 16, color: MUTED }}>
          {lang === 'zh' ? `本局 ${demo.players.length} 位玩家 · 真实截图` : `This game: ${demo.players.length} players · real screenshot`}
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}
