import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { T } from '../i18n';
import { listRecords, type GameRecord, type RecordMode } from '../records';
import { ACHIEVEMENT_IDS, achievementsFromRecords, type AchievementId } from '../achievements';
import { computeStats, type FamilyStats } from '../stats';
import { useGame } from '../store';
import { GEM_NAME, GemIcon } from '../ui/gems';
import { NavIcon } from '../ui/icons';

function modeLabel(mode: RecordMode): string {
  switch (mode) {
    case 'lan':
      return T.replay.lanGame;
    case 'ai':
      return T.replay.aiGame;
    case 'training':
      return T.menu.training;
    default:
      return T.replay.localGame;
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 战绩统计：家庭排行榜 + 每人明细（复用已有对局记录，无需新存储） */
export function StatsPanel({ records }: { records: GameRecord[] }) {
  const [scope, setScope] = useState<'all' | 'recent'>('all');
  const [mode, setMode] = useState<RecordMode | 'all'>('all');
  const [stats, setStats] = useState<FamilyStats | null>(null);
  const [achieved, setAchieved] = useState<AchievementId[]>([]);

  useEffect(() => {
    let alive = true;
    const run = (): void => {
      const s = computeStats(records, {
        mode,
        limit: scope === 'recent' ? 10 : undefined,
      });
      if (alive) {
        setStats(s);
        // 成就是家庭维度、与筛选无关：始终按全部记录计算
        setAchieved(achievementsFromRecords(records));
      }
    };
    // 重演计算可能占用几十毫秒：让浏览器先画出"统计中"
    const timer = setTimeout(run, 30);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [records, scope, mode]);

  if (!stats) return <div className="surface mt-4 rounded-2xl px-5 py-10 text-center text-[12px] text-ink-400">…</div>;
  if (stats.players.length === 0) {
    return <div className="surface mt-4 rounded-2xl px-5 py-10 text-center text-[12px] text-ink-400">{T.replay.statsEmpty}</div>;
  }

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1 text-[11.5px] font-bold ${
        active ? 'btn-accent' : 'border border-paper-300 bg-white text-ink-500 hover:border-paper-400'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-4 flex flex-col gap-3">
      {/* 过滤 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-ink-400">{T.replay.statsScope}</span>
        {chip(T.replay.statsAll, scope === 'all', () => setScope('all'))}
        {chip(T.replay.statsRecent, scope === 'recent', () => setScope('recent'))}
        <span className="mx-1 h-4 w-px bg-paper-300" />
        {chip(T.replay.statsModeAll, mode === 'all', () => setMode('all'))}
        {chip(T.replay.localGame, mode === 'local', () => setMode('local'))}
        {chip(T.replay.aiGame, mode === 'ai', () => setMode('ai'))}
        {chip(T.menu.training, mode === 'training', () => setMode('training'))}
        {chip(T.replay.lanGame, mode === 'lan', () => setMode('lan'))}
        <span className="ml-auto text-[11px] text-ink-400">
          {T.replay.turnCount(stats.games)} · {T.replay.durationMin(Math.round(stats.totalMs / 60000))}
        </span>
      </div>

      {/* 家庭成就徽章 */}
      <div className="surface rounded-2xl px-4 py-3" data-testid="achievement-badges">
        <div className="text-[12px] font-bold text-ink-900">{T.achievements.title}</div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ACHIEVEMENT_IDS.map((id) => {
            const on = achieved.includes(id);
            const label = (T.achievements as unknown as Record<string, string>)[id] ?? id;
            const desc = (T.achievements as unknown as Record<string, string>)[`${id}Desc`] ?? '';
            return (
              <div
                key={id}
                data-testid={`achievement-${id}`}
                data-unlocked={on ? '1' : '0'}
                className={`rounded-xl border px-3 py-2 ${on ? 'border-accent-300 bg-accent-100/60' : 'border-paper-200 bg-paper-100'}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-black ${on ? 'bg-accent-500 text-white' : 'bg-paper-300 text-ink-400'}`}>
                    ★
                  </span>
                  <span className={`text-[12px] font-bold ${on ? 'text-accent-700' : 'text-ink-400'}`}>{label}</span>
                </div>
                <div className="mt-1 text-[10.5px] leading-snug text-ink-400">{desc}</div>
                <div className="mt-1 text-[10px] text-ink-300">{on ? T.achievements.unlocked : T.achievements.locked}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 排行榜 */}
      {stats.players.map((p, rank) => (
        <motion.div
          key={p.name}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(0.2, rank * 0.04) }}
          data-testid="stat-row"
          className="surface flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
        >
          <span className={`tnum w-6 text-center text-[16px] font-black ${rank === 0 ? 'text-accent-700' : 'text-ink-300'}`}>
            {rank + 1}
          </span>
          <div className="min-w-[132px]">
            <div className="text-[13.5px] font-bold text-ink-900">{p.name}</div>
            <div className="tnum text-[11px] text-ink-400">{T.replay.winsOf(p.wins, p.games)}</div>
          </div>
          <div className="min-w-[132px] flex-1">
            <div className="flex items-center justify-between text-[10.5px] text-ink-400">
              <span>{T.replay.winRate}</span>
              <span className="tnum font-bold text-ink-700">{Math.round(p.winRate * 100)}%</span>
            </div>
            <span className="mt-1 block h-[6px] w-full overflow-hidden rounded-full bg-paper-200">
              <span className="block h-full rounded-full bg-accent-500" style={{ width: `${Math.max(2, p.winRate * 100)}%` }} />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
            <span className="tnum">
              {T.replay.streak} <b className="text-ink-800">{p.streak}</b> / {T.replay.bestStreak} {p.bestStreak}
            </span>
            <span className="tnum">
              {T.replay.avgPoints} <b className="text-ink-800">{p.avgPoints.toFixed(1)}</b>
            </span>
            <span className="tnum">
              {T.replay.avgCards} <b className="text-ink-800">{p.avgCards.toFixed(1)}</b>
            </span>
            <span className="flex items-center gap-1">
              {T.replay.favorite}
              {p.favoriteGem ? (
                <span title={GEM_NAME[p.favoriteGem]}>
                  <GemIcon color={p.favoriteGem} size={14} />
                </span>
              ) : (
                <b className="text-ink-300">—</b>
              )}
            </span>
            <span className="tnum">
              {T.replay.noblesTotal} <b className="text-ink-800">{p.nobles}</b>
            </span>
            <span className="flex items-center gap-[3px]" title={T.replay.recentLabel}>
              {p.recent.map((win, i) => (
                <span
                  key={i}
                  className="h-[8px] w-[8px] rounded-full"
                  style={{ background: win ? 'var(--color-success-500)' : 'var(--color-paper-300)' }}
                />
              ))}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/** 记录页（对局列表 / 战绩统计 两个标签） */
export function RecordsScreen() {
  const back = useGame((s) => s.backToMenu);
  const version = useGame((s) => s.recordsVersion);
  const openReplay = useGame((s) => s.openReplay);
  const removeRecord = useGame((s) => s.removeRecord);
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [tab, setTab] = useState<'games' | 'stats'>('games');

  useEffect(() => {
    void listRecords().then(setRecords);
  }, [version]);

  const hasData = useMemo(() => records.length > 0, [records]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[900px] flex-col px-6 py-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => back()} className="btn-ghost rounded-lg px-2.5 py-1.5 text-[12px] font-semibold hover:border-paper-400">
          ← {T.common.backShort}
        </button>
        <span className="text-[19px] font-extrabold text-ink-900">{T.replay.title}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            data-testid="tab-games"
            onClick={() => setTab('games')}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${tab === 'games' ? 'btn-primary' : 'border border-paper-300 bg-white text-ink-500 hover:border-paper-400'}`}
          >
            {T.replay.tabGames}
          </button>
          <button
            type="button"
            data-testid="tab-stats"
            onClick={() => setTab('stats')}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${tab === 'stats' ? 'btn-primary' : 'border border-paper-300 bg-white text-ink-500 hover:border-paper-400'}`}
          >
            {T.replay.tabStats}
          </button>
        </div>
      </div>

      {tab === 'stats' && <StatsPanel records={records} />}

      {tab === 'games' && !hasData && (
        <div className="surface mt-4 rounded-2xl px-5 py-10 text-center">
          <div className="text-[13px] text-ink-500">{T.replay.empty}</div>
          <div className="mt-1 text-[11px] text-ink-400">{T.replay.emptyHint}</div>
        </div>
      )}

      {tab === 'games' && (
        <div className="mt-4 space-y-2">
          {records.map((rec, i) => {
            const winners = rec.winners.map((w) => rec.seats[w]?.name ?? T.replay.unknown).join(', ');
            return (
              <motion.div
                key={rec.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(0.2, i * 0.02) }}
                data-testid="record-row"
                className="surface flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-paper-100 text-ink-400">
                  <NavIcon name="history" size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tag">{modeLabel(rec.mode)}</span>
                    <span className="text-[13px] font-bold text-ink-900">{winners || T.replay.unknown}</span>
                    <span className="text-[11px] text-ink-400">{formatDate(rec.finishedAt)}</span>
                  </div>
                  <div className="tnum mt-1 truncate text-[11.5px] text-ink-500">
                    {rec.seats.map((s, idx) => `${s.name} ${rec.points[idx] ?? 0}`).join(' · ')} — {T.replay.turnCount(rec.turns)}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="record-view"
                  onClick={() => void openReplay(rec.id)}
                  className="btn-primary rounded-xl px-4 py-1.5 text-[12px] font-bold hover:brightness-110"
                >
                  {T.replay.view}
                </button>
                {pendingDelete === rec.id ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-[11px] text-ink-500">{T.replay.confirmDelete}</span>
                    <button
                      type="button"
                      onClick={() => {
                        void removeRecord(rec.id);
                        setPendingDelete(null);
                      }}
                      className="rounded-lg border border-paper-300 bg-white px-2 py-1 text-[11px] font-bold text-[color:var(--color-danger-500)] hover:border-paper-400"
                    >
                      {T.common.yes}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(null)}
                      className="rounded-lg border border-paper-300 bg-white px-2 py-1 text-[11px] font-bold text-ink-400 hover:border-paper-400"
                    >
                      {T.common.no}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingDelete(rec.id)}
                    className="btn-ghost rounded-xl px-3 py-1.5 text-[12px] font-semibold hover:border-paper-400"
                  >
                    {T.replay.delete}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

