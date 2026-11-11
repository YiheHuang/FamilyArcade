import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { AiClient, explain } from './ai/client';
import {
  apply,
  legalMoves,
  previewMove,
  replay,
  result,
  rngForConfig,
  setup,
  view,
  viewPosition,
} from './game/engine';
import { seedFromString } from './game/rng';
import type { GameConfig, GameResult, GameState, Move, PlayerView } from './game/types';
import { translate, type Lang } from './i18n';
import { guestWsUrl, hostWsUrl, inviteUrl, startLanServer } from './net';
import { sound } from './sound';
import {
  clearSavedGame,
  hasSeenTutorial,
  loadRecent,
  loadSavedGame,
  loadSettings,
  loadStats,
  markTutorialSeen,
  recordGame,
  resetStats,
  saveCurrentGame,
  saveSettings,
  type RecentGame,
  type SavedGame,
  type Settings,
  type Stats,
} from './storage';
import { Toast } from './ui/components';
import { GameScreen, type LegalOption } from './ui/GameScreen';
import { Home } from './ui/Home';
import { LanScreen, type LanRole } from './ui/LanScreen';
import { ReplayScreen } from './ui/ReplayScreen';
import { RulesScreen } from './ui/RulesScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { Setup } from './ui/Setup';
import { StatsScreen } from './ui/StatsScreen';
import { Tutorial } from './ui/Tutorial';

type Screen = 'home' | 'setup' | 'game' | 'replay' | 'stats' | 'settings' | 'rules' | 'lan';
type Mode = 'solo' | 'hotseat' | 'lan-host' | 'lan-guest';

