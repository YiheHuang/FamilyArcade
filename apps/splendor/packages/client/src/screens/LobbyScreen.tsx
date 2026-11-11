import { AI_LEVELS, type AiLevel } from '@splendor/engine';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { AI_LABEL, T } from '../i18n';
import { defaultLanUrl, desktopAppVersion } from '../lan';
import { discoverySupported, scanNearbyRooms, type DiscoveredRoom } from '../desktop-update';
import { limitLabel, TURN_LIMITS } from '../clock';
import { useGame } from '../store';

const NAME_KEY = 'splendor.lan.name.v1';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
function saveName(n: string): void {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* ignore */
  }
}
function savedRejoinCode(): string | null {
  try {
    const raw = localStorage.getItem('splendor.lan.rejoin.v1');
    if (!raw) return null;
    return (JSON.parse(raw) as { code?: string }).code ?? null;
  } catch {
    return null;
  }
}

/**
 * 手机扫码加入：把"服务器地址 + 房间码"编码成一个链接，
 * 手机扫到后打开页面即自动填好房间码（?join=CODE）。
 */
function JoinQrCode({ url, code }: { url: string; code: string }) {
  const [dataUrl, setDataUrl] = useState('');
  const target = useMemo(() => {
    try {
      const u = new URL(url);
      u.searchParams.set('join', code);
      return u.toString();
    } catch {
      return url;
    }
  }, [url, code]);
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(target, { margin: 1, width: 132, errorCorrectionLevel: 'M' })
      .then((data) => {
        if (alive) setDataUrl(data);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [target]);
  if (!dataUrl) return null;
  return (
    <div className="flex flex-col items-center gap-1.5" data-testid="lobby-qr">
      <img src={dataUrl} alt={T.lobby.qrTitle} width={132} height={132} className="rounded-lg border border-paper-200 bg-white p-1" />
      <div className="text-[11px] font-semibold text-ink-500">{T.lobby.qrTitle}</div>
      <div className="max-w-[170px] text-center text-[10px] leading-snug text-ink-400">{T.lobby.qrHint}</div>
    </div>
  );
}

export function LobbyScreen() {
  const lane = useGame((s) => s.lan);
  const lanConnected = useGame((s) => s.lanConnected);
  const serverUrls = useGame((s) => s.serverUrls);
  const lanCreate = useGame((s) => s.lanCreate);
  const lanJoin = useGame((s) => s.lanJoin);
  const lanConnect = useGame((s) => s.lanConnect);
  const lanSetSeat = useGame((s) => s.lanSetSeat);
  const lanStart = useGame((s) => s.lanStart);
  const lanFillAiAndStart = useGame((s) => s.lanFillAiAndStart);
  const lanLeave = useGame((s) => s.lanLeave);
  const setScreen = useGame((s) => s.setScreen);
  const lanServerUrl = useGame((s) => s.lanServerUrl);
  const setLanServerUrl = useGame((s) => s.setLanServerUrl);

  const [name, setName] = useState(loadName());
  const [code, setCode] = useState(() => {
    try {
      const join = new URLSearchParams(window.location.search).get('join');
      return join ? join.toUpperCase().slice(0, 4) : '';
    } catch {
      return '';
    }
  });
  const [count, setCount] = useState(2);
  const [turnSeconds, setTurnSeconds] = useState(60);
  const [urlDraft, setUrlDraft] = useState(lanServerUrl);
  // 附近的房间（仅桌面壳：UDP 探针；手机浏览器走二维码）
  const [nearby, setNearby] = useState<DiscoveredRoom[] | null>(null);
  const scanNearby = async (): Promise<void> => {
    setNearby(null);
    const list = await scanNearbyRooms(1200);
    setNearby(list.filter((room) => !room.own));
  };
  useEffect(() => {
    if (discoverySupported()) void scanNearby();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const roomTurnSeconds = useGame((s) => s.turnLimitSec);
  const savedCode = savedRejoinCode();

  // 进入联机页即开始连接：状态灯如实反映连接过程，点「创建/加入」时无需等待
  useEffect(() => {
    lanConnect();
  }, [lanConnect]);

  const updateName = (v: string) => {
    setName(v);
    saveName(v);
  };
  const isHost = !!lane && lane.you === lane.hostSeat;
  const openSeats = lane?.seats.filter((s) => s.kind === 'open').length ?? 0;

  return (
    <div className="mx-auto flex min-h-full max-w-[860px] flex-col gap-4 px-6 py-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (lane ? lanLeave() : setScreen('menu'))}
          className="btn-ghost rounded-lg px-2.5 py-1.5 text-[12px] font-semibold hover:border-paper-400"
        >
          ← {lane ? T.lobby.leaveRoom : T.common.backShort}
        </button>
        <span className="text-[19px] font-extrabold text-ink-900">{T.menu.lan}</span>
        {desktopAppVersion() && <span className="text-[11px] text-ink-400">v{desktopAppVersion()}</span>}
        <span className="tag ml-auto">
          <span className={`h-1.5 w-1.5 rounded-full ${lanConnected ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          {lanConnected ? T.lobby.connected : T.lobby.connecting}
        </span>
      </div>

      {!lane && (
        <>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="surface rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[12px] text-ink-500">{T.lobby.name}</span>
              <input
                value={name}
                onChange={(e) => updateName(e.target.value)}
                placeholder={T.lobby.namePlaceholder}
                className="w-36 rounded-lg border border-paper-300 bg-white px-2.5 py-1.5 text-[13px] text-ink-900 outline-none focus:border-accent-500"
              />
              <div className="mx-1 h-6 w-px bg-paper-300" />
              <span className="text-[12px] text-ink-500">{T.lobby.seats}</span>
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`h-8 w-8 rounded-lg text-[13px] font-bold ${count === n ? 'btn-accent' : 'border border-paper-300 bg-white text-ink-500 hover:border-paper-400'}`}
                >
                  {n}
                </button>
              ))}
              <div className="mx-1 h-6 w-px bg-paper-300" />
              <span className="text-[12px] text-ink-500">{T.lobby.turnTime}</span>
              {TURN_LIMITS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  title={sec > 0 ? T.game.turnHint(sec) : T.game.turnOffHint}
                  onClick={() => setTurnSeconds(sec)}
                  className={`h-8 rounded-lg px-2 text-[12px] font-bold ${turnSeconds === sec ? 'btn-accent' : 'border border-paper-300 bg-white text-ink-500 hover:border-paper-400'}`}
                >
                  {sec === 0 ? T.menu.turnTimeNone : sec}
                </button>
              ))}
              <button type="button" onClick={() => lanCreate(name || T.game.hostName, count, turnSeconds)} className="btn-primary rounded-xl px-5 py-2 text-[13px] font-bold hover:brightness-110 active:scale-[0.98]">
                {T.lobby.create}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-[12px] text-ink-500">{T.lobby.joinSection}</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={T.lobby.codePlaceholder}
                maxLength={4}
                className="w-32 rounded-lg border border-paper-300 bg-white px-2.5 py-1.5 text-center font-mono text-[17px] tracking-[0.3em] text-ink-900 outline-none focus:border-accent-500"
              />
              <button
                type="button"
                disabled={code.length !== 4}
                onClick={() => lanJoin(code, name)}
                className="btn-ghost rounded-xl px-4 py-2 text-[13px] font-bold hover:border-paper-400 disabled:opacity-40"
              >
                {T.lobby.join}
              </button>
              {savedCode && (
                <button
                  type="button"
                  onClick={() => {
                    updateName(name || loadName());
                    lanConnect();
                  }}
                  className="text-[12px] font-semibold text-accent-700 underline-offset-2 hover:underline"
                >
                  {T.lobby.rejoin(savedCode)}
                </button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-ink-400">{T.lobby.serverUrl}</span>
              <input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder={T.lobby.serverUrlPlaceholder(defaultLanUrl())}
                className="w-72 rounded-lg border border-paper-300 bg-white px-2.5 py-1 font-mono text-[11px] text-ink-700 outline-none focus:border-accent-500"
              />
              <button type="button" onClick={() => setLanServerUrl(urlDraft)} className="btn-ghost rounded-lg px-2.5 py-1 text-[11px] font-semibold hover:border-paper-400">
                {T.lobby.apply}
              </button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="surface rounded-2xl p-5 text-[12px] leading-relaxed text-ink-500">
            <div className="mb-2 text-[13px] font-bold text-ink-800">{T.lobby.howTo}</div>
            <ol className="list-decimal space-y-1.5 pl-5">
              {T.lobby.howToLines.map((l) => (
              <li key={l}>{l}</li>
            ))}
            </ol>
            {serverUrls.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {serverUrls.map((u) => (
                  <span key={u} className="rounded-md border border-paper-300 bg-paper-50 px-2 py-1 font-mono text-[11px] text-accent-700">
                    {u}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        </>
      )}

      {discoverySupported() && !lane && (
        <div className="surface mb-3 rounded-2xl p-4" data-testid="nearby-rooms">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-ink-900">{T.lobby.nearbyTitle}</span>
            <button
              type="button"
              data-testid="nearby-refresh"
              onClick={() => void scanNearby()}
              className="btn-ghost ml-auto rounded-lg px-2.5 py-1 text-[11px] font-semibold hover:border-paper-400"
            >
              {T.lobby.nearbyRefresh}
            </button>
          </div>
          <div className="mt-2 space-y-1.5">
            {nearby === null && <div className="text-[11.5px] text-ink-400">{T.lobby.nearbyScanning}</div>}
            {nearby !== null && nearby.length === 0 && <div className="text-[11.5px] text-ink-400">{T.lobby.nearbyEmpty}</div>}
            {(nearby ?? []).map((room) => (
              <div
                key={`${room.ip}:${room.port}`}
                data-testid="nearby-room"
                className="flex flex-wrap items-center gap-2 rounded-xl border border-paper-200 bg-paper-50 px-3 py-2"
              >
                <span className="text-[12.5px] font-bold text-ink-900">{room.host}</span>
                {room.code && (
                  <span className="font-mono text-[12px] font-bold tracking-widest text-accent-700">{room.code}</span>
                )}
                <span className="text-[11px] text-ink-400">{T.lobby.nearbyMeta(room.humans, room.seats)}</span>
                <span className="tag">{room.started ? T.lobby.nearbyStarted : T.lobby.nearbyWaiting}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="font-mono text-[10.5px] text-ink-400">{room.ip}:{room.port}</span>
                  <button
                    type="button"
                    data-testid="nearby-join"
                    disabled={!room.code}
                    onClick={() => {
                      setLanServerUrl(`ws://${room.ip}:${room.port}/ws`);
                      setUrlDraft(`ws://${room.ip}:${room.port}/ws`);
                      setCode(room.code);
                      lanJoin(room.code, name);
                    }}
                    className="btn-primary rounded-lg px-3 py-1 text-[11.5px] font-bold hover:brightness-110 disabled:opacity-40"
                  >
                    {T.lobby.nearbyJoin}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lane && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="surface rounded-2xl p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] tracking-widest text-ink-400">{T.lobby.roomCode}</div>
              <div className="mt-1 font-mono text-[46px] leading-none font-black tracking-[0.3em] text-ink-900">{lane.code}</div>
            </div>
            <div className="text-right text-[11px] leading-relaxed text-ink-400">
              <div>{T.lobby.roomHint}</div>
              <div className="mt-1">{T.lobby.roomTurnTime(roomTurnSeconds > 0 ? T.game.turnOn(roomTurnSeconds) : T.menu.turnTimeNone)}</div>
              {serverUrls.length > 0 && <div className="mt-1 font-mono text-accent-700">{serverUrls.slice(0, 2).join('　')}</div>}
            </div>
            {serverUrls.length > 0 && (
              <JoinQrCode url={serverUrls.find((u) => !u.includes('172.17.')) ?? serverUrls[0]!} code={lane.code} />
            )}
          </div>

          <div className="mt-6 space-y-2">
            {lane.seats.map((s) => (
              <div key={s.seat} className="flex flex-wrap items-center gap-3 rounded-xl border border-paper-200 bg-paper-50 px-3 py-2.5">
                <span className="w-12 text-[11px] text-ink-400">{T.lobby.seatN(s.seat + 1)}</span>
                <span className="min-w-20 text-[13px] font-bold text-ink-900">{s.name}</span>
                {lane.you === s.seat && <span className="tag" style={{ borderColor: 'var(--color-accent-300)', background: 'var(--color-accent-100)', color: 'var(--color-accent-700)' }}>{T.lobby.you}</span>}
                {s.kind === 'open' && <span className="tag">{T.lobby.waiting}</span>}
                {s.kind === 'human' && lane.you !== s.seat && (
                  <span className="tag" style={s.connected ? { borderColor: '#bfe3d1', background: 'var(--color-success-100)', color: 'var(--color-success-500)' } : { borderColor: '#eec7c4', background: 'var(--color-danger-100)', color: 'var(--color-danger-500)' }}>
                    {s.connected ? T.lobby.joined : s.autoPlaying ? T.lobby.autoPlaying : T.lobby.offline}
                  </span>
                )}
                {s.kind === 'ai' && <span className="tag">{T.game.aiSeat(AI_LABEL[(s.aiLevel ?? 'normal') as AiLevel])}</span>}
                {isHost && s.kind === 'open' && (
                  <button type="button" onClick={() => lanSetSeat(s.seat, 'ai', 'normal')} className="btn-ghost rounded-lg px-2.5 py-1 text-[11px] font-semibold hover:border-paper-400">
                    {T.lobby.toAi}
                  </button>
                )}
                {isHost && s.kind === 'ai' && (
                  <div className="flex items-center gap-1">
                    {AI_LEVELS.map((lv) => (
                      <button
                        key={lv}
                        type="button"
                        onClick={() => lanSetSeat(s.seat, 'ai', lv)}
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                          (s.aiLevel ?? 'normal') === lv ? 'btn-primary' : 'border border-paper-300 bg-white text-ink-400 hover:border-paper-400'
                        }`}
                      >
                        {AI_LABEL[lv]}
                      </button>
                    ))}
                    <button type="button" onClick={() => lanSetSeat(s.seat, 'open')} className="ml-1 rounded-lg px-2 py-0.5 text-[11px] text-ink-400 hover:bg-paper-100">
                      {T.lobby.toOpen}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[12px] text-ink-400">
              {isHost ? T.game.seatsReady(lane.seats.length - openSeats, lane.seats.length) : T.game.waitingHost}
            </div>
            {isHost && (
              <div className="flex items-center gap-2">
                {openSeats > 0 && (
                  <button type="button" onClick={lanFillAiAndStart} className="btn-ghost rounded-xl px-4 py-2 text-[13px] font-semibold hover:border-paper-400">
                    {T.lobby.fillAiStart}
                  </button>
                )}
                <button
                  type="button"
                  disabled={openSeats > 0}
                  onClick={lanStart}
                  className={`rounded-xl px-6 py-2.5 text-[14px] font-black ${openSeats > 0 ? 'cursor-not-allowed border border-paper-300 bg-paper-100 text-ink-300' : 'btn-accent hover:brightness-105'}`}
                >
                  {T.lobby.start}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
