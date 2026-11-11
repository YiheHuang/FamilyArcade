import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { LANGS, T, langLabel, type Lang } from '../i18n';
import { defaultLanUrl, desktopAppVersion } from '../lan';
import { useGame } from '../store';
import {
  ackUpdateFailure,
  applyUpdate,
  checkUpdate,
  downloadUpdate,
  fetchServerUpdateStatus,
  getPublishPermission,
  loadUpdateSource,
  logsSupported,
  openLogDir,
  publishLocal,
  readDiagnostics,
  saveUpdateSource,
  setPublishPermission,
  updateSourceFromLan,
  updateState,
  updatesSupported,
  uploadLocal,
  type ServerUpdateStatus,
  type UpdateCheckResult,
} from '../desktop-update';
import { playSfx, type SfxVolume } from '../ui/sfx';
import { TutorialOverlay } from '../components/Tutorial';
import { exportData, importData, pickBackupFile } from '../dataTransferIo';
import { NavIcon } from '../ui/icons';

const VOLUMES: SfxVolume[] = ['low', 'mid', 'high'];
const SCALES: Array<1 | 1.15 | 1.3> = [1, 1.15, 1.3];

function volLabel(v: SfxVolume): string {
  return v === 'low' ? T.settings.volumeLow : v === 'mid' ? T.settings.volumeMid : T.settings.volumeHigh;
}

