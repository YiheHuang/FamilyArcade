import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseRoll, lineForMove, type AiLevel, type AiLineKey } from './ai/ai';
import { Board } from './components/Board';
import { Dice } from './components/Dice';
import {
  hint as computeHint,
  roll as rollState,
  rollWithDie,
  setup,
  view,
  type GameState,
  type Hint,
  type Move,
  type PlayerState,
  type SeatKind,
  type SeatView,
} from './game/ladder-run';
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
  type Record as FamilyRecord,
  type SavedGame,
} from './storage';
import { chime, type SoundKind } from './sound';
import { SEATS, seatTheme } from './theme';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'lan' | 'record';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type SetupMode = 'ai' | 'local' | 'lan-host';

const AI_LEVELS_UI: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

interface Note {
  line: AiLineKey;
  name: string;
  raw: number;
  to: number;
  n: number;
  over: number;
}

function defaultNames(mode: SetupMode, lang: Lang): string[] {
  if (mode === 'ai') {
    return [t(lang, 'youDefault'), t(lang, 'aiName1'), t(lang, 'aiName2'), t(lang, 'aiName3')];
  }
  if (mode === 'local') {
    return [t(lang, 'player1'), t(lang, 'player2'), t(lang, 'player3'), t(lang, 'player4')];
  }
  return [
    t(lang, 'hostDefault'),
    `${t(lang, 'guestDefault')} 2`,
    `${t(lang, 'guestDefault')} 3`,
    `${t(lang, 'guestDefault')} 4`,
  ];
}

function noteFromMove(move: Move, players: PlayerState[], level: AiLevel): Note {
  return {
    line: lineForMove(level, move),
    name: players[move.seat]?.name ?? '',
    raw: move.raw,
    to: move.to,
    n: move.overshoot ? move.from : move.to,
    over: Math.max(0, move.raw - 100),
  };
}

function noteText(note: Note, lang: Lang): string {
  return t(lang, note.line, {
    name: note.name,
    raw: note.raw,
    to: note.to,
    n: note.n,
    over: note.over,
  });
}

function rollSummary(move: Move, players: PlayerState[], lang: Lang): string {
  const name = players[move.seat]?.name ?? '';
  const head = t(lang, 'rolled', { name, n: move.roll });
  let tail: string;
  if (move.wins) tail = t(lang, 'movedTo', { n: 100 });
  else if (move.transport === 'ladder') tail = t(lang, 'climbed', { from: move.raw, to: move.to });
  else if (move.transport === 'snake') tail = t(lang, 'slid', { from: move.raw, to: move.to });
  else if (move.overshoot) tail = t(lang, 'overshoot', { n: move.from });
  else tail = t(lang, 'movedTo', { n: move.to });
  return `${head} · ${tail}`;
}

function hintText(hint: Hint, players: PlayerState[], lang: Lang): string {
  const name = players[hint.seat]?.name ?? '';
  const roll = hint.best.roll;
  switch (hint.reason) {
    case 'finish':
      return t(lang, 'hintFinishText', { roll, name });
    case 'ladder':
      return t(lang, 'hintLadderText', { roll, name, raw: hint.best.raw, to: hint.best.to });
    case 'snake':
      return t(lang, 'hintSnakeText', { roll, name, raw: hint.best.raw, to: hint.best.to });
    case 'overshoot':
      return t(lang, 'hintOverText', { roll, n: hint.best.from });
    default:
      return t(lang, 'hintSafeText', { roll, name, to: hint.best.to });
  }
}

function guessBadge(
  setupMode: SetupMode,
  seat: number,
  tr: (key: MessageKey, params?: Record<string, string | number>) => string,
): string {
  if (setupMode === 'ai') return seat === 0 ? tr('you') : tr('seatName', { n: seat + 1 });
  if (setupMode === 'local') return tr('seatName', { n: seat + 1 });
  return seat === 0 ? tr('hostBadge') : tr('guestBadge');
}

