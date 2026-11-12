import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseTurn, hint as getHint, type AiLevel, type Hint, type HintReason } from './ai/ai';
import { Board } from './components/Board';
import {
  applyMove,
  applySeat,
  endTurn,
  legalMoves,
  pipCount,
  roll,
  seededRng,
  setup,
  view,
  type GameState,
  type Move,
  type MoveFrom,
  type MoveTo,
  type SeatView,
  type Side,
} from './game/tables';
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
  type PlayMode,
  type FamilyRecord,
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'stats' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type CommitSound = 'place' | 'roll' | 'hit';

const AI_LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const HINT_KEYS: Record<HintReason, MessageKey> = {
  hit: 'hintReasonHit',
  enter: 'hintReasonEnter',
  'bear-off': 'hintReasonBearOff',
  'make-point': 'hintReasonMakePoint',
  safe: 'hintReasonSafe',
  best: 'hintReasonBest',
};

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ value, muted = false }: { value: number | null; muted?: boolean }) {
  return (
    <span className={`die ${muted ? 'die-muted' : ''}`} aria-label={value ? String(value) : undefined}>
      {value === null
        ? Array.from({ length: 9 }, (_, index) => <span key={index} className="pip pip-off" />)
        : Array.from({ length: 9 }, (_, index) => (
            <span key={index} className={`pip ${PIPS[value]?.includes(index) ? 'pip-on' : ''}`} />
          ))}
    </span>
  );
}

