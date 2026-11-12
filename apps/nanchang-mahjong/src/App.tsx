import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseMove, type AiLevel } from './ai/ai';
import { Board, MarkGlyph } from './components/Board';
import { apply, applySeat, setup, view, type GameState } from './game/nanchang-mahjong';
import { detectLang, t, type Lang } from './i18n';
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
  type Record,
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';

const AI_LEVELS: { id: AiLevel; label: string; note: string }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

function statusText(lang: Lang, state: GameState): string {
  if (state.status === 'won') return t(lang, state.winner === 'X' ? 'xWins' : 'oWins');
  if (state.status === 'draw') return t(lang, 'draw');
  return t(lang, state.turn === 'X' ? 'turnX' : 'turnO');
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup('X'));
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<number | null>(null);
  const [record, setRecord] = useState<Record>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.nanchang-mahjong.sound') !== 'off';
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

  const tr = useCallback((key: Parameters<typeof t>[1]) => t(lang, key), [lang]);

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
      localStorage.setItem('familyarcade.nanchang-mahjong.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
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
      if (soundOn) chime(next.status === 'draw' ? 'draw' : 'win');
    },
    [recorded, soundOn],
  );

  const commit = useCallback(
    (next: GameState, currentMode: Mode, previous: GameState) => {
      setHistory((items) => [...items, previous]);
      setState(next);
      setHint(null);
      if (soundOn) chime('place');
      finish(next, currentMode);
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.status === 'playing') saveGame({ state: next, mode: currentMode, level });
        setSaved(null);
      }
      if (currentMode === 'lan-host' && hostRef.current) {
        hostRef.current.sendView(1, view(next, 1));
        if (next.status !== 'playing') hostRef.current.sendResult(view(next, 1));
      }
    },
    [finish, level, soundOn],
  );

  const playAt = useCallback(
    (index: number) => {
      if (mode === 'lan-guest') {
        if (guestView?.canMove && guestView.board[index] === null) {
          guest?.sendIntent({ type: 'place', index });
        }
        return;
      }
      if (mode === 'lan-host' && !lanPlayers[1]?.connected) return;
      const result = mode === 'lan-host' ? applySeat(state, 0, index) : apply(state, index);
      if (!result.ok) return;
      commit(result.state, mode, state);
    },
    [commit, guest, guestView, lanPlayers, mode, state],
  );

  // AI reply
  useEffect(() => {
    if (mode !== 'ai' || state.status !== 'playing' || state.turn !== 'O') return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseMove(state, level);
      setAiThinking(false);
      if (move < 0) return;
      const result = apply(state, move);
      if (!result.ok) return;
      commit(result.state, 'ai', state);
    }, 380);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, level, mode, state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setScreen('home');
        return;
      }
      if (screen !== 'game') return;
      const number = Number(event.key);
      if (Number.isInteger(number) && number >= 1 && number <= 9) {
        event.preventDefault();
        playAt(number - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playAt, screen]);

  // Auto-join when the URL contains a room.
  useEffect(() => {
    if (!guestRoom) return;
    setScreen('lan');
    setMode('lan-guest');
  }, [guestRoom]);

  const startLocal = (nextMode: 'ai' | 'local') => {
    const next = setup('X');
    setMode(nextMode);
    setState(next);
    setHistory([]);
    setRecorded(false);
    setScreen('game');
    clearSave();
    setSaved(null);
  };

  const startAi = () => {
    setMode('ai');
    setScreen('setup');
  };

  const resume = () => {
    if (!saved) return;
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    setHistory([]);
    setRecorded(saved.state.status !== 'playing');
    setScreen('game');
    setSaved(null);
  };

  const undo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));
    setState(previous);
    setHint(null);
    setRecorded(false);
  };

  const showHint = () => {
    if (state.status !== 'playing' || mode === 'lan-guest') return;
    const move = chooseMove(state, 'hard');
    if (move >= 0) {
      setHint(move);
      setToast(tr('hintText'));
    }
  };

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
      setLanQr(await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#2b2520', light: '#fffaf0' } }));
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
    const next = setup('X');
    setState(next);
    setHistory([]);
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
      joined.onStart(() => setGuestStarted(true));
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? tr('lanFull') : tr('lanWrong'));
      });
      setGuestStarted(false);
    } catch (error) {
      setLanError(error instanceof Error && error.message.includes('rejected') ? tr('lanWrong') : tr('lanDisconnected'));
    } finally {
      setGuestConnecting(false);
    }
  };

  const board = guestView?.board ?? state.board;
  const line = guestView?.line ?? state.line;
  const shownStatus = guestView?.status ?? state.status;
  const shownTurn = guestView?.turn ?? state.turn;
  const shownWinner = guestView?.winner ?? state.winner;
  const last = state.moves[state.moves.length - 1] ?? null;
  const isGuest = mode === 'lan-guest';
  const guestCanPlay = Boolean(guestView?.canMove) && guestStarted;
  const hostCanPlay = mode === 'lan-host' ? Boolean(lanPlayers[1]?.connected) : true;
  const disabled =
    screen !== 'game' ||
    shownStatus !== 'playing' ||
    (isGuest && !guestCanPlay) ||
    (mode === 'lan-host' && !hostCanPlay) ||
    (mode === 'ai' && (shownTurn === 'O' || aiThinking));

  const displayStatus = isGuest
    ? guestStarted
      ? t(lang, shownStatus === 'won' ? (shownWinner === 'X' ? 'xWins' : 'oWins') : shownStatus === 'draw' ? 'draw' : shownTurn === 'X' ? 'turnX' : 'turnO')
      : tr('lanWaiting')
    : statusText(lang, state);

  const winnerText =
    shownStatus === 'won'
      ? t(lang, shownWinner === 'X' ? 'xWins' : 'oWins')
      : shownStatus === 'draw'
        ? t(lang, 'draw')
        : '';

  const finalBoardStatus = shownStatus;

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">FAMILY ARCADE · 01</p>
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
          <Board board={['X', 'O', null, null, 'X', 'O', null, null, 'X']} line={[0, 4, 8]} last={8} hint={null} disabled onCell={() => undefined} />
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
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={startAi}>
              {tr('playAi')}
            </button>
            <button className="secondary wide" onClick={() => startLocal('local')}>
              {tr('playLocal')}
            </button>
            <button className="secondary wide" onClick={openLanHost}>
              {tr('playLan')}
            </button>
            <button className="text-button" onClick={() => setScreen('rules')}>
              {tr('rules')} →
            </button>
          </div>
          <div className="record-strip">
            <span>{tr('stats')}</span>
            <strong>{record.games}</strong>
            <span>{tr('games')}</span>
            <span className="dot">·</span>
            <span>{record.winsX} X</span>
            <span className="dot">·</span>
            <span>{record.winsO} O</span>
            <span className="dot">·</span>
            <span>{record.draws} {tr('draws')}</span>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('difficulty')}</h2>
      <p className="lede">{tr('playAi')}</p>
      <div className="level-grid">
        {AI_LEVELS.map((item) => (
          <button
            key={item.id}
            className={`level-card ${level === item.id ? 'selected' : ''}`}
            onClick={() => setLevel(item.id)}
          >
            <span className={`level-dot ${item.id}`} />
            <strong>{tr(item.label as Parameters<typeof t>[1])}</strong>
            <small>{tr(item.note as Parameters<typeof t>[1])}</small>
          </button>
        ))}
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
        <button className="back" onClick={() => { closeLan(); setScreen('home'); }}>← {tr('home')}</button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>
            {mode === 'ai' ? tr(level as Parameters<typeof t>[1]) : mode === 'local' ? tr('playLocal') : mode === 'lan-host' ? tr('lanHost') : tr('lanGuestTitle')}
          </span>
        </div>
        <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{tr('language')}</button>
      </header>

      <div className="game-layout">
        <section className="board-wrap">
          <div className="turn-bar">
            <span className={`turn-chip ${(guestView?.turn ?? state.turn).toLowerCase()}`}>
              <MarkGlyph mark={guestView?.turn ?? state.turn} />
            </span>
            <div>
              <strong>{tr('yourTurn')}</strong>
              <p>{mode === 'lan-host' ? tr('lanHostSeat') : mode === 'lan-guest' ? tr('lanGuestSeat') : displayStatus}</p>
            </div>
            {aiThinking && <span className="thinking">…</span>}
          </div>
          <Board
            board={board}
            line={line}
            last={last}
            hint={hint}
            disabled={disabled}
            onCell={playAt}
          />
          {finalBoardStatus !== 'playing' && (
            <div className="result-banner">
              <strong>{winnerText}</strong>
              {isGuest ? (
                <span className="muted">{tr('lanWaiting')}</span>
              ) : (
                <button className="primary" onClick={() => {
                  if (mode === 'lan-host' && lanHost) {
                    const next = setup('X');
                    setState(next);
                    setHistory([]);
                    setRecorded(false);
                    lanHost.sendView(1, view(next, 1));
                  } else {
                    startLocal(mode === 'ai' ? 'ai' : 'local');
                  }
                }}>{tr('restart')}</button>
              )}
            </div>
          )}
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{tr('localHint')}</h3>
            <p>{tr('keyboardHint')}</p>
            <div className="side-actions">
              <button className="secondary" onClick={undo} disabled={history.length === 0 || mode === 'lan-guest'}>{tr('undo')}</button>
              <button className="secondary" onClick={showHint} disabled={state.status !== 'playing' || mode === 'lan-guest'}>{tr('hint')}</button>
            </div>
          </div>
          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <h3>{tr('lanCode')}</h3>
              <div className="room-code">{lanCode}</div>
              <p>{lanPlayers[1]?.connected ? tr('lanReady') : tr('lanWaiting')}</p>
              {lanPlayers[1] && <p className="peer">{lanPlayers[1].name}{lanPlayers[1].connected ? ' · online' : ''}</p>}
            </div>
          )}
          <div className="side-card record-mini">
            <h3>{tr('stats')}</h3>
            <p>{record.games} {tr('games')} · {record.winsX}/{record.winsO}/{record.draws}</p>
            <button className="text-button" onClick={() => setRecord(clearRecord())}>{tr('resetStats')}</button>
          </div>
        </aside>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => { closeLan(); setScreen('home'); }}>← {tr('back')}</button>
      {mode === 'lan-guest' || guestRoom ? (
        <>
          <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
          <p className="lede">Room {guestRoom}</p>
          {!guestStarted && (
            <div className="lan-form">
              <label>
                <span>{tr('lanName')}</span>
                <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={18} />
              </label>
              <label>
                <span>{tr('lanCode')}</span>
                <input value={guestCode} onChange={(event) => setGuestCode(event.target.value)} inputMode="numeric" maxLength={4} />
              </label>
              <button className="primary wide" onClick={joinGuest} disabled={guestConnecting || !guestName.trim()}>
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
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
                <button className="primary wide" onClick={startLan} disabled={!lanPlayers[1]?.connected}>{tr('lanStart')}</button>
                <button className="secondary wide" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(lanInvite);
                    setToast(tr('lanCopied'));
                  } catch {
                    setToast(lanInvite);
                  }
                }}>{tr('lanCopy')}</button>
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
      </ol>
      <button className="primary" onClick={() => setScreen('home')}>{tr('close')}</button>
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
