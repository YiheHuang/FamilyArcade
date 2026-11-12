import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import {
  LanGuest,
  LanHost,
  guestParams,
  newRoomCode,
  type LanPublicPeer,
} from '@family-arcade/lan';
import { chooseFlip, suggest, type AiLevel } from './ai/ai';
import { Board, type BoardTile } from './components/Board';
import { PLAYER_COLORS } from './desserts';
import {
  flip,
  flipForSeat,
  resolve,
  setup,
  view,
  type DeckSize,
  type GameState,
  type SeatView,
} from './game/pair-up';
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
  topWinners,
  type FamilyRecord,
  type SavedGame,
} from './storage';
import { chime } from './sound';
import { initial } from './ui';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'stats' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';

/** Automated checks and screenshot runs can shorten the two staged delays. */
const FAST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('fast');
const RESOLVE_DELAY = FAST ? 130 : 980;
const AI_DELAY = FAST ? 90 : 520;

const LEVELS: { id: AiLevel; label: MessageKey; hint: MessageKey }[] = [
  { id: 'companion', label: 'companion', hint: 'companionHint' },
  { id: 'easy', label: 'easy', hint: 'easyHint' },
  { id: 'normal', label: 'normal', hint: 'normalHint' },
  { id: 'hard', label: 'hard', hint: 'hardHint' },
];

const PREVIEW: BoardTile[] = (() => {
  const tiles: BoardTile[] = Array.from({ length: 16 }, () => ({ value: null, matchedBy: null }));
  const matched: [number, number, number][] = [
    [0, 0, 0],
    [1, 0, 0],
    [4, 1, 1],
    [5, 1, 1],
    [8, 2, 0],
    [9, 2, 0],
    [12, 3, 1],
    [13, 3, 1],
  ];
  for (const [index, value, owner] of matched) tiles[index] = { value, matchedBy: owner };
  tiles[2] = { value: 4, matchedBy: null };
  tiles[3] = { value: 5, matchedBy: null };
  return tiles;
})();

function defaultNames(kind: 'ai' | 'local', count: number, lang: Lang): string[] {
  if (kind === 'ai') {
    return [lang === 'zh' ? '你' : 'You', ...Array.from({ length: count - 1 }, (_, i) => `AI ${i + 1}`)];
  }
  return Array.from({ length: count }, (_, i) => `P${i + 1}`);
}

function nameAt(names: readonly string[], seat: number): string {
  return names[seat]?.trim() || `P${seat + 1}`;
}

function soundFor(next: GameState): 'flip' | 'match' | 'miss' | undefined {
  if (next.status === 'finished') return undefined;
  if (next.phase === 'resolve') return 'miss';
  if (next.flipped.length === 1) return 'flip';
  if (next.lastEvent?.kind === 'match') return 'match';
  return 'flip';
}

