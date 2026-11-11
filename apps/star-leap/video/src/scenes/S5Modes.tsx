import { AbsoluteFill, Img, staticFile } from 'remotion';
import { COPY, type Lang } from '../copy';
import { ACCENT, CARD, INK, LINE, MUTED } from '../theme';

function ShotCard({
  src,
  label,
  desc,
  width,
  height,
  top,
  left,
}: {
  src: string;
  label: string;
  desc: string;
  width: number;
  height: number;
  top: number;
  left: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        borderRadius: 24,
        overflow: 'hidden',
        border: `1px solid ${LINE}`,
        background: CARD,
        boxShadow: '0 24px 50px rgba(48,39,26,.12)',
      }}
    >
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '50px 26px 20px',
          background: 'linear-gradient(transparent, rgba(20,27,38,.82))',
          color: '#fbf7ee',
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 600, fontFamily: '"Iowan Old Style", "Noto Serif SC", "Songti SC", "SimSun", Georgia, serif' }}>{label}</div>
        <div style={{ fontSize: 19, opacity: 0.75, marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  );
}

export function Modes({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  return (
    <AbsoluteFill style={{ padding: '0 120px' }}>
      <div style={{ marginTop: 78 }}>
        <div style={{ fontSize: 18, letterSpacing: '0.24em', color: ACCENT, textTransform: 'uppercase' }}>
          {lang === 'zh' ? '怎么玩' : 'WAYS TO PLAY'}
        </div>
        <h2
          style={{
            fontFamily: '"Iowan Old Style", "Noto Serif SC", "Songti SC", "SimSun", Georgia, serif',
            fontSize: 82,
            fontWeight: 600,
            letterSpacing: '-0.035em',
            margin: '14px 0 0',
            color: INK,
          }}
        >
          {copy.modesTitle}
        </h2>
      </div>

      <ShotCard
        src={`shots/${lang}/setup.png`}
        label={copy.solo}
        desc={copy.soloDesc}
        width={660}
        height={560}
        top={250}
        left={120}
      />
      <ShotCard
        src={`shots/${lang}/game.png`}
        label={copy.hotseat}
        desc={copy.hotseatDesc}
        width={660}
        height={330}
        top={250}
        left={820}
      />
      <ShotCard
        src={`shots/${lang}/phone.png`}
        label={copy.phone}
        desc={copy.phoneDesc}
        width={270}
        height={600}
        top={210}
        left={1510}
      />

      <div
        style={{
          position: 'absolute',
          left: 820,
          top: 610,
          width: 660,
          height: 200,
          borderRadius: 24,
          border: `1px solid ${LINE}`,
          background: 'rgba(255,253,248,.72)',
          padding: '28px 30px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 34, color: INK, fontFamily: '"Iowan Old Style", "Noto Serif SC", "Songti SC", "SimSun", Georgia, serif' }}>
          {lang === 'zh' ? '四档 AI · 2–4 人 · 15–25 分钟' : '4 AI levels · 2–4 players · 15–25 min'}
        </div>
        <div style={{ fontSize: 19, color: MUTED }}>
          {lang === 'zh' ? '陪玩档不针对小朋友；提示会说人话。' : 'Companion never targets kids. Hints explain themselves.'}
        </div>
      </div>
    </AbsoluteFill>
  );
}
