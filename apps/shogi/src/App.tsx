import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseMove, type AiLevel } from './ai/ai';
import { hintFor, type Hint, type HintKind } from './ai/hint';
import { Board, HandTray, PromotionDialog } from './components/Board';
import {
  apply,
  applySeat,
  legalMoves,
  makeMoveUnchecked,
  sameMove,
  setup,
  stateFromView,
  view,
  type GameState,
  type HandType,
  type Move,
  type SeatView,
  type Side,
} from './game/shogi';
import {
  detectLang,
  formatMove,
  pieceName,
  t,
  type Lang,
  type MessageKey,
} from './i18n';
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

const HINT_KEYS: Record<HintKind, MessageKey> = {
  mate: 'hintMate',
  capture: 'hintCapture',
  promote: 'hintPromote',
  drop: 'hintDrop',
  defend: 'hintDefend',
  develop: 'hintDevelop',
};

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

function sideName(lang: Lang, side: Side): string {
  return t(lang, side === 'b' ? 'black' : 'white');
}

function hintText(lang: Lang, hint: Hint, board: GameState['board']): string {
  const move = formatMove(hint.move, board, lang);
  const params: Record<string, string> = { move };
  if (hint.kind === 'capture' && hint.captured) {
    params.piece = pieceName(lang, hint.captured, false, true);
  } else if (hint.kind === 'promote' || hint.kind === 'drop') {
    params.piece = hint.piece ? pieceName(lang, hint.piece, false, true) : '';
  }
  return t(lang, HINT_KEYS[hint.kind], params);
}

