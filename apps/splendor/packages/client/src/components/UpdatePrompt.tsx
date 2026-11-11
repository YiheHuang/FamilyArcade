import { AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { T } from '../i18n';
import { defaultLanUrl } from '../lan';
import { useGame } from '../store';
import {
  ackUpdateFailure,
  applyUpdate,
  checkUpdate,
  downloadUpdate,
  loadUpdateSource,
  skipUpdateVersion,
  skippedUpdateVersion,
  updateSourceFromLan,
  updateState,
  updatesSupported,
} from '../desktop-update';

/**
 * 桌面端启动时的更新提示：
 * - 启动约 3 秒后静默检查；默认自动后台下载（设置里可关）
 * - 只在"发现新版本"/"更新已就绪"/"上次更新已回滚"时出现，可"稍后"（记住该版本，不再唠叨）
 */
export function UpdatePrompt() {
  const lanServerUrl = useGame((s) => s.lanServerUrl);
  const autoDownload = useGame((s) => s.settings.autoDownloadUpdate);
  const [mode, setMode] = useState<'hidden' | 'available' | 'downloading' | 'staged' | 'rolled-back'>('hidden');
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!updatesSupported()) return;
    const src = loadUpdateSource() || updateSourceFromLan(lanServerUrl || defaultLanUrl());
    setSource(src);
    if (!src) return;
    const timer = setTimeout(() => {
      void (async () => {
        const st = await updateState();
        if (st?.lastFailure) {
          setVersion(st.lastFailure.version);
          setMode('rolled-back');
          void ackUpdateFailure();
          return;
        }
        if (st?.staged) {
          setVersion(st.staged.version);
          setMode('staged');
          return;
        }
        const res = await checkUpdate(src);
        if (!res.available || !res.version || res.version === skippedUpdateVersion()) return;
        setVersion(res.version);
        setNotes(res.notes ?? '');
        if (autoDownload) {
          setMode('downloading');
          const dl = await downloadUpdate(src);
          if (dl.ok) {
            setVersion(dl.version ?? res.version);
            setMode('staged');
            return;
          }
          setError(dl.error ?? '');
        }
        setMode('available');
      })();
    }, 3000);
    return () => clearTimeout(timer);
  }, [lanServerUrl, autoDownload]);

  if (mode === 'hidden') return null;

  const download = async (): Promise<void> => {
    setMode('downloading');
    const res = await downloadUpdate(source);
    if (res.ok) {
      setVersion(res.version ?? version);
      setMode('staged');
    } else {
      setError(res.error ?? '');
      setMode('available');
    }
  };

  const title = (): string => {
    if (mode === 'staged') return T.toast.updateStagedTitle;
    if (mode === 'rolled-back') return T.toast.updateRolledBack(version);
    return T.toast.updateAvailable(`v${version}`.replace('vv', 'v'));
  };

  return (
    <AnimatePresence>
      <div
        data-testid="update-prompt"
        data-mode={mode}
        className="surface fixed right-4 bottom-4 z-[90] w-[330px] rounded-2xl p-4"
        style={{ boxShadow: 'var(--shadow-pop)' }}
      >
        <div className="text-[13px] font-bold text-ink-900">{title()}</div>
        <div className="tnum mt-1 text-[11.5px] text-ink-500">
          {mode === 'staged' && T.toast.updateDownloaded(version)}
          {mode === 'downloading' && T.toast.updateDownloading}
          {mode === 'available' && T.toast.updateCurrent(version)}
          {mode === 'rolled-back' && T.toast.updateRolledBack(version)}
          {error && <span className="ml-1 text-[color:var(--color-danger-500)]">{T.toast.updateFailed(error)}</span>}
        </div>
        {notes && mode !== 'rolled-back' && (
          <div className="mt-1 text-[11px] leading-relaxed text-ink-400" data-testid="update-notes">
            {notes}
          </div>
        )}
        {mode !== 'downloading' && (
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              data-testid="update-later"
              onClick={() => {
                if (mode === 'available') skipUpdateVersion(version);
                setMode('hidden');
              }}
              className="btn-ghost rounded-xl px-3 py-1.5 text-[12px] font-semibold hover:border-paper-400"
            >
              {T.toast.updateRestartLater}
            </button>
            {mode === 'staged' ? (
              <button
                type="button"
                data-testid="update-restart"
                onClick={() => void applyUpdate()}
                className="btn-accent rounded-xl px-3 py-1.5 text-[12px] font-bold hover:brightness-105"
              >
                {T.toast.updateRestartNow}
              </button>
            ) : mode === 'available' ? (
              <button
                type="button"
                data-testid="update-download-now"
                onClick={() => void download()}
                className="btn-primary rounded-xl px-3 py-1.5 text-[12px] font-bold hover:brightness-110"
              >
                {T.toast.updateDownload}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </AnimatePresence>
  );
}
