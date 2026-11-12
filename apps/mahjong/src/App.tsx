import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import {
  LanGuest,
  LanHost,
  guestParams,
  newRoomCode,
  type LanPublicPeer,
} from '@family-arcade/lan';
import {
  chooseAction,
  hint as getHint,
  type AiLevel,
  type Hint,
} from './ai/ai';
import { HandTile, MeldGroup, River, SeatPanel, TileFace } from './components/Tiles';
import { demoClaim, demoWin } from './demo';
import {
  activeSeat,
  applyAction,
  setup,
  tileFromKey,
  tileKey,
  view,
  windOf,
  type FanKey,
  type GameAction,
  type GameState,
  type LogEntry,
  type Seat,
  type SeatView,
  type WinInfo,
} from './game/mahjong';
import {
  detectLang,
  ruleSections,
  seatPositionName,
  t,
  tileName,
  windName,
  type Lang,
  type MessageKey,
} from './i18n';
import {
  guestWsUrl,
  hostWsUrl,
  inviteUrl,
  startLanServer,
  type LanServerInfo,
} from './net';
import {
  clearRecord as clearStoredRecord,
  clearSave,
  loadRecord,
  loadSave,
  recordResult,
  saveGame,
  type FamilyRecord,
  type RecordEntry,
  type RecordMode,
  type SavedGame,
} from './storage';
import { chime, type SoundKind } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'record' | 'rules' | 'lan';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type LanRole = 'hub' | 'host' | 'guest';

const AI_LEVELS_UI: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionNote' },
  { id: 'easy', label: 'easy', note: 'easyNote' },
  { id: 'normal', label: 'normal', note: 'normalNote' },
  { id: 'hard', label: 'hard', note: 'hardNote' },
];

const FAN_LABEL: Record<FanKey, MessageKey> = {
  selfDraw: 'fanSelfDraw',
  concealed: 'fanConcealed',
  allSimples: 'fanAllSimples',
  allTriplets: 'fanAllTriplets',
  mixedSuit: 'fanMixedSuit',
  pureSuit: 'fanPureSuit',
  pureStraight: 'fanPureStraight',
  sevenPairs: 'fanSevenPairs',
  thirteenOrphans: 'fanThirteenOrphans',
  seatWind: 'fanSeatWind',
  prevalentWind: 'fanPrevalentWind',
  dragonTriplet: 'fanDragonTriplet',
  kongDraw: 'fanKongDraw',
  lastTile: 'fanLastTile',
  robbingKong: 'fanRobbingKong',
};

const POSITION_SEAT: Seat[] = [0, 1, 2, 3];

const QUERY =
  typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const DEMO = QUERY?.get('demo') ?? null;
const DEMO_STATE = DEMO === 'win' ? demoWin() : DEMO === 'claim' ? demoClaim() : null;
const INVITE = typeof location !== 'undefined' ? guestParams() : null;
const SEED_TEXT = QUERY?.get('seed') ?? '';

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function freshRng(): () => number {
  if (SEED_TEXT.trim()) {
    const value = Number(SEED_TEXT);
    return seeded(Number.isFinite(value) ? value : 1);
  }
  return Math.random;
}

function isSeatView(value: unknown): value is SeatView {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SeatView>;
  return (
    typeof candidate.seat === 'number' &&
    typeof candidate.phase === 'string' &&
    Array.isArray(candidate.hand) &&
    Array.isArray(candidate.melds) &&
    Array.isArray(candidate.discards) &&
    Array.isArray(candidate.handCounts)
  );
}

