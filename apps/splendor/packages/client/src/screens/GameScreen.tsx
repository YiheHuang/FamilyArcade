import { COLORS, cardById, type Color, type Tier } from '@splendor/engine';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { BoardView } from '../components/BoardView';
import { GameLog, type LogLine } from '../components/GameLog';
import { DiscardModal, EndGameOverlay, NobleChoiceModal, Toasts, UndoAskModal } from '../components/Modals';
import { CardActionPopover } from '../components/Popover';
import { PlayerPanel } from '../components/PlayerPanel';
import { TokenBank } from '../components/TokenBank';
import { T } from '../i18n';
import { canAffordCard, describeEvent } from '../logic';
import { selectCanAct, useGame, type Popup } from '../store';
import { formatRemaining, useClockSfx, useTurnClock, type TurnClockView } from '../clock';
import type { GameEvent } from '@splendor/engine';
import type { GameView } from '../view';

/* ---------------- 顶栏 ---------------- */

/** 回合读秒徽标（纯提示：超时不强制任何操作） */
function ClockChip({ clock }: { clock: TurnClockView }) {
  if (!clock.active) return null;
  const color =
    clock.urgency === 'over' || clock.urgency === 'danger'
      ? 'var(--color-danger-500)'
      : clock.urgency === 'warn'
        ? 'var(--color-accent-700)'
        : 'var(--color-ink-500)';
  const border =
    clock.urgency === 'over' || clock.urgency === 'danger'
      ? 'var(--color-danger-500)'
      : clock.urgency === 'warn'
        ? 'var(--color-accent-300)'
        : 'var(--color-paper-300)';
  const pulsing = clock.urgency === 'danger';
  return (
    <span
      className={`tag tnum ${pulsing ? 'clock-pulse' : ''}`}
      data-testid="turn-clock"
      data-urgency={clock.urgency}
      style={{ color, borderColor: border }}
      title={T.game.clockHint}
    >
      {formatRemaining(clock.display)}
      <span className="ml-1 inline-block h-[4px] w-9 overflow-hidden rounded-full" style={{ background: 'var(--color-paper-200)' }}>
        <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${clock.ratio * 100}%`, background: color }} />
      </span>
    </span>
  );
}

function TopBar({ view, clock }: { view: GameView; clock: TurnClockView }) {
  const mode = useGame((s) => s.mode);
  const lan = useGame((s) => s.lan);
  const lanConnected = useGame((s) => s.lanConnected);
  const backToMenu = useGame((s) => s.backToMenu);
  const undo = useGame((s) => s.undo);
  const undoRequest = useGame((s) => s.requestUndo);
  const showHint = useGame((s) => s.showHint);
  const showLog = useGame((s) => s.settings.showLog);
  const setSettings = useGame((s) => s.setSettings);
  const allowUndo = useGame((s) => s.settings.allowUndo);
  const canUndo = useStoreHistoryLen();
  const isLan = mode === 'lan';

  return (
    <div className="topbar-row flex items-center gap-2" style={{ height: 'var(--topbar-h)' }}>
      <button
        type="button"
        onClick={backToMenu}
        className="btn-ghost rounded-lg px-2.5 py-1.5 text-[12px] font-semibold hover:border-paper-400"
      >
        ← {isLan ? T.lobby.leaveRoom : T.common.backShort}
      </button>
      <span className="text-[15px] font-extrabold tracking-wide text-ink-900">Splendor</span>
      <span className="tag tnum">{T.game.round(view.turn)}</span>
      <ClockChip clock={clock} />
      {view.finalRound && <span className="tag" style={{ borderColor: 'var(--color-accent-300)', background: 'var(--color-accent-100)', color: 'var(--color-accent-700)' }}>{T.game.finalRound}</span>}
      {isLan && lan && (
        <span className="tag">
          <span className={`h-1.5 w-1.5 rounded-full ${lanConnected ? 'bg-emerald-500' : 'bg-red-400'}`} />
          {T.lobby.title} {lan.code}
          {lan.spectator && ` · ${T.lobby.spectating}`}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {isLan && view.phase !== 'ended' && (
          <button
            type="button"
            data-testid="undo-request"
            onClick={undoRequest}
            className="btn-ghost rounded-lg px-2.5 py-1.5 text-[12px] font-semibold hover:border-paper-400"
            title={T.toast.undoWaiting}
          >
            {T.toast.undoRequest}
          </button>
        )}
        {!isLan && allowUndo && (
          <button
            type="button"
            onClick={undo}
            data-sfx="off"
            disabled={canUndo === 0}
            className="btn-ghost rounded-lg px-2.5 py-1.5 text-[12px] font-semibold hover:border-paper-400 disabled:opacity-40"
            title={`${T.game.undo} (U)`}
          >
            {T.game.undo}
          </button>
        )}
        {!isLan && (
          <button type="button" onClick={showHint} className="btn-ghost rounded-lg px-2.5 py-1.5 text-[12px] font-semibold hover:border-paper-400" title={T.game.hint}>
            {T.game.hint}
          </button>
        )}
        <button
          type="button"
          onClick={() => setSettings({ showLog: !showLog })}
          className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ${showLog ? 'btn-primary' : 'btn-ghost hover:border-paper-400'}`}
          title={T.game.log}
        >
          {T.game.log}
        </button>
      </div>
    </div>
  );
}

