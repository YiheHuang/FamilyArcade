import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { ACCENT, CARD, INK, LINE, MUTED } from '../theme';

function Detail({
  index,
  title,
  desc,
  start,
}: {
  index: number;
  title: string;
  desc: string;
  start: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame / fps - start;
  const opacity = interpolate(local, [0, 0.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(local, [0, 0.4], [16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        width: 390,
        borderRadius: 20,
        border: `1px solid ${LINE}`,
        background: CARD,
        padding: '26px 26px 24px',
        opacity,
        transform: `translateY(${y}px)`,
        boxShadow: '0 14px 32px rgba(48,39,26,.06)',
      }}
    >
      <div style={{ fontFamily: 'Consolas, monospace', fontSize: 16, color: ACCENT }}>0{index}</div>
      <div
        style={{
          fontFamily: '"Iowan Old Style", "Noto Serif SC", "Songti SC", "SimSun", Georgia, serif',
          fontSize: 38,
          color: INK,
          marginTop: 14,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 20, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

export function Details({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  return (
    <AbsoluteFill style={{ padding: '0 120px' }}>
      <div style={{ marginTop: 110 }}>
        <div style={{ fontSize: 18, letterSpacing: '0.26em', color: ACCENT, textTransform: 'uppercase' }}>
          {lang === 'zh' ? '小细节' : 'DETAILS'}
        </div>
        <h2
          style={{
            fontFamily: '"Iowan Old Style", "Noto Serif SC", "Songti SC", "SimSun", Georgia, serif',
            fontSize: 86,
            fontWeight: 600,
            letterSpacing: '-0.035em',
            margin: '14px 0 0',
            color: INK,
          }}
        >
          {copy.detailsTitle}
        </h2>
      </div>
      <div style={{ display: 'flex', gap: 22, marginTop: 74 }}>
        <Detail index={1} title={copy.detail1} desc={copy.detail1Desc} start={0.1} />
        <Detail index={2} title={copy.detail2} desc={copy.detail2Desc} start={0.35} />
        <Detail index={3} title={copy.detail3} desc={copy.detail3Desc} start={0.6} />
        <Detail index={4} title={copy.detail4} desc={copy.detail4Desc} start={0.85} />
      </div>
      <div
        style={{
          marginTop: 64,
          height: 1,
          background: LINE,
          width: '100%',
        }}
      />
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', color: MUTED, fontSize: 20 }}>
        <span>{lang === 'zh' ? '两段式操作 · 颜色 + 形状 · 键盘可玩' : 'Two-phase actions · colour + shape · keyboard play'}</span>
        <span>{lang === 'zh' ? '静音也能玩' : 'Works with the sound off'}</span>
      </div>
    </AbsoluteFill>
  );
}
