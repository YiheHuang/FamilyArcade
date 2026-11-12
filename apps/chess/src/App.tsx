import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseMove, type AiLevel } from './ai/ai';
import { hintFor, type HintReason } from './ai/hint';
import { Board, PieceGlyph } from './components/Board';
import {
  apply,
  applySeat,
  fileOf,
  findMove,
  fromFen,
  kingSquare,
  legalMoves,
  rankOf,
  setup,
  squareName,
  view,
  type Color,
  type GameState,
  type Move,
  type MoveRecord,
  type PieceType,
  type Promotion,
  type SeatView,
} from './game/chess';
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

const HINT_KEYS: Record<HintReason, MessageKey> = {
  mate: 'hintMate',
  promotion: 'hintPromotion',
  capture: 'hintCapture',
  check: 'hintCheck',
  castle: 'hintCastle',
  center: 'hintCenter',
  develop: 'hintDevelop',
  defend: 'hintDefend',
  best: 'hintBest',
};

const ZH_PIECE: Record<PieceType, string> = {
  p: '兵',
  n: '马',
  b: '象',
  r: '车',
  q: '后',
  k: '王',
};

const ZH_FILES = ['一', '二', '三', '四', '五', '六', '七', '八'];

function localSquare(lang: Lang, square: number): string {
  return lang === 'zh' ? `${ZH_FILES[fileOf(square)]}${8 - rankOf(square)}` : squareName(square);
}

const HERO = fromFen('r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 1');
const HERO_LAST: Move = { from: 52, to: 36 };

function recordModeFor(mode: Mode): RecordMode {
  if (mode === 'ai') return 'ai';
  if (mode === 'lan-host') return 'lan';
  return 'local';
}

function readPromotion(value: unknown): Promotion | undefined {
  return value === 'q' || value === 'r' || value === 'b' || value === 'n' ? value : undefined;
}

