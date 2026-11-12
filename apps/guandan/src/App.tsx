import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseAiAction, fallbackAction, type AiLevel } from './ai/ai';
import { hintFor, type HintKind } from './ai/hint';
import {
  LevelLadder,
  PlayerSeat,
  PlayingCard,
  PrivacyGate,
  TeamBadge,
  comboLabel,
} from './components/Table';
import {
  applySeat,
  beginRound,
  bestCombo,
  detectCombos,
  DECK,
  nextRound,
  partnerOf,
  rankLabel,
  setup,
  teamOf,
  view,
  type Card,
  type Combo,
  type GameState,
  type SeatView,
  type Team,
} from './game/guandan';
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
  combo: Combo | null;
}

const AI_LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const HINT_KEYS: Record<HintKind, MessageKey> = {
  finish: 'hintFinish',
  partner: 'hintPartner',
  bomb: 'hintBomb',
  wild: 'hintWild',
  control: 'hintControl',
  lead: 'hintLead',
  beat: 'hintBeat',
  pass: 'hintPass',
};

const AI_NAMES: Record<Lang, string[]> = {
  en: ['Ada', 'Bo', 'Cyd', 'Dee'],
  zh: ['阿棠', '小禾', '阿满', '小宁'],
};

const HERO_IDS = ['H2-0', 'S14-0', 'D13-1', 'C12-0', 'J16-1'];
const HERO_CARDS: Card[] = HERO_IDS.map((id) => DECK.find((card) => card.id === id)!).filter(Boolean);

const FAST_AI =
  typeof window !== 'undefined' && Boolean((window as unknown as { __GUANDAN_FAST__?: boolean }).__GUANDAN_FAST__);
const AI_DELAY = FAST_AI ? 35 : 620;

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
    return list[(Number(ai[1]) - 1) % list.length];
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
  const all = detectCombos(cards, activeView.levelRank);
  if (all.length === 0) return t(lang, 'chooseCards');
  const combo = bestCombo(cards, activeView.levelRank, activeView.trick?.combo ?? null);
  if (!combo) return t(lang, 'cannotBeat');
  return '';
}

function selectionLabel(activeView: SeatView, cards: Card[], lang: Lang): string {
  if (cards.length === 0) return t(lang, 'chooseCards');
  const combo =
    bestCombo(cards, activeView.levelRank, activeView.trick?.combo ?? null) ??
    detectCombos(cards, activeView.levelRank)[0];
  return combo ? comboLabel(lang, combo) : t(lang, 'chooseLegal');
}

function teamName(lang: Lang, team: Team): string {
  return t(lang, team === 0 ? 'teamNS' : 'teamEW');
}

function suitKey(suit: Card['suit']): MessageKey {
  return suit === 'S'
    ? 'suitSpades'
    : suit === 'H'
      ? 'suitHearts'
      : suit === 'D'
        ? 'suitDiamonds'
        : 'suitClubs';
}

