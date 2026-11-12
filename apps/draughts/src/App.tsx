import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  LanGuest,
  LanHost,
  guestParams,
  newRoomCode,
  type LanPublicPeer,
} from '@family-arcade/lan';
import { chooseWithReason, type AiLevel, type HintReason } from './ai/ai';
import { Board, MiniBoard, PieceDisc } from './components/Board';
import {
  apply,
  applySeat,
  isMove,
  legalMoves,
  moveName,
  sameMove,
  setup,
  view,
  type GameState,
  type Move,
  type Piece,
  type SeatView,
  type Side,
} from './game/draughts';
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
  loadSound,
  recordResult,
  saveGame,
  saveSound,
  type FamilyRecord,
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'lan' | 'record';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';

const AI_META: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const HERO_BOARD: (Piece | null)[] = (() => {
  const board = Array<Piece | null>(64).fill(null);
  const put = (row: number, col: number, piece: Piece) => {
    board[row * 8 + col] = piece;
  };
  put(0, 1, 'w');
  put(1, 4, 'w');
  put(2, 1, 'w');
  put(2, 5, 'w');
  put(3, 2, 'W');
  put(4, 5, 'R');
  put(5, 0, 'r');
  put(5, 4, 'r');
  put(6, 3, 'r');
  put(7, 2, 'r');
  return board;
})();

function statusText(
  lang: Lang,
  status: GameState['status'],
  turn: Side,
  winner: Side | null,
): string {
  if (status === 'won') {
    return t(lang, winner === 'red' ? 'redWinsTitle' : 'whiteWinsTitle');
  }
  if (status === 'draw') return t(lang, 'drawTitle');
  return t(lang, turn === 'red' ? 'redToPlay' : 'whiteToPlay');
}

function detailText(lang: Lang, state: {
  status: GameState['status'];
  winReason: GameState['winReason'];
  drawReason: GameState['drawReason'];
}): string {
  if (state.status === 'won') {
    return t(lang, state.winReason === 'all-captured' ? 'winCaptured' : 'winBlocked');
  }
  if (state.status === 'draw') {
    if (state.drawReason === 'forty-move') return t(lang, 'drawForty');
    if (state.drawReason === 'repetition') return t(lang, 'drawRepetition');
    return t(lang, 'drawLimit');
  }
  return '';
}

function reasonKey(reason: HintReason): MessageKey {
  switch (reason) {
    case 'win':
      return 'reasonWin';
    case 'multi-capture':
      return 'reasonMultiCapture';
    case 'capture':
      return 'reasonCapture';
    case 'promote':
      return 'reasonPromote';
    case 'block':
      return 'reasonBlock';
    case 'king-safety':
      return 'reasonKingSafety';
    default:
      return 'reasonDevelop';
  }
}

