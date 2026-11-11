import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { AI_LEVELS, chooseHint, chooseMove, type AiLevel, type Hint } from './ai/ai';
import { Board, DiscGlyph } from './components/Board';
import {
  apply,
  applySeat,
  coord,
  counts,
  legalMoves,
  setup,
  view,
  type Cell,
  type GameState,
  type SeatView,
} from './game/flip';
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
  type Record as FamilyRecord,
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'stats' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';

const LEVEL_NOTE: Record<AiLevel, MessageKey> = {
  companion: 'companionHint',
  easy: 'easyHint',
  normal: 'normalHint',
  hard: 'hardHint',
};

const RULE_KEYS: MessageKey[] = ['rule1', 'rule2', 'rule3', 'rule4', 'rule5'];

/** A real, legal mid-game position used only as home-page art. */
const HERO_SEQUENCE = [
  37, 29, 20, 45, 38, 30, 53, 61, 18, 47, 22, 11, 54, 14, 15, 21, 4, 44, 62, 52, 46, 2, 43, 34,
  13, 55, 12, 39, 26, 3, 51, 42,
];

const HERO: GameState = (() => {
  let state = setup('B');
  for (const move of HERO_SEQUENCE) {
    const result = apply(state, move);
    if (result.ok) state = result.state;
  }
  return state;
})();

function modeName(lang: Lang, mode: Mode, level: AiLevel): string {
  if (mode === 'ai') return t(lang, 'modeAi', { level: t(lang, level) });
  if (mode === 'local') return t(lang, 'modeLocal');
  if (mode === 'lan-host') return t(lang, 'modeHost');
  return t(lang, 'modeGuest');
}

function hintText(lang: Lang, hint: Hint): string {
  if (hint.reason === 'corner') {
    return t(lang, 'hintCorner', { flips: hint.flips });
  }
  if (hint.reason === 'safe') {
    return t(lang, 'hintSafe', { own: hint.ownMoves });
  }
  if (hint.reason === 'flips') {
    return t(lang, 'hintFlips', { flips: hint.flips, opp: hint.oppMoves });
  }
  if (hint.reason === 'best') return t(lang, 'hintBest');
  return t(lang, 'hintMobility', { own: hint.ownMoves, opp: hint.oppMoves });
}

