import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseMoveDetailed, hint as findHint, type AiLevel, type HintReason } from './ai/ai';
import { Board, StoneGlyph } from './components/Board';
import {
  apply,
  applySeat,
  emptyBoard,
  parsePoint,
  pass,
  passSeat,
  pointName,
  scoreBoard,
  setup,
  territoryOwner,
  view,
  type Cell,
  type Color,
  type GameState,
  type SeatView,
} from './game/little-go';
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
  undoResult,
  type Record as GameRecord,
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'lan' | 'record';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';

const AI_LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const HINT_KEYS: Record<HintReason, MessageKey> = {
  capture: 'hintCapture',
  save: 'hintSave',
  atari: 'hintAtari',
  territory: 'hintTerritory',
  influence: 'hintInfluence',
  opening: 'hintOpening',
  pass: 'hintPass',
  solid: 'hintSolid',
};

const EMPTY_BOARD: Cell[] = emptyBoard();

const HERO_BOARD: Cell[] = (() => {
  const board = emptyBoard();
  const stones: [string, Color][] = [
    ['E5', 'B'],
    ['D6', 'B'],
    ['F4', 'B'],
    ['C3', 'B'],
    ['G7', 'B'],
    ['D3', 'B'],
    ['D5', 'W'],
    ['E6', 'W'],
    ['F6', 'W'],
    ['C4', 'W'],
    ['G5', 'W'],
    ['E7', 'W'],
    ['C6', 'W'],
  ];
  for (const [name, color] of stones) {
    const index = parsePoint(name);
    if (index >= 0) board[index] = color;
  }
  return board;
})();

const DEMO_BOARD: Cell[] = (() => {
  const board = emptyBoard();
  const stones: [string, Color][] = [
    ['A1', 'B'], ['B1', 'B'], ['C1', 'B'],
    ['A2', 'B'], ['C2', 'B'], ['A3', 'B'], ['B3', 'B'], ['C3', 'B'],
    ['J1', 'W'], ['H1', 'W'], ['G1', 'W'],
    ['J2', 'W'], ['G2', 'W'], ['J3', 'W'], ['H3', 'W'], ['G3', 'W'],
    ['E5', 'B'], ['F5', 'W'], ['D5', 'B'], ['E4', 'W'], ['F4', 'B'], ['D4', 'W'],
  ];
  for (const [name, color] of stones) {
    const index = parsePoint(name);
    if (index >= 0) board[index] = color;
  }
  return board;
})();

const DEMO_SCORE = scoreBoard(DEMO_BOARD);

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

