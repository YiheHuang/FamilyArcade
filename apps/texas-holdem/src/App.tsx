import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  LanGuest,
  LanHost,
  guestParams,
  newRoomCode,
  type LanPublicPeer,
} from '@family-arcade/lan';
import {
  chooseAction,
  hintFor,
  type AiDecision,
  type AiLevel,
  type HintReason,
} from './ai/ai';
import { CardFace, StackFan } from './components/Cards';
import {
  ActionDock,
  Curtain,
  HandRail,
  HandStrength,
  PokerTable,
  ResultSheet,
  hintActionText,
  type SeatDisplay,
} from './components/Table';
import {
  applyAction,
  applySeatAction,
  defaultButton,
  legalActions,
  makeRng,
  nextHand,
  setup,
  view,
  type Action,
  type ActionOptions,
  type GameState,
  type SeatView,
} from './game/texas-holdem';
import { demoOver, demoShowdown, demoTable } from './demo';
import { formatChips, formatDate } from './format';
import {
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
  recordHand,
  recordSession,
  saveGame,
  type FamilyRecord,
  type RecordMode,
  type SavedGame,
} from './storage';
import { chime, type SoundKind } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'stats' | 'rules' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type SetupKind = 'ai' | 'local';
type LanRole = 'hub' | 'host' | 'guest';

const AI_LEVELS_UI: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionNote' },
  { id: 'easy', label: 'easy', note: 'easyNote' },
  { id: 'normal', label: 'normal', note: 'normalNote' },
  { id: 'hard', label: 'hard', note: 'hardNote' },
];

const SEAT_KEYS: MessageKey[] = ['seat1', 'seat2', 'seat3', 'seat4', 'seat5', 'seat6'];
const RULE_KEYS: MessageKey[] = [
  'rule1',
  'rule2',
  'rule3',
  'rule4',
  'rule5',
  'rule6',
  'rule7',
  'rule8',
  'rule9',
  'rule10',
];
const RANKING_KEYS: MessageKey[] = [
  'rankingRoyal',
  'rankingStraightFlush',
  'rankingQuads',
  'rankingFullHouse',
  'rankingFlush',
  'rankingStraight',
  'rankingTrips',
  'rankingTwoPair',
  'rankingPair',
  'rankingHigh',
];

const DEMO_KIND =
  typeof location !== 'undefined' ? new URLSearchParams(location.search).get('demo') : null;
const DEMO_STATE: GameState | null =
  DEMO_KIND === 'table'
    ? demoTable()
    : DEMO_KIND === 'showdown'
      ? demoShowdown()
      : DEMO_KIND === 'over'
        ? demoOver()
        : null;
const IS_DEMO = Boolean(DEMO_STATE);

const HERO_CARDS = [
  { rank: 'A', suit: 'S' },
  { rank: 'K', suit: 'H' },
  { rank: 'Q', suit: 'D' },
  { rank: 'J', suit: 'C' },
  { rank: 'T', suit: 'S' },
] as const;

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

function seedFromText(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed) >>> 0;
  let hash = 2166136261;
  for (let index = 0; index < trimmed.length; index += 1) {
    hash = Math.imul(hash ^ trimmed.charCodeAt(index), 16777619) >>> 0;
  }
  return hash >>> 0;
}

function actionSound(action: Action, next: GameState): SoundKind {
  if (next.phase === 'showdown' || next.phase === 'session-over') {
    return next.result?.showdown ? 'showdown' : 'win';
  }
  if (action.type === 'fold') return 'fold';
  if (action.type === 'check') return 'check';
  if (action.type === 'call') return 'bet';
  if (action.type === 'bet') return 'bet';
  if (action.type === 'raise') return 'raise';
  return 'allin';
}

function fallbackAction(options: ActionOptions): Action {
  if (options.canCheck) return { type: 'check' };
  if (options.canCall) return { type: 'call' };
  return { type: 'fold' };
}

