import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  LanGuest,
  LanHost,
  guestParams,
  newRoomCode,
  type LanPublicPeer,
} from '@family-arcade/lan';
import { chooseBury, chooseDeclaration, choosePlay, fallbackPlay, hintFor, type AiLevel, type Hint } from './ai/ai';
import { CardFace } from './components/Cards';
import {
  BuryPanel,
  DeclarePanel,
  PrivacyGate,
  ResultPanel,
  Scoreboard,
  SeatBadge,
  TrickArea,
  levelLabelText,
  relativePosition,
  teamNamesFor,
  trumpLabel,
} from './components/Table';
import {
  analyzeCards,
  bury as buryCards,
  declare as declareTrump,
  isAiSeat,
  makeDeck,
  nextDeal as nextDealState,
  passDeclaration as passBid,
  play as playCards,
  pointValue,
  setup,
  trickPoints,
  validatePlay,
  view,
  type BidOption,
  type GameState,
  type Seat,
  type SeatView,
} from './game/sheng-ji';
import { detectLang, t, type Lang, type MessageKey } from './i18n';
import { guestWsUrl, hostWsUrl, inviteUrl, startLanServer, type LanServerInfo } from './net';
import {
  clearRecord as clearStoredRecord,
  clearSave,
  loadRecord,
  loadSave,
  recordDeal,
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

const AI_NAMES: Record<Lang, string[]> = {
  en: ['Ada', 'Bo', 'Cyd'],
  zh: ['阿达', '小博', '小茜'],
};

const HERO_DECK = makeDeck();
const HERO_CARDS = ['SA-0', 'SK-0', 'S2-0', 'H10-0', 'JBJ-0']
  .map((id) => HERO_DECK.find((card) => card.id === id))
  .filter((card): card is NonNullable<typeof card> => Boolean(card));

function isAiName(name: string | undefined): boolean {
  return Boolean(name && /^@ai\d+$/.test(name));
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

function actorSeat(state: GameState): Seat {
  if (state.phase === 'declare' && state.declareTurn !== -1) return state.declareTurn;
  if (state.phase === 'bury' && state.declarer !== null) return state.declarer;
  if (state.phase === 'play' && state.turn !== -1) return state.turn;
  return 0;
}

function humanCanAct(state: GameState): boolean {
  return (
    (state.phase === 'declare' && state.declareTurn === 0) ||
    (state.phase === 'bury' && state.declarer === 0) ||
    (state.phase === 'play' && state.turn === 0)
  );
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

function hintMessage(lang: Lang, hint: Hint, tablePoints: number, extraPoints: number): string {
  switch (hint.reason) {
    case 'hintWinPoints':
      return t(lang, 'hintWinPoints', { n: tablePoints + extraPoints });
    case 'hintPartner':
      return t(lang, 'hintPartner');
    case 'hintRuff':
      return t(lang, 'hintRuff');
    case 'hintThrow':
      return t(lang, 'hintThrow');
    case 'hintFollow':
      return t(lang, 'hintFollow');
    case 'hintLead':
      return t(lang, 'hintLead');
    case 'hintBuryVoid':
      return t(lang, 'hintBuryVoid');
    case 'hintBuryPoints':
      return t(lang, 'hintBuryPoints');
    case 'hintDeclareSuit':
      return t(lang, 'hintDeclareSuit');
    case 'hintDeclareNt':
      return t(lang, 'hintDeclareNt');
    case 'hintPassBid':
      return t(lang, 'hintPassBid');
    default:
      return t(lang, 'hintSelected');
  }
}

function errorMessage(lang: Lang, error: string | undefined, need: number): string {
  if (error === 'bad-count') return t(lang, 'errorCount', { n: need });
  if (error === 'must-follow') return t(lang, 'errorFollow');
  if (error === 'shape-mismatch') return t(lang, 'errorShape');
  if (error === 'illegal-throw') return t(lang, 'errorThrow');
  if (error === 'bad-lead') return t(lang, 'errorLead');
  if (error === 'wrong-turn') return t(lang, 'errorTurn');
  if (error === 'bad-bury') return t(lang, 'errorBury');
  return t(lang, 'errorPlay');
}

function readBidOption(value: unknown): BidOption | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<BidOption>;
  if (item.kind !== 'suit' && item.kind !== 'nt') return null;
  if (item.strength !== 1 && item.strength !== 2 && item.strength !== 3) return null;
  if (item.kind === 'suit') {
    if (item.suit !== 'S' && item.suit !== 'H' && item.suit !== 'D' && item.suit !== 'C') return null;
  } else if (item.suit !== null) {
    return null;
  }
  if (!Array.isArray(item.cards) || item.cards.some((id) => typeof id !== 'string')) return null;
  return {
    kind: item.kind,
    suit: item.kind === 'nt' ? null : item.suit,
    strength: item.strength,
    cards: item.cards.slice(),
  };
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (invite ? 'lan-guest' : 'ai'));
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup({ rng: Math.random, dealer: 3 }));
  const [names, setNames] = useState<string[]>(['@you', '@ai1', '@ai2', '@ai3']);
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [hint, setHint] = useState<Hint | null>(null);
  const [revealedSeat, setRevealedSeat] = useState<number | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.sheng-ji.sound') !== 'off';
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
      return localStorage.getItem('familyarcade.sheng-ji.hostName') ?? '';
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
  const handRef = useRef<HTMLDivElement>(null);
  const lanStartedRef = useRef(false);
  const lanActiveRef = useRef(false);
  const autoJoinRef = useRef(false);
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
      localStorage.setItem('familyarcade.sheng-ji.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.sheng-ji.hostName', hostName);
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

  useEffect(() => {
    if (!hint || (hint.type !== 'play' && hint.type !== 'bury') || hint.cards.length === 0) return;
    const hand = handRef.current;
    if (!hand) return;
    const first = hand.querySelector<HTMLElement>('.playing-card.selected');
    if (!first) return;
    first.scrollIntoView({ block: 'nearest', inline: 'start' });
    const rect = first.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      first.scrollIntoView({ block: 'center', inline: 'start' });
    }
  }, [hint]);

  const localViewerSeat = mode === 'local' ? actorSeat(state) : 0;
  const localView = useMemo(
    () => view(state, localViewerSeat, names),
    [state, localViewerSeat, names],
  );
  const activeView = mode === 'lan-guest' ? (guestView ?? localView) : localView;
  const shownNames = activeView.names.length === 4 ? activeView.names : names;
  const displayNames = useMemo(
    () => shownNames.map((name) => displayName(name, lang)),
    [shownNames, lang],
  );
  const nameAt = useCallback(
    (seat: number) => displayNames[seat] ?? t(lang, 'none'),
    [displayNames, lang],
  );
  const teamNames: [string, string] = useMemo(
    () => teamNamesFor(displayNames),
    [displayNames],
  );
  const viewerSeat = activeView.seat;
  const viewerName = nameAt(viewerSeat);
  const currentActor =
    activeView.phase === 'declare'
      ? activeView.declareTurn
      : activeView.phase === 'bury'
        ? activeView.declarer ?? 0
        : activeView.phase === 'play'
          ? activeView.currentTurn
          : 0;
  const currentSeat: Seat = currentActor === -1 ? 0 : currentActor;
  const currentName = nameAt(currentSeat);
  const handVisible =
    mode === 'local' ? revealedSeat === viewerSeat || activeView.phase === 'deal-over' : true;
  const hostOnline = mode !== 'lan-host' || lanHost?.status === 'open';
  const guestOnline = mode !== 'lan-guest' || guestStarted;
  const connectedGuests = lanPlayers.filter((player) => player.seat > 0 && player.connected);
  const canAct =
    handVisible &&
    hostOnline &&
    guestOnline &&
    (activeView.canDeclare || activeView.canBury || activeView.canPlay) &&
    (mode !== 'ai' || viewerSeat === 0);
  const canHint =
    canAct &&
    mode !== 'lan-guest' &&
    (mode !== 'lan-host' || viewerSeat === 0) &&
    activeView.phase !== 'deal-over';
  const canUndo =
    (mode === 'ai' || mode === 'local') &&
    handVisible &&
    history.length > 0 &&
    activeView.phase !== 'deal-over';
  const canSelect = handVisible && canAct && (activeView.canBury || activeView.canPlay);
  const legalSet = useMemo(() => new Set(activeView.legalCards), [activeView.legalCards]);
  const selectedCards = activeView.hand.filter((card) => selected.includes(card.id));
  const tablePoints = activeView.currentTrick.reduce(
    (sum, playItem) => sum + trickPoints(playItem.cards),
    0,
  );
  const selectedExtraPoints = selectedCards.reduce((sum, card) => sum + pointValue(card), 0);
  const leadSize = activeView.currentTrick[0]?.cards.length ?? 0;
  const selectedShape =
    selectedCards.length > 0
      ? analyzeCards(selectedCards, activeView.trump ?? 'NT', activeView.levelRank)
      : null;
  const localProblem = (() => {
    if (activeView.phase !== 'play' || selectedCards.length === 0) return '';
    if (mode === 'lan-guest') {
      if (leadSize > 0 && selectedCards.length !== leadSize) {
        return t(lang, 'errorCount', { n: leadSize });
      }
      return '';
    }
    const validation = validatePlay(state, viewerSeat, selected);
    if (validation.ok) return '';
    return errorMessage(lang, validation.error, leadSize);
  })();
  const canSubmit =
    canAct &&
    selectedCards.length > 0 &&
    activeView.phase === 'play' &&
    localProblem === '' &&
    (mode !== 'lan-guest' || guestStarted);
  const legalDeclareOptions = useMemo(
    () =>
      activeView.declarationOptions.filter(
        (option) => !activeView.declaration || option.strength > activeView.declaration.strength,
      ),
    [activeView.declarationOptions, activeView.declaration],
  );
  const hintOption = hint?.type === 'declare' ? hint.option ?? null : null;
  const hintText = hint
    ? hintMessage(lang, hint, tablePoints, selectedExtraPoints)
    : '';
  const modeLabel =
    mode === 'ai'
      ? `${t(lang, 'modeAi')} · ${t(lang, level as MessageKey)}`
      : mode === 'local'
        ? t(lang, 'modeLocal')
        : mode === 'lan-host'
          ? t(lang, 'modeLanHost')
          : t(lang, 'modeLanGuest');
  const trumps = activeView.trump
    ? trumpLabel(lang, activeView.trump, activeView.levelRank)
    : t(lang, 'none');
  const declarerName =
    activeView.declarer === null ? t(lang, 'none') : nameAt(activeView.declarer);

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
        if (next.phase === 'deal-over') {
          chime(next.matchWinner !== null || next.lastResult?.success ? 'win' : 'lose');
        } else if (next.tricks.length > previous.tricks.length) {
          chime('trick');
        } else if (next.phase === 'bury' && previous.phase === 'declare') {
          chime('deal');
        } else {
          chime('play');
        }
      }
      if (next.phase === 'deal-over' && previous.phase !== 'deal-over' && currentMode !== 'lan-guest') {
        setRecord(
          recordDeal(next, {
            mode: recordModeFor(currentMode),
            ...(currentMode === 'ai' ? { level } : {}),
          }),
        );
      }
      if (currentMode === 'ai' || currentMode === 'local') {
        setSaved(saveGame({ state: next, mode: currentMode, level, names: namesRef.current }));
      }
      if (currentMode === 'lan-host') sendViews(next, namesRef.current);
    },
    [level, sendViews, soundOn],
  );

  const closeLan = useCallback(() => {
    lanActiveRef.current = false;
    lanStartedRef.current = false;
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
    setSaved(loadSave());
    setRecord(loadRecord());
  }, [closeLan]);

  const startLocal = useCallback(
    (nextMode: 'ai' | 'local') => {
      const next = setup({ rng: Math.random, dealer: 3 });
      const nextNames =
        nextMode === 'ai'
          ? ['@you', '@ai1', '@ai2', '@ai3']
          : ['@p1', '@p2', '@p3', '@p4'];
      stateRef.current = next;
      namesRef.current = nextNames;
      setMode(nextMode);
      setNames(nextNames);
      setState(next);
      setHistory([]);
      setSelected([]);
      setHint(null);
      setToast('');
      setAiThinking(false);
      setRevealedSeat(nextMode === 'local' ? null : 0);
      setScreen('game');
      clearSave();
      setSaved(null);
    },
    [],
  );

  const openSetup = useCallback((kind: 'ai') => {
    setMode(kind);
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
    namesRef.current = restoredNames;
    setMode(saved.mode);
    setLevel(saved.level);
    setState(next);
    setNames(restoredNames);
    setHistory([]);
    setSelected([]);
    setHint(null);
    setToast('');
    setAiThinking(false);
    setRevealedSeat(saved.mode === 'local' ? null : 0);
    setScreen('game');
  }, [saved]);

  const undo = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') return;
    if (activeView.phase === 'deal-over' || history.length === 0) return;
    let index = history.length - 1;
    if (mode === 'ai') {
      while (index >= 0 && !humanCanAct(history[index])) index -= 1;
    }
    if (index < 0) return;
    const previous = history[index];
    stateRef.current = previous;
    setHistory(history.slice(0, index));
    setState(previous);
    setSelected([]);
    setHint(null);
    setToast('');
    setRevealedSeat(mode === 'local' ? null : 0);
    setSaved(saveGame({ state: previous, mode, level, names: namesRef.current }));
  }, [activeView.phase, history, level, mode]);

  const showHint = useCallback(() => {
    if (!canHint) return;
    const next = hintFor(state, viewerSeat);
    if (!next) return;
    setHint(next);
    if (next.type === 'bury') setSelected(next.cards);
    if (next.type === 'play') setSelected(next.cards);
    const base = hintMessage(lang, next, tablePoints, next.cards.reduce((sum, id) => {
      const card = activeView.hand.find((item) => item.id === id);
      return sum + (card ? pointValue(card) : 0);
    }, 0));
    if (next.type === 'declare' || next.type === 'pass') setToast(base);
  }, [activeView.hand, canHint, lang, state, tablePoints, viewerSeat]);

  const toggleCard = useCallback(
    (id: string) => {
      if (!canSelect) return;
      const card = activeView.hand.find((item) => item.id === id);
      if (!card) return;
      if (selected.includes(id)) {
        setSelected(selected.filter((item) => item !== id));
        return;
      }
      if (activeView.phase === 'bury' && selected.length >= 8) {
        setToast(t(lang, 'selectEight'));
        return;
      }
      setSelected([...selected, id]);
    },
    [activeView.hand, activeView.phase, canSelect, lang, selected],
  );

  const declareWith = useCallback(
    (option: BidOption) => {
      if (!canAct) return;
      if (mode === 'lan-guest') {
        guest?.sendIntent({ type: 'declare', option, version: activeView.version });
        setHint(null);
        return;
      }
      const result = declareTrump(state, viewerSeat, option);
      if (!result.ok) {
        setToast(t(lang, 'errorDeclare'));
        return;
      }
      commit(result.state, mode, state);
    },
    [activeView.version, canAct, commit, guest, lang, mode, state, viewerSeat],
  );

  const doPassDeclaration = useCallback(() => {
    if (!canAct) return;
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'pass-declare', version: activeView.version });
      setHint(null);
      return;
    }
    const result = passBid(state, viewerSeat, Math.random);
    if (!result.ok) return;
    if (result.state.deal !== state.deal) {
      setToast(t(lang, 'allPass'));
    }
    commit(result.state, mode, state);
  }, [activeView.version, canAct, commit, guest, lang, mode, state, viewerSeat]);

  const burySelected = useCallback(() => {
    if (!canAct) return;
    if (selected.length !== 8) {
      setToast(t(lang, 'errorBury'));
      return;
    }
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'bury', cards: selected, version: activeView.version });
      setSelected([]);
      setHint(null);
      return;
    }
    const result = buryCards(state, viewerSeat, selected);
    if (!result.ok) {
      setToast(t(lang, 'errorBury'));
      return;
    }
    commit(result.state, mode, state);
  }, [activeView.version, canAct, commit, guest, lang, mode, selected, state, viewerSeat]);

  const playSelected = useCallback(() => {
    if (!canAct || selected.length === 0) return;
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'play', cards: selected, version: activeView.version });
      setSelected([]);
      setHint(null);
      return;
    }
    const result = playCards(state, viewerSeat, selected);
    if (!result.ok) {
      setToast(errorMessage(lang, result.error, leadSize));
      return;
    }
    commit(result.state, mode, state);
  }, [activeView.version, canAct, commit, guest, lang, leadSize, mode, selected, state, viewerSeat]);

  const doNextDeal = useCallback(() => {
    if (mode === 'lan-guest') return;
    const result = nextDealState(state, Math.random);
    if (!result.ok) return;
    stateRef.current = result.state;
    setState(result.state);
    setHistory([]);
    setSelected([]);
    setHint(null);
    setToast('');
    setScreen('game');
    setRevealedSeat(mode === 'local' ? null : 0);
    if (mode === 'ai' || mode === 'local') {
      setSaved(saveGame({ state: result.state, mode, level, names: namesRef.current }));
    } else if (mode === 'lan-host') {
      sendViews(result.state, namesRef.current);
    }
  }, [level, mode, sendViews, state]);

  const resetRecord = useCallback(() => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setRecord(clearStoredRecord());
    setClearArmed(false);
    setToast(t(lang, 'recordCleared'));
  }, [clearArmed, lang]);

  // Reset private UI whenever the authoritative state advances.
  useEffect(() => {
    setSelected([]);
    setHint(null);
    if (mode === 'local') setRevealedSeat(null);
    else setRevealedSeat(0);
  }, [activeView.version, activeView.phase, mode]);

  // AI seats: solo uses seat 0 for the human; a LAN host fills empty or dropped seats.
  useEffect(() => {
    if (screen !== 'game') {
      setAiThinking(false);
      return;
    }
    if (mode !== 'ai' && mode !== 'lan-host') {
      setAiThinking(false);
      return;
    }
    let seat: Seat | null = null;
    if (state.phase === 'declare' && state.declareTurn !== -1) seat = state.declareTurn;
    else if (state.phase === 'bury' && state.declarer !== null) seat = state.declarer;
    else if (state.phase === 'play' && state.turn !== -1) seat = state.turn;
    if (seat === null) {
      setAiThinking(false);
      return;
    }
    const aiSeat =
      mode === 'ai'
        ? seat > 0
        : seat > 0 && !lanPlayersRef.current[seat]?.connected;
    if (!aiSeat) {
      setAiThinking(false);
      return;
    }
    setAiThinking(true);
    const delay = mode === 'lan-host' && !isAiName(names[seat]) ? 900 : 380;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.version !== state.version) return;
      if (
        !isAiSeat(current, seat) ||
        (mode === 'lan-host' && lanPlayersRef.current[seat]?.connected)
      ) {
        setAiThinking(false);
        return;
      }
      let changed = false;
      if (current.phase === 'declare') {
        const action = chooseDeclaration(current, seat, level, Math.random);
        if (action.type === 'declare') {
          const result = declareTrump(current, seat, action.option);
          if (result.ok) {
            commit(result.state, mode, current);
            changed = true;
          }
        } else {
          const result = passBid(current, seat, Math.random);
          if (result.ok) {
            commit(result.state, mode, current);
            changed = true;
          }
        }
      } else if (current.phase === 'bury') {
        const cards = chooseBury(current, seat, level, Math.random);
        if (cards.length === 8) {
          const result = buryCards(current, seat, cards);
          if (result.ok) {
            commit(result.state, mode, current);
            changed = true;
          }
        }
      } else if (current.phase === 'play') {
        const cards = choosePlay(current, seat, level, Math.random);
        if (cards) {
          const result = playCards(current, seat, cards);
          if (result.ok) {
            commit(result.state, mode, current);
            changed = true;
          } else {
            const fallback = fallbackPlay(current, seat);
            if (fallback) {
              const retry = playCards(current, seat, fallback);
              if (retry.ok) {
                commit(retry.state, mode, current);
                changed = true;
              }
            }
          }
        }
      }
      if (!changed) setAiThinking(false);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, lanPlayers, level, mode, names, screen, state]);

  // A dropped LAN guest should not freeze the table.
  useEffect(() => {
    if (screen !== 'game' || mode !== 'lan-host' || state.phase !== 'play') return;
    if (state.turn !== 1 && state.turn !== 2 && state.turn !== 3) return;
    const seat = state.turn;
    if (lanPlayersRef.current[seat]?.connected) return;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.version !== state.version || current.phase !== 'play' || current.turn !== seat) return;
      const fallback = fallbackPlay(current, seat);
      if (!fallback) return;
      const result = playCards(current, seat, fallback);
      if (result.ok) commit(result.state, 'lan-host', current);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [commit, mode, screen, state]);

  // Keyboard path: native buttons stay tabbable; these shortcuts speed up a turn.
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
      const buttonFocused = target?.tagName === 'BUTTON';
      if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        showHint();
      } else if (event.key === 'u' || event.key === 'U') {
        event.preventDefault();
        undo();
      } else if (event.key === 'Enter') {
        if (buttonFocused) return;
        if (activeView.phase === 'play' && canSubmit) {
          event.preventDefault();
          playSelected();
        } else if (activeView.phase === 'bury' && canAct && selected.length === 8) {
          event.preventDefault();
          burySelected();
        } else if (activeView.phase === 'declare' && canAct && hintOption) {
          event.preventDefault();
          declareWith(hintOption);
        }
      } else if (/^[1-9]$/.test(event.key) && canSelect) {
        const card = activeView.hand[Number(event.key) - 1];
        if (card) {
          event.preventDefault();
          toggleCard(card.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    activeView.hand,
    activeView.phase,
    burySelected,
    canAct,
    canSelect,
    canSubmit,
    declareWith,
    goHome,
    hintOption,
    playSelected,
    screen,
    selected.length,
    showHint,
    toggleCard,
    undo,
  ]);

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
            if (player.seat > 0 && player.connected && player.seat < 4) {
              const previous = lanPlayersRef.current[player.seat];
              if (!previous?.connected || isAiName(merged[player.seat])) {
                merged[player.seat] = player.name;
                changed = true;
              }
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
        if (hostRef.current !== created || !lanStartedRef.current) return;
        const value = intent as
          | { type?: string; version?: number; option?: unknown; cards?: unknown }
          | null;
        if (!value || seat <= 0 || seat >= 4) return;
        if (value.version !== stateRef.current.version) return;
        const current = stateRef.current;
        let result;
        if (value.type === 'declare') {
          const option = readBidOption(value.option);
          if (!option) return;
          result = declareTrump(current, seat, option);
        } else if (value.type === 'pass-declare') {
          result = passBid(current, seat, Math.random);
        } else if (value.type === 'bury' && Array.isArray(value.cards)) {
          const cards = value.cards.filter((item): item is string => typeof item === 'string');
          result = buryCards(current, seat, cards);
        } else if (value.type === 'play' && Array.isArray(value.cards)) {
          const cards = value.cards.filter((item): item is string => typeof item === 'string');
          result = playCards(current, seat, cards);
        } else {
          return;
        }
        if (!result) return;
        if (result.ok) {
          commit(result.state, 'lan-host', current);
        } else if (lanPlayersRef.current[seat]?.connected) {
          created.sendView(seat, view(current, seat, namesRef.current));
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
        color: { dark: '#2d3a30', light: '#fff9ee' },
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
    const next = setup({ rng: Math.random, dealer: 3 });
    const nextNames = [0, 1, 2, 3].map((seat) => {
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
  }, [connectedGuests.length, hostName, lang, lanPlayers]);

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
      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        const next = payload as SeatView;
        if (!next || !Array.isArray(next.hand) || typeof next.seat !== 'number') return;
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
      setToast(t(lang, 'lanCopied'));
    } catch {
      setToast(lanInvite);
    }
  }, [lanInvite, lang]);

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

  const statusHeadline = (() => {
    if (activeView.phase === 'deal-over') {
      if (activeView.matchWinner !== null) return t(lang, 'matchOver');
      return t(lang, 'dealResult');
    }
    if (activeView.phase === 'declare') {
      if (canAct) return t(lang, 'yourTurn');
      return t(lang, 'declareTurn', { name: currentName });
    }
    if (activeView.phase === 'bury') {
      if (canAct) return t(lang, 'yourTurn');
      return t(lang, 'buryTurn', { name: currentName });
    }
    if (canAct) return t(lang, 'yourTurn');
    return t(lang, 'turnOf', { name: currentName });
  })();

  const statusDetail = (() => {
    if (activeView.phase === 'deal-over') {
      if (activeView.matchWinner !== null) {
        return t(lang, 'matchWinner', { team: teamNames[activeView.matchWinner] });
      }
      return activeView.lastResult
        ? t(lang, 'dealResultTitle', { n: activeView.lastResult.deal })
        : t(lang, 'statusOver');
    }
    if (activeView.phase === 'declare') {
      return activeView.declaration
        ? t(lang, 'currentBid')
        : t(lang, 'noBid');
    }
    if (activeView.phase === 'bury') return t(lang, 'waitingBury');
    if (activeView.currentTrick.length > 0) {
      return leadSize === 1 ? t(lang, 'followLeadOne') : t(lang, 'followLead', { n: leadSize });
    }
    return t(lang, 'leadAny');
  })();

  const bidStrengthFor = (seat: number): number | null => {
    for (let index = activeView.declarations.length - 1; index >= 0; index -= 1) {
      const declaration = activeView.declarations[index];
      if (declaration.seat === seat) return declaration.strength;
    }
    return null;
  };

  const lastTrickPlays = activeView.lastTrick?.plays ?? null;
  const displayedTrickPoints =
    activeView.currentTrick.length > 0
      ? tablePoints
      : activeView.lastTrick?.points ?? 0;
  const trickNumber =
    activeView.currentTrick.length > 0
      ? activeView.trickCount + 1
      : Math.max(1, activeView.trickCount);

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
          <button className="ghost" onClick={() => setSoundOn((value) => !value)} aria-pressed={soundOn}>
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-table" aria-hidden="true">
          <div className="hero-felt">
            <div className="hero-fan">
              {HERO_CARDS.map((card, index) => (
                <CardFace
                  key={card.id}
                  card={card}
                  lang={lang}
                  trump="S"
                  levelRank="2"
                  size="hero"
                  index={index}
                />
              ))}
            </div>
            <div className="hero-bid">
              <span>♠</span>
              <strong>2</strong>
            </div>
          </div>
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continueGame')}</span>
                <small>{t(lang, 'dealLabel', { n: saved.state.deal })}</small>
              </button>
            )}
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={() => openSetup('ai')}>
              <span>{tr('playAi')}</span>
              <small>{tr('aiMenuHint')}</small>
            </button>
            <button className="secondary wide" onClick={() => startLocal('local')}>
              <span>{tr('playLocal')}</span>
              <small>{tr('localMenuHint')}</small>
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
            <span>{tr('deals')}</span>
            <strong>{record.deals}</strong>
            <span className="dot">·</span>
            <span>{record.deals > 0 ? t(lang, 'recordSuccess', { n: Math.round((record.declarerUpgrades / record.deals) * 100) }) : tr('none')}</span>
            <span className="dot">·</span>
            <span>{tr('biggestJump')}</span>
            <strong>{record.biggestJump > 0 ? `+${record.biggestJump}` : tr('none')}</strong>
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
      <section className="setup-block facts-block">
        <h3>{tr('tableFacts')}</h3>
        <ul className="fact-list">
          <li>{tr('factCards')}</li>
          <li>{tr('factTarget')}</li>
          <li>{tr('factMatch')}</li>
          <li>{tr('factThrow')}</li>
        </ul>
      </section>
      <div className="row-actions">
        <button className="primary" onClick={() => startLocal('ai')}>
          {tr('startSolo')}
        </button>
        <button className="ghost" onClick={goHome}>
          {tr('back')}
        </button>
      </div>
    </main>
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
            {modeLabel} · {t(lang, 'dealLabel', { n: activeView.deal })}
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
          <div className={`turn-bar ${activeView.phase !== 'play' ? 'is-special' : ''}`} aria-live="polite">
            <span className={`turn-medallion ${canAct ? 'live' : ''}`}>
              {activeView.phase === 'deal-over' ? '★' : canAct ? '●' : '◇'}
            </span>
            <div className="turn-copy">
              <strong>{statusHeadline}</strong>
              <p>{statusDetail}</p>
            </div>
            {aiThinking && <span className="thinking">…</span>}
          </div>

          {mode !== 'local' && lanError && (
            <p className="error game-error" role="alert">
              {lanError}
            </p>
          )}

          <Scoreboard
            lang={lang}
            teamNames={teamNames}
            levels={activeView.levels}
            points={activeView.points}
            declarerTeam={activeView.declarerTeam}
            trump={activeView.trump}
            levelRank={activeView.levelRank}
          />

          <div className={`felt felt-${activeView.phase}`}>
            <div className="seat-ring">
              {([0, 1, 2, 3] as Seat[]).map((seat) => (
                <SeatBadge
                  key={seat}
                  seat={seat}
                  name={nameAt(seat)}
                  count={activeView.handCounts[seat] ?? 0}
                  position={relativePosition(seat, viewerSeat)}
                  active={
                    activeView.phase !== 'deal-over' &&
                    currentSeat === seat &&
                    (activeView.phase !== 'play' || activeView.currentTurn >= 0)
                  }
                  declarer={activeView.declarer === seat}
                  isYou={seat === viewerSeat}
                  isAI={isAiName(shownNames[seat])}
                  bidStrength={bidStrengthFor(seat)}
                  lastWinner={activeView.lastTrick?.winner === seat}
                  lang={lang}
                  thinking={aiThinking && currentSeat === seat}
                />
              ))}
            </div>
            <TrickArea
              lang={lang}
              viewerSeat={viewerSeat}
              current={activeView.currentTrick}
              last={lastTrickPlays}
              trickCount={trickNumber}
              turnName={currentName}
              points={displayedTrickPoints}
              names={displayNames}
            />
          </div>

          {activeView.phase === 'declare' && (
            <DeclarePanel
              lang={lang}
              options={legalDeclareOptions}
              current={activeView.declaration}
              names={displayNames}
              canAct={canAct}
              hintOption={hintOption}
              hintPass={hint?.type === 'pass'}
              onDeclare={declareWith}
              onPass={doPassDeclaration}
            />
          )}

          {activeView.phase === 'bury' && (
            <BuryPanel
              lang={lang}
              selected={selected.length}
              selectedPoints={selectedExtraPoints}
              canAct={canAct}
              hintSelected={hint?.type === 'bury'}
              onBury={burySelected}
              onHint={showHint}
            />
          )}

          {activeView.phase === 'deal-over' && activeView.lastResult && (
            <ResultPanel
              lang={lang}
              result={activeView.lastResult}
              names={displayNames}
              isGuest={mode === 'lan-guest'}
              canNext={mode !== 'lan-guest'}
              onNext={doNextDeal}
              onHome={goHome}
            />
          )}

          {activeView.phase !== 'deal-over' && (
            <section className="hand-area" aria-label={tr('handLabel')}>
              <div className="hand-head">
                <div className="hand-id">
                  <span className="hand-kicker">{tr('yourSeat')}</span>
                  <strong>{viewerName}</strong>
                  <span className={`team-chip team-${activeView.team}`}>
                    {activeView.team === 0 ? tr('teamA') : tr('teamB')}
                  </span>
                  {activeView.declarer === viewerSeat && <span className="declarer-chip">{tr('declarer')}</span>}
                </div>
                <span className="hand-count">
                  {t(lang, 'cardCount', { n: activeView.hand.length })}
                </span>
              </div>

              {handVisible ? (
                <>
                  <div className="hand" role="group" aria-label={tr('handLabel')} data-hand-count={activeView.hand.length} ref={handRef}>
                    {activeView.hand.map((card, index) => (
                      <CardFace
                        key={card.id}
                        card={card}
                        lang={lang}
                        trump={activeView.trump}
                        levelRank={activeView.levelRank}
                        selected={selected.includes(card.id)}
                        hinted={hint?.cards.includes(card.id) ?? false}
                        legal={legalSet.has(card.id)}
                        disabled={!canSelect}
                        onClick={canSelect ? () => toggleCard(card.id) : undefined}
                        index={index}
                      />
                    ))}
                  </div>

                  {activeView.phase === 'play' && (
                    <div className="hand-controls">
                      <button className="primary play-button" disabled={!canSubmit} onClick={playSelected}>
                        {tr('playButton')}
                      </button>
                      <button
                        className="ghost clear-button"
                        disabled={selected.length === 0}
                        onClick={() => {
                          setSelected([]);
                          setHint(null);
                        }}
                      >
                        {tr('clear')}
                      </button>
                    </div>
                  )}

                  {activeView.phase === 'bury' && (
                    <div className="hand-controls">
                      <button
                        className="ghost clear-button"
                        disabled={selected.length === 0}
                        onClick={() => {
                          setSelected([]);
                          setHint(null);
                        }}
                      >
                        {tr('clear')}
                      </button>
                    </div>
                  )}

                  {activeView.phase === 'play' && (
                    <div className="selection-line" aria-live="polite">
                      {selected.length > 0 ? (
                        <>
                          <span>{t(lang, 'selectedCount', { n: selected.length })}</span>
                          {selectedShape && (
                            <span className="selection-shape">
                              {selectedShape.kind === 'single'
                                ? tr('selectedShapeSingle')
                                : selectedShape.kind === 'pair'
                                  ? tr('selectedShapePair')
                                  : selectedShape.kind === 'tractor'
                                    ? t(lang, 'selectedShapeTractor', { n: selectedShape.size })
                                    : t(lang, 'selectedShapeThrow', { n: selectedShape.size })}
                            </span>
                          )}
                          {localProblem ? (
                            <span className="selection-problem">{localProblem}</span>
                          ) : (
                            <span className="selection-ready">{tr('selectionReady')}</span>
                          )}
                        </>
                      ) : (
                        <span>{tr('chooseCards')}</span>
                      )}
                    </div>
                  )}

                  {activeView.phase === 'declare' && (
                    <p className="hand-note">{tr('declarePrompt')}</p>
                  )}
                  {activeView.phase === 'bury' && (
                    <p className="hand-note">{t(lang, 'buryCount', { n: selected.length })}</p>
                  )}
                  {hintText && (
                    <div className="hint-note" role="status">
                      <strong>{tr('hintsTitle')}</strong>
                      <span>{hintText}</span>
                    </div>
                  )}
                </>
              ) : (
                <PrivacyGate lang={lang} name={viewerName} onReveal={() => setRevealedSeat(viewerSeat)} />
              )}
            </section>
          )}
        </section>

        <aside className="side">
          <div className="side-card table-card">
            <h3>{tr('table')}</h3>
            <div className="side-stat">
              <span>{tr('trump')}</span>
              <strong>{trumps}</strong>
            </div>
            <div className="side-stat">
              <span>{tr('levelRank')}</span>
              <strong>{activeView.levelRank}</strong>
            </div>
            <div className="side-stat">
              <span>{tr('declarer')}</span>
              <strong>{declarerName}</strong>
            </div>
            <div className="side-stat">
              <span>{tr('target80')}</span>
              <strong>{activeView.declarerTeam !== null ? activeView.points[activeView.declarerTeam] : 0} / 80</strong>
            </div>
            <p className="side-note">{tr('throwRuleShort')}</p>
            <p className="side-note">{tr('pointRuleShort')}</p>
          </div>

          <div className="side-card controls-mini">
            <h3>{tr('controlsTitle')}</h3>
            <div className="side-actions">
              <button className="secondary hint-button" disabled={!canHint} onClick={showHint}>
                {tr('hint')}
              </button>
              <button className="secondary undo-button" disabled={!canUndo} onClick={undo}>
                {tr('undo')}
              </button>
            </div>
            <p className="side-note">{tr('keyboardHint')}</p>
            <p className="side-note">{mode === 'lan-guest' || mode === 'lan-host' ? tr('localOnly') : tr('controlsTap')}</p>
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
                  ? t(lang, 'lanFourSeats')
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
              {record.deals === 1 ? tr('recordDealOne') : t(lang, 'recordDeals', { n: record.deals })} ·{' '}
              {tr('biggestJump')} {record.biggestJump > 0 ? `+${record.biggestJump}` : tr('none')}
            </p>
            <p className="record-mini-note">{tr('recordMiniNote')}</p>
            {mode !== 'lan-host' && mode !== 'lan-guest' && (
              <button className="text-button" onClick={() => setScreen('stats')}>
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
              <p className="field-note">{tr('lanFourSeats')}</p>
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
                  {tr('lanFourSeats')} · {tr('lanAiFill')}
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
                  {Array.from({ length: Math.max(0, 4 - 1 - connectedGuests.length) }, (_, index) => (
                    <span key={`empty-${index}`} className="peer-chip">
                      <span className="peer-mark">·</span>
                      <span className="peer-name">{tr('lanEmptySeats')}</span>
                    </span>
                  ))}
                </div>
                <button className="primary wide" onClick={startLan} disabled={connectedGuests.length === 0}>
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
        <h2 className="screen-title">{tr('statsTitle')}</h2>
      </header>

      {record.deals === 0 ? (
        <section className="empty-card">
          <span className="empty-cards" aria-hidden="true">
            <span className="card-back" />
            <span className="card-back" />
            <span className="card-back" />
          </span>
          <p>{tr('recordEmpty')}</p>
          <button className="primary" onClick={() => openSetup('ai')}>
            {tr('statsEmptyAction')}
          </button>
        </section>
      ) : (
        <>
          <section className="stats-top">
            <div className="stat-card total">
              <span>{tr('deals')}</span>
              <strong>{record.deals}</strong>
            </div>
            <div className="stat-card ai">
              <span>{tr('declarerSuccess')}</span>
              <strong>{record.declarerUpgrades}</strong>
            </div>
            <div className="stat-card local">
              <span>{tr('defenderHolds')}</span>
              <strong>{record.defenderHolds}</strong>
            </div>
            <div className="stat-card lan">
              <span>{tr('biggestJump')}</span>
              <strong>{record.biggestJump > 0 ? `+${record.biggestJump}` : '—'}</strong>
            </div>
          </section>

          <section className="record-grid">
            <div className="record-card">
              <h3>{tr('byMode')}</h3>
              <ul className="tally-list">
                {(['ai', 'local', 'lan'] as RecordMode[]).map((key) => (
                  <li key={key}>
                    <span className="tally-name">{t(lang, key === 'ai' ? 'modeAi' : key === 'local' ? 'modeLocal' : 'modeLan')}</span>
                    <span className="tally-bar">
                      <i style={{ width: `${(record.byMode[key] / record.deals) * 100}%` }} />
                    </span>
                    <strong>{record.byMode[key]}</strong>
                  </li>
                ))}
              </ul>
              <p className="record-mini-note">{tr('recordNote')}</p>
            </div>

            <div className="record-card">
              <h3>{tr('lastDeal')}</h3>
              {record.lastDeal ? (
                <div className="last-deal-card">
                  <span className={`result-chip ${record.lastDeal.success ? 'success' : 'held'}`}>
                    {record.lastDeal.success ? tr('success') : record.lastDeal.jump === 3 ? tr('shutout') : tr('held')}
                  </span>
                  <strong>{t(lang, 'recordLine', {
                    n: record.lastDeal.deal,
                    points: record.lastDeal.declarerPoints,
                    result: record.lastDeal.success ? tr('success') : tr('held'),
                  })}</strong>
                  <span>
                    {tr('teamA')} {levelLabelText(record.lastDeal.levels[0])} · {tr('teamB')}{' '}
                    {levelLabelText(record.lastDeal.levels[1])}
                  </span>
                  <span className="last-deal-trump">{trumpLabel(lang, record.lastDeal.trump, record.lastDeal.levelRank)}</span>
                </div>
              ) : (
                <p className="recent-empty">{tr('none')}</p>
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
            <h3>{tr('recentDeals')}</h3>
            {record.recent.length === 0 ? (
              <p className="recent-empty">{tr('recentEmpty')}</p>
            ) : (
              <ol className="recent-list">
                {record.recent.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="recent-row">
                    <span className={`recent-mark ${entry.success ? 'success' : 'held'}`} aria-hidden="true">
                      {entry.success ? '↑' : '·'}
                    </span>
                    <div className="recent-main">
                      <strong>
                        {t(lang, 'dealNumber', { n: entry.deal })} · {entry.declarerPoints} {tr('pointsShort')}
                      </strong>
                      <span>
                        {t(lang, entry.mode === 'ai' ? 'modeAi' : entry.mode === 'local' ? 'modeLocal' : 'modeLan')}
                        {entry.level ? ` · ${t(lang, entry.level)}` : ''} ·{' '}
                        {entry.success ? tr('success') : entry.jump === 3 ? tr('shutout') : tr('held')}
                      </span>
                    </div>
                    <time dateTime={new Date(entry.at).toISOString()}>{formatDate(entry.at, lang)}</time>
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
        {(['rule1', 'rule2', 'rule3', 'rule4', 'rule5', 'rule6', 'rule7', 'rule8', 'rule9', 'rule10', 'rule11', 'rule12'] as const).map(
          (key) => (
            <li key={key}>{tr(key)}</li>
          ),
        )}
      </ol>

      <section className="rules-extra">
        <h3>{tr('scoringTitle')}</h3>
        <div className="score-table">
          <div className="score-row">
            <strong>{tr('scoreLinePoints')}</strong>
            <span>{tr('scoreLinePointsValue')}</span>
          </div>
          <div className="score-row">
            <strong>{tr('scoreLineMade')}</strong>
            <span>{tr('scoreLineMadeValue')}</span>
          </div>
          <div className="score-row">
            <strong>{tr('scoreLineHeld')}</strong>
            <span>{tr('scoreLineHeldValue')}</span>
          </div>
          <div className="score-row">
            <strong>{tr('scoreLineDefenders')}</strong>
            <span>{tr('scoreLineDefendersValue')}</span>
          </div>
          <div className="score-row">
            <strong>{tr('scoreLineShutout')}</strong>
            <span>{tr('scoreLineShutoutValue')}</span>
          </div>
        </div>

        <h3>{tr('throwTitle')}</h3>
        <p className="rules-copy">{tr('throwRule1')}</p>
        <p className="rules-copy">{tr('throwRule2')}</p>
        <p className="rules-copy">{tr('throwRule3')}</p>

        <h3>{tr('controlsTitle')}</h3>
        <p className="controls-line">{tr('controlsKeys')}</p>
        <p className="controls-line">{tr('controlsTap')}</p>
        <p className="controls-line">{tr('privacyNote')}</p>
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
