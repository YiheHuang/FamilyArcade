import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { choosePick, explainPick } from './ai/ai';
import { AiClient } from './ai/client';
import { apply, legal, score as scoreGame, setupFromSeed, view as makeView } from './game/engine';
import { mulberry32, seedFromString } from './game/rng';
import type { GameConfig, GameState, GameView, Move, PlayerCount } from './game/types';
import { translate, type Lang } from './i18n';
import { guestWsUrl, hostWsUrl, inviteUrl, startLanServer, type LanServerInfo } from './net';
import { sound } from './sound';
import {
  clearSavedGame,
  downloadJson,
  exportPayload,
  hasSeenTutorial,
  loadSavedGame,
  loadSettings,
  loadStats,
  markTutorialSeen,
  recordFinishedGame,
  resetStats as resetStoredStats,
  saveCurrentGame,
  saveSettings,
  saveStats,
  type SavedGame,
  type Settings,
  type Stats,
  type SoundLevel,
} from './storage';
import { Toast } from './ui/components';
import { EndScreen } from './ui/EndScreen';
import { GameScreen, type HintState } from './ui/GameScreen';
import { Home } from './ui/Home';
import { LanGameScreen } from './ui/LanGameScreen';
import { LanGuestJoin, LanGuestLobby, LanHostLobby, LanHostSetup } from './ui/LanScreens';
import { Poster } from './ui/Poster';
import { ReviewScreen } from './ui/ReviewScreen';
import { RoundSummaryScreen } from './ui/RoundSummaryScreen';
import { RulesScreen } from './ui/RulesScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { Setup } from './ui/Setup';
import { StatsScreen } from './ui/StatsScreen';
import { Tutorial } from './ui/Tutorial';

type Screen = 'home' | 'setup' | 'game' | 'round-summary' | 'end' | 'review' | 'stats' | 'settings' | 'rules' | 'lan' | 'lan-game';
type Mode = 'solo' | 'hotseat' | 'lan-host' | 'lan-guest';

function makeSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function routeFor(state: GameState): Screen {
  if (state.phase === 'ended') return 'end';
  if (state.phase === 'round-end') return 'round-summary';
  return 'game';
}

