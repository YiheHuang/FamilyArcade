import type { Color, TokenColor, Tokens } from '@splendor/engine';
import { T } from '../i18n';

/** 宝石名称 / 简写：随语言（字典在 i18n.ts） */
export const GEM_NAME = new Proxy({} as Record<TokenColor, string>, {
  get: (_t, key: string) => T.gems.name[key as TokenColor],
});

export const GEM_SHORT = new Proxy({} as Record<TokenColor, string>, {
  get: (_t, key: string) => T.gems.short[key as TokenColor],
});

export const GEM_ORDER: TokenColor[] = ['white', 'blue', 'green', 'red', 'black', 'gold'];

/** 降饱和宝石配色：base 主色 / deep 描边与文字 / soft 浅底 */
export const GEM_HEX: Record<TokenColor, { base: string; deep: string; soft: string }> = {
  white: { base: '#e9eef7', deep: '#8ea4c4', soft: '#f2f6fc' },
  blue: { base: '#5b8ed6', deep: '#3a68ad', soft: '#dde8f8' },
  green: { base: '#45b586', deep: '#2c8a63', soft: '#dcefe6' },
  red: { base: '#d9615f', deep: '#ab3f3f', soft: '#f6e2e1' },
  black: { base: '#4c5567', deep: '#2d3442', soft: '#e0e3e9' },
  gold: { base: '#d9a33d', deep: '#a97822', soft: '#f5ead3' },
};

export function tokenText(tokens: Partial<Record<TokenColor, number>>): string {
  const parts: string[] = [];
  for (const c of GEM_ORDER) {
    const n = tokens[c] ?? 0;
    if (n > 0) parts.push(`${GEM_SHORT[c]}${n}`);
  }
  return parts.join(' ') || T.common.none;
}

export function tokensToPartial(tokens: Tokens): Partial<Record<TokenColor, number>> {
  const out: Partial<Record<TokenColor, number>> = {};
  for (const c of GEM_ORDER) if (tokens[c] > 0) out[c] = tokens[c];
  return out;
}

interface GemIconProps {
  color: TokenColor;
  size?: number;
  className?: string;
  /** 关闭描边（用于大号装饰） */
  plain?: boolean;
}

/**
 * 几何风宝石图标（原创）。统一带 1px 深色描边，
 * 保证白/钻石在浅色卡片上同样清晰可见。
 */
export function GemIcon({ color, size = 18, className = '', plain = false }: GemIconProps) {
  const hex = GEM_HEX[color];
  const gid = `gem-grad-${color}`;
  const stroke = plain ? 'none' : hex.deep;
  const strokeWidth = plain ? 0 : 1.1;
  const common = { stroke, strokeWidth, strokeLinejoin: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={color === 'white' || color === 'black' ? 0.9 : 0.55} />
          <stop offset="45%" stopColor={hex.base} />
          <stop offset="100%" stopColor={hex.deep} />
        </linearGradient>
      </defs>
      {(color === 'white' || color === 'red') && (
        <>
          <polygon points="12,2 22,12 12,22 2,12" fill={`url(#${gid})`} {...common} />
          <polygon points="12,6 18,12 12,18 6,12" fill="#ffffff" opacity={color === 'white' ? 0.75 : 0.45} />
        </>
      )}
      {color === 'blue' && (
        <>
          <circle cx="12" cy="12" r="10" fill={`url(#${gid})`} {...common} />
          <ellipse cx="9.4" cy="8.8" rx="3.6" ry="2.2" fill="#ffffff" opacity="0.6" />
        </>
      )}
      {color === 'green' && (
        <>
          <polygon points="12,1.8 20.6,6.9 20.6,17.1 12,22.2 3.4,17.1 3.4,6.9" fill={`url(#${gid})`} {...common} />
          <polygon points="12,5.4 17.6,8.7 17.6,15.3 12,18.6 6.4,15.3 6.4,8.7" fill="#ffffff" opacity="0.42" />
        </>
      )}
      {color === 'black' && (
        <>
          <circle cx="12" cy="12" r="10" fill={`url(#${gid})`} {...common} />
          <ellipse cx="9.2" cy="8.4" rx="3.2" ry="1.8" fill="#ffffff" opacity="0.35" />
        </>
      )}
      {color === 'gold' && (
        <>
          <circle cx="12" cy="12" r="10" fill={`url(#${gid})`} {...common} />
          <circle cx="12" cy="12" r="6.2" fill="none" stroke="#8a5f11" strokeOpacity="0.4" strokeWidth="1.4" />
          <path d="M12 7.2l1.3 3 3.2.3-2.4 2.1.7 3.1-2.8-1.6-2.8 1.6.7-3.1-2.4-2.1 3.2-.3z" fill="#ffffff" opacity="0.75" />
        </>
      )}
    </svg>
  );
}

/** 成本/要求使用的宝石计数点（白底 + 宝石色描边 + 数字） */
export function TokenPip({
  color,
  count,
  size = 'md',
}: {
  color: TokenColor;
  count: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const hex = GEM_HEX[color];
  const dims =
    size === 'lg'
      ? { h: 26, icon: 17, text: 'text-[13px]', px: 'px-1.5' }
      : size === 'sm'
        ? { h: 18, icon: 12, text: 'text-[10px]', px: 'px-1' }
        : { h: 22, icon: 14, text: 'text-[11px]', px: 'px-1' };
  return (
    <span
      className={`tnum inline-flex items-center gap-0.5 rounded-full bg-white font-bold text-ink-900 ${dims.px} ${dims.text}`}
      style={{
        height: dims.h,
        border: `1.5px solid ${hex.deep}`,
        boxShadow: `0 1px 1px rgba(28,39,58,0.10)`,
      }}
    >
      <GemIcon color={color} size={dims.icon} plain />
      {count}
    </span>
  );
}

export function gemLabel(color: Color): string {
  return GEM_NAME[color];
}
