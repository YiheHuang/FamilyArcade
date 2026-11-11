import type { ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { HomeDiagram, JumpDiagram, StepDiagram } from '../MiniDiagram';
import { ACCENT, CARD, INK, LINE, MUTED } from '../theme';

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
  const y = interpolate(local, [0, 0.5], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        width: 500,
        height: 520,
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: 26,
        padding: '34px 34px 26px',
        boxShadow: '0 20px 50px rgba(48,39,26,.10)',
        opacity,
        transform: `translateY(${y}px)`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'Consolas, monospace', fontSize: 18, color: ACCENT }}>0{index}</span>
        <span style={{ fontSize: 16, color: MUTED, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {index === 1 ? 'STEP' : index === 2 ? 'JUMP' : 'HOME'}
        </span>
      </div>
      <h3 style={{ fontFamily: '"Iowan Old Style", "Noto Serif SC", "Songti SC", "SimSun", Georgia, serif', fontSize: 46, margin: '18px 0 0', fontWeight: 600, color: INK }}>
        {title}
      </h3>
      <p style={{ fontSize: 25, lineHeight: 1.55, color: MUTED, marginTop: 12 }}>{text}</p>
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 0 }}>{children}</div>
    </div>
  );
}

export function Rules({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  return (
    <AbsoluteFill style={{ padding: '0 120px' }}>
      <div style={{ marginTop: 88 }}>
        <div style={{ fontSize: 18, letterSpacing: '0.26em', color: ACCENT, textTransform: 'uppercase' }}>
          {lang === 'zh' ? '三句话' : 'THREE RULES'}
        </div>
        <h2
          style={{
            fontFamily: '"Iowan Old Style", "Noto Serif SC", "Songti SC", "SimSun", Georgia, serif',
            fontSize: 86,
            fontWeight: 600,
            letterSpacing: '-0.035em',
            margin: '16px 0 0',
            color: INK,
          }}
        >
          {copy.rulesTitle}
        </h2>
      </div>
      <div style={{ display: 'flex', gap: 42, marginTop: 58 }}>
        <RuleCard index={1} title={copy.rule1Title} text={copy.rule1} start={0.1}>
          <StepDiagram />
        </RuleCard>
        <RuleCard index={2} title={copy.rule2Title} text={copy.rule2} start={0.55}>
          <JumpDiagram />
        </RuleCard>
        <RuleCard index={3} title={copy.rule3Title} text={copy.rule3} start={1.0}>
          <HomeDiagram />
        </RuleCard>
      </div>
    </AbsoluteFill>
  );
}
