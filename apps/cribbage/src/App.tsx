import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { AI_LEVELS, aiRng, chooseDiscard, choosePlay, type AiLevel } from './ai/ai';
import { hintFor, type Hint, type HintKind } from './ai/hint';
import { CardBack, Hand, PlayingCard, sortHand } from './components/Cards';
import { Scoreboard, ShowBoard, TableCenter, SEAT_CLASS } from './components/Table';
import {
  cut,
  discard,
  nextHand,
  play,
  setup,
  view,
  type Card,
  type GameState,
  type SeatView,
} from './game/cribbage';
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
import { chime, type ChimeKind } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'stats' | 'rules' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type LanRole = 'hub' | 'host' | 'guest';

const DESKTOP_HERO_CARDS: Card[] = [4, 17, 30, 49];
const DESKTOP_HERO_STARTER: Card = 43;

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

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) >>> 0;
}

function nextSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function querySeed(): number | null {
  if (typeof location === 'undefined') return null;
  const raw = new URLSearchParams(location.search).get('deal');
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.abs(Math.floor(value)) : null;
}

function skunkFromScores(scores: number[], winner: number | null): 'none' | 'skunk' | 'double' {
  if (winner === null) return 'none';
  const losers = scores.filter((_, index) => index !== winner);
  if (losers.length === 0) return 'none';
  const best = Math.max(...losers);
  if (best < 61) return 'double';
  if (best < 91) return 'skunk';
  return 'none';
}

function sendViewsToGuests(state: GameState, host: LanHost): void {
  for (let seat = 1; seat < state.players; seat += 1) {
    host.sendView(seat, view(state, seat));
  }
}

