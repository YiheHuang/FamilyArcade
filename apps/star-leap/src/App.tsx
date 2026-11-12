import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { AiClient } from './ai/client';
import { apply, legalMoves, replay, setup } from './game/engine';
import { viewFor, type GameConfig, type GameState, type Move } from './game/types';
import { translate, type Lang } from './i18n';
import {
  copyText,
  getClientToken,
  guestWsUrl,
  hostWsUrl,
  inviteUrl,
  setClientToken,
  startLanServer,
} from './net';
import { sound } from './sound';
import {
  addHistoryEntry,
  clearHistory,
  clearSavedGame,
  hasSeenTutorial,
  loadHistory,
  loadSavedGame,
  loadSettings,
  loadStats,
  markTutorialSeen,
  recordWin,
  resetStats,
  saveCurrentGame,
  saveSettings,
  saveStats,
  type HistoryEntry,
  type SavedGame,
  type Settings,
  type Stats,
} from './storage';
import { Toast } from './ui/components';
import { GameScreen } from './ui/GameScreen';
import { Home } from './ui/Home';
import { LanGuestLobby, LanHostLobby } from './ui/LanLobby';
import { ReplayScreen } from './ui/ReplayScreen';
import { RulesScreen } from './ui/RulesScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { Setup } from './ui/Setup';
import { StatsScreen } from './ui/StatsScreen';
import { Tutorial } from './ui/Tutorial';

type Screen = 'home' | 'setup' | 'game' | 'replay' | 'stats' | 'settings' | 'rules' | 'lan';
type Mode = 'solo' | 'hotseat' | 'lan-host' | 'lan-guest';
type LanCount = 2 | 3 | 4;

function isLan(mode: Mode): boolean {
  return mode === 'lan-host' || mode === 'lan-guest';
}

function hostErrorText(error: unknown, t: (key: string, params?: Record<string, string | number>) => string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('handshake') || message.includes('timed out')) return t('lan.handshakeError');
  if (message.includes('WebSocket') || message.includes('connection failed') || message.includes('closed')) {
    return t('lan.relayError');
  }
  return t('lan.unknownError', { message });
}

function guestErrorText(error: unknown, t: (key: string, params?: Record<string, string | number>) => string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'wrong-code' || message.includes('rejected')) return t('lan.wrongCode');
  if (message === 'room-full' || message.includes('room-full')) return t('lan.roomFull');
  if (message.includes('did not answer') || message.includes('timed out') || message.includes('no answer')) {
    return t('lan.noAnswer');
  }
  if (message.includes('connection failed') || message.includes('WebSocket')) return t('lan.relayError');
  if (message.includes('closed')) return t('lan.guestClosed');
  return t('lan.unknownError', { message });
}