function lastResultName(lang: Lang, record: FamilyRecord): string {
  if (record.lastWinner === 'B') return t(lang, 'blackWins');
  if (record.lastWinner === 'W') return t(lang, 'whiteWins');
  if (record.lastWinner === 'draw') return t(lang, 'draw');
  return '—';
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup('B'));
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<Hint | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.flip.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [statsFrom, setStatsFrom] = useState<'home' | 'game'>('home');

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
  const soundOnRef = useRef(soundOn);

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

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
      localStorage.setItem('familyarcade.flip.sound', soundOn ? 'on' : 'off');
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
    if (!guestRoom) return;
    setScreen('lan');
    setMode('lan-guest');
  }, [guestRoom]);

  const finish = useCallback((next: GameState, currentMode: Mode) => {
    if (next.status === 'playing' || recordedRef.current) return;
    recordedRef.current = true;
    if (currentMode === 'ai' || currentMode === 'local') {
      setRecord(recordResult(next));
      clearSave();
      setSaved(null);
    }
  }, []);

  const commit = useCallback(
    (next: GameState, currentMode: Mode, previous: GameState) => {
      setHistory((items) => [...items, previous]);
      setState(next);
      stateRef.current = next;
      setHint(null);

      if (soundOnRef.current) {
        if (next.status !== 'playing') chime(next.status === 'draw' ? 'draw' : 'win');
        else if (next.passed) chime('pass');
        else chime('place');
      }

      finish(next, currentMode);

      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.status === 'playing') {
          saveGame({ state: next, mode: currentMode, level });
          setSaved({ version: 1, state: next, mode: currentMode, level, savedAt: Date.now() });
        } else {
          clearSave();
          setSaved(null);
        }
      }

      if (currentMode === 'lan-host' && hostRef.current) {
        hostRef.current.sendView(1, view(next, 1));
      }

      if (next.passed) {
        const passer = next.turn === 'B' ? tr('white') : tr('black');
        setToast(tr('passNotice', { name: passer }));
      }
    },
    [finish, level, tr],
  );

  const begin = useCallback((nextMode: 'ai' | 'local') => {
    const next = setup('B');
    setMode(nextMode);
    setState(next);
    stateRef.current = next;
    setHistory([]);
    setHint(null);
    setAiThinking(false);
    recordedRef.current = false;
    setScreen('game');
    setToast('');
    clearSave();
    setSaved(null);
  }, []);

  const resume = () => {
    if (!saved) return;
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    stateRef.current = saved.state;
    setHistory([]);
    setHint(null);
    setAiThinking(false);
    recordedRef.current = false;
    setScreen('game');
    setToast('');
  };

  const undo = () => {
    if (mode !== 'ai' && mode !== 'local') {
      setToast(tr('undoUnavailable'));
      return;
    }
    if (history.length === 0 || state.status !== 'playing') return;

    let previous: GameState;
    let nextHistory: GameState[];
    if (mode === 'ai') {
      let index = history.length - 1;
      while (index >= 0) {
        const candidate = history[index];
        if (candidate.status === 'playing' && candidate.turn === 'B') break;
        index -= 1;
      }
      if (index < 0) return;
      previous = history[index];
      nextHistory = history.slice(0, index);
    } else {
      previous = history[history.length - 1];
      nextHistory = history.slice(0, -1);
    }

    setHistory(nextHistory);
    setState(previous);
    stateRef.current = previous;
    setHint(null);
    setAiThinking(false);
    recordedRef.current = false;
    saveGame({ state: previous, mode, level });
    setSaved({ version: 1, state: previous, mode, level, savedAt: Date.now() });
    setToast('');
  };

  const showHint = () => {
    if (mode === 'lan-guest') {
      setToast(tr('hintUnavailable'));
      return;
    }
    if (state.status !== 'playing') return;
    if (mode === 'ai' && (state.turn !== 'B' || aiThinking)) {
      setToast(tr('hintUnavailable'));
      return;
    }
    if (mode === 'lan-host' && (state.turn !== 'B' || !lanPlayers[1]?.connected)) {
      setToast(tr('hintUnavailable'));
      return;
    }
    const next = chooseHint(state);
    if (next) setHint(next);
    else setToast(tr('noMoves'));
  };

  const canUndo =
    (mode === 'ai' || mode === 'local') && history.length > 0 && state.status === 'playing';

  const hintDisabled =
    state.status !== 'playing' ||
    mode === 'lan-guest' ||
    aiThinking ||
    (mode === 'ai' && state.turn !== 'B') ||
    (mode === 'lan-host' && (state.turn !== 'B' || !lanPlayers[1]?.connected));

  const playAt = useCallback(
    (index: number) => {
      if (screen !== 'game') return;

      if (mode === 'lan-guest') {
        if (!guest || !guestView || !guestView.canMove || guestView.status !== 'playing') return;
        if (!guestView.legal.includes(index)) {
          setToast(tr('illegal'));
          return;
        }
        guest.sendIntent({ type: 'place', index });
        return;
      }

      if (state.status !== 'playing') return;
      if (mode === 'ai' && (state.turn !== 'B' || aiThinking)) return;
      if (mode === 'lan-host' && (state.turn !== 'B' || !lanPlayers[1]?.connected)) return;
      if (!legalMoves(state).includes(index)) {
        setToast(tr('illegal'));
        return;
      }

      const result = mode === 'lan-host' ? applySeat(state, 0, index) : apply(state, index);
      if (!result.ok) return;
      commit(result.state, mode, state);
    },
    [aiThinking, commit, guest, guestView, lanPlayers, mode, screen, state, tr],
  );

  const closeLan = useCallback(() => {
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
  }, [guest]);

  const leaveGame = () => {
    closeLan();
    setScreen('home');
    setToast('');
  };

  const handleRestart = () => {
    if (mode === 'lan-guest') return;
    if (mode === 'lan-host') {
      if (!lanHost) return;
      const next = setup('B');
      setState(next);
      stateRef.current = next;
      setHistory([]);
      setHint(null);
      setAiThinking(false);
      recordedRef.current = false;
      setToast('');
      setScreen('game');
      lanHost.start();
      lanHost.sendView(1, view(next, 1));
      return;
    }
    begin(mode);
  };

  const openStats = (from: 'home' | 'game') => {
    setStatsFrom(from);
    setScreen('stats');
  };

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
      host.onChange((players) => {
        setLanPlayers(players);
        if (players.find((player) => player.seat === 1)?.connected && host.started) {
          host.sendView(1, view(stateRef.current, 1));
        }
      });
      host.onIntent((seat, intent) => {
        const payload = intent as { type?: string; index?: number } | null;
        if (!payload || payload.type !== 'place') return;
        const index = Number(payload.index);
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
          color: { dark: '#241f19', light: '#fffaf0' },
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
      joined.onView((payload) => {
        const nextView = payload as SeatView;
        if (!nextView || !Array.isArray(nextView.board)) return;
        setGuestView(nextView);
        setGuestStarted(true);
        setScreen((current) => (current === 'lan' ? 'game' : current));
      });
      joined.onStart(() => {
        setGuestStarted(true);
        setScreen((current) => (current === 'lan' ? 'game' : current));
      });
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? tr('lanFull') : tr('lanWrong'));
      });
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

  // AI reply. The human is always Black; White thinks on a short timer.
  useEffect(() => {
    if (screen !== 'game' || mode !== 'ai' || state.status !== 'playing' || state.turn !== 'W') {
      setAiThinking(false);
      return;
    }
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseMove(state, level);
      setAiThinking(false);
      if (move < 0) return;
      const result = apply(state, move);
      if (result.ok) commit(result.state, 'ai', state);
    }, 430);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, level, mode, screen, state]);

  // Pass toast for the LAN guest, driven by the host's authoritative view.
  useEffect(() => {
    if (mode !== 'lan-guest' || !guestView?.passed) return;
    const passer = guestView.turn === 'B' ? tr('white') : tr('black');
    setToast(tr('passNotice', { name: passer }));
  }, [guestView, mode, tr]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (screen === 'game') leaveGame();
        else if (screen === 'stats') setScreen(statsFrom);
        else if (screen === 'setup' || screen === 'rules') setScreen('home');
        else if (screen === 'lan') {
          closeLan();
          setScreen('home');
        }
        return;
      }
      if (screen !== 'game') return;
      if (event.target instanceof HTMLInputElement) return;
      const key = event.key.toLowerCase();
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
  });

  const guestMode = mode === 'lan-guest';
  const board = guestView?.board ?? state.board;
  const shownTurn = guestView?.turn ?? state.turn;
  const shownStatus = guestView?.status ?? state.status;
  const shownWinner = guestView?.winner ?? state.winner;
  const shownCounts = guestView?.counts ?? counts(state.board);
  const shownMoveCount = guestView?.moveCount ?? state.moves.length;
  const shownLast = guestView?.lastMove ?? state.lastMove;
  const shownLegal = guestView
    ? guestView.canMove
      ? guestView.legal
      : []
    : state.status === 'playing'
      ? legalMoves(state)
      : [];

  const boardDisabled =
    screen !== 'game' ||
    shownStatus !== 'playing' ||
    (mode === 'ai' && (shownTurn !== 'B' || aiThinking)) ||
    (mode === 'lan-host' && (shownTurn !== 'B' || !lanPlayers[1]?.connected)) ||
    (mode === 'lan-guest' && (!guestStarted || !guestView?.canMove));

  const statusLine = (() => {
    if (mode === 'lan-guest' && !guestStarted) return tr('lanWaitingHost');
    if (shownStatus === 'won') {
      return tr(shownWinner === 'B' ? 'blackWins' : 'whiteWins');
    }
    if (shownStatus === 'draw') return tr('draw');
    if (mode === 'ai') return shownTurn === 'B' ? tr('yourTurn') : tr('waitingTurn');
    if (mode === 'lan-host') return shownTurn === 'B' ? tr('yourTurn') : tr('whiteToPlay');
    if (mode === 'lan-guest') return shownTurn === 'W' ? tr('yourTurn') : tr('blackToPlay');
    return shownTurn === 'B' ? tr('blackToPlay') : tr('whiteToPlay');
  })();

  const resultName =
    shownStatus === 'draw'
      ? tr('draw')
      : shownStatus === 'won'
        ? tr(shownWinner === 'B' ? 'blackWins' : 'whiteWins')
        : '';
  const resultLine =
    shownStatus === 'draw'
      ? tr('resultDraw', { black: shownCounts.B, white: shownCounts.W })
      : tr('resultScore', { black: shownCounts.B, white: shownCounts.W });

  const describeCell = (index: number, cell: Cell, isLegal: boolean): string => {
    const name = coord(index);
    if (cell === 'B') return `${name} · ${tr('blackDisc')}`;
    if (cell === 'W') return `${name} · ${tr('whiteDisc')}`;
    return `${name} · ${isLegal ? tr('legalMove') : tr('emptySquare')}`;
  };

  const scoreCards = (
    <div className="score-strip">
      <div className={`score-card black ${shownStatus === 'playing' && shownTurn === 'B' ? 'active' : ''}`}>
        <DiscGlyph disc="B" />
        <div>
          <strong>{shownCounts.B}</strong>
          <span>{tr('black')}</span>
        </div>
      </div>
      <div className="turn-note">
        <span className={`turn-chip turn-${(shownStatus === 'playing' ? shownTurn : shownWinner ?? shownTurn).toLowerCase()}`}>
          <DiscGlyph disc={shownStatus === 'playing' ? shownTurn : shownWinner ?? shownTurn} />
        </span>
        <div>
          <strong>{statusLine}</strong>
          <p>
            {tr('discCount', { black: shownCounts.B, white: shownCounts.W })} · {tr('moves')}{' '}
            {shownMoveCount}
          </p>
        </div>
        {aiThinking && <span className="thinking" aria-hidden="true">…</span>}
      </div>
      <div className={`score-card white ${shownStatus === 'playing' && shownTurn === 'W' ? 'active' : ''}`}>
        <DiscGlyph disc="W" />
        <div>
          <strong>{shownCounts.W}</strong>
          <span>{tr('white')}</span>
        </div>
      </div>
    </div>
  );

  const boardView = (
    <Board
      board={board}
      legal={shownLegal}
      last={shownLast}
      hint={hint?.move ?? null}
      disabled={boardDisabled}
      onCell={playAt}
      label={tr('boardLabel')}
      describe={describeCell}
    />
  );

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
        <div className="hero-art" aria-hidden="true">
          <span className="hero-badge">{tr('meta')}</span>
          <Board
            board={HERO.board}
            legal={[]}
            last={HERO.lastMove}
            hint={null}
            disabled
            onCell={() => undefined}
            label={tr('boardLabel')}
            describe={(index, cell) =>
              `${coord(index)} · ${cell === 'B' ? tr('blackDisc') : cell === 'W' ? tr('whiteDisc') : tr('emptySquare')}`
            }
          />
          <p className="hero-caption">{tr('tagline')}</p>
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
            <button
              className={saved ? 'secondary wide' : 'primary wide'}
              onClick={() => {
                setMode('ai');
                setScreen('setup');
              }}
            >
              <span>{tr('playAi')}</span>
              <small>{tr('meta')}</small>
            </button>
            <button className="secondary wide" onClick={() => begin('local')}>
              <span>{tr('playLocal')}</span>
              <small>{tr('localHint')}</small>
            </button>
            <button className="secondary wide" onClick={openLanHost}>
              <span>{tr('playLan')}</span>
              <small>{tr('lanStartHint')}</small>
            </button>
            <div className="home-links">
              <button className="text-button" onClick={() => openStats('home')}>
                {tr('stats')} →
              </button>
              <button className="text-button" onClick={() => setScreen('rules')}>
                {tr('rules')} →
              </button>
            </div>
          </div>

          <div className="record-strip">
            <span>{tr('stats')}</span>
            {record.games === 0 ? (
              <span className="muted">{tr('noGames')}</span>
            ) : (
              <>
                <strong>{record.games}</strong>
                <span>{tr('games')}</span>
                <span className="dot">·</span>
                <span>
                  {record.winsBlack} {tr('winsBlack')}
                </span>
                <span className="dot">·</span>
                <span>
                  {record.winsWhite} {tr('winsWhite')}
                </span>
                <span className="dot">·</span>
                <span>
                  {record.draws} {tr('draws')}
                </span>
              </>
            )}
          </div>
        </div>
      </section>
      <footer className="foot">
        {tr('webOnly')} · {tr('footerNote')}
      </footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell setup-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <p className="eyebrow">{tr('eyebrow')}</p>
      <h2 className="screen-title">{tr('difficulty')}</h2>
      <p className="lede">{tr('setupIntro')}</p>
      <div className="level-grid">
        {AI_LEVELS.map((item) => (
          <button
            key={item}
            className={`level-card ${level === item ? 'selected' : ''}`}
            onClick={() => setLevel(item)}
            aria-pressed={level === item}
          >
            <span className={`level-dot ${item}`} />
            <strong>{tr(item)}</strong>
            <small>{tr(LEVEL_NOTE[item])}</small>
          </button>
        ))}
      </div>
      <p className="note">{tr('youPlayBlack')}</p>
      <div className="row-actions">
        <button className="primary" onClick={() => begin('ai')}>
          {tr('begin')}
        </button>
        <button className="ghost" onClick={() => setScreen('home')}>
          {tr('back')}
        </button>
      </div>
    </main>
  );

  const gameScreen = (
    <main className="shell game-shell">
      <header className="game-top">
        <button className="back" onClick={leaveGame}>
          ← {tr('home')}
        </button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>{modeName(lang, mode, level)}</span>
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
          {scoreCards}
          {boardView}
          <div className="board-foot">
            <span>
              {shownLast !== null
                ? `${tr('lastMove')} ${coord(shownLast)}`
                : tr('noMoves')}
            </span>
            <span>
              {mode === 'lan-host'
                ? tr('hostIsBlack')
                : mode === 'lan-guest'
                  ? tr('youAreWhite')
                  : mode === 'ai'
                    ? tr('youAreBlack')
                    : tr('seatsLocal')}
            </span>
          </div>

          {shownStatus !== 'playing' && (
            <div className="result-banner">
              <div>
                <span className="eyebrow">{tr('gameOver')}</span>
                <strong>{resultName}</strong>
                <p className="muted">
                  {resultLine} · {tr('moves')} {shownMoveCount}
                </p>
              </div>
              {mode === 'lan-guest' ? (
                <span className="muted">{tr('lanWaitingHost')}</span>
              ) : (
                <div className="result-actions">
                  <button className="primary" onClick={handleRestart}>
                    {tr('restart')}
                  </button>
                  <button className="secondary" onClick={() => openStats('game')}>
                    {tr('gameStats')}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="side">
          <div className={`side-card hint-card ${hint ? 'active' : ''}`} aria-live="polite">
            <h3>{tr('hintTitle')}</h3>
            <p>{hint ? hintText(lang, hint) : tr('hintIdle')}</p>
            <div className="side-actions">
              <button className="secondary" onClick={undo} disabled={!canUndo}>
                {tr('undo')}
              </button>
              <button className="secondary" onClick={showHint} disabled={hintDisabled}>
                {tr('hint')}
              </button>
            </div>
          </div>

          <div className="side-card">
            <h3>{tr('rules')}</h3>
            <p>{mode === 'lan-host' ? tr('lanHostNote') : mode === 'lan-guest' ? tr('lanGuestNote') : mode === 'ai' ? tr('aiHint') : tr('localHint')}</p>
            <p className="key-hint">{tr('keyboardHint')}</p>
          </div>

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <h3>{tr('lanCode')}</h3>
              <div className="room-code">{lanCode}</div>
              <p>{lanPlayers[1]?.connected ? tr('lanReady') : tr('lanWaiting')}</p>
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
              {record.games} {tr('games')} · {record.winsBlack}/{record.winsWhite}/{record.draws}
            </p>
            <div className="mini-actions">
              <button className="text-button" onClick={() => openStats('game')}>
                {tr('gameStats')} →
              </button>
              {mode !== 'lan-guest' && (
                <button className="text-button" onClick={handleRestart}>
                  {tr('newGame')} →
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell lan-shell">
      <button className="back" onClick={() => { closeLan(); setScreen('home'); }}>
        ← {tr('back')}
      </button>

      {guestMode || guestRoom ? (
        <>
          <p className="eyebrow">{tr('eyebrow')}</p>
          <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
          <p className="lede">
            {tr('lanRoom')} {guestRoom}
          </p>
          {!guest && (
            <div className="lan-form">
              <label>
                <span>{tr('lanName')}</span>
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  maxLength={18}
                  autoComplete="off"
                />
              </label>
              <label>
                <span>{tr('lanCode')}</span>
                <input
                  value={guestCode}
                  onChange={(event) => setGuestCode(event.target.value)}
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
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
          {guest && !guestStarted && <p className="lede">{tr('lanWaitingHost')}</p>}
          {guestStarted && (
            <p className="lede">
              {tr('lanGuestSeat')} · {tr('lanGuestNote')}
            </p>
          )}
          {lanError && <p className="error">{lanError}</p>}
          {guestStarted && (
            <button className="primary" onClick={() => setScreen('game')}>
              {tr('lanStart')}
            </button>
          )}
        </>
      ) : (
        <>
          <p className="eyebrow">{tr('eyebrow')}</p>
          <h2 className="screen-title">{tr('lanTitle')}</h2>
          <p className="lede">
            {tr('lanHost')} · {tr('lanStartHint')}
          </p>
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
                  onClick={() => {
                    if (!lanHost) return;
                    const next = setup('B');
                    setState(next);
                    stateRef.current = next;
                    setHistory([]);
                    setHint(null);
                    setAiThinking(false);
                    recordedRef.current = false;
                    setToast('');
                    setScreen('game');
                    lanHost.start();
                    lanHost.sendView(1, view(next, 1));
                  }}
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
                <p className="muted lan-note">{tr('lanHostNote')}</p>
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
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell rules-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <p className="eyebrow">{tr('eyebrow')}</p>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <div className="rule-grid">
        {RULE_KEYS.map((key, index) => (
          <article className="rule-card" key={key}>
            <span className="rule-no">{String(index + 1).padStart(2, '0')}</span>
            <p>{tr(key)}</p>
          </article>
        ))}
      </div>
      <div className="scoring-card">
        <h3>{tr('scoringTitle')}</h3>
        <p>{tr('scoringText')}</p>
      </div>
      <button className="primary" onClick={() => setScreen('home')}>
        {tr('close')}
      </button>
    </main>
  );

  const totalGames = Math.max(1, record.games);
  const blackPct = Math.round((record.winsBlack / totalGames) * 100);
  const whitePct = Math.round((record.winsWhite / totalGames) * 100);
  const drawPct = Math.max(0, 100 - blackPct - whitePct);

  const statsScreen = (
    <main className="shell narrow-shell stats-shell">
      <button className="back" onClick={() => setScreen(statsFrom)}>
        ← {tr('back')}
      </button>
      <p className="eyebrow">{tr('eyebrow')}</p>
      <h2 className="screen-title">{tr('statsTitle')}</h2>
      <p className="lede">{tr('recordIntro')}</p>

      {record.games === 0 ? (
        <div className="empty-record">
          <DiscGlyph disc="B" />
          <DiscGlyph disc="W" />
          <p>{tr('noGames')}</p>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <span>{tr('games')}</span>
              <strong>{record.games}</strong>
            </div>
            <div className="stat-card">
              <span>{tr('winsBlack')}</span>
              <strong>{record.winsBlack}</strong>
            </div>
            <div className="stat-card">
              <span>{tr('winsWhite')}</span>
              <strong>{record.winsWhite}</strong>
            </div>
            <div className="stat-card">
              <span>{tr('draws')}</span>
              <strong>{record.draws}</strong>
            </div>
          </div>

          <div className="record-hero">
            <div className="record-head">
              <div>
                <span>{tr('winRate')}</span>
                <strong>{blackPct}%</strong>
              </div>
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
                <strong className="last-result">{lastResultName(lang, record)}</strong>
              </div>
            </div>
            <div className="record-bar" aria-hidden="true">
              <span className="bar-black" style={{ width: `${blackPct}%` }} />
              <span className="bar-white" style={{ width: `${whitePct}%` }} />
              <span className="bar-draw" style={{ width: `${drawPct}%` }} />
            </div>
            <div className="record-legend">
              <span><i className="swatch black" />{tr('winsBlack')} {record.winsBlack}</span>
              <span><i className="swatch white" />{tr('winsWhite')} {record.winsWhite}</span>
              <span><i className="swatch draw" />{tr('draws')} {record.draws}</span>
            </div>
          </div>
        </>
      )}

      <p className="muted record-hint">{tr('recordHint')}</p>
      <div className="row-actions">
        <button className="primary" onClick={() => setRecord(clearRecord())}>
          {tr('resetStats')}
        </button>
        <button className="secondary" onClick={() => setScreen(statsFrom)}>
          {tr('close')}
        </button>
      </div>
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
