import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import {
  LanGuest,
  LanHost,
  guestParams,
  newRoomCode,
  type LanPublicPeer,
} from '@family-arcade/lan';
import { advise, planTurn, type AiLevel, type AiPlan } from './ai/ai';
import { Die, DieFace } from './components/Die';
import { Scorecard } from './components/Scorecard';
import {
  applyAction,
  categoryAt,
  classifyHand,
  createGame,
  openCategories,
  scoreDice,
  viewFor,
  winners,
  type Action,
  type GameState,
  type Player,
  type SeatView,
} from './game/five-dice';
import {
  CATEGORY_KEYS,
  HAND_KEYS,
  REASON_KEYS,
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
  clearRecord,
  clearSave,
  loadRecord,
  loadSave,
  recordResult,
  saveGame,
  type Record,
  type SavedGame,
} from './storage';
import { chime, type ChimeKind } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'record' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type LanRole = 'none' | 'host' | 'guest';

const PLAYER_COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)'];

const AI_META: Array<{ id: AiLevel; label: MessageKey; note: MessageKey }> = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const HERO_DICE = [2, 5, 3, 6, 4];

function makeRng(seed: number | null): () => number {
  if (seed === null) return Math.random;
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let value = Math.imul(a ^ (a >>> 15), 1 | a);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromUrl(): number | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('seed');
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function joinNames(lang: Lang, names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  const separator = lang === 'zh' ? '、' : ', ';
  const lastSeparator = lang === 'zh' ? '、' : ' & ';
  return `${names.slice(0, -1).join(separator)}${lastSeparator}${names[names.length - 1]}`;
}

function parseAction(intent: unknown): Action | null {
  if (!intent || typeof intent !== 'object') return null;
  const raw = intent as { type?: unknown; index?: unknown; category?: unknown; hold?: unknown };
  if (raw.type === 'roll') {
    const hold =
      Array.isArray(raw.hold) && raw.hold.length === 5 ? raw.hold.map(Boolean) : undefined;
    return { type: 'roll', hold };
  }
  if (raw.type === 'hold' && typeof raw.index === 'number') {
    return { type: 'hold', index: raw.index };
  }
  if (raw.type === 'score' && typeof raw.category === 'number') {
    return { type: 'score', category: raw.category };
  }
  return null;
}

function formatDate(lang: Lang, at: number): string {
  try {
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(at));
  } catch {
    return '';
  }
}

