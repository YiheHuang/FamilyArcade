import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseMove, hintMove, type AiLevel, type Hint } from './ai/ai';
import { Board, DiscGlyph } from './components/Board';
import {
  apply,
  applySeat,
  dropRow,
  replay,
  setup,
  view,
  type GameState,
} from './game/four';
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
  type RecentResult,
  type Record,
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'lan' | 'stats';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';

const AI_LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

/** A pleasant mid-game position for the home board (prefix of a legal draw). */
const DEMO_BOARD = replay([
  4, 5, 1, 4, 0, 4, 5, 3, 6, 1, 5, 5, 4, 0, 3, 2, 6, 2, 6, 0, 2, 6, 1, 3,
]).board;

function playStatus(lang: Lang, status: GameState['status'], winner: GameState['winner'], turn: GameState['turn']): string {
  if (status === 'won') return t(lang, winner === 'R' ? 'redWins' : 'yellowWins');
  if (status === 'draw') return t(lang, 'draw');
  return t(lang, turn === 'R' ? 'redTurn' : 'yellowTurn');
}

function modeLabel(lang: Lang, mode: Mode, level: AiLevel): string {
  if (mode === 'ai') return t(lang, level);
  if (mode === 'local') return t(lang, 'playLocal');
  if (mode === 'lan-host') return t(lang, 'lanHost');
  return t(lang, 'lanGuestTitle');
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup('R'));
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<Hint | null>(null);
  const [record, setRecord] = useState<Record>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.four.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [motionOn, setMotionOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.four.motion') !== 'reduced';
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
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const tr = useCallback((key: MessageKey) => t(lang, key), [lang]);

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
      localStorage.setItem('familyarcade.four.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', !motionOn);
    try {
      localStorage.setItem('familyarcade.four.motion', motionOn ? 'on' : 'reduced');
    } catch {
      /* ignore */
    }
  }, [motionOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!guestRoom) return;
    setScreen('lan');
    setMode('lan-guest');
  }, [guestRoom]);

  const finish = useCallback(
    (next: GameState, currentMode: Mode) => {
      if (next.status === 'playing' || recorded) return;
      setRecorded(true);
      if (currentMode !== 'lan-host' && currentMode !== 'lan-guest') {
        setRecord(recordResult(next, currentMode));
        clearSave();
        setSaved(null);
      }
      if (soundOn) chime(next.status === 'draw' ? 'draw' : 'win');
    },
    [recorded, soundOn],
  );

  const commit = useCallback(
    (next: GameState, currentMode: Mode, previous: GameState) => {
      setHistory((items) => [...items, previous]);
      setState(next);
      setHint(null);
      if (next.status === 'playing' && soundOn) chime('place');
      finish(next, currentMode);
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.status === 'playing') {
          saveGame({ state: next, mode: currentMode, level });
          setSaved(loadSave());
        } else {
          clearSave();
          setSaved(null);
        }
      }
      if (currentMode === 'lan-host' && hostRef.current) {
        hostRef.current.sendView(1, view(next, 1));
        if (next.status !== 'playing') hostRef.current.sendResult(view(next, 1));
      }
    },
    [finish, level, soundOn],
  );

  const playColumn = useCallback(
    (column: number) => {
      if (screen !== 'game') return;
      if (mode === 'ai' && (state.turn !== 'R' || aiThinking)) return;
      if (mode === 'lan-guest') {
        if (guestStarted && guestView?.canMove && dropRow(guestView.board, column) >= 0) {
          guest?.sendIntent({ type: 'place', column });
        }
        return;
      }
      if (mode === 'lan-host' && !lanPlayers[1]?.connected) return;
      const result = mode === 'lan-host' ? applySeat(state, 0, column) : apply(state, column);
      if (!result.ok) return;
      commit(result.state, mode, state);
    },
    [aiThinking, commit, guest, guestStarted, guestView, lanPlayers, mode, screen, state],
  );

  // AI reply
  useEffect(() => {
    if (screen !== 'game' || mode !== 'ai' || state.status !== 'playing' || state.turn !== 'Y') return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const column = chooseMove(state, level);
      setAiThinking(false);
      if (column < 0) return;
      const result = apply(state, column);
      if (!result.ok) return;
      commit(result.state, 'ai', state);
    }, 420);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, level, mode, screen, state]);

  const startLocal = (nextMode: 'ai' | 'local') => {
    const next = setup('R');
    setMode(nextMode);
    setState(next);
    setHistory([]);
    setHint(null);
    setRecorded(false);
    setScreen('game');
    setAiThinking(false);
    clearSave();
    setSaved(null);
  };

  const resume = () => {
    if (!saved) return;
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    setHistory([]);
    setHint(null);
    setRecorded(false);
    setScreen('game');
    setSaved(null);
  };

  const canUndo = mode !== 'lan-guest' && mode !== 'lan-host' && state.status === 'playing' && history.length > 0 && !aiThinking;

  const undo = () => {
    if (!canUndo) return;
    const steps = mode === 'ai' && state.turn === 'R' && history.length >= 2 ? 2 : 1;
    const target = history[history.length - steps];
    setHistory(history.slice(0, -steps));
    setState(target);
    setHint(null);
    setRecorded(false);
    if (mode === 'ai' || mode === 'local') {
      saveGame({ state: target, mode, level });
      setSaved(loadSave());
    }
  };

  const shownBoard = mode === 'lan-guest' ? (guestView?.board ?? setup('R').board) : state.board;
  const shownTurn = mode === 'lan-guest' ? (guestView?.turn ?? 'R') : state.turn;
  const shownStatus = mode === 'lan-guest' ? (guestView?.status ?? 'playing') : state.status;
  const shownWinner = mode === 'lan-guest' ? (guestView?.winner ?? null) : state.winner;
  const shownLine = mode === 'lan-guest' ? (guestView?.line ?? null) : state.line;
  const shownLast = mode === 'lan-guest' ? (guestView?.last ?? null) : state.last;
  const isGuest = mode === 'lan-guest';
  const guestCanPlay = Boolean(guestStarted && guestView?.canMove);
  const hostCanPlay = mode === 'lan-host' ? Boolean(lanPlayers[1]?.connected) : true;

  const canHint =
    shownStatus === 'playing' &&
    !isGuest &&
    !aiThinking &&
    !(mode === 'ai' && shownTurn === 'Y') &&
    !(mode === 'lan-host' && state.turn !== 'R');

  const showHint = () => {
    if (!canHint) return;
    const advice = hintMove(state);
    if (advice.column >= 0) {
      setHint(advice);
    } else {
      setToast(tr('hintEmpty'));
    }
  };

  const hintText = hint
    ? t(lang, hint.reason === 'win' ? 'hintWin' : hint.reason === 'block' ? 'hintBlock' : 'hintBuild', {
        n: hint.column + 1,
      })
    : '';

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
        const column = Number((intent as { column?: number } | null)?.column);
        if (!Number.isInteger(column)) return;
        const current = stateRef.current;
        const result = applySeat(current, seat, column);
        if (!result.ok) return;
        commit(result.state, 'lan-host', current);
      });
      host.onClose(() => setLanError(tr('lanDisconnected')));
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#263a38', light: '#fffaf0' },
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
    setState(next);
    setHistory([]);
    setHint(null);
    setRecorded(false);
    setAiThinking(false);
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
      joined.onStart(() => setGuestStarted(true));
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? tr('lanFull') : tr('lanWrong'));
      });
      setGuestStarted(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setLanError(
        message.includes('wrong-code') || message.includes('rejected')
          ? tr('lanWrong')
          : message.includes('room-full')
            ? tr('lanFull')
            : tr('lanDisconnected'),
      );
    } finally {
      setGuestConnecting(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (screen !== 'home') goHome();
        return;
      }
      if (screen !== 'game') return;
      const number = Number(event.key);
      if (Number.isInteger(number) && number >= 1 && number <= 7) {
        event.preventDefault();
        playColumn(number - 1);
        return;
      }
      if (event.key.toLowerCase() === 'u') undo();
      if (event.key.toLowerCase() === 'h') showHint();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const disabled =
    screen !== 'game' ||
    shownStatus !== 'playing' ||
    (isGuest && !guestCanPlay) ||
    (mode === 'lan-host' && !hostCanPlay) ||
    (mode === 'ai' && (shownTurn === 'Y' || aiThinking));

  const winnerText =
    shownStatus === 'won'
      ? t(lang, shownWinner === 'R' ? 'redWins' : 'yellowWins')
      : shownStatus === 'draw'
        ? tr('draw')
        : '';
  const visibleDisc = shownStatus === 'won' && shownWinner ? shownWinner : shownTurn;

  const restart = () => {
    if (mode === 'lan-host' && lanHost) {
      const next = setup('R');
      setState(next);
      setHistory([]);
      setHint(null);
      setRecorded(false);
      lanHost.sendView(1, view(next, 1));
      return;
    }
    startLocal(mode === 'ai' ? 'ai' : 'local');
  };

  const currentRecord: Record = record;
  const recentLabel = (result: RecentResult) =>
    result.winner === 'draw' ? tr('draw') : t(lang, result.winner === 'R' ? 'redWins' : 'yellowWins');
  const recentDate = (at: number) =>
    new Date(at).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB', { month: 'short', day: 'numeric' });

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">FAMILY ARCADE · 02</p>
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
          <button className="ghost" onClick={() => setMotionOn((value) => !value)}>
            {motionOn ? tr('motionOn') : tr('motionOff')}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-board" aria-hidden="true">
          <Board
            board={DEMO_BOARD}
            line={null}
            last={null}
            hint={null}
            turn="R"
            disabled
            onColumn={() => undefined}
            label=""
            columnLabel={() => ''}
          />
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
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={() => setScreen('setup')}>
              <span>{tr('playAi')}</span>
              <small>{tr('playAiSub')}</small>
            </button>
            <button className="secondary wide" onClick={() => startLocal('local')}>
              <span>{tr('playLocal')}</span>
              <small>{tr('playLocalSub')}</small>
            </button>
            <button className="secondary wide" onClick={openLanHost}>
              <span>{tr('playLan')}</span>
              <small>{tr('playLanSub')}</small>
            </button>
          </div>
          <div className="home-links">
            <button className="text-button" onClick={() => setScreen('stats')}>
              {tr('statsLink')} →
            </button>
            <button className="text-button" onClick={() => setScreen('rules')}>
              {tr('rules')} →
            </button>
          </div>
          <div className="record-strip">
            <span>{tr('stats')}</span>
            <strong>{currentRecord.games}</strong>
            <span>{currentRecord.games === 1 ? tr('gameOne') : tr('games')}</span>
            <span className="dot">·</span>
            <span className="red-text">{currentRecord.redWins} {tr('redShort')}</span>
            <span className="dot">·</span>
            <span className="yellow-text">{currentRecord.yellowWins} {tr('yellowShort')}</span>
            <span className="dot">·</span>
            <span>{currentRecord.draws} {currentRecord.draws === 1 ? tr('drawOne') : tr('draws')}</span>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <header className="screen-head">
        <p className="eyebrow">{tr('eyebrowSolo')}</p>
        <h2 className="screen-title">{tr('difficulty')}</h2>
        <p className="lede">{tr('difficultyLede')}</p>
      </header>
      <div className="level-grid">
        {AI_LEVELS.map((item) => (
          <button
            key={item.id}
            className={`level-card ${level === item.id ? 'selected' : ''}`}
            onClick={() => setLevel(item.id)}
            aria-pressed={level === item.id}
          >
            <span className={`level-dot ${item.id}`} />
            <strong>{tr(item.label)}</strong>
            <small>{tr(item.note)}</small>
          </button>
        ))}
      </div>
      <div className="row-actions">
        <button className="primary" onClick={() => startLocal('ai')}>
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
        <button className="back" onClick={goHome}>
          ← {tr('home')}
        </button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>{modeLabel(lang, mode, level)}</span>
        </div>
        <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
          {tr('language')}
        </button>
      </header>

      <div className="game-layout">
        <section className="board-wrap">
          <div className="turn-bar">
            <span className={`turn-chip ${visibleDisc.toLowerCase()}`}>
              <DiscGlyph disc={visibleDisc} small />
            </span>
            <div>
              <strong>
                {isGuest && !guestStarted
                  ? tr('waitingHost')
                  : mode === 'ai' && shownTurn === 'Y'
                    ? tr('thinking')
                    : playStatus(lang, shownStatus, shownWinner, shownTurn)}
              </strong>
              <p>
                {mode === 'ai'
                  ? tr(level)
                  : mode === 'local'
                    ? tr('playLocal')
                    : mode === 'lan-host'
                      ? tr('lanHostSeat')
                      : tr('lanGuestSeat')}
              </p>
            </div>
            {aiThinking && <span className="thinking" aria-hidden="true">···</span>}
          </div>

          <Board
            board={shownBoard}
            line={shownLine}
            last={shownLast}
            hint={hint?.column ?? null}
            turn={shownTurn}
            disabled={disabled}
            onColumn={playColumn}
            label={tr('boardLabel')}
            columnLabel={(column) => t(lang, 'dropColumn', { n: column + 1 })}
          />

          {hint && (
            <div className="hint-note" role="status">
              <DiscGlyph disc={shownTurn} small />
              <p>{hintText}</p>
              <button className="ghost small" onClick={() => setHint(null)} aria-label={tr('close')}>
                ×
              </button>
            </div>
          )}

          {shownStatus !== 'playing' && (
            <div className="result-banner" role="status">
              <div>
                <p className="eyebrow">{tr('title')} · 02</p>
                <strong>{winnerText}</strong>
              </div>
              {isGuest ? (
                <span className="muted">{tr('lanNext')}</span>
              ) : (
                <button className="primary" onClick={restart}>
                  {tr('restart')}
                </button>
              )}
            </div>
          )}
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{mode === 'local' ? tr('playLocal') : mode === 'ai' ? tr('playAi') : tr('lanTitle')}</h3>
            <p>
              {mode === 'ai'
                ? tr('youPlayRed')
                : mode === 'local'
                  ? tr('localHint')
                  : mode === 'lan-host'
                    ? tr('lanHostSeat')
                    : tr('lanGuestSeat')}
            </p>
            <p className="keyboard-note">{tr('keyboardHint')}</p>
            <div className="side-actions">
              <button className="secondary" onClick={undo} disabled={!canUndo}>
                {tr('undo')}
              </button>
              <button className="secondary" onClick={showHint} disabled={!canHint}>
                {tr('hint')}
              </button>
            </div>
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
              {currentRecord.games} {currentRecord.games === 1 ? tr('gameOne') : tr('games')} ·{' '}
              {currentRecord.redWins} {tr('redShort')} · {currentRecord.yellowWins} {tr('yellowShort')} ·{' '}
              {currentRecord.draws} {currentRecord.draws === 1 ? tr('drawOne') : tr('draws')}
            </p>
            <button className="text-button" onClick={() => setScreen('stats')}>
              {tr('openRecord')} →
            </button>
          </div>

          <div className="side-card comfort-card">
            <h3>{tr('comforts')}</h3>
            <div className="comfort-actions">
              <button className={`pill ${soundOn ? 'on' : ''}`} onClick={() => setSoundOn((value) => !value)}>
                {soundOn ? tr('soundOn') : tr('soundOff')}
              </button>
              <button className={`pill ${motionOn ? 'on' : ''}`} onClick={() => setMotionOn((value) => !value)}>
                {motionOn ? tr('motionOn') : tr('motionOff')}
              </button>
            </div>
          </div>
        </aside>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
      {mode === 'lan-guest' || guestRoom ? (
        <>
          <header className="screen-head">
            <p className="eyebrow">{tr('eyebrowLan')}</p>
            <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
            <p className="lede">{tr('lanGuestLede')}</p>
          </header>
          <p className="room-chip">{tr('room')} {guestRoom}</p>
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
          {guestStarted && <p className="lede">{tr('lanGuestSeat')}</p>}
          {lanError && <p className="error">{lanError}</p>}
          {guestStarted && (
            <button className="primary" onClick={() => setScreen('game')}>
              {tr('lanStart')}
            </button>
          )}
        </>
      ) : (
        <>
          <header className="screen-head">
            <p className="eyebrow">{tr('eyebrowLan')}</p>
            <h2 className="screen-title">{tr('lanTitle')}</h2>
            <p className="lede">{tr('lanLede')}</p>
          </header>
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
                <button className="primary wide" onClick={startLan} disabled={!lanPlayers[1]?.connected}>
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
                <p className="relay-note">{tr('lanRelayNote')}</p>
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
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <header className="screen-head">
        <p className="eyebrow">{tr('eyebrowRules')}</p>
        <h2 className="screen-title">{tr('rulesTitle')}</h2>
        <p className="lede">{tr('rulesLede')}</p>
      </header>
      <div className="rule-list">
        {(['rule1', 'rule2', 'rule3', 'rule4'] as const).map((key, index) => (
          <div className="rule-row" key={key}>
            <span className="rule-num">0{index + 1}</span>
            <p>{tr(key)}</p>
            {index === 2 ? (
              <span className="four-strip" aria-hidden="true">
                <DiscGlyph disc="R" small />
                <DiscGlyph disc="R" small />
                <DiscGlyph disc="R" small />
                <DiscGlyph disc="R" small />
              </span>
            ) : (
              <span className={`rule-dot ${index % 2 === 0 ? 'red' : 'yellow'}`} aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
      <button className="primary" onClick={() => setScreen('home')}>
        {tr('close')}
      </button>
    </main>
  );

  const winRate = (value: number) => (currentRecord.games === 0 ? 0 : Math.round((value / currentRecord.games) * 100));

  const statsScreen = (
    <main className="shell narrow-shell stats-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <header className="screen-head">
        <p className="eyebrow">{tr('eyebrowRecord')}</p>
        <h2 className="screen-title">{tr('recordTitle')}</h2>
        <p className="lede">{tr('recordLede')}</p>
      </header>

      <div className="stat-grid">
        <div className="stat-card feature">
          <strong>{currentRecord.games}</strong>
          <span>{tr('games')}</span>
        </div>
        <div className="stat-card">
          <strong className="red-text">{currentRecord.redWins}</strong>
          <span>{tr('redWins')}</span>
        </div>
        <div className="stat-card">
          <strong className="yellow-text">{currentRecord.yellowWins}</strong>
          <span>{tr('yellowWins')}</span>
        </div>
        <div className="stat-card">
          <strong>{currentRecord.draws}</strong>
          <span>{tr('draws')}</span>
        </div>
        <div className="stat-card">
          <strong>{currentRecord.streak}</strong>
          <span>{tr('winStreak')}</span>
        </div>
      </div>

      <div className="record-bars" aria-hidden="true">
        <div className="bar-row">
          <span>{tr('redShort')}</span>
          <div className="bar"><i className="bar-red" style={{ width: `${winRate(currentRecord.redWins)}%` }} /></div>
          <b>{winRate(currentRecord.redWins)}%</b>
        </div>
        <div className="bar-row">
          <span>{tr('yellowShort')}</span>
          <div className="bar"><i className="bar-yellow" style={{ width: `${winRate(currentRecord.yellowWins)}%` }} /></div>
          <b>{winRate(currentRecord.yellowWins)}%</b>
        </div>
        <div className="bar-row">
          <span>{tr('drawShort')}</span>
          <div className="bar"><i className="bar-draw" style={{ width: `${winRate(currentRecord.draws)}%` }} /></div>
          <b>{winRate(currentRecord.draws)}%</b>
        </div>
      </div>

      <h3 className="recent-title">{tr('recent')}</h3>
      {currentRecord.recent.length === 0 ? (
        <p className="empty-record">{tr('noGames')}</p>
      ) : (
        <ul className="recent-list">
          {currentRecord.recent.map((item, index) => (
            <li key={`${item.at}-${index}`}>
              <span
                className={`recent-dot ${
                  item.winner === 'R' ? 'red' : item.winner === 'Y' ? 'yellow' : 'draw'
                }`}
                aria-hidden="true"
              />
              <strong>{recentLabel(item)}</strong>
              <span>{t(lang, item.mode === 'ai' ? 'recordAi' : 'recordLocal')}</span>
              <time>{recentDate(item.at)}</time>
            </li>
          ))}
        </ul>
      )}

      <div className="record-actions">
        <button
          className="secondary"
          onClick={() => {
            setRecord(clearRecord());
            setToast(tr('resetStats'));
          }}
        >
          {tr('resetStats')}
        </button>
        <span className="muted">{tr('recordNote')}</span>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
