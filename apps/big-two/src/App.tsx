import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import {
  LanGuest,
  LanHost,
  guestParams,
  newRoomCode,
  type LanPublicPeer,
} from '@family-arcade/lan';
import { chooseAiAction, type AiLevel } from './ai/ai';
import { hintFor, type HintKind } from './ai/hint';
import { PlayerSeat, PlayingCard, PrivacyGate, comboLabel } from './components/Cards';
import {
  applySeat,
  beats,
  classify,
  fallbackAction,
  makeCard,
  seededRng,
  setup,
  view,
  type Card,
  type GameState,
  type SeatView,
} from './game/big-two';
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

const HINT_KEYS: Record<HintKind, MessageKey> = {
  goOut: 'hintGoOut',
  leadDiamond: 'hintLeadDiamond',
  control: 'hintControl',
  endgame: 'hintEndgame',
  safeLead: 'hintSafeLead',
  beat: 'hintBeat',
  lead: 'hintLead',
  pass: 'hintPass',
};

const AI_NAMES: Record<Lang, string[]> = {
  en: ['Ada', 'Bo', 'Cyd'],
  zh: ['阿达', '小博', '小茜'],
};

const HERO_CARDS: Card[] = [
  makeCard('S', 10),
  makeCard('S', 11),
  makeCard('S', 12),
  makeCard('S', 13),
  makeCard('S', 14),
];

const COMBO_ROWS: { name: MessageKey; note: MessageKey }[] = [
  { name: 'comboSingle', note: 'comboSingleNote' },
  { name: 'comboPair', note: 'comboPairNote' },
  { name: 'comboTriple', note: 'comboTripleNote' },
  { name: 'comboStraight', note: 'comboStraightNote' },
  { name: 'comboFlush', note: 'comboFlushNote' },
  { name: 'comboFullHouse', note: 'comboFullHouseNote' },
  { name: 'comboFour', note: 'comboFourNote' },
  { name: 'comboStraightFlush', note: 'comboStraightFlushNote' },
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

function asSeatView(value: unknown): SeatView | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SeatView>;
  if (
    !Array.isArray(candidate.hand) ||
    !Array.isArray(candidate.handCounts) ||
    !Array.isArray(candidate.passed) ||
    typeof candidate.seat !== 'number' ||
    typeof candidate.turn !== 'number' ||
    typeof candidate.phase !== 'string'
  ) {
    return null;
  }
  return value as SeatView;
}

function selectionProblem(activeView: SeatView, cards: Card[], lang: Lang): string {
  if (cards.length === 0) return '';
  if (cards.length > 5) return t(lang, 'tooMany');
  const combo = classify(cards);
  if (!combo) return t(lang, 'invalidCombo');
  if (activeView.mustLeadDiamond && !cards.some((card) => card.id === 'D3')) {
    return t(lang, 'mustLeadDiamondProblem');
  }
  if (activeView.trick && !beats(combo, activeView.trick.combo)) {
    return t(lang, 'tooLow', { combo: comboLabel(lang, activeView.trick.combo) });
  }
  return '';
}

function tallyRows(tally: Record<string, number>): [string, number][] {
  return Object.entries(tally)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6);
}

function errorMessage(lang: Lang, state: GameState, code: string | undefined): string {
  if (code === 'must-lead-diamond') return t(lang, 'mustLeadDiamondProblem');
  if (code === 'too-low' && state.trick) {
    return t(lang, 'tooLow', { combo: comboLabel(lang, state.trick.combo) });
  }
  if (code === 'too-many') return t(lang, 'tooMany');
  if (code === 'empty') return t(lang, 'chooseCards');
  return t(lang, 'invalidCombo');
}

