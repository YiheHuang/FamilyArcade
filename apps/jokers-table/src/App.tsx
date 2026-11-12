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
  AI_LEVELS,
  autoPlayBlind,
  autoShop,
  hintFor,
  type AiLevel,
} from './ai/ai';
import { CardBack, CardFan, PlayingCard } from './components/Cards';
import { BossPlaque, HeartRow, JokerShelf } from './components/Jokers';
import { deriveSeed, hashSeed, mulberry32, type HandType } from './game/cards';
import {
  DECKS,
  DECK_BY_ID,
  ENHANCEMENT_BY_ID,
  JOKER_BY_ID,
  JOKER_SLOTS,
  VOUCHER_BY_ID,
  createBlindPlan,
  isDeckId,
  type BlindKind,
  type DeckId,
  type JokerId,
} from './game/content';
import { compareBlind, fallbackWinner as fallbackByHearts, type CompareOutcome } from './game/competition';
import {
  buyOffer,
  createRun,
  currentAnte,
  currentBlind,
  currentKind,
  discardCards,
  enhancedCount,
  enterShop,
  nextBlind,
  playCards,
  previewScore,
  rerollShop,
  sellJoker,
  type RunState,
  type ShopOffer,
} from './game/run';
import {
  deckName,
  deckText,
  detectLang,
  enhancementName,
  enhancementText,
  handName,
  jokerName,
  jokerText,
  t,
  voucherName,
  voucherText,
  type Lang,
  type MessageKey,
} from './i18n';
import {
  guestWsUrl,
  hostWsUrl,
  inviteUrl,
  startLanServer,
} from './net';
import {
  demoCompare as buildDemoCompare,
  demoEndRun,
  demoShopRun,
} from './demo';
import type {
  GameMode,
  LanMatch,
  LanPlayer,
  LanVerdict,
  LocalMode,
  SavedGame,
  SeatState,
  Stage,
} from './session';
import {
  clearRecord as clearStoredRecord,
  clearSave,
  loadRecord,
  loadSave,
  recordResult,
  saveGame,
  type FamilyRecord,
  type RecordMode,
  type RecordResult,
} from './storage';
import { chime } from './sound';

type Screen =
  | 'home'
  | 'setup'
  | 'game'
  | 'shop'
  | 'compare'
  | 'handoff'
  | 'end'
  | 'record'
  | 'rules'
  | 'lan'
  | 'wait'
  | 'spectate';

interface EndInfo {
  won: boolean;
  draw: boolean;
  mode: GameMode;
  score: number;
  ante: number;
  bestHandScore: number;
  bestHandType: HandType | null;
  winnerName?: string;
  winnerSeat: number | null;
  reason: 'win' | 'loss' | 'draw';
}

const DEMO_KIND =
  typeof location !== 'undefined' ? new URLSearchParams(location.search).get('demo') : null;
const INVITE = guestParams();
const DEMO_SHOP = DEMO_KIND === 'shop' ? demoShopRun() : null;
const DEMO_COMPARE = DEMO_KIND === 'compare' ? buildDemoCompare() : null;
const DEMO_END = DEMO_KIND === 'end' ? demoEndRun() : null;

const RUN_MODES: LocalMode[] = ['solo', 'rivals', 'hotseat'];
const RIVAL_KEYS: MessageKey[] = ['rivalMara', 'rivalIvo', 'rivalSable'];

function currentSeedText(): string {
  try {
    const data = new Uint32Array(1);
    crypto.getRandomValues(data);
    return String(data[0]);
  } catch {
    return String(Date.now() % 1000000000);
  }
}

function setIndex<T>(items: T[], index: number, value: T): T[] {
  const copy = items.slice();
  while (copy.length <= index) copy.push(value);
  copy[index] = value;
  return copy;
}

function modeKey(mode: GameMode): MessageKey {
  if (mode === 'solo') return 'modeSolo';
  if (mode === 'rivals') return 'modeRivals';
  if (mode === 'hotseat') return 'modeHotseat';
  return 'modeLan';
}

function blindKey(kind: BlindKind): MessageKey {
  if (kind === 'small') return 'blindSmall';
  if (kind === 'big') return 'blindBig';
  if (kind === 'finale') return 'blindFinale';
  return 'blindBoss';
}

function resolveName(lang: Lang, seat: SeatState, index: number): string {
  if (seat.name.trim()) return seat.name.trim();
  if (seat.nameKey === 'playerSeat') return t(lang, 'playerSeat', { n: index + 1 });
  if (seat.nameKey) return t(lang, seat.nameKey);
  return t(lang, 'noName');
}

