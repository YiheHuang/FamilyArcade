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
  bidHint,
  chooseBid,
  chooseCards,
  hintPlay,
  type AiLevel,
  type BidReason,
  type HintReason,
} from './ai/ai';
import { CardBack, CardBackStack, CardFan, Hand, PlayingCard } from './components/Cards';
import {
  beats,
  bid,
  detectCombo,
  pass,
  play,
  setup,
  view,
  type GameState,
  type MoveError,
  type SeatView,
} from './game/doudizhu';
import { demoState } from './demo';
import { comboName, formatDate, levelName, modeName, roleName, sideName } from './format';
import { detectLang, t, type Lang, type MessageKey } from './i18n';
import {
  guestWsUrl,
  hostWsUrl,
  inviteUrl,
  startLanServer,
} from './net';
import {
  clearRecord,
  clearSave,
  loadRecord,
  loadSave,
  recordResult,
  saveGame,
  type FamilyRecord,
  type RecordMode,
  type SavedGame,
} from './storage';
import { chime, type SoundKind } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'stats' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type LanRole = 'hub' | 'host' | 'guest';
type DemoKind = 'over';

const HINT_KEYS: Record<HintReason, MessageKey> = {
  finish: 'hintFinish',
  'beat-cheap': 'hintBeatCheap',
  'bomb-now': 'hintBombNow',
  'let-partner': 'hintLetPartner',
  'pass-high': 'hintPassHigh',
  hold: 'hintHold',
  'lead-low': 'hintLeadLow',
  'lead-long': 'hintLeadLong',
  'preserve-bomb': 'hintPreserveBomb',
  open: 'hintOpen',
};

const BID_KEYS: Record<BidReason, MessageKey> = {
  strong: 'hintBidStrong',
  steady: 'hintBidSteady',
  thin: 'hintBidThin',
  raise: 'hintBidRaise',
};

const ERROR_KEYS: Partial<Record<MoveError, MessageKey>> = {
  'bad-combo': 'invalidCombo',
  'does-not-beat': 'cannotBeat',
  'must-play': 'mustPlay',
  'wrong-turn': 'notYourTurn',
};

const RULES: { title: MessageKey; body: MessageKey }[] = [
  { title: 'ruleDeckTitle', body: 'ruleDeck' },
  { title: 'ruleBidTitle', body: 'ruleBid' },
  { title: 'ruleRankTitle', body: 'ruleRank' },
  { title: 'ruleCombosTitle', body: 'ruleCombos' },
  { title: 'ruleBeatTitle', body: 'ruleBeat' },
  { title: 'rulePassTitle', body: 'rulePass' },
  { title: 'ruleWinTitle', body: 'ruleWin' },
  { title: 'ruleScoreTitle', body: 'ruleScore' },
  { title: 'ruleSpringTitle', body: 'ruleSpring' },
  { title: 'rulePrivacyTitle', body: 'rulePrivacy' },
  { title: 'ruleControlsTitle', body: 'ruleControls' },
  { title: 'ruleModesTitle', body: 'ruleModes' },
];

function readDemo(): DemoKind | null {
  if (typeof location === 'undefined') return null;
  const value = new URLSearchParams(location.search).get('demo');
  return value === 'over' ? 'over' : null;
}

function viewSeatFor(mode: Mode, state: GameState): number {
  if (mode === 'local' && state.turn >= 0) return state.turn;
  return 0;
}

