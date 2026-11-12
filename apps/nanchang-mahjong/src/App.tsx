import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseAiAction, hintFor, type AiLevel, type Hint } from './ai/ai';
import { Discards, Hand, HandBacks, Melds, TileButton, TileBack } from './components/Tiles';
import {
  claim,
  currentClaim,
  declareKong,
  declareWin,
  discard,
  draw,
  nextHand,
  passClaim,
  setup,
  sortTiles,
  tileLabel,
  view,
  windOfSeat,
  type ClaimOption,
  type GameState,
  type KongOption,
  type SeatView,
  type Tile,
  type WinMethod,
  type WinPattern,
} from './game/nanchang-mahjong';
import { makeDemoState, type DemoKind } from './demo';
import { detectLang, t, type Lang, type MessageKey } from './i18n';
import {
  guestWsUrl,
  hostWsUrl,
  inviteUrl,
  startLanServer,
  type LanServerInfo,
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
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'record' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';

const LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionNote' },
  { id: 'easy', label: 'easy', note: 'easyNote' },
  { id: 'normal', label: 'normal', note: 'normalNote' },
  { id: 'hard', label: 'hard', note: 'hardNote' },
];

const PATTERN_KEY: Record<WinPattern, MessageKey> = {
  basic: 'patternBasic',
  'small-seven-pairs': 'patternSmallSevenPairs',
  'big-seven-pairs': 'patternBigSevenPairs',
  'thirteen-scattered': 'patternThirteenScattered',
  'seven-star': 'patternSevenStar',
};

const METHOD_KEY: Record<WinMethod, MessageKey> = {
  'self-draw': 'methodSelfDraw',
  discard: 'methodDiscard',
  'rob-kong': 'methodRobKong',
  heavenly: 'methodHeavenly',
  human: 'methodHuman',
};

const WIND_KEYS: MessageKey[] = ['seatEast', 'seatSouth', 'seatWest', 'seatNorth'];

function windKey(seat: number, dealer: number): MessageKey {
  const wind = windOfSeat(seat, dealer);
  const index = Number(wind.slice(1)) - 1;
  return WIND_KEYS[index] ?? 'seatEast';
}

