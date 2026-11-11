/** Shared visual tokens for canvas rendering (kept in sync with style.css). */

export const PALETTE = ['#4e6e9e', '#c9a24b', '#b0604a', '#6f9273'] as const;

export const INK = '#1f1d1a';
export const INK_FAINT = '#8d867c';
export const LINE = '#e3dcd1';
export const BOARD_BG = '#fffdf9';
export const PAPER = '#faf7f2';
export const OK = '#6f9273';
export const BAD = '#b0604a';
export const ACCENT = '#c9a24b';

/** #rrggbb + alpha -> rgba() string */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const PLAYER_COLORS_CSS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)'] as const;
