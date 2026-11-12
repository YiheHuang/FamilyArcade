import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  LanGuest,
  LanHost,
  guestParams,
  newRoomCode,
  type LanPublicPeer,
} from '@family-arcade/lan';
import { AI_LEVELS, chooseIdiom, type AiLevel } from './ai/ai';
import { ChainList, ScoreStrip } from './components/Chain';
import { buildDemo, type DemoKind } from './demo';
import {
  failTurn,
  hintFor,
  passTurn,
  playForSeat,
  playIdiom,
  required,
  setup,
  timeout,
  view,
  type GameState,
  type Hint,
  type PlayError,
  type SeatView,
} from './game/idiom-chain';
import { detectLang, t, type Lang, type MessageKey } from './i18n';
import {
  guestWsUrl,
  hostWsUrl,
  inviteUrl,
  startLanServer,
  type LanServerInfo,
} from './net';
import { chime } from './sound';
import {
  clearRecord,
  clearSave,
  loadRecord,
  loadSave,
  readRecordMode,
  recordResult,
  saveGame,
  type FamilyRecord,
  type SavedGame,
} from './storage';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'record' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type LanRole = 'hub' | 'host' | 'guest';
type Toast = { text: string; tone: 'good' | 'bad' } | null;

const TIMERS = [10, 15, 20, 30] as const;
const MISS_LIMITS = [2, 3, 5] as const;
const TARGET = 10;

const LEVEL_KEYS: Record<AiLevel, MessageKey> = {
  companion: 'levelCompanion',
  easy: 'levelEasy',
  normal: 'levelNormal',
  hard: 'levelHard',
};

const LEVEL_NOTE_KEYS: Record<AiLevel, MessageKey> = {
  companion: 'levelCompanionNote',
  easy: 'levelEasyNote',
  normal: 'levelNormalNote',
  hard: 'levelHardNote',
};

const DEMO_NAMES: Record<Lang, string[]> = {
  en: ['Mia', 'Ben', 'Ada'],
  zh: ['小满', '阿禾', '团团'],
};

function displayName(raw: string, lang: Lang): string {
  const name = raw.trim();
  const player = /^(?:Player|玩家)\s*(\d+)$/.exec(name);
  if (player) return t(lang, 'nameSeat', { n: Number(player[1]) });
  const computer = /^(?:Computer|电脑)\s*(\d+)$/.exec(name);
  if (computer) return t(lang, 'aiSeat', { n: Number(computer[1]) });
  if (name === 'Host' || name === '主机') return t(lang, 'hostTag');
  if (name === 'Guest' || name === '客人') return t(lang, 'guestTag');
  if (name === 'You' || name === '你') return t(lang, 'you');
  return name;
}

function dateText(lang: Lang, at: number): string {
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-GB', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(at));
}

function errorText(
  lang: Lang,
  error: PlayError | undefined,
  before: GameState,
  homophone: boolean,
): string {
  const req = required(before);
  if (error === 'not-in-dictionary') return t(lang, 'errNotInDictionary');
  if (error === 'repeated') return t(lang, 'errRepeated');
  if (error === 'blank') return t(lang, 'errBlank');
  if (error === 'out') return t(lang, 'errOut');
  if (error === 'wrong-turn') return t(lang, 'errTurn');
  if (error === 'wrong-start') {
    if (homophone && req.char) {
      return t(lang, 'errWrongSound', { char: req.char, sound: req.sound ?? '' });
    }
    return t(lang, 'errWrongStart', { char: req.char ?? '' });
  }
  return t(lang, 'errAttempt');
}

function missText(
  lang: Lang,
  reason: string,
  name: string,
  out: boolean,
  limit: number,
): string {
  if (out) return t(lang, 'errStrikeOut', { name, n: limit });
  if (reason === 'late') return t(lang, 'errLate', { name });
  if (reason === 'pass') return t(lang, 'errPass', { name });
  if (reason === 'no-move') return t(lang, 'errNoMove', { name });
  return t(lang, 'errAttempt');
}

function lanErrorText(lang: Lang, reason: string): string {
  const value = reason.toLowerCase();
  if (value.includes('full')) return t(lang, 'lanFull');
  if (value.includes('code')) return t(lang, 'lanWrong');
  if (value.includes('closed')) return t(lang, 'lanClosed');
  return t(lang, 'lanLost');
}

