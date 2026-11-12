import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseAiAction, fallbackAction, type AiLevel } from './ai/ai';
import { hintFor, type HintKind } from './ai/hint';
import {
  PrivacyGate,
  PlayerSeat,
  PlayingCard,
  RoleBadge,
  comboLabel,
} from './components/Table';
import {
  applySeat,
  beginRound,
  nextRound,
  rolesFor,
  setup,
  view,
  type Card,
  type GameState,
  type SeatView,
} from './game/president';
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
  recordRound,
  saveGame,
  type FamilyRecord,
  type RecordMode,
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'stats' | 'rules' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type LanRole = 'hub' | 'host' | 'guest';

interface HintState {
  cards: string[];
  pass: boolean;
  kind: HintKind;
}

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
  goOut: 'hintGoOut',
  control: 'hintControl',
  save: 'hintSave',
  lead: 'hintLead',
  clubs: 'hintClubs',
  low: 'hintLow',
  beat: 'hintBeat',
  pass: 'hintPass',
};

const AI_NAMES: Record<Lang, string[]> = {
  en: ['Ada', 'Bo', 'Cyd', 'Dee', 'Eli', 'Fen'],
  zh: ['阿达', '小博', '小茜', '小迪', '小伊', '小芬'],
};

const HERO_CARDS: Card[] = [
  { id: 'H14', rank: 14, suit: 'hearts' },
  { id: 'S13', rank: 13, suit: 'spades' },
  { id: 'D12', rank: 12, suit: 'diamonds' },
  { id: 'C11', rank: 11, suit: 'clubs' },
  { id: 'S15', rank: 15, suit: 'spades' },
];

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

function selectionProblem(activeView: SeatView, cards: Card[], lang: Lang): string {
  if (cards.length === 0) return '';
  if (cards.length > 3) return t(lang, 'chooseCards');
  if (new Set(cards.map((card) => card.rank)).size > 1) return t(lang, 'chooseCards');
  if (activeView.trick) {
    if (
      cards.length !== activeView.trick.count ||
      cards[0].rank < activeView.trick.rank
    ) {
      return t(lang, 'mustBeat', {
        combo: comboLabel(lang, activeView.trick.count, activeView.trick.rank),
      });
    }
  } else if (activeView.mustLeadClubs && !cards.some((card) => card.id === 'C3')) {
    return t(lang, 'leadClubs');
  }
  return '';
}

