import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseMove, choosePass, type AiLevel } from './ai/ai';
import { hintFor, type HintKind } from './ai/hint';
import { CardBack, PlayingCard, SuitRow } from './components/Cards';
import { Table } from './components/Table';
import {
  QUEEN_SPADES,
  nextHand as nextHandState,
  passCards,
  playCard,
  setup,
  view,
  type Card,
  type GameState,
  type SeatView,
} from './game/hearts';
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
type LanRole = 'hub' | 'host' | 'guest';

const LEVEL_LABEL: Record<AiLevel, MessageKey> = {
  companion: 'levelCompanion',
  easy: 'levelEasy',
  normal: 'levelNormal',
  hard: 'levelHard',
};

const LEVEL_NOTE: Record<AiLevel, MessageKey> = {
  companion: 'levelCompanionHint',
  easy: 'levelEasyHint',
  normal: 'levelNormalHint',
  hard: 'levelHardHint',
};

const LEVELS: AiLevel[] = ['companion', 'easy', 'normal', 'hard'];

const HINT_KEY: Record<HintKind, MessageKey> = {
  pass: 'hintPass',
  moon: 'hintMoon',
  blockMoon: 'hintBlockMoon',
  queen: 'hintQueen',
  void: 'hintVoid',
  lead: 'hintLead',
  take: 'hintTake',
  duck: 'hintDuck',
};

const AI_NAME_KEYS: MessageKey[] = ['ada', 'bo', 'cy'];

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

function seatColor(seat: number): string {
  return ['#c95845', '#c99a4a', '#5f9079', '#6383a8'][seat] ?? '#c95845';
}

