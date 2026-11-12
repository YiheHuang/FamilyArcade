import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  LanGuest,
  LanHost,
  guestParams,
  newRoomCode,
  type LanPublicPeer,
} from '@family-arcade/lan';
import { chooseMove, type AiLevel } from './ai/ai';
import { hintFor, type Hint, type HintKind } from './ai/hint';
import { Board, PieceIcon, PREVIEW_STATE } from './components/Board';
import {
  PIECE_KINDS,
  apply,
  applySeat,
  handCounts,
  keyOf,
  legalMoves,
  mustPlaceQueen,
  other,
  queenOnBoard,
  setup,
  surroundCount,
  topPiece,
  view,
  type GameState,
  type Hex,
  type Move,
  type PieceKind,
  type Player,
  type SeatView,
} from './game/hive';
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

const LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
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

const PIECE_LABEL: Record<PieceKind, MessageKey> = {
  queen: 'pieceQueen',
  ant: 'pieceAnt',
  beetle: 'pieceBeetle',
  grasshopper: 'pieceGrasshopper',
  spider: 'pieceSpider',
};

const PLAYER_LABEL: Record<Player, MessageKey> = { W: 'amber', B: 'onyx' };

const HINT_KEYS: Record<HintKind, MessageKey> = {
  win: 'hintWin',
  defend: 'hintDefend',
  queen: 'hintQueen',
  ant: 'hintAnt',
  beetle: 'hintBeetle',
  spider: 'hintSpider',
  grasshopper: 'hintGrasshopper',
  develop: 'hintDevelop',
};

function playerName(lang: Lang, player: Player): string {
  return t(lang, PLAYER_LABEL[player]);
}

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

function modeLabelFor(lang: Lang, value: RecordMode): string {
  return value === 'ai'
    ? t(lang, 'modeAi')
    : value === 'local'
      ? t(lang, 'modeLocal')
      : t(lang, 'modeLan');
}