function formatNum(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US');
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

function lanSeatName(
  lang: Lang,
  players: readonly { seat: number; name: string }[],
  seat: number,
): string {
  if (seat === 0) return t(lang, 'lanHostTag');
  const player = players.find((item) => item.seat === seat);
  if (!player) return t(lang, 'noName');
  if (player.name === 'Guest' || player.name === '访客') return t(lang, 'lanGuestTag');
  return player.name;
}

function localError(lang: Lang, error: string | undefined): string {
  if (!error) return t(lang, 'actionFailed');
  switch (error) {
    case 'no-discards':
      return t(lang, 'noDiscards');
    case 'not-enough-money':
      return t(lang, 'noMoney');
    case 'slots-full':
      return t(lang, 'slotsFull');
    case 'need-target':
      return t(lang, 'needTarget');
    case 'bad-count':
    case 'not-in-hand':
    case 'duplicate-card':
      return t(lang, 'actionFailed');
    default:
      return t(lang, 'actionFailed');
  }
}

function lanErrorText(lang: Lang, message: string): string {
  const value = message.toLowerCase();
  if (value.includes('room-full')) return t(lang, 'lanFull');
  if (value.includes('wrong-code')) return t(lang, 'lanWrong');
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

function makeSeats(
  mode: 'rivals' | 'hotseat',
  seed: string,
  deckId: DeckId,
  level: AiLevel,
  rivalCount: number,
  playerCount: number,
): SeatState[] {
  const seedNumber = hashSeed(seed);
  const plan = createBlindPlan(seedNumber, deckId, true);
  const total = mode === 'rivals' ? 1 + rivalCount : playerCount;
  return Array.from({ length: total }).map((_, index) => {
    const run = createRun({ seed, deckId, plan });
    return {
      name: '',
      nameKey:
        mode === 'rivals'
          ? index === 0
            ? 'you'
            : RIVAL_KEYS[index - 1] ?? 'rivalMara'
          : 'playerSeat',
      ai: mode === 'rivals' && index > 0,
      level: mode === 'rivals' && index > 0 ? level : null,
      run,
      hearts: 3,
      eliminated: false,
      blindScores: [],
      totalScore: run.totalScore,
    };
  });
}

export default function App() {
  const isDemo = DEMO_KIND !== null;
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() =>
    DEMO_SHOP
      ? 'shop'
      : DEMO_COMPARE
        ? 'compare'
        : DEMO_END
          ? 'end'
          : INVITE
            ? 'lan'
            : 'home',
  );
  const [mode, setMode] = useState<GameMode>(() =>
    DEMO_COMPARE ? 'hotseat' : INVITE ? 'lan-guest' : 'solo',
  );
  const [setupMode, setSetupMode] = useState<LocalMode>('solo');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [deckChoice, setDeckChoice] = useState<DeckId>('ivory');
  const [seedInput, setSeedInput] = useState('');
  const [rivalCount, setRivalCount] = useState(1);
  const [playerCount, setPlayerCount] = useState(2);

  const [soloRun, setSoloRun] = useState<RunState | null>(() =>
    DEMO_SHOP ?? DEMO_END ?? null,
  );
  const [seats, setSeats] = useState<SeatState[] | null>(() => DEMO_COMPARE?.seats ?? null);
  const [active, setActive] = useState(0);
  const [stage, setStage] = useState<Stage>(() =>
    DEMO_COMPARE ? 'compare' : DEMO_SHOP ? 'shop' : 'playing',
  );
  const [compare, setCompare] = useState<CompareOutcome | null>(
    () => DEMO_COMPARE?.compare ?? null,
  );
  const [compareIndex, setCompareIndex] = useState(() => DEMO_COMPARE?.blindIndex ?? 0);
  const [shopQueue, setShopQueue] = useState<number[]>([]);
  const [history, setHistory] = useState<RunState[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [hint, setHint] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [enhanceOffer, setEnhanceOffer] = useState<number | null>(null);
  const [endInfo, setEndInfo] = useState<EndInfo | null>(() =>
    DEMO_END
      ? {
          won: true,
          draw: false,
          mode: 'solo',
          score: DEMO_END.totalScore,
          ante: 6,
          bestHandScore: DEMO_END.bestHandScore,
          bestHandType: DEMO_END.bestHandType,
          winnerSeat: null,
          reason: 'win',
        }
      : null,
  );
  const [recorded, setRecorded] = useState(false);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => (isDemo ? null : loadSave()));
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.jokers-table.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    try {
      return (
        localStorage.getItem('familyarcade.jokers-table.motion') === 'reduced' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    } catch {
      return false;
    }
  });
  const [showJokerInfo, setShowJokerInfo] = useState<JokerId | null>(null);

  const [lanRole, setLanRole] = useState<'hub' | 'host' | 'guest'>(() =>
    INVITE ? 'guest' : 'hub',
  );
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestPlayers, setGuestPlayers] = useState<LanPublicPeer[]>([]);
  const [guestName, setGuestName] = useState(() => INVITE?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => INVITE?.code ?? '');
  const [guestRoom, setGuestRoom] = useState(() => INVITE?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [lanRoster, setLanRoster] = useState<LanPlayer[]>([]);
  const [lanTracker, setLanTracker] = useState<LanMatch | null>(null);
  const [lanVerdict, setLanVerdict] = useState<LanVerdict | null>(null);
  const [lanSubmitted, setLanSubmitted] = useState(false);
  const [selfSeat, setSelfSeat] = useState(0);

  const activeRef = useRef(active);
  const modeRef = useRef(mode);
  const soloRef = useRef(soloRun);
  const seatsRef = useRef(seats);
  const recordRef = useRef(recorded);
  const hostRef = useRef<LanHost | null>(null);
  const guestRef = useRef<LanGuest | null>(null);
  const trackerRef = useRef<LanMatch | null>(null);
  const lanVerdictRef = useRef<LanVerdict | null>(null);
  const autoJoinRef = useRef(false);
  const initRef = useRef(false);
  const guestViewRef = useRef<(payload: unknown) => void>(() => undefined);
  const hostIntentRef = useRef<(seat: number, intent: unknown) => void>(() => undefined);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    soloRef.current = soloRun;
  }, [soloRun]);
  useEffect(() => {
    seatsRef.current = seats;
  }, [seats]);
  useEffect(() => {
    recordRef.current = recorded;
  }, [recorded]);

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );

  const curRun = seats ? seats[active]?.run ?? null : soloRun;
  const isLan = mode === 'lan-host' || mode === 'lan-guest';
  const trMode = tr(modeKey(mode));

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
      localStorage.setItem('familyarcade.jokers-table.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'familyarcade.jokers-table.motion',
        reducedMotion ? 'reduced' : 'full',
      );
    } catch {
      /* ignore */
    }
    document.body.classList.toggle('reduced-motion', reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (isDemo || isLan) return;
    if (screen === 'game' || screen === 'shop' || screen === 'compare' || screen === 'handoff') {
      const value = saveGame({
        mode: mode as LocalMode,
        level,
        deckId: deckChoice,
        screen: screen as 'game' | 'shop' | 'compare' | 'handoff',
        soloRun,
        seats,
        active,
        stage,
        compare,
        shopQueue,
      });
      setSaved(value);
    } else if (screen === 'end') {
      clearSave();
      setSaved(null);
    }
  }, [
    isDemo,
    isLan,
    screen,
    mode,
    level,
    deckChoice,
    soloRun,
    seats,
    active,
    stage,
    compare,
    shopQueue,
  ]);

  const showToast = useCallback((text: string) => setToast(text), []);

  const playSound = useCallback(
    (kind: Parameters<typeof chime>[0]) => {
      if (soundOn) chime(kind);
    },
    [soundOn],
  );

  const updateRun = useCallback(
    (next: RunState) => {
      if (mode === 'rivals' || mode === 'hotseat') {
        const index = activeRef.current;
        setSeats((prev) =>
          prev
            ? prev.map((seat, seatIndex) =>
                seatIndex === index
                  ? { ...seat, run: next, totalScore: next.totalScore }
                  : seat,
              )
            : prev,
        );
      } else {
        setSoloRun(next);
      }
    },
    [mode],
  );

  const remember = useCallback(
    (run: RunState) => {
      if (mode === 'lan-host' || mode === 'lan-guest') return;
      if (run.phase !== 'blind') return;
      setHistory((items) => [...items.slice(-39), run]);
    },
    [mode],
  );

  const resolveSeat = useCallback(
    (seat: SeatState, index: number) => resolveName(lang, seat, index),
    [lang],
  );

  const closeLan = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setLanHost(null);
    guestRef.current?.close();
    guestRef.current = null;
    setGuest(null);
    setLanPlayers([]);
    setGuestPlayers([]);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanTracker(null);
    trackerRef.current = null;
    setLanVerdict(null);
    lanVerdictRef.current = null;
    setLanRoster([]);
    setLanSubmitted(false);
    setGuestStarted(false);
    initRef.current = false;
    setLanError('');
    setLanBusy(false);
    setLanRole('hub');
    setSelfSeat(0);
    setMode('solo');
  }, []);
  const goHome = useCallback(() => {
    if (isLan) closeLan();
    setScreen('home');
    setSelected([]);
    setHint([]);
    setHistory([]);
    setShopQueue([]);
    setCompare(null);
    setSaved(isDemo ? null : loadSave());
  }, [closeLan, isDemo, isLan]);

  const recordEnd = useCallback(
    (info: EndInfo) => {
      if (isDemo || recordRef.current) return;
      recordRef.current = true;
      setRecorded(true);
      const recordMode: RecordMode =
        info.mode === 'lan-host' || info.mode === 'lan-guest'
          ? 'lan'
          : (info.mode as LocalMode);
      const result: RecordResult = info.draw ? 'draw' : info.won ? 'win' : 'loss';
      const next = recordResult({
        mode: recordMode,
        result,
        score: Math.floor(info.score),
        ante: Math.floor(info.ante),
        ...(info.winnerName ? { name: info.winnerName } : {}),
      });
      setRecord(next);
    },
    [isDemo],
  );

  const finishSolo = useCallback(
    (won: boolean) => {
      const run = soloRef.current;
      if (!run) return;
      const info: EndInfo = {
        won,
        draw: false,
        mode: 'solo',
        score: run.totalScore,
        ante: currentAnte(run),
        bestHandScore: run.bestHandScore,
        bestHandType: run.bestHandType,
        winnerSeat: null,
        reason: won ? 'win' : 'loss',
      };
      setEndInfo(info);
      recordEnd(info);
      setScreen('end');
      setStage('done');
      playSound(won ? 'win' : 'lose');
    },
    [playSound, recordEnd],
  );

  const finishCompetitive = useCallback(
    (winnerSeat: number | null, forceLoss = false) => {
      const current = seatsRef.current;
      if (!current || current.length === 0) return;
      const draw = winnerSeat === null && !forceLoss;
      const winner = winnerSeat !== null ? current[winnerSeat] : null;
      const scoreRun = winner?.run ?? current[0].run;
      const winnerName = winner ? resolveSeat(winner, winnerSeat ?? 0) : undefined;
      const info: EndInfo = {
        won: !draw && !forceLoss && winnerSeat === 0,
        draw,
        mode: modeRef.current,
        score: scoreRun.totalScore,
        ante: currentAnte(scoreRun),
        bestHandScore: scoreRun.bestHandScore,
        bestHandType: scoreRun.bestHandType,
        ...(winnerName ? { winnerName } : {}),
        winnerSeat,
        reason: draw ? 'draw' : forceLoss || winnerSeat !== 0 ? 'loss' : 'win',
      };
      setEndInfo(info);
      recordEnd(info);
      setScreen('end');
      setStage('done');
      playSound(info.won ? 'win' : info.reason === 'draw' ? 'coin' : 'lose');
    },
    [playSound, recordEnd, resolveSeat],
  );

  const finishLan = useCallback(
    (verdict: LanVerdict) => {
      const current = soloRef.current;
      const winner = verdict.winner;
      const draw = winner === null;
      const winnerName =
        winner !== null
          ? lanSeatName(lang, lanRoster, winner)
          : undefined;
      const info: EndInfo = {
        won: !draw && winner === (mode === 'lan-guest' ? selfSeat : 0),
        draw,
        mode,
        score: current?.totalScore ?? verdict.totals[mode === 'lan-guest' ? selfSeat : 0] ?? 0,
        ante: current ? currentAnte(current) : 6,
        bestHandScore: current?.bestHandScore ?? 0,
        bestHandType: current?.bestHandType ?? null,
        ...(winnerName ? { winnerName } : {}),
        winnerSeat: winner,
        reason: draw ? 'draw' : 'loss',
      };
      if (info.won) info.reason = 'win';
      setEndInfo(info);
      recordEnd(info);
      setScreen('end');
      setStage('done');
      playSound(info.won ? 'win' : draw ? 'coin' : 'lose');
    },
    [lang, lanRoster, mode, playSound, recordEnd, selfSeat],
  );

  const resetSession = useCallback(() => {
    recordRef.current = false;
    setRecorded(false);
    setEndInfo(null);
    setCompare(null);
    setShopQueue([]);
    setSelected([]);
    setHint([]);
    setHistory([]);
    setEnhanceOffer(null);
    setShowJokerInfo(null);
    setLanVerdict(null);
    lanVerdictRef.current = null;
    setLanSubmitted(false);
    clearSave();
  }, []);

  const startLocalRun = useCallback(
    (kind: LocalMode) => {
      if (isLan) closeLan();
      resetSession();
      const seed = seedInput.trim() || currentSeedText();
      if (kind === 'solo') {
        const run = createRun({ seed, deckId: deckChoice });
        setMode('solo');
        setSoloRun(run);
        setSeats(null);
        setActive(0);
        setStage('playing');
        setScreen('game');
      } else {
        const nextSeats = makeSeats(
          kind,
          seed,
          deckChoice,
          level,
          rivalCount,
          playerCount,
        );
        setMode(kind);
        setSoloRun(null);
        setSeats(nextSeats);
        setActive(0);
        setStage(kind === 'hotseat' ? 'handoff' : 'playing');
        setScreen(kind === 'hotseat' ? 'handoff' : 'game');
      }
      setDeckChoice(deckChoice);
    },
    [
      closeLan,
      deckChoice,
      isLan,
      level,
      playerCount,
      resetSession,
      rivalCount,
      seedInput,
    ],
  );

  const resumeSaved = useCallback(() => {
    const game = saved ?? loadSave();
    if (!game) return;
    resetSession();
    setMode(game.mode);
    setLevel(game.level);
    setDeckChoice(game.deckId);
    setSoloRun(game.soloRun);
    setSeats(game.seats);
    setActive(game.active);
    setStage(game.stage);
    setCompare(game.compare);
    setShopQueue(game.shopQueue);
    setCompareIndex(game.soloRun?.blindIndex ?? game.seats?.[game.active]?.run.blindIndex ?? 0);
    setScreen(game.screen);
    setSaved(null);
  }, [resetSession, saved]);

  const openSetup = useCallback((kind: LocalMode) => {
    setSetupMode(kind);
    setScreen('setup');
    setSeedInput('');
  }, []);

  const toggleCard = useCallback(
    (id: string) => {
      if (!curRun || curRun.phase !== 'blind') return;
      setHint([]);
      setSelected((items) => {
        if (items.includes(id)) {
          playSound('select');
          return items.filter((item) => item !== id);
        }
        if (items.length >= 5) {
          showToast(tr('selectLimit'));
          return items;
        }
        playSound('select');
        return [...items, id];
      });
    },
    [curRun, playSound, showToast, tr],
  );

  const playSelected = useCallback(() => {
    const run = curRun;
    if (!run || run.phase !== 'blind') return;
    if (selected.length === 0) {
      showToast(tr('selectCards'));
      return;
    }
    remember(run);
    const result = playCards(run, selected);
    if (!result.ok) {
      showToast(localError(lang, result.error));
      return;
    }
    setSelected([]);
    setHint([]);
    updateRun(result.state);
    playSound(result.state.phase === 'blind' ? 'score' : 'play');
  }, [curRun, lang, playSound, remember, selected, showToast, tr, updateRun]);

  const discardSelected = useCallback(() => {
    const run = curRun;
    if (!run || run.phase !== 'blind') return;
    if (selected.length === 0) {
      showToast(tr('selectCards'));
      return;
    }
    remember(run);
    const result = discardCards(run, selected);
    if (!result.ok) {
      showToast(localError(lang, result.error));
      return;
    }
    setSelected([]);
    setHint([]);
    updateRun(result.state);
    playSound('discard');
  }, [curRun, lang, playSound, remember, selected, showToast, tr, updateRun]);

  const undo = useCallback(() => {
    if (isLan) return;
    if (!curRun || curRun.phase !== 'blind') return;
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));
    setSelected([]);
    setHint([]);
    updateRun(previous);
    playSound('select');
  }, [curRun, history, isLan, playSound, updateRun]);

  const showHint = useCallback(() => {
    if (!curRun || curRun.phase !== 'blind') return;
    const value = hintFor(curRun);
    if (!value) {
      showToast(tr('hintNone'));
      return;
    }
    setHint(value.cards);
    setSelected(value.cards);
    const hand = handName(lang, value.handType);
    showToast(
      t(lang, value.clears ? 'hintClears' : 'hintReason', {
        hand,
        chips: value.chips,
        mult: value.mult,
        total: value.total,
      }),
    );
    playSound('select');
  }, [curRun, lang, playSound, showToast, tr]);

  const shopForSeat = useCallback((source: SeatState[], index: number): SeatState[] => {
    const run = source[index]?.run;
    if (!run) return source;
    if (run.phase === 'shop') return source;
    const shop = enterShop(run);
    if (!shop.ok) return source;
    return source.map((seat, seatIndex) =>
      seatIndex === index ? { ...seat, run: shop.state } : seat,
    );
  }, []);

  const goCompare = useCallback(
    (nextSeats: SeatState[], blindIndex: number) => {
      const activeSeats = nextSeats
        .map((seat, index) => (seat.hearts > 0 && !seat.eliminated ? index : -1))
        .filter((index) => index >= 0);
      const scores = nextSeats.map((seat) => seat.run.blindScore);
      let outcome = compareBlind(
        activeSeats,
        scores,
        nextSeats.map((seat) => seat.hearts),
      );
      const planLength = nextSeats[outcome.activeAfter[0] ?? 0]?.run.plan.length ?? 0;
      if (outcome.winner === null && outcome.activeAfter.length > 1 && planLength > 0 && blindIndex + 1 >= planLength) {
        const fallback = fallbackByHearts(
          outcome.activeAfter,
          outcome.hearts,
          nextSeats.map((seat) => seat.run.totalScore),
        );
        outcome = { ...outcome, winner: fallback };
      }
      const withHearts = nextSeats.map((seat, index) => ({
        ...seat,
        hearts: outcome.hearts[index],
        eliminated: outcome.hearts[index] <= 0,
      }));
      setSeats(withHearts);
      setCompare(outcome);
      setCompareIndex(blindIndex);
      setShopQueue(outcome.activeAfter);
      setStage('compare');
      setScreen('compare');
      setSelected([]);
      setHint([]);
      setHistory([]);
      playSound(outcome.tiedLowest ? 'coin' : 'score');
    },
    [playSound],
  );

  const finishLocalSeat = useCallback(
    (run: RunState) => {
      const current = seatsRef.current;
      if (!current) return;
      let nextSeats = current.map((seat, index) =>
        index === activeRef.current
          ? {
              ...seat,
              run,
              totalScore: run.totalScore,
              blindScores: setIndex(seat.blindScores, run.blindIndex, run.blindScore),
            }
          : seat,
      );

      if (mode === 'rivals') {
        nextSeats = nextSeats.map((seat, index) => {
          if (
            index === 0 ||
            !seat.ai ||
            seat.hearts <= 0 ||
            seat.run.phase !== 'blind' ||
            seat.run.blindIndex !== run.blindIndex
          ) {
            return seat;
          }
          const rng = mulberry32(deriveSeed(run.seed, run.blindIndex, 811 + index));
          const played = autoPlayBlind(
            seat.run,
            seat.level ?? level,
            rng,
            seat.hearts <= 1 ? 1 : 0,
          );
          return {
            ...seat,
            run: played,
            totalScore: played.totalScore,
            blindScores: setIndex(
              seat.blindScores,
              played.blindIndex,
              played.blindScore,
            ),
          };
        });
        goCompare(nextSeats, run.blindIndex);
        return;
      }

      const pending = nextSeats.findIndex(
        (seat, index) =>
          index !== activeRef.current &&
          seat.hearts > 0 &&
          !seat.eliminated &&
          seat.run.phase === 'blind' &&
          seat.run.blindIndex === run.blindIndex,
      );
      if (pending >= 0) {
        setSeats(nextSeats);
        setActive(pending);
        setStage('handoff');
        setScreen('handoff');
        setSelected([]);
        setHint([]);
        setHistory([]);
        return;
      }
      goCompare(nextSeats, run.blindIndex);
    },
    [goCompare, level, mode],
  );

  const continueAfterBlind = useCallback(() => {
    const run = curRun;
    if (!run) return;
    if (run.phase === 'cleared' || run.phase === 'failed') {
      if (mode === 'solo') {
        if (run.phase === 'failed') {
          finishSolo(false);
          return;
        }
        if (run.blindIndex >= run.plan.length - 1) {
          finishSolo(true);
          return;
        }
        const shop = enterShop(run);
        if (shop.ok) {
          updateRun(shop.state);
          setStage('shop');
          setScreen('shop');
          setSelected([]);
          setHint([]);
          setHistory([]);
          playSound('coin');
        }
        return;
      }
      if (mode === 'rivals' || mode === 'hotseat') {
        finishLocalSeat(run);
        return;
      }
      if (mode === 'lan-host') {
        setLanSubmitted(true);
        setScreen('wait');
        setStage('wait');
        hostIntentRef.current(0, {
          type: 'score',
          blindIndex: run.blindIndex,
          score: run.blindScore,
        });
        return;
      }
      if (mode === 'lan-guest') {
        setLanSubmitted(true);
        setScreen('wait');
        setStage('wait');
        guestRef.current?.sendIntent({
          type: 'score',
          blindIndex: run.blindIndex,
          score: run.blindScore,
        });
      }
    }
  }, [curRun, finishLocalSeat, finishSolo, mode, playSound, updateRun]);

  const continueCompare = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') {
      const verdict = lanVerdictRef.current;
      if (!verdict) return;
      if (verdict.matchOver) {
        finishLan(verdict);
        return;
      }
      if (mode === 'lan-host' && verdict.hearts[0] <= 0) {
        setScreen('spectate');
        setStage('wait');
        return;
      }
      if (mode === 'lan-guest' && verdict.hearts[selfSeat] <= 0) {
        setScreen('spectate');
        setStage('wait');
        return;
      }
      const run = soloRef.current;
      if (!run) return;
      const shop = enterShop(run);
      if (shop.ok) {
        setSoloRun(shop.state);
        setStage('shop');
        setScreen('shop');
        setSelected([]);
        setHint([]);
        setHistory([]);
      }
      return;
    }

    if (!compare) return;
    if (mode === 'rivals' && seats?.[0] && seats[0].hearts <= 0) {
      finishCompetitive(null, true);
      return;
    }
    if (compare.winner !== null || compare.activeAfter.length <= 1) {
      finishCompetitive(compare.winner ?? compare.activeAfter[0] ?? null);
      return;
    }
    const current = seatsRef.current;
    if (!current) return;
    if (mode === 'rivals') {
      const next = shopForSeat(current, 0);
      setSeats(next);
      setActive(0);
      setStage('shop');
      setScreen('shop');
      setSelected([]);
      setHint([]);
      setHistory([]);
      playSound('coin');
      return;
    }
    const queue = compare.activeAfter;
    setShopQueue(queue);
    if (queue.length === 0) return;
    const first = queue[0];
    const next = shopForSeat(current, first);
    setSeats(next);
    setActive(first);
    setStage('shop');
    setScreen('shop');
    setSelected([]);
    setHint([]);
    setHistory([]);
    playSound('coin');
  }, [
    compare,
    finishCompetitive,
    finishLan,
    mode,
    playSound,
    seats,
    selfSeat,
    shopForSeat,
  ]);

  const fallbackWinner = useCallback((source: SeatState[]): number | null => {
    const alive = source
      .map((seat, index) => ({ seat, index }))
      .filter((item) => item.seat.hearts > 0 && !item.seat.eliminated);
    if (alive.length === 0) return null;
    alive.sort(
      (a, b) =>
        b.seat.hearts - a.seat.hearts ||
        b.seat.run.totalScore - a.seat.run.totalScore ||
        a.index - b.index,
    );
    return alive[0].index;
  }, []);

  const leaveShop = useCallback(() => {
    const run = curRun;
    if (!run) return;
    if (mode === 'lan-host' || mode === 'lan-guest') {
      const next = nextBlind(run);
      if (next.ok) {
        updateRun(next.state);
        setScreen('game');
        setStage('playing');
        setSelected([]);
        setHint([]);
        setHistory([]);
        setLanSubmitted(false);
      } else {
        setScreen('spectate');
        setStage('wait');
      }
      return;
    }
    if (mode === 'solo') {
      const next = nextBlind(run);
      if (next.ok) {
        updateRun(next.state);
        setScreen('game');
        setStage('playing');
        setSelected([]);
        setHint([]);
        setHistory([]);
      }
      return;
    }
    const current = seatsRef.current;
    if (!current) return;

    if (mode === 'rivals') {
      let nextSeats = current.slice();
      let complete = false;
      const human = nextBlind(run);
      if (human.ok) {
        nextSeats = nextSeats.map((seat, index) =>
          index === 0 ? { ...seat, run: human.state } : seat,
        );
      } else {
        complete = true;
      }
      nextSeats = nextSeats.map((seat, index) => {
        if (index === 0 || seat.hearts <= 0 || seat.eliminated) return seat;
        let aiRun = seat.run;
        if (aiRun.phase === 'cleared' || aiRun.phase === 'failed') {
          const shop = enterShop(aiRun);
          if (shop.ok) aiRun = shop.state;
        }
        if (aiRun.phase === 'shop') {
          const rng = mulberry32(deriveSeed(aiRun.seed, aiRun.blindIndex, 2001 + index));
          aiRun = autoShop(
            aiRun,
            seat.level ?? level,
            rng,
            seat.hearts <= 1 ? 1 : 0,
          );
          const next = nextBlind(aiRun);
          if (next.ok) aiRun = next.state;
          else complete = true;
        }
        return { ...seat, run: aiRun, totalScore: aiRun.totalScore };
      });
      if (complete) {
        finishCompetitive(fallbackWinner(nextSeats), false);
        return;
      }
      setSeats(nextSeats);
      setActive(0);
      setStage('playing');
      setScreen('game');
      setSelected([]);
      setHint([]);
      setHistory([]);
      setCompare(null);
      return;
    }

    const queue = shopQueue.length > 0 ? shopQueue : compare?.activeAfter ?? [];
    const position = queue.indexOf(activeRef.current);
    if (position >= 0 && position < queue.length - 1) {
      const nextSeat = queue[position + 1];
      const next = shopForSeat(current, nextSeat);
      setSeats(next);
      setActive(nextSeat);
      setStage('shop');
      setScreen('shop');
      setEnhanceOffer(null);
      return;
    }

    let nextSeats = current.slice();
    let complete = false;
    for (const index of queue) {
      const seat = nextSeats[index];
      if (!seat || seat.hearts <= 0 || seat.eliminated) continue;
      if (seat.run.phase !== 'shop') continue;
      const advanced = nextBlind(seat.run);
      if (advanced.ok) {
        nextSeats = nextSeats.map((item, seatIndex) =>
          seatIndex === index ? { ...item, run: advanced.state } : item,
        );
      } else {
        complete = true;
      }
    }
    if (complete) {
      finishCompetitive(fallbackWinner(nextSeats), false);
      return;
    }
    const firstAlive = nextSeats.findIndex((seat) => seat.hearts > 0 && !seat.eliminated);
    setSeats(nextSeats);
    setActive(firstAlive >= 0 ? firstAlive : 0);
    setStage('handoff');
    setScreen('handoff');
    setCompare(null);
    setShopQueue([]);
    setSelected([]);
    setHint([]);
    setHistory([]);
  }, [
    compare,
    curRun,
    fallbackWinner,
    finishCompetitive,
    level,
    mode,
    shopForSeat,
    shopQueue,
    updateRun,
  ]);

  const purchase = useCallback(
    (index: number, targetCardId?: string) => {
      const run = curRun;
      if (!run) return;
      const result = buyOffer(run, index, targetCardId);
      if (!result.ok) {
        if (result.error === 'need-target') {
          setEnhanceOffer(index);
          return;
        }
        showToast(localError(lang, result.error));
        return;
      }
      setEnhanceOffer(null);
      updateRun(result.state);
      playSound('coin');
    },
    [curRun, lang, playSound, showToast, updateRun],
  );

  const reroll = useCallback(() => {
    const run = curRun;
    if (!run) return;
    const result = rerollShop(run);
    if (!result.ok) {
      showToast(localError(lang, result.error));
      return;
    }
    updateRun(result.state);
    playSound('coin');
  }, [curRun, lang, playSound, showToast, updateRun]);

  const sellJokerAt = useCallback(
    (index: number) => {
      const run = curRun;
      if (!run) return;
      const result = sellJoker(run, index);
      if (!result.ok) {
        showToast(localError(lang, result.error));
        return;
      }
      updateRun(result.state);
      playSound('coin');
    },
    [curRun, lang, playSound, showToast, updateRun],
  );

  const showHandoff = useCallback(() => {
    setStage('playing');
    setScreen('game');
    setSelected([]);
    setHint([]);
    setHistory([]);
    playSound('select');
  }, [playSound]);

  const openLanHub = useCallback(() => {
    setScreen('lan');
    setLanRole(INVITE ? 'guest' : 'hub');
    setLanError('');
  }, []);

  const openLanHost = useCallback(async () => {
    setLanRole('host');
    setMode('lan-host');
    setScreen('lan');
    setLanBusy(true);
    setLanError('');
    try {
      const info = await startLanServer();
      const code = newRoomCode();
      const room = newRoomCode();
      const host = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room,
        code,
        name: lang === 'zh' ? '主机' : 'Host',
        maxPlayers: 4,
      });
      hostRef.current = host;
      setLanHost(host);
      setLanCode(code);
      host.onChange((players) => setLanPlayers(players));
      host.onIntent((seat, intent) => hostIntentRef.current(seat, intent));
      host.onClose(() => setLanError(tr('lanClosed')));
      const url = inviteUrl(info, room, code, lang === 'zh' ? '访客' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 340,
          color: { dark: '#24332e', light: '#fffaf0' },
        }),
      );
    } catch (error) {
      setLanError(error instanceof Error ? lanErrorText(lang, error.message) : String(error));
      hostRef.current?.close();
      hostRef.current = null;
    } finally {
      setLanBusy(false);
    }
  }, [lang, tr]);

  const startLanHost = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const connected = lanPlayers.filter((player) => player.connected);
    if (connected.length < 2) {
      setLanError(tr('lanNoGuests'));
      return;
    }
    const seed = seedInput.trim() || currentSeedText();
    const seedNumber = hashSeed(seed);
    const plan = createBlindPlan(seedNumber, deckChoice, true);
    const players: LanPlayer[] = connected.map((player) => ({
      seat: player.seat,
      name: player.name,
    }));
    const hearts = [0, 0, 0, 0];
    const scores = [0, 0, 0, 0];
    const totals = [0, 0, 0, 0];
    const submitted = [false, false, false, false];
    for (const player of players) {
      hearts[player.seat] = 3;
    }
    const tracker: LanMatch = {
      seed: seedNumber,
      seedText: seed,
      deckId: deckChoice,
      plan,
      players,
      hearts,
      scores,
      totals,
      submitted,
      blindIndex: 0,
      active: players.map((player) => player.seat),
      matchOver: false,
      winner: null,
    };
    trackerRef.current = tracker;
    setLanTracker(tracker);
    setLanRoster(players);
    setLanVerdict(null);
    lanVerdictRef.current = null;
    setLanSubmitted(false);
    setSoloRun(createRun({ seed, deckId: deckChoice, plan }));
    setMode('lan-host');
    setSelfSeat(0);
    setScreen('game');
    setStage('playing');
    setActive(0);
    setSeats(null);
    setSelected([]);
    setHint([]);
    setHistory([]);
    setEndInfo(null);
    recordRef.current = false;
    setRecorded(false);
    setCompare(null);
    host.start();
    host.sendAll({
      kind: 'lan-init',
      seed: seedNumber,
      seedText: seed,
      deckId: deckChoice,
      plan,
      players,
    });
  }, [deckChoice, lanPlayers, seedInput, tr]);

  const completeLanBlind = useCallback(
    (tracker: LanMatch) => {
      const outcome = compareBlind(tracker.active, tracker.scores, tracker.hearts);
      let winner = outcome.winner;
      if (
        winner === null &&
        outcome.activeAfter.length > 1 &&
        tracker.blindIndex + 1 >= tracker.plan.length
      ) {
        winner = fallbackByHearts(outcome.activeAfter, outcome.hearts, tracker.totals);
      }
      const verdict: LanVerdict = {
        ...outcome,
        kind: 'lan-verdict',
        blindIndex: tracker.blindIndex,
        scores: tracker.scores.slice(),
        totals: tracker.totals.slice(),
        matchOver: winner !== null,
        winner,
      };
      hostRef.current?.sendAll(verdict);
      setLanVerdict(verdict);
      lanVerdictRef.current = verdict;
      setCompare(verdict);
      setStage('compare');
      setScreen('compare');
      const advanced: LanMatch = {
        ...tracker,
        hearts: outcome.hearts,
        active: outcome.activeAfter,
        matchOver: verdict.matchOver,
        winner: verdict.winner,
        blindIndex: verdict.matchOver ? tracker.blindIndex : tracker.blindIndex + 1,
        scores: [0, 0, 0, 0],
        submitted: [false, false, false, false],
      };
      trackerRef.current = advanced;
      setLanTracker(advanced);
      playSound(outcome.tiedLowest ? 'coin' : 'score');
    },
    [playSound],
  );

  const ingestLanScore = useCallback(
    (seat: number, score: number, blindIndex: number) => {
      const tracker = trackerRef.current;
      if (!tracker || tracker.matchOver) return;
      if (!Number.isInteger(seat) || seat < 0 || seat > 3) return;
      if (blindIndex !== tracker.blindIndex) return;
      if (!tracker.active.includes(seat)) return;
      if (tracker.submitted[seat] || tracker.hearts[seat] <= 0) return;
      if (!Number.isFinite(score)) return;
      const safeScore = Math.max(0, Math.floor(score));
      const scores = tracker.scores.slice();
      const totals = tracker.totals.slice();
      const submitted = tracker.submitted.slice();
      scores[seat] = safeScore;
      totals[seat] += safeScore;
      submitted[seat] = true;
      const next: LanMatch = { ...tracker, scores, totals, submitted };
      trackerRef.current = next;
      setLanTracker(next);
      if (next.active.every((activeSeat) => next.submitted[activeSeat])) {
        completeLanBlind(next);
      }
    },
    [completeLanBlind],
  );

  hostIntentRef.current = (seat, intent) => {
    if (!intent || typeof intent !== 'object') return;
    const value = intent as { type?: string; blindIndex?: number; score?: number };
    if (value.type !== 'score') return;
    if (typeof value.blindIndex !== 'number' || typeof value.score !== 'number') return;
    ingestLanScore(seat, value.score, value.blindIndex);
  };

  const joinGuest = useCallback(async () => {
    if (!guestRoom || !guestName.trim()) return;
    setGuestConnecting(true);
    setLanError('');
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room: guestRoom,
        code: guestCode,
        name: guestName.trim(),
      });
      guestRef.current = joined;
      setGuest(joined);
      setSelfSeat(joined.seat);
      setLanCode(joined.code || guestCode);
      setLanRole('guest');
      setMode('lan-guest');
      setScreen('lan');
      joined.onPlayers((players) => setGuestPlayers(players));
      joined.onStart((players) => {
        setGuestStarted(true);
        setGuestPlayers(players);
      });
      joined.onView((payload) => guestViewRef.current(payload));
      joined.onError((reason) => setLanError(lanErrorText(lang, reason)));
      setGuestStarted(false);
    } catch (error) {
      setLanError(error instanceof Error ? lanErrorText(lang, error.message) : String(error));
      guestRef.current?.close();
      guestRef.current = null;
    } finally {
      setGuestConnecting(false);
    }
  }, [guestCode, guestName, guestRoom, lang]);

  guestViewRef.current = (payload) => {
    if (!payload || typeof payload !== 'object') return;
    const value = payload as {
      kind?: string;
      seed?: number;
      deckId?: DeckId;
      plan?: RunState['plan'];
      players?: LanPlayer[];
    };
    if (value.kind === 'lan-init') {
      if (initRef.current) return;
      if (!Array.isArray(value.plan) || typeof value.seed !== 'number' || !isDeckId(value.deckId)) {
        return;
      }
      const seat = guestRef.current?.seat ?? selfSeat;
      const run = createRun({ seed: value.seed, deckId: value.deckId, plan: value.plan });
      initRef.current = true;
      setSelfSeat(seat);
      setLanRoster(Array.isArray(value.players) ? value.players : []);
      setSoloRun(run);
      setSeats(null);
      setActive(0);
      setMode('lan-guest');
      setScreen('game');
      setStage('playing');
      setLanSubmitted(false);
      setLanVerdict(null);
      lanVerdictRef.current = null;
      setCompare(null);
      setEndInfo(null);
      setSelected([]);
      setHint([]);
      setHistory([]);
      setGuestStarted(true);
      recordRef.current = false;
      setRecorded(false);
      playSound('coin');
      return;
    }
    if (value.kind === 'lan-verdict') {
      const verdict = payload as LanVerdict;
      if (!Array.isArray(verdict.hearts)) return;
      setLanVerdict(verdict);
      lanVerdictRef.current = verdict;
      setCompare(verdict);
      setCompareIndex(verdict.blindIndex);
      setStage('compare');
      setScreen('compare');
      setSelected([]);
      setHint([]);
      setHistory([]);
      playSound(verdict.tiedLowest ? 'coin' : 'score');
    }
  };

  useEffect(() => {
    if (guest || guestRef.current || autoJoinRef.current) return;
    if (!INVITE) return;
    if (!guestName.trim()) return;
    autoJoinRef.current = true;
    setScreen('lan');
    void joinGuest();
  }, [guestName, joinGuest]);

  const handleEndAgain = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') {
      closeLan();
      setScreen('home');
      return;
    }
    const nextMode = endInfo?.mode;
    if (nextMode && nextMode !== 'solo' && nextMode !== 'rivals' && nextMode !== 'hotseat') {
      setScreen('home');
      return;
    }
    if (nextMode) {
      setSetupMode(nextMode as LocalMode);
      setScreen('setup');
      setSeedInput('');
      resetSession();
    } else {
      setScreen('home');
    }
  }, [closeLan, endInfo, mode, resetSession]);

  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  keyHandlerRef.current = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }
    if (event.key === 'Escape') {
      if (screen !== 'home') goHome();
      return;
    }
    if (screen === 'handoff') {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        showHandoff();
      }
      return;
    }
    if (screen === 'compare') {
      if (event.key === 'Enter' || event.key.toLowerCase() === 'n') {
        event.preventDefault();
        continueCompare();
      }
      return;
    }
    if (screen === 'shop') {
      if (event.key === 'Enter' || event.key.toLowerCase() === 'n') {
        event.preventDefault();
        leaveShop();
      }
      return;
    }
    if (screen !== 'game') return;
    const run = curRun;
    if (!run) return;
    const number = Number(event.key);
    if (Number.isInteger(number) && number >= 1 && number <= run.hand.length) {
      event.preventDefault();
      const card = run.hand[number - 1];
      if (card) toggleCard(card.id);
      return;
    }
    if (run.phase !== 'blind') {
      if (event.key === 'Enter' || event.key.toLowerCase() === 'n') {
        event.preventDefault();
        continueAfterBlind();
      }
      return;
    }
    if (event.key === 'Enter' || event.key.toLowerCase() === 'p') {
      event.preventDefault();
      playSelected();
      return;
    }
    if (event.key.toLowerCase() === 'd') {
      event.preventDefault();
      discardSelected();
      return;
    }
    if (event.key.toLowerCase() === 'h') {
      event.preventDefault();
      showHint();
      return;
    }
    if (event.key.toLowerCase() === 'u') {
      event.preventDefault();
      undo();
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => keyHandlerRef.current(event);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const trHand = (type: HandType) => handName(lang, type);
  const selectedScore = useMemo(
    () => (curRun && selected.length > 0 ? previewScore(curRun, selected) : null),
    [curRun, selected],
  );
  const blind = curRun ? currentBlind(curRun) : null;
  const progress = blind && curRun ? Math.min(100, (curRun.blindScore / blind.target) * 100) : 0;
  const localCompareRows = useMemo(() => {
    if (!seats || !compare) return [];
    return seats.map((seat, index) => ({
      index,
      name: resolveName(lang, seat, index),
      hearts: seat.hearts,
      score: compare.scores[index] ?? 0,
      total: seat.run.totalScore,
      eliminated: seat.eliminated,
      low: compare.lowest.includes(index),
      lost: compare.losses.includes(index),
      ai: seat.ai,
    }));
  }, [compare, lang, seats]);

  const lanCompareRows = useMemo(() => {
    if (!lanVerdict) return [];
    return lanRoster.map((player) => ({
      index: player.seat,
      name: lanSeatName(lang, lanRoster, player.seat),
      hearts: lanVerdict.hearts[player.seat] ?? 0,
      score: lanVerdict.scores[player.seat] ?? 0,
      total: lanVerdict.totals[player.seat] ?? 0,
      eliminated: lanVerdict.eliminated.includes(player.seat),
      low: lanVerdict.lowest.includes(player.seat),
      lost: lanVerdict.losses.includes(player.seat),
      ai: false,
    }));
  }, [lang, lanRoster, lanVerdict]);

  const compareRows =
    mode === 'lan-host' || mode === 'lan-guest' ? lanCompareRows : localCompareRows;
  const shownCompare = mode === 'lan-host' || mode === 'lan-guest' ? lanVerdict : compare;
  const shownBlindIndex =
    mode === 'lan-host' || mode === 'lan-guest' ? lanVerdict?.blindIndex ?? 0 : compareIndex;
  const shownKind: BlindKind =
    shownBlindIndex >= 18
      ? 'finale'
      : (['small', 'big', 'boss'] as const)[shownBlindIndex % 3];
  const shownAnte = shownBlindIndex >= 18 ? 6 : Math.floor(shownBlindIndex / 3) + 1;
  const currentSeatName =
    seats && seats[active] ? resolveSeat(seats[active], active) : tr('you');

  const renderMastActions = (compact = false) => (
    <div className={compact ? 'mast-actions compact' : 'mast-actions'}>
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
      <button
        className="ghost"
        onClick={() => setReducedMotion((value) => !value)}
        data-testid="motion"
      >
        {reducedMotion ? tr('motionOff') : tr('motionOn')}
      </button>
    </div>
  );

  const scoreFormula = (chips: number, mult: number, total: number) => (
    <span className="score-formula">
      <strong>{formatNum(chips)}</strong> × <strong>{mult}</strong> ={' '}
      <b>{formatNum(total)}</b>
    </span>
  );

  const handPanel = () => {
    if (!curRun) return null;
    const canAct = curRun.phase === 'blind';
    return (
      <div className="hand-zone">
        <div className="hand" data-testid="hand" data-hand-count={curRun.hand.length}>
          {curRun.hand.map((card, index) => (
            <PlayingCard
              key={card.id}
              card={card}
              lang={lang}
              index={index}
              total={curRun.hand.length}
              selected={selected.includes(card.id)}
              hinted={hint.includes(card.id)}
              disabled={!canAct}
              onClick={canAct ? () => toggleCard(card.id) : undefined}
            />
          ))}
        </div>
        <div className="hand-actions">
          <span className="selection-count" data-testid="selected-count">
            {tr('selected', { n: selected.length })}
          </span>
          <div className="row-actions">
            <button
              className="primary"
              onClick={playSelected}
              disabled={!canAct || selected.length === 0}
              data-testid="play"
            >
              {tr('play')}
            </button>
            <button
              className="secondary"
              onClick={discardSelected}
              disabled={
                !canAct ||
                selected.length === 0 ||
                curRun.discardsLeft <= 0 ||
                curRun.boss === 'rulebook'
              }
              data-testid="discard"
            >
              {tr('discard')}
            </button>
            <button
              className="secondary"
              onClick={showHint}
              disabled={!canAct}
              data-testid="hint"
            >
              {tr('hint')}
            </button>
            <button
              className="ghost action-ghost"
              onClick={undo}
              disabled={!canAct || history.length === 0 || isLan}
              data-testid="undo"
            >
              {tr('undo')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handPreview = () => {
    if (!curRun) return null;
    if (!selectedScore) {
      return (
        <div className="preview empty-preview">
          <span className="tiny-label">{tr('handPreview')}</span>
          <p>{tr('noSelection')}</p>
        </div>
      );
    }
    return (
      <div className="preview" data-testid="hand-preview">
        <span className="tiny-label">{tr('handPreview')}</span>
        <strong className="preview-hand">{trHand(selectedScore.hand.type)}</strong>
        <div className="preview-formula">
          {scoreFormula(selectedScore.chips, selectedScore.mult, selectedScore.total)}
        </div>
        <div className="preview-tags">
          <span>{tr('baseScore')} {selectedScore.baseChips}×{selectedScore.baseMult}</span>
          {selectedScore.enhancementChips > 0 ? (
            <span>✦ +{selectedScore.enhancementChips}</span>
          ) : null}
          {selectedScore.enhancementMult > 0 ? (
            <span>✹ +{selectedScore.enhancementMult}</span>
          ) : null}
          {selectedScore.jokerChips > 0 || selectedScore.jokerMult > 0 ? (
            <span>
              {tr('jokerBonus')} +{selectedScore.jokerChips}
              {selectedScore.jokerMult > 0 ? ` / +${selectedScore.jokerMult}×` : ''}
            </span>
          ) : null}
          {selectedScore.xMult !== 1 ? <span>×{selectedScore.xMult}</span> : null}
        </div>
      </div>
    );
  };

  const breakdownPanel = () => {
    if (!curRun?.lastHand) {
      return (
        <div className="breakdown quiet">
          <span className="tiny-label">{tr('lastHand')}</span>
          <p>{tr('selectCards')}</p>
        </div>
      );
    }
    const value = curRun.lastHand;
    return (
      <div className="breakdown" data-testid="breakdown">
        <div className="breakdown-head">
          <span className="tiny-label">{tr('lastHand')}</span>
          <strong>{trHand(value.hand.type)}</strong>
          <span className="breakdown-total">{scoreFormula(value.chips, value.mult, value.total)}</span>
        </div>
        <div className="breakdown-lines">
          <span>
            <small>{tr('baseScore')}</small> {value.baseChips} × {value.baseMult}
          </span>
          <span>
            <small>{tr('cardChips')}</small> +{value.cardChips}
          </span>
          {value.enhancementChips > 0 ? (
            <span>
              <small>{tr('enhancements')}</small> +{value.enhancementChips}
            </span>
          ) : null}
          {value.jokerLines.length > 0 ? (
            <span>
              <small>{tr('jokerBonus')}</small>{' '}
              {value.jokerLines
                .map((line) => {
                  const bits: string[] = [];
                  if (line.chips) bits.push(`+${line.chips}`);
                  if (line.mult) bits.push(`+${line.mult}×`);
                  if (line.xmult !== 1) bits.push(`×${line.xmult}`);
                  return `${jokerName(lang, line.joker)} ${bits.join(' ')}`;
                })
                .join(' · ')}
            </span>
          ) : null}
          {value.xMult !== 1 ? (
            <span>
              <small>{tr('xMult')}</small> ×{value.xMult}
            </span>
          ) : null}
        </div>
        {value.debuffed.length > 0 ? (
          <p className="debuff-note">
            {tr('boss')}: {value.debuffed.join(', ')}
          </p>
        ) : null}
      </div>
    );
  };

  const resultOverlay = () => {
    if (!curRun || curRun.phase === 'blind' || curRun.phase === 'shop' || curRun.phase === 'complete') {
      return null;
    }
    const cleared = curRun.phase === 'cleared';
    const reward = curRun.lastReward;
    const finalSolo =
      mode === 'solo' && curRun.blindIndex >= curRun.plan.length - 1 && cleared;
    return (
      <div className="result-overlay" data-testid="blind-result">
        <div className="result-sheet">
          <span className={`result-stamp ${cleared ? 'good' : 'bad'}`}>
            {cleared ? tr('blindCleared') : tr('blindFailed')}
          </span>
          <h2>{cleared ? tr('blindCleared') : tr('blindFailed')}</h2>
          <div className="result-score">
            {formatNum(curRun.blindScore)} <span>/ {formatNum(blind?.target ?? 0)}</span>
          </div>
          {reward ? (
            <div className="reward-table">
              <div>
                <span>{tr('rewardLabel')}</span>
                <b>${reward.base}</b>
              </div>
              <div>
                <span>{tr('unusedHands')}</span>
                <b>${reward.unusedHands}</b>
              </div>
              <div>
                <span>{tr('interest')}</span>
                <b>${reward.interest}</b>
              </div>
              {reward.treasurer > 0 ? (
                <div>
                  <span>{tr('treasurerBonus')}</span>
                  <b>${reward.treasurer}</b>
                </div>
              ) : null}
              {reward.patron > 0 ? (
                <div>
                  <span>{tr('patronBonus')}</span>
                  <b>${reward.patron}</b>
                </div>
              ) : null}
              <div className="reward-total">
                <span>{tr('total')}</span>
                <b>${reward.total}</b>
              </div>
            </div>
          ) : null}
          {!cleared && mode === 'solo' ? <p className="muted">{tr('lossReason')}</p> : null}
          <button className="primary wide" onClick={continueAfterBlind} data-testid="continue">
            {mode === 'lan-host' || mode === 'lan-guest'
              ? tr('lanSubmit')
              : finalSolo
                ? tr('claimVictory')
                : cleared
                  ? mode === 'solo'
                    ? tr('toShop')
                    : tr('continueButton')
                  : mode === 'solo'
                    ? tr('continueButton')
                    : tr('continueButton')}
          </button>
        </div>
      </div>
    );
  };

  const renderHome = () => (
    <main className="shell home-shell" data-testid="home">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('eyebrow')}</p>
          <h1>{tr('title')}</h1>
        </div>
        {renderMastActions()}
      </header>

      <section className="hero">
        <div className="hero-art" aria-hidden="true">
          <div className="art-arch">
            <CardFan lang={lang} />
            <span className="art-line" />
            <p className="hero-tagline">{tr('tagline')}</p>
          </div>
          <div className="art-sun" />
          <div className="art-rule" />
        </div>
        <div className="hero-menu">
          {saved ? (
            <button className="primary wide menu-row" onClick={resumeSaved} data-testid="save-continue">
              <span>{tr('continueRun')}</span>
              <small>{tr('savedOn')}</small>
            </button>
          ) : null}
          <button className="secondary wide menu-row" onClick={() => openSetup('solo')} data-testid="start-solo">
            <span>{tr('playSolo')}</span>
            <small>{tr('soloDesc')}</small>
          </button>
          <button className="secondary wide menu-row" onClick={() => openSetup('rivals')} data-testid="start-rivals">
            <span>{tr('playRivals')}</span>
            <small>{tr('rivalsDesc')}</small>
          </button>
          <button className="secondary wide menu-row" onClick={() => openSetup('hotseat')} data-testid="start-hotseat">
            <span>{tr('playHotseat')}</span>
            <small>{tr('hotseatDesc')}</small>
          </button>
          <button className="secondary wide menu-row" onClick={openLanHub} data-testid="start-lan">
            <span>{tr('playLan')}</span>
            <small>{tr('lanDesc')}</small>
          </button>
          <div className="home-links">
            <button className="text-button" onClick={() => setScreen('rules')} data-testid="rules">
              {tr('rules')} →
            </button>
            <button className="text-button" onClick={() => setScreen('record')} data-testid="stats">
              {tr('record')} →
            </button>
          </div>
        </div>
      </section>

      <div className="record-strip">
        <span>{tr('record')}</span>
        <strong>{record.runs}</strong>
        <span>{tr('recordRuns')}</span>
        <span className="dot">·</span>
        <span>{record.wins} {tr('recordWins')}</span>
        <span className="dot">·</span>
        <span>{tr('recordBestScore')} {formatNum(record.bestScore)}</span>
      </div>
      <footer className="foot">{tr('tagline')}</footer>
    </main>
  );

  const renderSetup = () => (
    <main className="shell narrow-shell" data-testid="setup">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('setupTitle')}</h2>
      <div className="mode-tabs">
        {RUN_MODES.map((item) => (
          <button
            key={item}
            className={`mode-tab ${setupMode === item ? 'selected' : ''}`}
            onClick={() => setSetupMode(item)}
            data-testid={`mode-${item}`}
          >
            {tr(modeKey(item))}
          </button>
        ))}
      </div>

      <section className="setup-section">
        <h3>{tr('deck')}</h3>
        <div className="deck-grid">
          {DECKS.map((deckChoiceItem) => (
            <button
              key={deckChoiceItem.id}
              className={`deck-card ${deckChoice === deckChoiceItem.id ? 'selected' : ''}`}
              onClick={() => setDeckChoice(deckChoiceItem.id)}
              data-testid={`deck-${deckChoiceItem.id}`}
            >
              <span className="deck-glyph" aria-hidden="true">{deckChoiceItem.glyph}</span>
              <strong>{deckName(lang, deckChoiceItem.id)}</strong>
              <small>{deckText(lang, deckChoiceItem.id)}</small>
            </button>
          ))}
        </div>
      </section>

      {setupMode === 'rivals' ? (
        <section className="setup-section">
          <h3>{tr('aiLevel')}</h3>
          <div className="level-grid">
            {AI_LEVELS.map((id) => (
              <button
                key={id}
                className={`level-card ${level === id ? 'selected' : ''}`}
                onClick={() => setLevel(id)}
                data-testid={`level-${id}`}
              >
                <span className={`level-dot ${id}`} />
                <strong>{tr(id)}</strong>
                <small>{tr(`${id}Note` as MessageKey)}</small>
              </button>
            ))}
          </div>
          <div className="inline-choices">
            <span>{tr('rivals')}</span>
            {[1, 2, 3].map((count) => (
              <button
                key={count}
                className={rivalCount === count ? 'choice selected' : 'choice'}
                onClick={() => setRivalCount(count)}
                data-testid={`rivals-${count}`}
              >
                {count}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {setupMode === 'hotseat' ? (
        <section className="setup-section">
          <div className="inline-choices">
            <span>{tr('players')}</span>
            {[2, 3, 4].map((count) => (
              <button
                key={count}
                className={playerCount === count ? 'choice selected' : 'choice'}
                onClick={() => setPlayerCount(count)}
                data-testid={`players-${count}`}
              >
                {count}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="setup-section">
        <label className="field">
          <span>{tr('seed')}</span>
          <input
            value={seedInput}
            onChange={(event) => setSeedInput(event.target.value)}
            placeholder={tr('seedPlaceholder')}
            maxLength={24}
            data-testid="seed-input"
          />
        </label>
      </section>

      <div className="row-actions setup-actions">
        <button className="primary" onClick={() => startLocalRun(setupMode)} data-testid="begin">
          {tr('startRun')}
        </button>
        <button className="ghost" onClick={() => setScreen('home')}>{tr('back')}</button>
      </div>
    </main>
  );

  const renderJokerRail = (run: RunState, allowSell = false) => (
    <section className="rail-card">
      <div className="rail-head">
        <h3>{tr('jokers')}</h3>
        <span>{run.jokers.length}/{JOKER_SLOTS}</span>
      </div>
      <JokerShelf
        jokers={run.jokers}
        lang={lang}
        mirrorwright={run.boss === 'mirrorwright'}
        onSell={allowSell ? sellJokerAt : undefined}
        onInfo={allowSell ? undefined : setShowJokerInfo}
      />
      {allowSell && run.jokers.length > 0 ? (
        <div className="owned-jokers">
          {run.jokers.map((id) => (
            <div key={id} className="owned-joker-line">
              <b>{jokerName(lang, id)}</b>
              <span>{jokerText(lang, id)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {showJokerInfo ? (
        <div className="joker-detail">
          <strong>{jokerName(lang, showJokerInfo)}</strong>
          <p>{jokerText(lang, showJokerInfo)}</p>
          <button className="text-button" onClick={() => setShowJokerInfo(null)}>{tr('close')}</button>
        </div>
      ) : null}
    </section>
  );

  const renderGame = () => {
    if (!curRun || !blind) return null;
    return (
      <main
        className="shell game-shell"
        data-testid="game-shell"
        data-phase={curRun.phase}
        data-blind-index={curRun.blindIndex}
        data-seed={curRun.seed}
        data-mode={mode}
      >
        <header className="game-top">
          <button className="back" onClick={goHome}>← {tr('home')}</button>
          <div className="game-id">
            <strong>{tr('title')}</strong>
            <span>{trMode}{mode === 'rivals' ? ` · ${tr(level)}` : ''}</span>
          </div>
          {renderMastActions(true)}
        </header>

        <section className="run-banner">
          <div className="ante-mark">
            <span>{tr('ante')} {blind.ante} / 6</span>
            <div className="ante-dots">
              {[1, 2, 3, 4, 5, 6].map((value) => (
                <i key={value} className={value <= blind.ante ? 'on' : ''} />
              ))}
            </div>
          </div>
          <div className="blind-mark">
            <strong>{tr(blindKey(blind.kind))}</strong>
            <span>{tr('target')} {formatNum(blind.target)}</span>
          </div>
          <div className="seed-mark">
            {tr('seedShort', { seed: curRun.seedText.slice(0, 16) })}
          </div>
        </section>

        <div className="game-layout">
          <section className="table-panel">
            <div className="table-top">
              <div className="score-plaque">
                <span className="tiny-label">{tr('score')}</span>
                <strong data-testid="score-value">{formatNum(curRun.blindScore)}</strong>
                <small>/ {formatNum(blind.target)}</small>
                <span className="meter">
                  <i style={{ width: `${progress}%` }} />
                </span>
              </div>
              <div className="run-pips">
                <div>
                  <span className="tiny-label">{tr('hands')}</span>
                  <span className="pips">
                    {Array.from({ length: Math.max(curRun.handsLeft, 0) }).map((_, index) => (
                      <i key={index} className="pip hand-pip" />
                    ))}
                    {Array.from({ length: Math.max(0, (curRun.boss === 'shortBell' ? 3 : 4) + (curRun.vouchers.includes('extraHand') ? 1 : 0) - curRun.handsLeft) }).map((_, index) => (
                      <i key={`spent-${index}`} className="pip spent" />
                    ))}
                  </span>
                </div>
                <div>
                  <span className="tiny-label">{tr('discards')}</span>
                  <span className="pips">
                    {Array.from({ length: Math.max(curRun.discardsLeft, 0) }).map((_, index) => (
                      <i key={index} className="pip discard-pip" />
                    ))}
                    {Array.from({ length: Math.max(0, (DECK_BY_ID[curRun.deckId].extraDiscards + 3 + (curRun.vouchers.includes('extraDiscard') ? 1 : 0)) - curRun.discardsLeft) }).map((_, index) => (
                      <i key={`spent-d-${index}`} className="pip spent" />
                    ))}
                  </span>
                </div>
                <div>
                  <span className="tiny-label">{tr('money')}</span>
                  <b className="money-value">${curRun.money}</b>
                </div>
              </div>
            </div>

            {blind.boss ? <BossPlaque id={blind.boss} lang={lang} /> : null}

            <div className="felt">
              <div className="felt-glow" aria-hidden="true" />
              {breakdownPanel()}
              {handPreview()}
            </div>

            {handPanel()}
          </section>

          <aside className="run-rail">
            {renderJokerRail(curRun)}
            <section className="rail-card">
              <div className="rail-head">
                <h3>{tr('runInfo')}</h3>
                <span>{tr('deck')}: {deckName(lang, curRun.deckId)}</span>
              </div>
              <dl className="run-stats">
                <div><dt>{tr('money')}</dt><dd>${curRun.money}</dd></div>
                <div><dt>{tr('enhancedCards')}</dt><dd>{enhancedCount(curRun)}</dd></div>
                <div><dt>{tr('vouchersOwned')}</dt><dd>{curRun.vouchers.length}</dd></div>
                <div><dt>{tr('cumulative')}</dt><dd>{formatNum(curRun.totalScore)}</dd></div>
                <div><dt>{tr('bestHand')}</dt><dd>{formatNum(curRun.bestHandScore)}</dd></div>
                <div><dt>{tr('seed')}</dt><dd>{curRun.seedText.slice(0, 12)}</dd></div>
              </dl>
            </section>
            <section className="rail-card keyboard-card">
              <p>{tr('keyboardHelp')}</p>
            </section>
          </aside>
        </div>
        {resultOverlay()}
        {toast ? <div className="toast" data-testid="toast">{toast}</div> : null}
      </main>
    );
  };

  const offerName = (offer: ShopOffer): string => {
    if (offer.kind === 'joker') return jokerName(lang, offer.joker);
    if (offer.kind === 'voucher') return voucherName(lang, offer.voucher);
    return enhancementName(lang, offer.enhancement);
  };

  const offerText = (offer: ShopOffer): string => {
    if (offer.kind === 'joker') return jokerText(lang, offer.joker);
    if (offer.kind === 'voucher') return voucherText(lang, offer.voucher);
    return enhancementText(lang, offer.enhancement);
  };

  const offerGlyph = (offer: ShopOffer): string => {
    if (offer.kind === 'joker') return JOKER_BY_ID[offer.joker].glyph;
    if (offer.kind === 'voucher') return VOUCHER_BY_ID[offer.voucher].glyph;
    return ENHANCEMENT_BY_ID[offer.enhancement].glyph;
  };

  const renderOffer = (offer: ShopOffer | null, index: number) => {
    if (!offer) {
      return (
        <article className="offer-card sold" key={`sold-${index}`} data-testid="offer-sold">
          <span className="tiny-label">{tr('sold')}</span>
        </article>
      );
    }
    const affordable = curRun ? curRun.money >= offer.price : false;
    const slotsFull = offer.kind === 'joker' && (curRun?.jokers.length ?? 0) >= JOKER_SLOTS;
    return (
      <article className={`offer-card ${offer.kind}`} key={`offer-${index}`} data-testid="offer" data-offer-kind={offer.kind}>
        <div className="offer-top">
          <span className="offer-glyph" aria-hidden="true">{offerGlyph(offer)}</span>
          <span className="offer-kind">{tr(offer.kind === 'joker' ? 'offerJoker' : offer.kind === 'voucher' ? 'offerVoucher' : 'offerEnhancement')}</span>
          <span className="offer-price">${offer.price}</span>
        </div>
        <strong className="offer-name">{offerName(offer)}</strong>
        <p>{offerText(offer)}</p>
        <button
          className="secondary wide"
          onClick={() => purchase(index)}
          disabled={!affordable || slotsFull}
          data-testid="buy-offer"
        >
          {slotsFull ? tr('slotsFull') : affordable ? tr('buy') : tr('noMoney')}
        </button>
      </article>
    );
  };

  const renderShop = () => {
    if (!curRun) return null;
    const pickingOffer = enhanceOffer;
    return (
      <main className="shell shop-shell" data-testid="shop">
        <header className="game-top">
          <button className="back" onClick={goHome}>← {tr('home')}</button>
          <div className="game-id">
            <strong>{tr('shopTitle')}</strong>
            <span>{tr('ante')} {currentBlind(curRun).ante} / 6 · {tr(blindKey(currentKind(curRun)))}</span>
          </div>
          {renderMastActions(true)}
        </header>
        <section className="shop-head">
          <div>
            <span className="tiny-label">{tr('money')}</span>
            <strong className="shop-money">${curRun.money}</strong>
          </div>
          {(mode === 'hotseat' || mode === 'rivals') && seats ? (
            <div className="shopper">{currentSeatName}</div>
          ) : null}
          <div className="shop-controls">
            <button className="secondary" onClick={reroll} disabled={curRun.money < 2} data-testid="reroll">
              {tr('reroll')}
            </button>
            <button className="primary" onClick={leaveShop} data-testid="leave-shop">
              {tr('leaveShop')}
            </button>
          </div>
        </section>

        <div className="shop-layout">
          <div className="offer-grid">
            {curRun.offers.length === 0
              ? <p className="muted">{tr('shopEmpty')}</p>
              : curRun.offers.map((offer, index) => renderOffer(offer, index))}
          </div>

          <aside className="shop-rail">
            {renderJokerRail(curRun, true)}
            <section className="rail-card">
              <div className="rail-head">
                <h3>{tr('vouchersOwned')}</h3>
                <span>{curRun.vouchers.length}</span>
              </div>
              <div className="voucher-list">
                {curRun.vouchers.length === 0 ? <p className="muted">{tr('shopEmpty')}</p> : null}
                {curRun.vouchers.map((id) => (
                  <span className="voucher-pill" key={id} title={voucherText(lang, id)}>
                    {VOUCHER_BY_ID[id].glyph} {voucherName(lang, id)}
                  </span>
                ))}
              </div>
            </section>
            <section className="rail-card">
              <div className="rail-head">
                <h3>{tr('deckTitle')}</h3>
                <span>{tr('enhancedCards')} {enhancedCount(curRun)}</span>
              </div>
              <p className="muted">{tr('allCards')}</p>
            </section>
          </aside>
        </div>

        {pickingOffer !== null && curRun.offers[pickingOffer]?.kind === 'enhancement' ? (
          <div className="modal-backdrop" data-testid="deck-picker">
            <div className="modal">
              <div className="modal-head">
                <h3>{tr('chooseCard')}</h3>
                <button className="ghost" onClick={() => setEnhanceOffer(null)}>{tr('cancel')}</button>
              </div>
              <div className="deck-picker-grid">
                {curRun.deck.map((card) => (
                  <button
                    key={card.id}
                    className={`deck-pick ${card.enhance ? 'enhanced' : ''}`}
                    disabled={Boolean(card.enhance)}
                    onClick={() => purchase(pickingOffer, card.id)}
                    data-testid="deck-card"
                    data-card-id={card.id}
                  >
                    <PlayingCard card={card} lang={lang} size="mini" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {toast ? <div className="toast" data-testid="toast">{toast}</div> : null}
      </main>
    );
  };

  const renderCompare = () => {
    if (!shownCompare) return null;
    return (
      <main className="shell compare-shell" data-testid="compare">
        <header className="game-top">
          <button className="back" onClick={goHome}>← {tr('home')}</button>
          <div className="game-id">
            <strong>{tr('compareTitle')}</strong>
            <span>{tr('blindShort', { kind: tr(blindKey(shownKind)), n: shownAnte })}</span>
          </div>
          {renderMastActions(true)}
        </header>
        <section className="compare-panel">
          <div className="compare-head">
            <span className="tiny-label">{tr('thisBlind')}</span>
            <strong>{tr('compareTitle')}</strong>
          </div>
          <div className="compare-table">
            <div className="compare-row header">
              <span>{tr('players')}</span>
              <span>{tr('thisBlind')}</span>
              <span>{tr('cumulative')}</span>
              <span>{tr('hearts')}</span>
            </div>
            {compareRows.map((row) => (
              <div
                className={`compare-row ${row.lost ? 'lost' : ''} ${row.low ? 'lowest' : ''} ${row.eliminated ? 'out' : ''}`}
                key={row.index}
                data-testid="compare-row"
              >
                <span className="compare-name">
                  {row.index === (mode === 'lan-guest' ? selfSeat : 0) ? <i className="you-dot" /> : null}
                  {row.name}
                </span>
                <span className="compare-score">{formatNum(row.score)}</span>
                <span>{formatNum(row.total)}</span>
                <span><HeartRow hearts={row.hearts} lang={lang} /></span>
              </div>
            ))}
          </div>
          <div className="compare-notes">
            {shownCompare.tiedLowest ? <p className="safe-note">{tr('safeTie')}</p> : null}
            {shownCompare.losses.map((seat) => {
              const row = compareRows.find((item) => item.index === seat);
              return row ? <p key={seat} className="loss-note">{tr('lostHeart', { name: row.name })}</p> : null;
            })}
            {shownCompare.eliminated.map((seat) => {
              const row = compareRows.find((item) => item.index === seat);
              return row ? <p key={`out-${seat}`} className="out-note">{tr('eliminatedLabel', { name: row.name })}</p> : null;
            })}
            {shownCompare.winner !== null || (shownCompare.activeAfter.length <= 1 && !shownCompare.tiedLowest) ? (
              <p className="winner-note">
                {(() => {
                  const winner = shownCompare.winner ?? shownCompare.activeAfter[0];
                  const row = compareRows.find((item) => item.index === winner);
                  return row ? tr('verdictWinner', { name: row.name }) : tr('verdictDraw');
                })()}
              </p>
            ) : null}
          </div>
          <button className="primary" onClick={continueCompare} data-testid="continue-compare">
            {shownCompare.winner !== null ? tr('continueButton') : tr('tableContinues')}
          </button>
        </section>
        {toast ? <div className="toast" data-testid="toast">{toast}</div> : null}
      </main>
    );
  };

  const renderHandoff = () => {
    if (!seats) return null;
    const seat = seats[active];
    if (!seat) return null;
    return (
      <main className="shell handoff-shell" data-testid="handoff">
        <header className="game-top">
          <button className="back" onClick={goHome}>← {tr('home')}</button>
          <div className="game-id">
            <strong>{tr('title')}</strong>
            <span>{trMode}</span>
          </div>
          {renderMastActions(true)}
        </header>
        <section className="handoff-card">
          <span className="tiny-label">{tr('handoffTitle')}</span>
          <h2>{tr('handoffTo', { name: resolveSeat(seat, active) })}</h2>
          <div className="handoff-back" aria-hidden="true">
            <CardBack lang={lang} size="mini" />
            <CardBack lang={lang} size="mini" />
            <CardBack lang={lang} size="mini" />
          </div>
          <p className="handoff-note">
            {tr('ante')} {currentAnte(seat.run)} · {tr(blindKey(currentKind(seat.run)))} · {tr('target')} {formatNum(currentBlind(seat.run).target)}
          </p>
          <div className="handoff-hearts">
            <HeartRow hearts={seat.hearts} lang={lang} />
          </div>
          <button className="primary wide" onClick={showHandoff} data-testid="show-hand">
            {tr('showHand')}
          </button>
        </section>
      </main>
    );
  };

  const renderEnd = () => {
    if (!endInfo) return null;
    const competitive = endInfo.mode !== 'solo';
    const dynamicWinnerName =
      endInfo.winnerSeat !== null
        ? endInfo.mode === 'lan-host' || endInfo.mode === 'lan-guest'
          ? lanSeatName(lang, lanRoster, endInfo.winnerSeat)
          : seats?.[endInfo.winnerSeat]
            ? resolveSeat(seats[endInfo.winnerSeat], endInfo.winnerSeat)
            : endInfo.winnerName
        : undefined;
    const title = competitive
      ? endInfo.draw
        ? tr('verdictDraw')
        : dynamicWinnerName
          ? tr('verdictWinner', { name: dynamicWinnerName })
          : endInfo.won
            ? tr('runWon')
            : tr('runLost')
      : endInfo.won
        ? tr('runWon')
        : tr('runLost');
    return (
      <main className="shell end-shell" data-testid="end">
        <header className="game-top">
          <button className="back" onClick={goHome}>← {tr('home')}</button>
          <div className="game-id">
            <strong>{tr('title')}</strong>
            <span>{trMode}</span>
          </div>
          {renderMastActions(true)}
        </header>
        <section className={`end-card ${endInfo.won ? 'won' : endInfo.draw ? 'draw' : 'lost'}`}>
          <span className="tiny-label">{competitive ? tr('compareTitle') : tr('runInfo')}</span>
          <h2>{title}</h2>
          {competitive && dynamicWinnerName ? (
            <p className="end-winner">{tr('winnerName', { name: dynamicWinnerName })}</p>
          ) : null}
          {!endInfo.won && !competitive ? <p className="muted">{tr('lossReason')}</p> : null}
          <div className="end-stats">
            <div>
              <span className="tiny-label">{tr('finalScore')}</span>
              <strong>{formatNum(endInfo.score)}</strong>
            </div>
            <div>
              <span className="tiny-label">{tr('anteReached')}</span>
              <strong>{endInfo.ante} / 6</strong>
            </div>
            <div>
              <span className="tiny-label">{tr('bestHand')}</span>
              <strong>{formatNum(endInfo.bestHandScore)}</strong>
              {endInfo.bestHandType ? <small>{trHand(endInfo.bestHandType)}</small> : null}
            </div>
          </div>
          <div className="row-actions end-actions">
            <button className="primary" onClick={handleEndAgain} data-testid="play-again">
              {tr('playAgain')}
            </button>
            <button className="secondary" onClick={goHome} data-testid="change-table">
              {tr('changeTable')}
            </button>
          </div>
        </section>
      </main>
    );
  };

  const renderRecord = () => (
    <main className="shell narrow-shell" data-testid="record">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('recordTitle')}</h2>
      <div className="record-grid">
        <div className="record-stat">
          <span className="tiny-label">{tr('recordRuns')}</span>
          <strong data-testid="record-matches">{record.runs}</strong>
        </div>
        <div className="record-stat">
          <span className="tiny-label">{tr('recordWins')}</span>
          <strong>{record.wins}</strong>
        </div>
        <div className="record-stat">
          <span className="tiny-label">{tr('recordBestScore')}</span>
          <strong>{formatNum(record.bestScore)}</strong>
        </div>
        <div className="record-stat">
          <span className="tiny-label">{tr('recordBestAnte')}</span>
          <strong>{record.bestAnte}</strong>
        </div>
      </div>
      <section className="record-modes">
        <h3>{tr('byMode')}</h3>
        <div className="mode-counts">
          {(Object.keys(record.byMode) as RecordMode[]).map((key) => (
            <span key={key}><b>{record.byMode[key]}</b> {tr(modeKey(key === 'lan' ? 'lan-host' : key))}</span>
          ))}
        </div>
      </section>
      <section className="recent">
        <h3>{tr('recordRecent')}</h3>
        {record.recent.length === 0 ? <p className="muted">{tr('recordEmpty')}</p> : null}
        {record.recent.map((entry, index) => (
          <div className="recent-row" key={`${entry.at}-${index}`} data-testid="recent-row">
            <span className={`result-pill ${entry.result}`}>{tr(entry.result === 'win' ? 'resultWin' : entry.result === 'loss' ? 'resultLoss' : 'resultDraw')}</span>
            <span>{tr(modeKey(entry.mode === 'lan' ? 'lan-host' : entry.mode))}</span>
            <span>{tr('recordScore', { score: formatNum(entry.score) })}</span>
            <span>{tr('recordAnte', { n: entry.ante })}</span>
            <span className="muted">{formatDate(entry.at, lang)}</span>
          </div>
        ))}
      </section>
      <button
        className="ghost"
        onClick={() => setRecord(clearStoredRecord())}
        data-testid="clear-record"
      >
        {tr('clearRecord')}
      </button>
    </main>
  );

  const renderRules = () => {
    const sections: { title: MessageKey; bodies: MessageKey[] }[] = [
      { title: 'rulesDeckTitle', bodies: ['rulesDeck', 'rulesHands'] },
      { title: 'rulesScoreTitle', bodies: ['rulesScore'] },
      { title: 'rulesRunTitle', bodies: ['rulesRun', 'rulesMoney', 'rulesBoss', 'rulesDecks'] },
      { title: 'rulesShopTitle', bodies: ['rulesShop', 'rulesEnhance'] },
      { title: 'rulesContentTitle', bodies: ['rulesContent'] },
      { title: 'rulesCompetitiveTitle', bodies: ['rulesCompetitive'] },
      { title: 'rulesModesTitle', bodies: ['rulesHotseat', 'rulesLan', 'rulesAi'] },
      { title: 'rulesComfortTitle', bodies: ['rulesUndo', 'rulesComfort', 'rulesKeyboard'] },
      { title: 'rulesHonestyTitle', bodies: ['rulesNoMoney'] },
    ];
    return (
      <main className="shell narrow-shell" data-testid="rules">
        <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
        <h2 className="screen-title">{tr('rulesTitle')}</h2>
        <div className="rules-grid">
          {sections.map((section) => (
            <article key={section.title} className="rule-card">
              <h3>{tr(section.title)}</h3>
              {section.bodies.map((body) => (
                <p key={body}>{tr(body)}</p>
              ))}
            </article>
          ))}
        </div>
      </main>
    );
  };

  const renderLan = () => {
    const guestMode = lanRole === 'guest' || Boolean(INVITE);
    return (
      <main className="shell narrow-shell lan-shell" data-testid="lan">
        <button className="back" onClick={goHome}>← {tr('back')}</button>
        <h2 className="screen-title">{tr('lanTitle')}</h2>
        {lanError ? <p className="error" data-testid="lan-error">{lanError}</p> : null}
        {guestMode ? (
          <section className="lan-card">
            <h3>{tr('lanJoinTitle')}</h3>
            {!guest ? (
              <div className="lan-form">
                <label className="field">
                  <span>{tr('lanRoomLabel')}</span>
                  <input value={guestRoom} onChange={(event) => setGuestRoom(event.target.value)} maxLength={8} />
                </label>
                <label className="field">
                  <span>{tr('lanCode')}</span>
                  <input value={guestCode} onChange={(event) => setGuestCode(event.target.value)} inputMode="numeric" maxLength={4} />
                </label>
                <label className="field">
                  <span>{tr('lanName')}</span>
                  <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={18} />
                </label>
                <button
                  className="primary wide"
                  onClick={joinGuest}
                  disabled={guestConnecting || !guestRoom || !guestName.trim()}
                  data-testid="lan-join"
                >
                  {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
                </button>
              </div>
            ) : null}
            {guest ? (
              <div className="waiting-card" data-testid="waiting-card">
                <span className="tiny-label">{tr('lanRoomLabel')}</span>
                <strong>{guestRoom || guest.room}</strong>
                <p>{guestStarted ? tr('lanGameStart') : tr('lanWaiting')}</p>
                <div className="peer-list">
                  {guestPlayers.filter((player) => player.connected).map((player) => (
                    <span key={player.seat} className="online">
                      {lanSeatName(lang, guestPlayers, player.seat)} ●
                    </span>
                  ))}
                </div>
                <p className="muted">{tr('lanHostSeat', { n: guest.seat + 1 })}</p>
              </div>
            ) : null}
          </section>
        ) : lanRole === 'host' && lanHost ? (
          <section className="lan-card host-card">
            <h3>{tr('lanHostTitle')}</h3>
            <span className="tiny-label">{tr('lanCode')}</span>
            <div className="room-code big" data-testid="room-code">{lanCode}</div>
            <p className="muted">{tr('lanRoomLabel')}: {lanHost.room}</p>
            <p>{lanPlayers.filter((player) => player.connected).length >= 2 ? tr('lanReady') : tr('lanWaiting')}</p>
            <div className="peer-list">
              {lanPlayers.filter((player) => player.connected).map((player) => (
                <span key={player.seat} className="online">
                  {lanSeatName(lang, lanPlayers, player.seat)} ●
                </span>
              ))}
            </div>
            <div className="seed-line">
              <span>{tr('lanSeedShared')}</span>
              <strong>{seedInput.trim() || '—'}</strong>
            </div>
            <div className="lan-actions">
              <button
                className="primary wide"
                onClick={startLanHost}
                disabled={lanPlayers.filter((player) => player.connected).length < 2}
                data-testid="lan-start"
              >
                {tr('lanStart')}
              </button>
              <button
                className="secondary wide"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(lanInvite);
                    showToast(tr('lanCopied'));
                  } catch {
                    showToast(lanInvite);
                  }
                }}
              >
                {tr('lanCopy')}
              </button>
            </div>
            <a className="invite-link" href={lanInvite} target="_blank" rel="noreferrer">
              {lanInvite.replace(/^https?:\/\//, '')}
            </a>
            {lanQr ? <img className="lan-qr" src={lanQr} alt={tr('lanScan')} /> : null}
          </section>
        ) : (
          <div className="lan-hub">
            <section className="lan-card">
              <h3>{tr('lanHostTitle')}</h3>
              <p>{tr('lanCreateHint')}</p>
              <button className="primary wide" onClick={openLanHost} disabled={lanBusy} data-testid="lan-create">
                {lanBusy ? tr('lanStarting') : tr('lanCreate')}
              </button>
            </section>
            <section className="lan-card">
              <h3>{tr('lanJoinTitle')}</h3>
              <p>{tr('lanManualHint')}</p>
              <label className="field">
                <span>{tr('lanRoomLabel')}</span>
                <input value={guestRoom} onChange={(event) => setGuestRoom(event.target.value)} maxLength={8} />
              </label>
              <label className="field">
                <span>{tr('lanCode')}</span>
                <input value={guestCode} onChange={(event) => setGuestCode(event.target.value)} maxLength={4} />
              </label>
              <label className="field">
                <span>{tr('lanName')}</span>
                <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={18} />
              </label>
              <button
                className="secondary wide"
                onClick={joinGuest}
                disabled={guestConnecting || !guestRoom || !guestName.trim()}
                data-testid="lan-join"
              >
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
            </section>
          </div>
        )}
        {toast ? <div className="toast">{toast}</div> : null}
      </main>
    );
  };

  const renderWait = () => {
    const isHost = mode === 'lan-host';
    const tracker = lanTracker;
    return (
      <main className="shell wait-shell" data-testid="wait">
        <header className="game-top">
          <button className="back" onClick={goHome}>← {tr('home')}</button>
          <div className="game-id">
            <strong>{tr('title')}</strong>
            <span>{trMode}</span>
          </div>
          {renderMastActions(true)}
        </header>
        <section className="wait-card">
          <span className="tiny-label">
            {lanSubmitted ? tr('lanScoreSent') : tr('lanWaitingScores')}
          </span>
          <h2>{tr('waitingTable')}</h2>
          <div className="wait-score">
            {formatNum(soloRun?.blindScore ?? 0)}
          </div>
          {tracker ? (
            <div className="wait-players">
              {tracker.players.map((player) => (
                <div key={player.seat} className={tracker.submitted[player.seat] ? 'submitted' : ''}>
                  <span>{lanSeatName(lang, tracker.players, player.seat)}</span>
                  <b>{tracker.submitted[player.seat] ? '✓' : '…'}</b>
                </div>
              ))}
            </div>
          ) : null}
          {!isHost ? <p className="muted">{tr('lanWaitingHost')}</p> : null}
        </section>
      </main>
    );
  };

  const renderSpectate = () => {
    const rows = mode === 'lan-host' || mode === 'lan-guest' ? lanCompareRows : localCompareRows;
    return (
      <main className="shell wait-shell" data-testid="spectate">
        <header className="game-top">
          <button className="back" onClick={goHome}>← {tr('home')}</button>
          <div className="game-id">
            <strong>{tr('title')}</strong>
            <span>{trMode}</span>
          </div>
          {renderMastActions(true)}
        </header>
        <section className="wait-card">
          <span className="tiny-label">{tr('spectating')}</span>
          <h2>{tr('youAreOut')}</h2>
          <p className="muted">{tr('lanEliminated')}</p>
          <div className="spectate-list">
            {rows.map((row) => (
              <div key={row.index} className="spectate-row">
                <span>{row.name}</span>
                <HeartRow hearts={row.hearts} lang={lang} />
                <b>{formatNum(row.total)}</b>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  };

  if (screen === 'setup') return renderSetup();
  if (screen === 'game') return renderGame();
  if (screen === 'shop') return renderShop();
  if (screen === 'compare') return renderCompare();
  if (screen === 'handoff') return renderHandoff();
  if (screen === 'end') return renderEnd();
  if (screen === 'record') return renderRecord();
  if (screen === 'rules') return renderRules();
  if (screen === 'lan') return renderLan();
  if (screen === 'wait') return renderWait();
  if (screen === 'spectate') return renderSpectate();
  return renderHome();
}