export default function App() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const invite = useMemo(() => guestParams(), []);
  const [screen, setScreen] = useState<Screen>('home');
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);
  const [mode, setMode] = useState<Mode>('solo');
  const [game, setGame] = useState<GameState | null>(null);
  const [localSeat, setLocalSeat] = useState<number | null>(null);
  const [replayData, setReplayData] = useState<{ config: GameConfig; moves: Move[] } | null>(null);
  const [replayReturn, setReplayReturn] = useState<Screen>('game');
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSavedGame());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [settings, setSettings] = useState<Settings>(() => {
    const loaded = loadSettings();
    const lang = query.get('lang');
    return lang === 'zh' || lang === 'en' ? { ...loaded, lang } : loaded;
  });
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [hint, setHint] = useState<Move | null>(null);
  const [thinking, setThinking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(
    () => !invite && query.get('tutorial') !== '0' && !hasSeenTutorial(),
  );

  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanRoom, setLanRoom] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [lanCount, setLanCount] = useState<LanCount>(2);

  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestSeat, setGuestSeat] = useState(-1);
  const [guestName, setGuestName] = useState(() => invite?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => invite?.code ?? '');
  const [guestRoom] = useState(() => invite?.room ?? '');
  const [guestToken, setGuestToken] = useState(() => getClientToken());
  const [guestConnecting, setGuestConnecting] = useState(false);

  const ai = useRef(new AiClient());
  const gameRef = useRef<GameState | null>(null);
  const statsRef = useRef(stats);
  const recordedRef = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const modeRef = useRef<Mode>(mode);
  const hostRef = useRef<LanHost | null>(null);
  const guestRef = useRef<LanGuest | null>(null);
  const autoJoinRef = useRef(false);
  const openingRef = useRef(false);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    guestRef.current = guest;
  }, [guest]);
  useEffect(() => {
    sound.setLevel(settings.sound);
  }, [settings.sound]);
  useEffect(() => {
    saveSettings(settings);
    document.documentElement.lang = settings.lang === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.speed = settings.speed;
    document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full';
  }, [settings]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(settings.lang, key, params),
    [settings.lang],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const finishGame = useCallback((state: GameState) => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    setHistory(addHistoryEntry(state));
    if (state.winner == null) {
      const next: Stats = {
        ...statsRef.current,
        games: statsRef.current.games + 1,
        currentStreak: 0,
        lastWinner: null,
      };
      statsRef.current = next;
      setStats(next);
      saveStats(next);
      return;
    }
    const winner = state.winner;
    const next = recordWin(statsRef.current, state.config.seats[winner].name, winner);
    statsRef.current = next;
    setStats(next);
    saveStats(next);
  }, []);

  const commitMove = useCallback(
    (move: Move) => {
      const current = gameRef.current;
      if (!current) return;
      const out = apply(current, move);
      if (!out.ok) {
        showToast(t(`error.${out.reason}`));
        sound.error();
        return;
      }
      if (move.kind === 'jump') {
        for (let i = 0; i < Math.max(1, move.path.length - 2); i++) {
          window.setTimeout(() => sound.jump(i), i * 70);
        }
      } else if (move.kind === 'step') {
        sound.step();
      }
      gameRef.current = out.state;
      setGame(out.state);
      setHint(null);
      if (out.state.status === 'playing') {
        if (!isLan(modeRef.current)) {
          saveCurrentGame(out.state);
          setSaved(loadSavedGame());
        }
      } else {
        clearSavedGame();
        setSaved(null);
        finishGame(out.state);
        sound.win();
      }
    },
    [finishGame, showToast, t],
  );

  const localSeatFor = useCallback((config: GameConfig): number | null => {
    const humans = config.seats
      .map((seat, index) => (seat.kind === 'human' ? index : -1))
      .filter((index) => index >= 0);
    return humans.length === 1 ? humans[0] : null;
  }, []);

  const startGame = useCallback(
    (config: GameConfig) => {
      ai.current.cancelAll();
      const state = setup(config);
      const allHuman = config.seats.every((seat) => seat.kind === 'human');
      setMode(allHuman ? 'hotseat' : 'solo');
      modeRef.current = allHuman ? 'hotseat' : 'solo';
      setLocalSeat(localSeatFor(config));
      recordedRef.current = false;
      gameRef.current = state;
      setGame(state);
      setHint(null);
      setThinking(false);
      setScreen('game');
      saveCurrentGame(state);
      setSaved(loadSavedGame());
    },
    [localSeatFor],
  );

  const startLanGame = useCallback(
    (existing?: GameConfig) => {
      if (!lanHost) return;
      const count = existing?.playerCount ?? lanCount;
      const config: GameConfig =
        existing ?? {
          playerCount: count,
          seats: Array.from({ length: count }, (_, seat) => {
            const player = lanPlayers.find((item) => item.seat === seat);
            return {
              name:
                seat === 0
                  ? settings.lang === 'zh'
                    ? '主机'
                    : 'Host'
                  : player?.name || (settings.lang === 'zh' ? `玩家 ${seat + 1}` : `Player ${seat + 1}`),
              kind: 'human' as const,
              level: 'normal' as const,
            };
          }),
        };
      const state = setup(config);
      recordedRef.current = false;
      gameRef.current = state;
      setGame(state);
      setMode('lan-host');
      modeRef.current = 'lan-host';
      setLocalSeat(0);
      setHint(null);
      setThinking(false);
      setScreen('game');
      clearSavedGame();
      setSaved(null);
      lanHost.start({ config });
    },
    [lanCount, lanHost, lanPlayers, settings.lang],
  );

  const continueGame = useCallback(() => {
    const current = loadSavedGame();
    if (!current) {
      showToast(t('home.continueDesc'));
      setSaved(null);
      return;
    }
    const allHuman = current.state.config.seats.every((seat) => seat.kind === 'human');
    gameRef.current = current.state;
    recordedRef.current = false;
    setMode(allHuman ? 'hotseat' : 'solo');
    setLocalSeat(localSeatFor(current.state.config));
    setGame(current.state);
    setHint(null);
    setThinking(false);
    setScreen('game');
  }, [localSeatFor, showToast, t]);

  const closeLan = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
    setLanCode('');
    setLanRoom('');
    setLanInvite('');
    setLanQr('');
    setLanError('');
    setLanBusy(false);
    guestRef.current?.close();
    guestRef.current = null;
    setGuest(null);
    setGuestStarted(false);
    setGuestSeat(-1);
    setGuestConnecting(false);
    setLocalSeat(null);
  }, []);

  const onHome = useCallback(() => {
    const currentMode = modeRef.current;
    if (isLan(currentMode)) {
      if (gameRef.current?.status === 'playing') {
        const message = currentMode === 'lan-host' ? t('lan.hostLeaveConfirm') : t('lan.guestLeaveConfirm');
        if (!window.confirm(message)) return;
      }
      closeLan();
      setScreen('home');
      setHint(null);
      return;
    }
    if (game && game.status === 'playing') {
      if (!window.confirm(t('game.confirmHome'))) return;
      saveCurrentGame(game);
      setSaved(loadSavedGame());
    }
    setScreen('home');
    setHint(null);
  }, [closeLan, game, t]);

  const onUndo = useCallback(() => {
    if (isLan(modeRef.current)) return;
    const current = gameRef.current;
    if (!current || current.moves.length === 0 || current.status === 'ended') return;
    let count = 1;
    if (current.config.seats.filter((s) => s.kind === 'human').length === 1) {
      if (current.current === 0 && current.moves.length >= 2) count = 2;
    }
    const nextMoves = current.moves.slice(0, Math.max(0, current.moves.length - count));
    try {
      const next = replay(current.config, nextMoves);
      ai.current.cancelAll();
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
  }, [showToast, t]);

  const onHint = useCallback(() => {
    if (isLan(modeRef.current)) return;
    const current = gameRef.current;
    if (!current || current.status !== 'playing') return;
    if (current.config.seats[current.current].kind !== 'human') return;
    setThinking(true);
    ai.current
      .choose(current, current.current, 'hard', 320)
      .then((move) => {
        setThinking(false);
        if (move) {
          setHint(move);
          showToast(t('game.hintReady'));
        } else {
          showToast(t('game.noHint'));
        }
      })
      .catch(() => {
        setThinking(false);
        showToast(t('game.noHint'));
      });
  }, [showToast, t]);

  const sendIntent = useCallback((intent: unknown) => {
    guestRef.current?.sendIntent(intent);
    sound.click();
  }, []);

  const onGameMove = useCallback(
    (move: Move) => {
      if (modeRef.current === 'lan-guest') {
        sendIntent({ type: 'move', from: move.from, to: move.to, turn: gameRef.current?.turn });
        return;
      }
      commitMove(move);
    },
    [commitMove, sendIntent],
  );

  const onPass = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    if (modeRef.current === 'lan-guest') {
      sendIntent({ type: 'pass', turn: current.turn });
      return;
    }
    const pass: Move = { seat: current.current, from: -1, to: -1, path: [], kind: 'pass' };
    commitMove(pass);
  }, [commitMove, sendIntent]);

  const onRematch = useCallback(() => {
    if (!gameRef.current) return;
    ai.current.cancelAll();
    if (modeRef.current === 'lan-host') {
      startLanGame(gameRef.current.config);
    } else if (!isLan(modeRef.current)) {
      startGame(gameRef.current.config);
    }
  }, [startGame, startLanGame]);

  const onReplay = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    setReplayData({ config: current.config, moves: current.moves });
    setReplayReturn('game');
    setScreen('replay');
  }, []);

  const onReplayHistory = useCallback((entry: HistoryEntry) => {
    setReplayData({ config: entry.config, moves: entry.moves });
    setReplayReturn('stats');
    setScreen('replay');
  }, []);

  useEffect(() => {
    if (!game || screen !== 'game' || game.status !== 'playing') return;
    if (mode !== 'solo' && mode !== 'hotseat') return;
    const seat = game.config.seats[game.current];
    if (!seat || seat.kind !== 'ai') return;
    let cancelled = false;
    setThinking(true);
    const budget = seat.level === 'hard' ? 800 : seat.level === 'normal' ? 300 : seat.level === 'easy' ? 100 : 80;
    const snapshot = game;
    const timer = window.setTimeout(() => {
      ai.current
        .choose(snapshot, snapshot.current, seat.level, budget)
        .then((move) => {
          if (cancelled) return;
          const applyIt = (): void => {
            if (cancelled) return;
            setThinking(false);
            if (move) commitMove(move);
            else commitMove({ seat: snapshot.current, from: -1, to: -1, path: [], kind: 'pass' });
          };
          window.setTimeout(applyIt, 420);
        })
        .catch(() => {
          if (!cancelled) {
            setThinking(false);
            const fallback = legalMoves(snapshot, snapshot.current)[0];
            if (fallback) commitMove(fallback);
          }
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setThinking(false);
    };
  }, [commitMove, game, mode, screen]);

  // Host stays authoritative: after every state change, send each guest the
  // full (perfect-information) view for their own seat. The same effect fires
  // when a guest reconnects, so a fresh view is pushed to the rejoin.
  useEffect(() => {
    if (mode !== 'lan-host' || !lanHost || !game || !lanHost.started) return;
    for (let seat = 1; seat < game.config.playerCount; seat++) {
      if (lanPlayers.find((player) => player.seat === seat)?.connected) {
        lanHost.sendView(seat, viewFor(game, seat));
      }
    }
    if (game.status === 'ended') {
      lanHost.sendResult({ winner: game.winner, reason: game.endReason });
    }
  }, [game, lanHost, lanPlayers, mode]);

  const handleLanIntent = useCallback(
    (seat: number, intent: unknown) => {
      const current = gameRef.current;
      if (!current || current.status !== 'playing' || current.current !== seat) return;
      const payload =
        intent && typeof intent === 'object'
          ? (intent as { type?: unknown; from?: unknown; to?: unknown; turn?: unknown })
          : null;
      if (!payload) return;
      if (typeof payload.turn === 'number' && payload.turn !== current.turn) return;
      if (payload.type === 'pass') {
        if (legalMoves(current, seat).length === 0) {
          commitMove({ seat, from: -1, to: -1, path: [], kind: 'pass' });
        }
        return;
      }
      const from = Number(payload.from);
      const to = Number(payload.to);
      if (!Number.isInteger(from) || !Number.isInteger(to)) return;
      const move = legalMoves(current, seat).find((item) => item.from === from && item.to === to);
      if (move) commitMove(move);
      else showToast(t('game.error'));
    },
    [commitMove, showToast, t],
  );

  const openLanHost = useCallback(async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    closeLan();
    setScreen('lan');
    setMode('lan-host');
    modeRef.current = 'lan-host';
    setLocalSeat(0);
    setLanBusy(true);
    setLanError('');
    try {
      const info = await startLanServer();
      const code = newRoomCode();
      const room = code;
      const host = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room,
        code,
        name: settings.lang === 'zh' ? '主机' : 'Host',
        maxPlayers: 4,
      });
      hostRef.current = host;
      setLanHost(host);
      setLanCode(code);
      setLanRoom(room);
      host.onChange((players) => {
        setLanPlayers(players);
        host.sendLobby();
      });
      host.onIntent((seat, intent) => handleLanIntent(seat, intent));
      host.onClose(() => setLanError(t('lan.hostClosed')));
      const url = inviteUrl(info, room, code, settings.lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 360,
          color: { dark: '#1d2430', light: '#fffdf8' },
        }),
      );
    } catch (error) {
      setLanError(hostErrorText(error, t));
      hostRef.current?.close();
      hostRef.current = null;
      setLanHost(null);
    } finally {
      openingRef.current = false;
      setLanBusy(false);
    }
  }, [closeLan, handleLanIntent, settings.lang, t]);

  const joinGuest = useCallback(async () => {
    if (!guestRoom || !guestName.trim()) return;
    setGuestConnecting(true);
    setLanError('');
    try {
      setClientToken(guestToken);
      guestRef.current?.close();
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room: guestRoom,
        code: guestCode,
        name: guestName.trim(),
      });
      guestRef.current = joined;
      setGuest(joined);
      setGuestSeat(joined.seat);
      setLocalSeat(joined.seat >= 0 ? joined.seat : null);
      setGuestToken(getClientToken());
      joined.onView((payload, seat) => {
        const state = payload as GameState;
        gameRef.current = state;
        setGame(state);
        setGuestStarted(true);
        setGuestSeat(seat);
        setLocalSeat(seat);
      });
      joined.onStart((players) => {
        setGuestStarted(true);
        setLanPlayers(players);
        if (joined.seat >= 0) {
          setGuestSeat(joined.seat);
          setLocalSeat(joined.seat);
        }
      });
      joined.onPlayers((players) => setLanPlayers(players));
      joined.onError((reason) => setLanError(guestErrorText(reason, t)));
      joined.onResult(() => undefined);
      setScreen('lan');
      setMode('lan-guest');
      modeRef.current = 'lan-guest';
    } catch (error) {
      setLanError(guestErrorText(error, t));
      guestRef.current?.close();
      guestRef.current = null;
      setGuest(null);
    } finally {
      setGuestConnecting(false);
    }
  }, [guestCode, guestName, guestRoom, guestToken, t]);

  const reconnectGuest = useCallback(() => {
    guestRef.current?.close();
    guestRef.current = null;
    setGuest(null);
    setGame(null);
    setGuestStarted(false);
    setGuestSeat(-1);
    setScreen('lan');
    void joinGuest();
  }, [joinGuest]);

  useEffect(() => {
    if (!guestRoom || autoJoinRef.current) return;
    autoJoinRef.current = true;
    setScreen('lan');
    setMode('lan-guest');
    modeRef.current = 'lan-guest';
    const timer = window.setTimeout(() => {
      void joinGuest();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [guestRoom, joinGuest]);

  useEffect(() => {
    if (!guest) return;
    const timer = window.setInterval(() => {
      if (guest.status === 'closed') {
        setLanError((previous) => previous || t('lan.guestClosed'));
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [guest, t]);

  const copy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      showToast(ok ? t('lan.copied') : text);
    },
    [showToast, t],
  );

  const retryLan = useCallback(() => {
    void openLanHost();
  }, [openLanHost]);

  const onChangeSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleLang = useCallback(() => {
    setSettings((prev) => ({ ...prev, lang: (prev.lang === 'zh' ? 'en' : 'zh') as Lang }));
  }, []);

  const toggleSound = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      sound: prev.sound === 'on' ? 'low' : prev.sound === 'low' ? 'off' : 'on',
    }));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (event.key.toLowerCase() === 'm') toggleSound();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSound]);

  const onResetStats = useCallback(() => {
    const empty = resetStats();
    statsRef.current = empty;
    setStats(empty);
    clearHistory();
    setHistory([]);
  }, []);

  const finishTutorial = useCallback(() => {
    markTutorialSeen();
    setShowTutorial(false);
  }, []);

  const home = useMemo(
    () => (
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
          void openLanHost();
        }}
        onStats={() => setScreen('stats')}
        onRules={() => setScreen('rules')}
        onSettings={() => setScreen('settings')}
        onToggleLang={toggleLang}
        onToggleSound={toggleSound}
      />
    ),
    [continueGame, openLanHost, saved, settings.lang, settings.sound, t, toggleLang, toggleSound],
  );

  const guestConnected = guestSeat >= 0 && (guestStarted || Boolean(guest));
  const onlineGuests = lanPlayers.filter((player) => player.seat > 0 && player.seat < lanCount && player.connected).length;
  const canStartLan = Boolean(lanHost) && !lanBusy && lanCount >= 2 && onlineGuests >= lanCount - 1;
  const extraGuests = lanPlayers.filter((player) => player.seat >= lanCount && player.connected).length;

  return (
    <div className="app">
      {screen === 'home' && home}
      {screen === 'setup' && (
        <Setup
          t={t}
          lang={settings.lang}
          mode={mode === 'solo' ? 'solo' : 'hotseat'}
          onStart={startGame}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'lan' && mode === 'lan-guest' && (
        <LanGuestLobby
          t={t}
          busy={guestConnecting}
          error={lanError}
          room={guestRoom}
          code={guestCode}
          name={guestName}
          token={guestToken}
          players={lanPlayers}
          seat={guestSeat}
          count={game?.config.playerCount ?? lanCount}
          joined={guestConnected}
          started={guestStarted}
          onName={setGuestName}
          onCode={setGuestCode}
          onToken={setGuestToken}
          onJoin={() => {
            void joinGuest();
          }}
          onReconnect={reconnectGuest}
          onEnter={() => setScreen('game')}
          onCopyToken={() => {
            void copy(guestToken);
          }}
          onBack={() => {
            closeLan();
            setScreen('home');
          }}
        />
      )}
      {screen === 'lan' && mode === 'lan-host' && (
        <LanHostLobby
          t={t}
          busy={lanBusy}
          error={lanError}
          code={lanCode}
          room={lanRoom}
          invite={lanInvite}
          qr={lanQr}
          players={lanPlayers}
          count={lanCount}
          canStart={canStartLan}
          missing={Math.max(0, lanCount - 1 - onlineGuests)}
          extra={extraGuests}
          onCount={setLanCount}
          onStart={() => startLanGame()}
          onCopyInvite={() => {
            void copy(lanInvite);
          }}
          onCopyCode={() => {
            void copy(lanCode);
          }}
          onRetry={retryLan}
          onBack={() => {
            closeLan();
            setScreen('home');
          }}
        />
      )}
      {screen === 'game' && game && (
        <GameScreen
          t={t}
          lang={settings.lang}
          state={game}
          settings={settings}
          hint={hint}
          thinking={thinking}
          onMove={onGameMove}
          onUndo={onUndo}
          onHint={onHint}
          onPass={onPass}
          onHome={onHome}
          onRematch={onRematch}
          onReplay={onReplay}
          localSeat={localSeat}
          networked={isLan(mode)}
          isGuest={mode === 'lan-guest'}
          canRematch={mode !== 'lan-guest'}
          lanNote={
            mode === 'lan-host'
              ? t('lan.noteHost', { seat: 1 })
              : mode === 'lan-guest'
                ? t('lan.noteGuest', { seat: (localSeat ?? 0) + 1 })
                : ''
          }
          lanError={isLan(mode) ? lanError : ''}
          onReconnect={mode === 'lan-guest' ? reconnectGuest : undefined}
        />
      )}
      {screen === 'replay' && replayData && (
        <ReplayScreen
          t={t}
          lang={settings.lang}
          config={replayData.config}
          moves={replayData.moves}
          onBack={() => setScreen(replayReturn)}
        />
      )}
      {screen === 'stats' && (
        <StatsScreen
          t={t}
          lang={settings.lang}
          stats={stats}
          history={history}
          onReplayHistory={onReplayHistory}
          onBack={() => setScreen('home')}
          onReset={onResetStats}
          onToast={showToast}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          t={t}
          settings={settings}
          onChange={onChangeSettings}
          onBack={() => setScreen('home')}
          onResetStats={onResetStats}
        />
      )}
      {screen === 'rules' && (
        <RulesScreen t={t} onBack={() => setScreen('home')} onTutorial={() => setShowTutorial(true)} />
      )}

      <Toast message={toast} />
      {showTutorial && <Tutorial t={t} onDone={finishTutorial} onSkip={finishTutorial} />}
    </div>
  );
}
