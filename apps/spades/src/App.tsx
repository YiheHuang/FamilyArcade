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
  chooseBid,
  chooseCard,
  hintBid,
  hintPlay,
  type AiLevel,
} from './ai/ai';
import {
  BidCover,
  BidPanel,
  Curtain,
  MatchSheet,
  RoundSheet,
  Scoreboard,
  SeatBadge,
  TrickArea,
  type TablePlayer,
} from './components/Board';
import { CardBack, CardFan, Hand } from './components/Cards';
import {
  bid,
  cardId,
  nextRound,
  play,
  reveal,
  setup,
  teamOf,
  view,
  type GameState,
  type Seat,
  type SeatView,
} from './game/spades';
import { demoMatch, demoRound } from './demo';
import { cardName, detectLang, t, type Lang, type MessageKey } from './i18n';
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
import { chime, type SoundKind } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'stats' | 'rules' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type LanRole = 'hub' | 'host' | 'guest';

const AI_LEVELS_UI: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionNote' },
  { id: 'easy', label: 'easy', note: 'easyNote' },
  { id: 'normal', label: 'normal', note: 'normalNote' },
  { id: 'hard', label: 'hard', note: 'hardNote' },
];

const SEAT_KEYS: MessageKey[] = ['seatSouth', 'seatWest', 'seatNorth', 'seatEast'];

const DEMO_KIND =
  typeof location !== 'undefined' ? new URLSearchParams(location.search).get('demo') : null;
const DEMO_STATE: GameState | null =
  DEMO_KIND === 'round' ? demoRound() : DEMO_KIND === 'end' ? demoMatch() : null;

