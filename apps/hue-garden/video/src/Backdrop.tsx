import type { ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import { PAPER, PAPER_DEEP } from './theme';

export function Backdrop({ children }: { children: ReactNode }) {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1500px 950px at 10% -12%, #fffdf7 0%, rgba(255,253,247,0) 60%), radial-gradient(1100px 820px at 100% 8%, ${PAPER_DEEP} 0%, rgba(239,228,210,0) 58%), radial-gradient(760px 560px at 48% 112%, #eadcc5 0%, rgba(234,220,197,0) 60%), ${PAPER}`,
        color: '#24303a',
        fontFamily: '"Avenir Next", "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(36,48,58,0.07) 0 1px, transparent 1.6px), radial-gradient(circle at 70% 65%, rgba(36,48,58,0.045) 0 1px, transparent 1.6px)',
          backgroundSize: '150px 150px, 200px 200px',
          opacity: 0.42,
        }}
      />
      <AbsoluteFill
        style={{
          background: 'radial-gradient(120% 92% at 50% 42%, transparent 55%, rgba(74,57,36,0.13) 100%)',
        }}
      />
      {children}
    </AbsoluteFill>
  );
}
