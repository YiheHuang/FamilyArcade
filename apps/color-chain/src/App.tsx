import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseAction, hintFor, type AiLevel, type Hint } from './ai/ai';
import { ColorPicker } from './components/ColorPicker';
import { Hand, sortHand } from './components/Hand';
import { OpponentSeat } from './components/OpponentSeat';
import { CardBack, PlayingCard } from './components/PlayingCard';
import { buildDemo, demoFromUrl, type DemoKind } from './demo';
import {
  act,
  isWild,
  nextRound,
  setup,
  view,
  type Card,
  type Color,
  type GameState,
  type Move,
  type PlayerSetup,
  type SeatView,
} from './game/color-chain';
import { mulberry32 } from './game/rng';
import { AI_NAMES, detectLang, localName, t, type Lang, type MessageKey } from './i18n';
import { cardsText, colorName, eventText, hintReasonText, levelName } from './labels';
import { guestWsUrl, hostWsUrl, inviteUrl, startLanServer } from './net';
import { chime } from './sound';
import {
  aiLevelOf,
  clearRecord,
  clearSave,
  loadRecord,
  loadSave,
  recordMatch,
  saveGame,
  type Record as FamilyRecord,
  type SavedGame,
} from './storage';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'stats' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';

type HintPayload = Hint & { nonce: number };
type GuestView = SeatView & { hint?: HintPayload };

const AI_LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const HERO_CARDS: Card[] = [
  { id: 'hero-y-skip', color: 'yellow', kind: 'skip', value: null },
  { id: 'hero-g-rev', color: 'green', kind: 'reverse', value: null },
  { id: 'hero-b-draw', color: 'blue', kind: 'draw2', value: null },
  { id: 'hero-wild', color: 'wild', kind: 'wild', value: null },
  { id: 'hero-r-7', color: 'red', kind: 'number', value: 7 },
];

const RULE_CARDS: { card: Card; text: MessageKey }[] = [
  { card: { id: 'rule-red-skip', color: 'red', kind: 'skip', value: null }, text: 'skip' },
  { card: { id: 'rule-green-rev', color: 'green', kind: 'reverse', value: null }, text: 'reverse' },
  { card: { id: 'rule-blue-draw', color: 'blue', kind: 'draw2', value: null }, text: 'draw2' },
];

const RULE_WILDS: Card[] = [
  { id: 'rule-wild', color: 'wild', kind: 'wild', value: null },
  { id: 'rule-wild4', color: 'wild', kind: 'wild4', value: null },
];

function makeAiPlayers(lang: Lang, count: number, level: AiLevel): PlayerSetup[] {
  return Array.from({ length: count }, (_, seat) => ({
    name: seat === 0 ? t(lang, 'you') : AI_NAMES[lang][(seat - 1) % AI_NAMES[lang].length],
    ai: seat === 0 ? null : level,
  }));
}

function makeLocalPlayers(lang: Lang, count: number): PlayerSetup[] {
  return Array.from({ length: count }, (_, seat) => ({
    name: localName(lang, seat),
    ai: null,
  }));
}

function buildLanPlayers(
  lang: Lang,
  size: number,
  peers: LanPublicPeer[],
): PlayerSetup[] {
  return Array.from({ length: size }, (_, seat) => {
    if (seat === 0) return { name: t(lang, 'hostName'), ai: null };
    const peer = peers.find((item) => item.seat === seat && item.connected);
    if (peer) return { name: peer.name, ai: null };
    return { name: AI_NAMES[lang][(seat - 1) % AI_NAMES[lang].length], ai: 'normal' };
  });
}

function errorMessage(lang: Lang, error: string): string {
  if (error === 'wrong-turn' || error === 'bad-seat') return t(lang, 'errorNotTurn');
  if (error === 'color-required') return t(lang, 'errorColor');
  if (error === 'draw-empty') return t(lang, 'errorNoCards');
  return t(lang, 'errorIllegal');
}

