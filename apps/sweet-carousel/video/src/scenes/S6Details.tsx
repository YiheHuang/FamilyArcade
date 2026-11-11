import type { ReactNode } from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { DEMO } from '../demo';
import { Chip, SceneFade, ScreenshotFrame } from '../components/Visuals';
import { ACCENT, CARD, GOLD, INK, LINE, MUTED, SERIF } from '../theme';

function Tile({
  index,
  title,
  body,
  glyph,
}: {
  index: number;
  title: string;
  body: string;
  glyph: ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: Math.max(0, frame - index * 10), fps, config: { damping: 200 } });
  return (
    <div
      style={{
        width: 370,
        height: 210,
        borderRadius: 22,
        border: `1px solid ${LINE}`,
        background: CARD,
        boxShadow: '0 18px 40px rgba(63,47,28,.07)',
        padding: '22px 24px',
        opacity: enter,
        translate: `0 ${(1 - enter) * 26}px`,
      }}
    >
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 42,
          height: 42,
          borderRadius: 13,
          background: 'rgba(180,99,74,.09)',
          color: ACCENT,
          fontSize: 21,
          marginBottom: 12,
        }}
      >
        {glyph}
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 26, color: INK, fontWeight: 600 }}>{title}</div>
      <p style={{ fontSize: 17, lineHeight: 1.45, color: MUTED, marginTop: 6 }}>{body}</p>
    </div>
  );
}

export function Details({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[lang];
  const demo = DEMO[lang];
  const enter = spring({ frame, fps, config: { damping: 200 } });

  return (
    <SceneFade>
      <AbsoluteFill>
        <div style={{ position: 'absolute', left: 120, top: 74, width: 900 }}>
          <div style={{ fontSize: 17, letterSpacing: '0.28em', color: ACCENT, textTransform: 'uppercase' }}>
            {lang === 'zh' ? '细节' : 'DETAILS'}
          </div>
          <h2 style={{ fontFamily: SERIF, fontSize: 68, letterSpacing: '-0.04em', margin: '12px 0 0', color: INK }}>
            {copy.detailsTitle}
          </h2>
        </div>

        <div style={{ position: 'absolute', left: 120, top: 300, display: 'grid', gridTemplateColumns: '370px 370px', gap: 18 }}>
          <Tile index={0} title={copy.detail1} body={copy.detail1Desc} glyph="↻" />
          <Tile index={1} title={copy.detail2} body={copy.detail2Desc} glyph="★" />
          <Tile index={2} title={copy.detail3} body={copy.detail3Desc} glyph="文/A" />
          <Tile index={3} title={copy.detail4} body={copy.detail4Desc} glyph="◐" />
        </div>

        <div style={{ position: 'absolute', right: 120, top: 170, opacity: enter, rotate: '1.5deg' }}>
          <ScreenshotFrame src={`screens/${lang}/stats.png`} width={760} height={528} alt="Local family stats" />
          <div style={{ marginTop: 14, fontSize: 15, color: MUTED, fontFamily: 'Consolas, monospace', textAlign: 'right' }}>
            {lang === 'zh' ? `本机战绩 · 最高分 ${Math.max(...demo.players.map((player) => player.total))}` : `LOCAL STATS · HIGH SCORE ${Math.max(...demo.players.map((player) => player.total))}`}
          </div>
        </div>

        <div style={{ position: 'absolute', left: 120, bottom: 54, display: 'flex', gap: 10 }}>
          <Chip color={ACCENT} background="rgba(180,99,74,.08)">
            {copy.detail4}
          </Chip>
          <Chip color={GOLD} background="rgba(195,154,78,.10)">
            {copy.detail3}
          </Chip>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}
