import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import {
  chooseMove,
  explainMove,
  routeCosts,
  type AiLevel,
  type HintReason,
} from './ai/ai';
import { Board } from './components/Board';
import {
  apply,
  applySeat,
  colOf,
  rowOf,
  setup,
  view,
  type Cell,
  type GameState,
  type Player,
} from './game/hex';
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
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'lan' | 'stats';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';

const LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const HINT_KEYS: Record<HintReason, MessageKey> = {
  win: 'hintReasonWin',
  block: 'hintReasonBlock',
  connect: 'hintReasonConnect',
  route: 'hintReasonRoute',
  center: 'hintReasonCenter',
  space: 'hintReasonSpace',
};

const HERO_PATH = [
  0,
  1,
  12,
  13,
  24,
  35,
  36,
  47,
  58,
  59,
  70,
  81,
  82,
  93,
  104,
  115,
];
const HERO_BLUE = [3, 15, 26, 37, 48, 59, 72, 83, 96, 107, 118, 30, 44, 67, 90];

const HERO_BOARD: Cell[] = (() => {
  const board: Cell[] = Array<Cell>(121).fill(null);
  for (const cell of HERO_PATH) board[cell] = 'R';
  for (const cell of HERO_BLUE) if (board[cell] === null) board[cell] = 'B';
  return board;
})();

function Stone({ player, quiet }: { player: Player; quiet?: boolean }) {
  return (
    <span
      className={`stone stone-${player === 'R' ? 'red' : 'blue'}${quiet ? ' quiet' : ''}`}
      aria-hidden="true"
    />
  );
}

