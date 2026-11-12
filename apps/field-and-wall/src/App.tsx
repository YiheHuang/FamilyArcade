import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { AiClient } from './ai/client';
import { explainMove } from './ai/ai';
import { apply, legalMoves, replay, result, setup, viewFor } from './game/engine';
import type { GameConfig, GameState, GameView, Move } from './game/types';
import { translate, type Lang } from './i18n';
import { sound } from './sound';
import {
  clearSavedGame,
  exportJson,
  hasSeenTutorial,
  loadSavedGame,
  loadSettings,
  loadStats,
  markTutorialSeen,
  recordGame,
  resetStats,
  saveCurrentGame,
  saveSettings,
  saveStats,
  type HistoryEntry,
  type SavedGame,
  type Settings,
  type Stats,
} from './storage';
import { guestWsUrl, hostWsUrl, inviteUrl, startLanServer } from './net';
import { Toast } from './ui/components';
import { GameScreen } from './ui/GameScreen';
import { Home } from './ui/Home';
import { LanGuestScreen, LanHostScreen, type LanSeatView } from './ui/LanScreen';
import { ReplayScreen } from './ui/ReplayScreen';
import { RulesScreen } from './ui/RulesScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { Setup } from './ui/Setup';
import { StatsScreen } from './ui/StatsScreen';
import { Tutorial } from './ui/Tutorial';

type Screen = 'home' | 'setup' | 'game' | 'replay' | 'stats' | 'settings' | 'rules' | 'lan';
type Mode = 'solo' | 'hotseat' | 'lan-host' | 'lan-guest';

const INITIAL_GUEST = guestParams();

interface ReplayData {
  config: GameConfig;
  moves: Move[];
  from: 'game' | 'stats';
}

interface HintState {
  move: Move;
  text: string;
}

function sameMove(a: Move, b: Move): boolean {
  return (
    a.kind === b.kind &&
    a.x === b.x &&
    a.y === b.y &&
    a.rot === b.rot &&
    a.meeple === b.meeple
  );
}

