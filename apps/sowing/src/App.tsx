import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseMove, moveReason, type AiLevel } from './ai/ai';
import { Board } from './components/Board';
import {
  apply,
  applySeat,
  legalMoves,
  ownPits,
  pitNumber,
  setup,
  view,
  type GameState,
  type Player,
} from './game/sowing';
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
  type Record,
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'record' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';

const AI_LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const HOME_PITS = [0, 3, 5, 2, 4, 1, 0, 3, 1, 4, 0, 2, 5, 0];
const HOME_STORES: [number, number] = [9, 9];

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup(0));
  const [history, setHistory] = useState<GameState[]>([]);
  const [hint, setHint] = useState<number | null>(null);
  const [record, setRecord] = useState<Record>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.sowing.sound') !== 'off';
    } catch {
      return true;
    }
  });
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
  const [guestView, setGuestView] = useState<ReturnType<typeof view> | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => guestParams()?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => guestParams()?.code ?? '');
  const [guestRoom] = useState(() => guestParams()?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const recordedRef = useRef(false);
  const langRef = useRef(lang);
  const soundRef = useRef(soundOn);
  const levelRef = useRef(level);
  const guestCountRef = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);
  useEffect(() => {
    levelRef.current = level;
  }, [level]);

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
      localStorage.setItem('familyarcade.sowing.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const seatNames = useMemo<[string, string]>(() => {
    if (mode === 'ai') return [t(lang, 'you'), `${t(lang, level)} ${t(lang, 'aiPlayer')}`];
    if (mode === 'local') return [t(lang, 'player1'), t(lang, 'player2')];
    if (mode === 'lan-host') return [t(lang, 'you'), lanPlayers[1]?.name || t(lang, 'guest')];
    if (mode === 'lan-guest') return [t(lang, 'opponent'), t(lang, 'you')];
    return [t(lang, 'player1'), t(lang, 'player2')];
  }, [lang, lanPlayers, level, mode]);

  const shortSeatNames = useMemo<[string, string]>(() => {
    if (mode === 'ai') return [t(lang, 'p1Short'), t(lang, 'aiPlayer')];
    return [t(lang, 'p1Short'), t(lang, 'p2Short')];
  }, [lang, mode]);

  const modeLabel = useMemo(() => {
    if (mode === 'ai') return t(lang, 'modeAi', { level: t(lang, level) });
    if (mode === 'local') return t(lang, 'modeLocal');
    if (mode === 'lan-host') return t(lang, 'modeHost');
    return t(lang, 'modeGuest');
  }, [lang, level, mode]);

  const gameWord = lang === 'zh' ? t(lang, 'games') : record.games === 1 ? 'game' : 'games';
  const drawWord = lang === 'zh' ? t(lang, 'draws') : record.draws === 1 ? 'draw' : 'draws';

  const commit = useCallback((next: GameState, previous: GameState, currentMode: Mode) => {
    stateRef.current = next;
    setHistory((items) => [...items, previous]);
    setState(next);
    setHint(null);

    const currentSound = soundRef.current;
    if (currentSound) {
      if (next.status === 'ended') chime(next.winner === null ? 'draw' : 'win');
      else if ((next.last?.capture ?? 0) > 0) chime('capture');
      else if (next.last?.extra) chime('extra');
      else chime('sow');
    }

    if (next.status === 'ended') {
      setToast('');
    } else if ((next.last?.capture ?? 0) > 0) {
      setToast(t(langRef.current, 'toastCapture', { count: next.last?.capture ?? 0 }));
    } else if (next.last?.extra) {
      setToast(t(langRef.current, 'toastExtra'));
    }

    if (currentMode === 'ai' || currentMode === 'local') {
      if (next.status === 'playing') {
        saveGame({ state: next, mode: currentMode, level: levelRef.current });
      } else {
        clearSave();
      }
      setSaved(null);
    }

    if (next.status === 'ended' && (currentMode === 'ai' || currentMode === 'local') && !recordedRef.current) {
      recordedRef.current = true;
      setRecord(recordResult(next));
    }

    if (currentMode === 'lan-host' && hostRef.current) {
      hostRef.current.sendView(1, view(next, 1));
      if (next.status !== 'playing') hostRef.current.sendResult(view(next, 1));
    }
  }, []);

  const playAt = useCallback(
    (pit: number) => {
      if (screen !== 'game') return;
      if (mode === 'lan-guest') {
        if (!guestStarted || !guestView?.canMove) return;
        if (!ownPits(guestView.seat).includes(pit) || (guestView.pits[pit] ?? 0) === 0) return;
        guest?.sendIntent({ type: 'sow', pit });
        return;
      }
      const current = stateRef.current;
      if (current.status !== 'playing') return;
      if (mode === 'ai' && current.turn !== 0) return;
      if (mode === 'lan-host' && current.turn !== 0) return;
      const result = applySeat(current, current.turn, pit);
      if (!result.ok) return;
      commit(result.state, current, mode);
    },
    [commit, guest, guestStarted, guestView, mode, screen],
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
    guest?.close();
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    guestCountRef.current = null;
  }, [guest]);

  const goHome = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') closeLan();
    setHint(null);
    setAiThinking(false);
    setSaved(loadSave());
    setScreen('home');
  }, [closeLan, mode]);

  // AI reply in solo mode.
  useEffect(() => {
    if (screen !== 'game' || mode !== 'ai' || state.status !== 'playing' || state.turn !== 1) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.status !== 'playing' || current.turn !== 1) return;
      const move = chooseMove(current, levelRef.current);
      setAiThinking(false);
      if (move < 0) return;
      const result = apply(current, move);
      if (!result.ok) return;
      commit(result.state, current, 'ai');
    }, 420);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, mode, screen, state]);

  // Guest chimes and toasts from the host's views.
  useEffect(() => {
    if (!guestView) {
      guestCountRef.current = null;
      return;
    }
    const count = guestView.moveCount;
    if (guestCountRef.current === null) {
      guestCountRef.current = count;
      return;
    }
    if (count <= guestCountRef.current) {
      guestCountRef.current = count;
      return;
    }
    guestCountRef.current = count;
    if (soundRef.current) {
      if (guestView.status === 'ended') chime(guestView.winner === null ? 'draw' : 'win');
      else if ((guestView.last?.capture ?? 0) > 0) chime('capture');
      else if (guestView.last?.extra) chime('extra');
      else chime('sow');
    }
    if (guestView.status === 'playing') {
      if ((guestView.last?.capture ?? 0) > 0) {
        setToast(t(langRef.current, 'toastCapture', { count: guestView.last?.capture ?? 0 }));
      } else if (guestView.last?.extra) {
        setToast(t(langRef.current, 'toastExtra'));
      }
    }
  }, [guestView]);

  // Notice a dropped guest socket (the shared package exposes status, not a close callback).
  useEffect(() => {
    if (!guest) return;
    const timer = window.setInterval(() => {
      if (guest.status === 'closed') {
        setLanError(t(langRef.current, 'lanDisconnected'));
        window.clearInterval(timer);
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [guest]);

  // Keyboard path: 1–6 sows the current player's pits, Esc goes home.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (screen !== 'home') goHome();
        return;
      }
      if (screen !== 'game') return;
      const number = Number(event.key);
      if (!Number.isInteger(number) || number < 1 || number > 6) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (mode === 'lan-guest') {
        if (!guestView?.canMove || !guestStarted) return;
        const pit = ownPits(guestView.seat)[number - 1];
        if (pit !== undefined && (guestView.pits[pit] ?? 0) > 0) {
          event.preventDefault();
          playAt(pit);
        }
        return;
      }
      const current = stateRef.current;
      if (current.status !== 'playing') return;
      const seat = mode === 'ai' || mode === 'lan-host' ? 0 : current.turn;
      if (current.turn !== seat) return;
      const pit = ownPits(seat)[number - 1];
      if (pit !== undefined && (current.pits[pit] ?? 0) > 0) {
        event.preventDefault();
        playAt(pit);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goHome, guestStarted, guestView, mode, playAt, screen]);

  useEffect(() => {
    if (!guestRoom) return;
    setScreen('lan');
    setMode('lan-guest');
  }, [guestRoom]);

  const startLocal = (nextMode: 'ai' | 'local') => {
    const next = setup(0);
    stateRef.current = next;
    setMode(nextMode);
    setState(next);
    setHistory([]);
    setHint(null);
    setAiThinking(false);
    recordedRef.current = false;
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
    stateRef.current = saved.state;
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    setHistory([]);
    setHint(null);
    setAiThinking(false);
    recordedRef.current = false;
    setScreen('game');
    setSaved(null);
  };

  const undo = () => {
    if (history.length === 0 || mode === 'lan-guest' || mode === 'lan-host' || state.status !== 'playing') return;
    let target: GameState | null = null;
    let keep = 0;
    if (mode === 'ai') {
      for (let index = history.length - 1; index >= 0; index -= 1) {
        if (history[index].status === 'playing' && history[index].turn === 0) {
          target = history[index];
          keep = index;
          break;
        }
      }
    } else {
      target = history[history.length - 1];
      keep = history.length - 1;
    }
    if (!target) return;
    stateRef.current = target;
    setHistory(history.slice(0, keep));
    setState(target);
    setHint(null);
    setAiThinking(false);
    if (mode === 'ai' || mode === 'local') {
      saveGame({ state: target, mode, level: levelRef.current });
      setSaved(null);
    }
  };

  const showHint = () => {
    if (mode === 'lan-guest' || state.status !== 'playing') return;
    if (mode === 'ai' && state.turn !== 0) return;
    if (mode === 'lan-host' && state.turn !== 0) return;
    if (legalMoves(state).length === 0) {
      setToast(t(lang, 'noHint'));
      return;
    }
    const move = chooseMove(state, 'hard');
    if (move < 0) {
      setToast(t(lang, 'noHint'));
      return;
    }
    const result = applySeat(state, state.turn, move);
    if (!result.ok) return;
    setHint(move);
    const reason = moveReason(state, result.state);
    const local = pitNumber(state.turn, move);
    const text =
      reason === 'capture'
        ? t(lang, 'hintCapture', { pit: local, count: result.state.last?.capture ?? 0 })
        : reason === 'extra'
          ? t(lang, 'hintExtra', { pit: local })
          : reason === 'finish'
            ? t(lang, 'hintFinish', { pit: local })
            : t(lang, 'hintQuiet', { pit: local });
    setToast(t(lang, 'hintToast', { reason: text }));
  };

  const openLanHost = async () => {
    setScreen('lan');
    setMode('lan-host');
    setLanBusy(true);
    setLanError('');
    hostRef.current?.close();
    hostRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
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
        if (players[1]?.connected && host.started) host.sendView(1, view(stateRef.current, 1));
      });
      host.onIntent((seat, intent) => {
        const pit = Number((intent as { pit?: number } | null)?.pit);
        if (!Number.isInteger(pit)) return;
        const current = stateRef.current;
        if (current.status !== 'playing' || seat !== current.turn) return;
        const result = applySeat(current, seat, pit);
        if (!result.ok) return;
        commit(result.state, current, 'lan-host');
      });
      host.onClose(() => setLanError(t(langRef.current, 'lanClosed')));
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 340,
          color: { dark: '#2b2018', light: '#fffaf0' },
        }),
      );
    } catch {
      setLanError(t(langRef.current, 'lanServerError'));
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
      joined.onView((payload) => {
        setGuestView(payload as ReturnType<typeof view>);
        setGuestStarted(true);
      });
      joined.onStart(() => setGuestStarted(true));
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? t(langRef.current, 'lanFull') : t(langRef.current, 'lanWrong'));
      });
      setGuestStarted(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setLanError(
        message.includes('room-full')
          ? t(langRef.current, 'lanFull')
          : message.includes('wrong-code') || message.includes('rejected')
            ? t(langRef.current, 'lanWrong')
            : t(langRef.current, 'lanDisconnected'),
      );
    } finally {
      setGuestConnecting(false);
    }
  };

  const restart = () => {
    if (mode === 'lan-host' && lanHost) {
      const next = setup(0);
      stateRef.current = next;
      setState(next);
      setHistory([]);
      setHint(null);
      recordedRef.current = false;
      lanHost.sendView(1, view(next, 1));
      return;
    }
    startLocal(mode === 'ai' ? 'ai' : 'local');
  };

  const isGuest = mode === 'lan-guest';
  const guestSeat: Player = guestView?.seat ?? 1;
  const shownPits = guestView?.pits ?? state.pits;
  const shownStores = guestView?.stores ?? state.stores;
  const shownTurn = guestView?.turn ?? state.turn;
  const shownStatus = guestView?.status ?? state.status;
  const shownWinner = guestView?.winner ?? state.winner;
  const shownLast = guestView?.last ?? state.last;
  const shownMoveCount = guestView?.moveCount ?? state.moves.length;
  const perspective: Player = isGuest ? guestSeat : 0;
  const guestReady = guestStarted && Boolean(guestView);

  let playablePits: number[] = [];
  if (shownStatus === 'playing') {
    if (isGuest) {
      if (guestReady && guestView?.canMove) {
        playablePits = ownPits(guestSeat).filter((pit) => (shownPits[pit] ?? 0) > 0);
      }
    } else if (mode === 'ai') {
      if (state.turn === 0 && !aiThinking) {
        playablePits = ownPits(0).filter((pit) => (state.pits[pit] ?? 0) > 0);
      }
    } else if (mode === 'lan-host') {
      if (state.turn === 0) {
        playablePits = ownPits(0).filter((pit) => (state.pits[pit] ?? 0) > 0);
      }
    } else {
      playablePits = ownPits(state.turn).filter((pit) => (state.pits[pit] ?? 0) > 0);
    }
  }

  const turnHeadline =
    shownStatus === 'ended'
      ? t(lang, 'gameOver')
      : isGuest && !guestReady
        ? t(lang, 'lanWaitingHost')
        : mode === 'local'
          ? t(lang, 'turnOf', { name: seatNames[shownTurn] })
          : mode === 'lan-guest'
            ? shownTurn === guestSeat
              ? t(lang, 'yourTurn')
              : t(lang, 'turnOf', { name: seatNames[shownTurn] })
            : shownTurn === 0
              ? t(lang, 'yourTurn')
              : t(lang, 'turnOf', { name: seatNames[shownTurn] });

  const turnSub =
    isGuest && !guestReady
      ? t(lang, 'lanWaitingStart')
      : `${modeLabel} · ${t(lang, 'moveCount', { n: shownMoveCount })}`;

  const winnerText =
    shownStatus === 'ended'
      ? shownWinner === null
        ? t(lang, 'draw')
        : t(lang, 'winBy', { name: seatNames[shownWinner] })
      : '';

  const canUseLocalTools =
    !isGuest && shownStatus === 'playing' && (mode === 'local' || state.turn === 0);
  const canUndo =
    history.length > 0 &&
    !isGuest &&
    mode !== 'lan-host' &&
    shownStatus === 'playing';

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
          <button className="ghost" aria-pressed={soundOn} onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-board" aria-hidden="true">
          <Board
            pits={HOME_PITS}
            stores={HOME_STORES}
            perspective={0}
            turn={0}
            status="playing"
            playablePits={[]}
            last={null}
            hint={null}
            labels={[tr('p1Short'), tr('p2Short')]}
            lang={lang}
            onPit={() => undefined}
          />
        </div>
        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <p className="hero-caption">{tr('heroCaption')}</p>
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
            <span>{gameWord}</span>
            <span className="dot">·</span>
            <span>{record.wins0} {tr('p1Short')} {tr('wins')}</span>
            <span className="dot">·</span>
            <span>{record.wins1} {tr('p2Short')} {tr('wins')}</span>
            <span className="dot">·</span>
            <span>{record.draws} {drawWord}</span>
          </div>
        </div>
      </section>
      <section className="home-notes" aria-label={tr('howTitle')}>
        <div><span>01</span><p>{tr('how1')}</p></div>
        <div><span>02</span><p>{tr('how2')}</p></div>
        <div><span>03</span><p>{tr('how3')}</p></div>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <div className="setup-layout">
        <section>
          <h2 className="screen-title">{tr('difficulty')}</h2>
          <p className="lede">{tr('difficultyLede')}</p>
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
          <p className="first-note">{tr('firstPlayerNote')}</p>
          <div className="row-actions">
            <button className="primary" onClick={() => startLocal('ai')}>{tr('begin')}</button>
            <button className="ghost" onClick={() => setScreen('home')}>{tr('back')}</button>
          </div>
        </section>
        <aside className="setup-board-card">
          <Board
            pits={HOME_PITS}
            stores={HOME_STORES}
            perspective={0}
            turn={0}
            status="playing"
            playablePits={[]}
            last={null}
            hint={4}
            labels={[tr('you'), t(lang, level)]}
            shortLabels={[tr('p1Short'), tr('aiPlayer')]}
            compact
            lang={lang}
            onPit={() => undefined}
          />
          <p className="setup-caption">{tr('youSow')}</p>
        </aside>
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
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{tr('language')}</button>
          <button className="ghost" aria-pressed={soundOn} onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
        </div>
      </header>

      <div className="game-layout">
        <section className="board-wrap">
          <div className="turn-bar">
            <span className={`turn-chip seat-${shownTurn}`} aria-hidden="true">
              <span className="turn-stone" />
            </span>
            <div>
              <strong>{turnHeadline}</strong>
              <p>{turnSub}</p>
            </div>
            {aiThinking && <span className="thinking" aria-label={tr('thinking')}>…</span>}
            {shownLast?.extra && shownStatus === 'playing' && (
              <span className="turn-badge">{tr('extraTurn')}</span>
            )}
          </div>

          <Board
            pits={shownPits}
            stores={shownStores}
            perspective={perspective}
            turn={shownTurn}
            status={shownStatus}
            playablePits={playablePits}
            last={shownLast}
            hint={hint}
            labels={seatNames}
            shortLabels={shortSeatNames}
            lang={lang}
            onPit={playAt}
          />

          {isGuest && lanError && <p className="error game-error">{lanError}</p>}

          {shownLast && (
            <div className="last-sowing">
              <span className="label">{tr('lastSowing')}</span>
              <p>
                {t(lang, 'lastMoveLine', {
                  pit: pitNumber(shownLast.pit <= 5 ? 0 : 1, shownLast.pit),
                  count: shownLast.path.length,
                })}
                {(shownLast.capture ?? 0) > 0
                  ? ` · ${t(lang, 'lastCaptureTag', { count: shownLast.capture })}`
                  : ''}
                {shownLast.extra ? ` · ${tr('lastExtraTag')}` : ''}
              </p>
            </div>
          )}

          <div className="board-legend">
            <span><b className="legend-icon">↺</b>{tr('legendSow')}</span>
            <span><b className="legend-icon">⌂</b>{tr('legendStore')}</span>
            <span><b className="legend-icon">◎</b>{tr('legendCapture')}</span>
          </div>

          {shownStatus === 'ended' && (
            <div className="result-banner">
              <div className="result-copy">
                <strong>{winnerText}</strong>
                <span>{t(lang, 'finalScore', { a: shownStores[0], b: shownStores[1] })}</span>
              </div>
              {!isGuest ? (
                <button className="primary" onClick={restart}>{tr('restart')}</button>
              ) : (
                <span className="muted">{tr('lanHost')}</span>
              )}
            </div>
          )}
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{tr('howTitle')}</h3>
            <ol className="beat-list">
              <li>{tr('how1')}</li>
              <li>{tr('how2')}</li>
              <li>{tr('how3')}</li>
            </ol>
            <div className="side-actions">
              <button className="secondary" onClick={undo} disabled={!canUndo}>{tr('undo')}</button>
              <button className="secondary" onClick={showHint} disabled={!canUseLocalTools}>{tr('hint')}</button>
            </div>
            <p className="keyboard-note">{tr('keyboardHint')}</p>
          </div>

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <h3>{tr('lanCode')}</h3>
              <div className="room-code">{lanCode || '…'}</div>
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
              {record.games} {gameWord} · {record.wins0}–{record.wins1} · {record.draws} {drawWord}
            </p>
            <button className="text-button" onClick={() => setScreen('record')}>{tr('record')} →</button>
          </div>

          <div className="side-card tip-mini">
            <h3>{tr('tipTitle')}</h3>
            <p>{tr('tip1')}</p>
            <p>{tr('tip2')}</p>
          </div>
        </aside>
      </div>
      <footer className="game-foot">{tr('autosaveNote')}</footer>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <p className="lede">{tr('rulesLede')}</p>
      <ol className="rules-list">
        <li>{tr('rule1')}</li>
        <li>{tr('rule2')}</li>
        <li>{tr('rule3')}</li>
        <li>{tr('rule4')}</li>
        <li>{tr('rule5')}</li>
        <li>{tr('rule6')}</li>
      </ol>
      <div className="rules-tip">
        <h3>{tr('tipTitle')}</h3>
        <p>{tr('tip1')}</p>
        <p>{tr('tip2')}</p>
        <p>{tr('tip3')}</p>
      </div>
      <button className="primary" onClick={() => setScreen('home')}>{tr('close')}</button>
    </main>
  );

  const recordScreen = (
    <main className="shell narrow-shell record-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <h2 className="screen-title">{tr('recordTitle')}</h2>
      <p className="lede">{tr('recordLede')}</p>
      {record.games === 0 ? (
        <div className="record-empty">{tr('recordEmpty')}</div>
      ) : (
        <>
          <div className="record-grid">
            <div className="record-card p1">
              <span>{tr('winsP1')}</span>
              <strong>{record.wins0}</strong>
              <div className="record-bar"><span style={{ width: `${Math.round((record.wins0 / record.games) * 100)}%` }} /></div>
            </div>
            <div className="record-card p2">
              <span>{tr('winsP2')}</span>
              <strong>{record.wins1}</strong>
              <div className="record-bar"><span style={{ width: `${Math.round((record.wins1 / record.games) * 100)}%` }} /></div>
            </div>
            <div className="record-card draws">
              <span>{tr('draws')}</span>
              <strong>{record.draws}</strong>
              <div className="record-bar"><span style={{ width: `${Math.round((record.draws / record.games) * 100)}%` }} /></div>
            </div>
          </div>
          <div className="record-meta">
            <div><span>{tr('games')}</span><strong>{record.games}</strong></div>
            <div><span>{tr('streak')}</span><strong>{record.streak}</strong></div>
            <div>
              <span>{tr('lastWinner')}</span>
              <strong>
                {record.lastWinner === null
                  ? tr('noRecord')
                  : record.lastWinner === 'draw'
                    ? tr('draw')
                    : tr(record.lastWinner === 0 ? 'winsP1' : 'winsP2')}
              </strong>
            </div>
          </div>
        </>
      )}
      <p className="device-note">{tr('deviceOnly')}</p>
      <div className="row-actions">
        <button className="secondary" onClick={() => { setRecord(clearRecord()); setToast(t(lang, 'resetDone')); }}>
          {tr('resetStats')}
        </button>
        <button className="primary" onClick={() => setScreen('home')}>{tr('home')}</button>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>← {tr('back')}</button>
      {mode === 'lan-guest' || guestRoom ? (
        <>
          <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
          <p className="lede">{t(lang, 'lanRoom', { room: guestRoom || '—' })}</p>
          {!guest && (
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
              <button className="primary wide" onClick={joinGuest} disabled={guestConnecting || !guestName.trim()}>
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
            </div>
          )}
          {guest && !guestReady && <p className="lede">{tr('lanWaitingStart')}</p>}
          {guest && guestReady && (
            <>
              <p className="lede">{tr('lanGuestSeat')}</p>
              <button className="primary" onClick={() => setScreen('game')}>{tr('lanEnter')}</button>
            </>
          )}
          {lanError && <p className="error">{lanError}</p>}
        </>
      ) : (
        <>
          <h2 className="screen-title">{tr('lanTitle')}</h2>
          <p className="lede">{tr('lanHostDesc')}</p>
          {lanBusy && <p className="lede">{tr('lanStarting')}</p>}
          {lanError && <p className="error">{lanError}</p>}
          {lanError && !lanBusy && (
            <button className="secondary" onClick={openLanHost}>{tr('lanHost')}</button>
          )}
          {lanInfo && lanInvite && (
            <div className="lan-layout">
              <div className="lan-card">
                <span className="label">{tr('lanCode')}</span>
                <div className="room-code big">{lanCode}</div>
                <p>{lanPlayers[1]?.connected ? tr('lanReady') : tr('lanWaiting')}</p>
                <p className="seat-note">{tr('lanHostSeat')}</p>
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
                {!lanPlayers[1]?.connected && <p className="muted">{tr('lanNeedGuest')}</p>}
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
  if (screen === 'record') return recordScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