function readableInvite(url: string): string {
  try {
    return decodeURIComponent(url).replace(/^https?:\/\//, '');
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
}

function formatDate(at: number, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(at));
  } catch {
    return '';
  }
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>(() =>
    DEMO_STATE ? 'game' : INVITE ? 'lan' : 'home',
  );
  const [mode, setMode] = useState<Mode>(() =>
    DEMO_STATE ? 'ai' : INVITE ? 'lan-guest' : 'ai',
  );
  const [level, setLevel] = useState<AiLevel>(() => {
    try {
      const saved = localStorage.getItem('familyarcade.mahjong.level');
      return saved === 'companion' || saved === 'easy' || saved === 'hard' ? saved : 'normal';
    } catch {
      return 'normal';
    }
  });
  const [roundWind, setRoundWind] = useState(1);
  const [minimumFan, setMinimumFan] = useState(1);
  const [state, setState] = useState<GameState>(() => {
    if (DEMO_STATE) return DEMO_STATE;
    return setup({ rng: freshRng(), dealer: 0, roundWind: 1, minimumFan: 1 });
  });
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hintTile, setHintTile] = useState<string | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => (DEMO_STATE ? null : loadSave()));
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.mahjong.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [motionOn, setMotionOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.mahjong.motion') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [revealedSeat, setRevealedSeat] = useState<number | null>(DEMO_STATE ? 0 : null);
  const [clearArmed, setClearArmed] = useState(false);

  const [lanRole, setLanRole] = useState<LanRole>(() => (INVITE ? 'guest' : 'hub'));
  const [, setLanInfo] = useState<LanServerInfo | null>(null);
  const [, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [humanSeats, setHumanSeats] = useState<number[]>([0]);
  const [hostName, setHostName] = useState(() => {
    try {
      return localStorage.getItem('familyarcade.mahjong.hostName') ?? '';
    } catch {
      return '';
    }
  });
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => INVITE?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => INVITE?.code || INVITE?.room || '');
  const [guestRoom, setGuestRoom] = useState(() => INVITE?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [guestPlayers, setGuestPlayers] = useState<LanPublicPeer[]>([]);

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const hostStartedRef = useRef(false);
  const humanSeatsRef = useRef<number[]>([0]);
  const guestJoinSeqRef = useRef(0);
  const hostCreateSeqRef = useRef(0);
  const recordedRef = useRef(Boolean(DEMO_STATE));
  const autoJoinRef = useRef(false);
  const lanActiveRef = useRef(false);
  const guestSoundRef = useRef<{
    phase: string;
    discards: number;
    claim: string;
    winner: number | null;
  } | null>(null);

  const tr = useCallback((key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params), [lang]);
  const isGuest = mode === 'lan-guest';
  const isLan = mode === 'lan-host' || mode === 'lan-guest';

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    humanSeatsRef.current = humanSeats;
  }, [humanSeats]);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? '麻将' : 'Mahjong';
    try {
      localStorage.setItem('familyarcade.lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.mahjong.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.mahjong.motion', motionOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    document.documentElement.classList.toggle('reduce-motion', !motionOn);
  }, [motionOn]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.mahjong.level', level);
    } catch {
      /* ignore */
    }
  }, [level]);

  useEffect(() => {
    try {
      localStorage.setItem('familyarcade.mahjong.hostName', hostName);
    } catch {
      /* ignore */
    }
  }, [hostName]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (screen !== 'game') {
      setSelected(null);
      setHintTile(null);
      setClearArmed(false);
    }
  }, [screen]);

  const sendViews = useCallback((next: GameState) => {
    const host = hostRef.current;
    if (!host) return;
    for (const seat of humanSeatsRef.current) {
      if (seat === 0) continue;
      host.sendView(seat, view(next, seat));
    }
  }, []);

  const finishRecord = useCallback((next: GameState, currentMode: Mode) => {
    if (next.phase !== 'over' || recordedRef.current) return;
    recordedRef.current = true;
    if (currentMode === 'lan-guest') return;
    const recordMode: RecordMode =
      currentMode === 'ai' ? 'ai' : currentMode === 'local' ? 'local' : 'lan';
    const outcome = {
      winner: next.winner,
      fan: next.winInfo?.totalFan ?? 0,
      result: next.result === 'draw' ? ('draw' as const) : ('win' as const),
    };
    setRecord(recordResult(outcome, { mode: recordMode, level }));
  }, [level]);

  const commit = useCallback(
    (next: GameState, previous: GameState, currentMode: Mode, soundKind: SoundKind | null = 'tile') => {
      stateRef.current = next;
      setState(next);
      setSelected(null);
      setHintTile(null);
      if (currentMode === 'ai' || currentMode === 'local') {
        setHistory((items) => [...items, previous]);
      }
      if (currentMode === 'local') setRevealedSeat(null);
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.phase === 'over') {
          clearSave();
          setSaved(null);
        } else {
          setSaved(saveGame({ state: next, mode: currentMode === 'ai' ? 'ai' : 'local', level }));
        }
      }
      if (currentMode === 'lan-host') sendViews(next);
      finishRecord(next, currentMode);
      if (soundOn) {
        if (next.phase === 'over') {
          chime(
            next.result === 'draw'
              ? 'draw-game'
              : currentMode === 'local' || next.winner === 0
                ? 'win'
                : 'lose',
          );
        } else if (soundKind) {
          chime(soundKind);
        }
      }
    },
    [finishRecord, level, sendViews, soundOn],
  );

  const applyError = useCallback(
    (error: string | undefined) => {
      const key: MessageKey =
        error === 'below-minimum'
          ? 'errMinimum'
          : error === 'not-your-tile'
            ? 'errDiscard'
            : error === 'bad-claim' || error === 'not-your-claim'
              ? 'errClaim'
              : error === 'bad-kong' || error === 'no-wall'
                ? 'errKong'
                : error === 'cannot-win'
                  ? 'errWin'
                  : 'errGeneric';
      setToast(tr(key));
    },
    [tr],
  );

  const startMatch = useCallback(
    (nextMode: 'ai' | 'local', nextLevel: AiLevel = level) => {
      const next = setup({
        rng: freshRng(),
        dealer: 0,
        roundWind,
        minimumFan,
      });
      stateRef.current = next;
      setMode(nextMode);
      setLevel(nextLevel);
      setState(next);
      setHistory([]);
      setSelected(null);
      setHintTile(null);
      setAiThinking(false);
      setRevealedSeat(nextMode === 'local' ? null : 0);
      recordedRef.current = false;
      setScreen('game');
      setToast('');
      clearSave();
      setSaved(null);
    },
    [level, minimumFan, roundWind],
  );

  const startAi = useCallback(() => {
    setMode('ai');
    setScreen('setup');
  }, []);

  const resume = useCallback(() => {
    if (!saved) return;
    stateRef.current = saved.state;
    setMode(saved.mode);
    setLevel(saved.level);
    setRoundWind(saved.state.roundWind);
    setMinimumFan(saved.state.minimumFan);
    setState(saved.state);
    setHistory([]);
    setSelected(null);
    setHintTile(null);
    setAiThinking(false);
    recordedRef.current = saved.state.phase === 'over';
    setRevealedSeat(saved.mode === 'local' ? null : 0);
    setScreen('game');
    setSaved(null);
  }, [saved]);

  const undo = useCallback(() => {
    if (isLan || state.phase === 'over' || history.length === 0) return;
    let index = history.length - 1;
    let target: GameState | null = null;
    if (mode === 'ai') {
      while (index >= 0) {
        const item = history[index];
        const humanTurn = item.phase === 'discard' && item.turn === 0;
        const humanClaim = item.phase === 'claim' && item.claim?.pending[0] === 0;
        if (humanTurn || humanClaim) {
          target = item;
          break;
        }
        index -= 1;
      }
    } else {
      target = history[index];
    }
    if (!target) return;
    stateRef.current = target;
    setState(target);
    setHistory(history.slice(0, index));
    setSelected(null);
    setHintTile(null);
    setAiThinking(false);
    recordedRef.current = false;
    setRevealedSeat(mode === 'local' ? null : 0);
    if (target.phase !== 'over') {
      setSaved(saveGame({ state: target, mode: mode === 'ai' ? 'ai' : 'local', level }));
    }
  }, [history, isLan, level, mode, state.phase]);

  const hintText = useCallback(
    (advice: Hint) => {
      const tile = advice.tile ? tileFromKey(advice.tile) : null;
      const tileLabel = tile ? tileName(lang, tile) : '';
      switch (advice.kind) {
        case 'win':
          return tr('hintWin', { n: advice.fan ?? 0 });
        case 'claimWin':
          return tr('hintClaimWin', { n: advice.fan ?? 0 });
        case 'claimKong':
          return tr('hintClaimKong', { tile: tileLabel });
        case 'claimPeng':
          return tr('hintClaimPeng', { tile: tileLabel });
        case 'claimChi':
          return tr('hintClaimChi', { tile: tileLabel });
        case 'pass':
          return tr('hintPass');
        case 'kong':
          return tr('hintKong', { tile: tileLabel });
        case 'concealedKong':
          return tr('hintConcealedKong', { tile: tileLabel });
        case 'addedKong':
          return tr('hintAddedKong', { tile: tileLabel });
        case 'safety':
          return tr('hintSafety', {
            tile: tileLabel,
            shanten: advice.shanten ?? 0,
          });
        default:
          return tr('hintDiscard', {
            tile: tileLabel,
            shanten: advice.shanten ?? 0,
            ukeire: advice.ukeire ?? 0,
          });
      }
    },
    [lang, tr],
  );

  const showHint = useCallback(() => {
    if (screen !== 'game' || isLan || state.phase === 'over') return;
    if (mode === 'local' && revealedSeat !== activeSeat(state)) return;
    if (mode === 'ai' && activeSeat(state) !== 0) return;
    const seat = (mode === 'local' ? activeSeat(state) : 0) as Seat;
    const advice = getHint(state, seat);
    if (!advice) {
      setToast(tr('hintUnavailable'));
      return;
    }
    setHintTile(advice.tile ?? null);
    if (advice.action.type === 'discard') setSelected(advice.action.tile);
    setToast(hintText(advice));
  }, [hintText, isLan, mode, revealedSeat, screen, state, tr]);

  const closeLan = useCallback(() => {
    lanActiveRef.current = false;
    autoJoinRef.current = true;
    hostStartedRef.current = false;
    guestJoinSeqRef.current += 1;
    hostCreateSeqRef.current += 1;
    const host = hostRef.current;
    hostRef.current = null;
    if (host) {
      try {
        host.sendResult({ kind: 'closed' });
      } catch {
        /* socket may be gone */
      }
      host.close();
    }
    setLanHost(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanCode('');
    setLanInvite('');
    setLanQr('');
    setLanError('');
    setLanBusy(false);
    setHumanSeats([0]);
    humanSeatsRef.current = [0];
    const activeGuest = guest;
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    setGuestConnecting(false);
    setGuestPlayers([]);
    activeGuest?.close();
  }, [guest]);

  const goHome = useCallback(() => {
    closeLan();
    setMode('ai');
    setAiThinking(false);
    setSelected(null);
    setHintTile(null);
    setScreen('home');
    setLanRole('hub');
  }, [closeLan]);

  const openLanHub = useCallback(() => {
    closeLan();
    setLanRole('hub');
    setMode('ai');
    setScreen('lan');
  }, [closeLan]);

  const openLanHost = useCallback(async () => {
    if (lanBusy) return;
    closeLan();
    const seq = ++hostCreateSeqRef.current;
    setLanRole('host');
    setMode('lan-host');
    setScreen('lan');
    setLanBusy(true);
    setLanError('');
    try {
      const info = await startLanServer();
      if (seq !== hostCreateSeqRef.current) return;
      setLanInfo(info);
      const code = newRoomCode();
      const name = hostName.trim() || (lang === 'zh' ? '主机' : 'Host');
      const created = await LanHost.create({
        wsUrl: hostWsUrl(info),
        room: code,
        code,
        name,
        maxPlayers: 4,
      });
      if (seq !== hostCreateSeqRef.current) {
        created.close();
        return;
      }
      hostRef.current = created;
      setLanHost(created);
      setLanCode(code);
      created.onChange((players) => {
        if (hostRef.current !== created) return;
        setLanPlayers(players);
        created.sendLobby();
        if (hostStartedRef.current) {
          const connected = players
            .filter((player) => player.connected && !player.host)
            .map((player) => player.seat);
          const humans = [0, ...connected];
          humanSeatsRef.current = humans;
          setHumanSeats(humans);
          for (const seat of connected) {
            created.sendView(seat, view(stateRef.current, seat));
          }
        }
      });
      created.onIntent((seat, payload) => {
        if (hostRef.current !== created) return;
        if (!humanSeatsRef.current.includes(seat)) return;
        const intent = payload as GameAction;
        if (!intent || typeof intent.type !== 'string') return;
        const current = stateRef.current;
        const result = applyAction(current, seat, intent);
        if (result.ok) commit(result.state, current, 'lan-host');
        else created.sendView(seat, view(current, seat));
      });
      created.onClose(() => {
        if (hostRef.current !== created) return;
        hostRef.current = null;
        hostStartedRef.current = false;
        setLanHost(null);
        setLanPlayers([]);
        setLanError(tr('lanHostLost'));
      });
      const url = inviteUrl(info, code, code, lang === 'zh' ? '访客' : 'Guest');
      const qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        color: { dark: '#123127', light: '#fff8e8' },
      });
      if (seq !== hostCreateSeqRef.current) {
        created.close();
        return;
      }
      setLanInvite(url);
      setLanQr(qr);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const lower = message.toLowerCase();
      setLanError(
        lower.includes('wrong-code')
          ? tr('lanWrong')
          : lower.includes('room-full')
            ? tr('lanFull')
            : lower.includes('closed')
              ? tr('lanClosed')
              : tr('lanDisconnected'),
      );
      hostRef.current?.close();
      hostRef.current = null;
      setLanHost(null);
      setLanPlayers([]);
    } finally {
      if (seq === hostCreateSeqRef.current) setLanBusy(false);
    }
  }, [closeLan, commit, hostName, lang, lanBusy, tr]);

  const startLanMatch = useCallback(() => {
    const host = hostRef.current;
    if (!host || host.status !== 'open') return;
    const connected = lanPlayers
      .filter((player) => player.connected && !player.host)
      .map((player) => player.seat);
    if (connected.length === 0) return;
    const humans = [0, ...connected];
    humanSeatsRef.current = humans;
    setHumanSeats(humans);
    const next = setup({
      rng: freshRng(),
      dealer: 0,
      roundWind,
      minimumFan,
    });
    stateRef.current = next;
    recordedRef.current = false;
    setState(next);
    setHistory([]);
    setSelected(null);
    setHintTile(null);
    setAiThinking(false);
    setRevealedSeat(null);
    setLanError('');
    setMode('lan-host');
    setScreen('game');
    hostStartedRef.current = true;
    host.start({ roundWind, minimumFan });
    host.sendLobby();
    for (const seat of humans) {
      if (seat !== 0) host.sendView(seat, view(next, seat));
    }
  }, [lanPlayers, minimumFan, roundWind]);

  const joinGuestWith = useCallback(async (room: string, code: string, name: string) => {
    const cleanRoom = room.trim();
    const cleanCode = code.trim();
    const cleanName = name.trim();
    if (!cleanRoom || !cleanName) return;
    const seq = ++guestJoinSeqRef.current;
    setGuestConnecting(true);
    setLanError('');
    setMode('lan-guest');
    setLanRole('guest');
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room: cleanRoom,
        code: cleanCode || cleanRoom,
        name: cleanName,
      });
      if (seq !== guestJoinSeqRef.current) {
        joined.close();
        return;
      }
      autoJoinRef.current = true;
      lanActiveRef.current = true;
      setGuest(joined);
      setGuestRoom(cleanRoom);
      setGuestCode(cleanCode || cleanRoom);
      setGuestName(cleanName);
      setGuestView(null);
      setGuestStarted(false);
      setGuestPlayers([]);
      joined.onView((payload) => {
        if (!lanActiveRef.current) return;
        if (!isSeatView(payload)) return;
        setGuestView(payload);
        setGuestStarted(true);
        setMode('lan-guest');
        setScreen('game');
      });
      joined.onStart((players) => {
        if (!lanActiveRef.current) return;
        if (Array.isArray(players)) setGuestPlayers(players);
        setGuestStarted(true);
      });
      joined.onPlayers((players) => {
        if (!lanActiveRef.current) return;
        setGuestPlayers(players);
      });
      joined.onResult((payload) => {
        if (!lanActiveRef.current) return;
        const value = payload as { kind?: string } | null;
        if (!value || value.kind !== 'closed') return;
        lanActiveRef.current = false;
        autoJoinRef.current = true;
        setGuest(null);
        setGuestView(null);
        setGuestStarted(false);
        setGuestPlayers([]);
        setLanError(tr('lanClosed'));
        setLanRole('guest');
        setScreen('lan');
        joined.close();
      });
      joined.onError((reason) => {
        if (!lanActiveRef.current) return;
        const lower = reason.toLowerCase();
        setLanError(
          lower.includes('wrong-code')
            ? tr('lanWrong')
            : lower.includes('room-full')
              ? tr('lanFull')
              : tr('lanDisconnected'),
        );
      });
      setScreen('lan');
    } catch (error) {
      if (seq !== guestJoinSeqRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      const lower = message.toLowerCase();
      setLanError(
        lower.includes('wrong-code')
          ? tr('lanWrong')
          : lower.includes('room-full')
            ? tr('lanFull')
            : tr('lanDisconnected'),
      );
      lanActiveRef.current = false;
    } finally {
      if (seq === guestJoinSeqRef.current) setGuestConnecting(false);
    }
  }, [tr]);

  const joinGuest = useCallback(() => {
    if (guestConnecting || guest) return;
    const code = guestCode.trim();
    if (!code || !guestName.trim()) return;
    void joinGuestWith(code, code, guestName);
  }, [guest, guestCode, guestConnecting, guestName, joinGuestWith]);

  const copyInvite = useCallback(async () => {
    if (!lanInvite) return;
    try {
      await navigator.clipboard.writeText(lanInvite);
      setToast(tr('lanCopied'));
    } catch {
      setToast(tr('lanCopyFallback'));
    }
  }, [lanInvite, tr]);

  const resetRecord = useCallback(() => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setRecord(clearStoredRecord());
    setClearArmed(false);
    setToast(tr('recordCleared'));
  }, [clearArmed, tr]);

  const performAction = useCallback(
    (action: GameAction) => {
      const current = stateRef.current;
      const active = activeSeat(current);
      if (active < 0) return;
      if (mode === 'lan-guest') {
        guest?.sendIntent(action);
        return;
      }
      if (mode === 'local' && revealedSeat !== active) return;
      if (mode === 'ai' && active !== 0) return;
      if (mode === 'lan-host' && active !== 0) return;
      const result = applyAction(current, active, action);
      if (!result.ok) {
        applyError(result.error);
        return;
      }
      commit(result.state, current, mode, action.type === 'discard' ? 'tile' : 'claim');
    },
    [applyError, commit, guest, mode, revealedSeat],
  );

  const discardSelected = useCallback(() => {
    if (!selected) {
      setToast(tr('selectTile'));
      return;
    }
    performAction({ type: 'discard', tile: selected });
  }, [performAction, selected, tr]);

  const selectTile = useCallback((key: string) => {
    setSelected(key);
    setHintTile(null);
  }, []);

  const reveal = useCallback(() => {
    setRevealedSeat(activeSeat(state));
  }, [state]);

  const restartMatch = useCallback(() => {
    if (isGuest) return;
    if (mode === 'lan-host') {
      startLanMatch();
      return;
    }
    startMatch(mode === 'local' ? 'local' : 'ai');
  }, [isGuest, mode, startLanMatch, startMatch]);

  const changeSettings = useCallback(() => {
    closeLan();
    setMode('ai');
    setScreen('setup');
  }, [closeLan]);

  useEffect(() => {
    if (screen !== 'game' || isGuest || state.phase === 'over') return;
    const active = activeSeat(state);
    if (active < 0) return;
    const human =
      mode === 'local' ||
      (mode === 'ai' && active === 0) ||
      (mode === 'lan-host' && humanSeats.includes(active));
    if (human) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.phase === 'over') {
        setAiThinking(false);
        return;
      }
      const seatTurn = activeSeat(current);
      if (seatTurn < 0) {
        setAiThinking(false);
        return;
      }
      const action = chooseAction(current, seatTurn as Seat, level);
      const result = applyAction(current, seatTurn as Seat, action);
      setAiThinking(false);
      if (result.ok) {
        commit(result.state, current, mode);
      } else if (current.phase === 'claim') {
        const passed = applyAction(current, seatTurn as Seat, { type: 'claim', action: 'pass' });
        if (passed.ok) commit(passed.state, current, mode);
      }
    }, 420);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, humanSeats, isGuest, level, mode, screen, state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        Boolean(target?.isContentEditable);
      if (event.key === 'Escape') {
        if (typing) return;
        event.preventDefault();
        goHome();
        return;
      }
      if (screen !== 'game' || typing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'u' || event.key === 'U') {
        event.preventDefault();
        undo();
        return;
      }
      if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        showHint();
        return;
      }
      const activeView = guestView ?? view(state, mode === 'local' ? activeSeat(state) : 0);
      const hand = activeView.hand;
      if (event.key === 'Enter') {
        if (activeView.canDiscard && selected) {
          event.preventDefault();
          discardSelected();
        }
        return;
      }
      if (event.key === 'w' || event.key === 'W') {
        if (activeView.canWinSelf) {
          event.preventDefault();
          performAction({ type: 'win-self' });
        }
        return;
      }
      if (!/^\d$/.test(event.key)) return;
      if (mode === 'local' && revealedSeat !== activeSeat(state)) return;
      if (!activeView.canDiscard) return;
      const index = event.key === '0' ? 9 : Number(event.key) - 1;
      const tile = hand[index];
      if (!tile) return;
      event.preventDefault();
      selectTile(tileKey(tile));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [discardSelected, goHome, guestView, mode, performAction, revealedSeat, screen, selectTile, selected, showHint, state, undo]);

  useEffect(() => {
    if (!INVITE || autoJoinRef.current) return;
    autoJoinRef.current = true;
    setScreen('lan');
    setLanRole('guest');
    setMode('lan-guest');
    setGuestName(INVITE.name || '');
    setGuestCode(INVITE.code || INVITE.room);
    setGuestRoom(INVITE.room);
    void joinGuestWith(INVITE.room, INVITE.code || INVITE.room, INVITE.name || (lang === 'zh' ? '访客' : 'Guest'));
  }, [INVITE, joinGuestWith, lang]);

  useEffect(() => {
    if (!guest) return;
    const timer = window.setInterval(() => {
      if (!lanActiveRef.current) return;
      if (guest.status === 'closed') {
        lanActiveRef.current = false;
        autoJoinRef.current = true;
        setGuest(null);
        setGuestView(null);
        setGuestStarted(false);
        setGuestPlayers([]);
        setLanError(tr('lanClosed'));
        setLanRole('guest');
        setScreen('lan');
      }
    }, 900);
    return () => window.clearInterval(timer);
  }, [guest, tr]);

  useEffect(() => {
    if (!guestView) {
      guestSoundRef.current = null;
      return;
    }
    const totalDiscards = guestView.discards.length;
    const claimKey = guestView.claim
      ? `${guestView.claim.from}:${tileKey(guestView.claim.tile)}:${guestView.claim.pending.join(',')}`
      : '';
    const previous = guestSoundRef.current;
    guestSoundRef.current = {
      phase: guestView.phase,
      discards: totalDiscards,
      claim: claimKey,
      winner: guestView.winner,
    };
    if (!previous || !soundOn || !lanActiveRef.current) return;
    if (guestView.phase === 'over' && previous.phase !== 'over') {
      chime(
        guestView.winner === guestView.seat
          ? 'win'
          : guestView.winner === null
            ? 'draw-game'
            : 'lose',
      );
    } else if (claimKey && claimKey !== previous.claim) {
      chime('claim');
    } else if (totalDiscards > previous.discards) {
      chime('tile');
    }
  }, [guestView, soundOn]);

  useEffect(() => {
    const onUnload = () => {
      try {
        hostRef.current?.sendResult({ kind: 'closed' });
      } catch {
        /* tab is closing */
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  const seatName = useCallback(
    (seat: number): string => {
      if (mode === 'local') return seatPositionName(lang, seat);
      if (mode === 'ai') {
        if (seat === 0) return tr('you');
        return tr('aiSeat', { n: seat });
      }
      const players = mode === 'lan-guest' ? guestPlayers : lanPlayers;
      const found =
        players.find((player) => player.seat === seat && player.connected) ??
        players.find((player) => player.seat === seat);
      if (found?.name?.trim()) return found.name.trim();
      if (seat === 0) return hostName.trim() || tr('you');
      if (mode === 'lan-guest' && guest?.seat === seat) {
        return guestName.trim() || seatPositionName(lang, seat);
      }
      return tr('lanSeat', { n: seat + 1 });
    },
    [guest?.seat, guestName, guestPlayers, hostName, lang, lanPlayers, mode, tr],
  );

  const recordWinner = useCallback(
    (entry: RecordEntry): string => {
      if (entry.result === 'draw' || entry.winner === null) return tr('drawTitle');
      if (entry.mode === 'ai') {
        return entry.winner === 0 ? tr('you') : tr('aiSeat', { n: entry.winner });
      }
      return seatPositionName(lang, entry.winner);
    },
    [lang, tr],
  );

  const localSeat = mode === 'local' ? activeSeat(state) : 0;
  const localView = useMemo(
    () => view(state, Math.max(0, localSeat)),
    [localSeat, state],
  );
  const shownView: SeatView = guestView ?? localView;
  const shownTurn = shownView.turn;
  const currentName = shownTurn >= 0 ? seatName(shownTurn) : '';
  const privacyCover =
    mode === 'local' &&
    screen === 'game' &&
    state.phase !== 'over' &&
    revealedSeat !== shownView.seat;
  const canDiscard = shownView.canDiscard && !privacyCover;
  const canWinSelf = shownView.canWinSelf && !privacyCover;
  const claimMine = Boolean(shownView.claim?.isMyDecision) && !privacyCover;
  const selectedTile = selected && shownView.hand.find((tile) => tileKey(tile) === selected);
  const ownMelds = shownView.melds[shownView.seat] ?? [];
  const showResult = screen === 'game' && shownView.phase === 'over';
  const winInfo: WinInfo | null = shownView.winInfo;
  const winnerName = shownView.winner !== null ? seatName(shownView.winner) : '';

  const connectedSeats = new Set(
    (mode === 'lan-guest' ? guestPlayers : lanPlayers)
      .filter((player) => player.connected)
      .map((player) => player.seat),
  );
  if (mode === 'lan-guest' && guest?.seat !== undefined && guest.seat >= 0) {
    connectedSeats.add(guest.seat);
  }

  const isAISeat = (seat: number): boolean => {
    if (mode === 'local') return false;
    if (mode === 'ai') return seat !== 0;
    if (mode === 'lan-host') return !humanSeats.includes(seat);
    return seat !== shownView.seat && !connectedSeats.has(seat);
  };

  const isYouSeat = (seat: number): boolean => {
    if (mode === 'local') return false;
    if (mode === 'ai' || mode === 'lan-host') return seat === 0;
    return seat === shownView.seat;
  };

  const tableSeats = POSITION_SEAT.map((seat) => ({
    seat,
    name:
      mode !== 'local' && isAISeat(seat)
        ? lang === 'zh'
          ? `电脑${seat}`
          : `C${seat}`
        : seatName(seat),
    wind: windOf(seat, shownView.dealer),
    dealer: shownView.dealer === seat,
    active: shownTurn === seat,
    handCount: seat === shownView.seat ? 0 : shownView.handCounts[seat] ?? 0,
    melds: shownView.melds[seat] ?? [],
    isAI: isAISeat(seat),
    isYou: isYouSeat(seat),
  }));

  const modeLabel =
    mode === 'ai'
      ? t(lang, level)
      : mode === 'local'
        ? tr('playLocal')
        : mode === 'lan-host'
          ? tr('lanHostTag')
          : tr('lanGuestTag');

  const logText = useCallback(
    (entry: LogEntry) => {
      const name = seatName(entry.seat);
      const tName = entry.tile ? tileName(lang, entry.tile) : '';
      switch (entry.kind) {
        case 'discard':
          return tr('logDiscard', { name, tile: tName });
        case 'chi':
          return tr('logChi', { name, tile: tName });
        case 'peng':
          return tr('logPeng', { name, tile: tName });
        case 'kong':
          return tr('logKong', { name, tile: tName });
        case 'concealed-kong':
          return tr('logConcealedKong', { name });
        case 'added-kong':
          return tr('logAddedKong', { name });
        case 'win':
          return tr('logWin', { name, tile: tName });
        case 'draw-game':
          return tr('logDrawGame');
        default:
          return tr('logDeal');
      }
    },
    [lang, seatName, tr],
  );

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('eyebrow')}</p>
          <h1>{tr('title')}</h1>
        </div>
        <div className="mast-actions">
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} data-testid="language">
            {tr('language')}
          </button>
          <button className="ghost" onClick={() => setSoundOn((value) => !value)} data-testid="sound">
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
          <button className="ghost" onClick={() => setMotionOn((value) => !value)} data-testid="motion">
            {motionOn ? tr('motionOn') : tr('motionOff')}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-table" aria-hidden="true">
          <div className="hero-rim">
            <span className="hero-stamp">中</span>
            <div className="hero-tiles">
              {['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'p5', 'p5', 'p5', 'z5', 'z5'].map(
                (key, index) => {
                  const tile = tileFromKey(key);
                  return tile ? (
                    <span className="hero-tile" style={{ '--i': index } as CSSProperties} key={`${key}-${index}`}>
                      <TileFace lang={lang} tile={tile} />
                    </span>
                  ) : null;
                },
              )}
            </div>
            <span className="hero-tagline">{tr('tagline')}</span>
          </div>
        </div>
        <div className="hero-copy">
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume} data-testid="save-continue">
                <span>{tr('continueGame')}</span>
                <small>
                  {saved.mode === 'ai' ? t(lang, saved.level) : tr('playLocal')} · {tr('savedOn')}
                </small>
              </button>
            )}
            <button
              className={saved ? 'secondary wide' : 'primary wide'}
              onClick={startAi}
              data-testid="start-ai"
            >
              <span>{tr('playSolo')}</span>
              <small>{tr('soloNote')}</small>
            </button>
            <button
              className="secondary wide"
              onClick={() => startMatch('local')}
              data-testid="start-local"
            >
              <span>{tr('playLocal')}</span>
              <small>{tr('localNote')}</small>
            </button>
            <button className="secondary wide" onClick={openLanHub} data-testid="start-lan">
              <span>{tr('playLan')}</span>
              <small>{tr('lanNote')}</small>
            </button>
            <div className="menu-links">
              <button className="text-button" onClick={() => setScreen('rules')} data-testid="rules">
                {tr('rules')} →
              </button>
              <button className="text-button" onClick={() => setScreen('record')} data-testid="stats">
                {tr('record')} →
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('games')}</span>
            <strong data-testid="home-games">{record.games}</strong>
            <span className="dot">·</span>
            <span>{tr('wins')}</span>
            <strong>{record.wins.reduce((sum, value) => sum + value, 0)}</strong>
            <span className="dot">·</span>
            <span>{tr('draws')}</span>
            <strong>{record.draws}</strong>
            <span className="dot">·</span>
            <span>{tr('highestFan')}</span>
            <strong>{record.highestFan}</strong>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell setup-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('setupTitle')}</h2>
      <div className="setup-section">
        <span className="field-label">{tr('difficulty')}</span>
        <div className="level-grid">
          {AI_LEVELS_UI.map((item) => (
            <button
              key={item.id}
              className={`level-card ${level === item.id ? 'selected' : ''}`}
              onClick={() => setLevel(item.id)}
              data-testid={`level-${item.id}`}
            >
              <span className={`level-dot ${item.id}`} />
              <strong>{tr(item.label)}</strong>
              <small>{tr(item.note)}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="setup-row">
        <div className="setup-section">
          <span className="field-label">{tr('roundWind')}</span>
          <div className="choice-row">
            {[1, 2, 3, 4].map((wind) => (
              <button
                key={wind}
                className={`choice ${roundWind === wind ? 'selected' : ''}`}
                onClick={() => setRoundWind(wind)}
              >
                {windName(lang, wind)}
              </button>
            ))}
          </div>
        </div>
        <div className="setup-section">
          <span className="field-label">{tr('minimumFan')}</span>
          <div className="choice-row">
            {[1, 2, 3].map((fan) => (
              <button
                key={fan}
                className={`choice ${minimumFan === fan ? 'selected' : ''}`}
                onClick={() => setMinimumFan(fan)}
              >
                {tr(fan === 1 ? 'fanOne' : fan === 2 ? 'fanTwo' : 'fanThree')}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="row-actions">
        <button className="primary" onClick={() => startMatch('ai')} data-testid="begin">
          {tr('begin')}
        </button>
        <button className="ghost" onClick={() => setScreen('home')}>
          {tr('back')}
        </button>
      </div>
    </main>
  );

  const gameScreen = (
    <main
      className="shell game-shell"
      data-phase={shownView.phase}
      data-turn={shownTurn}
      data-seat={shownView.seat}
    >
      <header className="game-top">
        <button className="back" onClick={goHome}>
          ← {tr('home')}
        </button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>{modeLabel}</span>
        </div>
        <div className="game-actions">
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} data-testid="language">
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
            <div>
              <span className="eyebrow">
                {tr('roundWind')} {windName(lang, shownView.roundWind)} · {tr('wall')} {shownView.wallCount}
              </span>
              <h2 className="turn-title">
                {privacyCover
                  ? tr('handHidden')
                  : shownView.phase === 'over'
                    ? shownView.result === 'draw'
                      ? tr('drawTitle')
                      : shownView.winner === shownView.seat && mode !== 'local'
                        ? tr('winTitleYou')
                        : tr('winTitle', { name: winnerName })
                    : shownView.phase === 'claim'
                      ? claimMine
                        ? tr('actionPending')
                        : tr('claimWaiting', { name: currentName })
                      : canDiscard
                        ? tr('yourTurn')
                        : shownTurn >= 0
                          ? tr('turnOf', { name: currentName })
                          : tr('wallEmpty')}
              </h2>
            </div>
            {aiThinking ? <span className="thinking">{tr('aiThinking')}…</span> : null}
          </div>

          <div className="mahjong-table">
            <SeatPanel
              lang={lang}
              {...tableSeats[2]}
              compact
            />
            <SeatPanel lang={lang} {...tableSeats[3]} compact />
            <div className="table-center">
              <div className="center-meta">
                <span>
                  {tr('dealer')}: {seatName(shownView.dealer)}
                </span>
                <span>
                  {tr('seatWind')}: {windName(lang, windOf(shownView.seat, shownView.dealer))}
                </span>
                <span>{tr('minimumFanValue', { n: shownView.minimumFan })}</span>
              </div>
              <River
                lang={lang}
                discards={shownView.discards}
                last={shownView.lastDiscard}
                compact={false}
              />
              <div className="last-line">
                <span>{tr('lastAction')}</span>
                <strong>
                  {shownView.log.length > 0
                    ? logText(shownView.log[shownView.log.length - 1])
                    : tr('waitingTable')}
                </strong>
              </div>
            </div>
            <SeatPanel lang={lang} {...tableSeats[1]} compact />
            <SeatPanel lang={lang} {...tableSeats[0]} compact />
          </div>

          <div className="my-zone" data-testid="my-zone">
            {privacyCover ? (
              <div className="privacy-curtain" data-testid="privacy-cover">
                <span className="privacy-lock" aria-hidden="true">
                  ◇
                </span>
                <span className="eyebrow">{tr('handHidden')}</span>
                <h3>{tr('passTo', { name: seatName(shownView.seat) })}</h3>
                <button className="primary" onClick={reveal} data-testid="reveal">
                  {tr('revealHand')}
                </button>
              </div>
            ) : (
              <>
                <div className="my-head">
                  <div>
                    <span className="eyebrow">{tr('you')} · {windName(lang, windOf(shownView.seat, shownView.dealer))}</span>
                    <strong>{seatName(shownView.seat)}</strong>
                  </div>
                  {ownMelds.length > 0 ? (
                    <div className="melds">
                      <span className="field-label">{tr('melds')}</span>
                      <div className="meld-row">
                        {ownMelds.map((meld, index) => (
                          <MeldGroup key={index} lang={lang} meld={meld} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {shownView.claim?.isMyDecision && shownView.claim.option ? (
                  <div className="claim-panel" data-testid="claim-panel">
                    <div className="claim-head">
                      <span className="eyebrow">
                        {shownView.claim.robbing ? tr('claimRobbing') : tr('claimTitle')}
                      </span>
                      <strong>
                        {tr('claimFrom', {
                          name: seatName(shownView.claim.from),
                          tile: tileName(lang, shownView.claim.tile),
                        })}
                      </strong>
                      {shownView.claim.lastTile ? <small>{tr('claimLastTile')}</small> : null}
                    </div>
                    <div className="claim-actions">
                      {shownView.claim.option.win ? (
                        <button
                          className="primary claim-win"
                          data-testid="claim-win"
                          onClick={() => performAction({ type: 'claim', action: 'win' })}
                        >
                          {tr('claimWin', { n: shownView.claim.option.winFan })}
                        </button>
                      ) : null}
                      {shownView.claim.option.kong ? (
                        <button
                          className="secondary"
                          data-testid="claim-kong"
                          onClick={() => performAction({ type: 'claim', action: 'kong' })}
                        >
                          {tr('claimKong')}
                        </button>
                      ) : null}
                      {shownView.claim.option.peng ? (
                        <button
                          className="secondary"
                          data-testid="claim-peng"
                          onClick={() => performAction({ type: 'claim', action: 'peng' })}
                        >
                          {tr('claimPeng')}
                        </button>
                      ) : null}
                      {shownView.claim.option.chi.map((pair, index) => (
                        <button
                          key={index}
                          className="secondary chi-button"
                          data-testid={`claim-chi-${index}`}
                          onClick={() =>
                            performAction({
                              type: 'claim',
                              action: 'chi',
                              pair: [tileKey(pair[0]), tileKey(pair[1])],
                            })
                          }
                        >
                          {tr('claimChi')} {tileName(lang, pair[0])} {tileName(lang, pair[1])}
                        </button>
                      ))}
                      <button
                        className="ghost claim-pass"
                        data-testid="claim-pass"
                        onClick={() => performAction({ type: 'claim', action: 'pass' })}
                      >
                        {tr('claimPass')}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="hand-area">
                  <div
                    className="hand"
                    data-testid="hand"
                    data-count={shownView.hand.length}
                    aria-label={tr('handLabel')}
                  >
                    {shownView.hand.map((tile, index) => (
                      <HandTile
                        key={`${tileKey(tile)}-${index}`}
                        lang={lang}
                        tile={tile}
                        index={index}
                        selected={selected === tileKey(tile)}
                        hint={hintTile === tileKey(tile)}
                        disabled={!canDiscard}
                        onSelect={() => selectTile(tileKey(tile))}
                      />
                    ))}
                  </div>
                </div>

                <div className="action-bar">
                  <div className="action-info">
                    {selectedTile ? (
                      <span>{tr('selectedTile', { tile: tileName(lang, selectedTile) })}</span>
                    ) : (
                      <span>{canDiscard ? tr('selectTile') : shownView.phase === 'claim' ? tr('claimTitle') : tr('waitingTable')}</span>
                    )}
                  </div>
                  <div className="action-buttons">
                    {canWinSelf ? (
                      <button
                        className="primary"
                        onClick={() => performAction({ type: 'win-self' })}
                        data-testid="win-self"
                      >
                        {tr('winSelf')}
                      </button>
                    ) : null}
                    {shownView.concealedKongs.map((key) => {
                      const tile = tileFromKey(key);
                      return tile ? (
                        <button
                          key={`ck-${key}`}
                          className="secondary small-action"
                          onClick={() => performAction({ type: 'concealed-kong', tile: key })}
                          data-testid={`concealed-kong-${key}`}
                        >
                          {tr('concealedKong')} {tileName(lang, tile)}
                        </button>
                      ) : null;
                    })}
                    {shownView.addedKongs.map((key) => {
                      const tile = tileFromKey(key);
                      return tile ? (
                        <button
                          key={`ak-${key}`}
                          className="secondary small-action"
                          onClick={() => performAction({ type: 'added-kong', tile: key })}
                          data-testid={`added-kong-${key}`}
                        >
                          {tr('addedKong')} {tileName(lang, tile)}
                        </button>
                      ) : null;
                    })}
                    <button
                      className="primary discard-button"
                      onClick={discardSelected}
                      disabled={!canDiscard || !selected}
                      data-testid="discard"
                    >
                      {tr('discard')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <aside className="side">
          <div className="side-card">
            <h3>{tr('hint')}</h3>
            <div className="side-actions">
              <button
                className="secondary"
                onClick={showHint}
                disabled={isLan || shownView.phase === 'over'}
                data-testid="hint"
              >
                {tr('hint')}
              </button>
              <button
                className="secondary"
                onClick={undo}
                disabled={isLan || history.length === 0 || shownView.phase === 'over'}
                data-testid="undo"
              >
                {tr('undo')}
              </button>
            </div>
            <p className="keyboard-note">{tr('keyboardHint')}</p>
          </div>

          {mode === 'lan-host' ? (
            <div className="side-card lan-mini">
              <h3>{tr('lanCodeLabel')}</h3>
              <div className="room-code">{lanCode}</div>
              <p>{lanPlayers.filter((player) => player.connected && !player.host).length > 0 ? tr('lanReady') : tr('lanWaiting')}</p>
            </div>
          ) : null}

          <div className="side-card log-card">
            <h3>{tr('lastAction')}</h3>
            <ol className="action-log">
              {shownView.log.slice(-5).reverse().map((entry, index) => (
                <li key={`${entry.kind}-${index}`}>{logText(entry)}</li>
              ))}
            </ol>
          </div>

          <div className="side-card record-mini">
            <h3>{tr('record')}</h3>
            <p>
              {record.games} {tr('games')} · {tr('highestFan')} {record.highestFan}
            </p>
            <button className="text-button" onClick={resetRecord}>
              {clearArmed ? tr('clearArmed') : tr('clearRecord')}
            </button>
          </div>
        </aside>
      </div>

      {showResult ? (
        <div className="result-backdrop" data-testid="result-sheet">
          <section className="result-card">
            <span className="eyebrow">{winInfo ? tr('resultFan') : tr('drawTitle')}</span>
            <h2>{winInfo ? (mode !== 'local' && shownView.winner === shownView.seat ? tr('winTitleYou') : tr('winTitle', { name: winnerName })) : tr('drawTitle')}</h2>
            {winInfo ? (
              <>
                <div className="result-subline">
                  <span>
                    {winInfo.method === 'self-draw'
                      ? tr('winBySelf')
                      : winInfo.method === 'robbing-kong'
                        ? tr('winByRobbing')
                        : tr('winByDiscard')}
                  </span>
                  <span>·</span>
                  <strong>{tr('fanTotal', { n: winInfo.totalFan })}</strong>
                  <span>·</span>
                  <span>
                    {tr(
                      winInfo.pattern === 'standard'
                        ? 'patternStandard'
                        : winInfo.pattern === 'seven-pairs'
                          ? 'patternSevenPairs'
                          : 'patternThirteenOrphans',
                    )}
                  </span>
                </div>
                <div className="fan-grid">
                  {winInfo.fan.map((item, index) => (
                    <div className="fan-row" key={`${item.key}-${index}`}>
                      <span>{tr(FAN_LABEL[item.key])}{item.count > 1 ? ` ×${item.count}` : ''}</span>
                      <strong>{item.fan * item.count}</strong>
                    </div>
                  ))}
                </div>
                <div className="settlement">
                  <span className="field-label">{tr('settlement')}</span>
                  {[0, 1, 2, 3].map((seat) => (
                    <div
                      key={seat}
                      className={`settle-row ${winInfo.seat === seat ? 'winner' : ''}`}
                    >
                      <span>{seatName(seat)}</span>
                      <strong>{winInfo.settlement[seat] > 0 ? '+' : ''}{winInfo.settlement[seat]}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="result-copy">{tr('wallEmpty')}</p>
            )}
            <div className="result-actions">
              {!isGuest ? (
                <>
                  <button className="primary" onClick={restartMatch} data-testid="play-again">
                    {tr('playAgain')}
                  </button>
                  <button className="secondary" onClick={changeSettings} data-testid="change-level">
                    {tr('changeLevel')}
                  </button>
                </>
              ) : (
                <span className="muted">{tr('lanGuestWaiting')}</span>
              )}
              <button className="ghost" onClick={goHome}>
                {tr('home')}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {toast && <div className="toast" data-testid="toast">{toast}</div>}
    </main>
  );

  const recordScreen = (
    <main className="shell narrow-shell record-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('recordTitle')}</h2>
      <div className="record-grid">
        <div className="record-stat">
          <span>{tr('games')}</span>
          <strong data-testid="record-games">{record.games}</strong>
        </div>
        <div className="record-stat">
          <span>{tr('draws')}</span>
          <strong>{record.draws}</strong>
        </div>
        <div className="record-stat">
          <span>{tr('highestFan')}</span>
          <strong data-testid="record-highest">{record.highestFan}</strong>
        </div>
      </div>
      <div className="record-grid mode-grid">
        {(['ai', 'local', 'lan'] as RecordMode[]).map((value) => (
          <div className="record-stat small" key={value}>
            <span>{value === 'ai' ? tr('modeSolo') : value === 'local' ? tr('modeLocal') : tr('modeLan')}</span>
            <strong>{record.byMode[value]}</strong>
          </div>
        ))}
      </div>
      <div className="seat-win-table">
        <span className="field-label">{tr('seatWins')}</span>
        {record.wins.map((value, seat) => (
          <div className="seat-win-row" key={seat}>
            <span>{seatPositionName(lang, seat)}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="recent-list">
        <span className="field-label">{tr('recent')}</span>
        {record.recent.length === 0 ? (
          <p className="muted">{tr('noGames')}</p>
        ) : (
          record.recent.map((entry, index) => (
            <div className="recent-row" key={`${entry.at}-${index}`}>
              <span>{formatDate(entry.at, lang)}</span>
              <span>{recordWinner(entry)}</span>
              <span>{entry.fan > 0 ? tr('fanTotal', { n: entry.fan }) : '—'}</span>
              <span>{entry.mode === 'ai' ? tr('modeSolo') : entry.mode === 'local' ? tr('modeLocal') : tr('modeLan')}</span>
            </div>
          ))
        )}
      </div>
      <button className="secondary" onClick={resetRecord}>
        {clearArmed ? tr('clearArmed') : tr('clearRecord')}
      </button>
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell rules-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      {ruleSections(lang).map((section) => (
        <section className="rule-section" key={section.title}>
          <h3>{section.title}</h3>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <button className="primary" onClick={() => setScreen('home')}>
        {tr('close')}
      </button>
    </main>
  );

  const connectedGuests = lanPlayers.filter((player) => player.connected && !player.host);
  const lanScreen = (
    <main className="shell narrow-shell lan-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('lanTitle')}</h2>

      {lanRole === 'hub' ? (
        <div className="lan-hub">
          <section className="lan-card">
            <h3>{tr('lanHost')}</h3>
            <label className="field">
              <span>{tr('lanHostName')}</span>
              <input value={hostName} onChange={(event) => setHostName(event.target.value)} maxLength={18} />
            </label>
            <button className="primary wide" onClick={openLanHost} disabled={lanBusy} data-testid="lan-create">
              {lanBusy ? tr('lanConnecting') : tr('lanCreate')}
            </button>
            <p className="muted">{tr('lanStartHint')}</p>
          </section>
          <section className="lan-card">
            <h3>{tr('lanJoin')}</h3>
            <label className="field">
              <span>{tr('lanYourName')}</span>
              <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={18} />
            </label>
            <label className="field">
              <span>{tr('lanJoinCode')}</span>
              <input
                value={guestCode}
                onChange={(event) => setGuestCode(event.target.value)}
                inputMode="numeric"
                maxLength={4}
              />
            </label>
            <button
              className="secondary wide"
              onClick={joinGuest}
              disabled={guestConnecting || !guestName.trim() || !guestCode.trim()}
              data-testid="lan-join"
            >
              {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
            </button>
          </section>
          {lanError ? <p className="error">{lanError}</p> : null}
        </div>
      ) : null}

      {lanRole === 'host' ? (
        <div className="lan-host-layout">
          <section className="lan-card">
            <span className="field-label">{tr('lanCodeLabel')}</span>
            <div className="room-code big">{lanCode}</div>
            <p>{connectedGuests.length > 0 ? tr('lanReady') : tr('lanWaiting')}</p>
            <div className="peer-list">
              {lanPlayers.map((player) => (
                <span key={player.seat} className={player.connected ? 'online' : ''}>
                  {player.seat + 1}. {player.name} {player.connected ? '●' : '○'}
                </span>
              ))}
            </div>
            <div className="lan-settings">
              <div>
                <span className="field-label">{tr('roundWind')}</span>
                <div className="choice-row">
                  {[1, 2, 3, 4].map((wind) => (
                    <button
                      key={wind}
                      className={`choice ${roundWind === wind ? 'selected' : ''}`}
                      onClick={() => setRoundWind(wind)}
                    >
                      {windName(lang, wind)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="field-label">{tr('minimumFan')}</span>
                <div className="choice-row">
                  {[1, 2, 3].map((fan) => (
                    <button
                      key={fan}
                      className={`choice ${minimumFan === fan ? 'selected' : ''}`}
                      onClick={() => setMinimumFan(fan)}
                    >
                      {tr(fan === 1 ? 'fanOne' : fan === 2 ? 'fanTwo' : 'fanThree')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              className="primary wide"
              onClick={startLanMatch}
              disabled={connectedGuests.length === 0}
              data-testid="lan-start"
            >
              {tr('lanStart')}
            </button>
            <p className="muted">{tr('lanFillAi')}</p>
            <button className="secondary wide" onClick={copyInvite} disabled={!lanInvite}>
              {tr('lanCopy')}
            </button>
            {lanError ? <p className="error">{lanError}</p> : null}
          </section>
          <section className="qr-card">
            {lanQr ? <img src={lanQr} alt={tr('lanScan')} /> : null}
            <p>{tr('lanScan')}</p>
            {lanInvite ? (
              <a className="invite-link" href={lanInvite} data-testid="invite-link">
                {readableInvite(lanInvite)}
              </a>
            ) : null}
          </section>
        </div>
      ) : null}

      {lanRole === 'guest' ? (
        <section className="lan-card guest-card">
          <h3>{tr('lanGuestTag')}</h3>
          {!guestStarted && !guest ? (
            <>
              <label className="field">
                <span>{tr('lanYourName')}</span>
                <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={18} />
              </label>
              <label className="field">
                <span>{tr('lanJoinCode')}</span>
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
                disabled={guestConnecting || !guestName.trim() || !guestCode.trim()}
                data-testid="lan-join"
              >
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
            </>
          ) : (
            <div className="waiting-card" data-testid="waiting-card">
              <strong>{tr('lanGuestWaiting')}</strong>
              {guestRoom ? <span className="muted">{guestRoom}</span> : null}
              <div className="peer-list">
                {guestPlayers.map((player) => (
                  <span key={player.seat} className={player.connected ? 'online' : ''}>
                    {player.name} {player.connected ? '●' : '○'}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="muted">{tr('lanStartHint')}</p>
          {lanError ? <p className="error">{lanError}</p> : null}
        </section>
      ) : null}

      {toast && <div className="toast" data-testid="toast">{toast}</div>}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'record') return recordScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