function logPoint(lang: Lang, value: MoveFrom | MoveTo): string {
  if (value === 'bar') return t(lang, 'barShort');
  if (value === 'off') return t(lang, 'offShort');
  return String(value + 1);
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup('W'));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<number | 'bar' | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.tables.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
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
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => guestParams()?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => guestParams()?.code ?? '');
  const [guestRoom] = useState(() => guestParams()?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const recordedRef = useRef(false);
  const commitRef = useRef<(next: GameState, previous: GameState, currentMode: Mode, sound?: CommitSound) => void>(
    () => undefined,
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const tr = useCallback((key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params), [lang]);

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
      localStorage.setItem('familyarcade.tables.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const finish = useCallback(
    (next: GameState, currentMode: Mode) => {
      if (next.status !== 'finished' || !next.winner || recordedRef.current) return;
      recordedRef.current = true;
      setRecorded(true);
      if (currentMode !== 'lan-guest') {
        setRecord(recordResult(next, currentMode === 'lan-host' ? 'lan' : currentMode));
      }
      if (currentMode !== 'lan-guest') {
        clearSave();
        setSaved(null);
      }
      if (soundOn) chime('win');
    },
    [soundOn],
  );

  const commit = useCallback(
    (next: GameState, previous: GameState, currentMode: Mode, sound: CommitSound = 'place') => {
      setHistory((items) => [...items, previous]);
      setState(next);
      setSelected(null);
      setHint(null);
      if (next.status !== 'finished' && soundOn) chime(sound);
      finish(next, currentMode);
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.status !== 'finished') saveGame({ state: next, mode: currentMode as PlayMode, level });
        setSaved(null);
      }
      if (currentMode === 'lan-host' && hostRef.current) {
        hostRef.current.sendView(1, view(next, 1));
        if (next.status === 'finished') hostRef.current.sendResult(view(next, 1));
      }
    },
    [finish, level, soundOn],
  );

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  const rollCurrent = useCallback(
    (currentMode: Mode) => {
      const current = stateRef.current;
      if (current.status !== 'awaiting-roll') return;
      const a = 1 + Math.floor(Math.random() * 6);
      const b = 1 + Math.floor(Math.random() * 6);
      const result = roll(current, a, b);
      if (!result.ok) return;
      commitRef.current(result.state, current, currentMode, 'roll');
      if (legalMoves(result.state).length === 0) setToast(t(lang, 'noMoves'));
    },
    [lang],
  );

  const playMove = useCallback(
    (move: Move) => {
      if (mode === 'lan-guest') {
        guest?.sendIntent({ type: 'move', move });
        return;
      }
      const current = stateRef.current;
      const result = mode === 'lan-host' ? applySeat(current, 0, move) : applyMove(current, move);
      if (!result.ok) {
        setToast(tr('noLegalShort'));
        return;
      }
      commitRef.current(result.state, current, mode, move.hit ? 'hit' : 'place');
    },
    [guest, mode, tr],
  );

  const handleRoll = useCallback(() => {
    if (mode === 'lan-guest') {
      if (guestStarted && guestView?.canRoll) guest?.sendIntent({ type: 'roll' });
      return;
    }
    rollCurrent(mode);
  }, [guest, guestStarted, guestView, mode, rollCurrent]);

  const handlePass = useCallback(() => {
    if (mode === 'lan-guest') {
      if (guestStarted && guestView?.state.status === 'moving' && guestView.state.turn === 'B') {
        guest?.sendIntent({ type: 'pass' });
      }
      return;
    }
    const current = stateRef.current;
    const result = endTurn(current);
    if (result.ok) commitRef.current(result.state, current, mode, 'place');
  }, [guest, guestStarted, guestView, mode]);

  const undo = useCallback(() => {
    if (history.length === 0 || mode === 'lan-guest') return;
    let index = history.length - 1;
    if (mode === 'ai') {
      while (index >= 0 && !(history[index].turn === 'W' && history[index].status === 'awaiting-roll')) {
        index -= 1;
      }
      if (index < 0) index = history.length - 1;
    }
    const target = history[index];
    setState(target);
    setHistory(history.slice(0, index));
    setSelected(null);
    setHint(null);
    setRecorded(false);
    recordedRef.current = false;
    if (mode === 'ai' || mode === 'local') {
      saveGame({ state: target, mode, level });
      setSaved(null);
    }
    if (mode === 'lan-host') hostRef.current?.sendView(1, view(target, 1));
  }, [history, level, mode]);

  const activeState = guestView?.state ?? state;
  const isGuest = mode === 'lan-guest';
  const moves = useMemo(() => (activeState.status === 'moving' ? legalMoves(activeState) : []), [activeState]);

  const allowedTurn =
    mode === 'local'
      ? true
      : mode === 'ai'
        ? activeState.turn === 'W'
        : mode === 'lan-host'
          ? activeState.turn === 'W'
          : guestStarted && activeState.turn === 'B';
  const canAct = screen === 'game' && activeState.status !== 'finished' && allowedTurn;
  const boardInteractive = canAct && activeState.status === 'moving';
  const aiThinking = mode === 'ai' && screen === 'game' && activeState.turn === 'B' && activeState.status !== 'finished';

  const showHint = useCallback(() => {
    if (!canAct) return;
    if (activeState.status === 'awaiting-roll') {
      setToast(tr('hintRollFirst'));
      return;
    }
    if (activeState.status !== 'moving') return;
    const seed = activeState.turnNo * 7919 + activeState.dice.reduce((sum, die) => sum * 11 + die, 17);
    const found = getHint(activeState, seededRng(seed));
    if (found.moves.length === 0) {
      setToast(tr('hintUnknown'));
      return;
    }
    setHint(found);
    const first = found.moves[0];
    setSelected(first.from);
    setToast(tr(HINT_KEYS[found.reason]));
  }, [activeState, canAct, tr]);

  // AI: roll, then play one move at a time so the turn is visible.
  useEffect(() => {
    if (mode !== 'ai' || screen !== 'game' || state.status === 'finished' || state.turn !== 'B') return;
    const delay = state.status === 'awaiting-roll' ? 700 : 520;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.turn !== 'B' || current.status === 'finished') return;
      if (current.status === 'awaiting-roll') {
        rollCurrent('ai');
        return;
      }
      const sequence = chooseTurn(current, level);
      if (sequence.length === 0) {
        const passed = endTurn(current);
        if (passed.ok) commitRef.current(passed.state, current, 'ai', 'place');
        return;
      }
      const result = applyMove(current, sequence[0]);
      if (result.ok) {
        commitRef.current(result.state, current, 'ai', sequence[0].hit ? 'hit' : 'place');
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [level, mode, rollCurrent, screen, state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (screen !== 'home') {
          closeLan();
          setScreen('home');
        }
        return;
      }
      if (screen !== 'game') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const key = event.key.toLowerCase();
      if (key === 'r') {
        event.preventDefault();
        handleRoll();
      } else if (key === 'u') {
        event.preventDefault();
        undo();
      } else if (key === 'h') {
        event.preventDefault();
        showHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleRoll, screen, showHint, undo]);

  const startLocal = (nextMode: 'ai' | 'local') => {
    const next = setup('W');
    setMode(nextMode);
    setState(next);
    setHistory([]);
    setSelected(null);
    setHint(null);
    setRecorded(false);
    recordedRef.current = false;
    setScreen('game');
    clearSave();
    setSaved(null);
  };

  const resume = () => {
    if (!saved) return;
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    setHistory([]);
    setSelected(null);
    setHint(null);
    setRecorded(saved.state.status === 'finished');
    recordedRef.current = saved.state.status === 'finished';
    setScreen('game');
    setSaved(null);
  };

  const restart = () => {
    if (isGuest) return;
    const next = setup('W');
    setState(next);
    setHistory([]);
    setSelected(null);
    setHint(null);
    setRecorded(false);
    recordedRef.current = false;
    setSaved(null);
    clearSave();
    if (mode === 'lan-host' && hostRef.current) hostRef.current.sendView(1, view(next, 1));
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

  // Auto-join when the URL contains a room.
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
        if (seat !== 1) return;
        const payload = intent as { type?: string; move?: Move } | null;
        const current = stateRef.current;
        if (current.status === 'finished') return;
        if (payload?.type === 'roll') {
          if (current.turn === 'B' && current.status === 'awaiting-roll') rollCurrent('lan-host');
          return;
        }
        if (payload?.type === 'pass') {
          if (current.turn === 'B') {
            const passed = endTurn(current);
            if (passed.ok) commitRef.current(passed.state, current, 'lan-host', 'place');
          }
          return;
        }
        if (payload?.type === 'move' && payload.move) {
          const result = applySeat(current, 1, payload.move);
          if (result.ok) {
            commitRef.current(result.state, current, 'lan-host', payload.move.hit ? 'hit' : 'place');
          }
        }
      });
      host.onClose(() => setLanError(tr('lanClosed')));
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#2b2520', light: '#fffaf0' },
        }),
      );
    } catch {
      setLanError(tr('lanHostFailed'));
      hostRef.current?.close();
      hostRef.current = null;
    } finally {
      setLanBusy(false);
    }
  };

  const startLan = () => {
    if (!lanHost) return;
    const next = setup('W');
    setState(next);
    setHistory([]);
    setSelected(null);
    setHint(null);
    setRecorded(false);
    recordedRef.current = false;
    clearSave();
    setSaved(null);
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
      joined.onStart(() => setGuestStarted(true));
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? tr('lanFull') : tr('lanWrong'));
      });
      setGuestStarted(false);
    } catch (error) {
      setLanError(
        error instanceof Error && error.message.includes('rejected') ? tr('lanWrong') : tr('lanDisconnected'),
      );
    } finally {
      setGuestConnecting(false);
    }
  };

  const onPoint = (point: number) => {
    if (!boardInteractive) return;
    if (selected !== null) {
      const candidates = moves.filter((move) => move.from === selected && move.to === point);
      if (candidates.length > 0) {
        const move = candidates.slice().sort((a, b) => a.die - b.die)[0];
        playMove(move);
        return;
      }
    }
    const value = activeState.points[point] ?? 0;
    const side: Side | null = value > 0 ? 'W' : value < 0 ? 'B' : null;
    if (side === activeState.turn && Math.abs(value) > 0) {
      setSelected(point);
      setHint(null);
    } else {
      setSelected(null);
    }
  };

  const onBar = () => {
    if (!boardInteractive) return;
    if (activeState.bar[activeState.turn] > 0) {
      setSelected('bar');
      setHint(null);
    }
  };

  const onOff = (tray: Side) => {
    if (!boardInteractive) return;
    if (tray !== activeState.turn) return;
    if (selected === null) {
      setToast(tr('selectChecker'));
      return;
    }
    const move = moves.find((item) => item.from === selected && item.to === 'off');
    if (move) playMove(move);
    else setToast(tr('noLegalShort'));
  };

  const heroState = useMemo(() => {
    const points = Array<number>(24).fill(0);
    points[0] = 1;
    points[1] = 2;
    points[2] = 2;
    points[3] = 1;
    points[4] = 3;
    points[5] = 2;
    points[16] = -3;
    points[17] = -2;
    points[19] = -1;
    points[20] = -2;
    points[22] = -3;
    points[23] = -2;
    return {
      ...setup('W'),
      points,
      bar: { W: 1, B: 0 },
      off: { W: 3, B: 2 },
      status: 'moving' as const,
      dice: [4, 2],
      roll: [4, 2] as [number, number],
      lastMove: { from: 8, to: 4, die: 4, hit: false },
    } satisfies GameState;
  }, []);

  const modeName =
    mode === 'ai'
      ? `${tr('modeAi')} · ${tr(level)}`
      : mode === 'local'
        ? tr('modeLocal')
        : mode === 'lan-host'
          ? tr('lanHostMode')
          : tr('lanGuestMode');

  const gameWord = lang === 'zh' ? tr('gamesPlayed') : record.games === 1 ? tr('gameSingular') : tr('gamesPlayed');
  const recordCount =
    lang === 'zh' ? `${record.games} 局` : `${record.games} ${record.games === 1 ? 'game' : 'games'}`;

  const statusText =
    isGuest && !guestStarted
      ? tr('waitingGuest')
      : activeState.status === 'finished'
        ? tr(activeState.winner === 'W' ? 'whiteWins' : 'blackWins')
        : activeState.status === 'awaiting-roll'
          ? mode === 'ai' && activeState.turn === 'B'
            ? tr('opponentRolling')
            : tr(activeState.turn === 'W' ? 'whiteRoll' : 'blackRoll')
          : mode === 'ai' && activeState.turn === 'B'
            ? tr('opponentMoving')
            : tr(activeState.turn === 'W' ? 'whiteMove' : 'blackMove');

  const whiteMeta =
    mode === 'ai'
      ? tr('tagYou')
      : mode === 'lan-host'
        ? tr('hostLine')
        : mode === 'lan-guest'
          ? tr('tagHost')
          : tr('player1');
  const blackMeta =
    mode === 'ai'
      ? tr('aiLevelLine', { level: tr(level) })
      : mode === 'lan-host'
        ? (lanPlayers[1]?.name ?? tr('tagGuest'))
        : mode === 'lan-guest'
          ? tr('guestLine')
          : tr('player2');

  const playerStrip = (side: Side) => {
    const isWhite = side === 'W';
    return (
      <div className={`player-strip ${isWhite ? 'white-strip' : 'black-strip'} ${activeState.turn === side ? 'active' : ''}`}>
        <span className={`player-disc disc-${side.toLowerCase()}`} aria-hidden="true" />
        <div className="player-name">
          <strong>{tr(isWhite ? 'white' : 'black')}</strong>
          <small>{isWhite ? whiteMeta : blackMeta}</small>
        </div>
        <div className="player-stats">
          <span>
            <b>{pipCount(activeState, side)}</b> {tr('pips')}
          </span>
          <span>
            <b>{activeState.bar[side]}</b> {tr('bar')}
          </span>
          <span>
            <b>{activeState.off[side]}</b> {tr('off')}
          </span>
        </div>
      </div>
    );
  };

  const diceArea =
    activeState.status === 'moving' && activeState.dice.length > 0 ? (
      <div className="dice-row" aria-label={tr('rollLabel')}>
        {activeState.dice.map((value, index) => (
          <Die key={`${value}-${index}`} value={value} />
        ))}
      </div>
    ) : activeState.status === 'awaiting-roll' ? (
      <div className="dice-row" aria-label={tr('rollLabel')}>
        <Die value={null} muted />
        <Die value={null} muted />
      </div>
    ) : (
      <div className="dice-row">
        <Die value={null} muted />
      </div>
    );

  const resultBanner = activeState.status === 'finished' && (
    <div className="result-banner" role="status">
      <span className={`result-seal seal-${activeState.winner?.toLowerCase()}`} aria-hidden="true" />
      <div className="result-copy">
        <strong>{tr(activeState.winner === 'W' ? 'whiteWins' : 'blackWins')}</strong>
        <p>{tr('winDetail')}</p>
      </div>
      {isGuest ? (
        <span className="muted">{tr('lanWaiting')}</span>
      ) : (
        <button className="primary compact" onClick={restart}>
          {tr('playAgain')}
        </button>
      )}
    </div>
  );

  const homeScreen = (
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
        <div className="hero-stage">
          <div className="hero-board">
            <Board
              state={heroState}
              lang={lang}
              selected={null}
              moves={[]}
              hint={null}
              interactive={false}
              onPoint={() => undefined}
              onBar={() => undefined}
              onOff={() => undefined}
            />
          </div>
          <div className="hero-dice" aria-hidden="true">
            <Die value={4} />
            <Die value={2} />
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
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={() => setScreen('setup')}>
              {tr('playAi')}
            </button>
            <button className="secondary wide" onClick={() => startLocal('local')}>
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
          <div className="record-strip">
            <span>{tr('stats')}</span>
            <strong>{record.games}</strong>
            <span>{gameWord}</span>
            <span className="dot">·</span>
            <span>{record.winsW} {tr('whiteWinShort')}</span>
            <span className="dot">·</span>
            <span>{record.winsB} {tr('blackWinShort')}</span>
          </div>
          <p className="home-note">{tr('savedLocal')}</p>
        </div>
      </section>

      <section className="home-features">
        {[
          ['feature1Title', 'feature1'],
          ['feature2Title', 'feature2'],
          ['feature3Title', 'feature3'],
        ].map(([title, body], index) => (
          <article className="feature-card" key={title}>
            <span className="feature-number">{String(index + 1).padStart(2, '0')}</span>
            <h3>{tr(title as MessageKey)}</h3>
            <p>{tr(body as MessageKey)}</p>
          </article>
        ))}
      </section>
      <footer className="foot">{tr('homeFooter')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <p className="eyebrow setup-eyebrow">{tr('tableNo')}</p>
      <h2 className="screen-title">{tr('difficulty')}</h2>
      <p className="lede">{tr('setupLede')}</p>
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
      <div className="setup-foot">
        <p className="setup-note">{tr('youPlay')}</p>
        <div className="row-actions">
          <button className="primary" onClick={() => startLocal('ai')}>
            {tr('begin')}
          </button>
          <button className="ghost" onClick={() => setScreen('home')}>
            {tr('back')}
          </button>
        </div>
      </div>
      <div className="setup-tip">
        <span className="checker checker-w" aria-hidden="true" />
        <span>{tr('firstRoll')}</span>
        <span className="checker checker-b" aria-hidden="true" />
      </div>
    </main>
  );

  const gameScreen = (
    <main className="shell game-shell">
      <header className="game-top">
        <button
          className="back"
          onClick={() => {
            closeLan();
            setScreen('home');
          }}
        >
          ← {tr('home')}
        </button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>{modeName}</span>
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
        <section className="table-wrap">
          <div className="table-status">
            <span className={`turn-pip pip-${activeState.turn.toLowerCase()}`} aria-hidden="true" />
            <div>
              <strong>{statusText}</strong>
              <small>
                {tr('turn', { n: activeState.turnNo })}
                {aiThinking ? ` · ${tr('aiThinking')}` : ''}
              </small>
            </div>
            {activeState.status === 'moving' && (
              <span className="status-dice">
                {activeState.dice.map((value, index) => (
                  <span key={index} className="mini-die">
                    {value}
                  </span>
                ))}
              </span>
            )}
          </div>

          {playerStrip('B')}
          <div className="board-wrap">
            <Board
              state={activeState}
              lang={lang}
              selected={selected}
              moves={moves}
              hint={hint?.moves[0] ?? null}
              interactive={boardInteractive}
              onPoint={onPoint}
              onBar={onBar}
              onOff={onOff}
            />
          </div>
          {playerStrip('W')}
          {resultBanner}
        </section>

        <aside className="side">
          <div className="side-card turn-card">
            <div className="turn-card-head">
              <div>
                <span className="label">
                  {activeState.status === 'finished' ? tr('gameOverLabel') : tr('turn', { n: activeState.turnNo })}
                </span>
                <h3>{statusText}</h3>
              </div>
              <span className={`turn-disc disc-${activeState.turn.toLowerCase()}`} aria-hidden="true" />
            </div>
            {activeState.status !== 'finished' && diceArea}
            {activeState.status === 'awaiting-roll' && (
              <button className="primary wide roll-button" onClick={handleRoll} disabled={!canAct}>
                {tr('rollDice')}
              </button>
            )}
            {activeState.status === 'moving' && moves.length === 0 && (
              <button className="primary wide roll-button" onClick={handlePass} disabled={!canAct}>
                {tr('passTurn')}
              </button>
            )}
            {activeState.status === 'moving' && activeState.dice.length > 0 && (
              <p className="dice-note">
                {activeState.roll &&
                activeState.roll[0] === activeState.roll[1] &&
                activeState.dice.length === 4
                  ? tr('doubles')
                  : activeState.dice.length === 1
                    ? tr('oneMoveLeft')
                    : tr('movesLeft', { n: activeState.dice.length })}
              </p>
            )}
            <p className="turn-help">
              {activeState.status === 'finished'
                ? tr('winDetail')
                : activeState.status === 'moving'
                  ? tr('movePrompt')
                  : tr('rollPrompt')}
            </p>
            {toast && <p className="hint-toast">{toast}</p>}
          </div>

          <div className="side-card">
            <h3>{tr('info')}</h3>
            <div className="side-actions">
              <button
                className="secondary"
                onClick={undo}
                disabled={history.length === 0 || mode === 'lan-guest' || recorded}
              >
                {tr('undo')}
              </button>
              <button className="secondary" onClick={showHint} disabled={!canAct || activeState.status !== 'moving'}>
                {tr('hint')}
              </button>
            </div>
            <p className="tiny">{tr('autosaveNote')}</p>
            <p className="tiny">{tr('keyboard')}</p>
          </div>

          <div className="side-card log-card">
            <h3>{tr('moveLog')}</h3>
            {activeState.log.length === 0 ? (
              <p>{tr('logEmpty')}</p>
            ) : (
              <ol className="move-log">
                {activeState.log
                  .slice(-7)
                  .reverse()
                  .map((entry, index) => (
                    <li key={activeState.log.length - index} className={`log-${entry.side.toLowerCase()}`}>
                      <span className={`log-disc disc-${entry.side.toLowerCase()}`} aria-hidden="true" />
                      <span>
                        {tr('logLine', {
                          from: logPoint(lang, entry.move.from),
                          to: logPoint(lang, entry.move.to),
                          die: entry.move.die,
                        })}
                      </span>
                      {entry.move.hit && <em>· {tr('hitTag')}</em>}
                    </li>
                  ))}
              </ol>
            )}
          </div>

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <h3>{tr('lanHostCard')}</h3>
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
            <p>{tr('recordLine', { games: recordCount, white: record.winsW, black: record.winsB })}</p>
            <button className="text-button" onClick={() => setScreen('stats')}>
              {tr('statsLink')} →
            </button>
          </div>
        </aside>
      </div>
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <p className="eyebrow setup-eyebrow">{tr('tableNo')}</p>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <p className="lede">{tr('rulesLede')}</p>
      <div className="rules-grid">
        {[1, 2, 3, 4, 5, 6].map((number) => (
          <article className="rule-card" key={number}>
            <span className="rule-number">{String(number).padStart(2, '0')}</span>
            <h3>{tr(`rule${number}Title` as MessageKey)}</h3>
            <p>{tr(`rule${number}` as MessageKey)}</p>
          </article>
        ))}
      </div>
      <div className="row-actions">
        <button className="primary" onClick={() => setScreen('home')}>
          {tr('close')}
        </button>
      </div>
    </main>
  );

  const winRate = record.games > 0 ? Math.round((record.winsW / record.games) * 100) : 0;
  const statsScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <p className="eyebrow setup-eyebrow">{tr('tableNo')}</p>
      <h2 className="screen-title">{tr('statsTitle')}</h2>
      <p className="lede">{tr('statsLede')}</p>
      <div className="stat-grid">
        <div className="stat-card">
          <span>{tr('gamesPlayed')}</span>
          <strong>{record.games}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('whiteWinsLabel')}</span>
          <strong>{record.winsW}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('blackWinsLabel')}</span>
          <strong>{record.winsB}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('streak')}</span>
          <strong>{record.streak}</strong>
          <small>{tr('streakValue', { n: record.streak })}</small>
        </div>
      </div>
      <div className="rate-card">
        <div className="rate-head">
          <span>{tr('winRate')}</span>
          <strong>{winRate}%</strong>
        </div>
        <div className="rate-track">
          <span style={{ width: `${winRate}%` }} />
        </div>
      </div>
      <section className="recent-card">
        <h3>{tr('recentResults')}</h3>
        {record.recent.length === 0 ? (
          <p>{tr('noResults')}</p>
        ) : (
          <ol className="recent-list">
            {record.recent.map((item, index) => (
              <li key={item.at + index}>
                <span className={`log-disc disc-${item.winner.toLowerCase()}`} aria-hidden="true" />
                <span>
                  {tr('recentLine', {
                    winner: tr(item.winner === 'W' ? 'whiteWinShort' : 'blackWinShort'),
                    mode: tr(item.mode === 'ai' ? 'modeAi' : item.mode === 'local' ? 'modeLocal' : 'modeLan'),
                  })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <div className="row-actions">
        <button
          className="secondary"
          onClick={() => {
            setRecord(clearRecord());
          }}
        >
          {tr('resetStats')}
        </button>
        <button className="primary" onClick={() => setScreen('home')}>
          {tr('close')}
        </button>
      </div>
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
      <p className="eyebrow setup-eyebrow">{tr('tableNo')}</p>
      {mode === 'lan-guest' || guestRoom ? (
        <>
          <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
          <p className="lede">{tr('roomLabel', { room: guestRoom })}</p>
          {!guestStarted && (
            <div className="lan-form">
              <label>
                <span>{tr('lanName')}</span>
                <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={18} />
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
                      setToast(tr('copyFailed'));
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

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'lan') return lanScreen;
  return homeScreen;
}