function DeckMini({ size }: { size: DeckSize }) {
  const count = size * size;
  return (
    <span className="deck-mini" style={{ '--n': size } as CSSProperties} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

export default function App() {
  const initialGuest = guestParams();
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (initialGuest ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (initialGuest ? 'lan-guest' : 'ai'));
  const [state, setState] = useState<GameState>(() => setup({ size: 4, players: 2 }, Math.random));
  const [names, setNames] = useState<string[]>(() => defaultNames('ai', 2, detectLang()));
  const [levels, setLevels] = useState<AiLevel[]>(['normal', 'normal']);
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<number[]>([]);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.pair-up.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [recorded, setRecorded] = useState(false);

  const [setupKind, setSetupKind] = useState<'ai' | 'local'>('ai');
  const [setupPlayers, setSetupPlayers] = useState(2);
  const [setupSize, setSetupSize] = useState<DeckSize>(4);
  const [setupLevel, setSetupLevel] = useState<AiLevel>('normal');
  const [setupNames, setSetupNames] = useState<string[]>(() => defaultNames('ai', 2, detectLang()));

  const [guestRoom, setGuestRoom] = useState(() => initialGuest?.room ?? '');
  const [guestCode, setGuestCode] = useState(() => initialGuest?.code ?? '');
  const [guestName, setGuestName] = useState(() => initialGuest?.name ?? '');
  const [guestSeat, setGuestSeat] = useState(-1);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestLobby, setGuestLobby] = useState<LanPublicPeer[]>([]);
  const [guestConnecting, setGuestConnecting] = useState(false);

  const [lanSetupPlayers, setLanSetupPlayers] = useState(2);
  const [lanSetupSize, setLanSetupSize] = useState<DeckSize>(4);
  const [lanHostName, setLanHostName] = useState(() =>
    detectLang() === 'zh' ? '主机' : 'Host',
  );
  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [lanJoinOpen, setLanJoinOpen] = useState(false);

  const stateRef = useRef(state);
  const modeRef = useRef(mode);
  const soundRef = useRef(soundOn);
  const aiThinkingRef = useRef(aiThinking);
  const historyRef = useRef(history);
  const hostRef = useRef<LanHost | null>(null);
  const guestRef = useRef<LanGuest | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);
  useEffect(() => {
    aiThinkingRef.current = aiThinking;
  }, [aiThinking]);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.pair-up.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (screen === 'home') setSaved(loadSave());
    window.scrollTo(0, 0);
  }, [screen]);

  const broadcast = useCallback((next: GameState) => {
    const host = hostRef.current;
    if (!host) return;
    for (let seat = 1; seat < next.playerCount; seat++) {
      host.sendView(seat, view(next, seat));
    }
    if (next.status === 'finished') {
      host.sendResult({ status: next.status, winner: next.winner, ties: next.ties });
    }
  }, []);

  const applyAction = useCallback(
    (next: GameState, previous: GameState, sound?: 'flip' | 'match' | 'miss') => {
      setHistory((items) => [...items.slice(-119), previous]);
      setState(next);
      setHint([]);
      if (soundRef.current) {
        if (next.status === 'finished') chime(next.winner === null ? 'tie' : 'win');
        else if (sound) chime(sound);
      }
      if (modeRef.current === 'lan-host') broadcast(next);
    },
    [broadcast],
  );

  const settle = useCallback(
    (next: GameState) => {
      setState(next);
      setHint([]);
      if (modeRef.current === 'lan-host') broadcast(next);
    },
    [broadcast],
  );

  // Autosave local and solo games after every action.
  useEffect(() => {
    if (screen !== 'game') return;
    if (mode !== 'ai' && mode !== 'local') return;
    if (state.status === 'playing') {
      saveGame({ mode, state, names, levels });
    }
  }, [screen, mode, state, names, levels]);

  // Record each finished local/solo/host game exactly once.
  useEffect(() => {
    if (screen !== 'game' || state.status !== 'finished' || recorded) return;
    setRecorded(true);
    clearSave();
    setSaved(null);
    if (mode === 'lan-guest') return;
    const recordMode = mode === 'ai' ? 'ai' : mode === 'local' ? 'local' : 'lan-host';
    setRecord(recordResult(state, names, recordMode));
  }, [screen, state, recorded, mode, names]);

  // Turn two mismatched cards back after a short look.
  useEffect(() => {
    if (screen !== 'game' || mode === 'lan-guest') return;
    if (state.status !== 'playing' || state.phase !== 'resolve') return;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.phase !== 'resolve' || current.status !== 'playing') return;
      settle(resolve(current));
    }, RESOLVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [screen, mode, state.phase, state.status, settle]);

  // AI seats take one flip at a time, using the injected RNG path.
  useEffect(() => {
    if (screen !== 'game' || mode !== 'ai') {
      setAiThinking(false);
      return;
    }
    if (state.status !== 'playing' || state.phase !== 'choose') {
      setAiThinking(false);
      return;
    }
    const seat = state.turn;
    if (seat === 0) {
      setAiThinking(false);
      return;
    }
    const level = levels[seat] ?? 'normal';
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (
        current.status !== 'playing' ||
        current.phase !== 'choose' ||
        current.turn !== seat
      ) {
        return;
      }
      const move = chooseFlip(current, level, Math.random);
      setAiThinking(false);
      if (move < 0) return;
      const result = flip(current, move);
      if (!result.ok) return;
      applyAction(result.state, current, soundFor(result.state));
    }, AI_DELAY);
    return () => window.clearTimeout(timer);
  }, [screen, mode, state, levels, applyAction]);

  const closeLan = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanBusy(false);
    guestRef.current?.close();
    guestRef.current = null;
    setGuestView(null);
    setGuestStarted(false);
    setGuestConnecting(false);
    setGuestSeat(-1);
    setGuestLobby([]);
    setGuestRoom('');
    setLanError('');
  }, []);

  const goHome = useCallback(() => {
    closeLan();
    setHint([]);
    setScreen('home');
    setSaved(loadSave());
  }, [closeLan]);

  const flipAt = useCallback(
    (index: number) => {
      if (mode === 'lan-guest') {
        if (guestView?.canFlip && guestView.tiles[index]?.value === null) {
          guestRef.current?.sendIntent({ type: 'flip', index });
        }
        return;
      }
      const current = stateRef.current;
      if (current.status !== 'playing' || current.phase !== 'choose') return;
      if (mode === 'ai' && (current.turn !== 0 || aiThinkingRef.current)) return;
      const result = mode === 'lan-host' ? flipForSeat(current, 0, index) : flip(current, index);
      if (!result.ok) return;
      applyAction(result.state, current, soundFor(result.state));
    },
    [applyAction, guestView, mode],
  );

  const undo = useCallback(() => {
    if (modeRef.current === 'lan-guest') return;
    const current = stateRef.current;
    if (current.status !== 'playing') return;
    const items = [...historyRef.current];
    let target = items.pop();
    if (modeRef.current === 'ai') {
      while (target && !(target.turn === 0 && target.phase === 'choose' && target.flipped.length === 0)) {
        target = items.pop();
      }
    }
    if (!target) return;
    historyRef.current = items;
    setHistory(items);
    setState(target);
    setHint([]);
    setRecorded(false);
    if (modeRef.current === 'lan-host') broadcast(target);
  }, [broadcast]);

  const showHint = useCallback(() => {
    if (modeRef.current === 'lan-guest') {
      setToast(tr('hintDisabledGuest'));
      return;
    }
    const current = stateRef.current;
    if (current.status !== 'playing' || current.phase === 'resolve') return;
    if ((modeRef.current === 'ai' || modeRef.current === 'lan-host') && current.turn !== 0) return;
    const next = suggest(current, Math.random);
    if (!next) return;
    setHint(next.tiles);
    setToast(next.reason === 'pair' ? tr('hintPair') : tr('hintExplore'));
    if (soundRef.current) chime('hint');
  }, [tr]);

  const newDeal = useCallback(() => {
    const current = stateRef.current;
    const next = setup({ size: current.size, players: current.playerCount }, Math.random);
    window.scrollTo(0, 0);
    setState(next);
    setHistory([]);
    historyRef.current = [];
    setHint([]);
    setRecorded(false);
    setSaved(null);
    if (modeRef.current === 'lan-host') broadcast(next);
  }, [broadcast]);

  const openSetup = (kind: 'ai' | 'local') => {
    setSetupKind(kind);
    setSetupPlayers(2);
    setSetupSize(4);
    setSetupNames(defaultNames(kind, 2, lang));
    setScreen('setup');
  };

  const changeSetupPlayers = (count: number) => {
    setSetupPlayers(count);
    setSetupNames((previous) => {
      const fallback = defaultNames(setupKind, count, lang);
      return Array.from({ length: count }, (_, index) => previous[index] ?? fallback[index]);
    });
  };

  const startLocal = () => {
    const count = setupPlayers;
    const fallback = defaultNames(setupKind, count, lang);
    const cleanNames = Array.from({ length: count }, (_, index) =>
      (setupNames[index] ?? fallback[index]).trim() || fallback[index],
    );
    const next = setup({ size: setupSize, players: count }, Math.random);
    setMode(setupKind);
    setState(next);
    setNames(cleanNames);
    setLevels(setupKind === 'ai' ? Array.from({ length: count }, () => setupLevel) : []);
    setHistory([]);
    historyRef.current = [];
    setHint([]);
    setRecorded(false);
    setSaved(null);
    clearSave();
    setScreen('game');
  };

  const resume = () => {
    const game = saved ?? loadSave();
    if (!game) return;
    setMode(game.mode);
    setState(game.state);
    setNames(game.names);
    setLevels(game.levels);
    setHistory([]);
    historyRef.current = [];
    setHint([]);
    setRecorded(game.state.status === 'finished');
    setSaved(null);
    setScreen('game');
  };

  const openLanHost = async () => {
    setLanBusy(true);
    setLanError('');
    try {
      const info = await startLanServer();
      setLanInfo(info);
      const code = newRoomCode();
      const room = `pair-up-${code}`;
      const host = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room,
        code,
        name: lanHostName.trim() || tr('hostLabel'),
        maxPlayers: lanSetupPlayers,
      });
      hostRef.current = host;
      setLanHost(host);
      setLanCode(code);
      host.onChange((players) => {
        setLanPlayers(players);
        host.sendLobby();
      });
      host.onIntent((seat, intent) => {
        const payload = intent as { type?: string; index?: number } | null;
        if (!payload || (payload.type && payload.type !== 'flip')) return;
        const current = stateRef.current;
        if (current.status !== 'playing' || current.phase !== 'choose') return;
        const result = flipForSeat(current, seat, Number(payload.index));
        if (!result.ok) return;
        applyAction(result.state, current, soundFor(result.state));
      });
      host.onClose(() => setLanError(tr('lanClosed')));
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      try {
        setLanQr(
          await QRCode.toDataURL(url, {
            margin: 1,
            width: 360,
            color: { dark: '#3d2a22', light: '#fff8ec' },
          }),
        );
      } catch {
        setLanQr('');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const relayMissing = /failed|timed out|closed|websocket/i.test(message);
      setLanError(relayMissing ? tr('lanNeedRelay') : message);
      hostRef.current?.close();
      hostRef.current = null;
      setLanHost(null);
    } finally {
      setLanBusy(false);
    }
  };

  const startLan = () => {
    const host = hostRef.current;
    if (!host) return;
    const connected = lanPlayers.filter((player) => player.connected).length;
    if (connected < lanSetupPlayers) return;
    const seatNames = Array.from({ length: lanSetupPlayers }, (_, seat) => {
      const player = lanPlayers.find((item) => item.seat === seat);
      return player?.name?.trim() || `P${seat + 1}`;
    });
    const next = setup({ size: lanSetupSize, players: lanSetupPlayers }, Math.random);
    setMode('lan-host');
    setState(next);
    setNames(seatNames);
    setLevels([]);
    setHistory([]);
    historyRef.current = [];
    setHint([]);
    setRecorded(false);
    setScreen('game');
    host.start();
    for (let seat = 1; seat < lanSetupPlayers; seat++) host.sendView(seat, view(next, seat));
  };

  const joinGuest = async () => {
    const code = guestCode.trim();
    const room = guestRoom || (code ? `pair-up-${code}` : '');
    if (!room || !guestName.trim()) return;
    setGuestConnecting(true);
    setLanError('');
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room,
        code,
        name: guestName.trim(),
      });
      guestRef.current = joined;
      setGuestRoom(room);
      setMode('lan-guest');
      setGuestSeat(joined.seat);
      setLanCode(joined.code || code);
      joined.onView((payload) => setGuestView(payload as SeatView));
      joined.onStart((players) => {
        setGuestLobby(players);
        setNames(players.map((player) => player.name));
        setGuestStarted(true);
        setScreen('game');
      });
      joined.onPlayers((players) => setGuestLobby(players));
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? tr('lanFull') : tr('lanWrong'));
      });
      setLanError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLanError(message.includes('room-full') ? tr('lanFull') : message.includes('wrong-code') ? tr('lanWrong') : tr('lanDisconnected'));
    } finally {
      setGuestConnecting(false);
    }
  };

  const showGuestPanel = mode === 'lan-guest' || Boolean(guestRoom);
  const displaySource = mode === 'lan-guest' ? guestView : null;
  const localView = mode === 'lan-guest' ? null : view(state, 0);
  const displaySize = displaySource?.size ?? localView?.size ?? 4;
  const displayTiles = displaySource?.tiles ?? localView?.tiles ?? [];
  const displayFlipped = displaySource?.flipped ?? state.flipped;
  const displayPlayerCount = displaySource?.playerCount ?? state.playerCount;
  const displayScores = displaySource?.scores ?? state.scores;
  const displayTurn = displaySource?.turn ?? state.turn;
  const displayPhase = displaySource?.phase ?? state.phase;
  const displayStatus = displaySource?.status ?? state.status;
  const displayWinner = displaySource?.winner ?? state.winner;
  const displayTies = displaySource?.ties ?? state.ties;
  const displayLastEvent = displaySource?.lastEvent ?? state.lastEvent;
  const activeNames = Array.from({ length: displayPlayerCount }, (_, seat) => nameAt(names, seat));
  const mySeat = mode === 'lan-guest' ? displaySource?.seat ?? guestSeat : 0;
  const isLocal = mode === 'local';
  const isMyTurn = !isLocal && displayTurn === mySeat;
  const guestReady = mode !== 'lan-guest' || guestStarted;

  const canAct =
    displayStatus === 'playing' &&
    displayPhase === 'choose' &&
    guestReady &&
    (mode === 'lan-guest'
      ? Boolean(displaySource?.canFlip)
      : mode === 'ai'
        ? displayTurn === 0 && !aiThinking
        : mode === 'lan-host'
          ? displayTurn === 0
          : true);

  const hintDisabled =
    displayStatus !== 'playing' ||
    displayPhase === 'resolve' ||
    mode === 'lan-guest' ||
    ((mode === 'ai' || mode === 'lan-host') && displayTurn !== 0) ||
    aiThinking;

  const turnName = nameAt(activeNames, displayTurn);
  const actorCanSeePrompt = isLocal || isMyTurn;

  const gamePrompt = (() => {
    if (mode === 'lan-guest' && !guestStarted) return tr('lanWaitingHost');
    if (displayStatus === 'finished') return tr('resultSub');
    if (displayPhase === 'resolve') return tr('missTurn');
    if (displayFlipped.length === 1) {
      return actorCanSeePrompt ? tr('chooseSecond') : tr('waitingTurn', { name: turnName });
    }
    if (displayLastEvent?.kind === 'match' && displayLastEvent.seat === displayTurn) {
      return tr('matchGo');
    }
    return actorCanSeePrompt ? tr('pairPrompt') : tr('waitingTurn', { name: turnName });
  })();

  const resultTitle =
    displayStatus === 'finished'
      ? displayWinner !== null
        ? tr('resultWin', { name: nameAt(activeNames, displayWinner) })
        : tr('resultTie', {
            names: displayTies.map((seat) => nameAt(activeNames, seat)).join(lang === 'zh' ? '、' : ' · '),
          })
      : '';
  const bestScore = displayScores.length > 0 ? Math.max(...displayScores) : 0;

  const keyboardHandler = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === 'Escape') {
        goHome();
        return;
      }
      if (screen !== 'game') return;
      const key = event.key.toLowerCase();
      if (key === 'h') {
        event.preventDefault();
        showHint();
      } else if (key === 'u') {
        event.preventDefault();
        undo();
      }
    },
    [goHome, screen, showHint, undo],
  );

  useEffect(() => {
    window.addEventListener('keydown', keyboardHandler);
    return () => window.removeEventListener('keydown', keyboardHandler);
  }, [keyboardHandler]);

  const guestLobbyConnected = guestLobby.filter((player) => player.connected).length;
  const hostConnected = lanPlayers.filter((player) => player.connected).length;

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('table')}</p>
          <h1>{tr('title')}</h1>
          <p className="subtitle">{tr('subtitle')}</p>
        </div>
        <div className="mast-actions">
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
          <button
            className="ghost"
            onClick={() => setSoundOn((value) => !value)}
            aria-label={tr('soundToggle')}
          >
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-board" aria-hidden="true">
          <Board
            tiles={PREVIEW}
            size={4}
            flipped={[2, 3]}
            hint={[]}
            disabled
            onFlip={() => undefined}
            names={['A', 'B']}
            lang={lang}
            label={tr('title')}
          />
          <div className="hero-stamp">
            <span>27</span>
            <small>TABLE</small>
          </div>
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>{tr('saved')}</small>
              </button>
            )}
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={() => openSetup('ai')}>
              <span>{tr('playAi')}</span>
              <small>{tr('setupLedeAi')}</small>
            </button>
            <button className="secondary wide" onClick={() => openSetup('local')}>
              <span>{tr('playLocal')}</span>
              <small>{tr('setupLedeLocal')}</small>
            </button>
            <button className="secondary wide" onClick={() => { setLanError(''); setScreen('lan'); }}>
              <span>{tr('playLan')}</span>
              <small>{tr('lanLede')}</small>
            </button>
            <div className="menu-links">
              <button className="text-button" onClick={() => setScreen('rules')}>
                {tr('rules')} →
              </button>
              <button className="text-button" onClick={() => setScreen('stats')}>
                {tr('stats')} →
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('recordShort')}</span>
            {record.games === 0 ? (
              <span>{tr('noRecordShort')}</span>
            ) : (
              <>
                <strong>{record.games}</strong>
                <span>{tr(record.games === 1 ? 'gameOne' : 'games')}</span>
                <span className="dot">·</span>
                <span>{record.soloHumanWins} {tr('soloWinsShort')}</span>
                <span className="dot">·</span>
                <span>{record.aiWins} {tr('aiWinsShort')}</span>
                <span className="dot">·</span>
                <span>{record.ties} {tr('tiesShort')}</span>
              </>
            )}
          </div>
        </div>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">
        {setupKind === 'ai' ? tr('setupAiTitle') : tr('setupLocalTitle')}
      </h2>
      <p className="lede">{setupKind === 'ai' ? tr('setupLedeAi') : tr('setupLedeLocal')}</p>

      <section className="setup-block">
        <div className="setup-label">
          <span className="label">{tr('players')}</span>
          <small>{setupKind === 'ai' ? tr('soloTable', { n: setupPlayers - 1 }) : tr('setupHint')}</small>
        </div>
        <div className="chip-row">
          {[2, 3, 4, 5, 6].map((count) => (
            <button
              key={count}
              className={`picker ${setupPlayers === count ? 'selected' : ''}`}
              onClick={() => changeSetupPlayers(count)}
              aria-pressed={setupPlayers === count}
            >
              {count}
            </button>
          ))}
        </div>
      </section>

      <section className="setup-block">
        <div className="setup-label">
          <span className="label">{tr('deck')}</span>
          <small>{tr('deckHint')}</small>
        </div>
        <div className="choice-grid two">
          {([4, 6] as DeckSize[]).map((size) => (
            <button
              key={size}
              className={`choice-card ${setupSize === size ? 'selected' : ''}`}
              onClick={() => setSetupSize(size)}
              aria-pressed={setupSize === size}
            >
              <DeckMini size={size} />
              <span>
                <strong>{size === 4 ? tr('deck4') : tr('deck6')}</strong>
                <small>{tr('pairCount', { n: size === 4 ? 8 : 18 })}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      {setupKind === 'ai' && (
        <section className="setup-block">
          <div className="setup-label">
            <span className="label">{tr('level')}</span>
            <small>{tr('aiSeats', { n: setupPlayers - 1 })}</small>
          </div>
          <div className="level-grid">
            {LEVELS.map((item) => (
              <button
                key={item.id}
                className={`level-card ${setupLevel === item.id ? 'selected' : ''}`}
                onClick={() => setSetupLevel(item.id)}
                aria-pressed={setupLevel === item.id}
              >
                <span className={`level-dot ${item.id}`} />
                <strong>{tr(item.label)}</strong>
                <small>{tr(item.hint)}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="setup-block">
        <div className="setup-label">
          <span className="label">{setupKind === 'ai' ? tr('yourName') : tr('names')}</span>
          <small>{setupKind === 'ai' ? tr('againstAi', { level: tr(LEVELS.find((item) => item.id === setupLevel)?.label ?? 'normal') }) : tr('namesHint')}</small>
        </div>
        {setupKind === 'ai' ? (
          <>
            <label className="name-input single">
              <span>{tr('yourName')}</span>
              <input
                value={setupNames[0] ?? ''}
                maxLength={18}
                onChange={(event) =>
                  setSetupNames((previous) => [event.target.value, ...previous.slice(1)])
                }
              />
            </label>
            <div className="ai-list">
              {Array.from({ length: setupPlayers - 1 }, (_, index) => (
                <span key={index} className="ai-pill">
                  <i style={{ background: PLAYER_COLORS[(index + 1) % PLAYER_COLORS.length] }} />
                  AI {index + 1} · {tr(LEVELS.find((item) => item.id === setupLevel)?.label ?? 'normal')}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="name-grid">
            {Array.from({ length: setupPlayers }, (_, index) => (
              <label key={index} className="name-input">
                <span>
                  <i style={{ background: PLAYER_COLORS[index % PLAYER_COLORS.length] }} />
                  {tr('nameSeat', { n: index + 1 })}
                </span>
                <input
                  value={setupNames[index] ?? ''}
                  maxLength={18}
                  onChange={(event) =>
                    setSetupNames((previous) => {
                      const next = [...previous];
                      next[index] = event.target.value;
                      return next;
                    })
                  }
                />
              </label>
            ))}
          </div>
        )}
      </section>

      <div className="row-actions">
        <button className="primary" onClick={startLocal}>{tr('begin')}</button>
        <button className="ghost" onClick={() => setScreen('home')}>{tr('back')}</button>
      </div>
    </main>
  );

  const gameScreen = (
    <main className="shell game-shell">
      <header className="game-top">
        <button className="back" onClick={goHome}>← {tr('home')}</button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>
            {mode === 'ai'
              ? tr('againstAi', {
                  level: tr(LEVELS.find((item) => item.id === (levels[0] ?? 'normal'))?.label ?? 'normal'),
                })
              : mode === 'local'
                ? tr('hotSeatLabel')
                : mode === 'lan-host'
                  ? `${tr('lanLabel')} · ${tr('hostLabel')}`
                  : `${tr('lanLabel')} · ${tr('guestLabel')}`}
          </span>
        </div>
        <div className="game-top-actions">
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
          <button
            className="ghost"
            onClick={() => setSoundOn((value) => !value)}
            aria-label={tr('soundToggle')}
          >
            {soundOn ? '♪' : '♪̸'}
          </button>
        </div>
      </header>

      <div className="players-strip" role="list">
        {Array.from({ length: displayPlayerCount }, (_, seat) => {
          const name = activeNames[seat];
          const isWinner =
            displayStatus === 'finished' &&
            (displayWinner === seat || displayTies.includes(seat));
          return (
            <div
              key={seat}
              role="listitem"
              className={`player-chip ${displayTurn === seat && displayStatus === 'playing' ? 'current' : ''} ${isWinner ? 'winner' : ''}`}
              style={{ '--pc': PLAYER_COLORS[seat % PLAYER_COLORS.length] } as CSSProperties}
            >
              <span className="chip-initial">{initial(name)}</span>
              <span className="chip-name">{name}</span>
              <strong>{displayScores[seat] ?? 0}</strong>
            </div>
          );
        })}
      </div>

      <div className="game-layout">
        <section className="board-wrap">
          <div className="turn-bar">
            <span
              className="turn-chip"
              style={{ '--pc': PLAYER_COLORS[displayTurn % PLAYER_COLORS.length] } as CSSProperties}
            >
              {initial(turnName)}
            </span>
            <div>
              <strong>{isMyTurn ? tr('yourTurn') : isLocal ? tr('turnOf', { name: turnName }) : tr('turnOf', { name: turnName })}</strong>
              <p>{gamePrompt}</p>
            </div>
            {aiThinking && <span className="thinking" aria-live="polite">{tr('thinking')}</span>}
          </div>

          <Board
            tiles={displayTiles}
            size={displaySize}
            flipped={displayFlipped}
            hint={hint}
            disabled={!canAct}
            onFlip={flipAt}
            names={activeNames}
            lang={lang}
            label={`${tr('title')} · ${displaySize} × ${displaySize}`}
          />
          <div className="board-meta">
            <span>{tr('pairsLeft', { n: Math.max(0, displaySize * displaySize / 2 - displayScores.reduce((sum, score) => sum + score, 0)) })}</span>
          </div>

          {displayStatus === 'finished' && (
            <div className="result-banner">
              <div>
                <strong>{resultTitle}</strong>
                <p>
                  {tr('resultPairs', { n: bestScore })} · {tr('resultSub')}
                </p>
              </div>
              {mode === 'lan-guest' ? (
                <span className="muted">{tr('lanWaitingHost')}</span>
              ) : (
                <button className="primary" onClick={newDeal}>{tr('dealAgain')}</button>
              )}
            </div>
          )}
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{tr('rules')}</h3>
            <p>{tr('pairPrompt')}</p>
            <p className="keyboard-line">{tr('keyboardHint')}</p>
            <div className="side-actions">
              <button
                className="secondary"
                onClick={undo}
                disabled={history.length === 0 || displayStatus !== 'playing' || mode === 'lan-guest' || aiThinking}
              >
                {tr('undo')}
              </button>
              <button className="secondary" onClick={showHint} disabled={hintDisabled}>
                {tr('hint')}
              </button>
              <button
                className="secondary"
                onClick={newDeal}
                disabled={mode === 'lan-guest' || aiThinking}
              >
                {tr('restartGame')}
              </button>
            </div>
          </div>

          {(mode === 'lan-host' || mode === 'lan-guest') && (
            <div className="side-card lan-mini">
              <h3>{tr('lanLabel')}</h3>
              <div className="room-code">{lanCode || '—'}</div>
              {mode === 'lan-host' ? (
                <p>{tr('lanReadyAll')} {lanPlayers.filter((player) => player.connected).length}/{displayPlayerCount}</p>
              ) : (
                <p>{tr('lanGuestGame', { name: nameAt(activeNames, mySeat) })}</p>
              )}
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('recordShort')}</h3>
            {record.games === 0 ? (
              <p>{tr('noRecordShort')}</p>
            ) : (
              <p>
                {record.games} {tr(record.games === 1 ? 'gameOne' : 'games')}
                {record.lastWinner ? ` · ${tr('lastWinner')} ${record.lastWinner}` : ''}
              </p>
            )}
            <button className="text-button" onClick={() => setRecord(clearRecord())}>
              {tr('resetStats')}
            </button>
          </div>
        </aside>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <p className="lede">{tr('rulesLede')}</p>
      <div className="rule-cards">
        {[1, 2, 3, 4].map((number) => (
          <article key={number} className="rule-card">
            <span className="rule-number">{number}</span>
            <p>{tr(`rule${number}` as MessageKey)}</p>
          </article>
        ))}
      </div>
      <p className="rule-foot">{tr('rule5')}</p>
      <div className="five-second">
        <span className="label">{tr('fiveSecondTitle')}</span>
        <div className="five-grid">
          <div><b>2</b><span>{tr('fiveSecondFlip')}</span></div>
          <div><b>✓</b><span>{tr('fiveSecondKeep')}</span></div>
          <div><b>↺</b><span>{tr('fiveSecondMiss')}</span></div>
          <div><b>★</b><span>{tr('fiveSecondWin')}</span></div>
        </div>
      </div>
      <div className="row-actions">
        <button className="primary" onClick={() => setScreen('home')}>{tr('close')}</button>
      </div>
    </main>
  );

  const winners = topWinners(record, 5);
  const maxWins = Math.max(1, ...winners.map(([, count]) => count));
  const statsScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('statsTitle')}</h2>
      <p className="lede">{tr('statsLede')}</p>
      <div className="stat-grid">
        <div className="stat-card"><span>{tr('gamesPlayed')}</span><strong>{record.games}</strong></div>
        <div className="stat-card"><span>{tr('soloWins')}</span><strong>{record.soloHumanWins}</strong></div>
        <div className="stat-card"><span>{tr('aiWins')}</span><strong>{record.aiWins}</strong></div>
        <div className="stat-card"><span>{tr('hotSeatWins')}</span><strong>{record.localWins}</strong></div>
        <div className="stat-card"><span>{tr('tiesLabel')}</span><strong>{record.ties}</strong></div>
        <div className="stat-card"><span>{tr('bestStreak')}</span><strong>{record.bestStreak}</strong></div>
      </div>
      <div className="last-winner">
        <span className="label">{tr('lastWinner')}</span>
        <strong>{record.lastWinner ?? '—'}</strong>
      </div>
      <section className="winners">
        <h3>{tr('topPlayers')}</h3>
        {winners.length === 0 ? (
          <p className="lede">{tr('noGames')}</p>
        ) : (
          winners.map(([name, count]) => (
            <div key={name} className="winner-row">
              <span>{name}</span>
              <div className="winner-bar"><i style={{ width: `${(count / maxWins) * 100}%` }} /></div>
              <strong>{count === 1 ? tr('winOne') : tr('winsCount', { n: count })}</strong>
            </div>
          ))
        )}
      </section>
      <div className="row-actions">
        <button className="ghost" onClick={() => { setRecord(clearRecord()); setToast(tr('recordCleared')); }}>
          {tr('resetStats')}
        </button>
        <span className="muted">{tr('recordOnDevice')}</span>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const guestPanel = (
    <>
      <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
      <p className="lede">{guestRoom ? `${tr('lanRoom')} ${guestRoom.replace('pair-up-', '')}` : tr('lanJoinLede')}</p>
      {!guestReady ? (
        guestRef.current ? (
          <div className="lan-waiting">
            <span className="waiting-pulse" aria-hidden="true" />
            <p className="waiting-line">
              {tr('lanWaitingHost')}
              {guestLobby.length > 0 ? ` · ${guestLobbyConnected}/${guestLobby.length}` : ''}
            </p>
            {guestLobby.length > 0 && (
              <div className="peer-list">
                {guestLobby.map((player) => (
                  <span key={player.seat} className={player.connected ? 'online' : ''}>
                    {player.name} {player.connected ? '●' : '○'}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="lan-form">
            <label>
              <span>{tr('lanName')}</span>
              <input
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                maxLength={18}
                placeholder={tr('guestLabel')}
              />
            </label>
            {!guestRoom && (
              <label>
                <span>{tr('lanCode')}</span>
                <input
                  value={guestCode}
                  onChange={(event) => setGuestCode(event.target.value)}
                  inputMode="numeric"
                  maxLength={12}
                />
              </label>
            )}
            <button
              className="primary wide"
              onClick={joinGuest}
              disabled={guestConnecting || !guestName.trim() || (!guestRoom && !guestCode.trim())}
            >
              {guestConnecting ? tr('lanJoining') : tr('lanJoinButton')}
            </button>
          </div>
        )
      ) : (
        <p className="lede">{tr('lanGuestSeat', { name: nameAt(activeNames, mySeat) })}</p>
      )}
      {lanError && <p className="error">{lanError}</p>}
      <div className="row-actions">
        <button className="primary" onClick={goHome}>{tr('home')}</button>
        <button className="ghost" onClick={() => { guestRef.current?.close(); guestRef.current = null; setGuestRoom(''); setMode('lan-host'); setGuestView(null); setGuestStarted(false); setGuestSeat(-1); setGuestLobby([]); }}>
          {tr('lanHost')}
        </button>
      </div>
    </>
  );

  const hostLobby = lanHost && lanInfo ? (
    <>
      <h2 className="screen-title">{tr('lanTitle')}</h2>
      <p className="lede">{tr('lanYourCode')}</p>
      {lanError && <p className="error">{lanError}</p>}
      <div className="lan-layout">
        <div className="lan-card">
          <span className="label">{tr('lanCode')}</span>
          <div className="room-code big">{lanCode}</div>
          <p>
            {hostConnected >= lanSetupPlayers
              ? tr('lanReadyAll')
              : tr('lanWaitingFor', { n: Math.max(0, lanSetupPlayers - hostConnected) })}
          </p>
          <div className="peer-list">
            {lanPlayers.map((player) => (
              <span key={player.seat} className={player.connected ? 'online' : ''}>
                {player.name} {player.connected ? '●' : '○'}
              </span>
            ))}
          </div>
          <button className="primary wide" onClick={startLan} disabled={hostConnected < lanSetupPlayers}>
            {tr('lanStart')}
          </button>
          <button
            className="secondary wide"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(lanInvite);
                setToast(tr('lanCopied'));
              } catch {
                setToast(lanInvite);
              }
            }}
          >
            {tr('lanCopy')}
          </button>
          <p className="muted">{tr('lanStartHint')}</p>
        </div>
        <div className="qr-card">
          {lanQr ? <img src={lanQr} alt={tr('lanScan')} /> : null}
          <p>{tr('lanScan')}</p>
          <code>{lanInvite.replace(/^https?:\/\//, '')}</code>
        </div>
      </div>
    </>
  ) : null;

  const lanScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>← {tr('back')}</button>
      {showGuestPanel ? (
        guestPanel
      ) : hostLobby ?? (
        <>
          <h2 className="screen-title">{tr('lanTitle')}</h2>
          <p className="lede">{tr('lanLede')}</p>
          {lanBusy && <p className="lede">{tr('lanStarting')}</p>}
          {lanError && <p className="error">{lanError}</p>}
          <section className="setup-block">
            <div className="setup-label">
              <span className="label">{tr('lanPlayers')}</span>
              <small>{tr('lanSeatsHint')}</small>
            </div>
            <div className="chip-row">
              {[2, 3, 4, 5, 6].map((count) => (
                <button
                  key={count}
                  className={`picker ${lanSetupPlayers === count ? 'selected' : ''}`}
                  onClick={() => setLanSetupPlayers(count)}
                  aria-pressed={lanSetupPlayers === count}
                >
                  {count}
                </button>
              ))}
            </div>
          </section>
          <section className="setup-block">
            <div className="setup-label">
              <span className="label">{tr('deck')}</span>
              <small>{tr('deckHint')}</small>
            </div>
            <div className="choice-grid two">
              {([4, 6] as DeckSize[]).map((size) => (
                <button
                  key={size}
                  className={`choice-card ${lanSetupSize === size ? 'selected' : ''}`}
                  onClick={() => setLanSetupSize(size)}
                  aria-pressed={lanSetupSize === size}
                >
                  <DeckMini size={size} />
                  <span>
                    <strong>{size === 4 ? tr('deck4') : tr('deck6')}</strong>
                    <small>{tr('pairCount', { n: size === 4 ? 8 : 18 })}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <label className="name-input single">
            <span>{tr('lanHostName')}</span>
            <input
              value={lanHostName}
              maxLength={18}
              onChange={(event) => setLanHostName(event.target.value)}
            />
          </label>
          <div className="row-actions">
            <button className="primary" onClick={openLanHost} disabled={lanBusy || !lanHostName.trim()}>
              {lanBusy ? tr('lanStarting') : tr('lanCreate')}
            </button>
            <button className="ghost" onClick={() => setLanJoinOpen((value) => !value)}>
              {tr('lanJoinButton')}
            </button>
          </div>
          {lanJoinOpen && (
            <div className="lan-form inline-form">
              <label>
                <span>{tr('lanName')}</span>
                <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={18} />
              </label>
              <label>
                <span>{tr('lanCode')}</span>
                <input value={guestCode} onChange={(event) => setGuestCode(event.target.value)} inputMode="numeric" maxLength={12} />
              </label>
              <button className="secondary" onClick={joinGuest} disabled={guestConnecting || !guestName.trim() || !guestCode.trim()}>
                {guestConnecting ? tr('lanJoining') : tr('lanJoinButton')}
              </button>
            </div>
          )}
          {lanError && <p className="error">{lanError}</p>}
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
