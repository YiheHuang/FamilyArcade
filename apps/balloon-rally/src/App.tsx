import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { explain } from './ai/ai';
import { AiClient } from './ai/client';
import { buildDemoState } from './demo';
import { balloonName } from './game/data';
import { apply, legalMoves, result, setup, view as viewGame } from './game/engine';
import { rngForConfig } from './game/replay';
import type { GameConfig, GameState, GameView, Move } from './game/types';
import { translate, type Lang } from './i18n';
import { guestWsUrl, hostWsUrl, inviteUrl, startLanServer } from './net';
import { sound } from './sound';
import {
  clearSavedGame,
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
  type SavedGame,
  type Settings,
  type Stats,
} from './storage';
import { Toast } from './ui/components';
import { GameScreen } from './ui/GameScreen';
import { Home } from './ui/Home';
import { LanScreen, type LanTab } from './ui/LanScreen';
import { ReplayScreen } from './ui/ReplayScreen';
import { RulesScreen } from './ui/RulesScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { Setup } from './ui/Setup';
import { StatsScreen } from './ui/StatsScreen';
import { Tutorial } from './ui/Tutorial';

type Screen = 'home' | 'setup' | 'game' | 'replay' | 'stats' | 'settings' | 'rules' | 'lan';
type Mode = 'solo' | 'hotseat' | 'lan-host' | 'lan-guest';

const DEMO_KINDS = new Set(['summary', 'support', 'end']);