export default function App() {
  const [query] = useState(() =>
    new URLSearchParams(typeof location !== 'undefined' ? location.search : ''),
  );
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (invite ? 'lan-guest' : 'ai'));
  const [setupMode, setSetupMode] = useState<'ai' | 'local'>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup(seededRng(3)));
  const [names, setNames] = useState<string[]>(() => ['@you', '@ai1', '@ai2', '@ai3']);
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [hint, setHint] = useState<HintState | null>(null);
  const [revealedSeat, setRevealedSeat] = useState<number | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.big-two.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
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
      return localStorage.getItem('familyarcade.big-two.hostName') ?? '';
    } catch {
      return '';
    }
  });
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => invite?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => invite?.code || invite?.room || '');
  const [guestRoom] = useState(() => invite?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [guestPlayers, setGuestPlayers] = useState<LanPublicPeer[]>([]);
  const [autoJoin] = useState(() => Boolean(invite?.room && invite?.name));

  const stateRef = useRef(state);
  const namesRef = useRef(names);
  const lanPlayersRef = useRef(lanPlayers);
  const hostRef = useRef<LanHost | null>(null);
  const recordedRef = useRef(false);
  const lanStartedRef = useRef(false);
  const autoJoinRef = useRef(false);
  const lanActiveRef = useRef(false);
  const lastGuestActionsRef = useRef(-1);
  const guestJoinSeqRef = useRef(0);
  const hostCreateSeqRef = useRef(0);
  const dealSeqRef = useRef(0);
  const [seed] = useState<number | null>(() => {
    const raw = query.get('seed');
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.trunc(value) : null;
  });
  const fast = query.get('fast') === '1';

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
      localStorage.setItem('familyarcade.big-two.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.big-two.hostName', hostName);
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
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [screen]);

  useEffect(() => {
    if (screen !== 'stats') setClearArmed(false);
  }, [screen]);

  const makeRng = useCallback(() => {
    if (seed === null) return Math.random;
    const next = seed + dealSeqRef.current;
    dealSeqRef.current += 1;
    return seededRng(next);
  }, [seed]);

  const setTableNames = useCallback((next: string[]) => {
    namesRef.current = next;
    setNames(next);
  }, []);

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
  const guestOnline = mode !== 'lan-guest' || guestStarted;
  const connectedGuests = lanPlayers.filter((player) => player.seat > 0 && player.connected);
  const canAct =
    activeView.canPlay &&
    hostOnline &&
    guestOnline &&
    (mode !== 'local' || handVisible) &&
    (mode !== 'lan-host' || Boolean(lanHost));
  const selectedCards = activeView.hand.filter((card) => selected.includes(card.id));
  const selectedCombo = selectedCards.length > 0 ? classify(selectedCards) : null;
  const problem = selectionProblem(activeView, selectedCards, lang);
  const canSubmit = canAct && handVisible && selectedCards.length > 0 && !problem;
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

  useEffect(() => {
    setSelected([]);
    setHint(null);
    if (mode === 'local' && screen === 'game') setRevealedSeat(null);
  }, [state.turn, state.actions, mode, screen]);

  useEffect(() => {
    if (!guestView) return;
    setSelected([]);
    setHint(null);
  }, [guestView?.turn, guestView?.actions, guestView]);

  const sendViews = useCallback((next: GameState, nextNames: string[]) => {
    const host = hostRef.current;
    if (!host) return;
    for (let seat = 1; seat < 4; seat += 1) {
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
        else if (next.last?.kind === 'pass') chime('pass');
        else chime('place');
      }
      if (next.phase === 'round-over' && !recordedRef.current) {
        recordedRef.current = true;
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
        if (next.phase === 'playing') {
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
    [level, sendViews, soundOn],
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
      const next = setup(makeRng());
      const nextNames =
        nextMode === 'ai'
          ? ['@you', '@ai1', '@ai2', '@ai3']
          : ['@p1', '@p2', '@p3', '@p4'];
      stateRef.current = next;
      setTableNames(nextNames);
      setMode(nextMode);
      setState(next);
      setHistory([]);
      setSelected([]);
      setHint(null);
      setToast('');
      recordedRef.current = false;
      setAiThinking(false);
      setRevealedSeat(nextMode === 'local' ? null : 0);
      setScreen('game');
      clearSave();
      setSaved(null);
      if (soundOn) chime('deal');
    },
    [makeRng, setTableNames, soundOn],
  );

  const openSetup = useCallback((kind: 'ai' | 'local') => {
    setSetupMode(kind);
    setScreen('setup');
  }, []);

  const resume = useCallback(() => {
    if (!saved) return;
    const next = saved.state;
    const restoredNames =
      saved.names.length === 4
        ? saved.names
        : ['@you', '@ai1', '@ai2', '@ai3'];
    stateRef.current = next;
    setTableNames(restoredNames);
    setMode(saved.mode);
    setLevel(saved.level);
    setState(next);
    setHistory([]);
    setSelected([]);
    setHint(null);
    setToast('');
    recordedRef.current = next.phase === 'round-over';
    setAiThinking(false);
    setRevealedSeat(saved.mode === 'local' ? null : 0);
    setScreen('game');
  }, [saved, setTableNames]);

  const undo = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') return;
    if (state.phase !== 'playing' || history.length === 0) return;
    let index = history.length - 1;
    if (mode === 'ai') {
      while (index >= 0 && !(history[index].phase === 'playing' && history[index].turn === 0)) {
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
    setToast('');
    recordedRef.current = false;
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
      if (selected.includes(id)) {
        setSelected(selected.filter((item) => item !== id));
        return;
      }
      if (selected.length >= 5) {
        setToast(t(lang, 'tooMany'));
        return;
      }
      setSelected([...selected, id]);
    },
    [canAct, handVisible, lang, selected],
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
      setToast(errorMessage(lang, state, result.error));
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

  // AI seats: solo's three opponents and empty LAN chairs.
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
      if (current.phase !== 'playing' || current.turn !== state.turn) {
        setAiThinking(false);
        return;
      }
      const action = chooseAiAction(
        current,
        current.turn,
        level,
        seededRng(current.actions * 1103515245 + current.turn + 13),
      );
      setAiThinking(false);
      if (!action) return;
      const result = applySeat(current, current.turn, action);
      if (result.ok) commit(result.state, mode, current);
    }, fast ? 35 : 540);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, fast, lanHost?.status, level, mode, names, screen, state]);

  // A dropped guest should not freeze the table.
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
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [commit, mode, names, screen, state]);

  // Keyboard path: Tab/Space select cards, P play, X pass, U undo, H hint, Esc home.
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
        playSelected();
      } else if (event.key === 'x' || event.key === 'X') {
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
  }, [doPass, goHome, playSelected, screen, showHint, undo]);

  useEffect(() => {
    if (!guestView) {
      lastGuestActionsRef.current = -1;
      return;
    }
    const previous = lastGuestActionsRef.current;
    lastGuestActionsRef.current = guestView.actions;
    if (previous < 0 || guestView.actions <= previous || !soundOn) return;
    if (guestView.phase === 'round-over') chime('win');
    else if (guestView.last?.kind === 'pass') chime('pass');
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
        maxPlayers: 4,
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
              player.seat < 4 &&
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
          for (let seat = 1; seat < 4; seat += 1) {
            if (players[seat]?.connected) {
              created.sendView(seat, view(stateRef.current, seat, viewNames));
            }
          }
        }
      });
      created.onIntent((seat, intent) => {
        if (hostRef.current !== created) return;
        const value = intent as { type?: string; cards?: unknown; actions?: number } | null;
        if (!value || seat <= 0 || seat >= 4) return;
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
      const url = inviteUrl(info, code, code, t(lang, 'lanGuestTag'));
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        color: { dark: '#2b241c', light: '#fffaf0' },
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
    if (!host || host.status !== 'open' || connectedGuests.length === 0) return;
    const next = setup(makeRng());
    const nextNames = Array.from({ length: 4 }, (_, seat) => {
      if (seat === 0) return hostName.trim() || t(lang, 'lanHostNamePlaceholder');
      const player = lanPlayers[seat];
      return player?.connected ? player.name : `@ai${seat}`;
    });
    stateRef.current = next;
    namesRef.current = nextNames;
    setTableNames(nextNames);
    setState(next);
    setHistory([]);
    setSelected([]);
    setHint(null);
    setToast('');
    recordedRef.current = false;
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
    for (let seat = 1; seat < 4; seat += 1) {
      if (lanPlayers[seat]?.connected) {
        host.sendView(seat, view(next, seat, nextNames));
      }
    }
    if (soundOn) chime('deal');
  }, [connectedGuests.length, hostName, lang, lanPlayers, makeRng, setTableNames, soundOn]);

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
      setGuestView(null);
      setGuestStarted(false);
      setGuestPlayers([]);
      lastGuestActionsRef.current = -1;
      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        const next = asSeatView(payload);
        if (!next) return;
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

  const playAgain = useCallback(() => {
    if (state.phase !== 'round-over') return;
    if (mode === 'lan-guest') return;
    if (mode === 'lan-host') startLan();
    else startLocal(mode === 'ai' ? 'ai' : 'local');
  }, [mode, startLan, startLocal, state.phase]);

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

  const statusHeadline = (() => {
    if (activeView.phase === 'round-over') return t(lang, 'gameOver');
    if (activeView.canPlay && handVisible) {
      if (mode === 'local') return t(lang, 'turnOf', { name: currentName });
      return t(lang, 'yourTurn');
    }
    if (shownThinking) return t(lang, 'thinking', { name: currentName });
    if (mode === 'lan-host' && activeView.turn !== viewerSeat) {
      return t(lang, 'waitingFor', { name: currentName });
    }
    if (activeView.passed[viewerSeat] && activeView.trick) return t(lang, 'passedTurn');
    return t(lang, 'turnOf', { name: currentName });
  })();

  const statusDetail = (() => {
    if (activeView.phase === 'round-over') return t(lang, 'scoringNote');
    if (mode === 'local' && !handVisible) return t(lang, 'privacyNote');
    if (activeView.mustLeadDiamond) return t(lang, 'leadDiamond');
    if (activeView.trick) {
      return t(lang, 'mustBeat', { combo: comboLabel(lang, activeView.trick.combo) });
    }
    return t(lang, 'leadAny');
  })();

  const lastTextFor = (seat: number) => {
    if (activeView.last && activeView.last.seat === seat) {
      if (activeView.last.kind === 'pass') return t(lang, 'pass');
      if (activeView.last.combo) return comboLabel(lang, activeView.last.combo);
    }
    return '';
  };

  const seatThinking = (seat: number) =>
    shownThinking && activeView.turn === seat && activeView.phase === 'playing';

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
            <span className="hero-chip">3♦</span>
          </div>
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>
                  {saved.mode === 'ai' ? t(lang, saved.level) : tr('modeLocal')} ·{' '}
                  {t(lang, 'cardsLeft', { n: saved.state.hands[0].length })}
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
            <span>{tr('games')}</span>
            <strong>{record.games}</strong>
            <span className="dot">·</span>
            <span>{tr('yourWins')}</span>
            <strong>{record.wins}</strong>
            <span className="dot">·</span>
            <span>{tr('lastWinner')}</span>
            <strong className="strip-name">
              {record.lastWinner ? displayName(record.lastWinner, lang) : t(lang, 'none')}
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
        <div className="fact-row">
          <span className="fact-chip">{tr('fourPlayers')}</span>
          <span className="fact-chip">{tr('thirteenEach')}</span>
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

      {setupMode === 'local' && <p className="note">{tr('privacyNote')}</p>}

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

  const result = activeView.result;
  const resultRows = result
    ? [
        result.winner,
        ...[0, 1, 2, 3]
          .filter((seat) => seat !== result.winner)
          .sort((a, b) => result.penalties[b] - result.penalties[a] || a - b),
      ]
    : [];

  const resultPanel = result ? (
    <section className="result-panel" aria-live="polite">
      <span className="result-kicker">{tr('gameOver')}</span>
      <h3>{t(lang, 'winnerIs', { name: nameAt(result.winner) })}</h3>
      <div className="score-table">
        <div className="score-head">
          <span>{tr('table')}</span>
          <span>{tr('remaining')}</span>
          <span>{tr('multiplier')}</span>
          <span>{tr('penalty')}</span>
        </div>
        {resultRows.map((seat) => (
          <div key={seat} className={`score-row ${seat === result.winner ? 'winner' : ''}`}>
            <span className="score-name">{nameAt(seat)}</span>
            <span>{result.counts[seat]}</span>
            <span>{seat === result.winner ? '—' : `×${result.multipliers[seat]}`}</span>
            <strong>{seat === result.winner ? '—' : result.penalties[seat]}</strong>
          </div>
        ))}
      </div>
      <p className="score-gain">{t(lang, 'winnerGain', { n: result.gain })}</p>
      <p className="score-note">{tr('scoringNote')}</p>
      {mode === 'lan-guest' ? (
        <span className="wait-pill">
          <span className="wait-dot" aria-hidden="true" />
          {tr('waitHostNext')}
        </span>
      ) : (
        <div className="result-actions">
          <button className="primary" onClick={playAgain}>
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
  ) : null;

  const gameScreen = (
    <main className="shell game-shell">
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
            <div className="seat-grid">
              {[0, 1, 2, 3].map((seat) => (
                <PlayerSeat
                  key={seat}
                  seat={seat}
                  name={nameAt(seat)}
                  count={activeView.handCounts[seat] ?? 0}
                  turn={activeView.phase === 'playing' && activeView.turn === seat}
                  passed={Boolean(activeView.trick) && activeView.passed[seat]}
                  lastText={lastTextFor(seat)}
                  isYou={seat === viewerSeat}
                  thinking={seatThinking(seat)}
                  leads={activeView.leadSeat === seat}
                  lang={lang}
                />
              ))}
            </div>

            <div className={`trick-area ${activeView.trick ? 'has-trick' : 'empty-trick'}`}>
              {activeView.trick ? (
                <>
                  <div className="trick-cards">
                    {activeView.trick.combo.cards.map((card, index) => (
                      <PlayingCard key={card.id} card={card} lang={lang} compact index={index} />
                    ))}
                  </div>
                  <div className="trick-copy">
                    <strong>{comboLabel(lang, activeView.trick.combo)}</strong>
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
                {t(lang, 'cardsLeft', { n: activeView.discard.length })}
              </span>
            </div>
          </div>

          {activeView.phase === 'round-over' && resultPanel}

          {activeView.phase === 'playing' && (
            <section className="hand-area">
              <div className="hand-head">
                <div className="hand-id">
                  <span className="hand-kicker">{tr('yourSeat')}</span>
                  <strong>{viewerName}</strong>
                </div>
                <span className="hand-count">
                  {t(lang, 'cardsLeft', { n: activeView.hand.length })}
                </span>
              </div>

              {handVisible ? (
                <>
                  <div className="hand" role="group" aria-label={tr('handLabel')}>
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
                          selectedCombo ? ` · ${comboLabel(lang, selectedCombo)}` : ''
                        }`
                      : tr('chooseCards')}
                    {problem && <span className="selection-problem">{problem}</span>}
                  </div>
                </>
              ) : (
                <PrivacyGate
                  name={nameAt(viewerSeat)}
                  lang={lang}
                  onReveal={() => setRevealedSeat(viewerSeat)}
                />
              )}
            </section>
          )}
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{tr('table')}</h3>
            <div className="side-stat">
              <span>{tr('players')}</span>
              <strong>{tr('fourPlayers')}</strong>
            </div>
            <div className="side-stat">
              <span>{tr('starterSeat')}</span>
              <strong>{nameAt(activeView.starter)}</strong>
            </div>
            <div className="side-stat">
              <span>{tr('cardsInHand')}</span>
              <strong>{activeView.hand.length}</strong>
            </div>
            <p className="side-note">
              {mode === 'ai'
                ? tr(AI_LEVELS.find((item) => item.id === level)?.note ?? 'normalHint')
                : mode === 'local'
                  ? tr('hotSeat')
                  : tr('localOnly')}
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
                  ? t(lang, 'lanSeats')
                  : tr('lanWaiting')}
              </p>
              <div className="mini-seats">
                {[1, 2, 3].map((seat) => {
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
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('record')}</h3>
            <p>
              {record.games} {tr('games')} · {record.wins} {tr('yourWins')}
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
              <div className="fact-row">
                <span className="fact-chip">{tr('lanSeats')}</span>
                <span className="fact-chip">{tr('lanAiFill')}</span>
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
                  {t(lang, 'lanSeats')} · {tr('lanAiFill')}
                </p>
                <div className="peer-list">
                  {lanPlayers.map((player) => (
                    <span
                      key={player.seat}
                      className={`peer-chip ${player.connected ? 'online' : ''}`}
                    >
                      <span className="peer-mark">{player.host ? '♠' : '♦'}</span>
                      <span className="peer-name">
                        {player.connected ? player.name : tr('openSeat')}
                      </span>
                      <small>
                        {player.host ? tr('lanHostTag') : tr('lanGuestTag')}
                        {player.connected ? ` · ${tr('lanOnline')}` : ''}
                      </small>
                    </span>
                  ))}
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
                <span className="orbit-card">♦</span>
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

      {record.games === 0 ? (
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
              <span>{tr('games')}</span>
              <strong>{record.games}</strong>
            </div>
            <div className="stat-card ai">
              <span>{tr('yourWins')}</span>
              <strong>{record.wins}</strong>
            </div>
            <div className="stat-card local">
              <span>{tr('bestGain')}</span>
              <strong>+{record.bestGain}</strong>
            </div>
            <div className="stat-card lan">
              <span>{tr('lanGames')}</span>
              <strong>{record.byMode.lan}</strong>
            </div>
          </section>

          <section className="record-grid">
            <div className="record-card">
              <h3>{tr('winners')}</h3>
              {tallyRows(record.winners).length === 0 ? (
                <p className="recent-empty">{tr('none')}</p>
              ) : (
                <ul className="tally-list">
                  {tallyRows(record.winners).map(([name, count]) => (
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
              <p className="record-mini-note">
                {tr('lastWinner')} ·{' '}
                {record.lastWinner ? displayName(record.lastWinner, lang) : t(lang, 'none')}
              </p>
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

            <div className="record-card">
              <h3>{tr('recentGames')}</h3>
              {record.recent.length === 0 ? (
                <p className="recent-empty">{tr('recentEmpty')}</p>
              ) : (
                <ol className="recent-list">
                  {record.recent.map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="recent-row">
                      <span className="recent-mark" aria-hidden="true">♦</span>
                      <div className="recent-main">
                        <strong>
                          {displayName(entry.winner, lang)} · +{entry.gain}
                        </strong>
                        <span>
                          {entry.mode === 'ai'
                            ? t(lang, 'modeAi')
                            : entry.mode === 'local'
                              ? t(lang, 'modeLocal')
                              : t(lang, 'modeLan')}
                          {entry.level ? ` · ${t(lang, entry.level)}` : ''}
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
            </div>
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
        <h3>{tr('combosTitle')}</h3>
        <div className="combo-table">
          {COMBO_ROWS.map((row) => (
            <div className="combo-row" key={row.name}>
              <strong>{tr(row.name)}</strong>
              <span>{tr(row.note)}</span>
            </div>
          ))}
        </div>
        <h3>{tr('scoringTitle')}</h3>
        <p className="controls-line">{tr('scoringLine1')}</p>
        <p className="controls-line">{tr('scoringLine2')}</p>
        <p className="controls-line">{tr('scoringLine3')}</p>
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
