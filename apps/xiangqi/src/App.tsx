import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseMove, type AiLevel } from './ai/ai';
import { hintFor, type HintKind } from './ai/hint';
import { Board, SideGlyph } from './components/Board';
import {
  applyMove,
  applySeat,
  generalIndex,
  initialBoard,
  legalMovesForBoard,
  legalMovesFromBoard,
  setup,
  view,
  type Cell,
  type GameReason,
  type GameState,
  type Move,
  type PieceType,
  type SeatView,
  type Side,
} from './game/xiangqi';
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

const LEVEL_HINT: Record<AiLevel, MessageKey> = {
  companion: 'companionHint',
  easy: 'easyHint',
  normal: 'normalHint',
  hard: 'hardHint',
};

const PIECE_KEYS: Record<PieceType, MessageKey> = {
  G: 'pieceGeneral',
  A: 'pieceAdvisor',
  E: 'pieceElephant',
  H: 'pieceHorse',
  R: 'pieceChariot',
  C: 'pieceCannon',
  S: 'pieceSoldier',
};

const HERO_BOARD = initialBoard();

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

function readableAddress(url: string): string {
  const bare = url.replace(/^https?:\/\//, '');
  return bare.replace(/^localhost(?=[:/]|$)/, '127.0.0.1');
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

function reasonText(lang: Lang, reason: GameReason): string {
  switch (reason) {
    case 'checkmate':
      return t(lang, 'reasonCheckmate');
    case 'stalemate':
      return t(lang, 'reasonStalemate');
    case 'repetition':
      return t(lang, 'reasonRepetition');
    case 'no-capture':
      return t(lang, 'reasonNoCapture');
    default:
      return '';
  }
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (invite ? 'lan-guest' : 'ai'));
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup('R'));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hint, setHint] = useState<Move | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.xiangqi.sound') !== 'off';
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
      return localStorage.getItem('familyarcade.xiangqi.hostName') ?? '';
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
  const lastGuestMoveRef = useRef(-1);
  const guestJoinSeqRef = useRef(0);
  const hostCreateSeqRef = useRef(0);

  const tr = useCallback((key: MessageKey) => t(lang, key), [lang]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? '中国象棋 · 家庭街机' : 'Xiangqi · Family Arcade';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.xiangqi.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.xiangqi.hostName', hostName);
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
    (next: GameState, currentMode: Mode, previous: GameState) => {
      stateRef.current = next;
      setHistory((items) => [...items, previous]);
      setState(next);
      setSelected(null);
      setCursor(null);
      setHint(null);
      if (soundOn && next.status === 'playing') chime('place');
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
    const next = setup('R');
    stateRef.current = next;
    setMode(nextMode);
    setState(next);
    setHistory([]);
    setSelected(null);
    setCursor(null);
    setHint(null);
    setFlipped(false);
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
    setCursor(null);
    setHint(null);
    setFlipped(false);
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
      while (index >= 0 && !(history[index].status === 'playing' && history[index].turn === 'R')) {
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
    setHint(null);
    setRecorded(false);
    setSaved(saveGame({ state: previous, mode, level }));
  }, [history, level, mode, state.status]);

  const showHint = useCallback(() => {
    if (state.status !== 'playing' || mode === 'lan-host' || mode === 'lan-guest') return;
    if (mode === 'ai' && state.turn !== 'R') return;
    const next = hintFor(state);
    if (!next) return;
    setHint(next.move);
    const keys: Record<HintKind, MessageKey> = {
      mate: 'hintMate',
      trap: 'hintTrap',
      capture: 'hintCapture',
      check: 'hintCheck',
      escape: 'hintEscape',
      develop: 'hintDevelop',
    };
    setToast(
      t(
        lang,
        keys[next.kind],
        next.captured ? { piece: t(lang, PIECE_KEYS[next.captured]) } : undefined,
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
        const value = intent as { type?: string; from?: number; to?: number; moveCount?: number } | null;
        if (!value || value.type !== 'move') return;
        const from = Number(value.from);
        const to = Number(value.to);
        if (!Number.isInteger(from) || !Number.isInteger(to)) return;
        const current = stateRef.current;
        if (typeof value.moveCount === 'number' && value.moveCount !== current.moves.length) return;
        const result = applySeat(current, seat, from, to);
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
      setLanBusy(false);
    }
  }, [closeLan, commit, hostName, lang, lanBusy]);

  const startLan = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open' || !lanPlayers[1]?.connected) return;
    const next = setup('R');
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setSelected(null);
    setCursor(null);
    setHint(null);
    setFlipped(false);
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
      const next = setup('R');
      stateRef.current = next;
      setState(next);
      setHistory([]);
      setSelected(null);
      setCursor(null);
      setHint(null);
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

  const board: Cell[] = guestView?.board ?? state.board;
  const shownStatus = guestView?.status ?? state.status;
  const shownTurn = guestView?.turn ?? state.turn;
  const shownWinner = guestView?.winner ?? state.winner;
  const shownReason = guestView?.reason ?? state.reason;
  const shownCheck = guestView?.check ?? state.check;
  const last = guestView ? guestView.last : (state.moves[state.moves.length - 1] ?? null);
  const isGuest = mode === 'lan-guest';
  const isLan = mode === 'lan-host' || mode === 'lan-guest';
  const guestCanPlay = Boolean(guestView?.canMove) && guestStarted;
  const guestOnline = Boolean(lanPlayers[1]?.connected);
  const hostOnline = mode !== 'lan-host' || lanHost?.status === 'open';
  const hostCanPlay = mode === 'lan-host' ? guestOnline && hostOnline : true;

  const disabled =
    screen !== 'game' ||
    shownStatus !== 'playing' ||
    (isGuest && !guestCanPlay) ||
    (mode === 'lan-host' && (!hostCanPlay || shownTurn !== 'R')) ||
    (mode === 'ai' && (shownTurn !== 'R' || aiThinking));

  const selectionSide: Side = isGuest ? (guestView?.side ?? 'B') : shownTurn;
  const selectedTargets =
    selected === null ? [] : legalMovesFromBoard(board, selectionSide, selected).map((move) => move.to);

  const playPoint = useCallback(
    (index: number) => {
      if (screen !== 'game') return;
      if (shownStatus !== 'playing') return;

      if (mode === 'lan-guest') {
        if (!guestStarted || !guestView?.canMove) return;
        const side = guestView.side;
        const target = guestView.board[index];
        if (target && target.side === side) {
          setSelected(index);
          setCursor(index);
          return;
        }
        if (selected !== null) {
          const legal = legalMovesForBoard(guestView.board, side).some(
            (move) => move.from === selected && move.to === index,
          );
          if (legal) {
            guest?.sendIntent({
              type: 'move',
              from: selected,
              to: index,
              moveCount: guestView.moveCount,
            });
          }
          setSelected(null);
          setCursor(null);
        }
        return;
      }

      if (mode === 'ai' && (state.turn !== 'R' || aiThinking)) return;
      if (
        mode === 'lan-host' &&
        (state.turn !== 'R' ||
          !lanPlayers[1]?.connected ||
          !lanHost ||
          lanHost.status !== 'open')
      ) {
        return;
      }

      const target = state.board[index];
      if (target && target.side === state.turn) {
        setSelected(index);
        setCursor(index);
        return;
      }
      if (selected === null) return;
      const result =
        mode === 'lan-host'
          ? applySeat(state, 0, selected, index)
          : applyMove(state, selected, index);
      if (result.ok) {
        commit(result.state, mode, state);
      } else {
        setSelected(null);
      }
    },
    [
      aiThinking,
      commit,
      guest,
      guestStarted,
      guestView,
      lanHost,
      lanPlayers,
      mode,
      screen,
      selected,
      shownStatus,
      state,
    ],
  );

  const joinGuest = useCallback(async () => {
    if (guestConnecting || guest) return;
    const name = guestName.trim();
    const code = guestCode.trim();
    const room = code || guestRoom;
    if (!name) {
      setLanError(t(lang, 'lanNameNeeded'));
      return;
    }
    if (!/^\d{4}$/.test(room)) {
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
      setFlipped(true);
      lastGuestMoveRef.current = -1;
      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        const next = payload as SeatView;
        if (!next || !Array.isArray(next.board) || next.board.length !== 90) return;
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
      const result = applyMove(state, move.from, move.to);
      if (!result.ok) return;
      commit(result.state, 'ai', state);
    }, 420);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, level, mode, screen, state]);

  // Keyboard path: arrows move a cursor, Enter/Space selects, U undoes, H hints.
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
        goHome();
        return;
      }
      if (screen !== 'game' || typing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const onButton = target?.tagName === 'BUTTON';
      if (event.key === 'u' || event.key === 'U') {
        event.preventDefault();
        undo();
        return;
      }
      if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        showHint();
        return;
      }
      const current = cursor ?? 40;
      const row = Math.floor(current / 9);
      const col = current % 9;
      let viewRow = flipped ? 9 - row : row;
      let viewCol = flipped ? 8 - col : col;
      let moved = false;
      if (event.key === 'ArrowUp') {
        viewRow = Math.max(0, viewRow - 1);
        moved = true;
      } else if (event.key === 'ArrowDown') {
        viewRow = Math.min(9, viewRow + 1);
        moved = true;
      } else if (event.key === 'ArrowLeft') {
        viewCol = Math.max(0, viewCol - 1);
        moved = true;
      } else if (event.key === 'ArrowRight') {
        viewCol = Math.min(8, viewCol + 1);
        moved = true;
      }
      if (moved) {
        event.preventDefault();
        const nextRow = flipped ? 9 - viewRow : viewRow;
        const nextCol = flipped ? 8 - viewCol : viewCol;
        const nextIndex = nextRow * 9 + nextCol;
        setCursor(nextIndex);
        const element = document.querySelector<HTMLButtonElement>(
          `.xq-point[data-index="${nextIndex}"]`,
        );
        element?.focus({ preventScroll: true });
        return;
      }
      if ((event.key === 'Enter' || event.key === ' ') && !onButton) {
        event.preventDefault();
        if (cursor === null) setCursor(40);
        else playPoint(cursor);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cursor, flipped, goHome, playPoint, screen, showHint, undo]);

  useEffect(() => {
    if (!autoJoin || autoJoinRef.current) return;
    autoJoinRef.current = true;
    void joinGuest();
  }, [autoJoin, joinGuest]);

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

  useEffect(() => {
    if (!guestView) {
      lastGuestMoveRef.current = -1;
      return;
    }
    const previous = lastGuestMoveRef.current;
    lastGuestMoveRef.current = guestView.moveCount;
    if (previous < 0 || guestView.moveCount <= previous || !soundOn) return;
    chime(guestView.status === 'draw' ? 'draw' : guestView.status === 'won' ? 'win' : 'place');
  }, [guestView, soundOn]);

  const winnerText =
    shownStatus === 'won'
      ? t(lang, shownWinner === 'R' ? 'redWins' : 'blackWins')
      : shownStatus === 'draw'
        ? tr('draw')
        : '';

  const chipSide: Side | null =
    shownStatus === 'won' ? shownWinner : shownStatus === 'draw' ? null : shownTurn;

  let statusHeadline = '';
  let statusDetail = '';
  if (shownStatus === 'won') {
    statusHeadline = winnerText;
    statusDetail = reasonText(lang, shownReason);
  } else if (shownStatus === 'draw') {
    statusHeadline = tr('draw');
    statusDetail = reasonText(lang, shownReason);
  } else if (isGuest) {
    if (!guestStarted) {
      statusHeadline = tr('lanWaitingHost');
    } else if (guestCanPlay) {
      statusHeadline = tr('yourTurn');
      statusDetail = shownCheck ? tr('check') : tr('lanGuestSeat');
    } else {
      statusHeadline = tr('lanWaitingForHost');
      statusDetail = shownCheck ? tr('check') : tr('lanGuestSeat');
    }
  } else if (mode === 'ai') {
    if (state.turn === 'R') {
      statusHeadline = tr('yourTurn');
      statusDetail = shownCheck ? tr('check') : t(lang, level);
    } else {
      statusHeadline = aiThinking ? tr('aiThinking') : tr('aiTurn');
      statusDetail = shownCheck ? tr('check') : t(lang, level);
    }
  } else if (mode === 'local') {
    statusHeadline = t(lang, state.turn === 'R' ? 'redTurn' : 'blackTurn');
    statusDetail = shownCheck
      ? tr('check')
      : state.moves.length === 0
        ? tr('localHint')
        : tr('localTurnHint');
  } else if (mode === 'lan-host') {
    const guestLabel = lanPlayers[1]?.name || tr('lanGuestTag');
    if (!guestOnline) {
      statusHeadline = t(lang, 'lanWaitingForGuest', { name: guestLabel });
      statusDetail = tr('lanGuestLeft');
    } else if (state.turn === 'R') {
      statusHeadline = tr('yourTurn');
      statusDetail = shownCheck ? tr('check') : tr('lanHostSeat');
    } else {
      statusHeadline = t(lang, 'lanWaitingForGuest', { name: guestLabel });
      statusDetail = shownCheck ? tr('check') : tr('lanHostSeat');
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
      ? tr(LEVEL_HINT[level])
      : mode === 'local'
        ? tr('localTurnHint')
        : mode === 'lan-host'
          ? guestOnline
            ? tr('lanReady')
            : tr('lanHostWaitingGuest')
          : guestCanPlay
            ? tr('yourTurn')
            : guestStarted
              ? tr('lanWaitingForHost')
              : tr('lanWaitingHost');

  const resultLabel = (winner: 'R' | 'B' | 'draw') =>
    winner === 'R' ? tr('winsRed') : winner === 'B' ? tr('winsBlack') : tr('draw');
  const share = (count: number) => (record.games > 0 ? `${Math.round((count / record.games) * 100)}%` : '0%');
  const gameWord = (count: number) => t(lang, count === 1 ? 'gameOne' : 'games');
  const drawWord = (count: number) => t(lang, count === 1 ? 'drawOne' : 'draws');
  const shareRed = share(record.winsRed);
  const shareBlack = share(record.winsBlack);
  const shareDraw = share(record.draws);
  const lastResultLabel = record.lastWinner ? resultLabel(record.lastWinner) : tr('none');
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
          <Board board={HERO_BOARD} lang={lang} disabled onPoint={() => undefined} />
        </div>
        <div className="hero-copy">
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
            <span>{record.winsRed} {tr('sideRed')}</span>
            <span className="dot">·</span>
            <span>{record.winsBlack} {tr('sideBlack')}</span>
            <span className="dot">·</span>
            <span>{record.draws} {drawWord(record.draws)}</span>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
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
            <span className={`turn-chip ${chipSide ? chipSide.toLowerCase() : 'draw'}`}>
              {chipSide ? <SideGlyph side={chipSide} lang={lang} /> : <span className="draw-glyph">=</span>}
            </span>
            <div className="turn-copy">
              <strong>{statusHeadline}</strong>
              <p>{statusDetail}</p>
            </div>
            {aiThinking && <span className="thinking" aria-hidden="true">…</span>}
          </div>

          {isLan && lanError && <p className="error game-error" role="alert">{lanError}</p>}

          <Board
            board={board}
            flipped={flipped}
            selected={selected}
            targets={selectedTargets}
            last={last}
            hint={hint}
            checkSquare={shownCheck ? generalIndex(board, shownTurn) : null}
            cursor={cursor}
            disabled={disabled}
            onPoint={playPoint}
            lang={lang}
          />

          {shownStatus !== 'playing' && (
            <div className="result-banner" role="status">
              <div className="result-copy">
                <span className="result-kicker">{tr('gameOver')}</span>
                <strong>{winnerText}</strong>
                <small>{reasonText(lang, shownReason)}</small>
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
                disabled={
                  state.status !== 'playing' ||
                  isLan ||
                  (mode === 'ai' && state.turn !== 'R')
                }
              >
                {tr('hint')}
              </button>
            </div>
            {isLan && <p className="side-note">{tr('localOnly')}</p>}
            {!isLan && <p className="side-note">{tr('keyboardHint')}</p>}
            <button className="text-button flip-button" onClick={() => setFlipped((value) => !value)}>
              {tr('flip')}
            </button>
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
            <p>
              {record.games} {gameWord(record.games)} · {record.winsRed}/{record.winsBlack}/{record.draws}
            </p>
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
            <p className="eyebrow">{tr('eyebrow')}</p>
            <h2 className="screen-title">{tr('lanTitle')}</h2>
          </header>
          <div className="lan-choice">
            <section className="lan-choice-card host-card">
              <div className="choice-head">
                <span className="tag">{tr('lanHostTag')}</span>
                <span className="choice-icon" aria-hidden="true">⌂</span>
              </div>
              <h3>{tr('lanHost')}</h3>
              <p>{tr('lanHostLede')}</p>
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
              <p>{tr('lanJoinLede')}</p>
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
                      <span className="peer-mark">
                        <SideGlyph side={player.seat === 0 ? 'R' : 'B'} lang={lang} />
                      </span>
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
                {lang === 'en' ? (
                  <a className="invite-link" href={lanInvite} target="_blank" rel="noreferrer">
                    {readableInvite(lanInvite)}
                  </a>
                ) : null}
                <p className="qr-address">
                  {tr('lanOpenAddress')}
                  <br />
                  <code>{readableAddress(lanInfo.urls[0] ?? '')}</code>
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
                <SideGlyph side="B" lang={lang} />
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
        <p className="eyebrow">{tr('eyebrow')}</p>
        <h2 className="screen-title">{tr('recordTitle')}</h2>
      </header>

      {record.games === 0 ? (
        <section className="empty-card">
          <span className="empty-mark" aria-hidden="true">
            <span className="empty-piece"><SideGlyph side="R" lang={lang} /></span>
            <span className="empty-piece"><SideGlyph side="B" lang={lang} /></span>
          </span>
          <p>{tr('recordEmpty')}</p>
          <button className="primary" onClick={startAi}>{tr('playAi')}</button>
        </section>
      ) : (
        <>
          <section className="stats-top">
            <div className="stat-card total">
              <span>{tr('games')}</span>
              <strong>{record.games}</strong>
            </div>
            <div className="stat-card red">
              <span>{tr('winsRed')}</span>
              <strong>{record.winsRed}</strong>
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
                <span className="share-red" style={{ width: shareRed }} />
                <span className="share-black" style={{ width: shareBlack }} />
                <span className="share-draw" style={{ width: shareDraw }} />
              </div>
              <ul className="share-legend">
                <li><i className="legend-red" />{tr('winsRed')} <strong>{record.winsRed}</strong></li>
                <li><i className="legend-black" />{tr('winsBlack')} <strong>{record.winsBlack}</strong></li>
                <li><i className="legend-draw" />{tr('draws')} <strong>{record.draws}</strong></li>
              </ul>
              <div className="streak-row">
                <div><span>{tr('sameWinnerRun')}</span><strong>{record.streak}</strong></div>
                <div><span>{tr('bestRun')}</span><strong>{record.bestStreak}</strong></div>
                <div><span>{tr('lastResult')}</span><strong>{lastResultLabel}</strong></div>
              </div>
            </div>

            <div className="record-card modes-card">
              <h3>{tr('byMode')}</h3>
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
                    <span className={`recent-mark ${entry.winner === 'draw' ? 'draw' : entry.winner.toLowerCase()}`}>
                      {entry.winner === 'draw' ? '=' : <SideGlyph side={entry.winner} lang={lang} />}
                    </span>
                    <div className="recent-main">
                      <strong>{resultLabel(entry.winner)}</strong>
                      <span>
                        {modeLabelFor(entry.mode)}
                        {entry.level ? ` · ${t(lang, entry.level)}` : ''}
                      </span>
                    </div>
                    <span className="recent-moves">{t(lang, 'moves', { n: entry.moves })}</span>
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
      </ol>
      <div className="rules-extra">
        <p><strong>{tr('lanTitle')}</strong><br />{tr('lanStartHint')}</p>
        <p><strong>{tr('stats')}</strong><br />{tr('clearNote')}</p>
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