function cardDescription(card: Card, lang: Lang): string {
  if (card.rank >= 15) {
    return t(lang, card.rank === 16 ? 'jokerBig' : 'jokerSmall');
  }
  return t(lang, 'cardAria', {
    rank: rankLabel(card.rank),
    suit: t(lang, suitKey(card.suit)),
  });
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (invite ? 'lan-guest' : 'ai'));
  const [setupMode, setSetupMode] = useState<'ai' | 'local'>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup(() => 0.5));
  const [names, setNames] = useState<string[]>(['@you', '@ai1', '@ai2', '@ai3']);
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [hint, setHint] = useState<HintState | null>(null);
  const [revealedSeat, setRevealedSeat] = useState<number | null>(0);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.guandan.sound') !== 'off';
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
      return localStorage.getItem('familyarcade.guandan.hostName') ?? '';
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
      localStorage.setItem('familyarcade.guandan.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.guandan.hostName', hostName);
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
    setSelected([]);
    setHint(null);
    setRevealedSeat(mode === 'local' ? null : 0);
  }, [state.turn, state.round, state.phase, mode]);

  useEffect(() => {
    if (!guestView) return;
    setSelected([]);
    setHint(null);
  }, [guestView?.turn, guestView?.round, guestView?.phase, guestView]);

  const localView = useMemo(
    () => view(state, mode === 'local' && state.phase === 'playing' ? state.turn : 0, names),
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
    handVisible &&
    hostOnline &&
    guestOnline &&
    (mode !== 'lan-host' || Boolean(lanHost));
  const selectedCards = activeView.hand.filter((card) => selected.includes(card.id));
  const problem = selectionProblem(activeView, selectedCards, lang);
  const canSubmit = canAct && selectedCards.length > 0 && !problem;
  const canHint =
    (mode === 'ai' || mode === 'local') &&
    activeView.phase === 'playing' &&
    activeView.isTurn &&
    handVisible;
  const canUndo =
    (mode === 'ai' || mode === 'local') &&
    activeView.phase === 'playing' &&
    history.length > 0 &&
    handVisible;
  const shownThinking =
    aiThinking ||
    (activeView.phase === 'playing' &&
      activeView.turn !== viewerSeat &&
      isAiName(shownNames[activeView.turn]));
  const tableLine = `${t(lang, 'roundN', { n: activeView.round })} · ${t(lang, 'levelN', {
    rank: rankLabel(activeView.levelRank),
  })}`;

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
        if (next.phase === 'round-over' || next.phase === 'match-over') chime('win');
        else if (next.last?.kind === 'pass') chime('pass');
        else chime('place');
      }
      if (
        (next.phase === 'round-over' || next.phase === 'match-over') &&
        !recorded
      ) {
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
        if (next.phase === 'playing' || next.phase === 'tribute') {
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
      const next = setup(Math.random);
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
      setRecorded(false);
      setAiThinking(false);
      setRevealedSeat(nextMode === 'local' ? null : 0);
      setScreen('game');
      clearSave();
      setSaved(saveGame({ state: next, mode: nextMode, level, names: nextNames }));
    },
    [level],
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
    namesRef.current = restoredNames;
    setMode(saved.mode);
    setLevel(saved.level);
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
    setRecorded(false);
    setRevealedSeat(mode === 'local' ? null : 0);
    setSaved(saveGame({ state: previous, mode, level, names: namesRef.current }));
  }, [history, level, mode, state.phase]);

  const showHint = useCallback(() => {
    if (!canHint) return;
    const next = hintFor(state, state.turn);
    if (!next) {
      setToast(tr('noHint'));
      return;
    }
    setHint({
      cards: next.cards.map((card) => card.id),
      pass: next.action.type === 'pass',
      kind: next.kind,
      combo: next.combo,
    });
    setToast('');
  }, [canHint, state, tr]);

  const toggleCard = useCallback(
    (id: string) => {
      if (!canAct || !handVisible) return;
      if (selected.includes(id)) {
        setSelected(selected.filter((item) => item !== id));
        return;
      }
      if (selected.length >= 10) return;
      setSelected([...selected, id]);
    },
    [canAct, handVisible, selected],
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
      setToast(
        result.error === 'does-not-beat'
          ? tr('cannotBeat')
          : result.error === 'invalid-combo'
            ? tr('chooseLegal')
            : tr('errorGeneric'),
      );
      return;
    }
    commit(result.state, mode, state);
  }, [activeView.actions, canSubmit, commit, guest, lang, mode, selected, state, tr]);

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

  const startRound = useCallback(() => {
    if (mode === 'lan-guest' || state.phase !== 'tribute') return;
    const next = beginRound(state);
    commit(next, mode, state);
    setRecorded(false);
    setRevealedSeat(mode === 'local' ? null : 0);
  }, [commit, mode, state]);

  const goNextRound = useCallback(() => {
    if (mode === 'lan-guest' || state.phase !== 'round-over') return;
    const result = nextRound(state, Math.random);
    if (!result.ok) {
      setToast(tr('errorGeneric'));
      return;
    }
    const next = result.state;
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
      setSaved(saveGame({ state: next, mode, level, names: namesRef.current }));
    } else if (mode === 'lan-host') {
      sendViews(next, namesRef.current);
    }
  }, [level, mode, sendViews, state, tr]);

  const resetRecord = useCallback(() => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setRecord(clearStoredRecord());
    setClearArmed(false);
    setToast(tr('recordNote'));
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
    }, AI_DELAY);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, lanHost?.status, level, mode, names, screen, state]);

  // A dropped guest should not freeze the table; the host plays a low card or passes.
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
      } else if (event.key === 'Enter' && target?.tagName !== 'BUTTON') {
        event.preventDefault();
        playSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doPass, goHome, playSelected, screen, showHint, undo]);

  // Sound follows the guest's private view.
  useEffect(() => {
    if (!guestView) {
      lastGuestActionsRef.current = -1;
      return;
    }
    const previous = lastGuestActionsRef.current;
    lastGuestActionsRef.current = guestView.actions;
    if (previous < 0 || guestView.actions <= previous || !soundOn) return;
    if (guestView.phase === 'round-over' || guestView.phase === 'match-over') chime('win');
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
        setLanPlayers(players);
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
          else created.sendView(seat, view(current, seat, namesRef.current));
        } else if (value.type === 'pass') {
          const result = applySeat(current, seat, { type: 'pass' });
          if (result.ok) commit(result.state, 'lan-host', current);
          else created.sendView(seat, view(current, seat, namesRef.current));
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
        color: { dark: '#1f4a3d', light: '#fffaf0' },
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
    const next = setup(Math.random);
    const nextNames = Array.from({ length: 4 }, (_, seat) => {
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
      lastGuestActionsRef.current = -1;
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

  const statusHeadline = (() => {
    if (activeView.phase === 'tribute') return t(lang, 'tributeTitle');
    if (activeView.phase === 'round-over') return t(lang, 'roundOver');
    if (activeView.phase === 'match-over') return t(lang, 'matchWon');
    if (activeView.finished) return t(lang, 'waitingFor', { name: currentName });
    if (activeView.canPlay && handVisible) return t(lang, 'yourTurn');
    if (mode === 'ai') return t(lang, 'thinking', { name: currentName });
    if (mode === 'lan-host' && activeView.turn !== 0) {
      return t(lang, 'waitingFor', { name: currentName });
    }
    if (activeView.passed[viewerSeat] && activeView.trick) return t(lang, 'passedTurn');
    return t(lang, 'turnOf', { name: currentName });
  })();

  const statusDetail = (() => {
    if (activeView.phase === 'tribute') return t(lang, 'tributeNote');
    if (activeView.phase === 'round-over' || activeView.phase === 'match-over') {
      return t(lang, 'finishOrder');
    }
    if (activeView.finished) return t(lang, 'waitingFor', { name: currentName });
    if (activeView.passed[viewerSeat] && activeView.trick) return t(lang, 'passedTurn');
    if (activeView.canPlay) {
      if (activeView.trick) {
        return t(lang, 'mustBeat', { combo: comboLabel(lang, activeView.trick.combo) });
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
      if (activeView.last.combo) return comboLabel(lang, activeView.last.combo);
    }
    return '';
  };

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
            <span className="hero-seat hero-n">{t(lang, 'seatNorthShort')}</span>
            <span className="hero-seat hero-e">{t(lang, 'seatEastShort')}</span>
            <span className="hero-seat hero-s">{t(lang, 'seatSouthShort')}</span>
            <span className="hero-seat hero-w">{t(lang, 'seatWestShort')}</span>
            <div className="hero-level">
              <span>{rankLabel(2)}</span>
              <small>{t(lang, 'levelShort')}</small>
            </div>
            <div className="hero-fan">
              {HERO_CARDS.map((card, index) => (
                <div className="hero-card" key={card.id} style={{ '--fan': index } as CSSProperties}>
                  <PlayingCard card={card} lang={lang} level={2} compact />
                </div>
              ))}
            </div>
            <span className="hero-wild">
              ♥ {rankLabel(2)} · {t(lang, 'wildcard')}
            </span>
          </div>
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>
                  {t(lang, 'savedInfo', {
                    mode: saved.mode === 'ai' ? t(lang, 'modeAi') : t(lang, 'modeLocal'),
                    round: saved.state.round,
                    level: rankLabel(saved.state.levelRank),
                  })}
                </small>
              </button>
            )}
            <button
              className={saved ? 'secondary wide' : 'primary wide'}
              onClick={() => openSetup('ai')}
            >
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
            <span>{tr('recordStripRounds')}</span>
            <strong>{record.rounds}</strong>
            <span className="dot">·</span>
            <span>{t(lang, 'teamNS')}</span>
            <strong>{record.roundWins[0]}</strong>
            <span className="dot">·</span>
            <span>{t(lang, 'teamEW')}</span>
            <strong>{record.roundWins[1]}</strong>
            <span className="dot">·</span>
            <span>{tr('recordStripTitles')}</span>
            <strong>{record.titles[0] + record.titles[1]}</strong>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('footer')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('setupTitle')}</h2>
      <div className="setup-layout">
        <section className="setup-main">
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
          <div className="row-actions">
            <button className="primary" onClick={() => startLocal(setupMode)}>
              {tr('deal')}
            </button>
            <button className="ghost" onClick={goHome}>
              {tr('back')}
            </button>
          </div>
        </section>
        <aside className="setup-aside">
          <h3>{tr('atAGlance')}</h3>
          <ul className="glance-list">
            <li>{tr('glance1')}</li>
            <li>{tr('glance2')}</li>
            <li>{tr('glance3')}</li>
          </ul>
          <div className="setup-level">
            <span>{tr('levelCard')}</span>
            <strong>{rankLabel(2)}</strong>
            <small>♥ {tr('wildcard')}</small>
          </div>
        </aside>
      </div>
    </main>
  );

  const exchange = activeView.tribute;
  const tributePanel = exchange ? (
    <section className="tribute-panel" aria-live="polite">
      <div className="panel-head">
        <span className="result-kicker">{t(lang, 'roundN', { n: activeView.round })}</span>
        <span className={`tribute-kind ${exchange.kind}`}>
          {exchange.kind === 'double'
            ? tr('tributeDouble')
            : exchange.kind === 'single'
              ? tr('tributeSingle')
              : exchange.kind === 'anti'
                ? tr('tributeAnti')
                : tr('tributeNone')}
        </span>
      </div>
      <h3>{tr('tributeTitle')}</h3>
      {exchange.kind === 'anti' ? (
        <p className="tribute-line anti">
          {t(lang, 'tributeAntiLine', {
            seats: exchange.antiSeats.map((seat) => nameAt(seat)).join(' · '),
          })}
        </p>
      ) : (
        <div className="tribute-moves">
          {exchange.moves.map((move, index) => (
            <div className="tribute-move" key={`${move.from}-${index}`}>
              <span className="tribute-player">{nameAt(move.from)}</span>
              <span className="tribute-arrow">→</span>
              <span className="tribute-player">{nameAt(move.to)}</span>
              <span className="tribute-card">{cardDescription(move.card, lang)}</span>
              {move.back && (
                <span className="tribute-back">
                  {t(lang, 'tributeBack', {
                    to: nameAt(move.to),
                    from: nameAt(move.from),
                    card: cardDescription(move.back, lang),
                  })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="tribute-leader">
        {t(lang, 'tributeLeader', { name: nameAt(exchange.leader) })}
      </p>
      <p className="panel-note">{tr('tributeNote')}</p>
      {mode === 'lan-guest' ? (
        <span className="wait-pill">{tr('waitHostNext')}</span>
      ) : (
        <button className="primary" onClick={startRound}>
          {tr('startRound')}
        </button>
      )}
    </section>
  ) : null;

  const result = activeView.result;
  const resultPanel = result ? (
    <section className="result-panel" aria-live="polite">
      <div className="panel-head">
        <span className="result-kicker">
          {activeView.phase === 'match-over' ? tr('matchWon') : tr('roundOver')}
        </span>
        <span className={`gain-badge gain-${result.gain}`}>+{result.gain}</span>
      </div>
      <h3>
        {activeView.phase === 'match-over' && activeView.matchWinner !== null
          ? t(lang, 'matchWinner', { team: teamName(lang, activeView.matchWinner) })
          : t(lang, 'teamWon', { team: teamName(lang, result.winnerTeam) })}
      </h3>
      <div className="level-change">
        <div className="level-change-team">
          <TeamBadge team={0} lang={lang} />
          <span>{rankLabel(result.levelsBefore[0])} → {rankLabel(result.levelsAfter[0])}</span>
        </div>
        <div className="level-change-team">
          <TeamBadge team={1} lang={lang} />
          <span>{rankLabel(result.levelsBefore[1])} → {rankLabel(result.levelsAfter[1])}</span>
        </div>
      </div>
      <p className="gain-line">
        {result.gain === 3 ? tr('gain3') : result.gain === 2 ? tr('gain2') : tr('gain1')}
      </p>
      <h4>{tr('finishOrder')}</h4>
      <ol className="ranking-list">
        {result.order.map((seat, index) => (
          <li key={`${seat}-${index}`} className={seat === viewerSeat ? 'is-you' : ''}>
            <span className="place">{index + 1}</span>
            <span className="ranking-name">{nameAt(seat)}</span>
            <TeamBadge team={teamOf(seat)} lang={lang} short />
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
          {activeView.phase === 'match-over' ? (
            <button className="primary" onClick={() => startLocal(mode === 'ai' ? 'ai' : 'local')}>
              {tr('newMatch')}
            </button>
          ) : (
            <button
              className="primary"
              onClick={goNextRound}
              disabled={mode === 'lan-host' && !lanHost}
            >
              {tr('nextRound')}
            </button>
          )}
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
          <span>
            {modeLabel} · {t(lang, 'roundN', { n: activeView.round })} ·{' '}
            {t(lang, 'levelN', { rank: rankLabel(activeView.levelRank) })}
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
            <span className="sound-glyph" data-on={soundOn}>♪</span>
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
            <div className="level-chip">
              <span>{rankLabel(activeView.levelRank)}</span>
              <small>♥ {tr('wildcard')}</small>
            </div>
            {shownThinking && (
              <span className="thinking" aria-hidden="true">…</span>
            )}
          </div>

          {mode !== 'local' && lanError && (
            <p className="error game-error" role="alert">{lanError}</p>
          )}

          <div
            className={`felt ${activeView.phase === 'playing' ? '' : 'is-finished'}`}
            data-turn={activeView.turn}
            data-seat={activeView.seat}
            data-viewer={viewerSeat}
            data-phase={activeView.phase}
          >
            <div className="seat-layer">
              {Array.from({ length: 4 }, (_, seat) => (
                <PlayerSeat
                  key={seat}
                  seat={seat}
                  name={nameAt(seat)}
                  team={teamOf(seat)}
                  count={activeView.handCounts[seat] ?? 0}
                  turn={activeView.phase === 'playing' && activeView.turn === seat}
                  finished={activeView.finish.includes(seat)}
                  passed={Boolean(activeView.trick) && activeView.passed[seat]}
                  place={activeView.finish.includes(seat) ? activeView.finish.indexOf(seat) + 1 : null}
                  lastText={lastTextFor(seat)}
                  isYou={seat === viewerSeat}
                  isPartner={seat === partnerOf(viewerSeat)}
                  thinking={seatThinking(seat)}
                  lang={lang}
                />
              ))}
            </div>

            <div className="table-center">
              <div className={`trick-area ${activeView.trick ? 'has-trick' : 'empty-trick'}`}>
                {activeView.trick ? (
                  <>
                    <div className="trick-cards">
                      {activeView.trick.cards.map((card, index) => (
                        <PlayingCard
                          key={card.id}
                          card={card}
                          lang={lang}
                          level={activeView.levelRank}
                          compact
                          index={index}
                        />
                      ))}
                    </div>
                    <div className="trick-copy">
                      <strong>{comboLabel(lang, activeView.trick.combo)}</strong>
                      <span>{t(lang, 'trickOwner', { name: nameAt(activeView.trick.seat) })}</span>
                    </div>
                  </>
                ) : (
                  <div className="trick-copy empty">
                    <span className="trick-kicker">{tr('newTrick')}</span>
                    <strong>
                      {activeView.turn === viewerSeat
                        ? tr('trickLeadYou')
                        : t(lang, 'trickLead', { name: nameAt(activeView.turn) })}
                    </strong>
                  </div>
                )}
              </div>
              <div className="level-medallion" aria-hidden="true">
                <span>{rankLabel(activeView.levelRank)}</span>
                <small>♥</small>
              </div>
            </div>
          </div>

          {activeView.phase === 'tribute' && tributePanel}
          {(activeView.phase === 'round-over' || activeView.phase === 'match-over') && resultPanel}

          {activeView.phase === 'playing' && (
            <section className="hand-area">
              <div className="hand-head">
                <div className="hand-id">
                  <span className="hand-kicker">{tr('handLabel')}</span>
                  <strong>{viewerName}</strong>
                  <TeamBadge team={activeView.team} lang={lang} />
                  {viewerSeat !== 0 && mode === 'local' && (
                    <span className="hand-seat">
                      {viewerSeat === 1
                        ? tr('seatEast')
                        : viewerSeat === 2
                          ? tr('seatNorth')
                          : tr('seatWest')}
                    </span>
                  )}
                </div>
                <span className="hand-count">
                  {activeView.hand.length === 1
                    ? tr('cardsLeftOne')
                    : t(lang, 'cardsLeft', { n: activeView.hand.length })}
                </span>
              </div>

              {handVisible && activeView.hand.length > 0 ? (
                <>
                  <div className="hand-scroll">
                    <div className="hand" role="group" aria-label={tr('handLabel')}>
                      {activeView.hand.map((card, index) => (
                        <PlayingCard
                          key={card.id}
                          card={card}
                          lang={lang}
                          level={activeView.levelRank}
                          index={index}
                          selected={selected.includes(card.id)}
                          hinted={hint?.cards.includes(card.id) ?? false}
                          disabled={!canAct}
                          onClick={() => toggleCard(card.id)}
                        />
                      ))}
                    </div>
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
                      ? `${t(lang, 'selectedCount', { n: selected.length })} · ${selectionLabel(
                          activeView,
                          selectedCards,
                          lang,
                        )}`
                      : tr('chooseCards')}
                    {problem && <span className="selection-problem">{problem}</span>}
                    {hint && (
                      <span className="hint-reason">{t(lang, HINT_KEYS[hint.kind])}</span>
                    )}
                    {hint?.combo && !problem && selected.length === 0 && (
                      <span className="hint-chip">{comboLabel(lang, hint.combo)}</span>
                    )}
                  </div>
                </>
              ) : handVisible ? (
                <div className="out-message">
                  <span className="out-mark">✦</span>
                  <strong>{t(lang, 'waitingFor', { name: currentName })}</strong>
                </div>
              ) : (
                <PrivacyGate
                  name={viewerName}
                  partner={nameAt(partnerOf(viewerSeat))}
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
              <span>{tr('round')}</span>
              <strong>{activeView.round}</strong>
            </div>
            <div className="side-stat">
              <span>{tr('currentLevel')}</span>
              <strong className="level-inline">{rankLabel(activeView.levelRank)}</strong>
            </div>
            <div className="side-stat">
              <span>{tr('matchTarget')}</span>
              <strong>{rankLabel(14)}</strong>
            </div>
            <LevelLadder levels={activeView.levels} current={activeView.levelRank} lang={lang} />
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
                  ? t(lang, 'lanReady')
                  : tr('lanWaiting')}
              </p>
              <div className="mini-seats">
                {Array.from({ length: 3 }, (_, index) => {
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
              <p className="peer">
                {guestPlayers.find((player) => player.seat === guest?.seat)?.name ??
                  t(lang, 'lanGuestSeat')}
              </p>
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('viewRecord')}</h3>
            <p>
              {t(lang, 'rounds')} {record.rounds} · {t(lang, 'titles')} {record.titles[0] + record.titles[1]}
            </p>
            <p className="record-mini-note">
              {t(lang, 'teamNS')} {record.roundWins[0]} · {t(lang, 'teamEW')} {record.roundWins[1]}
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
            <p>{tr('controlsTap')}</p>
          </div>
        </aside>
      </div>
      {toast && (
        <div className="toast" role="status">{toast}</div>
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
              <div className="lan-toggle-row">
                <span>{tr('lanTable')}</span>
                <strong>{tr('fourSeats')}</strong>
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
              <h3>{tr('lanGuest')}</h3>
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
                    { length: Math.max(0, 4 - lanPlayers.filter((player) => player.connected).length) },
                    (_, index) => (
                      <span key={`empty-${index}`} className="peer-chip">
                        <span className="peer-mark">·</span>
                        <span className="peer-name">{tr('lanOpenSeat')}</span>
                        <small>{tr('lanAiFill')}</small>
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
                  {tr('lanCopy')}
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
          <h2 className="screen-title">{guest ? tr('lanConnected') : tr('lanTitle')}</h2>
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
                <span className="orbit-card">♥</span>
              </div>
              <span className="status-pill ready">{tr('lanConnected')}</span>
              <h3>{tr('lanWaitingHost')}</h3>
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
            <div className="stat-card">
              <span>{tr('matches')}</span>
              <strong>{record.matches}</strong>
            </div>
            <div className="stat-card team-ns">
              <span>{t(lang, 'teamNS')}</span>
              <strong>{record.roundWins[0]}</strong>
              <small>{t(lang, 'titles')} {record.titles[0]}</small>
            </div>
            <div className="stat-card team-ew">
              <span>{t(lang, 'teamEW')}</span>
              <strong>{record.roundWins[1]}</strong>
              <small>{t(lang, 'titles')} {record.titles[1]}</small>
            </div>
          </section>

          <section className="record-grid">
            <div className="record-card">
              <h3>{tr('roundWins')}</h3>
              <div className="tally-list">
                <div className="tally-row">
                  <span>{t(lang, 'teamNS')}</span>
                  <span className="tally-bar"><i style={{ width: `${(record.roundWins[0] / record.rounds) * 100}%` }} /></span>
                  <strong>{record.roundWins[0]}</strong>
                </div>
                <div className="tally-row">
                  <span>{t(lang, 'teamEW')}</span>
                  <span className="tally-bar ew"><i style={{ width: `${(record.roundWins[1] / record.rounds) * 100}%` }} /></span>
                  <strong>{record.roundWins[1]}</strong>
                </div>
              </div>
              <p className="record-mini-note">
                {t(lang, 'teamNS')} {rankLabel(record.best[0])} · {t(lang, 'teamEW')} {rankLabel(record.best[1])}
              </p>
            </div>

            <div className="record-card">
              <h3>{tr('byMode')}</h3>
              <div className="tally-list">
                <div className="tally-row">
                  <span>{tr('modeAi')}</span>
                  <span className="tally-bar"><i style={{ width: `${(record.byMode.ai / record.rounds) * 100}%` }} /></span>
                  <strong>{record.byMode.ai}</strong>
                </div>
                <div className="tally-row">
                  <span>{tr('modeLocal')}</span>
                  <span className="tally-bar"><i style={{ width: `${(record.byMode.local / record.rounds) * 100}%` }} /></span>
                  <strong>{record.byMode.local}</strong>
                </div>
                <div className="tally-row">
                  <span>{tr('modeLan')}</span>
                  <span className="tally-bar"><i style={{ width: `${(record.byMode.lan / record.rounds) * 100}%` }} /></span>
                  <strong>{record.byMode.lan}</strong>
                </div>
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
            <h3>{tr('recentRounds')}</h3>
            {record.recent.length === 0 ? (
              <p className="recent-empty">{tr('recentEmpty')}</p>
            ) : (
              <ol className="recent-list">
                {record.recent.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="recent-row">
                    <span className={`recent-mark team-${entry.winnerTeam}`} aria-hidden="true">♥</span>
                    <div className="recent-main">
                      <strong>
                        {t(lang, 'recordWinner', {
                          team: teamName(lang, entry.winnerTeam),
                          gain: entry.gain,
                        })}
                      </strong>
                      <span>
                        {entry.mode === 'ai'
                          ? tr('modeAi')
                          : entry.mode === 'local'
                            ? tr('modeLocal')
                            : tr('modeLan')}
                        {entry.level ? ` · ${t(lang, entry.level)}` : ''} ·{' '}
                        {entry.levels.map((value) => rankLabel(value)).join(' / ')}
                        {entry.matchOver ? ` · ${t(lang, 'matchWon')}` : ''}
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
        <li>{tr('rulesDeck1')} {tr('rulesDeck2')}</li>
        <li>{tr('rulesDeck3')}</li>
        <li>{tr('rulesTrick1')}</li>
        <li>{tr('rulesTrick2')}</li>
        <li>{tr('rulesTrick3')}</li>
        <li>{tr('rulesLevel1')} {tr('rulesLevel2')}</li>
        <li>{tr('rulesLevel3')}</li>
        <li>{tr('rulesTribute1')} {tr('rulesTribute2')} {tr('rulesTribute3')}</li>
      </ol>

      <section className="rules-extra">
        <h3>{tr('rulesComboTitle')}</h3>
        <div className="combo-grid">
          {(
            [
              ['combSingle', 'single'],
              ['combPair', 'pair'],
              ['combTriple', 'triple'],
              ['combFullHouse', 'full'],
              ['combStraight', 'straight'],
              ['combPairChain', 'pairs'],
              ['combTripleChain', 'triples'],
              ['combBomb', 'bomb'],
              ['combStraightFlush', 'flush'],
              ['combJokerBomb', 'joker'],
            ] as const
          ).map(([label, shape]) => (
            <div className={`combo-tile combo-${shape}`} key={label}>
              <span className="combo-icon" aria-hidden="true">
                {shape === 'single'
                  ? '1'
                  : shape === 'pair'
                    ? '2'
                    : shape === 'triple'
                      ? '3'
                      : shape === 'full'
                        ? '3+2'
                        : shape === 'straight'
                          ? '5'
                          : shape === 'pairs'
                            ? '2·2·2'
                            : shape === 'triples'
                              ? '3·3'
                              : shape === 'bomb'
                                ? '4+'
                                : shape === 'flush'
                                  ? '♥'
                                  : '★'}
              </span>
              <span>{tr(label)}</span>
            </div>
          ))}
        </div>

        <h3>{tr('rulesBombTitle')}</h3>
        <p className="rules-order">{tr('rulesBombOrder')}</p>
        <div className="bomb-line" aria-hidden="true">
          <span>4</span><span>5</span><span className="flush">♥</span><span>6</span><span>7</span><span>8</span><span className="joker">★</span>
        </div>

        <h3>{tr('rulesControlsTitle')}</h3>
        <p className="controls-line">{tr('rulesControls1')}</p>
        <p className="controls-line">{tr('rulesControls2')}</p>
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
