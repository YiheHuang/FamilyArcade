import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { runAiTurn, type AiLevel } from './ai/ai';
import { hintFor, type Hint } from './ai/hint';
import { CardBackRow, MeldGroup, PlayingCard } from './components/Cards';
import { demoState } from './demo';
import {
  analyzeMeld,
  applyAction,
  applySeatAction,
  cardValue,
  meldAcceptsCard,
  meldPoints,
  nextRound,
  setupGame,
  view,
  type ActionError,
  type Card,
  type GameAction,
  type GameState,
  type SeatView,
} from './game/rummy-500';
import { cardName, formatDate, meldLabel, seatName } from './format';
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
  recordResult,
  saveGame,
  type FamilyRecord,
  type RecordMode,
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'stats' | 'rules' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type SetupKind = 'ai' | 'local';
type LanRole = 'hub' | 'host' | 'guest';

const AI_LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const TARGET = 500;

function recordModeFor(mode: Mode): RecordMode {
  if (mode === 'ai') return 'ai';
  if (mode === 'lan-host' || mode === 'lan-guest') return 'lan';
  return 'local';
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

export default function App() {
  const [demo] = useState<GameState | null>(() => {
    const kind = new URLSearchParams(window.location.search).get('demo');
    return kind === 'mid' || kind === 'over' || kind === 'mobile' ? demoState(kind) : null;
  });
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() =>
    demo ? 'game' : invite ? 'lan' : 'home',
  );
  const [mode, setMode] = useState<Mode>(() => (demo ? 'ai' : invite ? 'lan-guest' : 'ai'));
  const [level, setLevel] = useState<AiLevel>('normal');
  const [setupKind, setSetupKind] = useState<SetupKind>('ai');
  const [playerCount, setPlayerCount] = useState(2);
  const [state, setState] = useState<GameState>(
    () => demo ?? setupGame(['', ''], Math.random, 1),
  );
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<Card[]>([]);
  const [hint, setHint] = useState<Hint | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.rummy-500.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [revealed, setRevealed] = useState<boolean>(() => Boolean(demo && demo.phase !== 'game-over'));
  const [clearArmed, setClearArmed] = useState(false);

  const [lanRole, setLanRole] = useState<LanRole>(() => (invite && !demo ? 'guest' : 'hub'));
  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [lanCount, setLanCount] = useState(2);
  const [hostName, setHostName] = useState(() => {
    try {
      return localStorage.getItem('familyarcade.rummy-500.hostName') ?? '';
    } catch {
      return '';
    }
  });
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => {
    const candidate = invite?.name?.trim();
    return candidate && candidate !== 'Guest' ? candidate : t(detectLang(), 'guest');
  });
  const [guestCode, setGuestCode] = useState(() => invite?.code || invite?.room || '');
  const [guestRoom, setGuestRoom] = useState(() => invite?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [guestPlayers, setGuestPlayers] = useState<LanPublicPeer[]>([]);
  const [autoJoin] = useState(() => Boolean(invite?.code));

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const lanPlayersRef = useRef<LanPublicPeer[]>([]);
  const hostStartedRef = useRef(false);
  const autoJoinRef = useRef(false);
  const lanActiveRef = useRef(false);
  const guestJoinSeqRef = useRef(0);
  const hostCreateSeqRef = useRef(0);
  const recordedRef = useRef(false);
  const localTurnKeyRef = useRef('');
  const lastGuestVersionRef = useRef(-1);
  const discardRef = useRef<HTMLDivElement | null>(null);

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? '五百分拉米 · 家庭游乐场' : 'Rummy 500 · Family Arcade';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
    setToast('');
    setHint(null);
    setLanError('');
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.rummy-500.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.rummy-500.hostName', hostName);
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

  const currentVersion = guestView?.version ?? state.version;
  useEffect(() => {
    setSelected([]);
    setHint(null);
  }, [currentVersion]);

  useEffect(() => {
    if (mode !== 'local' || screen !== 'game') return;
    const key = `${state.round}:${state.turn}`;
    if (localTurnKeyRef.current !== key) {
      localTurnKeyRef.current = key;
      setRevealed(false);
    }
  }, [mode, screen, state.round, state.turn]);

  const broadcastViews = useCallback((next: GameState) => {
    const host = hostRef.current;
    if (!host) return;
    for (let seat = 1; seat < next.players.length; seat += 1) {
      if (lanPlayersRef.current[seat]?.connected) {
        host.sendView(seat, view(next, seat));
      }
    }
    if (next.phase === 'game-over') host.sendResult({ kind: 'over' });
  }, []);

  const commit = useCallback(
    (next: GameState, previous: GameState) => {
      stateRef.current = next;
      setHistory((items) => [...items, previous]);
      setState(next);
      setSelected([]);
      setHint(null);
      setAiThinking(false);
      if (soundOn && (next.phase === 'draw' || next.phase === 'meld')) chime('place');
      broadcastViews(next);
    },
    [broadcastViews, soundOn],
  );

  const closeLan = useCallback(() => {
    hostStartedRef.current = false;
    autoJoinRef.current = true;
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
    lanPlayersRef.current = [];
    setLanPlayers([]);
    setLanInfo(null);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanBusy(false);
    setLanError('');
    const activeGuest = guest;
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    setGuestConnecting(false);
    setGuestPlayers([]);
    lanActiveRef.current = false;
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

  const openSetup = useCallback((kind: SetupKind) => {
    setSetupKind(kind);
    setPlayerCount(2);
    setScreen('setup');
  }, []);

  const startGame = useCallback((nextMode: 'ai' | 'local', count: number, nextLevel: AiLevel) => {
    const next = setupGame(
      Array.from({ length: count }, () => ''),
      Math.random,
      count - 1,
    );
    stateRef.current = next;
    recordedRef.current = false;
    localTurnKeyRef.current = '';
    setMode(nextMode);
    setLevel(nextLevel);
    setState(next);
    setHistory([]);
    setSelected([]);
    setHint(null);
    setAiThinking(false);
    setRevealed(nextMode !== 'local');
    setScreen('game');
    clearSave();
    setSaved(null);
  }, []);

  const beginGame = useCallback(() => {
    startGame(setupKind, playerCount, level);
  }, [level, playerCount, setupKind, startGame]);

  const resume = useCallback(() => {
    if (!saved) return;
    stateRef.current = saved.state;
    recordedRef.current = saved.state.phase === 'game-over';
    localTurnKeyRef.current = '';
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    setHistory([]);
    setSelected([]);
    setHint(null);
    setAiThinking(false);
    setRevealed(saved.mode !== 'local');
    setScreen('game');
  }, [saved]);

  const act = useCallback(
    (action: GameAction) => {
      if (mode === 'lan-guest') {
        if (!guest || !guestView?.canAct) return;
        guest.sendIntent({ action, version: guestView.version });
        return;
      }
      if (mode === 'local' && !revealed) return;
      const current = stateRef.current;
      if (mode === 'ai' && current.turn !== 0) return;
      if (mode === 'lan-host' && current.turn !== 0) return;
      const result =
        mode === 'lan-host'
          ? applySeatAction(current, 0, action)
          : applyAction(current, action);
      if (!result.ok) {
        const map: Partial<Record<ActionError, MessageKey>> = {
          'bad-meld': 'invalidMeld',
          'bad-layoff': 'invalidLayoff',
          'cannot-use-discard': 'cannotTake',
          'must-meld': 'phaseMeldMust',
          'not-in-hand': 'actionBlocked',
          'wrong-turn': 'actionBlocked',
          'wrong-phase': 'actionBlocked',
          'bad-index': 'actionBlocked',
          'game-over': 'actionBlocked',
          'round-over': 'actionBlocked',
          unknown: 'actionBlocked',
        };
        setToast(tr(map[result.error ?? 'unknown'] ?? 'actionBlocked'));
        return;
      }
      commit(result.state, current);
    },
    [commit, guest, guestView, mode, revealed, tr],
  );

  const toggleCard = useCallback(
    (card: Card) => {
      const hidden = mode === 'local' && !revealed;
      if (hidden) return;
      const canActNow =
        (guestView?.canAct ?? false) ||
        (mode !== 'lan-guest' && state.turn === (mode === 'local' ? state.turn : 0));
      if (!canActNow || (mode === 'ai' && aiThinking)) return;
      setHint(null);
      setSelected((items) =>
        items.includes(card) ? items.filter((item) => item !== card) : [...items, card],
      );
    },
    [aiThinking, guestView, mode, revealed, state.turn],
  );

  const drawStock = useCallback(() => {
    if (mode === 'local' && !revealed) return;
    if (guestView ? !guestView.canAct : !(state.turn === (mode === 'local' ? state.turn : 0))) {
      return;
    }
    act({ type: 'draw-stock' });
  }, [act, guestView, mode, revealed, state.turn]);

  const takeDiscard = useCallback(
    (index: number) => {
      if (mode === 'local' && !revealed) return;
      const canActNow = guestView ? guestView.canAct : state.turn === (mode === 'local' ? state.turn : 0);
      if (!canActNow) return;
      const takeable = guestView?.takeable ?? [];
      if (mode === 'lan-guest' && !takeable[index]) {
        setToast(tr('cannotTake'));
        return;
      }
      act({ type: 'take-discard', index });
    },
    [act, guestView, mode, revealed, state.turn, tr],
  );

  const isGuest = mode === 'lan-guest';
  const isLan = mode === 'lan-host' || mode === 'lan-guest';
  const localSeat = mode === 'local' ? state.turn : 0;
  const viewSeat = isGuest ? guestView?.seat ?? 0 : localSeat;
  const shownView: SeatView = useMemo(
    () => (isGuest && guestView ? guestView : view(state, viewSeat)),
    [guestView, isGuest, state, viewSeat],
  );
  const names = useMemo(() => shownView.players.map((player) => player.name), [shownView.players]);
  const labelFor = useCallback(
    (seat: number) =>
      seatName(names, seat, mode, shownView.seat, (key, params) => t(lang, key, params)),
    [lang, mode, names, shownView.seat],
  );
  const turnName = labelFor(shownView.turn);
  const winnerName = shownView.winner === null ? '' : labelFor(shownView.winner);
  const winnerScore =
    shownView.winner === null ? 0 : shownView.players[shownView.winner]?.score ?? 0;
  const phase = shownView.phase;
  const report = shownView.report;
  const hidden = mode === 'local' && !revealed;
  const canActNow = shownView.canAct && !hidden && !(mode === 'ai' && aiThinking);
  const canHintNow =
    !isLan &&
    (phase === 'draw' || phase === 'meld') &&
    !hidden &&
    !(mode === 'ai' && (aiThinking || state.turn !== 0));
  const canUndoNow =
    !isLan && history.length > 0 && (phase === 'draw' || phase === 'meld') && !hidden;
  const canDrawNow = canActNow && phase === 'draw';

  const selectedAnalysis = selected.length >= 3 ? analyzeMeld(selected) : null;
  const selectedPoints = selectedAnalysis
    ? selectedAnalysis.cards.reduce(
        (sum, card) =>
          sum + cardValue(card, selectedAnalysis.kind === 'run' && selectedAnalysis.aceLow),
        0,
      )
    : selected.reduce((sum, card) => sum + cardValue(card), 0);
  const canTryMeld = canActNow && phase === 'meld' && selected.length >= 3;
  const canDiscardNow =
    canActNow && phase === 'meld' && !shownView.mustMeld && selected.length === 1;

  const hintCardSet = useMemo(() => {
    if (!hint) return new Set<Card>();
    if (hint.action.type === 'meld') return new Set(hint.action.cards);
    if (hint.action.type === 'layoff' || hint.action.type === 'discard') {
      return new Set([hint.action.card]);
    }
    return new Set<Card>();
  }, [hint]);
  const hintDiscardIndex = hint?.action.type === 'take-discard' ? hint.action.index : null;
  const hintStock = hint?.kind === 'stock';
  const hintMeldId = hint?.meldId ?? null;

  useEffect(() => {
    const element = discardRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [shownView.discard.length, shownView.version]);

  const hintMessage = useCallback(
    (value: Hint): string => {
      const meldFor = (id?: number) => {
        const found = stateRef.current.melds.find((item) => item.id === id);
        return found ? meldLabel(found, lang) : '';
      };
      const cardsText = (cards?: Card[]) =>
        (cards ?? []).map((card) => cardName(card, lang)).join(lang === 'zh' ? '、' : ', ');
      switch (value.kind) {
        case 'meld':
          return t(lang, 'hintMeld', {
            cards: cardsText(value.cards),
            points: value.points ?? 0,
          });
        case 'layoff':
          return t(lang, 'hintLayoff', {
            card: cardName(value.card as Card, lang),
            meld: meldFor(value.meldId),
            points: value.points ?? 0,
          });
        case 'take':
          return t(lang, 'hintTake', { card: cardName(value.card as Card, lang) });
        case 'stock':
          return t(lang, 'hintStock');
        case 'must':
          return t(lang, 'hintMust', {
            card: value.action.type === 'meld' ? cardsText(value.cards) : cardName(value.card as Card, lang),
          });
        case 'discard':
          return t(lang, 'hintDiscard', { card: cardName(value.card as Card, lang) });
        default:
          return t(lang, 'hintDanger', { card: cardName(value.card as Card, lang) });
      }
    },
    [lang],
  );

  const showHint = useCallback(() => {
    if (!canHintNow) return;
    const next = hintFor(stateRef.current);
    if (!next) {
      setToast(tr('noHint'));
      return;
    }
    setHint(next);
    if (next.action.type === 'meld') setSelected(next.action.cards);
    else if (next.action.type === 'layoff' || next.action.type === 'discard') {
      setSelected([next.action.card]);
    } else {
      setSelected([]);
    }
    setToast(hintMessage(next));
  }, [canHintNow, hintMessage, tr]);

  const undo = useCallback(() => {
    if (!canUndoNow) return;
    if (mode === 'ai') {
      let index = -1;
      for (let cursor = history.length - 1; cursor >= 0; cursor -= 1) {
        const candidate = history[cursor];
        if (candidate.turn === 0 && candidate.phase === 'draw') {
          index = cursor;
          break;
        }
      }
      if (index < 0) {
        if (stateRef.current.phase === 'meld' && history.length > 0) {
          index = history.length - 1;
        } else {
          return;
        }
      }
      const previous = history[index];      stateRef.current = previous;
      setHistory(history.slice(0, index));
      setState(previous);
      setSelected([]);
      setHint(null);
      setAiThinking(false);
      setRevealed(true);
      return;
    }
    const previous = history[history.length - 1];
    stateRef.current = previous;
    setHistory(history.slice(0, -1));
    setState(previous);
    setSelected([]);
    setHint(null);
    setRevealed(false);
    localTurnKeyRef.current = '';
  }, [canUndoNow, history, mode]);

  const meldSelected = useCallback(() => {
    if (!canActNow || phase !== 'meld') return;
    if (selected.length < 3 || !selectedAnalysis) {
      setToast(tr('invalidMeld'));
      return;
    }
    act({ type: 'meld', cards: selected.slice() });
  }, [act, canActNow, phase, selected, selectedAnalysis, tr]);

  const discardSelected = useCallback(() => {
    if (!canActNow || phase !== 'meld' || selected.length !== 1) return;
    if (shownView.mustMeld) {
      setToast(tr('phaseMeldMust'));
      return;
    }
    act({ type: 'discard', card: selected[0] });
  }, [act, canActNow, phase, selected, shownView.mustMeld, tr]);

  const tryLayoff = useCallback(
    (meldId: number) => {
      if (!canActNow || phase !== 'meld' || selected.length !== 1) return;
      const meld = shownView.melds.find((item) => item.id === meldId);
      if (!meld || !meldAcceptsCard(meld, selected[0])) {
        setToast(tr('invalidLayoff'));
        return;
      }
      act({ type: 'layoff', card: selected[0], meldId });
    },
    [act, canActNow, phase, selected, shownView.melds, tr],
  );

  const playAgain = useCallback(() => {
    if (isGuest) return;
    if (mode === 'lan-host') {
      const host = hostRef.current;
      if (!host) return;
      const current = stateRef.current;
      const next = setupGame(
        current.players.map((player) => player.name),
        Math.random,
        current.players.length - 1,
      );
      stateRef.current = next;
      recordedRef.current = false;
      setState(next);
      setHistory([]);
      setSelected([]);
      setHint(null);
      setAiThinking(false);
      setLanError('');
      hostStartedRef.current = true;
      host.start();
      broadcastViews(next);
      return;
    }
    if (mode === 'ai' || mode === 'local') {
      startGame(mode, stateRef.current.players.length, level);
    }
  }, [broadcastViews, isGuest, level, mode, startGame]);

  const nextHand = useCallback(() => {
    if (isGuest) return;
    const result = nextRound(stateRef.current, Math.random);
    if (!result.ok) return;
    commit(result.state, stateRef.current);
  }, [commit, isGuest]);

  const changeSetup = useCallback(() => {
    if (isLan) {
      goHome();
      return;
    }
    setPlayerCount(stateRef.current.players.length);
    setSetupKind(mode === 'local' ? 'local' : 'ai');
    setScreen('setup');
  }, [goHome, isLan, mode]);

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
      const created = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room: code,
        code,
        name: hostName.trim(),
        maxPlayers: lanCount,
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
          const missing = players
            .slice(1, lanCount)
            .some((player) => !player.connected);
          setLanError(missing ? t(lang, 'lanDisconnected') : '');
          broadcastViews(stateRef.current);
        }
      });
      created.onIntent((seat, intent) => {
        if (hostRef.current !== created) return;
        const value = intent as { action?: GameAction; version?: number } | null;
        if (!value || !value.action) return;
        const current = stateRef.current;
        if (typeof value.version === 'number' && value.version !== current.version) return;
        const result = applySeatAction(current, seat, value.action);
        if (!result.ok) return;
        commit(result.state, current);
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
      const url = inviteUrl(info, code, code, '');
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        color: { dark: '#2b2520', light: '#fffaf0' },
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
  }, [broadcastViews, closeLan, commit, hostName, lang, lanBusy, lanCount]);

  const startLanGame = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open') return;
    const players = lanPlayersRef.current;
    const required = lanCount - 1;
    const connected = players.slice(1, lanCount).filter((player) => player.connected).length;
    if (connected < required) return;
    const names = Array.from({ length: lanCount }, (_, seat) => players[seat]?.name ?? '');
    const next = setupGame(names, Math.random, lanCount - 1);
    stateRef.current = next;
    recordedRef.current = false;
    setState(next);
    setHistory([]);
    setSelected([]);
    setHint(null);
    setAiThinking(false);
    setLanError('');
    setMode('lan-host');
    setScreen('game');
    hostStartedRef.current = true;
    host.start();
    broadcastViews(next);
  }, [broadcastViews, lanCount]);

  const joinGuest = useCallback(async () => {
    if (guestConnecting || guest) return;
    const name = guestName.trim() || t(lang, 'guest');
    const code = guestCode.trim();
    const room = code;
    if (!/^\d{4}$/.test(code)) {
      setLanError(t(lang, 'lanCodeNeeded'));
      return;
    }
    if (!room) {
      setLanError(t(lang, 'lanCodeNeeded'));
      return;
    }
    const seq = ++guestJoinSeqRef.current;
    setGuestConnecting(true);
    setLanError('');
    try {
      const joined = await LanGuest.join({ wsUrl: guestWsUrl(), room, code, name });
      if (seq !== guestJoinSeqRef.current) {
        joined.close();
        return;
      }
      autoJoinRef.current = true;
      lanActiveRef.current = true;
      setGuest(joined);
      setGuestRoom(room);
      setGuestView(null);
      setGuestStarted(false);
      setGuestPlayers([]);
      lastGuestVersionRef.current = -1;
      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        const next = payload as SeatView;
        if (!next || !Array.isArray(next.hand)) return;
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
  }, [guest, guestCode, guestConnecting, guestName, guestRoom, lang]);

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
        setLanError(t(lang, 'lanClosed'));
        setLanRole('guest');
        setScreen('lan');
      }
    }, 900);
    return () => window.clearInterval(timer);
  }, [guest, lang]);

  useEffect(() => {
    if (screen !== 'game' || mode !== 'ai') return;
    if (state.phase !== 'draw' && state.phase !== 'meld') return;
    if (state.turn === 0) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const next = runAiTurn(state, level, Math.random);
      setAiThinking(false);
      if (next.version === state.version) return;
      commit(next, state);
    }, 620);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, level, mode, screen, state]);

  useEffect(() => {
    if (screen !== 'game' || state.phase !== 'game-over') return;
    if (recordedRef.current) return;
    recordedRef.current = true;
    if (mode !== 'lan-guest') {
      setRecord(
        recordResult(state, {
          mode: recordModeFor(mode),
          level: mode === 'ai' ? level : undefined,
        }),
      );
    }
    if (soundOn) chime('win');
  }, [level, mode, screen, soundOn, state]);

  useEffect(() => {
    if (demo) return;
    if (screen !== 'game') return;
    if (mode !== 'ai' && mode !== 'local') return;
    if (state.phase === 'game-over') {
      clearSave();
      setSaved(null);
      return;
    }
    setSaved(saveGame({ state, mode, level }));
  }, [demo, level, mode, screen, state]);

  useEffect(() => {
    if (!guestView) {
      lastGuestVersionRef.current = -1;
      return;
    }
    const previous = lastGuestVersionRef.current;
    lastGuestVersionRef.current = guestView.version;
    if (previous < 0 || guestView.version <= previous) return;
    if (!soundOn) return;
    chime(
      guestView.phase === 'game-over'
        ? 'win'
        : guestView.phase === 'round-over'
          ? 'draw'
          : 'place',
    );
  }, [guestView, soundOn]);

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
      if (key === 'd') {
        event.preventDefault();
        drawStock();
      } else if (key === 'm') {
        event.preventDefault();
        meldSelected();
      } else if (key === 'x' || event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        discardSelected();
      } else if (key === 'u') {
        event.preventDefault();
        undo();
      } else if (key === 'h') {
        event.preventDefault();
        showHint();
      } else if (/^[1-9]$/.test(event.key)) {
        const card = shownView.hand[Number(event.key) - 1];
        if (card) {
          event.preventDefault();
          toggleCard(card);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    discardSelected,
    drawStock,
    goHome,
    meldSelected,
    screen,
    shownView.hand,
    showHint,
    toggleCard,
    undo,
  ]);

  const turnHeadline = (() => {
    if (phase === 'game-over') return tr('gameOver');
    if (phase === 'round-over') return tr('roundOver');
    if (hidden) return t(lang, 'passTo', { name: turnName });
    if (isGuest) {
      return shownView.canAct ? tr('yourTurn') : t(lang, 'waitingTurn', { name: turnName });
    }
    if (mode === 'ai') {
      return state.turn === 0 ? tr('yourTurn') : t(lang, 'waitingAi', { name: turnName });
    }
    if (mode === 'local') return t(lang, 'turnOf', { name: turnName });
    return state.turn === 0 ? tr('yourTurn') : t(lang, 'turnOf', { name: turnName });
  })();

  const phaseDetail = (() => {
    if (phase === 'game-over') {
      return t(lang, 'winnerAt', { name: winnerName, score: winnerScore });
    }
    if (phase === 'round-over') {
      if (report?.tie) {
        return t(lang, 'tiePlayOn', { score: Math.max(...report.totals) });
      }
      if (report?.reason === 'went-out' && report.wentOut !== null) {
        return t(lang, 'wentOut', { name: labelFor(report.wentOut) });
      }
      return tr('stockEmpty');
    }
    if (hidden) return tr('privacyNote');
    if (phase === 'draw') return tr('phaseDraw');
    return shownView.mustMeld ? tr('phaseMeldMust') : tr('phaseMeld');
  })();

  const modeLabelText =
    mode === 'ai'
      ? t(lang, level)
      : mode === 'local'
        ? tr('playLocal')
        : mode === 'lan-host'
          ? tr('lanTitle')
          : tr('lanGuestTitle');

  const connectedGuests = lanPlayers.filter((player) => !player.host && player.connected).length;
  const allGuestsReady = connectedGuests >= lanCount - 1;
  const guestHostName = guestPlayers.find((player) => player.host)?.name ?? '';
  const guestSeatNumber = guest?.seat ?? 0;

  const roundLabel = tr('roundN', { n: shownView.round });
  const targetLabel = tr('firstTo', { target: shownView.target });

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('brand')}</p>
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
          <div className="hero-meld">
            {['7H', '8H', '9H'].map((card) => (
              <PlayingCard key={card} card={card} className="hero-card" />
            ))}
          </div>
          <div className="hero-meld hero-meld-offset">
            {['AS', '2S', '3S'].map((card) => (
              <PlayingCard key={card} card={card} className="hero-card" />
            ))}
          </div>
          <div className="hero-fan">
            {['KH', 'KD', 'KC', 'QS', 'JD'].map((card) => (
              <PlayingCard key={card} card={card} className="hero-card hero-fan-card" />
            ))}
          </div>
          <span className="hero-chip">500</span>
        </div>
        <div className="hero-copy">
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continueGame')}</span>
                <small>
                  {saved.mode === 'ai' ? t(lang, saved.level) : tr('playLocal')} · {tr('saved')}
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
              <small>{tr('lanStartHint')}</small>
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
            <span>{tr('bestScore')}</span>
            <strong>{record.bestScore}</strong>
            <span className="dot">·</span>
            <span>{tr('target')} {TARGET}</span>
          </div>
        </div>
      </section>
      <section className="home-quick">
        {[
          { title: tr('quickDraw'), text: tr('quickDrawText') },
          { title: tr('quickMeld'), text: tr('quickMeldText') },
          { title: tr('quickDiscard'), text: tr('quickDiscardText') },
        ].map((item) => (
          <div className="quick-card" key={item.title}>
            <span>{item.title}</span>
            <p>{item.text}</p>
          </div>
        ))}
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">
        {setupKind === 'ai' ? tr('setupAiTitle') : tr('setupLocalTitle')}
      </h2>
      <div className="setup-grid">
        <section className="side-card">
          <h3>{tr('players')}</h3>
          <div className="segmented" role="group" aria-label={tr('players')}>
            {[2, 3, 4].map((count) => (
              <button
                key={count}
                type="button"
                className={playerCount === count ? 'selected' : ''}
                aria-pressed={playerCount === count}
                onClick={() => setPlayerCount(count)}
              >
                {tr(count === 2 ? 'players2' : count === 3 ? 'players3' : 'players4')}
              </button>
            ))}
          </div>
          <p className="helper">{tr('dealNote')}</p>
          <p className="helper">
            {setupKind === 'ai' ? tr('aiTableNote') : tr('localTableNote')}
          </p>
          {setupKind === 'local' && <p className="helper">{tr('privacyNote')}</p>}
        </section>
        {setupKind === 'ai' && (
          <section className="side-card">
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
      </div>
      <div className="row-actions">
        <button className="primary" onClick={beginGame}>
          {tr('begin')}
        </button>
        <button className="ghost" onClick={goHome}>
          {tr('back')}
        </button>
      </div>
    </main>
  );

  const meldOwners = shownView.players
    .map((player) => player.seat)
    .filter((seat) => shownView.melds.some((meld) => meld.owner === seat));

  const handDock = hidden ? (
    <div className="hand-dock privacy-dock">
      <div className="privacy-panel">
        <span className="privacy-kicker">{tr('passTitle')}</span>
        <strong>{t(lang, 'passTo', { name: turnName })}</strong>
        <button className="primary" onClick={() => setRevealed(true)}>
          {tr('showHand')}
        </button>
      </div>
    </div>
  ) : (
    <div className="hand-dock">
      <div className="hand-head">
        <div>
          <span className="label">{tr('handLabel')}</span>
          <strong>
            {shownView.handPoints} {tr('points')}
          </strong>
        </div>
        <div className="hand-notes">
          {shownView.mustMeld && (
            <span className="must-chip">
              {t(lang, 'mustMeldChip', { card: cardName(shownView.mustMeld, lang) })}
            </span>
          )}
          {shownView.drawn && (
            <span className="drawn-note">
              {shownView.drawn.from === 'stock'
                ? t(lang, 'drawnFromStock', { card: cardName(shownView.drawn.card, lang) })
                : shownView.drawn.taken.length > 1
                  ? t(lang, 'drawnFromDiscard', {
                      card: cardName(shownView.drawn.card, lang),
                      n: shownView.drawn.taken.length - 1,
                    })
                  : t(lang, 'drawnFromDiscardOne', { card: cardName(shownView.drawn.card, lang) })}
            </span>
          )}
        </div>
      </div>
      <div className="hand-scroll">
        {shownView.hand.map((card) => (
          <PlayingCard
            key={card}
            card={card}
            selected={selected.includes(card)}
            hinted={hintCardSet.has(card)}
            className={shownView.mustMeld === card ? 'is-required' : ''}
            onClick={() => toggleCard(card)}
            label={cardName(card, lang)}
          />
        ))}
      </div>
      <div className="action-bar">
        <span className="selected-summary">
          {selected.length > 0
            ? `${selected.length} · ${selectedPoints} ${tr('points')}`
            : tr('selectHint')}
        </span>
        <button className={`secondary ${hint?.kind === 'meld' ? 'is-hinted' : ''}`} onClick={meldSelected} disabled={!canTryMeld}>
          {tr('meldSelected')}
        </button>
        <button className="primary" onClick={discardSelected} disabled={!canDiscardNow}>
          {tr('discardSelected')}
        </button>
      </div>
    </div>
  );

  const roundSheet = (
    <section className="round-sheet" aria-live="polite">
      <div className="round-head">
        <span className="result-kicker">
          {phase === 'game-over' ? tr('gameOver') : tr('roundOver')}
        </span>
        <strong>
          {phase === 'game-over'
            ? t(lang, 'winnerAt', { name: winnerName, score: winnerScore })
            : report?.tie
              ? t(lang, 'tiePlayOn', { score: report ? Math.max(...report.totals) : 0 })
              : report?.reason === 'went-out' && report.wentOut !== null
                ? t(lang, 'wentOut', { name: labelFor(report.wentOut) })
                : tr('stockEmpty')}
        </strong>
      </div>
      <div className="round-table-wrap">
        <table className="score-table">
          <thead>
            <tr>
              <th>{tr('playersLabel')}</th>
              <th>{tr('melded')}</th>
              <th>{tr('deadwood')}</th>
              <th>{tr('roundScore')}</th>
              <th>{tr('totalScore')}</th>
            </tr>
          </thead>
          <tbody>
            {shownView.players.map((player) => (
              <tr key={player.seat} className={player.seat === shownView.winner ? 'is-winner' : ''}>
                <td>{labelFor(player.seat)}</td>
                <td>{report?.melded[player.seat] ?? 0}</td>
                <td>{report?.deadwood[player.seat] ?? 0}</td>
                <td>{report?.scores[player.seat] ?? 0}</td>
                <td>
                  <strong>{report?.totals[player.seat] ?? player.score}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="round-actions">
        {isGuest ? (
          <span className="wait-pill">
            <span className="wait-dot" aria-hidden="true" />
            {tr('waitingHost')}
          </span>
        ) : phase === 'game-over' ? (
          <>
            <button className="primary" onClick={playAgain}>
              {tr('playAgain')}
            </button>
            {!isLan && (
              <button className="secondary" onClick={changeSetup}>
                {tr('changeSetup')}
              </button>
            )}
          </>
        ) : (
          <button className="primary" onClick={nextHand}>
            {tr('nextHand')}
          </button>
        )}
      </div>
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
            {modeLabelText} · {roundLabel}
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

      {isLan && lanError && (
        <p className="error game-error" role="alert">
          {lanError}
        </p>
      )}

      <div className="game-layout">
        <div className="table-column">
          <section className="table-stage">
            <div className="opponents">
              {shownView.players
                .filter((player) => player.seat !== shownView.seat)
                .map((player) => (
                  <div
                    key={player.seat}
                    className={`opponent ${player.isTurn ? 'is-turn' : ''}`}
                  >
                    <div className="opp-head">
                      <strong>{labelFor(player.seat)}</strong>
                      <span>
                        {player.score} {tr('points')}
                      </span>
                    </div>
                    <div className="opp-body">
                      <CardBackRow count={player.handCount} />
                      <span className="opp-count">
                        {t(lang, 'cardCount', { n: player.handCount })}
                      </span>
                    </div>
                  </div>
                ))}
            </div>

            <div className="centre-row">
              <div className="pile-block">
                <span className="pile-label">{tr('stock')}</span>
                <button
                  type="button"
                  className={`stock-pile ${hintStock ? 'is-hinted' : ''} ${shownView.stockCount === 0 ? 'is-empty' : ''}`}
                  onClick={drawStock}
                  disabled={!canDrawNow}
                  aria-label={`${tr('stockPileLabel')} · ${t(lang, 'stockCount', { n: shownView.stockCount })}`}
                >
                  <span className="stock-stack" aria-hidden="true">
                    <span className="stock-back back-one" />
                    <span className="stock-back back-two" />
                    <span className="stock-back back-three" />
                  </span>
                  <span className="stock-count">
                    {t(lang, 'stockCount', { n: shownView.stockCount })}
                  </span>
                </button>
              </div>

              <div className="turn-panel">
                <span className="turn-kicker">
                  {roundLabel} · {targetLabel}
                </span>
                <strong>{turnHeadline}</strong>
                <p>{phaseDetail}</p>
                <div className="turn-badges">
                  {shownView.mustMeld && (
                    <span className="must-chip">
                      {t(lang, 'mustMeldChip', { card: cardName(shownView.mustMeld, lang) })}
                    </span>
                  )}
                  {aiThinking && <span className="thinking">…</span>}
                </div>
              </div>

              <div className="pile-block discard-block">
                <span className="pile-label">{tr('discard')}</span>
                <div className="discard-fan" aria-label={tr('discardPileLabel')} ref={discardRef}>
                  {shownView.discard.length === 0 ? (
                    <span className="empty-pile">{tr('discardEmpty')}</span>
                  ) : (
                    shownView.discard.map((card, index) => {
                      const takeable = Boolean(shownView.takeable[index]);
                      const highlighted = hintDiscardIndex === index;
                      return (
                        <PlayingCard
                          key={`${card}-${index}`}
                          card={card}
                          small
                          hinted={highlighted}
                          className={`discard-card ${takeable ? 'is-takeable' : 'is-unavailable'}`}
                          onClick={() => takeDiscard(index)}
                          disabled={!canActNow || phase !== 'draw'}
                          label={t(lang, 'takeFromHere', { card: cardName(card, lang) })}
                        />
                      );
                    })
                  )}
                </div>
                {phase === 'draw' && canActNow && <span className="pile-help">{tr('takeHint')}</span>}
              </div>
            </div>

            <div className="meld-board">
              {meldOwners.length === 0 ? (
                <p className="empty-melds">{tr('noMelds')}</p>
              ) : (
                meldOwners.map((seat) => (
                  <div className="meld-row" key={seat}>
                    <div className="meld-row-owner">
                      <strong>{labelFor(seat)}</strong>
                      <span>
                        {shownView.melds
                          .filter((meld) => meld.owner === seat)
                          .reduce((sum, meld) => sum + meldPoints(meld), 0)}{' '}
                        {tr('points')}
                      </span>
                    </div>
                    <div className="meld-row-groups">
                      {shownView.melds
                        .filter((meld) => meld.owner === seat)
                        .map((meld) => {
                          const target = selected.length === 1 ? selected[0] : null;
                          const canLayoff = Boolean(
                            target && phase === 'meld' && meldAcceptsCard(meld, target),
                          );
                          return (
                            <MeldGroup
                              key={meld.id}
                              meld={meld}
                              lang={lang}
                              selectedCard={target}
                              canLayoff={canLayoff && canActNow}
                              hinted={hintMeldId === meld.id}
                              onLayoff={
                                target && canActNow && phase === 'meld'
                                  ? () => tryLayoff(meld.id)
                                  : undefined
                              }
                              nameFor={labelFor}
                            />
                          );
                        })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {phase === 'round-over' || phase === 'game-over' ? roundSheet : handDock}
        </div>

        <aside className="side">
          <div className="side-card action-card">
            <div className="action-head">
              <h3>{tr('actionNeeded')}</h3>
              <span className={`status-dot ${canActNow ? 'online' : ''}`} />
            </div>
            <p>
              {phase === 'game-over'
                ? isGuest
                  ? tr('waitingHost')
                  : tr('gameOver')
                : phase === 'round-over'
                  ? isGuest
                    ? tr('waitingHost')
                    : tr('roundOver')
                  : canActNow
                    ? phase === 'draw'
                      ? tr('takeHint')
                      : selected.length === 0
                        ? tr('selectHint')
                        : selected.length === 1
                          ? tr('layoffHint')
                          : tr('meldSelected')
                    : hidden
                      ? t(lang, 'passTo', { name: turnName })
                      : t(lang, 'waitingTurn', { name: turnName })}
            </p>
            <div className="side-actions">
              <button
                className="secondary"
                onClick={undo}
                disabled={!canUndoNow}
                title={isLan ? tr('undoOff') : undefined}
              >
                {tr('undo')}
              </button>
              <button className="secondary" onClick={showHint} disabled={!canHintNow}>
                {tr('hint')}
              </button>
            </div>
            {isLan ? (
              <p className="side-note">{tr('undoOff')}</p>
            ) : (phase === 'draw' || phase === 'meld') && !hidden ? (
              <p className="side-note">{tr('keyboardHint')}</p>
            ) : null}
          </div>

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanCode')}</h3>
                <span className={`status-dot ${allGuestsReady ? 'online' : ''}`} />
              </div>
              <div className="room-code">{lanCode || '—'}</div>
              <p>
                {allGuestsReady
                  ? tr('lanReady')
                  : t(lang, 'lanNeedPlayers', { n: Math.max(0, lanCount - 1 - connectedGuests) })}
              </p>
              {lanPlayers
                .filter((player) => !player.host)
                .map((player) => (
                  <p className="peer" key={player.seat}>
                    {player.connected
                      ? player.name || tr('guest')
                      : t(lang, 'lanSeat', { n: player.seat + 1 })}{' '}
                    · {player.connected ? tr('lanOnline') : tr('lanOffline')}
                  </p>
                ))}
            </div>
          )}

          {isGuest && (
            <div className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanGuestTitle')}</h3>
                <span className={`status-dot ${guestStarted ? 'online' : ''}`} />
              </div>
              <p>{shownView.canAct ? tr('lanYourTurn') : tr('lanWaitingTurn')}</p>
              <p className="peer">{t(lang, 'lanRoom', { code: guestRoom || guestCode })}</p>
              <p className="peer">
                {t(lang, 'lanSeat', { n: guestSeatNumber + 1 })}
                {guestHostName ? ` · ${guestHostName}` : ''}
              </p>
            </div>
          )}

          <div className="side-card scoreboard">
            <h3>{tr('scoreboard')}</h3>
            {shownView.players.map((player) => {
              const width = Math.max(0, Math.min(100, (player.score / shownView.target) * 100));
              return (
                <div className={`score-row ${player.isTurn ? 'is-turn' : ''}`} key={player.seat}>
                  <span className="score-name">{labelFor(player.seat)}</span>
                  <span className="score-bar">
                    <i style={{ width: `${width}%` }} />
                  </span>
                  <strong>{player.score}</strong>
                </div>
              );
            })}
            <p className="side-note">
              {tr('target')} {shownView.target} · {roundLabel}
            </p>
          </div>

          <div className="side-card record-mini">
            <h3>{tr('viewRecord')}</h3>
            <p>{tr('recordMini', { games: record.games, best: record.bestScore })}</p>
            <button className="text-button" onClick={() => setScreen('stats')}>
              {tr('viewRecord')} →
            </button>
          </div>
        </aside>
      </div>
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <section className="quick-rules">
        {[
          { title: tr('quickDraw'), text: tr('quickDrawText') },
          { title: tr('quickMeld'), text: tr('quickMeldText') },
          { title: tr('quickDiscard'), text: tr('quickDiscardText') },
        ].map((item) => (
          <div className="quick-card" key={item.title}>
            <span>{item.title}</span>
            <p>{item.text}</p>
          </div>
        ))}
      </section>
      <ol className="rules-list">
        <li>{tr('rule1')}</li>
        <li>{tr('rule2')}</li>
        <li>{tr('rule3')}</li>
        <li>{tr('rule4')}</li>
        <li>{tr('rule5')}</li>
        <li>{tr('rule6')}</li>
        <li>{tr('rule7')}</li>
        <li>{tr('rule8')}</li>
      </ol>
      <section className="scoring-card">
        <h3>{tr('scoringTitle')}</h3>
        <p>{tr('scoringHow')}</p>
        <ul>
          <li>{tr('valueFace')}</li>
          <li>{tr('valuePip')}</li>
          <li>{tr('valueAceHigh')}</li>
          <li>{tr('valueAceLow')}</li>
          <li>{tr('valueAceHand')}</li>
        </ul>
        <p className="helper">{tr('ruleNoJokers')}</p>
      </section>
      <div className="row-actions">
        <button className="primary" onClick={goHome}>
          {tr('close')}
        </button>
      </div>
    </main>
  );

  const statsScreen = (
    <main className="shell stats-shell">
      <button className="back" onClick={goHome}>
        ← {tr('home')}
      </button>
      <h2 className="screen-title">{tr('recordTitle')}</h2>
      {record.games === 0 ? (
        <section className="empty-card">
          <span className="empty-mark" aria-hidden="true">
            500
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
              <span>{tr('totalGames')}</span>
              <strong>{record.games}</strong>
            </div>
            <div className="stat-card best">
              <span>{tr('bestGame')}</span>
              <strong>{record.bestScore}</strong>
            </div>
            <div className="stat-card target">
              <span>{tr('target')}</span>
              <strong>{TARGET}</strong>
            </div>
          </section>

          <section className="record-grid">
            <div className="record-card modes-card">
              <h3>{tr('modeSplit')}</h3>
              {(['ai', 'local', 'lan'] as const).map((value) => (
                <div className="mode-row" key={value}>
                  <span>{value === 'ai' ? tr('modeAi') : value === 'local' ? tr('modeLocal') : tr('modeLan')}</span>
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

            <div className="record-card recent-card">
              <h3>{tr('recentGames')}</h3>
              {record.recent.length === 0 ? (
                <p className="recent-empty">{tr('recentEmpty')}</p>
              ) : (
                <ol className="recent-list">
                  {record.recent.map((entry, index) => {
                    const winnerLabel =
                      entry.winnerName.trim() ||
                      (entry.mode === 'ai'
                        ? entry.winner === 0
                          ? tr('you')
                          : t(lang, 'aiN', { n: entry.winner })
                        : entry.mode === 'local'
                          ? t(lang, 'playerN', { n: entry.winner + 1 })
                          : entry.winner === 0
                            ? tr('host')
                            : tr('guest'));
                    return (
                      <li className="recent-row" key={`${entry.at}-${index}`}>
                        <div className="recent-main">
                          <strong>
                            {tr('winnerLabel')} · {winnerLabel}
                          </strong>
                          <span>
                            {entry.mode === 'ai'
                              ? tr('modeAi')
                              : entry.mode === 'local'
                                ? tr('modeLocal')
                                : tr('modeLan')}
                            {entry.level ? ` · ${t(lang, entry.level)}` : ''} ·{' '}
                            {t(lang, 'playersValue', { n: entry.players })} ·{' '}
                            {t(lang, 'roundsValue', { n: entry.rounds })}
                          </span>
                        </div>
                        <span className="recent-score">
                          {entry.score} {tr('points')}
                        </span>
                        <time dateTime={new Date(entry.at).toISOString()}>
                          {formatDate(entry.at, lang)}
                        </time>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>
          <p className="side-note">{tr('recordHint')}</p>
        </>
      )}
    </main>
  );

  const lanScreen = (
    <main className="shell lan-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>

      {lanRole === 'hub' && (
        <>
          <h2 className="screen-title">{tr('lanTitle')}</h2>
          <div className="lan-choice">
            <section className="lan-choice-card host-card">
              <div className="choice-head">
                <span className="tag">{tr('host')}</span>
                <span className="choice-icon" aria-hidden="true">
                  ⌂
                </span>
              </div>
              <h3>{tr('lanHostTitle')}</h3>
              <p>{tr('lanHostHelp')}</p>
              <label className="field">
                <span>{tr('lanHostName')}</span>
                <input
                  value={hostName}
                  onChange={(event) => setHostName(event.target.value)}
                  maxLength={18}
                  placeholder={tr('lanHostPlaceholder')}
                />
              </label>
              <div className="field">
                <span>{tr('lanTableSize')}</span>
                <div className="segmented" role="group" aria-label={tr('lanTableSize')}>
                  {[2, 3, 4].map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={lanCount === count ? 'selected' : ''}
                      aria-pressed={lanCount === count}
                      onClick={() => setLanCount(count)}
                    >
                      {tr(count === 2 ? 'players2' : count === 3 ? 'players3' : 'players4')}
                    </button>
                  ))}
                </div>
              </div>
              <button className="primary wide" onClick={openLanHost} disabled={lanBusy}>
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
                <span className="tag">{tr('guest')}</span>
                <span className="choice-icon" aria-hidden="true">
                  ↗
                </span>
              </div>
              <h3>{tr('lanJoinTitle')}</h3>
              <p>{tr('lanJoinHelp')}</p>
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
          <h2 className="screen-title">{tr('lanHostTitle')}</h2>
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
                  <span className={`status-pill ${allGuestsReady ? 'ready' : ''}`}>
                    {allGuestsReady ? tr('lanReady') : tr('lanWaiting')}
                  </span>
                </div>
                <div className="room-code big">{lanCode}</div>
                <p className="lan-help">{tr('lanCodeHelp')}</p>
                <div className="peer-list">
                  {Array.from({ length: lanCount }, (_, seat) => {
                    const player = lanPlayers[seat];
                    const online = seat === 0 || Boolean(player?.connected);
                    const name =
                      seat === 0
                        ? player?.name || hostName.trim() || tr('host')
                        : online
                          ? player?.name || tr('guest')
                          : t(lang, 'lanSeat', { n: seat + 1 });
                    return (
                      <span key={seat} className={`peer-chip ${online ? 'online' : ''}`}>
                        <span className="peer-mark">{seat + 1}</span>
                        <span className="peer-name">{name}</span>
                        <small>
                          {seat === 0 ? tr('host') : tr('guest')} ·{' '}
                          {online ? tr('lanOnline') : tr('lanOffline')}
                        </small>
                      </span>
                    );
                  })}
                </div>
                <button className="primary wide" onClick={startLanGame} disabled={!allGuestsReady}>
                  {allGuestsReady ? tr('lanStart') : tr('lanWaiting')}
                </button>
                <button className="secondary wide" onClick={copyInvite}>
                  {tr('lanCopy')}
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
                  {tr('lanAddress')}
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
              <p className="hint-copy">{tr('lanJoinHelp')}</p>
            </div>
          )}
          {guest && (
            <div className="guest-card waiting-card">
              <div className="wait-orbit" aria-hidden="true">
                <span className="orbit-card" />
              </div>
              <h3>{tr('lanGuestTitle')}</h3>
              <p>{tr('lanWaitingHost')}</p>
              <div className="guest-meta">
                <span>{t(lang, 'lanRoom', { code: guestRoom || guestCode })}</span>
                <span>
                  {t(lang, 'lanSeat', { n: guestSeatNumber + 1 })}
                </span>
                {guestHostName && (
                  <span>
                    {tr('host')} · {guestHostName}
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
    </main>
  );

  let content = home;
  if (screen === 'setup') content = setupScreen;
  else if (screen === 'game') content = gameScreen;
  else if (screen === 'stats') content = statsScreen;
  else if (screen === 'rules') content = rulesScreen;
  else if (screen === 'lan') content = lanScreen;

  return (
    <>
      {content}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
