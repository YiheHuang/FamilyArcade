import { cardById } from '@splendor/engine';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { T } from '../i18n';
import { canAffordCard, deficitSummary, paymentOptions } from '../logic';
import { selectCanAct, useGame } from '../store';
import { GEM_HEX, GEM_NAME, GemIcon } from '../ui/gems';

/**
 * 锚定气泡：点击卡片/牌堆后就近弹出操作，不遮挡牌桌。
 * - 自动朝下/朝上避让，水平方向夹紧在视口内
 * - 点击外部或 Esc 关闭
 */
/** 窄屏（手机竖屏）：气泡改成底部抽屉，避免锚定越界 */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 760px)');
    const onChange = (): void => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

export function CardActionPopover() {
  const popup = useGame((s) => s.popup);
  const view = useGame((s) => s.view);
  const canAct = useGame(selectCanAct);
  const closePopup = useGame((s) => s.closePopup);
  const doBuy = useGame((s) => s.doBuy);
  const doReserve = useGame((s) => s.doReserve);
  const [payMode, setPayMode] = useState<'saveGold' | 'useGold'>('saveGold');
  const panelRef = useRef<HTMLDivElement>(null);
  const narrow = useNarrow();

  const popupKey = popup ? `${popup.cardId}:${JSON.stringify(popup.source)}` : '';
  useEffect(() => {
    setPayMode('saveGold');
  }, [popupKey]);

  useEffect(() => {
    if (!popup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePopup();
      if (e.key === 'Enter') {
        const el = panelRef.current?.querySelector<HTMLButtonElement>('[data-primary="1"]');
        if (el && !el.disabled) el.click();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) closePopup();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown, true);
    };
  }, [popup, closePopup]);

  const info = useMemo(() => {
    if (!popup || !view) return null;
    const card = cardById(popup.cardId);
    const current = view.players[view.current]!;
    const isDeck = popup.source.kind === 'deck';
    const canBuySource =
      popup.source.kind === 'board' || (popup.source.kind === 'reserved' && popup.source.seat === view.current);
    const affordable = canAffordCard(current, card);
    const plans = canBuySource ? paymentOptions(current, card) : null;
    const reservedFull = current.reserved.length >= 3;
    return { card, isDeck, canBuySource, affordable, plans, reservedFull, goldLeft: view.bank.gold };
  }, [popup, view]);

  if (!popup || !view || !canAct || !info) return null;
  const hex = GEM_HEX[info.card.bonus];
  const need = info.affordable ? '' : deficitSummary(view.players[view.current]!, info.card);

  // ---- 定位 ----
  const W = 268;
  const H = 208; // 估算高度（用于上下避让）
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const a = popup.anchor;
  const showBelow = a.y + a.h + H + 12 < vh;
  const top = showBelow ? a.y + a.h + 8 : Math.max(64, a.y - H - 8);
  const left = Math.min(Math.max(8, a.x + a.w / 2 - W / 2), Math.max(8, vw - W - 8));

  const showPayChoice = !!info.plans && info.plans.affordable && info.plans.useGold.pay.gold !== info.plans.saveGold.pay.gold;
  const plans = info.plans;
  const selectedPlan = payMode === 'useGold' ? plans?.useGold : plans?.saveGold;

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, scale: narrow ? 1 : 0.96, y: narrow ? 24 : showBelow ? -4 : 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: narrow ? 1 : 0.97, y: narrow ? 18 : 0 }}
        transition={{ type: 'spring', stiffness: 460, damping: 34 }}
        className="surface fixed z-[70] rounded-2xl p-3"
        style={
          narrow
            ? { left: 8, right: 8, bottom: 8, width: 'auto', borderRadius: 18, boxShadow: 'var(--shadow-pop)' }
            : { left, top, width: W, boxShadow: 'var(--shadow-pop)' }
        }
      >
        {/* 头部：卡片摘要 */}
        <div className="flex items-center gap-2.5">
          {info.isDeck ? (
            <div
              className="grid h-[52px] w-[38px] shrink-0 place-items-center rounded-md border border-paper-300 text-[11px] text-ink-300"
              style={{ background: 'repeating-linear-gradient(45deg, #f4f6f9 0 6px, #e9edf3 6px 12px)' }}
            >
              ?
            </div>
          ) : (
            <div className="flex h-[52px] w-[38px] shrink-0 items-center justify-center rounded-md border-2" style={{ borderColor: hex.deep, background: hex.soft }}>
              <GemIcon color={info.card.bonus} size={22} />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold text-ink-900">
              {info.isDeck ? T.game.deckTop(popup.source.kind === 'deck' ? popup.source.tier : 0) : T.game.tierCard(info.card.tier, GEM_NAME[info.card.bonus])}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-500">
              {info.isDeck ? (
                <span>{T.game.deckHint}</span>
              ) : (
                <>
                  <span>{info.card.points > 0 ? T.game.pointsN(info.card.points) : T.game.noPoints}</span>
                  <span className="text-ink-300">·</span>
                  <span className="flex items-center gap-1">
                    {Object.entries(info.card.cost)
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => (
                        <span key={k} className="tnum inline-flex items-center gap-0.5 font-semibold text-ink-700" title={GEM_NAME[k as keyof typeof GEM_NAME]}>
                          <GemIcon color={k as keyof typeof GEM_HEX} size={12} />
                          {v}
                        </span>
                      ))}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 支付方式（仅在有差异时出现） */}
        {showPayChoice && plans && (
          <div className="mt-2.5 flex items-center gap-1.5">
            <span className="text-[10px] text-ink-400">{T.game.payLabel}</span>
            {(['saveGold', 'useGold'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPayMode(m)}
                className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
                  payMode === m ? 'border-accent-500 bg-accent-100 text-accent-700' : 'border-paper-300 bg-white text-ink-500 hover:border-paper-400'
                }`}
              >
                {m === 'saveGold' ? T.game.keepGold : T.game.useGold} · {(m === 'useGold' ? plans.useGold : plans.saveGold).label}
              </button>
            ))}
          </div>
        )}

        {/* 买不起提示 */}
        {!info.isDeck && !info.affordable && (
          <div className="mt-2.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold" style={{ background: 'var(--color-danger-100)', color: 'var(--color-danger-500)' }}>
            {T.game.need} {need}
          </div>
        )}

        {/* 操作 */}
        <div className="mt-3 flex items-center gap-1.5">
          {!info.isDeck && info.canBuySource && (
            <button
              type="button"
              data-primary="1"
              disabled={!info.affordable}
              data-sfx="off"
              onClick={() => doBuy(payMode)}
              className={`flex-1 rounded-xl px-3 py-2 text-[13px] font-bold transition-all active:scale-[0.98] ${
                info.affordable ? 'btn-primary hover:brightness-110' : 'cursor-not-allowed border border-paper-300 bg-paper-100 text-ink-300'
              }`}
              title={info.affordable ? T.game.buyEnter : `${T.game.need} ${need}`}
            >
              {T.game.buy}
              {info.affordable && selectedPlan && (
                <>
                  <span className="mx-1.5 opacity-45">·</span>
                  <span className="text-[12px] font-semibold opacity-80">{selectedPlan.label}</span>
                </>
              )}
            </button>
          )}
          <button
            type="button"
            data-primary={info.isDeck ? '1' : '0'}
            data-sfx="off"
            disabled={info.reservedFull}
            onClick={doReserve}
            className={`flex-1 rounded-xl px-3 py-2 text-[13px] font-bold transition-all active:scale-[0.98] ${
              info.reservedFull ? 'cursor-not-allowed border border-paper-300 bg-paper-100 text-ink-300' : 'btn-ghost hover:border-paper-400'
            }`}
            title={info.reservedFull ? T.game.reservedFull : T.game.reserveKey}
          >
            {/* 官方规则：银行没有金币时仍可预定，只是拿不到金币——按钮上如实标注，避免误解 */}
            <span className="flex flex-col items-center leading-tight whitespace-nowrap">
              <span>{info.isDeck ? T.game.reserveDeck : T.game.reserve}</span>
              <span className={`text-[11px] font-semibold ${info.goldLeft > 0 ? 'opacity-75' : 'text-ink-400'}`}>
                {info.goldLeft > 0 ? T.game.goldGain : T.game.goldEmpty}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={closePopup}
            className="rounded-xl px-2.5 py-2 text-[12px] text-ink-400 hover:bg-paper-100"
            title={T.game.escClose}
          >
            {T.common.close}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
