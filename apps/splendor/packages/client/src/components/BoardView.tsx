import { cardById, nobleById, type Tier } from '@splendor/engine';
import { canAffordCard } from '../logic';
import { T } from '../i18n';
import type { GameView } from '../view';
import { CardView, DeckStack, EmptySlot } from './CardView';
import { NobleTile } from './NobleTile';

/**
 * 牌桌视图：贵族列 + 三行牌桌（牌堆 + 4 张明牌）。
 * 对局界面与复盘界面共用同一套渲染，保证"看到的牌桌"永远一致。
 */
export interface BoardViewProps {
  view: GameView;
  /** 是否可交互（游戏进行中） */
  interactive?: boolean;
  /** 对哪个座位显示"买得起"的琥珀光晕（null = 不显示） */
  affordableSeat?: number | null;
  /** 预定区已满：牌堆不可点 */
  reservedFull?: boolean;
  onCard?: (cardId: number, tier: Tier, slot: number, e: React.MouseEvent<HTMLButtonElement>) => void;
  onDeck?: (tier: Tier, e: React.MouseEvent<HTMLButtonElement>) => void;
  /** 牌堆 testid 前缀（对局用 deck-stack，复盘用 replay-deck） */
  deckTestIdPrefix?: string;
  /** 是否渲染左侧贵族列 */
  nobles?: boolean;
}

export function BoardView({
  view,
  interactive = false,
  affordableSeat = null,
  reservedFull = false,
  onCard,
  onDeck,
  deckTestIdPrefix = 'deck-stack',
  nobles = true,
}: BoardViewProps) {
  const boards: Tier[] = [3, 2, 1];
  const me = affordableSeat != null ? (view.players[affordableSeat] ?? null) : null;
  return (
    <div className="board-wrap flex min-h-0 flex-1 items-stretch justify-center gap-3">
      {nobles && view.nobles.length > 0 && (
        <div className="board-nobles flex flex-col items-center justify-center gap-2">
          <span className="text-[10px] tracking-widest text-ink-300">{T.library.nobles}</span>
          <div className="flex flex-col gap-2">
            {view.nobles.map((id) => (
              <NobleTile key={id} noble={nobleById(id)} />
            ))}
          </div>
        </div>
      )}
      <div
        className="surface flex min-h-0 max-w-[800px] flex-1 flex-col justify-center gap-2.5 rounded-2xl px-3"
        style={{ paddingTop: 'var(--board-pad-y)', paddingBottom: 'var(--board-pad-y)' }}
      >
        {boards.map((tier) => (
          <div key={tier} className="board-tier flex items-center justify-center gap-2.5">
            <DeckStack
              tier={tier}
              count={view.deckCounts[tier - 1] ?? 0}
              interactive={interactive && !reservedFull && (view.deckCounts[tier - 1] ?? 0) > 0}
              dataTestId={`${deckTestIdPrefix}-${tier}`}
              onClick={onDeck ? (e) => onDeck(tier, e) : undefined}
            />
            {view.board[tier - 1]!.map((id, slot) => {
              if (id == null) return <EmptySlot key={`empty-${tier}-${slot}`} />;
              const card = cardById(id);
              const highlight = !!(me && canAffordCard(me, card) && interactive);
              return (
                <CardView
                  key={id}
                  card={card}
                  highlight={highlight}
                  interactive={interactive}
                  dataTestId="board-card"
                  dataCardId={id}
                  onClick={onCard ? (e) => onCard(id, tier, slot, e) : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