function playerClass(player: Player): string {
  return player === 'R' ? 'red' : 'blue';
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
  const [humanSide, setHumanSide] = useState<Player>('R');
  const [state, setState] = useState<GameState>(() => setup('R'));
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<{ index: number; reason: HintReason } | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.hex.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [recorded, setRecorded] = useState(false);

  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<ReturnType<typeof view> | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => guestParams()?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => guestParams()?.code ?? '');
  const [guestRoom] = useState(() => guestParams()?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);

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
    try {
      localStorage.setItem('familyarcade.hex.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const finish = useCallback(
    (next: GameState, currentMode: Mode) => {
      if (next.status === 'playing' || recorded) return;
      setRecorded(true);
      if (currentMode !== 'lan-host' && currentMode !== 'lan-guest') {
        setRecord(recordResult(next));
        clearSave();
        setSaved(null);
      }
      if (soundOn) chime('win');
    },
    [recorded, soundOn],
  );

  const commit = useCallback(
    (next: GameState, currentMode: Mode, previous: GameState) => {
      stateRef.current = next;
      setHistory((items) => [...items, previous]);
      setState(next);
      setHint(null);
      if (soundOn) chime('place');
      finish(next, currentMode);
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.status === 'playing') {
          const persisted = saveGame({ state: next, mode: currentMode, level, humanSide });
          setSaved(persisted);
        }
      }
      if (currentMode === 'lan-host' && hostRef.current) {
        hostRef.current.sendView(1, view(next, 1));
        if (next.status !== 'playing') hostRef.current.sendResult(view(next, 1));
      }
    },
    [finish, humanSide, level, soundOn],
  );

  const playAt = useCallback(
    (index: number) => {
      if (mode === 'lan-guest') {
        if (guestStarted && guestView?.canMove && guestView.board[index] === null) {
          guest?.sendIntent({ type: 'place', index });
        }
        return;
      }
      if (mode === 'lan-host' && !lanPlayers[1]?.connected) return;
      if (mode === 'ai' && (state.turn !== humanSide || aiThinking)) return;
      const result =
        mode === 'lan-host' ? applySeat(state, 0, index) : apply(state, index);
      if (!result.ok) return;
      commit(result.state, mode, state);
    },
    [aiThinking, commit, guest, guestStarted, guestView, humanSide, lanPlayers, mode, state],
  );

  // The AI answers whenever it owns the turn.
  useEffect(() => {
    if (mode !== 'ai' || state.status !== 'playing' || state.turn === humanSide) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseMove(state, level);
      setAiThinking(false);
      if (move < 0) return;
      const result = apply(state, move);
      if (!result.ok) return;
      commit(result.state, 'ai', state);
    }, 460);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, humanSide, level, mode, state]);

  const saveCurrent = useCallback(
    (next: GameState, nextMode: Mode) => {
      if (nextMode !== 'ai' && nextMode !== 'local') return;
      if (next.status !== 'playing') return;
      setSaved(saveGame({ state: next, mode: nextMode, level, humanSide }));
    },
    [humanSide, level],
  );

  const startGame = useCallback(
    (nextMode: 'ai' | 'local') => {
      const next = setup('R');
      stateRef.current = next;
      setMode(nextMode);
      setState(next);
      setHistory([]);
      setHint(null);
      setRecorded(false);
      setAiThinking(false);
      setScreen('game');
      clearSave();
      setSaved(null);
    },
    [],
  );

  const restart = useCallback(() => {
    const next = setup('R');
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setHint(null);
    setRecorded(false);
    setAiThinking(false);
    setScreen('game');
    if (mode === 'lan-host' && lanHost) {
      lanHost.sendView(1, view(next, 1));
    } else if (mode === 'ai' || mode === 'local') {
      clearSave();
      setSaved(null);
    }
  }, [lanHost, mode]);

  const resume = () => {
    if (!saved) return;
    stateRef.current = saved.state;
    setMode(saved.mode);
    setLevel(saved.level);
    setHumanSide(saved.humanSide);
    setState(saved.state);
    setHistory([]);
    setHint(null);
    setRecorded(false);
    setScreen('game');
  };

  const undo = useCallback(() => {
    if (mode === 'lan-guest' || state.status !== 'playing' || history.length === 0) return;
    let steps = 1;
    if (mode === 'ai' && state.turn === humanSide && history.length >= 2) steps = 2;
    const target = history[history.length - steps];
    if (!target) return;
    stateRef.current = target;
    setHistory((items) => items.slice(0, -steps));
    setState(target);
    setHint(null);
    setRecorded(false);
    if (target.moves.length === 0) {
      clearSave();
      setSaved(null);
    } else {
      saveCurrent(target, mode);
    }
    if (mode === 'lan-host' && hostRef.current) {
      hostRef.current.sendView(1, view(target, 1));
    }
  }, [history, humanSide, mode, saveCurrent, state.status, state.turn]);

  const showHint = useCallback(() => {
    if (state.status !== 'playing' || mode === 'lan-guest') return;
    if (mode === 'ai' && state.turn !== humanSide) return;
    if (mode === 'lan-host' && !lanPlayers[1]?.connected) return;
    const move = chooseMove(state, 'hard');
    if (move < 0) return;
    setHint({ index: move, reason: explainMove(state, move) });
    setToast(tr('hintText'));
  }, [humanSide, lanPlayers, mode, state, tr]);

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
    setMode('ai');
  }, [guest]);

  const goHome = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') closeLan();
    setScreen('home');
  }, [closeLan, mode]);

  // Auto-join when the URL contains a room.
  useEffect(() => {
    if (!guestRoom) return;
    setScreen('lan');
    setMode('lan-guest');
  }, [guestRoom]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.matches('input, textarea, select') || target.isContentEditable)) return;
      if (event.key === 'Escape') {
        if (screen !== 'home') goHome();
        return;
      }
      if (screen !== 'game') return;
      const key = event.key.toLowerCase();
      if (key === 'm') {
        setSoundOn((value) => !value);
        return;
      }
      if (key === 'u') {
        event.preventDefault();
        undo();
      } else if (key === 'h') {
        event.preventDefault();
        showHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goHome, screen, showHint, undo]);

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
        const index = Number((intent as { index?: number } | null)?.index);
        if (!Number.isInteger(index)) return;
        const current = stateRef.current;
        const result = applySeat(current, seat, index);
        if (!result.ok) return;
        commit(result.state, 'lan-host', current);
      });
      host.onClose(() => setLanError(tr('lanClosed')));
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#10202a', light: '#f4efe3' },
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
    const next = setup('R');
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setHint(null);
    setRecorded(false);
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
      joined.onView((payload) => setGuestView(payload as ReturnType<typeof view>));
      joined.onStart(() => {
        setGuestStarted(true);
        setScreen('game');
      });
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? tr('lanFull') : tr('lanWrong'));
      });
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
  };

  const shownBoard = guestView?.board ?? state.board;
  const shownPath = guestView?.path ?? state.path;
  const shownStatus = guestView?.status ?? state.status;
  const shownWinner = guestView?.winner ?? state.winner;
  const shownTurn = guestView?.turn ?? state.turn;
  const shownLast = guestView?.lastMove ?? (state.moves.length ? state.moves[state.moves.length - 1] : null);
  const shownMoveCount = guestView?.moveCount ?? state.moves.length;
  const isGuest = mode === 'lan-guest';
  const guestCanPlay = Boolean(guestView?.canMove) && guestStarted;
  const hostConnected = Boolean(lanPlayers[1]?.connected);
  const disabled =
    screen !== 'game' ||
    shownStatus !== 'playing' ||
    (isGuest && !guestCanPlay) ||
    (mode === 'lan-host' && !hostConnected) ||
    (mode === 'ai' && (shownTurn !== humanSide || aiThinking));
  const canUndo =
    mode !== 'lan-guest' && state.status === 'playing' && history.length > 0;
  const canHint =
    state.status === 'playing' &&
    mode !== 'lan-guest' &&
    !(mode === 'ai' && state.turn !== humanSide) &&
    !(mode === 'lan-host' && !hostConnected);
  const costs = useMemo(() => routeCosts(shownBoard), [shownBoard]);
  const humanName = humanSide === 'R' ? tr('red') : tr('blue');
  const aiSide: Player = humanSide === 'R' ? 'B' : 'R';
  const aiName = aiSide === 'R' ? tr('red') : tr('blue');
  const winnerText = shownWinner ? tr(shownWinner === 'R' ? 'redWins' : 'blueWins') : '';
  const resultNote =
    shownWinner === 'R' ? tr('redConnects') : shownWinner === 'B' ? tr('blueConnects') : '';

  let headline: string;
  if (shownStatus === 'won') {
    headline = winnerText;
  } else if (mode === 'ai') {
    headline = state.turn === humanSide ? tr('yourTurn') : tr('statusAiThinking');
  } else if (isGuest) {
    headline = guestCanPlay ? tr('statusGuestTurn') : tr('turnRed');
  } else if (mode === 'lan-host') {
    headline = !hostConnected
      ? tr('statusHostWaiting')
      : state.turn === 'R'
        ? tr('statusHostTurn')
        : tr('turnBlue');
  } else {
    headline = shownTurn === 'R' ? tr('turnRed') : tr('turnBlue');
  }

  let subline: string;
  if (shownStatus === 'won') subline = '';
  else if (mode === 'ai') subline = `${tr('you')}: ${humanName} · ${tr('ai')}: ${aiName}`;
  else if (mode === 'local') subline = `${tr('redGoal')} / ${tr('blueGoal')}`;
  else if (mode === 'lan-host') subline = tr('lanHostSeat');
  else subline = tr('lanGuestSeat');

  const levelLabel = tr(level);
  const modeLabel =
    mode === 'ai'
      ? `${tr('modeAi')} · ${levelLabel}`
      : mode === 'local'
        ? tr('modeLocal')
        : mode === 'lan-host'
          ? tr('modeHost')
          : tr('modeGuest');

  const routePercent = (value: number) =>
    !Number.isFinite(value)
      ? 0
      : value <= 0
        ? 100
        : Math.max(4, Math.min(100, ((11 - value) / 11) * 100));
  const routeLabel = (value: number) =>
    value === 0 ? tr('connected') : Number.isFinite(value) ? String(value) : tr('blocked');

  const hintText = hint ? tr(HINT_KEYS[hint.reason]) : tr('coachIdle');
  const hintLabel = hint
    ? `${tr('hint')} · R${rowOf(hint.index) + 1} · C${colOf(hint.index) + 1}`
    : '';

  const recordShare = record.games ? Math.round((record.redWins / record.games) * 100) : 0;

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('eyebrow')}</p>
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
        <div className="hero-board" aria-hidden="true">
          <Board
            board={HERO_BOARD}
            path={HERO_PATH}
            last={HERO_PATH[HERO_PATH.length - 1]}
            hint={null}
            disabled
            onCell={() => undefined}
            lang={lang}
          />
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && saved.state.status === 'playing' && (
              <button className="primary wide continue-card" onClick={resume}>
                <span>{tr('continue')}</span>
                <small>
                  {saved.mode === 'ai' ? `${tr('modeAi')} · ${tr(saved.level)}` : tr('modeLocal')}
                </small>
              </button>
            )}
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={() => setScreen('setup')}>
              {tr('playAi')}
            </button>
            <button className="secondary wide" onClick={() => startGame('local')}>
              {tr('playLocal')}
            </button>
            <button className="secondary wide" onClick={openLanHost}>
              {tr('playLan')}
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
          <div className="fact-row">
            <span>{tr('factBoard')}</span>
            <span>{tr('factPlayers')}</span>
            <span>{tr('factAi')}</span>
          </div>
          <div className="record-strip">
            <span>{tr('stats')}</span>
            <strong>{record.games}</strong>
            <span>{record.games === 1 ? tr('gameOne') : tr('games')}</span>
            <span className="dot">·</span>
            <span className="red-text">{record.redWins} {tr('red')}</span>
            <span className="dot">·</span>
            <span className="blue-text">{record.blueWins} {tr('blue')}</span>
            {record.streak > 1 && (
              <>
                <span className="dot">·</span>
                <span>{record.streak} {tr('streak')}</span>
              </>
            )}
          </div>
        </div>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell setup-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <div className="setup-grid">
        <section>
          <p className="eyebrow">{tr('modeAi')}</p>
          <h2 className="screen-title">{tr('difficulty')}</h2>
          <p className="lede">{tr('setupLead')}</p>
          <div className="level-grid">
            {LEVELS.map((item) => (
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
        </section>
        <aside className="setup-side">
          <div className="side-card side-picker">
            <h3>{tr('playAs')}</h3>
            {(['R', 'B'] as const).map((side) => (
              <button
                key={side}
                className={`side-choice ${side === 'R' ? 'red' : 'blue'} ${
                  humanSide === side ? 'selected' : ''
                }`}
                onClick={() => setHumanSide(side)}
              >
                <Stone player={side} />
                <span>
                  <strong>
                    {tr(side === 'R' ? 'red' : 'blue')} · {tr(side === 'R' ? 'redGoal' : 'blueGoal')}
                  </strong>
                  <small>{tr(side === 'R' ? 'playedFirst' : 'sideHint')}</small>
                </span>
              </button>
            ))}
          </div>
          <button className="primary wide" onClick={() => startGame('ai')}>
            {tr('begin')}
          </button>
        </aside>
      </div>
    </main>
  );

  const gameScreen = (
    <main className="shell game-shell">
      <header className="game-top">
        <button className="back" onClick={goHome}>
          ← {tr('home')}
        </button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>{modeLabel}</span>
        </div>
        <div className="game-actions">
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
            <span className={`turn-chip ${playerClass((shownWinner ?? shownTurn) as Player)}`}>
              <Stone player={(shownWinner ?? shownTurn) as Player} />
            </span>
            <div>
              <strong>{headline}</strong>
              {subline && <p>{subline}</p>}
            </div>
            {aiThinking && <span className="thinking">···</span>}
          </div>

          <Board
            board={shownBoard}
            path={shownPath}
            last={shownLast}
            hint={hint?.index ?? null}
            disabled={disabled}
            onCell={playAt}
            lang={lang}
          />

          <div className="game-meta">
            <span>
              {tr('moves')} <strong>{shownMoveCount}</strong>
            </span>
            {shownLast !== null && (
              <span>
                {tr('lastMove')}{' '}
                <strong>
                  R{rowOf(shownLast) + 1} · C{colOf(shownLast) + 1}
                </strong>
              </span>
            )}
            {mode !== 'local' && (
              <span className="mode-goal">{tr('redGoal')} / {tr('blueGoal')}</span>
            )}
          </div>

          {shownStatus === 'won' && (
            <div className="result-banner">
              <div>
                <p className="result-kicker">{tr('gameOver')}</p>
                <strong>
                  {tr('winnerBanner', {
                    winner: shownWinner === 'R' ? tr('red') : tr('blue'),
                  })}
                </strong>
                <p>{resultNote}</p>
                <p className="winning-note">{tr('winningPath')}</p>
              </div>
              {isGuest ? (
                <span className="muted">{tr('statusGuestWaiting')}</span>
              ) : (
                <button className="primary" onClick={restart}>
                  {tr('restart')}
                </button>
              )}
            </div>
          )}
        </section>

        <aside className="side">
          <div className="side-card coach-card">
            <h3>{tr('hintTitle')}</h3>
            {(shownStatus === 'playing' || hint) && (
              <p className={hint?.reason === 'block' ? 'hint-reason' : undefined}>{hintText}</p>
            )}
            <div className="side-actions">
              <button className="secondary" onClick={undo} disabled={!canUndo}>
                {tr('undo')}
              </button>
              <button className="secondary" onClick={showHint} disabled={!canHint}>
                {tr('hint')}
              </button>
            </div>
            <p className="keys">{tr('keyboardHint')}</p>
            <p className="keys small">{tr('keyboardShortcuts')}</p>
            {hint && <p className="hint-caption">{hintLabel}</p>}
          </div>

          <div className="side-card route-card">
            <h3>{tr('routeTitle')}</h3>
            <div className="route-row">
              <span className="route-name red-text">{tr('routeRed')}</span>
              <strong>{routeLabel(costs.red)}</strong>
            </div>
            <div className="route-bar red">
              <span style={{ width: `${routePercent(costs.red)}%` }} />
            </div>
            <div className="route-row">
              <span className="route-name blue-text">{tr('routeBlue')}</span>
              <strong>{routeLabel(costs.blue)}</strong>
            </div>
            <div className="route-bar blue">
              <span style={{ width: `${routePercent(costs.blue)}%` }} />
            </div>
            <p className="route-note">{tr('routeCostNote')}</p>
          </div>

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <h3>{tr('lanCode')}</h3>
              <div className="room-code">{lanCode}</div>
              <p>{hostConnected ? tr('lanReady') : tr('lanWaiting')}</p>
              {lanPlayers[1] && (
                <p className="peer">
                  {lanPlayers[1].name}
                  {lanPlayers[1].connected ? ` · ${tr('online')}` : ''}
                </p>
              )}
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('stats')}</h3>
            <p>
              {record.games} {record.games === 1 ? tr('gameOne') : tr('games')} · {record.redWins} {tr('red')} / {record.blueWins}{' '}
              {tr('blue')}
            </p>
            {mode !== 'lan-host' && mode !== 'lan-guest' && (
              <button className="text-button" onClick={() => setScreen('stats')}>
                {tr('stats')} →
              </button>
            )}
          </div>
        </aside>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell lan-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
      {mode === 'lan-guest' || guestRoom ? (
        <>
          <p className="eyebrow">{tr('lanRoom')} · {guestRoom}</p>
          <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
          <p className="lede">{tr('lanGuestNote')}</p>
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
            </div>
          )}
          {guestStarted && (
            <button className="primary" onClick={() => setScreen('game')}>
              {tr('lanEnter')}
            </button>
          )}
          {lanError && <p className="error">{lanError}</p>}
        </>
      ) : (
        <>
          <p className="eyebrow">{tr('lanTitle')}</p>
          <h2 className="screen-title">{tr('lanHost')}</h2>
          <p className="lede">{tr('lanHostNote')}</p>
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
    <main className="shell narrow-shell rules-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <p className="eyebrow">{tr('rules')}</p>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <p className="lede">{tr('rulesLead')}</p>
      <div className="goal-strip">
        <span className="goal-pill red">{tr('redSide')} · {tr('redGoal')}</span>
        <span className="goal-pill blue">{tr('blueSide')} · {tr('blueGoal')}</span>
      </div>
      <ol className="rules-list">
        <li>{tr('rule1')}</li>
        <li>{tr('rule2')}</li>
        <li>{tr('rule3')}</li>
        <li>{tr('rule4')}</li>
        <li>{tr('rule5')}</li>
      </ol>
      <p className="rule-note">{tr('ruleEdge')}</p>
      <button className="primary" onClick={() => setScreen('home')}>
        {tr('close')}
      </button>
    </main>
  );

  const statsScreen = (
    <main className="shell narrow-shell stats-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <p className="eyebrow">{tr('stats')}</p>
      <h2 className="screen-title">{tr('statsTitle')}</h2>
      <p className="lede">{tr('statsLead')}</p>
      <div className="stat-hero">
        <div className="stat-big">
          <strong>{record.games}</strong>
          <span>{tr('games')}</span>
        </div>
        <div className="stat-hero-side">
          <p>
            <span className="red-text">{tr('redWins')}</span>
            <strong>{record.redWins}</strong>
          </p>
          <p>
            <span className="blue-text">{tr('blueWins')}</span>
            <strong>{record.blueWins}</strong>
          </p>
          <p>
            <span>{tr('winRate')}</span>
            <strong>{recordShare}%</strong>
          </p>
          <p>
            <span>{tr('streak')}</span>
            <strong>{record.streak || '—'}</strong>
          </p>
        </div>
      </div>
      <div className="stats-body">
        <div className="side-card recent-card">
          <h3>{tr('recentGames')}</h3>
          {record.history.length === 0 ? (
            <p>{tr('statsEmpty')}</p>
          ) : (
            <ul className="recent-list">
              {record.history
                .slice()
                .reverse()
                .map((entry, index) => (
                  <li key={`${entry.at}-${index}`}>
                    <Stone player={entry.winner} quiet />
                    <span className="recent-winner">
                      {tr(entry.winner === 'R' ? 'redWins' : 'blueWins')}
                    </span>
                    <time>{formatDate(entry.at, lang)}</time>
                  </li>
                ))}
            </ul>
          )}
          <button className="text-button" onClick={() => setRecord(clearRecord())}>
            {tr('resetStats')}
          </button>
        </div>
        <div className="side-card share-card">
          <h3>{tr('winRate')}</h3>
          <div className="share-track">
            <span style={{ width: `${recordShare}%` }} />
          </div>
          <div className="share-labels">
            <span className="red-text">{record.redWins}</span>
            <span className="blue-text">{record.blueWins}</span>
          </div>
          <p>{tr('lastWinner')}: {record.lastWinner ? tr(record.lastWinner === 'R' ? 'red' : 'blue') : '—'}</p>
        </div>
      </div>
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'lan') return lanScreen;
  if (screen === 'stats') return statsScreen;
  return home;
}