function recordModeFor(mode: Mode): RecordMode {
  if (mode === 'ai') return 'ai';
  if (mode === 'local') return 'local';
  return 'lan';
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [demo] = useState<DemoKind | null>(() => readDemo());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (demo ? 'game' : invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (demo ? 'local' : 'ai'));
  const [level, setLevel] = useState<AiLevel>('normal');
  const [saved, setSaved] = useState<SavedGame | null>(() => (demo ? null : loadSave()));
  const [state, setState] = useState<GameState>(() =>
    demo ? demoState('over') : setup({ rng: Math.random }),
  );
  const [history, setHistory] = useState<GameState[]>([]);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [hinted, setHinted] = useState<Set<string>>(() => new Set());
  const [curtain, setCurtain] = useState(false);
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.doudizhu.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);

  const [lanRole, setLanRole] = useState<LanRole>(() => (invite ? 'guest' : 'hub'));
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [hostName, setHostName] = useState(() => {
    try {
      return localStorage.getItem('familyarcade.doudizhu.hostName') ?? '';
    } catch {
      return '';
    }
  });
  const [humanSeats, setHumanSeats] = useState<number[]>([0]);
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => invite?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => invite?.code ?? '');
  const [guestRoom, setGuestRoom] = useState(() => invite?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [guestPlayers, setGuestPlayers] = useState<LanPublicPeer[]>([]);

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const hostStartedRef = useRef(false);
  const humanSeatsRef = useRef<number[]>([0]);
  const recordedRef = useRef(Boolean(demo));
  const lanActiveRef = useRef(false);
  const hostCreateSeqRef = useRef(0);
  const guestJoinSeqRef = useRef(0);
  const guestResultRef = useRef<string>('');

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );
  const isGuest = mode === 'lan-guest';
  const isLan = mode === 'lan-host' || mode === 'lan-guest';

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    humanSeatsRef.current = humanSeats;
  }, [humanSeats]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? '斗地主 · 家庭街机' : 'Dou Dizhu · Family Arcade';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.doudizhu.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.doudizhu.hostName', hostName);
    } catch {
      /* ignore */
    }
  }, [hostName]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (screen !== 'stats') setClearArmed(false);
  }, [screen]);

  const finish = useCallback(
    (next: GameState, currentMode: Mode) => {
      if (next.phase !== 'over' || !next.result || recordedRef.current) return;
      recordedRef.current = true;
      if (currentMode !== 'lan-guest') {
        setRecord(
          recordResult(next, {
            mode: recordModeFor(currentMode),
            level: currentMode === 'ai' ? level : undefined,
          }),
        );
      }
      if (soundOn) {
        const viewerSide = next.result.landlord === 0 ? 'landlord' : 'farmers';
        chime(viewerSide === next.result.winnerSide ? 'win' : 'lose');
      }
    },
    [level, soundOn],
  );

  const sendViews = useCallback((next: GameState) => {
    const host = hostRef.current;
    if (!host) return;
    for (const seat of humanSeatsRef.current) {
      if (seat === 0) continue;
      host.sendView(seat, view(next, seat));
    }
  }, []);

  const commit = useCallback(
    (next: GameState, previous: GameState, currentMode: Mode, soundKind: SoundKind = 'play') => {
      stateRef.current = next;
      setState(next);
      setSelected(new Set());
      setHinted(new Set());
      setToast(next.deal > previous.deal ? tr('allPassed') : '');
      if (currentMode === 'ai' || currentMode === 'local') {
        setHistory((items) => [...items, previous]);
      }
      if (soundOn && next.phase !== 'over') {
        if (next.bombs > previous.bombs) chime('bomb');
        else chime(soundKind);
      }
      finish(next, currentMode);
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.phase === 'over') {
          clearSave();
          setSaved(null);
        } else {
          setSaved(saveGame({ state: next, mode: currentMode, level }));
        }
      }
      if (currentMode === 'lan-host') {
        sendViews(next);
        if (next.phase === 'over') {
          hostRef.current?.sendResult({ kind: 'over', result: next.result });
        }
      }
      if (currentMode === 'local') {
        setCurtain(next.phase !== 'over');
      }
    },
    [finish, level, sendViews, soundOn, tr],
  );

  const startGame = useCallback((nextMode: 'ai' | 'local') => {
    const next = setup({ rng: Math.random });
    stateRef.current = next;
    recordedRef.current = false;
    setMode(nextMode);
    setState(next);
    setHistory([]);
    setSelected(new Set());
    setHinted(new Set());
    setCurtain(nextMode === 'local');
    setScreen('game');
    setToast('');
    clearSave();
    setSaved(null);
  }, []);

  const startAi = useCallback(() => {
    setMode('ai');
    setScreen('setup');
  }, []);

  const resume = useCallback(() => {
    if (!saved) return;
    stateRef.current = saved.state;
    recordedRef.current = saved.state.phase === 'over';
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    setHistory([]);
    setSelected(new Set());
    setHinted(new Set());
    setCurtain(saved.mode === 'local' && saved.state.phase !== 'over');
    setScreen('game');
  }, [saved]);

  const undo = useCallback(() => {
    if (isLan || history.length === 0) return;
    let index = history.length - 1;
    if (mode === 'ai') {
      while (index >= 0) {
        const item = history[index];
        if ((item.phase === 'bidding' || item.phase === 'playing') && item.turn === 0) break;
        index -= 1;
      }
    }
    if (index < 0) return;
    const previous = history[index];
    stateRef.current = previous;
    recordedRef.current = false;
    setState(previous);
    setHistory(history.slice(0, index));
    setSelected(new Set());
    setHinted(new Set());
    setAiThinking(false);
    setCurtain(mode === 'local' && previous.phase !== 'over');
    setToast('');
    if (previous.phase !== 'over') {
      setSaved(saveGame({ state: previous, mode: mode === 'ai' ? 'ai' : 'local', level }));
    }
  }, [history, isLan, level, mode]);

  const closeLan = useCallback(() => {
    lanActiveRef.current = false;
    hostStartedRef.current = false;
    hostCreateSeqRef.current += 1;
    guestJoinSeqRef.current += 1;
    const host = hostRef.current;
    hostRef.current = null;
    if (host) {
      try {
        host.sendResult({ kind: 'closed' });
      } catch {
        /* socket may already be gone */
      }
      host.close();
    }
    setLanHost(null);
    setLanPlayers([]);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanBusy(false);
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

  const goHome = useCallback(() => {
    closeLan();
    setLanRole('hub');
    setMode('ai');
    setCurtain(false);
    setSelected(new Set());
    setHinted(new Set());
    setAiThinking(false);
    setScreen('home');
  }, [closeLan]);

  const openLanHub = useCallback(() => {
    closeLan();
    setLanRole('hub');
    setMode('ai');
    setScreen('lan');
  }, [closeLan]);

  const openLanJoin = useCallback(() => {
    setLanRole('guest');
    setScreen('lan');
  }, []);

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
      const code = newRoomCode();
      const displayName = hostName.trim() || tr('host');
      const created = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room: code,
        code,
        name: displayName,
        maxPlayers: 3,
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
        const humans = [
          0,
          ...players
            .filter((player) => player.connected && !player.host)
            .map((player) => player.seat),
        ];
        humanSeatsRef.current = humans;
        setHumanSeats(humans);
        created.sendLobby();
        if (hostStartedRef.current) {
          for (const seat of humans) {
            if (seat !== 0) created.sendView(seat, view(stateRef.current, seat));
          }
        }
      });
      created.onIntent((seat, intent) => {
        if (hostRef.current !== created || !hostStartedRef.current) return;
        if (!humanSeatsRef.current.includes(seat)) return;
        const value = intent as
          | { type?: string; value?: number; cardIds?: string[]; cardId?: string }
          | null;
        if (!value) return;
        const current = stateRef.current;
        if (value.type === 'bid') {
          const result = bid(current, seat, Number(value.value), Math.random);
          if (result.ok) commit(result.state, current, 'lan-host', 'bid');
          return;
        }
        if (value.type === 'pass') {
          const result = pass(current, seat);
          if (result.ok) commit(result.state, current, 'lan-host', 'pass');
          return;
        }
        if (value.type === 'play') {
          const ids = Array.isArray(value.cardIds)
            ? value.cardIds
            : typeof value.cardId === 'string'
              ? [value.cardId]
              : [];
          if (ids.length === 0) return;
          const cards = current.hands[seat].filter((card) => ids.includes(card.id));
          if (cards.length !== ids.length) return;
          const result = play(current, seat, cards);
          if (result.ok) commit(result.state, current, 'lan-host', 'play');
        }
      });
      created.onClose(() => {
        if (hostRef.current !== created) return;
        hostRef.current = null;
        hostStartedRef.current = false;
        setLanHost(null);
        setLanPlayers([]);
        setLanError(tr('connectionLost'));
      });
      const url = inviteUrl(info, code, code, lang === 'zh' ? '访客' : 'Guest');
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        color: { dark: '#5a1f1b', light: '#fff8ea' },
      });
      if (seq !== hostCreateSeqRef.current) {
        created.close();
        return;
      }
      setLanInvite(url);
      setLanQr(qr);
    } catch {
      if (seq !== hostCreateSeqRef.current) return;
      setLanError(tr('lanDisconnected'));
      hostRef.current?.close();
      hostRef.current = null;
      setLanHost(null);
      setLanPlayers([]);
    } finally {
      if (seq === hostCreateSeqRef.current) setLanBusy(false);
    }
  }, [closeLan, commit, hostName, lang, lanBusy, tr]);

  const startLanMatch = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open') return;
    const connected = lanPlayers
      .filter((player) => player.connected && !player.host)
      .map((player) => player.seat);
    if (connected.length < 2) return;
    const humans = [0, ...connected];
    humanSeatsRef.current = humans;
    setHumanSeats(humans);
    const next = setup({ rng: Math.random });
    stateRef.current = next;
    recordedRef.current = false;
    setState(next);
    setHistory([]);
    setSelected(new Set());
    setHinted(new Set());
    setCurtain(false);
    setLanError('');
    setMode('lan-host');
    setScreen('game');
    hostStartedRef.current = true;
    host.start({ code: lanCode });
    host.sendLobby();
    for (const seat of humans) {
      if (seat !== 0) host.sendView(seat, view(next, seat));
    }
    if (soundOn) chime('deal');
  }, [lanCode, lanPlayers, soundOn]);

  const joinGuest = useCallback(async () => {
    if (guestConnecting || guest) return;
    const name = guestName.trim();
    const room = guestRoom.trim() || guestCode.trim();
    const code = guestCode.trim();
    if (!name) {
      setLanError(tr('nameNeeded'));
      return;
    }
    if (!/^\d{4}$/.test(code) || !room) {
      setLanError(tr('wrongCode'));
      return;
    }
    const seq = ++guestJoinSeqRef.current;
    setGuestConnecting(true);
    setLanError('');
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room,
        code,
        name,
      });
      if (seq !== guestJoinSeqRef.current) {
        joined.close();
        return;
      }
      lanActiveRef.current = true;
      setGuest(joined);
      setGuestRoom(room);
      setGuestView(null);
      setGuestStarted(false);
      setGuestPlayers([]);
      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        const next = payload as SeatView;
        if (!next || !Array.isArray(next.hand) || !Array.isArray(next.bids)) return;
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
        setGuest(null);
        setGuestView(null);
        setGuestStarted(false);
        setGuestPlayers([]);
        setLanError(tr('hostClosed'));
        setLanRole('guest');
        setScreen('lan');
        joined.close();
      });
      joined.onError((reason) => {
        if (!lanActiveRef.current) return;
        setLanError(reason === 'room-full' ? tr('roomFull') : tr('wrongCode'));
      });
      setMode('lan-guest');
      setLanRole('guest');
      setScreen('lan');
    } catch (error) {
      if (seq !== guestJoinSeqRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setLanError(message.includes('rejected') ? tr('wrongCode') : tr('lanDisconnected'));
      lanActiveRef.current = false;
    } finally {
      if (seq === guestJoinSeqRef.current) setGuestConnecting(false);
    }
  }, [guest, guestCode, guestConnecting, guestName, guestRoom, tr]);

  const copyInvite = useCallback(async () => {
    if (!lanInvite) return;
    try {
      await navigator.clipboard.writeText(lanInvite);
      setToast(tr('copied'));
    } catch {
      setToast(lanInvite);
    }
  }, [lanInvite, tr]);

  const resetRecord = useCallback(() => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setRecord(clearRecord());
    setClearArmed(false);
    setToast('');
  }, [clearArmed]);

  const viewerSeat = isGuest ? (guestView?.seat ?? 0) : viewSeatFor(mode, state);
  const shownView: SeatView | null = isGuest ? guestView : view(state, viewerSeat);
  const shownPhase = shownView?.phase ?? state.phase;
  const shownTurn = shownView?.turn ?? state.turn;
  const shownResult = shownView?.result ?? null;
  const shownLandlord = shownView?.landlord ?? state.landlord;
  const covered = mode === 'local' && curtain && shownPhase !== 'over';
  const ownHand = shownView?.hand ?? [];
  const selectedCards = ownHand.filter((card) => selected.has(card.id));
  const selectionCombo = selectedCards.length > 0 ? detectCombo(selectedCards) : null;
  const selectionBeats =
    selectionCombo !== null &&
    (!shownView?.lastPlay || beats(selectionCombo, shownView.lastPlay.combo));
  const canBidNow = Boolean(shownView?.canBid) && !covered && !isGuestWaiting();
  const canPlayNow = Boolean(shownView?.canPlay) && !covered;

  function isGuestWaiting(): boolean {
    return isGuest && !guestView;
  }

  const actSeat: number = isGuest
    ? (guestView?.seat ?? 0)
    : mode === 'local'
      ? shownTurn >= 0
        ? shownTurn
        : 0
      : 0;

  const names = useMemo(() => {
    const source = isGuest ? guestPlayers : lanPlayers;
    return [0, 1, 2].map((seat) => source[seat]?.name ?? '');
  }, [guestPlayers, isGuest, lanPlayers]);

  const labelFor = useCallback(
    (seat: number, viewer = viewerSeat): string => {
      if (mode === 'ai') {
        if (seat === viewer) return tr('you');
        return seat === 1 ? tr('aiOne') : tr('aiTwo');
      }
      if (mode === 'local') {
        return [tr('playerOne'), tr('playerTwo'), tr('playerThree')][seat] ?? tr('seatN', { n: seat + 1 });
      }
      const custom = names[seat]?.trim();
      if (custom) return custom;
      if (seat === viewer) return tr('you');
      return seat === 0 ? tr('host') : tr('guest');
    },
    [mode, names, tr, viewerSeat],
  );

  const errorText = useCallback(
    (error?: MoveError) => (error && ERROR_KEYS[error] ? tr(ERROR_KEYS[error] as MessageKey) : tr('invalidCombo')),
    [tr],
  );

  const actBid = useCallback(
    (value: number) => {
      if (!canBidNow) return;
      if (isGuest) {
        guest?.sendIntent({ type: 'bid', value });
        return;
      }
      const result = bid(state, actSeat, value, Math.random);
      if (!result.ok) {
        setToast(errorText(result.error));
        return;
      }
      commit(result.state, state, mode, 'bid');
    },
    [actSeat, canBidNow, commit, errorText, guest, isGuest, mode, state],
  );

  const actPlay = useCallback(() => {
    if (!canPlayNow || selectedCards.length === 0) return;
    if (!selectionCombo || !selectionBeats) {
      setToast(selectionCombo ? tr('cannotBeat') : tr('invalidCombo'));
      return;
    }
    if (isGuest) {
      guest?.sendIntent({ type: 'play', cardIds: selectedCards.map((card) => card.id) });
      setSelected(new Set());
      return;
    }
    const result = play(state, actSeat, selectedCards);
    if (!result.ok) {
      setToast(errorText(result.error));
      return;
    }
    commit(result.state, state, mode, 'play');
  }, [
    actSeat,
    canPlayNow,
    commit,
    errorText,
    guest,
    isGuest,
    mode,
    selectedCards,
    selectionBeats,
    selectionCombo,
    state,
    tr,
  ]);

  const actPass = useCallback(() => {
    if (!canPlayNow || !shownView?.canPass) return;
    if (isGuest) {
      guest?.sendIntent({ type: 'pass' });
      return;
    }
    const result = pass(state, actSeat);
    if (!result.ok) {
      setToast(errorText(result.error));
      return;
    }
    commit(result.state, state, mode, 'pass');
  }, [actSeat, canPlayNow, commit, errorText, guest, isGuest, mode, shownView?.canPass, state]);

  const toggleCard = useCallback(
    (id: string) => {
      if (!canPlayNow || covered) return;
      setHinted(new Set());
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [canPlayNow, covered],
  );

  const showHint = useCallback(() => {
    if (isLan || covered || !shownView) return;
    const seat = actSeat;
    if (shownPhase === 'bidding') {
      const hint = bidHint(state, seat);
      setSelected(new Set());
      setHinted(new Set());
      setToast(tr(BID_KEYS[hint.reason], { n: hint.value }));
      return;
    }
    if (shownPhase !== 'playing') return;
    const hint = hintPlay(state, seat);
    if (!hint.cards || hint.cards.length === 0) {
      setSelected(new Set());
      setHinted(new Set());
      setToast(tr(HINT_KEYS[hint.reason]));
      return;
    }
    const cards = state.hands[seat].filter((card) => hint.cards?.includes(card.id));
    const combo = detectCombo(cards);
    setSelected(new Set(hint.cards));
    setHinted(new Set(hint.cards));
    setToast(
      tr(HINT_KEYS[hint.reason], {
        combo: combo ? comboName(combo.kind, lang) : '',
        n: hint.cards.length,
      }),
    );
  }, [actSeat, covered, isLan, lang, shownPhase, shownView, state, tr]);

  const revealCover = useCallback(() => {
    setCurtain(false);
  }, []);

  const revealHand = revealCover;

  // AI seats: solo, LAN host AI fill, and disconnected guests.
  useEffect(() => {
    if (screen !== 'game' || isGuest || mode === 'local') return;
    if (state.phase !== 'bidding' && state.phase !== 'playing') return;
    const turn = state.turn;
    if (turn < 0) return;
    const human =
      mode === 'ai' ? turn === 0 : mode === 'lan-host' ? humanSeatsRef.current.includes(turn) : true;
    if (human) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.turn !== turn || current.phase === 'over') {
        setAiThinking(false);
        return;
      }
      if (current.phase === 'bidding') {
        const value = chooseBid(current, turn, level, Math.random);
        const result = bid(current, turn, value, Math.random);
        setAiThinking(false);
        if (result.ok) commit(result.state, current, mode, 'bid');
        return;
      }
      const ids = chooseCards(current, turn, level, Math.random);
      if (ids && ids.length > 0) {
        const result = play(current, turn, ids);
        setAiThinking(false);
        if (result.ok) commit(result.state, current, mode, 'play');
        else {
          const fallback = pass(current, turn);
          if (fallback.ok) commit(fallback.state, current, mode, 'pass');
        }
        return;
      }
      const result = pass(current, turn);
      setAiThinking(false);
      if (result.ok) commit(result.state, current, mode, 'pass');
    }, 430);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, humanSeats, isGuest, level, mode, screen, state]);

  // Guest result sound is based only on the guest's own side.
  useEffect(() => {
    if (mode !== 'lan-guest' || !guestView?.result || !soundOn) return;
    const key = `${guestView.seat}-${guestView.result.winnerSeat}-${guestView.result.stake}`;
    if (guestResultRef.current === key) return;
    guestResultRef.current = key;
    const side = guestView.isLandlord ? 'landlord' : 'farmers';
    chime(side === guestView.result.winnerSide ? 'win' : 'lose');
  }, [guestView, mode, soundOn]);

  const keyboard = useCallback(
    (event: KeyboardEvent) => {
      if (screen === 'game') {
        if (event.key === 'Escape') {
          event.preventDefault();
          goHome();
          return;
        }
        if (shownPhase === 'bidding' && canBidNow) {
          if (event.key >= '1' && event.key <= '3') {
            event.preventDefault();
            actBid(Number(event.key));
            return;
          }
          if (event.key === '0' || event.key.toLowerCase() === 'p') {
            event.preventDefault();
            actBid(0);
            return;
          }
        }
        if (event.key.toLowerCase() === 'h') {
          event.preventDefault();
          showHint();
          return;
        }
        if (event.key.toLowerCase() === 'u') {
          event.preventDefault();
          undo();
          return;
        }
        if (shownPhase === 'playing') {
          const index = Number(event.key) - 1;
          if (Number.isInteger(index) && index >= 0 && index < ownHand.length) {
            event.preventDefault();
            toggleCard(ownHand[index].id);
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            actPlay();
            return;
          }
          if (event.key.toLowerCase() === 'p') {
            event.preventDefault();
            actPass();
          }
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        goHome();
      }
    },
    [actBid, actPass, actPlay, canBidNow, goHome, ownHand, screen, showHint, shownPhase, toggleCard, undo],
  );

  useEffect(() => {
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [keyboard]);

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
          <button className="ghost" onClick={() => setSoundOn((value) => !value)} data-testid="sound">
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-table">
          <div className="hero-scorebug">
            <span>54</span>
            <strong>3 · 17 + 3</strong>
          </div>
          <div className="hero-table-mark" aria-hidden="true">♠</div>
          <CardFan lang={lang} />
          <div className="hero-seat-lets" aria-hidden="true">
            <span>♣</span>
            <span>♦</span>
            <span>♥</span>
          </div>
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide with-note" onClick={resume} data-testid="continue">
                <span>{tr('continueGame')}</span>
                <small>{tr('savedOnDevice')}</small>
              </button>
            )}
            <button className={saved ? 'secondary wide with-note' : 'primary wide with-note'} onClick={startAi} data-testid="start-ai">
              <span>{tr('playSolo')}</span>
              <small>{tr('soloNote')}</small>
            </button>
            <button className="secondary wide with-note" onClick={() => startGame('local')} data-testid="start-local">
              <span>{tr('playLocal')}</span>
              <small>{tr('localNote')}</small>
            </button>
            <button className="secondary wide with-note" onClick={openLanHub} data-testid="start-lan">
              <span>{tr('playLan')}</span>
              <small>{tr('lanNote')}</small>
            </button>
          </div>
          <div className="menu-links">
            <button className="text-button" onClick={() => setScreen('rules')} data-testid="rules">
              {tr('rules')} →
            </button>
            <button className="text-button" onClick={() => setScreen('stats')} data-testid="stats">
              {tr('record')} →
            </button>
          </div>
          <div className="record-strip">
            <span>{tr('tableFacts')}</span>
            <span className="dot">·</span>
            <span>{tr('games')}</span>
            <strong>{record.games}</strong>
            <span className="dot">·</span>
            <span>{tr('bestStake')}</span>
            <b>{record.bestStake}</b>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('footer')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('setupTitle')}</h2>
      <div className="level-grid">
        {(['companion', 'easy', 'normal', 'hard'] as AiLevel[]).map((id) => (
          <button
            key={id}
            className={`level-card ${level === id ? 'selected' : ''}`}
            onClick={() => setLevel(id)}
            data-testid={`level-${id}`}
          >
            <span className={`level-dot ${id}`} />
            <strong>{levelName(id, lang)}</strong>
            <small>{tr((`${id}Note` as MessageKey))}</small>
          </button>
        ))}
      </div>
      <div className="row-actions">
        <button className="primary" onClick={() => startGame('ai')} data-testid="begin">
          {tr('beginMatch')}
        </button>
        <button className="ghost" onClick={() => setScreen('home')}>{tr('back')}</button>
      </div>
    </main>
  );

  const renderSeat = (seat: number) => {
    const playerName = labelFor(seat);
    const isLandlord = shownLandlord === seat;
    const active = shownTurn === seat && shownPhase !== 'over';
    const bid = shownView?.bids[seat];
    const last = shownView?.lastPlay?.seat === seat && shownPhase === 'playing'
      ? comboName(shownView.lastPlay.combo.kind, lang)
      : '';
    const count = shownView?.handCounts[seat] ?? 0;
    return (
      <div
        className={`seat-tile ${active ? 'is-active' : ''} ${isLandlord ? 'is-landlord' : ''}`}
        data-seat={seat}
        key={seat}
      >
        <div className="seat-head">
          <span className="seat-avatar">{seat + 1}</span>
          <div>
            <strong>{playerName}</strong>
            <span className="seat-role">{roleName(isLandlord, lang)}</span>
          </div>
          {isLandlord && <span className="crown" aria-label={tr('landlord')}>♛</span>}
        </div>
        <div className="seat-card-row">
          <CardBackStack count={count} label={tr('hiddenHand')} />
          <span className="seat-count">{tr('cardsLeft', { n: count })}</span>
        </div>
        <div className="seat-foot">
          {shownPhase === 'bidding' ? (
            <span className={`bid-pill ${bid === 0 ? 'is-pass' : ''}`}>
              {bid === null || bid === undefined
                ? tr('noBidYet')
                : bid === 0
                  ? tr('passBid')
                  : `${tr('bid')} ${bid}`}
            </span>
          ) : last || active ? (
            <span className={`last-pill ${last ? 'has-play' : ''}`}>
              {last || tr('yourTurn')}
            </span>
          ) : null}
          {active && aiThinking && !isGuest && !humanSeats.includes(seat) && <span className="thinking">…</span>}
        </div>
      </div>
    );
  };

  const gameContent = (
    <main
      className="shell game-shell"
      data-phase={shownPhase}
      data-turn={shownTurn}
      data-testid="game"
    >
      <header className="game-top">
        <button className="back" onClick={goHome}>← {tr('home')}</button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>{modeName(mode, lang)}</span>
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

      <div className="table-hud">
        <div className="hud-block">
          <span>{tr('dealN', { n: shownView?.deal ?? state.deal })}</span>
          <strong>{tr(shownPhase === 'bidding' ? 'bidding' : shownPhase === 'playing' ? 'playing' : 'over')}</strong>
        </div>
        <div className="hud-block hud-status">
          <span>
            {shownPhase === 'bidding'
              ? shownView?.highestBid
                ? tr('currentBid')
                : tr('noBidYet')
              : shownPhase === 'playing'
                ? shownTurn >= 0
                  ? tr('turnOf', { name: labelFor(shownTurn) })
                  : ''
                : tr('roundResult')}
          </span>
          <strong>
            {shownPhase === 'bidding'
              ? shownView?.highestBid
                ? `${shownView.highestBid} · ${labelFor(shownView.highestBidder)}`
                : tr('bidChoice')
              : shownPhase === 'playing'
                ? shownView?.lastPlay
                  ? `${labelFor(shownView.lastPlay.seat)} · ${comboName(shownView.lastPlay.combo.kind, lang)}`
                  : tr('leadPlay')
                : shownResult
                  ? sideName(shownResult.winnerSide, lang)
                  : ''}
          </strong>
        </div>
        <div className="hud-block hud-right">
          <span>{tr('multiplier')}</span>
          <strong>×{shownResult?.multiplier ?? shownView?.multiplier ?? 1}</strong>
        </div>
      </div>

      <section className="table-stage">
        <div className="opponents">
          {renderSeat(2)}
          {renderSeat(1)}
        </div>

        <div className="table-centre">
          <div className="bottom-strip">
            <span className="bottom-label">{tr('bottomCards')}</span>
            <div className="bottom-cards">
              {shownView && shownView.bottom.length === 3
                ? shownView.bottom.map((card) => (
                    <PlayingCard key={card.id} card={card} lang={lang} small />
                  ))
                : [0, 1, 2].map((index) => (
                    <CardBack key={index} small label={tr('bottomHidden')} />
                  ))}
            </div>
            {shownPhase === 'bidding' && <span className="bottom-note">{tr('bottomHidden')}</span>}
          </div>

          <div className="trick-area" data-testid="trick-area">
            {shownView?.lastPlay ? (
              <>
                <div className="trick-cards">
                  {shownView.lastPlay.cards.map((card) => (
                    <PlayingCard key={card.id} card={card} lang={lang} small />
                  ))}
                </div>
                <div className="trick-meta">
                  <strong>{labelFor(shownView.lastPlay.seat)}</strong>
                  <span>{comboName(shownView.lastPlay.combo.kind, lang)}</span>
                </div>
              </>
            ) : (
              <div className="trick-empty">
                <span className="trick-mark">♠</span>
                <strong>
                  {shownPhase === 'bidding'
                    ? shownView?.highestBid
                      ? `${tr('currentBid')} ${shownView.highestBid}`
                      : tr('bidChoice')
                    : shownPhase === 'over'
                      ? tr('roundResult')
                      : shownView?.canPlay
                        ? tr('yourTurn')
                        : tr('lead')}
                </strong>
                {shownPhase === 'playing' && <span>{tr('leadPlay')}</span>}
              </div>
            )}
          </div>

          {shownPhase === 'bidding' && !covered && (
            <div className="bid-panel" data-testid="bid-panel">
              {canBidNow ? (
                <>
                  <span className="panel-kicker">{tr('yourBid')}</span>
                  <div className="bid-buttons">
                    {[1, 2, 3].map((value) => (
                      <button
                        key={value}
                        className="bid-button"
                        disabled={value <= (shownView?.highestBid ?? 0)}
                        onClick={() => actBid(value)}
                        data-testid={`bid-${value}`}
                      >
                        {value}
                      </button>
                    ))}
                    <button className="bid-button is-pass" onClick={() => actBid(0)} data-testid="bid-pass">
                      {tr('passBid')}
                    </button>
                  </div>
                  <span className="panel-note">
                    {shownView?.highestBid
                      ? tr('minBid', { n: shownView.highestBid })
                      : tr('bidHint')}
                  </span>
                  {!isLan && (
                    <button className="panel-hint" onClick={showHint} data-testid="hint-bid">
                      {tr('hint')}
                    </button>
                  )}
                </>
              ) : (
                <div className="waiting-panel">
                  <span className="thinking-dot" />
                  <strong>{tr('waitingBid', { name: labelFor(shownTurn) })}</strong>
                  <span>{tr('bidHint')}</span>
                </div>
              )}
            </div>
          )}

        </div>

        <div className={`hand-dock ${covered ? 'is-covered' : ''}`}>
          {covered ? (
            <div className="privacy-cover" data-testid="privacy-cover">
              <span className="privacy-kicker">{tr('coveredHand')}</span>
              <strong>{tr('passDevice', { name: labelFor(shownTurn) })}</strong>
              <span className="privacy-note">{tr('localNote')}</span>
              <button className="primary" onClick={revealHand} data-testid="reveal">
                {tr('showHand')}
              </button>
            </div>
          ) : isGuestWaiting() ? (
            <div className="waiting-panel">
              <span className="thinking-dot" />
              <strong>{tr('waitingHost')}</strong>
            </div>
          ) : (
            <>
              <div className="hand-head">
                <div>
                  <span className="panel-kicker">{labelFor(actSeat, actSeat)}</span>
                  <strong>{tr('yourHand')}</strong>
                  <span className="hand-count">{tr('cardsLeft', { n: ownHand.length })}</span>
                </div>
                <div className="hand-tools">
                  {shownPhase === 'playing' && (
                    <>
                      <button className="secondary" onClick={showHint} disabled={isLan || !shownView?.canPlay} data-testid="hint">
                        {tr('hint')}
                      </button>
                      <button className="secondary" onClick={undo} disabled={isLan || history.length === 0} data-testid="undo">
                        {tr('undo')}
                      </button>
                    </>
                  )}
                  <span className={`role-chip ${shownLandlord === actSeat ? 'is-landlord' : ''}`}>
                    {roleName(shownLandlord === actSeat, lang)}
                  </span>
                </div>
              </div>
              <Hand
                cards={ownHand}
                lang={lang}
                selected={selected}
                hinted={hinted}
                disabled={!canPlayNow}
                onToggle={toggleCard}
                ariaLabel={tr('hand')}
              />
              {shownPhase === 'playing' && (
                <div className="hand-actions">
                  <div className="selection-info">
                    <span>{tr('selectedN', { n: selectedCards.length })}</span>
                    {selectionCombo ? (
                      <strong className={selectionBeats ? 'is-ok' : 'is-bad'}>
                        {comboName(selectionCombo.kind, lang)}
                      </strong>
                    ) : selectedCards.length > 0 ? (
                      <strong className="is-bad">{tr('invalidCombo')}</strong>
                    ) : (
                      <strong className="muted">{tr('chooseCards')}</strong>
                    )}
                  </div>
                  <div className="action-buttons">
                    <button
                      className="primary"
                      onClick={actPlay}
                      disabled={!canPlayNow || selectedCards.length === 0 || !selectionCombo || !selectionBeats}
                      data-testid="play"
                    >
                      {tr('playSelected')}
                    </button>
                    <button
                      className="secondary"
                      onClick={actPass}
                      disabled={!canPlayNow || !shownView?.canPass}
                      data-testid="pass"
                    >
                      {tr('passTurn')}
                    </button>
                  </div>
                </div>
              )}
              <p className="keyboard-line">
                {shownPhase === 'bidding' ? tr('bidKeys') : tr('turnHint')}
              </p>
            </>
          )}
        </div>
      </section>

      {shownPhase === 'over' && shownResult && (
        <div className="result-panel" data-testid="result">
          <span className="result-kicker">{tr('roundResult')}</span>
          <span className="result-winner">
            {tr('winnerSeat', { name: labelFor(shownResult.winnerSeat) })}
          </span>
          <h2 className="result-title">{sideName(shownResult.winnerSide, lang)}</h2>
          <div className="result-grid">
            <div><span>{tr('base')}</span><strong>{shownResult.base}</strong></div>
            <div><span>{tr('bombs')}</span><strong>{shownResult.bombs}</strong></div>
            <div><span>{tr('spring')}</span><strong>{shownResult.spring ? '×2' : '—'}</strong></div>
            <div><span>{tr('multiplier')}</span><strong>×{shownResult.multiplier}</strong></div>
            <div><span>{tr('stake')}</span><strong>{shownResult.stake}</strong></div>
            <div><span>{tr('landlordPoints')}</span><strong className={shownResult.landlordPoints >= 0 ? 'up' : 'down'}>{shownResult.landlordPoints}</strong></div>
            <div><span>{tr('farmerPoints')}</span><strong className={shownResult.farmerPoints >= 0 ? 'up' : 'down'}>{shownResult.farmerPoints}</strong></div>
          </div>
          <div className="result-actions">
            {!isGuest && (
              <button
                className="primary"
                onClick={() => (mode === 'lan-host' ? startLanMatch() : startGame(mode === 'local' ? 'local' : 'ai'))}
                data-testid="play-again"
              >
                {tr('playAgain')}
              </button>
            )}
            <button className="secondary" onClick={goHome}>{tr('home')}</button>
          </div>
          {isGuest && <span className="result-note">{tr('waitingHost')}</span>}
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell rules-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <div className="rule-grid">
        {RULES.map((rule) => (
          <section className="rule-card" key={rule.title}>
            <h3>{tr(rule.title)}</h3>
            <p>{tr(rule.body)}</p>
          </section>
        ))}
      </div>
      <button className="primary" onClick={() => setScreen('home')}>{tr('ruleBackHome')}</button>
    </main>
  );

  const statsScreen = (
    <main className="shell narrow-shell stats-shell" data-testid="stats">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('statsTitle')}</h2>
      <div className="stats-grid">
        <div className="stat-card"><span>{tr('totalGames')}</span><strong>{record.games}</strong></div>
        <div className="stat-card"><span>{tr('landlordWins')}</span><strong>{record.landlordWins}</strong></div>
        <div className="stat-card"><span>{tr('farmerWins')}</span><strong>{record.farmerWins}</strong></div>
        <div className="stat-card"><span>{tr('bestStakeLabel')}</span><strong>{record.bestStake}</strong></div>
      </div>
      <div className="stats-sub">
        <div><span>{tr('totalStake')}</span><strong>{record.totalStake}</strong></div>
        <div>
          <span>{tr('byMode')}</span>
          <strong>
            {tr('soloMode')} {record.byMode.ai} · {tr('localMode')} {record.byMode.local} · {tr('lanMode')} {record.byMode.lan}
          </strong>
        </div>
      </div>
      <h3 className="section-label">{tr('recentGames')}</h3>
      {record.recent.length === 0 ? (
        <p className="empty-note">{tr('noGames')}</p>
      ) : (
        <div className="recent-list">
          {record.recent.map((entry, index) => (
            <div className="recent-row" key={`${entry.at}-${index}`}>
              <span className={`side-dot ${entry.side}`} />
              <div className="recent-main">
                <strong>{sideName(entry.side, lang)} · {entry.stake}</strong>
                <span>
                  {entry.mode === 'ai' ? tr('soloMode') : entry.mode === 'local' ? tr('localMode') : tr('lanMode')}
                  {entry.spring ? ` · ${tr('springShort')}` : ''}
                  {entry.bombs > 0 ? ` · ${tr('bombsShort', { n: entry.bombs })}` : ''}
                </span>
              </div>
              <span className="recent-date">{formatDate(entry.at, lang)}</span>
            </div>
          ))}
        </div>
      )}
      <button className="text-button danger-text" onClick={resetRecord} data-testid="clear-record">
        {clearArmed ? tr('clearConfirm') : tr('clearRecord')}
      </button>
    </main>
  );

  const lanHub = (
    <>
      {lanError && <p className="error">{lanError}</p>}
      <div className="lan-choice-grid">
        <section className="lan-card">
          <span className="panel-kicker">{tr('lanHost')}</span>
          <h3>{tr('createRoom')}</h3>
          <label className="field">
            <span>{tr('hostName')}</span>
            <input
              value={hostName}
              onChange={(event) => setHostName(event.target.value)}
              placeholder={tr('host')}
              maxLength={18}
              data-testid="host-name"
            />
          </label>
          <button className="primary wide" onClick={openLanHost} disabled={lanBusy} data-testid="lan-create">
            {lanBusy ? tr('lanStarting') : tr('createRoom')}
          </button>
          <span className="card-note">{tr('lanHostNote')}</span>
        </section>
        <section className="lan-card">
          <span className="panel-kicker">{tr('lanGuestTitle')}</span>
          <h3>{tr('joinRoom')}</h3>
          <span className="card-note">{tr('lanJoinNote')}</span>
          <button className="secondary wide" onClick={openLanJoin} data-testid="lan-join-open">
            {tr('joinRoom')}
          </button>
        </section>
      </div>
    </>
  );

  const guestForm = (
    <section className="lan-form-card">
      <span className="panel-kicker">{tr('lanGuestTitle')}</span>
      <div className="lan-form">
        <label className="field">
          <span>{tr('yourName')}</span>
          <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={18} placeholder={tr('namePlaceholder')} data-testid="guest-name" />
        </label>
        <label className="field">
          <span>{tr('roomCode')}</span>
          <input value={guestCode} onChange={(event) => setGuestCode(event.target.value)} inputMode="numeric" maxLength={4} placeholder={tr('codePlaceholder')} data-testid="guest-code" />
        </label>
        <button className="primary wide" onClick={joinGuest} disabled={guestConnecting || !guestName.trim()} data-testid="guest-join">
          {guestConnecting ? tr('connecting') : tr('join')}
        </button>
      </div>
      {lanError && <p className="error">{lanError}</p>}
    </section>
  );

  const hostLobby = lanHost ? (
    <div className="lan-lobby">
      <div className="lan-card lobby-main waiting-card">
        <span className="panel-kicker">{tr('roomCode')}</span>
        <div className="room-code big" data-testid="room-code">{lanCode}</div>
        <div className="peer-list">
          {[0, 1, 2].map((seat) => {
            const player = lanPlayers[seat];
            const online = seat === 0 || Boolean(player?.connected);
            return (
              <span key={seat} className={`peer-chip ${online ? 'online' : ''}`}>
                <span className="peer-mark">{seat + 1}</span>
                <span>{seat === 0 ? (hostName.trim() || tr('host')) : player?.name || tr('guest')}</span>
                <b>{online ? tr('guestOnline') : tr('guestOffline')}</b>
              </span>
            );
          })}
        </div>
        <p className={`status-line ${lanPlayers.filter((player) => player.connected && !player.host).length >= 2 ? 'ready' : ''}`}>
          {lanPlayers.filter((player) => player.connected && !player.host).length >= 2
            ? tr('tableReady')
            : tr('waitingGuests')}
        </p>
        <button
          className="primary wide"
          onClick={startLanMatch}
          disabled={lanPlayers.filter((player) => player.connected && !player.host).length < 2}
          data-testid="lan-start"
        >
          {tr('lanStart')}
        </button>
        <button className="secondary wide" onClick={copyInvite} disabled={!lanInvite}>
          {tr('copyInvite')}
        </button>
        <span className="card-note">{tr('lanPrivate')}</span>
        {lanError && <p className="error">{lanError}</p>}
      </div>
      <div className="qr-card">
        {lanQr && <img src={lanQr} alt={tr('scanToJoin')} />}
        <p>{tr('scanToJoin')}</p>
        <a className="invite-link" href={lanInvite} data-testid="invite-link">{lanInvite.replace(/^https?:\/\//, '')}</a>
      </div>
    </div>
  ) : (
    <div className="lan-waiting">
      <span className="thinking-dot" />
      <strong>{lanBusy ? tr('lanStarting') : tr('lanWaiting')}</strong>
      {lanError && <p className="error">{lanError}</p>}
    </div>
  );

  const guestWaiting = (
    <section className="lan-card lan-form-card waiting-card">
      <span className="panel-kicker">{tr('roomCode')}</span>
      <div className="room-code big">{guestRoom || guestCode}</div>
      <p className="status-line">{guestStarted ? tr('lanGuestWaiting') : tr('lanWaiting')}</p>
      <span className="card-note">{tr('lanPrivate')}</span>
      {lanError && <p className="error">{lanError}</p>}
    </section>
  );

  const lanScreen = (
    <main className="shell narrow-shell lan-shell" data-testid="lan">
      <button className="back" onClick={goHome}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('lanTitle')}</h2>
      {lanRole === 'guest' ? (
        guest ? guestWaiting : guestForm
      ) : lanRole === 'host' ? (
        hostLobby
      ) : (
        lanHub
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameContent;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
