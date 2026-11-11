import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseShot, hint as getHint, type AiLevel, type HintReason } from './ai/ai';import { Board, FleetStatus, ShipPips, type BoardMark } from './components/Board';
import {
  FLEET,
  autoPlace as engineAutoPlace,
  clearFleet,
  coordLabel,
  fire,
  placeShip,
  readyUp,
  removeShip,
  setup,
  shipCells,
  shipSpec,
  view,
  type GameState,
  type Seat,
  type SeatView,
  type ShipId,
} from './game/fleet';
import { detectLang, shipLabelKey, t, type Lang, type MessageKey } from './i18n';
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
import { chime, type Chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'lan' | 'stats';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type Pass = { to: Seat; kind: 'setup' | 'turn'; move?: { result: 'miss' | 'hit' | 'sunk'; ship: ShipId | null } } | null;

const LEVEL_COPY: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const REASON_KEY: Record<HintReason, MessageKey> = {
  target: 'hintTargetReason',
  parity: 'hintParityReason',
  density: 'hintDensityReason',
  search: 'hintSearchReason',
};

const HERO_SHIPS = new Set([
  11, 12, 13, 14, 15, 27, 37, 47, 57, 64, 65, 66, 72, 73, 82, 83, 84, 85, 86, 88, 89, 90,
]);
const HERO_HITS = new Set([13, 37, 65, 83]);
const HERO_MISSES = new Set([3, 9, 16, 21, 30, 42, 48, 54, 60, 69, 76, 81, 95, 98]);
const LETTERS = 'ABCDEFGHIJ';

function levelKey(level: AiLevel): MessageKey {
  return level;
}

function shipName(lang: Lang, id: ShipId | null | undefined): string {
  return id ? t(lang, shipLabelKey(id)) : '';
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup());
  const [history, setHistory] = useState<GameState[]>([]);
  const [inGame, setInGame] = useState(false);
  const [selectedShip, setSelectedShip] = useState<ShipId | null>(null);
  const [horizontal, setHorizontal] = useState(true);
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const [hintCell, setHintCell] = useState<number | null>(null);
  const [hintReason, setHintReason] = useState<HintReason | null>(null);
  const [toast, setToast] = useState('');
  const [passing, setPassing] = useState<Pass>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.fleet.sound') !== 'off';
    } catch {
      return true;
    }
  });

  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
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

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );

  const notify = useCallback((message: string) => setToast(message), []);

  const playSound = useCallback(
    (kind: Chime) => {
      if (soundOn) chime(kind);
    },
    [soundOn],
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
      localStorage.setItem('familyarcade.fleet.sound', soundOn ? 'on' : 'off');
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
    setToast('');
  }, [screen]);

  // A guest opening an invite URL lands on the join form.
  useEffect(() => {
    if (!guestParams()?.room) return;
    setScreen('lan');
    setMode('lan-guest');
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [screen, state.phase]);

  useEffect(() => {
    if (!passing) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [passing]);

  // Local autosave. LAN state stays in the host's memory.
  useEffect(() => {
    if (!inGame || (mode !== 'ai' && mode !== 'local')) return;
    if (state.phase === 'finished') {
      clearSave();
      setSaved(null);
      return;
    }
    saveGame({ state, mode, level });
    setSaved(null);
  }, [state, mode, level, inGame]);

  // Record a finished local battle exactly once.
  useEffect(() => {
    if (!inGame || state.phase !== 'finished' || recordedRef.current) return;
    recordedRef.current = true;
    if (mode === 'ai' || mode === 'local') {
      setRecord(recordResult(state, mode));
      playSound(mode === 'ai' && state.winner === 1 ? 'sunkLose' : 'win');
      notify(tr('resultRecord'));
    } else {
      notify(tr('resultNoRecord'));
    }
  }, [state, inGame, mode, playSound, notify, tr]);

  const nameFor = useCallback(
    (seat: Seat): string => {
      if (mode === 'ai') return seat === 0 ? tr('you') : tr('ai');
      if (mode === 'local') return seat === 0 ? tr('player1') : tr('player2');
      if (mode === 'lan-host') return seat === 0 ? tr('host') : lanPlayers[1]?.name || tr('guest');
      return seat === 0 ? tr('host') : guestName.trim() || tr('guest');
    },
    [mode, tr, lanPlayers, guestName],
  );

  const modeLabel = useCallback((): string => {
    if (mode === 'ai') return tr('modeAiLabel', { level: t(lang, levelKey(level)) });
    if (mode === 'local') return tr('modeLocalLabel');
    return tr(mode === 'lan-host' ? 'modeLanHostLabel' : 'modeLanGuestLabel');
  }, [mode, tr, lang, level]);

  const resultWord = useCallback(
    (result: 'miss' | 'hit' | 'sunk', ship: ShipId | null) => {
      if (result === 'miss') return tr('resultMiss');
      if (result === 'hit') return tr('resultHit');
      return tr('resultSunk', { ship: shipName(lang, ship) });
    },
    [tr, lang],
  );

  const sendHostView = useCallback((next: GameState) => {
    const host = hostRef.current;
    if (!host) return;
    host.sendView(1, view(next, 1));
    if (next.phase === 'finished') host.sendResult(view(next, 1));
  }, []);

  const applyHostIntent = useCallback(
    (seatNumber: number, raw: unknown) => {
      const seat: Seat = seatNumber === 1 ? 1 : 0;
      const intent = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const kind = String(intent.type ?? '');
      const current = stateRef.current;
      let next: GameState | null = null;
      if (kind === 'place') {
        const id = String(intent.ship ?? '') as ShipId;
        const start = Number(intent.start);
        const across = Boolean(intent.horizontal);
        if (Number.isInteger(start)) {
          const result = placeShip(current, seat, id, start, across);
          if (result.ok) next = result.state;
        }
      } else if (kind === 'lift') {
        next = removeShip(current, seat, String(intent.ship ?? '') as ShipId);
      } else if (kind === 'clear') {
        next = clearFleet(current, seat);
      } else if (kind === 'auto') {
        const result = engineAutoPlace(current, seat, Math.random);
        if (result.ok) next = result.state;
      } else if (kind === 'ready') {
        const result = readyUp(current, seat);
        if (result.ok) next = result.state;
      } else if (kind === 'fire') {
        const cell = Number(intent.cell);
        if (Number.isInteger(cell)) {
          const result = fire(current, seat, cell);
          if (result.ok) next = result.state;
        }
      }
      if (!next) return;
      stateRef.current = next;
      setState(next);
      sendHostView(next);
    },
    [sendHostView],
  );

  // AI reply.
  useEffect(() => {
    if (mode !== 'ai' || !inGame || state.phase !== 'playing' || state.turn !== 1) {
      setAiThinking(false);
      return;
    }
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const cell = chooseShot(view(state, 1), level, Math.random);
      setAiThinking(false);
      if (cell < 0) return;
      const result = fire(state, 1, cell);
      if (!result.ok) return;
      setState(result.state);
      if (result.shot) {
        playSound(result.shot.result === 'sunk' ? 'sunk' : result.shot.result === 'hit' ? 'hit' : 'miss');
      }
    }, 700);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [mode, inGame, state, level, playSound]);

  const startSolo = useCallback(() => {
    let next = setup();
    const auto = engineAutoPlace(next, 1, Math.random);
    if (auto.ok) next = auto.state;
    const ready = readyUp(next, 1);
    if (ready.ok) next = ready.state;
    stateRef.current = next;
    setMode('ai');
    setState(next);
    setHistory([]);
    setInGame(true);
    setSelectedShip('carrier');
    setHorizontal(true);
    setHoverCell(null);
    setHintCell(null);
    setHintReason(null);
    setPassing(null);
    setAiThinking(false);
    recordedRef.current = false;
    setScreen('game');
    clearSave();
    setSaved(null);
  }, []);

  const startLocal = useCallback(() => {
    const next = setup();
    stateRef.current = next;
    setMode('local');
    setState(next);
    setHistory([]);
    setInGame(true);
    setSelectedShip('carrier');
    setHorizontal(true);
    setHoverCell(null);
    setHintCell(null);
    setHintReason(null);
    setPassing(null);
    setAiThinking(false);
    recordedRef.current = false;
    setScreen('game');
    clearSave();
    setSaved(null);
  }, []);

  const startLanGame = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const next = setup();
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setInGame(true);
    setSelectedShip('carrier');
    setHorizontal(true);
    setHoverCell(null);
    setHintCell(null);
    setHintReason(null);
    setPassing(null);
    recordedRef.current = false;
    setScreen('game');
    host.start();
    host.sendView(1, view(next, 1));
  }, []);

  const resumeGame = () => {
    const game = saved;
    if (!game) {
      if (!inGame || (mode !== 'ai' && mode !== 'local') || state.phase === 'finished') return;
      setScreen('game');
      return;
    }
    stateRef.current = game.state;
    setMode(game.mode);
    setLevel(game.level);
    setState(game.state);
    setHistory([]);
    setInGame(true);
    setSelectedShip('carrier');
    setHorizontal(true);
    setHoverCell(null);
    setHintCell(null);
    setHintReason(null);
    setPassing(null);
    setAiThinking(false);
    recordedRef.current = false;
    setScreen('game');
    setSaved(null);
  };

  const closeLan = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setLanPlayers([]);
    setLanInfo(null);
    setLanInvite('');
    setLanQr('');
    setLanError('');
    setGuest((current) => {
      current?.close();
      return null;
    });
    setGuestView(null);
    setGuestStarted(false);
    setGuestConnecting(false);
  }, []);

  const leaveGame = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') {
      closeLan();
    } else {
      setSaved(loadSave());
    }
    setPassing(null);
    setHoverCell(null);
    setHintCell(null);
    setScreen('home');
  }, [mode, closeLan]);

  const openLanHost = async () => {
    closeLan();
    setScreen('lan');
    setMode('lan-host');
    setLanBusy(true);
    setLanError('');
    setGuestView(null);
    setGuestStarted(false);
    try {
      const info = await startLanServer();
      setLanInfo(info);
      const code = newRoomCode();
      const room = code;
      const host = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room,
        code,
        name: lang === 'zh' ? '主机' : 'Host',
        maxPlayers: 2,
      });
      hostRef.current = host;
      setLanCode(code);
      host.onChange((players) => {
        setLanPlayers(players);
        if (players[1]?.connected && host.started && stateRef.current) {
          sendHostView(stateRef.current);
        }
      });
      host.onIntent((seat, intent) => applyHostIntent(seat, intent));
      host.onClose(() => setLanError(tr('lanClosed')));
      const url = inviteUrl(info, room, code, lang === 'zh' ? '访客' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 300,
          color: { dark: '#16323b', light: '#fffaf0' },
        }),
      );
    } catch {
      setLanError(tr('lanDisconnected'));
      hostRef.current?.close();
      hostRef.current = null;
    } finally {
      setLanBusy(false);
    }
  };

  const joinGuest = async () => {
    const room = (guestRoom || guestCode).trim();
    const code = guestCode.trim();
    if (!room || !guestName.trim()) {
      setLanError(tr('lanWrong'));
      return;
    }
    setGuestConnecting(true);
    setLanError('');
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room,
        code,
        name: guestName.trim(),
      });
      setGuest(joined);
      setGuestRoom(room);
      joined.onView((payload) => {
        setGuestView(payload as SeatView);
      });
      joined.onStart(() => {
        setGuestStarted(true);
        setScreen('game');
      });
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? tr('lanFull') : tr('lanWrong'));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
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

  const joinRoomScreen = () => {
    setScreen('lan');
    setMode('lan-guest');
    setLanError('');
    setGuestStarted(false);
    setGuestView(null);
    setGuestRoom('');
    setGuestCode('');
    setGuest((current) => {
      current?.close();
      return null;
    });
  };

  const passTo = (
    to: Seat,
    kind: 'setup' | 'turn',
    move?: { result: 'miss' | 'hit' | 'sunk'; ship: ShipId | null },
  ) => {
    setPassing({ to, kind, move });
    setHoverCell(null);
    setHintCell(null);
  };

  const placementSeat = useCallback((): Seat => {
    if (mode === 'ai' || mode === 'lan-host') return 0;
    if (mode === 'lan-guest') return 1;
    return state.ready[0] ? 1 : 0;
  }, [mode, state.ready]);

  const activeSeat = useCallback((): Seat => {
    if (mode === 'ai' || mode === 'lan-host') return 0;
    if (mode === 'lan-guest') return 1;
    if (state.phase === 'placing') return state.ready[0] ? 1 : 0;
    return state.turn;
  }, [mode, state.phase, state.ready, state.turn]);

  const shown: SeatView | null = mode === 'lan-guest' ? guestView : view(state, activeSeat());

  const localContinue: SavedGame | null =
    !saved && inGame && (mode === 'ai' || mode === 'local') && state.phase !== 'finished'
      ? { version: 2, state, mode, level, savedAt: Date.now() }
      : null;
  const continueGame = saved ?? localContinue;

  const playAt = (cell: number) => {
    if (!shown) return;
    if (mode === 'lan-guest') {
      if (guestView?.canFire && (!guest || guestStarted)) {
        guest?.sendIntent({ type: 'fire', cell });
        playSound('shot');
      }
      return;
    }
    if (mode === 'lan-host' && !lanPlayers[1]?.connected) return;
    const seat: Seat = mode === 'lan-host' ? 0 : mode === 'ai' ? 0 : state.turn;
    if (state.phase !== 'playing' || state.turn !== seat) return;
    const result = fire(state, seat, cell);
    if (!result.ok) return;
    const previous = state;
    stateRef.current = result.state;
    setState(result.state);
    setHintCell(null);
    setHintReason(null);
    if (mode === 'ai') {
      setHistory((items) => [...items, previous]);
    } else if (mode === 'local') {
      setHistory((items) => [...items, previous]);
    }
    if (result.shot) {
      playSound(result.shot.result === 'sunk' ? 'sunk' : result.shot.result === 'hit' ? 'hit' : 'miss');
    }
    if (mode === 'lan-host') {
      sendHostView(result.state);
    }
    if (mode === 'local' && result.state.phase === 'playing') {
      passTo(result.state.turn, 'turn', result.shot);
    }
  };

  const placeAt = (cell: number) => {
    if (!shown || shown.phase !== 'placing' || !shown.canPlace) return;
    const seat = placementSeat();
    const mine = shown.myShips.find((ship) => ship.cells.includes(cell));
    if (mine) {
      liftShip(mine.id);
      return;
    }
    const id = activeShip(shown);
    if (!id) {
      notify(tr('selectShip'));
      return;
    }
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'place', ship: id, start: cell, horizontal });
      playSound('place');
      return;
    }
    const result = placeShip(state, seat, id, cell, horizontal);
    if (!result.ok) {
      notify(tr('toastInvalid'));
      playSound('miss');
      return;
    }
    stateRef.current = result.state;
    setState(result.state);
    setSelectedShip(null);
    playSound('place');
    notify(tr('toastPlaced', { ship: t(lang, shipLabelKey(id)) }));
    if (mode === 'lan-host') sendHostView(result.state);
  };

  const liftShip = (id: ShipId) => {
    if (!shown || shown.phase !== 'placing' || !shown.canPlace) return;
    const seat = placementSeat();
    setSelectedShip(id);
    playSound('place');
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'lift', ship: id });
      return;
    }
    const next = removeShip(state, seat, id);
    stateRef.current = next;
    setState(next);
    notify(tr('toastRemoved', { ship: t(lang, shipLabelKey(id)) }));
    if (mode === 'lan-host') sendHostView(next);
  };

  const activeShip = (seatView: SeatView): ShipId | null => {
    const placed = new Set(seatView.myShips.map((ship) => ship.id));
    if (selectedShip && !placed.has(selectedShip)) return selectedShip;
    return FLEET.find((ship) => !placed.has(ship.id))?.id ?? null;
  };

  const autoPlace = () => {
    if (!shown || shown.phase !== 'placing' || !shown.canPlace) return;
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'auto' });
      playSound('place');
      notify(tr('toastAuto'));
      return;
    }
    const result = engineAutoPlace(state, placementSeat(), Math.random);
    if (!result.ok) return;
    stateRef.current = result.state;
    setState(result.state);
    setSelectedShip(null);
    playSound('place');
    notify(tr('toastAuto'));
    if (mode === 'lan-host') sendHostView(result.state);
  };

  const clearMyFleet = () => {
    if (!shown || shown.phase !== 'placing' || !shown.canPlace) return;
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'clear' });
      playSound('miss');
      notify(tr('toastCleared'));
      return;
    }
    const next = clearFleet(state, placementSeat());
    stateRef.current = next;
    setState(next);
    setSelectedShip('carrier');
    playSound('miss');
    notify(tr('toastCleared'));
    if (mode === 'lan-host') sendHostView(next);
  };

  const ready = () => {
    if (!shown || shown.phase !== 'placing' || shown.ready[shown.seat]) return;
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'ready' });
      playSound('place');
      notify(tr('toastReadyLan'));
      return;
    }
    const result = readyUp(state, placementSeat());
    if (!result.ok) {
      notify(tr('needAllShips'));
      return;
    }
    stateRef.current = result.state;
    setState(result.state);
    setSelectedShip(null);
    playSound('place');
    if (mode === 'ai') {
      notify(tr('toastReadyLan'));
    } else if (mode === 'local') {
      if (result.state.phase === 'playing') passTo(0, 'turn');
      else passTo(1, 'setup');
    } else if (mode === 'lan-host') {
      sendHostView(result.state);
      notify(tr('toastReady'));
    }
  };

  const undo = () => {
    if (mode === 'lan-host' || mode === 'lan-guest') {
      notify(tr('undoBlocked'));
      return;
    }
    if (history.length === 0 || state.phase === 'finished') {
      notify(tr('undoEmpty'));
      return;
    }
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));
    stateRef.current = previous;
    setState(previous);
    setHintCell(null);
    setHintReason(null);
    setHoverCell(null);
    setPassing(mode === 'local' ? { to: previous.turn, kind: 'turn' } : null);
    recordedRef.current = false;
    playSound('place');
    notify(tr('undoDone'));
  };

  const showHint = () => {
    if (!shown || !shown.canFire) return;
    const advice = getHint(shown, () => 0.5);
    if (!advice) {
      notify(tr('hintNone'));
      return;
    }
    setHintCell(advice.cell);
    setHintReason(advice.reason);
    const reason = tr(REASON_KEY[advice.reason]);
    notify(tr('hintToast', { coord: coordLabel(advice.cell), reason }));
  };

  const rematch = () => {
    if (mode === 'ai') startSolo();
    else if (mode === 'local') startLocal();
    else if (mode === 'lan-host') startLanGame();
  };

  const toggleOrientation = () => setHorizontal((value) => !value);

  // Keyboard path.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (screen === 'game') leaveGame();
        else if (screen !== 'home') setScreen('home');
        return;
      }
      if (screen !== 'game' || passing) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const key = event.key.toLowerCase();
      if (state.phase === 'placing') {
        if (key === 'r') {
          event.preventDefault();
          toggleOrientation();
        }
        if (event.key.startsWith('Arrow')) {
          event.preventDefault();
          moveFocus(event.key, '.own-board');
        }
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
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        moveFocus(event.key, '.enemy-board');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const closeStats = () => setScreen('home');

  const hero = (
    <div className="hero-art" aria-hidden="true">
      <div className="hero-glow" />
      <div className="hero-sonar s1" />
      <div className="hero-sonar s2" />
      <div className="hero-chart">
        {Array.from({ length: 100 }, (_, cell) => {
          const row = Math.floor(cell / 10);
          const col = cell % 10;
          const classes = ['hero-cell'];
          if (HERO_SHIPS.has(cell)) classes.push('hero-ship');
          if (HERO_HITS.has(cell)) classes.push('hero-hit');
          if (HERO_MISSES.has(cell)) classes.push('hero-miss');
          return (
            <span key={cell} className={classes.join(' ')}>
              {HERO_HITS.has(cell) ? <i className="hero-splash" /> : null}
              {HERO_MISSES.has(cell) ? <i className="hero-ring" /> : null}
              {cell === 0 ? <b className="hero-axis">{`${LETTERS[row]}${col + 1}`}</b> : null}
            </span>
          );
        })}
      </div>
      <div className="hero-stamp">
        <span>FAMILY ARCADE</span>
        <strong>FLEET</strong>
        <span>海战棋</span>
      </div>
    </div>
  );

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">FAMILY ARCADE · 15</p>
          <h1>{tr('title')}</h1>
          <p className="subtitle">{tr('subtitle')}</p>
        </div>
        <div className="mast-actions">
          <button type="button" className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
          <button type="button" className="ghost" onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
        </div>
      </header>

      <section className="hero">
        {hero}
        <div className="hero-copy">
          <p className="kicker">{tr('homeQuote')}</p>
          <div className="menu">
            {continueGame && (
              <button type="button" className="primary wide" onClick={resumeGame} data-testid="continue">
                <span>{tr('continue')}</span>
                <small>{tr('saved')}</small>
              </button>
            )}
            <button
              type="button"
              className={continueGame ? 'secondary wide' : 'primary wide'}
              onClick={() => setScreen('setup')}
              data-testid="play-ai"
            >
              <span>{tr('playAi')}</span>
              <small>{tr('rulesShort')}</small>
            </button>
            <button type="button" className="secondary wide" onClick={startLocal} data-testid="play-local">
              <span>{tr('playLocal')}</span>
              <small>{tr('passHint')}</small>
            </button>
            <button type="button" className="secondary wide" onClick={openLanHost} data-testid="play-lan">
              <span>{tr('playLan')}</span>
              <small>{tr('lanOpenHint')}</small>
            </button>
          </div>
          <div className="home-links">
            <button type="button" className="text-button" onClick={() => setScreen('rules')} data-testid="rules">
              {tr('rules')} →
            </button>
            <button type="button" className="text-button" onClick={joinRoomScreen} data-testid="join-room">
              {tr('lanJoin')} →
            </button>
            <button type="button" className="text-button" onClick={() => setScreen('stats')} data-testid="stats">
              {tr('recordLink')}
            </button>
          </div>
          <button type="button" className="record-strip" onClick={() => setScreen('stats')}>
            <span>{tr('stats')}</span>
            <strong>{record.games}</strong>
            <span>{tr('games')}</span>
            <span className="dot">·</span>
            <span>{record.wins0} {tr('wins0')}</span>
            <span className="dot">·</span>
            <span>{record.wins1} {tr('wins1')}</span>
            <span className="dot">·</span>
            <span>{record.streak} {tr('streak')}</span>
          </button>
        </div>
      </section>
      <footer className="foot">{tr('footer')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell">
      <button type="button" className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('setupTitle')}</h2>
      <p className="lede">{tr('setupLede')}</p>
      <div className="level-grid">
        {LEVEL_COPY.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`level-card ${level === item.id ? 'selected' : ''}`}
            onClick={() => setLevel(item.id)}
            data-level={item.id}
          >
            <span className={`level-dot ${item.id}`} />
            <strong>{tr(item.label)}</strong>
            <small>{tr(item.note)}</small>
          </button>
        ))}
      </div>
      <div className="setup-note">
        <span className="note-mark">⚓</span>
        <p>{tr('setupTip')}</p>
      </div>
      <div className="row-actions">
        <button type="button" className="primary" onClick={startSolo} data-testid="begin">
          {tr('begin')}
        </button>
        <button type="button" className="ghost" onClick={() => setScreen('home')}>
          {tr('back')}
        </button>
      </div>
    </main>
  );

  let content: ReactNode = null;

  if (screen === 'game') {
    if (!shown) {
      content = (
        <main className="shell narrow-shell">
          <p className="lede">{tr('lanWaiting')}</p>
          <button type="button" className="secondary" onClick={leaveGame}>
            {tr('back')}
          </button>
        </main>
      );
    } else if (shown.phase === 'placing') {
      content = renderPlacement();
    } else {
      content = renderBattle();
    }
  }

  function renderPlacement() {
    if (!shown) return null;
    const placed = new Set(shown.myShips.map((ship) => ship.id));
    const ship = activeShip(shown);
    const spec = ship ? shipSpec(ship) : null;
    const preview =
      shown.canPlace && spec && hoverCell !== null ? shipCells(hoverCell, spec.length, horizontal) : null;
    const previewInvalid =
      Boolean(preview) &&
      Boolean(
        preview?.some((cell) =>
          shown.myShips.some((mine) => mine.cells.includes(cell)),
        ),
      );
    const isReady = shown.ready[shown.seat];
    const waitingGuest = mode === 'lan-host' && shown.ready[0] && !shown.ready[1];
    const waitingHost = mode === 'lan-guest' && shown.ready[1] && !shown.ready[0];
    return (
      <main className="shell game-shell">
        <header className="game-top">
          <button type="button" className="back" onClick={leaveGame}>
            ← {tr('home')}
          </button>
          <div className="game-id">
            <strong>{tr('title')}</strong>
            <span>{modeLabel()}</span>
          </div>
          <div className="game-top-actions">
            <button type="button" className="ghost" onClick={() => setSoundOn((value) => !value)}>
              {soundOn ? tr('soundOn') : tr('soundOff')}
            </button>
            <button type="button" className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
              {tr('language')}
            </button>
          </div>
        </header>

        <div className="phase-bar">
          <span className="phase-pill">{tr('phasePlacing')}</span>
          <p>{mode === 'lan-host' ? tr('lanHostSeat') : mode === 'lan-guest' ? tr('lanGuestSeat') : tr('placeTip')}</p>
        </div>

        <div className="placement-layout">
          <section className="placement-board-wrap">
            <Board
              kind="own"
              label={tr('yourWaters')}
              ships={shown.myShips}
              marks={shown.ownBoardShots as BoardMark[]}
              lang={lang}
              disabled={!shown.canPlace}
              preview={preview}
              previewInvalid={previewInvalid}
              onCell={placeAt}
              onHover={setHoverCell}
            />
            <p className="board-foot">
              {shown.canPlace
                ? ship
                  ? tr('placePrompt', { ship: t(lang, shipLabelKey(ship)) })
                  : tr('liftHint')
                : tr('waitingOpponent')}
            </p>
          </section>

          <aside className="side placement-side">
            <div className="side-card">
              <h3>{tr('fleetDock')}</h3>
              <div className="dock">
                {FLEET.map((item) => {
                  const isPlaced = placed.has(item.id);
                  const selected = !isPlaced && ship === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`dock-card ${selected ? 'selected' : ''} ${isPlaced ? 'is-placed' : ''}`}
                      onClick={() => {
                        if (isPlaced) liftShip(item.id);
                        else setSelectedShip(item.id);
                      }}
                      disabled={!shown.canPlace}
                      data-ship={item.id}
                    >
                      <span className="dock-ship">
                        <ShipPips length={item.length} sunk={false} />
                      </span>
                      <span className="dock-name">{t(lang, shipLabelKey(item.id))}</span>
                      <span className="dock-length">{item.length}</span>
                      {isPlaced ? <span className="dock-check">✓</span> : null}
                    </button>
                  );
                })}
              </div>
              {shown.canPlace && (
                <>
                  <div className="heading-row">
                    <span>{tr('heading')}</span>
                    <button type="button" className="segmented" onClick={toggleOrientation}>
                      <span className={horizontal ? 'on' : ''}>{tr('across')}</span>
                      <span className={!horizontal ? 'on' : ''}>{tr('down')}</span>
                    </button>
                    <button type="button" className="ghost small" onClick={toggleOrientation}>
                      {tr('rotate')} · R
                    </button>
                  </div>
                  <div className="dock-actions">
                    <button type="button" className="secondary" onClick={autoPlace} data-testid="auto-place">
                      {tr('autoPlace')}
                    </button>
                    <button type="button" className="secondary" onClick={clearMyFleet}>
                      {tr('clearFleet')}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="primary wide"
                    disabled={placed.size < FLEET.length}
                    onClick={ready}
                    data-testid="ready"
                  >
                    {tr('ready')}
                  </button>
                </>
              )}
            </div>

            {isReady && (
              <div className="side-card waiting-card">
                <span className="waiting-dot" />
                <h3>{tr('fleetStatus')}</h3>
                <p>
                  {waitingGuest
                    ? tr('waitingGuestFleet')
                    : waitingHost
                      ? tr('waitingHostFleet')
                      : tr('waitingOpponent')}
                </p>
              </div>
            )}

            <FleetStatus lang={lang} ships={shown.myShips} title={tr('yourFleet')} />

            <div className="side-card">
              <h3>{tr('placeTip').split('.')[0]}</h3>
              <p>{tr('keyboardPlace')}</p>
            </div>
          </aside>
        </div>
        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    );
  }

  function renderBattle() {
    if (!shown) return null;
    const finished = shown.phase === 'finished';
    const winnerName = shown.winner === null ? '' : nameFor(shown.winner);
    const winnerText =
      shown.winner === null
        ? ''
        : mode === 'local'
          ? tr('winTitle', { name: winnerName })
          : shown.winner === shown.seat
            ? tr('youWin')
            : tr('winTitle', { name: winnerName });
    const enemyName = nameFor(shown.seat === 0 ? 1 : 0);
    const canFire = shown.canFire && !finished && !(mode === 'lan-host' && !lanPlayers[1]?.connected);
    const lastMove = shown.lastMove;
    const outgoing = lastMove ? lastMove.seat === shown.seat : false;
    const lastCell = lastMove?.cell ?? null;
    const lastBoard = lastMove ? (lastMove.seat === shown.seat ? 'enemy' : 'own') : null;
    const lastText = lastMove
      ? outgoing
        ? tr('shotOutgoing', {
            coord: coordLabel(lastMove.cell),
            result: resultWord(lastMove.result, lastMove.ship),
          })
        : tr('shotIncoming', {
            name: enemyName,
            coord: coordLabel(lastMove.cell),
            result: resultWord(lastMove.result, lastMove.ship),
          })
      : tr('noShots');
    const hintReasonText = hintReason ? tr(REASON_KEY[hintReason]) : '';
    const turnName = nameFor(shown.turn);
    const incoming = lastMove && !outgoing;
    const flashCell = lastCell;
    const waitingLan = mode === 'lan-guest' && !guestStarted;

    return (
      <main className="shell game-shell">
        <header className="game-top">
          <button type="button" className="back" onClick={leaveGame}>
            ← {tr('home')}
          </button>
          <div className="game-id">
            <strong>{tr('title')}</strong>
            <span>{modeLabel()}</span>
          </div>
          <div className="game-top-actions">
            <button type="button" className="ghost" onClick={() => setSoundOn((value) => !value)}>
              {soundOn ? tr('soundOn') : tr('soundOff')}
            </button>
            <button type="button" className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
              {tr('language')}
            </button>
          </div>
        </header>

        <div className={`turn-bar ${canFire ? 'mine' : 'theirs'} ${finished ? 'over' : ''}`}>
          <div className="turn-avatar">{shown.seat === 0 ? 'I' : 'II'}</div>
          <div className="turn-copy">
            <span className="phase-pill">{tr(finished ? 'phaseFinished' : 'phasePlaying')}</span>
            <strong>
              {finished
                ? winnerText
                : mode === 'ai' && state.turn === 1 && aiThinking
                  ? tr('aiThinking')
                  : canFire
                    ? tr('yourTurn')
                    : tr('waitingFor', { name: turnName })}
            </strong>
            <p>
              {finished
                ? tr('reveal')
                : canFire
                  ? tr('firePrompt')
                  : tr('waitingPrompt')}
            </p>
          </div>
          <div className="turn-meta">
            <span>{tr('shotCount', { count: shown.moveCount })}</span>
            {mode === 'lan-host' && <span className="lan-live">LAN · {lanCode}</span>}
            {mode === 'lan-guest' && <span className="lan-live">LAN · {guestRoom || lanCode}</span>}
          </div>
        </div>

        <div className="battle-layout">
          <section className="boards">
            <Board
              kind="enemy"
              label={tr('enemyWaters')}
              ships={shown.enemyShips}
              marks={shown.enemyBoardShots as BoardMark[]}
              lang={lang}
              disabled={!canFire}
              hint={canFire ? hintCell : null}
              last={lastBoard === 'enemy' ? lastCell : null}
              flash={lastBoard === 'enemy' ? flashCell : null}
              onCell={playAt}
            />
            <Board
              kind="own"
              label={tr('yourWaters')}
              ships={shown.myShips}
              marks={shown.ownBoardShots as BoardMark[]}
              lang={lang}
              disabled
              last={lastBoard === 'own' ? lastCell : null}
              flash={lastBoard === 'own' ? flashCell : null}
            />
          </section>

          <aside className="side">
            <div className={`side-card last-shot ${incoming ? 'incoming' : ''}`}>
              <span className="label">{tr('lastShot')}</span>
              <div className="last-coord">{lastMove ? coordLabel(lastMove.cell) : '—'}</div>
              <p>{lastText}</p>
            </div>

            <div className="side-card">
              <h3>{tr('battleLog')}</h3>
              <div className="side-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={undo}
                  disabled={mode === 'lan-host' || mode === 'lan-guest' || history.length === 0 || finished}
                  data-testid="undo"
                >
                  {tr('undo')}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={showHint}
                  disabled={!canFire}
                  data-testid="hint"
                >
                  {tr('hint')}
                </button>
              </div>
              <p className="keyboard-note">{tr('keyboardHint')}</p>
              {hintCell !== null && (
                <p className="hint-note">
                  {tr('hintText', { coord: coordLabel(hintCell), reason: hintReasonText })}
                </p>
              )}
            </div>

            <FleetStatus lang={lang} ships={shown.myShips} title={tr('yourFleet')} />
            <FleetStatus lang={lang} ships={shown.enemyFleet} title={tr('enemyWaters')} />

            <div className="side-card record-mini">
              <h3>{tr('stats')}</h3>
              <p>
                {record.games} {tr('games')} · {record.wins0}/{record.wins1} · {tr('soloWins')} {record.aiWins}
              </p>
              <button type="button" className="text-button" onClick={() => setRecord(clearRecord())}>
                {tr('resetStats')}
              </button>
            </div>

            {mode === 'lan-host' && (
              <div className="side-card lan-mini">
                <h3>{tr('lanCode')}</h3>
                <div className="room-code">{lanCode}</div>
                <p>{lanPlayers[1]?.connected ? tr('lanReady') : tr('lanWaiting')}</p>
              </div>
            )}
          </aside>
        </div>

        {finished && (
          <div className="result-banner" role="dialog" aria-label={winnerText}>
            <div>
              <span className="phase-pill">{tr('phaseFinished')}</span>
              <h2>{winnerText}</h2>
              <p>{shown.winner === shown.seat ? tr('winBody') : tr('winBodyLose')}</p>
              <p className="muted">{tr('reveal')}</p>
            </div>
            <div className="result-actions">
              {mode !== 'lan-guest' ? (
                <button type="button" className="primary" onClick={rematch} data-testid="rematch">
                  {tr('rematch')}
                </button>
              ) : (
                <p className="muted">{tr('guestWaitingRematch')}</p>
              )}
              <button type="button" className="secondary" onClick={leaveGame}>
                {tr('home')}
              </button>
            </div>
          </div>
        )}

        {waitingLan && <div className="curtain">{tr('lanWaitingHostStart')}</div>}
        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    );
  }

  const statsScreen = (
    <main className="shell narrow-shell">
      <button type="button" className="back" onClick={closeStats}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('statsTitle')}</h2>
      <p className="lede">{tr('statsLede')}</p>
      <div className="stats-grid">
        <div className="stat-card">
          <span>{tr('statGames')}</span>
          <strong>{record.games}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('statP1')}</span>
          <strong>{record.wins0}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('statP2')}</span>
          <strong>{record.wins1}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('statWinRate')}</span>
          <strong>{record.aiGames ? Math.round((record.aiWins / record.aiGames) * 100) : 0}%</strong>
        </div>
        <div className="stat-card">
          <span>{tr('statStreak')}</span>
          <strong>{record.streak}</strong>
        </div>
        <div className="stat-card wide-stat">
          <span>{tr('statSolo')}</span>
          <strong>{record.aiWins} / {record.aiGames}</strong>
          <small>{tr('statSoloLine', { wins: record.aiWins, games: record.aiGames })}</small>
        </div>
      </div>
      {record.games === 0 && <p className="empty-note">{tr('statsEmpty')}</p>}
      <div className="row-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setRecord(clearRecord());
            notify(tr('statsCleared'));
          }}
        >
          {tr('statsReset')}
        </button>
        <button type="button" className="primary" onClick={closeStats}>
          {tr('close')}
        </button>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <button type="button" className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <div className="rule-cards">
        <div className="rule-card">
          <span>01</span>
          <strong>{tr('ruleShort1')}</strong>
        </div>
        <div className="rule-card">
          <span>02</span>
          <strong>{tr('ruleShort2')}</strong>
        </div>
        <div className="rule-card">
          <span>03</span>
          <strong>{tr('ruleShort3')}</strong>
        </div>
      </div>
      <ol className="rules-list">
        <li>{tr('rule1')}</li>
        <li>{tr('rule2')}</li>
        <li>{tr('rule3')}</li>
        <li>{tr('rule4')}</li>
        <li>{tr('rule5')}</li>
      </ol>
      <p className="lede">{tr('rulesFoot')}</p>
      <button type="button" className="primary" onClick={() => setScreen('home')}>
        {tr('close')}
      </button>
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell lan-shell">
      <button
        type="button"
        className="back"
        onClick={() => {
          closeLan();
          setScreen('home');
        }}
      >
        ← {tr('back')}
      </button>
      {mode === 'lan-guest' ? (
        <>
          <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
          <p className="lede">{guestRoom ? tr('lanRoom', { room: guestRoom }) : tr('lanGuestNote')}</p>
          {!guest && (
            <div className="lan-form">
              <label>
                <span>{tr('lanName')}</span>
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  maxLength={18}
                  data-testid="guest-name"
                />
              </label>
              <label>
                <span>{guestRoom ? tr('lanJoinCode') : tr('lanCode')}</span>
                <input
                  value={guestCode}
                  onChange={(event) => setGuestCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                  inputMode="numeric"
                  maxLength={4}
                  data-testid="guest-code"
                />
              </label>
              <button
                type="button"
                className="primary wide"
                onClick={joinGuest}
                disabled={guestConnecting || !guestName.trim() || !(guestRoom || guestCode).trim()}
                data-testid="guest-join"
              >
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
              <p className="fine-print">{tr('lanGuestNote')}</p>
            </div>
          )}
          {guest && !guestStarted && (
            <div className="side-card waiting-card">
              <span className="waiting-dot" />
              <h3>{tr('lanWaiting')}</h3>
              <p>{tr('lanWaitingHostStart')}</p>
            </div>
          )}
          {lanError && <p className="error">{lanError}</p>}
          {mode === 'lan-guest' && guestStarted && !guestView && <p className="lede">{tr('lanWaiting')}</p>}
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
                  type="button"
                  className="primary wide"
                  onClick={startLanGame}
                  disabled={!lanPlayers[1]?.connected}
                  data-testid="lan-start"
                >
                  {tr('lanStart')}
                </button>
                <button
                  type="button"
                  className="secondary wide"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(lanInvite);
                      notify(tr('lanCopied'));
                    } catch {
                      notify(lanInvite);
                    }
                  }}
                >
                  {tr('lanCopy')}
                </button>
                <p className="fine-print">{tr('lanGuestNote')}</p>
              </div>
              <div className="qr-card">
                {lanQr ? <img src={lanQr} alt={tr('lanScan')} /> : null}
                <p>{tr('lanScan')}</p>
                <code>{lanInvite.replace(/^https?:\/\//, '')}</code>
              </div>
            </div>
          )}
          {!lanInfo && !lanBusy && (
            <button type="button" className="secondary" onClick={openLanHost}>
              {tr('lanHost')}
            </button>
          )}
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const passOverlay = passing ? (
    <div className="pass-overlay" role="dialog" aria-modal="true" aria-label={tr('passTitle')}>
      <div className="pass-card">
        <p className="eyebrow">FAMILY ARCADE · FLEET</p>
        <h2>{tr('passTitle')}</h2>
        <p className="pass-who">{nameFor(passing.to)}</p>
        <p>{passing.kind === 'setup' ? tr('passSetupBody', { name: nameFor(passing.to) }) : tr('passTurnBody', { name: nameFor(passing.to) })}</p>
        {passing.move && (
          <p className="pass-result">
            {tr('passResult', { text: resultWord(passing.move.result, passing.move.ship) })}
          </p>
        )}
        <p className="fine-print">{tr('passHint')}</p>
        <button type="button" className="primary wide" onClick={() => setPassing(null)} data-testid="pass-ready">
          {tr('imReady')}
        </button>
      </div>
    </div>
  ) : null;

  if (screen === 'setup') return setupScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'stats') return statsScreen;
  if (screen === 'lan') return lanScreen;
  if (screen === 'game') {
    return (
      <>
        {content}
        {passOverlay}
      </>
    );
  }
  return home;
}

function moveFocus(key: string, selector: string): void {
  const board = document.querySelector(selector);
  if (!board) return;
  const cells = Array.from(board.querySelectorAll<HTMLButtonElement>('.cell:not(:disabled)'));
  if (cells.length === 0) return;
  const active = document.activeElement as HTMLButtonElement | null;
  const index = active ? cells.indexOf(active) : -1;
  if (index < 0) {
    if (key === 'ArrowUp' || key === 'ArrowLeft') cells[cells.length - 1].focus();
    else cells[0].focus();
    return;
  }
  const row = Number(cells[index].dataset.row);
  const col = Number(cells[index].dataset.col);
  let targetRow = row;
  let targetCol = col;
  if (key === 'ArrowUp') targetRow -= 1;
  if (key === 'ArrowDown') targetRow += 1;
  if (key === 'ArrowLeft') targetCol -= 1;
  if (key === 'ArrowRight') targetCol += 1;
  if (targetRow < 0 || targetRow > 9 || targetCol < 0 || targetCol > 9) return;
  const next = cells.find(
    (cell) => Number(cell.dataset.row) === targetRow && Number(cell.dataset.col) === targetCol,
  );
  next?.focus();
}