function useStoreHistoryLen(): number {
  return useGame((s) => s.history.length);
}

/* ---------------- 对局记录抽屉 ---------------- */

function LogDrawer({ lines }: { lines: LogLine[] }) {
  const showLog = useGame((s) => s.settings.showLog);
  const setSettings = useGame((s) => s.setSettings);
  return (
    <AnimatePresence>
      {showLog && (
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="surface fixed top-[56px] right-3 bottom-[96px] z-40 flex w-[290px] flex-col overflow-hidden rounded-2xl"
        >
          <div className="flex items-center justify-between border-b border-paper-200 px-3 py-2">
            <span className="text-[12px] font-bold text-ink-700">{T.game.log}</span>
            <button type="button" onClick={() => setSettings({ showLog: false })} className="rounded-md px-1.5 py-0.5 text-[12px] text-ink-400 hover:bg-paper-100">
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <GameLog lines={lines} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------- 主界面 ---------------- */

function useLogLines(view: GameView | null, events: GameEvent[]): LogLine[] {
  const [lines, setLines] = useState<LogLine[]>([]);
  useEffect(() => {
    if (!view || events.length === 0) return;
    const mapped: LogLine[] = [];
    for (const e of events) {
      try {
        const text = describeEvent(e, view);
        if (text) mapped.push({ text, strong: e.type === 'final-round' || e.type === 'game-end' });
      } catch {
        /* 忽略坏事件 */
      }
    }
    if (mapped.length > 0) setLines((prev) => [...prev, ...mapped].slice(-160));
  }, [view, events]);
  return lines;
}

export function GameScreen() {
  const view = useGame((s) => s.view);
  const events = useGame((s) => s.events);
  const mode = useGame((s) => s.mode);
  const lan = useGame((s) => s.lan);
  const canAct = useGame(selectCanAct);
  const openPopup = useGame((s) => s.openPopup);
  const toggleToken = useGame((s) => s.toggleToken);
  const takeTwoDirect = useGame((s) => s.takeTwoDirect);
  const setTakeTwo = useGame((s) => s.setTakeTwo);
  const clearSelection = useGame((s) => s.clearSelection);
  const confirmTake = useGame((s) => s.confirmTake);
  const selected = useGame((s) => s.selected);
  const takeTwo = useGame((s) => s.takeTwo);
  const logLines = useLogLines(view, events);
  const clock = useTurnClock();
  useClockSfx(clock);

  // AI 驱动（本地）：动效开启时多留一点间隔，让每家操作都看得清
  useEffect(() => {
    if (mode !== 'local') return;
    const g = useGame.getState().game;
    if (!g || g.phase === 'ended') return;
    const p = g.players[g.current]!;
    if (p.kind !== 'ai') return;
    // 慢节奏：动画期间给 AI 留足播放时间（关动效则恢复快节奏）
    const base = useGame.getState().settings.animations ? 4200 : 460;
    const t = setTimeout(() => useGame.getState().aiTick(), base + Math.random() * 400);
    return () => clearTimeout(t);
  }, [view, mode]);

  // 键盘快捷键：1-5 选宝石 / Enter 确认 / Esc 关闭 / U 悔棋
  // 注意：气泡打开或有待办动作（归还/选贵族）时，全局快捷键必须静默，避免与气泡内的 Enter 冲突
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useGame.getState();
      if (st.screen !== 'game') return;
      if (e.key === 'Escape') {
        st.closePopup();
        st.clearSelection();
        return;
      }
      if (st.popup) return; // 气泡打开时不响应全局快捷键
      if (!st.view || st.view.phase !== 'playing') return;
      if (!selectCanAct(st)) return;
      const idx = ['1', '2', '3', '4', '5'].indexOf(e.key);
      if (idx >= 0) {
        st.toggleToken(COLORS[idx]!);
        return;
      }
      if (e.key === 'Enter') {
        st.confirmTake();
        return;
      }
      if (e.key === 'u' || e.key === 'U') {
        st.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const boardRows = useMemo(() => [3, 2, 1] as Tier[], []);

  if (!view) return null;
  const mySeat = mode === 'lan' ? (lan?.you ?? null) : view.current;
  const me = mySeat != null ? view.players[mySeat]! : null;
  const myReservedFull = !!me && me.reserved.length >= 3;
  const inGame = canAct && view.phase === 'playing';

  const rectOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };

  const openCard = (cardId: number, source: Popup['source'], e: React.MouseEvent<HTMLElement>) => {
    openPopup({ cardId, source, anchor: rectOf(e.currentTarget) });
  };

  const handleReservedClick = (seat: number, index: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (!canAct || seat !== view.current) return;
    const r = view.players[seat]!.reserved[index];
    if (!r || 'hidden' in r) return;
    openCard(r.cardId, { kind: 'reserved', seat, index }, e);
  };

  return (
    <div
      className={`game-root mx-auto flex h-full max-w-[1760px] flex-col px-3 py-2 ${view.players.length >= 4 ? 'game-dense' : ''}`}
      style={{ gap: 'var(--game-gap)' }}
    >
      <TopBar view={view} clock={clock} />

      {/* 玩家行 */}
      <div className="players-row flex justify-center gap-2">
        {view.players.map((p, i) => (
          <PlayerPanel
            key={p.seat}
            state={view}
            seat={i}
            isCurrent={view.current === i && view.phase !== 'ended'}
            isYou={mode === 'lan' ? lan?.you === i : view.current === i}
            dimmed={mode === 'lan' && lan?.seats[i]?.connected === false}
            onReservedClick={canAct && view.current === i ? handleReservedClick : undefined}
            clockProgress={clock.active && clock.seat === i ? { ratio: clock.ratio, urgency: clock.urgency } : null}
          />
        ))}
      </div>

      {/* 牌桌（与复盘共用 BoardView） */}
      <BoardView
        view={view}
        interactive={inGame}
        affordableSeat={inGame && me ? view.current : null}
        reservedFull={myReservedFull}
        onCard={(id, tier, slot, e) => openCard(id, { kind: 'board', tier, slot }, e)}
        onDeck={(tier, e) => {
          const topId =
            mode === 'local'
              ? (useGame.getState().game?.decks[tier - 1]?.[(view.deckCounts[tier - 1] ?? 1) - 1] ?? -1)
              : -1;
          openPopup({ cardId: topId, source: { kind: 'deck', tier }, anchor: rectOf(e.currentTarget) });
        }}
      />

      {/* 底部：宝石供给区居中；只在拿取时于右侧浮出确认/清空 */}
      <div className="relative flex items-start justify-center">
        <TokenBank
          bank={view.bank}
          selected={selected}
          takeTwo={takeTwo}
          canAct={canAct}
          onToggle={toggleToken}
          onTakeTwo={(c) => (c === null ? setTakeTwo(null) : takeTwoDirect(c))}
        />
        <AnimatePresence>
          {canAct && view.phase === 'playing' && (selected.length > 0 || takeTwo !== null) && (
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="absolute top-1/2 right-0 -translate-y-1/2 flex items-center gap-2"
            >
              <button type="button" onClick={clearSelection} className="btn-ghost rounded-xl px-3 py-2 text-[12px] font-semibold hover:border-paper-400">
                {T.common.clear}
              </button>
              <button
                type="button"
                data-sfx="off"
                onClick={confirmTake}
                className="btn-accent rounded-xl px-4 py-2 text-[13px] font-bold hover:brightness-105 active:scale-[0.98]"
                title={T.common.confirm}
              >
                {T.game.confirmTake}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <LogDrawer lines={logLines} />
      <CardActionPopover />
      <DiscardModal />
      <NobleChoiceModal />
      <UndoAskModal />
      <EndGameOverlay />
    </div>
  );
}