function makeSeed(prefix = 'hg'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.floor(Math.random() * 0xffffffff).toString(36);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export default function App() {
  const query = new URLSearchParams(window.location.search);
  const guestQuery = useMemo(() => guestParams(), []);
  const [screen, setScreen] = useState<Screen>(guestQuery ? 'lan' : 'home');
  const [mode, setMode] = useState<Mode>(guestQuery ? 'lan-guest' : 'solo');
  const [game, setGame] = useState<GameState | null>(null);
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSavedGame());
  const [settings, setSettings] = useState<Settings>(() => {
    const loaded = loadSettings();
    const lang = query.get('lang');
    return lang === 'zh' || lang === 'en' ? { ...loaded, lang } : loaded;
  });
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [recent, setRecent] = useState<RecentGame[]>(() => loadRecent());
  const [hint, setHint] = useState<Move | null>(null);
  const [hintReason, setHintReason] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [replayData, setReplayData] = useState<{ config: GameConfig; moves: Move[] } | null>(null);
  const [replayBack, setReplayBack] = useState<Screen>('game');
  const [showTutorial, setShowTutorial] = useState(
    () => query.get('tutorial') !== '0' && !hasSeenTutorial(),
  );

  // LAN state. Host keeps the authoritative GameState; guest receives only its
  // own PlayerView and sends Move intents back to the host.
  const [lanRole, setLanRole] = useState<LanRole>(guestQuery ? 'guest' : 'host');
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanSeatCount, setLanSeatCount] = useState<2 | 3 | 4>(2);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<PlayerView | null>(null);
  const [guestResult, setGuestResult] = useState<GameResult | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [guestDisconnected, setGuestDisconnected] = useState(false);
  const [guestSeat, setGuestSeat] = useState(-1);
  const [guestRoom] = useState(() => guestQuery?.room ?? '');
  const [guestCode, setGuestCode] = useState(() => guestQuery?.code ?? '');
  const [guestName, setGuestName] = useState(
    () => guestQuery?.name ?? (settings.lang === 'zh' ? '家人' : 'Guest'),
  );

  const ai = useRef(new AiClient());
  const gameRef = useRef<GameState | null>(null);
  const statsRef = useRef(stats);
  const recordedRef = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const lanHostRef = useRef<LanHost | null>(null);
  const lanStartedRef = useRef(false);
  const guestRef = useRef<LanGuest | null>(null);
  const guestViewRef = useRef<PlayerView | null>(null);
  const guestStartedRef = useRef(false);
  const autoJoinRef = useRef(false);
  const modeRef = useRef<Mode>(mode);
  const commitMoveRef = useRef<(move: Move) => void>(() => undefined);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    guestViewRef.current = guestView;
  }, [guestView]);
  useEffect(() => {
    guestStartedRef.current = guestStarted;
  }, [guestStarted]);

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

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(settings.lang, key, params),
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
    const res = result(state);
    if (!res) return;
    const next = recordGame(state, res);
    statsRef.current = next;
    setStats(next);
    setRecent(loadRecent());
    clearSavedGame();
    setSaved(null);
  }, []);

  const sendLanViews = useCallback((state: GameState) => {
    const host = lanHostRef.current;
    if (!host) return;
    for (const player of host.publicPlayers()) {
      if (player.seat === 0 || !player.connected) continue;
      host.sendView(player.seat, view(state, player.seat));
    }
    if (state.status === 'ended') host.sendResult(result(state));
  }, []);

  const commitMove = useCallback(
    (move: Move) => {
      const current = gameRef.current;
      if (!current) return;
      const isLanHost = modeRef.current === 'lan-host';
      const out = apply(current, move);
      if (!out.ok) {
        showToast(t(`error.${out.reason}`, out.params));
        sound.error();
        if (isLanHost) sendLanViews(current);
        return;
      }
      const place = out.events.find((e) => e.type === 'place');
      if (place && place.type === 'place') {
        place.cells.forEach((_, i) => window.setTimeout(() => sound.place(i), i * 70));
        if (place.blooms > 0) window.setTimeout(() => sound.bloom(), 160);
      }
      if (out.events.some((e) => e.type === 'swap')) sound.swap();
      if (out.events.some((e) => e.type === 'pass')) sound.pass();
      if (out.events.some((e) => e.type === 'end')) window.setTimeout(() => sound.win(), 420);

      gameRef.current = out.state;
      setGame(out.state);
      setHint(null);
      setHintReason(null);
      setThinking(false);
      if (out.state.status === 'playing') {
        if (isLanHost) {
          sendLanViews(out.state);
        } else {
          saveCurrentGame(out.state);
          setSaved(loadSavedGame());
        }
      } else if (isLanHost) {
        clearSavedGame();
        setSaved(null);
        sendLanViews(out.state);
      } else {
        finishGame(out.state);
      }
    },
    [finishGame, sendLanViews, showToast, t],
  );
  useEffect(() => {
    commitMoveRef.current = commitMove;
  }, [commitMove]);

  const startGame = useCallback((config: GameConfig) => {
    ai.current.cancelAll();
    const cfg = { ...config, seed: config.seed || makeSeed() };
    const state = setup(cfg, rngForConfig(cfg));
    recordedRef.current = false;
    gameRef.current = state;
    setGame(state);
    setHint(null);
    setHintReason(null);
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
    gameRef.current = current.state;
    recordedRef.current = false;
    setGame(current.state);
    setHint(null);
    setHintReason(null);
    setThinking(false);
    setScreen('game');
  }, [showToast, t]);

  const closeLan = useCallback(() => {
    lanHostRef.current?.close();
    lanHostRef.current = null;
    guestRef.current?.close();
    guestRef.current = null;
    lanStartedRef.current = false;
    guestStartedRef.current = false;
    setLanPlayers([]);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanError('');
    setLanBusy(false);
    setGuest(null);
    setGuestView(null);
    setGuestResult(null);
    setGuestStarted(false);
    setGuestSeat(-1);
    setGuestDisconnected(false);
    setGuestConnecting(false);
  }, []);

  const createLanRoom = useCallback(async () => {
    setLanBusy(true);
    setLanError('');
    try {
      const info = await startLanServer();
      const room = newRoomCode();
      const code = newRoomCode();
      const host = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room,
        code,
        name: settings.lang === 'zh' ? '主机' : 'Host',
        maxPlayers: lanSeatCount,
      });
      lanHostRef.current = host;
      setLanRole('host');
      setLanCode(code);
      host.onChange((players) => {
        setLanPlayers(players);
        if (lanStartedRef.current) {
          host.start();
          const current = gameRef.current;
          if (current) {
            for (const player of players) {
              if (player.seat !== 0 && player.connected) {
                host.sendView(player.seat, view(current, player.seat));
              }
            }
            if (current.status === 'ended') host.sendResult(result(current));
          }
        } else {
          host.sendLobby();
        }
      });
      host.onIntent((seat, intent) => {
        const move = (intent as { move?: Move } | null)?.move;
        if (!move || move.seat !== seat) return;
        commitMoveRef.current(move);
      });
      host.onClose(() => setLanError(t('lan.closed')));
      const url = inviteUrl(info, room, code, settings.lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#2b2520', light: '#fffaf0' },
        }),
      );
    } catch (error) {
      setLanError(t('lan.noRelay'));
      if (error instanceof Error && error.message) console.warn('LAN host failed:', error.message);
    } finally {
      setLanBusy(false);
    }
  }, [lanSeatCount, settings.lang, t]);

  const startLanGame = useCallback(() => {
    const host = lanHostRef.current;
    if (!host) return;
    const players = host.publicPlayers();
    if (players.filter((p) => p.connected).length !== lanSeatCount) return;
    const config: GameConfig = {
      playerCount: lanSeatCount,
      seats: players.slice(0, lanSeatCount).map((p) => ({
        name: p.name,
        kind: 'human',
        level: 'normal',
      })),
      seed: makeSeed('hg-lan'),
    };
    const state = setup(config, rngForConfig(config));
    recordedRef.current = true;
    gameRef.current = state;
    setGame(state);
    setMode('lan-host');
    setHint(null);
    setHintReason(null);
    setThinking(false);
    setScreen('game');
    lanStartedRef.current = true;
    host.start({ seatCount: lanSeatCount });
    for (const player of players) {
      if (player.seat !== 0 && player.connected) {
        host.sendView(player.seat, view(state, player.seat));
      }
    }
    clearSavedGame();
    setSaved(null);
  }, [lanSeatCount]);

  const joinLanGuest = useCallback(async () => {
    if (!guestRoom || !guestName.trim()) return;
    setGuestConnecting(true);
    setLanError('');
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room: guestRoom,
        code: guestCode,
        name: guestName.trim(),
      });
      guestRef.current?.close();
      guestRef.current = joined;
      setGuest(joined);
      setGuestDisconnected(false);
      setGuestSeat(joined.seat);
      setMode('lan-guest');
      setLanRole('guest');
      joined.onView((payload, seat) => {
        const nextView = payload as PlayerView;
        guestViewRef.current = nextView;
        setGuestSeat(seat);
        setGuestView(nextView);
        setGuestDisconnected(false);
        if (guestStartedRef.current) setScreen('game');
      });
      joined.onStart((players) => {
        setLanPlayers(players);
        setGuestStarted(true);
        guestStartedRef.current = true;
        if (guestViewRef.current) setScreen('game');
      });
      joined.onResult((payload) => {
        setGuestResult(payload as GameResult);
      });
      joined.onError((reason) => {
        setLanError(
          reason === 'room-full'
            ? t('lan.full')
            : reason === 'wrong-code'
              ? t('lan.wrongCode')
              : t('lan.error'),
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setLanError(
        message.includes('rejected') || message.includes('full')
          ? t('lan.wrongCode')
          : t('lan.error'),
      );
    } finally {
      setGuestConnecting(false);
    }
  }, [guestCode, guestName, guestRoom, t]);

  // Open an invite URL and join automatically once. The host has already created
  // the room by the time the QR/link exists.
  useEffect(() => {
    if (!guestQuery?.room || autoJoinRef.current) return;
    if (!guestName.trim()) return;
    autoJoinRef.current = true;
    setScreen('lan');
    setMode('lan-guest');
    setLanRole('guest');
    void joinLanGuest();
  }, [guestName, guestQuery, joinLanGuest]);

  // LanGuest has no close event; poll its public status so the UI can offer a
  // reconnect button when the relay drops.
  useEffect(() => {
    if (mode !== 'lan-guest' || !guest) return;
    const timer = window.setInterval(() => {
      const closed = guest.status === 'closed';
      setGuestDisconnected(closed);
      if (closed) setLanError((prev) => prev || t('lan.lost'));
    }, 1200);
    return () => window.clearInterval(timer);
  }, [guest, mode, t]);

  const onHome = useCallback(() => {
    const isLan = modeRef.current === 'lan-host' || modeRef.current === 'lan-guest';
    if (!isLan && game && game.status === 'playing') {
      if (!window.confirm(t('game.confirmHome'))) return;
      saveCurrentGame(game);
      setSaved(loadSavedGame());
    }
    if (isLan) {
      closeLan();
      setGame(null);
      gameRef.current = null;
      setMode('solo');
    }
    ai.current.cancelAll();
    setHint(null);
    setHintReason(null);
    setThinking(false);
    setScreen('home');
  }, [closeLan, game, t]);

  const currentHumanSeats = useMemo(
    () => (game ? game.config.seats.map((s, i) => (s.kind === 'human' ? i : -1)).filter((i) => i >= 0) : []),
    [game],
  );

  const localSeat = useMemo(() => {
    if (mode === 'lan-guest') return guestView?.seat ?? null;
    if (!game) return null;
    if (currentHumanSeats.length === 1) return currentHumanSeats[0];
    return game.config.seats[game.current]?.kind === 'human' ? game.current : null;
  }, [game, currentHumanSeats, mode, guestView]);

  const playerView = useMemo(
    () => (mode === 'lan-guest' ? guestView : game ? view(game, localSeat) : null),
    [game, localSeat, mode, guestView],
  );

  const guestPosition = useMemo(
    () => (guestView ? viewPosition(guestView) : null),
    [guestView],
  );

  const activeOptionsState = mode === 'lan-guest' ? guestPosition : game;
  const activeOptionsSeat = mode === 'lan-guest' ? (guestView?.seat ?? null) : localSeat;

  const legalOptions = useMemo<LegalOption[]>(() => {
    if (
      !activeOptionsState ||
      activeOptionsState.status !== 'playing' ||
      activeOptionsSeat == null ||
      activeOptionsState.current !== activeOptionsSeat
    ) {
      return [];
    }
    const moves = legalMoves(activeOptionsState, activeOptionsSeat);
    return moves.map((move) => ({
      move,
      score: move.kind === 'play' ? previewMove(activeOptionsState, move)?.score ?? null : null,
    }));
  }, [activeOptionsState, activeOptionsSeat]);

  const gameResult = useMemo(
    () => (mode === 'lan-guest' ? guestResult : game ? result(game) : null),
    [game, guestResult, mode],
  );

  const onUndo = useCallback(() => {
    const current = gameRef.current;
    if (!current || current.status !== 'playing' || current.moves.length === 0) return;
    if (!window.confirm(t('game.confirmUndo'))) return;
    let keep = current.moves.length - 1;
    let next = replay(current.config, current.moves.slice(0, keep));
    while (
      next.status === 'playing' &&
      next.config.seats[next.current]?.kind === 'ai' &&
      keep > 0
    ) {
      keep--;
      next = replay(current.config, current.moves.slice(0, keep));
    }
    ai.current.cancelAll();
    gameRef.current = next;
    setGame(next);
    setHint(null);
    setHintReason(null);
    setThinking(false);
    if (modeRef.current === 'lan-host') {
      sendLanViews(next);
    } else {
      saveCurrentGame(next);
      setSaved(loadSavedGame());
    }
    sound.click();
  }, [sendLanViews, t]);

  const onHint = useCallback(() => {
    if (thinking) return;
    if (modeRef.current === 'lan-guest') {
      const guestSnapshot = guestViewRef.current;
      if (
        !guestSnapshot ||
        guestSnapshot.status !== 'playing' ||
        guestSnapshot.current !== guestSnapshot.seat
      ) {
        return;
      }
      setThinking(true);
      setHint(null);
      setHintReason(null);
      ai.current
        .choose(
          guestSnapshot,
          'hard',
          360,
          seedFromString(`${guestSnapshot.config.seed}:hint:${guestSnapshot.movesCount}`),
        )
        .then((move) => {
          setThinking(false);
          if (!move) {
            showToast(t('game.noHint'));
            return;
          }
          setHint(move);
          const reason = explain(guestSnapshot, move);
          setHintReason(t(reason.key, reason.params));
          showToast(t('game.hintReady'));
        })
        .catch(() => {
          setThinking(false);
          showToast(t('game.noHint'));
        });
      return;
    }
    const current = gameRef.current;
    if (!current || current.status !== 'playing') return;
    const seat = current.current;
    if (current.config.seats[seat]?.kind !== 'human') return;
    setThinking(true);
    setHint(null);
    setHintReason(null);
    const snapshot = current;
    const seatView = view(snapshot, seat);
    ai.current
      .choose(seatView, 'hard', 360, seedFromString(`${snapshot.config.seed}:hint:${snapshot.moves.length}`))
      .then((move) => {
        setThinking(false);
        if (!move) {
          showToast(t('game.noHint'));
          return;
        }
        const live = gameRef.current;
        if (!live || live.moves.length !== snapshot.moves.length || live.current !== seat) return;
        setHint(move);
        const reason = explain(seatView, move);
        setHintReason(t(reason.key, reason.params));
        showToast(t('game.hintReady'));
      })
      .catch(() => {
        setThinking(false);
        showToast(t('game.noHint'));
      });
  }, [showToast, t, thinking]);

  const onRematch = useCallback(() => {
    if (modeRef.current === 'lan-host' || modeRef.current === 'lan-guest') return;
    const current = gameRef.current;
    if (!current) return;
    startGame({ ...current.config, seed: makeSeed('hg-r') });
  }, [startGame]);

  const onReplay = useCallback(() => {
    if (modeRef.current === 'lan-guest') return;
    const current = gameRef.current;
    if (!current) return;
    setReplayData({ config: current.config, moves: current.moves });
    setReplayBack('game');
    setScreen('replay');
  }, []);

  const onReplayRecent = useCallback((recentGame: RecentGame) => {
    setReplayData({ config: recentGame.config, moves: recentGame.moves });
    setReplayBack('stats');
    setScreen('replay');
  }, []);

  // Drive AI seats. The snapshot and cleanup flag make a late reply harmless.
  useEffect(() => {
    if (!game || screen !== 'game' || game.status !== 'playing') return;
    const seat = game.config.seats[game.current];
    if (!seat || seat.kind !== 'ai') return;
    let cancelled = false;
    setThinking(true);
    const snapshot = game;
    const seatView = view(snapshot, snapshot.current);
    const budget =
      seat.level === 'hard' ? 900 : seat.level === 'normal' ? 300 : seat.level === 'easy' ? 80 : 80;
    const seed = seedFromString(
      `${snapshot.config.seed}:${snapshot.moves.length}:${snapshot.current}:${seat.level}`,
    );
    const timer = window.setTimeout(() => {
      ai.current
        .choose(seatView, seat.level, budget, seed)
        .then((move) => {
          if (cancelled) return;
          const fallback = legalMoves(snapshot, snapshot.current)[0] ?? null;
          const picked = move ?? fallback;
          if (picked) commitMove(picked);
          else setThinking(false);
        })
        .catch(() => {
          if (cancelled) return;
          setThinking(false);
          const fallback = legalMoves(snapshot, snapshot.current)[0];
          if (fallback) commitMove(fallback);
        });
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setThinking(false);
    };
  }, [game, screen, commitMove]);

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
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.key.toLowerCase() === 'm') toggleSound();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSound]);

  const onResetStats = useCallback(() => {
    const empty = resetStats();
    statsRef.current = empty;
    setStats(empty);
    setRecent([]);
  }, []);

  const finishTutorial = useCallback(() => {
    markTutorialSeen();
    setShowTutorial(false);
  }, []);

  const onPlayerMove = useCallback(
    (move: Move) => {
      if (modeRef.current === 'lan-guest') {
        guestRef.current?.sendIntent({ move });
        setHint(null);
        setHintReason(null);
        return;
      }
      commitMove(move);
    },
    [commitMove],
  );

  const displayView = mode === 'lan-guest' ? guestView : playerView;
  const lanGameInfo =
    mode === 'lan-host'
      ? {
          role: 'host' as const,
          code: lanCode,
          connected: lanPlayers.filter((p) => p.seat !== 0 && p.connected).length,
          total: lanSeatCount - 1,
          disconnected: false,
        }
      : mode === 'lan-guest'
        ? {
            role: 'guest' as const,
            code: guest?.code || guestCode,
            connected: guestDisconnected ? 0 : 1,
            total: guestView?.config.playerCount ?? 0,
            disconnected: guestDisconnected,
            onReconnect: () => {
              void joinLanGuest();
            },
          }
        : null;

  const home = (
    <Home
      t={t}
      lang={settings.lang}
      saved={saved}
      recent={recent}
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
        setLanRole('host');
        setMode('lan-host');
        setScreen('lan');
      }}
      onStats={() => setScreen('stats')}
      onRules={() => setScreen('rules')}
      onSettings={() => setScreen('settings')}
      onToggleLang={toggleLang}
      onToggleSound={toggleSound}
      onReplayRecent={onReplayRecent}
      onTutorial={() => setShowTutorial(true)}
    />
  );

  return (
    <div className="app">
      {screen === 'home' && home}
      {screen === 'setup' && (
        <Setup t={t} lang={settings.lang} mode={mode === 'solo' || mode === 'hotseat' ? mode : 'hotseat'} onStart={startGame} onBack={() => setScreen('home')} />
      )}
      {screen === 'lan' && (
        <LanScreen
          t={t}
          lang={settings.lang}
          role={lanRole}
          busy={lanBusy}
          error={lanError}
          code={lanCode}
          invite={lanInvite}
          qr={lanQr}
          players={lanPlayers}
          seatCount={lanSeatCount}
          onSeatCount={setLanSeatCount}
          onCreate={() => {
            void createLanRoom();
          }}
          onStart={startLanGame}
          onCopy={async () => {
            if (!lanInvite) return;
            try {
              await navigator.clipboard.writeText(lanInvite);
              showToast(t('lan.copied'));
            } catch {
              showToast(lanInvite);
            }
          }}
          onBack={onHome}
          guestName={guestName}
          guestCode={guestCode}
          guestRoom={guestRoom}
          guestSeat={guestSeat}
          guestStarted={guestStarted}
          guestConnecting={guestConnecting}
          guestDisconnected={guestDisconnected}
          onGuestName={setGuestName}
          onGuestCode={setGuestCode}
          onJoin={() => {
            void joinLanGuest();
          }}
          onReconnect={() => {
            void joinLanGuest();
          }}
        />
      )}
      {screen === 'game' && displayView && (
        <GameScreen
          t={t}
          lang={settings.lang}
          playerView={displayView}
          options={legalOptions}
          result={gameResult}
          settings={settings}
          hint={hint}
          hintReason={hintReason}
          thinking={thinking}
          localSeat={localSeat}
          canUndo={mode !== 'lan-guest'}
          canReplay={mode !== 'lan-guest'}
          canRematch={mode === 'solo' || mode === 'hotseat'}
          lan={lanGameInfo}
          onMove={onPlayerMove}
          onUndo={onUndo}
          onHint={onHint}
          onHome={onHome}
          onRematch={onRematch}
          onReplay={onReplay}
          onToast={showToast}
        />
      )}
      {screen === 'replay' && replayData && (
        <ReplayScreen
          t={t}
          lang={settings.lang}
          config={replayData.config}
          moves={replayData.moves}
          onBack={() => setScreen(replayBack === 'game' && game ? 'game' : replayBack === 'stats' ? 'stats' : 'home')}
        />
      )}
      {screen === 'stats' && (
        <StatsScreen
          t={t}
          lang={settings.lang}
          stats={stats}
          recent={recent}
          onBack={() => setScreen('home')}
          onReset={onResetStats}
          onToast={showToast}
          onReplayRecent={onReplayRecent}
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
        <RulesScreen
          t={t}
          lang={settings.lang}
          onBack={() => setScreen('home')}
          onTutorial={() => setShowTutorial(true)}
        />
      )}

      <Toast message={toast} />
      {showTutorial && (
        <Tutorial t={t} lang={settings.lang} onDone={finishTutorial} onSkip={finishTutorial} />
      )}
    </div>
  );
}
