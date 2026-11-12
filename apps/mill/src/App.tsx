import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  LanGuest,
  LanHost,
  guestParams,
  newRoomCode,
  type LanPublicPeer,
} from '@family-arcade/lan';
import { chooseMove, type AiLevel } from './ai/ai';
import { explainMove, type HintExplanation } from './ai/explain';
import { Board } from './components/Board';
import {
  MEN_EACH,
  apply,
  applySeat,
  legalMoves,
  millPointSet,
  millsFor,
  setup,
  view,
  type GameState,
  type Move,
  type Player,
  type SeatView,
} from './game/mill';
import { detectLang, playerName, t, type Lang, type MessageKey } from './i18n';
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
  type RecordMode,
  type SavedGame,
  type SavedMode,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'stats' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type Shown = GameState | SeatView;

const AI_LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const PREVIEW_BOARD = Array.from({ length: 24 }, (_, point) => {
  const white = [0, 1, 2, 16, 19, 22];
  const black = [8, 9, 12, 13, 15, 20];
  if (white.includes(point)) return 'W' as const;
  if (black.includes(point)) return 'B' as const;
  return null;
});

const RULES_BOARD = Array.from({ length: 24 }, (_, point) => {
  const white = [0, 1, 2, 12, 16, 19, 22];
  const black = [8, 9, 13, 15, 17, 20];
  if (white.includes(point)) return 'W' as const;
  if (black.includes(point)) return 'B' as const;
  return null;
});

function statusTitle(lang: Lang, shown: Shown): string {
  if (shown.status === 'won') {
    return t(lang, shown.winner === 'W' ? 'resultWhite' : 'resultBlack');
  }
  if (shown.status === 'draw') return t(lang, 'resultDraw');
  if (shown.pendingCapture) return t(lang, 'mill');
  if (shown.phase === 'placing') {
    return t(lang, shown.turn === 'W' ? 'whiteToPlace' : 'blackToPlace');
  }
  return t(lang, shown.turn === 'W' ? 'whiteToMove' : 'blackToMove');
}

function statusSubtitle(lang: Lang, shown: Shown): string {
  if (shown.status === 'won') {
    const loser: Player = shown.winner === 'W' ? 'B' : 'W';
    return t(lang, shown.winReason === 'blocked' ? 'resultSubBlocked' : 'resultSubTwo', {
      side: playerName(lang, loser),
    });
  }
  if (shown.status === 'draw') return t(lang, 'drawReason');
  if (shown.pendingCapture) {
    return t(lang, 'capturePrompt', { side: playerName(lang, shown.turn) });
  }
  if (shown.phase === 'placing') {
    return t(lang, 'inHand', { n: shown.hand[shown.turn] });
  }
  return t(lang, 'onBoard', { n: shown.onBoard[shown.turn] });
}

function resultText(lang: Lang, shown: Shown): { title: string; reason: string } {
  if (shown.status === 'draw') {
    return { title: t(lang, 'resultDraw'), reason: t(lang, 'drawReason') };
  }
  const winner = shown.winner ?? 'W';
  const loser: Player = winner === 'W' ? 'B' : 'W';
  return {
    title: t(lang, winner === 'W' ? 'resultWhite' : 'resultBlack'),
    reason: t(lang, shown.winReason === 'blocked' ? 'resultSubBlocked' : 'resultSubTwo', {
      side: playerName(lang, loser),
    }),
  };
}

function hintText(lang: Lang, hint: HintExplanation): string {
  switch (hint.kind) {
    case 'mill':
      return t(lang, 'hintMill', { side: playerName(lang, hint.side) });
    case 'capture':
      return t(lang, 'hintCapture');
    case 'captureAll':
      return t(lang, 'hintCaptureAll');
    case 'block':
      return t(lang, 'hintBlock', { side: playerName(lang, hint.side) });
    case 'two':
      return t(lang, 'hintTwo');
    case 'space':
      return t(lang, 'hintSpace');
    default:
      return t(lang, 'hintQuiet');
  }
}

function recordModeFor(mode: Mode): RecordMode {
  if (mode === 'ai') return 'solo';
  if (mode === 'local') return 'hotseat';
  return 'lan';
}

function findUndo(
  history: GameState[],
  mode: Mode,
  humanSide: Player,
): { target: GameState; index: number } | null {
  if (history.length === 0) return null;
  if (mode === 'local') {
    const index = history.length - 1;
    const target = history[index];
    if (target.status !== 'playing') return null;
    return { target, index };
  }
  if (mode !== 'ai') return null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const target = history[index];
    if (target.status === 'playing' && target.turn === humanSide) {
      return { target, index };
    }
  }
  return null;
}