export default function App() {
  const bootRef = useRef<{
    demo: DemoKind | null;
    lang: Lang;
    guest: ReturnType<typeof guestParams>;
    demoState: GameState | null;
  } | null>(null);
  if (!bootRef.current) {
    const demo = demoFromUrl();
    const lang = detectLang();
    bootRef.current = {
      demo,
      lang,
      guest: guestParams(),
      demoState: demo ? buildDemo(demo, lang) : null,
    };
  }
  const boot = bootRef.current;
  const guestRoom = boot.guest?.room ?? '';

  const [lang, setLang] = useState<Lang>(boot.lang);
  const [screen, setScreen] = useState<Screen>(
    boot.demo ? 'game' : boot.guest ? 'lan' : 'home',
  );
  const [mode, setMode] = useState<Mode>(boot.demo ? 'ai' : boot.guest ? 'lan-guest' : 'ai');
  const [state, setState] = useState<GameState>(
    () =>
      boot.demoState ??
      setup({ players: makeLocalPlayers(boot.lang, 2), rng: mulberry32(4), targetScore: 200 }),
  );
  const [history, setHistory] = useState<GameState[]>([]);
  const [hintCardId, setHintCardId] = useState<string | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.color-chain.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [reduceMotion, setReduceMotion] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.color-chain.motion') === 'reduced';
    } catch {
      return false;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [pendingWild, setPendingWild] = useState<Card | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [setupMode, setSetupMode] = useState<'ai' | 'local'>('ai');
  const [setupCount, setSetupCount] = useState(() => boot.demoState?.players.length ?? 4);
  const [setupLevel, setSetupLevel] = useState<AiLevel>(() => aiLevelOf(state));
  const [setupTarget, setSetupTarget] = useState(() => state.targetScore);

  const [lanSize, setLanSize] = useState(2);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<GuestView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => boot.guest?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => boot.guest?.code ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);

  const demoRef = useRef(Boolean(boot.demo));
  const recordedRef = useRef(false);
  const rngRef = useRef<() => number>(mulberry32((Date.now() ^ 0x9e3779b9) >>> 0));
  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const lanPlayersRef = useRef<LanPublicPeer[]>([]);
  const lastGuestHint = useRef(0);

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = `${t(lang, 'title')} · Family Arcade`;
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.color-chain.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    document.documentElement.dataset.motion = reduceMotion ? 'reduced' : 'full';
    try {
      localStorage.setItem('familyarcade.color-chain.motion', reduceMotion ? 'reduced' : 'full');
    } catch {
      /* ignore */
    }
  }, [reduceMotion]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  useEffect(() => {
    if (!guestRoom) return;
    setScreen('lan');
    setMode('lan-guest');
  }, [guestRoom]);

  useEffect(() => {
    const hint = guestView?.hint;
    if (hint && hint.nonce !== lastGuestHint.current) {
      lastGuestHint.current = hint.nonce;
      setHintCardId(hint.cardId);
      setToast(hintReasonText(lang, hint.reason));
      if (soundOn) chime('turn');
    }
    if (guestView && !guestView.hint) setHintCardId(null);
  }, [guestView, lang, soundOn]);

  const isGuest = mode === 'lan-guest';
  const activeView: SeatView | null = isGuest
    ? guestView
    : view(state, mode === 'local' ? state.turn : 0);
  const canAct = Boolean(activeView?.canMove) && screen === 'game' && !aiThinking && (!isGuest || guestStarted);
  const hand = activeView ? sortHand(activeView.hand) : [];
  const playableIds = new Set(activeView?.legalIds ?? []);
  const opponents = activeView
    ? activeView.players
        .map((player, seat) => ({ player, seat }))
        .filter((item) => item.seat !== activeView.seat)
    : [];
  const currentName = activeView?.players[activeView.turn]?.name ?? '';
  const connectedGuests = lanPlayers.filter((player) => player.seat > 0 && player.connected).length;
  const handIdsRef = useRef<string[]>([]);
  handIdsRef.current = hand.map((card) => card.id);

  const statusText = (() => {
    if (!activeView) return tr('waitingTable');
    if (activeView.status === 'round-over') return tr('roundOver');
    if (activeView.status === 'match-over') return tr('matchOver');
    if (mode === 'local') return tr('turnOf', { name: currentName });
    if (mode === 'ai') {
      if (activeView.canMove) return tr('yourTurn');
      return tr('thinking', { name: currentName });
    }
    if (activeView.canMove) return tr('yourTurn');
    if (mode === 'lan-host' && aiThinking) return tr('thinking', { name: currentName });
    return tr('turnOf', { name: currentName });
  })();

  const handTitle =
    mode === 'local' ? tr('nameHand', { name: currentName }) : tr('yourHand');

  const finish = useCallback(
    (next: GameState) => {
      if (next.status === 'round-over') {
        if (soundOn) chime('round');
        return;
      }
      if (next.status !== 'match-over' || recordedRef.current) return;
      recordedRef.current = true;
      if (!demoRef.current && mode !== 'lan-host' && mode !== 'lan-guest') {
        setRecord(recordMatch(next));
      }
      if (soundOn) {
        const humanWon = next.matchWinners.some((seat) => next.players[seat]?.ai === null);
        chime(humanWon ? 'win' : 'lose');
      }
    },
    [mode, soundOn],
  );

  const broadcast = useCallback((next: GameState, hintSeat?: number, hint?: HintPayload) => {
    const host = hostRef.current;
    if (!host) return;
    for (const player of lanPlayersRef.current) {
      if (player.seat <= 0 || !player.connected || player.seat >= next.players.length) continue;
      const payload = { ...view(next, player.seat) } as GuestView;
      if (hint && hintSeat === player.seat) payload.hint = hint;
      host.sendView(player.seat, payload);
    }
  }, []);

  const commit = useCallback(
    (next: GameState, previous: GameState) => {
      if (mode === 'lan-guest') return;
      setHistory((items) => [...items.slice(-59), previous]);
      stateRef.current = next;
      setState(next);
      setHintCardId(null);
      setPendingWild(null);
      const last = next.events[next.events.length - 1]?.t;
      if (soundOn && next.status === 'playing') {
        chime(last === 'draw' ? 'draw' : 'play');
      }
      finish(next);
      if (!demoRef.current && (mode === 'ai' || mode === 'local')) {
        if (next.status === 'playing' || next.status === 'round-over') {
          saveGame(next, mode);
        } else {
          clearSave();
          setSaved(null);
        }
      }
      if (mode === 'lan-host') broadcast(next);
    },
    [broadcast, finish, mode, soundOn],
  );

  const applyMove = useCallback(
    (move: Move) => {
      if (isGuest) {
        if (!guestView?.canMove) return;
        if (move.type === 'play' && !guestView.legalIds.includes(move.cardId)) {
          setToast(tr('errorIllegal'));
          return;
        }
        guest?.sendIntent(move);
        return;
      }
      const seat = mode === 'local' ? state.turn : 0;
      const result = act(state, seat, move, rngRef.current);
      if (!result.ok) {
        setToast(errorMessage(lang, result.error ?? ''));
        return;
      }
      commit(result.state, state);
    },
    [commit, guest, guestView, isGuest, lang, mode, state, tr],
  );

  const playCard = useCallback(
    (card: Card, color?: Color) => {
      if (!canAct) return;
      if (isWild(card) && !color) {
        setPendingWild(card);
        return;
      }
      setPendingWild(null);
      applyMove({ type: 'play', cardId: card.id, ...(color ? { color } : {}) });
    },
    [applyMove, canAct],
  );

  const draw = useCallback(() => {
    if (!canAct || !activeView?.canDraw) return;
    applyMove({ type: 'draw' });
  }, [activeView, applyMove, canAct]);

  const pass = useCallback(() => {
    if (!canAct || !activeView?.canPass) return;
    applyMove({ type: 'pass' });
  }, [activeView, applyMove, canAct]);

  const requestHint = useCallback(() => {
    if (!canAct) return;
    if (isGuest) {
      guest?.sendIntent({ type: 'hint' });
      setToast(tr('guestHint'));
      return;
    }
    const seat = mode === 'local' ? state.turn : 0;
    const hint = hintFor(state, seat, rngRef.current);
    setHintCardId(hint.cardId);
    setToast(hintReasonText(lang, hint.reason));
    if (soundOn) chime('turn');
  }, [canAct, guest, isGuest, lang, mode, soundOn, state, tr]);

  const undo = useCallback(() => {
    if (isGuest) {
      setToast(tr('noUndo'));
      return;
    }
    if (state.status !== 'playing' || history.length === 0) return;
    let index = history.length - 1;
    if (mode === 'ai') {
      while (index >= 0 && history[index].turn !== 0) index -= 1;
    }
    if (index < 0) return;
    const target = history[index];
    setHistory(history.slice(0, index));
    stateRef.current = target;
    setState(target);
    setHintCardId(null);
    setPendingWild(null);
    recordedRef.current = false;
    if (!demoRef.current && (mode === 'ai' || mode === 'local')) saveGame(target, mode);
    if (mode === 'lan-host') broadcast(target);
    if (soundOn) chime('turn');
  }, [broadcast, history, isGuest, mode, soundOn, state.status, tr]);

  const dealNext = useCallback(() => {
    if (state.status !== 'round-over' || isGuest) return;
    window.scrollTo(0, 0);
    const next = nextRound(state, rngRef.current);
    if (next === state) return;
    setHistory([]);
    setHintCardId(null);
    stateRef.current = next;
    setState(next);
    recordedRef.current = false;
    if (!demoRef.current && (mode === 'ai' || mode === 'local')) saveGame(next, mode);
    if (mode === 'lan-host') broadcast(next);
    if (soundOn) chime('turn');
  }, [broadcast, isGuest, mode, soundOn, state]);

  const startNewMatch = useCallback(() => {
    if (isGuest) return;
    window.scrollTo(0, 0);
    if (mode === 'lan-host') {
      if (!lanHost) return;
      const seatPlayers = buildLanPlayers(lang, lanSize, lanPlayersRef.current);
      const next = setup({ players: seatPlayers, rng: rngRef.current, targetScore: 200 });
      demoRef.current = false;
      recordedRef.current = false;
      setHistory([]);
      setHintCardId(null);
      setPendingWild(null);
      stateRef.current = next;
      setState(next);
      setScreen('game');
      lanHost.start({ targetScore: next.targetScore });
      broadcast(next);
      if (soundOn) chime('turn');
      return;
    }
    const next = setup({
      players: state.players.map((player) => ({ name: player.name, ai: player.ai })),
      rng: rngRef.current,
      targetScore: state.targetScore,
    });
    demoRef.current = false;
    recordedRef.current = false;
    setHistory([]);
    setHintCardId(null);
    setPendingWild(null);
    stateRef.current = next;
    setState(next);
    setScreen('game');
    if (mode === 'ai' || mode === 'local') saveGame(next, mode);
    if (soundOn) chime('turn');
  }, [broadcast, isGuest, lanHost, lanSize, lang, mode, soundOn, state]);

  const beginGame = useCallback(() => {
    const players =
      setupMode === 'ai'
        ? makeAiPlayers(lang, setupCount, setupLevel)
        : makeLocalPlayers(lang, setupCount);
    const next = setup({
      players,
      rng: rngRef.current,
      targetScore: setupTarget,
    });
    demoRef.current = false;
    recordedRef.current = false;
    setMode(setupMode);
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setHintCardId(null);
    setPendingWild(null);
    setScreen('game');
    clearSave();
    setSaved(null);
    if (soundOn) chime('turn');
  }, [lang, setupCount, setupLevel, setupMode, setupTarget, soundOn]);

  const resume = useCallback(() => {
    if (!saved) return;
    const next = saved.state;
    demoRef.current = false;
    recordedRef.current = false;
    setMode(saved.mode);
    stateRef.current = next;
    setState(next);
    setSetupCount(next.players.length);
    setSetupTarget(next.targetScore);
    setSetupLevel(aiLevelOf(next));
    setHistory([]);
    setHintCardId(null);
    setPendingWild(null);
    setScreen('game');
    setSaved(null);
  }, [saved]);

  const closeLan = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
    lanPlayersRef.current = [];
    setLanInvite('');
    setLanQr('');
    setLanError('');
    guest?.close();
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
  }, [guest]);

  const goHome = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') closeLan();
    if (!demoRef.current && (mode === 'ai' || mode === 'local')) setSaved(loadSave());
    setScreen('home');
    setHintCardId(null);
    setPendingWild(null);
  }, [closeLan, mode]);

  const openLanHost = useCallback(async () => {
    setScreen('lan');
    setMode('lan-host');
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
        name: t(lang, 'hostName'),
        maxPlayers: lanSize,
      });
      hostRef.current = host;
      setLanHost(host);
      setLanCode(code);
      const publicPlayers = host.publicPlayers();
      lanPlayersRef.current = publicPlayers;
      setLanPlayers(publicPlayers);
      host.onChange((players) => {
        lanPlayersRef.current = players;
        setLanPlayers(players);
        if (!host.started) return;
        const current = stateRef.current;
        let changed = false;
        const nextPlayers = current.players.map((player, seat) => {
          if (seat === 0) return player;
          const peer = players.find((item) => item.seat === seat && item.connected);
          if (peer && player.ai !== null) {
            changed = true;
            return { ...player, name: peer.name, ai: null };
          }
          return player;
        });
        if (changed && current.status === 'playing') {
          const next = { ...current, players: nextPlayers };
          stateRef.current = next;
          setState(next);
          broadcast(next);
          return;
        }
        for (const player of players) {
          if (player.seat > 0 && player.connected && player.seat < current.players.length) {
            host.sendView(player.seat, view(current, player.seat));
          }
        }
      });
      host.onClose(() => setLanError(t(lang, 'lanClosed')));
      host.onIntent((seat, intent) => {
        const current = stateRef.current;
        const raw = intent as { type?: unknown; cardId?: unknown; color?: unknown } | null;
        if (!raw || typeof raw !== 'object') return;
        if (raw.type === 'hint') {
          if (current.status !== 'playing' || current.turn !== seat) return;
          const hint = hintFor(current, seat, rngRef.current);
          const payload: GuestView = {
            ...view(current, seat),
            hint: { ...hint, nonce: Date.now() },
          };
          host.sendView(seat, payload);
          return;
        }
        if (raw.type !== 'play' && raw.type !== 'draw' && raw.type !== 'pass') return;
        const move: Move =
          raw.type === 'play'
            ? {
                type: 'play',
                cardId: String(raw.cardId ?? ''),
                ...(typeof raw.color === 'string' ? { color: raw.color as Color } : {}),
              }
            : { type: raw.type };
        const result = act(current, seat, move, rngRef.current);
        if (result.ok) commit(result.state, current);
        else host.sendView(seat, view(current, seat));
      });
      const url = inviteUrl(info, room, code, t(lang, 'guestName'));
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#241f1a', light: '#fffaf0' },
        }),
      );
    } catch (error) {
      setLanError(error instanceof Error ? error.message : String(error));
      hostRef.current?.close();
      hostRef.current = null;
      setLanHost(null);
    } finally {
      setLanBusy(false);
    }
  }, [broadcast, commit, lang, lanSize]);

  const startLanMatch = useCallback(() => {
    if (!lanHost || connectedGuests === 0) return;
    const seatPlayers = buildLanPlayers(lang, lanSize, lanPlayersRef.current);
    const next = setup({ players: seatPlayers, rng: rngRef.current, targetScore: 200 });
    demoRef.current = false;
    recordedRef.current = false;
    setMode('lan-host');
    setHistory([]);
    setHintCardId(null);
    setPendingWild(null);
    stateRef.current = next;
    setState(next);
    setScreen('game');
    lanHost.start({ targetScore: next.targetScore });
    broadcast(next);
    if (soundOn) chime('turn');
  }, [broadcast, connectedGuests, lang, lanHost, lanSize, soundOn]);

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
      setGuest(joined);
      joined.onView((payload) => {
        setGuestView(payload as GuestView);
        setGuestStarted(true);
        setScreen((current) => (current === 'lan' ? 'game' : current));
      });
      joined.onStart(() => {
        setGuestStarted(true);
        setScreen('game');
        if (soundOn) chime('turn');
      });
      joined.onError((reason) =>
        setLanError(reason === 'room-full' ? tr('lanFull') : tr('lanWrong')),
      );
      setGuestStarted(false);
    } catch (error) {
      setLanError(
        error instanceof Error && error.message.includes('rejected')
          ? tr('lanWrong')
          : tr('lanDisconnected'),
      );
    } finally {
      setGuestConnecting(false);
    }
  }, [guestCode, guestName, guestRoom, soundOn, tr]);

  // AI replies: solo AIs, LAN AIs and disconnected guest seats.
  useEffect(() => {
    if (screen !== 'game' || state.status !== 'playing') return;
    const seat = state.turn;
    const player = state.players[seat];
    let auto = false;
    if (mode === 'ai') auto = player.ai !== null;
    else if (mode === 'lan-host') {
      const peer = lanPlayers.find((item) => item.seat === seat);
      auto = player.ai !== null || (seat > 0 && !peer?.connected);
    }
    if (!auto) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      setAiThinking(false);
      const level = player.ai ?? 'normal';
      const move = chooseAction(state, seat, level, rngRef.current);
      const result = act(state, seat, move, rngRef.current);
      if (result.ok) commit(result.state, state);
    }, 520);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, lanPlayers, mode, screen, state]);

  // Keyboard path.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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
        if (pendingWild) {
          setPendingWild(null);
          return;
        }
        if (screen !== 'home') goHome();
        return;
      }
      if (screen !== 'game') return;
      const key = event.key.toLowerCase();
      if (key === 'd') {
        if (activeView?.canDraw) {
          event.preventDefault();
          draw();
        }
        return;
      }
      if (key === 'p') {
        if (activeView?.canPass) {
          event.preventDefault();
          pass();
        }
        return;
      }
      if (key === 'h') {
        event.preventDefault();
        requestHint();
        return;
      }
      if (key === 'u') {
        event.preventDefault();
        undo();
        return;
      }
      const number = Number.parseInt(event.key, 10);
      if (Number.isInteger(number) && number >= 1 && number <= 9) {
        const card = hand[number - 1];
        if (card && canAct && playableIds.has(card.id)) {
          event.preventDefault();
          playCard(card);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    activeView,
    canAct,
    draw,
    goHome,
    hand,
    pass,
    pendingWild,
    playCard,
    playableIds,
    requestHint,
    screen,
    undo,
  ]);

  /* ------------------------------------------------------------- home */

  const homeScreen = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('tableNumber')}</p>
          <h1>{tr('title')}</h1>
          <p className="subtitle">{tr('subtitle')}</p>
        </div>
        <div className="mast-actions">
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
          <button className="ghost" onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
          <button className="ghost" onClick={() => setReduceMotion((value) => !value)}>
            {reduceMotion ? tr('motionReduced') : tr('motionFull')}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-table" aria-hidden="true">
          <div className="hero-ring" />
          <div className="hero-fan">
            {HERO_CARDS.map((card, index) => (
              <div
                key={card.id}
                className="hero-card"
                style={
                  {
                    '--i': index,
                    '--angle': `${(index - 2) * 8}deg`,
                    '--drop': `${Math.abs(index - 2) * 10}px`,
                  } as CSSProperties
                }
              >
                <PlayingCard card={card} lang={lang} size={index === 4 ? 'lg' : 'md'} decorative />
              </div>
            ))}
          </div>
          <span className="hero-chip hero-chip-a">{tr('deckFact')}</span>
          <span className="hero-chip hero-chip-b">{tr('playersFact')}</span>
          <span className="hero-chip hero-chip-c">{tr('targetFact')}</span>
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('heroKicker')}</p>
          <p className="hero-note">{tr('heroNote')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>{tr('saved')}</small>
              </button>
            )}
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={() => {
              setSetupMode('ai');
              setScreen('setup');
            }}>
              {tr('playAi')}
            </button>
            <button className="secondary wide" onClick={() => {
              setSetupMode('local');
              setScreen('setup');
            }}>
              {tr('playLocal')}
            </button>
            <button className="secondary wide" onClick={() => {
              setMode('lan-host');
              setScreen('lan');
              setLanError('');
            }}>
              {tr('playLan')}
            </button>
            <div className="text-row">
              <button className="text-button" onClick={() => setScreen('rules')}>{tr('rules')} →</button>
              <button className="text-button" onClick={() => { setRecord(loadRecord()); setScreen('stats'); }}>
                {tr('stats')} →
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('recordMatches')}</span>
            <strong>{record.matches}</strong>
            <span className="dot">·</span>
            <span>{tr('recordHuman')} {record.humanWins}</span>
            <span className="dot">·</span>
            <span>{tr('recordBest')} {record.bestScore ?? '—'}</span>
            <span className="dot">·</span>
            <span>{tr('recordStreak')} {record.streak}</span>
          </div>
        </div>
      </section>

      <footer className="foot">{tr('footer')}</footer>
    </main>
  );

  /* ------------------------------------------------------------ setup */

  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <p className="eyebrow">{setupMode === 'ai' ? tr('modeAi') : tr('modeLocal')}</p>
      <h2 className="screen-title">
        {setupMode === 'ai' ? tr('setupAiTitle') : tr('setupLocalTitle')}
      </h2>
      <p className="lede">{setupMode === 'ai' ? tr('setupAiLede') : tr('setupLocalLede')}</p>

      <section className="setup-stack">
        <div className="setup-block">
          <div className="setup-label-row">
            <label>{tr('playersLabel')}</label>
            <span>{tr('playerCount', { n: setupCount })}</span>
          </div>
          <div className="segmented" role="group" aria-label={tr('playersLabel')}>
            {[2, 3, 4, 5, 6].map((count) => (
              <button
                key={count}
                type="button"
                className={setupCount === count ? 'selected' : ''}
                onClick={() => setSetupCount(count)}
                aria-pressed={setupCount === count}
              >
                {count}
              </button>
            ))}
          </div>
          {setupMode === 'local' && <p className="field-note">{tr('hotseatNote')}</p>}
        </div>

        {setupMode === 'ai' && (
          <div className="setup-block">
            <div className="setup-label-row">
              <label>{tr('aiLevel')}</label>
              <span>{levelName(lang, setupLevel)}</span>
            </div>
            <div className="level-grid">
              {AI_LEVELS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`level-card ${setupLevel === item.id ? 'selected' : ''}`}
                  onClick={() => setSetupLevel(item.id)}
                  aria-pressed={setupLevel === item.id}
                >
                  <span className={`level-dot ${item.id}`} />
                  <strong>{tr(item.label)}</strong>
                  <small>{tr(item.note)}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="setup-block">
          <div className="setup-label-row">
            <label>{tr('targetLabel')}</label>
            <span>{tr('targetValue', { n: setupTarget })}</span>
          </div>
          <div className="segmented" role="group" aria-label={tr('targetLabel')}>
            {[100, 200, 300].map((target) => (
              <button
                key={target}
                type="button"
                className={setupTarget === target ? 'selected' : ''}
                onClick={() => setSetupTarget(target)}
                aria-pressed={setupTarget === target}
              >
                {target}
              </button>
            ))}
          </div>
          <p className="field-note">{tr('targetHint')}</p>
        </div>
      </section>

      <div className="setup-summary">
        <div className="avatar-row">
          {Array.from({ length: setupCount }, (_, seat) => (
            <span
              key={seat}
              className={`avatar ${setupMode === 'ai' && seat > 0 ? 'avatar-ai' : 'avatar-human'}`}
            >
              {setupMode === 'ai' && seat > 0
                ? AI_NAMES[lang][(seat - 1) % AI_NAMES[lang].length].slice(0, 1)
                : seat === 0
                  ? t(lang, 'you').slice(0, 1)
                  : String(seat + 1)}
            </span>
          ))}
        </div>
        <strong>
          {setupMode === 'ai'
            ? tr('soloSummary', { n: setupCount - 1 })
            : tr('localSummary', { n: setupCount })}
        </strong>
      </div>

      <button className="primary wide big-button" onClick={beginGame}>
        {tr('beginMatch')}
      </button>
    </main>
  );

  /* ------------------------------------------------------------- game */

  const ranked = activeView
    ? activeView.players
        .map((player, seat) => ({ ...player, seat }))
        .sort((a, b) => a.score - b.score || a.handCount - b.handCount || a.seat - b.seat)
    : [];
  const winnerNames = activeView
    ? activeView.matchWinners.map((seat) => activeView.players[seat]?.name).filter(Boolean)
    : [];
  const roundWinnerName =
    activeView && activeView.roundWinner !== null
      ? activeView.players[activeView.roundWinner]?.name ?? ''
      : '';
  const recentEvents = activeView ? activeView.events.slice(-5).reverse() : [];
  const endTitle =
    activeView?.status === 'match-over'
      ? winnerNames.length > 1
        ? tr('sharedWin', { names: winnerNames.join(' & ') })
        : winnerNames[0] === tr('you')
          ? tr('youWinMatch')
          : tr('winsMatch', { name: winnerNames[0] ?? '' })
      : roundWinnerName === tr('you')
        ? tr('youWinRound')
        : tr('winsRound', { name: roundWinnerName });

  const gameScreen = (
    <main className="shell game-shell">
      <header className="game-top">
        <button className="back" onClick={goHome}>← {tr('home')}</button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>
            {mode === 'ai'
              ? `${tr('modeAi')} · ${levelName(lang, aiLevelOf(state))}`
              : mode === 'local'
                ? tr('modeLocal')
                : mode === 'lan-host'
                  ? tr('modeLanHost')
                  : tr('modeLanGuest')}
            {' · '}
            {tr('roundLabel', { n: state.round })}
          </span>
        </div>
        <div className="game-top-actions">
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
          <button className="ghost" onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
        </div>
      </header>

      {isGuest && !guestStarted && (
        <section className="waiting-card">
          <p className="kicker">{tr('modeLanGuest')}</p>
          <h2>{tr('lanWaitingHost')}</h2>
          <p>{tr('lanGuestNote')}</p>
        </section>
      )}

      {(!isGuest || guestStarted) && !activeView && (
        <section className="waiting-card">
          <p className="kicker">{tr('modeLanGuest')}</p>
          <h2>{tr('waitingTable')}</h2>
          <p>{tr('lanWaitingHost')}</p>
        </section>
      )}

      {(!isGuest || guestStarted) && activeView && (
        <div className="game-layout">
          <section className="table-wrap">
            <div className="turn-bar">
              <span className={`turn-chip color-${activeView.current}`} aria-hidden="true">
                <span className="turn-dot" />
              </span>
              <div>
                <strong aria-live="polite">{statusText}</strong>
                <p>
                  {tr('roundLabel', { n: activeView.round })} ·{' '}
                  {tr('targetLine', { n: activeView.targetScore })}
                </p>
              </div>
              {aiThinking && <span className="thinking">…</span>}
            </div>

            <div className="table-stage">
              <div className={`opponents opponents-${opponents.length}`}>
                {opponents.map(({ player, seat }) => (
                  <OpponentSeat
                    key={seat}
                    player={player}
                    seat={seat}
                    active={activeView.turn === seat && activeView.status === 'playing'}
                    lang={lang}
                    target={activeView.targetScore}
                    compact={opponents.length > 3}
                  />
                ))}
              </div>

              <div className={`table-centre color-${activeView.current}`}>
                <div className="table-felt">
                  <div className="pile draw-pile">
                    <button
                      type="button"
                      className="draw-stack"
                      onClick={draw}
                      disabled={!canAct || !activeView.canDraw}
                      aria-label={tr('draw')}
                    >
                      <CardBack size="lg" count={activeView.drawCount} />
                    </button>
                    <span>{tr('drawPile')}</span>
                  </div>
                  <div className="chain-mark" aria-hidden="true">
                    <span className="chain-line" />
                    <span className="chain-arrow">
                      {activeView.direction === 1 ? '↻' : '↺'}
                    </span>
                    <span className="chain-line" />
                  </div>
                  <div className="pile discard-pile">
                    <PlayingCard card={activeView.top} lang={lang} size="lg" />
                    <span>{tr('discard')}</span>
                  </div>
                  <div className={`color-badge color-${activeView.current}`}>
                    <span className="color-dot" />
                    {colorName(lang, activeView.current)}
                  </div>
                </div>
                <div className="table-meta">
                  <span>
                    {tr('colour')}: <strong>{colorName(lang, activeView.current)}</strong>
                  </span>
                  <span>
                    {tr('direction')}:{' '}
                    <strong>
                      {activeView.direction === 1 ? tr('clockwise') : tr('counterClockwise')}
                    </strong>
                  </span>
                  {activeView.drawnCardId && <span className="drawn-met">{tr('drawnNote')}</span>}
                </div>
              </div>

              {activeView.status !== 'playing' && (
                <div className="end-overlay">
                  <div className="end-card">
                    <p className="kicker">
                      {activeView.status === 'match-over' ? tr('matchOver') : tr('roundOver')}
                    </p>
                    <h2>{endTitle}</h2>
                    <p className="end-sub">
                      {activeView.status === 'match-over'
                        ? tr('lowestWins')
                        : tr('roundScoreNote')}
                    </p>
                    <ol className="score-table">
                      {ranked.map((player, index) => {
                        const added = activeView.roundPoints?.[player.seat];
                        return (
                          <li key={player.seat} className={index === 0 ? 'leader' : ''}>
                            <span className="place">{index + 1}</span>
                            <span className="score-name">
                              {player.name}
                              {player.ai && <small>{levelName(lang, player.ai)}</small>}
                            </span>
                            <span className="score-cards">{cardsText(lang, player.handCount)}</span>
                            {typeof added === 'number' && added > 0 && (
                              <span className="score-added">{tr('roundPoints', { n: added })}</span>
                            )}
                            <strong className="score-total">{player.score}</strong>
                          </li>
                        );
                      })}
                    </ol>
                    <div className="end-actions">
                      {isGuest ? (
                        <span className="muted">{tr('waitingGuestStart')}</span>
                      ) : activeView.status === 'round-over' ? (
                        <button className="primary" onClick={dealNext}>
                          {mode === 'lan-host' ? tr('nextRoundHost') : tr('nextRound')}
                        </button>
                      ) : (
                        <button className="primary" onClick={startNewMatch}>{tr('newMatch')}</button>
                      )}
                      <button className="secondary" onClick={goHome}>{tr('backHome')}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {activeView.status === 'playing' && (
            <div className="hand-bar">
              <div className="hand-head">
                <div>
                  <strong>{handTitle}</strong>
                  <p aria-live="polite">{statusText}</p>
                </div>
                <div className="hand-actions">
                  <button
                    className={`primary small ${activeView.canDraw ? 'attention' : ''}`}
                    onClick={draw}
                    disabled={!canAct || !activeView.canDraw}
                  >
                    {tr('drawShort')}
                  </button>
                  <button
                    className="secondary small"
                    onClick={pass}
                    disabled={!canAct || !activeView.canPass}
                  >
                    {tr('passShort')}
                  </button>
                  <button
                    className="ghost small"
                    onClick={requestHint}
                    disabled={!canAct}
                  >
                    {tr('hint')}
                  </button>
                  <button
                    className="ghost small"
                    onClick={undo}
                    disabled={isGuest || history.length === 0 || state.status !== 'playing'}
                  >
                    {tr('undo')}
                  </button>
                </div>
              </div>
              <Hand
                hand={activeView.hand}
                playableIds={playableIds}
                hintCardId={hintCardId}
                lang={lang}
                canAct={canAct}
                onPlay={(card) => playCard(card)}
              />
            </div>
            )}
          </section>

          <aside className="side">
            <div className="side-card scoreboard">
              <h3>{tr('score')}</h3>
              <ul className="score-list">
                {activeView.players.map((player, seat) => (
                  <li
                    key={seat}
                    className={seat === activeView.turn && activeView.status === 'playing' ? 'active' : ''}
                  >
                    <span className={`seat-dot ${player.ai ? 'ai' : 'human'}`} />
                    <span className="score-list-name">
                      {player.name}
                      {player.ai && <small>{levelName(lang, player.ai)}</small>}
                    </span>
                    <span className="score-list-cards">{player.handCount}</span>
                    <strong>{player.score}</strong>
                  </li>
                ))}
              </ul>
            </div>

            <div className="side-card table-talk">
              <h3>{tr('tableTalk')}</h3>
              {recentEvents.length === 0 ? (
                <p>{tr('tableTalkEmpty')}</p>
              ) : (
                <ol>
                  {recentEvents.map((event, index) => (
                    <li key={`${event.t}-${index}`}>
                      <span className="event-dot" />
                      {eventText(lang, activeView.players, event)}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {mode === 'lan-host' && (
              <div className="side-card lan-mini">
                <h3>{tr('lanTitle')}</h3>
                <div className="mini-code">{lanCode}</div>
                <p>
                  {connectedGuests > 0
                    ? tr('seatsReady', { n: connectedGuests + 1, max: lanSize })
                    : tr('waitingGuests')}
                </p>
                <p className="fine">{tr('lanHostNote')}</p>
              </div>
            )}

            <div className="side-card keys-card">
              <h3>{tr('rules')}</h3>
              <p>{tr('keysHint')}</p>
              <p className="fine">{tr('rulesFooter')}</p>
            </div>
          </aside>
        </div>
      )}

      {pendingWild && (
        <ColorPicker
          card={pendingWild}
          lang={lang}
          onPick={(color) => playCard(pendingWild, color)}
          onCancel={() => setPendingWild(null)}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  /* ------------------------------------------------------------- lan */

  const lanScreen = (
    <main className="shell narrow-shell lan-shell">
      <button className="back" onClick={() => { closeLan(); setScreen('home'); }}>
        ← {tr('back')}
      </button>
      <p className="eyebrow">{isGuest || guestRoom ? tr('modeLanGuest') : tr('modeLanHost')}</p>
      <h2 className="screen-title">{isGuest || guestRoom ? tr('lanGuestTitle') : tr('lanTitle')}</h2>
      <p className="lede">{tr('lanLede')}</p>
      {lanError && <p className="error">{lanError}</p>}

      {isGuest || guestRoom ? (
        <section className="lan-guest-panel">
          <p className="field-note">{tr('lanGuestNote')}</p>
          {!guest ? (
            <div className="lan-form">
              <label>
                <span>{tr('yourName')}</span>
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  maxLength={18}
                  autoFocus
                />
              </label>
              <label>
                <span>{tr('roomCode')}</span>
                <input
                  value={guestCode}
                  onChange={(event) => setGuestCode(event.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                />
              </label>
              <button
                className="primary wide"
                onClick={joinGuest}
                disabled={guestConnecting || !guestName.trim() || !guestRoom}
              >
                {guestConnecting ? tr('joining') : tr('join')}
              </button>
              {!guestRoom && <p className="field-note">{tr('lanInviteOpened')}</p>}
            </div>
          ) : (
            <div className="waiting-card inline">
              <h3>{tr('lanWaitingHost')}</h3>
              <p>{tr('lanHintNote')}</p>
            </div>
          )}
        </section>
      ) : (
        <section className="lan-host-panel">
          {!lanHost ? (
            <div className="lan-open">
              <div className="setup-label-row">
                <label>{tr('tableSize')}</label>
                <span>{tr('playerCount', { n: lanSize })}</span>
              </div>
              <div className="segmented" role="group" aria-label={tr('tableSize')}>
                {[2, 3, 4, 5, 6].map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={lanSize === size ? 'selected' : ''}
                    onClick={() => setLanSize(size)}
                    aria-pressed={lanSize === size}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <p className="field-note">{tr('lanTableSizeNote')}</p>
              <button className="primary wide big-button" onClick={openLanHost} disabled={lanBusy}>
                {lanBusy ? tr('openingRoom') : tr('openRoom')}
              </button>
            </div>
          ) : (
            <>
              <div className="lan-layout">
                <div className="lan-card">
                  <span className="label">{tr('roomCode')}</span>
                  <div className="room-code big">{lanCode}</div>
                  <p>
                    {connectedGuests > 0
                      ? tr('seatsReady', { n: connectedGuests + 1, max: lanSize })
                      : tr('waitingGuests')}
                  </p>
                  <div className="peer-list">
                    {lanPlayers.map((player) => (
                      <span key={player.seat} className={player.connected ? 'online' : ''}>
                        {player.seat === 0 ? tr('hostName') : player.name}
                        {' '}
                        {player.connected ? '●' : '○'}
                      </span>
                    ))}
                  </div>
                  <button
                    className="primary wide"
                    onClick={startLanMatch}
                    disabled={connectedGuests === 0 || lanBusy}
                  >
                    {tr('startMatch')}
                  </button>
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
                  <p className="fine">{tr('startHint')}</p>
                  <button
                    className="text-button"
                    onClick={() => { closeLan(); setScreen('home'); }}
                  >
                    {tr('lanLeave')}
                  </button>
                </div>
                <div className="qr-card">
                  {lanQr ? <img src={lanQr} alt={tr('scanToJoin')} /> : null}
                  <p>{tr('scanToJoin')}</p>
                  <code>{lanInvite.replace(/^https?:\/\//, '')}</code>
                  <small>{tr('lanSameWifi')}</small>
                  <small>{tr('lanQrNote')}</small>
                </div>
              </div>
              <p className="fine lan-foot">{tr('lanHostNote')}</p>
            </>
          )}
        </section>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  /* ----------------------------------------------------------- rules */

  const rulesScreen = (
    <main className="shell narrow-shell rules-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <p className="eyebrow">{tr('tableNumber')}</p>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <ol className="rule-list">
        <li>{tr('rule1')}</li>
        <li>{tr('rule2')}</li>
        <li>{tr('rule3')}</li>
        <li>{tr('rule4')}</li>
        <li>{tr('rule5')}</li>
        <li>{tr('rule6')}</li>
        <li>{tr('rule7')}</li>
      </ol>

      <div className="rules-columns">
        <div>
          <h3 className="section-heading">{tr('actionLegend')}</h3>
          <div className="card-legend">
            {RULE_CARDS.map(({ card, text }) => (
              <div key={card.id} className="legend-item">
                <PlayingCard card={card} lang={lang} size="sm" decorative />
                <strong>{tr(text)}</strong>
              </div>
            ))}
          </div>

          <h3 className="section-heading">{tr('wildLegend')}</h3>
          <div className="wild-legend">
            <div className="legend-item wide-item">
              <PlayingCard card={RULE_WILDS[0]} lang={lang} size="sm" decorative />
              <p>{tr('rule2')}</p>
            </div>
            <div className="legend-item wide-item">
              <PlayingCard card={RULE_WILDS[1]} lang={lang} size="sm" decorative />
              <p>{tr('rule4')}</p>
            </div>
          </div>

          <section className="rules-panel">
            <h3>{tr('deckTitle')}</h3>
            <p>{tr('deckNote')}</p>
          </section>
        </div>
        <div>
          <section className="rules-panel first">
            <h3>{tr('scoringTitle')}</h3>
            <ul>
              <li>{tr('scoreNumber')}</li>
              <li>{tr('scoreAction')}</li>
              <li>{tr('scoreWild')}</li>
            </ul>
            <p>{tr('scoringNote')}</p>
          </section>
          <section className="rules-panel variant">
            <h3>{tr('variantTitle')}</h3>
            <p>{tr('variantText')}</p>
          </section>
          <p className="fine">{tr('rulesFooter')}</p>
          <button className="primary" onClick={() => setScreen('home')}>{tr('close')}</button>
        </div>
      </div>
    </main>
  );

  /* ----------------------------------------------------------- stats */

  const rate = record.matches > 0 ? Math.round((record.humanWins / record.matches) * 100) : 0;
  const statsScreen = (
    <main className="shell narrow-shell stats-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <p className="eyebrow">{tr('tableNumber')}</p>
      <h2 className="screen-title">{tr('statsTitle')}</h2>
      <p className="lede">{tr('statsLede')}</p>

      <div className="stat-grid">
        <div className="stat-card">
          <span>{tr('matches')}</span>
          <strong>{record.matches}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('humanWins')}</span>
          <strong>{record.humanWins}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('aiWins')}</span>
          <strong>{record.aiWins}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('bestScore')}</span>
          <strong>{record.bestScore ?? '—'}</strong>
        </div>
      </div>

      <div className="stat-bar-card">
        <div className="stat-bar-head">
          <span>{tr('winRate')}</span>
          <strong>{rate}%</strong>
        </div>
        <div className="stat-bar">
          <span style={{ width: `${rate}%` }} />
        </div>
        <div className="stat-bar-legend">
          <span>{tr('humanWins')} {record.humanWins}</span>
          <span>{tr('aiWins')} {record.aiWins}</span>
        </div>
      </div>

      <div className="stat-detail">
        <div>
          <span>{tr('currentStreak')}</span>
          <strong>{record.streak}</strong>
        </div>
        <div>
          <span>{tr('lastWinner')}</span>
          <strong>{record.lastWinner ?? '—'}</strong>
        </div>
      </div>

      {record.matches === 0 && <p className="stats-empty">{tr('statsEmpty')}</p>}
      <p className="fine">{tr('statsNote')}</p>
      <button
        className={`secondary ${confirmClear ? 'danger' : ''}`}
        onClick={() => {
          if (!confirmClear) {
            setConfirmClear(true);
            return;
          }
          setRecord(clearRecord());
          setConfirmClear(false);
          setToast(tr('cleared'));
        }}
      >
        {confirmClear ? tr('clearConfirm') : tr('clearRecord')}
      </button>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'lan') return lanScreen;
  return homeScreen;
}