function HomeArt({ lang }: { lang: Lang }) {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="hero-mat">
        <span className="hero-mat-line" />
        <SuitRow className="hero-suits" />
        <div className="hero-fan">
          {[33, 18, 51, 36, 0].map((card, index) => (
            <span key={`${card}-${index}`} className={`hero-fan-card fan-${index + 1}`}>
              <PlayingCard card={card} lang={lang} decorative />
            </span>
          ))}
        </div>
        <span className="hero-seal">♥</span>
        <span className="hero-queen-chip">{t(lang, 'queenLabel')}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [invite] = useState(() => guestParams());
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (invite ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (invite ? 'lan-guest' : 'ai'));
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup(Math.random));
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<Card | null>(null);
  const [hintNote, setHintNote] = useState('');
  const [selectedPass, setSelectedPass] = useState<Card[]>([]);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.hearts.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [motionOn, setMotionOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.hearts.motion') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [revealedSeat, setRevealedSeat] = useState<number | null>(null);

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
      return localStorage.getItem('familyarcade.hearts.hostName') ?? '';
    } catch {
      return '';
    }
  });
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestPending, setGuestPending] = useState(false);
  const [guestName, setGuestName] = useState(() => invite?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => invite?.code || invite?.room || '');
  const [guestRoom] = useState(() => invite?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [guestPlayers, setGuestPlayers] = useState<LanPublicPeer[]>([]);
  const [autoJoin] = useState(() => Boolean(invite && (invite.code || invite.room) && invite.name));

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const hostStartedRef = useRef(false);
  const autoJoinRef = useRef(false);
  const lanActiveRef = useRef(false);
  const guestJoinSeqRef = useRef(0);
  const hostCreateSeqRef = useRef(0);
  const recordedRef = useRef(false);
  const lastGuestPlayedRef = useRef(0);
  const commitRef = useRef<(next: GameState, previous: GameState, actionMode: Mode, silent?: boolean) => void>(() => undefined);

  const tr = useCallback((key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params), [lang]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t(lang, 'title');
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
    setToast('');
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.hearts.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.hearts.motion', motionOn ? 'on' : 'off');
      document.documentElement.classList.toggle('reduce-motion', !motionOn);
    } catch {
      /* ignore */
    }
  }, [motionOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.hearts.hostName', hostName);
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

  const humanSeats = useMemo(() => {
    if (mode === 'ai') return [true, false, false, false];
    if (mode === 'local') return [true, true, true, true];
    if (mode === 'lan-host') {
      return [0, 1, 2, 3].map(
        (seat) => seat === 0 || Boolean(lanPlayers.find((player) => player.seat === seat && player.connected)),
      );
    }
    if (mode === 'lan-guest') {
      return [0, 1, 2, 3].map((seat) =>
        Boolean(guestPlayers.find((player) => player.seat === seat && player.connected)),
      );
    }
    return [true, false, false, false];
  }, [guestPlayers, lanPlayers, mode]);

  const seatNames = useMemo(() => {
    const aiNames = AI_NAME_KEYS.map((key) => t(lang, key));
    if (mode === 'local') {
      return [0, 1, 2, 3].map((seat) => t(lang, 'playerN', { n: seat + 1 }));
    }
    if (mode === 'ai') {
      return [t(lang, 'you'), ...aiNames];
    }
    if (mode === 'lan-host' || mode === 'lan-guest') {
      const players = mode === 'lan-host' ? lanPlayers : guestPlayers;
      return [0, 1, 2, 3].map((seat) => {
        const player = players.find((item) => item.seat === seat && item.connected);
        if (player) return player.name || t(lang, seat === 0 ? 'lanHostTag' : 'lanGuestTag');
        if (seat === 0 && mode === 'lan-host') {
          return hostName.trim() || t(lang, 'lanHostNamePlaceholder');
        }
        return aiNames[Math.max(0, seat - 1)] ?? t(lang, 'playerN', { n: seat + 1 });
      });
    }
    return [t(lang, 'you'), ...aiNames];
  }, [guestPlayers, hostName, lang, lanPlayers, mode]);

  const passTurn = useMemo(() => {
    if (state.phase !== 'passing') return -1;
    return state.passSelections.findIndex((pick) => pick === null);
  }, [state]);

  const localActiveSeat =
    state.phase === 'playing' ? state.turn : state.phase === 'passing' ? passTurn : 0;
  const isGuest = mode === 'lan-guest';
  const isLan = mode === 'lan-host' || mode === 'lan-guest';
  const viewerSeat = isGuest ? guestView?.seat ?? 0 : mode === 'local' ? localActiveSeat : 0;

  const effectiveGuestView = guestView
    ? guestPending
      ? { ...guestView, canAct: false, canPass: false, legal: [] }
      : guestView
    : null;

  const shownView: SeatView =
    isGuest && effectiveGuestView ? effectiveGuestView : view(state, Math.max(0, viewerSeat));
  const privacyOpen =
    mode === 'local' &&
    screen === 'game' &&
    (state.phase === 'playing' || state.phase === 'passing') &&
    localActiveSeat >= 0 &&
    revealedSeat !== localActiveSeat;

  const playerAt = useCallback(
    (seat: number) => seatNames[seat] || t(lang, 'playerN', { n: seat + 1 }),
    [lang, seatNames],
  );

  const savedGameForHome = saved;

  const broadcastViews = useCallback((host: LanHost, next: GameState) => {
    for (const player of host.players) {
      if (player.seat > 0 && player.connected) {
        host.sendView(player.seat, view(next, player.seat));
      }
    }
    if (next.phase === 'game-over') {
      host.sendResult({ kind: 'over', winners: next.winners, scores: next.scores });
    }
  }, []);

  const commit = useCallback(
    (next: GameState, previous: GameState, actionMode: Mode, silent = false) => {
      stateRef.current = next;
      setHistory((items) => [...items, previous]);
      setState(next);
      setHint(null);
      setHintNote('');
      setSelectedPass([]);
      if (soundOn && !silent) {
        if (next.phase === 'hand-over' || next.phase === 'game-over') {
          chime(next.moonShooter !== null ? 'moon' : next.phase === 'game-over' ? 'win' : 'trick');
        } else if (next.trickNumber > previous.trickNumber) {
          chime('trick');
        } else if (next.playedCards.length > previous.playedCards.length) {
          chime('card');
        }
      }
      if (actionMode === 'ai' || actionMode === 'local') {
        if (next.phase === 'game-over') {
          clearSave();
          setSaved(null);
        } else {
          setSaved(saveGame({ state: next, mode: actionMode, level }));
        }
      }
      if (actionMode === 'lan-host') {
        const host = hostRef.current;
        if (host) broadcastViews(host, next);
      }
    },
    [broadcastViews, level, soundOn],
  );

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  useEffect(() => {
    if (mode !== 'local' || screen !== 'game') {
      return;
    }
    if (state.phase !== 'passing' && state.phase !== 'playing') return;
    setRevealedSeat((current) => (current === localActiveSeat ? current : null));
  }, [localActiveSeat, mode, screen, state.phase]);

  // Record a finished game exactly once, including a resumed finished position.
  useEffect(() => {
    if (screen !== 'game' || state.phase !== 'game-over' || isGuest || recordedRef.current) return;
    recordedRef.current = true;
    setRecord(
      recordResult(state, {
        mode: recordModeFor(mode),
        ...(mode === 'ai' ? { level } : {}),
      }),
    );
    clearSave();
    setSaved(null);
  }, [isGuest, level, mode, screen, state.phase]);

  const resetRound = useCallback(() => {
    setHistory([]);
    setHint(null);
    setHintNote('');
    setSelectedPass([]);
    setAiThinking(false);
    setRevealedSeat(null);
    recordedRef.current = false;
  }, []);

  const startLocal = useCallback(
    (nextMode: 'ai' | 'local') => {
      const next = setup(Math.random);
      stateRef.current = next;
      setMode(nextMode);
      setState(next);
      resetRound();
      setScreen('game');
      clearSave();
      setSaved(null);
      setLanError('');
    },
    [resetRound],
  );

  const beginSolo = useCallback(() => {
    setMode('ai');
    setScreen('setup');
  }, []);

  const goHome = useCallback(() => {
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
    guest?.close();
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    setGuestPlayers([]);
    setLanHost(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanError('');
    setLanBusy(false);
    setLanRole('hub');
    setMode('ai');
    setScreen('home');
    setRevealedSeat(null);
    setSelectedPass([]);
    setHint(null);
    setHintNote('');
    lanActiveRef.current = false;
    autoJoinRef.current = true;
    hostStartedRef.current = false;
    guestJoinSeqRef.current += 1;
    hostCreateSeqRef.current += 1;
  }, [guest]);

  const resume = useCallback(() => {
    if (!saved) return;
    stateRef.current = saved.state;
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    resetRound();
    setScreen('game');
    setSaved(saved);
  }, [resetRound, saved]);

  const undo = useCallback(() => {
    if (isLan || screen !== 'game' || history.length === 0) return;
    if (state.phase === 'game-over' || state.phase === 'hand-over') return;

    let index = history.length - 1;
    if (mode === 'ai') {
      while (index >= 0) {
        const candidate = history[index];
        const humanPass =
          candidate.phase === 'passing' && candidate.passSelections[0] === null;
        const humanTurn = candidate.phase === 'playing' && candidate.turn === 0;
        if (humanPass || humanTurn) break;
        index -= 1;
      }
      if (index < 0) return;
    }
    const previous = history[index];
    const nextHistory = history.slice(0, index);
    stateRef.current = previous;
    setState(previous);
    setHistory(nextHistory);
    setHint(null);
    setHintNote('');
    setSelectedPass([]);
    setRevealedSeat(null);
    recordedRef.current = false;
    const stored = saveGame({ state: previous, mode, level });
    setSaved(stored);
  }, [history, isLan, level, mode, screen, state.phase]);

  const showHint = useCallback(() => {
    if (isLan || privacyOpen || screen !== 'game') return;
    if (state.phase === 'passing') {
      if (!shownView.canPass) return;
      const result = hintFor(state, viewerSeat);
      if (!result?.cards) return;
      setSelectedPass(result.cards);
      setHintNote(tr(HINT_KEY[result.kind]));
      setToast(tr(HINT_KEY[result.kind]));
      if (soundOn) chime('click');
      return;
    }
    if (state.phase !== 'playing' || !shownView.canAct) return;
    const result = hintFor(state, viewerSeat);
    if (!result?.card) return;
    setHint(result.card);
    let reason = tr(HINT_KEY[result.kind], {
      name: result.threat !== undefined ? playerAt(result.threat) : '',
    });
    if (result.kind === 'pass' && result.cards) {
      setSelectedPass(result.cards);
      reason = tr('hintPass');
    }
    setHintNote(reason);
    setToast(reason);
    if (soundOn) chime('click');
  }, [isLan, playerAt, privacyOpen, screen, shownView.canAct, shownView.canPass, soundOn, state, tr, viewerSeat]);

  const togglePass = useCallback(
    (card: Card) => {
      if (screen !== 'game' || shownView.phase !== 'passing' || !shownView.canPass) return;
      if (selectedPass.includes(card)) {
        setSelectedPass((current) => current.filter((item) => item !== card));
      } else if (selectedPass.length < 3) {
        setSelectedPass((current) => [...current, card]);
      }
      if (soundOn) chime('click');
    },
    [screen, selectedPass, shownView.canPass, shownView.phase, soundOn],
  );

  const submitPass = useCallback(() => {
    if (selectedPass.length !== 3 || !shownView.canPass) return;
    if (isGuest) {
      if (!guest || !guestView) return;
      guest.sendIntent({
        type: 'pass',
        handNumber: guestView.handNumber,
        cards: selectedPass,
      });
      setGuestPending(true);
      setSelectedPass([]);
      setHint(null);
      setHintNote('');
      return;
    }
    const result = passCards(state, viewerSeat, selectedPass);
    if (!result.ok) return;
    commit(result.state, state, mode === 'lan-host' ? 'lan-host' : mode);
  }, [commit, guest, guestView, isGuest, mode, selectedPass, shownView.canPass, state, viewerSeat]);

  const actOnCard = useCallback(
    (card: Card) => {
      if (screen !== 'game') return;
      if (shownView.phase === 'passing') {
        togglePass(card);
        return;
      }
      if (shownView.phase !== 'playing' || !shownView.canAct) return;
      if (!shownView.legal.includes(card)) return;
      if (isGuest) {
        if (!guest || !guestView) return;
        guest.sendIntent({
          type: 'play',
          handNumber: guestView.handNumber,
          trickNumber: guestView.trickNumber,
          card,
        });
        setGuestPending(true);
        setHint(null);
        setHintNote('');
        return;
      }
      const result = playCard(state, viewerSeat, card);
      if (!result.ok) return;
      commit(result.state, state, mode === 'lan-host' ? 'lan-host' : mode);
    },
    [commit, guest, guestView, isGuest, mode, screen, shownView.canAct, shownView.legal, shownView.phase, state, togglePass, viewerSeat],
  );

  const nextHand = useCallback(() => {
    if (isGuest || state.phase !== 'hand-over') return;
    const next = nextHandState(state, Math.random);
    if (next === state) return;
    commit(next, state, mode === 'lan-host' ? 'lan-host' : mode);
  }, [commit, isGuest, mode, state]);

  const restart = useCallback(() => {
    if (isGuest) return;
    if (mode === 'lan-host') {
      const host = hostRef.current;
      if (!host) return;
      const next = setup(Math.random);
      stateRef.current = next;
      setState(next);
      resetRound();
      setLanError('');
      hostStartedRef.current = true;
      host.start();
      host.sendLobby();
      broadcastViews(host, next);
      return;
    }
    startLocal(mode === 'ai' ? 'ai' : 'local');
  }, [broadcastViews, isGuest, mode, resetRound, startLocal]);

  // AI seats act automatically in solo and on the LAN host.
  useEffect(() => {
    if (screen !== 'game' || mode === 'local' || mode === 'lan-guest') return;
    const aiSeats = [0, 1, 2, 3].filter((seat) => !humanSeats[seat]);
    if (aiSeats.length === 0) return;

    if (state.phase === 'passing') {
      const pending = aiSeats.filter((seat) => state.passSelections[seat] === null);
      if (pending.length === 0) return;
      let next = state;
      for (const seat of pending) {
        const cards = choosePass(next, seat, level);
        if (cards.length !== 3) continue;
        const result = passCards(next, seat, cards);
        if (result.ok) next = result.state;
      }
      if (next !== state) {
        commit(next, state, mode === 'lan-host' ? 'lan-host' : 'ai', true);
      }
      return;
    }

    if (state.phase !== 'playing' || !aiSeats.includes(state.turn)) {
      setAiThinking(false);
      return;
    }
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      setAiThinking(false);
      const card = chooseMove(state, state.turn, level);
      if (card < 0) return;
      const result = playCard(state, state.turn, card);
      if (!result.ok) return;
      commit(result.state, state, mode === 'lan-host' ? 'lan-host' : 'ai');
    }, 340);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, humanSeats, level, mode, screen, state]);

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
      if (screen !== 'game' || typing || privacyOpen) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'h') {
        event.preventDefault();
        showHint();
        return;
      }
      if (key === 'u') {
        event.preventDefault();
        undo();
        return;
      }
      const number = Number(event.key);
      if (Number.isInteger(number) && number >= 1 && number <= 9) {
        const card = shownView.hand[number - 1];
        if (card === undefined) return;
        event.preventDefault();
        actOnCard(card);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actOnCard, goHome, privacyOpen, screen, showHint, shownView.hand, undo]);

  const openLanHost = useCallback(async () => {
    if (lanBusy) return;
    const host = hostRef.current;
    hostRef.current = null;
    if (host) host.close();
    const seq = ++hostCreateSeqRef.current;
    setLanRole('host');
    setMode('lan-host');
    setScreen('lan');
    setLanBusy(true);
    setLanError('');
    setLanInfo(null);
    setLanHost(null);
    setLanPlayers([]);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
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
          broadcastViews(created, stateRef.current);
        }
      });
      created.onIntent((seat, intent) => {
        if (hostRef.current !== created) return;
        const value = intent as {
          type?: string;
          handNumber?: number;
          trickNumber?: number;
          cards?: Card[];
          card?: Card;
        } | null;
        if (!value) return;
        const current = stateRef.current;
        if (typeof value.handNumber === 'number' && value.handNumber !== current.handNumber) return;
        if (value.type === 'pass') {
          if (!Array.isArray(value.cards)) return;
          const result = passCards(current, seat, value.cards);
          if (!result.ok) return;
          commitRef.current(result.state, current, 'lan-host');
          return;
        }
        if (value.type === 'play') {
          if (typeof value.card !== 'number') return;
          if (
            typeof value.trickNumber === 'number' &&
            value.trickNumber !== current.trickNumber
          ) {
            return;
          }
          const result = playCard(current, seat, value.card);
          if (!result.ok) return;
          commitRef.current(result.state, current, 'lan-host');
        }
      });
      created.onClose(() => {
        if (hostRef.current !== created) return;
        hostRef.current = null;
        hostStartedRef.current = false;
        setLanHost(null);
        setLanPlayers([]);
        setLanError(t(lang, 'lanHostLost'));
        setLanRole('host');
        setScreen('lan');
      });
      const url = inviteUrl(info, code, code, t(lang, 'lanGuestTag'));
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        color: { dark: '#23352c', light: '#fffaf0' },
      });
      if (seq !== hostCreateSeqRef.current) {
        created.close();
        return;
      }
      setLanInvite(url);
      setLanQr(qr);
    } catch (error) {
      if (seq !== hostCreateSeqRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setLanError(lanErrorMessage(lang, message));
      hostRef.current?.close();
      hostRef.current = null;
      setLanHost(null);
      setLanPlayers([]);
    } finally {
      if (seq === hostCreateSeqRef.current) setLanBusy(false);
    }
  }, [broadcastViews, hostName, lang, lanBusy]);

  const startLanRound = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open') return;
    if (!host.players.some((player) => player.seat > 0 && player.connected)) return;
    const next = setup(Math.random);
    stateRef.current = next;
    setMode('lan-host');
    setState(next);
    resetRound();
    setLanError('');
    setScreen('game');
    hostStartedRef.current = true;
    host.start();
    host.sendLobby();
    broadcastViews(host, next);
  }, [broadcastViews, resetRound]);

  const joinGuest = useCallback(async () => {
    if (guestConnecting || guest) return;
    const name = guestName.trim();
    const room = (guestCode || guestRoom).trim();
    if (!name) {
      setLanError(t(lang, 'lanNameNeeded'));
      return;
    }
    if (!/^\d{4}$/.test(room)) {
      setLanError(t(lang, 'lanCodeNeeded'));
      return;
    }
    const seq = ++guestJoinSeqRef.current;
    setGuestConnecting(true);
    setLanError('');
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room,
        code: room,
        name,
      });
      if (seq !== guestJoinSeqRef.current) {
        joined.close();
        return;
      }
      autoJoinRef.current = true;
      lanActiveRef.current = true;
      setGuest(joined);
      setGuestView(null);
      setGuestPending(false);
      setGuestStarted(false);
      setGuestPlayers([]);
      setLanRole('guest');
      setScreen('lan');
      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        const next = payload as SeatView;
        if (!next || !Array.isArray(next.hand)) return;
        setGuestView(next);
        setGuestPending(false);
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
    } catch (error) {
      if (seq !== guestJoinSeqRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setLanError(lanErrorMessage(lang, message));
      lanActiveRef.current = false;
    } finally {
      if (seq === guestJoinSeqRef.current) setGuestConnecting(false);
    }
  }, [guest, guestCode, guestConnecting, guestName, guestRoom, lang]);

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
    if (!guestView) {
      lastGuestPlayedRef.current = 0;
      return;
    }
    const previous = lastGuestPlayedRef.current;
    lastGuestPlayedRef.current = guestView.playedCount;
    if (previous === 0 || guestView.playedCount <= previous || !soundOn) return;
    if (guestView.trickNumber > 0 && guestView.playedCount % 4 === 0) chime('trick');
    else chime('card');
  }, [guestView, soundOn]);

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
    if (!guestPending) return;
    const timer = window.setTimeout(() => setGuestPending(false), 2600);
    return () => window.clearTimeout(timer);
  }, [guestPending]);

  const modeLabel =
    mode === 'ai'
      ? t(lang, LEVEL_LABEL[level])
      : mode === 'local'
        ? tr('playHotseat')
        : mode === 'lan-host'
          ? tr('lanHostMode')
          : tr('lanGuestMode');

  let statusHeadline = tr('yourTurn');
  let statusDetail = '';
  if (shownView.phase === 'passing') {
    const direction =
      shownView.passDirection === 'left'
        ? tr('passLeft')
        : shownView.passDirection === 'right'
          ? tr('passRight')
          : shownView.passDirection === 'across'
            ? tr('passAcross')
            : tr('passHold');
    statusHeadline = shownView.passDirection === 'hold' ? tr('passingHold') : tr('passing', { direction });
    statusDetail = t(lang, 'handNo', { n: shownView.handNumber });
  } else if (shownView.phase === 'playing') {
    if (mode === 'local') {
      statusHeadline = t(lang, 'turnOf', { name: playerAt(shownView.turn) });
      statusDetail = t(lang, 'trickNo', { n: Math.min(13, shownView.trickNumber + 1) });
    } else if (shownView.turn === viewerSeat) {
      statusHeadline = tr('yourTurn');
      statusDetail = t(lang, 'trickNo', { n: Math.min(13, shownView.trickNumber + 1) });
    } else {
      statusHeadline = t(lang, 'turnOf', { name: playerAt(shownView.turn) });
      statusDetail = t(lang, 'trickNo', { n: Math.min(13, shownView.trickNumber + 1) });
    }
  } else if (shownView.phase === 'hand-over') {
    statusHeadline = tr('handOverTitle');
    statusDetail = t(lang, 'handNo', { n: shownView.handNumber });
  } else {
    statusHeadline = tr('gameOverTitle');
    statusDetail = t(lang, 'handNo', { n: shownView.handNumber });
  }

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div className="brand-block">
          <p className="eyebrow">
            {tr('brand')}
            <span className="eyebrow-series"><span className="eyebrow-sep"> · </span>{tr('series')}</span>
          </p>
          <h1>
            {tr('title')}
            <span className="title-pip">♥</span>
          </h1>
        </div>
        <div className="mast-actions">
          <button className="pill-button" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
          <button
            className="icon-pill"
            onClick={() => setSoundOn((value) => !value)}
            aria-label={soundOn ? tr('soundOn') : tr('soundOff')}
            title={soundOn ? tr('soundOn') : tr('soundOff')}
          >
            {soundOn ? '♪' : '♪̸'}
          </button>
          <button
            className="icon-pill"
            onClick={() => setMotionOn((value) => !value)}
            aria-label={motionOn ? tr('motionOn') : tr('motionOff')}
            title={motionOn ? tr('motionOn') : tr('motionOff')}
          >
            {motionOn ? '◒' : '◓'}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="menu">
            {savedGameForHome && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>
                  {savedGameForHome.mode === 'ai'
                    ? t(lang, LEVEL_LABEL[savedGameForHome.level])
                    : tr('playHotseat')}
                  {' · '}
                  {tr('saved')}
                </small>
              </button>
            )}
            <button className={savedGameForHome ? 'secondary wide' : 'primary wide'} onClick={beginSolo}>
              <span>{tr('playSolo')}</span>
              <small>{t(lang, LEVEL_LABEL[level])}</small>
            </button>
            <button className="secondary wide" onClick={() => startLocal('local')}>
              <span>{tr('playHotseat')}</span>
              <small>{tr('hotseatHint')}</small>
            </button>
            <button
              className="secondary wide lan-menu-button"
              onClick={() => {
                setLanRole('hub');
                setScreen('lan');
                setLanError('');
              }}
            >
              <span>{tr('playLan')}</span>
              <small>{tr('lanMenuHint')}</small>
            </button>
            <div className="menu-links">
              <button className="text-button" onClick={() => setScreen('rules')}>
                {tr('rules')} →
              </button>
              <button className="text-button" onClick={() => setScreen('stats')}>
                {tr('record')} →
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('games')}</span>
            <strong>{record.games}</strong>
            <span className="dot">·</span>
            <span>{tr('wins')} {record.wins.reduce((total, value) => total + value, 0)}</span>
            <span className="dot">·</span>
            <span>{tr('moons')} {record.moons}</span>
            <span className="record-note">{tr('recordNote')}</span>
          </div>
        </div>
        <HomeArt lang={lang} />
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell setup-shell">
      <button className="back" onClick={goHome}>← {tr('back')}</button>
      <div className="setup-layout">
        <section className="setup-main">
          <h2 className="screen-title">{tr('setupTitle')}</h2>
          <div className="level-grid">
            {LEVELS.map((item) => (
              <button
                key={item}
                className={`level-card ${level === item ? 'selected' : ''}`}
                onClick={() => setLevel(item)}
                aria-pressed={level === item}
              >
                <span className={`level-dot ${item}`} />
                <strong>{t(lang, LEVEL_LABEL[item])}</strong>
                <small>{t(lang, LEVEL_NOTE[item])}</small>
              </button>
            ))}
          </div>
          <div className="row-actions">
            <button className="primary" onClick={() => startLocal('ai')}>{tr('begin')}</button>
            <button className="ghost" onClick={goHome}>{tr('back')}</button>
          </div>
        </section>
        <div className="setup-art" aria-hidden="true">
          <div className="setup-poster">
            <span className="setup-poster-suit">♠</span>
            <div className="setup-fan">
              <span className="setup-fan-card sf-1"><PlayingCard card={26} lang={lang} decorative /></span>
              <span className="setup-fan-card sf-2"><CardBack /></span>
              <span className="setup-fan-card sf-3"><PlayingCard card={51} lang={lang} decorative /></span>
              <span className="setup-fan-card sf-4"><PlayingCard card={36} lang={lang} decorative /></span>
              <span className="setup-fan-card sf-5"><PlayingCard card={4} lang={lang} decorative /></span>
            </div>
            <span className="setup-poster-seal">♥</span>
          </div>
        </div>
      </div>
    </main>
  );

  const scoreRows = (scores: number[], points: number[] | null, winners: number[] = []) => (
    <div className="score-table">
      {[0, 1, 2, 3].map((seat) => (
        <div
          key={seat}
          className={`score-row ${winners.includes(seat) ? 'is-winner' : ''}`}
        >
          <span className="score-dot" style={{ background: seatColor(seat) }} />
          <span className="score-name">{playerAt(seat)}</span>
          {points && <span className="score-points">+{points[seat] ?? 0}</span>}
          <strong className="score-total">{scores[seat] ?? 0}</strong>
        </div>
      ))}
    </div>
  );

  const moonBanner =
    shownView.moonShooter !== null ? (
      <div className="moon-banner">
        <span className="moon-glyph">☾</span>
        <div>
          <strong>{tr('handOverMoon', { name: playerAt(shownView.moonShooter) })}</strong>
          <span>{tr('moonExplain')}</span>
        </div>
      </div>
    ) : null;

  const handOverlay = shownView.phase === 'hand-over' ? (
    <div className="result-overlay" role="dialog" aria-modal="true">
      <div className="result-card">
        <span className="result-kicker">{t(lang, 'handNo', { n: shownView.handNumber })}</span>
        <h2>{tr('handOverTitle')}</h2>
        {moonBanner}
        {shownView.handSummary && (
          <>
            <h3>{tr('handScore')}</h3>
            {scoreRows(shownView.handSummary.scores, shownView.handSummary.points)}
          </>
        )}
        {isGuest ? (
          <p className="wait-note">{tr('waitingHostNext')}</p>
        ) : (
          <button className="primary wide" onClick={nextHand}>{tr('nextHand')}</button>
        )}
      </div>
    </div>
  ) : null;

  const winnerNames = shownView.winners.map((seat) => playerAt(seat)).join(' · ');
  const gameOverlay = shownView.phase === 'game-over' ? (
    <div className="result-overlay" role="dialog" aria-modal="true">
      <div className="result-card game-over-card">
        <span className="result-kicker">{t(lang, 'handNo', { n: shownView.handNumber })}</span>
        <h2>{tr('gameOverTitle')}</h2>
        <p className="winner-line">
          {shownView.winners.length > 1
            ? tr('tieNames', { names: winnerNames })
            : tr('winnerName', { name: winnerNames })}
        </p>
        {moonBanner}
        <h3>{tr('finalScores')}</h3>
        {scoreRows(shownView.scores, null, shownView.winners)}
        {!isGuest && <p className="record-saved">{tr('recordSaved')}</p>}
        {isGuest ? (
          <p className="wait-note">{tr('waitingHostNext')}</p>
        ) : (
          <div className="result-actions">
            <button className="primary" onClick={restart}>{tr('playAgain')}</button>
            {mode === 'ai' && (
              <button className="secondary" onClick={() => setScreen('setup')}>{tr('changeLevel')}</button>
            )}
          </div>
        )}
      </div>
    </div>
  ) : null;

  const privacyScreen = (
    <div className="privacy-screen">
      <div className="privacy-card">
        <span className="privacy-mark" aria-hidden="true">♥</span>
        <span className="privacy-label">{t(lang, 'handNo', { n: state.handNumber })}</span>
        <h2>{tr('privacyTitle', { name: playerAt(localActiveSeat) })}</h2>
        <button className="primary privacy-button" onClick={() => setRevealedSeat(localActiveSeat)}>
          {tr('privacyShow')}
        </button>
        <button
          className="secondary privacy-undo"
          onClick={undo}
          disabled={history.length === 0 || state.phase === 'game-over' || state.phase === 'hand-over'}
        >
          {tr('undo')}
        </button>
      </div>
    </div>
  );

  const passBar =
    shownView.phase === 'passing' && shownView.passDirection !== 'hold' ? (
      <div className="pass-bar">
        <div className="pass-copy">
          <span className="pass-direction">
            {tr('passing', {
              direction:
                shownView.passDirection === 'left'
                  ? tr('passLeft')
                  : shownView.passDirection === 'right'
                    ? tr('passRight')
                    : tr('passAcross'),
            })}
          </span>
          <strong>{tr('passChosen', { n: selectedPass.length })}</strong>
        </div>
        {shownView.canPass ? (
          <div className="pass-actions">
            <button
              className="ghost"
              onClick={() => setSelectedPass([])}
              disabled={selectedPass.length === 0}
            >
              {tr('clearSelection')}
            </button>
            <button
              className="primary"
              onClick={submitPass}
              disabled={selectedPass.length !== 3}
            >
              {tr('passButton')}
            </button>
          </div>
        ) : (
          <span className="wait-note">{tr('waitingOthers')}</span>
        )}
      </div>
    ) : null;

  const gameScreen = (
    <main className="shell game-shell">
      <header className="game-top">
        <button className="back" onClick={goHome}>← {tr('home')}</button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
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
          <button
            className="icon-button"
            onClick={() => setMotionOn((value) => !value)}
            aria-pressed={motionOn}
            aria-label={motionOn ? tr('motionOn') : tr('motionOff')}
            title={motionOn ? tr('motionOn') : tr('motionOff')}
          >
            <span className="motion-glyph">{motionOn ? '◒' : '◓'}</span>
          </button>
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
        </div>
      </header>

      <div className="game-layout">
        <section className="board-column">
          <div className={`turn-bar ${shownView.phase === 'game-over' ? 'is-over' : ''}`} aria-live="polite">
            <span className={`turn-chip seat-${mathSeat(viewerSeat)}`}>
              {privacyOpen ? '♥' : (seatNames[viewerSeat] ?? '').trim().slice(0, 1)}
            </span>
            <div className="turn-copy">
              <strong>{statusHeadline}</strong>
              <p>{statusDetail}</p>
            </div>
            <span className="mode-chip">{modeLabel}</span>
            <span className="turn-round">{t(lang, 'handNo', { n: shownView.handNumber })}</span>
            {aiThinking && <span className="thinking" aria-hidden="true">…</span>}
          </div>

          {isLan && lanError && <p className="error game-error" role="alert">{lanError}</p>}

          {privacyOpen ? (
            privacyScreen
          ) : (
            <>
              <Table
                view={shownView}
                names={seatNames}
                humans={humanSeats}
                viewerSeat={viewerSeat}
                lang={lang}
                selected={selectedPass}
                hintCard={hint}
                onCard={actOnCard}
              />
              {passBar}
              {handOverlay}
              {gameOverlay}
            </>
          )}
        </section>

        <aside className="side">
          <section className="side-card score-card">
            <h3>{tr('scoreboard')}</h3>
            <div className="side-score-list">
              {[0, 1, 2, 3].map((seat) => (
                <div
                  key={seat}
                  className={`side-score-row ${shownView.turn === seat && shownView.phase === 'playing' ? 'is-turn' : ''} ${seat === viewerSeat ? 'is-viewer' : ''}`}
                >
                  <span className="score-dot" style={{ background: seatColor(seat) }} />
                  <span className="side-score-name">{playerAt(seat)}</span>
                  <span className="side-score-hand">
                    {shownView.handPoints[seat] > 0 ? `+${shownView.handPoints[seat]}` : ''}
                  </span>
                  <strong>{shownView.scores[seat]}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="side-card controls-card">
            <div className="side-actions">
              <button
                className="secondary"
                onClick={undo}
                disabled={history.length === 0 || isLan || privacyOpen || shownView.phase === 'game-over' || shownView.phase === 'hand-over'}
              >
                {tr('undo')}
              </button>
              <button
                className="secondary"
                onClick={showHint}
                disabled={isLan || privacyOpen || (shownView.phase !== 'passing' && shownView.phase !== 'playing') || (!shownView.canAct && !shownView.canPass)}
              >
                {tr('hint')}
              </button>
            </div>
            {hintNote && <p className="hint-note">{hintNote}</p>}
            {isLan && <p className="side-note">{tr('localOnly')}</p>}
            {!isLan && <p className="side-note">{tr('keyboardHint')}</p>}
          </section>

          <section className="side-card round-card">
            <h3>{t(lang, 'handNo', { n: shownView.handNumber })}</h3>
            <div className="round-lines">
              <span>{shownView.phase === 'playing' || shownView.phase === 'hand-over' || shownView.phase === 'game-over'
                ? t(lang, 'trickNo', { n: Math.min(13, shownView.trickNumber + (shownView.phase === 'playing' ? 1 : 0)) })
                : tr('waitingDeal')}</span>
              <span>{shownView.heartsBroken ? tr('heartsBroken') : tr('heartsClosed')}</span>
              <span>{shownView.playedCards.includes(QUEEN_SPADES) ? tr('queenPlayed') : tr('queenWaiting')}</span>
            </div>
          </section>

          {mode === 'lan-host' && (
            <section className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanCode')}</h3>
                <span className={`status-dot ${lanPlayers.some((player) => player.seat > 0 && player.connected) ? 'online' : ''}`} />
              </div>
              <div className="room-code">{lanCode || '—'}</div>
              <p>
                {lanPlayers.some((player) => player.seat > 0 && player.connected)
                  ? tr('lanReady')
                  : tr('lanWaiting')}
              </p>
              {lanPlayers
                .filter((player) => player.seat > 0 && player.connected)
                .map((player) => (
                  <p className="peer" key={player.seat}>
                    {player.name} · {t(lang, 'seatShort', { n: player.seat + 1 })}
                  </p>
                ))}
            </section>
          )}

          {isGuest && (
            <section className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanGuestMode')}</h3>
                <span className={`status-dot ${guestStarted ? 'online' : ''}`} />
              </div>
              <p>{guestPending ? tr('lanWaitingForHost') : guestStarted ? tr('lanConnected') : tr('lanWaitingHost')}</p>
              <p className="peer">{t(lang, 'seatShort', { n: (guestView?.seat ?? 0) + 1 })}</p>
            </section>
          )}

          <section className="side-card record-mini">
            <h3>{tr('record')}</h3>
            <p>{record.games} {tr('games')} · {record.wins.reduce((total, value) => total + value, 0)} {tr('wins')} · {record.moons} {tr('moons')}</p>
            {!isLan && (
              <button className="text-button" onClick={() => setScreen('stats')}>
                {tr('record')} →
              </button>
            )}
          </section>
        </aside>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
      <div className="sr-only" aria-live="polite">{tr('liveRegion')}</div>
    </main>
  );

  const lanPlayersOnline = lanPlayers.filter((player) => player.seat > 0 && player.connected).length;

  const lanScreen = (
    <main className={`shell ${lanRole === 'host' ? 'narrow-shell' : 'lan-shell'}`}>
      <button className="back" onClick={goHome}>← {tr('back')}</button>

      {lanRole === 'hub' && (
        <>
          <h2 className="screen-title">{tr('lanTitle')}</h2>
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
              {lanError && <p className="error" role="alert">{lanError}</p>}
            </section>
          </div>
          <p className="lan-footnote">{tr('lanStartHint')}</p>
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
                setLanRole('hub');
                setLanError('');
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
                  <span className={`status-pill ${lanPlayersOnline > 0 ? 'ready' : ''}`}>
                    {lanPlayersOnline > 0 ? tr('lanReady') : tr('lanWaiting')}
                  </span>
                </div>
                <div className="room-code big">{lanCode}</div>
                <p className="lan-help">{tr('lanHostCodeHelp')}</p>
                <div className="peer-list">
                  {[0, 1, 2, 3].map((seat) => {
                    const player = lanPlayers.find((item) => item.seat === seat);
                    const connected = seat === 0 || Boolean(player?.connected);
                    return (
                      <span key={seat} className={`peer-chip ${connected ? 'online' : ''}`}>
                        <span className="peer-mark" style={{ background: seatColor(seat) }}>
                          {seat + 1}
                        </span>
                        <span className="peer-name">
                          {connected ? player?.name || playerAt(seat) : tr('cpu')}
                        </span>
                        <small>
                          {seat === 0 ? tr('lanHostTag') : connected ? tr('lanGuestTag') : tr('cpu')}
                          {' · '}
                          {connected ? tr('lanOnline') : tr('lanOffline')}
                        </small>
                      </span>
                    );
                  })}
                </div>
                <button
                  className="primary wide"
                  onClick={startLanRound}
                  disabled={lanPlayersOnline === 0}
                >
                  {lanPlayersOnline > 0 ? tr('lanStart') : tr('lanNoGuests')}
                </button>
                <button className="secondary wide" onClick={copyInvite}>
                  {tr('lanCopy')}
                </button>
                <button className="text-button" onClick={goHome}>{tr('lanLeave')}</button>
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
          <h2 className="screen-title">{guest ? tr('lanGuestMode') : tr('lanJoin')}</h2>
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
                <CardBack />
              </div>
              <h3>{tr('lanConnected')}</h3>
              <p>{tr('lanWaitingHost')}</p>
              <div className="guest-meta">
                <span>{t(lang, 'lanRoom', { code: guestCode || guestRoom })}</span>
                <span>{t(lang, 'lanGuestSeat', { n: (guest.seat ?? 0) + 1 })}</span>
              </div>
              <button className="secondary wide" onClick={goHome}>{tr('lanLeave')}</button>
            </div>
          )}
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const statsScreen = (
    <main className="shell stats-shell">
      <button className="back" onClick={goHome}>← {tr('home')}</button>
      <h2 className="screen-title">{tr('recordTitle')}</h2>
      {record.games === 0 ? (
        <section className="empty-card">
          <span className="empty-mark" aria-hidden="true">♥ ♠ ♦ ♣</span>
          <p>{tr('recordEmpty')}</p>
          <button className="primary" onClick={beginSolo}>{tr('playSolo')}</button>
        </section>
      ) : (
        <>
          <section className="stats-top">
            <div className="stat-card total">
              <span>{tr('games')}</span>
              <strong>{record.games}</strong>
            </div>
            <div className="stat-card">
              <span>{tr('wins')}</span>
              <strong>{record.wins.reduce((total, value) => total + value, 0)}</strong>
            </div>
            <div className="stat-card">
              <span>{tr('bestScore')}</span>
              <strong>{record.bestScore ?? tr('noBest')}</strong>
            </div>
            <div className="stat-card">
              <span>{tr('moons')}</span>
              <strong>{record.moons}</strong>
            </div>
          </section>

          <section className="record-grid">
            <div className="record-card">
              <h3>{tr('seatWins')}</h3>
              <div className="share-bar" aria-hidden="true">
                {[0, 1, 2, 3].map((seat) => (
                  <span
                    key={seat}
                    className="share-seat"
                    style={{
                      width: `${record.games > 0 ? (record.wins[seat] / Math.max(1, record.wins.reduce((a, b) => a + b, 0))) * 100 : 0}%`,
                      background: seatColor(seat),
                    }}
                  />
                ))}
              </div>
              <ul className="share-legend">
                {[0, 1, 2, 3].map((seat) => (
                  <li key={seat}>
                    <i style={{ background: seatColor(seat) }} />
                    {t(lang, 'seatShort', { n: seat + 1 })}
                    <strong>{record.wins[seat]}</strong>
                  </li>
                ))}
              </ul>
            </div>

            <div className="record-card modes-card">
              <h3>{tr('byMode')}</h3>
              <div className="mode-list">
                {(['ai', 'local', 'lan'] as const).map((value) => (
                  <div className="mode-row" key={value}>
                    <span>{t(lang, value === 'ai' ? 'modeAi' : value === 'local' ? 'modeLocal' : 'modeLan')}</span>
                    <div className="mode-bar">
                      <i style={{ width: record.games > 0 ? `${(record.byMode[value] / record.games) * 100}%` : '0%' }} />
                    </div>
                    <strong>{record.byMode[value]}</strong>
                  </div>
                ))}
              </div>
              <p className="clear-note">{tr('recordNote')}</p>
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
          </section>

          <section className="recent-card">
            <h3>{tr('recentGames')}</h3>
            {record.recent.length === 0 ? (
              <p className="recent-empty">{tr('recentEmpty')}</p>
            ) : (
              <ol className="recent-list">
                {record.recent.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="recent-row">
                    <span className="recent-seat" style={{ background: seatColor(entry.winnerSeat) }}>
                      {entry.winnerSeat + 1}
                    </span>
                    <div className="recent-main">
                      <strong>{t(lang, 'seatShort', { n: entry.winnerSeat + 1 })}</strong>
                      <span>
                        {entry.scores.join(' · ')}
                      </span>
                    </div>
                    <span className="recent-meta">
                      {t(lang, entry.mode === 'ai' ? 'modeAi' : entry.mode === 'local' ? 'modeLocal' : 'modeLan')}
                      {entry.level ? ` · ${t(lang, LEVEL_LABEL[entry.level])}` : ''}
                      {' · '}
                      {t(lang, 'handsCount', { n: entry.hands })}
                    </span>
                    <time dateTime={new Date(entry.at).toISOString()}>{formatDate(entry.at, lang)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <ol className="rules-list">
        <li>{tr('ruleDeal')}</li>
        <li>{tr('rulePass')}</li>
        <li>{tr('ruleFirst')}</li>
        <li>{tr('ruleFollow')}</li>
        <li>{tr('ruleHearts')}</li>
        <li>{tr('rulePoints')}</li>
        <li>{tr('ruleMoon')}</li>
        <li>{tr('ruleEnd')}</li>
      </ol>
      <section className="rules-extra">
        <h3>{tr('rulesPrivacyTitle')}</h3>
        <p>{tr('ruleLan')}</p>
      </section>
      <button className="primary" onClick={goHome}>{tr('close')}</button>
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}

function mathSeat(seat: number): number {
  return ((seat % 4) + 4) % 4;
}
