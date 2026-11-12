import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseAction, type AiLevel } from './ai/ai';
import { hintFor, type Hint } from './ai/hint';
import { Board, Piece, PieceTags, PlayerDot } from './components/Board';
import { Tray } from './components/Tray';
import {
  applyAction,
  applySeat,
  other,
  setup,
  view,
  type Cell,
  type GameAction,
  type GameState,
  type Player,
  type SeatView,
} from './game/quarto';
import {
  attributesDescription,
  detectLang,
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

const AI_CARDS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
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

const HERO_BOARD: Cell[] = [
  0, 2, 4, 6,
  15, 9, 12, 3,
  11, 5, 14, 1,
  13, 8, 7, 10,
];

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

function hintMessage(lang: Lang, hint: Hint): string {
  const attrs = hint.attributes ? attributesDescription(lang, hint.attributes) : '';
  switch (hint.kind) {
    case 'win':
      return t(lang, 'hintWin', { attrs });
    case 'avoid':
      return t(lang, 'hintAvoid');
    case 'forced':
      return t(lang, 'hintForced');
    case 'setup':
      return t(lang, 'hintSetup', { attrs });
    case 'quiet':
      return t(lang, 'hintQuiet');
    case 'open':
      return t(lang, 'hintOpen');
    default:
      return t(lang, 'hintBalance');
  }
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (invite ? 'lan-guest' : 'ai'));
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup(0));
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<GameAction | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.quarto.sound') !== 'off';
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
      return localStorage.getItem('familyarcade.quarto.hostName') ?? '';
    } catch {
      return '';
    }
  });
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => invite?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => invite?.code ?? '');
  const [guestRoom] = useState(() => invite?.room ?? '');
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
  const playerName = useCallback(
    (player: Player) => t(lang, player === 0 ? 'player1' : 'player2'),
    [lang],
  );
  const playerWins = useCallback(
    (player: Player) => t(lang, 'playerWins', { player: playerName(player) }),
    [lang, playerName],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = `${t(lang, 'title')} · ${t(lang, 'brand')}`;
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.quarto.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.quarto.hostName', hostName);
    } catch {
      /* ignore */
    }
  }, [hostName]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
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
      setHint(null);
      setToast('');
      if (soundOn && next.status === 'playing') {
        chime(previous.phase === 'choose' ? 'choose' : 'place');
      }
      finish(next, currentMode);

      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.status === 'playing' && next.actions.length > 0) {
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
    const next = setup(0);
    stateRef.current = next;
    setMode(nextMode);
    setState(next);
    setHistory([]);
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
    setHint(null);
    setAiThinking(false);
    setRecorded(false);
    setScreen('game');
  }, [saved]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    if (mode === 'lan-host' || mode === 'lan-guest') return;
    if (state.status !== 'playing' || aiThinking) return;

    let previous: GameState;
    let nextHistory: GameState[];

    if (mode === 'ai') {
      let index = history.length - 1;
      while (
        index >= 0 &&
        !(history[index].status === 'playing' && history[index].turn === 0)
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

    const saveMode: 'ai' | 'local' = mode === 'ai' ? 'ai' : 'local';
    stateRef.current = previous;
    setHistory(nextHistory);
    setState(previous);
    setHint(null);
    setToast('');
    setRecorded(false);
    if (previous.actions.length > 0) {
      setSaved(saveGame({ state: previous, mode: saveMode, level }));
    } else {
      clearSave();
      setSaved(null);
    }
  }, [aiThinking, history, level, mode, state.status]);

  const showHint = useCallback(() => {
    if (state.status !== 'playing') return;
    if (mode === 'lan-host' || mode === 'lan-guest') return;
    if (mode === 'ai' && (state.turn !== 0 || aiThinking)) return;
    const nextHint = hintFor(state);
    if (!nextHint) return;
    setHint(nextHint.action);
    setToast(hintMessage(lang, nextHint));
  }, [aiThinking, lang, mode, state]);

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
      const name = hostName.trim() || t(lang, 'lanHostDefault');
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
          piece?: number;
          cell?: number;
          actionCount?: number;
        } | null;
        if (!value) return;
        const current = stateRef.current;
        if (
          typeof value.actionCount === 'number' &&
          value.actionCount !== current.actions.length
        ) {
          return;
        }
        let action: GameAction;
        if (value.type === 'choose' && Number.isInteger(value.piece)) {
          action = { type: 'choose', piece: Number(value.piece) };
        } else if (value.type === 'place' && Number.isInteger(value.cell)) {
          action = { type: 'place', cell: Number(value.cell) };
        } else {
          return;
        }
        const result = applySeat(current, seat, action);
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

      const url = inviteUrl(info, code, code, t(lang, 'lanGuestDefault'));
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        color: { dark: '#2b2119', light: '#fffaf0' },
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
    const next = setup(0);
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setHint(null);
    setRecorded(false);
    setAiThinking(false);
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
      if (!host || !lanPlayers[1]?.connected) return;
      const next = setup(0);
      stateRef.current = next;
      setState(next);
      setHistory([]);
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
  }, [lanPlayers, mode, startLocal]);

  const playAction = useCallback(
    (action: GameAction) => {
      if (screen !== 'game') return;
      if (mode === 'lan-guest') {
        if (!guestStarted || !guestView?.canAct) return;
        if (action.type === 'choose' && guestView.phase !== 'choose') return;
        if (action.type === 'place' && guestView.phase !== 'place') return;
        guest?.sendIntent({ ...action, actionCount: guestView.actionCount });
        return;
      }
      if (state.status !== 'playing') return;
      if (mode === 'ai' && (state.turn !== 0 || aiThinking)) return;

      let result;
      if (mode === 'lan-host') {
        if (!lanPlayers[1]?.connected || !lanHost || lanHost.status !== 'open') return;
        result = applySeat(state, 0, action);
      } else {
        result = applyAction(state, action);
      }
      if (!result.ok) return;
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
    ],
  );

  const joinGuest = useCallback(async () => {
    if (guestConnecting || guest) return;
    const name = guestName.trim();
    const code = guestCode.trim();
    const room = (guestRoom && code === (invite?.code ?? '') ? guestRoom : code).trim();
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
      setGuestView(null);
      setGuestStarted(false);
      setGuestPlayers([]);
      lastGuestMoveRef.current = -1;

      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        const next = payload as SeatView;
        if (!next || !Array.isArray(next.board) || next.board.length !== 16) return;
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
      setLanRole('guest');
      setScreen('lan');
    } finally {
      if (seq === guestJoinSeqRef.current) setGuestConnecting(false);
    }
  }, [guest, guestCode, guestConnecting, guestName, guestRoom, invite, lang]);

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
    if (screen !== 'game' || mode !== 'ai' || state.status !== 'playing' || state.turn !== 1) {
      return;
    }
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const action = chooseAction(state, level);
      setAiThinking(false);
      if (!action) return;
      const result = applyAction(state, action);
      if (!result.ok) return;
      commit(result.state, 'ai', state);
    }, 420);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, level, mode, screen, state]);

  // Keyboard path: native Tab/Enter for pieces and cells, plus small shortcuts.
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
      const key = event.key.toLowerCase();
      if (key === 'u') {
        event.preventDefault();
        undo();
      } else if (key === 'h') {
        event.preventDefault();
        showHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goHome, screen, showHint, undo]);

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

  // Guest sound follows the public view only.
  useEffect(() => {
    if (!guestView) {
      lastGuestMoveRef.current = -1;
      return;
    }
    const previous = lastGuestMoveRef.current;
    lastGuestMoveRef.current = guestView.actionCount;
    if (previous < 0 || guestView.actionCount <= previous || !soundOn) return;
    chime(guestView.status === 'draw' ? 'draw' : guestView.status === 'won' ? 'win' : 'place');
  }, [guestView, soundOn]);

  const isGuest = mode === 'lan-guest';
  const isLan = mode === 'lan-host' || mode === 'lan-guest';
  const shownBoard = guestView ? guestView.board : state.board;
  const shownPool = guestView ? guestView.pool : state.pool;
  const shownSelected = guestView ? guestView.selected : state.selected;
  const shownTurn = guestView ? guestView.turn : state.turn;
  const shownPhase = guestView ? guestView.phase : state.phase;
  const shownStatus = guestView ? guestView.status : state.status;
  const shownWinner = guestView ? guestView.winner : state.winner;
  const shownLine = guestView ? guestView.line : state.line;
  const shownAttributes = guestView ? guestView.attributes : state.attributes;
  const shownLastCell = guestView ? guestView.lastCell : state.lastCell;

  const guestOnline = Boolean(lanPlayers[1]?.connected);
  const guestCanAct = Boolean(guestView?.canAct) && guestStarted;
  const hostOnline = mode !== 'lan-host' || lanHost?.status === 'open';

  const canAct =
    shownStatus === 'playing' &&
    (isGuest
      ? guestCanAct
      : mode === 'lan-host'
        ? guestOnline && hostOnline && shownTurn === 0
        : mode === 'ai'
          ? shownTurn === 0 && !aiThinking
          : true);
  const boardInteractive = canAct && shownPhase === 'place';
  const trayInteractive = canAct && shownPhase === 'choose';

  const hintCell = hint?.type === 'place' ? hint.cell : null;
  const hintPiece = hint?.type === 'choose' ? hint.piece : null;

  const modeLabel =
    mode === 'ai'
      ? t(lang, level)
      : mode === 'local'
        ? tr('modeLocal')
        : mode === 'lan-host'
          ? tr('lanHostMode')
          : tr('lanGuestMode');

  let statusHeadline = '';
  let statusDetail = '';
  if (shownStatus === 'won') {
    statusHeadline = playerWins(shownWinner ?? 0);
    statusDetail = shownAttributes
      ? t(lang, 'winReason', { attrs: attributesDescription(lang, shownAttributes) })
      : '';
  } else if (shownStatus === 'draw') {
    statusHeadline = tr('draw');
    statusDetail = tr('drawReason');
  } else if (isGuest) {
    if (!guestStarted) {
      statusHeadline = tr('lanWaitingHost');
      statusDetail = tr('lanGuestSeat');
    } else if (guestCanAct) {
      statusHeadline = tr(shownPhase === 'choose' ? 'yourChoose' : 'yourPlace');
      statusDetail = tr(shownPhase === 'choose' ? 'chooseHint' : 'placeHint');
    } else {
      statusHeadline = tr('lanWaitingForHost');
      statusDetail = tr(shownPhase === 'choose' ? 'waitChoose' : 'waitPlace');
    }
  } else if (mode === 'ai') {
    if (shownTurn === 0) {
      statusHeadline = tr(shownPhase === 'choose' ? 'yourChoose' : 'yourPlace');
      statusDetail = tr(shownPhase === 'choose' ? 'chooseHint' : 'placeHint');
    } else {
      statusHeadline = tr(shownPhase === 'choose' ? 'aiChoosing' : 'aiPlacing');
      statusDetail = tr(LEVEL_HINT[level]);
    }
  } else if (mode === 'lan-host') {
    if (!guestOnline) {
      statusHeadline = tr('lanHostWaitingGuest');
      statusDetail = tr('lanGuestLeft');
    } else if (shownTurn === 0) {
      statusHeadline =
        shownPhase === 'choose'
          ? t(lang, 'chooseFor', { player: playerName(0), other: playerName(1) })
          : t(lang, 'placePiece', { player: playerName(0) });
      statusDetail = tr(shownPhase === 'choose' ? 'chooseHint' : 'placeHint');
    } else {
      statusHeadline = tr(shownPhase === 'choose' ? 'waitChoose' : 'waitPlace');
      statusDetail = tr('lanHostSeat');
    }
  } else if (shownPhase === 'choose') {
    statusHeadline = t(lang, 'chooseFor', {
      player: playerName(shownTurn),
      other: playerName(other(shownTurn)),
    });
    statusDetail = tr('chooseHint');
  } else {
    statusHeadline = t(lang, 'placePiece', { player: playerName(shownTurn) });
    statusDetail = tr('placeHint');
  }

  const sideTitle =
    mode === 'ai'
      ? t(lang, level)
      : mode === 'local'
        ? tr('modeLocal')
        : mode === 'lan-host'
          ? tr('lanHostMode')
          : tr('lanGuestMode');
  const sideDetail =
    mode === 'ai'
      ? tr(LEVEL_HINT[level])
      : mode === 'local'
        ? tr('localNote')
        : mode === 'lan-host'
          ? guestOnline
            ? tr('lanReady')
            : tr('lanHostWaitingGuest')
          : guestCanAct
            ? tr('yourTurn')
            : guestStarted
              ? tr('lanWaitingForHost')
              : tr('lanWaitingHost');

  const resultLabel = (winner: Player | 'draw') =>
    winner === 'draw' ? tr('draw') : playerWins(winner);
  const share = (count: number) =>
    record.games > 0 ? `${Math.round((count / record.games) * 100)}%` : '0%';
  const shareP1 = share(record.winsP1);
  const shareP2 = share(record.winsP2);
  const shareDraw = share(record.draws);
  const lastResultLabel = record.lastWinner === null ? tr('none') : resultLabel(record.lastWinner);
  const modeLabelFor = (value: RecordMode) =>
    value === 'ai' ? tr('modeAi') : value === 'local' ? tr('modeLocal') : tr('modeLan');
  const guestHostName = guestPlayers.find((player) => player.host)?.name;

  const undoDisabled =
    history.length === 0 || isLan || shownStatus !== 'playing' || aiThinking;
  const hintDisabled =
    shownStatus !== 'playing' ||
    isLan ||
    (mode === 'ai' && (state.turn !== 0 || aiThinking));

  const home = (
    <main className="shell home-shell" data-screen="home">
      <header className="masthead">
        <div>
          <p className="eyebrow">
            {tr('brand')} · {tr('edition')}
          </p>
          <h1>{tr('title')}</h1>
        </div>
        <div className="mast-actions">
          <button
            className="ghost"
            data-action="lang"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          >
            {tr('language')}
          </button>
          <button
            className="ghost"
            data-action="sound"
            onClick={() => setSoundOn((value) => !value)}
          >
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-board">
          <Board
            board={HERO_BOARD}
            line={[0, 1, 2, 3]}
            last={15}
            hint={null}
            interactive={false}
            onCell={() => undefined}
            lang={lang}
          />
          <p className="hero-note">{tr('heroNote')}</p>
        </div>
        <div className="hero-copy">
          <div className="menu">
            {saved && (
              <button className="primary wide" data-nav="continue" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>
                  {saved.mode === 'ai' ? t(lang, saved.level) : tr('modeLocal')} · {tr('saved')}
                </small>
              </button>
            )}
            <button
              className={saved ? 'secondary wide' : 'primary wide'}
              data-nav="ai"
              onClick={startAi}
            >
              {tr('playAi')}
            </button>
            <button
              className="secondary wide"
              data-nav="local"
              onClick={() => startLocal('local')}
            >
              {tr('playLocal')}
            </button>
            <button
              className="secondary wide lan-menu-button"
              data-nav="lan"
              onClick={openLanHub}
            >
              <span>{tr('playLan')}</span>
              <small>{tr('lanMenuHint')}</small>
            </button>
            <div className="menu-links">
              <button className="text-button" data-nav="rules" onClick={() => setScreen('rules')}>
                {tr('rules')} →
              </button>
              <button className="text-button" data-nav="stats" onClick={() => setScreen('stats')}>
                {tr('viewRecord')} →
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('stats')}</span>
            <strong>{record.games}</strong>
            <span>{t(lang, record.games === 1 ? 'gameOne' : 'games')}</span>
            <span className="dot">·</span>
            <span>
              {record.winsP1} {tr('winsP1')}
            </span>
            <span className="dot">·</span>
            <span>
              {record.winsP2} {tr('winsP2')}
            </span>
            <span className="dot">·</span>
            <span>
              {record.draws} {tr('draws')}
            </span>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell" data-screen="setup">
      <button className="back" data-action="home" onClick={goHome}>
        ← {tr('home')}
      </button>
      <h2 className="screen-title">{tr('difficulty')}</h2>
      <div className="level-grid">
        {AI_CARDS.map((item) => (
          <button
            key={item.id}
            className={`level-card ${level === item.id ? 'selected' : ''}`}
            data-level={item.id}
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
        <button className="primary" data-action="begin" onClick={() => startLocal('ai')}>
          {tr('begin')}
        </button>
        <button className="ghost" onClick={goHome}>
          {tr('back')}
        </button>
      </div>
    </main>
  );

  const gameScreen = (
    <main className="shell game-shell" data-screen="game">
      <header className="game-top">
        <button className="back" data-action="home" onClick={goHome}>
          ← {tr('home')}
        </button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
        </div>
        <div className="game-actions">
          <span className="mode-pill">{modeLabel}</span>
          <button
            className="icon-button"
            data-action="sound"
            onClick={() => setSoundOn((value) => !value)}
            aria-pressed={soundOn}
            aria-label={soundOn ? tr('soundOn') : tr('soundOff')}
            title={soundOn ? tr('soundOn') : tr('soundOff')}
          >
            <span className="sound-glyph" data-on={soundOn}>
              ♪
            </span>
          </button>
          <button
            className="ghost"
            data-action="lang"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          >
            {tr('language')}
          </button>
        </div>
      </header>

      <div className="game-layout">
        <section className="board-wrap">
          <div
            className={`turn-bar ${shownStatus !== 'playing' ? 'is-over' : ''}`}
            aria-live="polite"
          >
            {shownStatus === 'won' ? (
              <PlayerDot player={shownWinner ?? 0} size="md" />
            ) : shownStatus === 'draw' ? (
              <span className="draw-glyph" aria-hidden="true">
                =
              </span>
            ) : (
              <PlayerDot player={shownTurn} size="md" />
            )}
            <div className="turn-copy">
              <strong>{statusHeadline}</strong>
              <p>{statusDetail}</p>
            </div>
            {aiThinking && (
              <span className="thinking" aria-hidden="true">
                <i />
                <i />
                <i />
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
            line={shownLine}
            last={shownLastCell}
            hint={hintCell}
            interactive={boardInteractive}
            onCell={(cell) => playAction({ type: 'place', cell })}
            lang={lang}
          />

          {shownStatus !== 'playing' && (
            <div
              className={`result-banner ${shownStatus === 'draw' ? 'is-draw' : 'is-win'}`}
              role="status"
            >
              <div className="result-copy">
                <span className="result-kicker">
                  {shownStatus === 'draw' ? tr('gameOver') : tr('quarto')}
                </span>
                <strong>
                  {shownStatus === 'draw' ? tr('draw') : playerWins(shownWinner ?? 0)}
                </strong>
                <small>
                  {shownStatus === 'draw'
                    ? tr('drawReason')
                    : shownAttributes
                      ? t(lang, 'winReason', {
                          attrs: attributesDescription(lang, shownAttributes),
                        })
                      : ''}
                </small>
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
                    data-action="restart"
                    onClick={restartGame}
                    disabled={mode === 'lan-host' && !guestOnline}
                  >
                    {tr('restart')}
                  </button>
                  {mode === 'ai' && (
                    <button
                      className="secondary"
                      data-action="change-level"
                      onClick={() => setScreen('setup')}
                    >
                      {tr('changeLevel')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {shownStatus === 'playing' && shownPhase === 'place' && shownSelected !== null && (
            <div className="hand-card">
              <div className="hand-copy">
                <span className="label">{tr('pieceToPlace')}</span>
                <PieceTags piece={shownSelected} lang={lang} />
              </div>
              <span className="hand-piece">
                <Piece piece={shownSelected} />
              </span>
            </div>
          )}

          {shownStatus === 'playing' && shownPhase === 'choose' && (
            <Tray
              pool={shownPool}
              selected={shownSelected}
              interactive={trayInteractive}
              hint={hintPiece}
              onPiece={(piece) => playAction({ type: 'choose', piece })}
              lang={lang}
            />
          )}
        </section>

        <aside className="side">
          <div className="side-card">
            <div className="side-card-head">
              <h3>{sideTitle}</h3>
              {mode === 'lan-host' && (
                <span className={`status-dot ${guestOnline ? 'online' : ''}`} />
              )}
            </div>
            <p>{sideDetail}</p>
            <div className="side-actions">
              <button
                className="secondary"
                data-action="undo"
                onClick={undo}
                disabled={undoDisabled}
              >
                {tr('undo')}
              </button>
              <button
                className="secondary"
                data-action="hint"
                onClick={showHint}
                disabled={hintDisabled}
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
              <p>{guestOnline ? tr('lanReady') : tr('lanGuestLeft')}</p>
              {lanPlayers[1] && (
                <p className="peer">
                  {lanPlayers[1].name} ·{' '}
                  {lanPlayers[1].connected ? tr('lanOnline') : tr('lanOffline')}
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
                {guestCanAct
                  ? tr('yourTurn')
                  : guestStarted
                    ? tr('lanWaitingForHost')
                    : tr('lanWaitingHost')}
              </p>
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
              {record.games} {t(lang, record.games === 1 ? 'gameOne' : 'games')} · {record.winsP1}/{record.winsP2}/{record.draws}
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
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );

  const lanScreen = (
    <main
      className={`shell ${lanRole === 'host' ? 'narrow-shell' : 'lan-shell'}`}
      data-screen="lan"
    >
      <button className="back" data-action="home" onClick={goHome}>
        ← {tr('home')}
      </button>

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
                <span className="choice-icon" aria-hidden="true">
                  ⌂
                </span>
              </div>
              <h3>{tr('lanHost')}</h3>
              <p>{tr('lanHostLede')}</p>
              <label className="field">
                <span>{tr('lanHostName')}</span>
                <input
                  data-lan="host-name"
                  value={hostName}
                  onChange={(event) => setHostName(event.target.value)}
                  maxLength={18}
                  placeholder={tr('lanHostNamePlaceholder')}
                />
              </label>
              <button
                className="primary wide"
                data-action="create-room"
                onClick={openLanHost}
                disabled={lanBusy}
              >
                {lanBusy ? tr('lanStarting') : tr('lanHost')}
              </button>
            </section>

            <section className="lan-choice-card join-card">
              <div className="choice-head">
                <span className="tag">{tr('lanGuestTag')}</span>
                <span className="choice-icon" aria-hidden="true">
                  ↗
                </span>
              </div>
              <h3>{tr('lanJoin')}</h3>
              <p>{tr('lanJoinLede')}</p>
              <div className="field-row">
                <label className="field code-field">
                  <span>{tr('lanCode')}</span>
                  <input
                    data-lan="join-code"
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
                    data-lan="join-name"
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    maxLength={18}
                    placeholder={tr('lanName')}
                  />
                </label>
              </div>
              <button
                className="primary wide"
                data-action="join-room"
                onClick={joinGuest}
                disabled={guestConnecting}
              >
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
            </section>
          </div>
          {lanError && (
            <p className="error" role="alert">
              {lanError}
            </p>
          )}
          <p className="lan-footnote">{tr('lanHubNote')}</p>
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
                    <span
                      key={player.seat}
                      className={`peer-chip ${player.connected ? 'online' : ''}`}
                    >
                      <span className="peer-mark">
                        <PlayerDot player={player.seat === 0 ? 0 : 1} size="sm" />
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
                <button
                  className="primary wide"
                  data-action="start-lan"
                  onClick={startLan}
                  disabled={!guestOnline}
                >
                  {guestOnline ? tr('lanStart') : tr('lanWaiting')}
                </button>
                <button className="secondary wide" data-action="copy-invite" onClick={copyInvite}>
                  {tr('lanCopyLink')}
                </button>
                <button className="text-button" data-action="leave-room" onClick={goHome}>
                  {tr('lanLeave')}
                </button>
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
                    data-lan="guest-name"
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    maxLength={18}
                    placeholder={tr('lanName')}
                  />
                </label>
                <label>
                  <span>{tr('lanCode')}</span>
                  <input
                    data-lan="guest-code"
                    value={guestCode}
                    onChange={(event) =>
                      setGuestCode(event.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="0000"
                  />
                </label>
                <button
                  className="primary wide"
                  data-action="join-room"
                  onClick={joinGuest}
                  disabled={guestConnecting}
                >
                  {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
                </button>
              </div>
              <p className="hint-copy">{tr('lanGuestJoinNote')}</p>
            </div>
          )}
          {guest && (
            <div className="guest-card waiting-card">
              <div className="wait-orbit" aria-hidden="true">
                <PlayerDot player={1} size="lg" />
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

  const statsScreen = (
    <main className="shell stats-shell" data-screen="stats">
      <button className="back" data-action="home" onClick={goHome}>
        ← {tr('home')}
      </button>
      <header className="stats-head">
        <p className="eyebrow">{tr('recordEyebrow')}</p>
        <h2 className="screen-title">{tr('recordTitle')}</h2>
      </header>

      {record.games === 0 ? (
        <section className="empty-card">
          <span className="empty-mark" aria-hidden="true">
            4 × 4
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
            <div className="stat-card p1">
              <span>{tr('winsP1')}</span>
              <strong>{record.winsP1}</strong>
            </div>
            <div className="stat-card p2">
              <span>{tr('winsP2')}</span>
              <strong>{record.winsP2}</strong>
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
                <span className="share-p1" style={{ width: shareP1 }} />
                <span className="share-p2" style={{ width: shareP2 }} />
                <span className="share-d" style={{ width: shareDraw }} />
              </div>
              <ul className="share-legend">
                <li>
                  <i className="legend-p1" />
                  {tr('winsP1')} <strong>{record.winsP1}</strong>
                </li>
                <li>
                  <i className="legend-p2" />
                  {tr('winsP2')} <strong>{record.winsP2}</strong>
                </li>
                <li>
                  <i className="legend-d" />
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
              <h3>{tr('games')}</h3>
              <div className="mode-list">
                {(['ai', 'local', 'lan'] as const).map((value) => (
                  <div className="mode-row" key={value}>
                    <span>{modeLabelFor(value)}</span>
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
                    <span
                      className={`recent-mark ${
                        entry.winner === 'draw' ? 'draw' : `p${entry.winner + 1}`
                      }`}
                    >
                      {entry.winner === 'draw' ? '=' : entry.winner + 1}
                    </span>
                    <div className="recent-main">
                      <strong>{resultLabel(entry.winner)}</strong>
                      <span>
                        {modeLabelFor(entry.mode)}
                        {entry.level ? ` · ${t(lang, entry.level)}` : ''}
                      </span>
                    </div>
                    <span className="recent-moves">
                      {t(lang, 'moves', { n: entry.placements })}
                    </span>
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
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell" data-screen="rules">
      <button className="back" data-action="home" onClick={goHome}>
        ← {tr('home')}
      </button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <ol className="rules-list">
        <li>{tr('rule1')}</li>
        <li>{tr('rule2')}</li>
        <li>{tr('rule3')}</li>
        <li>{tr('rule4')}</li>
      </ol>

      <section className="attribute-card">
        <h3>{tr('attributesTitle')}</h3>
        <p>{tr('attributesNote')}</p>
        <div className="attribute-rows">
          {[
            { name: tr('color'), a: 0, b: 1, aLabel: 'light' as MessageKey, bLabel: 'dark' as MessageKey },
            { name: tr('shape'), a: 0, b: 2, aLabel: 'round' as MessageKey, bLabel: 'square' as MessageKey },
            { name: tr('height'), a: 0, b: 4, aLabel: 'short' as MessageKey, bLabel: 'tall' as MessageKey },
            { name: tr('top'), a: 0, b: 8, aLabel: 'solid' as MessageKey, bLabel: 'hollow' as MessageKey },
          ].map((row) => (
            <div className="attribute-row" key={row.name}>
              <span className="attribute-name">{row.name}</span>
              <figure className="attribute-example">
                <span className="attribute-piece">
                  <Piece piece={row.a} />
                </span>
                <figcaption>{t(lang, row.aLabel)}</figcaption>
              </figure>
              <figure className="attribute-example">
                <span className="attribute-piece">
                  <Piece piece={row.b} />
                </span>
                <figcaption>{t(lang, row.bLabel)}</figcaption>
              </figure>
            </div>
          ))}
        </div>
      </section>

      <div className="rules-extra">
        <p>
          <strong>{tr('lineTitle')}</strong>
          <br />
          {tr('lineNote')}
        </p>
        <p>
          <strong>{tr('lanTitle')}</strong>
          <br />
          {tr('lanStartHint')}
        </p>
        <p>
          <strong>{tr('stats')}</strong>
          <br />
          {tr('recordMiniNote')}
        </p>
      </div>
      <button className="primary" data-action="close" onClick={goHome}>
        {tr('close')}
      </button>
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
