import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  fallbackAction,
  hint as hintFor,
  type AiLevel,
  type Hint,
  type HintKind,
} from './ai/ai';
import { BidChip, DiceTray, Die, PlayerSeat, PrivacyGate } from './components/Table';
import { demoFixture } from './demo';
import {
  applySeat,
  higherBid,
  nextRound,
  setup,
  view,
  type GameState,
  type SeatView,
} from './game/liars-dice';
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
  recordGame,
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

const HINT_KEYS: Record<HintKind, MessageKey> = {
  safe: 'hintSafe',
  pressure: 'hintPressure',
  risk: 'hintRisk',
  challenge: 'hintChallenge',
  read: 'hintRead',
  spot: 'hintSpot',
};

const AI_NAMES: Record<Lang, string[]> = {
  en: ['Ada', 'Bo', 'Cyd', 'Dee', 'Eli'],
  zh: ['阿达', '小博', '小茜', '小迪', '小伊'],
};

function faceKey(value: number): MessageKey {
  const safe = Math.max(1, Math.min(6, Math.round(value)));
  return `face${safe}` as MessageKey;
}

function displayName(name: string, lang: Lang): string {
  if (!name) return t(lang, 'none');
  if (name === '@you') return t(lang, 'you');
  const player = /^@p(\d+)$/.exec(name);
  if (player) return t(lang, 'playerN', { n: Number(player[1]) });
  const seat = /^@seat(\d+)$/.exec(name);
  if (seat) return t(lang, 'playerN', { n: Number(seat[1]) });
  const ai = /^@ai(\d+)$/.exec(name);
  if (ai) {
    const list = AI_NAMES[lang];
    return `${t(lang, 'computer')} ${list[(Number(ai[1]) - 1) % list.length]}`;
  }
  return name;
}

function isAiName(name: string | undefined): boolean {
  return Boolean(name && /^@ai\d+$/.test(name));
}

function recordModeFor(mode: Mode): RecordMode {
  if (mode === 'ai') return 'ai';
  if (mode === 'local') return 'local';
  return 'lan';
}

function hintMessage(lang: Lang, hint: Hint): string {
  const chance = Math.round(Math.max(0, Math.min(1, hint.chance)) * 100);
  const expected = Math.max(1, Math.round(hint.expected));
  return t(lang, HINT_KEYS[hint.kind], { chance, expected });
}

