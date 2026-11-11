import { COLORS, type CardDef } from '@splendor/engine';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { T } from '../i18n';
import { GEM_HEX, GEM_NAME, GemIcon, TokenPip } from '../ui/gems';

/* ---------------------------------------------------------------------------
   卡牌：白纸底 + 宝石色描边 + 顶部色带 + 大号成本区
   买得起的卡：成本区呈琥珀色（唯一"可购买"提示，无角标文字）
   --------------------------------------------------------------------------- */

/** 等级底纹：1 级点阵、2 级斜纹、3 级菱形 */
function tierPattern(tier: number, color: string): React.CSSProperties {
  const c = `${color}22`;
  if (tier === 1) {
    return { backgroundImage: `radial-gradient(${c} 1.1px, transparent 1.2px)`, backgroundSize: '7px 7px' };
  }
  if (tier === 2) {
    return { backgroundImage: `repeating-linear-gradient(45deg, ${c} 0 2px, transparent 2px 7px)` };
  }
  return {
    backgroundImage: `repeating-linear-gradient(45deg, ${c} 0 1.5px, transparent 1.5px 6px), repeating-linear-gradient(-45deg, ${c} 0 1.5px, transparent 1.5px 6px)`,
  };
}

export interface CardViewProps {
  card: CardDef;
  /** board = 桌面大卡（跟随视口高度自适应），mini = 预定区小卡 */
  size?: 'board' | 'mini';
  /** 买得起：成本区高亮（琥珀色），作为唯一的"可购买"提示 */
  highlight?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  selected?: boolean;
  dimmed?: boolean;
  interactive?: boolean;
  className?: string;
  /** 便于测试与截图定位 */
  dataTestId?: string;
  /** 卡牌 id（操作动画据此定位"从哪张卡飞出"） */
  dataCardId?: number;
}

