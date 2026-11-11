import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { ACCENT, CARD, INK, LINE, MUTED, SERIF, SANS } from '../theme';

function ModeCard({
  start,
  image,
  title,
  desc,
  tall = false,
}: {
  start: number;
  image: string;
  title: string;
  desc: string;
  tall?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame / fps - start;
  const opacity = interpolate(local, [0, 0.45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(local, [0, 0.5], [28, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        width: tall ? 330 : 470,
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: 22,
        boxShadow: '0 18px 44px rgba(48,39,26,.1)',
        overflow: 'hidden',
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      <div style={{ height: tall ? 400 : 286, overflow: 'hidden', background: '#efe4d2' }}>
        <Img
          src={staticFile(image)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: tall ? 'cover' : 'cover',
            objectPosition: tall ? '50% 20%' : '50% 12%',
          }}
        />
      </div>
      <div style={{ padding: '17px 20px 20px' }}>
        <div style={{ fontFamily: SERIF, fontSize: 28, color: INK, fontWeight: 600 }}>{title}</div>
        <div style={{ fontFamily: SANS, fontSize: 17, color: MUTED, marginTop: 5, lineHeight: 1.45 }}>{desc}</div>
      </div>
    </div>
  );
}

export function Modes({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  return (
    <AbsoluteFill style={{ padding: '0 100px' }}>
      <div style={{ marginTop: 78 }}>
        <div style={{ fontSize: 18, letterSpacing: '0.26em', color: ACCENT, textTransform: 'uppercase' }}>
          {copy.modesKicker}
        </div>
        <h2 style={{ fontFamily: SERIF, fontSize: 76, fontWeight: 600, letterSpacing: '-0.04em', margin: '12px 0 0', color: INK }}>
          {copy.modesTitle}
        </h2>
      </div>
      <div style={{ display: 'flex', gap: 34, marginTop: 44, alignItems: 'flex-end' }}>
        <ModeCard start={0.1} image={`shots/${lang}/game.png`} title={copy.solo} desc={copy.soloDesc} />
        <ModeCard start={0.35} image={`shots/${lang}/setup.png`} title={copy.hotseat} desc={copy.hotseatDesc} />
        <ModeCard start={0.6} image={`shots/${lang}/game-mobile.png`} title={copy.phone} desc={copy.phoneDesc} tall />
      </div>
    </AbsoluteFill>
  );
}
