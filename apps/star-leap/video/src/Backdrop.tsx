import type { ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import { PAPER, PAPER_DEEP } from './theme';

export function Backdrop({ children }: { children: ReactNode }) {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1400px 900px at 12% -10%, #fffdf7 0%, rgba(255,253,247,0) 58%), radial-gradient(1100px 800px at 100% 10%, ${PAPER_DEEP} 0%, rgba(239,231,217,0) 55%), ${PAPER}`,
        color: '#1d2430',
        fontFamily: '"Avenir Next", "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(29,36,48,0.08) 0 1px, transparent 1.6px), radial-gradient(circle at 70% 65%, rgba(29,36,48,0.05) 0 1px, transparent 1.6px)',
          backgroundSize: '140px 140px, 190px 190px',
          opacity: 0.45,
        }}
      />
      <AbsoluteFill
        style={{
          background: 'radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(48,39,26,0.12) 100%)',
        }}
      />
      {children}
    </AbsoluteFill>
  );
}
