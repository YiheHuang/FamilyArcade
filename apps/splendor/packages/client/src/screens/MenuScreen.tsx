import { AI_LEVELS, type AiLevel } from '@splendor/engine';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { TutorialOverlay, tutorialSeen } from '../components/Tutorial';
import { AI_DESC, AI_LABEL, T } from '../i18n';
import { desktopAppVersion } from '../lan';
import { TURN_LIMITS } from '../clock';
import { playSfx } from '../ui/sfx';
import { loadSavedGameInfo, useGame, type SeatConfig } from '../store';
import { GEM_ORDER, GemIcon } from '../ui/gems';
import { NavIcon } from '../ui/icons';

type Mode = 'local' | 'ai' | 'training';

function presetSeats(mode: Mode, count: number): SeatConfig[] {
  return Array.from({ length: count }, (_, i) => {
    const base: SeatConfig = { kind: 'human', aiLevel: 'normal', name: T.menu.playerN(i + 1) } as SeatConfig;
    if (mode === 'local') return base;
    if (mode === 'ai') return i === 0 ? base : { ...base, kind: 'ai', name: T.menu.aiN(i + 1) };
    return i === 0 ? base : { ...base, kind: 'ai', aiLevel: 'friendly', name: T.menu.aiN(i + 1) };
  });
}