function HandTray({
  state,
  player,
  selected,
  interactive,
  mustQueen,
  onSelect,
  lang,
}: {
  state: GameState;
  player: Player;
  selected: PieceKind | null;
  interactive: boolean;
  mustQueen: boolean;
  onSelect: (kind: PieceKind) => void;
  lang: Lang;
}) {
  const counts = handCounts(state, player);
  return (
    <div className={`tray-player owner-${player.toLowerCase()} ${interactive ? 'is-active' : ''}`}>
      <div className="tray-head">
        <span className={`owner-dot ${player.toLowerCase()}`} aria-hidden="true" />
        <strong>{playerName(lang, player)}</strong>
        <span>{t(lang, 'hand')}</span>
      </div>
      <div className="tray-pieces">
        {PIECE_KINDS.map((kind) => {
          const count = counts[kind];
          const disabled =
            !interactive ||
            count === 0 ||
            (mustQueen && kind !== 'queen');
          return (
            <button
              key={kind}
              type="button"
              className={`hand-piece ${selected === kind ? 'selected' : ''} ${mustQueen && kind === 'queen' ? 'urgent' : ''}`}
              data-kind={kind}
              data-player={player}
              disabled={disabled}
              aria-pressed={selected === kind}
              aria-label={`${t(lang, PIECE_LABEL[kind])} · ${count}`}
              title={`${t(lang, PIECE_LABEL[kind])} · ${count}`}
              onClick={() => onSelect(kind)}
            >
              <PieceIcon kind={kind} owner={player} />
              <span className="hand-label">{t(lang, PIECE_LABEL[kind])}</span>
              <strong>{count}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (invite ? 'lan-guest' : 'ai'));
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup('W'));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selectedHand, setSelectedHand] = useState<PieceKind | null>(null);
  const [selectedCell, setSelectedCell] = useState<Hex | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.hive.sound') !== 'off';
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
      return localStorage.getItem('familyarcade.hive.hostName') ?? '';
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
    document.title = lang === 'zh' ? '虫虫棋' : 'Hive';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.hive.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.hive.hostName', hostName);
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

  const isGuest = mode === 'lan-guest';
  const isLan = mode === 'lan-host' || mode === 'lan-guest';
  const shownState = isGuest && guestView ? guestView.state : state;
  const guestCanPlay = Boolean(guestView?.canMove) && guestStarted;
  const guestOnline = Boolean(lanPlayers[1]?.connected);
  const hostOnline = mode !== 'lan-host' || lanHost?.status === 'open';
  const guestHostName = guestPlayers.find((player) => player.host)?.name;

  const viewerPlayer: Player = isGuest ? (guestView?.player ?? 'B') : mode === 'lan-host' ? 'W' : shownState.turn;
  const interactivePlayer: Player =
    mode === 'ai' ? 'W' : mode === 'lan-host' ? 'W' : mode === 'lan-guest' ? 'B' : shownState.turn;

  const actorCanPlay =
    screen === 'game' &&
    shownState.status === 'playing' &&
    (mode === 'ai'
      ? shownState.turn === 'W' && !aiThinking
      : mode === 'lan-host'
        ? shownState.turn === 'W' && guestOnline && hostOnline
        : mode === 'lan-guest'
          ? guestCanPlay
          : true);

  const disabled = screen !== 'game' || shownState.status !== 'playing' || !actorCanPlay;

  const legal = useMemo(
    () => (shownState.status === 'playing' ? legalMoves(shownState) : []),
    [shownState],
  );
  const onlyPass = legal.length === 1 && legal[0].type === 'pass';

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
      setSelectedHand(null);
      setSelectedCell(null);
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
    const next = setup('W');
    stateRef.current = next;
    setMode(nextMode);
    setState(next);
    setHistory([]);
    setSelectedHand(null);
    setSelectedCell(null);
    setHint(null);
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
    setSelectedHand(null);
    setSelectedCell(null);
    setHint(null);
    setAiThinking(false);
    setRecorded(saved.state.status === 'won');
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
    setSelectedHand(null);
    setSelectedCell(null);
    setHint(null);
    setRecorded(false);
    setSaved(saveGame({ state: previous, mode, level }));
  }, [history, isLan, level, mode, state.status]);

  const showHint = useCallback(() => {
    if (state.status !== 'playing' || isLan) return;
    if (mode === 'ai' && state.turn !== 'W') return;
    const options = legalMoves(state);
    if (options.length === 0 || options.every((move) => move.type === 'pass')) {
      setToast(tr('mustPass'));
      return;
    }
    const next = hintFor(state);
    if (!next) {
      setToast(tr('noMoves'));
      return;
    }
    setHint(next);
    if (next.move.type === 'place') {
      setSelectedHand(next.move.kind);
      setSelectedCell(null);
    } else if (next.move.type === 'move') {
      setSelectedCell(next.move.from);
      setSelectedHand(null);
    }
    setToast(t(lang, HINT_KEYS[next.kind]));
  }, [isLan, lang, mode, state, tr]);

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
    setSelectedHand(null);
    setSelectedCell(null);
    setHint(null);
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
          move?: Move;
          moveCount?: number;
        } | null;
        if (!value || value.type !== 'hive-move' || !value.move) return;
        const current = stateRef.current;
        if (
          typeof value.moveCount === 'number' &&
          value.moveCount !== current.moveCount
        ) {
          return;
        }
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
        color: { dark: '#2b2620', light: '#fffaf0' },
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
    const next = setup('W');
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setSelectedHand(null);
    setSelectedCell(null);
    setHint(null);
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
      setSelectedHand(null);
      setSelectedCell(null);
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

  const playMove = useCallback(
    (move: Move) => {
      if (screen !== 'game') return;
      const current = isGuest ? guestView?.state : state;
      if (!current || current.status !== 'playing') return;

      if (mode === 'lan-guest') {
        if (guestStarted && guestView?.canMove) {
          guest?.sendIntent({
            type: 'hive-move',
            move,
            moveCount: guestView.state.moveCount,
          });
        }
        return;
      }
      if (mode === 'ai' && (state.turn !== 'W' || aiThinking)) return;
      if (
        mode === 'lan-host' &&
        (!lanPlayers[1]?.connected || !lanHost || lanHost.status !== 'open')
      ) {
        return;
      }
      if (mode === 'lan-host' && state.turn !== 'W') return;
      const result = mode === 'lan-host' ? applySeat(state, 0, move) : apply(state, move);
      if (!result.ok) return;
      commit(result.state, mode, state);
    },
    [aiThinking, commit, guest, guestStarted, guestView, isGuest, lanHost, lanPlayers, mode, screen, state],
  );

  const onHex = useCallback(
    (hex: Hex) => {
      if (screen !== 'game' || onlyPass) return;
      const current = isGuest ? guestView?.state : state;
      if (!current || current.status !== 'playing') return;
      if (mode === 'ai' && (current.turn !== 'W' || aiThinking)) return;
      if (mode === 'lan-host' && (!guestOnline || current.turn !== 'W')) return;
      if (mode === 'lan-guest' && !guestView?.canMove) return;
      const me = isGuest ? (guestView?.player ?? 'B') : mode === 'lan-host' ? 'W' : current.turn;
      const moves = legalMoves(current);

      if (selectedHand) {
        const place = moves.find(
          (move) =>
            move.type === 'place' &&
            move.kind === selectedHand &&
            keyOf(move.at) === keyOf(hex),
        );
        if (place) {
          playMove(place);
          return;
        }
      }

      if (selectedCell) {
        const move = moves.find(
          (candidate) =>
            candidate.type === 'move' &&
            keyOf(candidate.from) === keyOf(selectedCell) &&
            keyOf(candidate.to) === keyOf(hex),
        );
        if (move) {
          playMove(move);
          return;
        }
      }

      const top = topPiece(current, hex);
      if (top?.owner === me && queenOnBoard(current, me)) {
        setSelectedCell(hex);
        setSelectedHand(null);
        setHint(null);
        return;
      }

      setSelectedHand(null);
      setSelectedCell(null);
    },
    [
      aiThinking,
      guestOnline,
      guestView,
      isGuest,
      mode,
      playMove,
      screen,
      selectedCell,
      selectedHand,
      onlyPass,
      state,
    ],
  );

  const onHand = useCallback(
    (kind: PieceKind) => {
      if (disabled || onlyPass) return;
      const current = isGuest ? guestView?.state : state;
      if (!current || current.status !== 'playing') return;
      const counts = handCounts(current, viewerPlayer);
      if (counts[kind] <= 0) return;
      if (mustPlaceQueen(current, viewerPlayer) && kind !== 'queen') return;
      setSelectedHand((value) => (value === kind ? null : kind));
      setSelectedCell(null);
      setHint(null);
    },
    [disabled, guestView, isGuest, onlyPass, state, viewerPlayer],
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
      lastGuestMoveRef.current = -1;
      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        const next = payload as SeatView;
        if (!next?.state?.cells) return;
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
  }, [guest, guestCode, guestConnecting, guestName, lang]);

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
      const move = chooseMove(state, level);
      setAiThinking(false);
      if (!move) {
        setToast(tr('noMoves'));
        return;
      }
      const result = apply(state, move);
      if (!result.ok) return;
      commit(result.state, 'ai', state);
    }, 420);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, level, mode, screen, state, tr]);

  // Keyboard path. Number keys never steal a turn from the AI or the host.
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
      const number = Number(event.key);
      if (Number.isInteger(number) && number >= 1 && number <= 5) {
        event.preventDefault();
        onHand(PIECE_KINDS[number - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goHome, onHand, screen]);

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

  // Clear stale selections whenever the guest receives a new view.
  useEffect(() => {
    if (!guestView) return;
    setSelectedHand(null);
    setSelectedCell(null);
    setHint(null);
  }, [guestView]);

  // The guest hears the host's board update. Skip the first view on join.
  useEffect(() => {
    if (!guestView) {
      lastGuestMoveRef.current = -1;
      return;
    }
    const previous = lastGuestMoveRef.current;
    lastGuestMoveRef.current = guestView.state.moveCount;
    if (
      previous < 0 ||
      guestView.state.moveCount <= previous ||
      !soundOn
    ) {
      return;
    }
    chime(guestView.state.status === 'won' ? 'win' : 'place');
  }, [guestView, soundOn]);

  const boardLegal = useMemo(() => {
    if (screen !== 'game') return [];
    if (selectedHand) {
      return legal.filter(
        (move) => move.type === 'place' && move.kind === selectedHand,
      );
    }
    if (selectedCell) {
      return legal.filter(
        (move) => move.type === 'move' && keyOf(move.from) === keyOf(selectedCell),
      );
    }
    return [];
  }, [legal, screen, selectedCell, selectedHand]);

  const winnerText =
    shownState.status === 'won' && shownState.winner
      ? t(lang, shownState.winner === 'W' ? 'amberWins' : 'onyxWins')
      : shownState.status === 'draw'
        ? tr('draw')
        : '';
  const loser = shownState.winner ? other(shownState.winner) : null;
  const isDraw = shownState.status === 'draw';

  const aiTurn = mode === 'ai' && shownState.turn === 'B' && shownState.status === 'playing';
  const currentQueenInDanger =
    shownState.status === 'playing' && surroundCount(shownState, shownState.turn) >= 4;
  const mustQueenNow =
    shownState.status === 'playing' && mustPlaceQueen(shownState, shownState.turn);

  let statusHeadline: string;
  if (shownState.status === 'draw') {
    statusHeadline = tr('draw');
  } else if (shownState.status === 'won' && shownState.winner) {
    statusHeadline = winnerText;
  } else if (isGuest) {
    statusHeadline = !guestStarted
      ? tr('lanWaitingHost')
      : guestCanPlay
        ? tr('yourTurn')
        : tr('lanWaitingForHost');
  } else if (mode === 'ai') {
    statusHeadline =
      shownState.turn === 'W'
        ? tr('yourTurn')
        : aiThinking
          ? tr('aiThinking')
          : t(lang, 'onyxTurn');
  } else if (mode === 'lan-host') {
    if (!guestOnline) {
      statusHeadline = t(lang, 'lanWaitingForGuest', {
        name: lanPlayers[1]?.name || tr('lanGuestTag'),
      });
    } else if (shownState.turn === 'W') {
      statusHeadline = tr('yourTurn');
    } else {
      statusHeadline = t(lang, 'lanWaitingForGuest', {
        name: lanPlayers[1]?.name || tr('lanGuestTag'),
      });
    }
  } else if (mode === 'local') {
    statusHeadline = t(lang, shownState.turn === 'W' ? 'amberTurn' : 'onyxTurn');
  } else {
    statusHeadline = t(lang, shownState.turn === 'W' ? 'amberTurn' : 'onyxTurn');
  }

  let statusDetail: string;
  if (shownState.status === 'draw') {
    statusDetail = tr('resultDraw');
  } else if (shownState.status === 'won' && loser) {
    statusDetail = t(lang, 'resultSurround', { name: playerName(lang, loser) });
  } else if (isGuest && !guestStarted) {
    statusDetail = tr('lanGuestSeat');
  } else if (isGuest && !guestCanPlay) {
    statusDetail = tr('lanWaitingForHost');
  } else if (mustQueenNow) {
    statusDetail = tr('queenMustPlace');
  } else if (onlyPass) {
    statusDetail =
      mode === 'ai' && shownState.turn === 'B' ? t(lang, 'onyxTurn') : tr('mustPass');
  } else if (!queenOnBoard(shownState, shownState.turn)) {
    statusDetail = tr('queenLocked');
  } else if (currentQueenInDanger) {
    statusDetail = tr('queenDanger');
  } else if (selectedHand) {
    statusDetail = tr('choosePlacement');
  } else if (selectedCell) {
    statusDetail = tr('chooseDestination');
  } else if (aiTurn) {
    statusDetail = t(lang, 'onyxTurn');
  } else if (mode === 'lan-host' && !guestOnline) {
    statusDetail = tr('lanGuestLeft');
  } else {
    statusDetail = tr('chooseAction');
  }

  const chipPlayer = shownState.winner ?? shownState.turn;
  const modeLabel =
    mode === 'ai'
      ? t(lang, level)
      : mode === 'local'
        ? tr('modeLocal')
        : mode === 'lan-host'
          ? tr('lanHostMode')
          : tr('lanGuestMode');

  const sideTitle =
    mode === 'ai'
      ? t(lang, level)
      : mode === 'local'
        ? tr('modeLocal')
        : mode === 'lan-host'
          ? tr('lanHostMode')
          : tr('lanGuestMode');
  const sideDetail = isDraw
    ? tr('resultDraw')
    : shownState.status === 'won' && loser
      ? t(lang, 'resultSurround', { name: playerName(lang, loser) })
      : onlyPass
        ? tr('mustPass')
        : mode === 'ai'
          ? tr(LEVEL_HINT[level])
          : mode === 'local'
            ? tr('chooseAction')
            : mode === 'lan-host'
              ? guestOnline
                ? tr('lanReady')
                : tr('lanHostWaitingGuest')
              : guestCanPlay
                ? tr('yourTurn')
                : guestStarted
                  ? tr('lanWaitingForHost')
                  : tr('lanWaitingHost');

  const shareW = record.games > 0 ? `${Math.round((record.winsW / record.games) * 100)}%` : '0%';
  const shareB = record.games > 0 ? `${Math.round((record.winsB / record.games) * 100)}%` : '0%';
  const shareD = record.games > 0 ? `${Math.round((record.draws / record.games) * 100)}%` : '0%';
  const latestLabel =
    record.lastWinner === 'draw'
      ? tr('draw')
      : record.lastWinner
        ? playerName(lang, record.lastWinner)
        : tr('none');

  const headerActions = (
    <div className="mast-actions">
      <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
        {tr('language')}
      </button>
      <button
        className="icon-button"
        onClick={() => setSoundOn((value) => !value)}
        aria-pressed={soundOn}
        aria-label={soundOn ? tr('soundOn') : tr('soundOff')}
        title={soundOn ? tr('soundOn') : tr('soundOff')}
      >
        <span className="sound-glyph" data-on={soundOn}>♪</span>
      </button>
    </div>
  );

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('eyebrowHome')}</p>
          <h1>{tr('title')}</h1>
        </div>
        {headerActions}
      </header>

      <section className="hero">
        <div className="hero-board" aria-hidden="true">
          <Board
            state={PREVIEW_STATE}
            legal={[]}
            hint={null}
            selected={null}
            actor="W"
            disabled
            onHex={() => undefined}
            lang={lang}
          />
        </div>
        <div className="hero-copy">
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continueGame')}</span>
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
            <span>{tr('games')}</span>
            <span className="dot">·</span>
            <span>{record.winsW} {tr('amber')}</span>
            <span className="dot">·</span>
            <span>{record.winsB} {tr('onyx')}</span>
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
        {LEVELS.map((item) => (
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
        {headerActions}
      </header>

      <div className="game-layout">
        <section className="board-wrap">
          <div className={`turn-bar ${shownState.status !== 'playing' ? 'is-over' : ''}`} aria-live="polite">
            <span className={`turn-chip ${isDraw ? 'draw' : `owner-${chipPlayer.toLowerCase()}`}`}>
              {isDraw ? (
                <span className="draw-glyph" aria-hidden="true">=</span>
              ) : (
                <PieceIcon kind="queen" owner={chipPlayer} />
              )}
            </span>
            <div className="turn-copy">
              <strong>{statusHeadline}</strong>
              <p>{statusDetail}</p>
            </div>
            {aiThinking && <span className="thinking" aria-hidden="true">…</span>}
          </div>

          {isLan && lanError && <p className="error game-error" role="alert">{lanError}</p>}

          <div className="board-stage">
            <Board
              state={shownState}
              legal={boardLegal}
              hint={hint}
              selected={selectedCell}
              actor={viewerPlayer}
              disabled={disabled}
              canMovePieces={!onlyPass && queenOnBoard(shownState, viewerPlayer)}
              onHex={onHex}
              lang={lang}
            />
          </div>

          {shownState.status === 'playing' && (
            <div className="trays">
              {(['W', 'B'] as const).map((player) => (
                <HandTray
                  key={player}
                  state={shownState}
                  player={player}
                  selected={selectedHand}
                  interactive={
                    actorCanPlay &&
                    !onlyPass &&
                    player === interactivePlayer &&
                    shownState.turn === player
                  }
                  mustQueen={mustPlaceQueen(shownState, player)}
                  onSelect={onHand}
                  lang={lang}
                />
              ))}
            </div>
          )}

          {shownState.status !== 'playing' && (
            <div className="result-banner" role="status">
              <div className="result-copy">
                <span className="result-kicker">{tr('gameOver')}</span>
                <strong>{winnerText}</strong>
                <small>
                  {isDraw
                    ? tr('resultDraw')
                    : loser
                      ? t(lang, 'resultSurround', { name: playerName(lang, loser) })
                      : ''}
                </small>
              </div>
              {isGuest ? (
                <span className="wait-pill">
                  <span className="wait-dot" aria-hidden="true" />
                  {tr('waitingHostRestart')}
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
            {shownState.status === 'playing' && (
              <>
                <div className="side-actions">
                  <button
                    className="secondary"
                    onClick={undo}
                    disabled={history.length === 0 || isLan}
                  >
                    {tr('undo')}
                  </button>
                  <button
                    className="secondary"
                    onClick={showHint}
                    disabled={isLan || aiTurn || onlyPass}
                  >
                    {tr('hint')}
                  </button>
                  {onlyPass && actorCanPlay && (
                    <button className="primary side-pass" onClick={() => playMove({ type: 'pass' })}>
                      {tr('pass')}
                    </button>
                  )}
                </div>
                {isLan && <p className="side-note">{tr('localOnly')}</p>}
                {!isLan && <p className="side-note">{tr('keyboardHint')}</p>}
              </>
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
              {record.games} {tr('games')} · {record.winsW}/{record.winsB}/{record.draws}
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
            <p className="eyebrow">{tr('eyebrowLan')}</p>
            <h2 className="screen-title">{tr('lanTitle')}</h2>
          </header>
          <div className="lan-choice">
            <section className="lan-choice-card host-card">
              <div className="choice-head">
                <span className="tag">{tr('lanHostTag')}</span>
                <span className="choice-icon" aria-hidden="true">⌂</span>
              </div>
              <h3>{tr('lanHost')}</h3>
              <p>{tr('lanHostCardNote')}</p>
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
              <p>{tr('lanJoinCardNote')}</p>
              <div className="field-row">
                <label className="field code-field">
                  <span>{tr('lanCode')}</span>
                  <input
                    value={guestCode}
                    onChange={(event) =>
                      setGuestCode(event.target.value.replace(/\D/g, '').slice(0, 4))
                    }
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
                      <span className={`peer-mark owner-${player.seat === 0 ? 'w' : 'b'}`}>
                        <PieceIcon kind="queen" owner={player.seat === 0 ? 'W' : 'B'} />
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
                    onChange={(event) =>
                      setGuestCode(event.target.value.replace(/\D/g, '').slice(0, 4))
                    }
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
                <PieceIcon kind="queen" owner="B" />
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
        <p className="eyebrow">{tr('eyebrowRecord')}</p>
        <h2 className="screen-title">{tr('recordTitle')}</h2>
      </header>

      {record.games === 0 ? (
        <section className="empty-card">
          <span className="empty-mark" aria-hidden="true">
            <PieceIcon kind="queen" owner="W" />
            <PieceIcon kind="queen" owner="B" />
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
            <div className="stat-card amber">
              <span>{tr('winsW')}</span>
              <strong>{record.winsW}</strong>
            </div>
            <div className="stat-card onyx">
              <span>{tr('winsB')}</span>
              <strong>{record.winsB}</strong>
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
                <span className="share-w" style={{ width: shareW }} />
                <span className="share-b" style={{ width: shareB }} />
                <span className="share-d" style={{ width: shareD }} />
              </div>
              <ul className="share-legend">
                <li><i className="legend-w" />{tr('winsW')} <strong>{record.winsW}</strong></li>
                <li><i className="legend-b" />{tr('winsB')} <strong>{record.winsB}</strong></li>
                <li><i className="legend-d" />{tr('draws')} <strong>{record.draws}</strong></li>
              </ul>
              <div className="streak-row">
                <div><span>{tr('sameWinnerRun')}</span><strong>{record.streak}</strong></div>
                <div><span>{tr('bestRun')}</span><strong>{record.bestStreak}</strong></div>
                <div><span>{tr('lastResult')}</span><strong>{latestLabel}</strong></div>
              </div>
            </div>

            <div className="record-card modes-card">
              <h3>{tr('games')}</h3>
              <div className="mode-list">
                {(['ai', 'local', 'lan'] as const).map((value) => (
                  <div className="mode-row" key={value}>
                    <span>{modeLabelFor(lang, value)}</span>
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
                    {entry.winner === 'draw' ? (
                      <span className="recent-mark draw">
                        <span className="recent-draw" aria-hidden="true">=</span>
                      </span>
                    ) : (
                      <span className={`recent-mark owner-${entry.winner.toLowerCase()}`}>
                        <PieceIcon kind="queen" owner={entry.winner} />
                      </span>
                    )}
                    <div className="recent-main">
                      <strong>
                        {entry.winner === 'draw' ? tr('draw') : playerName(lang, entry.winner)}
                      </strong>
                      <span>
                        {modeLabelFor(lang, entry.mode)}
                        {entry.level ? ` · ${t(lang, entry.level)}` : ''}
                      </span>
                    </div>
                    <span className="recent-moves">{t(lang, 'moves', { n: entry.moves })}</span>
                    <time dateTime={new Date(entry.at).toISOString()}>
                      {formatDate(entry.at, lang)}
                    </time>
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
      </ol>

      <h3 className="rules-subtitle">{tr('rulesPieces')}</h3>
      <div className="piece-guide">
        {PIECE_KINDS.map((kind) => (
          <div className="piece-guide-card" key={kind}>
            <PieceIcon kind={kind} />
            <div>
              <strong>{tr(PIECE_LABEL[kind])}</strong>
              <p>
                {tr(
                  kind === 'queen'
                    ? 'rulesQueen'
                    : kind === 'ant'
                      ? 'rulesAnt'
                      : kind === 'beetle'
                        ? 'rulesBeetle'
                        : kind === 'grasshopper'
                          ? 'rulesGrasshopper'
                          : 'rulesSpider',
                )}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="rules-extra">
        <p>{tr('rulesLanNote')}</p>
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