function tallyRows(tally: Record<string, number>): [string, number][] {
  return Object.entries(tally)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6);
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (invite ? 'lan-guest' : 'ai'));
  const [setupMode, setSetupMode] = useState<'ai' | 'local'>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [playerCount, setPlayerCount] = useState(4);
  const [exchangeEnabled, setExchangeEnabled] = useState(true);
  const [state, setState] = useState<GameState>(() => setup(4, () => 0.5, true));
  const [names, setNames] = useState<string[]>(() => ['@you', '@ai1', '@ai2', '@ai3']);
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [hint, setHint] = useState<HintState | null>(null);
  const [revealedSeat, setRevealedSeat] = useState<number | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.president.sound') !== 'off';
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
      return localStorage.getItem('familyarcade.president.hostName') ?? '';
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
  const autoJoinRef = useRef(false);
  const lanActiveRef = useRef(false);
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
      localStorage.setItem('familyarcade.president.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.president.hostName', hostName);
    } catch {
      /* ignore */
    }
  }, [hostName]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setToast('');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [screen]);

  useEffect(() => {
    if (screen !== 'stats') setClearArmed(false);
  }, [screen]);

  useEffect(() => {
    setSelected([]);
    setHint(null);
    setRevealedSeat(null);
  }, [state.turn, state.round, state.phase]);

  useEffect(() => {
    if (!guestView) return;
    setSelected([]);
    setHint(null);
  }, [guestView?.turn, guestView?.round, guestView?.phase, guestView]);

  const localView = useMemo(
    () => view(state, mode === 'local' ? state.turn : 0, names),
    [state, mode, names],
  );
  const activeView = (mode === 'lan-guest' ? guestView : localView) ?? localView;
  const shownNames = activeView.names.length > 0 ? activeView.names : names;
  const nameAt = useCallback(
    (seat: number) => displayName(shownNames[seat] ?? '', lang),
    [shownNames, lang],
  );
  const viewerSeat = activeView.seat;
  const viewerName = nameAt(viewerSeat);
  const currentName = nameAt(activeView.turn);
  const handVisible = mode === 'local' ? revealedSeat === viewerSeat : true;
  const hostOnline = mode !== 'lan-host' || lanHost?.status === 'open';
  const guestOnline = mode === 'lan-guest' ? guestStarted : true;
  const connectedGuests = lanPlayers.filter((player) => player.seat > 0 && player.connected);
  const canAct =
    activeView.canPlay &&
    hostOnline &&
    guestOnline &&
    (mode !== 'local' || handVisible) &&
    (mode !== 'lan-host' || Boolean(lanHost));
  const shownCards = activeView.hand.filter((card) => selected.includes(card.id));
  const problem = selectionProblem(activeView, shownCards, lang);
  const canSubmit = canAct && handVisible && shownCards.length > 0 && !problem;
  const canHint =
    (mode === 'ai' || mode === 'local') &&
    activeView.phase === 'playing' &&
    activeView.isTurn &&
    handVisible &&
    (mode !== 'ai' || state.turn === 0);
  const canUndo =
    (mode === 'ai' || mode === 'local') &&
    activeView.phase === 'playing' &&
    history.length > 0 &&
    handVisible &&
    (mode !== 'ai' || history.some((item) => item.phase === 'playing' && item.turn === 0));
  const shownThinking =
    aiThinking ||
    (activeView.phase === 'playing' &&
      activeView.turn !== viewerSeat &&
      isAiName(shownNames[activeView.turn]));

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
      setSelected([]);
      setHint(null);
      setToast('');
      if (soundOn) {
        if (next.phase === 'round-over') chime('win');
        else chime('place');
      }
      if (next.phase === 'round-over' && !recorded) {
        setRecorded(true);
        if (currentMode !== 'lan-guest') {
          setRecord(
            recordRound(next, namesRef.current, {
              mode: recordModeFor(currentMode),
              ...(currentMode === 'ai' ? { level } : {}),
            }),
          );
        }
      }
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.phase === 'playing' || next.phase === 'exchange') {
          setSaved(
            saveGame({
              state: next,
              mode: currentMode,
              level,
              names: namesRef.current,
            }),
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
    lanActiveRef.current = false;
    autoJoinRef.current = true;
    lanStartedRef.current = false;
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
    setMode('ai');
    setScreen('home');
  }, [closeLan]);

  const openLanHub = useCallback(() => {
    closeLan();
    setLanRole('hub');
    setMode('ai');
    setScreen('lan');
  }, [closeLan]);

  const startLocal = useCallback(
    (nextMode: 'ai' | 'local') => {
      const next = setup(playerCount, Math.random, exchangeEnabled);
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
      setSelected([]);
      setHint(null);
      setToast('');
      setRecorded(false);
      setAiThinking(false);
      setRevealedSeat(nextMode === 'local' ? null : 0);
      setScreen('game');
      clearSave();
      setSaved(null);
    },
    [exchangeEnabled, playerCount],
  );

  const openSetup = useCallback((kind: 'ai' | 'local') => {
    setSetupMode(kind);
    setScreen('setup');
  }, []);

  const resume = useCallback(() => {
    if (!saved) return;
    const next = saved.state;
    const restoredNames = saved.names.length
      ? saved.names
      : next.playerCount === 3
        ? ['@you', '@ai1', '@ai2']
        : ['@you', ...Array.from({ length: next.playerCount - 1 }, (_, index) => `@ai${index + 1}`)];
    stateRef.current = next;
    namesRef.current = restoredNames;
    setMode(saved.mode);
    setLevel(saved.level);
    setPlayerCount(next.playerCount);
    setExchangeEnabled(next.exchangeEnabled);
    setState(next);
    setNames(restoredNames);
    setHistory([]);
    setSelected([]);
    setHint(null);
    setToast('');
    setRecorded(false);
    setAiThinking(false);
    setRevealedSeat(saved.mode === 'local' ? null : 0);
    setScreen('game');
  }, [saved]);

  const undo = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') return;
    if (state.phase !== 'playing' || history.length === 0) return;
    let index = history.length - 1;
    if (mode === 'ai') {
      while (
        index >= 0 &&
        !(history[index].phase === 'playing' && history[index].turn === 0)
      ) {
        index -= 1;
      }
    }
    if (index < 0) return;
    const previous = history[index];
    stateRef.current = previous;
    setHistory(history.slice(0, index));
    setState(previous);
    setSelected([]);
    setHint(null);
    setRecorded(false);
    setRevealedSeat(mode === 'local' ? null : 0);
    setSaved(saveGame({ state: previous, mode, level, names: namesRef.current }));
  }, [history, level, mode, state.phase]);

  const showHint = useCallback(() => {
    if (!canHint) return;
    const next = hintFor(state, state.turn);
    if (!next) return;
    setHint({
      cards: next.cards.map((card) => card.id),
      pass: next.action.type === 'pass',
      kind: next.kind,
    });
    setToast(t(lang, HINT_KEYS[next.kind]));
  }, [canHint, lang, state]);

  const toggleCard = useCallback(
    (id: string) => {
      if (!canAct || !handVisible) return;
      const card = activeView.hand.find((item) => item.id === id);
      if (!card) return;
      if (selected.includes(id)) {
        setSelected(selected.filter((item) => item !== id));
        return;
      }
      if (selected.length >= 3) return;
      const first = activeView.hand.find((item) => selected.includes(item.id));
      if (first && first.rank !== card.rank) {
        setSelected([id]);
        return;
      }
      setSelected([...selected, id]);
    },
    [activeView.hand, canAct, handVisible, selected],
  );

  const playSelected = useCallback(() => {
    if (!canSubmit) return;
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'play', cards: selected, actions: activeView.actions });
      setSelected([]);
      setHint(null);
      return;
    }
    const seat = mode === 'local' ? state.turn : 0;
    const result = applySeat(state, seat, { type: 'play', cards: selected });
    if (!result.ok) {
      setToast(t(lang, 'chooseCards'));
      return;
    }
    commit(result.state, mode, state);
  }, [activeView.actions, canSubmit, commit, guest, lang, mode, selected, state]);

  const doPass = useCallback(() => {
    if (!canAct || !activeView.canPass) return;
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'pass', actions: activeView.actions });
      setSelected([]);
      setHint(null);
      return;
    }
    const seat = mode === 'local' ? state.turn : 0;
    const result = applySeat(state, seat, { type: 'pass' });
    if (!result.ok) return;
    commit(result.state, mode, state);
  }, [activeView.actions, activeView.canPass, canAct, commit, guest, mode, state]);

  const goNextRound = useCallback(() => {
    if (mode === 'lan-guest' || state.phase !== 'round-over') return;
    const next = nextRound(state, Math.random);
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setSelected([]);
    setHint(null);
    setToast('');
    setRecorded(false);
    setAiThinking(false);
    setRevealedSeat(mode === 'local' ? null : 0);
    if (mode === 'ai' || mode === 'local') {
      setSaved(
        saveGame({ state: next, mode, level, names: namesRef.current }),
      );
    } else {
      sendViews(next, namesRef.current);
    }
  }, [level, mode, sendViews, state]);

  const startRound = useCallback(() => {
    if (state.phase !== 'exchange') return;
    const next = beginRound(state);
    stateRef.current = next;
    setState(next);
    setSelected([]);
    setHint(null);
    setToast('');
    setRevealedSeat(mode === 'local' ? null : 0);
    if (mode === 'ai' || mode === 'local') {
      setSaved(saveGame({ state: next, mode, level, names: namesRef.current }));
    } else if (mode === 'lan-host') {
      sendViews(next, namesRef.current);
    }
  }, [level, mode, sendViews, state]);

  const resetRecord = useCallback(() => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setRecord(clearStoredRecord());
    setClearArmed(false);
    setToast(tr('recordCleared'));
  }, [clearArmed, tr]);

  // AI seats: solo is human seat 0; a LAN host fills empty seats with AI.
  useEffect(() => {
    if (screen !== 'game' || state.phase !== 'playing') {
      setAiThinking(false);
      return;
    }
    const aiSeat =
      (mode === 'ai' && state.turn > 0) ||
      (mode === 'lan-host' && isAiName(names[state.turn]) && lanHost?.status === 'open');
    if (!aiSeat) {
      setAiThinking(false);
      return;
    }
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.turn !== state.turn || current.phase !== 'playing') return;
      const action = chooseAiAction(current, current.turn, level, Math.random);
      setAiThinking(false);
      if (!action) return;
      const result = applySeat(current, current.turn, action);
      if (result.ok) commit(result.state, mode, current);
    }, 620);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, lanHost?.status, level, mode, names, screen, state]);

  // A dropped guest should not freeze the table; the host passes or leads low.
  useEffect(() => {
    if (screen !== 'game' || mode !== 'lan-host' || state.phase !== 'playing') return;
    const seat = state.turn;
    if (seat === 0 || isAiName(names[seat])) return;
    if (lanPlayersRef.current[seat]?.connected) return;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.actions !== state.actions || current.turn !== seat) return;
      const action = fallbackAction(current, seat);
      if (!action) return;
      const result = applySeat(current, seat, action);
      if (result.ok) commit(result.state, 'lan-host', current);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [commit, mode, names, screen, state]);

  // Keyboard path: buttons remain tabbable; P/U/H are game shortcuts.
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
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        doPass();
      } else if (event.key === 'u' || event.key === 'U') {
        event.preventDefault();
        undo();
      } else if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        showHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doPass, goHome, screen, showHint, undo]);

  // Fire the AI for a LAN-filled seat after each view. The host is authoritative.
  useEffect(() => {
    if (!guestView) {
      lastGuestActionsRef.current = -1;
      return;
    }
    const previous = lastGuestActionsRef.current;
    lastGuestActionsRef.current = guestView.actions;
    if (previous < 0 || guestView.actions <= previous || !soundOn) return;
    if (guestView.phase === 'round-over') chime('win');
    else chime('place');
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
        let viewNames = namesRef.current;
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
            viewNames = merged;
          }
        }
        setLanPlayers(players);
        created.sendLobby();
        if (lanStartedRef.current) {
          for (let seat = 1; seat < stateRef.current.playerCount; seat += 1) {
            if (players[seat]?.connected) {
              created.sendView(seat, view(stateRef.current, seat, viewNames));
            }
          }
        }
      });
      created.onIntent((seat, intent) => {
        if (hostRef.current !== created) return;
        const value = intent as { type?: string; cards?: unknown; actions?: number } | null;
        if (!value || seat <= 0 || seat >= stateRef.current.playerCount) return;
        if (value.actions !== stateRef.current.actions) return;
        const current = stateRef.current;
        if (value.type === 'play' && Array.isArray(value.cards)) {
          const cards = value.cards.filter((item): item is string => typeof item === 'string');
          const result = applySeat(current, seat, { type: 'play', cards });
          if (result.ok) commit(result.state, 'lan-host', current);
        } else if (value.type === 'pass') {
          const result = applySeat(current, seat, { type: 'pass' });
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
        color: { dark: '#243f33', light: '#fffaf0' },
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
  }, [closeLan, commit, hostName, lang, lanBusy, lanTableSize]);

  const startLan = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open' || connectedGuests.length === 0) return;
    const tableSize = lanTableSize;
    const next = setup(tableSize, Math.random, exchangeEnabled);
    const nextNames = Array.from({ length: tableSize }, (_, seat) => {
      if (seat === 0) return hostName.trim() || t(lang, 'lanHostNamePlaceholder');
      const guestPlayer = lanPlayers[seat];
      if (guestPlayer?.connected) return guestPlayer.name;
      return `@ai${seat}`;
    });
    stateRef.current = next;
    namesRef.current = nextNames;
    setState(next);
    setNames(nextNames);
    setHistory([]);
    setSelected([]);
    setHint(null);
    setToast('');
    setRecorded(false);
    setAiThinking(false);
    setRevealedSeat(0);
    setLanError('');
    setMode('lan-host');
    setScreen('game');
    clearSave();
    setSaved(null);
    lanStartedRef.current = true;
    host.start();
    host.sendLobby();
    for (let seat = 1; seat < tableSize; seat += 1) {
      if (lanPlayers[seat]?.connected) {
        host.sendView(seat, view(next, seat, nextNames));
      }
    }
  }, [connectedGuests.length, exchangeEnabled, hostName, lang, lanPlayers, lanTableSize]);

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
        if (!next || !Array.isArray(next.hand) || typeof next.playerCount !== 'number') return;
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
        /* the tab is going away */
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  const modeLabel =
    mode === 'ai'
      ? `${t(lang, 'modeAi')} · ${t(lang, level)}`
      : mode === 'local'
        ? t(lang, 'modeLocal')
        : mode === 'lan-host'
          ? t(lang, 'lanHostMode')
          : t(lang, 'lanGuestMode');

  const tableLine = `${t(lang, 'round', { n: activeView.round })} · ${t(lang, 'playerCount', {
    n: activeView.playerCount,
  })}`;

  const statusHeadline = (() => {
    if (activeView.phase === 'exchange') return t(lang, 'exchangeTitle');
    if (activeView.phase === 'round-over') return t(lang, 'gameOver');
    if (activeView.finished) return t(lang, 'finishedSeat');
    if (activeView.canPlay && (mode !== 'local' || handVisible)) {
      if (mode === 'lan-guest') return t(lang, 'yourTurn');
      if (mode === 'ai' || mode === 'lan-host') {
        return activeView.turn === 0 ? t(lang, 'yourTurn') : t(lang, 'turnOf', { name: currentName });
      }
      return t(lang, 'turnOf', { name: currentName });
    }
    if (mode === 'ai') return t(lang, 'thinking', { name: currentName });
    if (mode === 'lan-host' && activeView.turn !== 0) {
      return t(lang, 'waitingFor', { name: currentName });
    }
    if (activeView.passed[viewerSeat] && activeView.trick) return t(lang, 'passedTurn');
    return t(lang, 'turnOf', { name: currentName });
  })();

  const statusDetail = (() => {
    if (activeView.phase === 'exchange') return t(lang, 'startRound');
    if (activeView.phase === 'round-over') return t(lang, 'finishOrder');
    if (activeView.finished) return t(lang, 'waitingFor', { name: currentName });
    if (activeView.passed[viewerSeat] && activeView.trick) return t(lang, 'passedTurn');
    if (activeView.canPlay) {
      if (activeView.mustLeadClubs) return t(lang, 'leadClubs');
      if (activeView.trick) {
        return t(lang, 'mustBeat', {
          combo: comboLabel(lang, activeView.trick.count, activeView.trick.rank),
        });
      }
      return t(lang, 'leadAny');
    }
    return tableLine;
  })();

  const seatThinking = (seat: number) =>
    shownThinking && activeView.turn === seat && activeView.phase === 'playing';

  const lastTextFor = (seat: number) => {
    if (activeView.last && activeView.last.seat === seat) {
      if (activeView.last.kind === 'pass') return t(lang, 'pass');
      if (activeView.last.count && activeView.last.rank) {
        return comboLabel(lang, activeView.last.count, activeView.last.rank);
      }
    }
    return '';
  };

  const statsTop = tallyRows(record.presidents);
  const statsBottom = tallyRows(record.scums);
  const lastPresidentLabel = record.lastPresident
    ? displayName(record.lastPresident, lang)
    : t(lang, 'none');
  const modeLabelFor = (value: RecordMode) =>
    value === 'ai' ? t(lang, 'modeAi') : value === 'local' ? t(lang, 'modeLocal') : t(lang, 'modeLan');
  const roundsLabel = (count: number) =>
    count === 1 ? t(lang, 'roundOne') : t(lang, 'roundCount', { n: count });

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
        <div className="hero-table" aria-hidden="true">
          <div className="hero-felt">
            <div className="hero-fan">
              {HERO_CARDS.map((card, index) => (
                <div className="hero-card" key={card.id} style={{ '--fan': index } as CSSProperties}>
                  <PlayingCard card={card} lang={lang} />
                </div>
              ))}
            </div>
            <span className="hero-chip">♠ 3</span>
          </div>
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>
                  {saved.mode === 'ai' ? t(lang, saved.level) : tr('modeLocal')} · {t(lang, 'round', {
                    n: saved.state.round,
                  })}
                </small>
              </button>
            )}
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={() => openSetup('ai')}>
              {tr('playAi')}
            </button>
            <button className="secondary wide" onClick={() => openSetup('local')}>
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
            <span>{tr('rounds')}</span>
            <strong>{record.rounds}</strong>
            <span className="dot">·</span>
            <span>{tr('lastPresident')}</span>
            <strong className="strip-name">{lastPresidentLabel}</strong>
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
          {[3, 4, 5, 6].map((count) => (
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

      <section className="setup-block exchange-block">
        <div className="exchange-head">
          <h3>{tr('exchange')}</h3>
          <button
            className={`toggle ${exchangeEnabled ? 'on' : ''}`}
            onClick={() => setExchangeEnabled((value) => !value)}
            aria-pressed={exchangeEnabled}
          >
            <span />
            {exchangeEnabled ? tr('exchangeOn') : tr('exchangeOff')}
          </button>
        </div>
        <p className="note">{tr('exchangeNote')}</p>
      </section>

      <div className="row-actions">
        <button className="primary" onClick={() => startLocal(setupMode)}>
          {tr('begin')}
        </button>
        <button className="ghost" onClick={goHome}>
          {tr('back')}
        </button>
      </div>
    </main>
  );

  const exchangeSummary = activeView.exchange;
  const exchangePanel = exchangeSummary ? (
    <section className="exchange-panel" aria-live="polite">
      <span className="result-kicker">{t(lang, 'round', { n: activeView.round })}</span>
      <h3>{tr('exchangeTitle')}</h3>
      <p>
        {t(lang, 'exchangeLine', {
          scum: nameAt(exchangeSummary.scum),
          count: exchangeSummary.count,
          president: nameAt(exchangeSummary.president),
        })}
      </p>
      <p>
        {t(lang, 'exchangeBack', {
          president: nameAt(exchangeSummary.president),
          count: exchangeSummary.count,
          scum: nameAt(exchangeSummary.scum),
        })}
      </p>
      {exchangeSummary.vice !== null && exchangeSummary.viceScum !== null && (
        <p>
          {t(lang, 'exchangeVice', {
            viceScum: nameAt(exchangeSummary.viceScum),
            vice: nameAt(exchangeSummary.vice),
          })}
        </p>
      )}
      <p className="privacy-note">{tr('exchangePrivacy')}</p>
      {mode === 'lan-guest' ? (
        <span className="wait-pill">{tr('waitHostNext')}</span>
      ) : (
        <button className="primary" onClick={startRound}>
          {tr('startRound')}
        </button>
      )}
    </section>
  ) : null;

  const order = activeView.order ?? [];
  const presidentSeat = order[0] ?? 0;
  const scumSeat = order[order.length - 1] ?? 0;
  const resultPanel = (
    <section className="result-panel" aria-live="polite">
      <span className="result-kicker">{tr('wonRound')}</span>
      <div className="podium">
        <div className="podium-card president">
          <span>{tr('rolePresident')}</span>
          <strong>{nameAt(presidentSeat)}</strong>
        </div>
        <div className="podium-card scum">
          <span>{tr('roleScum')}</span>
          <strong>{nameAt(scumSeat)}</strong>
        </div>
      </div>
      <h3>{tr('finishOrder')}</h3>
      <ol className="ranking-list">
        {order.map((seat, index) => (
          <li key={`${seat}-${index}`} className={seat === viewerSeat ? 'is-you' : ''}>
            <span className="place">{index + 1}</span>
            <span className="ranking-name">{nameAt(seat)}</span>
            <RoleBadge
              role={rolesFor(activeView.order, activeView.playerCount)[seat]}
              lang={lang}
            />
            <span className="ranking-count">
              {t(lang, 'cardsLeft', { n: activeView.handCounts[seat] ?? 0 })}
            </span>
          </li>
        ))}
      </ol>
      {mode === 'lan-guest' ? (
        <span className="wait-pill">
          <span className="wait-dot" aria-hidden="true" />
          {tr('waitHostNext')}
        </span>
      ) : (
        <div className="result-actions">
          <button className="primary" onClick={goNextRound} disabled={mode === 'lan-host' && !lanHost}>
            {tr('nextRound')}
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
    <main className="shell game-shell">
      <header className="game-top">
        <button className="back" onClick={goHome}>
          ← {tr('home')}
        </button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>
            {modeLabel} · {t(lang, 'round', { n: activeView.round })}
          </span>
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
        <section className="table-column">
          <div className={`turn-bar ${activeView.phase !== 'playing' ? 'is-over' : ''}`} aria-live="polite">
            <span className={`turn-medallion ${activeView.phase === 'playing' ? 'live' : ''}`}>
              {activeView.phase === 'playing' ? activeView.turn + 1 : '★'}
            </span>
            <div className="turn-copy">
              <strong>{statusHeadline}</strong>
              <p>{statusDetail}</p>
            </div>
            {shownThinking && (
              <span className="thinking" aria-hidden="true">
                …
              </span>
            )}
          </div>

          {mode !== 'local' && lanError && (
            <p className="error game-error" role="alert">
              {lanError}
            </p>
          )}

          <div className="felt">
            <div className={`seat-grid seats-${activeView.playerCount}`}>
              {Array.from({ length: activeView.playerCount }, (_, seat) => (
                <PlayerSeat
                  key={seat}
                  seat={seat}
                  name={nameAt(seat)}
                  count={activeView.handCounts[seat] ?? 0}
                  role={activeView.roles[seat]}
                  turn={activeView.phase === 'playing' && activeView.turn === seat}
                  finished={activeView.finish.includes(seat)}
                  passed={Boolean(activeView.trick) && activeView.passed[seat]}
                  place={
                    activeView.finish.includes(seat)
                      ? activeView.finish.indexOf(seat) + 1
                      : null
                  }
                  lastText={lastTextFor(seat)}
                  isYou={seat === viewerSeat}
                  thinking={seatThinking(seat)}
                  lang={lang}
                />
              ))}
            </div>

            <div className={`trick-area ${activeView.trick ? 'has-trick' : 'empty-trick'}`}>
              {activeView.trick ? (
                <>
                  <div className="trick-cards">
                    {activeView.trick.cards.map((card, index) => (
                      <PlayingCard
                        key={card.id}
                        card={card}
                        lang={lang}
                        compact
                        index={index}
                      />
                    ))}
                  </div>
                  <div className="trick-copy">
                    <strong>{comboLabel(lang, activeView.trick.count, activeView.trick.rank)}</strong>
                    <span>{nameAt(activeView.trick.seat)}</span>
                  </div>
                </>
              ) : (
                <div className="trick-copy empty">
                  <span className="trick-kicker">{tr('newTrick')}</span>
                  <strong>{t(lang, 'trickLead', { name: nameAt(activeView.turn) })}</strong>
                </div>
              )}
              <span className="discard-count">
                {t(lang, 'discardCount', { n: activeView.discard.length })}
              </span>
            </div>
          </div>

          {activeView.phase === 'exchange' && exchangePanel}
          {activeView.phase === 'round-over' && resultPanel}

          {activeView.phase === 'playing' && (
            <section className="hand-area">
              <div className="hand-head">
                <div className="hand-id">
                  <span className="hand-kicker">{tr('yourSeat')}</span>
                  <strong>{viewerName}</strong>
                  <RoleBadge role={activeView.roles[viewerSeat]} lang={lang} />
                </div>
                <span className="hand-count">
                  {t(lang, 'cardsLeft', { n: activeView.hand.length })}
                </span>
              </div>

              {handVisible ? (
                <>
                  <div
                    className="hand"
                    role="group"
                    aria-label={tr('handLabel')}
                    style={{ '--cards': activeView.hand.length } as CSSProperties}
                  >
                    {activeView.hand.map((card, index) => (
                      <PlayingCard
                        key={card.id}
                        card={card}
                        lang={lang}
                        index={index}
                        selected={selected.includes(card.id)}
                        hinted={hint?.cards.includes(card.id) ?? false}
                        disabled={!canAct}
                        onClick={() => toggleCard(card.id)}
                      />
                    ))}
                  </div>
                  <div className="hand-controls">
                    <button className="primary play-button" disabled={!canSubmit} onClick={playSelected}>
                      {tr('play')}
                    </button>
                    <button
                      className={`secondary pass-button ${hint?.pass ? 'hinted' : ''}`}
                      disabled={!canAct || !activeView.canPass}
                      onClick={doPass}
                    >
                      {tr('pass')}
                    </button>
                    <button
                      className="ghost clear-button"
                      disabled={selected.length === 0}
                      onClick={() => setSelected([])}
                    >
                      {tr('clear')}
                    </button>
                    <div className="hand-tools">
                      <button className="ghost hint-button" disabled={!canHint} onClick={showHint}>
                        {tr('hint')}
                      </button>
                      <button className="ghost undo-button" disabled={!canUndo} onClick={undo}>
                        {tr('undo')}
                      </button>
                    </div>
                  </div>
                  <div className="selection-line" aria-live="polite">
                    {selected.length > 0
                      ? `${t(lang, 'selectedCount', { n: selected.length })}${
                          shownCards.length > 0
                            ? ` · ${comboLabel(lang, shownCards.length, shownCards[0].rank)}`
                            : ''
                        }`
                      : tr('chooseCards')}
                    {problem && <span className="selection-problem">{problem}</span>}
                  </div>
                </>
              ) : (
                <PrivacyGate name={viewerName} lang={lang} onReveal={() => setRevealedSeat(viewerSeat)} />
              )}
            </section>
          )}
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{tr('table')}</h3>
            <div className="side-stat">
              <span>{tr('players')}</span>
              <strong>{activeView.playerCount}</strong>
            </div>
            <div className="side-stat">
              <span>{tr('roundShort')}</span>
              <strong>{activeView.round}</strong>
            </div>
            <div className="side-stat">
              <span>{tr('exchange')}</span>
              <strong>{activeView.exchangeEnabled ? tr('exchangeOn') : tr('exchangeOff')}</strong>
            </div>
            <p className="side-note">
              {mode === 'ai' ? tr(LEVEL_HINT[level]) : mode === 'local' ? tr('hotSeat') : tr('localOnly')}
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
                    <span
                      key={seat}
                      className={`mini-seat ${connected ? 'online' : 'ai'}`}
                    >
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
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('record')}</h3>
            <p>
              {roundsLabel(record.rounds)} · {tr('lastPresident')} {lastPresidentLabel}
            </p>
            <p className="record-mini-note">{tr('recordMiniNote')}</p>
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
                  {[3, 4, 5, 6].map((count) => (
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
                <span>{tr('exchange')}</span>
                <button
                  className={`toggle ${exchangeEnabled ? 'on' : ''}`}
                  onClick={() => setExchangeEnabled((value) => !value)}
                  aria-pressed={exchangeEnabled}
                >
                  <span />
                  {exchangeEnabled ? tr('exchangeOn') : tr('exchangeOff')}
                </button>
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
                        <span className="peer-mark">{player.host ? '♠' : '♦'}</span>
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
                <span className="orbit-card">♠</span>
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

  const statsScreen = (
    <main className="shell stats-shell">
      <button className="back" onClick={goHome}>
        ← {tr('home')}
      </button>
      <header className="stats-head">
        <p className="eyebrow">{tr('eyebrow')}</p>
        <h2 className="screen-title">{tr('recordTitle')}</h2>
      </header>

      {record.rounds === 0 ? (
        <section className="empty-card">
          <span className="empty-cards" aria-hidden="true">
            <span className="card-back" />
            <span className="card-back" />
            <span className="card-back" />
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
              <span>{tr('rounds')}</span>
              <strong>{record.rounds}</strong>
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
              <h3>{tr('presidents')}</h3>
              {statsTop.length === 0 ? (
                <p className="recent-empty">{tr('none')}</p>
              ) : (
                <ul className="tally-list">
                  {statsTop.map(([name, count]) => (
                    <li key={name}>
                      <span className="tally-name">{displayName(name, lang)}</span>
                      <span className="tally-bar">
                        <i style={{ width: `${(count / record.rounds) * 100}%` }} />
                      </span>
                      <strong>{count}</strong>
                    </li>
                  ))}
                </ul>
              )}
              <p className="record-mini-note">
                {tr('lastPresident')} · {lastPresidentLabel}
              </p>
            </div>

            <div className="record-card">
              <h3>{tr('scums')}</h3>
              {statsBottom.length === 0 ? (
                <p className="recent-empty">{tr('none')}</p>
              ) : (
                <ul className="tally-list scum-list">
                  {statsBottom.map(([name, count]) => (
                    <li key={name}>
                      <span className="tally-name">{displayName(name, lang)}</span>
                      <span className="tally-bar">
                        <i style={{ width: `${(count / record.rounds) * 100}%` }} />
                      </span>
                      <strong>{count}</strong>
                    </li>
                  ))}
                </ul>
              )}
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
            <h3>{tr('recentRounds')}</h3>
            {record.recent.length === 0 ? (
              <p className="recent-empty">{tr('recentEmpty')}</p>
            ) : (
              <ol className="recent-list">
                {record.recent.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="recent-row">
                    <span className="recent-mark" aria-hidden="true">♠</span>
                    <div className="recent-main">
                      <strong>
                        {displayName(entry.president, lang)} · {displayName(entry.scum, lang)}
                      </strong>
                      <span>
                        {modeLabelFor(entry.mode)}
                        {entry.level ? ` · ${t(lang, entry.level)}` : ''} ·{' '}
                        {t(lang, 'playerCount', { n: entry.playerCount })}
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
        {(['rule1', 'rule2', 'rule3', 'rule4', 'rule5', 'rule6', 'rule7', 'rule8', 'rule9', 'rule10'] as const).map(
          (key) => (
            <li key={key}>{tr(key)}</li>
          ),
        )}
      </ol>

      <section className="rules-extra">
        <h3>{tr('rolesTitle')}</h3>
        <div className="role-table">
          {(
            [
              ['rolePresident', 'rolePresidentNote'],
              ['roleVice', 'roleViceNote'],
              ['roleCitizen', 'roleCitizenNote'],
              ['roleViceScum', 'roleViceScumNote'],
              ['roleScum', 'roleScumNote'],
            ] as const
          ).map(([label, note]) => (
            <div className="role-row" key={label}>
              <strong>{tr(label)}</strong>
              <span>{tr(note)}</span>
            </div>
          ))}
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
