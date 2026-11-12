import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseMove, hintFor, type AiLevel, type Hint, type HintReason } from './ai/ai';
import { Board, HERO_BOARD, PlayerMark } from './components/Board';
import {
  apply,
  applySeat,
  EDGE_COUNT,
  edgePosition,
  setup,
  view,
  type GameState,
  type Player,
  type SeatView,
} from './game/boxes';
import { detectLang, t, type Lang, type MessageKey } from './i18n';
import { guestWsUrl, hostWsUrl, inviteUrl, startLanServer, type LanServerInfo } from './net';
import {
  clearRecord,
  clearSave,
  loadRecord,
  loadSave,
  recordResult,
  revokeLastResult,
  saveGame,
  type FamilyRecord,
  type RecordEntry,
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'records' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';

const AI_LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const HINT_KEYS: Record<HintReason, MessageKey> = {
  capture: 'hintCapture',
  double: 'hintDouble',
  safe: 'hintSafe',
  sacrifice: 'hintSacrifice',
  endgame: 'hintEndgame',
};

function playerName(
  lang: Lang,
  mode: Mode,
  seat: Player,
  level: AiLevel,
  guestName?: string | null,
): string {
  if (mode === 'ai') return seat === 0 ? t(lang, 'you') : t(lang, level);
  if (mode === 'local') return t(lang, seat === 0 ? 'p1' : 'p2');
  if (mode === 'lan-host') {
    return seat === 0 ? t(lang, 'youHost') : guestName?.trim() || t(lang, 'guest');
  }
  return seat === 0 ? t(lang, 'host') : t(lang, 'youGuest');
}

function modeLabel(lang: Lang, mode: Mode, level: AiLevel): string {
  if (mode === 'ai') return t(lang, level);
  if (mode === 'local') return t(lang, 'modeLocal');
  if (mode === 'lan-host') return t(lang, 'lanHostGame');
  return t(lang, 'lanGuestGame');
}

function shortDate(lang: Lang, at: number): string {
  try {
    return new Date(at).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() => (guestParams() ? 'lan' : 'home'));
  const [mode, setMode] = useState<Mode>(() => (guestParams() ? 'lan-guest' : 'ai'));
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup(0));
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<Hint | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.boxes.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [motionOn, setMotionOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.boxes.motion') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

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
  const [guestJoined, setGuestJoined] = useState(false);
  const [guestName, setGuestName] = useState(() => guestParams()?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => guestParams()?.code ?? '');
  const [guestRoom] = useState(() => guestParams()?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const lanClosingRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const tr = useCallback((key: MessageKey) => t(lang, key), [lang]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? '点格棋 · Boxes' : 'Boxes · 点格棋';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.boxes.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    document.documentElement.dataset.motion = motionOn ? 'full' : 'reduce';
    try {
      localStorage.setItem('familyarcade.boxes.motion', motionOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [motionOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (screen !== 'records') setConfirmClear(false);
  }, [screen]);

  useEffect(() => {
    if (screen === 'game' && lanError) setToast(lanError);
  }, [lanError, screen]);

  useEffect(() => {
    if (!guest || !guestJoined) return;
    const timer = window.setInterval(() => {
      if (guest.status === 'closed' && !lanClosingRef.current) {
        setGuestStarted(false);
        setGuestJoined(false);
        setLanError(tr('lanDisconnected'));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [guest, guestJoined, tr]);

  const finish = useCallback(
    (next: GameState, currentMode: Mode) => {
      if (next.status === 'playing' || recorded) return;
      setRecorded(true);
      if (currentMode === 'ai' || currentMode === 'local') {
        setRecord(recordResult(next, currentMode));
        clearSave();
        setSaved(null);
      }
    },
    [recorded],
  );

  const commit = useCallback(
    (next: GameState, currentMode: Mode, previous: GameState) => {
      setHistory((items) => [...items, previous]);
      stateRef.current = next;
      setState(next);
      setHint(null);
      if (soundOn) {
        chime(next.status === 'done' ? 'win' : next.lastClaimed.length > 0 ? 'claim' : 'place');
      }
      finish(next, currentMode);
      if ((currentMode === 'ai' || currentMode === 'local') && next.status === 'playing') {
        setSaved(saveGame({ state: next, mode: currentMode, level }));
      }
      if (currentMode === 'lan-host' && hostRef.current) {
        hostRef.current.sendView(1, view(next, 1));
        if (next.status === 'done') hostRef.current.sendResult(view(next, 1));
      }
    },
    [finish, level, soundOn],
  );

  const playEdge = useCallback(
    (edge: number) => {
      if (mode === 'lan-guest') {
        if (guestView?.canMove && guestView.status === 'playing' && !guestView.edges[edge]) {
          guest?.sendIntent({ type: 'draw', edge });
        }
        return;
      }
      if (mode === 'lan-host' && !lanPlayers[1]?.connected) return;
      if (mode === 'ai' && state.turn !== 0) return;
      const result = mode === 'lan-host' ? applySeat(state, 0, edge) : apply(state, edge);
      if (!result.ok) return;
      commit(result.state, mode, state);
    },
    [commit, guest, guestView, lanPlayers, mode, state],
  );

  const startLocal = useCallback((nextMode: 'ai' | 'local') => {
    const next = setup(0);
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
  }, []);

  const startAi = () => {
    setMode('ai');
    setScreen('setup');
  };

  const resume = () => {
    if (!saved) return;
    stateRef.current = saved.state;
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    setHistory([]);
    setHint(null);
    setAiThinking(false);
    setRecorded(saved.state.status !== 'playing');
    setScreen('game');
  };

  const undo = useCallback(() => {
    if (history.length === 0 || mode === 'lan-guest') return;
    const wasDone = state.status === 'done';
    const stack = history.slice();
    let previous = stack.pop();
    if (!previous) return;
    if (mode === 'ai') {
      while (previous.turn !== 0 && stack.length > 0) previous = stack.pop()!;
    }
    setHistory(stack);
    stateRef.current = previous;
    setState(previous);
    setHint(null);
    setAiThinking(false);
    setRecorded(false);
    if (wasDone && (mode === 'ai' || mode === 'local')) setRecord(revokeLastResult());
    if ((mode === 'ai' || mode === 'local') && previous.status === 'playing') {
      setSaved(saveGame({ state: previous, mode, level }));
    }
    if (mode === 'lan-host' && hostRef.current) hostRef.current.sendView(1, view(previous, 1));
  }, [history, level, mode, state]);

  const shown: GameState | SeatView = mode === 'lan-guest' && guestView ? guestView : state;
  const guestNameShown = lanPlayers[1]?.name ?? t(lang, 'guest');
  const name0 = playerName(lang, mode, 0, level, guestNameShown);
  const name1 = playerName(lang, mode, 1, level, guestNameShown);
  const isGuest = mode === 'lan-guest';
  const remaining =
    mode === 'lan-guest' && guestView ? guestView.remaining : EDGE_COUNT - state.moves.length;
  const guestCanPlay = Boolean(guestStarted && guestView?.canMove);
  const hostCanPlay = mode !== 'lan-host' || Boolean(lanPlayers[1]?.connected);
  const canPlay =
    screen === 'game' &&
    shown.status === 'playing' &&
    hostCanPlay &&
    !(mode === 'ai' && (shown.turn === 1 || aiThinking)) &&
    !(mode === 'lan-host' && shown.turn !== 0) &&
    !(isGuest && !guestCanPlay);
  const disabled = !canPlay;
  const hintAvailable =
    screen === 'game' &&
    shown.status === 'playing' &&
    !isGuest &&
    !(mode === 'ai' && (shown.turn !== 0 || aiThinking)) &&
    !(mode === 'lan-host' && (shown.turn !== 0 || !lanPlayers[1]?.connected));
  const canUndo = history.length > 0 && !isGuest && hostCanPlay;

  const showHint = useCallback(() => {
    if (!hintAvailable) return;
    const next = hintFor(state);
    if (next.edge < 0) {
      setToast(tr('hintUnavailable'));
      return;
    }
    setHint(next);
  }, [hintAvailable, state, tr]);

  const aiEffectKey = state;
  useEffect(() => {
    if (mode !== 'ai' || screen !== 'game' || aiEffectKey.status !== 'playing' || aiEffectKey.turn !== 1) {
      return;
    }
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseMove(aiEffectKey, level);
      setAiThinking(false);
      if (move < 0) return;
      const result = apply(aiEffectKey, move);
      if (!result.ok) return;
      commit(result.state, 'ai', aiEffectKey);
    }, 360);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [aiEffectKey, commit, level, mode, screen]);

  const closeLan = useCallback(() => {
    lanClosingRef.current = true;
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
    setGuestJoined(false);
    setGuestConnecting(false);
    window.setTimeout(() => {
      lanClosingRef.current = false;
    }, 500);
  }, [guest]);

  const leaveGame = useCallback(() => {
    closeLan();
    setScreen('home');
  }, [closeLan]);

  const restartGame = useCallback(() => {
    if (mode === 'lan-guest') return;
    if (mode === 'lan-host') {
      if (!lanHost || !lanPlayers[1]?.connected) return;
      const next = setup(0);
      stateRef.current = next;
      setState(next);
      setHistory([]);
      setHint(null);
      setRecorded(false);
      lanHost.sendView(1, view(next, 1));
      return;
    }
    startLocal(mode === 'ai' ? 'ai' : 'local');
  }, [lanHost, lanPlayers, mode, startLocal]);

  const openLanHost = async () => {
    setScreen('lan');
    setMode('lan-host');
    setLanBusy(true);
    setLanError('');
    setLanInvite('');
    setLanQr('');
    setLanPlayers([]);
    setLanCode('');
    lanClosingRef.current = false;
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
      const syncGuest = () => host.sendView(1, view(stateRef.current, 1));
      host.onChange((players) => {
        setLanPlayers(players);
        if (players[1]?.connected && host.started) {
          host.start();
          syncGuest();
          window.setTimeout(syncGuest, 420);
        }
      });
      host.onIntent((seat, intent) => {
        if (seat !== 1) return;
        const edge = Number((intent as { edge?: number } | null)?.edge);
        if (!Number.isInteger(edge)) return;
        const current = stateRef.current;
        const result = applySeat(current, 1, edge);
        if (!result.ok) return;
        commit(result.state, 'lan-host', current);
      });
      host.onClose(() => {
        if (!lanClosingRef.current) {
          setLanPlayers([]);
          setLanError(t(lang, 'lanClosed'));
        }
      });
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#29231d', light: '#fffaf1' },
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLanError(
        /timed out|failed|closed/i.test(message) ? tr('lanDisconnected') : message,
      );
      setLanInvite('');
      setLanQr('');
      hostRef.current?.close();
      hostRef.current = null;
      setLanHost(null);
    } finally {
      setLanBusy(false);
    }
  };

  const startLan = () => {
    if (!lanHost) return;
    const next = setup(0);
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setHint(null);
    setRecorded(false);
    setAiThinking(false);
    setScreen('game');
    lanHost.start();
    lanHost.sendView(1, view(next, 1));
    window.setTimeout(() => {
      hostRef.current?.sendView(1, view(stateRef.current, 1));
    }, 420);
  };

  const joinGuest = async () => {
    if (!guestRoom || !guestName.trim() || guestCode.trim().length !== 4) return;
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
      setGuestJoined(true);
      joined.onView((payload) => setGuestView(payload as SeatView));
      joined.onStart(() => {
        setGuestJoined(true);
        setGuestStarted(true);
        setScreen('game');
      });
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? tr('lanFull') : tr('lanWrong'));
      });
      setGuestStarted(joined.started);
      if (joined.started) setScreen('game');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLanError(
        message.includes('room-full')
          ? tr('lanFull')
          : message.includes('rejected') || message.includes('wrong-code')
            ? tr('lanWrong')
            : tr('lanDisconnected'),
      );
    } finally {
      setGuestConnecting(false);
    }
  };

  useEffect(() => {
    if (!guestRoom) return;
    setScreen('lan');
    setMode('lan-guest');
  }, [guestRoom]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key === 'Escape') {
        if (screen === 'game' || screen === 'lan') closeLan();
        setScreen('home');
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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeLan, screen, showHint, undo]);

  const hintText = hint ? t(lang, HINT_KEYS[hint.reason]) : '';
  const turnName = playerName(lang, mode, shown.turn, level, guestNameShown);
  const displayStatus =
    shown.status === 'done'
      ? tr('gameOver')
      : isGuest && !guestView
        ? tr('lanWaitingHost')
        : aiThinking
          ? tr('aiThinking')
          : t(lang, 'toDraw', { name: turnName });
  const winnerText =
    shown.status === 'done'
      ? shown.winner === null
        ? tr('draw')
        : t(lang, 'wins', {
            name: playerName(lang, mode, shown.winner, level, guestNameShown),
          })
      : '';
  const recordEntryName = (entry: RecordEntry) => {
    if (entry.winner === 'draw') return tr('drawShort');
    if (entry.mode === 'ai') return entry.winner === 'p1' ? tr('you') : tr('ai');
    return entry.winner === 'p1' ? tr('p1') : tr('p2');
  };
  const lastWinnerName =
    record.lastWinner === null
      ? '—'
      : record.lastWinner === 'draw'
        ? tr('drawShort')
        : record.lastWinner === 'p1'
          ? record.recent[0]?.mode === 'ai'
            ? tr('you')
            : tr('p1')
          : record.recent[0]?.mode === 'ai'
            ? tr('ai')
            : tr('p2');

  const labelFor = (edge: number) => {
    const position = edgePosition(edge);
    if (!position) return '';
    return position.kind === 'h'
      ? t(lang, 'edgeH', { row: position.row + 1, col: position.col + 1 })
      : t(lang, 'edgeV', { row: position.row + 1, col: position.col + 1 });
  };

  const scoreCard = (player: Player) => {
    const name = player === 0 ? name0 : name1;
    const score = shown.scores[player];
    const active = shown.status === 'playing' && shown.turn === player;
    return (
      <div
        className={`score-card owner-${player} ${active ? 'active' : ''}`}
        role="group"
        aria-label={`${name}: ${score}`}
      >
        <span className="score-mark">
          <PlayerMark player={player} />
        </span>
        <div className="score-body">
          <div className="score-name">{name}</div>
          <div className="score-number">
            {score}
            <small>{score === 1 ? tr('box') : tr('boxes')}</small>
          </div>
          <div className="score-bar">
            <span className="score-fill" style={{ width: `${(score / 25) * 100}%` }} />
          </div>
        </div>
      </div>
    );
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(lanInvite);
      setToast(tr('lanCopied'));
    } catch {
      setToast(lanInvite);
    }
  };

  const toggleRecordClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setRecord(clearRecord());
    setConfirmClear(false);
    setToast(tr('recordCleared'));
  };

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">FAMILY ARCADE · 06 / 27</p>
          <h1>
            {tr('title')}
            <span className="title-dot">.</span>
          </h1>
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
        <div className="hero-board">
          <div className="board-frame">
            <Board state={HERO_BOARD} decorative boardLabel={tr('title')} />
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
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={startAi}>
              {tr('playAi')}
            </button>
            <button className="secondary wide" onClick={() => startLocal('local')}>
              {tr('playLocal')}
            </button>
            <button className="secondary wide" onClick={() => void openLanHost()}>
              {tr('playLan')}
            </button>
            <button className="text-button" onClick={() => setScreen('rules')}>
              {tr('rules')} →
            </button>
            <button className="text-button" onClick={() => setScreen('records')}>
              {tr('records')} →
            </button>
          </div>
          <div className="record-strip">
            <strong>{record.games}</strong>
            <span>{record.games === 1 ? tr('gameSingular') : tr('games')}</span>
            <span className="sep">·</span>
            <span>
              {record.winsP1} {tr('p1')}
            </span>
            <span className="sep">·</span>
            <span>
              {record.winsP2} {tr('p2')}
            </span>
            <span className="sep">·</span>
            <span>
              {record.draws} {tr('draws')}
            </span>
          </div>
        </div>
      </section>

      <section className="steps">
        <div className="step">
          <span className="step-num">01</span>
          <div>
            <strong>{tr('step1Title')}</strong>
            <p>{tr('step1Body')}</p>
          </div>
        </div>
        <div className="step">
          <span className="step-num">02</span>
          <div>
            <strong>{tr('step2Title')}</strong>
            <p>{tr('step2Body')}</p>
          </div>
        </div>
        <div className="step">
          <span className="step-num">03</span>
          <div>
            <strong>{tr('step3Title')}</strong>
            <p>{tr('step3Body')}</p>
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
      <p className="eyebrow">{tr('modeAi')}</p>
      <h2 className="screen-title">{tr('difficulty')}</h2>
      <p className="lede">{tr('setupLede')}</p>
      <div className="setup-layout">
        <div>
          <div className="level-grid">
            {AI_LEVELS.map((item) => (
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
          <div className="row-actions">
            <button className="primary" onClick={() => startLocal('ai')}>
              {tr('begin')}
            </button>
            <button className="ghost" onClick={() => setScreen('home')}>
              {tr('back')}
            </button>
          </div>
        </div>
        <aside className="setup-aside">
          <h3>{tr('setupAsideTitle')}</h3>
          <ul>
            <li>
              <span className="swatch swatch-coral" />
              <span>{tr('setupAside1')}</span>
            </li>
            <li>
              <span className="swatch swatch-sage" />
              <span>{tr('setupAside2')}</span>
            </li>
            <li>
              <span className="swatch" style={{ background: 'var(--gold)' }} />
              <span>{tr('setupAside3')}</span>
            </li>
          </ul>
          <p className="setup-note">{tr('setupStartNote')}</p>
          <div className="setup-mini">
            <Board state={HERO_BOARD} decorative boardLabel={tr('title')} />
          </div>
        </aside>
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
          <span>
            {modeLabel(lang, mode, level)}
            {mode === 'lan-host' && lanCode ? ` · ${lanCode}` : ''}
          </span>
        </div>
        <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
          {tr('language')}
        </button>
      </header>

      <div className="game-layout">
        <section className="board-wrap">
          <div className="scoreboard" aria-live="polite">
            {scoreCard(0)}
            <div className="score-versus">
              <strong>25</strong>
              <small>{tr('boxes')}</small>
            </div>
            {scoreCard(1)}
          </div>
          <div className="game-meta">
            <span className="status-pill">
              {shown.status === 'playing' && <PlayerMark player={shown.turn} />}
              <span>{displayStatus}</span>
            </span>
            <span>{t(lang, 'lineCount', { n: remaining })}</span>
          </div>
          {hint && (
            <div className="hint-card" role="status">
              <span className="hint-icon">?</span>
              <div className="hint-copy">
                <strong>{tr('hintTitle')}</strong>
                <p>{hintText}</p>
              </div>
            </div>
          )}
          <div className="board-frame">
            <Board
              state={shown}
              disabled={disabled}
              hint={hint?.edge ?? null}
              onEdge={playEdge}
              labelFor={labelFor}
              boardLabel={tr('title')}
            />
          </div>
          {shown.status === 'done' && (
            <div className="result-banner" role="status">
              <div className="result-copy">
                <strong>{winnerText}</strong>
                <span>{tr('finalScore')}</span>
              </div>
              <div className="result-score">
                {shown.scores[0]}
                <span className="dash">–</span>
                {shown.scores[1]}
              </div>
              <div className="result-actions">
                {isGuest ? (
                  <span className="muted">{tr('resultGuestWait')}</span>
                ) : (
                  <button
                    className="primary"
                    onClick={restartGame}
                    disabled={mode === 'lan-host' && !lanPlayers[1]?.connected}
                  >
                    {tr('restart')}
                  </button>
                )}
                <button className="secondary" onClick={leaveGame}>
                  {tr('home')}
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{tr('controls')}</h3>
            <p>{tr('keyboardHint')}</p>
            <div className="side-actions">
              <button className="secondary" onClick={undo} disabled={!canUndo}>
                {tr('undo')}
              </button>
              <button className="secondary" onClick={showHint} disabled={!hintAvailable}>
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
                  {lanPlayers[1].name}{' '}
                  {lanPlayers[1].connected ? `· ${tr('online')}` : `· ${tr('offline')}`}
                </p>
              )}
            </div>
          )}
          {isGuest && guestStarted && (
            <div className="side-card">
              <h3>{tr('lanCode')}</h3>
              <div className="room-code">{guestCode}</div>
              <p>{tr('lanGuestSeat')}</p>
            </div>
          )}
          <div className="side-card">
            <h3>{tr('chainTipTitle')}</h3>
            <p>{tr('chainTipBody')}</p>
          </div>
          <div className="side-card record-mini">
            <h3>{tr('stats')}</h3>
            <div className="mini-row">
              <span>{record.games === 1 ? tr('gameSingular') : tr('games')}</span>
              <b>{record.games}</b>
            </div>
            <div className="mini-row">
              <span>{tr('p1')}</span>
              <b>{record.winsP1}</b>
            </div>
            <div className="mini-row">
              <span>{tr('p2')}</span>
              <b>{record.winsP2}</b>
            </div>
          </div>
        </aside>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <p className="lede">{tr('rulesLede')}</p>
      <div className="rules-grid">
        {[1, 2, 3, 4].map((number) => (
          <div className="rule-card" key={number}>
            <span className="rule-num">0{number}</span>
            <p>{tr(`rule${number}` as MessageKey)}</p>
          </div>
        ))}
      </div>
      <div className="rules-note">
        <h3>{tr('rulesScoring')}</h3>
        <p>{tr('rulesScoringBody')}</p>
      </div>
      <div className="rules-note">
        <h3>{tr('rulesKeys')}</h3>
        <p>{tr('rulesKeysBody')}</p>
      </div>
      <div className="row-actions" style={{ marginTop: 20 }}>
        <button className="primary" onClick={() => setScreen('home')}>
          {tr('backHome')}
        </button>
        <button className="ghost" onClick={() => setScreen('home')}>
          {tr('close')}
        </button>
      </div>
    </main>
  );

  const recordsScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <p className="eyebrow">{tr('stats')}</p>
      <h2 className="screen-title">{tr('recordTitle')}</h2>
      <p className="lede">{tr('recordLede')}</p>
      <div className="records-grid">
        <div className="stat-card">
          <div className="stat-number">{record.games}</div>
          <div className="stat-label">{record.games === 1 ? tr('gameSingular') : tr('games')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{record.winsP1}</div>
          <div className="stat-label">{tr('recordP1')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{record.winsP2}</div>
          <div className="stat-label">{tr('recordP2')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{record.draws}</div>
          <div className="stat-label">{tr('draws')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{record.boxesP1}</div>
          <div className="stat-label">
            {tr('recordBoxes')} · {tr('p1')}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{record.boxesP2}</div>
          <div className="stat-label">
            {tr('recordBoxes')} · {tr('p2')}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{record.streak}</div>
          <div className="stat-label">{tr('recordStreak')}</div>
          <div className="stat-note">{tr('recordStreakNote')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ fontSize: 20, lineHeight: 1.25 }}>
            {lastWinnerName}
          </div>
          <div className="stat-label">{tr('recordLastWinner')}</div>
        </div>
      </div>
      <h3 className="subhead">{tr('recordRecent')}</h3>
      {record.recent.length === 0 ? (
        <div className="empty-record">{tr('recordEmpty')}</div>
      ) : (
        <div className="recent-list">
          {record.recent.map((entry, index) => (
            <div className="recent-row" key={`${entry.at}-${index}`}>
              <div className="recent-winner">
                {entry.winner === 'draw' ? (
                  <span className="draw-badge">·</span>
                ) : (
                  <PlayerMark player={entry.winner === 'p1' ? 0 : 1} />
                )}
                <span>
                  {entry.winner === 'draw'
                    ? tr('draw')
                    : t(lang, 'wins', { name: recordEntryName(entry) })}
                </span>
              </div>
              <div className="recent-score">
                {entry.scores[0]}–{entry.scores[1]}
              </div>
              <div className="recent-meta">
                {tr(entry.mode === 'ai' ? 'recordModeAi' : 'recordModeLocal')} ·{' '}
                {shortDate(lang, entry.at)}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="record-actions">
        <button className="primary" onClick={startAi}>
          {tr('playAi')}
        </button>
        <button className="secondary" onClick={() => startLocal('local')}>
          {tr('playLocal')}
        </button>
        <button className={confirmClear ? 'primary' : 'ghost'} onClick={toggleRecordClear}>
          {confirmClear ? tr('confirmClear') : tr('resetStats')}
        </button>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell">
      <button
        className="back"
        onClick={() => {
          closeLan();
          setScreen('home');
        }}
      >
        ← {tr('back')}
      </button>
      {mode === 'lan-guest' || guestRoom ? (
        <>
          <p className="eyebrow">{tr('lanGuestGame')}</p>
          <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
          <p className="lede">{t(lang, 'roomNumber', { room: guestRoom })}</p>
          {!guestJoined ? (
            <>
              <p className="lede">{tr('lanGuestLede')}</p>
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
                    onChange={(event) =>
                      setGuestCode(event.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    inputMode="numeric"
                    maxLength={4}
                  />
                </label>
                <button
                  className="primary wide"
                  onClick={() => void joinGuest()}
                  disabled={guestConnecting || !guestName.trim() || guestCode.trim().length !== 4}
                >
                  {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="lede">{guestStarted ? tr('lanGuestWaiting') : tr('lanWaitingHost')}</p>
              {guestStarted && (
                <button className="primary" onClick={() => setScreen('game')}>
                  {tr('enterTable')}
                </button>
              )}
            </>
          )}
          {lanError && <p className="error">{lanError}</p>}
          <div className="row-actions" style={{ marginTop: 18 }}>
            <button
              className="ghost"
              onClick={() => {
                closeLan();
                setScreen('home');
              }}
            >
              {tr('lanLeave')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="eyebrow">{tr('lanHostGame')}</p>
          <h2 className="screen-title">{tr('lanTitle')}</h2>
          <p className="lede">{tr('lanHostLede')}</p>
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
                <button className="secondary wide" onClick={() => void copyInvite()}>
                  {tr('lanCopy')}
                </button>
                <p className="muted" style={{ marginTop: 12 }}>
                  {tr('lanHostHint')}
                </p>
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
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'records') return recordsScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