export default function App() {
  const [initialParams] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(initialParams?.room ? 'lan' : 'home');
  const [mode, setMode] = useState<Mode>(initialParams?.room ? 'lan-guest' : 'ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [humanSide, setHumanSide] = useState<Player>('W');
  const [setupSide, setSetupSide] = useState<Player>('W');
  const [state, setState] = useState<GameState>(() => setup('W'));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [hint, setHint] = useState<{ move: Move; explanation: HintExplanation } | null>(null);
  const [hintThinking, setHintThinking] = useState(false);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.mill.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [rulesReturn, setRulesReturn] = useState<Screen>('home');
  const [resetArmed, setResetArmed] = useState(false);

  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => initialParams?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => initialParams?.code ?? '');
  const [guestRoom] = useState(() => initialParams?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const recordedRef = useRef(false);
  const joiningRef = useRef(false);
  const guestStatusRef = useRef<string | null>(null);
  const commitRef = useRef<(next: GameState, currentMode: Mode, previous: GameState) => void>(
    () => undefined,
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = `${t(lang, 'title')} · ${t(lang, 'subtitle')}`;
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.mill.sound', soundOn ? 'on' : 'off');
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
    if (!resetArmed) return;
    const timer = window.setTimeout(() => setResetArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [resetArmed]);

  const finishGame = useCallback((next: GameState, currentMode: Mode) => {
    if (next.status === 'playing' || recordedRef.current) return;
    recordedRef.current = true;
    if (currentMode !== 'lan-guest') {
      setRecord(recordResult(next, recordModeFor(currentMode)));
    }
    clearSave();
    setSaved(null);
  }, []);

  const commit = useCallback(
    (next: GameState, currentMode: Mode, previous: GameState) => {
      setHistory((items) => [...items.slice(-119), previous]);
      stateRef.current = next;
      setState(next);
      setHint(null);
      setSelected(null);
      if (soundOn) {
        const kind =
          next.status === 'won'
            ? 'win'
            : next.status === 'draw'
              ? 'draw'
              : next.last?.capture
                ? 'capture'
                : next.pendingCapture
                  ? 'mill'
                  : 'place';
        chime(kind);
      }
      finishGame(next, currentMode);
      if ((currentMode === 'ai' || currentMode === 'local') && next.status === 'playing') {
        const stored = saveGame({
          state: next,
          mode: currentMode as SavedMode,
          level,
          human: currentMode === 'local' ? 'W' : humanSide,
        });
        setSaved(stored);
      }
      if (currentMode === 'lan-host' && hostRef.current) {
        hostRef.current.sendView(1, view(next, 1));
        if (next.status !== 'playing') {
          hostRef.current.sendResult(view(next, 1));
        }
      }
    },
    [finishGame, humanSide, level, soundOn],
  );

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  useEffect(() => {
    if (guestView && guestView.status !== 'playing' && guestStatusRef.current !== guestView.status) {
      guestStatusRef.current = guestView.status;
      if (soundOn) chime(guestView.status === 'draw' ? 'draw' : 'win');
    }
    if (guestView?.status === 'playing') guestStatusRef.current = 'playing';
  }, [guestView, soundOn]);

  const goHome = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanInvite('');
    setLanQr('');
    setLanError('');
    guest?.close();
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    setSelected(null);
    setHint(null);
    setScreen('home');
  }, [guest]);

  const startGame = useCallback(
    (nextMode: 'ai' | 'local', side: Player) => {
      const next = setup('W');
      setMode(nextMode);
      setHumanSide(side);
      setSetupSide(side);
      stateRef.current = next;
      setState(next);
      setHistory([]);
      setSelected(null);
      setHint(null);
      setHintThinking(false);
      setAiThinking(false);
      recordedRef.current = false;
      setScreen('game');
      const stored = saveGame({
        state: next,
        mode: nextMode as SavedMode,
        level,
        human: nextMode === 'local' ? 'W' : side,
      });
      setSaved(stored);
    },
    [level],
  );

  const resume = () => {
    if (!saved) return;
    setMode(saved.mode);
    setLevel(saved.level);
    setHumanSide(saved.human);
    setSetupSide(saved.human);
    stateRef.current = saved.state;
    setState(saved.state);
    setHistory([]);
    setSelected(null);
    setHint(null);
    setAiThinking(false);
    recordedRef.current = false;
    setScreen('game');
  };

  const playMove = useCallback(
    (move: Move) => {
      if (mode === 'lan-guest') {
        if (!guestView?.canMove) return;
        guest?.sendIntent(move);
        return;
      }
      const current = stateRef.current;
      const result = mode === 'lan-host' ? applySeat(current, 0, move) : apply(current, move);
      if (!result.ok) {
        if (soundOn) chime('error');
        return;
      }
      commitRef.current(result.state, mode, current);
    },
    [guest, guestView, mode, soundOn],
  );

  const shown: Shown = mode === 'lan-guest' && guestView ? guestView : state;
  const board = shown.board;
  const shownStatus = shown.status;
  const shownTurn = shown.turn;
  const isGuest = mode === 'lan-guest';
  const hostConnected = mode === 'lan-host' ? Boolean(lanPlayers[1]?.connected) : true;
  const legal = isGuest
    ? (guestView?.legal ?? [])
    : state.status === 'playing'
      ? legalMoves(state)
      : [];

  const interactive =
    screen === 'game' &&
    shownStatus === 'playing' &&
    (isGuest
      ? Boolean(guestStarted && guestView?.canMove)
      : mode === 'lan-host'
        ? Boolean(hostConnected && state.turn === 'W')
        : mode === 'ai'
          ? state.turn === humanSide && !aiThinking
          : true);

  const captureMoves = legal.filter((move) => move.type === 'capture');
  const capturable =
    interactive && shown.pendingCapture
      ? captureMoves.map((move) => (move as { point: number }).point)
      : [];
  const targets =
    selected === null
      ? []
      : legal
          .filter((move): move is { type: 'move'; from: number; to: number } => move.type === 'move' && move.from === selected)
          .map((move) => move.to);
  const rivalPoints = shown.pendingCapture
    ? board.flatMap((cell, point) => (cell === shown.pendingCapture ? [point] : []))
    : [];
  const rivalMills = shown.pendingCapture ? millPointSet(board, shown.pendingCapture) : new Set<number>();
  const captureAll =
    Boolean(shown.pendingCapture) &&
    rivalPoints.length > 0 &&
    rivalPoints.every((point) => rivalMills.has(point));

  const onPoint = useCallback(
    (point: number) => {
      if (!interactive) return;
      if (shown.pendingCapture) {
        const move = legal.find(
          (candidate) => candidate.type === 'capture' && candidate.point === point,
        );
        if (move) playMove(move);
        return;
      }
      if (shown.phase === 'placing') {
        const move = legal.find(
          (candidate) => candidate.type === 'place' && candidate.point === point,
        );
        if (move) playMove(move);
        return;
      }
      if (board[point] === shownTurn) {
        if (selected === point) {
          setSelected(null);
        } else {
          setSelected(point);
          if (soundOn) chime('select');
        }
        return;
      }
      if (selected !== null) {
        const move = legal.find(
          (candidate) => candidate.type === 'move' && candidate.from === selected && candidate.to === point,
        );
        if (move) playMove(move);
      }
    },
    [board, interactive, legal, playMove, selected, shown.phase, shown.pendingCapture, shownTurn, soundOn],
  );

  // Ask the AI to move whenever it is its turn.
  useEffect(() => {
    if (mode !== 'ai' || screen !== 'game' || state.status !== 'playing') return;
    if (state.turn === humanSide) return;
    const snapshot = state;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseMove(snapshot, level);
      setAiThinking(false);
      if (!move) return;
      const result = apply(snapshot, move);
      if (!result.ok) return;
      commitRef.current(result.state, 'ai', snapshot);
    }, 520);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [humanSide, level, mode, screen, state]);

  // A changed board clears any transient selection or hint.
  useEffect(() => {
    setSelected(null);
    setHint(null);
  }, [state.moveCount, guestView?.moveCount]);

  const undoInfo = mode === 'lan-host' || mode === 'lan-guest'
    ? null
    : findUndo(history, mode, humanSide);
  const canUndo = Boolean(
    undoInfo && screen === 'game' && state.status === 'playing',
  );

  const undo = useCallback(() => {
    if (!undoInfo || state.status !== 'playing') return;
    const previous = undoInfo.target;
    setHistory((items) => items.slice(0, undoInfo.index));
    stateRef.current = previous;
    setState(previous);
    setSelected(null);
    setHint(null);
    setAiThinking(false);
    recordedRef.current = false;
    if (mode === 'ai' || mode === 'local') {
      const stored = saveGame({
        state: previous,
        mode: mode as SavedMode,
        level,
        human: mode === 'local' ? 'W' : humanSide,
      });
      setSaved(stored);
    }
    if (soundOn) chime('select');
  }, [humanSide, level, mode, soundOn, state.status, undoInfo]);

  const canHint =
    screen === 'game' &&
    state.status === 'playing' &&
    (mode === 'local' || (mode === 'ai' && state.turn === humanSide));

  const showHint = useCallback(() => {
    if (!canHint || hintThinking) return;
    const snapshot = stateRef.current;
    setHintThinking(true);
    window.setTimeout(() => {
      if (stateRef.current !== snapshot) {
        setHintThinking(false);
        return;
      }
      const move = chooseMove(snapshot, 'hard');
      setHintThinking(false);
      if (!move) {
        setToast(tr('hintNone'));
        return;
      }
      setHint({ move, explanation: explainMove(snapshot, move) });
      setToast(tr('hintShown'));
    }, 70);
  }, [canHint, hintThinking, tr]);

  const openRules = useCallback(
    (from: Screen) => {
      setRulesReturn(from);
      setScreen('rules');
    },
    [],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'Escape') {
        if (screen === 'rules') {
          setScreen(rulesReturn === 'rules' ? 'home' : rulesReturn);
        } else if (screen === 'game' || screen === 'lan') {
          goHome();
        } else if (screen !== 'home') {
          setScreen('home');
        }
        return;
      }
      if (screen !== 'game') return;
      const key = event.key.toLowerCase();
      if (key === 'u' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (canUndo) {
          event.preventDefault();
          undo();
        }
      }
      if (key === 'h' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (canHint) {
          event.preventDefault();
          showHint();
        }
      }
      if (key === 'r' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        openRules('game');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canHint, canUndo, goHome, openRules, rulesReturn, screen, showHint, undo]);

  const closeLan = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanInvite('');
    setLanQr('');
    setLanError('');
    guest?.close();
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
  }, [guest]);

  const openLanHost = async () => {
    closeLan();
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
        name: lang === 'zh' ? '主机' : 'Host',
        maxPlayers: 2,
      });
      hostRef.current = host;
      setLanHost(host);
      setLanCode(code);
      host.onChange((players) => {
        setLanPlayers(players);
        if (host.started && players[1]?.connected) {
          host.start();
          host.sendView(1, view(stateRef.current, 1));
        }
      });
      host.onIntent((seat, intent) => {
        const current = stateRef.current;
        const result = applySeat(current, seat, intent as Move);
        if (!result.ok) return;
        commitRef.current(result.state, 'lan-host', current);
      });
      host.onClose(() => setLanError(tr('lanClosed')));
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#26231e', light: '#fbf5e8' },
        }),
      );
    } catch (error) {
      setLanError(error instanceof Error ? error.message : String(error));
      hostRef.current?.close();
      hostRef.current = null;
      setLanHost(null);
    } finally {
      setLanBusy(false);
    }
  };

  const startLan = () => {
    if (!lanHost || !lanPlayers[1]?.connected) return;
    const next = setup('W');
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setSelected(null);
    setHint(null);
    recordedRef.current = false;
    setMode('lan-host');
    setScreen('game');
    lanHost.start();
    lanHost.sendView(1, view(next, 1));
  };

  const rematch = () => {
    if (mode === 'lan-host' && lanHost) {
      const next = setup('W');
      stateRef.current = next;
      setState(next);
      setHistory([]);
      setSelected(null);
      setHint(null);
      recordedRef.current = false;
      lanHost.start();
      lanHost.sendView(1, view(next, 1));
      return;
    }
    startGame(mode === 'ai' ? 'ai' : 'local', humanSide);
  };

  const joinGuest = useCallback(async () => {
    if (!guestRoom || !guestName.trim() || joiningRef.current) return;
    joiningRef.current = true;
    setGuestConnecting(true);
    setLanError('');
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room: guestRoom,
        code: guestCode,
        name: guestName.trim(),
      });
      setGuest(joined);
      joined.onView((payload) => setGuestView(payload as SeatView));
      joined.onStart(() => {
        setGuestStarted(true);
        setScreen('game');
      });
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? tr('lanFull') : tr('lanWrong'));
      });
      setGuestStarted(false);
    } catch (error) {
      setLanError(
        error instanceof Error && error.message.includes('rejected')
          ? tr('lanWrong')
          : tr('lanDisconnected'),
      );
    } finally {
      joiningRef.current = false;
      setGuestConnecting(false);
    }
  }, [guestCode, guestName, guestRoom, tr]);

  // A link with ?lan=… joins automatically, like a paper invitation.
  useEffect(() => {
    if (!guestRoom || guest || guestStarted) return;
    void joinGuest();
  }, [guest, guestRoom, guestStarted, joinGuest]);

  useEffect(() => {
    if (guestRoom) {
      setMode('lan-guest');
      setScreen('lan');
    }
  }, [guestRoom]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(lanInvite);
      setToast(tr('lanCopied'));
    } catch {
      setToast(lanInvite);
    }
  };

  const homeBoardLabels = {
    empty: tr('emptyPoint'),
    white: tr('whiteMan'),
    black: tr('blackMan'),
    board: tr('board'),
  };

  const playerCard = (player: Player) => {
    const active = shownTurn === player && shownStatus === 'playing';
    const onBoard = shown.onBoard[player];
    const hand = shown.hand[player];
    const millCount = millsFor(board, player).length;
    const tag =
      mode === 'ai'
        ? player === humanSide
          ? tr('you')
          : tr('ai')
        : mode === 'lan-host'
          ? player === 'W'
            ? tr('you')
            : tr('guest')
          : mode === 'lan-guest'
            ? player === 'B'
              ? tr('you')
              : tr('host')
            : player === 'W'
              ? tr('player1')
              : tr('player2');
    return (
      <div
        className={`player-card player-${player.toLowerCase()}${active ? ' active' : ''}`}
        aria-label={`${playerName(lang, player)}: ${tr('onBoard', { n: onBoard })}`}
      >
        <div className={`player-stone stone-${player.toLowerCase()}`} aria-hidden="true">
          <span className="stone-shine" />
        </div>
        <div className="player-name">
          <strong>{playerName(lang, player)}</strong>
          <span>{tag}</span>
        </div>
        <div className="player-counts">
          <span>{tr('onBoard', { n: onBoard })}</span>
          <span>{tr('inHand', { n: hand })}</span>
          <span>
            {tr('millLabel')} {millCount}
          </span>
        </div>
        <div className="men-pips" aria-hidden="true">
          {Array.from({ length: MEN_EACH }, (_, index) => (
            <span
              key={index}
              className={
                index < onBoard
                  ? 'pip on'
                  : index < onBoard + hand
                    ? 'pip in-hand'
                    : 'pip gone'
              }
            />
          ))}
        </div>
      </div>
    );
  };

  const result = shownStatus !== 'playing' ? resultText(lang, shown) : null;
  const hintReason = hint ? hintText(lang, hint.explanation) : '';

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div className="brand-block">
          <p className="eyebrow">{tr('eyebrow')}</p>
          <h1>
            {tr('title')}
            <span className="title-alt" aria-hidden="true">
              {lang === 'en' ? '九子棋' : 'Mill'}
            </span>
          </h1>
          <p className="subtitle">{tr('subtitle')}</p>
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
        <div className="hero-art">
          <div className="board-mat">
            <Board
              board={PREVIEW_BOARD}
              millLine={[0, 1, 2]}
              preview
              labels={homeBoardLabels}
            />
          </div>
          <p className="hero-caption">
            <span className="caption-rule" aria-hidden="true" />
            {tr('rulesDiagram')}
          </p>
        </div>

        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="badge-row">
            <span>{tr('nineEach')}</span>
            <span>{tr('threeLine')}</span>
            <span>{tr('twoPlayers')}</span>
            <span>{tr('tenMinutes')}</span>
          </div>

          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>{tr('saved')}</small>
              </button>
            )}
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={() => setScreen('setup')}>
              <span>{tr('playAi')}</span>
              <small>{tr('playAiNote')}</small>
            </button>
            <button className="secondary wide" onClick={() => startGame('local', 'W')}>
              <span>{tr('playLocal')}</span>
              <small>{tr('playLocalNote')}</small>
            </button>
            <button className="secondary wide" onClick={openLanHost}>
              <span>{tr('playLan')}</span>
              <small>{tr('playLanNote')}</small>
            </button>
          </div>

          <div className="home-links">
            <button className="text-button" onClick={() => setScreen('stats')}>
              {tr('stats')} →
            </button>
            <button className="text-button" onClick={() => openRules('home')}>
              {tr('rules')} →
            </button>
          </div>

          <div className="record-strip">
            <span>{tr('recordMini')}</span>
            <strong>{record.games}</strong>
            <span>{record.games === 1 ? tr('gameOne') : tr('games')}</span>
            <span className="dot">·</span>
            <span>{record.winsW} {tr('white')}</span>
            <span className="dot">·</span>
            <span>{record.winsB} {tr('black')}</span>
            <span className="dot">·</span>
            <span>{record.draws} {record.draws === 1 ? tr('drawOne') : tr('draws')}</span>
          </div>
        </div>
      </section>

      <section className="feature-row">
        <article>
          <span className="feature-number">01</span>
          <strong>{tr('feature1Title')}</strong>
          <p>{tr('feature1')}</p>
        </article>
        <article>
          <span className="feature-number">02</span>
          <strong>{tr('feature2Title')}</strong>
          <p>{tr('feature2')}</p>
        </article>
        <article>
          <span className="feature-number">03</span>
          <strong>{tr('feature3Title')}</strong>
          <p>{tr('feature3')}</p>
        </article>
      </section>

      <footer className="foot">{tr('offline')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell setup-shell">
      <header className="sub-top">
        <button className="back" onClick={() => setScreen('home')}>
          ← {tr('back')}
        </button>
        <span className="eyebrow">{tr('eyebrow')}</span>
      </header>
      <h2 className="screen-title">{tr('setupTitle')}</h2>
      <p className="lede">{tr('setupLede')}</p>

      <section className="setup-section">
        <h3>{tr('difficulty')}</h3>
        <div className="level-grid">
          {AI_LEVELS.map((item) => (
            <button
              key={item.id}
              className={`level-card ${level === item.id ? 'selected' : ''}`}
              onClick={() => setLevel(item.id)}
              aria-pressed={level === item.id}
            >
              <span className={`level-dot ${item.id}`} />
              <strong>{tr(item.label)}</strong>
              <small>{tr(item.note)}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="setup-section">
        <h3>{tr('yourSide')}</h3>
        <div className="side-grid">
          <button
            className={`side-card white-side ${setupSide === 'W' ? 'selected' : ''}`}
            onClick={() => setSetupSide('W')}
            aria-pressed={setupSide === 'W'}
          >
            <span className="big-stone stone-w" aria-hidden="true">
              <span className="stone-shine" />
            </span>
            <div>
              <strong>{tr('playWhite')}</strong>
              <small>{tr('playWhiteNote')}</small>
            </div>
          </button>
          <button
            className={`side-card black-side ${setupSide === 'B' ? 'selected' : ''}`}
            onClick={() => setSetupSide('B')}
            aria-pressed={setupSide === 'B'}
          >
            <span className="big-stone stone-b" aria-hidden="true">
              <span className="stone-shine" />
            </span>
            <div>
              <strong>{tr('playBlack')}</strong>
              <small>{tr('playBlackNote')}</small>
            </div>
          </button>
        </div>
      </section>

      <p className="setup-note">{tr('firstMove')}</p>
      <div className="row-actions">
        <button className="primary" onClick={() => startGame('ai', setupSide)}>
          {tr('begin')}
        </button>
        <button className="ghost" onClick={() => setScreen('home')}>
          {tr('back')}
        </button>
      </div>
    </main>
  );

  const gameScreen = (
    <main className="shell game-shell">
      <header className="game-top">
        <button className="back" onClick={goHome}>
          ← {tr('home')}
        </button>
        <div className="game-id">
          <span className="eyebrow">{tr('eyebrow')}</span>
          <strong>{tr('title')}</strong>
          <span className="mode-line">
            {mode === 'ai'
              ? `${tr(level)} · ${tr('ai')}`
              : mode === 'local'
                ? tr('playLocal')
                : mode === 'lan-host'
                  ? `${tr('lanShort')} · ${tr('host')}`
                  : `${tr('lanShort')} · ${tr('guest')}`}
          </span>
        </div>
        <div className="game-top-actions">
          <button className="ghost" onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
        </div>
      </header>

      <div className="game-layout">
        <section className="board-column">
          <div className="match-strip">
            {playerCard('W')}
            <span className="vs" aria-hidden="true">
              {tr('vs')}
            </span>
            {playerCard('B')}
          </div>

          <div className="board-stage">
            <Board
              board={board}
              last={shown.last}
              hint={hint?.move ?? null}
              selected={selected}
              targets={targets}
              capturable={capturable}
              millLine={shown.pendingCapture ? (shown.last?.mill ?? null) : null}
              disabled={!interactive}
              onPoint={onPoint}
              labels={homeBoardLabels}
            />
          </div>

          {result ? (
            <section className="result-card" aria-live="polite">
              <div>
                <span className="result-kicker">{tr('gameOver')}</span>
                <h2>{result.title}</h2>
                <p>{result.reason}</p>
              </div>
              <div className="result-actions">
                {isGuest ? (
                  <span className="muted">{tr('waitingOpponent')}</span>
                ) : (
                  <button className="primary" onClick={rematch}>
                    {tr('playAgain')}
                  </button>
                )}
                <button className="secondary" onClick={goHome}>
                  {tr('home')}
                </button>
              </div>
            </section>
          ) : (
            <div className="turn-bar" aria-live="polite">
              <span className={`turn-stone stone-${shownTurn === 'W' ? 'w' : 'b'}`} aria-hidden="true">
                <span className="stone-shine" />
              </span>
              <div className="turn-copy">
                <span className="turn-kicker">
                  {isGuest && !guestStarted ? tr('lanGuestTitle') : tr('turnLabel')}
                </span>
                <strong>
                  {isGuest && !guestStarted
                    ? tr('guestWaiting')
                    : mode === 'lan-host' && !hostConnected
                      ? tr('waitingOpponent')
                      : statusTitle(lang, shown)}
                </strong>
                <p>
                  {isGuest && !guestStarted
                    ? tr('lanConnected')
                    : mode === 'lan-host' && !hostConnected
                      ? tr('lanWaiting')
                      : statusSubtitle(lang, shown)}
                </p>
                {captureAll && shownStatus === 'playing' && (
                  <p className="capture-all">{tr('capturePromptAll')}</p>
                )}
              </div>
              {aiThinking && <span className="thinking">{tr('aiThinking')}</span>}
              <span className="move-count">
                {tr('orderLabel')} {shown.moveCount}
              </span>
            </div>
          )}

        </section>

        <aside className="game-side">
          <div className={`side-panel hint-panel${hint ? ' has-hint' : ''}`} aria-live="polite">
            <div className="panel-heading">
              <span className="mill-glyph" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <h3>{tr('hintTitle')}</h3>
            </div>
            {hintThinking ? (
              <p className="hint-reason">{tr('hintThinking')}</p>
            ) : hint ? (
              <>
                <p className="hint-reason">{hintReason}</p>
                <span className="hint-label">{tr('hint')}</span>
              </>
            ) : (
              <p className="hint-reason">
                {shown.pendingCapture
                  ? tr('chooseCapture')
                  : selected !== null
                    ? tr('chooseDestination')
                    : tr('rulesMill')}
              </p>
            )}
          </div>

          <div className="side-panel controls-panel">
            <div className="button-row">
              <button className="secondary" onClick={undo} disabled={!canUndo}>
                {tr('undo')}
              </button>
              <button className="secondary" onClick={showHint} disabled={!canHint || hintThinking}>
                {tr('hint')}
              </button>
            </div>
            <button className="text-button rules-link" onClick={() => openRules('game')}>
              {tr('rules')} →
            </button>
            <p className="small-note">{tr('keyboardHint')}</p>
          </div>

          {mode === 'lan-host' && (
            <div className="side-panel lan-mini">
              <span className="label">{tr('lanCode')}</span>
              <div className="room-code">{lanCode}</div>
              <p>{hostConnected ? tr('lanReady') : tr('lanWaiting')}</p>
              {lanPlayers[1] && (
                <p className="peer">
                  {lanPlayers[1].name}
                  {lanPlayers[1].connected ? ` · ${tr('online')}` : ` · ${tr('peerOffline')}`}
                </p>
              )}
            </div>
          )}
          {mode === 'lan-guest' && (
            <div className="side-panel lan-mini">
              <span className="label">{tr('lanGuestDevice')}</span>
              <p>{guestStarted ? tr('guestSeat') : tr('lanConnected')}</p>
              <p className="peer">{guestName || tr('guest')}</p>
            </div>
          )}

          <div className="side-panel record-mini">
            <span className="label">{tr('recordMini')}</span>
            <p>
              {record.games} {record.games === 1 ? tr('gameOne') : tr('games')} ·{' '}
              {record.winsW} {tr('white')} · {record.winsB} {tr('black')} ·{' '}
              {record.draws} {record.draws === 1 ? tr('drawOne') : tr('draws')}
            </p>
            <button className="text-button" onClick={() => setScreen('stats')}>
              {tr('stats')} →
            </button>
          </div>
        </aside>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell rules-shell">
      <header className="sub-top">
        <button
          className="back"
          onClick={() => setScreen(rulesReturn === 'rules' ? 'home' : rulesReturn)}
        >
          ← {tr('back')}
        </button>
        <span className="eyebrow">{tr('eyebrow')}</span>
      </header>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <p className="lede">{tr('rulesLede')}</p>
      <div className="rules-layout">
        <div className="rules-board-card">
          <Board
            board={RULES_BOARD}
            millLine={[0, 1, 2]}
            preview
            labels={homeBoardLabels}
          />
          <p>{tr('rulesDiagram')}</p>
        </div>
        <ol className="rules-list">
          <li>
            <strong>{tr('rulesPlaceTitle')}</strong>
            <p>{tr('rulesPlace')}</p>
          </li>
          <li>
            <strong>{tr('rulesMillTitle')}</strong>
            <p>{tr('rulesMill')}</p>
          </li>
          <li>
            <strong>{tr('rulesMoveTitle')}</strong>
            <p>{tr('rulesMove')}</p>
          </li>
          <li>
            <strong>{tr('rulesWinTitle')}</strong>
            <p>{tr('rulesWin')}</p>
          </li>
          <li className="care-item">
            <strong>{tr('rulesCareTitle')}</strong>
            <p>{tr('rulesCare')}</p>
          </li>
        </ol>
      </div>
      <button
        className="primary"
        onClick={() => setScreen(rulesReturn === 'rules' ? 'home' : rulesReturn)}
      >
        {tr('rulesBack')}
      </button>
    </main>
  );

  const total = Math.max(1, record.games);
  const statsScreen = (
    <main className="shell stats-shell">
      <header className="sub-top">
        <button className="back" onClick={() => setScreen('home')}>
          ← {tr('back')}
        </button>
        <span className="eyebrow">{tr('eyebrow')}</span>
      </header>
      <div className="stats-head">
        <div>
          <h2 className="screen-title">{tr('statsTitle')}</h2>
          <p className="lede">{tr('statsLede')}</p>
        </div>
        <div className="stats-total">
          <span>{tr('totalGames')}</span>
          <strong>{record.games}</strong>
        </div>
      </div>

      <div className="split-bar" aria-hidden="true">
        <span className="split-w" style={{ width: `${(record.winsW / total) * 100}%` }} />
        <span className="split-b" style={{ width: `${(record.winsB / total) * 100}%` }} />
        <span className="split-d" style={{ width: `${(record.draws / total) * 100}%` }} />
      </div>

      <div className="stats-grid">
        <article className="stat-card">
          <span className="stat-dot stone-w" aria-hidden="true" />
          <span>{tr('whiteWins')}</span>
          <strong>{record.winsW}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-dot stone-b" aria-hidden="true" />
          <span>{tr('blackWins')}</span>
          <strong>{record.winsB}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-dot draw" aria-hidden="true" />
          <span>{tr('draws')}</span>
          <strong>{record.draws}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-dot streak" aria-hidden="true" />
          <span>{tr('currentStreak')}</span>
          <strong>
            {record.streak > 0 && record.streakSide
              ? t(lang, 'streakLine', {
                  side: playerName(lang, record.streakSide),
                  n: record.streak,
                })
              : tr('streakNone')}
          </strong>
        </article>
      </div>

      <section className="stats-section">
        <h3>{tr('byMode')}</h3>
        <div className="mode-grid">
          <article>
            <span>{tr('modeSolo')}</span>
            <strong>{record.byMode.solo}</strong>
          </article>
          <article>
            <span>{tr('modeHotseat')}</span>
            <strong>{record.byMode.hotseat}</strong>
          </article>
          <article>
            <span>{tr('modeLan')}</span>
            <strong>{record.byMode.lan}</strong>
          </article>
        </div>
      </section>

      <section className="stats-section">
        <h3>{tr('recent')}</h3>
        {record.recent.length === 0 ? (
          <p className="empty-note">{tr('noGames')}</p>
        ) : (
          <ol className="recent-list">
            {record.recent.map((item, index) => (
              <li key={`${item.at}-${index}`}>
                <span className={`result-dot ${item.draw ? 'draw' : item.winner === 'W' ? 'w' : 'b'}`} />
                <strong>
                  {item.draw
                    ? tr('resultDraw')
                    : item.winner === 'W'
                      ? tr('resultWhite')
                      : tr('resultBlack')}
                </strong>
                <span>
                  {tr('resultOn', {
                    date: new Date(item.at).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
                      month: 'short',
                      day: 'numeric',
                    }),
                    mode:
                      item.mode === 'solo'
                        ? tr('modeSolo')
                        : item.mode === 'hotseat'
                          ? tr('modeHotseat')
                          : tr('modeLan'),
                  })}
                </span>
                <small>
                  {item.moves} {item.moves === 1 ? tr('moveOne') : tr('movesUnit')}
                </small>
              </li>
            ))}
          </ol>
        )}
      </section>

      <button
        className={`text-button clear-record${resetArmed ? ' armed' : ''}`}
        onClick={() => {
          if (!resetArmed) {
            setResetArmed(true);
            return;
          }
          setRecord(clearRecord());
          setResetArmed(false);
          setToast(tr('cleared'));
        }}
      >
        {resetArmed ? tr('resetConfirm') : tr('resetStats')}
      </button>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const lanGuestScreen = (
    <main className="shell narrow-shell lan-shell">
      <header className="sub-top">
        <button className="back" onClick={goHome}>
          ← {tr('back')}
        </button>
        <span className="eyebrow">{tr('eyebrow')}</span>
      </header>
      <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
      <p className="lede">
        {guestRoom ? tr('lanGuestRoom', { room: guestRoom }) : tr('lanJoinLede')}
      </p>

      {guest && !guestStarted && !lanError && (
        <div className="waiting-card">
          <span className="waiting-ring" aria-hidden="true" />
          <h3>{tr('lanConnected')}</h3>
          <p>{tr('lanGuestSeatNote')}</p>
          <p className="small-note">{tr('lanRoomWaiting')}</p>
        </div>
      )}

      {!guest && (
        <div className="lan-form">
          {guestConnecting && <p className="lede">{tr('lanConnecting')}</p>}
          <label>
            <span>{tr('lanName')}</span>
            <input
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              maxLength={18}
              autoComplete="nickname"
            />
          </label>
          <label>
            <span>{tr('lanCode')}</span>
            <input
              value={guestCode}
              onChange={(event) => setGuestCode(event.target.value)}
              inputMode="numeric"
              maxLength={4}
              autoComplete="one-time-code"
            />
          </label>
          <button
            className="primary wide"
            onClick={() => {
              void joinGuest();
            }}
            disabled={guestConnecting || !guestName.trim()}
          >
            {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
          </button>
        </div>
      )}

      {lanError && <p className="error">{lanError}</p>}
      {guestStarted && (
        <button className="primary" onClick={() => setScreen('game')}>
          {tr('lanStart')}
        </button>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const lanHostScreen = (
    <main className="shell narrow-shell lan-shell">
      <header className="sub-top">
        <button className="back" onClick={goHome}>
          ← {tr('back')}
        </button>
        <span className="eyebrow">{tr('eyebrow')}</span>
      </header>
      <h2 className="screen-title">{tr('lanTitle')}</h2>
      <p className="lede">{tr('lanLede')}</p>

      {lanBusy && (
        <div className="waiting-card">
          <span className="waiting-ring" aria-hidden="true" />
          <h3>{tr('lanStarting')}</h3>
          <p>{tr('lanNoGuest')}</p>
        </div>
      )}

      {lanError && <p className="error">{lanError}</p>}

      {lanInfo && lanInvite && (
        <div className="lan-layout">
          <div className="lan-card">
            <span className="label">{tr('lanHostDevice')}</span>
            <div className="room-code big">{lanCode}</div>
            <p>{lanPlayers[1]?.connected ? tr('lanReady') : tr('lanWaiting')}</p>
            <div className="peer-list">
              {lanPlayers.slice(0, 2).map((player) => (
                <span key={player.seat} className={player.connected ? 'online' : ''}>
                  {player.name} {player.connected ? '●' : '○'}
                </span>
              ))}
            </div>
            <button
              className="primary wide"
              onClick={startLan}
              disabled={!lanPlayers[1]?.connected}
            >
              {tr('lanStart')}
            </button>
            <button className="secondary wide" onClick={() => void copyInvite()}>
              {tr('lanCopy')}
            </button>
            <p className="small-note">{tr('lanHostSeatNote')}</p>
          </div>
          <div className="qr-card">
            {lanQr ? <img src={lanQr} alt={tr('lanScan')} /> : null}
            <p>{tr('lanScan')}</p>
            <code>{lanInvite.replace(/^https?:\/\//, '')}</code>
            <p className="small-note">{tr('lanInviteHint')}</p>
          </div>
        </div>
      )}

      {!lanBusy && lanInfo && !lanInvite && <p className="lede">{tr('lanStarting')}</p>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'lan') return mode === 'lan-guest' ? lanGuestScreen : lanHostScreen;
  return home;
}