export default function App() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const inviteParams = useMemo(() => guestParams(), []);
  const initialLang: Lang = (() => {
    const fromQuery = query.get('lang');
    if (fromQuery === 'zh' || fromQuery === 'en') return fromQuery;
    return loadSettings().lang;
  })();
  const demoParam = query.get('demo');
  const demoKind = demoParam && DEMO_KINDS.has(demoParam) ? (demoParam as 'summary' | 'support' | 'end') : null;

  const [screen, setScreen] = useState<Screen>(demoKind ? 'game' : inviteParams ? 'lan' : 'home');
  const [mode, setMode] = useState<Mode>('solo');
  const [lanTab, setLanTab] = useState<LanTab>(inviteParams ? 'guest' : 'host');
  const [settings, setSettings] = useState<Settings>(() => ({ ...loadSettings(), lang: initialLang }));
  const [game, setGame] = useState<GameState | null>(() =>
    demoKind ? buildDemoState(demoKind, initialLang) : null,
  );
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSavedGame());
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [hint, setHint] = useState<Move | null>(null);
  const [thinking, setThinking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(
    () => query.get('tutorial') !== '0' && !hasSeenTutorial(),
  );
  const [rulesReturn, setRulesReturn] = useState<Screen>('home');

  const [hostName, setHostName] = useState(() => translate(initialLang, 'lan.host'));
  const [hostPlayerCount, setHostPlayerCount] = useState(2);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanRoom, setLanRoom] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [guestView, setGuestView] = useState<GameView | null>(null);
  const [guestSeat, setGuestSeat] = useState(0);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestPlayers, setGuestPlayers] = useState<LanPublicPeer[]>([]);
  const [guestOnline, setGuestOnline] = useState(false);
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [guestJoined, setGuestJoined] = useState(false);
  const [guestName, setGuestName] = useState(() => inviteParams?.name ?? translate(initialLang, 'lan.guest'));
  const [guestCode, setGuestCode] = useState(() => inviteParams?.code ?? '');
  const [guestRoom, setGuestRoom] = useState(() => inviteParams?.room ?? '');

  const ai = useRef(new AiClient());
  const gameRef = useRef<GameState | null>(game);
  const statsRef = useRef(stats);
  const stackRef = useRef<GameState[]>(game ? [game] : []);
  const recordedRef = useRef(Boolean(demoKind));
  const demoRef = useRef(Boolean(demoKind));
  const toastTimer = useRef<number | undefined>(undefined);
  const hintSeq = useRef(0);
  const modeRef = useRef<Mode>('solo');
  const lanHostRef = useRef<LanHost | null>(null);
  const lanStartedRef = useRef(false);
  const guestRef = useRef<LanGuest | null>(null);
  const guestEnteredRef = useRef(false);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
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
    (key: string, params?: Record<string, string | number>) =>
      translate(settings.lang, key, params),
    [settings.lang],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const finishGame = useCallback((state: GameState) => {
    if (demoRef.current || recordedRef.current) return;
    const outcome = result(state);
    if (!outcome) return;
    recordedRef.current = true;
    const next = recordGame(statsRef.current, state, outcome);
    statsRef.current = next;
    setStats(next);
    saveStats(next);
  }, []);

  const syncHostViews = useCallback((state: GameState) => {
    const host = lanHostRef.current;
    if (!host) return;
    for (let seat = 1; seat < state.config.playerCount; seat++) {
      host.sendView(seat, viewGame(state, seat));
    }
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
      ai.current.cancelAll();
      hintSeq.current += 1;
      setHint(null);
      setThinking(false);
      if (move.kind === 'support') sound.lock();
      else sound.click();

      stackRef.current.push(out.state);
      if (stackRef.current.length > 80) stackRef.current.shift();
      gameRef.current = out.state;
      setGame(out.state);

      if (out.state.phase === 'ended') {
        clearSavedGame();
        setSaved(null);
        finishGame(out.state);
        sound.win();
      } else if (
        !demoRef.current &&
        modeRef.current !== 'lan-host' &&
        modeRef.current !== 'lan-guest'
      ) {
        saveCurrentGame(out.state);
        setSaved(loadSavedGame());
      }
      if (modeRef.current === 'lan-host') {
        syncHostViews(out.state);
      }
    },
    [finishGame, showToast, syncHostViews, t],
  );

  const startGame = useCallback(
    (config: GameConfig) => {
      ai.current.cancelAll();
      const state = setup(config, rngForConfig(config));
      demoRef.current = false;
      recordedRef.current = false;
      stackRef.current = [state];
      gameRef.current = state;
      setGame(state);
      setHint(null);
      setThinking(false);
      setScreen('game');
      saveCurrentGame(state);
      setSaved(loadSavedGame());
    },
    [],
  );

  const continueGame = useCallback(() => {
    const current = loadSavedGame();
    if (!current) {
      showToast(t('home.continueDesc'));
      setSaved(null);
      return;
    }
    ai.current.cancelAll();
    demoRef.current = false;
    recordedRef.current = false;
    stackRef.current = [current.state];
    gameRef.current = current.state;
    setGame(current.state);
    setHint(null);
    setThinking(false);
    setScreen('game');
  }, [showToast, t]);

  const closeLan = useCallback(() => {
    lanHostRef.current?.close();
    lanHostRef.current = null;
    guestRef.current?.close();
    guestRef.current = null;
    lanStartedRef.current = false;
    guestEnteredRef.current = false;
    setLanPlayers([]);
    setLanCode('');
    setLanRoom('');
    setLanInvite('');
    setLanQr('');
    setLanBusy(false);
    setLanError('');
    setGuestView(null);
    setGuestSeat(0);
    setGuestStarted(false);
    setGuestPlayers([]);
    setGuestOnline(false);
    setGuestConnecting(false);
    setGuestJoined(false);
    setMode('solo');
  }, []);

  const mapLanError = useCallback(
    (reason: string) => {
      if (reason.includes('wrong-code')) return t('lan.wrongCode');
      if (reason.includes('room-full')) return t('lan.roomFull');
      if (reason.includes('closed')) return t('lan.hostLeft');
      return t('lan.connectionFailed');
    },
    [t],
  );

  const openLanHost = useCallback(async () => {
    if (!hostName.trim()) return;
    setLanBusy(true);
    setLanError('');
    lanHostRef.current?.close();
    lanHostRef.current = null;
    try {
      const info = await startLanServer();
      const room = newRoomCode();
      const code = newRoomCode();
      const host = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room,
        code,
        name: hostName.trim(),
        maxPlayers: hostPlayerCount,
      });
      lanHostRef.current = host;
      setLanCode(code);
      setLanRoom(room);
      host.onChange((players) => {
        setLanPlayers(players);
        const state = gameRef.current;
        if (lanStartedRef.current && state) {
          for (const player of players) {
            if (player.connected && player.seat > 0) {
              host.sendView(player.seat, viewGame(state, player.seat));
            }
          }
        }
        host.sendLobby();
      });
      host.onIntent((seat, intent) => {
        const state = gameRef.current;
        const value = intent as { kind?: string; balloon?: number; tailwind?: boolean } | null;
        if (value?.kind === 'sync') {
          if (state && lanStartedRef.current) {
            host.sendView(seat, viewGame(state, seat));
          }
          return;
        }
        if (
          !state ||
          state.phase !== 'support' ||
          state.current !== seat ||
          value?.kind !== 'support' ||
          typeof value.balloon !== 'number'
        ) {
          return;
        }
        commitMove({
          kind: 'support',
          seat,
          balloon: value.balloon,
          tailwind: Boolean(value.tailwind),
        });
      });
      host.onClose(() => {
        setLanError(t('lan.hostDisconnected'));
        showToast(t('lan.hostDisconnected'));
      });
      const url = inviteUrl(info, room, code, t('lan.guest'));
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#202a2e', light: '#fffdf8' },
        }),
      );
    } catch (error) {
      setLanError(
        error instanceof Error ? mapLanError(error.message) : t('lan.connectionFailed'),
      );
      lanHostRef.current?.close();
      lanHostRef.current = null;
    } finally {
      setLanBusy(false);
    }
  }, [commitMove, hostName, hostPlayerCount, mapLanError, showToast, t]);

  const startLanHostGame = useCallback(() => {
    const host = lanHostRef.current;
    if (!host) return;
    const players = lanPlayers.slice(0, hostPlayerCount);
    if (players.length < hostPlayerCount || players.some((player) => !player.connected)) {
      setLanError(t('lan.waitingPlayers'));
      return;
    }
    const config: GameConfig = {
      playerCount: hostPlayerCount,
      seed: `lan-${Date.now()}`,
      seats: players.map((player) => ({
        name: player.name,
        kind: 'human' as const,
        level: 'normal' as const,
      })),
    };
    const state = setup(config, rngForConfig(config));
    ai.current.cancelAll();
    demoRef.current = false;
    recordedRef.current = false;
    stackRef.current = [state];
    gameRef.current = state;
    setGame(state);
    setHint(null);
    setThinking(false);
    setSaved(null);
    clearSavedGame();
    setLanError('');
    setMode('lan-host');
    modeRef.current = 'lan-host';
    lanStartedRef.current = true;
    setScreen('game');
    host.start({ playerCount: hostPlayerCount });
    syncHostViews(state);
  }, [hostPlayerCount, lanPlayers, syncHostViews, t]);

  const connectGuest = useCallback(
    async (stayInGame: boolean) => {
      if (!guestRoom.trim() || !guestName.trim()) return;
      setGuestConnecting(true);
      setLanError('');
      guestRef.current?.close();
      guestRef.current = null;
      if (!stayInGame) guestEnteredRef.current = false;
      try {
        const joined = await LanGuest.join({
          wsUrl: guestWsUrl(),
          room: guestRoom.trim(),
          code: guestCode.trim(),
          name: guestName.trim(),
        });
        guestRef.current = joined;
        setGuestSeat(joined.seat);
        setGuestPlayers(joined.players);
        setGuestOnline(joined.status === 'open');
        setGuestJoined(true);
        setGuestCode(joined.code || guestCode.trim());
        setGuestRoom(joined.room || guestRoom.trim());
        setMode('lan-guest');
        modeRef.current = 'lan-guest';
        joined.onView((payload, seat) => {
          setGuestView(payload as GameView);
          setGuestSeat(seat);
          setGuestOnline(true);
          setGuestStarted(true);
          setLanError('');
        });
        joined.onStart((players) => {
          setGuestPlayers(players);
          setGuestStarted(true);
        });
        joined.onPlayers((players) => setGuestPlayers(players));
        joined.onError((reason) => {
          setLanError(mapLanError(reason));
          setGuestOnline(false);
        });
        joined.sendIntent({ kind: 'sync' });
      } catch (error) {
        setLanError(
          error instanceof Error && error.message
            ? mapLanError(error.message)
            : t('lan.connectionFailed'),
        );
        setGuestOnline(false);
      } finally {
        setGuestConnecting(false);
      }
    },
    [guestCode, guestName, guestRoom, mapLanError, t],
  );

  useEffect(() => {
    if (mode !== 'lan-guest') return;
    const timer = window.setInterval(() => {
      const active = guestRef.current;
      if (active) setGuestOnline(active.status === 'open');
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (mode === 'lan-guest' && guestStarted && guestView && !guestEnteredRef.current) {
      guestEnteredRef.current = true;
      setScreen('game');
    }
  }, [guestStarted, guestView, mode]);

  const onHome = useCallback(() => {
    if (modeRef.current === 'lan-guest') {
      closeLan();
      setScreen('home');
      return;
    }
    if (modeRef.current === 'lan-host') {
      const playing = gameRef.current?.phase !== 'ended';
      if (playing && !window.confirm(t('lan.leaveConfirm'))) return;
      closeLan();
      setScreen('home');
      return;
    }
    if (game && game.phase !== 'ended') {
      if (!window.confirm(t('game.confirmHome'))) return;
      if (!demoRef.current) saveCurrentGame(game);
      setSaved(loadSavedGame());
    }
    ai.current.cancelAll();
    setHint(null);
    setThinking(false);
    setScreen('home');
  }, [closeLan, game, t]);

  const onUndo = useCallback(() => {
    if (modeRef.current === 'lan-host' || modeRef.current === 'lan-guest') return;
    const current = gameRef.current;
    if (!current || current.phase === 'ended') return;
    const stack = stackRef.current;
    if (stack.length <= 1) return;
    stack.pop();
    let previous = stack[stack.length - 1];
    while (stack.length > 1) {
      const atHuman =
        previous.phase === 'summary' ||
        (previous.phase === 'support' &&
          previous.config.seats[previous.current]?.kind === 'human');
      if (atHuman) break;
      stack.pop();
      previous = stack[stack.length - 1];
    }
    ai.current.cancelAll();
    hintSeq.current += 1;
    gameRef.current = previous;
    setGame(previous);
    setHint(null);
    setThinking(false);
    sound.click();
    if (!demoRef.current) {
      saveCurrentGame(previous);
      setSaved(loadSavedGame());
    }
  }, []);

  const requestHint = useCallback(
    (aiView: GameView) => {
      const seq = ++hintSeq.current;
      setThinking(true);
      ai.current
        .choose(aiView, 'hard', 80)
        .then((move) => {
          if (seq !== hintSeq.current) return;
          setThinking(false);
          if (move) {
            setHint(move);
            showToast(t('game.hintReady'));
          } else {
            setHint(null);
            showToast(t('game.noHint'));
          }
        })
        .catch(() => {
          if (seq !== hintSeq.current) return;
          setThinking(false);
          showToast(t('game.noHint'));
        });
    },
    [showToast, t],
  );

  const onHint = useCallback(() => {
    if (modeRef.current === 'lan-guest') {
      if (
        !guestView ||
        guestView.phase !== 'support' ||
        guestView.mySeat === null ||
        guestView.current !== guestView.mySeat
      ) {
        return;
      }
      requestHint(guestView);
      return;
    }
    const current = gameRef.current;
    if (!current || current.phase !== 'support' || current.current < 0) return;
    if (modeRef.current === 'lan-host' && current.current !== 0) return;
    const seat = current.current;
    if (current.config.seats[seat]?.kind !== 'human') return;
    requestHint(viewGame(current, seat));
  }, [guestView, requestHint]);

  useEffect(() => {
    if (!game || screen !== 'game' || game.phase !== 'support') {
      setThinking(false);
      return;
    }
    const seat = game.config.seats[game.current];
    if (!seat || seat.kind !== 'ai') {
      setThinking(false);
      return;
    }
    let cancelled = false;
    const snapshot = game;
    const aiView = viewGame(snapshot, snapshot.current);
    const budget = seat.level === 'hard' ? 80 : seat.level === 'normal' ? 65 : seat.level === 'easy' ? 35 : 20;
    setThinking(true);
    const timer = window.setTimeout(() => {
      ai.current
        .choose(aiView, seat.level, budget)
        .then((move) => {
          if (cancelled) return;
          setThinking(false);
          const fallback = legalMoves(snapshot, snapshot.current).find(
            (candidate) => candidate.kind === 'support',
          );
          const chosen = move ?? fallback ?? null;
          if (chosen) commitMove(chosen);
        })
        .catch(() => {
          if (cancelled) return;
          setThinking(false);
          const fallback = legalMoves(snapshot, snapshot.current).find(
            (candidate) => candidate.kind === 'support',
          );
          if (fallback) commitMove(fallback);
        });
    }, 420);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setThinking(false);
      ai.current.cancelAll();
    };
  }, [game, screen, commitMove]);

  const onAdvance = useCallback(() => {
    if (modeRef.current === 'lan-guest') return;
    commitMove({ kind: 'advance' });
  }, [commitMove]);

  const onRematch = useCallback(() => {
    if (modeRef.current === 'lan-host') {
      startLanHostGame();
      return;
    }
    if (modeRef.current === 'lan-guest') return;
    if (!game) return;
    const config: GameConfig = {
      ...game.config,
      seed: `rally-${Date.now()}`,
      seats: game.config.seats.map((seat) => ({ ...seat })),
    };
    startGame(config);
  }, [game, startGame, startLanHostGame]);

  const openRules = useCallback(() => {
    setRulesReturn(screen);
    setScreen('rules');
  }, [screen]);

  const closeRules = useCallback(() => {
    setScreen(rulesReturn === 'rules' ? 'home' : rulesReturn);
  }, [rulesReturn]);

  const onChangeSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  const onResetStats = useCallback(() => {
    const empty = resetStats();
    statsRef.current = empty;
    setStats(empty);
  }, []);

  const toggleLang = useCallback(() => {
    setSettings((previous) => ({
      ...previous,
      lang: (previous.lang === 'zh' ? 'en' : 'zh') as Lang,
    }));
  }, []);

  const toggleSound = useCallback(() => {
    setSettings((previous) => ({
      ...previous,
      sound: previous.sound === 'on' ? 'low' : previous.sound === 'low' ? 'off' : 'on',
    }));
  }, []);

  const finishTutorial = useCallback(() => {
    markTutorialSeen();
    setShowTutorial(false);
  }, []);

  const viewerSeat = useMemo(() => {
    if (mode === 'lan-guest') return guestSeat;
    if (mode === 'lan-host') return 0;
    if (!game) return null;
    if (
      game.phase === 'support' &&
      game.current >= 0 &&
      game.config.seats[game.current]?.kind === 'human'
    ) {
      return game.current;
    }
    const human = game.config.seats.findIndex((seat) => seat.kind === 'human');
    return human >= 0 ? human : null;
  }, [game, guestSeat, mode]);

  const gameView = useMemo(() => {
    if (mode === 'lan-guest') return guestView;
    return game ? viewGame(game, viewerSeat) : null;
  }, [game, guestView, mode, viewerSeat]);

  const hintText = useMemo(() => {
    if (!hint || !gameView || hint.kind !== 'support') return null;
    const detail = explain(gameView, hint);
    const balloon = gameView.balloons.find((item) => item.id === String(detail.params.balloonId));
    if (!balloon) return null;
    return t(detail.key, {
      name: balloonName(balloon, settings.lang),
      gap: detail.params.gap ?? 0,
      position: detail.params.position ?? 0,
    });
  }, [gameView, hint, settings.lang, t]);

  const handleGameMove = useCallback(
    (move: Move) => {
      if (modeRef.current === 'lan-guest') {
        if (
          !guestView ||
          move.kind !== 'support' ||
          guestView.mySeat === null ||
          guestView.current !== guestView.mySeat
        ) {
          return;
        }
        guestRef.current?.sendIntent({
          kind: 'support',
          seat: guestView.mySeat,
          balloon: move.balloon,
          tailwind: move.tailwind,
        });
        return;
      }
      if (modeRef.current === 'lan-host') {
        const current = gameRef.current;
        if (!current) return;
        if (move.kind === 'support' && current.current !== 0) return;
        if (move.kind === 'advance' && current.phase !== 'summary') return;
      }
      commitMove(move);
    },
    [commitMove, guestView],
  );

  const reconnectGuest = useCallback(() => {
    void connectGuest(true);
  }, [connectGuest]);

  const copyInvite = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(lanInvite);
      showToast(t('lan.copied'));
    } catch {
      showToast(lanInvite || t('lan.copy'));
    }
  }, [lanInvite, showToast, t]);

  const openLan = useCallback(() => {
    setLanTab('host');
    setLanError('');
    setScreen('lan');
  }, []);

  const backFromLan = useCallback(() => {
    closeLan();
    setLanTab('host');
    setScreen('home');
  }, [closeLan]);

  const guestLobbyPlayers: LanPublicPeer[] =
    guestPlayers.length > 0
      ? guestPlayers
      : guestJoined
        ? [
            {
              seat: guestSeat,
              name: guestName.trim() || t('lan.guest'),
              connected: guestOnline,
              host: false,
            },
          ]
        : [];

  const home = (
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
      onLan={openLan}
      onStats={() => setScreen('stats')}
      onRules={openRules}
      onSettings={() => setScreen('settings')}
      onToggleLang={toggleLang}
      onToggleSound={toggleSound}
    />
  );

  return (
    <div className="app">
      {screen === 'home' && home}
      {screen === 'setup' && (
        <Setup
          t={t}
          lang={settings.lang}
          mode={mode === 'hotseat' ? 'hotseat' : 'solo'}
          onStart={startGame}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'game' && gameView && (
        <GameScreen
          view={gameView}
          t={t}
          lang={settings.lang}
          settings={settings}
          hintText={hintText}
          thinking={thinking}
          canUndo={
            mode !== 'lan-host' &&
            mode !== 'lan-guest' &&
            stackRef.current.length > 1
          }
          canAdvance={mode !== 'lan-guest'}
          canRematch={mode !== 'lan-guest'}
          lan={
            mode === 'lan-host'
              ? { role: 'host', code: lanCode, online: true }
              : mode === 'lan-guest'
                ? { role: 'guest', code: guestCode || lanCode, online: guestOnline }
                : null
          }
          onMove={handleGameMove}
          onUndo={onUndo}
          onHint={onHint}
          onClearHint={() => setHint(null)}
          onHome={onHome}
          onRules={openRules}
          onAdvance={onAdvance}
          onReplay={() => setScreen('replay')}
          onRematch={onRematch}
          onReconnect={reconnectGuest}
        />
      )}
      {screen === 'lan' && (
        <LanScreen
          t={t}
          tab={lanTab}
          host={{
            name: hostName,
            playerCount: hostPlayerCount,
            players: lanPlayers,
            code: lanCode,
            room: lanRoom,
            invite: lanInvite,
            qr: lanQr,
            busy: lanBusy,
            error: lanTab === 'host' ? lanError : '',
          }}
          guest={{
            name: guestName,
            room: guestRoom,
            code: guestCode,
            players: guestLobbyPlayers,
            seat: guestSeat,
            connecting: guestConnecting,
            joined: guestJoined,
            online: guestOnline,
            started: guestStarted,
            error: lanTab === 'guest' ? lanError : '',
          }}
          onTab={(next) => {
            setLanTab(next);
            setLanError('');
          }}
          onHostName={setHostName}
          onPlayerCount={setHostPlayerCount}
          onCreateHost={() => void openLanHost()}
          onStartHost={startLanHostGame}
          onCopyInvite={() => void copyInvite()}
          onGuestName={setGuestName}
          onGuestRoom={setGuestRoom}
          onGuestCode={setGuestCode}
          onJoinGuest={() => void connectGuest(false)}
          onReconnectGuest={() => void connectGuest(true)}
          onBack={backFromLan}
        />
      )}
      {screen === 'replay' && gameView && (
        <ReplayScreen
          view={gameView}
          t={t}
          lang={settings.lang}
          onBack={() => setScreen('game')}
        />
      )}
      {screen === 'stats' && (
        <StatsScreen
          t={t}
          lang={settings.lang}
          stats={stats}
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
          onTutorial={() => setShowTutorial(true)}
        />
      )}
      {screen === 'rules' && (
        <RulesScreen
          t={t}
          onBack={closeRules}
          onTutorial={() => setShowTutorial(true)}
        />
      )}

      <Toast message={toast} />
      {showTutorial && <Tutorial t={t} lang={settings.lang} onDone={finishTutorial} onSkip={finishTutorial} />}
    </div>
  );
}
