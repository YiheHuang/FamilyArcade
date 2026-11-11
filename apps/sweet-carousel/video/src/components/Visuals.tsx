import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { CARD, GOLD, LINE, MUTED } from '../theme';

export function SceneFade({ children }: { children: ReactNode }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(frame, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

export const DESSERTS = [
  { id: 'macaron', en: 'Macaron', zh: '马卡龙', color: '#c76d85', deep: '#7f3449', light: '#f2d3dc' },
  { id: 'tart', en: 'Berry Tart', zh: '水果挞', color: '#d08a3e', deep: '#7d4a17', light: '#f5dfc0' },
  { id: 'eclair', en: 'Éclair', zh: '闪电泡芙', color: '#8a5a3b', deep: '#4e2f1b', light: '#e5d0be' },
  { id: 'pudding', en: 'Caramel Pudding', zh: '焦糖布丁', color: '#c9a24b', deep: '#75571d', light: '#f4e6bd' },
  { id: 'candy', en: 'Mint Candy', zh: '薄荷糖', color: '#5f9b88', deep: '#2f5b4d', light: '#cfe7df' },
  { id: 'cake', en: 'Berry Cake', zh: '莓果蛋糕', color: '#8e6fa8', deep: '#513a68', light: '#e2d5ee' },
] as const;

export type Dessert = (typeof DESSERTS)[number];

export function MiniDessert({ dessert, size = 46 }: { dessert: Dessert; size?: number }) {
  const style = {
    '--c': dessert.color,
    '--d': dessert.deep,
    '--l': dessert.light,
  } as CSSProperties;
  let shape: ReactNode;
  switch (dessert.id) {
    case 'macaron':
      shape = (
        <>
          <ellipse cx="32" cy="42" rx="21" ry="8" fill="var(--c)" stroke="var(--d)" strokeWidth="1.6" />
          <rect x="11" y="33" width="42" height="9" rx="4" fill="var(--l)" stroke="var(--d)" strokeWidth="1.4" />
          <ellipse cx="32" cy="27" rx="21" ry="10" fill="var(--c)" stroke="var(--d)" strokeWidth="1.6" />
        </>
      );
      break;
    case 'tart':
      shape = (
        <>
          <path d="M9 33h46l-5 15a6 6 0 0 1-6 4H20a6 6 0 0 1-6-4z" fill="#d9a45a" stroke="var(--d)" strokeWidth="1.6" />
          <ellipse cx="32" cy="33" rx="23" ry="7" fill="var(--l)" stroke="var(--d)" strokeWidth="1.5" />
          <circle cx="23" cy="32" r="3" fill="var(--c)" />
          <circle cx="32" cy="30.5" r="3.4" fill="var(--c)" />
          <circle cx="41" cy="32" r="2.8" fill="var(--c)" />
        </>
      );
      break;
    case 'eclair':
      shape = (
        <>
          <rect x="7" y="24" width="50" height="19" rx="9.5" fill="var(--c)" stroke="var(--d)" strokeWidth="1.6" />
          <path d="M13 29h38" stroke="var(--l)" strokeWidth="4" strokeLinecap="round" />
          <path d="M15 38h34" stroke="var(--d)" opacity="0.28" strokeWidth="1.5" strokeLinecap="round" />
        </>
      );
      break;
    case 'pudding':
      shape = (
        <>
          <ellipse cx="32" cy="51" rx="18" ry="4" fill="var(--l)" stroke="var(--d)" strokeWidth="1.3" />
          <path d="M18 25h28l-4 21a5 5 0 0 1-5 4H27a5 5 0 0 1-5-4z" fill="var(--c)" stroke="var(--d)" strokeWidth="1.6" />
          <ellipse cx="32" cy="25" rx="14" ry="5" fill="var(--l)" stroke="var(--d)" strokeWidth="1.5" />
        </>
      );
      break;
    case 'candy':
      shape = (
        <>
          <path d="M14 32L5 23v18z" fill="var(--c)" stroke="var(--d)" strokeWidth="1.5" />
          <path d="M50 32l9-9v18z" fill="var(--c)" stroke="var(--d)" strokeWidth="1.5" />
          <ellipse cx="32" cy="32" rx="16" ry="11.5" fill="var(--c)" stroke="var(--d)" strokeWidth="1.6" />
          <path d="M22 32h20" stroke="var(--l)" strokeWidth="3" strokeLinecap="round" />
        </>
      );
      break;
    default:
      shape = (
        <>
          <path d="M13 42L32 15l19 27z" fill="var(--l)" stroke="var(--d)" strokeWidth="1.6" />
          <path d="M20 38h24l-3 7a3 3 0 0 1-3 2H26a3 3 0 0 1-3-2z" fill="var(--c)" stroke="var(--d)" strokeWidth="1.4" />
          <circle cx="32" cy="15" r="4" fill="#b34a52" stroke="#6f2830" strokeWidth="1.2" />
        </>
      );
  }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={style} aria-hidden>
      {shape}
    </svg>
  );
}

export function MiniCard({
  dessert,
  name,
  width = 150,
  rotate = 0,
  style,
}: {
  dessert: Dessert;
  name: string;
  width?: number;
  rotate?: number;
  style?: CSSProperties;
}) {
  const height = width * 1.4;
  return (
    <div
      style={{
        width,
        height,
        borderRadius: width * 0.09,
        background: `linear-gradient(180deg, #fffdf8 0%, ${CARD} 70%, #f5e9d6 100%)`,
        border: `1px solid rgba(92,67,38,.22)`,
        boxShadow: '0 16px 32px rgba(63,47,28,.16)',
        rotate: `${rotate}deg`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      <div style={{ height: width * 0.055, background: dessert.color }} />
      <div
        style={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          margin: width * 0.06,
          borderRadius: width * 0.055,
          background: dessert.light,
          border: '1px solid rgba(92,67,38,.1)',
        }}
      >
        <MiniDessert dessert={dessert} size={width * 0.52} />
      </div>
      <div
        style={{
          padding: `0 ${width * 0.07}px ${width * 0.08}px`,
          fontSize: width * 0.075,
          fontWeight: 700,
          color: dessert.deep,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </div>
    </div>
  );
}

export function ScreenshotFrame({
  src,
  width,
  height,
  rotate = 0,
  style,
  alt = '',
}: {
  src: string;
  width: number;
  height: number;
  rotate?: number;
  style?: CSSProperties;
  alt?: string;
}) {
  return (
    <div
      style={{
        width,
        height,
        padding: 10,
        borderRadius: 22,
        background: '#fdf7ec',
        border: `1px solid ${LINE}`,
        boxShadow: '0 40px 80px rgba(63,47,28,.18)',
        rotate: `${rotate}deg`,
        ...style,
      }}
    >
      <Img
        src={staticFile(src)}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: 14,
          display: 'block',
        }}
      />
    </div>
  );
}

export function Chip({
  children,
  color = MUTED,
  background = 'rgba(255,250,240,.75)',
}: {
  children: ReactNode;
  color?: string;
  background?: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        border: `1px solid ${LINE}`,
        borderRadius: 999,
        padding: '8px 15px',
        background,
        color,
        fontSize: 17,
        letterSpacing: '0.04em',
      }}
    >
      {children}
    </span>
  );
}

export function GoldRule({ width = 180 }: { width?: number }) {
  return <div style={{ width, height: 2, background: GOLD, opacity: 0.55, marginTop: 24 }} />;
}

export function CrownIcon({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path
        d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"
        fill="#c79a43"
        stroke="#7d5a1d"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
