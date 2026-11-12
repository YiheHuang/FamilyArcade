import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseAiAction, chooseTributeReturn, fallbackAction, type AiLevel } from './ai/ai';
import { hintFor, type HintKind } from './ai/hint';
import { PlayerSeat, PlayingCard, PrivacyGate, comboName } from './components/Table';
import {
  applySeat,
  beginRound,
  canBeat,
  detectCombo,
  nextRound,
  setup,
  view,
  type Card,
  type Combo,
  type GameState,
  type SeatView,
} from './game/zheng-shangyou';
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

const HINT_KEYS: Record<HintKind, MessageKey> = {
  goOut: 'hintGoOut',
  control: 'hintControl',
  save: 'hintSave',
  lead: 'hintLead',
  clubs: 'hintClubs',
  low: 'hintLow',
  beat: 'hintBeat',
  pass: 'hintPass',
  tribute: 'hintTribute',
};

const AI_NAMES: Record<Lang, string[]> = {
  en: ['Ada', 'Bo', 'Cyd', 'Dee', 'Eli', 'Fen'],
  zh: ['阿达', '小博', '小茜', '小迪', '小伊', '小芬'],
};

const HERO_CARDS: Card[] = [
  { id: 'H14', rank: 14, suit: 'hearts' },
  { id: 'S13', rank: 13, suit: 'spades' },
  { id: 'D12', rank: 12, suit: 'diamonds' },
  { id: 'C3', rank: 3, suit: 'clubs' },
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
  const combo = detectCombo(cards);
  if (!combo) return t(lang, 'chooseCards');
  if (!activeView.trick && activeView.mustLeadClubs && !cards.some((card) => card.id === 'C3')) {
    return t(lang, 'leadClubs');
  }
  if (activeView.trick && !canBeat(combo, activeView.trick.combo)) {
    return t(lang, 'mustBeat', { combo: comboName(lang, activeView.trick.combo) });
  }
  return '';
}

function tallyRows(tally: Record<string, number>): [string, number][] {
  return Object.entries(tally)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6);
}

function pointRows(tally: Record<string, number>): [string, number][] {
  return Object.entries(tally)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6);
}

