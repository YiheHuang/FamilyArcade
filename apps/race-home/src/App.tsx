import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseMove, explainMove, type AiLevel, type HintKey } from './ai/ai';
import { Board, Die } from './components/Board';
import {
  COLORS,
  HOME,
  LANE_START,
  type Color,
  type GameEvent,
  type GameState,
  type SeatView,
  homeCount,
  legalMoves,
  move,
  roll,
  setup,
  skipTurn,
  view,
} from './game/race-home';
import { detectLang, t, type Lang, type MessageKey } from './i18n';
import {
  guestWsUrl,
  hostWsUrl,
  inviteUrl,
  startLanServer,
  type LanServerInfo,
} from './net';
import {
  clearRecord,
  clearSave,
  loadRecord,
  loadSave,
  recordResult,
  saveGame,
  type FamilyRecord,
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'record' | 'rules' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type SetupMode = 'ai' | 'local';

const COLOR_NAME: Record<Color, MessageKey> = {
  red: 'red',
  green: 'green',
  yellow: 'yellow',
  blue: 'blue',
};

const COLOR_PLAYER: Record<Color, MessageKey> = {
  red: 'redPlayer',
  green: 'greenPlayer',
  yellow: 'yellowPlayer',
  blue: 'bluePlayer',
};

const LEVEL_KEY: Record<AiLevel, MessageKey> = {
  companion: 'companion',
  easy: 'easy',
  normal: 'normal',
  hard: 'hard',
};

const HINT_KEY: Record<HintKey, MessageKey> = {
  finish: 'hintFinish',
  capture: 'hintCapture',
  lane: 'hintLane',
  base: 'hintBase',
  safe: 'hintSafe',
  advance: 'hintAdvance',
};

const AI_CARDS: { id: AiLevel; note: MessageKey }[] = [
  { id: 'companion', note: 'companionHint' },
  { id: 'easy', note: 'easyHint' },
  { id: 'normal', note: 'normalHint' },
  { id: 'hard', note: 'hardHint' },
];

const SEED =
  typeof location !== 'undefined' ? new URLSearchParams(location.search).get('seed') : null;

function makeRng(seed: string | null): () => number {
  if (!seed) return () => Math.random();
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function makePreviewState(): GameState {
  const state = setup(COLORS);
  return {
    ...state,
    turn: 1,
    die: 4,
    phase: 'roll',
    rolls: 26,
    moves: 41,
    pawns: {
      red: [10, 23, 52, HOME],
      green: [5, 18, 31, 56],
      yellow: [-1, 14, 40, HOME],
      blue: [-1, -1, 33, 53],
    },
  };
}

function colorName(lang: Lang, color: Color): string {
  return t(lang, COLOR_NAME[color]);
}

function colorPlayerName(lang: Lang, color: Color): string {
  return t(lang, COLOR_PLAYER[color]);
}

function gameLabel(lang: Lang, count: number): string {
  if (lang === 'zh') return `${count} 局`;
  return `${count} ${count === 1 ? 'game' : 'games'}`;
}

function playersFor(count: number): Color[] {
  return COLORS.slice(0, Math.max(2, Math.min(4, count)));
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (guestParams()?.room ? 'lan' : 'home'));
  const [setupMode, setSetupMode] = useState<SetupMode>('ai');
  const [mode, setMode] = useState<Mode>(() => (guestParams()?.room ? 'lan-guest' : 'ai'));
  const [level, setLevel] = useState<AiLevel>('normal');
  const [playerCount, setPlayerCount] = useState(2);
  const [state, setState] = useState<GameState>(() => setup(playersFor(2)));
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [recordReturn, setRecordReturn] = useState<Screen>('home');
  const [resetPending, setResetPending] = useState(false);
  const [preview] = useState<GameState>(() => makePreviewState());
  const [rng] = useState<() => number>(() => makeRng(SEED));
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.race-home.sound') !== 'off';
    } catch {
      return true;
    }
  });

  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCount, setLanCount] = useState(2);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');

  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => guestParams()?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => guestParams()?.code ?? '');
  const [guestRoom] = useState(() => guestParams()?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const guestRef = useRef<LanGuest | null>(null);
  const recordedRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );

  const flash = useCallback((text: string) => setToast(text), []);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.race-home.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setToast('');
  }, [screen]);

  useEffect(() => {
    if (!resetPending) return;
    const timer = window.setTimeout(() => setResetPending(false), 3600);
    return () => window.clearTimeout(timer);
  }, [resetPending]);

  useEffect(() => {
    return () => {
      hostRef.current?.close();
      guestRef.current?.close();
    };
  }, []);

  const announce = useCallback(
    (event: GameEvent | null) => {
      if (!event) return;
      if (event.type === 'roll') {
        if (soundOn) chime('roll');
        return;
      }
      if (event.type === 'pass') {
        flash(tr('noMove'));
        if (soundOn) chime('move');
        return;
      }
      if (event.type === 'win') {
        if (soundOn) chime('win');
        return;
      }
      if (event.captured.length > 0) {
        flash(tr('captured', { name: colorPlayerName(lang, event.captured[0].color) }));
        if (soundOn) chime('capture');
        return;
      }
      if (event.to === HOME) {
        flash(tr('finishedPawn'));
        if (soundOn) chime('home');
        return;
      }
      if (event.extra) flash(tr('sixExtra'));
      if (soundOn) chime('move');
    },
    [flash, lang, soundOn, tr],
  );

  const commit = useCallback(
    (next: GameState, previous: GameState, event: GameEvent | null) => {
      setHistory((items) => [...items, previous]);
      setState(next);
      setHint(null);
      announce(event ?? next.lastEvent);

      if (mode === 'ai' || mode === 'local') {
        if (next.phase === 'over') {
          if (!recordedRef.current) {
            recordedRef.current = true;
            setRecord(recordResult(next, mode));
          }
          clearSave();
          setSaved(null);
        } else {
          saveGame({ state: next, mode, level });
          setSaved({
            version: 2,
            state: next,
            mode,
            level,
            savedAt: Date.now(),
          });
        }
      }

      if (mode === 'lan-host' && hostRef.current) {
        for (let seat = 1; seat < next.players.length; seat++) {
          hostRef.current.sendView(seat, view(next, seat));
        }
        if (next.phase === 'over') hostRef.current.sendResult({ winner: next.winner });
      }
    },
    [announce, level, mode],
  );

  const startRace = useCallback((nextMode: 'ai' | 'local', count: number) => {
    const next = setup(playersFor(count));
    setMode(nextMode);
    setPlayerCount(count);
    setState(next);
    setHistory([]);
    setHint(null);
    recordedRef.current = false;
    setSaved(null);
    clearSave();
    setScreen('game');
  }, []);

  const beginHostRace = useCallback(() => {
    if (!lanHost) return;
    const colors = playersFor(lanCount);
    const next = setup(colors);
    setMode('lan-host');
    setPlayerCount(lanCount);
    setState(next);
    setHistory([]);
    setHint(null);
    recordedRef.current = false;
    setScreen('game');
    lanHost.start();
    for (let seat = 1; seat < colors.length; seat++) {
      lanHost.sendView(seat, view(next, seat));
    }
  }, [lanCount, lanHost]);

  const resume = useCallback(() => {
    if (!saved) return;
    setMode(saved.mode);
    setLevel(saved.level);
    setPlayerCount(saved.state.players.length);
    setState(saved.state);
    setHistory([]);
    setHint(null);
    recordedRef.current = saved.state.phase === 'over';
    setScreen('game');
  }, [saved]);

  const beginSetup = (nextMode: SetupMode) => {
    setSetupMode(nextMode);
    setPlayerCount(2);
    setScreen('setup');
  };

  const openRecord = (from: Screen) => {
    setRecordReturn(from);
    setResetPending(false);
    setScreen('record');
  };

  // AI takes its whole turn, one action at a time, with a short table pause.
  useEffect(() => {
    if (screen !== 'game' || mode !== 'ai' || state.phase === 'over') return;
    const color = state.players[state.turn];
    if (color === 'red') return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      setAiThinking(false);
      if (state.phase === 'roll') {
        const result = roll(state, rng);
        if (result.ok) commit(result.state, state, result.state.lastEvent);
      } else if (state.phase === 'move') {
        const pawn = chooseMove(state, level, rng);
        if (pawn < 0) return;
        const result = move(state, pawn);
        if (result.ok) commit(result.state, state, result.state.lastEvent);
      }
    }, 560);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, level, mode, rng, screen, state]);

  const closeLan = useCallback(() => {
    const host = hostRef.current;
    hostRef.current = null;
    try {
      host?.broadcast({ t: 'rejected', reason: 'host-closed' });
    } catch {
      /* socket may already be closed */
    }
    host?.close();
    const joined = guestRef.current;
    guestRef.current = null;
    joined?.close();
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lan')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    setLanHost(null);
    setGuest(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanError('');
    setLanBusy(false);
    setGuestView(null);
    setGuestStarted(false);
  }, []);

  const leaveGame = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') closeLan();
    setScreen('home');
  }, [closeLan, mode]);

  const openLanHost = async () => {
    setScreen('lan');
    setMode('lan-host');
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
        name: lang === 'zh' ? '牌桌主机' : 'Host',
        maxPlayers: lanCount,
      });
      hostRef.current = host;
      setLanHost(host);
      setLanCode(code);
      host.onChange((players) => {
        setLanPlayers(players);
        const current = stateRef.current;
        hostRef.current?.sendLobby();
        if (hostRef.current?.started) {
          for (const player of players) {
            if (player.seat > 0 && player.connected) {
              hostRef.current.sendView(player.seat, view(current, player.seat));
            }
          }
        }
      });
      host.onIntent((seat, intent) => {
        const current = stateRef.current;
        const payload = (intent ?? {}) as { type?: string; pawn?: number };
        if (payload.type === 'resync') {
          hostRef.current?.sendView(seat, view(current, seat));
          return;
        }
        if (current.phase === 'over' || seat !== current.turn) return;
        if (payload.type === 'roll' && current.phase === 'roll') {
          const result = roll(current, rng);
          if (result.ok) commit(result.state, current, result.state.lastEvent);
        } else if (payload.type === 'pawn' && current.phase === 'move') {
          const pawn = Number(payload.pawn);
          if (!Number.isInteger(pawn)) return;
          const result = move(current, pawn);
          if (result.ok) commit(result.state, current, result.state.lastEvent);
        }
      });
      host.onClose(() => {
        if (hostRef.current) {
          const text = tr('lanClosed');
          setLanError(text);
          flash(text);
        }
      });
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#2c251d', light: '#fffaf0' },
        }),
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setLanError(detail ? `${tr('lanDisconnected')} ${tr('lanRelayHint')}` : tr('lanDisconnected'));
      const failed = hostRef.current;
      hostRef.current = null;
      failed?.close();
      setLanHost(null);
      setLanInfo(null);
      setLanCode('');
      setLanInvite('');
      setLanQr('');
    } finally {
      setLanBusy(false);
    }
  };

  const joinGuest = async () => {
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
      guestRef.current = joined;
      setGuest(joined);
      joined.onView((payload) => {
        setGuestView(payload as SeatView);
        setGuestStarted(true);
        setScreen((current) => (current === 'record' || current === 'rules' ? current : 'game'));
      });
      joined.onStart((players) => {
        setLanPlayers(players);
        setGuestStarted(true);
        setScreen('game');
      });
      joined.onPlayers((players) => setLanPlayers(players));
      joined.onError((reason) => {
        const text =
          reason === 'host-closed'
            ? tr('lanClosed')
            : reason === 'room-full'
              ? tr('lanFull')
              : tr('lanWrong');
        setLanError(text);
        flash(text);
      });
      setGuestStarted(false);
      joined.sendIntent({ type: 'resync' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLanError(
        message.includes('room-full')
          ? tr('lanFull')
          : message.includes('wrong-code') || message.includes('rejected')
            ? tr('lanWrong')
            : tr('lanDisconnected'),
      );
    } finally {
      setGuestConnecting(false);
    }
  };

  const shownState: GameState = mode === 'lan-guest' && guestView ? guestView : state;
  const isOver = shownState.phase === 'over';
  const currentSeat = shownState.turn;
  const currentColor = shownState.players[currentSeat];
  const currentName =
    mode === 'ai'
      ? currentColor === 'red'
        ? tr('you')
        : `${tr('ai')} · ${t(lang, LEVEL_KEY[level])}`
      : mode === 'lan-host' || mode === 'lan-guest'
        ? lanPlayers.find((player) => player.seat === currentSeat)?.name ??
          colorPlayerName(lang, currentColor)
        : colorPlayerName(lang, currentColor);

  const humanControlled =
    !isOver &&
    (mode === 'ai'
      ? currentColor === 'red'
      : mode === 'lan-host'
        ? currentSeat === 0
        : mode === 'lan-guest'
          ? Boolean(guestView && guestView.seat === currentSeat)
          : true);

  const visibleLegal = isOver
    ? []
    : mode === 'lan-guest'
      ? (guestView?.legal ?? [])
      : legalMoves(shownState);

  const canRoll =
    mode === 'lan-guest'
      ? Boolean(guestStarted && guestView?.canRoll)
      : humanControlled && shownState.phase === 'roll' && !aiThinking;
  const canMove =
    mode === 'lan-guest'
      ? Boolean(guestStarted && guestView?.canMove)
      : humanControlled && shownState.phase === 'move' && !aiThinking;
  const canHint = humanControlled && !isOver;
  const canUndo = (mode === 'ai' || mode === 'local') && history.length > 0 && !isOver;

  const winnerSeat = shownState.winner ? shownState.players.indexOf(shownState.winner) : -1;
  const winnerName =
    shownState.winner && winnerSeat >= 0
      ? shownState.winner === 'red' && mode === 'ai'
        ? tr('you')
        : mode === 'lan-host' || mode === 'lan-guest'
          ? (lanPlayers.find((player) => player.seat === winnerSeat)?.name ??
            colorPlayerName(lang, shownState.winner))
          : colorPlayerName(lang, shownState.winner)
      : '';

  const statusTitle = isOver
    ? tr('raceOver')
    : mode === 'lan-guest' && !guestView
      ? tr('lanGuestTitle')
      : humanControlled
        ? tr('yourTurn')
        : tr('turnOf', { name: currentName });

  const statusLine = isOver
    ? tr('winnerSub')
    : mode === 'lan-guest' && !guestStarted
      ? tr('waitingLanStart')
      : aiThinking
        ? tr('thinking', { name: currentName })
        : !humanControlled
          ? tr('waitingFor', { name: currentName })
          : shownState.phase === 'roll'
            ? tr('rollPrompt')
            : tr('movePrompt');

  const actionLabel = isOver
    ? tr('raceOver')
    : mode === 'lan-guest' && !guestStarted
      ? tr('waitingLan')
      : !humanControlled
        ? tr('waitingFor', { name: currentName })
        : shownState.phase === 'roll'
          ? tr('rollDie')
          : tr('choosePawn');

  const actRoll = useCallback(() => {
    if (!canRoll) return;
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'roll' });
      return;
    }
    const result = roll(state, rng);
    if (result.ok) commit(result.state, state, result.state.lastEvent);
  }, [canRoll, commit, guest, mode, rng, state]);

  const actPawn = useCallback(
    (pawn: number) => {
      if (!canMove) return;
      if (mode === 'lan-guest') {
        if (guestView?.legal.includes(pawn)) guest?.sendIntent({ type: 'pawn', pawn });
        return;
      }
      if (!visibleLegal.includes(pawn)) return;
      const result = move(state, pawn);
      if (result.ok) commit(result.state, state, result.state.lastEvent);
    },
    [canMove, commit, guest, guestView, mode, state, visibleLegal],
  );

  const undo = () => {
    if (!canUndo) return;
    let index = history.length - 1;
    if (mode === 'ai') {
      while (index > 0 && !(history[index].players[history[index].turn] === 'red')) index--;
    }
    const previous = history[index];
    setHistory(history.slice(0, index));
    setState(previous);
    setHint(null);
    if (mode === 'ai' || mode === 'local') {
      saveGame({ state: previous, mode, level });
      setSaved({ version: 2, state: previous, mode, level, savedAt: Date.now() });
    }
  };

  const showHint = () => {
    if (!canHint) return;
    if (shownState.phase === 'roll') {
      setHint(null);
      flash(tr('hintRoll'));
      return;
    }
    const pawn = chooseMove(shownState, 'hard', () => 0.5);
    if (pawn < 0) {
      flash(tr('hintNone'));
      return;
    }
    const info = explainMove(shownState, pawn);
    setHint(pawn);
    flash(info ? tr(HINT_KEY[info.key]) : tr('hintAdvance'));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === 'Escape') {
        if (screen === 'game') leaveGame();
        else if (screen === 'record') setScreen(recordReturn);
        else if (screen === 'lan') {
          closeLan();
          setScreen('home');
        } else setScreen('home');
        return;
      }
      if (screen !== 'game') return;
      const key = event.key.toLowerCase();
      if (key === 'r' || event.key === ' ') {
        event.preventDefault();
        actRoll();
        return;
      }
      if (key === 'h' && canHint) {
        event.preventDefault();
        showHint();
        return;
      }
      if (key === 'u' && canUndo) {
        event.preventDefault();
        undo();
        return;
      }
      const number = Number(event.key);
      if (Number.isInteger(number) && number >= 1 && number <= 4) {
        if (canMove && visibleLegal.includes(number - 1)) {
          event.preventDefault();
          actPawn(number - 1);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const restart = () => {
    if (mode === 'lan-guest') return;
    if (mode === 'lan-host') {
      beginHostRace();
      return;
    }
    startRace(mode === 'local' ? 'local' : 'ai', playerCount);
  };

  const skipOffline = () => {
    if (mode !== 'lan-host' || state.phase === 'over' || state.turn === 0) return;
    if (lanPlayers[state.turn]?.connected !== false) return;
    const next = skipTurn(state);
    commit(next, state, next.lastEvent);
  };

  const modeLabel =
    mode === 'ai'
      ? tr('gameModeAi')
      : mode === 'local'
        ? tr('gameModeLocal')
        : mode === 'lan-host'
          ? tr('gameModeHost')
          : tr('gameModeGuest');

  const connectedCount = lanPlayers.filter((player) => player.connected).length;
  const lanReady = connectedCount >= lanCount;
  const missingPlayers = Math.max(0, lanCount - connectedCount);

  const playerName = (color: Color, seat: number): string => {
    if (mode === 'ai') {
      return color === 'red' ? tr('you') : `${tr('ai')} · ${t(lang, LEVEL_KEY[level])}`;
    }
    if (mode === 'lan-host' || mode === 'lan-guest') {
      return lanPlayers.find((player) => player.seat === seat)?.name ?? colorPlayerName(lang, color);
    }
    return colorPlayerName(lang, color);
  };

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="100%" height="100%">
              <path d="M24 5 L42 20 H37 V40 H11 V20 H6 Z" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
              <circle cx="24" cy="27" r="5.5" fill="currentColor" />
            </svg>
          </div>
          <div>
            <p className="eyebrow">{tr('gameNo')}</p>
            <h1>{tr('title')}</h1>
            <p className="subtitle">{tr('subtitle')}</p>
          </div>
        </div>
        <div className="mast-actions">
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
          <button className="ghost" onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-board-card">
          <div className="hero-tape" aria-hidden="true" />
          <Board state={preview} legal={[]} hint={null} disabled lang={lang} onPawn={() => undefined} />
          <div className="hero-caption">
            <div>
              <strong>{tr('setupPeek')}</strong>
              <span className="hero-caption-note">{tr('setupPeekNote')}</span>
            </div>
            <Die value={5} small lang={lang} />
          </div>
        </div>

        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide continue-card" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>
                  {saved.mode === 'ai' ? tr('gameModeAi') : tr('gameModeLocal')} ·{' '}
                  {saved.state.players.length} {tr('players')}
                </small>
              </button>
            )}
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={() => beginSetup('ai')}>
              <span>{tr('playAi')}</span>
              <small>{tr('playAiSub')}</small>
            </button>
            <button className="secondary wide" onClick={() => beginSetup('local')}>
              <span>{tr('playLocal')}</span>
              <small>{tr('playLocalSub')}</small>
            </button>
            <button
              className="secondary wide"
              onClick={() => {
                setMode('lan-host');
                setLanError('');
                setScreen('lan');
              }}
            >
              <span>{tr('playLan')}</span>
              <small>{tr('playLanSub')}</small>
            </button>
            <div className="menu-links">
              <button className="text-button" onClick={() => openRecord('home')}>
                {tr('familyRecord')} →
              </button>
              <button className="text-button" onClick={() => setScreen('rules')}>
                {tr('rules')} →
              </button>
            </div>
          </div>

          <ul className="quick-rules">
            <li><span>1</span>{tr('quick1')}</li>
            <li><span>2</span>{tr('quick2')}</li>
            <li><span>3</span>{tr('quick3')}</li>
          </ul>

          <div className="record-strip">
            <strong>{record.games}</strong>
            <span>{lang === 'en' && record.games === 1 ? 'game' : tr('games')}</span>
            <span className="dot">·</span>
            <span>{record.familyWins} {tr('familyWins')}</span>
            <span className="dot">·</span>
            <span>
              {tr('best')} {record.bestRolls === null ? '—' : `${record.bestRolls} ${tr('rolls')}`}
            </span>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell setup-shell">
      <header className="subhead">
        <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
        <div className="subhead-tools">
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{tr('language')}</button>
          <button className="ghost" onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
        </div>
      </header>
      <div className="setup-layout">
        <section className="setup-panel">
          <p className="eyebrow">{tr('gameNo')}</p>
          <h2 className="screen-title">{setupMode === 'ai' ? tr('setupAiTitle') : tr('setupLocalTitle')}</h2>
          <p className="lede">{setupMode === 'ai' ? tr('setupAiSub') : tr('setupLocalSub')}</p>

          <section className="choice-block">
            <h3>{tr('players')}</h3>
            <div className="segmented" role="group" aria-label={tr('players')}>
              {[2, 3, 4].map((count) => (
                <button
                  key={count}
                  className={playerCount === count ? 'selected' : ''}
                  onClick={() => setPlayerCount(count)}
                >
                  {count}
                  <small>{t(lang, count === 2 ? 'twoPlayers' : count === 3 ? 'threePlayers' : 'fourPlayers')}</small>
                </button>
              ))}
            </div>
          </section>

          {setupMode === 'ai' && (
            <section className="choice-block">
              <h3>{tr('aiLevel')}</h3>
              <div className="level-grid">
                {AI_CARDS.map((item) => (
                  <button
                    key={item.id}
                    className={`level-card ${level === item.id ? 'selected' : ''}`}
                    onClick={() => setLevel(item.id)}
                  >
                    <span className={`level-dot ${item.id}`} />
                    <strong>{tr(LEVEL_KEY[item.id])}</strong>
                    <small>{tr(item.note)}</small>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="roster-preview">
            <h3>{tr('playerList')}</h3>
            <div className="roster-row">
              {playersFor(playerCount).map((color, seat) => (
                <div key={color} className="roster-chip">
                  <span className={`player-dot dot-${color}`} />
                  <div>
                    <strong>{colorPlayerName(lang, color)}</strong>
                    <small>
                      {setupMode === 'ai' && seat > 0
                        ? `${tr('ai')} · ${tr(LEVEL_KEY[level])}`
                        : setupMode === 'ai'
                          ? tr('youAreRed')
                          : tr('seat', { n: seat + 1 })}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            {setupMode === 'local' && <p className="note">{tr('redFirst')}</p>}
          </section>

          <div className="row-actions">
            <button className="primary" onClick={() => startRace(setupMode, playerCount)}>
              {tr('begin')}
            </button>
            <button className="ghost" onClick={() => setScreen('home')}>{tr('back')}</button>
          </div>
        </section>

        <aside className="setup-preview">
          <div className="preview-card">
            <Board
              state={{ ...preview, players: playersFor(playerCount), turn: 0 }}
              legal={[]}
              hint={null}
              disabled
              lang={lang}
              onPawn={() => undefined}
            />
          </div>
          <div className="preview-copy">
            <strong>{tr('setupPeek')}</strong>
            <p>{tr('setupPeekNote')}</p>
          </div>
        </aside>
      </div>
    </main>
  );

  const gameScreen = (
    <main className="shell game-shell">
      <header className="game-top">
        <button className="back" onClick={leaveGame}>← {tr('home')}</button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>{modeLabel}</span>
        </div>
        <div className="game-tools">
          <button className="ghost" onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{tr('language')}</button>
        </div>
      </header>

      <div className="game-layout">
        <section className="board-wrap">
          <div className="turn-bar">
            <span className={`turn-dot dot-${currentColor}`} aria-hidden="true" />
            <div className="turn-copy">
              <strong>{statusTitle}</strong>
              <p>{statusLine}</p>
            </div>
            <div className="dice-zone">
              <Die value={shownState.die} lang={lang} />
              <span>{isOver ? tr('raceOver') : shownState.phase === 'move' ? tr('choosePawn') : shownState.die === 6 ? tr('sixExtra') : tr('roll')}</span>
            </div>
          </div>

          {mode === 'lan-guest' && !guestView ? (
            <div className="waiting-panel">
              <span className="waiting-dot" />
              <strong>{tr('waitingLanStart')}</strong>
              <p>{tr('lanGuestNote')}</p>
            </div>
          ) : (
            <Board
              state={shownState}
              legal={canMove ? visibleLegal : []}
              hint={hint}
              disabled={!canMove}
              lang={lang}
              onPawn={actPawn}
            />
          )}

          <div className="action-bar">
            <button className="primary roll-button" onClick={actRoll} disabled={!canRoll}>
              {actionLabel}
            </button>
            <button className="secondary" onClick={showHint} disabled={!canHint}>
              {tr('hint')}
            </button>
            <button className="secondary" onClick={undo} disabled={!canUndo}>
              {tr('undo')}
            </button>
            <span className="keyboard-hint">{tr('keyboard')}</span>
          </div>

          {isOver && (
            <div className="result-banner" role="status">
              <div>
                <strong>{tr('winnerText', { name: winnerName })}</strong>
                <p>{tr('winnerSub')}</p>
              </div>
              {mode === 'lan-guest' ? (
                <span className="muted">{tr('waitingLan')}</span>
              ) : (
                <button className="primary" onClick={restart}>{tr('restart')}</button>
              )}
            </div>
          )}

          {mode === 'lan-host' && !isOver && currentSeat > 0 && !lanPlayers[currentSeat]?.connected && (
            <div className="offline-banner">
              <span>{tr('lanDisconnect')}</span>
              <button className="secondary small" onClick={skipOffline}>{tr('lanSkip')}</button>
            </div>
          )}
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{tr('playerList')}</h3>
            <ul className="player-list">
              {shownState.players.map((color, seat) => {
                const homePawns = homeCount(shownState, color);
                const isActive = !isOver && shownState.turn === seat;
                return (
                  <li key={color} className={isActive ? 'active' : ''}>
                    <span className={`player-dot dot-${color}`} aria-hidden="true" />
                    <div className="player-info">
                      <div className="player-line">
                        <strong>{playerName(color, seat)}</strong>
                        {homePawns === 4 && <span className="home-badge">{tr('homeBadge')}</span>}
                      </div>
                      <small>{tr('atHome', { n: homePawns })}</small>
                      <div className="pawn-meter" aria-hidden="true">
                        {shownState.pawns[color].map((pos, index) => (
                          <span
                            key={index}
                            className={`mini-pawn mini-${color} ${
                              pos === HOME
                                ? 'is-home'
                                : pos >= LANE_START
                                  ? 'is-lane'
                                  : pos >= 0
                                    ? 'is-ring'
                                    : 'is-base'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    {isActive && <span className="turn-tick" aria-hidden="true" />}
                  </li>
                );
              })}
            </ul>
          </div>

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <h3>{tr('roomCode')}</h3>
              <div className="room-code">{lanCode}</div>
              <p>{lanReady ? tr('lanReady') : tr('lanWaiting')}</p>
              <div className="peer-list">
                {lanPlayers.map((player) => (
                  <span key={player.seat} className={player.connected ? 'online' : ''}>
                    {player.name} {player.connected ? '●' : '○'}
                  </span>
                ))}
              </div>
              <p className="note">{tr('lanHostNote')}</p>
            </div>
          )}

          {mode === 'lan-guest' && (
            <div className="side-card lan-mini">
              <h3>{tr('gameModeGuest')}</h3>
              <p>{guestView ? tr('lanGuestSeat', { name: playerName(guestView.color, guestView.seat), color: colorName(lang, guestView.color) }) : tr('waitingLan')}</p>
              <p className="peer">{guest?.room ? `${tr('roomLabel')} ${guest.room}` : ''}</p>
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('recordMini')}</h3>
            <p>{tr('recordMiniLine', { games: gameLabel(lang, record.games), wins: record.familyWins })}</p>
            <button className="text-button" onClick={() => openRecord('game')}>
              {tr('familyRecord')} →
            </button>
          </div>

          <div className="side-card howto-mini">
            <h3>{tr('rules')}</h3>
            <p>{tr('quick1')}</p>
            <p>{tr('quick2')}</p>
          </div>
        </aside>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const recordScreen = (
    <main className="shell narrow-shell record-shell">
      <header className="subhead">
        <button className="back" onClick={() => setScreen(recordReturn)}>← {tr('back')}</button>
        <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{tr('language')}</button>
      </header>
      <p className="eyebrow">{tr('gameNo')}</p>
      <h2 className="screen-title">{tr('recordTitle')}</h2>
      <p className="lede">{tr('recordSub')}</p>

      <section className="record-grid">
        <div className="stat-card">
          <span>{tr('totalGames')}</span>
          <strong>{record.games}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('familyWinsLabel')}</span>
          <strong>{record.familyWins}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('aiWinsLabel')}</span>
          <strong>{record.aiWins}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('bestGame')}</span>
          <strong>{record.bestRolls === null ? '—' : tr('bestGameValue', { n: record.bestRolls })}</strong>
        </div>
      </section>

      {record.games === 0 ? (
        <div className="empty-card">{tr('recordEmpty')}</div>
      ) : (
        <section className="record-card">
          <div className="record-heading">
            <h3>{tr('perColor')}</h3>
            <span>{tr('lastWinner')}: {record.lastWinner ? colorName(lang, record.lastWinner) : tr('none')}</span>
          </div>
          <div className="wins-bars">
            {COLORS.map((color) => {
              const value = record.wins[color];
              const max = Math.max(1, ...COLORS.map((item) => record.wins[item]));
              return (
                <div className="win-row" key={color}>
                  <span className={`player-dot dot-${color}`} />
                  <span className="win-label">{colorName(lang, color)}</span>
                  <span className="win-track"><span className={`win-fill fill-${color}`} style={{ width: `${(value / max) * 100}%` }} /></span>
                  <strong>{value}</strong>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="note record-note">{tr('recordNote')}</p>
      <button className="secondary danger" onClick={() => {
        if (resetPending) {
          setRecord(clearRecord());
          setResetPending(false);
        } else {
          setResetPending(true);
        }
      }}>
        {resetPending ? tr('resetSure') : tr('resetRecord')}
      </button>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell rules-shell">
      <header className="subhead">
        <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
        <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{tr('language')}</button>
      </header>
      <p className="eyebrow">{tr('gameNo')}</p>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <div className="rules-hero">
        <div className={`icon-chip chip-red`}>6</div>
        <div>
          <strong>{tr('quick1')}</strong>
          <p>{tr('rule2')}</p>
        </div>
      </div>
      <ol className="rules-list">
        {(['rule1', 'rule2', 'rule3', 'rule4', 'rule5', 'rule6'] as MessageKey[]).map((key) => (
          <li key={key}>{tr(key)}</li>
        ))}
      </ol>
      <aside className="rule-note">{tr('rulesNote')}</aside>
      <div className="rules-legend">
        {COLORS.map((color) => (
          <span key={color}><i className={`legend-dot dot-${color}`} />{colorName(lang, color)}</span>
        ))}
      </div>
      <button className="primary" onClick={() => setScreen('home')}>{tr('close')}</button>
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell lan-shell">
      <header className="subhead">
        <button className="back" onClick={() => { closeLan(); setScreen('home'); }}>← {tr('back')}</button>
        <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{tr('language')}</button>
      </header>
      {mode === 'lan-guest' ? (
        <>
          <p className="eyebrow">LAN · {tr('roomLabel')} {guestRoom}</p>
          <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
          <p className="lede">{tr('lanGuestNote')}</p>
          {!guestStarted && (
            <div className="lan-form">
              <label>
                <span>{tr('lanName')}</span>
                <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={18} />
              </label>
              <label>
                <span>{tr('lanCode')}</span>
                <input
                  value={guestCode}
                  onChange={(event) => setGuestCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                  inputMode="numeric"
                  maxLength={4}
                />
              </label>
              <button
                className="primary wide"
                onClick={joinGuest}
                disabled={guestConnecting || !guestName.trim() || guestCode.length !== 4}
              >
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
            </div>
          )}
          {guest && !guestStarted && (
            <div className="waiting-card">
              <span className="waiting-dot" />
              <strong>{tr('waitingLanStart')}</strong>
              <p>{tr('lanGuestNote')}</p>
            </div>
          )}
          {lanError && <p className="error">{lanError}</p>}
          {guestStarted && <p className="note">{tr('lanGuestTurn')}</p>}
        </>
      ) : (
        <>
          <p className="eyebrow">FAMILY ARCADE · LAN</p>
          <h2 className="screen-title">{tr('lanTitle')}</h2>
          <p className="lede">{tr('lanSub')}</p>

          {!lanHost && (
            <section className="lan-card">
              <h3>{tr('lanCount')}</h3>
              <div className="segmented" role="group" aria-label={tr('lanCount')}>
                {[2, 3, 4].map((count) => (
                  <button
                    key={count}
                    className={lanCount === count ? 'selected' : ''}
                    onClick={() => setLanCount(count)}
                  >
                    {count}
                    <small>{t(lang, count === 2 ? 'twoPlayers' : count === 3 ? 'threePlayers' : 'fourPlayers')}</small>
                  </button>
                ))}
              </div>
              <button className="primary wide" onClick={openLanHost} disabled={lanBusy}>
                {lanBusy ? tr('lanStarting') : tr('lanOpen')}
              </button>
              <p className="note">{tr('lanHostNote')}</p>
              {lanError && <p className="error">{lanError}</p>}
            </section>
          )}

          {lanHost && lanInfo && lanInvite && (
            <div className="lan-layout">
              <div className="lan-card">
                <span className="label">{tr('roomCode')}</span>
                <div className="room-code big">{lanCode}</div>
                <p>{lanReady ? tr('lanReady') : tr('lanWaiting')}</p>
                {!lanReady && <p className="note">{tr('lanNeedPlayers', { n: missingPlayers })}</p>}
                <div className="peer-list">
                  {lanPlayers.slice(0, lanCount).map((player) => (
                    <span key={player.seat} className={player.connected ? 'online' : ''}>
                      <i className={`peer-dot dot-${playersFor(lanCount)[player.seat] ?? 'red'}`} />
                      {player.name} {player.connected ? '●' : '○'}
                    </span>
                  ))}
                </div>
                <button className="primary wide" onClick={beginHostRace} disabled={!lanReady}>{tr('lanReadyStart')}</button>
                <button className="secondary wide" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(lanInvite);
                    flash(tr('lanCopied'));
                  } catch {
                    flash(lanInvite);
                  }
                }}>{tr('lanCopy')}</button>
              </div>
              <div className="qr-card">
                {lanQr ? <img src={lanQr} alt={tr('lanScan')} /> : null}
                <p>{tr('lanScan')}</p>
                <code>{lanInvite.replace(/^https?:\/\//, '')}</code>
              </div>
            </div>
          )}
          {lanHost && lanError && <p className="error">{lanError}</p>}
        </>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'record') return recordScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
