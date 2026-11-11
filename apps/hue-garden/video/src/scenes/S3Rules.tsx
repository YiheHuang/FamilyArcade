import type { ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { ACCENT, CARD, INK, LINE, MUTED, SERIF, SANS } from '../theme';
import { TileSvg } from '../Diagrams';

function RuleCard({
  index,
  title,
  text,
  start,
  children,
}: {
  index: number;
  title: string;
  text: string;
  start: number;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame / fps - start;
  const opacity = interpolate(local, [0, 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(local, [0, 0.55], [34, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        width: 500,
        height: 520,
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: 26,
        padding: '32px 32px 24px',
        boxShadow: '0 20px 50px rgba(48,39,26,.10)',
        opacity,
        transform: `translateY(${y}px)`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'Consolas, monospace', fontSize: 18, color: ACCENT }}>0{index}</span>
        <span style={{ fontSize: 15, color: MUTED, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {index === 1 ? 'COLOUR' : index === 2 ? 'SHAPE' : 'BLOOM'}
        </span>
      </div>
      <h3 style={{ fontFamily: SERIF, fontSize: 46, margin: '16px 0 0', fontWeight: 600, color: INK }}>{title}</h3>
      <p style={{ fontFamily: SANS, fontSize: 24, lineHeight: 1.5, color: MUTED, marginTop: 10 }}>{text}</p>
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 0 }}>{children}</div>
    </div>
  );
}

export function Rules({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  return (
    <AbsoluteFill style={{ padding: '0 120px' }}>
      <div style={{ marginTop: 82 }}>
        <div style={{ fontSize: 18, letterSpacing: '0.26em', color: ACCENT, textTransform: 'uppercase' }}>
          {copy.rulesKicker}
        </div>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: 78,
            fontWeight: 600,
            letterSpacing: '-0.04em',
            margin: '14px 0 0',
            color: INK,
          }}
        >
          {copy.rulesTitle}
        </h2>
      </div>
      <div style={{ display: 'flex', gap: 42, marginTop: 52 }}>
        <RuleCard index={1} title={copy.rule1Title} text={copy.rule1} start={0.1}>
          <div style={{ display: 'flex', gap: 8 }}>
            {[0, 1, 2].map((tile) => (
              <TileSvg key={tile} tile={tile} size={98} />
            ))}
          </div>
        </RuleCard>
        <RuleCard index={2} title={copy.rule2Title} text={copy.rule2} start={0.55}>
          <div style={{ display: 'flex', gap: 8 }}>
            {[0, 6, 12].map((tile) => (
              <TileSvg key={tile} tile={tile} size={98} />
            ))}
          </div>
        </RuleCard>
        <RuleCard index={3} title={copy.rule3Title} text={copy.rule3} start={1.0}>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2, 3, 4, 5].map((tile) => (
                <TileSvg key={tile} tile={tile} size={68} />
              ))}
            </div>
            <div
              style={{
                position: 'absolute',
                right: -16,
                top: -32,
                background: ACCENT,
                color: '#fffaf0',
                borderRadius: 999,
                padding: '6px 14px',
                fontFamily: SANS,
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              +6
            </div>
          </div>
        </RuleCard>
      </div>
    </AbsoluteFill>
  );
}