/** 版本号比较（只比较数字段，如 2.2.0 > 2.1.3） */
function versionNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** 非游戏性设置的集中页面：语言 / 音效 / 音乐 / 动画 / 缩放 / 更新 / 关于 */
export function SettingsScreen() {
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  const back = useGame((s) => s.backToMenu);
  const pushToast = useGame((s) => s.pushToast);
  const lanServerUrl = useGame((s) => s.lanServerUrl);
  const serverUpdates = useGame((s) => s.serverUpdates);
  const version = desktopAppVersion();

  // ---------------- 更新 ----------------
  const [manualSrc, setManualSrc] = useState(() => loadUpdateSource());
  const autoSrc = updateSourceFromLan(lanServerUrl || defaultLanUrl());
  const effectiveSrc = manualSrc || autoSrc;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [staged, setStaged] = useState<{ version: string } | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerUpdateStatus | null>(null);
  const [allowUploads, setAllowUploads] = useState(false);
  const [rolledBack, setRolledBack] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  const refreshServerStatus = (): void => {
    void fetchServerUpdateStatus(effectiveSrc).then(setServerStatus);
  };

  useEffect(() => {
    void updateState().then((st) => {
      setStaged(st?.staged ?? null);
      setAllowUploads(st?.allowPublish ?? false);
      if (st?.lastFailure) {
        setRolledBack(st.lastFailure.version);
        void ackUpdateFailure();
      }
    });
    void getPublishPermission().then(setAllowUploads);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshServerStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSrc]);

  const statusText = (): string => {
    if (staged) return T.toast.updateDownloaded(staged.version);
    if (!result) return T.toast.updateCurrent(version ?? '?');
    if (result.error) return T.toast.updateFailed(result.error);
    if (result.available) return T.toast.updateAvailable(result.version ?? '?');
    return T.toast.updateUpToDate;
  };

  const serverText = (): string => {
    if (!serverUpdates && !serverStatus) return '';
    if (serverStatus?.state === 'ready') return T.toast.updateServerReady(serverStatus.version ?? '?');
    if (serverStatus?.state === 'empty') return T.toast.updateServerEmpty;
    if (serverStatus?.state === 'error')
      return serverUpdates?.updates === false ? T.toast.updateServerNone : T.toast.updateFailed(serverStatus.error ?? '');
    return serverUpdates?.updates === false ? T.toast.updateServerNone : T.toast.updateServerEmpty;
  };

  const doCheck = async (): Promise<void> => {
    setBusy(true);
    const res = await checkUpdate(effectiveSrc);
    setResult(res);
    refreshServerStatus();
    setBusy(false);
  };

  const doDownload = async (): Promise<void> => {
    setBusy(true);
    const res = await downloadUpdate(effectiveSrc);
    setBusy(false);
    if (res.ok && res.version) setStaged({ version: res.version });
    else setResult({ available: true, current: version ?? '', error: res.error });
  };

  const doPublish = async (): Promise<void> => {
    setBusy(true);
    const res = await publishLocal();
    setBusy(false);
    pushToast(res.ok ? T.toast.updatePublished(res.version ?? '?') : T.toast.updatePublishFailed(res.error ?? ''), res.ok ? 'info' : 'error');
    if (res.ok) refreshServerStatus();
  };

  const doShare = async (): Promise<void> => {
    setBusy(true);
    const res = await uploadLocal(effectiveSrc);
    setBusy(false);
    pushToast(res.ok ? T.toast.updateShared(res.version ?? '?') : T.toast.updateShareFailed(res.error ?? ''), res.ok ? 'info' : 'error');
  };

  const doCopyDiagnostics = async (): Promise<void> => {
    const info = await readDiagnostics();
    const settings = useGame.getState().settings;
    const text = info
      ? [
          `Splendor ${info.appVersion} (${info.platform}, Electron ${info.electron})`,
          `server port: ${info.serverPort} · urls: ${info.serverUrls.join(', ')}`,
          `updates dir: ${info.updatesDir}`,
          `logs dir: ${info.logsDir}`,
          `settings: ${JSON.stringify(settings)}`,
          '',
          info.logTail,
        ].join('\n')
      : 'desktop bridge unavailable';
    try {
      await navigator.clipboard.writeText(text);
      pushToast(T.toast.logsDiagnosticsCopied);
    } catch {
      pushToast(text.slice(0, 300), 'error');
    }
  };

  const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div className="flex flex-wrap items-center gap-3 border-b border-paper-200 py-3 last:border-b-0">
      <div className="w-44 shrink-0">
        <div className="text-[13px] font-bold text-ink-900">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-ink-400">{hint}</div>}
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );

  const Toggle = ({ id, on, onChange, label }: { id: string; on: boolean; onChange: (v: boolean) => void; label: string }) => (
    <button
      type="button"
      data-testid={`toggle-${id}`}
      title={label}
      onClick={() => {
        onChange(!on);
        if (!on) playSfx('gemTake');
      }}
      className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-[12px] font-bold transition-all ${
        on ? 'btn-accent' : 'border border-paper-300 bg-white text-ink-400 hover:border-paper-400'
      }`}
    >
      <span className={`h-3.5 w-6 rounded-full p-[2px] transition-colors ${on ? 'bg-white/70' : 'bg-paper-200'}`}>
        <span className={`block h-2.5 w-2.5 rounded-full transition-transform ${on ? 'translate-x-2.5 bg-accent-600' : 'bg-ink-300'}`} />
      </span>
      {on ? T.common.on : T.common.off}
    </button>
  );

  const Choice = <V extends string | number>({
    value,
    options,
    onPick,
    disabled = false,
  }: {
    value: V;
    options: Array<{ v: V; label: string; title?: string }>;
    onPick: (v: V) => void;
    disabled?: boolean;
  }) => (
    <div className={`flex flex-wrap items-center gap-1.5 ${disabled ? 'opacity-40' : ''}`}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          title={o.title}
          disabled={disabled}
          onClick={() => onPick(o.v)}
          className={`rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition-all ${
            value === o.v ? 'btn-accent' : 'border border-paper-300 bg-white text-ink-500 hover:border-paper-400'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  const newerLocally = !!(version && serverStatus?.state === 'ready' && serverStatus.version && versionNewer(version, serverStatus.version));

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-center px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="surface rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-paper-100 text-ink-500">
            <NavIcon name="gear" />
          </span>
          <span className="text-[18px] font-black text-ink-900">{T.settings.title}</span>
          <button type="button" onClick={() => back()} className="btn-ghost ml-auto rounded-lg px-3 py-1.5 text-[12px] font-semibold hover:border-paper-400">
            ← {T.common.backShort}
          </button>
        </div>

        <div className="mt-3">
          <Row label={T.settings.language} hint={T.settings.languageHint}>
            <Choice<Lang | 'system'>
              value={settings.lang}
              options={[
                { v: 'system', label: T.common.auto },
                ...LANGS.map((l) => ({ v: l as Lang | 'system', label: langLabel(l) })),
              ]}
              onPick={(v) => setSettings({ lang: v })}
            />
          </Row>

          <Row label={T.settings.sound}>
            <Toggle id="sound" on={settings.sound} onChange={(v) => setSettings({ sound: v })} label={T.settings.sound} />
            <span className="text-[11px] text-ink-400">{T.settings.soundVolume}</span>
            <Choice<SfxVolume>
              value={settings.volume}
              disabled={!settings.sound}
              options={VOLUMES.map((v) => ({ v, label: volLabel(v) }))}
              onPick={(v) => {
                setSettings({ volume: v });
                playSfx('gemTake');
              }}
            />
            <span className="mx-1 h-4 w-px bg-paper-300" />
            <span className="text-[11px] text-ink-400">{T.settings.uiClicks}</span>
            <Toggle id="uiClicks" on={settings.uiClicks} onChange={(v) => setSettings({ uiClicks: v })} label={T.settings.uiClicks} />
          </Row>

          <Row label={T.settings.music}>
            <Toggle id="music" on={settings.music} onChange={(v) => setSettings({ music: v })} label={T.settings.music} />
            <span className="text-[11px] text-ink-400">{T.settings.musicVolume}</span>
            <Choice<SfxVolume>
              value={settings.musicVolume}
              disabled={!settings.music}
              options={VOLUMES.map((v) => ({ v, label: volLabel(v) }))}
              onPick={(v) => setSettings({ musicVolume: v })}
            />
          </Row>

          <Row label={T.settings.animations} hint={T.settings.animHint}>
            <Toggle id="animations" on={settings.animations} onChange={(v) => setSettings({ animations: v })} label={T.settings.animations} />
            <span className="text-[11px] text-ink-400">{T.settings.animSpeed}</span>
            <Choice<number>
              value={settings.animSpeed}
              disabled={!settings.animations}
              options={[
                { v: 1, label: T.settings.speed1 },
                { v: 2, label: T.settings.speed2 },
                { v: 3, label: T.settings.speed3 },
              ]}
              onPick={(v) => setSettings({ animSpeed: v as 1 | 2 | 3 })}
            />
          </Row>

          <Row label={T.toast.uiScale}>
            <Choice<1 | 1.15 | 1.3>
              value={settings.uiScale}
              options={SCALES.map((s) => ({ v: s, label: `${Math.round(s * 100)}%` }))}
              onPick={(v) => setSettings({ uiScale: v })}
            />
          </Row>

          {updatesSupported() && (
            <Row label={T.toast.updateTitle} hint={T.toast.updateSourceHint}>
              <div className="flex w-full flex-col gap-2">
                {rolledBack && (
                  <div className="rounded-lg border border-paper-300 bg-paper-100 px-2.5 py-1.5 text-[11.5px] text-ink-600" data-testid="update-rolled-back">
                    {T.toast.updateRolledBack(rolledBack)}
                  </div>
                )}
                {newerLocally && (
                  <div className="rounded-lg border border-paper-300 bg-paper-100 px-2.5 py-1.5 text-[11.5px] text-ink-600" data-testid="update-newer-locally">
                    {T.toast.updateNewerLocally(version)}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={manualSrc}
                    onChange={(e) => setManualSrc(e.target.value)}
                    onBlur={() => saveUpdateSource(manualSrc)}
                    placeholder={autoSrc || 'http://192.168.1.5:8080/updates'}
                    data-testid="update-source"
                    className="w-[280px] rounded-lg border border-paper-300 bg-white px-2 py-1 text-[12px] text-ink-900 outline-none focus:border-accent-500"
                  />
                  <span className="text-[11px] text-ink-400" data-testid="update-source-kind">
                    {manualSrc ? T.toast.updateSourceManual : T.toast.updateSourceAuto}
                  </span>
                  {manualSrc && (
                    <button
                      type="button"
                      data-testid="update-source-reset"
                      onClick={() => {
                        saveUpdateSource('');
                        setManualSrc('');
                      }}
                      className="btn-ghost rounded-xl px-2.5 py-1 text-[11.5px] font-semibold hover:border-paper-400"
                    >
                      {T.toast.updateSourceReset}
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="update-check"
                    disabled={busy}
                    onClick={() => void doCheck()}
                    className="btn-ghost rounded-xl px-3 py-1.5 text-[12px] font-bold hover:border-paper-400 disabled:opacity-40"
                  >
                    {busy ? T.toast.updateChecking : T.toast.updateCheck}
                  </button>
                  {result?.available && !staged && (
                    <button
                      type="button"
                      data-testid="update-download"
                      disabled={busy}
                      onClick={() => void doDownload()}
                      className="btn-primary rounded-xl px-3 py-1.5 text-[12px] font-bold hover:brightness-110 disabled:opacity-40"
                    >
                      {T.toast.updateDownload}
                    </button>
                  )}
                  {staged && (
                    <button
                      type="button"
                      data-testid="update-restart"
                      onClick={() => void applyUpdate()}
                      className="btn-accent rounded-xl px-3 py-1.5 text-[12px] font-bold hover:brightness-105"
                    >
                      {T.toast.updateRestartNow}
                    </button>
                  )}
                </div>
                <div className="tnum text-[11.5px] text-ink-500" data-testid="update-status">
                  {statusText()}
                </div>
                {serverText() && (
                  <div className="tnum text-[11.5px] text-ink-400" data-testid="update-server-status">
                    {serverText()}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    data-testid="update-publish"
                    disabled={busy}
                    onClick={() => void doPublish()}
                    className="btn-ghost rounded-xl px-3 py-1.5 text-[12px] font-bold hover:border-paper-400 disabled:opacity-40"
                    title={T.toast.updatePublishHint}
                  >
                    {T.toast.updatePublishLocal}
                  </button>
                  <button
                    type="button"
                    data-testid="update-share"
                    disabled={busy}
                    onClick={() => void doShare()}
                    className="btn-ghost rounded-xl px-3 py-1.5 text-[12px] font-bold hover:border-paper-400 disabled:opacity-40"
                    title={T.toast.updateShareHint}
                  >
                    {T.toast.updateShareLocal}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Toggle
                    id="autoDownload"
                    on={settings.autoDownloadUpdate}
                    onChange={(v) => setSettings({ autoDownloadUpdate: v })}
                    label={T.settings.autoDownload}
                  />
                  <span className="text-[11px] text-ink-400">{T.settings.autoDownload}</span>
                  <span className="mx-1 h-4 w-px bg-paper-300" />
                  <Toggle id="allowUploads" on={allowUploads} onChange={(v) => void setPublishPermission(v).then(setAllowUploads)} label={T.toast.updateAllowUploads} />
                  <span className="text-[11px] text-ink-400">{T.toast.updateAllowUploads}</span>
                </div>
                <div className="text-[10.5px] leading-relaxed text-ink-300">
                  {T.toast.updateAllowUploadsHint}
                  <br />
                  {T.toast.updatePublishHint}
                </div>
              </div>
            </Row>
          )}

          <Row label={T.tutorial.title}>
            <button
              type="button"
              data-testid="tutorial-replay"
              onClick={() => setShowTutorial(true)}
              className="btn-ghost rounded-xl px-3 py-1.5 text-[12px] font-bold hover:border-paper-400"
            >
              {T.tutorial.replay}
            </button>
          </Row>

          <Row label={T.settings.dataBackup} hint={T.settings.dataBackupHint}>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="data-export"
                onClick={() => {
                  void exportData().then((n) => pushToast(T.toast.dataExported(n)));
                }}
                className="btn-ghost rounded-xl px-3 py-1.5 text-[12px] font-bold hover:border-paper-400"
              >
                {T.settings.dataExport}
              </button>
              <button
                type="button"
                data-testid="data-import"
                onClick={() => {
                  void pickBackupFile().then(async (text) => {
                    if (!text) return;
                    try {
                      const summary = await importData(text);
                      pushToast(T.toast.dataImported(summary.recordsAdded, summary.recordsSkipped));
                    } catch (err) {
                      pushToast(T.toast.dataImportFailed(String(err)), 'error');
                    }
                  });
                }}
                className="btn-ghost rounded-xl px-3 py-1.5 text-[12px] font-bold hover:border-paper-400"
              >
                {T.settings.dataImport}
              </button>
            </div>
          </Row>

          <Row label={T.settings.about}>
            <div className="flex w-full flex-wrap items-center gap-2">
              <div className="text-[12px] leading-relaxed text-ink-500">
                {T.settings.aboutText}
                {version && (
                  <span className="tnum ml-2 text-ink-400">
                    · {T.common.version} v{version}
                  </span>
                )}
              </div>
              {logsSupported() && (
                <span className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="logs-open"
                    onClick={() => void openLogDir()}
                    className="btn-ghost rounded-lg px-2.5 py-1 text-[11.5px] font-semibold hover:border-paper-400"
                  >
                    {T.toast.logsOpen}
                  </button>
                  <button
                    type="button"
                    data-testid="logs-diagnostics"
                    onClick={() => void doCopyDiagnostics()}
                    className="btn-ghost rounded-lg px-2.5 py-1 text-[11.5px] font-semibold hover:border-paper-400"
                  >
                    {T.toast.logsDiagnostics}
                  </button>
                </span>
              )}
            </div>
          </Row>
        </div>
      </motion.div>
      <TutorialOverlay open={showTutorial} onClose={() => setShowTutorial(false)} />
    </div>
  );
}