function comboFromLast(last: { type?: string; rank?: number; count?: number }): Combo | null {
  if (!last.type || !last.rank || !last.count) return null;
  return {
    type: last.type as Combo['type'],
    rank: last.rank,
    length: last.count,
    cards: [],
  };
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (invite ? 'lan-guest' : 'ai'));
  const [setupMode, setSetupMode] = useState<'ai' | 'local'>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [playerCount, setPlayerCount] = useState(4);
  const [tributeEnabled, setTributeEnabled] = useState(true);
  const [state, setState] = useState<GameState>(() => setup(4, Math.random, true));
  const [names, setNames] = useState<string[]>(() => ['@you', '@ai1', '@ai2', '@ai3']);
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [hint, setHint] = useState<HintState | null>(null);
  const [revealedSeat, setRevealedSeat] = useState<number | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.zheng-shangyou.sound') !== 'off';
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
      return localStorage.getItem('familyarcade.zheng-shangyou.hostName') ?? '';
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
  const handRef = useRef<HTMLDivElement | null>(null);
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
      localStorage.setItem('familyarcade.zheng-shangyou.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.zheng-shangyou.hostName', hostName);
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
    if (mode === 'local') setRevealedSeat(null);
    else if (mode === 'ai' || mode === 'lan-host') setRevealedSeat(0);
  }, [state.turn, state.round, state.phase, mode]);

  useEffect(() => {
    if (!guestView) return;
    setSelected([]);
    setHint(null);
  }, [guestView?.turn, guestView?.round, guestView?.phase, guestView]);

  useEffect(() => {
    const id = selected[selected.length - 1] ?? hint?.cards[0];
    const hand = handRef.current;
    if (!id || !hand) return;
    const target = hand.querySelector(`[data-card="${id}"]`) as HTMLElement | null;
    if (!target) return;
    const handBox = hand.getBoundingClientRect();
    const cardBox = target.getBoundingClientRect();
    if (cardBox.left < handBox.left + 4 || cardBox.right > handBox.right - 4) {
      hand.scrollLeft += cardBox.left - handBox.left - (hand.clientWidth - cardBox.width) / 2;
    }
  }, [selected, hint]);

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
  const guestOnline = mode !== 'lan-guest' ? true : guestStarted;
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
  const canTribute =
    activeView.canTribute &&
    hostOnline &&
    guestOnline &&
    (mode !== 'local' || handVisible);
  const canHint =
    (mode === 'ai' || mode === 'local') &&
    (activeView.phase === 'playing' || activeView.phase === 'tribute') &&
    activeView.isTurn &&
    handVisible &&
    (mode !== 'ai' || state.turn === 0);
  const canUndo =
    (mode === 'ai' || mode === 'local') &&
    activeView.phase !== 'round-over' &&
    history.length > 0 &&
    handVisible &&
    (mode !== 'ai' || history.some((item) =>
      (item.phase === 'playing' || item.phase === 'tribute') && item.turn === 0));
  const allTributeReturned =
    activeView.phase === 'tribute' &&
    Boolean(activeView.tribute) &&
    activeView.tribute!.pairs.every((pair) => pair.returned !== null);
  const pendingTribute = activeView.tribute?.pairs.find((pair) => pair.returned === null) ?? null;
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
        else if (next.phase === 'tribute') chime('deal');
        else if (next.last?.kind === 'pass') chime('pass');
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
        /* already closed */
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
      const next = setup(playerCount, Math.random, tributeEnabled);
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
      setSaved(
        saveGame({
          state: next,
          mode: nextMode,
          level,
          names: nextNames,
        }),
      );
    },
    [level, playerCount, tributeEnabled],
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
    setTributeEnabled(next.tributeEnabled);
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
    setSaved(saved);
  }, [saved]);

  const undo = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') return;
    if (state.phase === 'round-over') return;
    if (history.length === 0) return;
    let index = history.length - 1;
    if (mode === 'ai') {
      while (
        index >= 0 &&
        !((history[index].phase === 'playing' || history[index].phase === 'tribute') &&
          history[index].turn === 0)
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
      if (!handVisible) return;
      if (activeView.phase === 'tribute') {
        if (!canTribute) return;
        setSelected(selected.includes(id) ? [] : [id]);
        return;
      }
      if (!canAct) return;
      const card = activeView.hand.find((item) => item.id === id);
      if (!card) return;
      setSelected((items) =>
        items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
      );
    },
    [activeView.hand, activeView.phase, canAct, canTribute, handVisible, selected],
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

  const returnSelected = useCallback(() => {
    if (!canTribute || selected.length !== 1) return;
    const card = selected[0];
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'tribute', card, actions: activeView.actions });
      setSelected([]);
      setHint(null);
      return;
    }
    const seat = mode === 'local' ? state.turn : 0;
    const result = applySeat(state, seat, { type: 'tribute', card });
    if (!result.ok) return;
    commit(result.state, mode, state);
  }, [activeView.actions, canTribute, commit, guest, mode, selected, state]);

  const startTrick = useCallback(() => {
    if (mode === 'lan-guest' || state.phase !== 'tribute') return;
    const next = beginRound(state);
    if (next === state) return;
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
    if (soundOn) chime('deal');
  }, [level, mode, sendViews, soundOn, state]);

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
      setSaved(saveGame({ state: next, mode, level, names: namesRef.current }));
    } else {
      sendViews(next, namesRef.current);
    }
    if (soundOn) chime('deal');
  }, [level, mode, sendViews, soundOn, state]);

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
    if (screen !== 'game' || (state.phase !== 'playing' && state.phase !== 'tribute')) {
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
      if (current.turn !== state.turn || current.phase !== state.phase) return;
      if (current.phase === 'tribute') {
        const card = chooseTributeReturn(current, current.turn, level, Math.random);
        setAiThinking(false);
        if (!card) return;
        const result = applySeat(current, current.turn, { type: 'tribute', card: card.id });
        if (result.ok) commit(result.state, mode, current);
        return;
      }
      const action = chooseAiAction(current, current.turn, level, Math.random);
      setAiThinking(false);
      if (!action) return;
      const result = applySeat(current, current.turn, action);
      if (result.ok) commit(result.state, mode, current);
    }, state.phase === 'tribute' ? 360 : 480);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, lanHost?.status, level, mode, names, screen, state]);

  // A dropped guest should not freeze the table.
  useEffect(() => {
    if (screen !== 'game' || mode !== 'lan-host') return;
    if (state.phase !== 'playing' && state.phase !== 'tribute') return;
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

  // Keyboard path: buttons remain tabbable; P/U/H/Enter are shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        Boolean(target?.isContentEditable);
      const buttonTarget = target?.tagName === 'BUTTON';
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
      } else if (event.key === 'Enter') {
        if (buttonTarget) return;
        event.preventDefault();
        if (activeView.phase === 'tribute') returnSelected();
        else playSelected();
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        setSelected([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeView.phase, doPass, goHome, playSelected, returnSelected, screen, showHint, undo]);

  // Guest sound follows the authoritative action count.
  useEffect(() => {
    if (!guestView) {
      lastGuestActionsRef.current = -1;
      return;
    }
    const previous = lastGuestActionsRef.current;
    lastGuestActionsRef.current = guestView.actions;
    if (previous < 0 || guestView.actions <= previous || !soundOn) return;
    if (guestView.phase === 'round-over') chime('win');
    else if (guestView.phase === 'tribute') chime('deal');
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
        const value = intent as { type?: string; cards?: unknown; card?: unknown; actions?: number } | null;
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
        } else if (value.type === 'tribute' && typeof value.card === 'string') {
          const result = applySeat(current, seat, { type: 'tribute', card: value.card });
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
        color: { dark: '#234a3c', light: '#fffaf0' },
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
    const next = setup(tableSize, Math.random, tributeEnabled);
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
  }, [connectedGuests.length, hostName, lang, lanPlayers, lanTableSize, tributeEnabled]);

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
      setToast(tr('lanCopyFailed'));
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
        /* tab going away */
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

  const tableLine = `${t(lang, 'round', { n: activeView.round })} · ${t(lang, 'playerCountShort', {
    n: activeView.playerCount,
  })}`;

  const statusHeadline = (() => {
    if (activeView.phase === 'round-over') return t(lang, 'gameOver');
    if (activeView.phase === 'tribute') return t(lang, 'tributeTitle');
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
    return t(lang, 'turnOf', { name: currentName });
  })();

  const statusDetail = (() => {
    if (activeView.phase === 'tribute') {
      if (activeView.canTribute) return t(lang, 'chooseReturn');
      if (pendingTribute) return t(lang, 'tributeWaiting', { name: nameAt(pendingTribute.to) });
      return t(lang, 'tributeDone');
    }
    if (activeView.phase === 'round-over') return t(lang, 'finishOrder');
    if (activeView.finished) return t(lang, 'waitingFor', { name: currentName });
    if (activeView.canPlay) {
      if (activeView.mustLeadClubs) return t(lang, 'leadClubs');
      if (activeView.trick) {
        return t(lang, 'mustBeat', { combo: comboName(lang, activeView.trick.combo) });
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
      const combo = comboFromLast(activeView.last);
      if (combo) return comboName(lang, combo);
    }
    return '';
  };

  const order = activeView.order ?? [];
  const upstreamSeat = order[0] ?? 0;
  const downstreamSeat = order[order.length - 1] ?? 0;
  const statsTop = tallyRows(record.finishes);
  const statsPoints = pointRows(record.points);
  const lastWinnerLabel = record.lastWinner ? displayName(record.lastWinner, lang) : t(lang, 'none');
  const modeLabelFor = (value: RecordMode) =>
    value === 'ai' ? t(lang, 'modeAi') : value === 'local' ? t(lang, 'modeLocal') : t(lang, 'modeLan');

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
            <span className="hero-chip">3♣</span>
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
                  {t(lang, 'round', { n: saved.state.round })}
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
            <span>{tr('lastWinner')}</span>
            <strong className="strip-name">{lastWinnerLabel}</strong>
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
          <h3>{tr('tribute')}</h3>
          <button
            className={`toggle ${tributeEnabled ? 'on' : ''}`}
            onClick={() => setTributeEnabled((value) => !value)}
            aria-pressed={tributeEnabled}
          >
            <span />
            {tributeEnabled ? tr('tributeOn') : tr('tributeOff')}
          </button>
        </div>
        <p className="note">{tr('tributeNote')}</p>
      </section>

      <div className="row-actions">
        <button className="primary" onClick={() => startLocal(setupMode)}>
          {tr('deal')}
        </button>
        <button className="ghost" onClick={goHome}>
          {tr('back')}
        </button>
      </div>
    </main>
  );

  const trickPanel = activeView.phase === 'tribute' && activeView.tribute ? (
    <section className="tribute-panel" aria-live="polite">
      <span className="result-kicker">{t(lang, 'round', { n: activeView.round })}</span>
      <h3>{tr('tributeTitle')}</h3>
      <ul className="tribute-list">
        {activeView.tribute.pairs.map((pair) => (
          <li key={`${pair.from}-${pair.to}`} className={pair.returned ? 'done' : 'pending'}>
            <span className="tribute-route">
              {t(lang, 'tributeFrom', { from: nameAt(pair.from), to: nameAt(pair.to) })}
            </span>
            <span className="tribute-cards">
              <span className="tribute-card">
                <small>{tr('given')}</small>
                <PlayingCard card={pair.given} lang={lang} compact />
              </span>
              {pair.returned ? (
                <span className="tribute-card">
                  <small>{tr('returned')}</small>
                  <PlayingCard card={pair.returned} lang={lang} compact />
                </span>
              ) : (
                <span className="tribute-wait">{tr('awaitingReturn')}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {activeView.canTribute && <p className="tribute-prompt">{tr('chooseReturn')}</p>}
      {!activeView.canTribute && pendingTribute && (
        <p className="tribute-prompt">
          {t(lang, 'tributeWaiting', { name: nameAt(pendingTribute.to) })}
        </p>
      )}
      {allTributeReturned && activeView.canPlay === false && (
        <p className="privacy-note">{tr('tributeDone')}</p>
      )}
      {allTributeReturned && mode !== 'lan-guest' && (
        <button className="primary start-tribute-button" onClick={startTrick}>
          {tr('startAfterTribute')}
        </button>
      )}
      {allTributeReturned && mode === 'lan-guest' && (
        <span className="wait-pill">{tr('waitHostNext')}</span>
      )}
    </section>
  ) : activeView.phase === 'round-over' ? (
    <section className="trick-area round-over-center" aria-live="polite">
      <span className="result-kicker">{tr('gameOver')}</span>
      <p className="trick-copy">{tr('finishOrder')}</p>
    </section>
  ) : (
    <section className={`trick-area ${activeView.trick ? 'has-trick' : ''}`} aria-live="polite">
      {activeView.trick ? (
        <>
          <div className="trick-head">
            <span className="result-kicker">{tr('currentTrick')}</span>
            <strong>{comboName(lang, activeView.trick.combo)}</strong>
            <span className="trick-owner">{nameAt(activeView.trick.seat)}</span>
          </div>
          <div className="trick-cards">
            {activeView.trick.combo.cards.map((card) => (
              <PlayingCard key={card.id} card={card} lang={lang} compact />
            ))}
          </div>
          <p className="trick-copy">
            {t(lang, 'lastPlay', {
              name: nameAt(activeView.trick.seat),
              play: comboName(lang, activeView.trick.combo),
            })}
          </p>
        </>
      ) : (
        <>
          <span className="result-kicker">{tr('newTrick')}</span>
          <p className="trick-copy">
            {activeView.mustLeadClubs ? tr('leadClubs') : tr('leadAny')}
          </p>
        </>
      )}
      <div className={`pass-meter ${activeView.passes > 0 ? 'warm' : ''}`}>
        <span className="pass-pips" aria-hidden="true">
          <i className={activeView.passes >= 1 ? 'on' : ''} />
          <i className={activeView.passes >= 2 ? 'on' : ''} />
        </span>
        {activeView.trick ? (
          <span>{t(lang, 'twoPasses')}</span>
        ) : (
          <span>{tr('leadAny')}</span>
        )}
      </div>
    </section>
  );

  const selectedLabel = (() => {
    if (selected.length === 0) return '';
    const combo = detectCombo(shownCards);
    if (combo) return comboName(lang, combo);
    return t(lang, 'selectedCount', { n: selected.length });
  })();

  const playBar = (
    <div className="play-bar">
      <div className="selection-line">
        <span className="selection-count">
          {selected.length > 0 ? t(lang, 'selectedCount', { n: selected.length }) : tr('comboTitle')}
        </span>
        <span className={`selection-combo ${problem ? 'bad' : selected.length > 0 ? 'good' : ''}`}>
          {problem || selectedLabel || tr('equalOrHigher')}
        </span>
      </div>
      <div className="play-actions">
        {activeView.phase === 'tribute' && activeView.canTribute ? (
          <button
            className="primary play-button return-button"
            onClick={returnSelected}
            disabled={selected.length !== 1 || !canTribute}
          >
            {tr('returnCard')}
          </button>
        ) : (
          <button className="primary play-button" onClick={playSelected} disabled={!canSubmit}>
            {tr('play')}
          </button>
        )}
        <button className="secondary pass-button" onClick={doPass} disabled={!canAct || !activeView.canPass}>
          {tr('pass')}
        </button>
        <button className="secondary hint-button" onClick={showHint} disabled={!canHint}>
          {tr('hint')}
        </button>
        <button className="secondary undo-button" onClick={undo} disabled={!canUndo}>
          {tr('undo')}
        </button>
        <button className="ghost clear-button" onClick={() => setSelected([])} disabled={selected.length === 0}>
          {tr('clear')}
        </button>
      </div>
    </div>
  );

  const resultPanel = activeView.phase === 'round-over' ? (
    <section className="result-panel" aria-live="polite">
      <span className="result-kicker">{tr('wonRound')}</span>
      <div className="podium">
        <div className="podium-card upstream">
          <span>{tr('winner')}</span>
          <strong>{nameAt(upstreamSeat)}</strong>
          <small className="points-positive">
            +{activeView.roundPoints[upstreamSeat] ?? 0}
          </small>
        </div>
        <div className="podium-card downstream">
          <span>{tr('loser')}</span>
          <strong>{nameAt(downstreamSeat)}</strong>
          <small className="points-negative">
            {activeView.roundPoints[downstreamSeat] ?? 0}
          </small>
        </div>
      </div>
      <h3>{tr('finishOrder')}</h3>
      <ol className="ranking-list">
        {order.map((seat, index) => (
          <li key={`${seat}-${index}`} className={seat === viewerSeat ? 'is-you' : ''}>
            <span className="place">{index + 1}</span>
            <span className="ranking-name">{nameAt(seat)}</span>
            <span className={`ranking-points ${(activeView.roundPoints[seat] ?? 0) >= 0 ? 'up' : 'down'}`}>
              {(activeView.roundPoints[seat] ?? 0) > 0 ? '+' : ''}
              {activeView.roundPoints[seat] ?? 0}
            </span>
            <span className="ranking-count">
              {t(lang, 'scoreLineShort', { n: activeView.scores[seat] ?? 0 })}
            </span>
          </li>
        ))}
      </ol>
      <p className="privacy-note">
        {tr('scored')}: {order.map((seat) => `${nameAt(seat)} ${activeView.roundPoints[seat] ?? 0}`).join(' · ')}
      </p>
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
            {modeLabel} · {t(lang, 'round', { n: activeView.round })}
          </span>
        </div>
        <div className="game-actions">
          <button
            className="icon-button"
            onClick={() => setSoundOn((value) => !value)}
            aria-pressed={soundOn}
            aria-label={soundOn ? tr('soundOn') : tr('soundOff')}
          >
            {soundOn ? '♪' : '♪̸'}
          </button>
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
        </div>
      </header>

      <div className="same-room">{tableLine}</div>

      <div className="game-layout">
        <section className="table-wrap">
          <div className="status-strip">
            <span className={`turn-chip ${activeView.phase}`} aria-hidden="true">
              {activeView.phase === 'round-over' ? '★' : activeView.phase === 'tribute' ? '⇄' : '♣'}
            </span>
            <div>
              <strong>{statusHeadline}</strong>
              <p>{statusDetail}</p>
            </div>
            {shownThinking && <span className="thinking">…</span>}
          </div>

          <div className="felt">
            <div className="seats" aria-label={tr('boardLabel')}>
              {Array.from({ length: activeView.playerCount }, (_, seat) => (
                <PlayerSeat
                  key={seat}
                  name={nameAt(seat)}
                  seat={seat}
                  count={activeView.handCounts[seat] ?? 0}
                  turn={activeView.turn === seat && (activeView.phase === 'playing' || activeView.phase === 'tribute')}
                  finished={activeView.finish.includes(seat)}
                  place={activeView.finish.indexOf(seat) >= 0 ? activeView.finish.indexOf(seat) + 1 : null}
                  lastText={lastTextFor(seat)}
                  isYou={seat === viewerSeat}
                  thinking={seatThinking(seat)}
                  score={activeView.scores[seat] ?? 0}
                  lang={lang}
                />
              ))}
            </div>

            <div className={`table-center ${activeView.phase === 'round-over' ? 'round-over' : ''}`}>{trickPanel}</div>

            {activeView.phase !== 'round-over' && (
              <>
                <div className="hand-zone">
                  {!handVisible ? (
                    <PrivacyGate name={viewerName} lang={lang} onReveal={() => setRevealedSeat(viewerSeat)} />
                  ) : (
                    <>
                      <div className="hand-head">
                        <span>{tr('handLabel')}</span>
                        <span className="hand-name">{viewerName}</span>
                      </div>
                      <div className="hand" ref={handRef} aria-label={tr('handLabel')} data-hand-count={activeView.hand.length}>
                        <div className="hand-track">
                          {activeView.hand.map((card, index) => (
                            <PlayingCard
                              key={card.id}
                              card={card}
                              lang={lang}
                              index={index}
                              selected={selected.includes(card.id)}
                              hinted={Boolean(hint?.cards.includes(card.id))}
                              disabled={(!canAct && !canTribute) || (activeView.phase === 'tribute' && !canTribute)}
                              onClick={() => toggleCard(card.id)}
                            />
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {playBar}
              </>
            )}
          </div>
          {resultPanel}
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{tr('table')}</h3>
            <p>{tableLine}</p>
            {activeView.trick && (
              <p className="side-note">
                {t(lang, 'trickLead', { name: nameAt(activeView.trick.seat) })}
              </p>
            )}
            {activeView.tributeEnabled && <p className="side-note">{tr('tributesLine')}</p>}
          </div>
          <div className="side-card">
            <h3>{tr('controlsTitle')}</h3>
            <p>{tr('keyboardHint')}</p>
            <p className="side-note">{mode === 'lan-host' || mode === 'lan-guest' ? tr('localOnly') : tr('controlsTap')}</p>
          </div>
          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <h3>{tr('lanCode')}</h3>
              <div className="room-code">{lanCode}</div>
              <p>{connectedGuests.length > 0 ? tr('lanReady') : tr('lanWaiting')}</p>
              <div className="peer-list">
                {lanPlayers.slice(0, activeView.playerCount).map((player) => (
                  <span key={player.seat} className={`peer-chip ${player.connected ? 'online' : ''}`}>
                    {player.seat + 1}. {player.name} {player.connected ? '●' : '○'}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="side-card record-mini">
            <h3>{tr('record')}</h3>
            <p>
              {record.rounds} {tr('rounds')} · {record.lastWinner ? displayName(record.lastWinner, lang) : tr('none')}
            </p>
            <button className="text-button" onClick={() => { setClearArmed(false); setScreen('stats'); }}>
              {tr('viewRecord')} →
            </button>
          </div>
        </aside>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  const statsScreen = (
    <main className="shell narrow-shell stats-shell">
      <button className="back" onClick={goHome}>
        ← {tr('home')}
      </button>
      <h2 className="screen-title">{tr('recordTitle')}</h2>
      {record.rounds === 0 ? (
        <p className="empty-copy">{tr('recordEmpty')}</p>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card total">
              <span>{tr('rounds')}</span>
              <strong>{record.rounds}</strong>
            </div>
            <div className="stat-card">
              <span>{tr('lastWinner')}</span>
              <strong>{lastWinnerLabel}</strong>
            </div>
            <div className="stat-card">
              <span>{tr('modeAi')}</span>
              <strong>{record.byMode.ai}</strong>
            </div>
            <div className="stat-card">
              <span>{tr('modeLocal')}</span>
              <strong>{record.byMode.local}</strong>
            </div>
          </div>
          <div className="record-grid">
            <section className="record-card">
              <h3>{tr('finishes')}</h3>
              <ol className="tally-list">
                {statsTop.map(([name, amount]) => (
                  <li key={name}>
                    <span>{displayName(name, lang)}</span>
                    <strong>{amount}</strong>
                  </li>
                ))}
              </ol>
            </section>
            <section className="record-card">
              <h3>{tr('points')}</h3>
              <ol className="tally-list">
                {statsPoints.map(([name, amount]) => (
                  <li key={name}>
                    <span>{displayName(name, lang)}</span>
                    <strong>{amount}</strong>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <section className="recent-card">
            <h3>{tr('recentRounds')}</h3>
            <div className="recent-list">
              {record.recent.map((entry, index) => (
                <div className="recent-row" key={`${entry.at}-${index}`}>
                  <span className="recent-date">{formatDate(entry.at, lang)}</span>
                  <span className="recent-mode">{modeLabelFor(entry.mode)}</span>
                  <span className="recent-order">
                    {entry.order.map((name, place) => `${place + 1}. ${displayName(name, lang)}`).join(' · ')}
                  </span>
                  <span className="recent-points">
                    {entry.points.map((point) => (point > 0 ? `+${point}` : String(point))).join(' / ')}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <div className="record-actions">
            <button className="secondary" onClick={resetRecord}>
              {clearArmed ? tr('clearYes') : tr('clearRecord')}
            </button>
            {clearArmed && (
              <button className="ghost" onClick={() => setClearArmed(false)}>
                {tr('clearKeep')}
              </button>
            )}
            <span className="note">{clearArmed ? tr('clearConfirm') : tr('recordNote')}</span>
          </div>
        </>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
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
        <li>{tr('rule9')}</li>
        <li>{tr('rule10')}</li>
      </ol>
      <div className="rules-extra">
        <section>
          <h3>{tr('controlsTitle')}</h3>
          <p>{tr('controlsKeys')}</p>
          <p>{tr('controlsTap')}</p>
        </section>
        <section>
          <h3>{tr('scoringTitle')}</h3>
          <p>{tr('scoringLine')}</p>
        </section>
        <section>
          <h3>{tr('tributesTitle')}</h3>
          <p>{tr('tributesLine')}</p>
        </section>
      </div>
      <button className="primary" onClick={goHome}>
        {tr('close')}
      </button>
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell lan-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
      {lanRole === 'hub' ? (
        <>
          <h2 className="screen-title">{tr('lanTitle')}</h2>
          <div className="lan-choice">
            <section className="lan-card">
              <h3>{tr('lanHost')}</h3>
              <label>
                <span>{tr('lanHostName')}</span>
                <input
                  value={hostName}
                  onChange={(event) => setHostName(event.target.value)}
                  placeholder={tr('lanHostNamePlaceholder')}
                  maxLength={18}
                />
              </label>
              <div className="lan-size">
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
              <button className="primary wide" onClick={openLanHost} disabled={lanBusy}>
                {lanBusy ? tr('lanStarting') : tr('lanCreate')}
              </button>
            </section>
            <section className="lan-card">
              <h3>{tr('lanJoin')}</h3>
              <label>
                <span>{tr('lanName')}</span>
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  maxLength={18}
                />
              </label>
              <label>
                <span>{tr('lanCode')}</span>
                <input
                  value={guestCode}
                  onChange={(event) => setGuestCode(event.target.value)}
                  inputMode="numeric"
                  maxLength={4}
                />
              </label>
              <button className="primary wide" onClick={joinGuest} disabled={guestConnecting || !guestName.trim()}>
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
            </section>
          </div>
          {lanError && <p className="error">{lanError}</p>}
        </>
      ) : lanRole === 'host' ? (
        <>
          <h2 className="screen-title">{tr('lanTitle')}</h2>
          {lanBusy && <p className="lede">{tr('lanStarting')}</p>}
          {lanError && <p className="error">{lanError}</p>}
          {lanInfo && lanInvite && (
            <div className="lan-layout">
              <div className="lan-card">
                <span className="label">{tr('lanCode')}</span>
                <div className="room-code big">{lanCode}</div>
                <p>{lanPlayers.filter((player) => player.connected).length > 1 ? tr('lanReady') : tr('lanWaiting')}</p>
                <div className="peer-list">
                  {lanPlayers.slice(0, lanTableSize).map((player) => (
                    <span key={player.seat} className={`peer-chip ${player.connected ? 'online' : ''}`}>
                      {player.name} {player.connected ? '●' : '○'}
                    </span>
                  ))}
                </div>
                <p className="note">{tr('lanAiFill')}</p>
                <button className="primary wide" onClick={startLan} disabled={connectedGuests.length === 0 || !lanHost}>
                  {tr('lanStart')}
                </button>
                <button className="secondary wide" onClick={copyInvite}>
                  {tr('lanCopyLink')}
                </button>
              </div>
              <div className="qr-card">
                {lanQr ? <img src={lanQr} alt={tr('lanScan')} /> : null}
                <p>{tr('lanScan')}</p>
                <a className="invite-link" href={lanInvite}>
                  {tr('lanOpenAddress')}
                </a>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <h2 className="screen-title">{tr('lanJoinTitle')}</h2>
          {!guestStarted && !guest ? (
            <div className="lan-card guest-card">
              <label>
                <span>{tr('lanName')}</span>
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  maxLength={18}
                />
              </label>
              <label>
                <span>{tr('lanCode')}</span>
                <input
                  value={guestCode}
                  onChange={(event) => setGuestCode(event.target.value)}
                  inputMode="numeric"
                  maxLength={4}
                />
              </label>
              <button className="primary wide" onClick={joinGuest} disabled={guestConnecting || !guestName.trim()}>
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
            </div>
          ) : (
            <section className="waiting-card">
              <span className="wait-dot" aria-hidden="true" />
              <strong>{guestRoom ? t(lang, 'lanRoom', { code: guestRoom }) : tr('lanJoinTitle')}</strong>
              <p>{guestStarted ? tr('lanGuestSeat') : tr('lanWaitingHost')}</p>
              <div className="peer-list">
                {guestPlayers.map((player) => (
                  <span key={player.seat} className={`peer-chip ${player.connected ? 'online' : ''}`}>
                    {player.name} {player.connected ? '●' : '○'}
                  </span>
                ))}
              </div>
            </section>
          )}
          {lanError && <p className="error">{lanError}</p>}
        </>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
