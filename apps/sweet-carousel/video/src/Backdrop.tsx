import type { ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import { PAPER, PAPER_DEEP } from './theme';

export function Backdrop({ children }: { children: ReactNode }) {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1400px 900px at 10% -10%, #fffdf7 0%, rgba(255,253,247,0) 58%), radial-gradient(1100px 800px at 100% 10%, ${PAPER_DEEP} 0%, rgba(241,229,209,0) 56%), ${PAPER}`,
        color: '#2b2520',
        fontFamily:
          '"Avenir Next", "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(43,37,32,0.07) 0 1px, transparent 1.6px), radial-gradient(circle at 70% 65%, rgba(43,37,32,0.045) 0 1px, transparent 1.6px)',
          backgroundSize: '148px 148px, 194px 194px',
          opacity: 0.45,
        }}
      />
      <AbsoluteFill
        style={{
          background: 'radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(63,47,28,0.11) 100%)',
        }}
      />
      {children}
    </AbsoluteFill>
  );
}