function counterpart(color: Color): Color {
  return color === 'B' ? 'W' : 'B';
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup('B'));
  const [history, setHistory] = useState<GameState[]>([]);
  const historyRef = useRef<GameState[]>([]);
  const [cursor, setCursor] = useState(40);
  const [hintPoint, setHintPoint] = useState<number | null>(null);
  const [hintReason, setHintReason] = useState<HintReason | null>(null);
  const [record, setRecord] = useState<GameRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.little-go.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const recordedRef = useRef(false);

  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => guestParams()?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => guestParams()?.code ?? '');
  const [guestRoom] = useState(() => guestParams()?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
      localStorage.setItem('familyarcade.little-go.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const finish = useCallback(
    (next: GameState, currentMode: Mode) => {
      if (next.status !== 'finished' || recordedRef.current) return;
      recordedRef.current = true;
      if (currentMode !== 'lan-host' && currentMode !== 'lan-guest') {
        setRecord(recordResult(next, currentMode === 'ai' ? 'ai' : 'local'));
      }
      clearSave();
      setSaved(null);
      if (soundOn) chime('win');
    },
    [soundOn],
  );

  const commit = useCallback(
    (next: GameState, currentMode: Mode, previous: GameState) => {
      const nextHistory = [...historyRef.current, previous];
      historyRef.current = nextHistory;
      setHistory(nextHistory);
      setState(next);
      stateRef.current = next;
      setHintPoint(null);
      setHintReason(null);
      if (soundOn && next.status === 'playing') {
        const last = next.moves[next.moves.length - 1];
        const before = previous.captures.B + previous.captures.W;
        const after = next.captures.B + next.captures.W;
        chime(last?.type === 'pass' ? 'pass' : after > before ? 'capture' : 'place');
      }
      finish(next, currentMode);
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.status === 'playing') {
          saveGame({ state: next, history: nextHistory, mode: currentMode, level });
          setSaved(loadSave());
        } else {
          clearSave();
          setSaved(null);
        }
      }
      if (currentMode === 'lan-host' && hostRef.current) {
        hostRef.current.sendView(1, view(next, 1));
      }
    },
    [finish, level, soundOn],
  );

  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  const beginGame = useCallback((nextMode: 'ai' | 'local') => {
    const next = setup('B');
    setMode(nextMode);
    setState(next);
    stateRef.current = next;
    historyRef.current = [];
    setHistory([]);
    setCursor(40);
    setHintPoint(null);
    setHintReason(null);
    recordedRef.current = false;
    setScreen('game');
    clearSave();
    setSaved(null);
  }, []);

  const resume = () => {
    if (!saved) return;
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    stateRef.current = saved.state;
    historyRef.current = saved.history;
    setHistory(saved.history);
    setCursor(saved.state.lastMove ?? 40);
    setHintPoint(null);
    setHintReason(null);
    recordedRef.current = false;
    setSaved(null);
    setScreen('game');
  };

  const playAt = useCallback(
    (index: number) => {
      setCursor(index);
      if (mode === 'lan-guest') {
        if (guestView?.canMove && guestView.board[index] === null) {
          guest?.sendIntent({ type: 'place', index });
        }
        return;
      }
      if (mode === 'lan-host' && !lanPlayers[1]?.connected) return;
      if (mode === 'ai' && (state.turn !== 'B' || state.status !== 'playing')) return;
      const result = mode === 'lan-host' ? applySeat(state, 0, index) : apply(state, index);
      if (!result.ok) {
        if (result.error === 'ko') setToast(tr('koNotice'));
        else if (result.error === 'suicide') setToast(tr('suicideNotice'));
        return;
      }
      commit(result.state, mode, state);
    },
    [commit, guest, guestView, lanPlayers, mode, state, tr],
  );

  const passTurn = useCallback(() => {
    if (mode === 'lan-guest') {
      if (guestView?.canMove) guest?.sendIntent({ type: 'pass' });
      return;
    }
    if (mode === 'lan-host' && !lanPlayers[1]?.connected) return;
    if (mode === 'ai' && (state.turn !== 'B' || state.status !== 'playing')) return;
    const result = mode === 'lan-host' ? passSeat(state, 0) : pass(state);
    if (!result.ok) return;
    commit(result.state, mode, state);
  }, [commit, guest, guestView, lanPlayers, mode, state]);

  // AI reply. Human is always Black; White is the computer.
  useEffect(() => {
    if (mode !== 'ai' || state.status !== 'playing' || state.turn !== 'W') return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const choice = chooseMoveDetailed(state, level);
      setAiThinking(false);
      if (choice.index === null) {
        const result = pass(state);
        if (result.ok) commit(result.state, 'ai', state);
        return;
      }
      const result = apply(state, choice.index);
      if (result.ok) commit(result.state, 'ai', state);
    }, 430);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, level, mode, state]);

  const undo = useCallback(() => {
    if (mode === 'lan-guest') return;
    if (historyRef.current.length === 0) return;
    const items = historyRef.current.slice();
    let next = state;
    do {
      const previous = items.pop();
      if (!previous) break;
      next = previous;
    } while (mode === 'ai' && next.status === 'playing' && next.turn !== 'B' && items.length > 0);
    historyRef.current = items;
    setHistory(items);
    setState(next);
    stateRef.current = next;
    setHintPoint(null);
    setHintReason(null);
    setCursor(next.lastMove ?? 40);
    if (recordedRef.current) {
      recordedRef.current = false;
      if (mode === 'ai' || mode === 'local') setRecord(undoResult());
    }
    if (mode === 'ai' || mode === 'local') {
      if (next.status === 'playing') {
        saveGame({ state: next, history: items, mode, level });
        setSaved(loadSave());
      } else {
        clearSave();
        setSaved(null);
      }
    }
    if (mode === 'lan-host' && hostRef.current) hostRef.current.sendView(1, view(next, 1));
  }, [mode, state, level]);

  const showHint = useCallback(() => {
    if (state.status !== 'playing' || mode === 'lan-guest') return;
    if (mode === 'lan-host' && !lanPlayers[1]?.connected) return;
    if (mode === 'ai' && state.turn !== 'B') return;
    const choice = findHint(state);
    if (choice.index === null) {
      setHintPoint(null);
      setHintReason('pass');
      setToast(tr('hintPass'));
      return;
    }
    setHintPoint(choice.index);
    setHintReason(choice.reason);
    setCursor(choice.index);
    setToast(tr(HINT_KEYS[choice.reason]));
  }, [lanPlayers, mode, state, tr]);

  const goHome = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanInvite('');
    setLanQr('');
    setLanError('');
    setLanBusy(false);
    guest?.close();
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    setGuestConnecting(false);
    setScreen('home');
  }, [guest]);

  useEffect(() => {
    if (!guestRoom) return;
    setScreen('lan');
    setMode('lan-guest');
  }, [guestRoom]);

  const openLanHost = async () => {
    setScreen('lan');
    setMode('lan-host');
    setLanBusy(true);
    setLanError('');
    try {
      const info = await startLanServer();
      setLanInfo(info);
      const code = newRoomCode();
      const room = newRoomCode();
      const host = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room,
        code,
        name: lang === 'zh' ? '主机' : 'Host',
        maxPlayers: 2,
      });
      hostRef.current = host;
      setLanHost(host);
      setLanCode(code);
      host.onChange((players) => setLanPlayers(players));
      host.onIntent((seat, intent) => {
        const payload = intent as { type?: string; index?: number } | null;
        const current = stateRef.current;
        if (payload?.type === 'pass') {
          const result = passSeat(current, seat);
          if (result.ok) commitRef.current(result.state, 'lan-host', current);
          return;
        }
        const index = Number(payload?.index);
        if (!Number.isInteger(index)) return;
        const result = applySeat(current, seat, index);
        if (result.ok) commitRef.current(result.state, 'lan-host', current);
      });
      host.onClose(() => setLanError(tr('lanClosed')));
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#3a2a18', light: '#f6efdf' },
        }),
      );
    } catch (error) {
      setLanError(error instanceof Error ? error.message : String(error));
      hostRef.current?.close();
      hostRef.current = null;
    } finally {
      setLanBusy(false);
    }
  };

  const startLan = () => {
    if (!lanHost) return;
    const next = setup('B');
    setState(next);
    stateRef.current = next;
    historyRef.current = [];
    setHistory([]);
    setCursor(40);
    setHintPoint(null);
    setHintReason(null);
    recordedRef.current = false;
    setScreen('game');
    lanHost.start();
    lanHost.sendView(1, view(next, 1));
  };

  const joinGuest = async () => {
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
      joined.onView((payload) => setGuestView(payload as SeatView));
      joined.onStart(() => {
        setGuestStarted(true);
        setScreen('game');
      });
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? tr('lanFull') : tr('lanWrong'));
      });
      setGuestStarted(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLanError(
        message.includes('room-full')
          ? tr('lanFull')
          : message.includes('wrong-code') || message.includes('rejected')
            ? tr('lanWrong')
            : tr('lanDisconnected'),
      );
    } finally {
      setGuestConnecting(false);
    }
  };

  const resetRecord = () => {
    setRecord(clearRecord());
    setToast(tr('recordCleared'));
  };

  const isGuest = mode === 'lan-guest';
  const guestCanPlay = Boolean(guestView?.canMove) && guestStarted;
  const hostConnected = Boolean(lanPlayers[1]?.connected);
  const shownBoard = isGuest ? guestView?.board ?? EMPTY_BOARD : state.board;
  const shownStatus = guestView?.status ?? state.status;
  const shownTurn = guestView?.turn ?? state.turn;
  const shownScore = guestView?.score ?? state.score;
  const shownLastMove = guestView?.lastMove ?? state.lastMove;
  const shownCaptures = guestView?.captures ?? state.captures;
  const shownPasses = guestView?.passes ?? state.passes;
  const shownMoveCount = guestView?.moveCount ?? state.moves.length;
  const finished = shownStatus === 'finished';
  const winner = shownScore?.winner ?? null;
  const chipColor: Color = finished && winner ? winner : shownTurn;

  const disabled =
    screen !== 'game' ||
    shownStatus !== 'playing' ||
    (isGuest && (!guestCanPlay || !guestStarted)) ||
    (mode === 'lan-host' && (!hostConnected || shownTurn !== 'B')) ||
    (mode === 'ai' && (shownTurn !== 'B' || aiThinking));

  const passDisabled =
    screen !== 'game' ||
    shownStatus !== 'playing' ||
    (isGuest && (!guestCanPlay || !guestStarted)) ||
    (mode === 'lan-host' && (!hostConnected || shownTurn !== 'B')) ||
    (mode === 'ai' && (shownTurn !== 'B' || aiThinking));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        goHome();
        return;
      }
      if (screen !== 'game') return;
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        setCursor((current) => {
          const row = Math.floor(current / 9);
          const col = current % 9;
          if (event.key === 'ArrowUp') return Math.max(0, row - 1) * 9 + col;
          if (event.key === 'ArrowDown') return Math.min(8, row + 1) * 9 + col;
          if (event.key === 'ArrowLeft') return row * 9 + Math.max(0, col - 1);
          return row * 9 + Math.min(8, col + 1);
        });
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'p') {
        event.preventDefault();
        passTurn();
        return;
      }
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
      if (event.key === 'Enter' || event.key === ' ') {
        if (target && target.tagName === 'BUTTON' && !target.classList.contains('go-point')) return;
        event.preventDefault();
        if (!disabled && screen === 'game') playAt(cursor);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cursor, disabled, goHome, passTurn, playAt, screen, showHint, undo]);

  const seatLabel =
    mode === 'ai'
      ? tr('modeAi')
      : mode === 'local'
        ? tr('modeLocal')
        : mode === 'lan-host'
          ? tr('lanHostSeat')
          : tr('lanGuestSeat');

  const headline = (() => {
    if (finished) return tr('gameOver');
    if (isGuest) {
      if (!guestStarted) return tr('lanGuestWaiting');
      return shownTurn === 'W' ? tr('yourTurn') : tr('blackToPlay');
    }
    if (mode === 'lan-host') {
      if (!hostConnected) return tr('lanWaiting');
      return shownTurn === 'B' ? tr('yourTurn') : tr('whiteToPlay');
    }
    if (mode === 'ai') {
      return shownTurn === 'B' ? tr('yourTurn') : tr('aiThinking');
    }
    return shownTurn === 'B' ? tr('blackToPlay') : tr('whiteToPlay');
  })();

  const passNotice =
    shownStatus === 'playing' && shownPasses === 1
      ? tr('onePass', {
          color: tr(counterpart(shownTurn) === 'B' ? 'black' : 'white'),
          other: tr(shownTurn === 'B' ? 'black' : 'white'),
        })
      : '';

  const moveLine = `${tr('moveNo', { n: shownMoveCount })}${
    shownLastMove !== null ? ` · ${tr('lastMove', { point: pointName(shownLastMove) })}` : ''
  }`;

  const resultLabel =
    finished && shownScore
      ? tr(shownScore.winner === 'B' ? 'resultBlack' : 'resultWhite', {
          margin: formatNumber(shownScore.margin),
        })
      : '';

  const restart = () => {
    if (mode === 'lan-host' && lanHost) {
      const next = setup('B');
      setState(next);
      stateRef.current = next;
      historyRef.current = [];
      setHistory([]);
      setCursor(40);
      setHintPoint(null);
      setHintReason(null);
      recordedRef.current = false;
      lanHost.sendView(1, view(next, 1));
    } else if (mode === 'ai' || mode === 'local') {
      beginGame(mode);
    }
  };

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('tableNo')}</p>
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
        </div>
      </header>

      <section className="hero">
        <div className="hero-board">
          <div className="seal" aria-hidden="true">棋</div>
          <Board
            board={HERO_BOARD}
            turn="B"
            lastMove={parsePoint('E5')}
            hint={null}
            cursor={-1}
            territory={null}
            disabled
            lang={lang}
            legend={false}
            onCell={() => undefined}
          />
          <div className="hero-caption">
            <span>9 × 9</span>
            <span>·</span>
            <span>81</span>
            <span>·</span>
            <span>6.5</span>
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
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={() => {
              setMode('ai');
              setScreen('setup');
            }}>
              {tr('playAi')}
            </button>
            <button className="secondary wide" onClick={() => beginGame('local')}>
              {tr('playLocal')}
            </button>
            <button className="secondary wide" onClick={openLanHost}>
              {tr('playLan')}
            </button>
            <div className="menu-links">
              <button className="text-button" onClick={() => setScreen('rules')}>
                {tr('rules')} →
              </button>
              <button className="text-button" onClick={() => setScreen('record')}>
                {tr('record')} →
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('stats')}</span>
            <strong>{record.games}</strong>
            <span>{record.games === 1 ? tr('gameOne') : tr('games')}</span>
            <span className="dot">·</span>
            <span>{record.blackWins} {tr('blackShort')}</span>
            <span className="dot">·</span>
            <span>{record.whiteWins} {tr('whiteShort')}</span>
            {record.streak > 0 && (
              <>
                <span className="dot">·</span>
                <span>{tr('streakValue', { n: record.streak })}</span>
              </>
            )}
          </div>
          <button className="text-button record-link" onClick={() => setScreen('record')}>
            {tr('openRecord')}
          </button>
        </div>
      </section>

      <section className="home-steps">
        <article>
          <span className="step-no">01</span>
          <h3>{tr('stepPlaceTitle')}</h3>
          <p>{tr('stepPlaceText')}</p>
        </article>
        <article>
          <span className="step-no">02</span>
          <h3>{tr('stepCaptureTitle')}</h3>
          <p>{tr('stepCaptureText')}</p>
        </article>
        <article>
          <span className="step-no">03</span>
          <h3>{tr('stepCountTitle')}</h3>
          <p>{tr('stepCountText')}</p>
        </article>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>← {tr('back')}</button>
      <p className="eyebrow">{tr('tableNo')}</p>
      <h2 className="screen-title">{tr('difficulty')}</h2>
      <p className="lede">{tr('youPlayBlack')}</p>
      <div className="level-grid">
        {AI_LEVELS.map((item) => (
          <button
            key={item.id}
            className={`level-card ${level === item.id ? 'selected' : ''}`}
            aria-pressed={level === item.id}
            onClick={() => setLevel(item.id)}
          >
            <span className={`level-dot ${item.id}`} />
            <strong>{tr(item.label)}</strong>
            <small>{tr(item.note)}</small>
          </button>
        ))}
      </div>
      <div className="setup-stones" aria-hidden="true">
        <span className="setup-stone black" />
        <span>{tr('black')}</span>
        <span className="setup-vs">vs</span>
        <span className="setup-stone white" />
        <span>{tr('white')}</span>
        <span className="muted">+6.5</span>
      </div>
      <div className="row-actions">
        <button className="primary" onClick={() => beginGame('ai')}>{tr('begin')}</button>
        <button className="ghost" onClick={goHome}>{tr('back')}</button>
      </div>
      <div className="setup-tip">
        <strong>{tr('setupTipTitle')}</strong>
        <p>{tr('setupTip')}</p>
      </div>
    </main>
  );

  const gameScreen = (
    <main className="shell game-shell">
      <header className="game-top">
        <button className="back" onClick={goHome}>← {tr('home')}</button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>{seatLabel}</span>
        </div>
        <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
          {tr('language')}
        </button>
      </header>

      <div className="game-layout">
        <section className="board-wrap">
          <div className="turn-bar">
            <span className={`turn-chip ${chipColor === 'B' ? 'black' : 'white'}`}>
              <StoneGlyph color={chipColor} />
            </span>
            <div className="turn-copy">
              <strong>{headline}</strong>
              <p>{seatLabel} · {moveLine}</p>
              {passNotice && <p className="pass-note">{passNotice}</p>}
            </div>
            {aiThinking && <span className="thinking" aria-label={tr('aiThinking')}>···</span>}
          </div>
          <Board
            board={shownBoard}
            turn={shownTurn}
            lastMove={shownLastMove}
            hint={isGuest ? null : hintPoint}
            cursor={finished ? -1 : cursor}
            territory={finished ? territoryOwner(shownBoard) : null}
            disabled={disabled}
            lang={lang}
            onCell={playAt}
            onCursor={setCursor}
          />
          {hintPoint !== null && hintReason && (
            <p className="hint-note">
              <span className="hint-mark" aria-hidden="true">✦</span>
              {tr(HINT_KEYS[hintReason])}
            </p>
          )}
          {finished && shownScore && (
            <div className="result-banner">
              <div>
                <span className="eyebrow">{tr('gameOver')}</span>
                <strong>{resultLabel}</strong>
                <p>{tr('totalBlack')} {formatNumber(shownScore.black)} · {tr('totalWhite')} {formatNumber(shownScore.white)}</p>
              </div>
              {!isGuest ? (
                <button className="primary" onClick={restart}>{tr('restart')}</button>
              ) : (
                <span className="muted">{tr('lanGuestFinished')}</span>
              )}
            </div>
          )}
        </section>

        <aside className="side">
          <div className="side-card action-card">
            <h3>{tr('turnOptions')}</h3>
            <button className="primary pass-button" onClick={passTurn} disabled={passDisabled}>
              {tr('pass')}
            </button>
            <p>{tr('passHint')}</p>
            <div className="side-actions">
              <button
                className="secondary"
                onClick={undo}
                disabled={history.length === 0 || mode === 'lan-guest' || aiThinking}
              >
                {tr('undo')}
              </button>
              <button
                className="secondary"
                onClick={showHint}
                disabled={
                  shownStatus !== 'playing' ||
                  mode === 'lan-guest' ||
                  (mode === 'ai' && shownTurn !== 'B') ||
                  (mode === 'lan-host' && (!hostConnected || shownTurn !== 'B'))
                }
              >
                {tr('hint')}
              </button>
            </div>
          </div>

          <div className="side-card">
            <h3>{tr('captures')}</h3>
            <div className="capture-row">
              <span className="mini-stone black" />
              <span>{tr('blackCaptured', { n: shownCaptures.B })}</span>
            </div>
            <div className="capture-row">
              <span className="mini-stone white" />
              <span>{tr('whiteCaptured', { n: shownCaptures.W })}</span>
            </div>
            <p className="side-note">{moveLine}</p>
          </div>

          {finished && shownScore && (
            <div className="side-card score-card">
              <h3>{tr('scoreTitle')}</h3>
              <dl>
                <div><dt>{tr('blackStones')}</dt><dd>{shownScore.blackStones}</dd></div>
                <div><dt>{tr('whiteStones')}</dt><dd>{shownScore.whiteStones}</dd></div>
                <div><dt>{tr('blackTerritory')}</dt><dd>{shownScore.blackTerritory}</dd></div>
                <div><dt>{tr('whiteTerritory')}</dt><dd>{shownScore.whiteTerritory}</dd></div>
                <div><dt>{tr('neutral')}</dt><dd>{shownScore.neutral}</dd></div>
                <div><dt>{tr('komi')}</dt><dd>{formatNumber(shownScore.komi)}</dd></div>
                <div className="score-total"><dt>{tr('totalBlack')}</dt><dd>{formatNumber(shownScore.black)}</dd></div>
                <div className="score-total"><dt>{tr('totalWhite')}</dt><dd>{formatNumber(shownScore.white)}</dd></div>
              </dl>
            </div>
          )}

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <h3>{tr('lanCode')}</h3>
              <div className="room-code">{lanCode}</div>
              <p>{hostConnected ? tr('lanReady') : tr('lanWaiting')}</p>
              {lanPlayers[1] && (
                <p className="peer">
                  {lanPlayers[1].name}{lanPlayers[1].connected ? ` · ${tr('online')}` : ''}
                </p>
              )}
              <p className="side-note">{tr('lanHostHint')}</p>
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('stats')}</h3>
            <p>
              {record.games} {record.games === 1 ? tr('gameOne') : tr('games')} · {record.blackWins}{' '}
              {tr('blackShort')} · {record.whiteWins} {tr('whiteShort')}
            </p>
          </div>

          <div className="side-card keys-card">
            <h3>{tr('controlsTitle')}</h3>
            <p>{tr('keyboardHint')}</p>
          </div>
        </aside>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>← {tr('back')}</button>
      {mode === 'lan-guest' || guestRoom ? (
        <>
          <p className="eyebrow">{tr('lanGuestTitle')}</p>
          <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
          <p className="lede">{tr('lanRoom', { room: guestRoom })}</p>
          {!guestStarted && (
            <div className="lan-form">
              <label>
                <span>{tr('lanName')}</span>
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  maxLength={18}
                />
              </label>
              <label>
                <span>{tr('lanCode')}</span>
                <input
                  value={guestCode}
                  onChange={(event) => setGuestCode(event.target.value)}
                  inputMode="numeric"
                  maxLength={4}
                />
              </label>
              <button
                className="primary wide"
                onClick={joinGuest}
                disabled={guestConnecting || !guestName.trim()}
              >
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
              <p className="side-note">{tr('lanGuestHint')}</p>
            </div>
          )}
          {guestStarted && <p className="lede">{tr('lanGuestSeat')}</p>}
          {lanError && <p className="error">{lanError}</p>}
          {guestStarted && (
            <button className="primary" onClick={() => setScreen('game')}>{tr('lanStart')}</button>
          )}
        </>
      ) : (
        <>
          <p className="eyebrow">{tr('lanTitle')}</p>
          <h2 className="screen-title">{tr('lanHost')}</h2>
          <p className="lede">{tr('lanLede')}</p>
          {lanBusy && <p className="lede">{tr('lanStarting')}</p>}
          {lanError && <p className="error">{lanError}</p>}
          {lanInfo && lanInvite && (
            <div className="lan-layout">
              <div className="lan-card">
                <span className="label">{tr('lanCode')}</span>
                <div className="room-code big">{lanCode}</div>
                <p>{hostConnected ? tr('lanReady') : tr('lanWaiting')}</p>
                <div className="peer-list">
                  {lanPlayers.slice(0, 2).map((player) => (
                    <span key={player.seat} className={player.connected ? 'online' : ''}>
                      <span className={`mini-stone ${player.seat === 0 ? 'black' : 'white'}`} />
                      {player.name} {player.connected ? '●' : '○'}
                    </span>
                  ))}
                </div>
                <button className="primary wide" onClick={startLan} disabled={!hostConnected}>
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
              </div>
              <div className="qr-card">
                {lanQr ? <img src={lanQr} alt={tr('lanScan')} /> : null}
                <p>{tr('lanScan')}</p>
                <code>{lanInvite.replace(/^https?:\/\//, '')}</code>
              </div>
            </div>
          )}
        </>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell rules-shell">
      <button className="back" onClick={goHome}>← {tr('back')}</button>
      <p className="eyebrow">{tr('tableNo')}</p>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <p className="lede">{tr('rulesLede')}</p>
      <div className="rules-layout">
        <div>
          <ol className="rules-list">
            <li>{tr('rule1')}</li>
            <li>{tr('rule2')}</li>
            <li>{tr('rule3')}</li>
            <li>{tr('rule4')}</li>
            <li>{tr('rule5')}</li>
          </ol>
          <div className="rule-cards">
            <section>
              <h3>{tr('scoringTitle')}</h3>
              <p>{tr('scoringText')}</p>
            </section>
            <section>
              <h3>{tr('controlsTitle')}</h3>
              <p>{tr('controlsText')}</p>
            </section>
          </div>
          <button className="primary" onClick={goHome}>{tr('close')}</button>
        </div>
        <aside className="example-card">
          <h3>{tr('exampleTitle')}</h3>
          <Board
            board={DEMO_BOARD}
            turn="B"
            lastMove={null}
            hint={null}
            cursor={-1}
            territory={territoryOwner(DEMO_BOARD)}
            disabled
            lang={lang}
            legend={false}
            onCell={() => undefined}
          />
          <p>{tr('exampleText')}</p>
          <p className="example-score">
            {tr('black')} {formatNumber(DEMO_SCORE.black)} · {tr('white')} {formatNumber(DEMO_SCORE.white)}
          </p>
        </aside>
      </div>
    </main>
  );

  const recordScreen = (
    <main className="shell record-shell">
      <button className="back" onClick={goHome}>← {tr('back')}</button>
      <p className="eyebrow">{tr('tableNo')}</p>
      <h2 className="screen-title">{tr('recordTitle')}</h2>
      <p className="lede">{tr('recordLede')}</p>
      <div className="record-layout">
        <div>
          <div className="record-grid">
            <div className="stat-card">
              <span>{tr('games')}</span>
              <strong>{record.games}</strong>
            </div>
            <div className="stat-card">
              <span>{tr('blackWins')}</span>
              <strong>{record.blackWins}</strong>
            </div>
            <div className="stat-card">
              <span>{tr('whiteWins')}</span>
              <strong>{record.whiteWins}</strong>
            </div>
            <div className="stat-card">
              <span>{tr('streak')}</span>
              <strong>{record.streak}</strong>
            </div>
          </div>
          {record.lastWinner && (
            <p className="lede">
              {tr('lastWinner', { color: tr(record.lastWinner === 'B' ? 'black' : 'white') })}
            </p>
          )}
          <h3 className="section-label">{tr('recentGames')}</h3>
          {record.history.length === 0 ? (
            <p className="empty-state">{tr('noRecord')}</p>
          ) : (
            <ul className="record-list">
              {record.history.map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <span className={`mini-stone ${entry.winner === 'B' ? 'black' : 'white'}`} />
                  <span>
                    {tr('resultLine', {
                      winner: tr(entry.winner === 'B' ? 'black' : 'white'),
                      margin: formatNumber(entry.margin),
                    })}
                  </span>
                  <span className="record-mode">
                    {entry.mode === 'ai' ? tr('modeAi') : tr('modeLocal')}
                  </span>
                  <time dateTime={new Date(entry.at).toISOString()}>
                    {new Date(entry.at).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
          <div className="row-actions record-actions">
            <button className="secondary" onClick={resetRecord}>{tr('resetStats')}</button>
            <button className="ghost" onClick={goHome}>{tr('back')}</button>
          </div>
        </div>
        <aside className="example-card">
          <h3>{tr('recordBoardTitle')}</h3>
          <Board
            board={DEMO_BOARD}
            turn="B"
            lastMove={null}
            hint={null}
            cursor={-1}
            territory={territoryOwner(DEMO_BOARD)}
            disabled
            lang={lang}
            legend={false}
            onCell={() => undefined}
          />
          <p>{tr('recordBoardText')}</p>
        </aside>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'lan') return lanScreen;
  if (screen === 'record') return recordScreen;
  return home;
}