function HintReasonKey(reason: HintReason): MessageKey {
  const keys: Record<HintReason, MessageKey> = {
    'strong-hand': 'hintStrong',
    'pot-odds': 'hintPotOdds',
    position: 'hintPosition',
    'stack-pressure': 'hintPressure',
    bluff: 'hintBluff',
    'weak-hand': 'hintWeak',
    check: 'hintCheck',
    call: 'hintCall',
    'all-in': 'hintAllIn',
    value: 'hintValue',
  };
  return keys[reason];
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() =>
    IS_DEMO ? 'game' : invite ? 'lan' : 'home',
  );
  const [mode, setMode] = useState<Mode>(() =>
    IS_DEMO ? 'ai' : invite ? 'lan-guest' : 'ai',
  );
  const [setupKind, setSetupKind] = useState<SetupKind>('ai');
  const [seatCount, setSeatCount] = useState(3);
  const [level, setLevel] = useState<AiLevel>('normal');
  const [seedText, setSeedText] = useState('');
  const [seed, setSeed] = useState<number | null>(null);
  const [state, setState] = useState<GameState>(() =>
    DEMO_STATE ??
    setup({ rng: Math.random, seats: 2, startingStack: 1000, button: 0 }),
  );
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<AiDecision | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() =>
    IS_DEMO ? null : loadSave(),
  );
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.texas-holdem.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [reduceMotion, setReduceMotion] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('familyarcade.texas-holdem.motion');
      if (stored === 'on') return true;
      if (stored === 'off') return false;
    } catch {
      /* ignore */
    }
    return typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [curtain, setCurtain] = useState(false);
  const [raiseTo, setRaiseTo] = useState(20);

  const [lanRole, setLanRole] = useState<LanRole>(() => (invite ? 'guest' : 'hub'));
  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [lanSeatCount, setLanSeatCount] = useState(3);
  const [humanSeats, setHumanSeats] = useState<number[]>([0]);
  const [hostName, setHostName] = useState(() => {
    try {
      return localStorage.getItem('familyarcade.texas-holdem.hostName') ?? '';
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
  const [autoJoin] = useState(() => Boolean(invite?.code));

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const hostStartedRef = useRef(false);
  const autoJoinRef = useRef(false);
  const lanActiveRef = useRef(false);
  const humanSeatsRef = useRef<number[]>([0]);
  const lanPlayersRef = useRef<LanPublicPeer[]>([]);
  const hostCreateSeqRef = useRef(0);
  const guestJoinSeqRef = useRef(0);
  const recordedHandRef = useRef(IS_DEMO ? 999 : 0);
  const sessionRecordedRef = useRef(IS_DEMO);
  const guestSoundRef = useRef<{ phase: string; pot: number } | null>(null);

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );
  const isGuest = mode === 'lan-guest';
  const isLan = mode === 'lan-host' || isGuest;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    humanSeatsRef.current = humanSeats;
  }, [humanSeats]);

  useEffect(() => {
    lanPlayersRef.current = lanPlayers;
  }, [lanPlayers]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title =
      lang === 'zh' ? '德州扑克 · 家庭游戏厅' : "Texas Hold'em · Family Arcade";
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
    setToast('');
    setHint(null);
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.texas-holdem.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    document.documentElement.dataset.motion = reduceMotion ? 'reduce' : 'full';
    try {
      localStorage.setItem('familyarcade.texas-holdem.motion', reduceMotion ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [reduceMotion]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.texas-holdem.hostName', hostName);
    } catch {
      /* ignore */
    }
  }, [hostName]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setToast('');
  }, [screen]);

  useEffect(() => {
    if (screen !== 'stats') setClearArmed(false);
  }, [screen]);

  const sendViews = useCallback((next: GameState) => {
    const host = hostRef.current;
    if (!host) return;
    for (let seat = 1; seat < next.players.length; seat += 1) {
      if (lanPlayersRef.current[seat]?.connected) {
        host.sendView(seat, view(next, seat));
      }
    }
  }, []);

  const commit = useCallback(
    (next: GameState, previous: GameState, currentMode: Mode, soundKind: SoundKind | null) => {
      stateRef.current = next;
      setState(next);
      setHint(null);
      setAiThinking(false);
      if (currentMode === 'ai' || currentMode === 'local') {
        setHistory((items) => [...items, previous]);
      }
      if (soundOn && soundKind) chime(soundKind);

      const heroOut =
        currentMode === 'ai' &&
        next.phase === 'showdown' &&
        next.players[0].stack === 0 &&
        !next.sessionOver;

      if (
        !IS_DEMO &&
        next.phase === 'showdown' &&
        next.result &&
        next.result.handNumber !== recordedHandRef.current
      ) {
        recordedHandRef.current = next.result.handNumber;
        setRecord(
          recordHand(
            {
              handNumber: next.result.handNumber,
              pot: next.result.pot,
              winners: next.result.winners,
              showdown: next.result.showdown,
            },
            {
              mode: recordModeFor(currentMode),
              ...(currentMode === 'ai' ? { level } : {}),
            },
          ),
        );
      }

      if (!IS_DEMO && (next.sessionOver || heroOut) && !sessionRecordedRef.current) {
        sessionRecordedRef.current = true;
        setRecord(
          recordSession({
            champion: heroOut ? null : next.champion,
            hands: next.handNumber,
          }),
        );
      }

      if (!IS_DEMO && (currentMode === 'ai' || currentMode === 'local')) {
        if (next.sessionOver || heroOut) {
          clearSave();
          setSaved(null);
        } else {
          const snapshot = saveGame({
            state: next,
            mode: currentMode,
            level,
            seatCount: next.players.length,
            seed,
            recordedHandNumber: recordedHandRef.current,
          });
          setSaved(snapshot);
        }
      }

      if (currentMode === 'lan-host') sendViews(next);
      if (currentMode === 'local') {
        setCurtain(next.phase !== 'showdown' && next.phase !== 'session-over');
      }
    },
    [level, seed, sendViews, soundOn],
  );

  const localSeat = state.turn >= 0 ? state.turn : 0;
  const shownView: SeatView = isGuest
    ? guestView ?? view(state, 0)
    : mode === 'local'
      ? view(state, localSeat)
      : view(state, 0);
  const showCurtain =
    mode === 'local' &&
    curtain &&
    shownView.phase !== 'showdown' &&
    shownView.phase !== 'session-over' &&
    shownView.turn >= 0;
  const canActNow = shownView.canAct && !showCurtain && (!isGuest || guestStarted);
  const soloOut =
    mode === 'ai' &&
    !IS_DEMO &&
    state.phase === 'showdown' &&
    state.players[0]?.stack === 0 &&
    !state.sessionOver;

  const connectedSeats = new Set(
    (isGuest ? guestPlayers : lanPlayers)
      .filter((player) => player.connected)
      .map((player) => player.seat),
  );
  if (isGuest && guest && guest.seat >= 0) connectedSeats.add(guest.seat);

  const seatName = useCallback(
    (seat: number): string => {
      if (mode === 'local') return t(lang, SEAT_KEYS[seat] ?? 'seat1');
      if (mode === 'ai') {
        if (seat === 0) return tr('you');
        return t(lang, 'bot', { n: seat });
      }
      if (mode === 'lan-host') {
        if (seat === 0) return hostName.trim() || tr('host');
        const player = lanPlayers.find((item) => item.seat === seat && item.connected);
        if (player?.name?.trim()) return player.name.trim();
        return t(lang, 'bot', { n: seat });
      }
      if (seat === guest?.seat) return guestName.trim() || tr('you');
      const player = guestPlayers.find((item) => item.seat === seat && item.connected);
      if (player?.name?.trim()) return player.name.trim();
      return t(lang, 'bot', { n: seat });
    },
    [guest, guestName, guestPlayers, hostName, lang, lanPlayers, mode, tr],
  );

  const isAISeat = useCallback(
    (seat: number): boolean => {
      if (mode === 'local') return false;
      if (mode === 'ai') return seat !== 0;
      if (mode === 'lan-host') return !humanSeats.includes(seat);
      if (mode === 'lan-guest') return !connectedSeats.has(seat) && seat !== guest?.seat;
      return false;
    },
    [connectedSeats, guest?.seat, humanSeats, mode],
  );

  const act = useCallback(
    (action: Action) => {
      if (showCurtain) return;
      if (isGuest) {
        if (guestView?.canAct && guest && guestView.seat === guest.seat) {
          guest.sendIntent({ action, version: guestView.version });
        }
        return;
      }
      const seat = mode === 'local' ? state.turn : 0;
      if (seat < 0) return;
      if (mode === 'ai' && seat !== 0) return;
      if (mode === 'lan-host' && seat !== 0) return;
      const result = applyAction(state, seat, action);
      if (!result.ok) {
        setToast(tr('invalidAction'));
        return;
      }
      commit(result.state, state, mode, actionSound(action, result.state));
    },
    [commit, guest, guestView, isGuest, mode, showCurtain, state, tr],
  );

  const undo = useCallback(() => {
    if (isLan || isGuest || history.length === 0) return;
    if (state.phase === 'showdown' || state.phase === 'session-over') return;
    let previous: GameState | null = null;
    let nextHistory: GameState[] = [];
    if (mode === 'ai') {
      let index = history.length - 1;
      while (index >= 0) {
        const item = history[index];
        if (
          (item.phase === 'preflop' ||
            item.phase === 'flop' ||
            item.phase === 'turn' ||
            item.phase === 'river') &&
          item.turn === 0
        ) {
          previous = item;
          nextHistory = history.slice(0, index);
          break;
        }
        index -= 1;
      }
    } else {
      previous = history[history.length - 1];
      nextHistory = history.slice(0, -1);
    }
    if (!previous) return;
    stateRef.current = previous;
    setState(previous);
    setHistory(nextHistory);
    setHint(null);
    setAiThinking(false);
    setCurtain(mode === 'local');
    if (!IS_DEMO && (mode === 'ai' || mode === 'local')) {
      const snapshot = saveGame({
        state: previous,
        mode,
        level,
        seatCount: previous.players.length,
        seed,
        recordedHandNumber: recordedHandRef.current,
      });
      setSaved(snapshot);
    }
  }, [history, isGuest, isLan, level, mode, seed, state.phase]);

  const showHint = useCallback(() => {
    if (isLan || isGuest) return;
    if (showCurtain || !shownView.canAct) {
      setToast(tr('hintUnavailable'));
      return;
    }
    const decision = hintFor(state, shownView.seat);
    setHint(decision);
    if (
      (decision.action.type === 'bet' || decision.action.type === 'raise') &&
      decision.action.amount
    ) {
      setRaiseTo(decision.action.amount);
    }
    const actionText = hintActionText(lang, decision.action);
    setToast(t(lang, HintReasonKey(decision.reason), { action: actionText }));
  }, [isGuest, isLan, lang, shownView.canAct, shownView.seat, showCurtain, state, tr]);

  const startTable = useCallback(
    (kind: 'ai' | 'local') => {
      const seedValue = seedFromText(seedText);
      const rng = seedValue !== null ? makeRng(seedValue) : Math.random;
      const next = setup({
        rng,
        seats: seatCount,
        startingStack: 1000,
        button: defaultButton(seatCount),
      });
      stateRef.current = next;
      recordedHandRef.current = 0;
      sessionRecordedRef.current = false;
      setSeed(seedValue);
      setMode(kind);
      setState(next);
      setHistory([]);
      setHint(null);
      setAiThinking(false);
      setCurtain(kind === 'local' && next.phase !== 'showdown');
      setRaiseTo(next.bigBlind);
      setScreen('game');
      setToast('');
      clearSave();
      setSaved(null);
      if (soundOn) chime('deal');
    },
    [seatCount, seedText, soundOn],
  );

  const startLocalSetup = () => {
    setSetupKind('local');
    setScreen('setup');
  };

  const resume = useCallback(() => {
    if (!saved) return;
    stateRef.current = saved.state;
    recordedHandRef.current = saved.recordedHandNumber;
    sessionRecordedRef.current = false;
    setMode(saved.mode);
    setLevel(saved.level);
    setSeatCount(saved.seatCount);
    setSeed(saved.seed);
    setSeedText(saved.seed === null ? '' : String(saved.seed));
    setState(saved.state);
    setHistory([]);
    setHint(null);
    setAiThinking(false);
    setCurtain(saved.mode === 'local' && saved.state.phase !== 'showdown');
    setScreen('game');
    setSaved(null);
    setToast('');
  }, [saved]);

  const nextHandAction = useCallback(() => {
    if (isGuest || IS_DEMO) return;
    if (state.sessionOver || soloOut) return;
    if (state.phase !== 'showdown') return;
    const rng =
      seed !== null
        ? makeRng((seed + state.handNumber * 7919) >>> 0)
        : Math.random;
    const result = nextHand(state, rng);
    if (!result.ok) return;
    commit(result.state, state, mode, 'next');
  }, [commit, isGuest, mode, seed, soloOut, state]);

  const restartTable = useCallback(() => {
    if (isGuest) return;
    if (mode === 'lan-host') {
      startLanMatchRef.current?.();
      return;
    }
    startTable(mode === 'local' ? 'local' : 'ai');
  }, [isGuest, mode, startTable]);

  const changeSetup = useCallback(() => {
    if (isLan) {
      closeLanRef.current?.();
      setLanRole('hub');
      setMode('ai');
      setScreen('home');
      return;
    }
    setSetupKind(mode === 'local' ? 'local' : 'ai');
    setScreen('setup');
  }, [isLan, mode]);

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
        /* socket may be gone */
      }
      host.close();
    }
    setLanHost(null);
    setLanPlayers([]);
    lanPlayersRef.current = [];
    setLanInfo(null);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanError('');
    setHumanSeats([0]);
    humanSeatsRef.current = [0];
    const activeGuest = guest;
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    setGuestConnecting(false);
    setGuestPlayers([]);
    activeGuest?.close();
  }, [guest]);

  const closeLanRef = useRef<(() => void) | null>(null);
  const startLanMatchRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    closeLanRef.current = closeLan;
  }, [closeLan]);

  const goHome = useCallback(() => {
    closeLan();
    setLanRole('hub');
    setMode('ai');
    setAiThinking(false);
    setCurtain(false);
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
        maxPlayers: lanSeatCount,
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
        lanPlayersRef.current = players;
        setLanPlayers(players);
        created.sendLobby();
        if (hostStartedRef.current) {
          const connected = players
            .filter((player) => player.connected && !player.host)
            .map((player) => player.seat);
          const humans = [0, ...connected];
          humanSeatsRef.current = humans;
          setHumanSeats(humans);
          for (const seat of humans) {
            if (seat !== 0) created.sendView(seat, view(stateRef.current, seat));
          }
        }
      });
      created.onIntent((seat, intent) => {
        if (hostRef.current !== created) return;
        if (!lanPlayersRef.current[seat]?.connected) return;
        const value = intent as { action?: Action; version?: number } | null;
        if (!value?.action) return;
        const current = stateRef.current;
        if (typeof value.version === 'number' && value.version !== current.version) return;
        const result = applySeatAction(current, seat, value.action);
        if (result.ok) {
          commit(
            result.state,
            current,
            'lan-host',
            actionSound(value.action, result.state),
          );
        }
      });
      created.onClose(() => {
        if (hostRef.current !== created) return;
        hostRef.current = null;
        hostStartedRef.current = false;
        setLanHost(null);
        setLanPlayers([]);
        lanPlayersRef.current = [];
        setLanError(t(lang, 'lanHostLost'));
      });
      const url = inviteUrl(info, code, code, lang === 'zh' ? '访客' : 'Guest');
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        color: { dark: '#173f35', light: '#fffaf0' },
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
      lanPlayersRef.current = [];
    } finally {
      if (seq === hostCreateSeqRef.current) setLanBusy(false);
    }
  }, [closeLan, commit, hostName, lang, lanBusy, lanSeatCount]);

  const startLanMatch = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open') return;
    const connected = lanPlayersRef.current
      .filter((player) => player.connected && !player.host)
      .map((player) => player.seat);
    if (connected.length === 0) {
      setLanError(t(lang, 'lanNeedGuest'));
      return;
    }
    const humans = [0, ...connected];
    humanSeatsRef.current = humans;
    setHumanSeats(humans);
    const next = setup({
      rng: Math.random,
      seats: lanSeatCount,
      startingStack: 1000,
      button: defaultButton(lanSeatCount),
    });
    stateRef.current = next;
    recordedHandRef.current = 0;
    sessionRecordedRef.current = false;
    setSeed(null);
    setState(next);
    setHistory([]);
    setHint(null);
    setAiThinking(false);
    setCurtain(false);
    setLanError('');
    setMode('lan-host');
    setScreen('game');
    setSaved(null);
    clearSave();
    hostStartedRef.current = true;
    host.start({ seats: lanSeatCount });
    host.sendLobby();
    sendViews(next);
    if (soundOn) chime('deal');
  }, [lang, lanSeatCount, sendViews, soundOn]);
  useEffect(() => {
    startLanMatchRef.current = startLanMatch;
  }, [startLanMatch]);

  const joinGuest = useCallback(async () => {
    if (guestConnecting || guest) return;
    const name = guestName.trim() || t(lang, 'guest');
    const code = guestCode.trim();
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
        room: code,
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
      setGuestRoom(code);
      setGuestView(null);
      setGuestStarted(false);
      setGuestPlayers([]);
      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        const next = payload as SeatView;
        if (!next || !Array.isArray(next.players) || !Array.isArray(next.hand)) return;
        setGuestView(next);
        setGuestStarted(true);
        setMode('lan-guest');
        setScreen('game');
      });
      joined.onStart((players) => {
        if (!lanActiveRef.current) return;
        if (Array.isArray(players)) setGuestPlayers(players);
        setGuestStarted(true);
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
      setMode('lan-guest');
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
    if (!guestView) {
      guestSoundRef.current = null;
      return;
    }
    if (!soundOn || !lanActiveRef.current) return;
    const previous = guestSoundRef.current;
    guestSoundRef.current = { phase: guestView.phase, pot: guestView.pot };
    if (!previous) return;
    if (guestView.phase === 'showdown' && previous.phase !== 'showdown') {
      chime(guestView.result?.showdown ? 'showdown' : 'win');
    } else if (guestView.pot > previous.pot) {
      chime('bet');
    }
  }, [guestView, soundOn]);

  useEffect(() => {
    const onUnload = () => {
      try {
        hostRef.current?.sendResult({ kind: 'closed' });
      } catch {
        /* tab is closing */
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  // AI seats reply after a short, visible pause.
  useEffect(() => {
    if (screen !== 'game' || isGuest || IS_DEMO) return;
    if (
      state.phase !== 'preflop' &&
      state.phase !== 'flop' &&
      state.phase !== 'turn' &&
      state.phase !== 'river'
    ) {
      return;
    }
    const seat = state.turn;
    if (seat < 0) return;
    const human =
      mode === 'local' ||
      (mode === 'ai' && seat === 0) ||
      (mode === 'lan-host' && humanSeats.includes(seat));
    if (human) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.turn !== seat || current.version !== state.version) {
        setAiThinking(false);
        return;
      }
      const decision = chooseAction(current, seat, level, Math.random);
      let result = applyAction(current, seat, decision.action);
      if (!result.ok) {
        result = applyAction(current, seat, fallbackAction(legalActions(current, seat)));
      }
      setAiThinking(false);
      if (!result.ok) return;
      commit(result.state, current, mode, actionSound(decision.action, result.state));
    }, 520);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, humanSeats, isGuest, level, mode, screen, state]);

  // Keep the raise slider on a legal value for the new decision.
  useEffect(() => {
    if (!shownView.canAct || showCurtain) return;
    if (shownView.legal.canBet) setRaiseTo(shownView.legal.minBetTo);
    else if (shownView.legal.canRaise) setRaiseTo(shownView.legal.minRaiseTo);
  }, [shownView.canAct, shownView.seat, shownView.version, showCurtain]);

  // Keyboard path.
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
        return;
      }
      if (key === 'h') {
        event.preventDefault();
        showHint();
        return;
      }
      if (key === 'n') {
        if (shownView.phase === 'showdown') {
          event.preventDefault();
          nextHandAction();
        }
        return;
      }
      if (showCurtain || !shownView.canAct) return;
      if (key === 'f' && shownView.legal.canFold) {
        event.preventDefault();
        act({ type: 'fold' });
        return;
      }
      if (key === 'c') {
        if (shownView.legal.canCheck) {
          event.preventDefault();
          act({ type: 'check' });
        } else if (shownView.legal.canCall) {
          event.preventDefault();
          act({ type: 'call' });
        }
        return;
      }
      if (key === 'b') {
        if (shownView.legal.canBet) {
          event.preventDefault();
          act({ type: 'bet', amount: raiseTo });
        } else if (shownView.legal.canRaise) {
          event.preventDefault();
          act({ type: 'raise', amount: raiseTo });
        }
        return;
      }
      if (
        key === 'a' &&
        shownView.legal.canAllIn &&
        (shownView.legal.canBet || shownView.legal.canRaise)
      ) {
        event.preventDefault();
        act({ type: 'all-in' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    act,
    goHome,
    nextHandAction,
    raiseTo,
    screen,
    shownView,
    showCurtain,
    showHint,
    undo,
  ]);

  const seats: SeatDisplay[] = shownView.players.map((player) => {
    const revealed = shownView.revealed.find((item) => item.seat === player.seat)?.cards ?? [];
    const own = player.seat === shownView.seat;
    const showCards = revealed.length === 2 || (own && !showCurtain);
    const cards = revealed.length === 2 ? revealed : own ? shownView.hand : [];
    return {
      name: seatName(player.seat),
      player,
      isAI: isAISeat(player.seat),
      isYou: own,
      active: shownView.turn === player.seat && shownView.phase !== 'showdown',
      winner: Boolean(shownView.result?.winners.includes(player.seat)),
      handCategory: shownView.result?.handNames[player.seat] ?? null,
      cards,
      showCards,
    };
  });

  const modeLabel =
    mode === 'ai'
      ? t(lang, level)
      : mode === 'local'
        ? tr('modeLocal')
        : mode === 'lan-host'
          ? tr('lanHostTag')
          : tr('lanGuestTag');

  const undoAvailable =
    screen === 'game' &&
    !isLan &&
    !IS_DEMO &&
    history.length > 0 &&
    shownView.phase !== 'showdown' &&
    shownView.phase !== 'session-over';
  const hintAvailable =
    screen === 'game' && !isLan && !showCurtain && shownView.canAct;

  const startAi = () => {
    setSetupKind('ai');
    setScreen('setup');
  };

  const goStats = () => setScreen('stats');
  const goRules = () => setScreen('rules');

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('eyebrow')}</p>
          <h1>{tr('title')}</h1>
        </div>
        <div className="mast-actions">
          <button
            className="ghost"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            data-testid="language"
          >
            {tr('language')}
          </button>
          <button
            className="ghost"
            onClick={() => setSoundOn((value) => !value)}
            data-testid="sound"
          >
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-table" aria-hidden="true">
          <div className="hero-felt">
            <div className="hero-board">
              {HERO_CARDS.map((card) => (
                <CardFace key={`${card.rank}${card.suit}`} card={card} lang={lang} size="hero" />
              ))}
            </div>
            <div className="hero-pot">
              <span>{tr('pot')}</span>
              <strong>1,280</strong>
            </div>
            <StackFan lang={lang} count={4} />
          </div>
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume} data-testid="save-continue">
                <span>{tr('continueGame')}</span>
                <small>{saved.mode === 'local' ? tr('modeLocal') : t(lang, saved.level)}</small>
              </button>
            )}
            <button
              className={saved ? 'secondary wide' : 'primary wide'}
              onClick={startAi}
              data-testid="start-ai"
            >
              <span>{tr('playSolo')}</span>
              <small>{tr('soloNote')}</small>
            </button>
            <button className="secondary wide" onClick={startLocalSetup} data-testid="start-local">
              <span>{tr('playLocal')}</span>
              <small>{tr('localNote')}</small>
            </button>
            <button className="secondary wide" onClick={openLanHub} data-testid="start-lan">
              <span>{tr('playLan')}</span>
              <small>{tr('lanNote')}</small>
            </button>
            <div className="menu-links">
              <button className="text-button" onClick={goRules} data-testid="rules">
                {tr('rules')} →
              </button>
              <button className="text-button" onClick={goStats} data-testid="stats">
                {tr('record')} →
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('recordMini')}</span>
            <strong>{record.hands}</strong>
            <span>{tr('hands')}</span>
            <span className="dot">·</span>
            <span>{record.sessions} {tr('sessions')}</span>
            <span className="dot">·</span>
            <span>
              {tr('biggestPot')} {formatChips(lang, record.biggestPot)}
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
        ← {tr('home')}
      </button>
      <h2 className="screen-title">{tr('setupTitle')}</h2>
      <div className="setup-grid">
        <section className="setup-main">
          <div className="settings-card">
            <span className="label">{tr('seatsLabel')}</span>
            <div className="seat-count-grid">
              {[2, 3, 4, 5, 6].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={seatCount === count ? 'selected' : ''}
                  onClick={() => setSeatCount(count)}
                  aria-pressed={seatCount === count}
                  data-testid={`seats-${count}`}
                >
                  <strong>{count}</strong>
                  <small>{tr('seatCountValue', { n: count })}</small>
                </button>
              ))}
            </div>
          </div>
          {setupKind === 'ai' ? (
            <div className="settings-card">
              <span className="label">{tr('difficulty')}</span>
              <div className="level-grid">
                {AI_LEVELS_UI.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`level-card ${level === item.id ? 'selected' : ''}`}
                    onClick={() => setLevel(item.id)}
                    aria-pressed={level === item.id}
                    data-testid={`level-${item.id}`}
                  >
                    <span className={`level-dot ${item.id}`} />
                    <strong>{t(lang, item.label)}</strong>
                    <small>{t(lang, item.note)}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="settings-card">
              <div className="toggle-line">
                <div>
                  <span className="label">{tr('playLocal')}</span>
                  <p className="setting-note">{tr('hotSeatPeople')}</p>
                </div>
                <span className="setup-mark" aria-hidden="true">
                  ◉
                </span>
              </div>
            </div>
          )}
        </section>
        <aside className="setup-side">
          <div className="settings-card">
            <span className="label">{tr('blindsLabel')}</span>
            <strong className="setting-value">{tr('blindsValue')}</strong>
            <span className="label spaced">{tr('stackLabel')}</span>
            <strong className="setting-value">{tr('stackValue')}</strong>
            <p className="setting-note">{tr('playMoneyNote')}</p>
          </div>
          <div className="settings-card">
            <label className="seed-field">
              <span>{tr('seedLabel')}</span>
              <input
                value={seedText}
                onChange={(event) => setSeedText(event.target.value)}
                placeholder={tr('seedPlaceholder')}
                maxLength={32}
                data-testid="seed-input"
              />
            </label>
            <p className="setting-note">{tr('seedNote')}</p>
            <div className="toggle-row">
              <span>{soundOn ? tr('soundOn') : tr('soundOff')}</span>
              <button
                type="button"
                className={`toggle ${soundOn ? 'on' : ''}`}
                onClick={() => setSoundOn((value) => !value)}
                aria-pressed={soundOn}
                data-testid="sound-toggle"
                aria-label={soundOn ? tr('soundOn') : tr('soundOff')}
              >
                <span />
              </button>
            </div>
            <div className="toggle-row">
              <span>{reduceMotion ? tr('motionOn') : tr('motionOff')}</span>
              <button
                type="button"
                className={`toggle ${reduceMotion ? 'on' : ''}`}
                onClick={() => setReduceMotion((value) => !value)}
                aria-pressed={reduceMotion}
                data-testid="motion-toggle"
                aria-label={reduceMotion ? tr('motionOn') : tr('motionOff')}
              >
                <span />
              </button>
            </div>
          </div>
        </aside>
      </div>
      <div className="row-actions">
        <button className="primary" onClick={() => startTable(setupKind)} data-testid="begin">
          {tr('beginTable')}
        </button>
        <button className="ghost" onClick={goHome}>
          {tr('back')}
        </button>
      </div>
    </main>
  );

  const gameScreen = (
    <main
      className="shell game-shell"
      data-testid="game-shell"
      data-phase={shownView.phase}
      data-turn={shownView.turn}
      data-seat={shownView.seat}
      data-seats={shownView.players.length}
      data-lan={isLan ? 'true' : 'false'}
    >
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
          <button
            className="ghost"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            data-testid="language"
          >
            {tr('language')}
          </button>
        </div>
      </header>

      <div className="game-layout">
        <section className="table-column">
          <PokerTable lang={lang} view={shownView} seats={seats} />
          <div className="hand-dock">
            {showCurtain ? (
              <Curtain
                lang={lang}
                name={seatName(shownView.turn)}
                onReveal={() => setCurtain(false)}
              />
            ) : (
              <HandRail lang={lang} view={shownView} />
            )}
          </div>
          {canActNow && !showCurtain && (
            <ActionDock
              lang={lang}
              view={shownView}
              raiseTo={raiseTo}
              setRaiseTo={setRaiseTo}
              hintType={hint?.action.type ?? null}
              onAction={act}
            />
          )}
          {shownView.phase === 'showdown' && shownView.result && (
            <ResultSheet
              lang={lang}
              view={shownView}
              seats={seats}
              canContinue={!isGuest && !IS_DEMO && !soloOut}
              canManage={!isGuest}
              showWait={isGuest}
              heroOut={soloOut}
              onNext={nextHandAction}
              onNewTable={restartTable}
              onSetup={changeSetup}
              onHome={goHome}
            />
          )}
          {aiThinking && <div className="thinking-line">{tr('thinking')}</div>}
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{tr('actions')}</h3>
            <div className="side-actions">
              <button
                className="secondary"
                onClick={undo}
                disabled={!undoAvailable}
                data-testid="undo"
              >
                {tr('undo')}
              </button>
              <button
                className="secondary"
                onClick={showHint}
                disabled={!hintAvailable}
                data-testid="hint"
              >
                {tr('hint')}
              </button>
            </div>
            <p className="side-note">{isLan ? tr('localOnly') : tr('keyboardHint')}</p>
          </div>

          {!showCurtain && shownView.board.length >= 3 && (
            <HandStrength lang={lang} view={shownView} />
          )}

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanCode')}</h3>
                <span
                  className={`status-dot ${
                    lanPlayers.some((player) => player.connected && !player.host) ? 'online' : ''
                  }`}
                />
              </div>
              <div className="room-code">{lanCode || '—'}</div>
              <p className="peer">
                {lanPlayers.filter((player) => player.connected && !player.host).length > 0
                  ? t(lang, 'lanGuests', {
                      n: lanPlayers.filter((player) => player.connected && !player.host).length,
                    })
                  : tr('lanHostWaiting')}
              </p>
              <p className="side-note">{tr('lanRecordNote')}</p>
            </div>
          )}

          {isGuest && (
            <div className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanGuestTag')}</h3>
                <span className={`status-dot ${guestStarted ? 'online' : ''}`} />
              </div>
              <p className="peer">{t(lang, 'lanRoom', { code: guestRoom || guestCode })}</p>
              <p className="peer">{t(lang, 'lanSeat', { name: seatName(shownView.seat) })}</p>
              <p className="side-note">{tr('lanRecordNote')}</p>
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('recordMini')}</h3>
            <p className="peer">
              {record.hands} {tr('hands')} · {record.sessions} {tr('sessions')}
            </p>
            <p className="side-note">
              {tr('biggestPot')} {formatChips(lang, record.biggestPot)}
            </p>
            {!isGuest && (
              <button className="text-button" onClick={goStats}>
                {tr('record')} →
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
    <main className={`shell ${lanRole === 'host' ? 'narrow-shell' : 'lan-shell'}`}>
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>

      {lanRole === 'hub' && (
        <>
          <h2 className="screen-title">{tr('lanTitle')}</h2>
          <div className="lan-choice">
            <section className="lan-choice-card host-card">
              <div className="choice-head">
                <span className="tag">{tr('lanHostTag')}</span>
                <span className="choice-icon" aria-hidden="true">
                  ⌂
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
              <span className="label">{tr('lanChooseSeats')}</span>
              <div className="seat-count-grid compact">
                {[2, 3, 4, 5, 6].map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={lanSeatCount === count ? 'selected' : ''}
                    onClick={() => setLanSeatCount(count)}
                    aria-pressed={lanSeatCount === count}
                    data-testid={`lan-seat-${count}`}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <span className="label spaced">{tr('lanChooseLevel')}</span>
              <div className="mini-levels">
                {AI_LEVELS_UI.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={level === item.id ? 'selected' : ''}
                    onClick={() => setLevel(item.id)}
                  >
                    {t(lang, item.label)}
                  </button>
                ))}
              </div>
              <p className="lan-help">{tr('lanFixedSeats')}</p>
              <button
                className="primary wide"
                onClick={openLanHost}
                disabled={lanBusy}
                data-testid="lan-create"
              >
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
                  ↗
                </span>
              </div>
              <h3>{tr('lanJoin')}</h3>
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
              <button
                className="primary wide"
                onClick={joinGuest}
                disabled={guestConnecting}
                data-testid="lan-join"
              >
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
          <h2 className="screen-title">{tr('lanHost')}</h2>
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
                  <span className="status-pill">
                    {lanPlayers.some((player) => player.connected && !player.host)
                      ? tr('lanReady')
                      : tr('lanHostWaiting')}
                  </span>
                </div>
                <div className="room-code big" data-testid="lan-code">
                  {lanCode}
                </div>
                <div className="peer-list">
                  {Array.from({ length: lanSeatCount }, (_, seat) => {
                    const player = lanPlayers.find((item) => item.seat === seat);
                    const connected = Boolean(player?.connected);
                    const isHostSeat = seat === 0;
                    return (
                      <span
                        key={seat}
                        className={`peer-chip ${connected ? 'online' : ''}`}
                      >
                        <span className="peer-mark">{seat + 1}</span>
                        <span className="peer-name">
                          {isHostSeat
                            ? hostName.trim() || tr('lanHostNamePlaceholder')
                            : connected && player?.name
                              ? player.name
                              : tr('bot', { n: seat })}
                        </span>
                        <small>
                          {isHostSeat ? tr('lanHostTag') : connected ? tr('lanOnline') : tr('aiTag')}
                        </small>
                      </span>
                    );
                  })}
                </div>
                <div className="lan-level">
                  <span className="label">{tr('lanChooseLevel')}</span>
                  <div className="mini-levels">
                    {AI_LEVELS_UI.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={level === item.id ? 'selected' : ''}
                        onClick={() => setLevel(item.id)}
                      >
                        {t(lang, item.label)}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="lan-help">{tr('lanEmptySeats')}</p>
                {!lanPlayers.some((player) => player.connected && !player.host) && (
                  <p className="lan-help">{tr('lanNeedGuest')}</p>
                )}
                <button
                  className="primary wide"
                  onClick={startLanMatch}
                  disabled={!lanPlayers.some((player) => player.connected && !player.host)}
                  data-testid="lan-start"
                >
                  {tr('lanStart')}
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
                  onClick={joinGuest}
                  disabled={guestConnecting}
                >
                  {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
                </button>
              </div>
              <p className="hint-copy">{tr('lanStartHint')}</p>
            </div>
          )}
          {guest && (
            <div className="guest-card waiting-card">
              <div className="wait-orbit" aria-hidden="true">
                <span>♠</span>
              </div>
              <h3>{tr('lanConnected')}</h3>
              <p>{tr('lanWaitingHost')}</p>
              <div className="guest-meta">
                <span>{t(lang, 'lanRoom', { code: guestRoom || guestCode })}</span>
                <span>{t(lang, 'lanSeat', { name: seatName(guest.seat) })}</span>
                {guestPlayers.find((player) => player.host)?.name && (
                  <span>
                    {tr('lanHostTag')} · {guestPlayers.find((player) => player.host)?.name}
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
    <main className="shell stats-shell">
      <button className="back" onClick={goHome}>
        ← {tr('home')}
      </button>
      <h2 className="screen-title">{tr('recordTitle')}</h2>
      {record.hands === 0 ? (
        <section className="empty-card">
          <span className="empty-mark" aria-hidden="true">
            A ♠ · K ♥
          </span>
          <p>{tr('recordEmpty')}</p>
          <button className="primary" onClick={startAi}>
            {tr('playSolo')}
          </button>
        </section>
      ) : (
        <>
          <section className="stats-top">
            <div className="stat-card total" data-testid="record-hands">
              <span>{tr('hands')}</span>
              <strong>{record.hands}</strong>
            </div>
            <div className="stat-card" data-testid="record-showdowns">
              <span>{tr('showdowns')}</span>
              <strong>{record.showdowns}</strong>
            </div>
            <div className="stat-card" data-testid="record-sessions">
              <span>{tr('sessions')}</span>
              <strong>{record.sessions}</strong>
            </div>
            <div className="stat-card" data-testid="record-biggest">
              <span>{tr('biggestPot')}</span>
              <strong>{formatChips(lang, record.biggestPot)}</strong>
            </div>
          </section>
          <section className="record-grid">
            <div className="record-card">
              <h3>{tr('byMode')}</h3>
              <div className="mode-list">
                {(['ai', 'local', 'lan'] as const).map((value) => (
                  <div className="mode-row" key={value}>
                    <span>
                      {value === 'ai'
                        ? tr('modeSolo')
                        : value === 'local'
                          ? tr('modeLocal')
                          : tr('modeLan')}
                    </span>
                    <div className="mode-bar">
                      <i
                        style={{
                          width:
                            record.hands > 0
                              ? `${(record.byMode[value] / record.hands) * 100}%`
                              : '0%',
                        }}
                      />
                    </div>
                    <strong>{record.byMode[value]}</strong>
                  </div>
                ))}
              </div>
              <div className="streak-row">
                <div>
                  <span>{tr('sessionWins')}</span>
                  <strong>{record.sessionWins}</strong>
                </div>
                <div>
                  <span>{tr('sessions')}</span>
                  <strong>{record.sessions}</strong>
                </div>
                <div>
                  <span>{tr('hands')}</span>
                  <strong>{record.hands}</strong>
                </div>
              </div>
              <p className="clear-note">{tr('recordNote')}</p>
              {clearArmed && <p className="clear-confirm">{tr('clearConfirm')}</p>}
              <div className="clear-actions">
                <button
                  className={clearArmed ? 'danger' : 'text-button'}
                  onClick={resetRecord}
                >
                  {clearArmed ? tr('confirmClear') : tr('clearRecord')}
                </button>
                {clearArmed && (
                  <button className="secondary" onClick={() => setClearArmed(false)}>
                    {tr('clearKeep')}
                  </button>
                )}
              </div>
            </div>
            <div className="record-card">
              <h3>{tr('recentHands')}</h3>
              {record.recent.length === 0 ? (
                <p className="recent-empty">{tr('recordEmpty')}</p>
              ) : (
                <ol className="recent-list">
                  {record.recent.map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="recent-row">
                      <span className={`recent-mark ${entry.showdown ? 'showdown' : 'fold'}`}>
                        {entry.showdown ? '♦' : '—'}
                      </span>
                      <div className="recent-main">
                        <strong>{t(lang, 'handLine', { n: entry.handNumber })}</strong>
                        <span>
                          {entry.mode === 'ai'
                            ? tr('modeSolo')
                            : entry.mode === 'local'
                              ? tr('modeLocal')
                              : tr('modeLan')}
                          {entry.level ? ` · ${t(lang, entry.level)}` : ''}
                        </span>
                      </div>
                      <span className="recent-pot">
                        {t(lang, 'potValue', { n: formatChips(lang, entry.pot) })}
                      </span>
                      <span className="recent-winner">
                        {entry.winners
                          .map((seat) => t(lang, 'seatTag', { n: seat + 1 }))
                          .join(' · ')}
                      </span>
                      <time dateTime={new Date(entry.at).toISOString()}>
                        {formatDate(lang, entry.at)}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
            </div>
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
        {RULE_KEYS.map((key) => (
          <li key={key}>{tr(key)}</li>
        ))}
      </ol>
      <section className="ranking-card">
        <h3>{tr('rankingTitle')}</h3>
        <ol className="ranking-list">
          {RANKING_KEYS.map((key) => (
            <li key={key}>{tr(key)}</li>
          ))}
        </ol>
      </section>
      <section className="rules-note-card">
        <h3>{tr('playMoneyTitle')}</h3>
        <p>{tr('playMoneyRules')}</p>
        <p>{tr('privacyRules')}</p>
      </section>
      <button className="primary" onClick={goHome}>
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