function startingBid(current: { quantity: number; face: number } | null, max: number) {
  if (!current) return { quantity: 1, face: 1 };
  if (current.face < 6) {
    return { quantity: Math.min(current.quantity, max), face: current.face + 1 };
  }
  return { quantity: Math.min(current.quantity + 1, max), face: 1 };
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

function modeLabel(lang: Lang, mode: Mode, level: AiLevel): string {
  if (mode === 'ai') return `${t(lang, 'modeAi')} · ${t(lang, level)}`;
  if (mode === 'local') return t(lang, 'modeLocal');
  if (mode === 'lan-host') return t(lang, 'modeLanHost');
  return t(lang, 'modeLanGuest');
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [demo] = useState<'game' | 'reveal' | 'gameover' | null>(() => {
    if (typeof location === 'undefined') return null;
    const value = new URLSearchParams(location.search).get('demo');
    return value === 'game' || value === 'reveal' || value === 'gameover' ? value : null;
  });
  const fixture = useMemo(() => (demo ? demoFixture(demo) : null), [demo]);
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (demo ? 'game' : invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (demo ? 'ai' : invite ? 'lan-guest' : 'ai'));
  const [setupMode, setSetupMode] = useState<'ai' | 'local'>('ai');
  const [level, setLevel] = useState<AiLevel>(() => fixture?.level ?? 'normal');
  const [playerCount, setPlayerCount] = useState(() => fixture?.state.playerCount ?? 4);
  const [onesWild, setOnesWild] = useState(() => fixture?.state.onesWild ?? true);
  const [spotOn, setSpotOn] = useState(() => fixture?.state.spotOn ?? false);
  const [reduceMotion, setReduceMotion] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.liars-dice.motion') === 'off';
    } catch {
      return false;
    }
  });
  const [state, setState] = useState<GameState>(() => {
    if (fixture) return fixture.state;
    return setup({ rng: () => 0.5, playerCount: 4, onesWild: true, spotOn: false, starter: 0 });
  });
  const [names, setNames] = useState<string[]>(
    () => fixture?.names ?? ['@you', '@ai1', '@ai2', '@ai3'],
  );
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<Hint | null>(null);
  const [revealed, setRevealed] = useState<boolean>(() => (fixture ? true : true));
  const [quantity, setQuantity] = useState(1);
  const [face, setFace] = useState(1);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.liars-dice.sound') !== 'off';
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
  const [lanTableSize, setLanTableSize] = useState(4);
  const [hostName, setHostName] = useState(() => {
    try {
      return localStorage.getItem('familyarcade.liars-dice.hostName') ?? '';
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
  const namesRef = useRef(names);
  const lanPlayersRef = useRef(lanPlayers);
  const hostRef = useRef<LanHost | null>(null);
  const lanStartedRef = useRef(false);
  const lanActiveRef = useRef(false);
  const autoJoinRef = useRef(false);
  const lastGuestActionsRef = useRef(-1);
  const guestJoinSeqRef = useRef(0);
  const hostCreateSeqRef = useRef(0);

  const tr = useCallback((key: MessageKey) => t(lang, key), [lang]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    namesRef.current = names;
  }, [names]);
  useEffect(() => {
    lanPlayersRef.current = lanPlayers;
  }, [lanPlayers]);

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
      localStorage.setItem('familyarcade.liars-dice.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.liars-dice.motion', reduceMotion ? 'off' : 'on');
      localStorage.setItem('familyarcade.liars-dice.hostName', hostName);
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.motion = reduceMotion ? 'off' : 'on';
  }, [reduceMotion, hostName]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setToast('');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [screen]);

  useEffect(() => {
    if (screen !== 'stats') setClearArmed(false);
  }, [screen]);

  const guestSeat = guest?.seat ?? -1;
  const localSeat = mode === 'local' ? (state.turn >= 0 ? state.turn : 0) : 0;
  const localView = useMemo(() => view(state, localSeat, names), [state, localSeat, names]);
  const activeView: SeatView = (mode === 'lan-guest' ? guestView : localView) ?? localView;
  const viewerSeat = activeView.seat;
  const shownNames = activeView.names.length > 0 ? activeView.names : names;
  const nameAt = useCallback(
    (seat: number) => displayName(shownNames[seat] ?? '', lang),
    [shownNames, lang],
  );
  const viewerName = nameAt(viewerSeat);
  const currentName = nameAt(activeView.turn);

  useEffect(() => {
    const start = startingBid(activeView.currentBid, activeView.maxQuantity);
    setQuantity(start.quantity);
    setFace(start.face);
    setHint(null);
    setRevealed(mode !== 'local');
  }, [activeView.actions, activeView.turn, activeView.phase, activeView.round, mode, activeView.maxQuantity]);

  const handVisible = mode === 'local' ? revealed || activeView.phase !== 'bidding' : true;
  const hostOnline = mode !== 'lan-host' || lanHost?.status === 'open';
  const guestOnline = mode !== 'lan-guest' ? true : guestStarted;
  const canAct =
    activeView.canAct &&
    hostOnline &&
    guestOnline &&
    handVisible &&
    (mode !== 'lan-guest' || Boolean(guest)) &&
    (mode !== 'lan-host' || Boolean(lanHost)) &&
    (mode !== 'ai' || state.turn === 0);
  const connectedGuests = lanPlayers.filter((player) => player.seat > 0 && player.connected);
  const canHint =
    (mode === 'ai' || mode === 'local') &&
    activeView.phase === 'bidding' &&
    activeView.canAct &&
    handVisible &&
    (mode !== 'ai' || state.turn === 0);
  const canUndo = (() => {
    if (!(mode === 'ai' || mode === 'local')) return false;
    if (state.phase !== 'bidding' || history.length === 0) return false;
    if (mode === 'ai') {
      return history.some(
        (item) => item.phase === 'bidding' && item.round === state.round && item.turn === 0,
      );
    }
    const previous = history[history.length - 1];
    return previous.phase === 'bidding' && previous.round === state.round;
  })();
  const shownThinking =
    aiThinking ||
    (activeView.phase === 'bidding' &&
      activeView.turn !== viewerSeat &&
      (isAiName(shownNames[activeView.turn]) ||
        (mode === 'lan-host' && !lanPlayers[activeView.turn]?.connected)));

  const sendViews = useCallback((next: GameState, nextNames: string[]) => {
    const host = hostRef.current;
    if (!host) return;
    for (let seat = 1; seat < next.playerCount; seat += 1) {
      if (lanPlayersRef.current[seat]?.connected) {
        host.sendView(seat, view(next, seat, nextNames));
      }
    }
  }, []);

  const commit = useCallback(
    (next: GameState, currentMode: Mode, previous: GameState) => {
      stateRef.current = next;
      setHistory((items) => [...items, previous]);
      setState(next);
      setHint(null);
      setToast('');
      setAiThinking(false);
      if (soundOn) {
        if (next.phase === 'game-over') {
          chime(currentMode === 'ai' && next.winner !== 0 ? 'lose' : 'win');
        } else if (next.phase === 'reveal') {
          chime('reveal');
        } else {
          chime('bid');
        }
      }
      if (next.phase === 'game-over' && !recorded) {
        setRecorded(true);
        if (currentMode !== 'lan-guest') {
          setRecord(
            recordGame(next, namesRef.current, {
              mode: recordModeFor(currentMode),
              ...(currentMode === 'ai' ? { level } : {}),
            }),
          );
        }
      }
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.phase !== 'game-over') {
          setSaved(
            saveGame({ state: next, mode: currentMode, level, names: namesRef.current }),
          );
        } else {
          clearSave();
          setSaved(null);
        }
      }
      if (currentMode === 'lan-host') sendViews(next, namesRef.current);
    },
    [level, recorded, sendViews, soundOn],
  );

  const closeLan = useCallback(() => {
    lanStartedRef.current = false;
    lanActiveRef.current = false;
    autoJoinRef.current = true;
    guestJoinSeqRef.current += 1;
    hostCreateSeqRef.current += 1;
    const host = hostRef.current;
    hostRef.current = null;
    if (host) {
      try {
        host.sendResult({ kind: 'closed' });
      } catch {
        /* socket may already be closed */
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
    setMode('ai');
    setScreen('home');
  }, [closeLan]);

  const openSetup = useCallback((kind: 'ai' | 'local') => {
    setSetupMode(kind);
    setScreen('setup');
  }, []);

  const startLocal = useCallback(
    (nextMode: 'ai' | 'local') => {
      const next = setup({
        rng: Math.random,
        playerCount,
        onesWild,
        spotOn,
        starter: 0,
      });
      const nextNames =
        nextMode === 'ai'
          ? ['@you', ...Array.from({ length: playerCount - 1 }, (_, index) => `@ai${index + 1}`)]
          : Array.from({ length: playerCount }, (_, index) => `@p${index + 1}`);
      stateRef.current = next;
      namesRef.current = nextNames;
      setMode(nextMode);
      setNames(nextNames);
      setState(next);
      setHistory([]);
      setHint(null);
      setRevealed(nextMode === 'ai');
      setRecorded(false);
      setAiThinking(false);
      setToast('');
      setScreen('game');
      clearSave();
      setSaved(null);
    },
    [onesWild, playerCount, spotOn],
  );

  const resume = useCallback(() => {
    if (!saved) return;
    const next = saved.state;
    const restoredNames = saved.names.length
      ? saved.names
      : ['@you', ...Array.from({ length: next.playerCount - 1 }, (_, index) => `@ai${index + 1}`)];
    stateRef.current = next;
    namesRef.current = restoredNames;
    setMode(saved.mode);
    setLevel(saved.level);
    setPlayerCount(next.playerCount);
    setOnesWild(next.onesWild);
    setSpotOn(next.spotOn);
    setState(next);
    setNames(restoredNames);
    setHistory([]);
    setHint(null);
    setRevealed(saved.mode === 'ai');
    setRecorded(false);
    setAiThinking(false);
    setToast('');
    setScreen('game');
  }, [saved]);

  const undo = useCallback(() => {
    if (mode !== 'ai' && mode !== 'local') return;
    if (state.phase !== 'bidding' || history.length === 0) return;
    let index = history.length - 1;
    if (mode === 'ai') {
      while (
        index >= 0 &&
        !(history[index].phase === 'bidding' && history[index].round === state.round && history[index].turn === 0)
      ) {
        index -= 1;
      }
    }
    if (index < 0) return;
    const previous = history[index];
    if (previous.phase !== 'bidding' || previous.round !== state.round) return;
    stateRef.current = previous;
    setHistory(history.slice(0, index));
    setState(previous);
    setHint(null);
    setRevealed(mode === 'ai');
    setRecorded(false);
    setSaved(saveGame({ state: previous, mode, level, names: namesRef.current }));
  }, [history, level, mode, state.phase, state.round]);

  const showHint = useCallback(() => {
    if (!canHint || state.turn < 0) return;
    const next = hintFor(state, state.turn);
    if (!next) return;
    setHint(next);
    if (next.action.type === 'bid') {
      setQuantity(next.action.quantity);
      setFace(next.action.face);
    }
    setToast(hintMessage(lang, next));
  }, [canHint, lang, state]);

  const canBidControls = canAct && activeView.phase === 'bidding';
  const currentBid = activeView.currentBid;
  const minQuantity = currentBid ? currentBid.quantity : 1;
  const maxQuantity = activeView.maxQuantity;
  const legalFace = useCallback(
    (value: number) => {
      if (!currentBid) return true;
      if (quantity > currentBid.quantity) return true;
      return quantity === currentBid.quantity && value > currentBid.face;
    },
    [currentBid, quantity],
  );
  const canRaise = canBidControls && higherBid(currentBid, quantity, face);
  const noRaisePossible =
    Boolean(currentBid) &&
    currentBid !== null &&
    currentBid.quantity >= maxQuantity &&
    currentBid.face >= 6;

  const doBid = useCallback(() => {
    if (!canBidControls || !higherBid(currentBid, quantity, face)) return;
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'bid', quantity, face, actions: activeView.actions });
      return;
    }
    const seat = mode === 'local' ? state.turn : 0;
    const result = applySeat(state, seat, { type: 'bid', quantity, face });
    if (!result.ok) {
      setToast(tr('illegalBid'));
      return;
    }
    commit(result.state, mode, state);
  }, [activeView.actions, canBidControls, commit, currentBid, face, guest, mode, quantity, state, tr]);

  const doChallenge = useCallback(() => {
    if (!canBidControls || !activeView.canChallenge) return;
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'challenge', actions: activeView.actions });
      return;
    }
    const seat = mode === 'local' ? state.turn : 0;
    const result = applySeat(state, seat, { type: 'challenge' });
    if (result.ok) commit(result.state, mode, state);
  }, [activeView.actions, activeView.canChallenge, canBidControls, commit, guest, mode, state]);

  const doSpot = useCallback(() => {
    if (!canBidControls || !activeView.canSpotOn) return;
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'spot-on', actions: activeView.actions });
      return;
    }
    const seat = mode === 'local' ? state.turn : 0;
    const result = applySeat(state, seat, { type: 'spot-on' });
    if (result.ok) commit(result.state, mode, state);
  }, [activeView.actions, activeView.canSpotOn, canBidControls, commit, guest, mode, state]);

  const advanceRound = useCallback(() => {
    if (mode === 'lan-guest' || state.phase !== 'reveal') return;
    const next = nextRound(state, Math.random);
    if (!next.ok) return;
    stateRef.current = next.state;
    setState(next.state);
    setHistory([]);
    setHint(null);
    setRevealed(mode !== 'local');
    setToast('');
    setAiThinking(false);
    if (soundOn) chime('roll');
    if (mode === 'ai' || mode === 'local') {
      setSaved(saveGame({ state: next.state, mode, level, names: namesRef.current }));
    } else if (mode === 'lan-host') {
      sendViews(next.state, namesRef.current);
    }
  }, [level, mode, sendViews, soundOn, state]);

  const restartLan = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const next = setup({
      rng: Math.random,
      playerCount: namesRef.current.length,
      onesWild,
      spotOn,
      starter: 0,
    });
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setHint(null);
    setRevealed(true);
    setRecorded(false);
    setAiThinking(false);
    setToast('');
    host.start();
    sendViews(next, namesRef.current);
  }, [onesWild, sendViews, spotOn]);

  const resetRecord = useCallback(() => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setRecord(clearStoredRecord());
    setClearArmed(false);
    setToast(tr('recordCleared'));
  }, [clearArmed, tr]);

  const copyInvite = useCallback(async () => {
    if (!lanInvite) return;
    try {
      await navigator.clipboard.writeText(lanInvite);
      setToast(tr('lanCopied'));
    } catch {
      setToast(lanInvite);
    }
  }, [lanInvite, tr]);

  // AI seats, including empty or disconnected LAN seats, act after a short pause.
  useEffect(() => {
    if (screen !== 'game' || activeView.phase !== 'bidding') {
      setAiThinking(false);
      return;
    }
    const seat = activeView.turn;
    if (seat < 0 || seat === viewerSeat && mode === 'local') {
      setAiThinking(false);
      return;
    }
    const aiSeat =
      (mode === 'ai' && seat > 0) ||
      (mode === 'lan-host' &&
        (isAiName(shownNames[seat]) || !lanPlayersRef.current[seat]?.connected));
    if (!aiSeat) {
      setAiThinking(false);
      return;
    }
    const delay = mode === 'lan-host' && !isAiName(shownNames[seat]) ? 1900 : 650;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const currentState = stateRef.current;
      if (currentState.phase !== 'bidding' || currentState.turn !== seat) return;
      const action =
        chooseAction(currentState, seat, level, Math.random) ??
        fallbackAction(currentState, seat);
      if (!action) return;
      const result = applySeat(currentState, seat, action);
      if (result.ok) commit(result.state, mode, currentState);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [activeView.phase, activeView.turn, commit, level, mode, screen, shownNames, viewerSeat]);

  // The guest hears the host's table changes through view action counts.
  useEffect(() => {
    if (!guestView) {
      lastGuestActionsRef.current = -1;
      return;
    }
    const previous = lastGuestActionsRef.current;
    lastGuestActionsRef.current = guestView.actions;
    if (previous < 0 || guestView.actions <= previous || !soundOn) return;
    if (guestView.phase === 'game-over') chime('win');
    else if (guestView.phase === 'reveal') chime('reveal');
    else chime('bid');
  }, [guestView, soundOn]);

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
        maxPlayers: lanTableSize,
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
        if (lanStartedRef.current) {
          const merged = namesRef.current.slice();
          let changed = false;
          for (const player of players) {
            if (
              player.seat > 0 &&
              player.connected &&
              player.seat < merged.length &&
              isAiName(merged[player.seat])
            ) {
              merged[player.seat] = player.name;
              changed = true;
            }
          }
          if (changed) {
            namesRef.current = merged;
            setNames(merged);
          }
        }
        setLanPlayers(players);
        created.sendLobby();
        if (lanStartedRef.current) sendViews(stateRef.current, namesRef.current);
      });
      created.onIntent((seat, intent) => {
        if (hostRef.current !== created) return;
        const value = intent as
          | { type?: string; quantity?: unknown; face?: unknown; actions?: number }
          | null;
        if (!value || seat <= 0 || seat >= stateRef.current.playerCount) return;
        if (value.actions !== stateRef.current.actions) return;
        const current = stateRef.current;
        if (value.type === 'bid') {
          const result = applySeat(current, seat, {
            type: 'bid',
            quantity: Number(value.quantity),
            face: Number(value.face),
          });
          if (result.ok) commit(result.state, 'lan-host', current);
        } else if (value.type === 'challenge') {
          const result = applySeat(current, seat, { type: 'challenge' });
          if (result.ok) commit(result.state, 'lan-host', current);
        } else if (value.type === 'spot-on') {
          const result = applySeat(current, seat, { type: 'spot-on' });
          if (result.ok) commit(result.state, 'lan-host', current);
        }
      });
      created.onClose(() => {
        if (hostRef.current !== created) return;
        hostRef.current = null;
        lanStartedRef.current = false;
        setLanHost(null);
        setLanPlayers([]);
        setLanError(t(lang, 'lanHostLost'));
      });
      const url = inviteUrl(info, code, code, lang === 'zh' ? '家人' : 'Guest');
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        color: { dark: '#13302b', light: '#f6efdf' },
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
  }, [closeLan, commit, hostName, lang, lanBusy, lanTableSize, sendViews]);

  const startLan = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open' || connectedGuests.length === 0) return;
    const tableSize = lanTableSize;
    const next = setup({
      rng: Math.random,
      playerCount: tableSize,
      onesWild,
      spotOn,
      starter: 0,
    });
    const nextNames = Array.from({ length: tableSize }, (_, seat) => {
      if (seat === 0) return hostName.trim() || t(lang, 'lanHostNamePlaceholder');
      const player = lanPlayers[seat];
      if (player?.connected) return player.name;
      return `@ai${seat}`;
    });
    stateRef.current = next;
    namesRef.current = nextNames;
    setState(next);
    setNames(nextNames);
    setHistory([]);
    setHint(null);
    setRevealed(true);
    setRecorded(false);
    setAiThinking(false);
    setToast('');
    setLanError('');
    setMode('lan-host');
    setScreen('game');
    clearSave();
    setSaved(null);
    lanStartedRef.current = true;
    host.start();
    host.sendLobby();
    sendViews(next, nextNames);
  }, [
    connectedGuests.length,
    hostName,
    lang,
    lanPlayers,
    lanTableSize,
    onesWild,
    sendViews,
    spotOn,
  ]);

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
      lastGuestActionsRef.current = -1;
      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        const next = payload as SeatView;
        if (!next || !Array.isArray(next.ownDice) || typeof next.playerCount !== 'number') return;
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
        setLanError(t(lang, 'lanClosed'));
        setLanRole('guest');
        setScreen('lan');
      }
    }, 900);
    return () => window.clearInterval(timer);
  }, [guest, lang]);

  useEffect(() => {
    const onUnload = () => {
      try {
        hostRef.current?.sendResult({ kind: 'closed' });
      } catch {
        /* tab is going away */
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  // Keyboard path. Buttons stay tabbable; these are the fast table shortcuts.
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
      if (key >= '1' && key <= '6') {
        event.preventDefault();
        const value = Number(key);
        if (legalFace(value)) setFace(value);
        return;
      }
      if (key === '[') {
        event.preventDefault();
        setQuantity((value) => Math.max(minQuantity, value - 1));
      } else if (key === ']') {
        event.preventDefault();
        setQuantity((value) => Math.min(maxQuantity, value + 1));
      } else if (key === 'r') {
        event.preventDefault();
        doBid();
      } else if (key === 'c') {
        event.preventDefault();
        doChallenge();
      } else if (key === 's') {
        event.preventDefault();
        doSpot();
      } else if (key === 'h') {
        event.preventDefault();
        showHint();
      } else if (key === 'u') {
        event.preventDefault();
        undo();
      } else if ((key === 'e' || event.key === ' ') && mode === 'local' && !handVisible) {
        event.preventDefault();
        setRevealed(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    doBid,
    doChallenge,
    doSpot,
    goHome,
    handVisible,
    legalFace,
    maxQuantity,
    minQuantity,
    mode,
    screen,
    showHint,
    undo,
  ]);

  const lastReveal = activeView.lastReveal;
  const winnerSeat = activeView.winner;
  const standings = winnerSeat === null
    ? []
    : [winnerSeat, ...activeView.outOrder.slice().reverse()].filter(
        (seat, index, all) => all.indexOf(seat) === index,
      );
  const lastBidder = currentBid ? nameAt(currentBid.seat) : '';
  const currentBidText = currentBid
    ? t(lang, 'bidLabel', { n: currentBid.quantity, face: t(lang, faceKey(currentBid.face)) })
    : t(lang, 'noBid');

  const statusHeadline = (() => {
    if (activeView.phase === 'game-over') return t(lang, 'gameOver');
    if (activeView.phase === 'reveal') {
      return lastReveal?.kind === 'spot-on' ? t(lang, 'spotTitle') : t(lang, 'challengeTitle');
    }
    if (activeView.canAct) return t(lang, 'yourTurn');
    if (mode === 'ai' && activeView.turn > 0) {
      return t(lang, 'thinking', { name: currentName });
    }
    if (mode === 'lan-guest') return t(lang, 'waitingFor', { name: currentName });
    return t(lang, 'turnOf', { name: currentName });
  })();

  const statusDetail = (() => {
    if (activeView.phase === 'game-over') return t(lang, 'standings');
    if (activeView.phase === 'reveal') {
      if (!lastReveal) return '';
      return t(lang, 'revealCount', { n: lastReveal.count });
    }
    if (activeView.canAct) return currentBid ? t(lang, 'bidHelp') : t(lang, 'noBid');
    if (mode === 'ai') return t(lang, 'aiThinking');
    return `${t(lang, 'roundN', { n: activeView.round })} · ${t(lang, 'playerCount', {
      n: activeView.playerCount,
    })}`;
  })();

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
        <div className="hero-felt" aria-hidden="true">
          <span className="hero-cup" />
          <div className="hero-dice">
            {[1, 3, 4, 5, 6].map((value, index) => (
              <Die key={value} value={value} lang={lang} index={index} />
            ))}
          </div>
          <BidChip quantity={4} face={3} lang={lang} />
          <span className="hero-ring" />
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume} data-testid="continue-game">
                <span>{tr('continueGame')}</span>
                <small>
                  {saved.mode === 'ai' ? t(lang, saved.level) : tr('modeLocal')} ·{' '}
                  {t(lang, 'roundN', { n: saved.state.round })}
                </small>
              </button>
            )}
            <button
              className={saved ? 'secondary wide' : 'primary wide'}
              onClick={() => openSetup('ai')}
              data-testid="start-solo"
            >
              {tr('playAi')}
            </button>
            <button
              className="secondary wide"
              onClick={() => openSetup('local')}
              data-testid="start-local"
            >
              {tr('playLocal')}
            </button>
            <button
              className="secondary wide lan-menu-button"
              onClick={() => {
                closeLan();
                setLanRole('hub');
                setMode('ai');
                setScreen('lan');
              }}
              data-testid="start-lan"
            >
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
            <span>{tr('games')}</span>
            <strong>{record.games}</strong>
            <span className="dot">·</span>
            <span>{tr('lastWinner')}</span>
            <strong className="strip-name">
              {record.lastWinner ? displayName(record.lastWinner, lang) : tr('none')}
            </strong>
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
      <h2 className="screen-title">{tr('setupTitle')}</h2>

      <section className="setup-block">
        <h3>{tr('players')}</h3>
        <div className="segmented">
          {[2, 3, 4, 5, 6].map((count) => (
            <button
              key={count}
              className={`segment ${playerCount === count ? 'selected' : ''}`}
              onClick={() => setPlayerCount(count)}
              aria-pressed={playerCount === count}
            >
              {count}
            </button>
          ))}
        </div>
      </section>

      {setupMode === 'ai' && (
        <section className="setup-block">
          <h3>{tr('aiLevel')}</h3>
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
        </section>
      )}

      <section className="setup-block">
        <h3>{tr('tableOptions')}</h3>
        <div className="option-row">
          <div>
            <strong>{tr('spotOn')}</strong>
            <p className="option-note">{tr('spotOnNote')}</p>
          </div>
          <button
            className={`toggle ${spotOn ? 'on' : ''}`}
            onClick={() => setSpotOn((value) => !value)}
            aria-pressed={spotOn}
            data-testid="toggle-spot"
          >
            <span />
            {spotOn ? tr('spotOnOn') : tr('spotOnOff')}
          </button>
        </div>
        <div className="option-row">
          <div>
            <strong>{tr('onesWild')}</strong>
            <p className="option-note">{tr('onesWildNote')}</p>
          </div>
          <button
            className={`toggle ${onesWild ? 'on' : ''}`}
            onClick={() => setOnesWild((value) => !value)}
            aria-pressed={onesWild}
            data-testid="toggle-wild"
          >
            <span />
            {onesWild ? tr('onesWildOn') : tr('onesWildOff')}
          </button>
        </div>
        <div className="option-row">
          <div>
            <strong>{tr('reduceMotion')}</strong>
            <p className="option-note">{tr('motionNote')}</p>
          </div>
          <button
            className={`toggle ${reduceMotion ? 'on' : ''}`}
            onClick={() => setReduceMotion((value) => !value)}
            aria-pressed={reduceMotion}
            data-testid="toggle-motion"
          >
            <span />
            {reduceMotion ? tr('motionOn') : tr('motionOff')}
          </button>
        </div>
      </section>

      <div className="row-actions">
        <button className="primary" onClick={() => startLocal(setupMode)} data-testid="begin-game">
          {tr('begin')}
        </button>
        <button className="ghost" onClick={goHome}>
          {tr('back')}
        </button>
      </div>
    </main>
  );

  const seatBidText = (seat: number) => {
    for (let index = activeView.bids.length - 1; index >= 0; index -= 1) {
      const entry = activeView.bids[index];
      if (entry.seat === seat) {
        return t(lang, 'bidShort', { n: entry.quantity, face: entry.face });
      }
    }
    return '';
  };

  const revealPanel = lastReveal ? (
    <section className="reveal-panel" data-testid="reveal-panel" aria-live="polite">
      <div className="reveal-head">
        <span className="result-kicker">
          {t(lang, 'roundN', { n: lastReveal.round })} ·{' '}
          {lastReveal.kind === 'spot-on' ? tr('spotTitle') : tr('challengeTitle')}
        </span>
        <h3>{currentBidText}</h3>
        <p>
          {t(lang, 'revealCount', { n: lastReveal.count })} ·{' '}
          {lastReveal.bidTrue ? tr('bidTrue') : tr('bidFalse')}
        </p>
        <p className="reveal-outcome">
          {lastReveal.callerWon
            ? t(lang, 'callerWins', { name: nameAt(lastReveal.challenger) })
            : t(lang, 'callerLoses', { name: nameAt(lastReveal.challenger) })}
          {' · '}
          {t(lang, 'lostDie', { name: nameAt(lastReveal.loser) })}
        </p>
      </div>
      <div className={`reveal-grid seats-${activeView.playerCount}`}>
        {Array.from({ length: activeView.playerCount }, (_, seat) => (
          <div
            key={seat}
            className={`reveal-seat ${lastReveal.loser === seat ? 'is-loser' : ''} ${
              lastReveal.dice[seat].length === 0 ? 'is-out' : ''
            }`}
          >
            <div className="reveal-seat-head">
              <strong>{nameAt(seat)}</strong>
              <span>{t(lang, 'diceLeft', { n: lastReveal.dice[seat]?.length ?? 0 })}</span>
            </div>
            <DiceTray
              dice={lastReveal.dice[seat]}
              lang={lang}
              label={nameAt(seat)}
              testId={`reveal-seat-${seat}`}
              compact
            />
          </div>
        ))}
      </div>
      {mode === 'lan-guest' ? (
        <span className="wait-pill">{tr('waitHostNext')}</span>
      ) : (
        <button className="primary next-round-button" onClick={advanceRound} data-testid="next-round">
          {tr('nextRound')}
        </button>
      )}
    </section>
  ) : null;

  const resultPanel = (
    <section className="result-panel" data-testid="result-panel" aria-live="polite">
      <span className="result-kicker">{tr('gameOver')}</span>
      <h3>{winnerSeat === null ? tr('gameOver') : t(lang, 'winnerIs', { name: nameAt(winnerSeat) })}</h3>
      {lastReveal && (
        <p className="result-reveal-line">
          {currentBidText} · {t(lang, 'revealCount', { n: lastReveal.count })} ·{' '}
          {lastReveal.bidTrue ? tr('bidTrue') : tr('bidFalse')}
        </p>
      )}
      <ol className="ranking-list">
        {standings.map((seat, index) => (
          <li key={seat} className={seat === viewerSeat ? 'is-you' : ''}>
            <span className="place">{index + 1}</span>
            <span className="ranking-name">{nameAt(seat)}</span>
            <span className="ranking-dice">
              {t(lang, 'diceLeft', { n: activeView.diceCounts[seat] ?? 0 })}
            </span>
          </li>
        ))}
      </ol>
      {mode === 'lan-guest' ? (
        <span className="wait-pill">{tr('lanWaitRestart')}</span>
      ) : (
        <div className="result-actions">
          <button
            className="primary"
            onClick={() => {
              if (mode === 'lan-host') restartLan();
              else startLocal(mode === 'ai' ? 'ai' : 'local');
            }}
            data-testid="play-again"
          >
            {tr('playAgain')}
          </button>
          {(mode === 'ai' || mode === 'local') && (
            <button
              className="secondary"
              onClick={() => {
                setSetupMode(mode === 'ai' ? 'ai' : 'local');
                setScreen('setup');
              }}
            >
              {tr('changeSettings')}
            </button>
          )}
          <button className="text-button" onClick={goHome}>
            {tr('home')} →
          </button>
        </div>
      )}
    </section>
  );

  const gameScreen = (
    <main
      className="shell game-shell"
      data-phase={activeView.phase}
      data-turn={activeView.turn}
      data-mode={mode}
    >
      <header className="game-top">
        <button className="back" onClick={goHome}>
          ← {tr('home')}
        </button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>{modeLabel(lang, mode, level)}</span>
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
        <section className="table-column">
          <div className={`turn-bar ${activeView.phase !== 'bidding' ? 'is-over' : ''}`} aria-live="polite">
            <span className={`turn-medallion ${activeView.phase === 'bidding' ? 'live' : ''}`}>
              {activeView.phase === 'bidding' ? activeView.turn + 1 : '★'}
            </span>
            <div className="turn-copy">
              <strong>{statusHeadline}</strong>
              <p>{statusDetail}</p>
            </div>
            {shownThinking && (
              <span className="thinking" aria-hidden="true">…</span>
            )}
          </div>

          {mode !== 'local' && lanError && (
            <p className="error game-error" role="alert">{lanError}</p>
          )}

          <div className="felt">
            <div className={`seat-grid seats-${activeView.playerCount}`}>
              {Array.from({ length: activeView.playerCount }, (_, seat) => (
                <PlayerSeat
                  key={seat}
                  seat={seat}
                  name={nameAt(seat)}
                  count={activeView.diceCounts[seat] ?? 0}
                  turn={activeView.phase === 'bidding' && activeView.turn === seat}
                  out={!activeView.alive[seat]}
                  isYou={seat === viewerSeat}
                  thinking={shownThinking && activeView.turn === seat}
                  winner={activeView.phase === 'game-over' && winnerSeat === seat}
                  place={
                    activeView.outOrder.length > 0
                      ? activeView.outOrder.includes(seat)
                        ? activeView.playerCount - activeView.outOrder.indexOf(seat)
                        : null
                      : null
                  }
                  bidText={seatBidText(seat)}
                  lang={lang}
                />
              ))}
            </div>

            <div className="table-center">
              <span className="center-kicker">{tr('currentBid')}</span>
              {currentBid ? (
                <>
                  <div
                    className="current-bid"
                    data-testid="current-bid"
                    data-quantity={currentBid.quantity}
                    data-face={currentBid.face}
                  >
                    <BidChip quantity={currentBid.quantity} face={currentBid.face} lang={lang} />
                  </div>
                  <p className="current-bid-by">{t(lang, 'bidBy', { name: lastBidder })}</p>
                </>
              ) : (
                <p className="current-bid empty" data-testid="current-bid">{tr('noBid')}</p>
              )}
              <div className="bid-history" aria-label={tr('bidHistory')}>
                {activeView.bids.length === 0 ? (
                  <span className="no-bids">{tr('noBids')}</span>
                ) : (
                  activeView.bids.slice(-6).map((entry, index) => (
                    <span key={`${entry.seat}-${entry.quantity}-${entry.face}-${index}`} className="history-chip">
                      <span>{nameAt(entry.seat)}</span>
                      <strong>{entry.quantity}×{entry.face}</strong>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {activeView.phase === 'reveal' && revealPanel}
          {activeView.phase === 'game-over' && resultPanel}

          {activeView.phase === 'bidding' && (
            <section className="hand-area">
              <div className="hand-head">
                <div className="hand-id">
                  <span className="hand-kicker">{tr('ownDiceLabel')}</span>
                  <strong>{viewerName}</strong>
                </div>
                <span className="hand-count">
                  {t(lang, 'diceLeft', { n: activeView.ownDice.length })}
                </span>
              </div>

              {handVisible ? (
                <>
                  <div className="own-cup">
                    <span className="cup-lid" aria-hidden="true" />
                    <DiceTray dice={activeView.ownDice} lang={lang} />
                  </div>

                  <div className={`bid-builder ${canAct ? '' : 'is-idle'}`}>
                    <div className="builder-side">
                      <span className="builder-label">{tr('quantity')}</span>
                      <div className="stepper">
                        <button
                          type="button"
                          className="step-button"
                          onClick={() => setQuantity((value) => Math.max(minQuantity, value - 1))}
                          disabled={!canAct || quantity <= minQuantity}
                          aria-label={`${tr('quantity')} −`}
                          data-testid="quantity-minus"
                        >
                          −
                        </button>
                        <strong className="quantity-value" data-testid="quantity-value">{quantity}</strong>
                        <button
                          type="button"
                          className="step-button"
                          onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                          disabled={!canAct || quantity >= maxQuantity}
                          aria-label={`${tr('quantity')} +`}
                          data-testid="quantity-plus"
                        >
                          +
                        </button>
                      </div>
                      <span className="builder-note">
                        {currentBid
                          ? t(lang, 'minQuantity', { n: minQuantity })
                          : t(lang, 'maxQuantity', { n: maxQuantity })}
                      </span>
                    </div>

                    <div className="builder-main">
                      <span className="builder-label">{tr('face')}</span>
                      <div className="face-grid">
                        {[1, 2, 3, 4, 5, 6].map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={`face-button ${face === value ? 'selected' : ''} ${
                              hint?.action.type === 'bid' && hint.face === value ? 'hinted' : ''
                            }`}
                            onClick={() => setFace(value)}
                            disabled={!canAct || !legalFace(value)}
                            aria-label={tr(faceKey(value))}
                            aria-pressed={face === value}
                            data-face={value}
                            data-testid={`face-${value}`}
                          >
                            <Die value={value} lang={lang} small />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="builder-actions">
                      <button
                        className={`primary raise-button ${
                          hint?.action.type === 'bid' && canRaise ? 'hinted' : ''
                        }`}
                        onClick={doBid}
                        disabled={!canRaise}
                        data-testid="raise"
                      >
                        {tr('raise')}
                      </button>
                      <button
                        className={`secondary challenge-button ${
                          hint?.action.type === 'challenge' ? 'hinted' : ''
                        }`}
                        onClick={doChallenge}
                        disabled={!canBidControls || !activeView.canChallenge}
                        data-testid="challenge"
                      >
                        {tr('challenge')}
                      </button>
                      {activeView.spotOn && (
                        <button
                          className={`secondary spot-button ${
                            hint?.action.type === 'spot-on' ? 'hinted' : ''
                          }`}
                          onClick={doSpot}
                          disabled={!canBidControls || !activeView.canSpotOn}
                          data-testid="spot"
                        >
                          {tr('spotCall')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bid-line" aria-live="polite">
                    <span>{currentBidText}</span>
                    {currentBid && (
                      <span className="bid-line-by">{t(lang, 'bidBy', { name: lastBidder })}</span>
                    )}
                    {canBidControls && currentBid && quantity === currentBid.quantity && face <= currentBid.face && (
                      <span className="bid-problem">{tr('sameQuantityFace')}</span>
                    )}
                    {canBidControls && noRaisePossible && (
                      <span className="bid-problem">{tr('noRaises')}</span>
                    )}
                  </div>

                  {hint && (
                    <section
                      className="hint-card"
                      data-testid="hint-card"
                      data-action={hint.action.type}
                      data-quantity={hint.action.type === 'bid' ? hint.action.quantity : undefined}
                      data-face={hint.action.type === 'bid' ? hint.action.face : undefined}
                      aria-live="polite"
                    >
                      <span className="hint-mark" aria-hidden="true">✦</span>
                      <p>{hintMessage(lang, hint)}</p>
                    </section>
                  )}

                </>
              ) : (
                <PrivacyGate
                  name={nameAt(activeView.turn)}
                  lang={lang}
                  onReveal={() => setRevealed(true)}
                />
              )}

              <div className="hand-tools">
                <button
                  className="ghost hint-button"
                  onClick={showHint}
                  disabled={!canHint}
                  data-testid="hint"
                >
                  {tr('hint')}
                </button>
                <button
                  className="ghost undo-button"
                  onClick={undo}
                  disabled={!canUndo}
                  data-testid="undo"
                >
                  {tr('undo')}
                </button>
              </div>
            </section>
          )}
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{tr('roundShort')}</h3>
            <div className="side-stat">
              <span>{tr('players')}</span>
              <strong>{activeView.playerCount}</strong>
            </div>
            <div className="side-stat">
              <span>{tr('roundShort')}</span>
              <strong>{activeView.round}</strong>
            </div>
            <div className="side-stat">
              <span>{tr('onesWild')}</span>
              <strong>{activeView.onesWild ? tr('onesWildOn') : tr('onesWildOff')}</strong>
            </div>
            <div className="side-stat">
              <span>{tr('spotOn')}</span>
              <strong>{activeView.spotOn ? tr('spotOnOn') : tr('spotOnOff')}</strong>
            </div>
            <p className="side-note">
              {mode === 'ai' ? tr('soloNote') : mode === 'local' ? tr('hotseatNote') : tr('lanNote')}
            </p>
          </div>

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanCode')}</h3>
                <span className={`status-dot ${connectedGuests.length > 0 ? 'online' : ''}`} />
              </div>
              <div className="room-code">{lanCode || '—'}</div>
              <p>
                {connectedGuests.length > 0
                  ? t(lang, 'playerCount', { n: activeView.playerCount })
                  : tr('lanWaiting')}
              </p>
              <div className="mini-seats">
                {Array.from({ length: activeView.playerCount - 1 }, (_, index) => {
                  const seat = index + 1;
                  const connected = lanPlayers[seat]?.connected;
                  return (
                    <span key={seat} className={`mini-seat ${connected ? 'online' : 'ai'}`}>
                      {connected ? lanPlayers[seat].name : nameAt(seat)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {mode === 'lan-guest' && (
            <div className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanGuestMode')}</h3>
                <span className={`status-dot ${guestStarted ? 'online' : ''}`} />
              </div>
              <p>{t(lang, 'lanRoom', { code: guestRoom || guestCode })}</p>
              <p className="peer">{tr('lanGuestSeat')}</p>
              {guestSeat >= 0 && <p className="peer">{t(lang, 'seatN', { n: guestSeat + 1 })}</p>}
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('record')}</h3>
            <p>
              {record.games} {tr('games')} · {tr('lastWinner')}{' '}
              {record.lastWinner ? displayName(record.lastWinner, lang) : tr('none')}
            </p>
            {mode !== 'lan-guest' && mode !== 'lan-host' && (
              <button className="text-button" onClick={() => setScreen('stats')}>
                {tr('viewRecord')} →
              </button>
            )}
          </div>

          <div className="side-card controls-mini">
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
              <div className="field">
                <span>{tr('lanTable')}</span>
                <div className="segmented small">
                  {[2, 3, 4, 5, 6].map((count) => (
                    <button
                      key={count}
                      className={`segment ${lanTableSize === count ? 'selected' : ''}`}
                      onClick={() => setLanTableSize(count)}
                      aria-pressed={lanTableSize === count}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
              <div className="lan-toggle-row">
                <span>{tr('spotOn')}</span>
                <button
                  className={`toggle ${spotOn ? 'on' : ''}`}
                  onClick={() => setSpotOn((value) => !value)}
                  aria-pressed={spotOn}
                >
                  <span />
                  {spotOn ? tr('spotOnOn') : tr('spotOnOff')}
                </button>
              </div>
              <div className="lan-toggle-row">
                <span>{tr('onesWild')}</span>
                <button
                  className={`toggle ${onesWild ? 'on' : ''}`}
                  onClick={() => setOnesWild((value) => !value)}
                  aria-pressed={onesWild}
                >
                  <span />
                  {onesWild ? tr('onesWildOn') : tr('onesWildOff')}
                </button>
              </div>
              <button
                className="primary wide"
                onClick={openLanHost}
                disabled={lanBusy}
                data-testid="lan-create"
              >
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
              {lanError && <p className="error" role="alert">{lanError}</p>}
            </section>
          </div>
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
                  <span className={`status-pill ${connectedGuests.length > 0 ? 'ready' : ''}`}>
                    {connectedGuests.length > 0 ? tr('lanReady') : tr('lanWaiting')}
                  </span>
                </div>
                <div className="room-code big">{lanCode}</div>
                <p className="lan-help">
                  {t(lang, 'playerCount', { n: lanTableSize })} · {tr('lanAiFill')}
                </p>
                <div className="peer-list">
                  {lanPlayers
                    .filter((player) => player.connected)
                    .map((player) => (
                      <span key={player.seat} className="peer-chip online">
                        <span className="peer-mark">{player.host ? '◆' : '◇'}</span>
                        <span className="peer-name">{player.name}</span>
                        <small>
                          {player.host ? tr('lanHostTag') : tr('lanGuestTag')} · {tr('lanOnline')}
                        </small>
                      </span>
                    ))}
                  {Array.from(
                    { length: Math.max(0, lanTableSize - 1 - connectedGuests.length) },
                    (_, index) => (
                      <span key={`empty-${index}`} className="peer-chip">
                        <span className="peer-mark">·</span>
                        <span className="peer-name">{tr('openSeat')}</span>
                      </span>
                    ),
                  )}
                </div>
                <button
                  className="primary wide"
                  onClick={startLan}
                  disabled={connectedGuests.length === 0}
                  data-testid="lan-start"
                >
                  {connectedGuests.length > 0 ? tr('lanStart') : tr('lanWaiting')}
                </button>
                <button className="secondary wide" onClick={copyInvite}>
                  {tr('lanCopyLink')}
                </button>
                <p className="lan-small">{tr('lanStartHint')}</p>
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
          <h2 className="screen-title">{guest ? tr('lanConnected') : tr('lanJoinTitle')}</h2>
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
            </div>
          )}
          {guest && (
            <div className="guest-card waiting-card">
              <div className="wait-orbit" aria-hidden="true">
                <span className="orbit-die">◆</span>
              </div>
              <h3>{tr('lanConnected')}</h3>
              <p>{tr('lanWaitingHost')}</p>
              <div className="guest-meta">
                <span>{t(lang, 'lanRoom', { code: guestRoom || guestCode })}</span>
                <span>{tr('lanGuestSeat')}</span>
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
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const statsTop = Object.entries(record.wins)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);
  const modeLabelFor = (value: RecordMode) =>
    value === 'ai' ? t(lang, 'modeAi') : value === 'local' ? t(lang, 'modeLocal') : t(lang, 'modeLan');

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
          <span className="empty-dice" aria-hidden="true">
            <span className="empty-die">◆</span>
            <span className="empty-die">◇</span>
            <span className="empty-die">◆</span>
          </span>
          <p>{tr('recordEmpty')}</p>
          <button className="primary" onClick={() => openSetup('ai')}>
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
            <div className="stat-card ai">
              <span>{tr('modeAi')}</span>
              <strong>{record.byMode.ai}</strong>
            </div>
            <div className="stat-card local">
              <span>{tr('modeLocal')}</span>
              <strong>{record.byMode.local}</strong>
            </div>
            <div className="stat-card lan">
              <span>{tr('modeLan')}</span>
              <strong>{record.byMode.lan}</strong>
            </div>
          </section>

          <section className="record-grid">
            <div className="record-card">
              <h3>{tr('winners')}</h3>
              {statsTop.length === 0 ? (
                <p className="recent-empty">{tr('none')}</p>
              ) : (
                <ul className="tally-list">
                  {statsTop.map(([name, count]) => (
                    <li key={name}>
                      <span className="tally-name">{displayName(name, lang)}</span>
                      <span className="tally-bar">
                        <i style={{ width: `${(count / record.games) * 100}%` }} />
                      </span>
                      <strong>{count}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="record-card">
              <h3>{tr('byMode')}</h3>
              <div className="mode-bars">
                {(['ai', 'local', 'lan'] as const).map((kind) => (
                  <div className="mode-bar" key={kind}>
                    <span>{modeLabelFor(kind)}</span>
                    <span className="tally-bar">
                      <i style={{ width: `${(record.byMode[kind] / record.games) * 100}%` }} />
                    </span>
                    <strong>{record.byMode[kind]}</strong>
                  </div>
                ))}
              </div>
              <div className="clear-row">
                {clearArmed && <p className="clear-confirm">{tr('clearConfirm')}</p>}
                <div className="clear-actions">
                  <button className={clearArmed ? 'danger' : 'text-button'} onClick={resetRecord}>
                    {clearArmed ? tr('clearYes') : tr('clearRecord')}
                  </button>
                  {clearArmed && (
                    <button className="secondary" onClick={() => setClearArmed(false)}>
                      {tr('clearKeep')}
                    </button>
                  )}
                </div>
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
                    <span className="recent-mark" aria-hidden="true">◆</span>
                    <div className="recent-main">
                      <strong>
                        {displayName(entry.winner, lang)} · {t(lang, 'playerCount', { n: entry.playerCount })}
                      </strong>
                      <span>
                        {modeLabelFor(entry.mode)}
                        {entry.level ? ` · ${t(lang, entry.level)}` : ''} ·{' '}
                        {t(lang, 'roundN', { n: entry.round })}
                      </span>
                    </div>
                    <time dateTime={new Date(entry.at).toISOString()}>
                      {formatDate(entry.at, lang)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
            <p className="record-note">{tr('recordNote')}</p>
          </section>
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <ol className="rules-list">
        {(
          [
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
            'rule11',
            'rule12',
          ] as const
        ).map((key) => (
          <li key={key}>{tr(key)}</li>
        ))}
      </ol>

      <section className="rules-extra">
        <h3>{tr('optionsTitle')}</h3>
        <div className="rules-option">
          <strong>{tr('optionOnesTitle')}</strong>
          <span>{tr('optionOnesText')}</span>
        </div>
        <div className="rules-option">
          <strong>{tr('optionSpotTitle')}</strong>
          <span>{tr('optionSpotText')}</span>
        </div>
        <h3>{tr('controlsTitle')}</h3>
        <p className="controls-line">{tr('controlsKeys')}</p>
        <p className="controls-line">{tr('controlsTap')}</p>
      </section>
      <button className="primary" onClick={goHome}>
        {tr('close')}
      </button>
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game' && mode === 'lan-guest' && !guestView) return lanScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
