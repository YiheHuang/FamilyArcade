import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseMove, type AiLevel } from './ai/ai';
import { hintFor, type HintKind } from './ai/hint';
import { Board, PieceDisc } from './components/Board';
import {
  apply,
  applySeat,
  countKings,
  countPieces,
  indexOf,
  legalMoves,
  otherSide,
  setup,
  sideOf,
  view,
  type DrawReason,
  type GameState,
  type Move,
  type Piece,
  type SeatView,
  type Side,
  type WinReason,
} from './game/intl-draughts';
import { detectLang, t, type Lang, type MessageKey } from './i18n';
import {
  guestWsUrl,
  hostWsUrl,
  inviteUrl,
  startLanServer,
  type LanServerInfo,
} from './net';
import {
  clearRecord as clearStoredRecord,
  clearSave,
  loadRecord,
  loadSave,
  recordResult,
  saveGame,
  type FamilyRecord,
  type RecordMode,
  type ResultWinner,
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'stats' | 'rules' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type LanRole = 'hub' | 'host' | 'guest';

const AI_LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const LEVEL_HINT: Record<AiLevel, MessageKey> = {
  companion: 'companionHint',
  easy: 'easyHint',
  normal: 'normalHint',
  hard: 'hardHint',
};

const HINT_KEYS: Record<HintKind, MessageKey> = {
  win: 'hintWin',
  capture: 'hintCapture',
  promotion: 'hintPromotion',
  safe: 'hintSafe',
  position: 'hintPosition',
};

const HERO_BOARD: (Piece | null)[] = (() => {
  const board = setup('W').board;
  board[indexOf(9, 2)] = 'W';
  board[indexOf(0, 9)] = 'B';
  for (const square of [
    indexOf(6, 1),
    indexOf(7, 2),
    indexOf(8, 5),
    indexOf(9, 8),
    indexOf(0, 3),
    indexOf(1, 4),
    indexOf(2, 5),
    indexOf(3, 6),
  ]) {
    board[square] = null;
  }
  return board;
})();

function recordModeFor(mode: Mode): RecordMode {
  if (mode === 'ai') return 'ai';
  if (mode === 'lan-host') return 'lan';
  return 'local';
}

function readableInvite(url: string): string {
  try {
    return decodeURIComponent(url).replace(/^https?:\/\//, '');
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
}

function formatDate(at: number, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(at));
  } catch {
    return '';
  }
}

function sideName(lang: Lang, side: Side): string {
  return t(lang, side === 'W' ? 'whitePlayer' : 'blackPlayer');
}

function reasonText(
  lang: Lang,
  winner: Side | null,
  winReason: WinReason | null,
  drawReason: DrawReason | null,
): string {
  if (winner) {
    const loser = sideName(lang, otherSide(winner));
    if (winReason === 'all-captured') return t(lang, 'reasonCaptured', { loser });
    if (winReason === 'blocked') return t(lang, 'reasonBlocked', { loser });
    return '';
  }
  if (drawReason === 'quiet') return t(lang, 'reasonQuiet');
  if (drawReason === 'repetition') return t(lang, 'reasonRepetition');
  if (drawReason === 'limit') return t(lang, 'reasonLimit');
  return '';
}

function lanErrorMessage(lang: Lang, message: string): string {
  const value = message.toLowerCase();
  if (value.includes('wrong-code')) return t(lang, 'lanWrong');
  if (value.includes('room-full')) return t(lang, 'lanFull');
  if (value.includes('host connection closed') || value.includes('host lost')) {
    return t(lang, 'lanHostLost');
  }
  if (
    value.includes('timed out') ||
    value.includes('connection failed') ||
    value.includes('did not answer') ||
    value.includes('handshake')
  ) {
    return t(lang, 'lanServerMissing');
  }
  if (value.includes('closed')) return t(lang, 'lanClosed');
  return t(lang, 'lanDisconnected');
}

function pathStartsWith(path: readonly number[], prefix: readonly number[]): boolean {
  if (prefix.length > path.length) return false;
  return prefix.every((square, index) => path[index] === square);
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (invite ? 'lan-guest' : 'ai'));
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup('W'));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [partial, setPartial] = useState<number[]>([]);
  const [hintMove, setHintMove] = useState<Move | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.intl-draughts.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);

  const [lanRole, setLanRole] = useState<LanRole>(() => (invite ? 'guest' : 'hub'));
  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [hostName, setHostName] = useState(() => {
    try {
      return localStorage.getItem('familyarcade.intl-draughts.hostName') ?? '';
    } catch {
      return '';
    }
  });
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => invite?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => invite?.code || invite?.room || '');
  const [guestRoom, setGuestRoom] = useState(() => invite?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [guestPlayers, setGuestPlayers] = useState<LanPublicPeer[]>([]);
  const [autoJoin] = useState(() => Boolean(invite && invite.code && invite.name));

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const hostStartedRef = useRef(false);
  const autoJoinRef = useRef(false);
  const lanActiveRef = useRef(false);
  const lastGuestPlyRef = useRef(-1);
  const guestJoinSeqRef = useRef(0);
  const hostCreateSeqRef = useRef(0);
  const commitRef = useRef<(next: GameState, currentMode: Mode, previous: GameState, move: Move) => void>(() => undefined);

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title =
      lang === 'zh' ? '国际跳棋 · 家庭街机' : 'International Draughts · Family Arcade';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.intl-draughts.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.intl-draughts.hostName', hostName);
    } catch {
      /* ignore */
    }
  }, [hostName]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setToast('');
  }, [screen]);

  useEffect(() => {
    if (screen !== 'stats') setClearArmed(false);
  }, [screen]);

  useEffect(() => {
    setSelected(null);
    setPartial([]);
    setHintMove(null);
  }, [state.plies, guestView?.plies]);

  const finish = useCallback(
    (next: GameState, currentMode: Mode) => {
      if (next.status === 'playing' || recorded) return;
      setRecorded(true);
      if (currentMode !== 'lan-guest') {
        setRecord(
          recordResult(next, {
            mode: recordModeFor(currentMode),
            level: currentMode === 'ai' ? level : undefined,
          }),
        );
      }
      if (soundOn) chime(next.status === 'draw' ? 'draw' : 'win');
    },
    [level, recorded, soundOn],
  );

  const commit = useCallback(
    (next: GameState, currentMode: Mode, previous: GameState, move: Move) => {
      stateRef.current = next;
      setHistory((items) => [...items, previous]);
      setState(next);
      setSelected(null);
      setPartial([]);
      setHintMove(null);
      if (soundOn && next.status === 'playing') {
        chime(move.captures.length > 0 ? 'capture' : 'place');
      }
      finish(next, currentMode);
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.status === 'playing') {
          setSaved(saveGame({ state: next, mode: currentMode, level }));
        } else {
          clearSave();
          setSaved(null);
        }
      }
      if (currentMode === 'lan-host' && hostRef.current) {
        const guestSeatView = view(next, 1);
        hostRef.current.sendView(1, guestSeatView);
        if (next.status !== 'playing') hostRef.current.sendResult(guestSeatView);
      }
    },
    [finish, level, soundOn],
  );

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  const startLocal = useCallback((nextMode: 'ai' | 'local') => {
    const next = setup('W');
    stateRef.current = next;
    setMode(nextMode);
    setState(next);
    setHistory([]);
    setSelected(null);
    setPartial([]);
    setHintMove(null);
    setRecorded(false);
    setAiThinking(false);
    setScreen('game');
    clearSave();
    setSaved(null);
  }, []);

  const startAi = useCallback(() => {
    setMode('ai');
    setScreen('setup');
  }, []);

  const resume = useCallback(() => {
    if (!saved) return;
    stateRef.current = saved.state;
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    setHistory([]);
    setSelected(null);
    setPartial([]);
    setHintMove(null);
    setAiThinking(false);
    setRecorded(saved.state.status !== 'playing');
    setScreen('game');
  }, [saved]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    if (mode === 'lan-host' || mode === 'lan-guest') return;
    if (state.status !== 'playing') return;

    let previous: GameState;
    let nextHistory: GameState[];

    if (mode === 'ai') {
      let index = history.length - 1;
      while (
        index >= 0 &&
        !(history[index].status === 'playing' && history[index].turn === 'W')
      ) {
        index -= 1;
      }
      if (index < 0) return;
      previous = history[index];
      nextHistory = history.slice(0, index);
    } else {
      previous = history[history.length - 1];
      nextHistory = history.slice(0, -1);
    }

    stateRef.current = previous;
    setHistory(nextHistory);
    setState(previous);
    setSelected(null);
    setPartial([]);
    setHintMove(null);
    setSaved(saveGame({ state: previous, mode, level }));
    setRecorded(false);
  }, [history, level, mode, state.status]);

  const showHint = useCallback(() => {
    if (state.status !== 'playing') return;
    if (mode === 'lan-host' || mode === 'lan-guest') return;
    const hint = hintFor(state);
    if (!hint) return;
    setHintMove(hint.move);
    setToast(
      t(
        lang,
        hint.kind === 'capture' && hint.count === 1 ? 'hintCaptureOne' : HINT_KEYS[hint.kind],
        hint.count > 0 ? { n: hint.count } : undefined,
      ),
    );
  }, [lang, mode, state]);

  const closeLan = useCallback(() => {
    lanActiveRef.current = false;
    autoJoinRef.current = true;
    hostStartedRef.current = false;
    guestJoinSeqRef.current += 1;
    hostCreateSeqRef.current += 1;
    const host = hostRef.current;
    hostRef.current = null;
    if (host) {
      try {
        host.sendResult({ kind: 'closed' });
      } catch {
        /* the socket may already be closed */
      }
      host.close();
    }
    setLanHost(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanError('');
    const activeGuest = guest;
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    setGuestConnecting(false);
    setGuestPlayers([]);
    activeGuest?.close();
  }, [guest]);

  const goHome = useCallback(() => {
    closeLan();
    setLanRole('hub');
    setMode('ai');
    setScreen('home');
  }, [closeLan]);

  const openLanHub = useCallback(() => {
    closeLan();
    setLanRole('hub');
    setMode('ai');
    setScreen('lan');
  }, [closeLan]);

  const openLanHost = useCallback(async () => {
    if (lanBusy) return;
    closeLan();
    const seq = ++hostCreateSeqRef.current;
    setLanRole('host');
    setMode('lan-host');
    setScreen('lan');
    setLanBusy(true);
    setLanError('');
    try {
      const info = await startLanServer();
      if (seq !== hostCreateSeqRef.current) return;
      setLanInfo(info);
      const code = newRoomCode();
      const name = hostName.trim() || t(lang, 'lanHostNamePlaceholder');
      const created = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room: code,
        code,
        name,
        maxPlayers: 2,
      });
      if (seq !== hostCreateSeqRef.current) {
        created.close();
        return;
      }
      hostRef.current = created;
      setLanHost(created);
      setLanCode(code);
      created.onChange((players) => {
        if (hostRef.current !== created) return;
        setLanPlayers(players);
        created.sendLobby();
        if (hostStartedRef.current && players[1]?.connected) {
          created.start();
          created.sendView(1, view(stateRef.current, 1));
        }
      });
      created.onIntent((seat, intent) => {
        if (hostRef.current !== created) return;
        const value = intent as {
          type?: string;
          from?: number;
          path?: number[];
          moveCount?: number;
        } | null;
        if (!value || value.type !== 'move') return;
        const from = Number(value.from);
        if (!Number.isInteger(from)) return;
        const path = Array.isArray(value.path) ? value.path.map(Number) : [];
        if (!path.every((square) => Number.isInteger(square))) return;
        const current = stateRef.current;
        if (typeof value.moveCount === 'number' && value.moveCount !== current.plies) return;
        const result = applySeat(current, seat, from, path);
        if (!result.ok || !result.state.lastMove) return;
        commitRef.current(result.state, 'lan-host', current, result.state.lastMove);
      });
      created.onClose(() => {
        if (hostRef.current !== created) return;
        hostRef.current = null;
        hostStartedRef.current = false;
        setLanHost(null);
        setLanPlayers([]);
        setLanError(t(lang, 'lanHostLost'));
      });
      const url = inviteUrl(info, code, code, lang === 'zh' ? '家人' : 'Guest');
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        color: { dark: '#26221c', light: '#fffaf0' },
      });
      if (seq !== hostCreateSeqRef.current) {
        created.close();
        return;
      }
      setLanInvite(url);
      setLanQr(qr);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLanError(lanErrorMessage(lang, message));
      hostRef.current?.close();
      hostRef.current = null;
      setLanHost(null);
      setLanPlayers([]);
    } finally {
      setLanBusy(false);
    }
  }, [closeLan, hostName, lang, lanBusy]);

  const startLan = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open' || !lanPlayers[1]?.connected) return;
    const next = setup('W');
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setSelected(null);
    setPartial([]);
    setHintMove(null);
    setRecorded(false);
    setLanError('');
    setMode('lan-host');
    setScreen('game');
    hostStartedRef.current = true;
    host.start();
    host.sendLobby();
    host.sendView(1, view(next, 1));
  }, [lanPlayers]);

  const restartGame = useCallback(() => {
    if (mode === 'lan-guest') return;
    if (mode === 'lan-host') {
      const host = hostRef.current;
      if (!host) return;
      const next = setup('W');
      stateRef.current = next;
      setState(next);
      setHistory([]);
      setSelected(null);
      setPartial([]);
      setHintMove(null);
      setRecorded(false);
      setLanError('');
      hostStartedRef.current = true;
      host.start();
      host.sendLobby();
      host.sendView(1, view(next, 1));
      return;
    }
    startLocal(mode === 'ai' ? 'ai' : 'local');
  }, [mode, startLocal]);

  const resetSelection = useCallback(() => {
    setSelected(null);
    setPartial([]);
    setHintMove(null);
  }, []);

  const submitMove = useCallback(
    (move: Move) => {
      if (mode === 'lan-guest') {
        if (!guest || !guestView?.canMove) return;
        guest.sendIntent({
          type: 'move',
          from: move.from,
          path: move.path.slice(1),
          moveCount: guestView.plies,
        });
        resetSelection();
        return;
      }
      const result =
        mode === 'lan-host'
          ? applySeat(state, 0, move.from, move.path.slice(1))
          : apply(state, move);
      if (!result.ok) {
        resetSelection();
        return;
      }
      commit(result.state, mode, state, move);
    },
    [commit, guest, guestView, mode, resetSelection, state],
  );

  const localLegal = useMemo(() => legalMoves(state), [state]);
  const isGuest = mode === 'lan-guest';
  const isLan = mode === 'lan-host' || mode === 'lan-guest';
  const shownLegal = isGuest ? guestView?.legalMoves ?? [] : localLegal;
  const shownBoard = guestView?.board ?? state.board;
  const shownTurn = guestView?.turn ?? state.turn;
  const shownStatus = guestView?.status ?? state.status;
  const shownWinner = guestView?.winner ?? state.winner;
  const shownWinReason = guestView?.winReason ?? state.winReason;
  const shownDrawReason = guestView?.drawReason ?? state.drawReason;
  const shownLast = guestView ? guestView.lastMove : state.lastMove;

  const guestOnline = Boolean(lanPlayers[1]?.connected);
  const hostOnline = mode !== 'lan-host' || lanHost?.status === 'open';
  const hostCanPlay = mode === 'lan-host' ? guestOnline && hostOnline : true;
  const guestCanPlay = Boolean(guestView?.canMove) && guestStarted;
  const canInteract =
    screen === 'game' &&
    shownStatus === 'playing' &&
    (isGuest
      ? guestStarted && Boolean(guestView?.canMove)
      : mode === 'ai'
        ? state.turn === 'W' && !aiThinking
        : mode === 'lan-host'
          ? state.turn === 'W' && hostCanPlay
          : true);

  const playSquare = useCallback(
    (index: number) => {
      if (!canInteract) return;
      const legal = shownLegal;
      if (selected === null) {
        if (legal.some((move) => move.from === index)) {
          setSelected(index);
          setPartial([]);
          setHintMove(null);
          return;
        }
        const clicked = shownBoard[index];
        if (clicked && sideOf(clicked) === shownTurn && legal.length > 0 && legal[0].captures.length > 0) {
          setToast(tr('mustCapture'));
        }
        return;
      }
      if (index === selected) {
        resetSelection();
        return;
      }
      const prefix = [selected, ...partial, index];
      const candidates = legal.filter(
        (move) => move.from === selected && pathStartsWith(move.path, prefix),
      );
      if (candidates.length === 0) {
        if (legal.some((move) => move.from === index)) {
          setSelected(index);
          setPartial([]);
          setHintMove(null);
        }
        return;
      }
      const complete = candidates.find((move) => move.path.length === prefix.length);
      if (complete) {
        submitMove(complete);
        return;
      }
      setPartial([...partial, index]);
    },
    [
      canInteract,
      resetSelection,
      selected,
      partial,
      shownBoard,
      shownLegal,
      shownTurn,
      submitMove,
      tr,
    ],
  );

  const joinGuest = useCallback(async () => {
    if (guestConnecting || guest) return;
    const name = guestName.trim();
    const code = guestCode.trim();
    const room = code;
    if (!name) {
      setLanError(t(lang, 'lanNameNeeded'));
      return;
    }
    if (!/^\d{4}$/.test(code)) {
      setLanError(t(lang, 'lanCodeNeeded'));
      return;
    }
    const seq = ++guestJoinSeqRef.current;
    setGuestConnecting(true);
    setLanError('');
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room,
        code,
        name,
      });
      if (seq !== guestJoinSeqRef.current) {
        joined.close();
        return;
      }
      autoJoinRef.current = true;
      lanActiveRef.current = true;
      setGuest(joined);
      setGuestRoom(room);
      setGuestView(null);
      setGuestStarted(false);
      setGuestPlayers([]);
      lastGuestPlyRef.current = -1;
      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        const next = payload as SeatView;
        if (!next || !Array.isArray(next.board) || next.board.length !== 100) return;
        setGuestView(next);
        setGuestStarted(true);
        setMode('lan-guest');
        setScreen('game');
      });
      joined.onStart((players) => {
        if (!lanActiveRef.current) return;
        if (Array.isArray(players)) setGuestPlayers(players);
        setGuestStarted(true);
        setMode('lan-guest');
        setScreen('game');
      });
      joined.onPlayers((players) => {
        if (!lanActiveRef.current) return;
        setGuestPlayers(players);
      });
      joined.onResult((payload) => {
        if (!lanActiveRef.current) return;
        const value = payload as { kind?: string } | null;
        if (!value || value.kind !== 'closed') return;
        lanActiveRef.current = false;
        autoJoinRef.current = true;
        setGuest(null);
        setGuestView(null);
        setGuestStarted(false);
        setGuestPlayers([]);
        setLanError(t(lang, 'lanClosed'));
        setLanRole('guest');
        setScreen('lan');
        joined.close();
      });
      joined.onError((reason) => {
        if (!lanActiveRef.current) return;
        setLanError(lanErrorMessage(lang, reason));
      });
      setLanRole('guest');
      setScreen('lan');
    } catch (error) {
      if (seq !== guestJoinSeqRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setLanError(lanErrorMessage(lang, message));
      lanActiveRef.current = false;
    } finally {
      if (seq === guestJoinSeqRef.current) setGuestConnecting(false);
    }
  }, [guest, guestCode, guestConnecting, guestName, guestRoom, lang]);

  const copyInvite = useCallback(async () => {
    if (!lanInvite) return;
    try {
      await navigator.clipboard.writeText(lanInvite);
      setToast(tr('lanCopied'));
    } catch {
      setToast(lanInvite);
    }
  }, [lanInvite, tr]);

  const resetRecord = useCallback(() => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setRecord(clearStoredRecord());
    setClearArmed(false);
    setToast(tr('recordCleared'));
  }, [clearArmed, tr]);

  // AI reply. Paused whenever the game screen is not showing.
  useEffect(() => {
    if (screen !== 'game' || mode !== 'ai' || state.status !== 'playing' || state.turn !== 'B') {
      return;
    }
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseMove(state, level, Math.random);
      setAiThinking(false);
      if (!move) return;
      const result = apply(state, move);
      if (!result.ok) return;
      commit(result.state, 'ai', state, move);
    }, 420);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, level, mode, screen, state]);

  // Keyboard path: Esc clears a selection, or returns home when nothing is selected.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        Boolean(target?.isContentEditable);
      if (event.key !== 'Escape' || typing) return;
      event.preventDefault();
      if (selected !== null) {
        resetSelection();
        return;
      }
      goHome();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goHome, resetSelection, selected]);

  // A scanned invite joins immediately; the guest can still retry after an error.
  useEffect(() => {
    if (!autoJoin || autoJoinRef.current) return;
    autoJoinRef.current = true;
    void joinGuest();
  }, [autoJoin, joinGuest]);

  // Notice a host closing the room even though LanGuest has no close callback.
  useEffect(() => {
    if (!guest) return;
    const timer = window.setInterval(() => {
      if (!lanActiveRef.current) return;
      if (guest.status === 'closed') {
        lanActiveRef.current = false;
        autoJoinRef.current = true;
        setGuest(null);
        setGuestView(null);
        setGuestStarted(false);
        setGuestPlayers([]);
        setLanError(tr('lanClosed'));
        setLanRole('guest');
        setScreen('lan');
      }
    }, 900);
    return () => window.clearInterval(timer);
  }, [guest, tr]);

  // Best-effort room-closed notice for a tab close or reload.
  useEffect(() => {
    const onUnload = () => {
      try {
        hostRef.current?.sendResult({ kind: 'closed' });
      } catch {
        /* the tab is going away */
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  // The guest hears the host's board update. Skip the first view on join.
  useEffect(() => {
    if (!guestView) {
      lastGuestPlyRef.current = -1;
      return;
    }
    const previous = lastGuestPlyRef.current;
    lastGuestPlyRef.current = guestView.plies;
    if (previous < 0 || guestView.plies <= previous || !soundOn) return;
    chime(
      guestView.status === 'draw'
        ? 'draw'
        : guestView.status === 'won'
          ? 'win'
          : (guestView.lastMove?.captures.length ?? 0) > 0
            ? 'capture'
            : 'place',
    );
  }, [guestView, soundOn]);

  const whitePieces = countPieces(shownBoard, 'W');
  const blackPieces = countPieces(shownBoard, 'B');
  const whiteKings = countKings(shownBoard, 'W');
  const blackKings = countKings(shownBoard, 'B');

  const winnerText =
    shownStatus === 'won' && shownWinner
      ? t(lang, shownWinner === 'W' ? 'whiteWins' : 'blackWins')
      : shownStatus === 'draw'
        ? tr('draw')
        : '';
  const resultReason =
    shownStatus === 'playing'
      ? ''
      : reasonText(lang, shownWinner, shownWinReason, shownDrawReason);

  let statusHeadline = t(lang, shownTurn === 'W' ? 'turnWhite' : 'turnBlack');
  let statusDetail = '';
  if (shownStatus === 'won') {
    statusHeadline = winnerText;
    statusDetail = resultReason;
  } else if (shownStatus === 'draw') {
    statusHeadline = tr('draw');
    statusDetail = resultReason;
  } else if (isGuest) {
    statusHeadline = guestStarted
      ? guestCanPlay
        ? tr('yourTurn')
        : tr('lanWaitingForHost')
      : tr('lanWaitingHost');
    statusDetail = guestStarted ? tr('lanGuestSeat') : tr('lanGuestTitle');
  } else if (mode === 'ai') {
    statusHeadline =
      state.turn === 'W'
        ? tr('yourTurn')
        : aiThinking
          ? tr('aiThinking')
          : tr('aiTurn');
    statusDetail = selected !== null ? tr('chooseLanding') : t(lang, LEVEL_HINT[level]);
  } else if (mode === 'local') {
    statusHeadline = t(lang, state.turn === 'W' ? 'turnWhite' : 'turnBlack');
    statusDetail =
      selected !== null
        ? tr('chooseLanding')
        : state.plies === 0
          ? tr('selectMove')
          : tr('localTurnHint');
  } else if (mode === 'lan-host') {
    const guestNameLabel = lanPlayers[1]?.name || tr('lanGuestTag');
    if (!guestOnline) {
      statusHeadline = t(lang, 'lanWaitingForGuest', { name: guestNameLabel });
      statusDetail = tr('lanGuestLeft');
    } else if (state.turn === 'W') {
      statusHeadline = tr('yourTurn');
      statusDetail = tr('lanHostSeat');
    } else {
      statusHeadline = t(lang, 'lanWaitingForGuest', { name: guestNameLabel });
      statusDetail = tr('lanHostSeat');
    }
  }

  const modeLabel =
    mode === 'ai'
      ? t(lang, level)
      : mode === 'local'
        ? tr('playLocal')
        : mode === 'lan-host'
          ? tr('lanHostMode')
          : tr('lanGuestMode');

  const sideTitle =
    mode === 'ai'
      ? t(lang, level)
      : mode === 'local'
        ? tr('playLocal')
        : mode === 'lan-host'
          ? tr('lanHostMode')
          : tr('lanGuestMode');
  const sideDetail =
    mode === 'ai'
      ? selected !== null
        ? tr('chooseLanding')
        : tr(LEVEL_HINT[level])
      : mode === 'local'
        ? selected !== null
          ? tr('chooseLanding')
          : tr('localTurnHint')
        : mode === 'lan-host'
          ? guestOnline
            ? tr('lanReady')
            : tr('lanHostWaitingGuest')
          : guestCanPlay
            ? tr('yourTurn')
            : guestStarted
              ? tr('lanWaitingForHost')
              : tr('lanWaitingHost');

  const lastMoveText = shownLast
    ? shownLast.captures.length > 0
      ? t(lang, 'lastMoveCapture', { n: shownLast.captures.length })
      : shownLast.promote
        ? tr('lastMovePromotion')
        : tr('lastMoveQuiet')
    : tr('none');

  const chipPiece: Piece | null =
    shownStatus === 'won' && shownWinner
      ? shownWinner === 'W'
        ? 'w'
        : 'b'
      : shownStatus === 'draw'
        ? null
        : shownTurn === 'W'
          ? 'w'
          : 'b';

  const resultLabel = (winner: ResultWinner) =>
    winner === 'W' ? tr('winsWhite') : winner === 'B' ? tr('winsBlack') : tr('draw');
  const share = (count: number) =>
    record.games > 0 ? `${Math.round((count / record.games) * 100)}%` : '0%';
  const shareWhite = share(record.winsWhite);
  const shareBlack = share(record.winsBlack);
  const shareDraw = share(record.draws);
  const lastResultLabel = record.lastWinner ? resultLabel(record.lastWinner) : tr('none');
  const gamesWord = record.games === 1 ? tr('gameOne') : tr('games');
  const modeLabelFor = (value: RecordMode) =>
    value === 'ai' ? tr('modeAi') : value === 'local' ? tr('modeLocal') : tr('modeLan');
  const guestHostName = guestPlayers.find((player) => player.host)?.name;

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('eyebrow')}</p>
          <h1>{tr('title')}</h1>
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
        <div className="hero-board" aria-hidden="true">
          <Board
            board={HERO_BOARD}
            legal={[]}
            selected={null}
            partial={[]}
            last={null}
            hint={null}
            disabled
            onCell={() => undefined}
            lang={lang}
          />
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>
                  {saved.mode === 'ai' ? t(lang, saved.level) : tr('playLocal')} · {tr('saved')}
                </small>
              </button>
            )}
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={startAi}>
              {tr('playAi')}
            </button>
            <button className="secondary wide" onClick={() => startLocal('local')}>
              {tr('playLocal')}
            </button>
            <button className="secondary wide lan-menu-button" onClick={openLanHub}>
              <span>{tr('playLan')}</span>
              <small>{tr('lanMenuHint')}</small>
            </button>
            <div className="menu-links">
              <button className="text-button" onClick={() => setScreen('rules')}>
                {tr('rules')} →
              </button>
              <button className="text-button" onClick={() => setScreen('stats')}>
                {tr('viewRecord')} →
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('stats')}</span>
            <strong>{record.games}</strong>
            <span>{gamesWord}</span>
            <span className="dot">·</span>
            <span>{record.winsWhite} {tr('whiteShort')}</span>
            <span className="dot">·</span>
            <span>{record.winsBlack} {tr('blackShort')}</span>
            <span className="dot">·</span>
            <span>{record.draws} {tr('draws')}</span>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('footNote')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('difficulty')}</h2>
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
      <div className="row-actions">
        <button className="primary" onClick={() => startLocal('ai')}>{tr('begin')}</button>
        <button className="ghost" onClick={goHome}>{tr('back')}</button>
      </div>
    </main>
  );

  const gameScreen = (
    <main className="shell game-shell">
      <header className="game-top">
        <button className="back" onClick={goHome}>← {tr('home')}</button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>{modeLabel}</span>
        </div>
        <div className="game-actions">
          <button
            className="icon-button"
            onClick={() => setSoundOn((value) => !value)}
            aria-pressed={soundOn}
            aria-label={soundOn ? tr('soundOn') : tr('soundOff')}
            title={soundOn ? tr('soundOn') : tr('soundOff')}
          >
            <span className="sound-glyph" data-on={soundOn}>♪</span>
          </button>
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
        </div>
      </header>

      <div className="game-layout">
        <section className="board-wrap">
          <div className={`turn-bar ${shownStatus !== 'playing' ? 'is-over' : ''}`} aria-live="polite">
            <span className={`turn-chip ${chipPiece ? '' : 'draw'}`}>
              {chipPiece ? <PieceDisc piece={chipPiece} small /> : <span className="draw-glyph">=</span>}
            </span>
            <div className="turn-copy">
              <strong>{statusHeadline}</strong>
              <p>{statusDetail}</p>
            </div>
            {aiThinking && <span className="thinking" aria-hidden="true">…</span>}
          </div>

          {isGuest && lanError && (
            <p className="error game-error" role="alert">{lanError}</p>
          )}

          <div className="board-frame">
            <Board
              board={shownBoard}
              legal={shownLegal}
              selected={selected}
              partial={partial}
              last={shownLast}
              hint={hintMove}
              disabled={!canInteract}
              onCell={playSquare}
              lang={lang}
            />
          </div>

          {shownStatus !== 'playing' && (
            <div className="result-banner" role="status">
              <div className="result-copy">
                <span className="result-kicker">{tr('gameOver')}</span>
                <strong>{winnerText}</strong>
                <small>{resultReason}</small>
              </div>
              {isGuest ? (
                <span className="wait-pill">
                  <span className="wait-dot" aria-hidden="true" />
                  {tr('lanWaitRestart')}
                </span>
              ) : (
                <div className="result-actions">
                  <button
                    className="primary"
                    onClick={restartGame}
                    disabled={mode === 'lan-host' && !lanHost}
                  >
                    {tr('restart')}
                  </button>
                  {mode === 'ai' && (
                    <button className="secondary" onClick={() => setScreen('setup')}>
                      {tr('changeLevel')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{sideTitle}</h3>
            <p>{sideDetail}</p>
            <div className="side-actions">
              <button
                className="secondary"
                onClick={undo}
                disabled={history.length === 0 || isLan || state.status !== 'playing'}
              >
                {tr('undo')}
              </button>
              <button
                className="secondary"
                onClick={showHint}
                disabled={state.status !== 'playing' || isLan}
              >
                {tr('hint')}
              </button>
            </div>
            <p className="side-note">{isLan ? tr('localOnly') : tr('keyboardHint')}</p>
          </div>

          <div className="side-card position-card">
            <h3>{tr('pieces')}</h3>
            <div className="count-row">
              <PieceDisc piece="w" small />
              <span>{tr('whitePlayer')}</span>
              <strong>{whitePieces}</strong>
              <small>{t(lang, 'kingsCount', { n: whiteKings })}</small>
            </div>
            <div className="count-row">
              <PieceDisc piece="b" small />
              <span>{tr('blackPlayer')}</span>
              <strong>{blackPieces}</strong>
              <small>{t(lang, 'kingsCount', { n: blackKings })}</small>
            </div>
            <p className="last-move-line">
              <span>{tr('lastMove')}</span>
              <strong>{lastMoveText}</strong>
            </p>
          </div>

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanCode')}</h3>
                <span className={`status-dot ${guestOnline ? 'online' : ''}`} />
              </div>
              <div className="room-code">{lanCode || '—'}</div>
              <p>{guestOnline ? tr('lanReady') : tr('lanGuestLeft')}</p>
              {lanPlayers[1] && (
                <p className="peer">
                  {lanPlayers[1].name} · {lanPlayers[1].connected ? tr('lanOnline') : tr('lanOffline')}
                </p>
              )}
            </div>
          )}

          {isGuest && (
            <div className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanGuestMode')}</h3>
                <span className={`status-dot ${guestStarted ? 'online' : ''}`} />
              </div>
              <p>
                {guestCanPlay
                  ? tr('yourTurn')
                  : guestStarted
                    ? tr('lanWaitingForHost')
                    : tr('lanWaitingHost')}
              </p>
              <p className="peer">{t(lang, 'lanRoom', { code: guestRoom || guestCode })}</p>
              {guestHostName && <p className="peer">{tr('lanHostTag')} · {guestHostName}</p>}
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('stats')}</h3>
            <p>{record.games} {gamesWord} · {record.winsWhite}/{record.winsBlack}/{record.draws}</p>
            <p className="record-mini-note">{tr('recordMiniNote')}</p>
            {!isLan && (
              <button className="text-button" onClick={() => setScreen('stats')}>
                {tr('viewRecord')} →
              </button>
            )}
          </div>
        </aside>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const lanScreen = (
    <main className={`shell ${lanRole === 'host' ? 'narrow-shell' : 'lan-shell'}`}>
      <button className="back" onClick={goHome}>← {tr('back')}</button>

      {lanRole === 'hub' && (
        <>
          <header className="lan-hero">
            <p className="eyebrow">{tr('lanEyebrow')}</p>
            <h2 className="screen-title">{tr('lanTitle')}</h2>
          </header>
          <div className="lan-choice">
            <section className="lan-choice-card host-card">
              <div className="choice-head">
                <span className="tag">{tr('lanHostTag')}</span>
                <span className="choice-icon" aria-hidden="true">⌂</span>
              </div>
              <h3>{tr('lanHost')}</h3>
              <label className="field">
                <span>{tr('lanHostName')}</span>
                <input
                  value={hostName}
                  onChange={(event) => setHostName(event.target.value)}
                  maxLength={18}
                  placeholder={tr('lanHostNamePlaceholder')}
                />
              </label>
              <button className="primary wide" onClick={openLanHost} disabled={lanBusy}>
                {lanBusy ? tr('lanStarting') : tr('lanCreate')}
              </button>
              {lanError && <p className="error" role="alert">{lanError}</p>}
            </section>

            <section className="lan-choice-card join-card">
              <div className="choice-head">
                <span className="tag">{tr('lanGuestTag')}</span>
                <span className="choice-icon" aria-hidden="true">↗</span>
              </div>
              <h3>{tr('lanJoin')}</h3>
              <div className="field-row">
                <label className="field code-field">
                  <span>{tr('lanCode')}</span>
                  <input
                    value={guestCode}
                    onChange={(event) => setGuestCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="0000"
                    aria-label={tr('lanCode')}
                  />
                </label>
                <label className="field">
                  <span>{tr('lanName')}</span>
                  <input
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    maxLength={18}
                    placeholder={tr('lanName')}
                  />
                </label>
              </div>
              <button className="primary wide" onClick={joinGuest} disabled={guestConnecting}>
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
              {lanError && <p className="error" role="alert">{lanError}</p>}
            </section>
          </div>
          <p className="lan-footnote">{tr('lanStartHint')}</p>
        </>
      )}

      {lanRole === 'host' && (
        <>
          <h2 className="screen-title">{tr('lanTitle')}</h2>
          {lanBusy && (
            <div className="lan-card loading-card">
              <span className="spinner" aria-hidden="true" />
              {tr('lanStarting')}
            </div>
          )}
          {lanError && <p className="error" role="alert">{lanError}</p>}
          {!lanHost && !lanBusy && (
            <button
              className="secondary"
              onClick={() => {
                closeLan();
                setLanRole('hub');
                setScreen('lan');
              }}
            >
              {tr('lanBackToLobby')}
            </button>
          )}
          {lanHost && lanInfo && lanInvite && lanCode && (
            <div className="lan-layout">
              <div className="lan-card">
                <div className="lan-card-top">
                  <span className="label">{tr('lanCode')}</span>
                  <span className={`status-pill ${guestOnline ? 'ready' : ''}`}>
                    {guestOnline ? tr('lanReady') : tr('lanWaiting')}
                  </span>
                </div>
                <div className="room-code big">{lanCode}</div>
                <p className="lan-help">{tr('lanHostCodeHelp')}</p>
                <div className="peer-list">
                  {lanPlayers.map((player) => (
                    <span key={player.seat} className={`peer-chip ${player.connected ? 'online' : ''}`}>
                      <PieceDisc piece={player.seat === 0 ? 'w' : 'b'} small />
                      <span className="peer-name">
                        {player.connected ? player.name : tr('lanGuestTag')}
                      </span>
                      <small>
                        {player.host ? tr('lanHostTag') : tr('lanGuestTag')} ·{' '}
                        {player.connected ? tr('lanOnline') : tr('lanOffline')}
                      </small>
                    </span>
                  ))}
                </div>
                <button className="primary wide" onClick={startLan} disabled={!guestOnline}>
                  {guestOnline ? tr('lanStart') : tr('lanWaiting')}
                </button>
                <button className="secondary wide" onClick={copyInvite}>
                  {tr('lanCopyLink')}
                </button>
                <button className="text-button" onClick={goHome}>{tr('lanLeave')}</button>
              </div>
              <div className="qr-card">
                {lanQr ? <img src={lanQr} alt={tr('lanScan')} /> : null}
                <p>{tr('lanScan')}</p>
                {lang === 'en' && (
                  <a className="invite-link" href={lanInvite} target="_blank" rel="noreferrer">
                    {readableInvite(lanInvite)}
                  </a>
                )}
                <p className="qr-address">
                  {tr('lanOpenAddress')}
                  <br />
                  <code>
                    {lang === 'zh'
                      ? (lanInfo.urls[0] ?? '').replace(/^https?:\/\//, '')
                      : lanInfo.urls[0]}
                  </code>
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {lanRole === 'guest' && (
        <>
          <h2 className="screen-title">{guest ? tr('lanGuestTitle') : tr('lanJoinTitle')}</h2>
          {lanError && <p className="error" role="alert">{lanError}</p>}
          {!guest && (
            <div className="guest-card">
              <div className="guest-room-badge">
                <span className="label">{tr('lanCode')}</span>
                <strong>{guestCode || '····'}</strong>
              </div>
              <div className="lan-form">
                <label>
                  <span>{tr('lanName')}</span>
                  <input
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    maxLength={18}
                    placeholder={tr('lanName')}
                  />
                </label>
                <label>
                  <span>{tr('lanCode')}</span>
                  <input
                    value={guestCode}
                    onChange={(event) => setGuestCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="0000"
                  />
                </label>
                <button className="primary wide" onClick={joinGuest} disabled={guestConnecting}>
                  {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
                </button>
              </div>
              <p className="hint-copy">{tr('lanStartHint')}</p>
            </div>
          )}
          {guest && (
            <div className="guest-card waiting-card">
              <div className="wait-orbit" aria-hidden="true">
                <PieceDisc piece="b" />
              </div>
              <h3>{tr('lanConnected')}</h3>
              <p>{tr('lanWaitingHost')}</p>
              <div className="guest-meta">
                <span>{t(lang, 'lanRoom', { code: guestRoom || guestCode })}</span>
                <span>{tr('lanGuestSeat')}</span>
                {guestHostName && <span>{tr('lanHostTag')} · {guestHostName}</span>}
              </div>
              <button className="secondary wide" onClick={goHome}>{tr('lanLeave')}</button>
            </div>
          )}
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const statsScreen = (
    <main className="shell stats-shell">
      <button className="back" onClick={goHome}>← {tr('home')}</button>
      <header className="stats-head">
        <p className="eyebrow">{tr('recordEyebrow')}</p>
        <h2 className="screen-title">{tr('recordTitle')}</h2>
      </header>

      {record.games === 0 ? (
        <section className="empty-card">
          <span className="empty-mark" aria-hidden="true">
            <PieceDisc piece="w" />
            <PieceDisc piece="b" />
          </span>
          <p>{tr('recordEmpty')}</p>
          <button className="primary" onClick={startAi}>{tr('playAi')}</button>
        </section>
      ) : (
        <>
          <section className="stats-top">
            <div className="stat-card total">
              <span>{tr('total')}</span>
              <strong>{record.games}</strong>
            </div>
            <div className="stat-card white">
              <span>{tr('winsWhite')}</span>
              <strong>{record.winsWhite}</strong>
            </div>
            <div className="stat-card black">
              <span>{tr('winsBlack')}</span>
              <strong>{record.winsBlack}</strong>
            </div>
            <div className="stat-card draw">
              <span>{tr('draws')}</span>
              <strong>{record.draws}</strong>
            </div>
          </section>

          <section className="record-grid">
            <div className="record-card">
              <h3>{tr('winShare')}</h3>
              <div className="share-bar" aria-hidden="true">
                <span className="share-w" style={{ width: shareWhite }} />
                <span className="share-b" style={{ width: shareBlack }} />
                <span className="share-d" style={{ width: shareDraw }} />
              </div>
              <ul className="share-legend">
                <li><i className="legend-w" />{tr('winsWhite')} <strong>{record.winsWhite}</strong></li>
                <li><i className="legend-b" />{tr('winsBlack')} <strong>{record.winsBlack}</strong></li>
                <li><i className="legend-d" />{tr('draws')} <strong>{record.draws}</strong></li>
              </ul>
              <div className="streak-row">
                <div><span>{tr('sameWinnerRun')}</span><strong>{record.streak}</strong></div>
                <div><span>{tr('bestRun')}</span><strong>{record.bestStreak}</strong></div>
                <div><span>{tr('lastResult')}</span><strong>{lastResultLabel}</strong></div>
              </div>
            </div>

            <div className="record-card modes-card">
              <h3>{tr('games')}</h3>
              <div className="mode-list">
                {(['ai', 'local', 'lan'] as const).map((value) => (
                  <div className="mode-row" key={value}>
                    <span>{modeLabelFor(value)}</span>
                    <div className="mode-bar">
                      <i style={{ width: record.games > 0 ? `${(record.byMode[value] / record.games) * 100}%` : '0%' }} />
                    </div>
                    <strong>{record.byMode[value]}</strong>
                  </div>
                ))}
              </div>
              <p className="clear-note">{tr('clearNote')}</p>
              {clearArmed && <p className="clear-confirm">{tr('clearConfirm')}</p>}
              <div className="clear-actions">
                <button className={clearArmed ? 'danger' : 'text-button'} onClick={resetRecord}>
                  {clearArmed ? tr('clearYes') : tr('resetStats')}
                </button>
                {clearArmed && (
                  <button className="secondary" onClick={() => setClearArmed(false)}>
                    {tr('clearKeep')}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="recent-card">
            <h3>{tr('recentGames')}</h3>
            {record.recent.length === 0 ? (
              <p className="recent-empty">{tr('recentEmpty')}</p>
            ) : (
              <ol className="recent-list">
                {record.recent.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="recent-row">
                    <span className={`recent-disc ${entry.winner === 'draw' ? 'draw' : entry.winner === 'W' ? 'white' : 'black'}`}>
                      {entry.winner === 'draw' ? '=' : <PieceDisc piece={entry.winner === 'W' ? 'w' : 'b'} small />}
                    </span>
                    <div className="recent-main">
                      <strong>{resultLabel(entry.winner)}</strong>
                      <span>
                        {modeLabelFor(entry.mode)}
                        {entry.level ? ` · ${t(lang, entry.level)}` : ''}
                      </span>
                    </div>
                    <span className="recent-moves">
                      {t(lang, entry.moves === 1 ? 'moveOne' : 'moves', { n: entry.moves })}
                    </span>
                    <time dateTime={new Date(entry.at).toISOString()}>{formatDate(entry.at, lang)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <ol className="rules-list">
        <li>{tr('rule1')}</li>
        <li>{tr('rule2')}</li>
        <li>{tr('rule3')}</li>
        <li>{tr('rule4')}</li>
        <li>{tr('rule5')}</li>
        <li>{tr('rule6')}</li>
        <li>{tr('rule7')}</li>
        <li>{tr('rule8')}</li>
        <li>{tr('rule9')}</li>
        <li>{tr('rule10')}</li>
      </ol>
      <div className="rules-extra">
        <p><strong>{tr('rulesLanTitle')}</strong><br />{tr('rulesLan')}</p>
        <p><strong>{tr('rulesRecordTitle')}</strong><br />{tr('rulesRecord')}</p>
        <p><strong>{tr('rulesControlsTitle')}</strong><br />{tr('rulesControls')}</p>
      </div>
      <button className="primary" onClick={goHome}>{tr('close')}</button>
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