function newSeed(): string {
  return `fw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const query = new URLSearchParams(window.location.search);
  const [screen, setScreen] = useState<Screen>(INITIAL_GUEST ? 'lan' : 'home');
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);
  const [mode, setMode] = useState<Mode>(INITIAL_GUEST ? 'lan-guest' : 'solo');
  const [game, setGame] = useState<GameState | null>(null);
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSavedGame());
  const [settings, setSettings] = useState<Settings>(() => {
    const loaded = loadSettings();
    const lang = query.get('lang');
    return lang === 'zh' || lang === 'en' ? { ...loaded, lang } : loaded;
  });
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [hint, setHint] = useState<HintState | null>(null);
  const [thinking, setThinking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(
    () => query.get('tutorial') !== '0' && !hasSeenTutorial(),
  );

  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanCount, setLanCount] = useState<2 | 3 | 4>(2);
  const [hostName, setHostName] = useState('');
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<GameView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(INITIAL_GUEST?.name ?? '');
  const [guestCode, setGuestCode] = useState(INITIAL_GUEST?.code ?? '');
  const [guestRoom] = useState(INITIAL_GUEST?.room ?? '');
  const [guestSeat, setGuestSeat] = useState(-1);
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [guestStatus, setGuestStatus] = useState<'idle' | 'open' | 'closed'>('idle');
  const [reconnecting, setReconnecting] = useState(false);

  const ai = useRef(new AiClient());
  const gameRef = useRef<GameState | null>(null);
  const hostRef = useRef<LanHost | null>(null);
  const guestRef = useRef<LanGuest | null>(null);
  const startLanGameRef = useRef<() => void>(() => undefined);
  const statsRef = useRef(stats);
  const recordedRef = useRef(false);
  const hintSeq = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);
  useEffect(() => {
    sound.setLevel(settings.sound);
  }, [settings.sound]);
  useEffect(() => {
    saveSettings(settings);
    document.documentElement.lang = settings.lang === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.speed = settings.speed;
    document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full';
  }, [settings]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(settings.lang, key, params),
    [settings.lang],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const formatError = useCallback(
    (reason: string, params?: Record<string, string | number>): string => {
      if (reason === 'edge-mismatch' && params) {
        const next = {
          ...params,
          mine: t(`game.feature.${String(params.mine)}`),
          theirs: t(`game.feature.${String(params.theirs)}`),
        };
        return t(`error.${reason}`, next);
      }
      return t(`error.${reason}`, params);
    },
    [t],
  );

  const finishGame = useCallback((state: GameState) => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    const next = recordGame(statsRef.current, state);
    statsRef.current = next;
    setStats(next);
    saveStats(next);
  }, []);

  const resultForView = useCallback((view: GameView | null) => {
    if (!view || view.status !== 'ended') return null;
    return result({ ...view, bag: [] } as unknown as GameState);
  }, []);

  const broadcastLanViews = useCallback((state: GameState) => {
    const host = hostRef.current;
    if (!host) return;
    for (let seat = 1; seat < state.config.playerCount; seat++) {
      host.sendView(seat, viewFor(state));
    }
    if (state.status === 'ended') host.sendResult(result(state));
  }, []);

  const applyLanMove = useCallback(
    (move: Move) => {
      const current = gameRef.current;
      if (!current || current.status !== 'playing') return;
      const out = apply(current, move);
      if (!out.ok) {
        broadcastLanViews(current);
        return;
      }
      if (move.kind === 'place' && move.meeple != null) sound.meeple();
      if (move.kind === 'discard') sound.discard();
      else sound.tile();
      if (out.state.lastScored.length > 0) sound.score();
      hintSeq.current++;
      gameRef.current = out.state;
      setGame(out.state);
      setHint(null);
      broadcastLanViews(out.state);
      if (out.state.status === 'ended') {
        finishGame(out.state);
        sound.win();
      }
    },
    [broadcastLanViews, finishGame],
  );

  const commitMove = useCallback(
    (move: Move) => {
      const current = gameRef.current;
      if (!current) return;
      const out = apply(current, move);
      if (!out.ok) {
        showToast(formatError(out.reason, out.params));
        sound.error();
        return;
      }
      if (move.kind === 'place' && move.meeple != null) sound.meeple();
      if (move.kind === 'discard') sound.discard();
      else sound.tile();
      if (out.state.lastScored.length > 0) sound.score();
      hintSeq.current++;
      gameRef.current = out.state;
      setGame(out.state);
      setHint(null);
      if (out.state.status === 'playing') {
        saveCurrentGame(out.state);
        setSaved(loadSavedGame());
      } else {
        clearSavedGame();
        setSaved(null);
        finishGame(out.state);
        sound.win();
      }
    },
    [finishGame, formatError, showToast],
  );

  const startGame = useCallback((config: GameConfig) => {
    ai.current.cancelAll();
    const state = setup(config);
    recordedRef.current = false;
    hintSeq.current++;
    gameRef.current = state;
    setGame(state);
    setHint(null);
    setThinking(false);
    setScreen('game');
    saveCurrentGame(state);
    setSaved(loadSavedGame());
  }, []);

  const continueGame = useCallback(() => {
    const current = loadSavedGame();
    if (!current) {
      showToast(t('home.continueDesc'));
      setSaved(null);
      return;
    }
    ai.current.cancelAll();
    recordedRef.current = false;
    hintSeq.current++;
    gameRef.current = current.state;
    setGame(current.state);
    setHint(null);
    setThinking(false);
    setScreen('game');
  }, [showToast, t]);

  const startLanGame = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const count = host.players.length as 2 | 3 | 4;
    const players = host.players;
    if (players.filter((player) => player.connected).length < count) {
      showToast(t('lan.waitingAll'));
      return;
    }
    const seats = Array.from({ length: count }, (_, seat) => ({
      name:
        players.find((player) => player.seat === seat)?.name ||
        (seat === 0 ? t('lan.host') : `${t('lan.guest')} ${seat}`),
      kind: 'human' as const,
      level: 'normal' as const,
    }));
    const next = setup({ playerCount: count, seats, seed: newSeed() });
    recordedRef.current = false;
    hintSeq.current++;
    gameRef.current = next;
    setGame(next);
    setHint(null);
    setThinking(false);
    setMode('lan-host');
    setScreen('game');
    host.start();
    broadcastLanViews(next);
  }, [broadcastLanViews, showToast, t]);

  useEffect(() => {
    startLanGameRef.current = startLanGame;
  }, [startLanGame]);

  const handleHostIntent = useCallback(
    (seat: number, intent: unknown) => {
      const current = gameRef.current;
      if (!current) return;
      const payload = intent as { type?: string } | null;
      if (payload?.type === 'sync') {
        broadcastLanViews(current);
        return;
      }
      if (payload?.type === 'rematch') {
        if (current.status === 'ended') startLanGameRef.current();
        return;
      }
      if (!payload || typeof payload !== 'object') return;
      const move = payload as unknown as Move;
      if (!move.kind) return;
      applyLanMove({ ...move, seat });
    },
    [applyLanMove, broadcastLanViews],
  );

  const closeLanHost = useCallback(() => {
    const host = hostRef.current;
    hostRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanError('');
    setLanBusy(false);
    host?.close();
  }, []);

  const closeLanGuest = useCallback(() => {
    const current = guestRef.current;
    guestRef.current = null;
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    setGuestSeat(-1);
    setGuestStatus('idle');
    setGuestConnecting(false);
    setReconnecting(false);
    setLanError('');
    current?.close();
  }, []);

  const openLanHost = useCallback(async () => {
    setScreen('lan');
    setMode('lan-host');
    setLanBusy(true);
    setLanError('');
    setGame(null);
    gameRef.current = null;
    try {
      const info = await startLanServer();
      const code = newRoomCode();
      const host = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room: code,
        code,
        name: hostName.trim() || (settings.lang === 'zh' ? '主机' : 'Host'),
        maxPlayers: lanCount,
      });
      hostRef.current = host;
      setLanHost(host);
      setLanCode(code);
      host.onChange((players) => {
        setLanPlayers(players);
        host.sendLobby();
        const current = gameRef.current;
        if (current) broadcastLanViews(current);
      });
      host.onIntent((seat, intent) => handleHostIntent(seat, intent));
      host.onClose(() => {
        if (hostRef.current) setLanError(t('lan.error.closed'));
      });
      const url = inviteUrl(info, code, code, settings.lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#2b332b', light: '#fffaf0' },
        }),
      );
    } catch {
      setLanError(t('lan.error.host'));
      hostRef.current?.close();
      hostRef.current = null;
      setLanHost(null);
    } finally {
      setLanBusy(false);
    }
  }, [
    broadcastLanViews,
    handleHostIntent,
    hostName,
    lanCount,
    settings.lang,
    t,
  ]);

  const joinGuest = useCallback(async () => {
    const room = guestRoom || guestCode;
    if (!room || !guestName.trim() || guestCode.length !== 4) {
      setLanError(t('lan.error.wrong'));
      return;
    }
    const reconnect = Boolean(guestRef.current) || guestStatus === 'closed';
    setGuestConnecting(true);
    setReconnecting(reconnect);
    setLanError('');
    try {
      guestRef.current?.close();
      guestRef.current = null;
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room,
        code: guestCode,
        name: guestName.trim(),
      });
      guestRef.current = joined;
      setGuest(joined);
      setGuestSeat(joined.seat);
      setGuestStatus('open');
      setGuestStarted(false);
      if (!reconnect) setScreen('lan');
      joined.onPlayers((players) => setLanPlayers(players));
      joined.onStart((players) => {
        setGuestStarted(true);
        setGuestStatus('open');
        setLanPlayers(players);
      });
      joined.onView((payload, seat) => {
        setGuestView(payload as GameView);
        setGuestSeat(seat);
        setGuestStatus('open');
        setGuestStarted(true);
        hintSeq.current++;
        setHint(null);
        setScreen('game');
      });
      joined.onError((reason) => {
        setGuestStatus('closed');
        setLanError(reason === 'room-full' ? t('lan.error.full') : t('lan.error.wrong'));
      });
      joined.sendIntent({ type: 'sync' });
    } catch {
      setGuestStatus('closed');
      setLanError(t('lan.error.wrong'));
    } finally {
      setGuestConnecting(false);
      setReconnecting(false);
    }
  }, [guestCode, guestName, guestRoom, guestStatus, t]);

  useEffect(() => {
    if (mode !== 'lan-guest' || !guest) return;
    const timer = window.setInterval(() => {
      if (guest.status === 'closed') {
        setGuestStatus('closed');
        setLanError(t('lan.error.disconnected'));
      } else if (guest.status === 'open' && guestStatus !== 'open') {
        setGuestStatus('open');
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [guest, guestStatus, mode, t]);

  const onHome = useCallback(() => {
    if (mode === 'lan-host') {
      if (!window.confirm(t('lan.closeConfirm'))) return;
      closeLanHost();
      setGame(null);
      gameRef.current = null;
      setMode('solo');
      setScreen('home');
      setHint(null);
      setThinking(false);
      return;
    }
    if (mode === 'lan-guest') {
      if (!window.confirm(t('lan.leaveConfirm'))) return;
      closeLanGuest();
      setGame(null);
      gameRef.current = null;
      setMode('solo');
      setScreen('home');
      setHint(null);
      setThinking(false);
      return;
    }
    const current = gameRef.current;
    if (current && current.status === 'playing') {
      if (!window.confirm(t('game.confirmHome'))) return;
      saveCurrentGame(current);
      setSaved(loadSavedGame());
    }
    ai.current.cancelAll();
    hintSeq.current++;
    setScreen('home');
    setHint(null);
    setThinking(false);
  }, [closeLanGuest, closeLanHost, mode, t]);

  const onUndo = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') {
      showToast(t('lan.noUndo'));
      return;
    }
    const current = gameRef.current;
    if (!current || current.status !== 'playing' || current.moves.length === 0) return;
    const humans = current.config.seats.filter((seat) => seat.kind === 'human').length;
    let count = 1;
    if (humans === 1 && current.current === 0 && current.moves.length >= 2) count = 2;
    const nextMoves = current.moves.slice(0, Math.max(0, current.moves.length - count));
    try {
      const next = replay(current.config, nextMoves);
      ai.current.cancelAll();
      hintSeq.current++;
      gameRef.current = next;
      setGame(next);
      setHint(null);
      setThinking(false);
      saveCurrentGame(next);
      setSaved(loadSavedGame());
      sound.click();
    } catch {
      showToast(t('game.error'));
    }
  }, [mode, showToast, t]);

  const onHint = useCallback(() => {
    const view = mode === 'lan-guest' ? guestView : game ? viewFor(game) : null;
    const seat =
      mode === 'lan-guest'
        ? guestSeat
        : mode === 'lan-host'
          ? game?.current === 0
            ? 0
            : -1
          : game?.current ?? -1;
    if (!view || view.status !== 'playing' || view.current !== seat) return;
    if (view.config.seats[seat]?.kind !== 'human') return;
    const seq = ++hintSeq.current;
    setThinking(true);
    ai.current
      .choose(view, seat, 'hard', 320)
      .then((move) => {
        if (hintSeq.current !== seq) return;
        setThinking(false);
        if (!move) {
          showToast(t('game.noHint'));
          return;
        }
        const explanation = explainMove(view, seat, move);
        const params = { ...(explanation.params ?? {}) };
        if (params.type) params.type = t(`game.feature.${String(params.type)}`);
        setHint({ move, text: t(explanation.key, params) });
        showToast(t('game.hintReady'));
      })
      .catch(() => {
        if (hintSeq.current === seq) {
          setThinking(false);
          showToast(t('game.noHint'));
        }
      });
  }, [game, guestSeat, guestView, mode, showToast, t]);

  const sendGuestIntent = useCallback(
    (move: Move) => {
      const connection = guestRef.current;
      const view = guestView;
      if (!connection || !view) return;
      if (view.status !== 'playing' || view.current !== guestSeat) {
        showToast(t('lan.waitingFor', { name: view.config.seats[view.current]?.name ?? '' }));
        return;
      }
      connection.sendIntent({ ...move, seat: guestSeat });
      setHint(null);
    },
    [guestSeat, guestView, showToast, t],
  );

  const onDiscard = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    if (mode === 'lan-guest') {
      sendGuestIntent({ seat: guestSeat, kind: 'discard', x: 0, y: 0, rot: 0, meeple: null });
      return;
    }
    if (mode === 'lan-host') {
      applyLanMove({ seat: current.current, kind: 'discard', x: 0, y: 0, rot: 0, meeple: null });
      return;
    }
    commitMove({ seat: current.current, kind: 'discard', x: 0, y: 0, rot: 0, meeple: null });
  }, [applyLanMove, commitMove, guestSeat, mode, sendGuestIntent]);

  const onRematch = useCallback(() => {
    if (mode === 'lan-guest') {
      guestRef.current?.sendIntent({ type: 'rematch' });
      showToast(t('lan.rematchRequested'));
      return;
    }
    if (mode === 'lan-host') {
      startLanGameRef.current();
      return;
    }
    const current = gameRef.current;
    if (!current) return;
    startGame({ ...current.config, seed: newSeed() });
  }, [mode, showToast, startGame, t]);

  const openReplay = useCallback(() => {
    const current = mode === 'lan-guest' ? guestView : gameRef.current;
    if (!current) return;
    setReplayData({ config: current.config, moves: current.moves, from: 'game' });
    setScreen('replay');
  }, [guestView, mode]);

  const enterGuestGame = useCallback(() => {
    if (guestView) setScreen('game');
    else showToast(t('lan.waitingHost'));
  }, [guestView, showToast, t]);

  const replayFromStats = useCallback((entry: HistoryEntry) => {
    setReplayData({ config: entry.config, moves: entry.moves, from: 'stats' });
    setScreen('replay');
  }, []);

  const onReplayBack = useCallback(() => {
    setScreen(replayData?.from === 'stats' ? 'stats' : 'game');
  }, [replayData]);

  const onChangeSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  const toggleLang = useCallback(() => {
    setSettings((previous) => ({ ...previous, lang: (previous.lang === 'zh' ? 'en' : 'zh') as Lang }));
  }, []);

  const toggleSound = useCallback(() => {
    setSettings((previous) => ({
      ...previous,
      sound: previous.sound === 'on' ? 'low' : previous.sound === 'low' ? 'off' : 'on',
    }));
  }, []);

  const onExport = useCallback(async () => {
    const text = exportJson(settings, statsRef.current);
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('stats.copied'));
    } catch {
      try {
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'field-and-wall.json';
        link.click();
        URL.revokeObjectURL(url);
        showToast(t('stats.copied'));
      } catch {
        showToast(t('stats.exportEmpty'));
      }
    }
  }, [settings, showToast, t]);

  const onResetStats = useCallback(() => {
    const empty = resetStats();
    statsRef.current = empty;
    setStats(empty);
  }, []);

  const finishTutorial = useCallback(() => {
    markTutorialSeen();
    setShowTutorial(false);
  }, []);

  // Drive AI seats. The effect cancels cleanly when the game, screen or seat
  // changes; a late worker reply is ignored.
  useEffect(() => {
    if (!game || screen !== 'game' || game.status !== 'playing') return;
    const seat = game.config.seats[game.current];
    if (!seat || seat.kind !== 'ai') return;
    let cancelled = false;
    const snapshot = game;
    const view = viewFor(snapshot);
    const budget =
      seat.level === 'hard' ? 850 : seat.level === 'normal' ? 300 : seat.level === 'easy' ? 100 : 80;
    setThinking(true);
    const timer = window.setTimeout(() => {
      ai.current
        .choose(view, snapshot.current, seat.level, budget)
        .then((move) => {
          if (cancelled) return;
          const legal = legalMoves(snapshot, snapshot.current);
          const chosen = move && legal.some((candidate) => sameMove(candidate, move)) ? move : legal[0];
          if (!chosen) {
            setThinking(false);
            return;
          }
          window.setTimeout(() => {
            if (cancelled) return;
            setThinking(false);
            commitMove(chosen);
          }, 360);
        })
        .catch(() => {
          if (cancelled) return;
          const fallback = legalMoves(snapshot, snapshot.current)[0];
          setThinking(false);
          if (fallback) commitMove(fallback);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [game, screen, commitMove]);

  const shownView = mode === 'lan-guest' ? guestView : game ? viewFor(game) : null;
  const shownResult = mode === 'lan-guest' ? resultForView(guestView) : game ? result(game) : null;
  const localSeat =
    mode === 'lan-guest'
      ? guestSeat
      : mode === 'lan-host'
        ? 0
        : game
          ? game.config.seats.filter((seat) => seat.kind === 'human').length === 1
            ? game.config.seats.findIndex((seat) => seat.kind === 'human')
            : null
          : null;
  const myTurn =
    mode === 'lan-guest'
      ? guestView?.current === guestSeat
      : mode === 'lan-host'
        ? game?.current === 0
        : true;
  const lanSeats: LanSeatView[] =
    mode === 'lan-guest' && lanPlayers.length === 0 && guestView
      ? guestView.config.seats.map((seat, i) => ({
          seat: i,
          name: seat.name,
          connected: true,
          host: i === 0,
        }))
      : lanPlayers;
  const lanBar =
    mode === 'lan-host' && lanCode
      ? {
          role: 'host' as const,
          code: lanCode,
          seat: 0,
          seats: lanSeats,
          connected: lanPlayers.filter((player) => player.connected).length >= lanCount,
        }
      : mode === 'lan-guest' && guest
        ? {
            role: 'guest' as const,
            code: guestCode,
            seat: guestSeat,
            seats: lanSeats,
            connected: guestStatus === 'open' && guestStarted,
            onReconnect: guestStatus === 'closed' ? joinGuest : undefined,
            reconnecting,
          }
        : undefined;

  const closeHostToHome = useCallback(() => {
    if (lanHost && !window.confirm(t('lan.closeConfirm'))) return;
    closeLanHost();
    setGame(null);
    gameRef.current = null;
    setMode('solo');
    setScreen('home');
  }, [closeLanHost, lanHost, t]);

  const copyLanInvite = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(lanInvite);
      showToast(t('lan.copied'));
    } catch {
      showToast(lanInvite);
    }
  }, [lanInvite, showToast, t]);

  return (
    <div className="app">
      {screen === 'home' && (
        <Home
          t={t}
          lang={settings.lang}
          saved={saved}
          soundLevel={settings.sound}
          onContinue={continueGame}
          onSolo={() => {
            setMode('solo');
            setScreen('setup');
          }}
          onHotseat={() => {
            setMode('hotseat');
            setScreen('setup');
          }}
          onLan={() => {
            closeLanHost();
            closeLanGuest();
            setMode('lan-host');
            setGame(null);
            gameRef.current = null;
            setScreen('lan');
          }}
          onLanJoin={() => {
            closeLanHost();
            closeLanGuest();
            setMode('lan-guest');
            setGame(null);
            gameRef.current = null;
            setLanError('');
            setScreen('lan');
          }}
          onStats={() => setScreen('stats')}
          onRules={() => setScreen('rules')}
          onSettings={() => setScreen('settings')}
          onTutorial={() => setShowTutorial(true)}
          onToggleLang={toggleLang}
          onToggleSound={toggleSound}
        />
      )}

      {screen === 'setup' && (
        <Setup
          t={t}
          lang={settings.lang}
          mode={mode === 'hotseat' ? 'hotseat' : 'solo'}
          onStart={startGame}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'game' && shownView && (
        <GameScreen
          t={t}
          lang={settings.lang}
          state={shownView}
          result={shownResult}
          settings={settings}
          localSeat={localSeat}
          myTurn={myTurn}
          allowUndo={mode !== 'lan-host' && mode !== 'lan-guest'}
          lan={lanBar}
          hint={hint}
          thinking={thinking}
          onMove={
            mode === 'lan-guest'
              ? sendGuestIntent
              : mode === 'lan-host'
                ? applyLanMove
                : commitMove
          }
          onUndo={onUndo}
          onHint={onHint}
          onDiscard={onDiscard}
          onHome={onHome}
          onRematch={onRematch}
          onReplay={openReplay}
          onToast={showToast}
        />
      )}

      {screen === 'lan' && mode === 'lan-host' && (
        <LanHostScreen
          t={t}
          lang={settings.lang}
          playerCount={lanCount}
          onPlayerCount={setLanCount}
          hostName={hostName}
          onHostName={setHostName}
          created={Boolean(lanHost)}
          code={lanCode}
          invite={lanInvite}
          qr={lanQr}
          seats={lanPlayers}
          busy={lanBusy}
          error={lanError}
          onCopy={copyLanInvite}
          onCreate={openLanHost}
          onStart={startLanGame}
          onClose={closeHostToHome}
          onBack={closeHostToHome}
        />
      )}

      {screen === 'lan' && mode === 'lan-guest' && (
        <LanGuestScreen
          t={t}
          lang={settings.lang}
          room={guestRoom}
          code={guestCode}
          name={guestName}
          onCode={setGuestCode}
          onName={setGuestName}
          onJoin={joinGuest}
          onReconnect={joinGuest}
          onEnter={enterGuestGame}
          onLeave={() => {
            if (guest && !window.confirm(t('lan.leaveConfirm'))) return;
            closeLanGuest();
            setScreen('home');
            setMode('solo');
          }}
          connecting={guestConnecting}
          joined={Boolean(guest)}
          seat={guestSeat}
          seats={lanSeats}
          started={guestStarted}
          closed={guestStatus === 'closed'}
          error={lanError}
          onBack={() => {
            if (guest && !window.confirm(t('lan.leaveConfirm'))) return;
            closeLanGuest();
            setScreen('home');
            setMode('solo');
          }}
        />
      )}

      {screen === 'replay' && replayData && (
        <ReplayScreen
          t={t}
          lang={settings.lang}
          config={replayData.config}
          moves={replayData.moves}
          onBack={onReplayBack}
        />
      )}

      {screen === 'stats' && (
        <StatsScreen
          t={t}
          lang={settings.lang}
          stats={stats}
          onBack={() => setScreen('home')}
          onReset={onResetStats}
          onExport={onExport}
          onReplay={replayFromStats}
        />
      )}

      {screen === 'settings' && (
        <SettingsScreen
          t={t}
          lang={settings.lang}
          settings={settings}
          onChange={onChangeSettings}
          onBack={() => setScreen('home')}
          onResetStats={onResetStats}
          onExport={onExport}
        />
      )}

      {screen === 'rules' && (
        <RulesScreen
          t={t}
          onBack={() => setScreen('home')}
          onTutorial={() => setShowTutorial(true)}
        />
      )}

      <Toast message={toast} />
      {showTutorial && <Tutorial t={t} onDone={finishTutorial} onSkip={finishTutorial} />}
    </div>
  );
}