export function MenuScreen() {
  const startGame = useGame((s) => s.startGame);
  const setScreen = useGame((s) => s.setScreen);
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  const resumeSavedGame = useGame((s) => s.resumeSavedGame);
  const [resumeSaved, setResumeSaved] = useState(() => loadSavedGameInfo());
  const version = desktopAppVersion();

  const [mode, setMode] = useState<Mode>('ai');
  const [playerCount, setPlayerCount] = useState(2);
  const [seats, setSeats] = useState<SeatConfig[]>(() => presetSeats('ai', 2));
  // 首次启动（或设置页点「重看」）显示三步上手
  const [showTutorial, setShowTutorial] = useState(() => !tutorialSeen() && !useGame.getState().replay);

  useEffect(() => {
    setResumeSaved(loadSavedGameInfo());
  }, []);

  const apply = (nextMode: Mode, nextCount = playerCount) => {
    setMode(nextMode);
    setPlayerCount(nextCount);
    setSeats(presetSeats(nextMode, nextCount));
  };
  const setSeat = (i: number, patch: Partial<SeatConfig>) => {
    setSeats((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const modes: Array<{ key: Mode; title: string; desc: string }> = [
    { key: 'local', title: T.menu.local, desc: T.menu.localDesc },
    { key: 'ai', title: T.menu.vsAi, desc: T.menu.vsAiDesc },
    { key: 'training', title: T.menu.training, desc: T.menu.trainingDesc },
  ];

  return (
    <div className="menu-shell mx-auto flex min-h-full w-full max-w-[1180px] flex-col justify-center px-6 py-6">
      {/* 标题 */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="text-[42px] leading-none font-black tracking-tight text-ink-900">Splendor</div>
        <div className="menu-gems mt-3 flex justify-center gap-2.5">
          {GEM_ORDER.map((c) => (
            <GemIcon key={c} color={c} size={18} />
          ))}
        </div>
      </motion.div>

      {/* 主区：左模式 / 右开局设置 */}
      <div className="mt-7 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* 左：模式 + 继续上局 */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {modes.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => apply(m.key)}
                className={`surface flex flex-col items-start gap-1 rounded-2xl px-4 py-4 text-left transition-all hover:-translate-y-0.5 ${
                  mode === m.key ? 'ring-2 ring-accent-500' : 'hover:border-paper-400'
                }`}
                style={mode === m.key ? { background: 'var(--color-accent-100)', borderColor: 'var(--color-accent-300)' } : undefined}
              >
                <span className="text-[16px] font-black text-ink-900">{m.title}</span>
                <span className="text-[11.5px] leading-snug text-ink-400">{m.desc}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setScreen('lobby')}
              className="surface flex flex-col items-start gap-1 rounded-2xl px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-paper-400"
            >
              <span className="text-[16px] font-black text-ink-900">{T.menu.lan}</span>
              <span className="text-[11.5px] leading-snug text-ink-400">{T.menu.lanDesc}</span>
            </button>
          </div>

          {resumeSaved && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{ background: 'var(--color-accent-100)', border: '1px solid var(--color-accent-300)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="tnum text-[12.5px] font-bold text-ink-900">{T.menu.resumeInfo(resumeSaved.turn)}</div>
                <div className="mt-0.5 truncate text-[11.5px] text-ink-500">
                  {resumeSaved.players.map((p) => `${p.name} ${p.points}`).join(' · ')} — {T.menu.resumeHint}
                </div>
              </div>
              <button
                type="button"
                onClick={() => resumeSavedGame()}
                className="btn-primary shrink-0 rounded-xl px-5 py-2 text-[13px] font-bold hover:brightness-110"
              >
                {T.menu.resume}
              </button>
            </motion.div>
          )}
        </div>

        {/* 右：开局设置 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface rounded-2xl p-4"
        >
          <div className="text-[12px] font-bold tracking-wide text-ink-500">{T.menu.config}</div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="w-24 text-[12px] text-ink-500">{T.menu.players}</span>
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => apply(mode, n)}
                className={`h-8 w-9 rounded-lg text-[13px] font-bold transition-all active:scale-95 ${
                  playerCount === n ? 'btn-accent' : 'border border-paper-300 bg-white text-ink-500 hover:border-paper-400'
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="w-24 text-[12px] text-ink-500">{T.menu.turnTime}</span>
            {TURN_LIMITS.map((sec) => (
              <button
                key={sec}
                type="button"
                title={sec > 0 ? `${sec}s` : T.menu.turnTimeNone}
                onClick={() => setSettings({ turnSeconds: { ...settings.turnSeconds, [mode]: sec } })}
                className={`h-8 rounded-lg px-2.5 text-[12px] font-bold transition-all active:scale-95 ${
                  settings.turnSeconds[mode] === sec ? 'btn-accent' : 'border border-paper-300 bg-white text-ink-500 hover:border-paper-400'
                }`}
              >
                {sec > 0 ? T.menu.turnSecondsLabel(sec) : T.menu.turnTimeNone}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {seats.map((s, i) => (
              <div key={i} className="menu-seat flex flex-wrap items-center gap-2 rounded-xl border border-paper-200 bg-paper-50 px-3 py-2">
                <span className="w-12 text-[11px] text-ink-400">{T.menu.seatN(i + 1)}</span>
                <input
                  value={s.name}
                  onChange={(e) => setSeat(i, { name: e.target.value })}
                  className="w-28 rounded-lg border border-paper-300 bg-white px-2 py-1 text-[12px] text-ink-900 outline-none focus:border-accent-500"
                />
                <div className="flex items-center gap-1">
                  {(['human', 'ai'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSeat(i, { kind: k })}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                        s.kind === k ? 'btn-accent' : 'border border-paper-300 bg-white text-ink-400 hover:border-paper-400'
                      }`}
                    >
                      {k === 'human' ? T.menu.human : T.menu.ai}
                    </button>
                  ))}
                </div>
                {s.kind === 'ai' && (
                  <div className="flex flex-wrap items-center gap-1">
                    {AI_LEVELS.map((lv: AiLevel) => (
                      <button
                        key={lv}
                        type="button"
                        title={AI_DESC[lv]}
                        onClick={() => setSeat(i, { aiLevel: lv })}
                        className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                          s.aiLevel === lv ? 'btn-primary' : 'border border-paper-300 bg-white text-ink-400 hover:border-paper-400'
                        }`}
                      >
                        {AI_LABEL[lv]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-500">
              <input
                type="checkbox"
                checked={settings.allowUndo}
                onChange={(e) => {
                  setSettings({ allowUndo: e.target.checked });
                  if (e.target.checked) playSfx('gemTake');
                }}
                className="accent-[color:var(--color-accent-500)]"
              />
              {T.menu.allowUndo}
            </label>
            <button
              type="button"
              onClick={() => startGame(seats, { turnSeconds: settings.turnSeconds[mode], recordMode: mode })}
              className="btn-primary rounded-xl px-7 py-2.5 text-[14px] font-black transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
            >
              {T.menu.start}
            </button>
          </div>
        </motion.div>
      </div>

      {/* 底部导航：卡牌库 / 规则速查 / 对局记录 / 设置 */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NavTile icon="cards" title={T.nav.library} desc={T.nav.libraryDesc} onClick={() => setScreen('library')} />
        <NavTile icon="book" title={T.nav.rules} desc={T.nav.rulesDesc} onClick={() => setScreen('rules')} />
        <NavTile icon="history" title={T.nav.records} desc={T.nav.recordsDesc} onClick={() => setScreen('records')} />
        <NavTile
          icon="gear"
          title={T.nav.settings}
          desc={version ? `${T.nav.settingsDesc} · v${version}` : T.nav.settingsDesc}
          onClick={() => setScreen('settings')}
        />
      </div>
      <TutorialOverlay open={showTutorial} onClose={() => setShowTutorial(false)} />
    </div>
  );
}

function NavTile({ icon, title, desc, onClick }: { icon: 'cards' | 'book' | 'history' | 'gear'; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-paper-400"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-paper-100 text-ink-500">
        <NavIcon name={icon} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-ink-900">{title}</span>
        <span className="hidden truncate text-[11px] text-ink-400 sm:block">{desc}</span>
      </span>
    </button>
  );
}
