import { COLORS, cardById, nobleById, type TokenColor } from '@splendor/engine';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { T } from '../i18n';
import { achievementsFromFinalState, loadUnlocked, newlyUnlocked, saveUnlocked, type AchievementId } from '../achievements';
import { listRecords } from '../records';
import { autoDiscardTokens, paymentOptions, totalPointsOfView, totalTokensOf } from '../logic';
import { selectCanAct, useGame } from '../store';
import { GEM_ORDER, GEM_SHORT, GemIcon, GEM_NAME } from '../ui/gems';
import { HoverZoom, CardView } from './CardView';
import { NobleTile } from './NobleTile';

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: 'rgba(35, 45, 60, 0.45)' }}
      onClick={onClose}
    >
      {children}
    </motion.div>
  );
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ scale: 0.96, opacity: 0, y: 10 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.97, opacity: 0, y: 6 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onClick={(e) => e.stopPropagation()}
      className={`surface w-full rounded-2xl p-5 ${className}`}
      style={{ boxShadow: 'var(--shadow-pop)' }}
    >
      {children}
    </motion.div>
  );
}

/** 联机悔棋：等待其他人表态 */
export function UndoAskModal() {
  const ask = useGame((s) => s.undoAsk);
  const respond = useGame((s) => s.respondUndo);
  const [left, setLeft] = useState(45);
  useEffect(() => {
    if (!ask) return;
    setLeft(45);
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [ask]);
  if (!ask) return null;
  return (
    <AnimatePresence>
      <Backdrop>
        <Panel className="max-w-sm" >
          <div data-testid="undo-ask" className="text-[15px] font-bold text-ink-900">
            {T.toast.undoAsk(ask.name)}
          </div>
          <div className="mt-1 text-[12px] text-ink-500">
            {T.toast.undoWaiting}
            <span className="tnum ml-2 font-bold text-ink-700">{left}s</span>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              data-testid="undo-reject"
              onClick={() => respond(false)}
              className="btn-ghost rounded-xl px-4 py-2 text-[13px] font-bold hover:border-paper-400"
            >
              {T.toast.undoReject}
            </button>
            <button
              type="button"
              data-testid="undo-accept"
              onClick={() => respond(true)}
              className="btn-primary rounded-xl px-4 py-2 text-[13px] font-bold hover:brightness-110 active:scale-[0.98]"
            >
              {T.toast.undoAccept}
            </button>
          </div>
        </Panel>
      </Backdrop>
    </AnimatePresence>
  );
}

/** 归还令牌（强制） */export function DiscardModal() {
  const view = useGame((s) => s.view);
  const canAct = useGame(selectCanAct);
  const applyHumanMove = useGame((s) => s.applyHumanMove);
  const [counts, setCounts] = useState<Partial<Record<TokenColor, number>>>({});
  const active = !!view && view.phase === 'discarding' && canAct;
  const key = `${view?.turn}-${view?.phase}`;

  useEffect(() => {
    setCounts({});
  }, [key]);

  if (!view || !active) return null;
  const p = view.players[view.current]!;
  const total = totalTokensOf(p);
  const need = total - 10;
  const chosen = GEM_ORDER.reduce((s, c) => s + (counts[c] ?? 0), 0);

  const change = (c: TokenColor, delta: number) => {
    setCounts((prev) => {
      const next = { ...prev };
      const v = Math.max(0, Math.min(p.tokens[c], (next[c] ?? 0) + delta));
      if (v === 0) delete next[c];
      else next[c] = v;
      return next;
    });
  };

  return (
    <AnimatePresence>
      <Backdrop>
        <Panel className="max-w-md">
          <div className="text-[15px] font-bold text-ink-900">{T.game.discardTitle}</div>
          <div className="mt-1 text-[12px] text-ink-500">
            {T.game.discardHoldsPre(total)} <b className="tnum text-accent-700">{Math.max(0, need - chosen)}</b> {T.game.discardUnit}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {GEM_ORDER.filter((c) => p.tokens[c] > 0).map((c) => {
              const v = counts[c] ?? 0;
              return (
                <div key={c} className="flex items-center gap-2 rounded-xl border border-paper-300 bg-paper-50 px-2.5 py-2">
                  <span className="inline-flex items-center gap-1 text-[13px] font-bold text-ink-800">
                    <GemIcon color={c} size={18} />
                    {p.tokens[c]}
                  </span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      className="grid h-6 w-6 place-items-center rounded-md border border-paper-300 bg-white text-[13px] text-ink-700 hover:bg-paper-100 disabled:opacity-30"
                      disabled={v <= 0}
                      onClick={() => change(c, -1)}
                    >
                      −
                    </button>
                    <span className={`tnum w-5 text-center text-[13px] font-bold ${v > 0 ? 'text-accent-700' : 'text-ink-300'}`}>{v}</span>
                    <button
                      type="button"
                      className="grid h-6 w-6 place-items-center rounded-md border border-paper-300 bg-white text-[13px] text-ink-700 hover:bg-paper-100 disabled:opacity-30"
                      disabled={v >= p.tokens[c]}
                      onClick={() => change(c, 1)}
                    >
                      +
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setCounts(autoDiscardTokens(view, view.current))}
              className="btn-ghost rounded-xl px-3 py-2 text-[12px] font-semibold hover:border-paper-400"
              title={T.game.autoDiscardHint}
            >
              {T.game.autoDiscard}
            </button>
            <button
              type="button"
              data-sfx="off"
              disabled={chosen !== need}
              onClick={() => applyHumanMove({ type: 'discard', tokens: counts })}
              className={`rounded-xl px-4 py-2 text-[13px] font-bold ${chosen === need ? 'btn-primary hover:brightness-110' : 'cursor-not-allowed border border-paper-300 bg-paper-100 text-ink-300'}`}
            >
              {T.game.confirm}
            </button>
          </div>
        </Panel>
      </Backdrop>
    </AnimatePresence>
  );
}

/** 多贵族选择 */
export function NobleChoiceModal() {
  const view = useGame((s) => s.view);
  const canAct = useGame(selectCanAct);
  const applyHumanMove = useGame((s) => s.applyHumanMove);
  const active = !!view && view.phase === 'choosing-noble' && canAct;
  if (!view || !active) return null;
  const options = (view.pending as { options: number[] }).options;
  return (
    <AnimatePresence>
      <Backdrop>
        <Panel className="max-w-lg">
          <div className="text-[15px] font-bold text-ink-900">{T.game.nobleChoiceTitle}</div>
          <div className="mt-1 text-[12px] text-ink-500">{T.game.nobleChoiceHint}</div>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {options.map((id) => (
              <button key={id} type="button" data-sfx="off" onClick={() => applyHumanMove({ type: 'chooseNoble', nobleId: id })} className="hover:-translate-y-1 transition-transform">
                <NobleTile noble={nobleById(id)} />
              </button>
            ))}
          </div>
        </Panel>
      </Backdrop>
    </AnimatePresence>
  );
}

/** 结算界面 */
export function EndGameOverlay() {
  const view = useGame((s) => s.view);
  const mode = useGame((s) => s.mode);
  const startGame = useGame((s) => s.startGame);
  const seats = useGame((s) => s.seats);
  const backToMenu = useGame((s) => s.backToMenu);
  const animations = useGame((s) => s.settings.animations);
  const confetti = useMemo(
    () =>
      Array.from({ length: 36 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.4,
        duration: 2.8 + Math.random() * 2,
        color: ['#d9a33d', '#5b8ed6', '#45b586', '#d9615f', '#c9932e'][i % 5]!,
        size: 6 + Math.random() * 6,
      })),
    [],
  );
  if (!view || view.phase !== 'ended' || !view.winners) return null;
  const rows = [...view.players]
    .map((p) => ({ p, pts: totalPointsOfView(p) }))
    .sort((a, b) => b.pts - a.pts || a.p.purchased.length - b.p.purchased.length || a.p.reserved.length - b.p.reserved.length);
  const winnerNames = view.winners.map((s) => view.players[s]!.name).join('、');
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 grid place-items-center p-4"
        style={{ background: 'rgba(35, 45, 60, 0.5)' }}
      >
        {animations &&
          confetti.map((c) => (
            <span
              key={c.id}
              className="pointer-events-none absolute top-0 rounded-sm"
              style={{
                left: `${c.left}%`,
                width: c.size,
                height: c.size * 1.4,
                background: c.color,
                animation: `confetti-fall ${c.duration}s linear ${c.delay}s infinite`,
              }}
            />
          ))}
        <motion.div
          initial={{ scale: 0.95, y: 16, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          className="surface relative w-full max-w-lg rounded-2xl p-6"
          style={{ boxShadow: 'var(--shadow-pop)' }}
        >
          <div className="text-center">
            <div className="text-[11px] tracking-[0.3em] text-ink-400">{T.game.gameOver}</div>
            <div className="mt-1 text-2xl font-extrabold text-ink-900">
              {view.winners.length > 1 ? T.game.winners : T.game.winner} · {winnerNames}
            </div>
            {view.endReason === 'deadlock' && (
              <div className="mt-2 text-[11px] text-ink-400">{T.game.deadlockNote}</div>
            )}
          </div>
          <div className="mt-5 space-y-1.5">
            {rows.map((row, i) => {
              const isWinner = view.winners!.includes(row.p.seat);
              return (
                <div
                  key={row.p.seat}
                  className="flex items-center gap-3 rounded-xl border px-3 py-2"
                  style={
                    isWinner
                      ? { borderColor: 'var(--color-accent-300)', background: 'var(--color-accent-100)' }
                      : { borderColor: 'var(--color-paper-200)', background: 'var(--color-paper-50)' }
                  }
                >
                  <span className={`tnum w-5 text-center text-[13px] font-bold ${i === 0 ? 'text-accent-700' : 'text-ink-400'}`}>{i + 1}</span>
                  <span className="flex-1 truncate text-[13px] font-semibold text-ink-900">{row.p.name}</span>
                  <span className="text-[11px] text-ink-400">
                    {T.game.cardsN(row.p.purchased.length)} · {T.game.noblesCount(row.p.nobles.length)}
                    {row.p.reserved.length > 0 && ` · ${T.game.reservedCount(row.p.reserved.length)}`}
                  </span>
                  <span className="tnum w-9 text-right text-xl font-extrabold text-ink-900">{row.pts}</span>
                </div>
              );
            })}
          </div>
          <AchievementCelebration />
          <div className="mt-6 flex justify-center gap-3">
            <button type="button" onClick={backToMenu} className="btn-ghost rounded-xl px-4 py-2 text-[13px] font-semibold hover:border-paper-400">
              {mode === 'lan' ? T.lobby.leaveRoom : T.game.toMenu}
            </button>
            {mode === 'local' && (
              <button type="button" onClick={() => startGame(seats)} className="btn-primary rounded-xl px-4 py-2 text-[13px] font-bold hover:brightness-110">
                {T.game.playAgain}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * 终局成就庆祝：只用公开信息（终局状态 + 历史记录）判定，家庭内任一玩家达成即解锁。
 * LAN 局由记录页的徽章在稍后体现（客户端没有完整状态）。
 */
function AchievementCelebration() {
  const game = useGame((s) => s.game);
  const view = useGame((s) => s.view);
  const [fresh, setFresh] = useState<AchievementId[]>([]);
  const done = useRef<string | null>(null);

  useEffect(() => {
    const ended = view?.phase === 'ended' && game && game.phase === 'ended';
    if (!ended) {
      setFresh([]);
      return;
    }
    const key = `${game.seed}:${game.moves.length}`;
    if (done.current === key) return;
    done.current = key;
    void (async () => {
      const records = await listRecords().catch(() => []);
      const current = [...new Set([...achievementsFromFinalState(game), ...loadUnlocked()])];
      const freshIds = newlyUnlocked(loadUnlocked(), current);
      saveUnlocked(current);
      setFresh(freshIds);
    })();
  }, [game, view?.phase]);

  if (fresh.length === 0) return null;
  const label = (id: AchievementId): string => (T.achievements as unknown as Record<string, string>)[id] ?? id;
  return (
    <div className="mt-3 space-y-1.5" data-testid="achievement-celebration">
      {fresh.map((id, i) => (
        <motion.div
          key={id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 + i * 0.12 }}
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: 'var(--color-accent-100, #fdf3dd)' }}
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-500 text-[12px] font-black text-white">★</span>
          <span className="text-[12px] font-bold text-accent-700">{T.achievements.celebrate(label(id))}</span>
        </motion.div>
      ))}
    </div>
  );
}

/** 浮动提示（信息/错误） */
export function Toasts() {
  const toast = useGame((s) => s.toast);
  const pushToast = useGame((s) => s.pushToast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !toast.msg) return null;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8 }}
          onClick={() => pushToast('')}
          className="fixed bottom-5 left-1/2 z-[90] -translate-x-1/2 cursor-pointer rounded-xl px-3.5 py-2 text-[12px] font-semibold shadow-lg"
          style={
            toast.kind === 'error'
              ? { background: 'var(--color-danger-500)', color: '#fff' }
              : { background: 'var(--color-ink-900)', color: '#fff' }
          }
        >
          {toast.msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 操作后可撤销提示条（比顶部按钮更顺手） */
export function UndoBar() {
  const lastAction = useGame((s) => s.lastAction);
  const mode = useGame((s) => s.mode);
  const screen = useGame((s) => s.screen);
  const allowUndo = useGame((s) => s.settings.allowUndo);
  const historyLen = useGame((s) => s.history.length);
  const undo = useGame((s) => s.undo);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastAction) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(t);
  }, [lastAction]);

  if (!lastAction || mode !== 'local' || screen !== 'game' || !allowUndo || historyLen === 0) return null;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          data-testid="undo-bar"
          className="fixed bottom-[72px] left-1/2 z-[85] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-paper-300 bg-white/95 px-3.5 py-2 shadow-lg backdrop-blur-sm"
        >
          <span className="text-[12px] text-ink-500">
            {T.game.undoPrefix}<b className="text-ink-800">{lastAction.label}</b>
          </span>
          <button
            type="button"
            onClick={undo}
          data-sfx="off"
            className="rounded-lg border border-paper-300 bg-paper-50 px-2.5 py-1 text-[12px] font-bold text-ink-700 hover:bg-paper-100"
          >
            {T.game.undoBarAction}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { GEM_NAME, GEM_SHORT, COLORS, cardById, paymentOptions, totalTokensOf, HoverZoom, CardView };