export default function App() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const queryLang = query.get('lang');
  const querySeed = query.get('seed') ?? undefined;
  const posterMode = query.get('poster') === '1';
  const seedQueue = useRef<string | undefined>(querySeed);

  const [screen, setScreen] = useState<Screen>('home');
  const [rulesReturn, setRulesReturn] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('solo');
  const [game, setGame] = useState<GameState | null>(null);
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSavedGame());
  const [settings, setSettings] = useState<Settings>(() => {
    const loaded = loadSettings();
    return queryLang === 'zh' || queryLang === 'en' ? { ...loaded, lang: queryLang } : loaded;
  });
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [hint, setHint] = useState<HintState | null>(null);
  const [thinkingSeats, setThinkingSeats] = useState<number[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [history, setHistory] = useState<GameState[]>([]);
  const [showTutorial, setShowTutorial] = useState(
    () => !posterMode && query.get('tutorial') !== '0' && !hasSeenTutorial(),
  );

  const params = useMemo(() => guestParams(), []);
  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanRoom, setLanRoom] = useState('');
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [lanPlayerCount, setLanPlayerCount] = useState<PlayerCount>(3);
  const [lanHostName, setLanHostName] = useState(() => (settings.lang === 'zh' ? '主机' : 'Host'));
  const [lanHint, setLanHint] = useState<HintState | null>(null);
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<GameView | null>(null);
  const [guestPlayers, setGuestPlayers] = useState<LanPublicPeer[]>([]);
  const [guestName, setGuestName] = useState(() => params?.name ?? (settings.lang === 'zh' ? '家人' : 'Guest'));
  const [guestCode, setGuestCode] = useState(() => params?.code ?? '');
  const [guestRoom, setGuestRoom] = useState(() => params?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [guestSent, setGuestSent] = useState(false);

  const ai = useRef(new AiClient());
  const gameRef = useRef<GameState | null>(null);
  const hostRef = useRef<LanHost | null>(null);
  const lanStartedRef = useRef(false);
  const statsRef = useRef(stats);
  const recordedRef = useRef(false);
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

  useEffect(
    () => () => {
      window.clearTimeout(toastTimer.current);
      ai.current.dispose();
    },
    [],
  );

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(settings.lang, key, params),
    [settings.lang],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const recordStats = useCallback((state: GameState) => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    const next = recordFinishedGame(statsRef.current, state);
    statsRef.current = next;
    setStats(next);
    saveStats(next);
  }, []);

  const commit = useCallback(
    (move: Move): boolean => {
      const current = gameRef.current;
      if (!current) return false;
      const out = apply(current, move);
      if (!out.ok) {
        showToast(t(`error.${out.reason}`, out.params));
        sound.play('error');
        return false;
      }
      setHistory((prev) => [...prev.slice(-19), current]);
      gameRef.current = out.state;
      setGame(out.state);
      setHint(null);
      for (const event of out.events) {
        if (event.type === 'revealed') sound.play('reveal');
        if (event.type === 'passed') sound.play('pass');
      }
      if (out.state.phase === 'ended') {
        clearSavedGame();
        setSaved(null);
        recordStats(out.state);
        sound.play('win');
        setThinkingSeats([]);
        setScreen('end');
      } else {
        saveCurrentGame(out.state);
        setSaved(loadSavedGame());
        if (out.state.phase === 'round-end') {
          sound.play('score');
          setScreen('round-summary');
        } else {
          setScreen('game');
        }
      }
      return true;
    },
    [recordStats, showToast, t],
  );

  const sendLanViews = useCallback((host: LanHost, state: GameState) => {
    for (const player of host.players) {
      if (player.connected && player.seat > 0) {
        host.sendView(player.seat, makeView(state, player.seat));
      }
    }
  }, []);

  const commitLanHost = useCallback(
    (next: GameState) => {
      gameRef.current = next;
      setGame(next);
      setLanHint(null);
      if (hostRef.current) sendLanViews(hostRef.current, next);
      if (next.phase === 'ended') {
        sound.play('win');
        recordStats(next);
      }
    },
    [recordStats, sendLanViews],
  );

  const startGame = useCallback(
    (config: GameConfig) => {
      const seed = seedQueue.current ?? makeSeed();
      seedQueue.current = undefined;
      const state = setupFromSeed({ ...config, seed });
      ai.current.cancelAll();
      recordedRef.current = false;
      gameRef.current = state;
      setGame(state);
      setHistory([]);
      setHint(null);
      setThinkingSeats([]);
      setScreen('game');
      saveCurrentGame(state);
      setSaved(loadSavedGame());
    },
    [],
  );

  const continueGame = useCallback(() => {
    const current = loadSavedGame();
    if (!current) {
      setSaved(null);
      showToast(t('home.continueDesc'));
      return;
    }
    ai.current.cancelAll();
    recordedRef.current = false;
    gameRef.current = current.state;
    setGame(current.state);
    setHistory([]);
    setHint(null);
    setThinkingSeats([]);
    setScreen(routeFor(current.state));
  }, [showToast, t]);

  const onPick = useCallback(
    (cardId: number) => {
      const current = gameRef.current;
      if (!current || current.phase !== 'choosing') return;
      const seat = current.config.seats.findIndex(
        (config, index) => config.kind === 'human' && current.pending[index] === null,
      );
      if (seat < 0) return;
      commit({ kind: 'pick', seat, cardId });
    },
    [commit],
  );

  const onAdvance = useCallback(() => {
    commit({ kind: 'advance' });
  }, [commit]);

  const onNextRound = useCallback(() => {
    commit({ kind: 'next-round' });
  }, [commit]);

  const onUndo = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    const humanSeats = current.config.seats
      .map((seat, index) => (seat.kind === 'human' ? index : -1))
      .filter((index) => index >= 0);
    const soloHuman = humanSeats.length === 1 ? humanSeats[0] : null;
    let targetIndex = history.length - 1;
    if (soloHuman !== null) {
      // In solo, undo the human's last decision, not the AI replies after it.
      // Find the first snapshot of the latest contiguous "human has picked" block.
      let firstPicked = -1;
      for (let index = history.length - 1; index >= 0; index--) {
        const picked = history[index].pending[soloHuman] !== null;
        if (picked) firstPicked = index;
        else if (firstPicked >= 0) break;
      }
      if (firstPicked < 0) {
        showToast(t('game.undoEmpty'));
        return;
      }
      targetIndex = firstPicked - 1;
    }
    if (targetIndex < 0) {
      showToast(t('game.undoEmpty'));
      return;
    }
    const previous = history[targetIndex];
    setHistory((prev) => prev.slice(0, targetIndex));
    ai.current.cancelAll();
    gameRef.current = previous;
    setGame(previous);
    setHint(null);
    setThinkingSeats([]);
    saveCurrentGame(previous);
    setSaved(loadSavedGame());
    setScreen(routeFor(previous));
    sound.play('click');
  }, [history, showToast, t]);

  const onHint = useCallback(() => {
    const current = gameRef.current;
    if (!current || current.phase !== 'choosing') return;
    const seat = current.config.seats.findIndex(
      (config, index) => config.kind === 'human' && current.pending[index] === null,
    );
    if (seat < 0) return;
    const gameView = makeView(current, seat);
    if (gameView.myHand.length === 0) return;
    const cardId = choosePick(
      gameView,
      'hard',
      80,
      mulberry32(seedFromString(`${current.config.seed}:hint:${current.round}:${current.pickIndex}:${seat}`)),
    );
    if (cardId === null) {
      showToast(t('game.hintFail'));
      return;
    }
    const reason = explainPick(gameView, cardId);
    setHint({ cardId, key: reason.key, params: reason.params });
    sound.play('click');
  }, [showToast, t]);

  const onHome = useCallback(() => {
    if (game && game.phase !== 'ended') {
      if (!window.confirm(t('game.confirmHome'))) return;
      saveCurrentGame(game);
      setSaved(loadSavedGame());
    }
    ai.current.cancelAll();
    setHint(null);
    setThinkingSeats([]);
    setScreen('home');
  }, [game, t]);

  const onRematch = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    startGame({ ...current.config, seed: '' });
  }, [startGame]);

  const closeLan = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanRoom('');
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanBusy(false);
    setLanError('');
    lanStartedRef.current = false;
    guest?.close();
    setGuest(null);
    setGuestView(null);
    setGuestPlayers([]);
    setGuestConnecting(false);
    setGuestSent(false);
  }, [guest]);

  const openLanHost = useCallback(() => {
    closeLan();
    setMode('lan-host');
    setLanError('');
    setScreen('lan');
  }, [closeLan]);

  const openLanGuest = useCallback(() => {
    closeLan();
    setMode('lan-guest');
    setLanError('');
    setScreen('lan');
  }, [closeLan]);

  const createLanRoom = useCallback(async () => {
    setLanBusy(true);
    setLanError('');
    try {
      const info = await startLanServer();
      setLanInfo(info);
      const code = newRoomCode();
      const room = newRoomCode();
      const host = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room,
        code,
        name: lanHostName.trim() || (settings.lang === 'zh' ? '主机' : 'Host'),
        maxPlayers: lanPlayerCount,
      });
      hostRef.current = host;
      setLanHost(host);
      setLanRoom(room);
      setLanCode(code);
      lanStartedRef.current = false;
      host.onChange((players) => {
        setLanPlayers(players);
        host.sendLobby();
        if (lanStartedRef.current && gameRef.current) {
          host.start();
          sendLanViews(host, gameRef.current);
        }
      });
      host.onIntent((seat, intent) => {
        if (!lanStartedRef.current || seat <= 0) return;
        const cardId = Number((intent as { type?: string; cardId?: number } | null)?.cardId);
        if (!Number.isInteger(cardId)) return;
        const current = gameRef.current;
        if (!current || current.phase !== 'choosing') return;
        const out = apply(current, { kind: 'pick', seat, cardId });
        if (!out.ok) return;
        commitLanHost(out.state);
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
      setLanError(`${t('lan.noServer')} ${error instanceof Error ? error.message : String(error)}`);
      closeLan();
    } finally {
      setLanBusy(false);
    }
  }, [closeLan, commitLanHost, lanHostName, lanPlayerCount, sendLanViews, settings.lang, t]);

  const startLanGame = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const count = lanPlayerCount;
    const seats = Array.from({ length: count }, (_, index) => {
      if (index === 0) {
        return { name: lanHostName.trim() || (settings.lang === 'zh' ? '主机' : 'Host'), kind: 'human' as const, level: 'normal' as const };
      }
      const player = lanPlayers.find((entry) => entry.seat === index);
      return {
        name: player?.name ?? (settings.lang === 'zh' ? `座位 ${index + 1}` : `Seat ${index + 1}`),
        kind: 'human' as const,
        level: 'normal' as const,
      };
    });
    const state = setupFromSeed({ playerCount: count, seats, seed: makeSeed() });
    gameRef.current = state;
    setGame(state);
    setLanHint(null);
    lanStartedRef.current = true;
    recordedRef.current = false;
    setScreen('lan-game');
    host.start();
    sendLanViews(host, state);
    sound.play('click');
  }, [lanHostName, lanPlayerCount, lanPlayers, sendLanViews, settings.lang]);

  const onLanHostPick = useCallback(
    (cardId: number) => {
      const current = gameRef.current;
      if (!current || current.phase !== 'choosing') return;
      const out = apply(current, { kind: 'pick', seat: 0, cardId });
      if (!out.ok) {
        showToast(t(`error.${out.reason}`, out.params));
        return;
      }
      commitLanHost(out.state);
    },
    [commitLanHost, showToast, t],
  );

  const onLanAdvance = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    const out = apply(current, { kind: 'advance' });
    if (!out.ok) return;
    commitLanHost(out.state);
  }, [commitLanHost]);

  const onLanNextRound = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    const out = apply(current, { kind: 'next-round' });
    if (!out.ok) return;
    commitLanHost(out.state);
  }, [commitLanHost]);

  const onLanRematch = useCallback(() => {
    const current = gameRef.current;
    const host = hostRef.current;
    if (!current || !host) return;
    const state = setupFromSeed({ ...current.config, seed: makeSeed() });
    gameRef.current = state;
    setGame(state);
    setLanHint(null);
    lanStartedRef.current = true;
    recordedRef.current = false;
    setScreen('lan-game');
    host.start();
    sendLanViews(host, state);
  }, [sendLanViews]);

  const onLanHint = useCallback(() => {
    const currentView = mode === 'lan-host' ? (game ? makeView(game, 0) : null) : guestView;
    if (!currentView || currentView.phase !== 'choosing' || currentView.mySeat === null) return;
    if (currentView.myHand.length === 0) return;
    const cardId = choosePick(
      currentView,
      'hard',
      80,
      mulberry32(
        seedFromString(
          `${currentView.mySeat}:${currentView.round}:${currentView.pickIndex}:${currentView.myHand.join('.')}:lan-hint`,
        ),
      ),
    );
    if (cardId === null) {
      showToast(t('game.hintFail'));
      return;
    }
    const reason = explainPick(currentView, cardId);
    setLanHint({ cardId, key: reason.key, params: reason.params });
    sound.play('click');
  }, [game, guestView, mode, showToast, t]);

  const joinGuest = useCallback(async () => {
    if (!guestRoom.trim() || !guestName.trim()) {
      setLanError(t('lan.invalidRoom'));
      return;
    }
    setGuestConnecting(true);
    setLanError('');
    guest?.close();
    setGuest(null);
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room: guestRoom.trim(),
        code: guestCode.trim(),
        name: guestName.trim(),
      });
      setGuest(joined);
      setGuestPlayers(joined.players);
      joined.onPlayers((players) => setGuestPlayers(players));
      joined.onView((payload) => {
        setGuestView(payload as GameView);
        setGuestSent(false);
        setLanHint(null);
        setScreen('lan-game');
      });
      joined.onStart((players) => {
        setGuestPlayers(players);
        setGuestView(null);
        setGuestSent(false);
        setScreen('lan-game');
      });
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? t('lan.full') : t('lan.wrong'));
      });
    } catch (error) {
      setLanError(
        t('lan.error', {
          msg: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setGuestConnecting(false);
    }
  }, [guest, guestCode, guestName, guestRoom, t]);

  const onLanGuestPick = useCallback(
    (cardId: number) => {
      if (!guest || !guestView || guestView.phase !== 'choosing') return;
      guest.sendIntent({ type: 'pick', cardId });
      setGuestSent(true);
      setLanHint(null);
      sound.play('pick');
    },
    [guest, guestView],
  );

  const onLanHome = useCallback(() => {
    closeLan();
    setScreen('home');
  }, [closeLan]);

  const copyLanInvite = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(lanInvite);
      showToast(t('lan.copied'));
    } catch {
      showToast(t('lan.copyFailed'));
    }
  }, [lanInvite, showToast, t]);

  useEffect(() => {
    if (!params) return;
    setMode('lan-guest');
    setScreen('lan');
  }, [params]);

  const openRules = useCallback((from: Screen) => {
    setRulesReturn(from);
    setScreen('rules');
  }, []);

  const onChangeSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleLang = useCallback(() => {
    setSettings((prev) => ({ ...prev, lang: (prev.lang === 'zh' ? 'en' : 'zh') as Lang }));
  }, []);

  const toggleSound = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      sound: (prev.sound === 'on' ? 'low' : prev.sound === 'low' ? 'off' : 'on') as SoundLevel,
    }));
  }, []);

  const onResetStats = useCallback(() => {
    const empty = resetStoredStats();
    statsRef.current = empty;
    setStats(empty);
    showToast(t('stats.resetDone'));
  }, [showToast, t]);

  const onExportStats = useCallback(() => {
    downloadJson('sweet-carousel-stats.json', exportPayload(stats, settings));
    showToast(t('stats.exported'));
  }, [settings, showToast, stats, t]);

  const onExportGame = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    const payload = {
      version: 1,
      app: 'sweet-carousel',
      exportedAt: new Date().toISOString(),
      config: current.config,
      rounds: current.rounds,
      collected: current.collected,
      crowns: current.crowns,
      scores: scoreGame(current),
    };
    downloadJson('sweet-carousel-game.json', JSON.stringify(payload, null, 2));
    showToast(t('game.exported'));
  }, [showToast, t]);

  const finishTutorial = useCallback(() => {
    markTutorialSeen();
    setShowTutorial(false);
  }, []);

  // Drive one AI seat at a time. A late reply is ignored when the state has moved on.
  useEffect(() => {
    if (!game || screen !== 'game' || game.phase !== 'choosing') return;
    const seat = game.config.seats.findIndex((config, index) => config.kind === 'ai' && game.pending[index] === null);
    if (seat < 0) return;
    let cancelled = false;
    const snapshot = game;
    const level = game.config.seats[seat].level;
    setThinkingSeats((prev) => (prev.includes(seat) ? prev : [...prev, seat]));
    const timer = window.setTimeout(() => {
      const gameView = makeView(snapshot, seat);
      ai.current
        .choose(gameView, level, 80)
        .then((cardId) => {
          if (cancelled) return;
          const current = gameRef.current;
          if (!current || current !== snapshot) return;
          const moves = legal(current, seat);
          if (moves.length === 0) return;
          const matching = moves.find((move) => move.kind === 'pick' && move.cardId === cardId);
          const move = matching ?? moves[0];
          if (!matching) showToast(t('error.ai-failed'));
          commit(move);
          setThinkingSeats((prev) => prev.filter((index) => index !== seat));
        })
        .catch(() => {
          if (cancelled) return;
          const current = gameRef.current;
          if (!current) return;
          const fallback = legal(current, seat)[0];
          if (fallback) commit(fallback);
        });
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ai.current.cancelAll();
      setThinkingSeats((prev) => prev.filter((index) => index !== seat));
    };
  }, [game, screen, commit, showToast, t]);

  const poster = posterMode ? <Poster t={t} lang={settings.lang} /> : null;
  if (poster) return poster;

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
          onLan={openLanHost}
          onStats={() => setScreen('stats')}
          onRules={() => openRules('home')}
          onSettings={() => setScreen('settings')}
          onTutorial={() => setShowTutorial(true)}
          onToggleLang={toggleLang}
          onToggleSound={toggleSound}
        />
      )}

      {screen === 'setup' && (
        <Setup key={mode} t={t} lang={settings.lang} mode={mode === 'solo' ? 'solo' : 'hotseat'} onStart={startGame} onBack={() => setScreen('home')} />
      )}

      {screen === 'lan' && mode === 'lan-host' && (
        lanHost && lanInfo ? (
          <LanHostLobby
            t={t}
            room={lanRoom}
            code={lanCode}
            invite={lanInvite}
            qr={lanQr}
            players={lanPlayers}
            playerCount={lanPlayerCount}
            busy={lanBusy}
            error={lanError}
            onStart={startLanGame}
            onCopy={copyLanInvite}
            onClose={onLanHome}
          />
        ) : (
          <LanHostSetup
            t={t}
            playerCount={lanPlayerCount}
            onPlayerCount={setLanPlayerCount}
            hostName={lanHostName}
            onHostName={setLanHostName}
            busy={lanBusy}
            error={lanError}
            onCreate={createLanRoom}
            onJoin={openLanGuest}
            onBack={onLanHome}
          />
        )
      )}

      {screen === 'lan' && mode === 'lan-guest' && (
        guest ? (
          <LanGuestLobby
            t={t}
            room={guestRoom}
            code={guestCode}
            seat={guest.seat}
            players={guestPlayers}
            onClose={onLanHome}
          />
        ) : (
          <LanGuestJoin
            t={t}
            room={guestRoom}
            onRoom={setGuestRoom}
            code={guestCode}
            onCode={setGuestCode}
            name={guestName}
            onName={setGuestName}
            busy={guestConnecting}
            error={lanError}
            onJoin={joinGuest}
            onHost={openLanHost}
            onBack={onLanHome}
          />
        )
      )}

      {screen === 'lan-game' && mode === 'lan-host' && game && (
        <LanGameScreen
          t={t}
          view={makeView(game, 0)}
          mySeat={0}
          isHost
          hint={lanHint}
          sent={false}
          onPick={onLanHostPick}
          onAdvance={onLanAdvance}
          onNextRound={onLanNextRound}
          onRematch={onLanRematch}
          onHome={onLanHome}
          onRules={() => openRules('lan-game')}
          onHint={onLanHint}
        />
      )}

      {screen === 'lan-game' && mode === 'lan-guest' && guestView && guest && (
        <LanGameScreen
          t={t}
          view={guestView}
          mySeat={guest.seat}
          isHost={false}
          hint={lanHint}
          sent={guestSent}
          onPick={onLanGuestPick}
          onAdvance={() => undefined}
          onNextRound={() => undefined}
          onRematch={() => undefined}
          onHome={onLanHome}
          onRules={() => openRules('lan-game')}
          onHint={onLanHint}
        />
      )}

      {screen === 'lan-game' && mode === 'lan-guest' && !guestView && (
        <div className="lan-screen screen">
          <div className="panel empty-state" data-testid="lan-waiting-view">
            {t('lan.waitingForHostView')}
          </div>
        </div>
      )}

      {screen === 'game' && game && (
        <GameScreen
          t={t}
          state={game}
          settings={settings}
          hint={hint}
          thinkingSeats={thinkingSeats}
          canUndo={history.length > 0}
          onPick={onPick}
          onAdvance={onAdvance}
          onUndo={onUndo}
          onHint={onHint}
          onHome={onHome}
          onRules={() => openRules('game')}
        />
      )}

      {screen === 'round-summary' && game && (
        <RoundSummaryScreen
          t={t}
          state={game}
          onNext={onNextRound}
          onHome={onHome}
          onRules={() => openRules('round-summary')}
        />
      )}

      {screen === 'end' && game && (
        <EndScreen
          t={t}
          state={game}
          onRematch={onRematch}
          onHome={onHome}
          onReview={() => setScreen('review')}
          onExport={onExportGame}
        />
      )}

      {screen === 'review' && game && <ReviewScreen t={t} state={game} onBack={() => setScreen('end')} />}

      {screen === 'stats' && (
        <StatsScreen
          t={t}
          lang={settings.lang}
          stats={stats}
          onBack={() => setScreen('home')}
          onReset={onResetStats}
          onExport={onExportStats}
        />
      )}

      {screen === 'settings' && (
        <SettingsScreen
          t={t}
          settings={settings}
          onChange={onChangeSettings}
          onBack={() => setScreen('home')}
          onResetStats={onResetStats}
          onExportStats={onExportStats}
          onTutorial={() => setShowTutorial(true)}
        />
      )}

      {screen === 'rules' && (
        <RulesScreen t={t} onBack={() => setScreen(rulesReturn)} onTutorial={() => setShowTutorial(true)} />
      )}

      <Toast message={toast} />
      {showTutorial && <Tutorial t={t} onDone={finishTutorial} onSkip={finishTutorial} />}
    </div>
  );
}
