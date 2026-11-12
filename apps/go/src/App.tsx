import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseMoveDetailed, hint as findHint, type AiLevel, type HintReason } from './ai/ai';
import { Board, StoneGlyph } from './components/Board';
import {
  BOARD_SIZES,
  DEFAULT_KOMI,
  DEFAULT_SIZE,
  KOMI_OPTIONS,
  apply,
  applySeat,
  centerIndex,
  emptyBoard,
  parsePoint,
  pass,
  passSeat,
  scoreBoard,
  setup,
  territoryOwner,
  view,
  type BoardSize,
  type Cell,
  type Color,
  type GameState,
  type Komi,
  type SeatView,
} from './game/go';
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
  undoResult,
  type FamilyRecord,
  type RecordMode,
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'record' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type LanRole = 'hub' | 'host' | 'guest';

const AI_LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const HINT_KEYS: Record<HintReason, MessageKey> = {
  capture: 'hintCapture',
  save: 'hintSave',
  atari: 'hintAtari',
  territory: 'hintTerritory',
  influence: 'hintInfluence',
  opening: 'hintOpening',
  pass: 'hintPass',
  solid: 'hintSolid',
};

const HERO_BOARD: Cell[] = (() => {
  const board = emptyBoard(19);
  const stones: [string, Color][] = [
    ['D4', 'B'],
    ['Q16', 'B'],
    ['D16', 'B'],
    ['Q4', 'B'],
    ['K10', 'B'],
    ['F3', 'B'],
    ['O17', 'B'],
    ['C6', 'B'],
    ['R14', 'B'],
    ['R15', 'W'],
    ['C5', 'W'],
    ['R5', 'W'],
    ['C15', 'W'],
    ['K5', 'W'],
    ['F17', 'W'],
    ['O3', 'W'],
    ['D10', 'W'],
    ['P10', 'W'],
    ['F5', 'B'],
    ['O15', 'B'],
    ['H8', 'W'],
    ['L12', 'W'],
  ];
  for (const [name, color] of stones) {
    const index = parsePoint(19, name);
    if (index >= 0) board[index] = color;
  }
  return board;
})();

const DEMO_BOARD: Cell[] = (() => {
  const board = emptyBoard(9);
  const stones: [string, Color][] = [
    ['A1', 'B'],
    ['B1', 'B'],
    ['C1', 'B'],
    ['A2', 'B'],
    ['C2', 'B'],
    ['A3', 'B'],
    ['B3', 'B'],
    ['C3', 'B'],
    ['J1', 'W'],
    ['H1', 'W'],
    ['G1', 'W'],
    ['J2', 'W'],
    ['G2', 'W'],
    ['J3', 'W'],
    ['H3', 'W'],
    ['G3', 'W'],
    ['E5', 'B'],
    ['F5', 'W'],
    ['D5', 'B'],
    ['E4', 'W'],
    ['F4', 'B'],
    ['D4', 'W'],
  ];
  for (const [name, color] of stones) {
    const index = parsePoint(9, name);
    if (index >= 0) board[index] = color;
  }
  return board;
})();

const DEMO_SCORE = scoreBoard(DEMO_BOARD, 9, 7.5);

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const counterpart = (color: Color): Color => (color === 'B' ? 'W' : 'B');

