import { COLORS, cardById, nobleById, type TokenColor } from '@splendor/engine';
import { motion } from 'motion/react';
import { AI_LABEL, T } from '../i18n';
import { totalPointsOfView, totalTokensOf } from '../logic';
import { isHidden, type GameView } from '../view';
import { GEM_HEX, GEM_ORDER, GemIcon } from '../ui/gems';
import { CardBack, ReservedCard } from './CardView';
import { NobleBadge } from './NobleTile';

function HiddenMini() {
  return <CardBack />;
}

/** 「x/10」计数的颜色分级：常态灰、达上限琥珀、超出（待归还）红 */
const TOKEN_COUNT_CLASS = {
  normal: 'text-ink-400',
  full: 'text-accent-700',
  over: 'text-[color:var(--color-danger-500)]',
} as const;

function NumChip({ color, count, flat = false, testId }: { color: TokenColor; count: number; flat?: boolean; testId?: string }) {
  const hex = GEM_HEX[color];
  return (
    <span
      data-testid={testId}
      className="tnum inline-flex items-center gap-0.5 rounded-md py-[1px] font-bold"
      style={{
        fontSize: 'var(--chip-fs)',
        paddingLeft: 'var(--chip-px)',
        paddingRight: 'var(--chip-px)',
        ...(flat
          ? { background: hex.soft, color: hex.deep }
          : { background: '#fff', color: 'var(--color-ink-900)', border: `1.2px solid ${hex.deep}` }),
      }}
    >
      <GemIcon color={color} size={12} plain={flat} />
      {flat ? `×${count}` : count}
    </span>
  );
}

/**
 * 玩家面板：编辑式三栏排版
 * [大号分数+进度] [名字/状态 + 宝石与加成筹码] [预定卡]
 */