function recordModeFor(mode: Mode): RecordMode {
  if (mode === 'ai') return 'ai';
  if (mode === 'lan-host') return 'lan';
  return 'local';
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

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() =>
    DEMO_STATE ? 'game' : invite ? 'lan' : 'home',
  );
  const [mode, setMode] = useState<Mode>(() =>
    DEMO_STATE ? 'ai' : invite ? 'lan-guest' : 'ai',
  );
  const [level, setLevel] = useState<AiLevel>('normal');
  const [blindNilSetting, setBlindNilSetting] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.spades.blind') !== 'off';
    } catch {
      return true;
    }
  });
  const [state, setState] = useState<GameState>(() =>
    DEMO_STATE ?? setup({ rng: Math.random, dealer: 3, target: 500, blindNil: true }),
  );
  const [history, setHistory] = useState<GameState[]>([]);
  const [hintCard, setHintCard] = useState<string | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => (DEMO_STATE ? null : loadSave()));
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.spades.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [curtain, setCurtain] = useState(false);

  const [lanRole, setLanRole] = useState<LanRole>(() => (invite ? 'guest' : 'hub'));
  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [humanSeats, setHumanSeats] = useState<number[]>([0]);
  const [hostName, setHostName] = useState(() => {
    try {
      return localStorage.getItem('familyarcade.spades.hostName') ?? '';
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
  const hostRef = useRef<LanHost | null>(null);
  const hostStartedRef = useRef(false);
  const autoJoinRef = useRef(false);
  const lanActiveRef = useRef(false);
  const humanSeatsRef = useRef<number[]>([0]);
  const guestJoinSeqRef = useRef(0);
  const hostCreateSeqRef = useRef(0);
  const recordedRef = useRef(Boolean(DEMO_STATE));
  const guestSoundRef = useRef<{
    phase: string;
    tricks: number;
    bids: string;
    trick: string;
  } | null>(null);

  const tr = useCallback((key: MessageKey) => t(lang, key), [lang]);
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
    document.title = lang === 'zh' ? '黑桃皇后' : 'Spades';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.spades.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.spades.blind', blindNilSetting ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [blindNilSetting]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.spades.hostName', hostName);
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
    setToast('');
  }, [screen]);

  useEffect(() => {
    if (screen !== 'stats') setClearArmed(false);
  }, [screen]);

  const sendViews = useCallback((next: GameState) => {
    const host = hostRef.current;
    if (!host) return;
    for (const seat of humanSeatsRef.current) {
      if (seat === 0) continue;
      host.sendView(seat, view(next, seat));
    }
  }, []);

  const finishMatch = useCallback(
    (next: GameState, currentMode: Mode) => {
      if (next.phase !== 'done' || recordedRef.current || next.winner === null) return;
      recordedRef.current = true;
      if (currentMode !== 'lan-guest') {
        setRecord(
          recordResult(
            { winner: next.winner, scores: next.scores, rounds: next.round },
            {
              mode: recordModeFor(currentMode),
              level: currentMode === 'ai' ? level : undefined,
            },
          ),
        );
      }
      if (soundOn) chime(next.winner === 0 ? 'win' : 'lose');
    },
    [level, soundOn],
  );

  const commit = useCallback(
    (
      next: GameState,
      previous: GameState,
      currentMode: Mode,
      soundKind: SoundKind | null = 'play',
    ) => {
      stateRef.current = next;
      setState(next);
      setHintCard(null);
      if (currentMode === 'ai' || currentMode === 'local') {
        setHistory((items) => [...items, previous]);
      }
      if (soundKind && next.phase !== 'done' && next.phase !== 'round-over') {
        if (soundOn) {
          chime(next.tricks.length > previous.tricks.length ? 'trick' : soundKind);
        }
      }
      if (soundOn && next.phase === 'round-over') chime('round');
      finishMatch(next, currentMode);
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.phase === 'done') {
          clearSave();
          setSaved(null);
        } else {
          setSaved(saveGame({ state: next, mode: currentMode, level }));
        }
      }
      if (currentMode === 'lan-host') sendViews(next);
      if (currentMode === 'local') {
        if (next.phase === 'playing' && (previous.phase !== 'playing' || next.turn !== previous.turn)) {
          setCurtain(true);
        } else if (next.phase !== 'playing') {
          setCurtain(false);
        }
      }
    },
    [finishMatch, level, sendViews, soundOn],
  );

  const startMatch = useCallback(
    (nextMode: 'ai' | 'local') => {
      const next = setup({
        rng: Math.random,
        dealer: 3,
        target: 500,
        blindNil: blindNilSetting,
      });
      stateRef.current = next;
      recordedRef.current = false;
      setMode(nextMode);
      setState(next);
      setHistory([]);
      setHintCard(null);
      setAiThinking(false);
      setCurtain(false);
      setScreen('game');
      setToast('');
      clearSave();
      setSaved(null);
    },
    [blindNilSetting],
  );

  const startAi = useCallback(() => {
    setMode('ai');
    setScreen('setup');
  }, []);

  const resume = useCallback(() => {
    if (!saved) return;
    stateRef.current = saved.state;
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    setHistory([]);
    setHintCard(null);
    setAiThinking(false);
    const done = saved.state.phase === 'done';
    recordedRef.current = done;
    setCurtain(saved.mode === 'local' && saved.state.phase === 'playing');
    setScreen('game');
  }, [saved]);

  const undo = useCallback(() => {
    if (history.length === 0 || isLan) return;
    if (state.phase !== 'bidding' && state.phase !== 'playing') return;
    let previous: GameState | null = null;
    let nextHistory: GameState[] = [];
    if (mode === 'ai') {
      let index = history.length - 1;
      while (index >= 0) {
        const item = history[index];
        if ((item.phase === 'bidding' || item.phase === 'playing') && item.turn === 0) {
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
    setHistory(nextHistory);
    setState(previous);
    setHintCard(null);
    setAiThinking(false);
    setCurtain(
      mode === 'local' &&
        (previous.phase === 'playing' ||
          (previous.phase === 'bidding' && previous.turn >= 0 && previous.seen[previous.turn])),
    );
    if (previous.phase !== 'done') {
      setSaved(saveGame({ state: previous, mode: mode === 'ai' ? 'ai' : 'local', level }));
    }
  }, [history, isLan, level, mode, state.phase]);

  const showHint = useCallback(() => {
    if (screen !== 'game' || isLan) return;
    if (curtain) return;
    if (state.phase !== 'bidding' && state.phase !== 'playing') return;
    const seatTurn = mode === 'local' ? state.turn : 0;
    if (seatTurn < 0) return;
    const seat = seatTurn as Seat;
    if (mode === 'ai' && state.turn !== 0) return;

    if (state.phase === 'bidding') {
      const hint = hintBid(state, seat);
      if (!hint) return;
      setHintCard(null);
      const keys: Record<typeof hint.kind, MessageKey> = {
        nil: 'hintBidNil',
        partnerCover: 'hintBidPartner',
        strongSpades: 'hintBidSpades',
        sideAces: 'hintBidAces',
        bagGuard: 'hintBidBag',
        balanced: 'hintBidBalanced',
      };
      setToast(t(lang, keys[hint.kind], { n: hint.value }));
      return;
    }

    const hint = hintPlay(state, seat);
    if (!hint) return;
    const card = state.hands[seat].find((item) => cardId(item) === hint.cardId);
    if (!card) return;
    setHintCard(hint.cardId);
    const keys: Record<typeof hint.kind, MessageKey> = {
      win: 'hintWin',
      lead: 'hintLead',
      follow: 'hintFollow',
      duck: 'hintDuck',
      trump: 'hintTrump',
      coverNil: 'hintCoverNil',
      bagGuard: 'hintBag',
      low: 'hintLow',
    };
    setToast(t(lang, keys[hint.kind], { card: cardName(lang, card) }));
  }, [curtain, isLan, lang, mode, screen, state]);

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
        created.sendLobby();
        if (hostStartedRef.current) {
          const connected = players
            .filter((player) => player.connected && !player.host)
            .map((player) => player.seat);
          const nextHumans = [0, ...connected];
          humanSeatsRef.current = nextHumans;
          setHumanSeats(nextHumans);
          for (const seat of connected) {
            created.sendView(seat, view(stateRef.current, seat));
          }
        }
      });
      created.onIntent((seat, intent) => {
        if (hostRef.current !== created) return;
        if (!humanSeatsRef.current.includes(seat)) return;
        const value = intent as
          | { type?: string; value?: number; blind?: boolean; cardId?: string }
          | null;
        if (!value) return;
        const current = stateRef.current;
        if (value.type === 'reveal') {
          const next = reveal(current, seat);
          if (next !== current) commit(next, current, 'lan-host', null);
          else created.sendView(seat, view(current, seat));
          return;
        }
        if (value.type === 'bid') {
          const result = bid(current, seat, Number(value.value), Boolean(value.blind));
          if (result.ok) commit(result.state, current, 'lan-host', 'bid');
          return;
        }
        if (value.type === 'play' && typeof value.cardId === 'string') {
          const result = play(current, seat, value.cardId);
          if (result.ok) commit(result.state, current, 'lan-host', 'play');
        }
      });
      created.onClose(() => {
        if (hostRef.current !== created) return;
        hostRef.current = null;
        hostStartedRef.current = false;
        setLanHost(null);
        setLanPlayers([]);
        setLanError(t(lang, 'lanHostLost'));
      });
      const url = inviteUrl(info, code, code, lang === 'zh' ? '访客' : 'Guest');
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        color: { dark: '#1f3b2f', light: '#fffaf0' },
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

  const startLanMatch = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open') return;
    const connected = lanPlayers
      .filter((player) => player.connected && !player.host)
      .map((player) => player.seat);
    if (connected.length === 0) return;
    const humans = [0, ...connected];
    humanSeatsRef.current = humans;
    setHumanSeats(humans);
    const next = setup({
      rng: Math.random,
      dealer: 3,
      target: 500,
      blindNil: blindNilSetting,
    });
    stateRef.current = next;
    recordedRef.current = false;
    setState(next);
    setHistory([]);
    setHintCard(null);
    setAiThinking(false);
    setCurtain(false);
    setLanError('');
    setMode('lan-host');
    setScreen('game');
    hostStartedRef.current = true;
    host.start({ target: next.target });
    host.sendLobby();
    for (const seat of humans) {
      if (seat !== 0) host.sendView(seat, view(next, seat));
    }
  }, [blindNilSetting, lanPlayers]);

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

  const restartMatch = useCallback(() => {
    if (isGuest) return;
    if (mode === 'lan-host') {
      startLanMatch();
      return;
    }
    startMatch(mode === 'local' ? 'local' : 'ai');
  }, [isGuest, mode, startLanMatch, startMatch]);

  const nextRoundAction = useCallback(() => {
    if (isGuest) return;
    const result = nextRound(state, Math.random);
    if (!result.ok) return;
    commit(result.state, state, mode, null);
  }, [commit, isGuest, mode, state]);

  const revealSeat = useCallback(
    (seat: number) => {
      if (isGuest) {
        guest?.sendIntent({ type: 'reveal' });
        return;
      }
      if (!humanSeats.includes(seat) && mode === 'lan-host') return;
      if (mode === 'ai' && seat !== 0) return;
      if (mode === 'local' && seat !== state.turn) return;
      if (mode === 'lan-host' && seat !== 0) return;
      const next = reveal(state, seat);
      if (next !== state) commit(next, state, mode, null);
    },
    [commit, guest, humanSeats, isGuest, mode, state],
  );

  const bidSeat = useCallback(
    (seat: number, value: number, blind = false) => {
      if (isGuest) {
        if (guestView?.canBid) guest?.sendIntent({ type: 'bid', value, blind });
        return;
      }
      if (mode === 'ai' && seat !== 0) return;
      if (mode === 'lan-host' && seat !== 0) return;
      if (mode === 'local' && curtain) return;
      const result = bid(state, seat, value, blind);
      if (!result.ok) return;
      commit(result.state, state, mode, 'bid');
    },
    [commit, curtain, guest, guestView, isGuest, mode, state],
  );

  const playSeat = useCallback(
    (seat: number, id: string) => {
      if (isGuest) {
        if (guestView?.canPlay && guestView.legal.includes(id)) {
          guest?.sendIntent({ type: 'play', cardId: id });
        }
        return;
      }
      if (mode === 'ai' && seat !== 0) return;
      if (mode === 'lan-host' && seat !== 0) return;
      if (mode === 'local' && curtain) return;
      const result = play(state, seat, id);
      if (!result.ok) return;
      commit(result.state, state, mode, 'play');
    },
    [commit, curtain, guest, guestView, isGuest, mode, state],
  );

  // AI replies. Paused when the game screen is not visible.
  useEffect(() => {
    if (screen !== 'game' || isGuest) return;
    if (state.phase !== 'bidding' && state.phase !== 'playing') return;
    const turn = state.turn;
    if (turn < 0) return;
    const human =
      mode === 'local' ||
      (mode === 'ai' && turn === 0) ||
      (mode === 'lan-host' && humanSeats.includes(turn));
    if (human) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const previous = stateRef.current;
      if (previous.phase === 'bidding') {
        const seatTurn = previous.turn;
        if (seatTurn < 0) return;
        const seat = seatTurn as Seat;
        const working = reveal(previous, seat);
        const choice = chooseBid(working, seat, level);
        const result = bid(working, seat, choice.value, choice.blind);
        setAiThinking(false);
        if (result.ok) commit(result.state, previous, mode, 'bid');
        return;
      }
      if (previous.phase === 'playing') {
        const seatTurn = previous.turn;
        if (seatTurn < 0) return;
        const seat = seatTurn as Seat;
        const id = chooseCard(previous, seat, level);
        const result = play(previous, seat, id);
        setAiThinking(false);
        if (result.ok) commit(result.state, previous, mode, 'play');
      }
    }, 420);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, humanSeats, isGuest, level, mode, screen, state]);

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
      if (event.key === 'u' || event.key === 'U') {
        event.preventDefault();
        undo();
        return;
      }
      if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        showHint();
        return;
      }
      const number = Number(event.key);
      if (!Number.isInteger(number) || event.key === '') return;
      const active = isGuest
        ? guestView
        : view(state, mode === 'local' ? (state.turn >= 0 ? state.turn : 0) : 0);
      if (!active) return;
      if (active.phase === 'bidding') {
        if (!active.seen || !active.canBid) return;
        if (number >= 0 && number <= 9) {
          event.preventDefault();
          bidSeat(active.seat, number);
        }
        return;
      }
      if (active.phase === 'playing') {
        if (!active.canPlay) return;
        if (number >= 1 && number <= Math.min(9, active.legal.length)) {
          event.preventDefault();
          playSeat(active.seat, active.legal[number - 1]);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bidSeat, goHome, guestView, isGuest, mode, playSeat, screen, showHint, state, undo]);

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

  // A guest gets the same audible cues from the host's public views.
  useEffect(() => {
    if (!guestView) {
      guestSoundRef.current = null;
      return;
    }
    if (!soundOn || !lanActiveRef.current) return;
    const total = guestView.tricksBySeat.reduce((sum, value) => sum + value, 0);
    const bids = JSON.stringify(guestView.bids);
    const trick = JSON.stringify(guestView.currentTrick);
    const previous = guestSoundRef.current;
    guestSoundRef.current = { phase: guestView.phase, tricks: total, bids, trick };
    if (!previous) return;
    if (guestView.phase === 'done' && previous.phase !== 'done') {
      chime(guestView.winner === guestView.team ? 'win' : 'lose');
    } else if (guestView.phase === 'round-over' && previous.phase !== 'round-over') {
      chime('round');
    } else if (total > previous.tricks) {
      chime('trick');
    } else if (bids !== previous.bids && guestView.phase === 'bidding') {
      chime('bid');
    } else if (trick !== previous.trick) {
      chime('play');
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

  const seatName = (seat: number): string => {
    if (mode === 'local') return t(lang, SEAT_KEYS[seat]);
    if (mode === 'ai') {
      if (seat === 0) return tr('you');
      if (seat === 2) return tr('partner');
      return t(lang, SEAT_KEYS[seat]);
    }
    const players = mode === 'lan-guest' ? guestPlayers : lanPlayers;
    const found = players.find((player) => player.seat === seat && player.connected);
    if (found?.name?.trim()) return found.name.trim();
    if (seat === 0) return hostName.trim() || tr('you');
    if (mode === 'lan-guest' && guest?.seat === seat) return guestName.trim() || t(lang, SEAT_KEYS[seat]);
    return t(lang, SEAT_KEYS[seat]);
  };

  const connectedSeats = new Set(
    (mode === 'lan-guest' ? guestPlayers : lanPlayers)
      .filter((player) => player.connected)
      .map((player) => player.seat),
  );
  if (mode === 'lan-guest' && guest?.seat !== undefined && guest.seat >= 0) {
    connectedSeats.add(guest.seat);
  }

  const isAISeat = (seat: number): boolean => {
    if (mode === 'local') return false;
    if (mode === 'ai') return seat !== 0;
    if (mode === 'lan-host') return !humanSeats.includes(seat);
    if (mode === 'lan-guest') return !connectedSeats.has(seat);
    return false;
  };

  const isHumanSeat = (seat: number): boolean => {
    if (mode === 'local') return true;
    if (mode === 'ai') return seat === 0;
    if (mode === 'lan-host') return humanSeats.includes(seat);
    if (mode === 'lan-guest') return connectedSeats.has(seat);
    return false;
  };

  const localView = view(
    state,
    mode === 'local' ? (state.turn >= 0 ? state.turn : 0) : 0,
  );
  const shownView: SeatView = guestView ?? localView;
  const shownPhase = shownView.phase;
  const shownTurn = shownView.turn;
  const currentName = shownTurn >= 0 ? seatName(shownTurn) : '';
  const teamNames: [string, string] = [tr('teamNS'), tr('teamEW')];
  const activeTeam = shownTurn >= 0 ? teamOf(shownTurn) : null;

  const tablePlayers: TablePlayer[] = [0, 1, 2, 3].map((seat) => ({
    seat: seat as 0 | 1 | 2 | 3,
    name: seatName(seat),
    bid: shownView.bids[seat],
    tricks: shownView.tricksBySeat[seat],
    dealer: shownView.dealer === seat,
    active: shownTurn === seat,
    isAI: isAISeat(seat),
  }));

  const showBidCover =
    screen === 'game' &&
    shownPhase === 'bidding' &&
    shownTurn === shownView.seat &&
    !shownView.seen &&
    isHumanSeat(shownView.seat);
  const showCurtain =
    screen === 'game' &&
    mode === 'local' &&
    (shownPhase === 'playing' || shownPhase === 'bidding') &&
    curtain &&
    shownTurn === shownView.seat &&
    shownView.hand.length > 0;
  const showHand =
    screen === 'game' &&
    (shownPhase === 'bidding' || shownPhase === 'playing') &&
    !showBidCover &&
    !showCurtain &&
    shownView.hand.length > 0;
  const canBidNow =
    screen === 'game' &&
    shownPhase === 'bidding' &&
    !showBidCover &&
    !showCurtain &&
    shownView.seen &&
    shownTurn === shownView.seat &&
    isHumanSeat(shownView.seat);
  const canPlayNow =
    screen === 'game' &&
    shownPhase === 'playing' &&
    !showCurtain &&
    shownView.canPlay &&
    isHumanSeat(shownView.seat);
  const handInteractive = canPlayNow && shownView.hand.length > 0;

  let statusHeadline = '';
  let statusDetail = '';
  if (showCurtain) {
    statusHeadline = t(lang, 'passTo', { name: currentName });
    statusDetail = tr('localHint');
  } else if (shownPhase === 'bidding') {
    if (shownTurn === shownView.seat && isHumanSeat(shownView.seat)) {
      statusHeadline = tr('yourBid');
      statusDetail = shownView.seen ? tr('bidPrompt') : tr('blindPrompt');
    } else {
      statusHeadline = t(lang, 'biddingNow', { name: currentName });
      statusDetail = tr('waitingTable');
    }
  } else if (shownPhase === 'playing') {
    if (shownTurn === shownView.seat && isHumanSeat(shownView.seat)) {
      statusHeadline = tr('yourTurn');
      statusDetail = tr('playCard');
    } else {
      statusHeadline = t(lang, 'turnToPlay', { name: currentName });
      statusDetail = tr('waitingTable');
    }
  } else if (shownPhase === 'round-over') {
    statusHeadline = t(lang, 'roundOver', { n: shownView.round });
    statusDetail = shownView.lastRound && shownView.lastRound.contractMade[shownView.team]
      ? tr('contractMade')
      : tr('contractSet');
  } else {
    statusHeadline = tr('matchOver');
    statusDetail = isGuest ? tr('waitHostMatch') : tr('matchRecorded');
  }

  const modeLabel =
    mode === 'ai'
      ? t(lang, level)
      : mode === 'local'
        ? tr('playLocal')
        : mode === 'lan-host'
          ? tr('lanHostTag')
          : tr('lanGuestTag');

  const hintAvailable =
    screen === 'game' &&
    !isLan &&
    !curtain &&
    ((shownPhase === 'bidding' && shownView.canBid && shownView.seen) ||
      (shownPhase === 'playing' && shownView.canPlay));
  const undoAvailable =
    screen === 'game' &&
    !isLan &&
    history.length > 0 &&
    (shownPhase === 'bidding' || shownPhase === 'playing');

  const share = (count: number) =>
    record.matches > 0 ? `${Math.round((count / record.matches) * 100)}%` : '0%';
  const noWinner = record.lastWinner === null ? tr('none') : teamNames[record.lastWinner];
  const modeLabelFor = (value: RecordMode) =>
    value === 'ai' ? tr('modeSolo') : value === 'local' ? tr('modeLocal') : tr('modeLan');

  const connectedGuests = lanPlayers.filter((player) => player.connected && !player.host);
  const guestOnline = connectedGuests.length > 0;
  const guestHostName = guestPlayers.find((player) => player.host)?.name;

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
          <div className="hero-scorebug">
            <span>{tr('targetValue')}</span>
            <strong>♠</strong>
          </div>
          <CardFan lang={lang} />
          <div className="hero-seat-lets">
            <span>♠</span>
            <span>♥</span>
            <span>♣</span>
            <span>♦</span>
          </div>
        </div>
        <div className="hero-copy">
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume} data-testid="save-continue">
                <span>{tr('continueGame')}</span>
                <small>
                  {saved.mode === 'ai' ? t(lang, saved.level) : tr('playLocal')} · {tr('savedOn')}
                </small>
              </button>
            )}
            <button
              className={saved ? 'secondary wide' : 'primary wide'}
              onClick={startAi}
              data-testid="start-ai"
            >
              <span>{tr('playSolo')}</span>
              <small>{tr('soloHint')}</small>
            </button>
            <button
              className="secondary wide"
              onClick={() => startMatch('local')}
              data-testid="start-local"
            >
              <span>{tr('playLocal')}</span>
              <small>{tr('localHint')}</small>
            </button>
            <button
              className="secondary wide"
              onClick={openLanHub}
              data-testid="start-lan"
            >
              <span>{tr('playLan')}</span>
              <small>{tr('lanHint')}</small>
            </button>
            <div className="menu-links">
              <button className="text-button" onClick={() => setScreen('rules')} data-testid="rules">
                {tr('rules')} →
              </button>
              <button className="text-button" onClick={() => setScreen('stats')} data-testid="stats">
                {tr('record')} →
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('recordMini')}</span>
            <strong>{record.matches}</strong>
            <span>{tr('matches')}</span>
            <span className="dot">·</span>
            <span>
              {teamNames[0]} {record.winsA}
            </span>
            <span className="dot">·</span>
            <span>
              {teamNames[1]} {record.winsB}
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
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('setupTitle')}</h2>
      <div className="setup-grid">
        <section className="setup-main">
          <h3 className="section-label">{tr('difficulty')}</h3>
          <div className="level-grid">
            {AI_LEVELS_UI.map((item) => (
              <button
                key={item.id}
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
        </section>
        <aside className="setup-side">
          <div className="settings-card">
            <span className="label">{tr('targetLabel')}</span>
            <strong className="target-number">500</strong>
            <span className="target-unit">{tr('pointsUnit')}</span>
            <p className="setting-note">{tr('targetNote')}</p>
          </div>
          <div className="settings-card">
            <div className="toggle-line">
              <div>
                <span className="label">{tr('blindNil')}</span>
                <p className="setting-note">{tr('blindNilNote')}</p>
              </div>
              <button
                type="button"
                className={`toggle ${blindNilSetting ? 'on' : ''}`}
                aria-pressed={blindNilSetting}
                onClick={() => setBlindNilSetting((value) => !value)}
                data-testid="blind-toggle"
              >
                <span />
              </button>
            </div>
            <span className="toggle-value">
              {blindNilSetting ? tr('blindOn') : tr('blindOff')}
            </span>
          </div>
          <div className="seat-map" aria-hidden="true">
            <span className="seat-map-north">{tr('seatNorth')}</span>
            <span className="seat-map-west">{tr('seatWest')}</span>
            <span className="seat-map-centre">♠</span>
            <span className="seat-map-east">{tr('seatEast')}</span>
            <span className="seat-map-south">{tr('seatSouth')}</span>
          </div>
        </aside>
      </div>
      <div className="row-actions">
        <button className="primary" onClick={() => startMatch('ai')} data-testid="begin">
          {tr('beginMatch')}
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
      data-phase={shownPhase}
      data-turn={shownTurn}
      data-round={shownView.round}
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
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} data-testid="language">
            {tr('language')}
          </button>
        </div>
      </header>

      <div className="game-layout">
        <section className="table-column">
          <Scoreboard
            lang={lang}
            scores={shownView.scores}
            bags={shownView.bags}
            contracts={shownView.contract}
            tricks={shownView.teamTricks}
            activeTeam={activeTeam}
            teamNames={teamNames}
            round={shownView.round}
            target={shownView.target}
          />

          <div className="table-zone">
            <div className="felt" aria-label={tr('tableLabel')}>
              <div className="felt-head">
                <span>
                  {teamNames[0]} · {teamNames[1]}
                </span>
                <span>{shownView.spadesBroken ? tr('spadesBroken') : tr('spadesUnbroken')}</span>
              </div>
              <SeatBadge player={tablePlayers[2]} lang={lang} className="seat-top" />
              <SeatBadge player={tablePlayers[1]} lang={lang} className="seat-left" />
              <TrickArea
                lang={lang}
                currentTrick={shownView.currentTrick}
                lastTrick={shownView.lastTrick}
                phase={shownView.phase}
                bidding={shownPhase === 'bidding'}
              >
                {canBidNow && (
                  <BidPanel lang={lang} title={tr('chooseBid')} onBid={(value) => bidSeat(shownView.seat, value)} />
                )}
              </TrickArea>
              <SeatBadge player={tablePlayers[3]} lang={lang} className="seat-right" />
              <div className="felt-foot">
                <span className="turn-copy" aria-live="polite">
                  <strong>{statusHeadline}</strong>
                  <small>{statusDetail}</small>
                </span>
                {aiThinking && <span className="thinking">…</span>}
              </div>
            </div>

            <div className="hand-dock">
              <div className="hand-head">
                <SeatBadge player={tablePlayers[shownView.seat]} lang={lang} compact />
                <span className="hand-meta">
                  {showHand
                    ? `${shownView.hand.filter((card) => card.suit === 'S').length} ♠`
                    : ''}
                </span>
              </div>
              {showBidCover ? (
                <BidCover
                  lang={lang}
                  title={
                    mode !== 'local'
                      ? tr('yourBid')
                      : t(lang, 'passTo', { name: seatName(shownView.seat) })
                  }
                  blindAvailable={shownView.blindAvailable}
                  onReveal={() => revealSeat(shownView.seat)}
                  onBlind={() => bidSeat(shownView.seat, 0, true)}
                />
              ) : showCurtain ? (
                <Curtain
                  lang={lang}
                  name={currentName}
                  onReveal={() => setCurtain(false)}
                />
              ) : showHand ? (
                <Hand
                  cards={shownView.hand}
                  lang={lang}
                  legal={handInteractive ? shownView.legal : []}
                  hint={hintCard}
                  disabled={!handInteractive}
                  onPlay={(id) => playSeat(shownView.seat, id)}
                />
              ) : (
                <div className="hand-waiting" data-testid="hand-waiting">
                  <div className="cover-back-fan" aria-hidden="true">
                    {Array.from({ length: 5 }, (_, index) => (
                      <CardBack key={index} lang={lang} index={index} total={5} />
                    ))}
                  </div>
                  <span>{shownPhase === 'bidding' ? tr('waitingTable') : tr('waitingLead')}</span>
                </div>
              )}
            </div>

            {shownPhase === 'round-over' && shownView.lastRound && (
              <RoundSheet
                lang={lang}
                summary={shownView.lastRound}
                teamNames={teamNames}
                seatNames={[0, 1, 2, 3].map(seatName)}
                canNext={!isGuest}
                onNext={nextRoundAction}
              />
            )}
            {shownPhase === 'done' && shownView.winner !== null && (
              <MatchSheet
                lang={lang}
                winner={shownView.winner}
                scores={shownView.scores}
                teamNames={teamNames}
                canRestart={!isGuest}
                canChangeLevel={mode === 'ai'}
                isGuest={isGuest}
                onChangeLevel={() => setScreen('setup')}
                onRestart={restartMatch}
              />
            )}
          </div>
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{tr('bids')}</h3>
            <ul className="bid-list">
              {[0, 1, 2, 3].map((seat) => (
                <li key={seat} className={shownTurn === seat ? 'active' : ''}>
                  <span className="bid-seat">{seatName(seat)}</span>
                  <span className="bid-value">
                    {shownView.bids[seat]
                      ? shownView.bids[seat]?.value === 0
                        ? shownView.bids[seat]?.blind
                          ? tr('blindNilShort')
                          : tr('nil')
                        : shownView.bids[seat]?.value
                      : tr('none')}
                  </span>
                  <span className="bid-tricks">
                    {shownView.tricksBySeat[seat]} {tr('tricks')}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="side-card">
            <h3>{tr('actions')}</h3>
            <div className="side-actions">
              <button className="secondary" onClick={undo} disabled={!undoAvailable} data-testid="undo">
                {tr('undo')}
              </button>
              <button className="secondary" onClick={showHint} disabled={!hintAvailable} data-testid="hint">
                {tr('hint')}
              </button>
            </div>
            <p className="side-note">{isLan ? tr('localOnly') : tr('keyboardHint')}</p>
          </div>

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanCode')}</h3>
                <span className={`status-dot ${guestOnline ? 'online' : ''}`} />
              </div>
              <div className="room-code">{lanCode || '—'}</div>
              <p className="peer">
                {guestOnline
                  ? t(lang, 'lanGuests', { n: connectedGuests.length })
                  : tr('lanHostWaiting')}
              </p>
              {connectedGuests.length < 3 && (
                <p className="side-note">{tr('lanStartHint')}</p>
              )}
            </div>
          )}

          {isGuest && (
            <div className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanGuestTag')}</h3>
                <span className={`status-dot ${guestStarted ? 'online' : ''}`} />
              </div>
              <p className="peer">{t(lang, 'lanRoom', { code: guestRoom || guestCode })}</p>
              <p className="peer">
                {t(lang, 'lanSeat', { name: seatName(shownView.seat) })}
              </p>
              {guestHostName && (
                <p className="peer">
                  {tr('lanHostTag')} · {guestHostName}
                </p>
              )}
              <p className="side-note">{tr('lanRecordNote')}</p>
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('recordMini')}</h3>
            <p className="peer">
              {record.matches} {tr('matches')} · {record.winsA}/{record.winsB}
            </p>
            <p className="side-note">{tr('recordNote')}</p>
            {!isGuest && (
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
                  <span className={`status-pill ${guestOnline ? 'ready' : ''}`}>
                    {guestOnline ? tr('lanReady') : tr('lanHostWaiting')}
                  </span>
                </div>
                <div className="room-code big">{lanCode}</div>
                <div className="peer-list">
                  {[0, 1, 2, 3].map((seat) => {
                    const player = lanPlayers.find((item) => item.seat === seat);
                    const connected = Boolean(player?.connected);
                    const isHost = seat === 0;
                    return (
                      <span
                        key={seat}
                        className={`peer-chip ${connected ? 'online' : ''}`}
                      >
                        <span className="peer-mark">{teamOf(seat) === 0 ? '♠' : '♥'}</span>
                        <span className="peer-name">
                          {seatName(seat)}
                          {!connected && !isHost ? ` · ${tr('aiTag')}` : ''}
                        </span>
                        <small>
                          {isHost ? tr('lanHostTag') : tr('lanGuestTag')} ·{' '}
                          {connected ? tr('lanOnline') : tr('lanOffline')}
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
                <div className="toggle-line compact">
                  <span className="label">{tr('blindNil')}</span>
                  <button
                    type="button"
                    className={`toggle ${blindNilSetting ? 'on' : ''}`}
                    aria-pressed={blindNilSetting}
                    onClick={() => setBlindNilSetting((value) => !value)}
                  >
                    <span />
                  </button>
                </div>
                {connectedGuests.length < 3 && (
                  <p className="lan-help">{tr('lanStartHint')}</p>
                )}
                <button
                  className="primary wide"
                  onClick={startLanMatch}
                  disabled={!guestOnline}
                  data-testid="lan-start"
                >
                  {guestOnline ? tr('lanStart') : tr('lanHostWaiting')}
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
          <h2 className="screen-title">{guest ? tr('lanGuestTitle') : tr('lanGuestTitle')}</h2>
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
                {guestHostName && (
                  <span>
                    {tr('lanHostTag')} · {guestHostName}
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

      {record.matches === 0 ? (
        <section className="empty-card">
          <span className="empty-mark" aria-hidden="true">
            ♠ ♥ ♣ ♦
          </span>
          <p>{tr('recordEmpty')}</p>
          <button className="primary" onClick={startAi}>
            {tr('playSolo')}
          </button>
        </section>
      ) : (
        <>
          <section className="stats-top">
            <div className="stat-card total" data-testid="record-matches">
              <span>{tr('matches')}</span>
              <strong>{record.matches}</strong>
            </div>
            <div className="stat-card team-a">
              <span>{teamNames[0]}</span>
              <strong>{record.winsA}</strong>
            </div>
            <div className="stat-card team-b">
              <span>{teamNames[1]}</span>
              <strong>{record.winsB}</strong>
            </div>
            <div className="stat-card rounds">
              <span>{tr('roundsPlayed')}</span>
              <strong>{record.rounds}</strong>
            </div>
          </section>

          <section className="record-grid">
            <div className="record-card">
              <h3>{tr('wins')}</h3>
              <div className="share-bar" aria-hidden="true">
                <span className="share-a" style={{ width: share(record.winsA) }} />
                <span className="share-b" style={{ width: share(record.winsB) }} />
              </div>
              <ul className="share-legend">
                <li>
                  <i className="legend-a" />
                  {teamNames[0]} <strong>{record.winsA}</strong>
                </li>
                <li>
                  <i className="legend-b" />
                  {teamNames[1]} <strong>{record.winsB}</strong>
                </li>
              </ul>
              <div className="streak-row">
                <div>
                  <span>{tr('lastMatch')}</span>
                  <strong>{noWinner}</strong>
                </div>
                <div>
                  <span>{tr('matches')}</span>
                  <strong>{record.matches}</strong>
                </div>
                <div>
                  <span>{tr('roundsPlayed')}</span>
                  <strong>{record.rounds}</strong>
                </div>
              </div>
            </div>

            <div className="record-card modes-card">
              <h3>{tr('matches')}</h3>
              <div className="mode-list">
                {(['ai', 'local', 'lan'] as const).map((value) => (
                  <div className="mode-row" key={value}>
                    <span>{modeLabelFor(value)}</span>
                    <div className="mode-bar">
                      <i
                        style={{
                          width:
                            record.matches > 0
                              ? `${(record.byMode[value] / record.matches) * 100}%`
                              : '0%',
                        }}
                      />
                    </div>
                    <strong>{record.byMode[value]}</strong>
                  </div>
                ))}
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
          </section>

          <section className="recent-card">
            <h3>{tr('recentMatches')}</h3>
            {record.recent.length === 0 ? (
              <p className="recent-empty">{tr('recordEmpty')}</p>
            ) : (
              <ol className="recent-list">
                {record.recent.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="recent-row">
                    <span className={`recent-mark team-${entry.winner}`}>
                      {entry.winner === 0 ? '♠' : '♥'}
                    </span>
                    <div className="recent-main">
                      <strong>{teamNames[entry.winner]}</strong>
                      <span>
                        {modeLabelFor(entry.mode)}
                        {entry.level ? ` · ${t(lang, entry.level)}` : ''}
                      </span>
                    </div>
                    <span className="recent-score">
                      {entry.scores[0]}–{entry.scores[1]}
                    </span>
                    <span className="recent-rounds">
                      {t(lang, 'roundsCount', { n: entry.rounds })}
                    </span>
                    <time dateTime={new Date(entry.at).toISOString()}>
                      {formatDate(entry.at, lang)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
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
        {(['rule1', 'rule2', 'rule3', 'rule4', 'rule5', 'rule6', 'rule7', 'rule8'] as MessageKey[]).map(
          (key) => (
            <li key={key}>{tr(key)}</li>
          ),
        )}
      </ol>
      <section className="scoring-card">
        <h3>{tr('scoringTitle')}</h3>
        <dl className="scoring-list">
          <div>
            <dt>{tr('scoreLineContract')}</dt>
            <dd>{tr('scoreContractValue')}</dd>
          </div>
          <div>
            <dt>{tr('scoreLineSet')}</dt>
            <dd>{tr('scoreSetValue')}</dd>
          </div>
          <div>
            <dt>{tr('scoreLineNil')}</dt>
            <dd>{tr('scoreNilValue')}</dd>
          </div>
          <div>
            <dt>{tr('scoreLineBags')}</dt>
            <dd>{tr('scoreBagsValue')}</dd>
          </div>
          <div>
            <dt>{tr('scoreLineTarget')}</dt>
            <dd>{tr('scoreTargetValue')}</dd>
          </div>
        </dl>
        <p className="privacy-note">{tr('privacyRules')}</p>
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