export default function App() {
  const invite = useMemo(() => guestParams(), []);
  const params = useMemo(
    () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search),
    [],
  );
  const fast = params.get('fast') === '1';
  const demoKind: DemoKind | null =
    params.get('demo') === 'end' ? 'end' : params.get('demo') === 'game' ? 'game' : null;
  const isDemo = demoKind !== null;

  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() =>
    demoKind ? 'game' : invite ? 'lan' : 'home',
  );
  const [mode, setMode] = useState<Mode>(() =>
    demoKind ? 'local' : invite ? 'lan-guest' : 'ai',
  );
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() =>
    demoKind ? buildDemo(demoKind, DEMO_NAMES[lang]) : setup(),
  );
  const [history, setHistory] = useState<GameState[]>([]);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => (demoKind ? null : loadSave()));
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.idiom-chain.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [motionOn, setMotionOn] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('familyarcade.idiom-chain.motion');
      if (stored === 'off') return false;
      if (stored === 'on') return true;
    } catch {
      /* ignore */
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
      return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return true;
  });
  const [toast, setToast] = useState<Toast>(null);
  const [draft, setDraft] = useState('');
  const [hint, setHint] = useState<Hint | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [cover, setCover] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [remainingMs, setRemainingMs] = useState(15000);
  const [clearArmed, setClearArmed] = useState(false);

  const [tableSeats, setTableSeats] = useState(3);
  const [timerSeconds, setTimerSeconds] = useState(15);
  const [homophone, setHomophone] = useState(false);
  const [missLimit, setMissLimit] = useState(3);
  const [coverEnabled, setCoverEnabled] = useState(true);
  const [nameOverrides, setNameOverrides] = useState<Record<number, string>>({});

  const [lanRole, setLanRole] = useState<LanRole>(() => (invite ? 'guest' : 'hub'));
  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [lanSeats, setLanSeats] = useState(3);
  const [fillAi, setFillAi] = useState(true);
  const [hostName, setHostName] = useState(() => {
    try {
      return localStorage.getItem('familyarcade.idiom-chain.hostName') ?? '';
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
  const historyRef = useRef<GameState[]>(history);
  const humanSeatsRef = useRef<number[]>([0]);
  const hostRef = useRef<LanHost | null>(null);
  const hostStartedRef = useRef(false);
  const hostSeqRef = useRef(0);
  const recordedRef = useRef(isDemo);
  const lanActiveRef = useRef(false);
  const guestSigRef = useRef('');
  const commitRef = useRef<((next: GameState, previous: GameState) => void) | null>(null);
  const timeoutRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const tr = useCallback((key: MessageKey, values?: Record<string, string | number>) => t(lang, key, values), [lang]);
  const isGuest = mode === 'lan-guest';
  const isLan = mode === 'lan-host' || mode === 'lan-guest';

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    humanSeatsRef.current = humanSeats;
  }, [humanSeats]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? '成语接龙' : 'Idiom Chain';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', !motionOn);
    try {
      localStorage.setItem('familyarcade.idiom-chain.motion', motionOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [motionOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.idiom-chain.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.idiom-chain.hostName', hostName);
    } catch {
      /* ignore */
    }
  }, [hostName]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (screen !== 'record') setClearArmed(false);
    setToast(null);
  }, [screen]);

  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }, [screen]);

  const sendViews = useCallback((next: GameState) => {
    const host = hostRef.current;
    if (!host) return;
    for (const seat of humanSeatsRef.current) {
      if (seat === 0) continue;
      host.sendView(seat, view(next, seat));
    }
  }, []);

  const commit = useCallback(
    (next: GameState, previous: GameState) => {
      stateRef.current = next;
      setState(next);
      setHint(null);
      setHintUsed(false);
      setDraft('');
      setAiThinking(false);

      if (mode === 'ai' || mode === 'local') {
        const nextHistory = [...historyRef.current, previous].slice(-40);
        historyRef.current = nextHistory;
        setHistory(nextHistory);
        if (!isDemo) {
          if (next.status === 'playing') {
            setSaved(
              saveGame({
                state: next,
                history: nextHistory,
                mode,
                level,
                names: next.players.map((player) => player.name),
                settings: {
                  seconds: next.config.seconds,
                  homophone: next.config.homophone,
                  missLimit: next.config.missLimit,
                  cover: coverEnabled,
                },
              }),
            );
          } else {
            clearSave();
            setSaved(null);
          }
        }
      }

      if (
        next.status === 'finished' &&
        previous.status !== 'finished' &&
        !recordedRef.current
      ) {
        recordedRef.current = true;
        if (!isDemo && mode !== 'lan-guest') {
          setRecord(recordResult(next, readRecordMode(mode)));
          setToast({ text: t(lang, 'recorded'), tone: 'good' });
        }
        if (mode === 'ai' || mode === 'local') {
          clearSave();
          setSaved(null);
        }
      }

      if (mode === 'local' && !isDemo) {
        if (next.status === 'playing' && coverEnabled) setCover(true);
        else setCover(false);
      }

      if (mode === 'lan-host') sendViews(next);

      if (soundOn) {
        if (next.status === 'finished' && previous.status !== 'finished') {
          chime(mode === 'ai' && next.winner !== 0 ? 'lose' : 'win');
        } else if (next.lastEvent?.kind === 'play') {
          chime(
            next.lastEvent.rare
              ? 'rare'
              : next.lastEvent.streakBonus
                ? 'bonus'
                : 'valid',
          );
        } else if (next.lastEvent?.kind === 'miss') {
          chime('miss');
        }
      }
    },
    [coverEnabled, isDemo, lang, level, mode, sendViews, soundOn],
  );
  commitRef.current = commit;

  const handleTimeout = useCallback(() => {
    if (mode === 'lan-guest') return;
    const current = stateRef.current;
    if (current.status !== 'playing') return;
    if (mode === 'ai' && current.turn !== 0) return;
    if (mode === 'lan-host' && !humanSeatsRef.current.includes(current.turn)) return;
    const name = displayName(current.players[current.turn]?.name ?? '', lang);
    const next = timeout(current, current.turn);
    const out = next.players[current.turn]?.out ?? false;
    setToast({
      text: missText(lang, 'late', name, out, current.config.missLimit),
      tone: 'bad',
    });
    commit(next, current);
  }, [commit, lang, mode]);
  timeoutRef.current = handleTimeout;

  const launch = useCallback(
    (next: GameState, nextMode: 'ai' | 'local') => {
      stateRef.current = next;
      setState(next);
      historyRef.current = [];
      setHistory([]);
      setHint(null);
      setHintUsed(false);
      setDraft('');
      setAiThinking(false);
      setMode(nextMode);
      setCover(nextMode === 'local' && coverEnabled);
      setScreen('game');
      recordedRef.current = false;
      if (!isDemo) {
        setSaved(
          saveGame({
            state: next,
            history: [],
            mode: nextMode,
            level,
            names: next.players.map((player) => player.name),
            settings: {
              seconds: next.config.seconds,
              homophone: next.config.homophone,
              missLimit: next.config.missLimit,
              cover: coverEnabled,
            },
          }),
        );
      }
    },
    [coverEnabled, isDemo, level],
  );

  const nameForSetup = (seat: number): string => {
    const custom = nameOverrides[seat]?.trim();
    if (custom) return custom;
    if (mode === 'ai' && seat === 0) return t(lang, 'you');
    if (mode === 'ai') return t(lang, 'aiSeat', { n: seat });
    return t(lang, 'nameSeat', { n: seat + 1 });
  };

  const beginGame = () => {
    const names = Array.from({ length: tableSeats }, (_, seat) => nameForSetup(seat));
    const next = setup(
      {
        players: tableSeats,
        names,
        first: 0,
        seconds: timerSeconds,
        homophone,
        target: TARGET,
        missLimit,
      },
      Math.random,
    );
    launch(next, mode === 'local' ? 'local' : 'ai');
  };

  const resume = () => {
    if (!saved) return;
    stateRef.current = saved.state;
    setState(saved.state);
    historyRef.current = saved.history;
    setHistory(saved.history);
    setMode(saved.mode);
    setLevel(saved.level);
    setTableSeats(saved.state.players.length);
    setTimerSeconds(saved.settings.seconds);
    setHomophone(saved.settings.homophone);
    setMissLimit(saved.settings.missLimit);
    setCoverEnabled(saved.settings.cover);
    setCover(saved.mode === 'local' && saved.settings.cover && saved.state.status === 'playing');
    setScreen('game');
    setSaved(null);
    setHint(null);
    setHintUsed(false);
    setDraft('');
    setAiThinking(false);
    recordedRef.current = saved.state.status === 'finished';
  };

  const closeLan = useCallback(() => {
    lanActiveRef.current = false;
    hostStartedRef.current = false;
    hostSeqRef.current += 1;
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
    setLanInfo(null);
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
    setLanRole('hub');
    activeGuest?.close();
  }, [guest]);

  const openLanHub = useCallback(() => {
    closeLan();
    setMode('ai');
    setScreen('lan');
  }, [closeLan]);

  const goHome = useCallback(() => {
    closeLan();
    setMode('ai');
    setScreen('home');
    setCover(false);
    setAiThinking(false);
    setHint(null);
    setHintUsed(false);
    setDraft('');
    setSaved(loadSave());
    setRecord(loadRecord());
  }, [closeLan]);

  const openSetup = (nextMode: 'ai' | 'local') => {
    closeLan();
    setMode(nextMode);
    setTableSeats(nextMode === 'ai' ? 3 : 2);
    setScreen('setup');
    setCover(false);
    setHint(null);
    setDraft('');
  };

  const changeSetup = () => {
    if (isGuest) {
      goHome();
      return;
    }
    if (mode === 'lan-host') {
      setScreen('lan');
      setCover(false);
      return;
    }
    const overrides: Record<number, string> = {};
    state.players.forEach((player, seat) => {
      if (player.name) overrides[seat] = player.name;
    });
    setNameOverrides(overrides);
    setTableSeats(state.players.length);
    setTimerSeconds(state.config.seconds);
    setHomophone(state.config.homophone);
    setMissLimit(state.config.missLimit);
    setMode(mode === 'local' ? 'local' : 'ai');
    setScreen('setup');
    setCover(false);
  };

  const restartGame = () => {
    if (isDemo) return;
    if (mode === 'lan-host') {
      startLanGameRef.current?.();
      return;
    }
    if (mode === 'lan-guest') return;
    const next = setup(
      {
        players: state.players.length,
        names: state.players.map((player) => player.name),
        first: 0,
        seconds: state.config.seconds,
        homophone: state.config.homophone,
        target: state.config.target,
        missLimit: state.config.missLimit,
      },
      Math.random,
    );
    launch(next, mode === 'local' ? 'local' : 'ai');
  };

  const shown: GameState | SeatView =
    mode === 'lan-guest' && guestView ? guestView : state;
  const shownNames = shown.players.map((player) => displayName(player.name, lang));
  const last = shown.chain.length ? shown.chain[shown.chain.length - 1] : null;
  const req = isGuest && guestView
    ? {
        char: guestView.requiredChar,
        sound: guestView.requiredSound,
        pinyin: last?.pinyin.trim().split(/\s+/).at(-1) ?? null,
      }
    : required(state);
  const currentName = displayName(shown.players[shown.turn]?.name ?? '', lang);
  const isMySeat = isGuest ? Boolean(guestView?.canPlay && guestStarted) : true;
  const canAct =
    screen === 'game' &&
    shown.status === 'playing' &&
    !cover &&
    !aiThinking &&
    (mode === 'ai'
      ? shown.turn === 0
      : mode === 'local'
        ? true
        : mode === 'lan-host'
          ? shown.turn === 0 && humanSeatsRef.current.includes(0)
          : isMySeat);
  const guestWaiting = isGuest && !guestView;
  const totalMs = Math.max(5, shown.config.seconds) * 1000;
  const timeLeft = Math.ceil(remainingMs / 1000);
  const progress = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));

  useEffect(() => {
    if (screen !== 'game') return;
    setHint(null);
    setHintUsed(false);
    setDraft('');
  }, [shown.turn, shown.chain.length, shown.status, mode, screen]);

  useEffect(() => {
    if (
      screen === 'game' &&
      canAct &&
      !cover &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(pointer: fine)').matches
    ) {
      inputRef.current?.focus();
    }
  }, [canAct, cover, screen, shown.chain.length, shown.turn]);

  const submit = useCallback(() => {
    if (!canAct) {
      setToast({ text: t(lang, 'errTurn'), tone: 'bad' });
      return;
    }
    if (!draft.trim()) {
      setToast({ text: t(lang, 'errBlank'), tone: 'bad' });
      return;
    }
    if (isGuest) {
      guest?.sendIntent({ type: 'play', text: draft, usedHint: hintUsed });
      setDraft('');
      setHint(null);
      setHintUsed(false);
      return;
    }
    const seat = mode === 'local' ? state.turn : 0;
    const result = playIdiom(state, seat, draft, { usedHint: hintUsed });
    if (!result.applied) {
      setToast({ text: t(lang, 'errTurn'), tone: 'bad' });
      return;
    }
    setHint(null);
    setHintUsed(false);
    setDraft('');
    if (!result.valid) {
      setToast({ text: errorText(lang, result.error, state, state.config.homophone), tone: 'bad' });
    }
    commit(result.state, state);
  }, [canAct, commit, draft, guest, hintUsed, isGuest, lang, mode, state]);

  const pass = useCallback(() => {
    if (!canAct) return;
    if (isGuest) {
      guest?.sendIntent({ type: 'pass' });
      setHint(null);
      setHintUsed(false);
      return;
    }
    const seat = mode === 'local' ? state.turn : 0;
    const name = displayName(state.players[seat]?.name ?? '', lang);
    const next = passTurn(state, seat);
    const out = next.players[seat]?.out ?? false;
    setToast({ text: missText(lang, 'pass', name, out, state.config.missLimit), tone: 'bad' });
    commit(next, state);
  }, [canAct, commit, guest, isGuest, lang, mode, state]);

  const showHint = useCallback(() => {
    if (!canAct) return;
    const source = isGuest && guestView ? (guestView as unknown as GameState) : state;
    const seat = isGuest && guestView ? guestView.seat : mode === 'local' ? state.turn : 0;
    const found = hintFor(source, seat);
    if (!found) {
      setToast({ text: t(lang, 'hintNone'), tone: 'bad' });
      return;
    }
    setHint(found);
    setHintUsed(true);
    if (soundOn) chime('click');
  }, [canAct, guestView, isGuest, lang, mode, soundOn, state]);

  const undo = useCallback(() => {
    if (isLan || isDemo || cover || history.length === 0) return;
    let index = -1;
    if (mode === 'local') {
      index = history.length - 1;
    } else {
      for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i].status === 'playing' && history[i].turn === 0) {
          index = i;
          break;
        }
      }
    }
    if (index < 0) return;
    const target = history[index];
    const nextHistory = history.slice(0, index);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    stateRef.current = target;
    setState(target);
    setHint(null);
    setHintUsed(false);
    setDraft('');
    setAiThinking(false);
    setCover(mode === 'local' && coverEnabled && target.status === 'playing');
    recordedRef.current = false;
    if (mode === 'local' || mode === 'ai') {
      setSaved(
        saveGame({
          state: target,
          history: nextHistory,
          mode,
          level,
          names: target.players.map((player) => player.name),
          settings: {
            seconds: target.config.seconds,
            homophone: target.config.homophone,
            missLimit: target.config.missLimit,
            cover: coverEnabled,
          },
        }),
      );
    }
  }, [cover, coverEnabled, history, isDemo, isLan, level, mode]);

  const canUndo = useMemo(() => {
    if (isLan || isDemo || cover || history.length === 0 || state.status !== 'playing') return false;
    if (mode === 'local') return true;
    if (mode !== 'ai') return false;
    return history.some((item) => item.status === 'playing' && item.turn === 0);
  }, [cover, history, isDemo, isLan, mode, state.status]);

  const createRoom = useCallback(async () => {
    if (lanBusy) return;
    closeLan();
    const seq = ++hostSeqRef.current;
    setLanRole('host');
    setMode('lan-host');
    setScreen('lan');
    setLanBusy(true);
    setLanError('');
    try {
      const info = await startLanServer();
      if (seq !== hostSeqRef.current) return;
      setLanInfo(info);
      const code = newRoomCode();
      const created = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room: code,
        code,
        name: hostName.trim() || t(lang, 'hostTag'),
        maxPlayers: lanSeats,
      });
      if (seq !== hostSeqRef.current) {
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
          for (const player of players) {
            if (
              player.connected &&
              !player.host &&
              humanSeatsRef.current.includes(player.seat)
            ) {
              created.sendView(player.seat, view(stateRef.current, player.seat));
            }
          }
        }
      });
      created.onIntent((seat, intent) => {
        if (hostRef.current !== created) return;
        if (!hostStartedRef.current || !humanSeatsRef.current.includes(seat)) return;
        const value = intent as
          | { type?: string; text?: string; usedHint?: boolean }
          | null;
        if (!value) return;
        const current = stateRef.current;
        if (value.type === 'play') {
          const result = playForSeat(current, seat, String(value.text ?? ''), {
            usedHint: Boolean(value.usedHint),
          });
          if (result.applied) commitRef.current?.(result.state, current);
          else created.sendView(seat, view(current, seat));
          return;
        }
        if (value.type === 'pass') {
          if (current.turn !== seat) {
            created.sendView(seat, view(current, seat));
            return;
          }
          commitRef.current?.(passTurn(current, seat), current);
        }
      });
      created.onClose(() => {
        if (hostRef.current !== created) return;
        hostRef.current = null;
        hostStartedRef.current = false;
        setLanHost(null);
        setLanPlayers([]);
        setLanError(t(lang, 'lanLost'));
        setToast({ text: t(lang, 'lanLost'), tone: 'bad' });
      });
      const url = inviteUrl(info, code, code, '');
      setLanInvite(url);
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        color: { dark: '#2d4036', light: '#fbf4e6' },
      });
      if (seq !== hostSeqRef.current) return;
      setLanQr(qr);
    } catch {
      if (seq !== hostSeqRef.current) return;
      setLanError(t(lang, 'lanLost'));
      hostRef.current?.close();
      hostRef.current = null;
      setLanHost(null);
      setLanPlayers([]);
    } finally {
      if (seq === hostSeqRef.current) setLanBusy(false);
    }
  }, [closeLan, hostName, lang, lanBusy, lanSeats]);

  const startLanGame = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open') return;
    const players = host.publicPlayers();
    const connected = players.filter((player) => player.connected && !player.host);
    if (connected.length === 0) {
      setToast({ text: t(lang, 'needGuest'), tone: 'bad' });
      return;
    }
    if (!fillAi && connected.length !== lanSeats - 1) {
      setToast({ text: t(lang, 'needGuest'), tone: 'bad' });
      return;
    }
    const humans = [0, ...connected.map((player) => player.seat)];
    humanSeatsRef.current = humans;
    setHumanSeats(humans);
    const names = Array.from({ length: lanSeats }, (_, seat) => {
      if (seat === 0) return hostName.trim() || t(lang, 'hostTag');
      const guestPlayer = players.find((player) => player.seat === seat && player.connected);
      if (guestPlayer) return guestPlayer.name;
      return t(lang, 'aiSeat', { n: seat });
    });
    const next = setup(
      {
        players: lanSeats,
        names,
        first: 0,
        seconds: timerSeconds,
        homophone,
        target: TARGET,
        missLimit,
      },
      Math.random,
    );
    stateRef.current = next;
    setState(next);
    historyRef.current = [];
    setHistory([]);
    setCover(false);
    setHint(null);
    setHintUsed(false);
    setDraft('');
    setAiThinking(false);
    setLanError('');
    setMode('lan-host');
    setScreen('game');
    hostStartedRef.current = true;
    recordedRef.current = false;
    host.start({ players: lanSeats });
    host.sendLobby();
    for (const seat of humans) {
      if (seat !== 0) host.sendView(seat, view(next, seat));
    }
  }, [fillAi, homophone, hostName, lang, lanSeats, missLimit, timerSeconds]);

  const startLanGameRef = useRef<(() => void) | null>(null);
  startLanGameRef.current = startLanGame;

  const joinGuest = useCallback(async () => {
    if (guestConnecting || guest) return;
    const name = guestName.trim();
    const code = guestCode.trim();
    if (!name) {
      setLanError(t(lang, 'errBlank'));
      return;
    }
    if (!/^\d{4}$/.test(code)) {
      setLanError(t(lang, 'lanWrong'));
      return;
    }
    setGuestConnecting(true);
    setLanError('');
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room: guestRoom.trim() || code,
        code,
        name,
      });
      lanActiveRef.current = true;
      setGuest(joined);
      setGuestRoom(guestRoom.trim() || code);
      setGuestCode(code);
      setLanRole('guest');
      setMode('lan-guest');
      setGuestView(null);
      setGuestStarted(false);
      setGuestPlayers([]);
      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        const next = payload as SeatView;
        if (!next || !Array.isArray(next.players) || !Array.isArray(next.chain)) return;
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
        if (value?.kind !== 'closed') return;
        lanActiveRef.current = false;
        setGuest(null);
        setGuestView(null);
        setGuestStarted(false);
        setGuestPlayers([]);
        setLanError(t(lang, 'lanClosed'));
        setToast({ text: t(lang, 'lanClosed'), tone: 'bad' });
        setLanRole('guest');
        setScreen('lan');
        joined.close();
      });
      joined.onError((reason) => {
        if (!lanActiveRef.current) return;
        const message = lanErrorText(lang, reason);
        setLanError(message);
        setToast({ text: message, tone: 'bad' });
      });
      setScreen('lan');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLanError(lanErrorText(lang, message));
      lanActiveRef.current = false;
    } finally {
      setGuestConnecting(false);
    }
  }, [guest, guestCode, guestConnecting, guestName, guestRoom, lang]);

  const copyInvite = useCallback(async () => {
    if (!lanInvite) return;
    try {
      await navigator.clipboard.writeText(lanInvite);
      setToast({ text: t(lang, 'inviteCopied'), tone: 'good' });
    } catch {
      setToast({ text: lanInvite, tone: 'good' });
    }
  }, [lang, lanInvite]);

  const clearFamilyRecord = () => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setRecord(clearRecord());
    setClearArmed(false);
    setToast({ text: t(lang, 'recordCleared'), tone: 'good' });
  };

  const modeLabel = isDemo
    ? tr('demoNote')
    : mode === 'ai'
      ? tr(LEVEL_KEYS[level])
      : mode === 'local'
        ? tr('playLocal')
        : mode === 'lan-host'
          ? tr('hostTag')
          : tr('guestTag');
  const winnerName =
    shown.winner === null
      ? tr('sharedWin')
      : shownNames[shown.winner] === tr('you')
        ? tr('winnerYou')
        : tr('winnerName', { name: shownNames[shown.winner] ?? '' });
  const resultReason =
    shown.closedBy === 'score'
      ? tr('byScore', { n: shown.config.target })
      : shown.closedBy === 'last-standing'
        ? tr('byLast')
        : tr('byAllOut');
  const hintReason = hint
    ? hint.reason === 'only'
      ? tr('hintOnly')
      : hint.reason === 'opens'
        ? tr('hintOpens', { n: hint.nextCount, char: hint.idiom.text.slice(-1) })
        : hint.reason === 'rare'
          ? tr('hintRare')
          : tr('hintCommon')
    : '';
  const hintPinyin = hint ? hint.idiom.pinyin : '';
  const recent = record.recent;

  useEffect(() => {
    setRemainingMs(totalMs);
    if (screen !== 'game' || shown.status !== 'playing' || cover) return;
    if (isGuest) {
      if (!guestView?.canPlay) return;
      let left = totalMs;
      const id = window.setInterval(() => {
        left = Math.max(0, left - 100);
        setRemainingMs(left);
        if (left <= 0) window.clearInterval(id);
      }, 100);
      return () => window.clearInterval(id);
    }
    const humanActive =
      mode === 'ai'
        ? shown.turn === 0
        : mode === 'local'
          ? true
          : mode === 'lan-host'
            ? humanSeatsRef.current.includes(shown.turn)
            : false;
    if (!humanActive) return;
    let left = totalMs;
    let fired = false;
    const id = window.setInterval(() => {
      left = Math.max(0, left - 100);
      setRemainingMs(left);
      if (left <= 0 && !fired) {
        fired = true;
        window.clearInterval(id);
        const current = stateRef.current;
        if (
          current.status === 'playing' &&
          current.turn === shown.turn &&
          current.chain.length === shown.chain.length
        ) {
          timeoutRef.current?.();
        }
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [
    cover,
    guestView?.canPlay,
    isGuest,
    mode,
    screen,
    shown.chain.length,
    shown.config.seconds,
    shown.status,
    shown.turn,
    totalMs,
  ]);

  useEffect(() => {
    if (screen !== 'game' || state.status !== 'playing') {
      setAiThinking(false);
      return;
    }
    const aiTurn =
      mode === 'ai'
        ? state.turn !== 0
        : mode === 'lan-host'
          ? !humanSeatsRef.current.includes(state.turn)
          : false;
    if (!aiTurn) {
      setAiThinking(false);
      return;
    }
    setAiThinking(true);
    const delay = fast ? 90 : 620;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.status !== 'playing') {
        setAiThinking(false);
        return;
      }
      const stillAi =
        mode === 'ai'
          ? current.turn !== 0
          : !humanSeatsRef.current.includes(current.turn);
      if (!stillAi) {
        setAiThinking(false);
        return;
      }
      const pick = chooseIdiom(current, level, Math.random);
      if (!pick) {
        const next = failTurn(current, current.turn, 'no-move');
        const out = next.players[current.turn]?.out ?? false;
        const name = displayName(current.players[current.turn]?.name ?? '', lang);
        setToast({
          text: missText(lang, 'no-move', name, out, current.config.missLimit),
          tone: 'bad',
        });
        commitRef.current?.(next, current);
        return;
      }
      const result = playIdiom(current, current.turn, pick.text);
      if (result.applied) commitRef.current?.(result.state, current);
      else setAiThinking(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [fast, lang, level, mode, screen, state.chain.length, state.status, state.turn]);

  useEffect(() => {
    if (!guestView) return;
    const event = guestView.lastEvent;
    const signature = `${guestView.chain.length}|${guestView.status}|${JSON.stringify(event)}`;
    if (signature === guestSigRef.current) return;
    guestSigRef.current = signature;
    if (event?.kind === 'miss' && event.seat === guestView.seat) {
      const name = displayName(guestView.players[guestView.seat]?.name ?? '', lang);
      setToast({
        text: missText(lang, event.reason, name, event.out, guestView.config.missLimit),
        tone: 'bad',
      });
    }
    if (soundOn) {
      if (guestView.status === 'finished') {
        chime(guestView.winner === guestView.seat ? 'win' : 'lose');
      } else if (event?.kind === 'play') {
        chime(event.rare ? 'rare' : event.streakBonus ? 'bonus' : 'valid');
      } else if (event?.kind === 'miss') {
        chime('miss');
      }
    }
  }, [guestView, lang, soundOn]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (screen !== 'game') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        goHome();
        return;
      }
      if (event.altKey && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        showHint();
        return;
      }
      if (event.altKey && event.key.toLowerCase() === 'u') {
        event.preventDefault();
        undo();
        return;
      }
      if (event.altKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        pass();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goHome, pass, screen, showHint, undo]);

  const controls = (withMotion = true) => (
    <div className="mast-actions">
      <button className="ghost" data-testid="language" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
        {tr('language')}
      </button>
      <button className="ghost" onClick={() => setSoundOn((value) => !value)}>
        {soundOn ? tr('soundOn') : tr('soundOff')}
      </button>
      {withMotion && (
        <button className="ghost" onClick={() => setMotionOn((value) => !value)}>
          {motionOn ? tr('motionOn') : tr('motionOff')}
        </button>
      )}
    </div>
  );

  const backHome = () => {
    closeLan();
    setScreen('home');
    setMode('ai');
    setCover(false);
    setSaved(loadSave());
  };

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('kicker')}</p>
          <h1>{tr('title')}</h1>
        </div>
        {controls()}
      </header>

      <section className="hero">
        <div className="hero-sheet" aria-hidden="true">
          <span className="hero-sheet-label">{tr('chain')}</span>
          <div className="hero-chain">
            <span className="hero-idiom">一心一意</span>
            <span className="hero-join">·</span>
            <span className="hero-idiom">意气风发</span>
            <span className="hero-join">·</span>
            <span className="hero-idiom">发扬光大</span>
            <span className="hero-join">·</span>
            <span className="hero-idiom last">大器晚成</span>
          </div>
          <p className="hero-pinyin">
            yī xīn yī yì · yì qì fēng fā
            <br />
            fā yáng guāng dà · dà qì wǎn chéng
          </p>
          <div className="hero-seal">接</div>
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" data-testid="continue" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>{tr('continueNote')}</small>
              </button>
            )}
            <button
              className={saved ? 'secondary wide' : 'primary wide'}
              data-testid="start-solo"
              onClick={() => openSetup('ai')}
            >
              <span>{tr('playSolo')}</span>
              <small>{tr('playSoloNote')}</small>
            </button>
            <button className="secondary wide" data-testid="start-local" onClick={() => openSetup('local')}>
              <span>{tr('playLocal')}</span>
              <small>{tr('playLocalNote')}</small>
            </button>
            <button className="secondary wide" data-testid="start-lan" onClick={openLanHub}>
              <span>{tr('playLan')}</span>
              <small>{tr('playLanNote')}</small>
            </button>
            <div className="home-links">
              <button className="text-button" data-testid="rules" onClick={() => setScreen('rules')}>
                {tr('rules')} ›
              </button>
              <button className="text-button" data-testid="record" onClick={() => setScreen('record')}>
                {tr('record')} ›
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('record')}</span>
            <strong>{record.matches}</strong>
            <span>{tr('recordMatches')}</span>
            <span className="dot">·</span>
            <span>{record.wins} {tr('recordWins')}</span>
            <span className="dot">·</span>
            <span>{record.longestChain} {tr('recordLongest')}</span>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <div className="screen-top">
        <button className="back" onClick={backHome}>← {tr('back')}</button>
        {controls()}
      </div>
      <h2 className="screen-title">{tr('setupTitle')}</h2>
      <div className="setup-panel">
        <div className="setting-block">
          <span className="setting-label">{tr('players')}</span>
          <div className="segmented">
            {[2, 3, 4, 5, 6].map((count) => (
              <button
                key={count}
                data-testid={`players-${count}`}
                className={tableSeats === count ? 'selected' : ''}
                onClick={() => setTableSeats(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        {mode === 'ai' && (
          <div className="setting-block">
            <span className="setting-label">{tr('soloLevel')}</span>
            <div className="level-grid">
              {AI_LEVELS.map((id) => (
                <button
                  key={id}
                  data-testid={`level-${id}`}
                  className={`level-card ${level === id ? 'selected' : ''}`}
                  onClick={() => setLevel(id)}
                >
                  <span className={`level-dot ${id}`} />
                  <strong>{tr(LEVEL_KEYS[id])}</strong>
                  <small>{tr(LEVEL_NOTE_KEYS[id])}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="setting-block">
          <span className="setting-label">{tr('names')}</span>
          <div className="name-grid">
            {Array.from({ length: tableSeats }, (_, seat) => {
              if (mode === 'ai' && seat > 0) return null;
              const value =
                nameOverrides[seat] ??
                (mode === 'ai'
                  ? ''
                  : t(lang, 'nameSeat', { n: seat + 1 }));
              return (
                <label key={seat} className="name-input">
                  <span>{seat === 0 ? tr('yourName') : t(lang, 'nameSeat', { n: seat + 1 })}</span>
                  <input
                    data-testid={`name-${seat}`}
                    value={value}
                    placeholder={mode === 'ai' && seat === 0 ? tr('yourName') : ''}
                    maxLength={18}
                    onChange={(event) =>
                      setNameOverrides((current) => ({ ...current, [seat]: event.target.value }))
                    }
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="setting-block two-col">
          <div>
            <span className="setting-label">{tr('timer')}</span>
            <div className="segmented compact">
              {TIMERS.map((seconds) => (
                <button
                  key={seconds}
                  data-testid={`timer-${seconds}`}
                  className={timerSeconds === seconds ? 'selected' : ''}
                  onClick={() => setTimerSeconds(seconds)}
                >
                  {t(lang, 'seconds', { n: seconds })}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="setting-label">{tr('strikes')}</span>
            <div className="segmented compact">
              {MISS_LIMITS.map((count) => (
                <button
                  key={count}
                  data-testid={`miss-${count}`}
                  className={missLimit === count ? 'selected' : ''}
                  onClick={() => setMissLimit(count)}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="toggle-list">
          <button
            className={`toggle-row ${homophone ? 'on' : ''}`}
            data-testid="homophone"
            aria-pressed={homophone}
            onClick={() => setHomophone((value) => !value)}
          >
            <span>
              <strong>{tr('homophone')}</strong>
              <small>{tr('homophoneNote')}</small>
            </span>
            <span className="switch" aria-hidden="true" />
          </button>
          {mode === 'local' && (
            <button
              className={`toggle-row ${coverEnabled ? 'on' : ''}`}
              data-testid="cover-toggle"
              aria-pressed={coverEnabled}
              onClick={() => setCoverEnabled((value) => !value)}
            >
              <span>
                <strong>{tr('cover')}</strong>
                <small>{tr('coverNote')}</small>
              </span>
              <span className="switch" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="setup-summary">
          <span>{tr('targetValue', { n: TARGET })}</span>
          <span>{t(lang, 'seconds', { n: timerSeconds })}</span>
          <span>{t(lang, 'strikesValue', { n: missLimit })}</span>
        </div>
      </div>
      <div className="row-actions">
        <button className="primary" data-testid="begin" onClick={beginGame}>{tr('begin')}</button>
        <button className="ghost" onClick={backHome}>{tr('back')}</button>
      </div>
    </main>
  );

  const gameContent = (
    <>
      <div className="game-top">
        <button className="back" data-testid="home" onClick={goHome}>← {tr('home')}</button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>{modeLabel}</span>
        </div>
        {controls(false)}
      </div>

      {cover ? (
        <div className="cover-wrap">
          <div className="cover-card" data-testid="cover">
            <span className="cover-mark">接</span>
            <p className="cover-name">{currentName}</p>
            <p className="cover-note">{tr('coveredNote')}</p>
            <button
              className="primary"
              data-testid="cover-reveal"
              onClick={() => {
                setCover(false);
                if (soundOn) chime('click');
              }}
            >
              {tr('reveal')}
            </button>
          </div>
        </div>
      ) : guestWaiting ? (
        <div className="cover-wrap">
          <div className="waiting-card" data-testid="guest-waiting">
            <span className="waiting-mark">龙</span>
            <strong className="waiting-title">{tr('guestTitle')}</strong>
            <p>{tr('guestWaiting')}</p>
            {guest?.seat !== undefined && guest.seat >= 0 && (
              <p>{t(lang, 'lanSeatView', { n: guest.seat + 1 })}</p>
            )}
            <button className="secondary" onClick={goHome}>{tr('home')}</button>
          </div>
        </div>
      ) : (
        <div className="game-layout">
          <section className="board-wrap">
            <ScoreStrip
              players={shown.players.map((player, seat) => ({
                ...player,
                name: shownNames[seat] ?? player.name,
              }))}
              turn={shown.turn}
              status={shown.status}
              missLimit={shown.config.missLimit}
              lang={lang}
            />

            {shown.status === 'finished' ? (
              <section className="focus-card result-card" data-testid="result">
                <div className="result-badges">
                  <span>{resultReason}</span>
                  <span>{tr('chainLength', { n: shown.chain.length })}</span>
                </div>
                <h2>{winnerName}</h2>
                <div className="final-scores">
                  {shown.players.map((player, seat) => (
                    <div key={seat} className={`final-score seat-${seat % 6}`}>
                      <span>{shownNames[seat]}</span>
                      <strong>{player.score}</strong>
                    </div>
                  ))}
                </div>
                <div className="result-actions">
                  {!isGuest && (
                    <button className="primary" data-testid="play-again" onClick={restartGame}>
                      {tr('playAgain')}
                    </button>
                  )}
                  {isGuest ? (
                    <button className="secondary" onClick={goHome}>{tr('home')}</button>
                  ) : (
                    <button className="secondary" data-testid="change-setup" onClick={changeSetup}>
                      {tr('changeSetup')}
                    </button>
                  )}
                  <button className="ghost" onClick={goHome}>{tr('home')}</button>
                </div>
              </section>
            ) : (
              <section className="focus-card">
                <div className="focus-head">
                  <span className="focus-label">{tr('turn')}</span>
                  <span
                    className={`timer ${remainingMs < totalMs * 0.3 ? 'low' : ''}`}
                    data-testid="timer"
                  >
                    {timeLeft}
                  </span>
                </div>
                <div className="timer-track">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <div className="prompt-row">
                  <div>
                    <strong className="prompt-name">
                      {mode === 'local'
                        ? tr('turnOf', { name: currentName })
                        : canAct
                          ? tr('yourTurn')
                          : tr('waitingFor', { name: currentName })}
                    </strong>
                    <p className="prompt-note">
                      {last
                        ? homophone && req.char
                          ? tr('nextSounds', { char: req.char, sound: req.sound ?? '' })
                          : tr('nextStarts', { char: req.char ?? '' })
                        : tr('anyIdiom')}
                    </p>
                  </div>
                  {aiThinking && <span className="thinking">…</span>}
                </div>

                {last ? (
                  <div className={`last-idiom seat-${last.seat % 6}`}>
                    <div className="required-seal">
                      <span>{req.char ?? '?'}</span>
                      {req.pinyin && <small>{req.pinyin}</small>}
                    </div>
                    <div className="last-copy">
                      <div className="last-top">
                        <strong>{last.text}</strong>
                        <span className="point-badge">+{last.points}</span>
                      </div>
                      <span className="last-pinyin">{last.pinyin}</span>
                      {lang === 'en' && <span className="last-gloss">{last.gloss}</span>}
                      <span className="last-by">
                        {shownNames[last.seat]} · {tr('score')} {shown.players[last.seat]?.score ?? 0}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="opening-card">
                    <span className="opening-seal">始</span>
                    <p>{tr('anyIdiom')}</p>
                  </div>
                )}

                <form
                  className="play-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                  }}
                >
                  <label className="idiom-field">
                    <span>{tr('inputLabel')}</span>
                    <input
                      ref={inputRef}
                      data-testid="idiom-input"
                      value={draft}
                      disabled={!canAct}
                      placeholder={tr('inputPlaceholder')}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={12}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          submit();
                        }
                      }}
                    />
                  </label>
                  <button className="primary play-button" data-testid="play" type="submit" disabled={!canAct}>
                    {tr('play')}
                  </button>
                </form>

                <div className="controls-row">
                  <button className="secondary" data-testid="hint" disabled={!canAct} onClick={showHint}>
                    {tr('hint')}
                  </button>
                  <button className="secondary" data-testid="pass" disabled={!canAct} onClick={pass}>
                    {tr('pass')}
                  </button>
                  <button className="secondary" data-testid="undo" disabled={!canUndo} onClick={undo}>
                    {tr('undo')}
                  </button>
                </div>
                <p className="controls-note">{tr('keyHints')}</p>

                {hint && (
                  <div className="hint-card" data-testid="hint-card">
                    <div className="hint-top">
                      <span className="hint-label">{tr('hintTitle')}</span>
                      {hint.idiom.frequency <= 2 && <span className="rare-chip">{tr('rare')}</span>}
                    </div>
                    <div className="hint-main">
                      <strong className="hint-idiom" data-testid="hint-idiom">{hint.idiom.text}</strong>
                      <span className="hint-pinyin">{hintPinyin}</span>
                    </div>
                    {lang === 'en' && <span className="hint-gloss">{hint.idiom.gloss}</span>}
                    <p className="hint-reason">{hintReason}</p>
                    <span className="hint-points">{tr('hintPoints', { n: hint.points })}</span>
                  </div>
                )}
              </section>
            )}

            {shown.status === 'playing' && (
              <div className="table-meta">
                <span>{tr('targetShort', { n: shown.config.target })}</span>
                <span>{t(lang, 'seconds', { n: shown.config.seconds })}</span>
                <span>{shown.config.homophone ? tr('homophone') : tr('standardChain')}</span>
                {isLan && <span>{mode === 'lan-host' ? tr('hostTag') : tr('guestTag')}</span>}
              </div>
            )}
          </section>

          <aside className="side">
            <div className="side-card chain-card">
              <h3>{tr('chain')}</h3>
              <ChainList
                chain={shown.chain}
                names={shownNames}
                lang={lang}
                emptyLabel={tr('noChain')}
              />
            </div>
            {mode === 'lan-host' && (
              <div className="side-card lan-mini">
                <h3>{tr('roomCode')}</h3>
                <div className="room-code">{lanCode}</div>
                <p>{lanError || tr('waitingGuests')}</p>
              </div>
            )}
            {isGuest && guestView && (
              <div className="side-card lan-mini">
                <h3>{tr('guestTag')}</h3>
                <p>{t(lang, 'lanSeatView', { n: guestView.seat + 1 })}</p>
                {guestPlayers.length > 0 && (
                  <p className="peer">{guestPlayers.filter((player) => player.connected).length} {tr('players')}</p>
                )}
              </div>
            )}
            <div className="side-card record-mini">
              <h3>{tr('record')}</h3>
              <p>{t(lang, 'summary', { matches: record.matches, wins: record.wins, score: record.bestScore })}</p>
              <button className="text-button" onClick={() => setScreen('record')}>{tr('record')} ›</button>
            </div>
          </aside>
        </div>
      )}

      {toast && <div className={`toast ${toast.tone}`} role="status">{toast.text}</div>}
    </>
  );

  const gameScreen = (
    <main
      className="shell game-shell"
      data-phase={shown.status}
      data-turn={shown.turn}
      data-mode={mode}
      data-can-play={canAct ? 'true' : 'false'}
    >
      {gameContent}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <div className="screen-top">
        <button className="back" onClick={backHome}>← {tr('back')}</button>
        {controls()}
      </div>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <ol className="rules-list">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
          <li key={index}>{tr(`rule${index}` as MessageKey)}</li>
        ))}
      </ol>
      <div className="example-chain">
        <span>一心一意</span><b>·</b><span>意气风发</span><b>·</b><span>发扬光大</span><b>·</b><span>大器晚成</span>
      </div>
      <div className="about-block">
        <h3>{tr('aboutTitle')}</h3>
        <p>{tr('aboutText')}</p>
      </div>
      <button className="primary" onClick={backHome}>{tr('close')}</button>
      {toast && <div className={`toast ${toast.tone}`} role="status">{toast.text}</div>}
    </main>
  );

  const recordScreen = (
    <main className="shell narrow-shell">
      <div className="screen-top">
        <button className="back" onClick={backHome}>← {tr('back')}</button>
        {controls()}
      </div>
      <h2 className="screen-title">{tr('recordTitle')}</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <span>{tr('recordMatches')}</span>
          <strong data-testid="record-matches">{record.matches}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('recordWins')}</span>
          <strong>{record.wins}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('recordLongest')}</span>
          <strong>{record.longestChain}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('recordBest')}</span>
          <strong>{record.bestScore}</strong>
        </div>
      </div>
      <div className="mode-stats">
        <span>{tr('recordSolo')} {record.soloWins}</span>
        <span>{tr('recordLocal')} {record.localWins}</span>
        <span>{tr('recordLan')} {record.byMode.lan}</span>
      </div>
      <div className="recent-card">
        <h3>{tr('recent')}</h3>
        {recent.length === 0 ? (
          <p className="muted">{tr('noGames')}</p>
        ) : (
          <div className="recent-table" role="table">
            <div className="recent-head" role="row">
              <span role="columnheader">{tr('recentWinner')}</span>
              <span role="columnheader">{tr('recentScore')}</span>
              <span role="columnheader">{tr('recentChain')}</span>
              <span role="columnheader">{tr('recentMode')}</span>
              <span role="columnheader">{tr('recentDate')}</span>
            </div>
            {recent.map((match, index) => (
              <div className="recent-row" role="row" key={`${match.at}-${index}`}>
                <span role="cell">{match.winnerName ? displayName(match.winnerName, lang) : tr('ties')}</span>
                <span role="cell">{match.score}</span>
                <span role="cell">{match.chain}</span>
                <span role="cell">
                  {match.mode === 'ai' ? tr('modeSolo') : match.mode === 'local' ? tr('modeLocal') : tr('modeLan')}
                </span>
                <span role="cell">{dateText(lang, match.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="row-actions">
        <button className="secondary" data-testid="clear-record" onClick={clearFamilyRecord}>
          {clearArmed ? tr('clearRecordArmed') : tr('clearRecord')}
        </button>
        <button className="ghost" onClick={backHome}>{tr('back')}</button>
      </div>
      {toast && <div className={`toast ${toast.tone}`} role="status">{toast.text}</div>}
    </main>
  );

  const connectedGuests = lanPlayers.filter((player) => player.connected && !player.host);
  const canStartLan =
    Boolean(lanHost) &&
    connectedGuests.length > 0 &&
    (fillAi || connectedGuests.length === lanSeats - 1);

  const hostPanel = (
    <div className="lan-card" data-testid="host-panel">
      <h3>{tr('hostRoom')}</h3>
      <div className="lan-form compact-form">
        <label>
          <span>{tr('hostName')}</span>
          <input value={hostName} placeholder={tr('hostName')} maxLength={18} onChange={(event) => setHostName(event.target.value)} />
        </label>
        <label>
          <span>{tr('seats')}</span>
          <div className="segmented compact">
            {[2, 3, 4, 5, 6].map((count) => (
              <button
                key={count}
                data-testid={`lan-seats-${count}`}
                className={lanSeats === count ? 'selected' : ''}
                onClick={() => setLanSeats(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </label>
        <label>
          <span>{tr('soloLevel')}</span>
          <select value={level} onChange={(event) => setLevel(event.target.value as AiLevel)}>
            {AI_LEVELS.map((id) => (
              <option key={id} value={id}>{tr(LEVEL_KEYS[id])}</option>
            ))}
          </select>
        </label>
        <button
          className={`toggle-row ${fillAi ? 'on' : ''}`}
          data-testid="lan-fill-ai"
          aria-pressed={fillAi}
          onClick={() => setFillAi((value) => !value)}
        >
          <span>
            <strong>{tr('fillAi')}</strong>
            <small>{tr('fillAiNote')}</small>
          </span>
          <span className="switch" aria-hidden="true" />
        </button>
        <button className="primary" data-testid="lan-create" onClick={createRoom} disabled={lanBusy}>
          {lanBusy ? tr('joining') : tr('createRoom')}
        </button>
      </div>
    </div>
  );

  const joinPanel = (
    <div className="lan-card" data-testid="join-panel">
      <h3>{tr('joinRoom')}</h3>
      <div className="lan-form compact-form">
        <label>
          <span>{tr('yourName')}</span>
          <input
            data-testid="lan-name"
            value={guestName}
            placeholder={tr('yourName')}
            maxLength={18}
            onChange={(event) => setGuestName(event.target.value)}
          />
        </label>
        <label>
          <span>{tr('roomCode')}</span>
          <input
            data-testid="lan-code-input"
            value={guestCode}
            placeholder={tr('roomCodePlaceholder')}
            inputMode="numeric"
            maxLength={4}
            onChange={(event) => setGuestCode(event.target.value.replace(/\D/g, ''))}
          />
        </label>
        <button
          className="primary"
          data-testid="lan-join"
          onClick={joinGuest}
          disabled={guestConnecting || !guestName.trim() || !/^\d{4}$/.test(guestCode.trim())}
        >
          {guestConnecting ? tr('joining') : tr('join')}
        </button>
        {lanError && <p className="error">{lanError}</p>}
      </div>
    </div>
  );

  const lanScreen = (
    <main className="shell narrow-shell">
      <div className="screen-top">
        <button className="back" onClick={goHome}>← {tr('back')}</button>
        {controls()}
      </div>
      <h2 className="screen-title">{tr('lanTitle')}</h2>

      {lanRole === 'guest' ? (
        guest ? (
          <div className="waiting-card lan-waiting" data-testid="guest-waiting">
            <span className="waiting-mark">候</span>
            <strong className="waiting-title">{tr('guestTitle')}</strong>
            <p>{tr('guestWaiting')}</p>
            {guest.seat >= 0 && <p>{t(lang, 'lanSeatView', { n: guest.seat + 1 })}</p>}
            {guestPlayers.length > 0 && (
              <div className="peer-list">
                {guestPlayers.map((player) => (
                  <span key={player.seat} className={player.connected ? 'online' : ''}>
                    {displayName(player.name, lang)}
                  </span>
                ))}
              </div>
            )}
            {lanError && <p className="error">{lanError}</p>}
            <button className="secondary" onClick={goHome}>{tr('home')}</button>
          </div>
        ) : (
          <>{joinPanel}</>
        )
      ) : lanHost && lanInfo && lanInvite ? (
        <div className="lan-layout">
          <div className="lan-card">
            <span className="label">{tr('roomCode')}</span>
            <div className="room-code big" data-testid="lan-room-code">{lanCode}</div>
            <p>{connectedGuests.length > 0 ? tr('tableReady') : tr('waitingGuests')}</p>
            <p className="muted">
              {t(lang, 'playerCount', { n: lanSeats })} · {t(lang, 'seconds', { n: timerSeconds })} ·{' '}
              {homophone ? tr('homophone') : tr('standardChain')}
            </p>
            <div className="peer-list">
              {lanPlayers.map((player) => (
                <span key={player.seat} className={player.connected ? 'online' : ''}>
                  {player.connected
                    ? displayName(player.name, lang)
                    : player.host
                      ? displayName(player.name, lang)
                      : t(lang, 'seatTag', { n: player.seat + 1 })}
                  {player.host ? ` · ${tr('hostTag')}` : ''}
                  {!player.connected && !player.host && fillAi ? ` · ${t(lang, 'aiSeat', { n: player.seat })}` : ''}
                </span>
              ))}
            </div>
            <label className="host-option">
              <span>{tr('soloLevel')}</span>
              <select value={level} onChange={(event) => setLevel(event.target.value as AiLevel)}>
                {AI_LEVELS.map((id) => (
                  <option key={id} value={id}>{tr(LEVEL_KEYS[id])}</option>
                ))}
              </select>
            </label>
            <div className="host-option">
              <span>{tr('timer')}</span>
              <div className="segmented compact">
                {TIMERS.map((seconds) => (
                  <button
                    key={seconds}
                    className={timerSeconds === seconds ? 'selected' : ''}
                    onClick={() => setTimerSeconds(seconds)}
                  >
                    {t(lang, 'seconds', { n: seconds })}
                  </button>
                ))}
              </div>
            </div>
            <button
              className={`toggle-row slim ${homophone ? 'on' : ''}`}
              aria-pressed={homophone}
              onClick={() => setHomophone((value) => !value)}
            >
              <span>
                <strong>{tr('homophone')}</strong>
              </span>
              <span className="switch" aria-hidden="true" />
            </button>
            <button
              className={`toggle-row slim ${fillAi ? 'on' : ''}`}
              aria-pressed={fillAi}
              onClick={() => setFillAi((value) => !value)}
            >
              <span>
                <strong>{tr('fillAi')}</strong>
              </span>
              <span className="switch" aria-hidden="true" />
            </button>
            <button
              className="primary wide"
              data-testid="lan-start"
              onClick={startLanGame}
              disabled={!canStartLan}
            >
              {tr('startGame')}
            </button>
            {!canStartLan && <p className="muted">{tr('needGuest')}</p>}
            <button className="secondary wide" onClick={copyInvite}>{tr('copyInvite')}</button>
            <a className="invite-link" href={lanInvite} target="_blank" rel="noreferrer">
              {lanInvite.replace(/^https?:\/\//, '')}
            </a>
            {lanError && <p className="error">{lanError}</p>}
          </div>
          <div className="qr-card">
            {lanQr ? <img src={lanQr} alt={tr('scan')} /> : null}
            <p>{tr('scan')}</p>
            <p className="muted">{tr('address')}</p>
          </div>
        </div>
      ) : (
        <div className="lan-layout">
          {hostPanel}
          {joinPanel}
        </div>
      )}

      {lanRole !== 'guest' && (
        <p className="lan-help">{tr('lanStartHint')}</p>
      )}
      {toast && <div className={`toast ${toast.tone}`} role="status">{toast.text}</div>}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'record') return recordScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