function playerStyle(seat: number): CSSProperties {
  return { '--pc': PLAYER_COLORS[Math.max(0, Math.min(3, seat))] } as CSSProperties;
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (guestParams()?.room ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [playerCount, setPlayerCount] = useState(2);
  const [names, setNames] = useState<string[]>(['', '', '', '']);
  const [state, setState] = useState<GameState>(() =>
    createGame([
      { name: 'You', ai: false },
      { name: 'AI 1', ai: true, level: 'normal' },
    ]),
  );
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<AiPlan | null>(null);
  const [record, setRecord] = useState<Record>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.five-dice.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const [initialGuest] = useState(() => guestParams());
  const [guestRoom] = useState(() => initialGuest?.room ?? '');
  const [guestName, setGuestName] = useState(() => initialGuest?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => initialGuest?.code ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);

  const [lanRole, setLanRole] = useState<LanRole>(() => (initialGuest?.room ? 'guest' : 'none'));
  const [lanCount, setLanCount] = useState(2);
  const [lanHostName, setLanHostName] = useState('');
  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');

  const stateRef = useRef(state);
  const modeRef = useRef(mode);
  const levelRef = useRef(level);
  const soundRef = useRef(soundOn);
  const langRef = useRef(lang);
  const recordedRef = useRef(false);
  const hostRef = useRef<LanHost | null>(null);
  const rngRef = useRef(makeRng(seedFromUrl()));

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    soundRef.current = soundOn;
    try {
      localStorage.setItem('familyarcade.five-dice.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    langRef.current = lang;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setConfirmReset(false);
  }, [screen]);

  const adoptState = useCallback((next: GameState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const sendHostViews = useCallback((next: GameState) => {
    const host = hostRef.current;
    if (!host) return;
    for (const player of host.publicPlayers()) {
      if (player.seat > 0) host.sendView(player.seat, viewFor(next, player.seat));
    }
  }, []);

  const commit = useCallback(
    (next: GameState, options: { history: boolean; sound: ChimeKind }) => {
      const previous = stateRef.current;
      if (options.history) setHistory((items) => [...items.slice(-49), previous]);
      stateRef.current = next;
      setState(next);
      setHint(null);

      const currentMode = modeRef.current;
      const over = next.status !== 'playing';
      const sound: ChimeKind = over ? (winners(next).length > 1 ? 'tie' : 'win') : options.sound;
      if (soundRef.current) chime(sound);

      if (next.last && options.sound === 'score') {
        const langNow = langRef.current;
        const playerName = next.players[next.last.player]?.name ?? '';
        setToast(
          t(langNow, 'toastScored', {
            name: playerName,
            points: next.last.points,
            category: t(langNow, CATEGORY_KEYS[next.last.category]),
          }),
        );
      }

      if (over) {
        if ((currentMode === 'ai' || currentMode === 'local') && !recordedRef.current) {
          recordedRef.current = true;
          setRecord(recordResult(next));
        }
        clearSave();
        setSaved(null);
      } else if (currentMode === 'ai' || currentMode === 'local') {
        saveGame({ state: next, mode: currentMode, level: levelRef.current });
        setSaved(null);
      }

      if (currentMode === 'lan-host') sendHostViews(next);
    },
    [sendHostViews],
  );

  const closeLan = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanInvite('');
    setLanQr('');
    setLanError('');
    setLanBusy(false);
    guest?.close();
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    setLanRole('none');
  }, [guest]);

  const leaveGame = useCallback(() => {
    closeLan();
    if (modeRef.current === 'ai' || modeRef.current === 'local') setSaved(loadSave());
    else setSaved(null);
    setScreen('home');
  }, [closeLan]);

  const beginGame = useCallback(() => {
    const count = Math.min(4, Math.max(2, playerCount));
    const players: Player[] = [];
    if (mode === 'ai') {
      players.push({ name: names[0].trim() || t(lang, 'lanYou'), ai: false });
      for (let index = 1; index < count; index += 1) {
        players.push({ name: `${t(lang, 'ai')} ${index}`, ai: true, level });
      }
    } else {
      for (let index = 0; index < count; index += 1) {
        players.push({
          name: names[index].trim() || t(lang, 'nameLabel', { n: index + 1 }),
          ai: false,
        });
      }
    }
    const next = createGame(players, 0);
    adoptState(next);
    setHistory([]);
    setHint(null);
    recordedRef.current = false;
    setScreen('game');
    clearSave();
    setSaved(null);
  }, [adoptState, lang, level, mode, names, playerCount]);

  const resumeGame = useCallback(() => {
    if (!saved) return;
    adoptState(saved.state);
    setMode(saved.mode);
    setLevel(saved.level);
    setHistory([]);
    setHint(null);
    recordedRef.current = saved.state.status !== 'playing';
    setScreen('game');
    setSaved(null);
  }, [adoptState, saved]);

  const startLanGame = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const seated = host
      .publicPlayers()
      .filter((player) => player.connected)
      .sort((a, b) => a.seat - b.seat)
      .slice(0, lanCount);
    if (seated.length < lanCount) return;
    const next = createGame(
      seated.map((player) => ({ name: player.name, ai: false })),
      0,
    );
    adoptState(next);
    setHistory([]);
    setHint(null);
    recordedRef.current = false;
    setMode('lan-host');
    modeRef.current = 'lan-host';
    setScreen('game');
    host.start();
    sendHostViews(next);
  }, [adoptState, lanCount, sendHostViews]);

  const playAgain = useCallback(() => {
    if (modeRef.current === 'lan-host') {
      startLanGame();
      return;
    }
    const next = createGame(stateRef.current.players, 0);
    adoptState(next);
    setHistory([]);
    setHint(null);
    recordedRef.current = false;
    setScreen('game');
    clearSave();
    setSaved(null);
  }, [adoptState, startLanGame]);

  const openLanHost = async () => {
    setLanRole('host');
    setMode('lan-host');
    setLanBusy(true);
    setLanError('');
    try {
      const info = await startLanServer();
      setLanInfo(info);
      const code = newRoomCode();
      const host = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room: code,
        code,
        name: lanHostName.trim() || t(lang, 'hostBadge'),
        maxPlayers: lanCount,
      });
      hostRef.current = host;
      setLanHost(host);
      setLanCode(code);
      host.onChange((players) => setLanPlayers(players));
      host.onClose(() => setLanError(t(langRef.current, 'lanClosed')));
      host.onIntent((seat, intent) => {
        const action = parseAction(intent);
        if (!action) return;
        const current = stateRef.current;
        const result = applyAction(current, seat, action, rngRef.current);
        if (!result.ok) return;
        commit(result.state, {
          history: false,
          sound: action.type === 'roll' ? 'roll' : action.type === 'hold' ? 'hold' : 'score',
        });
      });
      const url = inviteUrl(info, code, code, t(lang, 'guestDefaultName'));
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#1f473c', light: '#fbf6ea' },
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

  const joinGuest = async () => {
    const room = guestRoom || guestCode.trim();
    if (!room || !guestName.trim()) return;
    setGuestConnecting(true);
    setLanError('');
    guest?.close();
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room,
        code: guestCode.trim() || room,
        name: guestName.trim(),
      });
      setGuest(joined);
      setLanRole('guest');
      setMode('lan-guest');
      modeRef.current = 'lan-guest';
      joined.onView((payload) => setGuestView(payload as SeatView));
      joined.onStart(() => {
        setGuestStarted(true);
        setScreen('game');
      });
      joined.onError((reason) => {
        setLanError(
          reason === 'room-full'
            ? t(langRef.current, 'lanFull')
            : t(langRef.current, 'lanWrong'),
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLanError(
        message.includes('room-full')
          ? t(lang, 'lanFull')
          : message.includes('rejected')
            ? t(lang, 'lanWrong')
            : t(lang, 'lanDisconnected'),
      );
    } finally {
      setGuestConnecting(false);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(lanInvite);
      setToast(t(lang, 'lanCopied'));
    } catch {
      setToast(lanInvite);
    }
  };

  const isGuest = mode === 'lan-guest';
  const isLanHost = mode === 'lan-host';
  const connectedCount = lanPlayers.filter((player) => player.connected).length;
  const baseView: SeatView = isGuest && guestView ? guestView : viewFor(state, isLanHost ? 0 : state.turn);
  const activePlayer = baseView.players[baseView.turn];
  const guestSeatName = guestView ? guestView.players[guestView.seat]?.name ?? guestName : guestName;
  const activeSeat = baseView.status === 'over' ? -1 : baseView.turn;
  const aiTurn = mode === 'ai' && Boolean(baseView.players[baseView.turn]?.ai);
  const canAct =
    baseView.status === 'playing' &&
    (isGuest
      ? Boolean(guestStarted && guestView?.canAct)
      : isLanHost
        ? activeSeat === 0 && connectedCount === lanCount
        : !aiTurn);
  const canRoll = canAct && baseView.rollsLeft > 0;
  const canPickDice = canAct && baseView.rollsUsed > 0 && baseView.rollsLeft > 0;
  const canScoreNow = canAct && baseView.rollsUsed > 0;
  const canHint = canAct && !aiThinking && !isGuest;
  const canUndo =
    !isGuest &&
    !isLanHost &&
    baseView.status === 'playing' &&
    history.length > 0 &&
    !aiThinking;
  const roundNumber = Math.min(
    13,
    Math.floor(baseView.turnCount / baseView.players.length) + 1,
  );
  const rollsText = (n: number) => t(lang, n === 1 ? 'rollLeft' : 'rollsLeft', { n });
  const handKind = baseView.rollsUsed > 0 ? classifyHand(baseView.dice) : null;
  const handText = handKind ? t(lang, HAND_KEYS[handKind]) : t(lang, 'readyToRoll');
  const winningNames = baseView.winners.map(
    (seat) => baseView.players[seat]?.name ?? `Player ${seat + 1}`,
  );
  const resultTitle =
    winningNames.length > 1
      ? t(lang, 'winners', { names: joinNames(lang, winningNames) })
      : t(lang, 'winner', { name: winningNames[0] ?? '' });

  let turnText: string;
  if (baseView.status === 'over') turnText = t(lang, 'gameOver');
  else if (isGuest && !guestStarted) turnText = t(lang, 'lanWaitingHost');
  else if (isLanHost && activeSeat !== 0) {
    turnText = t(lang, 'waitingTurn', { name: activePlayer?.name ?? '' });
  } else if (mode === 'local') turnText = t(lang, 'turnOf', { name: activePlayer?.name ?? '' });
  else if (aiTurn) turnText = t(lang, 'aiThinking');
  else if (canAct) turnText = t(lang, 'yourTurn');
  else turnText = t(lang, 'waitingTurn', { name: activePlayer?.name ?? '' });

  const rollHuman = useCallback(() => {
    if (!canRoll) return;
    const current = stateRef.current;
    if (isGuest) {
      guest?.sendIntent({ type: 'roll' });
      return;
    }
    const seat = isLanHost ? 0 : current.turn;
    const result = applyAction(current, seat, { type: 'roll' }, rngRef.current);
    if (result.ok) commit(result.state, { history: true, sound: 'roll' });
  }, [canRoll, commit, guest, isGuest, isLanHost]);

  const toggleDie = useCallback(
    (index: number) => {
      if (!canPickDice) return;
      const current = stateRef.current;
      if (isGuest) {
        guest?.sendIntent({ type: 'hold', index });
        return;
      }
      const seat = isLanHost ? 0 : current.turn;
      const result = applyAction(current, seat, { type: 'hold', index }, rngRef.current);
      if (result.ok) commit(result.state, { history: false, sound: 'hold' });
    },
    [canPickDice, commit, guest, isGuest, isLanHost],
  );

  const scoreHuman = useCallback(
    (category: number) => {
      if (!canScoreNow) return;
      const current = stateRef.current;
      if (isGuest) {
        guest?.sendIntent({ type: 'score', category });
        return;
      }
      const seat = isLanHost ? 0 : current.turn;
      const result = applyAction(current, seat, { type: 'score', category }, rngRef.current);
      if (result.ok) commit(result.state, { history: true, sound: 'score' });
    },
    [canScoreNow, commit, guest, isGuest, isLanHost],
  );

  const showHint = useCallback(() => {
    if (!canHint || !canAct) return;
    if (stateRef.current.rollsUsed === 0) {
      setToast(t(lang, 'hintRollFirst'));
      return;
    }
    setHint(advise(stateRef.current));
    setToast(t(lang, 'toastHint'));
  }, [canAct, canHint, lang]);

  const undo = useCallback(() => {
    if (!canUndo || history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));
    adoptState(previous);
    setHint(null);
    setToast(t(lang, 'toastUndone'));
    const currentMode = modeRef.current;
    if (currentMode === 'ai' || currentMode === 'local') {
      if (previous.status === 'playing') {
        saveGame({ state: previous, mode: currentMode, level: levelRef.current });
        setSaved(null);
      } else {
        clearSave();
        setSaved(null);
      }
    }
  }, [adoptState, canUndo, history, lang]);

  // AI takes one visible step at a time: roll, keep/roll, then score.
  useEffect(() => {
    if (mode !== 'ai' || state.status !== 'playing') return;
    const player = state.players[state.turn];
    if (!player?.ai) return;
    let cancelled = false;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const aiLevel = player.level ?? 'normal';
      const plan = planTurn(state, aiLevel, rngRef.current);
      const action: Action =
        state.rollsUsed === 0
          ? { type: 'roll' }
          : state.rollsLeft > 0 && plan.shouldRoll
            ? { type: 'roll', hold: plan.hold }
            : { type: 'score', category: plan.category };
      let result = applyAction(state, state.turn, action, rngRef.current);
      if (!result.ok && action.type === 'score') {
        const fallback = openCategories(state)[0];
        if (fallback !== undefined) {
          result = applyAction(
            state,
            state.turn,
            { type: 'score', category: fallback },
            rngRef.current,
          );
        }
      }
      setAiThinking(false);
      if (result.ok) {
        commit(result.state, {
          history: false,
          sound: action.type === 'roll' ? 'roll' : 'score',
        });
      }
    }, 560);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, mode, state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (screen === 'game') leaveGame();
        else if (screen === 'lan') {
          closeLan();
          setScreen('home');
        } else setScreen('home');
        return;
      }
      if (screen !== 'game') return;
      const key = event.key.toLowerCase();
      if (key === 'r') {
        event.preventDefault();
        rollHuman();
      } else if (key === 'h') {
        event.preventDefault();
        showHint();
      } else if (key === 'u') {
        event.preventDefault();
        undo();
      } else if (/^[1-5]$/.test(key)) {
        event.preventDefault();
        toggleDie(Number(key) - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const hintCategory = hint?.category ?? null;
  const hintCategoryId = hintCategory !== null ? categoryAt(hintCategory) : null;
  const hintPoints =
    hintCategoryId && baseView.rollsUsed > 0 ? scoreDice(baseView.dice, hintCategoryId) : 0;
  const hintKeepCount = hint ? hint.hold.filter(Boolean).length : 0;
  const hintText = hint
    ? baseView.rollsLeft > 0 && hint.shouldRoll
      ? hintKeepCount > 0
        ? t(lang, 'hintKeepRoll', {
            n: hintKeepCount,
            category: hintCategoryId ? t(lang, CATEGORY_KEYS[hintCategoryId]) : '',
          })
        : t(lang, 'hintReroll', {
            category: hintCategoryId ? t(lang, CATEGORY_KEYS[hintCategoryId]) : '',
          })
      : t(lang, 'hintScore', {
          category: hintCategoryId ? t(lang, CATEGORY_KEYS[hintCategoryId]) : '',
          points: hintPoints,
        })
    : '';

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{t(lang, 'eyebrow')}</p>
          <h1>{t(lang, 'title')}</h1>
          <p className="subtitle">{t(lang, 'subtitle')}</p>
        </div>
        <div className="mast-actions">
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {t(lang, 'language')}
          </button>
          <button className="ghost" onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? t(lang, 'soundOn') : t(lang, 'soundOff')}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-table" aria-hidden="true">
          <div className="felt-ring" />
          <div className="hero-dice">
            {HERO_DICE.map((value, index) => (
              <span key={index} className={`hero-die d${index + 1}`}>
                <DieFace value={value} />
              </span>
            ))}
          </div>
          <div className="hero-table-foot">
            <span><b>13</b><small>{t(lang, 'heroBoxes')}</small></span>
            <span><b>5</b><small>{t(lang, 'heroDice')}</small></span>
            <span><b>3</b><small>{t(lang, 'heroRolls')}</small></span>
          </div>
        </div>

        <div className="hero-copy">
          <p className="kicker">{t(lang, 'tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resumeGame}>
                <span>{t(lang, 'continue')}</span>
                <small>
                  {saved.mode === 'ai' ? t(lang, 'modeAi') : t(lang, 'modeLocal')} ·{' '}
                  {t(lang, 'saved')}
                </small>
              </button>
            )}
            <button
              className={saved ? 'secondary wide' : 'primary wide'}
              onClick={() => {
                setMode('ai');
                setScreen('setup');
              }}
            >
              <span>{t(lang, 'playAi')}</span>
              <small>{t(lang, 'setupAiLede')}</small>
            </button>
            <button
              className="secondary wide"
              onClick={() => {
                setMode('local');
                setScreen('setup');
              }}
            >
              <span>{t(lang, 'playHotseat')}</span>
              <small>{t(lang, 'setupLocalLede')}</small>
            </button>
            <button
              className="secondary wide"
              onClick={() => {
                closeLan();
                setScreen('lan');
              }}
            >
              <span>{t(lang, 'playLan')}</span>
              <small>{t(lang, 'lanLede')}</small>
            </button>
            <button className="text-button" onClick={() => setScreen('rules')}>
              {t(lang, 'rules')} →
            </button>
            <button className="text-button" onClick={() => setScreen('record')}>
              {t(lang, 'record')} →
            </button>
          </div>

          <div className="record-strip">
            <span>{t(lang, 'familyRecord')}</span>
            {record.games > 0 ? (
              <>
                <strong>{record.games}</strong>
                <span>{t(lang, record.games === 1 ? 'gameOne' : 'gamesPlayed')}</span>
                <span className="dot">·</span>
                <span>
                  {t(lang, 'bestScore')} {record.bestScore}
                </span>
                <span className="dot">·</span>
                <span>
                  {t(lang, 'winStreak')} {record.streak}
                </span>
              </>
            ) : (
              <span>{t(lang, 'noRecord')}</span>
            )}
          </div>
        </div>
      </section>

      <section className="how-strip" aria-label={t(lang, 'rulesTitle')}>
        <div className="how-step">
          <span className="how-num">01</span>
          <strong>{t(lang, 'roll')}</strong>
          <p>{t(lang, 'rollsLeft', { n: 3 })}</p>
        </div>
        <div className="how-step">
          <span className="how-num">02</span>
          <strong>{t(lang, 'held')}</strong>
          <p>{t(lang, 'keepHint')}</p>
        </div>
        <div className="how-step">
          <span className="how-num">03</span>
          <strong>{t(lang, 'chooseBox')}</strong>
          <p>{t(lang, 'pickBoxHint')}</p>
        </div>
      </section>
      <footer className="foot">{t(lang, 'webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell setup-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {t(lang, 'back')}
      </button>
      <p className="eyebrow">{t(lang, 'eyebrow')}</p>
      <h2 className="screen-title">
        {mode === 'ai' ? t(lang, 'setupAiTitle') : t(lang, 'setupLocalTitle')}
      </h2>
      <p className="lede">{mode === 'ai' ? t(lang, 'setupAiLede') : t(lang, 'setupLocalLede')}</p>

      <div className="setup-layout">
        <section className="setup-card">
          <div className="field-block">
            <span className="field-label">{t(lang, 'playersAtTable')}</span>
            <div className="segmented" role="group" aria-label={t(lang, 'playersAtTable')}>
              {[2, 3, 4].map((count) => (
                <button
                  key={count}
                  className={playerCount === count ? 'selected' : ''}
                  onClick={() => setPlayerCount(count)}
                >
                  {t(lang, 'playerCount', { n: count })}
                </button>
              ))}
            </div>
          </div>

          <div className="name-fields">
            <label className="field">
              <span className="field-label">
                {mode === 'ai' ? t(lang, 'yourName') : t(lang, 'nameLabel', { n: 1 })}
              </span>
              <input
                value={names[0]}
                maxLength={18}
                placeholder={mode === 'ai' ? t(lang, 'yourName') : t(lang, 'namePlaceholder')}
                onChange={(event) =>
                  setNames((items) => items.map((name, index) => (index === 0 ? event.target.value : name)))
                }
              />
            </label>
            {mode === 'ai'
              ? Array.from({ length: playerCount - 1 }, (_, offset) => {
                  const index = offset + 1;
                  return (
                    <div className="ai-seat" key={index}>
                      <span className="seat-dot" style={playerStyle(index)} />
                      <span className="ai-seat-name">
                        {t(lang, 'ai')} {index}
                      </span>
                      <span className="ai-seat-level">{t(lang, level)}</span>
                    </div>
                  );
                })
              : Array.from({ length: playerCount - 1 }, (_, offset) => {
                  const index = offset + 1;
                  return (
                    <label className="field" key={index}>
                      <span className="field-label">{t(lang, 'nameLabel', { n: index + 1 })}</span>
                      <input
                        value={names[index]}
                        maxLength={18}
                        placeholder={t(lang, 'namePlaceholder')}
                        onChange={(event) =>
                          setNames((items) =>
                            items.map((name, seat) => (seat === index ? event.target.value : name)),
                          )
                        }
                      />
                    </label>
                  );
                })}
          </div>
        </section>

        <aside className="setup-aside">
          {mode === 'ai' ? (
            <>
              <span className="field-label">{t(lang, 'aiLevel')}</span>
              <div className="level-grid">
                {AI_META.map((item) => (
                  <button
                    key={item.id}
                    className={`level-card ${level === item.id ? 'selected' : ''}`}
                    onClick={() => setLevel(item.id)}
                  >
                    <span className={`level-dot ${item.id}`} />
                    <strong>{t(lang, item.label)}</strong>
                    <small>{t(lang, item.note)}</small>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="pass-card">
              <div className="pass-dice">
                {[1, 4, 6].map((value) => (
                  <span className="pass-die" key={value}>
                    <DieFace value={value} />
                  </span>
                ))}
              </div>
              <h3>{t(lang, 'setupLocalTitle')}</h3>
              <p>{t(lang, 'keyboardHint')}</p>
            </div>
          )}
          <button className="primary wide begin-button" onClick={beginGame}>
            {t(lang, 'beginGame')}
          </button>
        </aside>
      </div>
    </main>
  );

  const gameScreen = isGuest && !guestView ? (
    <main className="shell narrow-shell waiting-shell">
      <button className="back" onClick={leaveGame}>
        ← {t(lang, 'back')}
      </button>
      <p className="eyebrow">{t(lang, 'eyebrow')}</p>
      <h2 className="screen-title">{t(lang, 'lanGuestTitle')}</h2>
      <p className="lede">{t(lang, 'lanWaitingHost')}</p>
      <div className="room-code big">{guestCode || guestRoom}</div>
      <div className="thinking-line">
        <span className="spinner" /> {t(lang, 'lanConnecting')}
      </div>
      {lanError && <p className="error">{lanError}</p>}
    </main>
  ) : (
    <main className="shell game-shell">
      <header className="game-top">
        <button className="back" onClick={leaveGame}>
          ← {t(lang, 'home')}
        </button>
        <div className="game-id">
          <strong>{t(lang, 'title')}</strong>
          <span>
            {mode === 'ai'
              ? `${t(lang, 'modeAi')} · ${t(lang, level)}`
              : mode === 'local'
                ? t(lang, 'modeLocal')
                : mode === 'lan-host'
                  ? t(lang, 'modeLanHost')
                  : t(lang, 'modeLanGuest')}
          </span>
        </div>
        <div className="game-top-actions">
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {t(lang, 'language')}
          </button>
          <button className="ghost" onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? t(lang, 'soundOn') : t(lang, 'soundOff')}
          </button>
        </div>
      </header>

      <div className="game-layout">
        <section className="play-column">
          <div
            className="turn-bar"
            style={
              baseView.status === 'over'
                ? ({ '--pc': 'var(--gold)' } as CSSProperties)
                : playerStyle(activeSeat)
            }
          >
            <span className="turn-orb">
              <span className="turn-dot" />
            </span>
            <div className="turn-copy">
              <strong>{turnText}</strong>
              <p>
                {t(lang, 'round', { n: roundNumber })} ·{' '}
                {baseView.status === 'playing'
                  ? baseView.rollsLeft > 0
                    ? rollsText(baseView.rollsLeft)
                    : t(lang, 'chooseBox')
                  : t(lang, 'gameOver')}
              </p>
            </div>
            {aiThinking && <span className="thinking">…</span>}
            {isLanHost && <span className="room-pill">{t(lang, 'lanCode')} {lanCode}</span>}
          </div>

          <div className="player-rail">
            {baseView.players.map((player, seat) => (
              <span
                key={seat}
                className={`player-chip ${seat === activeSeat ? 'active' : ''}`}
                style={playerStyle(seat)}
              >
                <span className="chip-dot" />
                <span className="chip-name">{player.name}</span>
                <strong>{baseView.totals[seat].total}</strong>
              </span>
            ))}
          </div>

          {baseView.status === 'over' && (
            <section className="result-panel">
              <div className="result-head">
                <div>
                  <p className="kicker">{t(lang, 'gameOver')}</p>
                  <h2>{resultTitle}</h2>
                </div>
                <div className="result-actions">
                  {mode !== 'lan-guest' && (
                    <button
                      className="primary"
                      onClick={playAgain}
                      disabled={isLanHost && connectedCount < lanCount}
                    >
                      {t(lang, 'playAgain')}
                    </button>
                  )}
                  {mode !== 'lan-guest' && (
                    <button className="secondary" onClick={() => setScreen('record')}>
                      {t(lang, 'record')}
                    </button>
                  )}
                  <button className="ghost" onClick={leaveGame}>
                    {t(lang, 'backHome')}
                  </button>
                </div>
              </div>
              <ol className="standings-list">
                {baseView.standings.map((row) => (
                  <li
                    key={row.player}
                    className={baseView.winners.includes(row.player) ? 'winner' : ''}
                    style={playerStyle(row.player)}
                  >
                    <span className="rank">{row.rank}</span>
                    <span className="standing-name">{baseView.players[row.player]?.name}</span>
                    <strong>{row.total}</strong>
                  </li>
                ))}
              </ol>
              {mode === 'lan-guest' && <p className="muted">{t(lang, 'lanWaitingHost')}</p>}
            </section>
          )}

          <div className="dice-stage">
            <div className="dice-stage-head">
              <span className="field-label">
                {baseView.status === 'over'
                  ? t(lang, 'finalHandLabel', { hand: handText })
                  : t(lang, 'currentHand', { hand: handText })}
              </span>
              {baseView.status === 'playing' && (
                <span className="rolls-badge">
                  {baseView.rollsLeft > 0
                    ? rollsText(baseView.rollsLeft)
                    : t(lang, 'noRolls')}
                </span>
              )}
            </div>
            <div className="dice-row">
              {baseView.dice.map((value, index) => (
                <Die
                  key={index}
                  value={value}
                  held={baseView.held[index] ?? false}
                  highlighted={Boolean(hint && hint.shouldRoll && hint.hold[index])}
                  disabled={!canPickDice}
                  label={t(lang, 'a11yDie', {
                    n: index + 1,
                    value: value > 0 ? value : t(lang, 'a11yOpen'),
                    held: baseView.held[index] ? t(lang, 'a11yHeld') : '',
                  })}
                  heldLabel={t(lang, 'held')}
                  idleLabel={t(lang, 'tapToHold')}
                  onToggle={() => toggleDie(index)}
                />
              ))}
            </div>
            {baseView.status === 'playing' && (
              <div className="dice-actions">
                <button
                  className="primary roll-button"
                  onClick={rollHuman}
                  disabled={!canRoll}
                  aria-label={t(lang, 'a11yRollButton')}
                >
                  {baseView.rollsLeft > 0
                    ? baseView.rollsUsed === 0
                      ? t(lang, 'roll')
                      : t(lang, 'rollAgain')
                    : t(lang, 'noRolls')}
                </button>
                <button className="secondary tool-button" onClick={showHint} disabled={!canHint}>
                  {t(lang, 'hint')}
                </button>
                <button className="secondary tool-button" onClick={undo} disabled={!canUndo}>
                  {t(lang, 'undo')}
                </button>
              </div>
            )}
            {baseView.status === 'playing' && (
              <p className="keep-hint">
                {canAct
                  ? baseView.rollsLeft > 0
                    ? t(lang, 'keepHint')
                    : t(lang, 'pickBoxHint')
                  : t(lang, 'waitingTurn', { name: activePlayer?.name ?? '' })}
              </p>
            )}
          </div>

          {hint && (
            <div className="hint-card">
              <span className="hint-mark">?</span>
              <div>
                <strong>{hintText}</strong>
                <p>{t(lang, REASON_KEYS[hint.reason])}</p>
              </div>
            </div>
          )}

          <div className="game-notes">
            {isGuest ? (
              <div className="side-card guest-note">
                <h3>{t(lang, 'lanGuestTitle')}</h3>
                <p>{t(lang, 'lanGuestSeat', { name: guestSeatName })}</p>
                <p>{t(lang, 'lanGuestHint')}</p>
              </div>
            ) : (
              <>
                <div className="side-card record-mini">
                  <div className="side-card-head">
                    <h3>{t(lang, 'familyRecord')}</h3>
                    <button className="text-button" onClick={() => setScreen('record')}>
                      {t(lang, 'record')} →
                    </button>
                  </div>
                  <p>
                    {record.games > 0
                      ? `${record.games} ${t(lang, record.games === 1 ? 'gameOne' : 'gamesPlayed')} · ${t(lang, 'bestScore')} ${record.bestScore}`
                      : t(lang, 'noRecord')}
                  </p>
                </div>
                <div className="side-card shortcuts">
                  <h3>{t(lang, 'keyboard')}</h3>
                  <p>{t(lang, 'keyboardRoll')}</p>
                  <p>{t(lang, 'keyboardHold')}</p>
                  <p>{t(lang, 'keyboardHint')}</p>
                </div>
              </>
            )}
          </div>

          {isLanHost && (
            <div className="lan-mini">
              <div>
                <span className="field-label">{t(lang, 'lanCode')}</span>
                <strong className="room-code small">{lanCode}</strong>
              </div>
              <p>
                {connectedCount === lanCount
                  ? t(lang, 'lanReady')
                  : t(lang, 'lanWaiting', { n: Math.max(0, lanCount - connectedCount) })}
              </p>
              <span className="peer-dots">
                {lanPlayers
                  .filter((player) => player.seat > 0)
                  .map((player) => (
                    <span
                      key={player.seat}
                      className={player.connected ? 'online' : ''}
                      title={player.name}
                    >
                      ●
                    </span>
                  ))}
              </span>
            </div>
          )}
        </section>

        <aside className="score-column">
          <Scorecard
            view={baseView}
            lang={lang}
            interactive={canScoreNow}
            hintCategory={canAct ? hintCategory : null}
            onScore={scoreHuman}
          />
        </aside>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {t(lang, 'back')}
      </button>
      <p className="eyebrow">{t(lang, 'eyebrow')}</p>
      <h2 className="screen-title">{t(lang, 'rulesTitle')}</h2>
      <p className="lede">{t(lang, 'rulesLede')}</p>
      <ol className="rules-list">
        {[t(lang, 'rule1'), t(lang, 'rule2'), t(lang, 'rule3'), t(lang, 'rule4'), t(lang, 'rule5')].map(
          (rule, index) => (
            <li key={index}>
              <span className="rule-num">{index + 1}</span>
              <span>{rule}</span>
            </li>
          ),
        )}
      </ol>
      <section className="rules-scoring">
        <h3>{t(lang, 'rulesScoring')}</h3>
        <p>{t(lang, 'rulesScoreLine')}</p>
        <p>{t(lang, 'rulesScoreLine2')}</p>
      </section>
      <section className="rules-keyboard">
        <h3>{t(lang, 'keyboard')}</h3>
        <p>{t(lang, 'keyboardRoll')}</p>
        <p>{t(lang, 'keyboardHold')}</p>
        <p>{t(lang, 'keyboardHint')}</p>
      </section>
      <button className="primary" onClick={() => setScreen('home')}>
        {t(lang, 'close')}
      </button>
    </main>
  );

  const recordScreen = (
    <main className="shell narrow-shell record-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {t(lang, 'back')}
      </button>
      <p className="eyebrow">{t(lang, 'eyebrow')}</p>
      <h2 className="screen-title">{t(lang, 'familyRecord')}</h2>
      <p className="lede">{record.games > 0 ? t(lang, 'recentGames') : t(lang, 'noRecord')}</p>

      <div className="stat-grid">
        <div className="stat-card">
          <span>{t(lang, 'gamesPlayed')}</span>
          <strong>{record.games}</strong>
        </div>
        <div className="stat-card">
          <span>{t(lang, 'bestScore')}</span>
          <strong>{record.bestScore}</strong>
          <small>{record.bestBy ? t(lang, 'bestBy', { name: record.bestBy }) : '—'}</small>
        </div>
        <div className="stat-card">
          <span>{t(lang, 'winStreak')}</span>
          <strong>{record.streak}</strong>
          <small>{record.streakBy ?? '—'}</small>
        </div>
        <div className="stat-card">
          <span>{t(lang, 'lastWinner')}</span>
          <strong className="winner-name">{record.lastWinner ?? '—'}</strong>
        </div>
      </div>

      {record.history.length > 0 ? (
        <div className="history-list">
          {record.history.map((game, index) => (
            <div className="history-row" key={`${game.at}-${index}`}>
              <span className="history-date">{formatDate(lang, game.at)}</span>
              <div className="history-players">
                {game.players.map((name, seat) => (
                  <span key={seat} className={game.winner?.includes(name) ? 'won' : ''}>
                    {name} <strong>{game.scores[seat]}</strong>
                  </span>
                ))}
              </div>
              <span className={`history-result ${game.tied ? 'tied' : ''}`}>
                {game.tied ? t(lang, 'tie') : game.winner ?? '—'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-record">{t(lang, 'recordEmpty')}</p>
      )}

      <div className="record-actions">
        <button
          className={confirmReset ? 'danger' : 'secondary'}
          onClick={() => {
            if (!confirmReset) {
              setConfirmReset(true);
              return;
            }
            setRecord(clearRecord());
            setConfirmReset(false);
            setToast(t(lang, 'recordCleared'));
          }}
        >
          {confirmReset ? t(lang, 'resetConfirm') : t(lang, 'resetRecord')}
        </button>
        <button className="primary" onClick={() => setScreen('home')}>
          {t(lang, 'close')}
        </button>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell lan-shell">
      <button
        className="back"
        onClick={() => {
          closeLan();
          setScreen('home');
        }}
      >
        ← {t(lang, 'back')}
      </button>
      <p className="eyebrow">{t(lang, 'eyebrow')}</p>
      <h2 className="screen-title">{t(lang, 'lanTitle')}</h2>
      <p className="lede">{t(lang, 'lanLede')}</p>
      {lanError && <p className="error">{lanError}</p>}

      {lanRole === 'none' && (
        <div className="lan-grid">
          <section className="lan-card">
            <span className="lan-card-kicker">{t(lang, 'lanHostTitle')}</span>
            <div className="field-block">
              <span className="field-label">{t(lang, 'lanPlayers')}</span>
              <div className="segmented small" role="group" aria-label={t(lang, 'lanPlayers')}>
                {[2, 3, 4].map((count) => (
                  <button
                    key={count}
                    className={lanCount === count ? 'selected' : ''}
                    onClick={() => setLanCount(count)}
                  >
                    {t(lang, 'playerCount', { n: count })}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span className="field-label">{t(lang, 'lanHostName')}</span>
              <input
                value={lanHostName}
                maxLength={18}
                placeholder={t(lang, 'hostBadge')}
                onChange={(event) => setLanHostName(event.target.value)}
              />
            </label>
            <button className="primary wide" onClick={openLanHost} disabled={lanBusy}>
              {lanBusy ? t(lang, 'lanStarting') : t(lang, 'lanCreate')}
            </button>
            <p className="lan-note">{t(lang, 'lanHostHint')}</p>
          </section>

          <section className="lan-card">
            <span className="lan-card-kicker">{t(lang, 'lanJoinTitle')}</span>
            <label className="field">
              <span className="field-label">{t(lang, 'lanName')}</span>
              <input
                value={guestName}
                maxLength={18}
                placeholder={t(lang, 'namePlaceholder')}
                onChange={(event) => setGuestName(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">{t(lang, 'lanRoomCode')}</span>
              <input
                value={guestCode}
                maxLength={4}
                inputMode="numeric"
                placeholder="0000"
                onChange={(event) => setGuestCode(event.target.value.replace(/\D/g, ''))}
              />
            </label>
            <button
              className="primary wide"
              onClick={joinGuest}
              disabled={guestConnecting || !guestName.trim() || !(guestRoom || guestCode.trim())}
            >
              {guestConnecting ? t(lang, 'lanConnecting') : t(lang, 'lanJoinButton')}
            </button>
            <p className="lan-note">{t(lang, 'lanGuestHint')}</p>
          </section>
        </div>
      )}

      {lanRole === 'host' && (
        <>
          {lanBusy && (
            <div className="lan-waiting">
              <span className="spinner" /> {t(lang, 'lanStarting')}
            </div>
          )}
          {lanHost && (
            <div className="lan-layout">
              <div className="lan-card">
                <span className="label">{t(lang, 'lanCode')}</span>
                <div className="room-code big">{lanCode}</div>
                <p className="muted">
                  {connectedCount === lanCount
                    ? t(lang, 'lanReady')
                    : t(lang, 'lanWaiting', { n: Math.max(0, lanCount - connectedCount) })}
                </p>
                <div className="peer-list">
                  {lanPlayers.map((player) => (
                    <span key={player.seat} className={player.connected ? 'online' : ''}>
                      <i style={playerStyle(player.seat)} />
                      {player.name}
                      {player.host ? ` · ${t(lang, 'hostBadge')}` : ''}
                      {' · '}
                      {player.connected ? t(lang, 'lanOnline') : t(lang, 'lanOffline')}
                    </span>
                  ))}
                </div>
                <button
                  className="primary wide"
                  onClick={startLanGame}
                  disabled={connectedCount < lanCount}
                >
                  {t(lang, 'lanStart')}
                </button>
                <button className="secondary wide" onClick={copyInvite}>
                  {t(lang, 'lanCopy')}
                </button>
                <p className="lan-note">{t(lang, 'lanReconnect')}</p>
              </div>
              <div className="qr-card">
                {lanQr ? <img src={lanQr} alt={t(lang, 'lanScan')} /> : null}
                <p>{t(lang, 'lanScan')}</p>
                <code>{lanInvite.replace(/^https?:\/\//, '')}</code>
                {lanInfo && <small>{lanInfo.urls.join(' · ')}</small>}
              </div>
            </div>
          )}
          {!lanHost && !lanBusy && (
            <div className="lan-waiting">
              <p>{t(lang, 'lanNoConnection')}</p>
              <button className="primary" onClick={openLanHost}>
                {t(lang, 'lanCreate')}
              </button>
            </div>
          )}
        </>
      )}

      {lanRole === 'guest' && (
        <>
          {!guest && (
            <div className="lan-card join-card">
              <span className="lan-card-kicker">{t(lang, 'lanGuestTitle')}</span>
              <label className="field">
                <span className="field-label">{t(lang, 'lanName')}</span>
                <input
                  value={guestName}
                  maxLength={18}
                  placeholder={t(lang, 'namePlaceholder')}
                  onChange={(event) => setGuestName(event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">{t(lang, 'lanRoomCode')}</span>
                <input
                  value={guestCode}
                  maxLength={4}
                  inputMode="numeric"
                  placeholder="0000"
                  onChange={(event) => setGuestCode(event.target.value.replace(/\D/g, ''))}
                />
              </label>
              <button
                className="primary wide"
                onClick={joinGuest}
                disabled={guestConnecting || !guestName.trim() || !(guestRoom || guestCode.trim())}
              >
                {guestConnecting ? t(lang, 'lanConnecting') : t(lang, 'lanJoinButton')}
              </button>
              <p className="lan-note">{t(lang, 'lanGuestHint')}</p>
            </div>
          )}
          {guest && !guestStarted && (
            <div className="lan-waiting">
              <span className="spinner" />
              <p>{t(lang, 'lanWaitingHost')}</p>
              <div className="room-code">{guest.code || guestCode || guestRoom}</div>
              <p className="muted">{t(lang, 'lanGuestSeat', { name: guestName })}</p>
              <button className="secondary" onClick={joinGuest} disabled={guestConnecting}>
                {t(lang, 'lanReconnectButton')}
              </button>
            </div>
          )}
          {guestStarted && (
            <div className="lan-waiting">
              <span className="spinner" />
              <p>{t(lang, 'lanWaitingHost')}</p>
            </div>
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
