import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseAction, hintFor, type AiLevel, type HintReason } from './ai/ai';
import { Board, DominoFace, HandTile } from './components/Board';
import {
  applyAction,
  makeRng,
  nextRound as dealNextRound,
  pipTotal,
  setup,
  tileKey,
  view,
  type Action,
  type End,
  type GameState,
  type PlayerCount,
  type Rng,
  type SeatView,
  type Tile,
} from './game/domino';
import { detectLang, t, type Lang, type MessageKey } from './i18n';
import {
  guestWsUrl,
  hostWsUrl,
  inviteUrl,
  startLanServer,
} from './net';
import {
  clearRecord,
  clearSave,
  loadRecord,
  loadSave,
  recordMatch,
  saveGame,
  type FamilyRecord,
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'stats' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type SetupMode = 'ai' | 'local';

const AI_LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const HINT_KEY: Record<HintReason, MessageKey> = {
  only: 'hintOnly',
  draw: 'hintDraw',
  pass: 'hintPass',
  shed: 'hintShed',
  keep: 'hintKeep',
  block: 'hintBlock',
  gentle: 'hintGentle',
  finish: 'hintFinish',
  control: 'hintControl',
};

const SEAT_COLORS = ['#0f6b5c', '#b05c43', '#b8863b', '#6b5b95'];
const HERO_TILES: Tile[] = [
  { a: 6, b: 6 },
  { a: 6, b: 2 },
  { a: 2, b: 5 },
  { a: 5, b: 3 },
  { a: 3, b: 3 },
];

function readSeed(): number | null {
  if (typeof location === 'undefined') return null;
  const raw = new URLSearchParams(location.search).get('seed');
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function seedDealRng(seed: number | null): Rng {
  return seed === null ? Math.random : makeRng(seed);
}

function parseIntent(intent: unknown, seat: number): Action | null {
  if (!intent || typeof intent !== 'object') return null;
  const value = intent as Record<string, unknown>;
  if (value.type === 'draw') return { type: 'draw', seat };
  if (value.type === 'pass') return { type: 'pass', seat };
  if (value.type !== 'play') return null;
  const rawTile = value.tile;
  if (!rawTile || typeof rawTile !== 'object') return null;
  const tile = rawTile as Record<string, unknown>;
  const a = Number(tile.a);
  const b = Number(tile.b);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a > 6 || b < 0 || b > 6) return null;
  if (value.end !== 'left' && value.end !== 'right') return null;
  return {
    type: 'play',
    seat,
    tile: a <= b ? { a, b } : { a: b, b: a },
    end: value.end,
  };
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('ai');
  const [setupMode, setSetupMode] = useState<SetupMode>('ai');
  const [setupPlayers, setSetupPlayers] = useState<PlayerCount>(2);
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup(2, makeRng(2718)));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hintEnd, setHintEnd] = useState<End | null>(null);
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.domino-line.sound') !== 'off';
    } catch {
      return true;
    }
  });

  const [lanCount, setLanCount] = useState<PlayerCount>(2);
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
  const [guestRoom, setGuestRoom] = useState(() => guestParams()?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const recordedRef = useRef(false);
  const seedRef = useRef<number | null>(readSeed());
  const dealRngRef = useRef<Rng>(seedDealRng(seedRef.current));
  const aiRngRef = useRef<Rng>(seedDealRng(seedRef.current === null ? null : seedRef.current ^ 0x9e3779b9));

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
      localStorage.setItem('familyarcade.domino-line.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!guestRoom) return;
    setMode('lan-guest');
    setScreen('lan');
  }, [guestRoom]);

  const isGuest = mode === 'lan-guest';
  const viewerSeat = isGuest
    ? (guestView?.seat ?? 1)
    : mode === 'local' && state.phase === 'playing'
      ? state.turn
      : 0;
  const shown: SeatView = guestView ?? view(state, viewerSeat);
  const selectedTile = selected ? (shown.hand.find((tile) => tileKey(tile) === selected) ?? null) : null;
  const selectedPlays = selected
    ? shown.legal.filter((play) => tileKey(play.tile) === selected)
    : [];
  const canLeft = selectedPlays.some((play) => play.end === 'left');
  const canRight = selectedPlays.some((play) => play.end === 'right');

  const canAct =
    shown.phase === 'playing' &&
    shown.turn === shown.seat &&
    (mode === 'local' ||
      (mode === 'ai' && shown.seat === 0 && !aiThinking) ||
      (mode === 'lan-host' && shown.seat === 0) ||
      (mode === 'lan-guest' && guestStarted));

  const nameFor = useCallback(
    (seat: number) => {
      if (mode === 'ai') return seat === 0 ? tr('you') : `${tr('ai')} ${seat}`;
      if (mode === 'lan-host' || mode === 'lan-guest') {
        const player = lanPlayers.find((item) => item.seat === seat);
        return player?.name || tr('seatN', { n: seat + 1 });
      }
      return tr('playerN', { n: seat + 1 });
    },
    [mode, tr, lanPlayers],
  );

  const saveForMode = useCallback(
    (next: GameState, currentMode: Mode) => {
      if (currentMode !== 'ai' && currentMode !== 'local') return;
      if (next.phase === 'match-over') {
        clearSave();
        setSaved(null);
        return;
      }
      saveGame({ state: next, mode: currentMode, level, players: next.players });
      setSaved(loadSave());
    },
    [level],
  );

  const finish = useCallback(
    (next: GameState, currentMode: Mode) => {
      if (next.phase !== 'match-over' || recordedRef.current) return;
      recordedRef.current = true;
      if (currentMode !== 'lan-guest') setRecord(recordMatch(next));
      clearSave();
      setSaved(null);
      if (soundOn) chime('win');
    },
    [soundOn],
  );

  const syncHost = useCallback((next: GameState) => {
    const host = hostRef.current;
    if (!host) return;
    for (let seat = 1; seat < next.players; seat += 1) {
      host.sendView(seat, view(next, seat));
    }
    if (next.phase === 'match-over') {
      host.sendResult({ winner: next.matchWinner, scores: next.scores });
    }
  }, []);

  const commit = useCallback(
    (next: GameState, previous: GameState, bySeat: number) => {
      stateRef.current = next;
      setState(next);
      setSelected(null);
      setHintEnd(null);
      if (mode === 'local' || (mode === 'ai' && bySeat === 0)) {
        setHistory((items) => [...items, previous]);
      }
      if (soundOn) {
        if (next.phase === 'round-over') chime('round');
        else if (next.phase === 'playing') {
          chime(next.board.length > previous.board.length ? 'place' : 'draw');
        }
      }
      saveForMode(next, mode);
      finish(next, mode);
      if (mode === 'lan-host') syncHost(next);
    },
    [mode, soundOn, saveForMode, finish, syncHost],
  );

  const doAction = useCallback(
    (action: Action) => {
      if (mode === 'lan-guest') {
        guest?.sendIntent(action);
        return;
      }
      if (mode === 'lan-host' && action.seat !== 0) return;
      if (mode === 'ai' && action.seat !== 0) return;
      const current = stateRef.current;
      const result = applyAction(current, action);
      if (!result.ok) {
        setToast(tr(result.error === 'wrong-turn' ? 'toastWrongTurn' : 'toastInvalid'));
        return;
      }
      commit(result.state, current, action.seat);
    },
    [mode, guest, tr, commit],
  );

  const playSelected = useCallback(
    (end: End) => {
      if (!selected) return;
      const tile = shown.hand.find((item) => tileKey(item) === selected);
      if (!tile) return;
      doAction({ type: 'play', seat: shown.seat, tile, end });
    },
    [selected, shown, doAction],
  );

  const drawOne = useCallback(() => {
    doAction({ type: 'draw', seat: shown.seat });
  }, [doAction, shown.seat]);

  const passOne = useCallback(() => {
    doAction({ type: 'pass', seat: shown.seat });
  }, [doAction, shown.seat]);

  const showHint = useCallback(() => {
    if (shown.phase !== 'playing' || mode === 'lan-guest' || !canAct) return;
    const choice = hintFor(stateRef.current, shown.seat);
    if (!choice) return;
    setToast(tr(HINT_KEY[choice.reason]));
    if (choice.action.type === 'play') {
      setSelected(tileKey(choice.action.tile));
      setHintEnd(choice.action.end);
    }
  }, [shown, mode, canAct, tr]);

  const undo = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') return;
    if (history.length === 0) {
      setToast(tr('cannotUndo'));
      return;
    }
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));
    stateRef.current = previous;
    setState(previous);
    setSelected(null);
    setHintEnd(null);
    if (soundOn) chime('draw');
    saveForMode(previous, mode);
    setToast(tr('toastUndone'));
  }, [mode, history, soundOn, saveForMode, tr]);

  const closeLan = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanError('');
    setLanBusy(false);
    guest?.close();
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    setGuestRoom('');
    setGuestConnecting(false);
  }, [guest]);

  const goHome = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') closeLan();
    setScreen('home');
    setSaved(loadSave());
    setToast('');
    setSelected(null);
    setHintEnd(null);
    setAiThinking(false);
  }, [mode, closeLan]);

  const startDeal = useCallback(
    (count: PlayerCount, nextMode: SetupMode) => {
      dealRngRef.current = seedDealRng(seedRef.current);
      aiRngRef.current = seedDealRng(seedRef.current === null ? null : seedRef.current ^ 0x9e3779b9);
      const next = setup(count, dealRngRef.current);
      setMode(nextMode);
      setSetupMode(nextMode);
      stateRef.current = next;
      setState(next);
      setHistory([]);
      recordedRef.current = false;
      setSelected(null);
      setHintEnd(null);
      setAiThinking(false);
      setToast('');
      setScreen('game');
      saveForMode(next, nextMode);
    },
    [saveForMode],
  );

  const resume = () => {
    if (!saved) return;
    setMode(saved.mode);
    setSetupMode(saved.mode);
    setLevel(saved.level);
    setSetupPlayers(saved.players);
    stateRef.current = saved.state;
    setState(saved.state);
    setHistory([]);
    recordedRef.current = false;
    setSelected(null);
    setHintEnd(null);
    setScreen('game');
  };

  const advanceRound = useCallback(() => {
    if (mode === 'lan-guest') return;
    const current = stateRef.current;
    if (current.phase === 'round-over') {
      const next = dealNextRound(current, dealRngRef.current);
      stateRef.current = next;
      setState(next);
      setHistory([]);
      setSelected(null);
      setHintEnd(null);
      setAiThinking(false);
      saveForMode(next, mode);
      if (mode === 'lan-host') syncHost(next);
      return;
    }
    if (current.phase === 'match-over') {
      if (seedRef.current !== null) {
        dealRngRef.current = makeRng(seedRef.current);
        aiRngRef.current = makeRng(seedRef.current ^ 0x9e3779b9);
      }
      const next = setup(current.players, dealRngRef.current);
      recordedRef.current = false;
      stateRef.current = next;
      setState(next);
      setHistory([]);
      setSelected(null);
      setHintEnd(null);
      setAiThinking(false);
      if (mode === 'lan-host') {
        hostRef.current?.start();
        syncHost(next);
      } else {
        saveForMode(next, mode);
      }
    }
  }, [mode, saveForMode, syncHost]);

  // AI replies, one action at a time (a draw keeps the same turn and replays).
  useEffect(() => {
    if (screen !== 'game' || mode !== 'ai' || state.phase !== 'playing' || state.turn === 0) {
      setAiThinking(false);
      return;
    }
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const choice = chooseAction(state, state.turn, level, aiRngRef.current);
      setAiThinking(false);
      if (!choice) return;
      const result = applyAction(state, choice.action);
      if (!result.ok) return;
      commit(result.state, state, state.turn);
    }, 460);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [screen, mode, state, level, commit]);

  const createRoom = async () => {
    setLanBusy(true);
    setLanError('');
    try {
      const info = await startLanServer();
      const room = newRoomCode();
      const code = newRoomCode();
      const host = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room,
        code,
        name: tr('host'),
        maxPlayers: lanCount,
      });
      hostRef.current = host;
      setLanHost(host);
      setLanCode(code);
      host.onChange((players) => {
        setLanPlayers(players);
        if (!host.started) return;
        const current = stateRef.current;
        for (const player of players) {
          if (player.seat > 0 && player.connected && player.seat < current.players) {
            host.sendView(player.seat, view(current, player.seat));
          }
        }
      });
      host.onIntent((seat, intent) => {
        const parsed = parseIntent(intent, seat);
        if (!parsed) return;
        const current = stateRef.current;
        const result = applyAction(current, parsed);
        if (!result.ok) return;
        commit(result.state, current, seat);
      });
      host.onClose(() => setLanError(tr('lanClosed')));
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 340,
          color: { dark: '#241f1a', light: '#fffaf0' },
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

  const startLanMatch = () => {
    const host = hostRef.current;
    if (!host) return;
    if (lanPlayers.filter((player) => player.seat > 0 && player.connected).length < lanCount - 1) {
      return;
    }
    dealRngRef.current = seedDealRng(seedRef.current);
    aiRngRef.current = seedDealRng(seedRef.current === null ? null : seedRef.current ^ 0x9e3779b9);
    const next = setup(lanCount, dealRngRef.current);
    stateRef.current = next;
    setState(next);
    setHistory([]);
    recordedRef.current = false;
    setSelected(null);
    setHintEnd(null);
    setMode('lan-host');
    setScreen('game');
    host.start();
    syncHost(next);
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
        setGuestView(payload as SeatView);
        setScreen('game');
      });
      joined.onStart((players) => {
        setLanPlayers(players);
        setGuestStarted(true);
        setScreen('game');
      });
      joined.onPlayers((players) => setLanPlayers(players));
      joined.onResult(() => setToast(''));
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

  const openLan = () => {
    setMode('lan-host');
    setLanError('');
    setScreen('lan');
  };

  const openSetup = (nextMode: SetupMode) => {
    setSetupMode(nextMode);
    setScreen('setup');
  };

  const resetRecord = () => {
    setRecord(clearRecord());
  };

  const onKey = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key === 'Escape') {
        goHome();
        return;
      }
      if (screen !== 'game' || !canAct) return;
      const number = Number(event.key);
      if (Number.isInteger(number) && number >= 1 && number <= shown.hand.length) {
        event.preventDefault();
        setSelected(tileKey(shown.hand[number - 1]));
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'l' && canLeft) {
        event.preventDefault();
        playSelected('left');
      } else if (key === 'r' && canRight) {
        event.preventDefault();
        playSelected('right');
      } else if (key === 'd' && shown.canDraw) {
        event.preventDefault();
        drawOne();
      } else if (key === 'p' && shown.canPass) {
        event.preventDefault();
        passOne();
      } else if (key === 'h') {
        event.preventDefault();
        showHint();
      } else if (key === 'u') {
        event.preventDefault();
        undo();
      } else if (key === 'enter' && selected) {
        event.preventDefault();
        playSelected(canLeft ? 'left' : 'right');
      }
    },
    [screen, canAct, shown, canLeft, canRight, playSelected, drawOne, passOne, showHint, undo, goHome, selected],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const statusText =
    shown.phase === 'playing'
      ? mode === 'local'
        ? tr('turnOf', { name: nameFor(shown.turn) })
        : shown.turn === shown.seat
          ? tr('yourTurn')
          : tr('turnOf', { name: nameFor(shown.turn) })
      : shown.phase === 'round-over'
        ? tr('roundOver')
        : tr('matchOver');

  const turnNote =
    shown.phase === 'playing'
      ? mode === 'local'
        ? tr('passDevice', { name: nameFor(shown.turn) })
        : aiThinking
          ? tr('aiThinking')
          : shown.turn === shown.seat
            ? tr('rulesShort')
            : tr('turnOf', { name: nameFor(shown.turn) })
      : shown.phase === 'round-over'
        ? shown.roundWinner === -1
          ? tr('blockedTie')
          : tr('roundWinner', { name: nameFor(shown.roundWinner ?? shown.seat) })
        : tr('champion', { name: nameFor(shown.matchWinner ?? shown.seat) });

  const roundIsBlocked = shown.phase !== 'playing' && !shown.counts.some((count) => count === 0);
  const authority = mode !== 'lan-guest';
  const showRoundButton = authority && shown.phase === 'round-over';
  const showMatchButton = authority && shown.phase === 'match-over';

  const scores = shown.scores;
  const otherSeats = Array.from({ length: shown.players }, (_, seat) => seat).filter(
    (seat) => seat !== shown.seat,
  );

  const lanReady =
    lanPlayers.filter((player) => player.seat > 0 && player.connected).length >= lanCount - 1;

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
        <div className="hero-table" aria-hidden="true">
          <div className="hero-felt">
            <div className="hero-boneyard">
              <span className="tile-back" />
              <span className="tile-back" />
              <span className="tile-back" />
            </div>
            <div className="hero-line">
              {HERO_TILES.map((tile, index) => (
                <span
                  key={`${tile.a}-${tile.b}`}
                  className="hero-domino"
                  style={{ '--tilt': `${index % 2 === 0 ? -1.4 : 1.2}deg` } as CSSProperties}
                >
                  <DominoFace tile={tile} />
                </span>
              ))}
            </div>
            <div className="hero-chip">
              <span>{tr('targetLabel')}</span>
              <strong>100</strong>
            </div>
          </div>
          <p className="hero-caption">{tr('rulesShort')}</p>
        </div>

        <div className="hero-copy">
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide continue-card" data-action="continue" onClick={resume}>
                <span>{tr('continueGame')}</span>
                <small>
                  {saved.mode === 'ai' ? tr('modeSolo') : tr('modeLocal')} · {tr('roundN', { n: saved.state.round })} ·{' '}
                  {saved.state.scores.join('–')}
                </small>
              </button>
            )}
            <button
              className={saved ? 'secondary wide' : 'primary wide'}
              data-action="solo"
              onClick={() => openSetup('ai')}
            >
              <span>{tr('playSolo')}</span>
              <small>{tr('playSoloNote')}</small>
            </button>
            <button className="secondary wide" data-action="local" onClick={() => openSetup('local')}>
              <span>{tr('hotSeat')}</span>
              <small>{tr('hotSeatNote')}</small>
            </button>
            <button className="secondary wide" data-action="lan" onClick={openLan}>
              <span>{tr('lanNight')}</span>
              <small>{tr('lanNote')}</small>
            </button>
            <div className="menu-links">
              <button className="text-button" data-action="rules" onClick={() => setScreen('rules')}>
                {tr('rules')} →
              </button>
              <button className="text-button" data-action="stats" onClick={() => setScreen('stats')}>
                {tr('stats')} →
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('stats')}</span>
            <span>{tr('matchesPlayed')}</span>
            <strong>{record.matches}</strong>
            <span className="dot">·</span>
            <span>{tr('roundsPlayed')} {record.rounds}</span>
            <span className="dot">·</span>
            <span>{tr('bestScore')} {record.bestScore}</span>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('footer')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('setupTitle')}</h2>
      <p className="lede">{setupMode === 'ai' ? tr('setupSolo') : tr('setupLocal')}</p>

      <section className="setup-block">
        <h3>{tr('setupPlayers')}</h3>
        <p>{tr('setupPlayersNote')}</p>
        <div className="player-grid">
          {([2, 3, 4] as PlayerCount[]).map((count) => (
            <button
              key={count}
              className={`player-card ${setupPlayers === count ? 'selected' : ''}`}
              onClick={() => setSetupPlayers(count)}
            >
              <span className="player-number">{count}</span>
              <span className="player-label">{tr('playersN', { n: count })}</span>
              <span className="player-dots" aria-hidden="true">
                {Array.from({ length: count }, (_, index) => (
                  <span key={index} style={{ background: SEAT_COLORS[index] }} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </section>

      {setupMode === 'ai' && (
        <section className="setup-block">
          <h3>{tr('difficulty')}</h3>
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
        </section>
      )}

      <div className="row-actions">
        <button className="primary" data-action="begin" onClick={() => startDeal(setupPlayers, setupMode)}>
          {tr('begin')}
        </button>
        <button className="ghost" onClick={() => setScreen('home')}>
          {tr('back')}
        </button>
      </div>
    </main>
  );

  const gameScreen = (
    <main className="shell game-shell" data-phase={shown.phase} data-mode={mode} data-turn={shown.turn}>
      <header className="game-top">
        <button className="back" onClick={goHome}>
          ← {tr('home')}
        </button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>
            {mode === 'ai'
              ? `${tr('modeSolo')} · ${tr(level as MessageKey)}`
              : mode === 'local'
                ? tr('modeLocal')
                : mode === 'lan-host'
                  ? tr('lanHostTitle')
                  : tr('lanGuestTitle')}
          </span>
        </div>
        <div className="game-tools">
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
            <span className="turn-chip" style={{ background: SEAT_COLORS[shown.turn % 4] }}>
              {shown.turn + 1}
            </span>
            <div className="turn-copy">
              <strong>{statusText}</strong>
              <p>
                {tr('roundN', { n: shown.round })} · {tr('matchTo', { n: shown.target })} ·{' '}
                {tr('boneyardN', { n: shown.boneyardCount })}
              </p>
            </div>
            <div className="turn-note">
              <span>{turnNote}</span>
              {aiThinking && <span className="thinking">…</span>}
            </div>
          </div>

          <div className="opponents">
            {otherSeats.map((seat) => (
              <div
                key={seat}
                className={`opponent ${shown.turn === seat && shown.phase === 'playing' ? 'active' : ''}`}
              >
                <span className="seat-dot" style={{ background: SEAT_COLORS[seat % 4] }} />
                <span className="opponent-name">{nameFor(seat)}</span>
                <span className="opponent-count">
                  {shown.pipTotals[seat] !== null
                    ? tr('pipsN', { n: shown.pipTotals[seat] as number })
                    : tr('handCount', { n: shown.counts[seat] })}
                </span>
                <span className="mini-backs" aria-hidden="true">
                  {Array.from({ length: Math.min(3, shown.counts[seat]) }, (_, index) => (
                    <span key={index} className="tile-back mini" />
                  ))}
                </span>
              </div>
            ))}
          </div>

          <div className="table-felt">
            <div className="table-meta">
              <span>{tr('openEnds')}</span>
              <span className="table-ends">
                {shown.left === null ? '—' : shown.left} / {shown.right === null ? '—' : shown.right}
              </span>
              <span>{tr('boneyard')} · {shown.boneyardCount}</span>
            </div>
            <Board
              board={shown.board}
              left={shown.left}
              right={shown.right}
              selected={selectedTile}
              legal={shown.legal}
              hintEnd={hintEnd}
              disabled={!canAct}
              onEnd={playSelected}
              emptyText={tr('tableOpenHint')}
              startText={tr('startLineHint')}
              leftLabel={tr('leftShort')}
              rightLabel={tr('rightShort')}
            />
            <div className="table-foot">
              <span>{tr('lineHelp')}</span>
              <span>{tr('keyboardHint').split(' · ').slice(0, 3).join(' · ')}</span>
            </div>
          </div>

          {shown.phase !== 'playing' && (
            <section className={`result-panel ${shown.phase}`}>
              <p className="result-kicker">
                {shown.phase === 'match-over' ? tr('matchOver') : tr('roundOver')}
              </p>
              <h2>
                {shown.phase === 'match-over'
                  ? tr('champion', { name: nameFor(shown.matchWinner ?? 0) })
                  : shown.roundWinner === -1
                    ? tr('blockedTie')
                    : roundIsBlocked
                      ? tr('blockedWinnerName', { name: nameFor(shown.roundWinner ?? 0) })
                      : tr('roundWinner', { name: nameFor(shown.roundWinner ?? 0) })}
              </h2>
              {shown.phase === 'round-over' && shown.roundWinner !== -1 && (
                <p className="result-points">{tr('pointsEarned', { n: shown.roundPoints })}</p>
              )}
              <div className="result-scoreboard">
                {shown.scores.map((value, seat) => (
                  <div
                    key={seat}
                    className={`result-score ${
                      (shown.phase === 'match-over' ? shown.matchWinner : shown.roundWinner) === seat
                        ? 'winner'
                        : ''
                    }`}
                  >
                    <span className="seat-dot" style={{ background: SEAT_COLORS[seat % 4] }} />
                    <span className="result-name">{nameFor(seat)}</span>
                    <strong>{value}</strong>
                    <small>
                      {shown.pipTotals[seat] !== null
                        ? tr('pipsN', { n: shown.pipTotals[seat] as number })
                        : tr('handCount', { n: shown.counts[seat] })}
                    </small>
                  </div>
                ))}
              </div>
              {showRoundButton && (
                <button className="primary" onClick={advanceRound}>
                  {tr('nextRound')}
                </button>
              )}
              {showMatchButton && (
                <button className="primary" onClick={advanceRound}>
                  {tr('playAgain')}
                </button>
              )}
              {!authority && (
                <p className="muted">
                  {shown.phase === 'round-over' ? tr('guestWaiting') : tr('lanRestart')}
                </p>
              )}
            </section>
          )}

          {shown.phase === 'playing' && (
            <section className="hand-area">
              <div className="hand-head">
                <div>
                  <h3>{tr('yourHand')}</h3>
                  <p>
                    {canAct
                      ? tr('selectTile')
                      : tr('waitingFor', { name: nameFor(shown.turn) })}
                  </p>
                </div>
                <div className="hand-stats">
                  <span>{tr('handCount', { n: shown.hand.length })}</span>
                  <span>{tr('pipsN', { n: pipTotal(shown.hand) })}</span>
                </div>
              </div>

              <div className="hand" role="toolbar" aria-label={tr('yourHand')}>
                {shown.hand.length === 0 && <p className="muted">{tr('handEmpty')}</p>}
                {shown.hand.map((tile, index) => {
                  const key = tileKey(tile);
                  const playable = shown.legal.some((play) => tileKey(play.tile) === key);
                  return (
                    <HandTile
                      key={key}
                      tile={tile}
                      index={index}
                      selected={selected === key}
                      playable={playable}
                      disabled={!canAct}
                      onSelect={() => {
                        setSelected(key);
                        setHintEnd(null);
                      }}
                    />
                  );
                })}
              </div>

              <div className="play-actions">
                <div className="play-buttons">
                  <button
                    className="primary play-left"
                    onClick={() => playSelected('left')}
                    disabled={!canAct || !canLeft}
                  >
                    ← {tr('playLeft')}
                  </button>
                  <button
                    className="primary play-right"
                    onClick={() => playSelected('right')}
                    disabled={!canAct || !canRight}
                  >
                    {shown.board.length === 0 ? tr('startLine') : tr('playRight')} →
                  </button>
                </div>
                <div className="utility-buttons">
                  <button
                    className="secondary draw-btn"
                    onClick={drawOne}
                    disabled={!canAct || !shown.canDraw}
                    title={tr('drawNote')}
                  >
                    {tr('drawOne', { n: shown.boneyardCount })}
                  </button>
                  <button
                    className="secondary pass-btn"
                    onClick={passOne}
                    disabled={!canAct || !shown.canPass}
                    title={tr('passNote')}
                  >
                    {tr('pass')}
                  </button>
                  <button
                    className="secondary hint-btn"
                    onClick={showHint}
                    disabled={!canAct || mode === 'lan-guest'}
                  >
                    {tr('hint')}
                  </button>
                  <button
                    className="secondary undo-btn"
                    onClick={undo}
                    disabled={
                      history.length === 0 || mode === 'lan-guest' || mode === 'lan-host'
                    }
                  >
                    {tr('undo')}
                  </button>
                </div>
              </div>
            </section>
          )}
        </section>

        <aside className="side">
          <div className="side-card score-card">
            <div className="side-title">
              <h3>{tr('score')}</h3>
              <span>{tr('matchTo', { n: shown.target })}</span>
            </div>
            <div className="score-list">
              {scores.map((value, seat) => (
                <div
                  key={seat}
                  className={`score-row ${shown.turn === seat && shown.phase === 'playing' ? 'active' : ''}`}
                >
                  <span className="seat-dot" style={{ background: SEAT_COLORS[seat % 4] }} />
                  <span className="score-name">{nameFor(seat)}</span>
                  <span className="score-count">
                    {shown.pipTotals[seat] !== null
                      ? tr('pipsN', { n: shown.pipTotals[seat] as number })
                      : tr('handCount', { n: shown.counts[seat] })}
                  </span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="match-progress" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (Math.max(...scores) / shown.target) * 100)}%` }} />
            </div>
          </div>

          <div className="side-card">
            <h3>{tr('rulesTitle')}</h3>
            <p>{tr('lineHelp')}</p>
            <p className="side-note">{tr('controlsHint')}</p>
            <div className="side-actions">
              <button className="secondary" onClick={showHint} disabled={!canAct || mode === 'lan-guest'}>
                {tr('hint')}
              </button>
              <button
                className="secondary"
                onClick={undo}
                disabled={history.length === 0 || mode === 'lan-guest' || mode === 'lan-host'}
              >
                {tr('undo')}
              </button>
            </div>
          </div>

          {mode === 'lan-host' && (
            <div className="side-card lan-mini">
              <h3>{tr('lanCode')}</h3>
              <div className="room-code">{lanCode}</div>
              <p>{lanReady ? tr('lanAllHere') : tr('lanWaiting')}</p>
              {lanPlayers.slice(1).map((player) => (
                <p key={player.seat} className="peer">
                  {player.name} {player.connected ? '●' : '○'}
                </p>
              ))}
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('stats')}</h3>
            <p>
              {tr('matchesPlayed')} {record.matches} · {tr('roundsPlayed')} {record.rounds}
            </p>
            <button className="text-button" onClick={resetRecord}>
              {tr('resetStats')}
            </button>
          </div>
        </aside>
      </div>
      {toast && <div className="toast">{toast}</div>}
      <footer className="foot game-foot">{tr('footer')}</footer>
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>

      {mode === 'lan-guest' || guestRoom ? (
        <>
          <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
          <p className="lede">
            {tr('lanRoom')} {guestRoom} · {tr('lanGuestNote')}
          </p>
          {!guestStarted && !guest && (
            <div className="lan-form">
              <label>
                <span>{tr('lanName')}</span>
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  maxLength={18}
                  placeholder={tr('guest')}
                />
              </label>
              <label>
                <span>{tr('lanCode')}</span>
                <input
                  value={guestCode}
                  onChange={(event) => setGuestCode(event.target.value)}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="0000"
                />
              </label>
              <button
                className="primary wide"
                data-action="join"
                onClick={joinGuest}
                disabled={guestConnecting || !guestName.trim()}
              >
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
            </div>
          )}
          {guestStarted && (
            <div className="lan-wait">
              <p>{tr('lanGuestSeat', { n: (guestView?.seat ?? 1) + 1 })}</p>
              <button className="primary" onClick={() => setScreen('game')}>
                {tr('lanEnter')}
              </button>
            </div>
          )}
          {!guestStarted && guest && <p className="muted">{tr('lanWaitingHost')}</p>}
          {lanError && <p className="error">{lanError}</p>}
        </>
      ) : (
        <>
          <h2 className="screen-title">{tr('lanHostTitle')}</h2>
          <p className="lede">{tr('lanIntro')}</p>
          {lanError && <p className="error">{lanError}</p>}
          {!lanHost && (
            <div className="lan-form">
              <div className="setup-block tight">
                <h3>{tr('setupPlayers')}</h3>
                <div className="player-grid compact">
                  {([2, 3, 4] as PlayerCount[]).map((count) => (
                    <button
                      key={count}
                      className={`player-card ${lanCount === count ? 'selected' : ''}`}
                      onClick={() => setLanCount(count)}
                    >
                      <span className="player-number">{count}</span>
                      <span className="player-label">{tr('playersN', { n: count })}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button className="primary wide" data-action="create-room" onClick={createRoom} disabled={lanBusy}>
                {lanBusy ? tr('lanCreating') : tr('lanCreate')}
              </button>
              <p className="muted">{tr('lanBrowserNote')}</p>
            </div>
          )}
          {lanHost && (
            <div className="lan-layout">
              <div className="lan-card">
                <span className="label">{tr('lanCode')}</span>
                <div className="room-code big">{lanCode}</div>
                <p>{lanReady ? tr('lanReady') : tr('lanWaiting')}</p>
                <div className="peer-list">
                  {lanPlayers.slice(0, lanCount).map((player) => (
                    <span key={player.seat} className={player.connected ? 'online' : ''}>
                      {player.name} {player.connected ? '●' : '○'}
                    </span>
                  ))}
                </div>
                <button className="primary wide" data-action="start-lan" onClick={startLanMatch} disabled={!lanReady}>
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
                {!lanReady && <p className="muted">{tr('lanNeedPlayers')}</p>}
                <p className="muted">{tr('lanHostNote')}</p>
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
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <div className="rule-hero" aria-hidden="true">
        {[2, 3, 4].map((pip) => (
          <DominoFace key={pip} tile={{ a: pip, b: pip }} />
        ))}
        <span className="rule-hero-text">0 · 1 · 2 · 3 · 4 · 5 · 6</span>
      </div>
      <ol className="rules-list">
        {([1, 2, 3, 4, 5, 6, 7] as const).map((number) => (
          <li key={number}>
            <span className="rule-number">{String(number).padStart(2, '0')}</span>
            <p>{tr(`rule${number}` as MessageKey)}</p>
          </li>
        ))}
      </ol>
      <button className="primary" onClick={() => setScreen('home')}>
        {tr('close')}
      </button>
    </main>
  );

  const statsScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('statsTitle')}</h2>
      <p className="lede">{tr('statsIntro')}</p>
      <div className="stats-grid">
        <div className="stat-card">
          <span>{tr('matchesPlayed')}</span>
          <strong>{record.matches}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('roundsPlayed')}</span>
          <strong>{record.rounds}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('bestScore')}</span>
          <strong>{record.bestScore}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('currentStreak')}</span>
          <strong>{record.streak}</strong>
        </div>
      </div>
      <div className="wins-card">
        <h3>{tr('winsBySeat')}</h3>
        <div className="wins-list">
          {record.wins.map((wins, seat) => (
            <div key={seat} className="win-row">
              <span className="seat-dot" style={{ background: SEAT_COLORS[seat % 4] }} />
              <span>{tr('seatN', { n: seat + 1 })}</span>
              <strong>{wins}</strong>
            </div>
          ))}
        </div>
        <p className="muted">
          {tr('lastWinner')}:{' '}
          {record.lastWinner === null ? '—' : tr('seatN', { n: record.lastWinner + 1 })}
        </p>
      </div>
      {record.matches === 0 && <p className="empty-note">{tr('noMatches')}</p>}
      <button className="secondary" onClick={resetRecord}>
        {tr('resetStats')}
      </button>
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