export function PlayerPanel({
  state,
  seat,
  isCurrent,
  isYou,
  dimmed,
  onReservedClick,
  clockProgress,
}: {
  state: GameView;
  seat: number;
  isCurrent: boolean;
  isYou?: boolean;
  dimmed?: boolean;
  onReservedClick?: (seat: number, index: number, e: React.MouseEvent<HTMLButtonElement>) => void;
  /** 思考时间进度条（当前回合读秒；纯提示） */
  clockProgress?: { ratio: number; urgency: 'normal' | 'warn' | 'danger' | 'over' } | null;
}) {
  const p = state.players[seat]!;
  const pts = totalPointsOfView(p);
  const isAi = p.kind === 'ai';
  const tokens = GEM_ORDER.filter((c: TokenColor) => p.tokens[c] > 0);
  const bonuses = COLORS.filter((c) => p.bonuses[c] > 0);
  const progress = Math.min(1, pts / 15);
  const total = totalTokensOf(p);
  const countState: keyof typeof TOKEN_COUNT_CLASS = total > 10 ? 'over' : total >= 10 ? 'full' : 'normal';

  return (
    <div
      className={`surface relative flex min-w-0 max-w-[430px] flex-1 gap-3 rounded-xl px-3 ${dimmed ? 'opacity-55' : ''}`}
      style={{
        paddingTop: 'var(--panel-py)',
        paddingBottom: 'var(--panel-py)',
        ...(isCurrent ? { border: '2px solid var(--color-accent-500)', boxShadow: '0 4px 14px -8px rgba(201,147,46,0.5)' } : {}),
      }}
    >
      {/* 思考时间细条（上沿） */}
      {clockProgress && (
        <span
          data-testid="clock-bar"
          data-urgency={clockProgress.urgency}
          className="absolute top-0 left-0 h-[3px] rounded-t-xl transition-[width] duration-300"
          style={{
            width: `${Math.max(2, clockProgress.ratio * 100)}%`,
            background:
              clockProgress.urgency === 'over' || clockProgress.urgency === 'danger'
                ? 'var(--color-danger-500)'
                : clockProgress.urgency === 'warn'
                  ? 'var(--color-accent-500)'
                  : 'var(--color-ink-300)',
          }}
        />
      )}
      {/* 左：分数 + 距 15 分进度 */}
      <div
        className="flex shrink-0 flex-col items-center justify-center gap-1.5"
        style={{ width: 'var(--score-w)' }}
        title={T.game.scoreGap(Math.max(0, 15 - pts))}
      >
        <span className="tnum leading-none font-extrabold text-ink-900" style={{ fontSize: 'var(--score-fs)' }}>
          {pts}
        </span>
        <span className="h-[4px] w-[86%] overflow-hidden rounded-full bg-paper-200">
          <span
            className="block h-full rounded-full transition-all duration-300"
            style={{ width: `${progress * 100}%`, background: pts >= 15 ? 'var(--color-success-500)' : 'var(--color-accent-500)' }}
          />
        </span>
      </div>

      {/* 中：名字 / 状态 / 宝石与加成 */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <div className="panel-title-row flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] leading-none font-bold text-ink-900">{p.name}</span>
          {isYou && (
            <span className="tag" style={{ borderColor: 'var(--color-accent-300)', background: 'var(--color-accent-100)', color: 'var(--color-accent-700)' }}>
              {T.game.you}
            </span>
          )}
          {isAi && <span className="tag tag-ai-level">{AI_LABEL[p.aiLevel]}</span>}
          {isCurrent && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex shrink-0 items-center gap-1 text-[10px] font-semibold whitespace-nowrap"
              style={{ color: 'var(--color-accent-700)' }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
              {T.game.acting}
            </motion.span>
          )}
          {p.nobles.length > 0 && <span className="tag tag-nobles">{T.game.noblesN(p.nobles.length)}</span>}
        </div>
        <div className="flex min-h-[18px] flex-wrap items-center gap-1">
          <span data-testid={`panel-tokens-${seat}`} className="flex flex-wrap items-center gap-1">
            {tokens.map((c) => (
              <NumChip key={c} color={c} count={p.tokens[c]} testId={`panel-token-${seat}-${c}`} />
            ))}
            {tokens.length === 0 && <span className="text-[10px] leading-none text-ink-300">{T.game.noTokens}</span>}
          </span>
          <span data-testid={`panel-bonuses-${seat}`} className="flex flex-wrap items-center gap-1">
            {bonuses.map((c) => (
              <NumChip key={c} color={c} count={p.bonuses[c]} flat />
            ))}
          </span>
          {/* 手上宝石总数（含金币）：10 枚为官方上限 */}
          <span
            data-testid={`panel-token-count-${seat}`}
            title={T.game.tokenCountHint}
            className={`tnum ml-0.5 leading-none font-bold ${TOKEN_COUNT_CLASS[countState]}`}
            style={{ fontSize: 'var(--chip-fs)' }}
          >
            {total}/10
          </span>
          {/* 贵族徽章（动画落点；至少占位 1 像素保证有坐标） */}
          <span data-testid={`panel-nobles-${seat}`} className="flex min-h-[14px] min-w-[2px] items-center gap-0.5">
            {p.nobles.map((id) => (
              <NobleBadge key={id} noble={nobleById(id)} />
            ))}
          </span>
        </div>
      </div>

      {/* 右：预定卡（显示完整成本，悬停放大） */}
      <div data-testid={`panel-reserved-${seat}`} className="flex shrink-0 flex-col items-end justify-center gap-1">
        <span className="text-[9px] leading-none text-ink-300">{T.game.reservedN(p.reserved.length)}</span>
        <div className="flex items-end gap-1">
          {p.reserved.map((r, i) =>
            isHidden(r) ? (
              <HiddenMini key={`h-${i}`} />
            ) : (
              <ReservedCard
                key={`${r.cardId}-${i}`}
                card={cardById(r.cardId)}
                fromDeck={r.fromDeck}
                interactive={!!onReservedClick}
                onClick={(e) => onReservedClick?.(seat, i, e)}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
