import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { ACCENT, CARD, INK, LINE, MUTED, SERIF, SANS } from '../theme';

function DetailCard({
  start,
  marker,
  title,
  desc,
}: {
  start: number;
  marker: string;
  title: string;
  desc: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame / fps - start;
  const opacity = interpolate(local, [0, 0.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(local, [0, 0.45], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        width: 330,
        minHeight: 170,
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: 20,
        padding: '20px 22px',
        boxShadow: '0 12px 30px rgba(48,39,26,.07)',
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      <div style={{ fontFamily: 'Consolas, monospace', fontSize: 22, color: ACCENT }}>{marker}</div>
      <div style={{ fontFamily: SERIF, fontSize: 29, color: INK, marginTop: 6 }}>{title}</div>
      <div style={{ fontFamily: SANS, fontSize: 16, color: MUTED, marginTop: 5, lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

export function Details({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const copy = COPY[lang];
  const shotOpacity = interpolate(t, [0.2, 0.8], [0, 1], { extrapolateRight: 'clamp' });
  const shotY = interpolate(t, [0.2, 0.9], [26, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ padding: '0 100px' }}>
      <div style={{ marginTop: 76 }}>
        <div style={{ fontSize: 18, letterSpacing: '0.26em', color: ACCENT, textTransform: 'uppercase' }}>
          {copy.detailsKicker}
        </div>
        <h2 style={{ fontFamily: SERIF, fontSize: 76, fontWeight: 600, letterSpacing: '-0.04em', margin: '12px 0 0', color: INK }}>
          {copy.detailsTitle}
        </h2>
      </div>

      <div style={{ display: 'flex', gap: 26, marginTop: 42 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, width: 700 }}>
          <DetailCard start={0.05} marker="U" title={copy.detail1} desc={copy.detail1Desc} />
          <DetailCard start={0.22} marker="H" title={copy.detail2} desc={copy.detail2Desc} />
          <DetailCard start={0.39} marker="↻" title={copy.detail3} desc={copy.detail3Desc} />
          <DetailCard start={0.56} marker="4" title={copy.detail4} desc={copy.detail4Desc} />
        </div>
        <div
          style={{
            flex: 1,
            opacity: shotOpacity,
            transform: `translateY(${shotY}px)`,
            border: `1px solid ${LINE}`,
            borderRadius: 22,
            overflow: 'hidden',
            background: CARD,
            boxShadow: '0 22px 52px rgba(48,39,26,.12)',
            maxWidth: 900,
          }}
        >
          <Img
            src={staticFile(`shots/${lang}/stats.png`)}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}