export default function App() {
  const initialLang: Lang = (() => {
    try {
      const query = new URLSearchParams(window.location.search).get('lang');
      if (query === 'zh' || query === 'en') return query;
    } catch {
      /* ignore */
    }
    return detectLang();
  })();
  const params = guestParams();

  const [lang, setLang] = useState<Lang>(initialLang);
  const [screen, setScreen] = useState<Screen>(() => (params?.room ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (params?.room ? 'lan-guest' : 'ai'));
  const [setupMode, setSetupMode] = useState<SetupMode>('ai');
  const [setupPlayers, setSetupPlayers] = useState(2);
  const [setupLevel, setSetupLevel] = useState<AiLevel>('normal');
  const [setupNames, setSetupNames] = useState<string[]>(() => defaultNames('ai', initialLang));
  const [state, setState] = useState<GameState>(() => setup({ players: 2 }));
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<Hint | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('familyarcade.ladder-run.sound');
      if (stored) return stored === 'on';
    } catch {
      /* ignore */
    }
    return true;
  });
  const [motionReduced, setMotionReduced] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('familyarcade.ladder-run.motion');
      if (stored) return stored === 'reduced';
    } catch {
      /* ignore */
    }
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const [toast, setToast] = useState('');
  const [rolling, setRolling] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [rulesReturn, setRulesReturn] = useState<Screen>('home');

  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [lanTotal, setLanTotal] = useState(2);
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => params?.name || t(initialLang, 'guestDefault'));
  const [guestCode, setGuestCode] = useState(() => params?.code ?? '');
  const [guestRoom] = useState(() => params?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const rollingRef = useRef(false);
  const recordedRef = useRef(false);
  const commitRef = useRef<(next: GameState, previous: GameState, currentMode: Mode) => void>(() => undefined);
  const actionRef = useRef({
    roll: () => undefined as void,
    hint: () => undefined as void,
    undo: () => undefined as void,
    home: () => undefined as void,
  });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );

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
      localStorage.setItem('familyarcade.ladder-run.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    document.documentElement.dataset.motion = motionReduced ? 'reduced' : 'full';
    try {
      localStorage.setItem('familyarcade.ladder-run.motion', motionReduced ? 'reduced' : 'full');
    } catch {
      /* ignore */
    }
  }, [motionReduced]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const sendLanViews = useCallback((next: GameState, host: LanHost | null = hostRef.current) => {
    if (!host) return;
    for (const peer of host.players) {
      if (peer.seat > 0 && peer.clientId) host.sendView(peer.seat, view(next, peer.seat));
    }
    if (next.status === 'won') host.sendResult(view(next, next.winner ?? 0));
  }, []);

  const commit = useCallback(
    (next: GameState, previous: GameState, currentMode: Mode) => {
      stateRef.current = next;
      setHistory((items) => [...items, previous]);
      setState(next);
      setHint(null);
      const move = next.lastMove;
      if (soundOn) {
        const kind: SoundKind = next.status === 'won'
          ? 'win'
          : move?.transport === 'ladder'
            ? 'ladder'
            : move?.transport === 'snake'
              ? 'snake'
              : 'roll';
        chime(kind);
      }
      if (move) {
        setToast(rollSummary(move, next.players, lang));
        if (currentMode === 'ai') {
          const level = next.players[move.seat]?.level ?? setupLevel;
          if (level === 'companion') {
            setNote({
              line: 'aiCompanionCheer',
              name: next.players[move.seat]?.name ?? '',
              raw: move.raw,
              to: move.to,
              n: move.to,
              over: 0,
            });
          } else if (next.players[move.seat]?.kind === 'ai') {
            setNote(noteFromMove(move, next.players, level));
          }
        }
      }
      if (next.status === 'won' && !recordedRef.current) {
        recordedRef.current = true;
        if (currentMode !== 'lan-guest') setRecord(recordResult(next));
      }
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.status === 'playing') {
          saveGame({ state: next, mode: currentMode, level: setupLevel });
        } else {
          clearSave();
        }
        setSaved(null);
      }
      if (currentMode === 'lan-host') sendLanViews(next);
    },
    [lang, sendLanViews, setupLevel, soundOn],
  );

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  useEffect(() => {
    setHint(null);
  }, [state.moves.length, guestView?.moveCount]);

  const closeLan = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanError('');
    guest?.close();
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
  }, [guest]);

  const openLanHost = async () => {
    const count = Math.min(4, Math.max(2, setupPlayers));
    const hostName = (setupNames[0] ?? '').trim().slice(0, 18) || t(lang, 'hostDefault');
    setLanTotal(count);
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
        name: hostName,
        maxPlayers: count,
      });
      hostRef.current = host;
      setLanHost(host);
      setLanCode(code);
      host.onChange((players) => {
        setLanPlayers(players);
        const current = stateRef.current;
        if (host.started) {
          for (const peer of players) {
            if (peer.seat > 0 && peer.connected) host.sendView(peer.seat, view(current, peer.seat));
          }
          if (current.status === 'won') host.sendResult(view(current, current.winner ?? 0));
        }
      });
      host.onIntent((seat, intent) => {
        const current = stateRef.current;
        const type = (intent as { type?: string } | null)?.type;
        if (type !== 'roll' || current.status !== 'playing' || current.turn !== seat) return;
        const result = rollState(current, Math.random, seat);
        if (!result.ok) return;
        commitRef.current(result.state, current, 'lan-host');
      });
      host.onClose(() => setLanError(tr('lanClosed')));
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 340,
          color: { dark: '#2b2620', light: '#fffaf0' },
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
    const host = hostRef.current;
    if (!host) return;
    const count = host.players.length;
    if (host.players.filter((player) => player.connected).length < count) return;
    const names = host.players.map((player, seat) => player.name || `Player ${seat + 1}`);
    const next = setup({
      players: count,
      names,
      kinds: ['human', ...Array<SeatKind>(count - 1).fill('remote')],
      levels: ['normal', ...Array<AiLevel>(count - 1).fill('normal')],
    });
    setMode('lan-host');
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setHint(null);
    setNote(null);
    resetRecorded();
    setRolling(false);
    setScreen('game');
    host.start();
    sendLanViews(next, host);
  };

  const joinGuest = async () => {
    if (!guestRoom || !guestName.trim() || !guestCode.trim()) return;
    setGuestConnecting(true);
    setLanError('');
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room: guestRoom,
        code: guestCode,
        name: guestName.trim().slice(0, 18),
      });
      setGuest(joined);
      setGuestStarted(false);
      joined.onView((payload) => {
        setGuestView(payload as SeatView);
        setGuestStarted(true);
        setScreen('game');
      });
      joined.onStart(() => {
        setGuestStarted(true);
      });
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? tr('lanFull') : tr('lanWrong'));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setLanError(
        message.includes('full')
          ? tr('lanFull')
          : message.includes('code')
            ? tr('lanWrong')
            : tr('lanDisconnected'),
      );
    } finally {
      setGuestConnecting(false);
    }
  };

  const resetRecorded = () => {
    recordedRef.current = false;
  };

  const startState = (next: GameState, nextMode: Mode) => {
    setMode(nextMode);
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setHint(null);
    setNote(null);
    setRolling(false);
    resetRecorded();
    setScreen('game');
    if (nextMode === 'ai' || nextMode === 'local') {
      saveGame({ state: next, mode: nextMode, level: setupLevel });
      setSaved(null);
    }
  };

  const nameForSetup = (seat: number): string => {
    const fallback = defaultNames(setupMode, lang)[seat] ?? `Player ${seat + 1}`;
    return (setupNames[seat] ?? '').trim().slice(0, 18) || fallback;
  };

  const beginSetup = () => {
    if (setupMode === 'lan-host') {
      void openLanHost();
      return;
    }
    const count = setupPlayers;
    const names = Array.from({ length: count }, (_, seat) => nameForSetup(seat));
    const kinds: SeatKind[] = Array.from({ length: count }, (_, seat) =>
      setupMode === 'ai' && seat > 0 ? 'ai' : 'human',
    );
    const levels: AiLevel[] = Array.from({ length: count }, (_, seat) =>
      setupMode === 'ai' && seat > 0 ? setupLevel : 'normal',
    );
    const next = setup({ players: count, names, kinds, levels });
    startState(next, setupMode === 'ai' ? 'ai' : 'local');
  };

  const openSetup = (nextMode: SetupMode) => {
    setSetupMode(nextMode);
    setSetupPlayers(2);
    setSetupNames(defaultNames(nextMode, lang));
    setScreen('setup');
  };

  const resume = () => {
    if (!saved) return;
    setMode(saved.mode);
    setSetupLevel(saved.level);
    setSetupPlayers(saved.state.players.length);
    setState(saved.state);
    setHistory([]);
    setHint(null);
    setNote(null);
    setRolling(false);
    resetRecorded();
    setScreen('game');
    setSaved(null);
  };

  const guestReady = guestStarted && Boolean(guestView);

  const shownPlayers = guestView?.players ?? state.players;
  const shownTurn = guestView?.turn ?? state.turn;
  const shownStatus = guestView?.status ?? state.status;
  const shownWinner = guestView ? guestView.winner : state.winner;
  const shownLastMove = guestView ? guestView.lastMove : state.lastMove;
  const shownLastRoll = guestView ? guestView.lastRoll : state.lastRoll;
  const shownMoveCount = guestView ? guestView.moveCount : state.moves.length;
  const currentPlayer = shownPlayers[shownTurn];
  const currentName = currentPlayer?.name ?? '';
  const winnerPlayer = shownWinner !== null ? shownPlayers[shownWinner] : null;
  const absentTurn =
    mode === 'lan-host' && shownTurn !== 0 && !lanPlayers[shownTurn]?.connected;

  const canAct =
    shownStatus === 'playing' &&
    (mode === 'lan-guest'
      ? guestReady && Boolean(guestView?.canRoll)
      : mode === 'ai'
        ? shownTurn === 0 && !aiThinking
        : mode === 'lan-host'
          ? shownTurn === 0 || absentTurn
          : true);

  const canHint =
    shownStatus === 'playing' &&
    (mode === 'local' ||
      (mode === 'ai' && shownTurn === 0) ||
      (mode === 'lan-host' && shownTurn === 0) ||
      (mode === 'lan-guest' && guestReady && Boolean(guestView?.canRoll)));

  const isHumanTurn =
    shownStatus === 'playing' &&
    (mode === 'local' ||
      (mode === 'ai' && shownTurn === 0) ||
      (mode === 'lan-host' && shownTurn === 0) ||
      (mode === 'lan-guest' && guestReady && Boolean(guestView?.canRoll)));

  const turnTitle = shownStatus === 'won'
    ? t(lang, 'winner', { name: winnerPlayer?.name ?? '' })
    : aiThinking
      ? t(lang, 'aiThinking', { name: currentName })
      : isHumanTurn && mode !== 'local'
        ? tr('yourTurn')
        : t(lang, 'turnOf', { name: currentName });

  const turnSub = shownStatus === 'won'
    ? t(lang, 'winnerSub', { name: winnerPlayer?.name ?? '' })
    : mode === 'ai'
      ? (aiThinking ? t(lang, 'aiThinking', { name: currentName }) : setupLevel === 'companion' ? tr('companionIdle') : tr('aiIdle'))
      : mode === 'local'
        ? t(lang, 'passDevice', { name: currentName })
        : mode === 'lan-host'
          ? absentTurn
            ? t(lang, 'lanAbsent', { name: currentName })
            : shownTurn === 0
              ? tr('lanHostTurn')
              : t(lang, 'lanGuestTurn', { name: currentName })
          : guestReady
            ? tr('lanGuestSeat')
            : tr('waitingGuest');

  const hintState: GameState = guestView
    ? {
        version: 1,
        players: guestView.players,
        turn: guestView.turn,
        status: guestView.status,
        winner: guestView.winner,
        lastRoll: guestView.lastRoll,
        lastMove: guestView.lastMove,
        moves: [],
      }
    : state;

  const firstAi = state.players.find((player) => player.kind === 'ai');
  const aiName = note?.name ?? firstAi?.name ?? currentName;

  const doRoll = () => {
    if (screen !== 'game' || rollingRef.current) return;
    if (mode === 'lan-guest') {
      if (!guestReady || !guestView?.canRoll || shownStatus !== 'playing') return;
      rollingRef.current = true;
      setRolling(true);
      guest?.sendIntent({ type: 'roll' });
      window.setTimeout(() => {
        rollingRef.current = false;
        setRolling(false);
      }, 520);
      return;
    }
    if (shownStatus !== 'playing') return;
    if (mode === 'ai' && shownTurn !== 0) return;
    if (mode === 'lan-host' && shownTurn !== 0 && lanPlayers[shownTurn]?.connected) return;
    const current = state;
    const result = rollState(current, Math.random, current.turn);
    if (!result.ok) {
      setToast(tr('errorRoll'));
      return;
    }
    rollingRef.current = true;
    setRolling(true);
    commit(result.state, current, mode);
    window.setTimeout(() => {
      rollingRef.current = false;
      setRolling(false);
    }, 460);
  };

  const showHint = () => {
    if (screen !== 'game' || !canHint) return;
    const source = hintState;
    const next = computeHint(source, source.turn);
    if (!next) return;
    setHint(next);
    setToast(tr('hintNoChoice'));
  };

  const undo = () => {
    if (screen !== 'game' || mode === 'lan-guest' || shownStatus !== 'playing' || history.length === 0) return;
    const items = [...history];
    let previous = items.pop();
    if (!previous) return;
    if (mode === 'ai') {
      while (previous.turn !== 0 && items.length > 0) {
        previous = items.pop() as GameState;
      }
    }
    setHistory(items);
    stateRef.current = previous;
    setState(previous);
    setHint(null);
    setNote(null);
    resetRecorded();
    if (mode === 'ai' || mode === 'local') {
      if (previous.status === 'playing') {
        saveGame({ state: previous, mode, level: setupLevel });
      }
      setSaved(null);
    }
    if (mode === 'lan-host' && hostRef.current) sendLanViews(previous);
    setToast(tr('undoDone'));
  };

  const rematch = () => {
    if (mode === 'lan-host') {
      startLan();
      return;
    }
    if (mode === 'lan-guest') return;
    window.scrollTo(0, 0);
    const next = setup({
      players: state.players.length,
      names: state.players.map((player) => player.name),
      kinds: state.players.map((player) => player.kind),
      levels: state.players.map((player) => player.level),
    });
    startState(next, mode);
  };

  const goHome = () => {
    if (mode === 'ai' || mode === 'local') {
      if (state.status === 'playing') {
        saveGame({ state, mode, level: setupLevel });
        setSaved(loadSave());
      } else {
        setSaved(null);
      }
    }
    closeLan();
    setHint(null);
    setNote(null);
    setScreen('home');
  };

  const openRules = (from: Screen) => {
    setRulesReturn(from);
    setScreen('rules');
  };

  const resetRecord = () => {
    if (!window.confirm(tr('resetConfirm'))) return;
    setRecord(clearRecord());
  };

  const toggleLang = () => setLang((value) => (value === 'zh' ? 'en' : 'zh'));
  const toggleSound = () => setSoundOn((value) => !value);
  const toggleMotion = () => setMotionReduced((value) => !value);

  // AI seats roll themselves. The level only changes the commentary.
  useEffect(() => {
    if (mode !== 'ai' || screen !== 'game' || state.status !== 'playing' || state.turn === 0) return;
    const player = state.players[state.turn];
    if (!player || player.kind !== 'ai') return;
    let cancelled = false;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const choice = chooseRoll(state, player.level, Math.random);
      if (cancelled) return;
      const result = rollWithDie(state, choice.die, state.turn);
      setAiThinking(false);
      if (result.ok) commitRef.current(result.state, state, 'ai');
    }, 920);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [mode, screen, state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        actionRef.current.home();
        return;
      }
      if (screen !== 'game') return;
      const key = event.key.toLowerCase();
      if (key === 'r') {
        event.preventDefault();
        actionRef.current.roll();
      } else if (key === 'h') {
        event.preventDefault();
        actionRef.current.hint();
      } else if (key === 'u') {
        event.preventDefault();
        actionRef.current.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  actionRef.current = { roll: doRoll, hint: showHint, undo, home: goHome };

  const controls = (
    <div className="mast-actions">
      <button type="button" className="ghost" onClick={toggleLang}>
        {tr('language')}
      </button>
      <button type="button" className="ghost" onClick={toggleSound}>
        {soundOn ? tr('soundOn') : tr('soundOff')}
      </button>
      <button type="button" className="ghost" onClick={toggleMotion} aria-pressed={motionReduced}>
        {motionReduced ? tr('motionReduced') : tr('motionFull')}
      </button>
    </div>
  );

  const demoPlayers = (() => {
    const demo = setup({ players: 4 });
    const positions = [34, 58, 12, 0];
    demo.players.forEach((player, seat) => {
      player.position = positions[seat];
    });
    return demo.players;
  })();

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('eyebrow')}</p>
          <h1>
            {tr('title')}
            <span className="wordmark-alt">{lang === 'zh' ? 'Ladder Run' : '蛇梯棋'}</span>
          </h1>
          <p className="subtitle">{tr('subtitle')}</p>
        </div>
        {controls}
      </header>

      <section className="home-hero">
        <div className="home-copy">
          <p className="kicker">{tr('tagline')}</p>
          <p className="lede">{tr('ruleNoStrategy')}</p>
          <div className="badges">
            <span>{tr('badgePlayers')}</span>
            <span>{tr('badgeTime')}</span>
            <span>{tr('badgeAge')}</span>
          </div>
          {saved && (
            <button type="button" className="continue-card" onClick={resume} data-testid="continue-game">
              <span className="continue-card__icon">↻</span>
              <span>
                <strong>{tr('continue')}</strong>
                <small>
                  {tr('continueDesc')} · {saved.state.players.length} · {saved.mode === 'ai' ? tr('playAi') : tr('playLocal')}
                </small>
              </span>
              <span className="continue-card__arrow">→</span>
            </button>
          )}
          <div className="home-links">
            <button type="button" className="text-button" onClick={() => openRules('home')} data-testid="home-rules">
              {tr('rules')} →
            </button>
            <button type="button" className="text-button" onClick={() => setScreen('record')} data-testid="home-record">
              {tr('record')} →
            </button>
          </div>
        </div>
        <div className="home-art" aria-hidden="true">
          <Board players={demoPlayers} activeSeat={0} compact label={tr('title')} startLabel={tr('startSquare')} />
          <div className="floating-die">
            <Dice value={5} label={tr('roll')} />
          </div>
        </div>
      </section>

      <section className="mode-grid" aria-label={tr('title')}>
        <button
          type="button"
          className="mode-card mode-card--primary"
          onClick={() => openSetup('ai')}
          data-testid="play-ai"
        >
          <span className="mode-card__index">01</span>
          <span className="mode-card__body">
            <strong>{tr('playAi')}</strong>
            <small>{tr('playAiDesc')}</small>
          </span>
          <span className="mode-card__arrow">→</span>
        </button>
        <button type="button" className="mode-card" onClick={() => openSetup('local')} data-testid="play-local">
          <span className="mode-card__index">02</span>
          <span className="mode-card__body">
            <strong>{tr('playLocal')}</strong>
            <small>{tr('playLocalDesc')}</small>
          </span>
          <span className="mode-card__arrow">→</span>
        </button>
        <button type="button" className="mode-card" onClick={() => openSetup('lan-host')} data-testid="play-lan">
          <span className="mode-card__index">03</span>
          <span className="mode-card__body">
            <strong>{tr('playLan')}</strong>
            <small>{tr('playLanDesc')}</small>
          </span>
          <span className="mode-card__arrow">→</span>
        </button>
      </section>

      <section className="home-record">
        <div className="record-strip">
          <span>{tr('stats')}</span>
          <strong>{record.games}</strong>
          <span>{tr('games')}</span>
          <span className="dot">·</span>
          <span>
            {tr('bestStreak')} {record.bestStreak}
          </span>
          <span className="dot">·</span>
          <span>
            {record.lastWinnerName ? `${tr('lastWinner')}: ${record.lastWinnerName}` : tr('recordEmpty')}
          </span>
        </div>
        <div className="seat-tally" aria-label={tr('seatWins')}>
          {SEATS.map((seat) => (
            <span key={seat.seat} className="seat-tally__item" style={{ '--seat-color': seat.color } as CSSProperties}>
              <i />
              {lang === 'zh' ? seat.zh : seat.en} {record.wins[seat.seat]}
            </span>
          ))}
        </div>
      </section>

      <footer className="foot">
        <span>{tr('webOnly')}</span>
        <span>{tr('footerNote')}</span>
      </footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell setup-shell">
      <button type="button" className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <p className="eyebrow">{tr('eyebrow')}</p>
      <h1 className="screen-title">{tr('setupTitle')}</h1>
      <p className="lede">
        {setupMode === 'ai' ? tr('setupAiDesc') : setupMode === 'local' ? tr('setupLocalDesc') : tr('setupLanDesc')}
      </p>

      <section className="setup-section">
        <div className="setup-section__head">
          <h2>{tr('playersLabel')}</h2>
          <p>{tr('playersHint')}</p>
        </div>
        <div className="segmented" role="group" aria-label={tr('playersLabel')}>
          {[2, 3, 4].map((count) => (
            <button
              key={count}
              type="button"
              className={setupPlayers === count ? 'is-selected' : ''}
              onClick={() => setSetupPlayers(count)}
              aria-pressed={setupPlayers === count}
            >
              {count}
            </button>
          ))}
        </div>
      </section>

      <section className="setup-section">
        <div className="setup-section__head">
          <h2>{setupMode === 'lan-host' ? tr('hostName') : tr('namesLabel')}</h2>
          <p>{setupMode === 'lan-host' ? tr('lanPlayersNote') : tr('noDecisionsNote')}</p>
        </div>
        <div className="name-grid">
          {Array.from({ length: setupPlayers }, (_, seat) => {
            const theme = seatTheme(seat);
            const disabled = setupMode === 'lan-host' && seat > 0;
            return (
              <label key={seat} className={`name-card${disabled ? ' is-disabled' : ''}`}>
                <span className="name-card__top">
                  <span className="seat-dot" style={{ background: theme.color }} />
                  <span>{guessBadge(setupMode, seat, tr)}</span>
                  {setupMode === 'ai' && seat > 0 && <span className="pill">{tr('aiBadge')}</span>}
                </span>
                <input
                  value={setupNames[seat] ?? ''}
                  placeholder={defaultNames(setupMode, lang)[seat]}
                  maxLength={18}
                  disabled={disabled}
                  onChange={(event) =>
                    setSetupNames((names) => {
                      const next = [...names];
                      next[seat] = event.target.value;
                      return next;
                    })
                  }
                  aria-label={`${tr('seatName', { n: seat + 1 })}: ${tr('namesLabel')}`}
                />
              </label>
            );
          })}
        </div>
      </section>

      {setupMode === 'ai' && (
        <section className="setup-section">
          <div className="setup-section__head">
            <h2>{tr('levelLabel')}</h2>
            <p>{tr('levelHint')}</p>
          </div>
          <div className="level-grid">
            {AI_LEVELS_UI.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`level-card${setupLevel === item.id ? ' is-selected' : ''}`}
                onClick={() => setSetupLevel(item.id)}
                aria-pressed={setupLevel === item.id}
              >
                <span className={`level-dot ${item.id}`} />
                <strong>{tr(item.label)}</strong>
                <small>{tr(item.note)}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="setup-summary">
        <span className="card-label">{t(lang, 'tableFor', { n: setupPlayers })}</span>
        <p>
          {setupMode === 'ai'
            ? `${setupPlayers - 1} × ${tr('aiBadge')} · ${tr('you')}`
            : setupMode === 'local'
              ? tr('localTurnHint')
              : tr('lanStartWhenReady')}
        </p>
      </div>
      <button type="button" className="primary wide setup-begin" onClick={beginSetup} data-testid="setup-begin">
        {setupMode === 'lan-host' ? tr('openRoom') : tr('begin')}
      </button>
      <button type="button" className="text-button" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
    </main>
  );

  const playerRows = (
    <div className="player-rail">
      {shownPlayers.map((player) => {
        const theme = seatTheme(player.seat);
        return (
          <div
            key={player.seat}
            className={`player-row${player.seat === shownTurn && shownStatus === 'playing' ? ' is-turn' : ''}`}
            style={{ '--seat-color': theme.color, '--seat-soft': theme.soft } as CSSProperties}
          >
            <span className="player-row__dot" style={{ background: theme.color }}>
              {player.seat + 1}
            </span>
            <span className="player-row__name">
              <strong>{player.name}</strong>
              <small>
                {player.kind === 'ai' ? tr('aiBadge') : player.kind === 'remote' ? tr('guestBadge') : tr('seatName', { n: player.seat + 1 })}
                {' · '}
                {player.position}
                {player.seat === shownTurn && shownStatus === 'playing' ? ' ●' : ''}
              </small>
            </span>
            <span className="player-row__pos">{player.position}</span>
            <span className="player-row__bar">
              <i style={{ width: `${Math.max(2, player.position)}%` }} />
            </span>
          </div>
        );
      })}
    </div>
  );

  const hintCard = hint && (
    <div className="side-card hint-card" data-testid="hint-card">
      <span className="card-label">{tr('hintTitle')}</span>
      <p>{t(lang, 'hintExplain', { n: hint.best.from })}</p>
      <div className="hint-chips">
        {hint.previews.map((preview) => {
          const kind = preview.wins
            ? 'win'
            : preview.transport === 'ladder'
              ? 'ladder'
              : preview.transport === 'snake'
                ? 'snake'
                : preview.overshoot
                  ? 'over'
                  : 'safe';
          return (
            <span key={preview.roll} className={`hint-chip is-${kind}${hint.best.roll === preview.roll ? ' is-best' : ''}`}>
              <b>{preview.roll}</b>
              <span>
                {preview.wins ? '100' : preview.to}
                {preview.transport === 'ladder' ? ' ↑' : preview.transport === 'snake' ? ' ↓' : preview.overshoot ? ' ⊘' : ''}
              </span>
            </span>
          );
        })}
      </div>
      <p className="hint-reason">
        <strong>{t(lang, 'hintBest', { n: hint.best.roll })}</strong> {hintText(hint, shownPlayers, lang)}
      </p>
      <button type="button" className="text-button" onClick={() => setHint(null)}>
        {tr('hintClose')}
      </button>
    </div>
  );

  const gameScreen = (
    <main className="shell game-shell">
      <header className="game-top">
        <button type="button" className="back" onClick={goHome} data-testid="game-home">
          ← {tr('home')}
        </button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>
            {mode === 'ai'
              ? `${tr('playAi')} · ${tr(setupLevel)}`
              : mode === 'local'
                ? tr('playLocal')
                : mode === 'lan-host'
                  ? tr('lanHostTitle')
                  : tr('lanGuestTitle')}
          </span>
        </div>
        {controls}
      </header>

      <div className="game-layout">
        <section className="board-wrap">
          <div className="turn-bar" style={{ '--seat-color': seatTheme(shownTurn).color } as CSSProperties}>
            <span className="turn-chip" style={{ background: seatTheme(shownTurn).color }}>
              {shownTurn + 1}
            </span>
            <div>
              <strong>{turnTitle}</strong>
              <p>{turnSub}</p>
            </div>
            {(aiThinking || rolling) && <span className="thinking">···</span>}
          </div>

          <Board
            players={shownPlayers}
            lastMove={shownLastMove}
            activeSeat={shownStatus === 'playing' ? shownTurn : null}
            label={tr('title')}
            startLabel={tr('startSquare')}
          />

          <p className="board-caption">{tr('ruleBoard')}</p>
        </section>

        <aside className="side">
          <div className="side-card">
            <span className="card-label">{tr('lanPlayers')}</span>
            {playerRows}
          </div>

          <div className="side-card dice-card">
            <Dice
              value={shownLastRoll}
              rolling={rolling || aiThinking}
              onClick={doRoll}
              disabled={!canAct || rolling}
              label={tr('roll')}
              hint={shownLastRoll ? tr('lastRoll') : undefined}
            />
            <div className="dice-copy">
              {isHumanTurn ? (
                <>
                  <strong>{mode === 'local' ? t(lang, 'turnOf', { name: currentName }) : tr('yourTurn')}</strong>
                  <p>{mode === 'local' ? tr('localTurnHint') : tr('rollKey')}</p>
                </>
              ) : (
                <>
                  <strong>
                    {shownStatus === 'won'
                      ? tr('gameOver')
                      : absentTurn
                        ? t(lang, 'waitingFor', { name: currentName })
                        : t(lang, 'waitingFor', { name: currentName })}
                  </strong>
                  <p>
                    {shownStatus === 'won'
                      ? tr('gameOver')
                      : mode === 'lan-guest'
                        ? tr('waitingGuest')
                        : mode === 'lan-host'
                          ? absentTurn
                            ? t(lang, 'lanAbsent', { name: currentName })
                            : t(lang, 'lanGuestTurn', { name: currentName })
                          : mode === 'ai'
                            ? tr('aiIdle')
                            : tr('localTurnHint')}
                  </p>
                </>
              )}
            </div>
            <button
              type="button"
              className="primary wide roll-button"
              onClick={doRoll}
              disabled={!canAct || rolling}
              data-testid="roll-button"
            >
              {rolling || aiThinking
                ? tr('rolling')
                : absentTurn
                  ? t(lang, 'rollFor', { name: currentName })
                  : isHumanTurn
                    ? tr('roll')
                    : shownStatus === 'won'
                      ? tr('gameOver')
                      : tr('waitingFor', { name: currentName })}
            </button>
            <p className="keyboard-note">{tr('keyboardHint')}</p>
          </div>

          {hintCard}

          <div className="side-card action-card">
            <button
              type="button"
              className="secondary"
              onClick={undo}
              disabled={history.length === 0 || shownStatus !== 'playing' || mode === 'lan-guest'}
              data-testid="undo-button"
            >
              {tr('undo')} <kbd>U</kbd>
            </button>
            <button
              type="button"
              className="secondary"
              onClick={showHint}
              disabled={!canHint}
              data-testid="hint-button"
            >
              {tr('hint')} <kbd>H</kbd>
            </button>
            <button type="button" className="secondary" onClick={() => openRules('game')}>
              {tr('rules')}
            </button>
          </div>

          {!hint && mode === 'ai' && (
            <div className="side-card note-card">
              <span className="card-label">
                {setupLevel === 'companion' ? tr('companionSays') : tr('aiSays', { name: aiName })}
              </span>
              <p>
                {note
                  ? noteText(note, lang)
                  : setupLevel === 'companion'
                    ? tr('companionIdle')
                    : tr('aiIdle')}
              </p>
            </div>
          )}

          {!hint && mode === 'lan-host' && lanHost && (
            <div className="side-card lan-mini">
              <span className="card-label">{tr('lanCode')}</span>
              <div className="room-code">{lanCode}</div>
              <p>{lanPlayers.filter((player) => player.connected).length} / {lanTotal} {tr('lanConnected')}</p>
              <div className="peer-list">
                {lanPlayers.map((player) => (
                  <span key={player.seat} className={player.connected ? 'online' : ''}>
                    <i style={{ background: seatTheme(player.seat).color }} />
                    {player.name} {player.connected ? '●' : '○'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!hint && (
            <div className="side-card last-card">
              <span className="card-label">{tr('lastRoll')}</span>
              <p>{shownLastMove ? rollSummary(shownLastMove, shownPlayers, lang) : tr('noRollYet')}</p>
              <p className="muted">
                {t(lang, 'rollsSoFar', { n: shownMoveCount })}
              </p>
            </div>
          )}
        </aside>
      </div>

      <div className="mobile-roll">
        <div className="mobile-roll__text">
          <strong>{turnTitle}</strong>
          <span>{turnSub}</span>
        </div>
        <Dice
          value={shownLastRoll}
          rolling={rolling || aiThinking}
          onClick={doRoll}
          disabled={!canAct || rolling}
          label={tr('roll')}
        />
        <button type="button" className="primary" onClick={doRoll} disabled={!canAct || rolling}>
          {rolling || aiThinking ? tr('rolling') : tr('roll')}
        </button>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}

      {shownStatus === 'won' && winnerPlayer && (
        <div className="result-scrim" role="dialog" aria-modal="true" aria-label={t(lang, 'winner', { name: winnerPlayer.name })}>
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 22 }, (_, index) => (
              <span
                key={index}
                style={{
                  left: `${(index * 37) % 100}%`,
                  background: seatTheme(index % 4).color,
                  animationDelay: `${(index % 8) * 0.09}s`,
                  transform: `rotate(${(index * 47) % 360}deg)`,
                }}
              />
            ))}
          </div>
          <div className="result-card" data-testid="result-card">
            <p className="eyebrow">{tr('gameOver')}</p>
            <span className="result-token" style={{ background: seatTheme(winnerPlayer.seat).color }}>
              {winnerPlayer.seat + 1}
            </span>
            <h2>{t(lang, 'winner', { name: winnerPlayer.name })}</h2>
            <p>{t(lang, 'winnerSub', { name: winnerPlayer.name })}</p>
            <p className="muted">{t(lang, 'winnerTurns', { n: shownMoveCount })}</p>
            <div className="result-actions">
              {mode === 'lan-guest' ? (
                <span className="muted">{tr('rematchWaiting')}</span>
              ) : (
                <button type="button" className="primary" onClick={rematch} disabled={mode === 'lan-host' && lanPlayers.filter((player) => player.connected).length < lanTotal}>
                  {tr('playAgain')}
                </button>
              )}
              <button type="button" className="secondary" onClick={goHome}>
                {tr('backHome')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell rules-shell">
      <button type="button" className="back" onClick={() => setScreen(rulesReturn)}>
        ← {tr('back')}
      </button>
      <p className="eyebrow">{tr('eyebrow')}</p>
      <h1 className="screen-title">{tr('rulesTitle')}</h1>
      <p className="lede">{tr('rulesIntro')}</p>
      <div className="rules-board">
        <span>{tr('ruleBoard')}</span>
        <span className="rules-board__ladder">↗ 3 · 8 · 20 · 28 · 36 · 51 · 63 · 71 · 78</span>
        <span className="rules-board__snake">↘ 17 · 32 · 45 · 54 · 61 · 69 · 74 · 82 · 89 · 96 · 99</span>
      </div>
      <ol className="rules-list">
        <li>{tr('rule1')}</li>
        <li>{tr('rule2')}</li>
        <li>{tr('rule3')}</li>
        <li>{tr('rule4')}</li>
        <li>{tr('rule5')}</li>
        <li>{tr('rule6')}</li>
      </ol>
      <p className="rules-note">{tr('ruleNoStrategy')}</p>
      <button type="button" className="primary" onClick={() => setScreen(rulesReturn)}>
        {tr('rulesClose')}
      </button>
    </main>
  );

  const recordScreen = (
    <main className="shell narrow-shell record-shell">
      <button type="button" className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <p className="eyebrow">{tr('eyebrow')}</p>
      <h1 className="screen-title">{tr('familyRecord')}</h1>
      <p className="lede">{tr('recordSub')}</p>
      <div className="record-hero">
        <div>
          <span>{tr('games')}</span>
          <strong>{record.games}</strong>
        </div>
        <div>
          <span>{tr('bestStreak')}</span>
          <strong>{record.bestStreak}</strong>
        </div>
        <div>
          <span>{tr('lastWinner')}</span>
          <strong>{record.lastWinnerName ?? '—'}</strong>
        </div>
      </div>
      {record.games === 0 ? (
        <div className="empty-record">
          <strong>{tr('recordEmpty')}</strong>
          <p>{tr('recordEmptyHint')}</p>
        </div>
      ) : (
        <div className="record-table">
          {SEATS.map((seat) => {
            const wins = record.wins[seat.seat];
            const max = Math.max(1, ...record.wins);
            return (
              <div key={seat.seat} className="record-row" style={{ '--seat-color': seat.color } as CSSProperties}>
                <span className="seat-dot" style={{ background: seat.color }} />
                <span className="record-row__name">
                  {lang === 'zh' ? `${seat.zh}色` : `${seat.en} seat`}
                  <small>{tr('seatName', { n: seat.seat + 1 })}</small>
                </span>
                <span className="record-row__bar">
                  <i style={{ width: `${(wins / max) * 100}%` }} />
                </span>
                <strong>{wins}</strong>
              </div>
            );
          })}
        </div>
      )}
      <p className="muted record-note">{tr('recordHint')}</p>
      <button type="button" className="secondary" onClick={resetRecord}>
        {tr('resetRecord')}
      </button>
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell lan-shell">
      <button
        type="button"
        className="back"
        onClick={() => {
          closeLan();
          setScreen('home');
        }}
      >
        ← {tr('back')}
      </button>

      {mode === 'lan-guest' || guestRoom ? (
        <>
          <p className="eyebrow">{tr('eyebrow')}</p>
          <h1 className="screen-title">{tr('lanGuestTitle')}</h1>
          <p className="lede">{tr('lanGuestDesc')}</p>
          {!guest ? (
            <div className="lan-form">
              <label>
                <span>{tr('lanName')}</span>
                <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={18} />
              </label>
              <label>
                <span>{tr('lanCode')}</span>
                <input value={guestCode} onChange={(event) => setGuestCode(event.target.value)} inputMode="numeric" maxLength={4} />
              </label>
              <p className="muted">{tr('lanJoinDesc')}</p>
              <button
                type="button"
                className="primary wide"
                onClick={joinGuest}
                disabled={guestConnecting || !guestName.trim() || !guestCode.trim() || !guestRoom}
                data-testid="guest-join"
              >
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
            </div>
          ) : (
            <div className="lan-waiting">
              <span className="card-label">
                {tr('lanSeatIs', {
                  name: lang === 'zh' ? seatTheme(guest.seat).zh : seatTheme(guest.seat).en,
                })}
              </span>
              <div className="lan-waiting__dot" style={{ background: seatTheme(guest.seat).color }}>
                {guest.seat + 1}
              </div>
              <p>{guestStarted ? tr('lanReady') : tr('lanWaiting')}</p>
            </div>
          )}
          {lanError && <p className="error">{lanError}</p>}
        </>
      ) : (
        <>
          <p className="eyebrow">{tr('eyebrow')}</p>
          <h1 className="screen-title">{tr('lanHostTitle')}</h1>
          <p className="lede">{tr('lanHostDesc')}</p>
          {lanBusy && <p className="lede">{tr('lanStarting')}</p>}
          {lanError && <p className="error">{lanError}</p>}
          {lanInfo && lanInvite && (
            <>
              <p className="muted">{tr('lanHostNote')}</p>
              <div className="lan-layout">
                <div className="lan-card">
                  <span className="card-label">{tr('lanCode')}</span>
                  <div className="room-code big">{lanCode}</div>
                  <p>{tr('lanRoomFor', { n: lanTotal })}</p>
                  <div className="peer-list lan-peer-list">
                    {lanPlayers.map((player) => (
                      <span key={player.seat} className={player.connected ? 'online' : ''}>
                        <i style={{ background: seatTheme(player.seat).color }} />
                        {player.name}
                        <small>{player.connected ? tr('lanConnected') : tr('lanOffline')}</small>
                      </span>
                    ))}
                  </div>
                  <p className="muted">
                    {lanPlayers.filter((player) => player.connected).length === lanTotal
                      ? tr('lanReady')
                      : tr('lanWaitingPlayers', { n: Math.max(0, lanTotal - lanPlayers.filter((player) => player.connected).length) })}
                  </p>
                  <button
                    type="button"
                    className="primary wide"
                    onClick={startLan}
                    disabled={!lanHost || lanPlayers.filter((player) => player.connected).length < lanTotal}
                    data-testid="lan-start"
                  >
                    {tr('lanStart')}
                  </button>
                  <button
                    type="button"
                    className="secondary wide"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(lanInvite);
                        setToast(tr('lanCopied'));
                      } catch {
                        setToast(lanInvite);
                      }
                    }}
                  >
                    {tr('lanCopy')}
                  </button>
                </div>
                <div className="qr-card">
                  {lanQr ? <img src={lanQr} alt={tr('lanScan')} /> : null}
                  <p>{tr('lanScan')}</p>
                  <code>{lanInvite.replace(/^https?:\/\//, '')}</code>
                  <p className="muted">{tr('lanGuestUrlHint')}</p>
                </div>
              </div>
            </>
          )}
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'record') return recordScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