function formatDate(at: number, lang: Lang): string {
  try {
    return new Date(at).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [humanSide, setHumanSide] = useState<Side>('red');
  const [state, setState] = useState<GameState>(() => setup('red'));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [chain, setChain] = useState<number[]>([]);
  const [hintMove, setHintMove] = useState<Move | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => loadSound());
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);

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
  const recordedRef = useRef(false);

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    saveSound(soundOn);
  }, [soundOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!guestRoom) return;
    setScreen('lan');
    setMode('lan-guest');
  }, [guestRoom]);

  const finish = useCallback(
    (next: GameState, currentMode: Mode) => {
      if (next.status === 'playing' || recordedRef.current) return;
      recordedRef.current = true;
      if (currentMode !== 'lan-host' && currentMode !== 'lan-guest') {
        setRecord(recordResult(next));
        clearSave();
        setSaved(null);
      }
      if (soundOn) chime(next.status === 'draw' ? 'draw' : 'win');
    },
    [soundOn],
  );

  const commit = useCallback(
    (next: GameState, currentMode: Mode, previous: GameState) => {
      setHistory((items) => [...items, previous]);
      setState(next);
      setSelected(null);
      setChain([]);
      setHintMove(null);
      if (soundOn && next.status === 'playing') {
        chime((next.lastMove?.captures.length ?? 0) > 0 ? 'capture' : 'move');
      }
      finish(next, currentMode);
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.status === 'playing') {
          saveGame({ state: next, mode: currentMode, level, humanSide });
        } else {
          clearSave();
        }
        setSaved(null);
      }
      if (currentMode === 'lan-host' && hostRef.current) {
        hostRef.current.sendView(1, view(next, 1));
        if (next.status !== 'playing') hostRef.current.sendResult(view(next, 1));
      }
    },
    [finish, humanSide, level, soundOn],
  );

  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  const isGuest = mode === 'lan-guest';
  const localLegal = useMemo(() => legalMoves(state), [state]);
  const shownBoard = isGuest && guestView ? guestView.board : state.board;
  const shownLegalMoves = isGuest
    ? (guestView?.legalMoves ?? [])
    : localLegal;
  const shownTurn = isGuest && guestView ? guestView.turn : state.turn;
  const shownStatus = isGuest && guestView ? guestView.status : state.status;
  const shownWinner = isGuest && guestView ? guestView.winner : state.winner;
  const shownWinReason = isGuest && guestView ? guestView.winReason : state.winReason;
  const shownDrawReason = isGuest && guestView ? guestView.drawReason : state.drawReason;
  const shownLast = isGuest && guestView ? guestView.lastMove : state.lastMove;
  const shownPlies = isGuest && guestView ? guestView.plies : state.plies;
  const shownSeat = guestView?.seat ?? 0;
  const aiSide: Side = humanSide === 'red' ? 'white' : 'red';
  const boardFlipped =
    (mode === 'ai' && humanSide === 'white') || (isGuest && shownSeat === 1);

  const displayStatus =
    isGuest && !guestStarted
      ? tr('lanGuestWait')
      : statusText(lang, shownStatus, shownTurn, shownWinner);
  const myTurn =
    shownStatus === 'playing' &&
    (mode === 'ai'
      ? shownTurn === humanSide
      : mode === 'local'
        ? true
        : mode === 'lan-host'
          ? shownTurn === 'red'
          : Boolean(guestView?.canMove) && guestStarted);
  const turnHeadline =
    mode === 'local' ? statusText(lang, shownStatus, shownTurn, shownWinner) : myTurn ? tr('yourTurn') : displayStatus;
  const deviceHint =
    shownStatus === 'playing'
      ? t(lang, 'passDevice', {
          side: shownTurn === 'red' ? tr('red') : tr('white'),
        })
      : tr('gameOver');
  const chipSide: Side =
    shownStatus === 'won' ? (shownWinner ?? shownTurn) : shownTurn;
  const winnerLabel =
    shownStatus === 'won'
      ? tr(shownWinner === 'red' ? 'redWinsTitle' : 'whiteWinsTitle')
      : shownStatus === 'draw'
        ? tr('drawTitle')
        : '';
  const detailLabel = detailText(lang, {
    status: shownStatus,
    winReason: shownWinReason,
    drawReason: shownDrawReason,
  });
  const levelLabel = t(lang, level as MessageKey);
  const modeLabel =
    mode === 'ai'
      ? t(lang, 'modeAi', { level: levelLabel })
      : mode === 'local'
        ? tr('modeLocal')
        : mode === 'lan-host'
          ? tr('modeHost')
          : tr('modeGuest');

  const hostCanPlay = mode === 'lan-host' ? Boolean(lanPlayers[1]?.connected) : true;
  const guestCanPlay = Boolean(guestView?.canMove) && guestStarted;
  const disabled =
    shownStatus !== 'playing' ||
    (isGuest && !guestCanPlay) ||
    (mode === 'lan-host' && !hostCanPlay) ||
    (mode === 'ai' && (shownTurn === aiSide || aiThinking));

  useEffect(() => {
    setSelected(null);
    setChain([]);
    setHintMove(null);
  }, [mode, shownPlies, shownStatus, shownTurn]);

  const playMove = useCallback(
    (move: Move) => {
      if (mode === 'lan-guest') {
        if (
          guestView?.canMove &&
          guestView.legalMoves.some((candidate) => sameMove(candidate, move))
        ) {
          guest?.sendIntent({ type: 'move', move });
        }
        return;
      }
      if (mode === 'lan-host' && !lanPlayers[1]?.connected) return;
      const result =
        mode === 'lan-host' ? applySeat(state, 0, move) : apply(state, move);
      if (!result.ok) return;
      commit(result.state, mode, state);
    },
    [commit, guest, guestView, lanPlayers, mode, state],
  );

  const onSquare = useCallback(
    (index: number) => {
      const moves = isGuest ? (guestView?.legalMoves ?? []) : legalMoves(state);
      if (selected === null) {
        if (moves.some((move) => move.from === index)) {
          setSelected(index);
          setChain([index]);
          setHintMove(null);
        }
        return;
      }
      const candidates = moves.filter(
        (move) =>
          move.from === selected &&
          chain.every((square, position) => move.path[position] === square),
      );
      const nextMoves = candidates.filter((move) => move.path[chain.length] === index);
      if (nextMoves.length > 0) {
        const nextChain = [...chain, index];
        const complete = nextMoves.find((move) => move.path.length === nextChain.length);
        if (complete) {
          playMove(complete);
          return;
        }
        setChain(nextChain);
        return;
      }
      if (index === selected && chain.length === 1) {
        setSelected(null);
        setChain([]);
        setHintMove(null);
        return;
      }
      if (chain.length > 1) {
        setToast(tr('chainHint'));
        return;
      }
      if (moves.some((move) => move.from === index)) {
        setSelected(index);
        setChain([index]);
        setHintMove(null);
        return;
      }
      setSelected(null);
      setChain([]);
      setHintMove(null);
    },
    [chain, guestView, isGuest, playMove, selected, state, tr],
  );

  const showHint = useCallback(() => {
    if (shownStatus !== 'playing' || isGuest) return;
    if (mode === 'ai' && shownTurn === aiSide) return;
    const choice = chooseWithReason(state, 'hard', Math.random);
    if (!choice) return;
    setHintMove(choice.move);
    setSelected(choice.move.from);
    setChain(choice.move.path.slice(0, -1));
    setToast(t(lang, reasonKey(choice.reason)));
  }, [aiSide, isGuest, lang, mode, shownStatus, shownTurn, state]);

  const undo = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') return;
    if (history.length === 0 || shownStatus !== 'playing') return;
    const items = history.slice();
    let previous = items.pop();
    if (!previous) return;
    if (mode === 'ai') {
      while (previous.turn !== humanSide && items.length > 0) {
        const earlier = items.pop();
        if (!earlier) break;
        previous = earlier;
      }
      if (!previous || previous.turn !== humanSide) return;
    }
    setHistory(items);
    setState(previous);
    setSelected(null);
    setChain([]);
    setHintMove(null);
    recordedRef.current = false;
    saveGame({ state: previous, mode, level, humanSide });
    setSaved(null);
  }, [history, humanSide, level, mode, shownStatus]);

  const closeLan = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanInvite('');
    setLanQr('');
    setLanError('');
    guest?.close();
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
  }, [guest]);

  const goHome = useCallback(() => {
    closeLan();
    setSaved(loadSave());
    setScreen('home');
  }, [closeLan]);

  const startLocal = (nextMode: 'ai' | 'local') => {
    const next = setup('red');
    setMode(nextMode);
    setState(next);
    setHistory([]);
    setSelected(null);
    setChain([]);
    setHintMove(null);
    setAiThinking(false);
    recordedRef.current = false;
    setScreen('game');
    clearSave();
    setSaved(null);
  };

  const resume = () => {
    if (!saved) return;
    setMode(saved.mode);
    setLevel(saved.level);
    setHumanSide(saved.humanSide);
    setState(saved.state);
    setHistory([]);
    setSelected(null);
    setChain([]);
    setHintMove(null);
    setAiThinking(false);
    recordedRef.current = saved.state.status !== 'playing';
    setScreen('game');
    setSaved(null);
  };

  const resetHostGame = () => {
    if (!lanHost) return;
    const next = setup('red');
    setState(next);
    setHistory([]);
    setSelected(null);
    setChain([]);
    setHintMove(null);
    setAiThinking(false);
    recordedRef.current = false;
    setScreen('game');
    lanHost.start();
    lanHost.sendView(1, view(next, 1));
  };

  const startLan = () => {
    if (!lanHost) return;
    resetHostGame();
  };

  const openLanHost = async () => {
    closeLan();
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
        const payload = intent as { type?: string; move?: unknown } | null;
        if (!payload || payload.type !== 'move' || !isMove(payload.move)) return;
        const current = stateRef.current;
        const result = applySeat(current, seat, payload.move);
        if (!result.ok) return;
        commitRef.current(result.state, 'lan-host', current);
      });
      host.onClose(() => setLanError(t(lang, 'lanClosed')));
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#1f2a26', light: '#fffdf6' },
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
      const message = error instanceof Error ? error.message : '';
      setLanError(
        message === 'room-full'
          ? tr('lanFull')
          : message === 'wrong-code'
            ? tr('lanWrong')
            : tr('lanDisconnected'),
      );
    } finally {
      setGuestConnecting(false);
    }
  };

  // The AI takes the side the human did not choose, after a short pause.
  useEffect(() => {
    if (screen !== 'game' || mode !== 'ai') return;
    if (state.status !== 'playing' || state.turn === humanSide) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const choice = chooseWithReason(state, level, Math.random);
      setAiThinking(false);
      if (!choice) return;
      const result = apply(state, choice.move);
      if (!result.ok) return;
      commit(result.state, 'ai', state);
    }, 420);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, humanSide, level, mode, screen, state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (screen !== 'game') {
        goHome();
        return;
      }
      if (selected !== null) {
        setSelected(null);
        setChain([]);
        setHintMove(null);
        return;
      }
      goHome();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goHome, screen, selected]);

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">FAMILY ARCADE · 04</p>
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
          <div className="hero-frame">
            <MiniBoard board={HERO_BOARD} />
          </div>
          <div className="hero-caption">
            <span>{tr('red')}</span>
            <span className="dot">·</span>
            <span>8 × 8</span>
            <span className="dot">·</span>
            <span>{tr('white')}</span>
          </div>
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>
                  {saved.state.plies === 1
                    ? tr('moveOne')
                    : t(lang, 'moveCount', { count: saved.state.plies })}{' '}
                  ·{' '}
                  {saved.mode === 'ai'
                    ? t(lang, 'modeAi', { level: t(lang, saved.level as MessageKey) })
                    : tr('modeLocal')}
                </small>
              </button>
            )}
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={() => setScreen('setup')}>
              {tr('playAi')}
            </button>
            <button className="secondary wide" onClick={() => startLocal('local')}>
              {tr('playLocal')}
            </button>
            <button className="secondary wide" onClick={() => void openLanHost()}>
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
            <span>{record.redWins} {tr('red')}</span>
            <span className="dot">·</span>
            <span>{record.whiteWins} {tr('white')}</span>
            <span className="dot">·</span>
            <span>{record.draws} {record.draws === 1 ? tr('drawOne') : tr('draws')}</span>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell setup-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('difficulty')}</h2>
      <div className="level-grid">
        {AI_META.map((item) => (
          <button
            key={item.id}
            className={`level-card ${level === item.id ? 'selected' : ''}`}
            onClick={() => setLevel(item.id)}
          >
            <span className={`level-dot ${item.id}`} />
            <strong>{tr(item.label)}</strong>
            <small>{tr(item.note)}</small>
          </button>
        ))}
      </div>
      <h3 className="section-label">{tr('chooseSide')}</h3>
      <div className="side-choice">
        <button
          className={`side-option ${humanSide === 'red' ? 'selected' : ''}`}
          onClick={() => setHumanSide('red')}
        >
          <PieceDisc piece="r" />
          <span>
            <strong>{tr('red')}</strong>
            <small>{tr('redOpens')}</small>
          </span>
        </button>
        <button
          className={`side-option ${humanSide === 'white' ? 'selected' : ''}`}
          onClick={() => setHumanSide('white')}
        >
          <PieceDisc piece="w" />
          <span>
            <strong>{tr('white')}</strong>
            <small>{tr('whiteChoiceHint')}</small>
          </span>
        </button>
      </div>
      <div className="row-actions">
        <button className="primary" onClick={() => startLocal('ai')}>{tr('begin')}</button>
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
          <span>{modeLabel}</span>
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

      <div className="game-layout">
        <section className="board-wrap">
          <div className="turn-bar">
            <span className={`turn-chip ${chipSide}`}>
              <PieceDisc piece={chipSide === 'red' ? 'r' : 'w'} small />
            </span>
            <div>
              <strong>{turnHeadline}</strong>
              <p>
                {mode === 'ai'
                  ? t(lang, 'modeAi', { level: levelLabel })
                  : mode === 'local'
                    ? deviceHint
                    : mode === 'lan-host'
                      ? tr('hostSeatLong')
                      : tr('lanGuestSeatLong')}
              </p>
            </div>
            {aiThinking && <span className="thinking">{tr('aiThinking')}</span>}
          </div>

          <Board
            board={shownBoard}
            legalMoves={shownLegalMoves}
            selected={selected}
            chain={chain}
            hintPath={hintMove?.path ?? []}
            lastMove={shownLast}
            flipped={boardFlipped}
            disabled={disabled}
            label={tr('title')}
            onSquare={onSquare}
          />

          {shownStatus !== 'playing' && (
            <div className="result-banner">
              <div>
                <strong>{winnerLabel}</strong>
                <p>{detailLabel}</p>
              </div>
              {mode === 'lan-host' ? (
                <button className="primary" onClick={resetHostGame}>{tr('restart')}</button>
              ) : mode === 'lan-guest' ? (
                <span className="muted">{tr('lanGuestWait')}</span>
              ) : (
                <button
                  className="primary"
                  onClick={() => startLocal(mode === 'ai' ? 'ai' : 'local')}
                >
                  {tr('restart')}
                </button>
              )}
            </div>
          )}
          {toast && <div className="toast">{toast}</div>}
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{mode === 'ai' ? tr('difficulty') : tr('side')}</h3>
            <p>
              {mode === 'ai'
                ? `${levelLabel} · ${humanSide === 'red' ? tr('red') : tr('white')}`
                : mode === 'local'
                  ? deviceHint
                  : mode === 'lan-host'
                    ? tr('lanHostSeat')
                    : tr('lanGuestSeat')}
            </p>
            <div className="side-actions">
              <button
                className="secondary"
                onClick={undo}
                disabled={
                  history.length === 0 ||
                  shownStatus !== 'playing' ||
                  mode === 'lan-host' ||
                  mode === 'lan-guest'
                }
              >
                {tr('undo')}
              </button>
              <button
                className="secondary"
                onClick={showHint}
                disabled={
                  shownStatus !== 'playing' ||
                  isGuest ||
                  (mode === 'ai' && shownTurn === aiSide)
                }
              >
                {tr('hint')}
              </button>
            </div>
            <p className="key-hint">{tr('keyboardHint')}</p>
          </div>

          <div className="side-card">
            <h3>{tr('lastMove')}</h3>
            <p className="move-line">{shownLast ? moveName(shownLast) : tr('noMoves')}</p>
            <p>
              {shownPlies === 1 ? tr('moveOne') : t(lang, 'moveCount', { count: shownPlies })}
            </p>
          </div>

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <h3>{tr('lanCode')}</h3>
              <div className="room-code">{lanCode}</div>
              <p>{lanPlayers[1]?.connected ? tr('lanReady') : tr('lanWaiting')}</p>
              {lanPlayers[1] && (
                <p className="peer">
                  {lanPlayers[1].name} · {lanPlayers[1].connected ? tr('online') : tr('offline')}
                </p>
              )}
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('stats')}</h3>
            <p>
              {record.games} {record.games === 1 ? tr('gameOne') : tr('games')} ·{' '}
              {record.redWins} {tr('red')} · {record.whiteWins} {tr('white')} ·{' '}
              {record.draws} {record.draws === 1 ? tr('drawOne') : tr('draws')}
            </p>
            <button className="text-button" onClick={() => setScreen('record')}>
              {tr('openRecord')} →
            </button>
          </div>
        </aside>
      </div>
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>← {tr('back')}</button>
      {mode === 'lan-guest' || guestRoom ? (
        <>
          <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
          <p className="lede">{tr('room')} {guestRoom}</p>
          {!guestStarted ? (
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
                onClick={() => void joinGuest()}
                disabled={guestConnecting || !guestName.trim()}
              >
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
            </div>
          ) : (
            <p className="lede">{tr('lanGuestSeatLong')}</p>
          )}
          {lanError && <p className="error">{lanError}</p>}
          {guestStarted && (
            <button className="primary" onClick={() => setScreen('game')}>{tr('lanStart')}</button>
          )}
        </>
      ) : (
        <>
          <h2 className="screen-title">{tr('lanTitle')}</h2>
          <p className="lede">{tr('lanHost')}</p>
          {lanBusy && <p className="lede">{tr('lanStarting')}</p>}
          {lanError && <p className="error">{lanError}</p>}
          {lanInfo && lanInvite && (
            <div className="lan-layout">
              <div className="lan-card">
                <span className="label">{tr('lanCode')}</span>
                <div className="room-code big">{lanCode}</div>
                <p>{lanPlayers[1]?.connected ? tr('lanReady') : tr('lanWaiting')}</p>
                <div className="peer-list">
                  {lanPlayers.slice(0, 2).map((player) => (
                    <span key={player.seat} className={player.connected ? 'online' : ''}>
                      {player.name} {player.connected ? '●' : '○'}
                    </span>
                  ))}
                </div>
                <button
                  className="primary wide"
                  onClick={startLan}
                  disabled={!lanPlayers[1]?.connected}
                >
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
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <ol className="rules-list">
        <li>{tr('rule1')}</li>
        <li>{tr('rule2')}</li>
        <li>{tr('rule3')}</li>
        <li>{tr('rule4')}</li>
        <li>{tr('rule5')}</li>
        <li>{tr('rule6')}</li>
      </ol>
      <div className="rules-legend">
        <span><PieceDisc piece="r" small /> {tr('red')}</span>
        <span><PieceDisc piece="w" small /> {tr('white')}</span>
        <span><PieceDisc piece="R" small /> {tr('promotion')}</span>
      </div>
      <button className="primary" onClick={() => setScreen('home')}>{tr('close')}</button>
    </main>
  );

  const recordScreen = (
    <main className="shell narrow-shell record-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('recordTitle')}</h2>
      <p className="lede">{tr('recordLede')}</p>
      <div className="stat-grid">
        <div className="stat-card">
          <span>{tr('statGames')}</span>
          <strong>{record.games}</strong>
        </div>
        <div className="stat-card red">
          <span>{tr('statRed')}</span>
          <strong>{record.redWins}</strong>
        </div>
        <div className="stat-card white">
          <span>{tr('statWhite')}</span>
          <strong>{record.whiteWins}</strong>
        </div>
        <div className="stat-card draw">
          <span>{tr('statDraws')}</span>
          <strong>{record.draws}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('streak')}</span>
          <strong>{record.streak || tr('noStreak')}</strong>
        </div>
      </div>
      <h3 className="section-label">{tr('recent')}</h3>
      {record.recent.length === 0 ? (
        <p className="lede">{tr('recordEmpty')}</p>
      ) : (
        <ol className="recent-list">
          {record.recent.slice().reverse().map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <span className={`result-chip ${entry.winner}`}>
                {entry.winner === 'red'
                  ? tr('recordRed')
                  : entry.winner === 'white'
                    ? tr('recordWhite')
                    : tr('recordDraw')}
              </span>
              <span>{formatDate(entry.at, lang)}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="row-actions">
        <button
          className="secondary"
          onClick={() => {
            setRecord(clearRecord());
            setToast(tr('recordCleared'));
          }}
        >
          {tr('resetRecord')}
        </button>
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
