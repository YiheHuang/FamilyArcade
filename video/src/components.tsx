import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { VideoGame } from './theme';
import { ui } from './theme';

export function Shell({ game, children, dark = false }: { game: VideoGame; children: React.ReactNode; dark?: boolean }) {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 2700], [0, -18], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill
      style={{
        background: dark ? game.ink : game.paper,
        color: dark ? game.paper : game.ink,
        fontFamily: '"Avenir Next", "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 12% ${8 + drift * 0.2}%, rgba(255,255,255,0.58) 0, transparent 38%), radial-gradient(circle at 88% 96%, ${game.accent}22 0, transparent 35%)`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
}

export function Shot({
  src,
  width,
  rotate = 0,
  x,
  y,
  enter = 0,
}: {
  src: string;
  width: number;
  rotate?: number;
  x: number;
  y: number;
  enter?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: Math.max(0, frame - enter), fps, config: { damping: 200, mass: 0.9 } });
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        rotate: `${rotate}deg`,
        opacity: s,
        translate: `0 ${(1 - s) * 36}px`,
        borderRadius: 26,
        padding: 12,
        background: 'rgba(255,250,240,.92)',
        border: '1px solid rgba(80,65,48,.16)',
        boxShadow: '0 38px 90px rgba(48,38,25,.22)',
      }}
    >
      <Img src={staticFile(src)} style={{ width: '100%', display: 'block', borderRadius: 16 }} />
    </div>
  );
}

export function Chip({ text, game, dim = false }: { text: string; game: VideoGame; dim?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '12px 22px',
        borderRadius: 999,
        border: `1px solid ${game.accent}44`,
        background: dim ? 'transparent' : 'rgba(255,250,240,.72)',
        color: dim ? 'rgba(255,250,240,.78)' : game.ink,
        fontSize: 22,
        letterSpacing: '0.02em',
      }}
    >
      {text}
    </span>
  );
}

export function TitleBlock({
  game,
  lang,
  y = 120,
  dark = false,
}: {
  game: VideoGame;
  lang: 'en' | 'zh';
  y?: number;
  dark?: boolean;
}) {
  return (
    <div style={{ position: 'absolute', left: 120, top: y, width: 820 }}>
      <div style={{ fontSize: 18, letterSpacing: '0.28em', color: game.accent, textTransform: 'uppercase', fontWeight: 700 }}>
        {ui(lang).eyebrow}
      </div>
      <div
        style={{
          marginTop: 16,
          fontFamily: '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", "Songti SC", Georgia, serif',
          fontSize: 108,
          lineHeight: 0.98,
          letterSpacing: '-0.05em',
          color: dark ? game.paper : game.ink,
        }}
      >
        {lang === 'zh' ? game.titleZh : game.title}
      </div>
      <div style={{ marginTop: 18, fontSize: 32, color: dark ? 'rgba(255,250,240,.72)' : 'rgba(60,50,40,.62)' }}>
        {lang === 'zh' ? game.taglineZh : game.tagline}
      </div>
    </div>
  );
}