function recordModeFor(mode: Mode): RecordMode {
  if (mode === 'ai') return 'ai';
  if (mode === 'local') return 'local';
  return 'lan';
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

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (invite ? 'lan-guest' : 'ai'));
  const [boardSize, setBoardSize] = useState<BoardSize>(DEFAULT_SIZE);
  const [komi, setKomi] = useState<Komi>(DEFAULT_KOMI);
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() =>
    setup({ size: DEFAULT_SIZE, komi: DEFAULT_KOMI }),
  );
  const [history, setHistory] = useState<GameState[]>([]);
  const historyRef = useRef<GameState[]>([]);
  const [cursor, setCursor] = useState(centerIndex(DEFAULT_SIZE));
  const [hintPoint, setHintPoint] = useState<number | null>(null);
  const [hintReason, setHintReason] = useState<HintReason | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.go.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const recordedRef = useRef(false);
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
      return localStorage.getItem('familyarcade.go.hostName') ?? '';
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

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? '家庭街机 · 围棋' : 'Family Arcade · Go';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.go.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.go.hostName', hostName);
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
    if (screen !== 'record') setClearArmed(false);
  }, [screen]);

  const finish = useCallback(
    (next: GameState, currentMode: Mode) => {
      if (next.status !== 'finished' || recordedRef.current) return;
      recordedRef.current = true;
      if (currentMode !== 'lan-guest') {
        setRecord(
          recordResult(next, {
            mode: recordModeFor(currentMode),
            ...(currentMode === 'ai' ? { level } : {}),
          }),
        );
      }
      clearSave();
      setSaved(null);
      if (soundOn) chime('win');
    },
    [level, soundOn],
  );

  const commit = useCallback(
    (next: GameState, currentMode: Mode, previous: GameState) => {
      const nextHistory = [...historyRef.current, previous];
      historyRef.current = nextHistory;
      setHistory(nextHistory);
      stateRef.current = next;
      setState(next);
      setHintPoint(null);
      setHintReason(null);
      if (soundOn && next.status === 'playing') {
        const last = next.moves[next.moves.length - 1];
        const before = previous.captures.B + previous.captures.W;
        const after = next.captures.B + next.captures.W;
        chime(last?.type === 'pass' ? 'pass' : after > before ? 'capture' : 'place');
      }
      finish(next, currentMode);
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.status === 'playing') {
          setSaved(
            saveGame({
              state: next,
              history: nextHistory,
              mode: currentMode,
              level,
            }),
          );
        } else {
          clearSave();
          setSaved(null);
        }
      }
      if (currentMode === 'lan-host' && hostRef.current) {
        hostRef.current.sendView(1, view(next, 1));
        if (next.status === 'finished') hostRef.current.sendResult(view(next, 1));
      }
    },
    [finish, level, soundOn],
  );

  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  const beginGame = useCallback(
    (nextMode: 'ai' | 'local', size: BoardSize = boardSize, nextKomi: Komi = komi) => {
      const next = setup({ size, komi: nextKomi });
      setBoardSize(size);
      setKomi(nextKomi);
      setMode(nextMode);
      setState(next);
      stateRef.current = next;
      historyRef.current = [];
      setHistory([]);
      setCursor(centerIndex(size));
      setHintPoint(null);
      setHintReason(null);
      recordedRef.current = false;
      setScreen('game');
      clearSave();
      setSaved(null);
    },
    [boardSize, komi],
  );

  const startAi = useCallback(() => {
    setMode('ai');
    setScreen('setup');
  }, []);

  const startLocal = useCallback(() => {
    setMode('local');
    setScreen('setup');
  }, []);

  const resume = useCallback(() => {
    if (!saved) return;
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    stateRef.current = saved.state;
    historyRef.current = saved.history;
    setHistory(saved.history);
    setBoardSize(saved.state.size);
    setKomi(saved.state.komi);
    setCursor(saved.state.lastMove ?? centerIndex(saved.state.size));
    setHintPoint(null);
    setHintReason(null);
    recordedRef.current = false;
    setSaved(null);
    setScreen('game');
  }, [saved]);

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

  const playAt = useCallback(
    (index: number) => {
      setCursor(index);
      if (screen !== 'game') return;
      const shownStatus = mode === 'lan-guest' ? guestView?.status ?? state.status : state.status;
      if (shownStatus !== 'playing') return;

      if (mode === 'lan-guest') {
        if (guestStarted && guestView?.canMove && guestView.board[index] === null) {
          guest?.sendIntent({ type: 'place', index, moveCount: guestView.moveCount });
        }
        return;
      }
      if (mode === 'ai' && (state.turn !== 'B' || aiThinking)) return;
      if (mode === 'lan-host') {
        if (!lanPlayers[1]?.connected || !lanHost || lanHost.status !== 'open' || state.turn !== 'B') {
          return;
        }
      }
      const result = mode === 'lan-host' ? applySeat(state, 0, index) : apply(state, index);
      if (!result.ok) {
        if (result.error === 'ko') setToast(tr('koNotice'));
        else if (result.error === 'suicide') setToast(tr('suicideNotice'));
        else if (result.error === 'occupied') setToast(tr('occupiedNotice'));
        return;
      }
      commit(result.state, mode, state);
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
      state,
      tr,
    ],
  );

  const passTurn = useCallback(() => {
    if (screen !== 'game') return;
    const shownStatus = mode === 'lan-guest' ? guestView?.status ?? state.status : state.status;
    if (shownStatus !== 'playing') return;
    if (mode === 'lan-guest') {
      if (guestStarted && guestView?.canMove) {
        guest?.sendIntent({ type: 'pass', moveCount: guestView.moveCount });
      }
      return;
    }
    if (mode === 'ai' && (state.turn !== 'B' || aiThinking)) return;
    if (mode === 'lan-host') {
      if (!lanPlayers[1]?.connected || !lanHost || lanHost.status !== 'open' || state.turn !== 'B') {
        return;
      }
    }
    const result = mode === 'lan-host' ? passSeat(state, 0) : pass(state);
    if (!result.ok) return;
    commit(result.state, mode, state);
  }, [
    aiThinking,
    commit,
    guest,
    guestStarted,
    guestView,
    lanHost,
    lanPlayers,
    mode,
    screen,
    state,
  ]);

  useEffect(() => {
    if (screen !== 'game' || mode !== 'ai' || state.status !== 'playing' || state.turn !== 'W') {
      return;
    }
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const choice = chooseMoveDetailed(state, level);
      setAiThinking(false);
      if (choice.index === null) {
        const result = pass(state);
        if (result.ok) commit(result.state, 'ai', state);
        return;
      }
      const result = apply(state, choice.index);
      if (result.ok) commit(result.state, 'ai', state);
      else {
        const fallback = pass(state);
        if (fallback.ok) commit(fallback.state, 'ai', state);
      }
    }, 430);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, level, mode, screen, state]);

  const undo = useCallback(() => {
    if (mode === 'lan-guest' || mode === 'lan-host') return;
    if (historyRef.current.length === 0) return;
    const items = historyRef.current.slice();
    let next = state;
    do {
      const previous = items.pop();
      if (!previous) break;
      next = previous;
    } while (mode === 'ai' && next.status === 'playing' && next.turn !== 'B' && items.length > 0);

    historyRef.current = items;
    setHistory(items);
    stateRef.current = next;
    setState(next);
    setHintPoint(null);
    setHintReason(null);
    setCursor(next.lastMove ?? centerIndex(next.size));
    if (recordedRef.current) {
      recordedRef.current = false;
      setRecord(undoResult());
    }
    if (next.status === 'playing') {
      setSaved(saveGame({ state: next, history: items, mode, level }));
    } else {
      clearSave();
      setSaved(null);
    }
  }, [level, mode, state]);

  const showHint = useCallback(() => {
    if (state.status !== 'playing') return;
    if (mode === 'lan-guest' || mode === 'lan-host') return;
    if (mode === 'ai' && state.turn !== 'B') return;
    const choice = findHint(state, () => 0.37);
    if (choice.index === null) {
      setHintPoint(null);
      setHintReason('pass');
      setToast(tr('hintPass'));
      return;
    }
    setHintPoint(choice.index);
    setHintReason(choice.reason);
    setCursor(choice.index);
  }, [mode, state]);

  const restartGame = useCallback(() => {
    if (mode === 'lan-guest') return;
    if (mode === 'lan-host') {
      const host = hostRef.current;
      if (!host) return;
      const next = setup({ size: state.size, komi: state.komi });
      setState(next);
      stateRef.current = next;
      historyRef.current = [];
      setHistory([]);
      setCursor(centerIndex(next.size));
      setHintPoint(null);
      setHintReason(null);
      recordedRef.current = false;
      setLanError('');
      hostStartedRef.current = true;
      host.start();
      host.sendLobby();
      host.sendView(1, view(next, 1));
      return;
    }
    beginGame(mode === 'ai' ? 'ai' : 'local', state.size, state.komi);
  }, [beginGame, mode, state.komi, state.size]);

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
      const name = hostName.trim() || tr('lanHostNamePlaceholder');
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
        const value = intent as { type?: string; index?: number; moveCount?: number } | null;
        if (!value) return;
        const current = stateRef.current;
        if (typeof value.moveCount === 'number' && value.moveCount !== current.moves.length) {
          return;
        }
        if (value.type === 'pass') {
          const result = passSeat(current, seat);
          if (result.ok) commitRef.current(result.state, 'lan-host', current);
          return;
        }
        if (value.type !== 'place') return;
        const index = Number(value.index);
        if (!Number.isInteger(index)) return;
        const result = applySeat(current, seat, index);
        if (result.ok) commitRef.current(result.state, 'lan-host', current);
      });
      created.onClose(() => {
        if (hostRef.current !== created) return;
        hostRef.current = null;
        hostStartedRef.current = false;
        setLanHost(null);
        setLanPlayers([]);
        setLanError(tr('lanHostLost'));
      });
      const url = inviteUrl(info, code, code, lang === 'zh' ? '家人' : 'Guest');
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        color: { dark: '#3a2a18', light: '#f6efdf' },
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
  }, [closeLan, hostName, lang, lanBusy, tr]);

  const startLan = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open' || !lanPlayers[1]?.connected) return;
    const next = setup({ size: boardSize, komi });
    stateRef.current = next;
    setState(next);
    historyRef.current = [];
    setHistory([]);
    setCursor(centerIndex(next.size));
    setHintPoint(null);
    setHintReason(null);
    recordedRef.current = false;
    setLanError('');
    setMode('lan-host');
    setScreen('game');
    hostStartedRef.current = true;
    host.start();
    host.sendLobby();
    host.sendView(1, view(next, 1));
  }, [boardSize, komi, lanPlayers]);

  const joinGuest = useCallback(async () => {
    if (guestConnecting || guest) return;
    const name = guestName.trim();
    const code = guestCode.trim();
    if (!name) {
      setLanError(tr('lanNameNeeded'));
      return;
    }
    if (!/^\d{4}$/.test(code)) {
      setLanError(tr('lanCodeNeeded'));
      return;
    }
    // The host uses the four-digit code as both the room id and the join code,
    // so a manually typed code always addresses the right room.
    const room = code;
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
        const next = payload as SeatView;
        if (!next || !Array.isArray(next.board) || !next.size) return;
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
        setLanError(tr('lanClosed'));
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
  }, [guest, guestCode, guestConnecting, guestName, guestRoom, lang, tr]);

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

  // A scanned invite joins immediately; the guest can retry after an error.
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
      lastGuestMoveRef.current = -1;
      return;
    }
    const previous = lastGuestMoveRef.current;
    lastGuestMoveRef.current = guestView.moveCount;
    if (previous < 0 || guestView.moveCount <= previous || !soundOn) return;
    chime(guestView.status === 'finished' ? 'win' : 'place');
  }, [guestView, soundOn]);

  const isGuest = mode === 'lan-guest';
  const guestCanPlay = Boolean(guestView?.canMove) && guestStarted;
  const hostConnected = Boolean(lanPlayers[1]?.connected);
  const hostOnline = mode !== 'lan-host' || Boolean(lanHost && lanHost.status === 'open');
  const shownSize: BoardSize = isGuest && guestView ? guestView.size : state.size;
  const shownKomi: Komi = isGuest && guestView ? guestView.komi : state.komi;
  const shownBoard = isGuest && guestView ? guestView.board : state.board;
  const shownStatus = isGuest && guestView ? guestView.status : state.status;
  const shownTurn = isGuest && guestView ? guestView.turn : state.turn;
  const shownScore = isGuest && guestView ? guestView.score : state.score;
  const shownLastMove = isGuest && guestView ? guestView.lastMove : state.lastMove;
  const shownCaptures = isGuest && guestView ? guestView.captures : state.captures;
  const shownPasses = isGuest && guestView ? guestView.passes : state.passes;
  const shownKoPoint = isGuest && guestView ? guestView.koPoint : state.koPoint;
  const shownMoveCount = isGuest && guestView ? guestView.moveCount : state.moves.length;
  const finished = shownStatus === 'finished';
  const winner = shownScore?.winner ?? null;
  const chipColor: Color = finished && winner ? winner : shownTurn;

  const disabled =
    screen !== 'game' ||
    shownStatus !== 'playing' ||
    (isGuest && (!guestCanPlay || !guestStarted)) ||
    (mode === 'lan-host' && (!hostConnected || !hostOnline || shownTurn !== 'B')) ||
    (mode === 'ai' && (shownTurn !== 'B' || aiThinking));

  const passDisabled = disabled;

  const seatLabel =
    mode === 'ai'
      ? tr(AI_LEVELS.find((item) => item.id === level)?.label ?? 'normal')
      : mode === 'local'
        ? tr('modeLocal')
        : mode === 'lan-host'
          ? tr('lanHostSeat')
          : tr('lanGuestSeat');

  const modeLabel =
    mode === 'ai'
      ? tr('computer')
      : mode === 'local'
        ? tr('modeLocal')
        : mode === 'lan-host'
          ? tr('lanHostMode')
          : tr('lanGuestMode');

  const headline = (() => {
    if (finished) return tr('gameOver');
    if (isGuest) {
      if (!guestStarted) return tr('lanGuestWaiting');
      return guestCanPlay ? tr('yourTurn') : tr('blackToPlay');
    }
    if (mode === 'lan-host') {
      if (!hostConnected || !hostOnline) return tr('lanWaiting');
      return shownTurn === 'B' ? tr('yourTurn') : tr('whiteToPlay');
    }
    if (mode === 'ai') {
      return shownTurn === 'B' ? tr('yourTurn') : tr('aiThinking');
    }
    return shownTurn === 'B' ? tr('blackToPlay') : tr('whiteToPlay');
  })();

  const passNotice =
    shownStatus === 'playing' && shownPasses === 1
      ? tr('onePass', {
          color: tr(counterpart(shownTurn) === 'B' ? 'black' : 'white'),
          other: tr(shownTurn === 'B' ? 'black' : 'white'),
        })
      : '';

  const resultLabel =
    finished && shownScore
      ? tr(shownScore.winner === 'B' ? 'resultBlack' : 'resultWhite', {
          margin: formatNumber(shownScore.margin),
        })
      : '';

  const turnDetail = `${seatLabel} · ${tr('moveNo', { n: shownMoveCount })}`;

  // Keyboard path. Arrow keys move a board cursor; Enter places a stone.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        Boolean(target?.isContentEditable);
      if (typing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        goHome();
        return;
      }
      if (screen !== 'game') return;
      const size = isGuest && guestView ? guestView.size : state.size;
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        setCursor((current) => {
          const row = Math.floor(current / size);
          const col = current % size;
          if (event.key === 'ArrowUp') return Math.max(0, row - 1) * size + col;
          if (event.key === 'ArrowDown') return Math.min(size - 1, row + 1) * size + col;
          if (event.key === 'ArrowLeft') return row * size + Math.max(0, col - 1);
          return row * size + Math.min(size - 1, col + 1);
        });
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'p') {
        event.preventDefault();
        passTurn();
        return;
      }
      if (key === 'h') {
        event.preventDefault();
        showHint();
        return;
      }
      if (key === 'u') {
        event.preventDefault();
        undo();
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        if (target?.tagName === 'BUTTON' && !target.classList.contains('go-point')) return;
        event.preventDefault();
        if (!disabled) playAt(cursor);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    cursor,
    disabled,
    goHome,
    guestView,
    isGuest,
    passTurn,
    playAt,
    screen,
    showHint,
    state.size,
    undo,
  ]);

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
        <div className="hero-board">
          <div className="seal" aria-hidden="true">{lang === 'zh' ? '棋' : '04'}</div>
          <Board
            size={19}
            board={HERO_BOARD}
            turn="B"
            lastMove={parsePoint(19, 'Q16')}
            hint={null}
            cursor={-1}
            territory={null}
            disabled
            lang={lang}
            onCell={() => undefined}
            legend
            legendText="19 × 19"
          />
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>{tr('saved')}</small>
              </button>
            )}
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={startAi}>
              {tr('playAi')}
            </button>
            <button className="secondary wide" onClick={startLocal}>
              {tr('playLocal')}
            </button>
            <button className="secondary wide lan-menu-button" onClick={openLanHub}>
              {tr('playLan')}
            </button>
            <div className="menu-links">
              <button className="text-button" onClick={() => setScreen('rules')}>
                {tr('rules')} →
              </button>
              <button className="text-button" onClick={() => setScreen('record')}>
                {tr('record')} →
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('stats')}</span>
            <strong>{record.games}</strong>
            <span>{record.games === 1 ? tr('gameOne') : tr('games')}</span>
            <span className="dot">·</span>
            <span>{record.blackWins} {tr('blackShort')}</span>
            <span className="dot">·</span>
            <span>{record.whiteWins} {tr('whiteShort')}</span>
            {record.streak > 0 && (
              <>
                <span className="dot">·</span>
                <span>{tr('streakValue', { n: record.streak })}</span>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="home-steps">
        <article>
          <span className="step-no">01</span>
          <h3>{tr('stepPlaceTitle')}</h3>
          <p>{tr('stepPlaceText')}</p>
        </article>
        <article>
          <span className="step-no">02</span>
          <h3>{tr('stepCaptureTitle')}</h3>
          <p>{tr('stepCaptureText')}</p>
        </article>
        <article>
          <span className="step-no">03</span>
          <h3>{tr('stepCountTitle')}</h3>
          <p>{tr('stepCountText')}</p>
        </article>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>← {tr('back')}</button>
      <p className="eyebrow">{tr('eyebrow')}</p>
      <h2 className="screen-title">{tr('newGame')}</h2>
      <div className="setup-grid">
        <section className="setup-card">
          <h3>{tr('boardSize')}</h3>
          <div className="choice-row">
            {BOARD_SIZES.map((size) => (
              <button
                key={size}
                className={`choice-chip ${boardSize === size ? 'selected' : ''}`}
                aria-pressed={boardSize === size}
                onClick={() => setBoardSize(size)}
              >
                {size} × {size}
              </button>
            ))}
          </div>
        </section>
        <section className="setup-card">
          <h3>{tr('komi')}</h3>
          <div className="choice-row">
            {KOMI_OPTIONS.map((value) => (
              <button
                key={value}
                className={`choice-chip ${komi === value ? 'selected' : ''}`}
                aria-pressed={komi === value}
                onClick={() => setKomi(value)}
              >
                {formatNumber(value)}
              </button>
            ))}
          </div>
        </section>
        {mode === 'ai' && (
          <section className="setup-card setup-levels">
            <div className="setup-card-head">
              <h3>{tr('aiLevel')}</h3>
              <span className="setup-pill">{tr('youPlayBlack')}</span>
            </div>
            <div className="level-grid">
              {AI_LEVELS.map((item) => (
                <button
                  key={item.id}
                  className={`level-card ${level === item.id ? 'selected' : ''}`}
                  aria-pressed={level === item.id}
                  onClick={() => setLevel(item.id)}
                >
                  <span className={`level-dot ${item.id}`} />
                  <strong>{tr(item.label)}</strong>
                  <small>{tr(item.note)}</small>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="row-actions">
        <button className="primary" onClick={() => beginGame(mode === 'ai' ? 'ai' : 'local')}>
          {tr('begin')}
        </button>
        <button className="ghost" onClick={goHome}>{tr('back')}</button>
      </div>
      <div className="setup-tip">
        <strong>{tr('setupTipTitle')}</strong>
        <p>{tr('setupTip')}</p>
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
          <div className={`turn-bar ${finished ? 'is-over' : ''}`} aria-live="polite">
            <span className={`turn-chip ${chipColor === 'B' ? 'black' : 'white'}`}>
              <StoneGlyph color={chipColor} />
            </span>
            <div className="turn-copy">
              <strong>{headline}</strong>
              <p>{turnDetail}</p>
              {passNotice && <p className="pass-note">{passNotice}</p>}
            </div>
            {aiThinking && <span className="thinking" aria-label={tr('aiThinking')}>···</span>}
          </div>

          {mode === 'lan-host' || mode === 'lan-guest' ? (
            lanError ? <p className="error game-error" role="alert">{lanError}</p> : null
          ) : null}

          <Board
            size={shownSize}
            board={shownBoard}
            turn={shownTurn}
            lastMove={shownLastMove}
            hint={isGuest ? null : hintPoint}
            cursor={finished ? -1 : cursor}
            koPoint={shownKoPoint}
            territory={finished ? shownScore?.ownership ?? null : null}
            disabled={disabled}
            lang={lang}
            onCell={playAt}
            onCursor={setCursor}
            legend
            legendText={`${shownSize} × ${shownSize} · ${tr('komi')} ${formatNumber(shownKomi)}`}
          />

          {hintPoint !== null && hintReason && (
            <p className="hint-note">
              <span className="hint-mark" aria-hidden="true">✦</span>
              {tr(HINT_KEYS[hintReason])}
            </p>
          )}

          {finished && shownScore && (
            <div className="result-banner" role="status">
              <div className="result-copy">
                <span className="result-kicker">{tr('gameOver')}</span>
                <strong>{resultLabel}</strong>
                <p>
                  {tr('totalBlack')} {formatNumber(shownScore.black)} · {tr('totalWhite')}{' '}
                  {formatNumber(shownScore.white)}
                </p>
              </div>
              {isGuest ? (
                <span className="wait-pill">
                  <span className="wait-dot" aria-hidden="true" />
                  {tr('lanGuestFinished')}
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
                      {tr('aiLevel')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="side">
          <div className="side-card action-card">
            <h3>{tr('turnOptions')}</h3>
            <button className="primary pass-button" onClick={passTurn} disabled={passDisabled}>
              {tr('pass')}
            </button>
            <p>{tr('passHint')}</p>
            <div className="side-actions">
              <button
                className="secondary"
                onClick={undo}
                disabled={history.length === 0 || mode === 'lan-guest' || mode === 'lan-host' || aiThinking}
              >
                {tr('undo')}
              </button>
              <button
                className="secondary"
                onClick={showHint}
                disabled={
                  shownStatus !== 'playing' ||
                  mode === 'lan-guest' ||
                  mode === 'lan-host' ||
                  (mode === 'ai' && (shownTurn !== 'B' || aiThinking))
                }
              >
                {tr('hint')}
              </button>
            </div>
          </div>

          <div className="side-card">
            <h3>{tr('captures')}</h3>
            <div className="capture-row">
              <span className="mini-stone black" />
              <span>{tr('blackCaptured', { n: shownCaptures.B })}</span>
            </div>
            <div className="capture-row">
              <span className="mini-stone white" />
              <span>{tr('whiteCaptured', { n: shownCaptures.W })}</span>
            </div>
            <p className="side-note">{tr('moveNo', { n: shownMoveCount })}</p>
          </div>

          {finished && shownScore && (
            <div className="side-card score-card">
              <h3>{tr('scoreTitle')}</h3>
              <dl>
                <div><dt>{tr('blackStones')}</dt><dd>{shownScore.blackStones}</dd></div>
                <div><dt>{tr('whiteStones')}</dt><dd>{shownScore.whiteStones}</dd></div>
                <div><dt>{tr('blackTerritory')}</dt><dd>{shownScore.blackTerritory}</dd></div>
                <div><dt>{tr('whiteTerritory')}</dt><dd>{shownScore.whiteTerritory}</dd></div>
                <div><dt>{tr('neutral')}</dt><dd>{shownScore.neutral}</dd></div>
                <div><dt>{tr('komi')}</dt><dd>{formatNumber(shownScore.komi)}</dd></div>
                <div className="score-total"><dt>{tr('totalBlack')}</dt><dd>{formatNumber(shownScore.black)}</dd></div>
                <div className="score-total"><dt>{tr('totalWhite')}</dt><dd>{formatNumber(shownScore.white)}</dd></div>
              </dl>
            </div>
          )}

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanCode')}</h3>
                <span className={`status-dot ${hostConnected ? 'online' : ''}`} />
              </div>
              <div className="room-code">{lanCode || '—'}</div>
              <p>{hostConnected ? tr('lanReady') : tr('lanWaiting')}</p>
              {lanPlayers[1] && (
                <p className="peer">
                  {lanPlayers[1].name} · {lanPlayers[1].connected ? tr('lanOnline') : tr('lanOffline')}
                </p>
              )}
              <p className="side-note">{tr('lanHostHint')}</p>
            </div>
          )}

          {isGuest && (
            <div className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanGuestMode')}</h3>
                <span className={`status-dot ${guestStarted ? 'online' : ''}`} />
              </div>
              <p>{guestCanPlay ? tr('yourTurn') : tr('lanGuestWaiting')}</p>
              <p className="peer">{tr('lanRoom', { code: guestRoom || guestCode })}</p>
              <p className="side-note">{tr('lanGuestHint')}</p>
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('stats')}</h3>
            <p>
              {record.games} {record.games === 1 ? tr('gameOne') : tr('games')} ·{' '}
              {record.blackWins} {tr('blackShort')} · {record.whiteWins} {tr('whiteShort')}
            </p>
            <p className="record-mini-note">{tr('recordMiniNote')}</p>
            {mode !== 'lan-guest' && mode !== 'lan-host' && (
              <button className="text-button" onClick={() => setScreen('record')}>
                {tr('openRecord')}
              </button>
            )}
          </div>

          <div className="side-card keys-card">
            <h3>{tr('controlsTitle')}</h3>
            <p>{tr('keyboardHint')}</p>
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
              <p>{tr('lanHostCardText')}</p>
              <label className="field">
                <span>{tr('lanHostName')}</span>
                <input
                  value={hostName}
                  onChange={(event) => setHostName(event.target.value)}
                  maxLength={18}
                  placeholder={tr('lanHostNamePlaceholder')}
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>{tr('boardSize')}</span>
                  <select
                    value={boardSize}
                    onChange={(event) => setBoardSize(Number(event.target.value) as BoardSize)}
                  >
                    {BOARD_SIZES.map((size) => (
                      <option key={size} value={size}>{size} × {size}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{tr('komi')}</span>
                  <select
                    value={komi}
                    onChange={(event) => setKomi(Number(event.target.value) as Komi)}
                  >
                    {KOMI_OPTIONS.map((value) => (
                      <option key={value} value={value}>{formatNumber(value)}</option>
                    ))}
                  </select>
                </label>
              </div>
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
              <p>{tr('lanJoinCardText')}</p>
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
                  <span className={`status-pill ${hostConnected ? 'ready' : ''}`}>
                    {hostConnected ? tr('lanReady') : tr('lanWaiting')}
                  </span>
                </div>
                <div className="room-code big">{lanCode}</div>
                <p className="lan-help">{tr('lanHostCodeHelp')}</p>
                <div className="settings-summary">
                  <span>{boardSize} × {boardSize}</span>
                  <span>{tr('komi')} {formatNumber(komi)}</span>
                </div>
                <div className="peer-list">
                  {lanPlayers.map((player) => (
                    <span key={player.seat} className={`peer-chip ${player.connected ? 'online' : ''}`}>
                      <span className={`mini-stone ${player.seat === 0 ? 'black' : 'white'}`} />
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
                <button className="primary wide" onClick={startLan} disabled={!hostConnected}>
                  {hostConnected ? tr('lanStart') : tr('lanWaitingGuest')}
                </button>
                <button className="secondary wide" onClick={copyInvite}>
                  {tr('lanCopy')}
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
          <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
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
                <StoneGlyph color="W" />
              </div>
              <h3>{tr('lanGuestWaiting')}</h3>
              <div className="guest-meta">
                <span>{tr('lanRoom', { code: guestRoom || guestCode })}</span>
                <span>{tr('lanGuestSeat')}</span>
                {guestPlayers.find((player) => player.host)?.name && (
                  <span>
                    {tr('lanHostTag')} · {guestPlayers.find((player) => player.host)?.name}
                  </span>
                )}
              </div>
              <button className="secondary wide" onClick={goHome}>{tr('lanLeave')}</button>
            </div>
          )}
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const recordScreen = (
    <main className="shell stats-shell">
      <button className="back" onClick={goHome}>← {tr('home')}</button>
      <header className="stats-head">
        <p className="eyebrow">{tr('eyebrow')}</p>
        <h2 className="screen-title">{tr('recordTitle')}</h2>
      </header>

      {record.games === 0 ? (
        <section className="empty-card">
          <span className="empty-mark" aria-hidden="true">● ○ ●</span>
          <p>{tr('noRecord')}</p>
          <button className="primary" onClick={startAi}>{tr('playAi')}</button>
        </section>
      ) : (
        <>
          <section className="stats-top">
            <div className="stat-card total">
              <span>{tr('games')}</span>
              <strong>{record.games}</strong>
            </div>
            <div className="stat-card black-card">
              <span>{tr('blackWins')}</span>
              <strong>{record.blackWins}</strong>
            </div>
            <div className="stat-card white-card">
              <span>{tr('whiteWins')}</span>
              <strong>{record.whiteWins}</strong>
            </div>
            <div className="stat-card streak-card">
              <span>{tr('streak')}</span>
              <strong>{record.streak}</strong>
            </div>
          </section>

          <section className="record-grid">
            <div className="record-card">
              <h3>{tr('winShare')}</h3>
              <div className="share-bar" aria-hidden="true">
                <span
                  className="share-black"
                  style={{ width: `${record.games > 0 ? (record.blackWins / record.games) * 100 : 0}%` }}
                />
                <span
                  className="share-white"
                  style={{ width: `${record.games > 0 ? (record.whiteWins / record.games) * 100 : 0}%` }}
                />
              </div>
              <ul className="share-legend">
                <li><i className="legend-black" />{tr('blackWins')} <strong>{record.blackWins}</strong></li>
                <li><i className="legend-white" />{tr('whiteWins')} <strong>{record.whiteWins}</strong></li>
              </ul>
              <div className="streak-row">
                <div><span>{tr('sameWinnerRun')}</span><strong>{record.streak}</strong></div>
                <div><span>{tr('bestRun')}</span><strong>{record.bestStreak}</strong></div>
                <div>
                  <span>{tr('lastResult')}</span>
                  <strong>{record.lastWinner ? tr(record.lastWinner === 'B' ? 'blackWins' : 'whiteWins') : tr('none')}</strong>
                </div>
              </div>
            </div>

            <div className="record-card modes-card">
              <h3>{tr('byMode')}</h3>
              <div className="mode-list">
                {(['ai', 'local', 'lan'] as const).map((value) => (
                  <div className="mode-row" key={value}>
                    <span>{t(lang, value === 'ai' ? 'modeAi' : value === 'local' ? 'modeLocal' : 'modeLan')}</span>
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
            <ol className="recent-list">
              {record.recent.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="recent-row">
                  <span className={`recent-mark ${entry.winner === 'B' ? 'black' : 'white'}`}>
                    <span className={`mini-stone ${entry.winner === 'B' ? 'black' : 'white'}`} />
                  </span>
                  <div className="recent-main">
                    <strong>
                      {tr('resultLine', {
                        winner: tr(entry.winner === 'B' ? 'black' : 'white'),
                        margin: formatNumber(entry.margin),
                      })}
                    </strong>
                    <span>
                      {t(lang, entry.mode === 'ai' ? 'modeAi' : entry.mode === 'local' ? 'modeLocal' : 'modeLan')}
                      {entry.level ? ` · ${tr(entry.level)}` : ''} · {entry.size} × {entry.size} · {tr('komi')} {formatNumber(entry.komi)}
                    </span>
                  </div>
                  <span className="recent-moves">{tr('moveNo', { n: entry.moves })}</span>
                  <time dateTime={new Date(entry.at).toISOString()}>{formatDate(entry.at, lang)}</time>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell rules-shell">
      <button className="back" onClick={goHome}>← {tr('back')}</button>
      <p className="eyebrow">{tr('eyebrow')}</p>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <div className="rules-layout">
        <div>
          <ol className="rules-list">
            <li>{tr('rule1')}</li>
            <li>{tr('rule2')}</li>
            <li>{tr('rule3')}</li>
            <li>{tr('rule4')}</li>
            <li>{tr('rule5')}</li>
          </ol>
          <div className="rule-cards">
            <section>
              <h3>{tr('scoringTitle')}</h3>
              <p>{tr('scoringText')}</p>
            </section>
            <section>
              <h3>{tr('controlsTitle')}</h3>
              <p>{tr('controlsText')}</p>
            </section>
          </div>
        </div>
        <aside className="example-card">
          <h3>{tr('exampleTitle')}</h3>
          <Board
            size={9}
            board={DEMO_BOARD}
            turn="B"
            lastMove={null}
            hint={null}
            cursor={-1}
            territory={territoryOwner(DEMO_BOARD, 9)}
            disabled
            lang={lang}
            onCell={() => undefined}
          />
          <p>{tr('exampleText')}</p>
          <p className="example-score">
            {tr('black')} {formatNumber(DEMO_SCORE.black)} · {tr('white')} {formatNumber(DEMO_SCORE.white)}
          </p>
        </aside>
      </div>
      <button className="primary rules-close" onClick={goHome}>{tr('close')}</button>
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'record') return recordScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