function resultReasonKey(state: GameState): MessageKey {
  if (state.endReason === 'checkmate') return 'resultCheckmate';
  if (state.endReason === 'repetition') return 'resultRepetition';
  return 'resultNoMoves';
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (invite ? 'lan-guest' : 'ai'));
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup('b'));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [dropType, setDropType] = useState<HandType | null>(null);
  const [promotion, setPromotion] = useState<{ options: Move[] } | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.shogi.sound') !== 'off';
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
      return localStorage.getItem('familyarcade.shogi.hostName') ?? '';
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
  const guestJoinSeqRef = useRef(0);
  const hostCreateSeqRef = useRef(0);
  const lastGuestMoveRef = useRef(-1);

  const tr = useCallback((key: MessageKey) => t(lang, key), [lang]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? '将棋 · 家庭街机' : 'Shogi · Family Arcade';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.shogi.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.shogi.hostName', hostName);
    } catch {
      /* ignore */
    }
  }, [hostName]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
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
      setDropType(null);
      setPromotion(null);
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
    const next = setup('b');
    stateRef.current = next;
    setMode(nextMode);
    setState(next);
    setHistory([]);
    setSelected(null);
    setDropType(null);
    setPromotion(null);
    setHint(null);
    setRecorded(false);
    setAiThinking(false);
    setCursor(null);
    setKeyboardMode(false);
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
    setDropType(null);
    setPromotion(null);
    setHint(null);
    setAiThinking(false);
    setRecorded(saved.state.status !== 'playing');
    setCursor(null);
    setKeyboardMode(false);
    setScreen('game');
  }, [saved]);

  const resetBoardUi = useCallback(() => {
    setSelected(null);
    setDropType(null);
    setPromotion(null);
    setHint(null);
  }, []);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    if (mode === 'lan-host' || mode === 'lan-guest') return;
    if (state.status !== 'playing') return;

    let previous: GameState;
    let nextHistory: GameState[];

    if (mode === 'ai') {
      let index = history.length - 1;
      while (index >= 0 && !(history[index].status === 'playing' && history[index].turn === 'b')) {
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
    resetBoardUi();
    setRecorded(false);
    setSaved(saveGame({ state: previous, mode, level }));
  }, [history, level, mode, resetBoardUi, state.status]);

  const showHint = useCallback(() => {
    if (state.status !== 'playing' || mode === 'lan-host' || mode === 'lan-guest') return;
    const next = hintFor(state);
    if (!next) {
      setToast(tr('hintNoMove'));
      return;
    }
    setHint(next);
    setSelected(null);
    setDropType(null);
    setPromotion(null);
    setToast(hintText(lang, next, state.board));
  }, [lang, mode, state, tr]);

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
    resetBoardUi();
    setScreen('home');
  }, [closeLan, resetBoardUi]);

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
        const value = intent as { type?: string; move?: Move; moveCount?: number } | null;
        if (!value || value.type !== 'move' || !value.move) return;
        const current = stateRef.current;
        if (typeof value.moveCount === 'number' && value.moveCount !== current.moves.length) return;
        const result = applySeat(current, seat, value.move);
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
    const next = setup('b');
    stateRef.current = next;
    setState(next);
    setHistory([]);
    resetBoardUi();
    setRecorded(false);
    setLanError('');
    setMode('lan-host');
    setScreen('game');
    hostStartedRef.current = true;
    host.start();
    host.sendLobby();
    host.sendView(1, view(next, 1));
  }, [lanPlayers, resetBoardUi]);

  const restartGame = useCallback(() => {
    if (mode === 'lan-guest') return;
    if (mode === 'lan-host') {
      const host = hostRef.current;
      if (!host) return;
      const next = setup('b');
      stateRef.current = next;
      setState(next);
      setHistory([]);
      resetBoardUi();
      setRecorded(false);
      setLanError('');
      hostStartedRef.current = true;
      host.start();
      host.sendLobby();
      host.sendView(1, view(next, 1));
      return;
    }
    startLocal(mode === 'ai' ? 'ai' : 'local');
  }, [mode, resetBoardUi, startLocal]);

  const playMove = useCallback(
    (move: Move) => {
      if (screen !== 'game') return;

      if (mode === 'lan-guest') {
        if (!guestStarted || !guestView?.canMove) return;
        if (!legalMoves(stateFromView(guestView)).some((candidate) => sameMove(candidate, move))) {
          return;
        }
        guest?.sendIntent({ type: 'move', move, moveCount: guestView.moveCount });
        resetBoardUi();
        return;
      }

      if (mode === 'ai' && (state.turn !== 'b' || aiThinking)) return;
      if (mode === 'lan-host' && (!lanPlayers[1]?.connected || !lanHost || lanHost.status !== 'open')) {
        return;
      }
      const result = mode === 'lan-host' ? applySeat(state, 0, move) : apply(state, move);
      if (!result.ok) return;
      commit(result.state, mode, state);
    },
    [aiThinking, commit, guest, guestStarted, guestView, lanHost, lanPlayers, mode, resetBoardUi, screen, state],
  );

  const handleCell = useCallback(
    (index: number, fromKeyboard = false) => {
      if (screen !== 'game') return;
      const engineState = guestView ? stateFromView(guestView) : state;
      if (engineState.status !== 'playing') return;
      if (mode === 'ai' && (engineState.turn !== 'b' || aiThinking)) return;
      if (mode === 'lan-guest' && (!guestStarted || !guestView?.canMove)) return;
      if (mode === 'lan-host' && (!lanPlayers[1]?.connected || engineState.turn !== 'b')) return;
      setCursor(index);
      if (!fromKeyboard) setKeyboardMode(false);

      const mover = engineState.turn;
      const square = engineState.board[index];
      const legal = legalMoves(engineState);

      if (dropType) {
        const options = legal.filter(
          (move) => move.kind === 'drop' && move.type === dropType && move.to === index,
        );
        if (options.length > 0) {
          playMove(options[0]);
          return;
        }
        if (square && square.side === mover) {
          setDropType(null);
          setSelected(index);
        } else {
          setDropType(null);
        }
        return;
      }

      if (selected !== null) {
        if (selected === index) {
          setSelected(null);
          return;
        }
        const options = legal.filter(
          (move) => move.kind === 'move' && move.from === selected && move.to === index,
        );
        if (options.length > 0) {
          if (options.length > 1) setPromotion({ options });
          else playMove(options[0]);
          return;
        }
        if (square && square.side === mover) {
          setSelected(index);
          setHint(null);
          setDropType(null);
          return;
        }
        setSelected(null);
        return;
      }

      if (square && square.side === mover) {
        setSelected(index);
        setHint(null);
        setDropType(null);
      } else {
        setSelected(null);
      }
    },
    [aiThinking, dropType, guestStarted, guestView, lanPlayers, mode, playMove, screen, selected, state],
  );

  const pickHand = useCallback(
    (type: HandType) => {
      if (screen !== 'game') return;
      const engineState = guestView ? stateFromView(guestView) : state;
      if (engineState.status !== 'playing') return;
      if (mode === 'ai' && (engineState.turn !== 'b' || aiThinking)) return;
      if (mode === 'lan-guest' && (!guestStarted || !guestView?.canMove)) return;
      if (mode === 'lan-host' && (!lanPlayers[1]?.connected || engineState.turn !== 'b')) return;
      if (engineState.hands[engineState.turn][type] <= 0) return;
      setKeyboardMode(false);
      setSelected(null);
      setHint(null);
      setPromotion(null);
      setDropType((current) => (current === type ? null : type));
    },
    [aiThinking, guestStarted, guestView, lanPlayers, mode, screen, state],
  );

  const confirmPromotion = useCallback(
    (promote: boolean) => {
      if (!promotion) return;
      const move =
        promotion.options.find((candidate) => candidate.kind === 'move' && candidate.promote === promote) ??
        promotion.options[0];
      setPromotion(null);
      if (move) playMove(move);
    },
    [playMove, promotion],
  );

  const joinGuest = useCallback(async () => {
    if (guestConnecting || guest) return;
    const name = guestName.trim();
    const code = guestCode.trim();
    if (!name) {
      setLanError(t(lang, 'lanNameNeeded'));
      return;
    }
    if (!/^\d{4}$/.test(code)) {
      setLanError(t(lang, 'lanCodeNeeded'));
      return;
    }
    const room = guestRoom || code;
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
      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        const next = payload as SeatView;
        if (!next || !Array.isArray(next.board) || next.board.length !== 81) return;
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

  // AI reply. White is the computer in solo play.
  useEffect(() => {
    if (screen !== 'game' || mode !== 'ai' || state.status !== 'playing' || state.turn !== 'w') {
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
    }, 420);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, level, mode, screen, state]);

  // Keyboard path: arrows move a cursor, Enter selects, Escape backs out.
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
        if (screen === 'game' && (selected !== null || dropType !== null || promotion !== null)) {
          resetBoardUi();
          return;
        }
        goHome();
        return;
      }
      if (screen !== 'game' || typing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const arrow = event.key;
      if (arrow === 'ArrowUp' || arrow === 'ArrowDown' || arrow === 'ArrowLeft' || arrow === 'ArrowRight') {
        event.preventDefault();
        const current = keyboardMode ? (cursor ?? 40) : 40;
        const row = Math.floor(current / 9);
        const col = current % 9;
        const nextRow = arrow === 'ArrowUp' ? Math.max(0, row - 1) : arrow === 'ArrowDown' ? Math.min(8, row + 1) : row;
        const nextCol = arrow === 'ArrowLeft' ? Math.max(0, col - 1) : arrow === 'ArrowRight' ? Math.min(8, col + 1) : col;
        setKeyboardMode(true);
        setCursor(nextRow * 9 + nextCol);
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        if (target?.tagName === 'BUTTON' && !keyboardMode) return;
        event.preventDefault();
        handleCell(keyboardMode ? (cursor ?? 40) : 40, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cursor, dropType, goHome, handleCell, keyboardMode, promotion, resetBoardUi, screen, selected]);

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

  // The guest hears the host's board update. Skip the first view on join.
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

  const engineState = useMemo(
    () => (guestView ? stateFromView(guestView) : state),
    [guestView, state],
  );
  const shownStatus = engineState.status;
  const shownTurn = engineState.turn;
  const shownWinner = engineState.winner;
  const shownSide = shownStatus === 'won' ? shownWinner : shownTurn;
  const shownCheck = engineState.check;
  const isGuest = mode === 'lan-guest';
  const isLan = mode === 'lan-host' || mode === 'lan-guest';
  const guestCanPlay = Boolean(guestView?.canMove) && guestStarted;
  const guestOnline = Boolean(lanPlayers[1]?.connected);
  const hostOnline = mode !== 'lan-host' || lanHost?.status === 'open';
  const hostCanPlay = mode === 'lan-host' ? guestOnline && hostOnline && shownTurn === 'b' : true;
  const canInteract =
    screen === 'game' &&
    shownStatus === 'playing' &&
    (mode === 'ai' ? shownTurn === 'b' && !aiThinking : true) &&
    (mode === 'lan-host' ? hostCanPlay : true) &&
    (isGuest ? guestCanPlay : true);
  const disabled = !canInteract;
  const hintDropType = hint && hint.move.kind === 'drop' ? hint.move.type : null;

  const legal = useMemo(
    () => (shownStatus === 'playing' && screen === 'game' ? legalMoves(engineState) : []),
    [engineState, screen, shownStatus],
  );

  const heroState = useMemo(() => {
    let position = setup('b');
    const opening: Move[] = [
      { kind: 'move', from: 58, to: 49, promote: false },
      { kind: 'move', from: 22, to: 31, promote: false },
    ];
    for (const move of opening) {
      const result = apply(position, move);
      if (result.ok) position = result.state;
    }
    return position;
  }, []);

  const moveLog = useMemo(() => {
    let position = setup('b');
    const entries: { text: string; side: Side; index: number }[] = [];
    for (const move of engineState.moves) {
      const side = position.turn;
      const hasSource = move.kind === 'drop' || Boolean(position.board[move.from]);
      entries.push({
        text: formatMove(move, position.board, lang),
        side,
        index: entries.length + 1,
      });
      if (!hasSource) break;
      try {
        position = makeMoveUnchecked(position, move);
      } catch {
        break;
      }
    }
    return entries;
  }, [engineState.moves, lang]);

  const lastMove = engineState.lastMove;
  const winnerText =
    shownStatus === 'won'
      ? t(lang, shownWinner === 'b' ? 'blackWins' : 'whiteWins')
      : shownStatus === 'draw'
        ? tr('draw')
        : '';
  const modeLabel =
    mode === 'ai'
      ? t(lang, level)
      : mode === 'local'
        ? tr('playLocal')
        : mode === 'lan-host'
          ? tr('lanHostMode')
          : tr('lanGuestMode');

  let statusHeadline = t(lang, shownTurn === 'b' ? 'turnBlack' : 'turnWhite');
  let statusDetail = '';
  if (shownStatus === 'won') {
    statusHeadline = winnerText;
    statusDetail = tr(resultReasonKey(engineState));
  } else if (shownStatus === 'draw') {
    statusHeadline = tr('draw');
    statusDetail = tr(resultReasonKey(engineState));
  } else if (isGuest) {
    statusHeadline = guestStarted
      ? guestCanPlay
        ? tr('yourTurn')
        : tr('lanWaitingForHost')
      : tr('lanWaitingForHost');
    statusDetail = tr('lanGuestSeat');
  } else if (mode === 'ai') {
    statusHeadline =
      shownTurn === 'b' ? tr('yourTurn') : aiThinking ? tr('aiThinking') : tr('aiTurn');
    statusDetail = t(lang, level);
  } else if (mode === 'local') {
    statusHeadline = t(lang, shownTurn === 'b' ? 'turnBlack' : 'turnWhite');
    statusDetail = engineState.moves.length === 0 ? tr('localHint') : tr('localTurnHint');
  } else if (mode === 'lan-host') {
    const guestLabel = lanPlayers[1]?.name || tr('lanGuestTag');
    if (!guestOnline) {
      statusHeadline = t(lang, 'lanWaitingForGuest', { name: guestLabel });
      statusDetail = tr('lanGuestLeft');
    } else if (shownTurn === 'b') {
      statusHeadline = tr('yourTurn');
      statusDetail = tr('lanHostSeat');
    } else {
      statusHeadline = t(lang, 'lanWaitingForGuest', { name: guestLabel });
      statusDetail = tr('lanHostSeat');
    }
  }

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
            : tr('lanWaiting')
          : guestCanPlay
            ? tr('yourTurn')
            : guestStarted
              ? tr('lanWaitingForHost')
              : tr('lanWaitingForHost');

  const share = (value: number) => (record.games > 0 ? `${Math.round((value / record.games) * 100)}%` : '0%');
  const shareB = share(record.winsBlack);
  const shareW = share(record.winsWhite);
  const shareD = share(record.draws);
  const winnerLabel = (winner: 'b' | 'w' | 'draw') =>
    winner === 'b' ? tr('blackWins') : winner === 'w' ? tr('whiteWins') : tr('draw');
  const lastResultLabel = record.lastWinner ? winnerLabel(record.lastWinner) : tr('none');
  const modeLabelFor = (value: RecordMode) =>
    value === 'ai' ? tr('modeAi') : value === 'local' ? tr('modeLocal') : tr('modeLan');
  const guestHostName = guestPlayers.find((player) => player.host)?.name;
  const checkVisible = shownStatus === 'playing' && shownCheck;

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('brand')}</p>
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
            board={heroState.board}
            legal={[]}
            selected={null}
            dropType={null}
            hint={null}
            lastMove={heroState.lastMove}
            checkSide={null}
            disabled
            onCell={() => undefined}
            lang={lang}
            compact
          />
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>{saved.mode === 'ai' ? t(lang, saved.level) : tr('playLocal')}</small>
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
                {tr('record')} →
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('stats')}</span>
            <strong>{record.games}</strong>
            <span>{tr('games')}</span>
            <span className="dot">·</span>
            <span>{record.winsBlack} {tr('black')}</span>
            <span className="dot">·</span>
            <span>{record.winsWhite} {tr('white')}</span>
            <span className="dot">·</span>
            <span>{record.draws} {tr('draws')}</span>
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
            <span className={`side-chip ${shownSide ?? 'draw'}`}>
              {shownSide === 'b'
                ? lang === 'zh'
                  ? '先'
                  : 'B'
                : shownSide === 'w'
                  ? lang === 'zh'
                    ? '後'
                    : 'W'
                  : '='}
            </span>
            <div className="turn-copy">
              <strong>{statusHeadline}</strong>
              <p>{statusDetail}</p>
            </div>
            {checkVisible && <span className="check-pill">{tr('check')}</span>}
            {aiThinking && <span className="thinking" aria-hidden="true">…</span>}
          </div>

          {isLan && lanError && <p className="error game-error" role="alert">{lanError}</p>}

          <HandTray
            hand={engineState.hands.w}
            side="w"
            active={canInteract && shownTurn === 'w'}
            selectedType={dropType}
            hintType={hintDropType && shownTurn === 'w' ? hintDropType : null}
            onPick={pickHand}
            lang={lang}
          />

          <div className="board-stack">
            <Board
              board={engineState.board}
              legal={legal}
              selected={selected}
              dropType={dropType}
              hint={hint?.move ?? null}
              lastMove={lastMove}
              checkSide={shownCheck ? shownTurn : null}
              cursor={keyboardMode ? cursor : null}
              disabled={disabled}
              onCell={handleCell}
              lang={lang}
            />
            {promotion && (
              <PromotionDialog
                lang={lang}
                onPromote={() => confirmPromotion(true)}
                onKeep={() => confirmPromotion(false)}
                onCancel={() => setPromotion(null)}
              />
            )}
          </div>

          <HandTray
            hand={engineState.hands.b}
            side="b"
            active={canInteract && shownTurn === 'b'}
            selectedType={dropType}
            hintType={hintDropType && shownTurn === 'b' ? hintDropType : null}
            onPick={pickHand}
            lang={lang}
          />

          {shownStatus !== 'playing' && (
            <div className="result-banner" role="status">
              <div className="result-copy">
                <span className="result-kicker">{tr('gameOver')}</span>
                <strong>{winnerText}</strong>
                <small>{tr(resultReasonKey(engineState))}</small>
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
            {isLan ? <p className="side-note">{tr('localOnly')}</p> : <p className="side-note">{tr('keyboardHint')}</p>}
          </div>

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanCode')}</h3>
                <span className={`status-dot ${guestOnline ? 'online' : ''}`} />
              </div>
              <div className="room-code">{lanCode || '—'}</div>
              <p>{guestOnline ? tr('lanReady') : tr('lanWaiting')}</p>
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
                    : tr('lanWaitingForHost')}
              </p>
              <p className="peer">{t(lang, 'lanRoom', { code: guestRoom || guestCode })}</p>
              {guestHostName && <p className="peer">{tr('lanHostTag')} · {guestHostName}</p>}
            </div>
          )}

          <div className="side-card move-card">
            <h3>{tr('moveRecord')}</h3>
            {moveLog.length === 0 ? (
              <p>{tr('recordEmpty')}</p>
            ) : (
              <ol className="move-log">
                {moveLog.slice(-10).map((entry) => (
                  <li key={`${entry.index}-${entry.text}`}>
                    <span className="move-no">{entry.index}</span>
                    <span className={`move-side ${entry.side}`}>{sideName(lang, entry.side)}</span>
                    <span className="move-text">{entry.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="side-card record-mini">
            <h3>{tr('stats')}</h3>
            <p>{record.games} {tr('games')} · {record.winsBlack}/{record.winsWhite}/{record.draws}</p>
            <p className="record-mini-note">{tr('recordMiniNote')}</p>
            {!isLan && (
              <button className="text-button" onClick={() => setScreen('stats')}>
                {tr('record')} →
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
            <p className="eyebrow">{tr('brand')}</p>
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
                <p className="lan-help">{tr('lanStartHint')}</p>
                <div className="peer-list">
                  {lanPlayers.map((player) => (
                    <span key={player.seat} className={`peer-chip ${player.connected ? 'online' : ''}`}>
                      <span className="peer-mark">{player.seat === 0 ? (lang === 'zh' ? '先' : 'B') : lang === 'zh' ? '後' : 'W'}</span>
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
                <a className="invite-link" href={lanInvite} target="_blank" rel="noreferrer">
                  {readableInvite(lanInvite)}
                </a>
                <p className="qr-address">
                  {tr('lanOpenAddress')}
                  <br />
                  <code>{lanInfo.urls[0] ?? ''}</code>
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
                <span className="orbit-piece">{lang === 'zh' ? '玉' : 'K'}</span>
              </div>
              <h3>{tr('lanGuestTitle')}</h3>
              <p>{tr('lanWaitingForHost')}</p>
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
        <p className="eyebrow">{tr('brand')} · {tr('record')}</p>
        <h2 className="screen-title">{tr('recordTitle')}</h2>
      </header>

      {record.games === 0 ? (
        <section className="empty-card">
          <span className="empty-mark" aria-hidden="true">{lang === 'zh' ? '玉 飛 角' : 'K R B'}</span>
          <p>{tr('recordEmptyText')}</p>
          <button className="primary" onClick={startAi}>{tr('playAi')}</button>
        </section>
      ) : (
        <>
          <section className="stats-top">
            <div className="stat-card total">
              <span>{tr('games')}</span>
              <strong>{record.games}</strong>
            </div>
            <div className="stat-card black">
              <span>{tr('black')}</span>
              <strong>{record.winsBlack}</strong>
            </div>
            <div className="stat-card white">
              <span>{tr('white')}</span>
              <strong>{record.winsWhite}</strong>
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
                <span className="share-black" style={{ width: shareB }} />
                <span className="share-white" style={{ width: shareW }} />
                <span className="share-d" style={{ width: shareD }} />
              </div>
              <ul className="share-legend">
                <li><i className="legend-black" />{tr('blackWins')} <strong>{record.winsBlack}</strong></li>
                <li><i className="legend-white" />{tr('whiteWins')} <strong>{record.winsWhite}</strong></li>
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
                    <span className={`recent-mark ${entry.winner === 'draw' ? 'draw' : entry.winner}`}>
                      {entry.winner === 'draw'
                        ? '='
                        : entry.winner === 'b'
                          ? lang === 'zh'
                            ? '先'
                            : 'B'
                          : lang === 'zh'
                            ? '後'
                            : 'W'}
                    </span>
                    <div className="recent-main">
                      <strong>{winnerLabel(entry.winner)}</strong>
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
