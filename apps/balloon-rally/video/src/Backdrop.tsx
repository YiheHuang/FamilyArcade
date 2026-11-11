import type { ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import { PAPER, PAPER_DEEP } from './theme';

export function Backdrop({ children }: { children: ReactNode }) {
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(1200px 760px at 12% -10%, #fffdf6 0%, rgba(255,253,246,0) 64%), radial-gradient(900px 600px at 100% 0%, #f0e6d4 0%, rgba(240,230,212,0) 58%)',
        }}
      />
      <svg
        viewBox="0 0 1920 1080"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        aria-hidden
      >
        <circle cx="1540" cy="130" r="70" fill="#f2dca8" opacity="0.75" />
        <circle cx="1540" cy="130" r="110" fill="#f2dca8" opacity="0.16" />
        <path d="M0 820 Q 300 650 620 800 T 1220 780 T 1920 730 L 1920 1080 L 0 1080 Z" fill={PAPER_DEEP} opacity="0.72" />
        <path d="M0 950 Q 360 820 760 940 T 1400 910 T 1920 880 L 1920 1080 L 0 1080 Z" fill="#dce7d3" opacity="0.55" />
        <path
          d="M0 1010 Q 380 890 800 1000 T 1500 970 T 1920 940"
          fill="none"
          stroke="#fffdf7"
          strokeWidth="30"
          strokeLinecap="round"
          opacity="0.48"
        />
      </svg>
      <AbsoluteFill
        style={{
          opacity: 0.42,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.05'/%3E%3C/svg%3E\")",
          pointerEvents: 'none',
        }}
      />
      {children}
    </AbsoluteFill>
  );
}