function hintMessage(lang: Lang, hint: Hint): string {
  const keys: Record<HintKind, MessageKey> = {
    keepRun: 'hintKeepRun',
    keepPair: 'hintKeepPair',
    keepFifteen: 'hintKeepFifteen',
    cribSafe: 'hintCribSafe',
    pegThirtyOne: 'hintPegThirtyOne',
    pegFifteen: 'hintPegFifteen',
    pegPair: 'hintPegPair',
    pegRun: 'hintPegRun',
    pegLow: 'hintPegLow',
    pegSafe: 'hintPegSafe',
    cut: 'hintCut',
  };
  return t(lang, keys[hint.reason], { value: hint.value ?? 0 });
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (invite ? 'lan-guest' : 'ai'));
  const [level, setLevel] = useState<AiLevel>('normal');
  const [players, setPlayers] = useState(2);
  const [state, setState] = useState<GameState>(() => setup(2, 1, 43));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<Card[]>([]);
  const [hint, setHint] = useState<Hint | null>(null);
  const [handoff, setHandoff] = useState<number | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.cribbage.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const seedRef = useRef<number | null>(querySeed());

  const [lanRole, setLanRole] = useState<LanRole>(() => (invite ? 'guest' : 'hub'));
  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [lanSeats, setLanSeats] = useState(2);
  const [hostName, setHostName] = useState(() => {
    try {
      return localStorage.getItem('familyarcade.cribbage.hostName') ?? '';
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

  const stateRef = useRef(state);
  const modeRef = useRef<Mode>(mode);
  const levelRef = useRef<AiLevel>(level);
  const soundRef = useRef(soundOn);
  const recordedRef = useRef(false);
  const hostRef = useRef<LanHost | null>(null);
  const hostStartedRef = useRef(false);
  const autoJoinRef = useRef(false);
  const lanActiveRef = useRef(false);
  const guestJoinSeqRef = useRef(0);
  const hostCreateSeqRef = useRef(0);

  const tr = useCallback((key: MessageKey) => t(lang, key), [lang]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? '克里比奇' : 'Cribbage';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.cribbage.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.cribbage.hostName', hostName);
    } catch {
      /* ignore */
    }
  }, [hostName]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setToast('');
  }, [screen]);

  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }, [screen, handoff]);

  useEffect(() => {
    if (
      screen === 'game' &&
      (state.phase === 'count' || state.phase === 'game-over')
    ) {
      if (typeof window !== 'undefined') window.scrollTo(0, 0);
    }
  }, [screen, state.phase]);

  useEffect(() => {
    if (screen !== 'stats') setClearArmed(false);
  }, [screen]);

  const finish = useCallback((next: GameState) => {
    if (next.phase !== 'game-over' || recordedRef.current) return;
    recordedRef.current = true;
    const currentMode = modeRef.current;
    if (currentMode !== 'lan-guest' && next.winner !== null) {
      setRecord(
        recordResult(next, {
          mode: recordModeFor(currentMode),
          ...(currentMode === 'ai' ? { level: levelRef.current } : {}),
        }),
      );
    }
    clearSave();
    setSaved(null);
    if (soundRef.current) chime('win');
  }, []);

  const commit = useCallback(
    (next: GameState, previous: GameState, sound: ChimeKind = 'card') => {
      stateRef.current = next;
      setHistory((items) => [...items, previous]);
      setState(next);
      setSelected([]);
      setHint(null);
      if (soundRef.current) chime(sound);
      const currentMode = modeRef.current;
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.phase !== 'game-over') {
          setSaved(saveGame({ state: next, mode: currentMode, level: levelRef.current }));
        } else {
          clearSave();
          setSaved(null);
        }
      }
      if (currentMode === 'lan-host' && hostRef.current) {
        sendViewsToGuests(next, hostRef.current);
        if (next.phase === 'game-over') hostRef.current.sendResult({ kind: 'game' });
      }
      if (currentMode === 'local') {
        if (next.phase === 'discard' || next.phase === 'pegging') setHandoff(next.turn);
        else setHandoff(null);
      }
      if (next.phase === 'game-over') finish(next);
    },
    [finish],
  );

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
    setHandoff(null);
    setSelected([]);
    setHint(null);
    setAiThinking(false);
    setMode('ai');
    modeRef.current = 'ai';
    setSaved(loadSave());
    setScreen('home');
  }, [closeLan]);

  const startGame = useCallback(
    (nextMode: 'ai' | 'local', seatCount: number) => {
      closeLan();
      const seed = seedRef.current ?? randomSeed();
      seedRef.current = null;
      const next = setup(seatCount, seatCount - 1, seed);
      stateRef.current = next;
      modeRef.current = nextMode;
      setMode(nextMode);
      setPlayers(seatCount);
      setState(next);
      setHistory([]);
      setSelected([]);
      setHint(null);
      setHandoff(nextMode === 'local' ? next.turn : null);
      setAiThinking(false);
      recordedRef.current = false;
      clearSave();
      setSaved(null);
      setScreen('game');
    },
    [closeLan, seedRef],
  );

  const resume = useCallback(() => {
    if (!saved) return;
    stateRef.current = saved.state;
    modeRef.current = saved.mode;
    levelRef.current = saved.level;
    setMode(saved.mode);
    setLevel(saved.level);
    setPlayers(saved.state.players);
    setState(saved.state);
    setHistory([]);
    setSelected([]);
    setHint(null);
    setAiThinking(false);
    recordedRef.current = false;
    setHandoff(
      saved.mode === 'local' &&
        (saved.state.phase === 'discard' || saved.state.phase === 'pegging')
        ? saved.state.turn
        : null,
    );
    setSaved(null);
    setScreen('game');
  }, [saved]);

  const handleCard = useCallback(
    (card: Card) => {
      if (screen !== 'game') return;
      if (mode === 'lan-guest') {
        if (!guest || !guestView || !guestStarted) return;
        if (guestView.phase === 'discard' && guestView.canDiscard) {
          setSelected((current) => {
            if (current.includes(card)) return current.filter((item) => item !== card);
            if (current.length >= guestView.discardCount) return current;
            return [...current, card];
          });
          setHint(null);
          return;
        }
        if (guestView.phase === 'pegging' && guestView.canPlay && guestView.legal.includes(card)) {
          guest.sendIntent({ type: 'play', card, handNo: guestView.handNo });
        }
        return;
      }

      if (mode === 'ai' && state.turn !== 0) return;
      if (mode === 'lan-host' && (!lanHost || lanHost.status !== 'open')) return;

      if (mode === 'local') {
        if (state.phase !== 'discard' && state.phase !== 'pegging') return;
        if (state.phase === 'discard') {
          setSelected((current) => {
            if (current.includes(card)) return current.filter((item) => item !== card);
            if (current.length >= state.discardCount) return current;
            return [...current, card];
          });
          setHint(null);
          return;
        }
        const result = play(state, state.turn, card);
        if (result.ok) commit(result.state, state, 'peg');
        return;
      }

      const seat = 0;
      if (state.turn !== seat) return;
      if (state.phase === 'discard') {
        setSelected((current) => {
          if (current.includes(card)) return current.filter((item) => item !== card);
          if (current.length >= state.discardCount) return current;
          return [...current, card];
        });
        setHint(null);
        return;
      }
      if (state.phase === 'pegging') {
        const result = play(state, seat, card);
        if (result.ok) commit(result.state, state, 'peg');
      }
    },
    [commit, guest, guestStarted, guestView, lanHost, mode, screen, state],
  );

  const confirmDiscard = useCallback(() => {
    if (screen !== 'game') return;
    if (mode === 'lan-guest') {
      if (!guest || !guestView || !guestView.canDiscard) return;
      if (selected.length !== guestView.discardCount) return;
      guest.sendIntent({ type: 'discard', cards: selected, handNo: guestView.handNo });
      setSelected([]);
      return;
    }
    const seat = mode === 'local' ? state.turn : 0;
    if (state.phase !== 'discard' || state.turn !== seat) return;
    const result = discard(state, seat, selected);
    if (result.ok) commit(result.state, state, 'card');
  }, [commit, guest, guestView, mode, screen, selected, state]);

  const doCut = useCallback(() => {
    if (screen !== 'game') return;
    if (mode === 'lan-guest') {
      if (!guest || !guestView || !guestView.canCut) return;
      guest.sendIntent({ type: 'cut', handNo: guestView.handNo });
      return;
    }
    const seat = state.turn;
    if (state.phase !== 'cut') return;
    if (mode === 'ai' && seat !== 0) return;
    if (mode === 'lan-host' && seat !== 0) return;
    const result = cut(state, seat);
    if (result.ok) commit(result.state, state, 'cut');
  }, [commit, guest, guestView, mode, screen, state]);

  const advanceHand = useCallback(() => {
    if (screen !== 'game' || state.phase !== 'count') return;
    if (mode === 'lan-guest') return;
    if (mode === 'lan-host' && !hostStartedRef.current) return;
    const next = nextHand(state, nextSeed(state.seed));
    if (next === state) return;
    commit(next, state, 'deal');
  }, [commit, mode, screen, state]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    if (mode !== 'ai' && mode !== 'local') return;
    if (state.phase === 'game-over') return;
    if (mode === 'ai' && (state.turn !== 0 || aiThinking)) return;

    let index = history.length - 1;
    if (mode === 'ai') {
      while (
        index >= 0 &&
        history[index].phase !== 'count' &&
        !(
          (history[index].phase === 'discard' ||
            history[index].phase === 'cut' ||
            history[index].phase === 'pegging') &&
          history[index].turn === 0
        )
      ) {
        index -= 1;
      }
      if (index < 0) return;
    }
    const previous = history[index];
    stateRef.current = previous;
    setHistory(history.slice(0, index));
    setState(previous);
    setSelected([]);
    setHint(null);
    recordedRef.current = false;
    if (mode === 'local') {
      setHandoff(
        previous.phase === 'discard' || previous.phase === 'pegging' ? previous.turn : null,
      );
    }
    if (previous.phase !== 'game-over') {
      setSaved(saveGame({ state: previous, mode, level }));
    } else {
      clearSave();
      setSaved(null);
    }
  }, [aiThinking, history, level, mode, state.phase, state.turn]);

  const showHint = useCallback(() => {
    if (screen !== 'game' || (mode !== 'ai' && mode !== 'local')) return;
    const seat = mode === 'ai' ? 0 : state.turn;
    if (state.turn !== seat) return;
    if (state.phase !== 'discard' && state.phase !== 'cut' && state.phase !== 'pegging') return;
    const next = hintFor(state, seat);
    if (!next) return;
    setHint(next);
    if (next.action === 'discard') setSelected(next.cards ?? []);
    setToast(hintMessage(lang, next));
  }, [lang, mode, screen, state]);

  // AI turn loop: one action at a time, deterministic from the deal seed.
  useEffect(() => {
    if (screen !== 'game' || mode !== 'ai') {
      setAiThinking(false);
      return;
    }
    if (state.phase === 'count' || state.phase === 'game-over' || state.turn === 0) {
      setAiThinking(false);
      return;
    }
    const actor = state.turn;
    const phase = state.phase;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      setAiThinking(false);
      if (modeRef.current !== 'ai') return;
      const current = stateRef.current;
      if (current.turn !== actor || current.phase !== phase) return;
      if (current.phase === 'discard') {
        const cards = chooseDiscard(current, actor, levelRef.current, aiRng(current, actor));
        const result = discard(current, actor, cards);
        if (result.ok) commit(result.state, current, 'card');
      } else if (current.phase === 'cut') {
        const result = cut(current, actor);
        if (result.ok) commit(result.state, current, 'cut');
      } else if (current.phase === 'pegging') {
        const card = choosePlay(current, actor, levelRef.current, aiRng(current, actor));
        if (card !== null) {
          const result = play(current, actor, card);
          if (result.ok) commit(result.state, current, 'peg');
        }
      }
    }, 620);
    return () => window.clearTimeout(timer);
  }, [commit, mode, screen, state]);

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

      if (mode === 'local' && handoff !== null) {
        if (event.key === 'Enter') {
          event.preventDefault();
          setHandoff(null);
        }
        return;
      }

      if (/^[1-6]$/.test(event.key)) {
        const shown = mode === 'lan-guest' ? guestView : view(state, mode === 'local' ? state.turn : 0);
        if (!shown) return;
        const card = sortHand(shown.hand)[Number(event.key) - 1];
        if (card !== undefined) {
          event.preventDefault();
          handleCard(card);
        }
        return;
      }
      if (event.key === 'Enter') {
        if (state.phase === 'discard' || guestView?.phase === 'discard') {
          event.preventDefault();
          confirmDiscard();
        }
        return;
      }
      if (event.key.toLowerCase() === 'c') {
        event.preventDefault();
        doCut();
        return;
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        advanceHand();
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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    advanceHand,
    confirmDiscard,
    doCut,
    goHome,
    guestView,
    handoff,
    handleCard,
    mode,
    screen,
    showHint,
    state,
    undo,
  ]);

  const joinGuest = useCallback(async () => {
    if (guestConnecting || guest) return;
    const name = guestName.trim();
    const code = guestCode.trim();
    const room = guestRoom.trim() || code;
    if (!name) {
      setLanError(t(lang, 'lanNeedName'));
      return;
    }
    if (!/^\d{4}$/.test(code)) {
      setLanError(t(lang, 'lanNeedCode'));
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
      autoJoinRef.current = true;
      lanActiveRef.current = true;
      setGuest(joined);
      setGuestRoom(room);
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
        modeRef.current = 'lan-guest';
        setScreen('game');
      });
      joined.onStart((players) => {
        if (!lanActiveRef.current) return;
        if (Array.isArray(players)) setGuestPlayers(players);
        setGuestStarted(true);
        setMode('lan-guest');
        modeRef.current = 'lan-guest';
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
  }, [guest, guestCode, guestConnecting, guestName, guestRoom, lang]);

  // A scanned invite joins immediately; the guest can still retry after an error.
  useEffect(() => {
    if (!invite || autoJoinRef.current) return;
    if (!guestCode || !guestName.trim()) return;
    autoJoinRef.current = true;
    void joinGuest();
  }, [guestCode, guestName, invite, joinGuest]);

  // Detect a host closing a room even if no explicit notice arrives.
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

  const openLanHub = useCallback(() => {
    closeLan();
    setLanRole('hub');
    setLanError('');
    setScreen('lan');
  }, [closeLan]);

  const openLanHost = useCallback(async () => {
    if (lanBusy) return;
    closeLan();
    const seq = ++hostCreateSeqRef.current;
    setLanRole('host');
    setMode('lan-host');
    modeRef.current = 'lan-host';
    setScreen('lan');
    setLanBusy(true);
    setLanError('');
    try {
      const info = await startLanServer();
      if (seq !== hostCreateSeqRef.current) return;
      setLanInfo(info);
      const code = newRoomCode();
      const name = hostName.trim() || t(lang, 'host');
      const created = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room: code,
        code,
        name,
        maxPlayers: lanSeats,
      });
      if (seq !== hostCreateSeqRef.current) {
        created.close();
        return;
      }
      hostRef.current = created;
      setLanHost(created);
      setLanCode(code);
      created.onChange((nextPlayers) => {
        if (hostRef.current !== created) return;
        setLanPlayers(nextPlayers);
        created.sendLobby();
        if (hostStartedRef.current) {
          created.start();
          for (const player of nextPlayers) {
            if (!player.host && player.connected) {
              created.sendView(player.seat, view(stateRef.current, player.seat));
            }
          }
        }
      });
      created.onIntent((seat, intent) => {
        if (hostRef.current !== created) return;
        const value = intent as {
          type?: string;
          cards?: unknown;
          card?: unknown;
          handNo?: unknown;
        } | null;
        if (!value || typeof value.type !== 'string') return;
        const current = stateRef.current;
        if (typeof value.handNo !== 'number' || value.handNo !== current.handNo) return;

        if (value.type === 'discard') {
          if (!Array.isArray(value.cards) || !value.cards.every((card) => typeof card === 'number')) {
            return;
          }
          const result = discard(current, seat, value.cards as Card[]);
          if (result.ok) commit(result.state, current, 'card');
          return;
        }
        if (value.type === 'play') {
          const card = Number(value.card);
          if (!Number.isInteger(card)) return;
          const result = play(current, seat, card);
          if (result.ok) commit(result.state, current, 'peg');
          return;
        }
        if (value.type === 'cut') {
          const result = cut(current, seat);
          if (result.ok) commit(result.state, current, 'cut');
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
        color: { dark: '#20342c', light: '#fffaf0' },
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
  }, [closeLan, commit, hostName, lang, lanBusy, lanSeats]);

  const startLan = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open') return;
    const online = lanPlayers.filter(
      (player) => !player.host && player.seat > 0 && player.seat < lanSeats && player.connected,
    );
    if (online.length !== lanSeats - 1) return;
    const seed = seedRef.current ?? randomSeed();
    seedRef.current = null;
    const next = setup(lanSeats, lanSeats - 1, seed);
    stateRef.current = next;
    modeRef.current = 'lan-host';
    setMode('lan-host');
    setState(next);
    setHistory([]);
    setSelected([]);
    setHint(null);
    setHandoff(null);
    setAiThinking(false);
    recordedRef.current = false;
    setLanError('');
    setScreen('game');
    hostStartedRef.current = true;
    host.start();
    host.sendLobby();
    sendViewsToGuests(next, host);
  }, [lanPlayers, lanSeats, seedRef]);

  const restartLan = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open') return;
    const seed = seedRef.current ?? randomSeed();
    seedRef.current = null;
    const next = setup(lanSeats, lanSeats - 1, seed);
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setSelected([]);
    setHint(null);
    setHandoff(null);
    setAiThinking(false);
    recordedRef.current = false;
    setLanError('');
    hostStartedRef.current = true;
    host.start();
    host.sendLobby();
    sendViewsToGuests(next, host);
    setScreen('game');
  }, [lanSeats, seedRef]);

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

  const guestsOnline = lanPlayers.filter(
    (player) => !player.host && player.seat > 0 && player.seat < lanSeats && player.connected,
  ).length;
  const allGuestsOnline = guestsOnline === lanSeats - 1;
  const hostOpen = mode !== 'lan-host' || lanHost?.status === 'open';
  const hostCanAct = mode === 'lan-host' ? allGuestsOnline && hostOpen : true;

  const displaySeat =
    mode === 'lan-guest'
      ? guestView?.seat ?? 0
      : mode === 'ai'
        ? 0
        : mode === 'lan-host'
          ? 0
          : handoff !== null
            ? handoff
            : state.phase === 'count' || state.phase === 'game-over'
              ? state.dealer
              : state.turn;

  const localView = view(state, displaySeat);
  const shown = mode === 'lan-guest' ? guestView : localView;
  const isGuest = mode === 'lan-guest';
  const isLan = mode === 'lan-host' || mode === 'lan-guest';
  const isCount = shown?.phase === 'count';
  const isOver = shown?.phase === 'game-over';

  const generatedNames = (() => {
    const count = shown?.players ?? players;
    if (mode === 'ai') {
      return Array.from({ length: count }, (_, seat) =>
        seat === 0 ? tr('you') : t(lang, 'computerName', { n: seat }),
      );
    }
    if (mode === 'local') {
      return Array.from({ length: count }, (_, seat) => t(lang, 'playerName', { n: seat + 1 }));
    }
    const peers = isGuest ? guestPlayers : lanPlayers;
    return Array.from({ length: count }, (_, seat) => {
      const peer = peers.find((player) => player.seat === seat);
      if (peer?.name) return peer.name;
      return seat === 0 ? tr('host') : t(lang, 'guest');
    });
  })();

  const names = generatedNames;
  const seat = shown?.seat ?? 0;
  const shownScores = shown?.scores ?? state.seats.map((item) => item.score);
  const shownDealer = shown?.dealer ?? state.dealer;
  const shownTurn = shown?.turn ?? state.turn;
  const shownPhase = shown?.phase ?? state.phase;
  const cribOwnerLabel =
    ((mode === 'ai' || mode === 'lan-host') && shownDealer === 0) ||
    (isGuest && shownDealer === seat)
      ? tr('yourCrib')
      : t(lang, 'cribOwner', { name: names[shownDealer] ?? '' });
  const handLabel =
    isGuest || ((mode === 'ai' || mode === 'lan-host') && seat === 0)
      ? tr('yourHand')
      : t(lang, 'handOf', { name: names[seat] });
  const cutterLabel =
    ((mode === 'ai' || mode === 'lan-host') && shownTurn === 0) ||
    (isGuest && shownTurn === seat)
      ? tr('yourCut')
      : t(lang, 'cutBy', { name: names[shownTurn] });
  const winner = shown?.winner ?? null;
  const canOwnAct = Boolean(shown?.canDiscard || shown?.canCut || shown?.canPlay);
  const canAct =
    canOwnAct &&
    (mode !== 'ai' || state.turn === 0) &&
    (mode !== 'lan-host' || hostCanAct) &&
    (mode !== 'lan-guest' || (guestStarted && Boolean(guestView)));
  const aiName = names[shownTurn] ?? '';
  const skunk = skunkFromScores(shownScores, winner);

  const hintCards =
    hint?.action === 'discard'
      ? hint.cards ?? []
      : hint?.action === 'play' && hint.card !== undefined
        ? [hint.card]
        : [];

  const phaseHeadline = (() => {
    if (isOver) return winner !== null ? t(lang, 'winMessage', { name: names[winner] }) : tr('phaseOver');
    if (isCount) return tr('phaseCount');
    if (isGuest && !guestStarted) return tr('lanWaitingHost');
    if (shownPhase === 'discard' && shown?.canDiscard) return tr('yourTurn');
    if (shownPhase === 'pegging' && shown?.canPlay) return tr('yourTurn');
    if (shownPhase === 'cut' && shown?.canCut) return tr('cutPrompt');
    if (shownPhase === 'cut') return cutterLabel;
    if (shownTurn === seat) return tr('yourTurn');
    if (mode === 'ai' && aiThinking) return t(lang, 'theirTurn', { name: aiName });
    return t(lang, 'theirTurn', { name: aiName });
  })();

  const phaseDetail =
    mode === 'ai'
      ? `${t(lang, 'handNumber', { n: shown?.handNo ?? state.handNo })} · ${t(lang, level)}`
      : t(lang, 'handNumber', { n: shown?.handNo ?? state.handNo });

  // ---------- home ----------
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
          <div className="hero-board">
            <span className="hero-board-label">121</span>
            <span className="hero-hole h1" />
            <span className="hero-hole h2" />
            <span className="hero-hole h3" />
            <span className="hero-hole h4" />
            <span className="hero-peg p1" />
            <span className="hero-peg p2" />
            <span className="hero-peg p3" />
            <span className="hero-peg p4" />
          </div>
          <div className="hero-fan">
            {DESKTOP_HERO_CARDS.map((card) => (
              <PlayingCard key={card} card={card} lang={lang} />
            ))}
            <span className="hero-plus">+</span>
            <PlayingCard card={DESKTOP_HERO_STARTER} lang={lang} />
          </div>
          <span className="hero-total">29</span>
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continueGame')}</span>
                <small>
                  {saved.mode === 'ai' ? t(lang, saved.level) : tr('localSetup')} ·{' '}
                  {tr('savedOnDevice')}
                </small>
              </button>
            )}
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={() => setScreen('setup')}>
              {tr('playSolo')}
            </button>
            <button
              className="secondary wide"
              onClick={() => {
                setMode('local');
                modeRef.current = 'local';
                setPlayers(2);
                setScreen('setup');
              }}
            >
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
            <strong>{record.games}</strong>
            <span>{tr(record.games === 1 ? 'gameSingular' : 'gamePlural')}</span>
            <span className="dot">·</span>
            <span>{tr('bestHand')} {record.bestHand || '—'}</span>
            <span className="dot">·</span>
            <span>{t(lang, 'skunks')} {record.skunks}</span>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  // ---------- setup ----------
  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{mode === 'ai' ? tr('soloSetup') : tr('localSetup')}</h2>

      <section className="setup-section">
        <h3>{tr('players')}</h3>
        <div className="segmented">
          {[2, 3, 4].map((count) => (
            <button
              key={count}
              className={players === count ? 'selected' : ''}
              onClick={() => setPlayers(count)}
              aria-pressed={players === count}
            >
              <strong>{count}</strong>
              <small>{count === 2 ? tr('playerCountTwo') : tr('playerCountMore')}</small>
            </button>
          ))}
        </div>
      </section>

      {mode === 'ai' ? (
        <section className="setup-section">
          <h3>{tr('level')}</h3>
          <div className="level-grid">
            {AI_LEVELS.map((item) => (
              <button
                key={item}
                className={`level-card ${level === item ? 'selected' : ''}`}
                onClick={() => setLevel(item)}
                aria-pressed={level === item}
              >
                <span className={`level-dot ${item}`} />
                <strong>{t(lang, item)}</strong>
                <small>{t(lang, `${item}Hint` as MessageKey)}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="row-actions">
        <button className="primary" onClick={() => startGame(mode === 'local' ? 'local' : 'ai', players)}>
          {tr('begin')}
        </button>
        <button className="ghost" onClick={goHome}>
          {tr('back')}
        </button>
      </div>
    </main>
  );

  // ---------- handoff ----------
  if (screen === 'game' && mode === 'local' && handoff !== null) {
    const name = names[handoff] ?? '';
    return (
      <main className="shell handoff-shell">
        <div className="handoff-card">
          <div className="handoff-backs" aria-hidden="true">
            <CardBack label={lang === 'zh' ? '牌背' : 'Card back'} />
            <CardBack label={lang === 'zh' ? '牌背' : 'Card back'} />
            <CardBack label={lang === 'zh' ? '牌背' : 'Card back'} />
          </div>
          <h2>{tr('handoffTitle')}</h2>
          <p className="handoff-to">{t(lang, 'passTo', { name })}</p>
          <p className="handoff-note">{t(lang, 'passPrivacy', { name })}</p>
          <button className="primary wide" onClick={() => setHandoff(null)}>
            {t(lang, 'ready', { name })}
          </button>
          <button className="text-button" onClick={goHome}>
            {tr('home')}
          </button>
        </div>
      </main>
    );
  }

  // ---------- game ----------
  const gameScreen = (
    <main className="shell game-shell">
      <header className="game-top">
        <button className="back" onClick={goHome}>
          ← {tr('home')}
        </button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>{t(lang, mode === 'ai' ? 'modeSolo' : mode === 'local' ? 'modeLocal' : mode === 'lan-host' ? 'modeLanHost' : 'modeLanGuest')}</span>
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

      {!shown ? (
        <section className="wait-card">
          <h2>{tr('lanWaitingHost')}</h2>
          <button className="secondary" onClick={goHome}>
            {tr('home')}
          </button>
        </section>
      ) : (
        <>
          <Scoreboard
            scores={shownScores}
            names={names}
            dealer={shownDealer}
            active={isOver ? -1 : shownTurn}
            winner={winner}
            lang={lang}
          />

          <div className="game-layout">
            <section className="game-main">
              {!isCount && !isOver && (
                <div className="phase-bar" aria-live="polite">
                  <span className={`turn-orb ${SEAT_CLASS[shownTurn]}`} aria-hidden="true">
                    {shownTurn + 1}
                  </span>
                  <div>
                    <strong>{phaseHeadline}</strong>
                    <span>{phaseDetail}</span>
                  </div>
                  {aiThinking && <span className="thinking">…</span>}
                </div>
              )}
              {isLan && lanError && (
                <p className="error" role="alert">
                  {lanError}
                </p>
              )}

              {isCount || isOver ? (
                <section className="show-section">
                  {isOver ? (
                    <div className="result-card">
                      <span className="result-kicker">
                        {tr('gameOver')}
                        {skunk !== 'none' && (
                          <span className="skunk-chip">
                            {skunk === 'double' ? tr('doubleSkunk') : tr('skunk')}
                          </span>
                        )}
                      </span>
                      <h2>{winner !== null ? t(lang, 'winMessage', { name: names[winner] }) : tr('phaseOver')}</h2>
                      <div className="final-scores">
                        {shownScores.map((score, index) => (
                          <div key={index} className={`final-line ${SEAT_CLASS[index]} ${index === winner ? 'is-winner' : ''}`}>
                            <span>{names[index]}</span>
                            <strong>{score}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="result-actions">
                        {isGuest ? (
                          <span className="wait-pill">
                            <span className="wait-dot" aria-hidden="true" />
                            {tr('lanWaitRestart')}
                          </span>
                        ) : (
                          <>
                            <button
                              className="primary"
                              onClick={() => {
                                if (mode === 'lan-host') restartLan();
                                else startGame(mode === 'ai' ? 'ai' : 'local', players);
                              }}
                              disabled={mode === 'lan-host' && !hostCanAct}
                            >
                              {tr('rematch')}
                            </button>
                            {mode === 'ai' && (
                              <button
                                className="secondary"
                                onClick={() => {
                                  setScreen('setup');
                                }}
                              >
                                {tr('changeLevel')}
                              </button>
                            )}
                          </>
                        )}
                        <button className="text-button" onClick={goHome}>
                          {tr('home')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="show-heading">
                      <h2>{tr('phaseCount')}</h2>
                    </div>
                  )}

                  {isCount && shown.handScores && (
                    <ShowBoard
                      scores={shown.handScores}
                      names={names}
                      cribOwnerLabel={cribOwnerLabel}
                      lang={lang}
                      winner={winner}
                      bestPoints={shown.bestHand?.points ?? 0}
                      bestSeat={shown.bestHand?.seat ?? null}
                    />
                  )}

                  {!isOver && (
                    <div className="show-actions">
                      {isGuest ? (
                        <span className="wait-pill">
                          <span className="wait-dot" aria-hidden="true" />
                          {tr('waitingNextHand')}
                        </span>
                      ) : (
                        <button
                          className="primary"
                          onClick={advanceHand}
                          disabled={mode === 'lan-host' && !hostCanAct}
                        >
                          {tr('nextHand')}
                        </button>
                      )}
                    </div>
                  )}
                </section>
              ) : (
                <>
                  <div className="opponents-row">
                    {Array.from({ length: shown.players }, (_, index) => index)
                      .filter((index) => index !== seat)
                      .map((index) => (
                        <div
                          key={index}
                          className={`opponent-panel ${SEAT_CLASS[index]} ${
                            shownTurn === index ? 'is-active' : ''
                          }`}
                        >
                          <div className="opp-head">
                            <span className="seat-pip" aria-hidden="true" />
                            <strong>{names[index]}</strong>
                            {index === shownDealer && (
                              <small className="dealer-tag">{tr('dealer')}</small>
                            )}
                          </div>
                          <div className="opp-backs" aria-hidden="true">
                            {Array.from({ length: shown.handCounts[index] ?? 0 }, (_, cardIndex) => (
                              <span key={cardIndex} className="mini-back" />
                            ))}
                          </div>
                          <span className="opp-score">{shownScores[index]}</span>
                        </div>
                      ))}
                  </div>

                  <TableCenter view={shown} names={names} cribOwnerLabel={cribOwnerLabel} lang={lang} />

                  <div className="hand-panel">
                    <div className="hand-head">
                      <div>
                        <span className="phase-chip">{t(lang, shownPhase === 'discard' ? 'phaseDiscard' : shownPhase === 'cut' ? 'phaseCut' : 'phasePegging')}</span>
                        <h3>
                          {shownPhase === 'discard'
                            ? shown.canDiscard
                              ? shown.discardCount === 1
                                ? tr('chooseDiscardOne')
                                : t(lang, 'chooseDiscard', { n: shown.discardCount })
                              : t(lang, 'waitingFor', { name: names[shownTurn] })
                            : shownPhase === 'cut'
                              ? cutterLabel
                              : shown.canPlay
                                ? tr('yourTurn')
                                : t(lang, 'waitingFor', { name: names[shownTurn] })}
                        </h3>
                      </div>
                      {shownPhase !== 'cut' && (
                        <div className="hand-meta">
                          <span>{handLabel}</span>
                          <strong>{t(lang, shown.hand.length === 1 ? 'cardOne' : 'cardsLeft', { n: shown.hand.length })}</strong>
                        </div>
                      )}
                    </div>

                    {shownPhase === 'cut' ? (
                      <div className="cut-stage">
                        <div className="deck-stack" aria-hidden="true">
                          <CardBack label={lang === 'zh' ? '牌背' : 'Card back'} />
                          <CardBack label={lang === 'zh' ? '牌背' : 'Card back'} />
                          <CardBack label={lang === 'zh' ? '牌背' : 'Card back'} />
                        </div>
                        <div className="cut-copy">
                          <button className="primary" onClick={doCut} disabled={!canAct}>
                            {tr('cutButton')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Hand
                          cards={shown.hand}
                          lang={lang}
                          selected={selected}
                          legal={shown.canDiscard || shown.canPlay ? shown.legal : []}
                          hinted={hintCards}
                          onCard={handleCard}
                          disabled={!shown.canDiscard && !shown.canPlay}
                        />
                        {shownPhase === 'discard' && (
                          <div className="selection-bar">
                            <span>{t(lang, 'selectedCount', { n: selected.length })}</span>
                            <div className="selection-actions">
                              <button
                                className="text-button"
                                onClick={() => {
                                  setSelected([]);
                                  setHint(null);
                                }}
                                disabled={selected.length === 0}
                              >
                                {tr('clearSelection')}
                              </button>
                              <button
                                className="primary"
                                onClick={confirmDiscard}
                                disabled={selected.length !== shown.discardCount || !canAct}
                              >
                                {tr('sendToCrib')}
                              </button>
                            </div>
                          </div>
                        )}
                        {shownPhase === 'pegging' && (
                          <div className="peg-note">
                            <span>{t(lang, 'countLabel')} {shown.count} / 31</span>
                            <span>{t(lang, 'scorePeg')} · {t(lang, shownScores[seat] === 1 ? 'pointOne' : 'points', { n: shownScores[seat] })}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </section>

            <aside className="side">
              <div className="side-card">
                <h3>{t(lang, mode === 'ai' ? 'modeSolo' : mode === 'local' ? 'modeLocal' : mode === 'lan-host' ? 'modeLanHost' : 'modeLanGuest')}</h3>
                <p className="side-status">
                  {isOver
                    ? tr('phaseOver')
                    : isGuest
                      ? guestStarted
                        ? tr('lanGuestSeat')
                        : tr('lanWaitingHost')
                      : mode === 'lan-host'
                        ? hostCanAct
                          ? tr('lanSeatsReady')
                          : tr('lanGuestLeft')
                        : mode === 'ai'
                          ? t(lang, level)
                          : state.phase === 'count'
                            ? tr('phaseCount')
                            : t(lang, 'handNumber', { n: state.handNo })}
                </p>
                <div className="side-actions">
                  <button
                    className="secondary"
                    onClick={undo}
                    disabled={
                      isLan ||
                      history.length === 0 ||
                      state.phase === 'game-over' ||
                      (mode === 'ai' && (state.turn !== 0 || aiThinking))
                    }
                  >
                    {tr('undo')}
                  </button>
                  <button
                    className="secondary"
                    onClick={showHint}
                    disabled={isLan || state.phase === 'count' || state.phase === 'game-over' || !canAct}
                  >
                    {tr('hint')}
                  </button>
                </div>
                {isLan ? (
                  <p className="side-note">{tr('localOnly')}</p>
                ) : (
                  <p className="side-note">{tr('keyboardHint')}</p>
                )}
              </div>

              {mode === 'lan-host' && (
                <div className="side-card lan-mini">
                  <div className="side-card-head">
                    <h3>{tr('lanCode')}</h3>
                    <span className={`status-dot ${hostCanAct ? 'online' : ''}`} />
                  </div>
                  <div className="room-code">{lanCode || '—'}</div>
                  <p>{hostCanAct ? tr('lanAllSeats') : t(lang, 'lanWaitingSeats', { n: Math.max(0, lanSeats - 1 - guestsOnline) })}</p>
                  <p className="peer">
                    {guestsOnline} / {lanSeats - 1} · {tr('lanSeats')}
                  </p>
                </div>
              )}

              {isGuest && (
                <div className="side-card lan-mini">
                  <div className="side-card-head">
                    <h3>{tr('lanGuestTitle')}</h3>
                    <span className={`status-dot ${guestStarted ? 'online' : ''}`} />
                  </div>
                  <p>{guestStarted ? tr('lanGuestSeat') : tr('lanWaitingHost')}</p>
                  <p className="peer">{t(lang, 'lanRoom', { code: guestRoom || guestCode })}</p>
                </div>
              )}

              <div className="side-card record-mini">
                <h3>{tr('viewRecord')}</h3>
                <p>
                  {record.games} {tr(record.games === 1 ? 'gameSingular' : 'gamePlural')} · {tr('bestHand')} {record.bestHand || '—'}
                </p>
                <p className="record-mini-note">{tr('clearNote')}</p>
                <button className="text-button" onClick={() => setScreen('stats')}>
                  {tr('viewRecord')} →
                </button>
              </div>
            </aside>
          </div>
        </>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );

  // ---------- stats ----------
  const statsScreen = (
    <main className="shell stats-shell">
      <button className="back" onClick={goHome}>
        ← {tr('home')}
      </button>
      <h2 className="screen-title">{tr('recordTitle')}</h2>

      {record.games === 0 ? (
        <section className="empty-card">
          <span className="empty-mark" aria-hidden="true">
            ♣ ♦ ♥ ♠
          </span>
          <p>{tr('recordEmpty')}</p>
          <button className="primary" onClick={() => setScreen('setup')}>
            {tr('playSolo')}
          </button>
        </section>
      ) : (
        <>
          <section className="stats-top">
            <div className="stat-card total">
              <span>{tr('games')}</span>
              <strong>{record.games}</strong>
            </div>
            <div className="stat-card">
              <span>{tr('skunks')}</span>
              <strong>{record.skunks}</strong>
            </div>
            <div className="stat-card">
              <span>{tr('doubleSkunks')}</span>
              <strong>{record.doubleSkunks}</strong>
            </div>
            <div className="stat-card best">
              <span>{tr('bestHand')}</span>
              <strong>{record.bestHand || '—'}</strong>
              {record.bestHandSeat !== null && (
                <small>{t(lang, 'winnerSeat', { n: record.bestHandSeat + 1 })}</small>
              )}
            </div>
          </section>

          <section className="record-grid">
            <div className="record-card">
              <h3>{tr('winShare')}</h3>
              <div className="share-bar" aria-hidden="true">
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className={`share-seat ${SEAT_CLASS[index]}`}
                    style={{ width: `${record.games > 0 ? (record.wins[index] / record.games) * 100 : 0}%` }}
                  />
                ))}
              </div>
              <ul className="share-legend">
                {[0, 1, 2, 3].map((index) => (
                  <li key={index}>
                    <i className={`legend-seat ${SEAT_CLASS[index]}`} />
                    {t(lang, 'winnerSeat', { n: index + 1 })}
                    <strong>{record.wins[index]}</strong>
                  </li>
                ))}
              </ul>
              <div className="streak-row">
                <div>
                  <span>{tr('streak')}</span>
                  <strong>{record.streak}</strong>
                </div>
                <div>
                  <span>{tr('bestStreak')}</span>
                  <strong>{record.bestStreak}</strong>
                </div>
                <div>
                  <span>{tr('lastWinner')}</span>
                  <strong>
                    {record.lastWinner !== null ? t(lang, 'winnerSeat', { n: record.lastWinner + 1 }) : '—'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="record-card modes-card">
              <h3>{tr('byMode')}</h3>
              <div className="mode-list">
                {(['ai', 'local', 'lan'] as const).map((value) => (
                  <div className="mode-row" key={value}>
                    <span>{t(lang, value === 'ai' ? 'modeAi' : value === 'local' ? 'modeLocal' : 'modeLan')}</span>
                    <div className="mode-bar">
                      <i
                        style={{
                          width:
                            record.games > 0 ? `${(record.byMode[value] / record.games) * 100}%` : '0%',
                        }}
                      />
                    </div>
                    <strong>{record.byMode[value]}</strong>
                  </div>
                ))}
              </div>
              <p className="clear-note">{tr('clearNote')}</p>
              {clearArmed && <p className="clear-confirm">{tr('clearConfirm')}</p>}
              <div className="clear-actions">
                <button className={clearArmed ? 'danger' : 'text-button'} onClick={resetRecord}>
                  {clearArmed ? tr('clearYes') : tr('clear')}
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
            <h3>{tr('recentGames')}</h3>
            {record.recent.length === 0 ? (
              <p className="recent-empty">{tr('recentEmpty')}</p>
            ) : (
              <ol className="recent-list">
                {record.recent.map((entry, index) => {
                  const winnerName =
                    entry.winnerSeat === 0
                      ? entry.mode === 'ai'
                        ? tr('you')
                        : t(lang, 'playerName', { n: 1 })
                      : entry.mode === 'ai'
                        ? t(lang, 'computerName', { n: entry.winnerSeat })
                        : entry.mode === 'local'
                          ? t(lang, 'playerName', { n: entry.winnerSeat + 1 })
                          : t(lang, 'guest');
                  return (
                    <li key={`${entry.at}-${index}`} className="recent-row">
                      <span className={`recent-mark ${SEAT_CLASS[entry.winnerSeat] ?? ''}`}>
                        {entry.winnerSeat + 1}
                      </span>
                      <div className="recent-main">
                        <strong>{winnerName}</strong>
                        <span>
                          {t(lang, entry.mode === 'ai' ? 'modeAi' : entry.mode === 'local' ? 'modeLocal' : 'modeLan')}
                          {entry.level ? ` · ${t(lang, entry.level)}` : ''} · {entry.players} {tr('players')}
                        </span>
                      </div>
                      <span className="recent-moves">
                        {entry.scores.join(' · ')}
                      </span>
                      <time dateTime={new Date(entry.at).toISOString()}>{formatDate(entry.at, lang)}</time>
                    </li>
                  );
                })}
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

  // ---------- rules ----------
  const rulesScreen = (
    <main className="shell rules-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>

      <section className="rules-section">
        <h3>{tr('dealTitle')}</h3>
        <ul>
          <li>{tr('deal1')}</li>
          <li>{tr('deal2')}</li>
          <li>{tr('deal3')}</li>
        </ul>
      </section>
      <section className="rules-section">
        <h3>{tr('pegTitle')}</h3>
        <ul>
          <li>{tr('peg1')}</li>
          <li>{tr('peg2')}</li>
          <li>{tr('peg3')}</li>
        </ul>
      </section>
      <section className="rules-section">
        <h3>{tr('showTitle')}</h3>
        <ul>
          <li>{tr('show1')}</li>
          <li>{tr('show2')}</li>
          <li>{tr('show3')}</li>
        </ul>
      </section>
      <section className="rules-section">
        <h3>{tr('winTitle')}</h3>
        <ul>
          <li>{tr('win1')}</li>
        </ul>
      </section>

      <section className="scoring-section">
        <h3>{tr('scoringTitle')}</h3>
        <div className="scoring-grid">
          <span>{tr('scoringFifteen')}</span>
          <span>{tr('scoringPair')}</span>
          <span>{tr('scoringTriple')}</span>
          <span>{tr('scoringQuad')}</span>
          <span>{tr('scoringRun')}</span>
          <span>{tr('scoringFlush')}</span>
          <span>{tr('scoringNobs')}</span>
        </div>
        <p className="rules-note">{tr('rulesNote')}</p>
      </section>

      <button className="primary" onClick={goHome}>
        {tr('close')}
      </button>
    </main>
  );

  // ---------- LAN ----------
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
              <div className="field">
                <span>{tr('lanSeatsLabel')}</span>
                <div className="segmented compact">
                  {[2, 3, 4].map((count) => (
                    <button
                      key={count}
                      className={lanSeats === count ? 'selected' : ''}
                      onClick={() => setLanSeats(count)}
                      aria-pressed={lanSeats === count}
                    >
                      {count}
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
              {lanError && (
                <p className="error" role="alert">
                  {lanError}
                </p>
              )}
            </section>
          </div>
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
            <button className="secondary" onClick={openLanHub}>
              {tr('lanBackToLobby')}
            </button>
          )}
          {lanHost && lanInfo && lanInvite && lanCode && (
            <div className="lan-layout">
              <div className="lan-card">
                <div className="lan-card-top">
                  <span className="label">{tr('lanCode')}</span>
                  <span className={`status-pill ${allGuestsOnline ? 'ready' : ''}`}>
                    {allGuestsOnline ? tr('lanAllSeats') : t(lang, 'lanWaitingSeats', { n: lanSeats - 1 - guestsOnline })}
                  </span>
                </div>
                <div className="room-code big">{lanCode}</div>
                <p className="lan-help">{tr('lanRoomCodeHelp')}</p>
                <div className="peer-list">
                  {lanPlayers
                    .filter((player) => player.seat < lanSeats)
                    .map((player) => (
                      <span key={player.seat} className={`peer-chip ${player.connected ? 'online' : ''}`}>
                        <span className="peer-mark">{player.seat + 1}</span>
                        <span className="peer-name">
                          {player.connected ? player.name : player.host ? player.name : tr('lanGuestTag')}
                        </span>
                        <small>
                          {player.host ? tr('lanHostTag') : tr('lanGuestTag')} ·{' '}
                          {player.connected ? tr('lanOnline') : tr('lanOffline')}
                        </small>
                      </span>
                    ))}
                </div>
                <button className="primary wide" onClick={startLan} disabled={!allGuestsOnline}>
                  {allGuestsOnline ? tr('lanStart') : tr('lanNeedAll')}
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
                <span>♣</span>
                <span>♦</span>
                <span>♥</span>
                <span>♠</span>
              </div>
              <h3>{tr('lanWaitingHost')}</h3>
              <p>{tr('lanGuestSeat')}</p>
              <div className="guest-meta">
                <span>{t(lang, 'lanRoom', { code: guestRoom || guestCode })}</span>
                <span>{t(lang, 'lanSeats')} · {guestPlayers.length || '—'}</span>
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

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