function windBadge(seat: number, dealer: number, lang: Lang): string {
  const wind = windOfSeat(seat, dealer);
  const index = Number(wind.slice(1)) - 1;
  if (lang === 'zh') return ['东', '南', '西', '北'][index] ?? '东';
  return ['E', 'S', 'W', 'N'][index] ?? 'E';
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function nextDecisionSeat(state: GameState): number {
  if (state.phase === 'claim') return currentClaim(state)?.seat ?? 0;
  return state.turn;
}

function soundFor(previous: GameState, next: GameState): Parameters<typeof chime>[0] {
  if (next.phase === 'game-over' || next.phase === 'hand-over') {
    return next.win ? 'win' : 'draw-hand';
  }
  const meldBefore = previous.melds.reduce((sum, list) => sum + list.length, 0);
  const meldAfter = next.melds.reduce((sum, list) => sum + list.length, 0);
  if (meldAfter > meldBefore) return 'meld';
  const handBefore = previous.hands.reduce((sum, hand) => sum + hand.length, 0);
  const handAfter = next.hands.reduce((sum, hand) => sum + hand.length, 0);
  if (handAfter > handBefore) return 'draw';
  return 'discard';
}

export default function App() {
  const params = useMemo(() => guestParams(), []);
  const demoKind = useMemo<DemoKind | null>(() => {
    if (typeof location === 'undefined') return null;
    const value = new URLSearchParams(location.search).get('demo');
    return value === 'mid' || value === 'end' || value === 'over' ? value : null;
  }, []);

  const homeSpirit = useMemo(() => makeDemoState('mid').spirit, []);
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (demoKind ? 'game' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (params ? 'lan-guest' : 'ai'));
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() =>
    demoKind
      ? makeDemoState(demoKind)
      : setup({ rng: Math.random, dealer: 0, matchTarget: 100 }),
  );
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<Tile | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [kongOpen, setKongOpen] = useState(false);
  const [localReveal, setLocalReveal] = useState(true);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => (demoKind ? null : loadSave()));
  const [clearArmed, setClearArmed] = useState(false);
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.nanchang-mahjong.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [motionOn, setMotionOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.nanchang-mahjong.motion') !== 'off';
    } catch {
      return true;
    }
  });

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
      return localStorage.getItem('familyarcade.nanchang-mahjong.hostName') ?? '';
    } catch {
      return '';
    }
  });
  const [humanSeats, setHumanSeats] = useState<number[]>([0]);
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => params?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => params?.code || params?.room || '');
  const [guestRoom] = useState(() => params?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [guestPlayers, setGuestPlayers] = useState<LanPublicPeer[]>([]);

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const hostStartedRef = useRef(false);
  const humanSeatsRef = useRef<number[]>([0]);
  const guestRef = useRef<LanGuest | null>(null);
  const autoJoinRef = useRef(false);
  const finishRecordedRef = useRef(Boolean(demoKind && demoKind !== 'mid'));
  const lastDecisionRef = useRef<number>(-1);
  const aiTimerRef = useRef<number | null>(null);
  const promptRef = useRef<HTMLDivElement | null>(null);
  const handScrollRef = useRef<HTMLDivElement | null>(null);
  const commitRef = useRef<(next: GameState, previous: GameState, history: boolean) => void>(() => undefined);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [screen]);

  useEffect(() => {
    humanSeatsRef.current = humanSeats;
  }, [humanSeats]);

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
      localStorage.setItem('familyarcade.nanchang-mahjong.sound', soundOn ? 'on' : 'off');
      localStorage.setItem('familyarcade.nanchang-mahjong.motion', motionOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn, motionOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const lastGuestViewRef = useRef<SeatView | null>(null);
  useEffect(() => {
    const next = guestView;
    if (!next) {
      lastGuestViewRef.current = null;
      return;
    }
    const previous = lastGuestViewRef.current;
    lastGuestViewRef.current = next;
    if (!previous || previous.version === next.version || !soundOn) return;
    if (next.phase === 'hand-over' || next.phase === 'game-over') {
      chime(next.win ? 'win' : 'draw-hand');
      return;
    }
    const meldsBefore = previous.melds.reduce((sum, list) => sum + list.length, 0);
    const meldsAfter = next.melds.reduce((sum, list) => sum + list.length, 0);
    if (meldsAfter > meldsBefore) chime('meld');
    else if (next.hand.length > previous.hand.length || next.drawn) chime('draw');
    else chime('discard');
  }, [guestView, soundOn]);

  const tr = useCallback(
    (key: MessageKey, values?: Record<string, string | number>) => t(lang, key, values),
    [lang],
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
    (next: GameState, previous: GameState, addHistory: boolean) => {
      if (addHistory) setHistory((items) => [...items, previous]);
      setState(next);
      setSelected(null);
      setHint(null);
      setKongOpen(false);
      setAiThinking(false);
      if (soundOn) chime(soundFor(previous, next));
      if (mode === 'ai' || mode === 'local') {
        if (next.phase === 'game-over') clearSave();
        else saveGame({ state: next, mode, level });
        setSaved(null);
      }
      if (mode === 'lan-host') sendViews(next);
      if ((next.phase === 'hand-over' || next.phase === 'game-over') && !finishRecordedRef.current) {
        finishRecordedRef.current = true;
        if (!demoKind) {
          const sheet = next.scoreSheet;
          const recordMode: RecordMode =
            mode === 'lan-host' ? 'lan' : mode === 'local' ? 'local' : 'ai';
          setRecord(
            recordResult(
              {
                winner: next.win?.seat ?? null,
                pattern: next.win?.pattern ?? null,
                deltas: sheet?.deltas ?? [0, 0, 0, 0],
                hand: next.handNumber,
              },
              { mode: recordMode, level },
            ),
          );
        }
      }
    },
    [demoKind, level, mode, sendViews, soundOn],
  );

  commitRef.current = commit;

  const startGame = useCallback(
    (nextMode: 'ai' | 'local') => {
      const next = setup({ rng: Math.random, dealer: 0, matchTarget: 100 });
      setMode(nextMode);
      setState(next);
      setHistory([]);
      setSelected(null);
      setHint(null);
      setKongOpen(false);
      setLocalReveal(nextMode !== 'local');
      lastDecisionRef.current = -1;
      finishRecordedRef.current = false;
      setScreen('game');
      setSaved(null);
      clearSave();
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    },
    [],
  );

  const goHome = useCallback(() => {
    if ((mode === 'ai' || mode === 'local') && (state.phase === 'draw' || state.phase === 'discard' || state.phase === 'claim' || state.phase === 'hand-over')) {
      saveGame({ state, mode, level });
      setSaved({ version: 1, state, mode, level, savedAt: Date.now() });
    }
    try {
      hostRef.current?.sendResult({ kind: 'closed' });
    } catch {
      /* socket may be gone */
    }
    hostRef.current?.close();
    hostRef.current = null;
    hostStartedRef.current = false;
    guestRef.current?.close();
    guestRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanError('');
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    setGuestPlayers([]);
    setHumanSeats([0]);
    setScreen('home');
  }, [level, mode, state]);

  const resume = useCallback(() => {
    if (!saved) return;
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    setHistory([]);
    setSelected(null);
    setHint(null);
    setKongOpen(false);
    finishRecordedRef.current = saved.state.phase === 'hand-over' || saved.state.phase === 'game-over';
    lastDecisionRef.current = -1;
    setLocalReveal(saved.mode !== 'local');
    setScreen('game');
    setSaved(null);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [saved]);

  const localActor = mode === 'local' && (state.phase === 'draw' || state.phase === 'discard' || state.phase === 'claim')
    ? nextDecisionSeat(state)
    : 0;
  const shownSeat = mode === 'lan-guest' ? (guestView?.seat ?? 0) : mode === 'local' ? localActor : 0;
  const localView = useMemo(() => view(state, shownSeat), [state, shownSeat]);
  const shown: SeatView = guestView ?? localView;

  useEffect(() => {
    if (mode !== 'local') {
      setLocalReveal(true);
      return;
    }
    if (state.phase === 'hand-over' || state.phase === 'game-over') {
      setLocalReveal(true);
      return;
    }
    const seat = nextDecisionSeat(state);
    if (seat !== lastDecisionRef.current) {
      lastDecisionRef.current = seat;
      setLocalReveal(false);
    }
  }, [mode, state.phase, state.turn, state.claimIndex, state.version]);

  const hidden = mode === 'local' && !localReveal &&
    (state.phase === 'draw' || state.phase === 'discard' || state.phase === 'claim');

  useEffect(() => {
    if (selected && !shown.hand.includes(selected)) setSelected(null);
  }, [selected, shown.hand]);

  const isGuest = mode === 'lan-guest';
  const shownPhase = shown.phase;
  const shownTurn = shown.turn;
  const isClaimSeat = shownPhase === 'claim' && shown.claimSeat === shownSeat;

  useEffect(() => {
    if (isGuest || hidden || shownPhase === 'hand-over' || shownPhase === 'game-over') {
      setAiThinking(false);
      return;
    }
    const seat = shownPhase === 'claim' ? shown.claimSeat : shownTurn;
    if (seat === null || seat === undefined || seat < 0) {
      setAiThinking(false);
      return;
    }
    const human = mode === 'ai' ? seat === 0 : mode === 'lan-host' ? humanSeats.includes(seat) : true;
    if (mode === 'local' || human) {
      setAiThinking(false);
      return;
    }
    setAiThinking(true);
    if (aiTimerRef.current !== null) window.clearTimeout(aiTimerRef.current);
    aiTimerRef.current = window.setTimeout(() => {
      const current = stateRef.current;
      const actor = current.phase === 'claim' ? current.claimQueue[current.claimIndex]?.seat : current.turn;
      if (actor === undefined || actor < 0) {
        setAiThinking(false);
        return;
      }
      const action = chooseAiAction(current, actor, level, Math.random);
      if (!action) {
        setAiThinking(false);
        return;
      }
      let result;
      switch (action.type) {
        case 'draw':
          result = draw(current, actor);
          break;
        case 'discard':
          result = discard(current, actor, action.tile);
          break;
        case 'win':
          result = declareWin(current, actor);
          break;
        case 'kong':
          result = declareKong(current, actor, action.option);
          break;
        case 'claim':
          result = claim(current, actor, action.option);
          break;
        case 'pass':
          result = passClaim(current, actor);
          break;
        default:
          result = { ok: false, state: current };
      }
      setAiThinking(false);
      if (result.ok) commit(result.state, current, false);
    }, 420);
    return () => {
      if (aiTimerRef.current !== null) {
        window.clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
    };
  }, [commit, hidden, humanSeats, isGuest, level, mode, shown.claimSeat, shownPhase, shownTurn, state.version]);

  useEffect(() => {
    if (hidden) return;
    const node = promptRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight + 1) {
      node.scrollIntoView({ block: 'nearest', behavior: motionOn ? 'smooth' : 'auto' });
    }
  }, [hidden, isClaimSeat, kongOpen, motionOn, shown.claimSeat]);

  useEffect(() => {
    const tile = hint?.tile;
    if (!tile || hidden) return;
    const container = handScrollRef.current;
    if (!container) return;
    const element = Array.from(container.querySelectorAll<HTMLElement>('[data-tile]')).find(
      (node) => node.dataset.tile === tile,
    );
    if (!element) return;
    const box = container.getBoundingClientRect();
    const tileBox = element.getBoundingClientRect();
    if (tileBox.left < box.left + 4 || tileBox.right > box.right - 4) {
      container.scrollBy({
        left: tileBox.left - box.left - 8,
        behavior: motionOn ? 'smooth' : 'auto',
      });
    }
  }, [hint, hidden, motionOn]);

  const canHintNow =
    !isGuest &&
    !hidden &&
    ((shownPhase === 'discard' && shownTurn === shownSeat) ||
      (shownPhase === 'claim' && shown.claimSeat === shownSeat));

  const showHint = useCallback(() => {
    if (!canHintNow) return;
    const seat = shownPhase === 'claim' ? shown.claimSeat : shown.turn;
    if (seat === null || seat === undefined || seat < 0) return;
    const nextHint = hintFor(state, seat);
    if (!nextHint) return;
    setHint(nextHint);
    if (nextHint.tile) setSelected(nextHint.tile);
    if (nextHint.action.type === 'kong') setKongOpen(true);
    const tile = nextHint.tile ?? state.lastDiscard?.tile;
    const pattern = nextHint.pattern ? tr(PATTERN_KEY[nextHint.pattern]) : '';
    let text = '';
    switch (nextHint.reason) {
      case 'win':
        text = tr('hintWin', { pattern });
        break;
      case 'kong':
        text = tr('hintKong');
        break;
      case 'claim-win':
        text = tr('hintClaimWin', { tile: tile ? tileLabel(tile, lang) : '' });
        break;
      case 'claim-gang':
        text = tr('hintClaimGang', { tile: tile ? tileLabel(tile, lang) : '' });
        break;
      case 'claim-peng':
        text = tr('hintClaimPeng', { tile: tile ? tileLabel(tile, lang) : '' });
        break;
      case 'claim-chi':
        text = tr('hintClaimChi', { tile: tile ? tileLabel(tile, lang) : '' });
        break;
      case 'pass':
        text = tr('hintPass');
        break;
      case 'discard-tenpai':
        text = tr('hintDiscardTenpai', { tile: tile ? tileLabel(tile, lang) : '', n: nextHint.waits ?? 0 });
        break;
      case 'discard-spirit':
        text = tr('hintDiscardSpirit', { tile: tile ? tileLabel(tile, lang) : '' });
        break;
      case 'discard-scatter':
        text = tr('hintDiscardScatter', { tile: tile ? tileLabel(tile, lang) : '' });
        break;
      case 'discard-safe':
        text = tr('hintDiscardSafe', { tile: tile ? tileLabel(tile, lang) : '' });
        break;
      default:
        text = tr('hintDiscardIsolated', { tile: tile ? tileLabel(tile, lang) : '' });
    }
    setToast(text);
  }, [canHintNow, lang, shown.claimSeat, shown.turn, shownPhase, state, tr]);

  const undo = useCallback(() => {
    if (isGuest || mode === 'lan-host' || history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));
    setState(previous);
    setSelected(null);
    setHint(null);
    setKongOpen(false);
    finishRecordedRef.current = false;
    if (mode === 'local') setLocalReveal(true);
    setSaved(null);
  }, [history, isGuest, mode]);

  const doDraw = useCallback(() => {
    if (isGuest) {
      if (shown.canDraw) guestRef.current?.sendIntent({ type: 'draw' });
      return;
    }
    const result = draw(state, shownSeat);
    if (result.ok) commit(result.state, state, true);
  }, [commit, isGuest, shown.canDraw, shownSeat, state]);

  const doDiscard = useCallback(() => {
    if (!selected) return;
    if (isGuest) {
      if (shown.canDiscard) guestRef.current?.sendIntent({ type: 'discard', tile: selected });
      return;
    }
    const result = discard(state, shownSeat, selected);
    if (result.ok) commit(result.state, state, true);
  }, [commit, isGuest, selected, shown.canDiscard, shownSeat, state]);

  const doWin = useCallback(() => {
    if (isGuest) {
      guestRef.current?.sendIntent({ type: 'win' });
      return;
    }
    const result = declareWin(state, shownSeat);
    if (result.ok) commit(result.state, state, true);
  }, [commit, isGuest, shownSeat, state]);

  const doClaim = useCallback(
    (option: ClaimOption) => {
      if (isGuest) {
        guestRef.current?.sendIntent({ type: 'claim', option });
        return;
      }
      const result = claim(state, shownSeat, option);
      if (result.ok) commit(result.state, state, true);
    },
    [commit, isGuest, shownSeat, state],
  );

  const doPass = useCallback(() => {
    if (isGuest) {
      guestRef.current?.sendIntent({ type: 'pass' });
      return;
    }
    const result = passClaim(state, shownSeat);
    if (result.ok) commit(result.state, state, true);
  }, [commit, isGuest, shownSeat, state]);

  const doKong = useCallback(
    (option: KongOption) => {
      if (isGuest) {
        guestRef.current?.sendIntent({ type: 'kong', option });
        return;
      }
      const result = declareKong(state, shownSeat, option);
      if (result.ok) commit(result.state, state, true);
    },
    [commit, isGuest, shownSeat, state],
  );

  const doNextHand = useCallback(() => {
    if (isGuest) return;
    const result = nextHand(state, Math.random);
    if (!result.ok) return;
    setState(result.state);
    setHistory([]);
    setSelected(null);
    setHint(null);
    setKongOpen(false);
    setLocalReveal(mode !== 'local');
    lastDecisionRef.current = -1;
    finishRecordedRef.current = false;
    if (mode === 'lan-host') sendViews(result.state);
    if (mode === 'ai' || mode === 'local') saveGame({ state: result.state, mode, level });
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [isGuest, level, mode, sendViews, state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (screen === 'game') goHome();
        else setScreen('home');
        return;
      }
      if (screen !== 'game' || hidden) return;
      if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        if (shown.canDraw) doDraw();
        return;
      }
      if (event.key === 'w' || event.key === 'W') {
        event.preventDefault();
        if (shown.canWin) doWin();
        return;
      }
      if (event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        if (shown.kongOptions.length > 0) setKongOpen((value) => !value);
        return;
      }
      if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        if (canHintNow) showHint();
        return;
      }
      if (event.key === 'u' || event.key === 'U') {
        event.preventDefault();
        undo();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        doDiscard();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const hand = shown.hand;
        if (hand.length === 0) return;
        const index = selected ? hand.indexOf(selected) : -1;
        const nextIndex =
          event.key === 'ArrowRight'
            ? Math.min(hand.length - 1, index < 0 ? 0 : index + 1)
            : Math.max(0, index < 0 ? hand.length - 1 : index - 1);
        setSelected(hand[nextIndex]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canHintNow, doDiscard, doDraw, doWin, goHome, hidden, screen, selected, showHint, shown.canDraw, shown.canWin, shown.hand, shown.kongOptions.length, undo]);

  const closeLan = useCallback(() => {
    try {
      hostRef.current?.sendResult({ kind: 'closed' });
    } catch {
      /* socket may be gone */
    }
    hostRef.current?.close();
    hostRef.current = null;
    hostStartedRef.current = false;
    const activeGuest = guestRef.current;
    guestRef.current = null;
    activeGuest?.close();
    setLanHost(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanError('');
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    setGuestPlayers([]);
    setHumanSeats([0]);
  }, []);

  const openLanHost = useCallback(async () => {
    if (lanBusy) return;
    closeLan();
    setScreen('lan');
    setMode('lan-host');
    setLanBusy(true);
    setLanError('');
    try {
      const info = await startLanServer();
      setLanInfo(info);
      const code = newRoomCode();
      const name = hostName.trim() || tr('lanHostTag');
      const created = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room: code,
        code,
        name,
        maxPlayers: 4,
      });
      hostRef.current = created;
      setLanHost(created);
      setLanCode(code);
      created.onChange((players) => {
        if (hostRef.current !== created) return;
        setLanPlayers(players);
        created.sendLobby();
        const humans = [0, ...players.filter((player) => player.connected && !player.host).map((player) => player.seat)];
        humanSeatsRef.current = humans;
        setHumanSeats(humans);
        if (hostStartedRef.current) {
          for (const seat of humans) {
            if (seat !== 0) created.sendView(seat, view(stateRef.current, seat));
          }
        }
      });
      created.onIntent((seat, intent) => {
        if (hostRef.current !== created) return;
        if (!humanSeatsRef.current.includes(seat)) return;
        const value = intent as
          | { type?: string; tile?: string; option?: ClaimOption | KongOption }
          | null;
        if (!value || typeof value.type !== 'string') return;
        const current = stateRef.current;
        let result;
        switch (value.type) {
          case 'draw':
            result = draw(current, seat);
            break;
          case 'discard':
            result = typeof value.tile === 'string' ? discard(current, seat, value.tile) : { ok: false, state: current };
            break;
          case 'win':
            result = declareWin(current, seat);
            break;
          case 'claim':
            result = value.option ? claim(current, seat, value.option as ClaimOption) : { ok: false, state: current };
            break;
          case 'pass':
            result = passClaim(current, seat);
            break;
          case 'kong':
            result = value.option ? declareKong(current, seat, value.option as KongOption) : { ok: false, state: current };
            break;
          default:
            result = { ok: false, state: current };
        }
        if (result.ok) {
          commitRef.current(result.state, current, false);
        } else {
          created.sendView(seat, view(current, seat));
        }
      });
      created.onClose(() => {
        if (hostRef.current !== created) return;
        hostRef.current = null;
        hostStartedRef.current = false;
        setLanHost(null);
        setLanPlayers([]);
        setLanError(tr('hostLost'));
      });
      const url = inviteUrl(info, code, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#173d32', light: '#fff8e8' },
        }),
      );
    } catch (error) {
      setLanError(lanMessage(lang, error instanceof Error ? error.message : String(error)));
      hostRef.current?.close();
      hostRef.current = null;
      setLanHost(null);
      setLanPlayers([]);
    } finally {
      setLanBusy(false);
    }
  }, [closeLan, hostName, lang, lanBusy, tr]);

  const joinGuest = useCallback(async () => {
    if (guestConnecting || guestRef.current) return;
    const room = guestRoom || guestCode.trim();
    const code = guestCode.trim() || room;
    const name = guestName.trim() || tr('lanGuestTag');
    if (!/^\d{4}$/.test(room)) {
      setLanError(tr('wrongCode'));
      return;
    }
    setGuestConnecting(true);
    setLanError('');
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room,
        code,
        name,
      });
      guestRef.current = joined;
      setGuest(joined);
      setGuestView(null);
      setGuestStarted(false);
      setGuestPlayers([]);
      joined.onView((payload) => {
        if (guestRef.current !== joined) return;
        const next = payload as SeatView;
        if (!next || !Array.isArray(next.hand) || !Array.isArray(next.melds)) return;
        setGuestView(next);
        setGuestStarted(true);
        setMode('lan-guest');
        setScreen('game');
      });
      joined.onStart((players) => {
        if (guestRef.current !== joined) return;
        if (Array.isArray(players)) setGuestPlayers(players);
        setGuestStarted(true);
      });
      joined.onPlayers((players) => {
        if (guestRef.current !== joined) return;
        setGuestPlayers(players);
      });
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? tr('roomFull') : tr('wrongCode'));
      });
      joined.onResult((payload) => {
        if (guestRef.current !== joined) return;
        const value = payload as { kind?: string } | null;
        if (value?.kind !== 'closed') return;
        setLanError(tr('roomClosed'));
        setScreen('lan');
        setGuest(null);
        setGuestView(null);
        setGuestStarted(false);
        guestRef.current = null;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLanError(lanMessage(lang, message));
    } finally {
      setGuestConnecting(false);
    }
  }, [guestCode, guestConnecting, guestName, guestRoom, lang, tr]);

  useEffect(() => {
    if (!guestRoom || autoJoinRef.current) return;
    autoJoinRef.current = true;
    setScreen('lan');
    setMode('lan-guest');
    void joinGuest();
  }, [guestRoom, joinGuest]);

  useEffect(() => {
    if (!guest) return;
    const timer = window.setInterval(() => {
      if (guest.status === 'closed') {
        setLanError(tr('roomClosed'));
        setScreen('lan');
        setGuest(null);
        setGuestView(null);
        setGuestStarted(false);
        guestRef.current = null;
      }
    }, 900);
    return () => window.clearInterval(timer);
  }, [guest, tr]);

  const startLanGame = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const humans = [
      0,
      ...host.players
        .filter((player) => player.connected && !player.host)
        .map((player) => player.seat),
    ];
    humanSeatsRef.current = humans;
    setHumanSeats(humans);
    const next = setup({ rng: Math.random, dealer: 0, matchTarget: 100 });
    setState(next);
    setHistory([]);
    setSelected(null);
    setHint(null);
    setKongOpen(false);
    setMode('lan-host');
    setScreen('game');
    finishRecordedRef.current = false;
    hostStartedRef.current = true;
    host.start();
    for (const seat of humans) {
      if (seat !== 0) host.sendView(seat, view(next, seat));
    }
  }, []);

  const seatName = useCallback(
    (seat: number): string => {
      if (mode === 'lan-guest') {
        if (seat === guestView?.seat) return guestName.trim() || tr('you');
        const player = guestPlayers.find((item) => item.seat === seat);
        if (player?.name) return player.name;
        if (seat === 0) return guestPlayers.find((item) => item.host)?.name ?? tr('lanHostTag');
        return `${tr('aiTag')}`;
      }
      if (mode === 'lan-host') {
        if (seat === 0) return hostName.trim() || tr('you');
        const player = lanPlayers.find((item) => item.seat === seat);
        if (player?.name) return player.name;
        return `${tr('aiTag')}`;
      }
      if (mode === 'local') return tr('lanSeat', { seat: seat + 1 });
      return seat === 0 ? tr('you') : tr('aiTag');
    },
    [guestName, guestPlayers, guestView?.seat, hostName, lanPlayers, mode, tr],
  );

  const patternText = (pattern: WinPattern | null): string => (pattern ? tr(PATTERN_KEY[pattern]) : '');
  const methodText = (method: WinMethod | null): string => (method ? tr(METHOD_KEY[method]) : '');
  const shortSeatName = (seat: number): string => (seat === 0 ? tr('you') : tr('lanSeat', { seat: seat + 1 }));
  const scoreSeatName = (seat: number): string => {
    if (mode === 'local') return tr('lanSeat', { seat: seat + 1 });
    if (mode === 'lan-host' || mode === 'lan-guest') return seatName(seat);
    return shortSeatName(seat);
  };
  const recordWinnerName = (entry: { winner: number | null; mode: RecordMode }): string => {
    if (entry.winner === null) return tr('noWinner');
    if (entry.mode === 'lan') return tr('lanSeat', { seat: entry.winner + 1 });
    return shortSeatName(entry.winner);
  };

  const home = (
    <main className={`shell home-shell ${motionOn ? '' : 'reduce-motion'}`} data-testid="home">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('eyebrow')}</p>
          <h1>{tr('title')}</h1>
        </div>
        <div className="mast-actions">
          <button className="ghost" data-testid="language" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
          <button className="ghost" data-testid="sound" onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
          <button className="ghost" data-testid="motion" onClick={() => setMotionOn((value) => !value)}>
            {motionOn ? tr('motionOn') : tr('motionOff')}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-rack" aria-hidden="true">
          <div className="hero-glow" />
          <div className="hero-tile-row">
            <TileButton tile="m1" spirit={homeSpirit} lang={lang} />
            <TileButton tile="m3" spirit={homeSpirit} lang={lang} />
            <TileButton tile="m5" spirit={homeSpirit} lang={lang} />
            <TileButton tile="p2" spirit={homeSpirit} lang={lang} />
            <TileButton tile="p6" spirit={homeSpirit} lang={lang} />
            <TileButton tile="z5" spirit={homeSpirit} lang={lang} />
            <TileButton tile="z7" spirit={homeSpirit} lang={lang} />
          </div>
          <div className="hero-caption">{tr('tagline')}</div>
        </div>
        <div className="hero-copy">
          <div className="menu">
            {saved && (
              <button className="primary wide" data-testid="save-continue" onClick={resume}>
                <span>{tr('continueGame')}</span>
                <small>{tr('savedOn')}</small>
              </button>
            )}
            <button className={saved ? 'secondary wide' : 'primary wide'} data-testid="start-ai" onClick={() => setScreen('setup')}>
              <span>{tr('playSolo')}</span>
              <small>{tr('soloNote')}</small>
            </button>
            <button className="secondary wide" data-testid="start-local" onClick={() => startGame('local')}>
              <span>{tr('playLocal')}</span>
              <small>{tr('localNote')}</small>
            </button>
            <button className="secondary wide" data-testid="start-lan" onClick={() => void openLanHost()}>
              <span>{tr('playLan')}</span>
              <small>{tr('lanNote')}</small>
            </button>
            <div className="text-row">
              <button className="text-button" data-testid="rules" onClick={() => setScreen('rules')}>
                {tr('rules')} →
              </button>
              <button className="text-button" data-testid="record" onClick={() => setScreen('record')}>
                {tr('record')} →
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('recordHands')}</span>
            <strong>{record.hands}</strong>
            <span className="dot">·</span>
            <span>{tr('recordWins')}</span>
            <strong>{record.wins.reduce((sum, wins) => sum + wins, 0)}</strong>
            <span className="dot">·</span>
            <span>{tr('recordBest')}</span>
            <strong>{signed(record.bestScore)}</strong>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('footer')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell" data-testid="setup">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('setupTitle')}</h2>
      <div className="level-grid">
        {LEVELS.map((item) => (
          <button
            key={item.id}
            className={`level-card ${level === item.id ? 'selected' : ''}`}
            data-testid={`level-${item.id}`}
            onClick={() => setLevel(item.id)}
          >
            <span className={`level-dot ${item.id}`} />
            <strong>{tr(item.label)}</strong>
            <small>{tr(item.note)}</small>
          </button>
        ))}
      </div>
      <div className="facts">
        <div className="fact"><span>{tr('factTiles')}</span></div>
        <div className="fact"><span>{tr('factDeadWall')}</span></div>
        <div className="fact"><span>{tr('factSpirits')}</span></div>
        <div className="fact"><span>{tr('factModes')}</span></div>
      </div>
      <div className="row-actions">
        <button className="primary" data-testid="begin" onClick={() => startGame('ai')}>{tr('beginMatch')}</button>
        <button className="ghost" onClick={() => setScreen('home')}>{tr('back')}</button>
      </div>
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell" data-testid="rules">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <div className="rules-grid">
        <section>
          <h3>{tr('rulesTilesTitle')}</h3>
          <ul>
            <li>{tr('rulesTiles1')}</li>
            <li>{tr('rulesTiles2')}</li>
            <li>{tr('rulesTiles3')}</li>
            <li>{tr('rulesTiles4')}</li>
          </ul>
        </section>
        <section>
          <h3>{tr('rulesSpiritsTitle')}</h3>
          <ul>
            <li>{tr('rulesSpirits1')}</li>
            <li>{tr('rulesSpirits2')}</li>
            <li>{tr('rulesSpirits3')}</li>
            <li>{tr('rulesSpirits4')}</li>
            <li>{tr('rulesSpirits5')}</li>
          </ul>
        </section>
        <section>
          <h3>{tr('rulesMeldsTitle')}</h3>
          <ul>
            <li>{tr('rulesMelds1')}</li>
            <li>{tr('rulesMelds2')}</li>
            <li>{tr('rulesMelds3')}</li>
            <li>{tr('rulesMelds4')}</li>
          </ul>
        </section>
        <section>
          <h3>{tr('rulesWinsTitle')}</h3>
          <ul>
            <li>{tr('rulesWins1')}</li>
            <li>{tr('rulesWins2')}</li>
            <li>{tr('rulesWins3')}</li>
            <li>{tr('rulesWins4')}</li>
            <li>{tr('rulesWins5')}</li>
          </ul>
        </section>
        <section>
          <h3>{tr('rulesScoringTitle')}</h3>
          <ul>
            <li>{tr('rulesScoring1')}</li>
            <li>{tr('rulesScoring2')}</li>
            <li>{tr('rulesScoring3')}</li>
            <li>{tr('rulesScoring4')}</li>
            <li>{tr('rulesScoring5')}</li>
            <li>{tr('rulesScoring6')}</li>
            <li>{tr('rulesScoring7')}</li>
            <li>{tr('rulesScoring8')}</li>
          </ul>
        </section>
        <section>
          <h3>{tr('rulesModesTitle')}</h3>
          <ul>
            <li>{tr('rulesModes1')}</li>
            <li>{tr('rulesModes2')}</li>
            <li>{tr('rulesModes3')}</li>
          </ul>
        </section>
      </div>
      <button className="primary" onClick={() => setScreen('home')}>{tr('close')}</button>
    </main>
  );

  const recordScreen = (
    <main className="shell narrow-shell" data-testid="record-screen">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('recordTitle')}</h2>
      <div className="stats-row">
        <div className="stat-card">
          <span>{tr('recordHands')}</span>
          <strong data-testid="record-hands">{record.hands}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('recordWins')}</span>
          <strong className="wins-grid">
            {record.wins.map((wins, seat) => (
              <span key={seat}>{shortSeatName(seat)} <b>{wins}</b></span>
            ))}
          </strong>
        </div>
        <div className="stat-card">
          <span>{tr('recordBest')}</span>
          <strong>{signed(record.bestScore)}</strong>
        </div>
      </div>
      <div className="mode-strip">
        <span>{tr('recordByMode')}</span>
        <span>{tr('modeAi')} {record.byMode.ai}</span>
        <span>{tr('modeLocal')} {record.byMode.local}</span>
        <span>{tr('modeLan')} {record.byMode.lan}</span>
      </div>
      <h3 className="subhead">{tr('recordRecent')}</h3>
      {record.recent.length === 0 ? (
        <p className="muted">{tr('recordEmpty')}</p>
      ) : (
        <div className="recent-list">
          {record.recent.map((entry, index) => (
            <div className="recent-row" key={`${entry.at}-${index}`}>
              <span>{tr('handLabel', { n: entry.hand })}</span>
              <strong>{recordWinnerName(entry)}</strong>
              <span>{entry.pattern ? patternText(entry.pattern) : '—'}</span>
              <span>{entry.deltas.map((delta) => signed(delta)).join(' / ')}</span>
              <em>{entry.mode === 'ai' ? tr('modeAi') : entry.mode === 'local' ? tr('modeLocal') : tr('modeLan')}</em>
            </div>
          ))}
        </div>
      )}
      <button
        className="secondary"
        data-testid="clear-record"
        onClick={() => {
          if (!clearArmed) {
            setClearArmed(true);
            return;
          }
          setRecord(clearRecord());
          setClearArmed(false);
        }}
      >
        {clearArmed ? tr('clearRecordConfirm') : tr('clearRecord')}
      </button>
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell" data-testid="lan-screen">
      <button className="back" onClick={() => { closeLan(); setScreen('home'); }}>← {tr('back')}</button>
      {mode === 'lan-guest' || guestRoom ? (
        <>
          <h2 className="screen-title">{tr('joinRoomTitle')}</h2>
          {!guestStarted && (
            <div className="lan-form">
              <label>
                <span>{tr('guestName')}</span>
                <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={18} />
              </label>
              <label>
                <span>{tr('guestCode')}</span>
                <input
                  value={guestCode}
                  onChange={(event) => setGuestCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                  inputMode="numeric"
                  maxLength={4}
                />
              </label>
              <button className="primary wide" data-testid="lan-join" onClick={() => void joinGuest()} disabled={guestConnecting}>
                {guestConnecting ? tr('connecting') : tr('joinButton')}
              </button>
            </div>
          )}
          {guestStarted && (
            <button className="primary" onClick={() => setScreen('game')}>{tr('lanGuestStart')}</button>
          )}
          {lanError && <p className="error">{lanError}</p>}
          {!guestStarted && <p className="muted">{tr('lanJoinHint')}</p>}
        </>
      ) : (
        <>
          <h2 className="screen-title">{tr('hostRoomTitle')}</h2>
          <div className="lan-form">
            <label>
              <span>{tr('hostName')}</span>
              <input value={hostName} onChange={(event) => setHostName(event.target.value)} maxLength={18} />
            </label>
            <button className="primary wide" data-testid="lan-create" onClick={() => void openLanHost()} disabled={lanBusy}>
              {lanBusy ? tr('lanStarting') : tr('createRoom')}
            </button>
          </div>
          {lanInfo && lanInvite && (
            <div className="lan-layout">
              <div className="lan-card">
                <span className="label">{tr('roomCode')}</span>
                <div className="room-code big" data-testid="room-code">{lanCode}</div>
                <p>{lanPlayers.filter((player) => player.connected && !player.host).length > 0 ? tr('lanReady') : tr('waitingGuests')}</p>
                <div className="peer-list">
                  {lanPlayers.map((player) => (
                    <span key={player.seat} className={player.connected ? 'online' : ''}>
                      {player.name} · {tr('lanSeat', { seat: player.seat + 1 })} {player.connected ? '●' : '○'}
                    </span>
                  ))}
                </div>
                <button className="primary wide" data-testid="lan-start" onClick={startLanGame} disabled={!lanHost}>
                  {tr('startLan')}
                </button>
                <p className="muted">{tr('startWithAi')}</p>
                <button
                  className="secondary wide"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(lanInvite);
                      setToast(tr('copied'));
                    } catch {
                      setToast(lanInvite);
                    }
                  }}
                >
                  {tr('copyInvite')}
                </button>
              </div>
              <div className="qr-card">
                {lanQr ? <img src={lanQr} alt={tr('scanJoin')} /> : null}
                <p>{tr('scanJoin')}</p>
                <a className="invite-link" data-testid="invite-link" href={lanInvite} target="_blank" rel="noreferrer">
                  {lanInvite.replace(/^https?:\/\//, '')}
                </a>
              </div>
            </div>
          )}
          {lanError && <p className="error">{lanError}</p>}
          {!lanInfo && !lanBusy && <p className="muted">{tr('lanCreateHint')}</p>}
        </>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'record') return recordScreen;
  if (screen === 'lan') return lanScreen;
  if (screen !== 'game') return home;

  const selectedLabel = selected ? tileLabel(selected, lang) : '';
  const claimWaitName = shown.claimSeat === null ? '' : seatName(shown.claimSeat);
  const currentName = shownTurn >= 0 ? seatName(shownTurn) : '';
  const turnText = shownPhase === 'claim'
    ? tr('claimTurn', { name: claimWaitName })
    : shownPhase === 'draw'
      ? tr('seatTurn', { name: currentName })
      : shownPhase === 'discard'
        ? shownTurn === shownSeat
          ? tr('yourTurn')
          : tr('seatTurn', { name: currentName })
        : '';
  const sheet = shown.scoreSheet;

  const seatPanel = (seat: number, className: string) => {
    const isSelf = seat === shownSeat;
    const isTurn = shown.claimSeat === seat || (shownTurn === seat && shownPhase !== 'hand-over' && shownPhase !== 'game-over');
    return (
      <section className={`seat ${className} ${isTurn ? 'active' : ''} ${isSelf ? 'self' : ''}`} data-seat={seat}>
        <div className="seat-head">
          <span className={`wind-badge wind-${windOfSeat(seat, shown.dealer)}`}>{windBadge(seat, shown.dealer, lang)}</span>
          <strong>{seatName(seat)}</strong>
          {seat === shown.dealer && <span className="dealer-badge">{tr('dealerShort')}</span>}
          <span className="seat-score">{signed(shown.scores[seat])}</span>
        </div>
        {isSelf ? (
          <div className="seat-self-hand">
            <Melds melds={shown.melds[seat]} spirit={shown.spirit} lang={lang} />
            <span className="hand-count-label">{tr('tileCount', { n: shown.hand.length })}</span>
          </div>
        ) : (
          <>
            <HandBacks count={shown.handCounts[seat]} />
            <span className="seat-hand-count">{tr('tileCount', { n: shown.handCounts[seat] })}</span>
            <Melds melds={shown.melds[seat]} spirit={shown.spirit} lang={lang} />
          </>
        )}
        <Discards
          tiles={shown.discards[seat]}
          spirit={shown.spirit}
          lang={lang}
          last={shown.lastDiscard?.seat === seat}
        />
      </section>
    );
  };

  const gameScreen = (
    <main
      className={`shell game-shell ${motionOn ? '' : 'reduce-motion'}`}
      data-testid="game-shell"
      data-phase={shownPhase}
      data-turn={shownTurn}
      data-seat={shownSeat}
      data-hand={shown.handNumber}
      data-dealer={shown.dealer}
    >
      <header className="game-top">
        <button className="back" onClick={goHome}>← {tr('home')}</button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>{tr('handLabel', { n: shown.handNumber })} · {tr('dealer')} {tr(windKey(shown.dealer, shown.dealer))}</span>
        </div>
        <div className="game-top-actions">
          <button className="ghost" data-testid="language" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{tr('language')}</button>
          <button className="ghost" data-testid="sound" onClick={() => setSoundOn((value) => !value)}>{soundOn ? tr('soundOn') : tr('soundOff')}</button>
        </div>
      </header>

      <div className="game-layout">
        <section className="table-wrap">
          <div className="table">
            {seatPanel(2, 'seat-top')}
            {seatPanel(3, 'seat-left')}
            <div className="table-center">
              <div className="spirit-card">
                <div className="spirit-head">
                  <span>{tr('spirits')}</span>
                  <span className="dice">{tr('dice', { a: shown.spirit.dice[0], b: shown.spirit.dice[1] })}</span>
                </div>
                <div className="spirit-tiles">
                  <div className="spirit-item">
                    <TileButton tile={shown.spirit.trueTile} spirit={shown.spirit} lang={lang} small />
                    <span>{tr('trueSpirit')}</span>
                  </div>
                  <div className="spirit-item">
                    <TileButton tile={shown.spirit.secondaryTile} spirit={shown.spirit} lang={lang} small />
                    <span>{tr('secondarySpirit')}</span>
                  </div>
                  <div className="spirit-item indicator">
                    <TileButton tile={shown.spirit.indicator} spirit={shown.spirit} lang={lang} small markSpirit={false} />
                    <span>{tr('indicator')}</span>
                  </div>
                </div>
              </div>
              <div className="table-meta">
                <div>
                  <span className="label">{tr('wall')}</span>
                  <strong>{shown.liveWallCount}</strong>
                </div>
                <div>
                  <span className="label">{tr('deadWall')}</span>
                  <strong>{shown.deadWallCount}</strong>
                </div>
                <div>
                  <span className="label">{tr('drawnTile')}</span>
                  {shown.drawn ? <TileButton tile={shown.drawn} spirit={shown.spirit} lang={lang} small /> : <span>—</span>}
                </div>
              </div>
              <div className="turn-panel">
                <strong>{turnText}</strong>
                {aiThinking && <span className="thinking">…</span>}
              </div>
              <div className="last-discard">
                <span className="label">{tr('lastDiscard')}</span>
                {shown.lastDiscard ? (
                  <>
                    <TileButton tile={shown.lastDiscard.tile} spirit={shown.spirit} lang={lang} small />
                    <span>{seatName(shown.lastDiscard.seat)}</span>
                  </>
                ) : (
                  <span className="muted">{tr('noDiscardYet')}</span>
                )}
              </div>
            </div>
            {seatPanel(1, 'seat-right')}
            {seatPanel(0, 'seat-bottom')}
          </div>

          <div className="hand-area">
            <div className="hand-head">
              <span className="label">{tr('hand')}</span>
              <span className="muted">
                {shownPhase === 'claim'
                  ? isClaimSeat
                    ? tr('claimHint')
                    : tr('claimWaiting')
                  : selected
                    ? tr('selectedTile', { tile: selectedLabel })
                    : tr('discardHint')}
              </span>
            </div>
            {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
            {kongOpen && shown.kongOptions.length > 0 && !hidden && (
              <div className="choice-panel" data-testid="kong-panel" ref={promptRef}>
                <h3>{tr('chooseKong')}</h3>
                <div className="choice-list">
                  {shown.kongOptions.map((option, index) => (
                    <button
                      key={`${option.target}-${index}`}
                      className="choice"
                      data-testid={`kong-option-${index}`}
                      onClick={() => doKong(option)}
                    >
                      <span>{option.kind === 'concealed' ? tr('concealedKong') : tr('addedKong')}</span>
                      <span className="choice-tiles">
                        {option.tiles.map((tile, tileIndex) => (
                          <TileButton key={`${tile}-${tileIndex}`} tile={tile} spirit={shown.spirit} lang={lang} small />
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
                <button className="ghost" onClick={() => setKongOpen(false)}>{tr('cancel')}</button>
              </div>
            )}
            {isClaimSeat && !hidden && (
              <div className="choice-panel claim-panel" data-testid="claim-panel" ref={promptRef}>
                <h3>{tr('claimOptions')}</h3>
                <div className="choice-list">
                  {shown.claimOptions.map((option, index) => (
                    <button
                      key={`${option.kind}-${option.target}-${index}`}
                      className={`choice claim-${option.kind}`}
                      data-testid={`claim-option-${index}`}
                      onClick={() => doClaim(option)}
                    >
                      <span>
                        {option.kind === 'win'
                          ? tr('claimWin')
                          : option.kind === 'gang'
                            ? tr('claimKong')
                            : option.kind === 'peng'
                              ? tr('claimPeng')
                              : tr('claimChi')}
                      </span>
                      <span className="choice-tiles">
                        {option.tiles.map((tile, tileIndex) => (
                          <TileButton key={`${tile}-${tileIndex}`} tile={tile} spirit={shown.spirit} lang={lang} small />
                        ))}
                        {shown.lastDiscard && <TileButton tile={shown.lastDiscard.tile} spirit={shown.spirit} lang={lang} small />}
                      </span>
                    </button>
                  ))}
                </div>
                <button className="secondary" data-testid="pass" onClick={doPass}>{tr('claimPass')}</button>
              </div>
            )}
            <div className={`hand-scroll ${hidden ? 'covered' : ''}`} ref={handScrollRef}>
              {hidden ? (
                <div className="hand-covered">{Array.from({ length: shown.handCounts[shownSeat] }, (_, index) => <TileBack key={index} />)}</div>
              ) : (
                <Hand
                  tiles={sortTiles(shown.hand)}
                  spirit={shown.spirit}
                  lang={lang}
                  selected={selected}
                  hint={hint?.tile ?? null}
                  disabled={!shown.canDiscard}
                  onSelect={(tile) => {
                    setSelected(tile);
                    setHint(null);
                  }}
                />
              )}
            </div>
            <div className="action-bar">
              {shown.canDraw && !hidden && (
                <button className="primary action" data-testid="draw" onClick={doDraw}>{tr('draw')}</button>
              )}
              {shown.canWin && !hidden && (
                <button className="win-button action" data-testid="win" onClick={doWin}>{tr('winButton')}</button>
              )}
              {shown.kongOptions.length > 0 && shown.canDiscard && !hidden && (
                <button className="secondary action" data-testid="kong" onClick={() => setKongOpen((value) => !value)}>{tr('kong')}</button>
              )}
              {shown.canDiscard && !hidden && (
                <button className="secondary action" data-testid="discard" onClick={doDiscard} disabled={!selected}>
                  {tr('discard')}
                </button>
              )}
              <button className="ghost action" data-testid="hint" onClick={showHint} disabled={!canHintNow}>
                {tr('hint')}
              </button>
              <button className="ghost action" data-testid="undo" onClick={undo} disabled={isGuest || mode === 'lan-host' || hidden || history.length === 0}>
                {tr('undo')}
              </button>
            </div>
            {shownPhase === 'draw' && shownTurn === shownSeat && !hidden && (
              <p className="turn-note">{tr('drawFirst')}</p>
            )}
            {isGuest && <p className="turn-note">{tr('localOnly')}</p>}
          </div>
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{tr('recordTitle')}</h3>
            <p>{record.hands} {tr('recordHands')} · {record.wins.reduce((sum, wins) => sum + wins, 0)} {tr('recordWins')}</p>
            <p className="muted keyboard-hint">{tr('keyboardHint')}</p>
          </div>
          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <h3>{tr('lanHostTag')}</h3>
              <div className="room-code">{lanCode || '—'}</div>
              <p>{lanPlayers.filter((player) => player.connected && !player.host).length} / 3</p>
            </div>
          )}
          {isGuest && (
            <div className="side-card lan-mini">
              <h3>{tr('lanGuestTag')}</h3>
              <p>{tr('room', { code: guestRoom || guestCode })}</p>
              <p>{tr('lanGuestSeat', { seat: shownSeat + 1 })}</p>
            </div>
          )}
        </aside>
      </div>

      {hidden && (
        <div className="privacy-overlay" data-testid="privacy-panel">
          <div className="privacy-card">
            <span className="eyebrow">{tr('handLabel', { n: shown.handNumber })}</span>
            <h2>{tr('passDevice', { name: seatName(shownSeat) })}</h2>
            <button className="primary" data-testid="privacy-reveal" onClick={() => setLocalReveal(true)}>
              {tr('showHand')}
            </button>
            <p className="privacy-note">{tr('privacyNote')}</p>
          </div>
        </div>
      )}

      {(shownPhase === 'hand-over' || shownPhase === 'game-over') && sheet && (
        <section
          className="score-overlay"
          data-testid={shownPhase === 'game-over' ? 'match-over' : 'score-sheet'}
        >
          <div className="score-card">
            <div className="score-head">
              <span className="eyebrow">{shownPhase === 'game-over' ? tr('matchOver') : tr('handOver')}</span>
              <h2>
                {shown.win
                  ? `${scoreSeatName(shown.win.seat)} · ${patternText(shown.win.pattern)}`
                  : tr('noWinner')}
              </h2>
              {!shown.win && <p className="muted">{tr('wallExhausted')}</p>}
            </div>
            {shown.win && (
              <div className="score-flags">
                <span>{methodText(shown.win.method)}</span>
                {sheet.germanInGerman ? <span>{tr('germanInGerman')}</span> : sheet.german && <span>{tr('german')}</span>}
                {sheet.spiritSingleWait && <span>{tr('spiritSingleWait')}</span>}
                {sheet.kongDraw && <span>{tr('kongDraw')}</span>}
                {sheet.robbingKong && <span>{tr('robbingKong')}</span>}
                {sheet.heavenly && <span>{tr('heavenly')}</span>}
                {sheet.human && <span>{tr('human')}</span>}
                {sheet.overlord && <span>{tr('overlord')}</span>}
                {sheet.spiritSprint.some((value) => value > 1) && <span>{tr('sprint')}</span>}
                {(shown.win.seat === shown.dealer ||
                  shown.win.from === shown.dealer ||
                  shown.win.method === 'self-draw' ||
                  shown.win.method === 'heavenly') && <span>{tr('dealerDouble')}</span>}
              </div>
            )}
            {shown.win && shown.revealedHands && (
              <div className="score-hand" aria-label={tr('hand')}>
                {[
                  ...shown.revealedHands[shown.win.seat],
                  ...shown.melds[shown.win.seat].flatMap((meld) => meld.tiles),
                ].map((tile, index) => (
                  <TileButton key={`${tile}-${index}`} tile={tile} spirit={shown.spirit} lang={lang} small />
                ))}
              </div>
            )}
            {shown.win && (
              <div className="score-numbers">
                <div><span>{tr('base')}</span><strong>1</strong></div>
                <div><span>{tr('multiplier')}</span><strong>×{sheet.patternMultiplier}</strong></div>
                <div><span>{tr('flatBonus')}</span><strong>+{sheet.flatBonus}</strong></div>
                <div><span>{tr('total')}</span><strong>{sheet.unitValue}</strong></div>
              </div>
            )}
            <div className="score-table">
              <div className="score-row score-header">
                <span>{tr('seat')}</span>
                <span>{tr('spiritsShort')}</span>
                <span>{tr('kongsShort')}</span>
                <span>{tr('delta')}</span>
                <span>{tr('totalShort')}</span>
              </div>
              {[0, 1, 2, 3].map((seat) => (
                <div className={`score-row ${shown.win?.seat === seat ? 'winner' : ''}`} key={seat}>
                  <span>{scoreSeatName(seat)}</span>
                  <span>{sheet.spiritAdjusted[seat]}<small> / {sheet.spiritBase[seat]}</small></span>
                  <span>{sheet.kongPoints[seat]}</span>
                  <span className={sheet.deltas[seat] >= 0 ? 'positive' : 'negative'}>{signed(sheet.deltas[seat])}</span>
                  <span>{signed(sheet.scoresAfter[seat])}</span>
                </div>
              ))}
            </div>
            {sheet.overlord && <p className="score-note">{tr('overlord')} ×2</p>}
            {!isGuest && shownPhase === 'hand-over' && (
              <button className="primary wide" data-testid="next-hand" onClick={doNextHand}>{tr('nextHand')}</button>
            )}
            {!isGuest && shownPhase === 'game-over' && (
              <button className="primary wide" data-testid="play-again" onClick={() => startGame(mode === 'local' ? 'local' : 'ai')}>
                {tr('playAgain')}
              </button>
            )}
            {isGuest && <p className="muted">{tr('waitingHost')}</p>}
            <button className="ghost" onClick={goHome}>{tr('home')}</button>
          </div>
        </section>
      )}
    </main>
  );

  return gameScreen;
}

function lanMessage(lang: Lang, message: string): string {
  if (message.includes('wrong-code') || message.includes('rejected')) return t(lang, 'wrongCode');
  if (message.includes('room-full')) return t(lang, 'roomFull');
  if (message.includes('room closed') || message.includes('host connection closed')) return t(lang, 'roomClosed');
  if (message.includes('timed out') || message.includes('connection failed') || message.includes('did not answer')) {
    return t(lang, 'relayMissing');
  }
  return t(lang, 'lanError');
}