function isSeatView(value: unknown): value is SeatView {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SeatView>;
  return Array.isArray(candidate.board) && candidate.board.length === 64 && Array.isArray(candidate.moves);
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

function outcomeText(lang: Lang, status: GameState['status'], winner: Color | null): string {
  if (status === 'checkmate') return t(lang, winner === 'w' ? 'whiteWins' : 'blackWins');
  if (status === 'draw' || status === 'stalemate') return t(lang, 'draw');
  return '';
}

function outcomeReason(lang: Lang, state: Pick<GameState, 'status' | 'drawReason'>): string {
  if (state.status === 'checkmate') return t(lang, 'reasonCheckmate');
  if (state.status === 'stalemate') return t(lang, 'reasonStalemate');
  if (state.status === 'draw') {
    if (state.drawReason === 'fifty') return t(lang, 'reasonFifty');
    if (state.drawReason === 'threefold') return t(lang, 'reasonThreefold');
    if (state.drawReason === 'material') return t(lang, 'reasonMaterial');
  }
  return '';
}

function hintMoveText(lang: Lang, state: GameState, move: Move, san: string): string {
  if (lang === 'en') return san;
  if (move.castle) return move.castle === 'k' ? '短易位' : '长易位';
  const piece = state.board[move.from];
  const name = piece ? ZH_PIECE[piece.type] : '兵';
  const capture = Boolean(state.board[move.to]) || move.enPassant;
  const arrow = capture ? '×' : '→';
  return `${name} ${localSquare(lang, move.from)}${arrow}${localSquare(lang, move.to)}${
    move.promotion ? `=${ZH_PIECE[move.promotion]}` : ''
  }`;
}

function recordText(lang: Lang, record: MoveRecord): string {
  if (lang === 'en') return record.san;
  if (record.castle) {
    return `${record.castle === 'k' ? '短易位' : '长易位'}${record.mate ? '#' : record.check ? '+' : ''}`;
  }
  const arrow = record.captured || record.enPassant ? '×' : '→';
  return `${ZH_PIECE[record.piece]} ${localSquare(lang, record.from)}${arrow}${localSquare(lang, record.to)}${
    record.promotion ? `=${ZH_PIECE[record.promotion]}` : ''
  }${record.mate ? '#' : record.check ? '+' : ''}`;
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (invite ? 'lan-guest' : 'ai'));
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup());
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<{ from: number; to: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: number; to: number } | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.chess.sound') !== 'off';
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
      return localStorage.getItem('familyarcade.chess.hostName') ?? '';
    } catch {
      return '';
    }
  });
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => invite?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => invite?.code ?? '');
  const [guestRoom, setGuestRoom] = useState(() => invite?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [guestPlayers, setGuestPlayers] = useState<LanPublicPeer[]>([]);
  const [autoJoin] = useState(() => Boolean(invite && invite.code && invite.name));

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const hostStartedRef = useRef(false);
  const autoJoinRef = useRef(false);
  const lanActiveRef = useRef(false);
  const lastGuestMoveRef = useRef(-1);
  const guestJoinSeqRef = useRef(0);
  const hostCreateSeqRef = useRef(0);
  const notationRef = useRef<HTMLDivElement | null>(null);
  const promoRef = useRef<HTMLButtonElement | null>(null);

  const isGuest = mode === 'lan-guest';
  const isLan = mode === 'lan-host' || isGuest;

  const tr = useCallback((key: MessageKey) => t(lang, key), [lang]);

  const shownBoard = guestView?.board ?? state.board;
  const shownTurn = guestView?.turn ?? state.turn;
  const shownStatus = guestView?.status ?? state.status;
  const shownWinner = guestView?.winner ?? state.winner;
  const shownDrawReason = guestView?.drawReason ?? state.drawReason;
  const shownInCheck = guestView?.inCheck ?? state.inCheck;
  const shownMoves = guestView?.moves ?? state.moves;
  const shownLast = guestView?.lastMove ?? state.lastMove;

  const legal = useMemo(() => {
    if (isGuest) return guestView?.legal ?? [];
    if (state.status !== 'playing') return [];
    return legalMoves(state);
  }, [guestView, isGuest, state]);

  const targets = useMemo(
    () => (selected === null ? [] : legal.filter((move) => move.from === selected).map((move) => move.to)),
    [legal, selected],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t(lang, 'title');
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.chess.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.chess.hostName', hostName);
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
    if (!pendingPromotion) return;
    const timer = window.setTimeout(() => promoRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [pendingPromotion]);

  useEffect(() => {
    if (!notationRef.current) return;
    notationRef.current.scrollTop = notationRef.current.scrollHeight;
  }, [shownMoves.length]);

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
        clearSave();
        setSaved(null);
      }
      if (soundOn) chime(next.status === 'draw' || next.status === 'stalemate' ? 'draw' : 'win');
    },
    [level, recorded, soundOn],
  );

  const commit = useCallback(
    (next: GameState, currentMode: Mode, previous: GameState) => {
      stateRef.current = next;
      setHistory((items) => [...items, previous]);
      setState(next);
      setHint(null);
      setSelected(null);
      setPendingPromotion(null);
      if (soundOn && next.status === 'playing') {
        chime(
          next.inCheck
            ? 'check'
            : next.lastMove?.captured || next.lastMove?.enPassant
              ? 'capture'
              : 'place',
        );
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
        hostRef.current.sendView(1, view(next, 1));
        if (next.status !== 'playing') hostRef.current.sendResult(view(next, 1));
      }
    },
    [finish, level, soundOn],
  );

  const startLocal = useCallback((nextMode: 'ai' | 'local') => {
    const next = setup();
    stateRef.current = next;
    setMode(nextMode);
    setState(next);
    setHistory([]);
    setHint(null);
    setSelected(null);
    setPendingPromotion(null);
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
    setHint(null);
    setSelected(null);
    setPendingPromotion(null);
    setAiThinking(false);
    setRecorded(false);
    setScreen('game');
  }, [saved]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    if (isLan) return;
    if (state.status !== 'playing') return;

    let previous: GameState;
    let nextHistory: GameState[];
    if (mode === 'ai') {
      let index = history.length - 1;
      while (index >= 0 && !(history[index].status === 'playing' && history[index].turn === 'w')) {
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
    setHint(null);
    setSelected(null);
    setPendingPromotion(null);
    setRecorded(false);
    setSaved(saveGame({ state: previous, mode: mode === 'ai' ? 'ai' : 'local', level }));
  }, [history, isLan, level, mode, state.status]);

  const showHint = useCallback(() => {
    if (state.status !== 'playing' || isLan) return;
    if (mode === 'ai' && state.turn !== 'w') return;
    const next = hintFor(state);
    if (!next) return;
    setSelected(null);
    setPendingPromotion(null);
    setHint({ from: next.move.from, to: next.move.to });
    const label = hintMoveText(lang, state, next.move, next.san);
    setToast(t(lang, HINT_KEYS[next.reason], { move: label }));
  }, [isLan, lang, mode, state]);

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
    setLanBusy(false);
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
        const value = intent as
          | { type?: string; from?: number; to?: number; promotion?: string; moveCount?: number }
          | null;
        if (!value || value.type !== 'move') return;
        const from = Number(value.from);
        const to = Number(value.to);
        if (!Number.isInteger(from) || !Number.isInteger(to)) return;
        const current = stateRef.current;
        const result = applySeat(
          current,
          seat,
          { from, to, promotion: readPromotion(value.promotion) },
          typeof value.moveCount === 'number' ? value.moveCount : undefined,
        );
        if (!result.ok) return;
        commit(result.state, 'lan-host', current);
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
        color: { dark: '#2b2520', light: '#fffaf0' },
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
      if (seq === hostCreateSeqRef.current) setLanBusy(false);
    }
  }, [closeLan, commit, hostName, lang, lanBusy]);

  const startLan = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open' || !lanPlayers[1]?.connected) return;
    const next = setup();
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setHint(null);
    setSelected(null);
    setPendingPromotion(null);
    setRecorded(false);
    setLanError('');
    setMode('lan-host');
    setScreen('game');
    hostStartedRef.current = true;
    host.start();
    host.sendLobby();
    host.sendView(1, view(next, 1));
  }, [lanPlayers]);

  const joinGuest = useCallback(async () => {
    if (guestConnecting || guest) return;
    const name = guestName.trim();
    const code = guestCode.trim();
    const room = guestRoom || code;
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
      lastGuestMoveRef.current = -1;
      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        if (!isSeatView(payload)) return;
        setGuestView(payload);
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

  const restartGame = useCallback(() => {
    if (isGuest) return;
    if (mode === 'lan-host') {
      const host = hostRef.current;
      if (!host) return;
      const next = setup();
      stateRef.current = next;
      setState(next);
      setHistory([]);
      setHint(null);
      setSelected(null);
      setPendingPromotion(null);
      setRecorded(false);
      setLanError('');
      hostStartedRef.current = true;
      host.start();
      host.sendLobby();
      host.sendView(1, view(next, 1));
      return;
    }
    startLocal(mode === 'ai' ? 'ai' : 'local');
  }, [isGuest, mode, startLocal]);

  const canControlSquare = useCallback(
    (index: number) => {
      const board = isGuest ? guestView?.board : state.board;
      if (!board) return false;
      const piece = board[index];
      if (!piece) return false;
      if (isGuest) return Boolean(guestView?.canMove) && guestStarted && piece.color === shownTurn;
      if (mode === 'ai') return state.turn === 'w' && !aiThinking && piece.color === 'w';
      if (mode === 'lan-host') {
        return Boolean(lanPlayers[1]?.connected) && state.turn === 'w' && piece.color === 'w';
      }
      return piece.color === shownTurn;
    },
    [aiThinking, guestStarted, guestView, isGuest, lanPlayers, mode, shownTurn, state.board, state.turn],
  );

  const playSquare = useCallback(
    (index: number) => {
      if (screen !== 'game' || shownStatus !== 'playing') return;
      const board = isGuest ? guestView?.board : state.board;
      if (!board) return;
      const turn = isGuest ? guestView?.turn : state.turn;
      if (!turn) return;

      if (selected === null) {
        if (canControlSquare(index)) setSelected(index);
        return;
      }
      if (index === selected) {
        setSelected(null);
        return;
      }

      const candidates = legal.filter((move) => move.from === selected && move.to === index);
      if (candidates.length > 0) {
        if (candidates.some((move) => move.promotion)) {
          setPendingPromotion({ from: selected, to: index });
          return;
        }
        if (isGuest) {
          guest?.sendIntent({
            type: 'move',
            from: selected,
            to: index,
            moveCount: guestView?.moveCount ?? 0,
          });
          setSelected(null);
          return;
        }
        const result = apply(state, candidates[0]);
        if (result.ok) commit(result.state, mode, state);
        return;
      }

      if (canControlSquare(index)) setSelected(index);
      else setSelected(null);
    },
    [
      canControlSquare,
      commit,
      guest,
      guestView,
      isGuest,
      legal,
      mode,
      screen,
      selected,
      shownStatus,
      state,
    ],
  );

  const choosePromotion = useCallback(
    (promotion: Promotion) => {
      if (!pendingPromotion) return;
      const { from, to } = pendingPromotion;
      if (isGuest) {
        guest?.sendIntent({
          type: 'move',
          from,
          to,
          promotion,
          moveCount: guestView?.moveCount ?? 0,
        });
      } else {
        const move = findMove(state, from, to, promotion);
        if (move) {
          const result = apply(state, move);
          if (result.ok) commit(result.state, mode, state);
        }
      }
      setPendingPromotion(null);
      setSelected(null);
    },
    [commit, guest, guestView, isGuest, mode, pendingPromotion, state],
  );

  // AI reply, paused when the game screen is hidden.
  useEffect(() => {
    if (screen !== 'game' || mode !== 'ai' || state.status !== 'playing' || state.turn !== 'b') {
      return;
    }
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseMove(state, level);
      setAiThinking(false);
      if (!move) return;
      const result = apply(state, move);
      if (!result.ok) return;
      commit(result.state, 'ai', state);
    }, 380);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, level, mode, screen, state]);

  // Keyboard path: Escape leaves, U undoes, H asks for a hint.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        Boolean(target?.isContentEditable);
      if (event.key === 'Escape') {
        if (typing) return;
        event.preventDefault();
        if (pendingPromotion) {
          setPendingPromotion(null);
          return;
        }
        goHome();
        return;
      }
      if (screen !== 'game' || typing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === 'u') {
        event.preventDefault();
        undo();
      } else if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        showHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goHome, pendingPromotion, screen, showHint, undo]);

  // A scanned invite joins immediately.
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

  // The guest hears the host's board update.
  useEffect(() => {
    if (!guestView) {
      lastGuestMoveRef.current = -1;
      return;
    }
    const previous = lastGuestMoveRef.current;
    lastGuestMoveRef.current = guestView.moveCount;
    if (previous < 0 || guestView.moveCount <= previous || !soundOn) return;
    if (guestView.status !== 'playing') {
      chime(guestView.status === 'draw' || guestView.status === 'stalemate' ? 'draw' : 'win');
    } else {
      chime(guestView.inCheck ? 'check' : 'place');
    }
  }, [guestView, soundOn]);

  const guestCanPlay = Boolean(guestView?.canMove) && guestStarted;
  const guestOnline = Boolean(lanPlayers[1]?.connected);
  const hostOnline = mode !== 'lan-host' || lanHost?.status === 'open';
  const hostCanPlay = mode === 'lan-host' ? guestOnline && hostOnline : true;

  const disabled =
    screen !== 'game' ||
    shownStatus !== 'playing' ||
    (isGuest && (!guestView || !guestCanPlay)) ||
    (mode === 'lan-host' && (!hostCanPlay || shownTurn !== 'w')) ||
    (mode === 'ai' && (shownTurn !== 'w' || aiThinking));

  const statusHeadline = (() => {
    if (shownStatus !== 'playing') return outcomeText(lang, shownStatus, shownWinner);
    if (isGuest) {
      if (!guestStarted) return tr('lanWaitingHost');
      return guestCanPlay ? tr('yourMove') : tr('waitingForOpponent');
    }
    if (mode === 'ai') {
      if (state.turn === 'w') return tr('yourMove');
      return aiThinking ? tr('computerThinking') : tr('blackToMove');
    }
    if (mode === 'local') {
      return t(lang, shownTurn === 'w' ? 'whiteToMove' : 'blackToMove');
    }
    if (mode === 'lan-host') {
      if (!guestOnline) {
        return t(lang, 'lanWaitingForGuest', {
          name: lanPlayers[1]?.name || tr('lanGuestTag'),
        });
      }
      return shownTurn === 'w' ? tr('yourMove') : tr('waitingForOpponent');
    }
    return '';
  })();

  const statusDetail = (() => {
    if (shownStatus !== 'playing') return outcomeReason(lang, { status: shownStatus, drawReason: shownDrawReason });
    if (isGuest) return guestCanPlay ? tr('lanGuestSeat') : tr('lanWaitingForHost');
    if (mode === 'ai') return `${t(lang, level)}${shownInCheck ? ` · ${tr('check')}` : ''}`;
    if (mode === 'local') {
      return shownInCheck ? tr('check') : state.moves.length === 0 ? tr('localHint') : tr('localTurnHint');
    }
    if (mode === 'lan-host') {
      return `${tr('lanHostSeat')}${shownInCheck ? ` · ${tr('check')}` : ''}`;
    }
    return '';
  })();

  const modeLabel =
    mode === 'ai'
      ? t(lang, level)
      : mode === 'local'
        ? tr('playLocal')
        : mode === 'lan-host'
          ? tr('lanHostMode')
          : tr('lanGuestMode');

  const resultBanner =
    shownStatus !== 'playing' ? (
      <div className="result-banner" role="status">
        <div className="result-copy">
          <span className="result-kicker">{tr('gameOver')}</span>
          <strong>{outcomeText(lang, shownStatus, shownWinner)}</strong>
          <small>{outcomeReason(lang, { status: shownStatus, drawReason: shownDrawReason })}</small>
        </div>
        {isGuest ? (
          <span className="wait-pill">
            <span className="wait-dot" aria-hidden="true" />
            {tr('lanWaitRestart')}
          </span>
        ) : (
          <div className="result-actions">
            <button className="primary" onClick={restartGame} disabled={mode === 'lan-host' && !lanHost}>
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
    ) : null;

  const moveRows = (() => {
    const rows: { number: number; white: MoveRecord | null; black: MoveRecord | null }[] = [];
    for (let index = 0; index < shownMoves.length; index += 2) {
      rows.push({
        number: index / 2 + 1,
        white: shownMoves[index] ?? null,
        black: shownMoves[index + 1] ?? null,
      });
    }
    return rows;
  })();

  const gameWord = (count: number) => t(lang, count === 1 ? 'oneGame' : 'games');
  const drawWord = (count: number) => t(lang, count === 1 ? 'oneDraw' : 'draws');
  const share = (count: number) =>
    record.games > 0 ? `${Math.round((count / record.games) * 100)}%` : '0%';
  const lastResultLabel =
    record.lastWinner === 'w'
      ? tr('whiteWinsShort')
      : record.lastWinner === 'b'
        ? tr('blackWinsShort')
        : record.lastWinner === 'draw'
          ? tr('draw')
          : tr('none');
  const recordModeLabel = (value: RecordMode) =>
    value === 'ai' ? tr('modeAi') : value === 'local' ? tr('modeLocal') : tr('modeLan');
  const recentResultLabel = (winner: 'w' | 'b' | 'draw') =>
    winner === 'w' ? tr('whiteWinsShort') : winner === 'b' ? tr('blackWinsShort') : tr('draw');
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
            board={HERO.board}
            last={HERO_LAST}
            hint={null}
            selected={null}
            targets={[]}
            checkSquare={null}
            disabled
            onSquare={() => undefined}
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
            <span>{gameWord(record.games)}</span>
            <span className="dot">·</span>
            <span>
              {record.whiteWins} {tr('whiteWinsShort')}
            </span>
            <span className="dot">·</span>
            <span>
              {record.blackWins} {tr('blackWinsShort')}
            </span>
            <span className="dot">·</span>
            <span>
              {record.draws} {drawWord(record.draws)}
            </span>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
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
      <p className="setup-note">{tr('youPlayWhite')}</p>
      <div className="row-actions">
        <button className="primary" onClick={() => startLocal('ai')}>
          {tr('begin')}
        </button>
        <button className="ghost" onClick={goHome}>
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
            <span className="sound-glyph" data-on={soundOn}>
              ♪
            </span>
          </button>
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
        </div>
      </header>

      <div className="game-layout">
        <section className="board-wrap">
          <div className={`turn-bar ${shownStatus !== 'playing' ? 'is-over' : ''}`} aria-live="polite">
            <span className={`turn-chip ${shownTurn}`}>
              <PieceGlyph cell={{ color: shownTurn, type: 'k' }} />
            </span>
            <div className="turn-copy">
              <strong>{statusHeadline}</strong>
              <p>{statusDetail}</p>
            </div>
            {aiThinking && (
              <span className="thinking" aria-hidden="true">
                …
              </span>
            )}
          </div>

          {isLan && lanError && (
            <p className="error game-error" role="alert">
              {lanError}
            </p>
          )}

          <Board
            board={shownBoard}
            last={shownLast}
            hint={hint}
            selected={selected}
            targets={targets}
            checkSquare={shownInCheck ? kingSquare(shownBoard, shownTurn) : null}
            disabled={disabled}
            onSquare={playSquare}
            lang={lang}
          />

          {resultBanner}
        </section>

        <aside className="side">
          <div className="side-card control-card">
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
                disabled={
                  state.status !== 'playing' ||
                  isLan ||
                  (mode === 'ai' && state.turn !== 'w')
                }
              >
                {tr('hint')}
              </button>
            </div>
            {!isLan && <p className="side-note">{tr('keyboardHint')}</p>}
            {!isLan && state.status === 'playing' && (
              <p className="save-line">
                <span className="save-dot" aria-hidden="true" />
                {tr('savedOnDevice')}
              </p>
            )}
          </div>

          <div className="side-card notation-card">
            <h3>{tr('moveRecord')}</h3>
            {shownMoves.length === 0 ? (
              <p className="side-note">{tr('noMoves')}</p>
            ) : (
              <div className="notation-scroll" ref={notationRef}>
                <div className="notation-row notation-head">
                  <span>#</span>
                  <span>{tr('whiteShort')}</span>
                  <span>{tr('blackShort')}</span>
                </div>
                {moveRows.map((row) => (
                  <div className="notation-row" key={row.number}>
                    <span className="move-number">{row.number}.</span>
                    <span>{row.white ? recordText(lang, row.white) : ''}</span>
                    <span>{row.black ? recordText(lang, row.black) : ''}</span>
                  </div>
                ))}
              </div>
            )}
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
              <p>{guestCanPlay ? tr('yourMove') : tr('waitingForOpponent')}</p>
              <p className="peer">{t(lang, 'lanRoom', { code: guestRoom || guestCode })}</p>
              {guestHostName && (
                <p className="peer">
                  {tr('lanHostTag')} · {guestHostName}
                </p>
              )}
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('stats')}</h3>
            <p>
              {record.games} {gameWord(record.games)} · {record.whiteWins}/{record.blackWins}/{record.draws}
            </p>
            <p className="record-mini-note">{tr('recordMiniNote')}</p>
            {!isGuest && (
              <button className="text-button" onClick={() => setScreen('stats')}>
                {tr('viewRecord')} →
              </button>
            )}
          </div>
        </aside>
      </div>

      {pendingPromotion && (
        <div
          className="promo-backdrop"
          role="presentation"
          onClick={() => {
            setPendingPromotion(null);
            setSelected(null);
          }}
        >
          <div
            className="promo-card"
            role="dialog"
            aria-modal="true"
            aria-label={tr('promotionTitle')}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{tr('promotionTitle')}</h3>
            <div className="promo-grid">
              {(['q', 'r', 'b', 'n'] as Promotion[]).map((promotion, index) => (
                <button
                  key={promotion}
                  ref={index === 0 ? promoRef : undefined}
                  className="promo-button"
                  onClick={() => choosePromotion(promotion)}
                  aria-label={tr(
                    promotion === 'q'
                      ? 'promoteQueen'
                      : promotion === 'r'
                        ? 'promoteRook'
                        : promotion === 'b'
                          ? 'promoteBishop'
                          : 'promoteKnight',
                  )}
                >
                  <PieceGlyph cell={{ color: shownTurn, type: promotion }} />
                  <span>
                    {tr(
                      promotion === 'q'
                        ? 'promoteQueen'
                        : promotion === 'r'
                          ? 'promoteRook'
                          : promotion === 'b'
                            ? 'promoteBishop'
                            : 'promoteKnight',
                    )}
                  </span>
                </button>
              ))}
            </div>
            <button
              className="ghost cancel-promo"
              onClick={() => {
                setPendingPromotion(null);
                setSelected(null);
              }}
            >
              {tr('cancel')}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );

  const statsScreen = (
    <main className="shell stats-shell">
      <button className="back" onClick={goHome}>
        ← {tr('home')}
      </button>
      <header className="stats-head">
        <p className="eyebrow">{tr('eyebrow')}</p>
        <h2 className="screen-title">{tr('recordTitle')}</h2>
      </header>

      {record.games === 0 ? (
        <section className="empty-card">
          <span className="empty-mark" aria-hidden="true">
            ♞ ♜ ♝
          </span>
          <p>{tr('recordEmpty')}</p>
          <button className="primary" onClick={startAi}>
            {tr('playAi')}
          </button>
        </section>
      ) : (
        <>
          <section className="stats-top">
            <div className="stat-card total">
              <span>{tr('games')}</span>
              <strong>{record.games}</strong>
            </div>
            <div className="stat-card white">
              <span>{tr('whiteWinsShort')}</span>
              <strong>{record.whiteWins}</strong>
            </div>
            <div className="stat-card black">
              <span>{tr('blackWinsShort')}</span>
              <strong>{record.blackWins}</strong>
            </div>
            <div className="stat-card draw">
              <span>{tr('draws')}</span>
              <strong>{record.draws}</strong>
            </div>
          </section>

          <section className="record-grid">
            <div className="record-card">
              <h3>{tr('shareOfResults')}</h3>
              <div className="share-bar" aria-hidden="true">
                <span className="share-white" style={{ width: share(record.whiteWins) }} />
                <span className="share-black" style={{ width: share(record.blackWins) }} />
                <span className="share-draw" style={{ width: share(record.draws) }} />
              </div>
              <ul className="share-legend">
                <li>
                  <i className="legend-white" />
                  {tr('whiteWinsShort')} <strong>{record.whiteWins}</strong>
                </li>
                <li>
                  <i className="legend-black" />
                  {tr('blackWinsShort')} <strong>{record.blackWins}</strong>
                </li>
                <li>
                  <i className="legend-draw" />
                  {tr('draws')} <strong>{record.draws}</strong>
                </li>
              </ul>
              <div className="streak-row">
                <div>
                  <span>{tr('sameWinnerRun')}</span>
                  <strong>{record.streak}</strong>
                </div>
                <div>
                  <span>{tr('bestRun')}</span>
                  <strong>{record.bestStreak}</strong>
                </div>
                <div>
                  <span>{tr('lastResult')}</span>
                  <strong>{lastResultLabel}</strong>
                </div>
              </div>
            </div>

            <div className="record-card modes-card">
              <h3>{tr('byMode')}</h3>
              <div className="mode-list">
                {(['ai', 'local', 'lan'] as const).map((value) => (
                  <div className="mode-row" key={value}>
                    <span>{recordModeLabel(value)}</span>
                    <div className="mode-bar">
                      <i
                        style={{
                          width:
                            record.games > 0
                              ? `${(record.byMode[value] / record.games) * 100}%`
                              : '0%',
                        }}
                      />
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
                    <span className={`recent-mark ${entry.winner}`}>
                      {entry.winner === 'w' ? '♔' : entry.winner === 'b' ? '♚' : '='}
                    </span>
                    <div className="recent-main">
                      <strong>{recentResultLabel(entry.winner)}</strong>
                      <span>
                        {recordModeLabel(entry.mode)}
                        {entry.level ? ` · ${t(lang, entry.level)}` : ''}
                      </span>
                    </div>
                    <span className="recent-moves">{t(lang, 'movesCount', { n: entry.moves })}</span>
                    <time dateTime={new Date(entry.at).toISOString()}>{formatDate(entry.at, lang)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
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
      <button className="primary" onClick={goHome}>
        {tr('close')}
      </button>
    </main>
  );

  const lanScreen = (
    <main className={`shell ${lanRole === 'host' ? 'narrow-shell' : 'lan-shell'}`}>
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>

      {lanRole === 'hub' && (
        <>
          <header className="lan-hero">
            <p className="eyebrow">{tr('eyebrow')}</p>
            <h2 className="screen-title">{tr('lanTitle')}</h2>
          </header>
          <div className="lan-choice">
            <section className="lan-choice-card host-card">
              <div className="choice-head">
                <span className="tag">{tr('lanHostTag')}</span>
                <span className="choice-icon" aria-hidden="true">
                  ♔
                </span>
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
              {lanError && (
                <p className="error" role="alert">
                  {lanError}
                </p>
              )}
            </section>

            <section className="lan-choice-card join-card">
              <div className="choice-head">
                <span className="tag">{tr('lanGuestTag')}</span>
                <span className="choice-icon" aria-hidden="true">
                  ♟
                </span>
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
              {lanError && (
                <p className="error" role="alert">
                  {lanError}
                </p>
              )}
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
          {lanError && (
            <p className="error" role="alert">
              {lanError}
            </p>
          )}
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
                      <span className="peer-mark">{player.seat === 0 ? '♔' : '♚'}</span>
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
                <button className="text-button" onClick={goHome}>
                  {tr('lanLeave')}
                </button>
              </div>
              <div className="qr-card">
                {lanQr ? <img src={lanQr} alt={tr('lanScan')} /> : null}
                <p>{tr('lanScan')}</p>
                {lang === 'en' && (
                  <>
                    <a className="invite-link" href={lanInvite} target="_blank" rel="noreferrer">
                      {readableInvite(lanInvite)}
                    </a>
                    <p className="qr-address">
                      {tr('lanOpenAddress')}
                      <br />
                      <code>{lanInfo.urls[0] ?? ''}</code>
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {lanRole === 'guest' && (
        <>
          <h2 className="screen-title">{guest ? tr('lanGuestTitle') : tr('lanJoinTitle')}</h2>
          {lanError && (
            <p className="error" role="alert">
              {lanError}
            </p>
          )}
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
            </div>
          )}
          {guest && (
            <div className="guest-card waiting-card">
              <div className="wait-orbit" aria-hidden="true">
                <PieceGlyph cell={{ color: 'b', type: 'k' }} />
              </div>
              <h3>{tr('lanConnected')}</h3>
              <p>{tr('lanWaitingHost')}</p>
              <div className="guest-meta">
                <span>{t(lang, 'lanRoom', { code: guestRoom || guestCode })}</span>
                <span>{tr('lanGuestSeat')}</span>
                {guestHostName && (
                  <span>
                    {tr('lanHostTag')} · {guestHostName}
                  </span>
                )}
              </div>
              <button className="secondary wide" onClick={goHome}>
                {tr('lanLeave')}
              </button>
            </div>
          )}
        </>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
