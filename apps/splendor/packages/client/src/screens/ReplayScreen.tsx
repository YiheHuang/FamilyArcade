import { useEffect, useState } from 'react';
import { BoardView } from '../components/BoardView';
import { PlayerPanel } from '../components/PlayerPanel';
import { TokenBank } from '../components/TokenBank';
import { T } from '../i18n';
import { useGame } from '../store';
import { localView } from '../view';

/** 复盘：只读棋盘 + 左右键/按钮逐轮步进（一步 = 一位玩家的一轮操作） */
export function ReplayScreen() {
  const replay = useGame((s) => s.replay);
  const setIndex = useGame((s) => s.setReplayIndex);
  const close = useGame((s) => s.closeReplay);
  const [auto, setAuto] = useState(false);

  const total = replay?.frames.length ?? 0;
  const index = replay?.index ?? 0;

  // 键盘：← → 步进，Esc 返回
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!replay) return;
      if (e.key === 'ArrowLeft') setIndex(replay.index - 1);
      else if (e.key === 'ArrowRight') setIndex(replay.index + 1);
      else if (e.key === 'Escape') close();
      else if (e.key === ' ') setAuto((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [replay, setIndex, close]);

  // 自动播放：每 1.6 秒前进一轮
  useEffect(() => {
    if (!auto || !replay) return;
    if (replay.index >= total - 1) {
      setAuto(false);
      return;
    }
    const t = setTimeout(() => setIndex(replay.index + 1), 1600);
    return () => clearTimeout(t);
  }, [auto, replay, setIndex, total]);

  if (!replay) return null;
  const frame = replay.frames[index]!;
  const view = localView(frame.state);

  return (
    <div className="mx-auto flex h-full max-w-[1760px] flex-col px-3 py-2" style={{ gap: 'var(--game-gap)' }}>
      {/* 顶栏 */}
      <div className="flex items-center gap-2" style={{ height: 'var(--topbar-h)' }}>
        <button type="button" onClick={() => close()} className="btn-ghost rounded-lg px-2.5 py-1.5 text-[12px] font-semibold hover:border-paper-400">
          ← {T.replay.backToRecords}
        </button>
        <span className="text-[15px] font-extrabold tracking-wide text-ink-900">{T.replay.title}</span>
        <span className="tag">
          {replay.record.seats.map((s) => s.name).join(' · ')} — {T.replay.turnCount(replay.record.turns)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            data-testid="replay-prev"
            onClick={() => setIndex(index - 1)}
            disabled={index <= 0}
            className="btn-ghost rounded-lg px-2.5 py-1.5 text-[12px] font-semibold hover:border-paper-400 disabled:opacity-40"
            title={T.common.prev}
          >
            ◀
          </button>
          <span className="tag tnum" data-testid="replay-frame">
            {T.replay.frame(index, Math.max(0, total - 1))}
          </span>
          <button
            type="button"
            data-testid="replay-next"
            onClick={() => setIndex(index + 1)}
            disabled={index >= total - 1}
            className="btn-ghost rounded-lg px-2.5 py-1.5 text-[12px] font-semibold hover:border-paper-400 disabled:opacity-40"
            title={T.common.next}
          >
            ▶
          </button>
          <button
            type="button"
            onClick={() => setAuto((v) => !v)}
            className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ${auto ? 'btn-primary' : 'btn-ghost hover:border-paper-400'}`}
          >
            {auto ? T.common.pause : T.common.auto}
          </button>
        </div>
      </div>

      {/* 玩家行 */}
      <div className="flex justify-center gap-2">
        {view.players.map((p, i) => (
          <PlayerPanel
            key={p.seat}
            state={view}
            seat={i}
            isCurrent={view.current === i && view.phase !== 'ended'}
            isYou={false}
          />
        ))}
      </div>

      {/* 牌桌（与对局界面共用 BoardView） */}
      <BoardView view={view} interactive={false} deckTestIdPrefix="replay-deck" />

      {/* 底部：宝石银行（只读） */}
      <div className="flex items-start justify-center">
        <TokenBank bank={view.bank} selected={[]} takeTwo={null} canAct={false} onToggle={() => {}} onTakeTwo={() => {}} />
      </div>
    </div>
  );
}