export function CardView({
  card,
  size = 'board',
  highlight = false,
  onClick,
  selected = false,
  dimmed = false,
  interactive = false,
  className = '',
  dataTestId,
  dataCardId,
}: CardViewProps) {
  const hex = GEM_HEX[card.bonus];
  const isMini = size === 'mini';
  const w = isMini ? 'var(--mini-w)' : 'var(--card-w)';
  const h = isMini ? 'var(--mini-h)' : 'var(--card-h)';
  // 可购买提示：整卡外圈淡琥珀光晕（不分割卡面）
  const boxShadow = highlight
    ? '0 0 0 3px rgba(201, 147, 46, 0.32), 0 6px 14px -8px rgba(28, 39, 58, 0.25)'
    : undefined;
  return (
    <motion.button
      type="button"
      data-testid={dataTestId}
      data-card-id={dataCardId}
      onClick={onClick}
      disabled={!interactive}
      whileHover={interactive ? { y: -4 } : undefined}
      whileTap={interactive ? { scale: 0.985 } : undefined}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={`card-face relative flex shrink-0 cursor-default flex-col overflow-hidden text-left ${
        interactive ? 'cursor-pointer' : ''
      } ${dimmed ? 'opacity-55' : ''} ${selected ? 'ring-2 ring-accent-500 ring-offset-2 ring-offset-paper-200' : ''} ${className}`}
      style={{
        width: w,
        height: h,
        border: `2px solid ${hex.deep}`,
        borderRadius: isMini ? 9 : 12,
        ...(boxShadow ? { boxShadow } : {}),
      }}
    >
      {/* 顶部色带 */}
      <div className="relative w-full shrink-0" style={{ height: isMini ? '30%' : '36%', background: hex.soft }}>
        <div className="absolute inset-0" style={tierPattern(card.tier, hex.deep)} />
        {card.points > 0 && (
          <span
            className={`tnum absolute grid place-items-center rounded-full font-extrabold ${
              isMini ? 'top-0.5 left-0.5 h-[17px] w-[17px] text-[10px]' : 'top-1.5 left-1.5 h-[26px] w-[26px] text-[14px]'
            }`}
            style={{ background: '#26303e', color: '#ffd98a', boxShadow: '0 1px 2px rgba(28,39,58,0.35)' }}
          >
            {card.points}
          </span>
        )}
        <span className={`absolute ${isMini ? 'top-0.5 right-0.5' : 'top-1.5 right-1.5'}`}>
          <GemIcon color={card.bonus} size={isMini ? 15 : 27} />
        </span>
        <span className={`absolute flex gap-0.5 ${isMini ? 'bottom-0.5 left-1' : 'bottom-1.5 left-2'}`}>
          {Array.from({ length: card.tier }).map((_, i) => (
            <span
              key={i}
              className={isMini ? 'h-[3px] w-[3px] rounded-full' : 'h-1.5 w-1.5 rounded-full'}
              style={{ background: hex.deep, opacity: 0.5 }}
            />
          ))}
        </span>
      </div>

      {/* 中部：淡色水印（绝对定位，不占用布局高度） */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 grid place-items-center">
          <GemIcon color={card.bonus} size={isMini ? 20 : 46} plain className="opacity-[0.10]" />
        </div>
      </div>

      {/* 成本区：与卡面同底（无分隔线、无底色），成本圆点直接落在卡面上 */}
      <div
        className={`flex w-full shrink-0 flex-wrap items-center justify-center ${
          isMini ? 'gap-[3px] pb-1.5' : 'gap-1.5 pb-3'
        }`}
      >
        {COLORS.filter((c) => card.cost[c] > 0).map((c) =>
          isMini ? (
            <span
              key={c}
              className="tnum grid h-[15px] min-w-[15px] place-items-center rounded-[4px] px-[3px] text-[10px] leading-none font-extrabold text-white"
              style={{ background: GEM_HEX[c].deep }}
              title={`${GEM_NAME[c]} ×${card.cost[c]}`}
            >
              {card.cost[c]}
            </span>
          ) : (
            <TokenPip key={c} color={c} count={card.cost[c]} size="md" />
          ),
        )}
      </div>
    </motion.button>
  );
}

/** 卡背（局域网对手盲抽预定的卡，以及动画中的保密卡） */
export function CardBack({ className = '' }: { className?: string }) {
  return (
    <div
      data-testid="card-back"
      className={`shrink-0 rounded-[8px] border border-paper-300 ${className}`}
      style={{
        width: 'var(--mini-w)',
        height: 'var(--mini-h)',
        background: 'repeating-linear-gradient(45deg, #f4f6f9 0 6px, #e9edf3 6px 12px)',
      }}
    >
      <span className="grid h-full place-items-center text-[12px] text-ink-300">?</span>
    </div>
  );
}

/** 预定区小卡（显示完整成本，悬停放大预览） */
export function ReservedCard({
  card,
  fromDeck,
  onClick,
  interactive = false,
  dimmed = false,
}: {
  card: CardDef;
  fromDeck?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  interactive?: boolean;
  dimmed?: boolean;
}) {
  return (
    <HoverZoom preview={<CardView card={card} size="board" />}>
      <CardView
        card={card}
        size="mini"
        onClick={onClick}
        interactive={interactive}
        dimmed={dimmed}
        dataTestId="reserved-mini"
        dataCardId={card.id}
        className={fromDeck ? 'ring-1 ring-ink-300' : ''}
      />
    </HoverZoom>
  );
}

/** 悬停放大预览（预定小卡 / 贵族牌共用） */
export function HoverZoom({
  preview,
  children,
  offsetY = -40,
}: {
  preview: React.ReactNode;
  children: React.ReactNode;
  offsetY?: number;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setRect(wrapRef.current?.getBoundingClientRect() ?? null);
    }, 140);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setRect(null);
  };

  const W = 132;
  const H = 182;
  // 优先放在源元素右侧，空间不足则放到左侧，确保不遮挡源元素本身
  const anchor = rect
    ? (() => {
        const right = rect.right + 10;
        const left = rect.left - W - 10;
        const x = right + W <= window.innerWidth - 8 ? right : Math.max(8, left);
        const y = Math.min(Math.max(64, rect.top + offsetY), window.innerHeight - H - 8);
        return { left: x, top: y };
      })()
    : null;

  return (
    <div ref={wrapRef} onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide} className="inline-flex">
      {children}
      {anchor &&
        createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="pointer-events-none fixed z-[80]"
              style={{ left: anchor.left, top: anchor.top }}
            >
              {preview}
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

/** 牌堆（浅色卡背 + 剩余数量） */
export function DeckStack({
  tier,
  count,
  onClick,
  interactive = false,
  dataTestId,
}: {
  tier: number;
  count: number;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  interactive?: boolean;
  dataTestId?: string;
}) {
  return (
    <motion.button
      type="button"
      data-testid={dataTestId}
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      whileHover={interactive ? { y: -4 } : undefined}
      whileTap={interactive ? { scale: 0.985 } : undefined}
      className={`relative shrink-0 overflow-hidden rounded-xl border border-paper-300 ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
      style={{
        width: 'var(--card-w)',
        height: 'var(--card-h)',
        background: 'repeating-linear-gradient(45deg, #f4f6f9 0 7px, #eceff4 7px 14px)',
        boxShadow: 'var(--shadow-card)',
      }}
      title={T.game.deckTitle(tier, count)}
    >
      <span className="absolute inset-1.5 rounded-lg border border-paper-300/80" />
      <span className="absolute inset-0 grid place-items-center">
        <span className="flex flex-col items-center gap-1 rounded-xl border border-paper-300 bg-white/90 px-3 py-2 shadow-sm">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-500">
            {Array.from({ length: tier }).map((_, i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-accent-500/70" />
            ))}
            {T.library.tierN(tier)}
          </span>
          <span className="tnum text-2xl leading-none font-extrabold text-ink-900">{count}</span>
        </span>
      </span>
    </motion.button>
  );
}

/** 空位（牌堆耗尽） */
export function EmptySlot() {
  return (
    <div
      className="shrink-0 rounded-xl border border-dashed border-paper-300 bg-paper-50/60"
      style={{ width: 'var(--card-w)', height: 'var(--card-h)' }}
    />
  );
}
