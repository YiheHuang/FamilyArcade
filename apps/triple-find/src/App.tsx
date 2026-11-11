import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  LanGuest,
  LanHost,
  guestParams,
  newRoomCode,
  type LanPublicPeer,
} from '@family-arcade/lan';
import {
  AI_LEVELS,
  CALL_LOCKOUT_MS,
  CALL_WINDOW_MS,
  GAME_LENGTH_MS,
  aiDelay,
  aiNames,
  chooseSet,
  mulberry32,
  type AiLevel,
} from './ai/ai';
import {
  claimSet,
  createGame,
  dealExtra,
  findSet,
  findSets,
  finishGame,
  isDraw,
  setReason,
  standings,
  winners,
  type Attribute,
  type Card,
  type ClaimError,
  type GameState,
  type SetReason,
  type SetRelation,
} from './game/cards';
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
  type ResultMode,
  type SavedGame,
} from './storage';
import { chime, type SoundKind } from './sound';
import { CardFace } from './components/CardFace';
import { LogoMark, SetExample } from './components/SetExample';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'record' | 'lan';
type Mode = 'solo' | 'local' | 'lan-host' | 'lan-guest';
type SetupKind = 'solo' | 'local';
type ToastTone = 'info' | 'warn' | 'good';

interface Toast {
  text: string;
  tone: ToastTone;
}

interface LastClaim {
  playerId: number;
  ok: boolean;
  error?: ClaimError;
  nonce: number;
}

interface LanView {
  state: GameState;
  seat: number;
  playerId: number;
  remainingMs: number;
  lastClaim: LastClaim | null;
  serverTime: number;
}

interface Hint {
  cards: number[];
  reason: SetReason[];
}

const LEVEL_NOTES: Record<AiLevel, MessageKey> = {
  companion: 'levelCompanionNote',
  easy: 'levelEasyNote',
  normal: 'levelNormalNote',
  hard: 'levelHardNote',
};

const ATTR_KEYS: Record<Attribute, MessageKey> = {
  color: 'attrColor',
  shape: 'attrShape',
  fill: 'attrFill',
  count: 'attrCount',
};

const REL_KEYS: Record<SetRelation, MessageKey> = {
  same: 'relSame',
  different: 'relDifferent',
  mixed: 'relMixed',
};

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function modeLabelKey(mode: Mode): MessageKey {
  if (mode === 'solo') return 'modeSolo';
  if (mode === 'local') return 'modeLocal';
  return 'modeLan';
}

function resultModeLabel(mode: ResultMode): MessageKey {
  if (mode === 'solo') return 'modeSolo';
  if (mode === 'local') return 'modeLocal';
  return 'modeLan';
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>('home');
  const [setupKind, setSetupKind] = useState<SetupKind>('solo');
  const [mode, setMode] = useState<Mode>('solo');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [aiCount, setAiCount] = useState(1);
  const [humanCount, setHumanCount] = useState(2);
  const [names, setNames] = useState<string[]>(['', '', '', '']);
  const [state, setState] = useState<GameState>(() =>
    createGame(['You', 'Moss'], mulberry32(1)),
  );
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [wrongIds, setWrongIds] = useState<number[]>([]);
  const [selectionError, setSelectionError] = useState('');
  const [hint, setHint] = useState<Hint | null>(null);
  const [call, setCall] = useState<{ playerId: number; until: number } | null>(null);
  const [lockouts, setLockouts] = useState<Record<number, number>>({});
  const [claiming, setClaiming] = useState(false);
  const [aiThinking, setAiThinking] = useState<number[]>([]);
  const [remainingMs, setRemainingMs] = useState(GAME_LENGTH_MS);
  const [now, setNow] = useState(() => Date.now());

  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.triple-find.sound') !== 'off';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState<Toast | null>(null);

  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<LanView | null>(null);
  const [guestViewAt, setGuestViewAt] = useState(0);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestName, setGuestName] = useState(() => guestParams()?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => guestParams()?.code ?? '');
  const [guestRoom] = useState(() => guestParams()?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);

  const stateRef = useRef(state);
  const screenRef = useRef<Screen>(screen);
  const modeRef = useRef<Mode>(mode);
  const levelRef = useRef<AiLevel>(level);
  const aiCountRef = useRef(aiCount);
  const soundRef = useRef(soundOn);
  const seedRef = useRef(1);
  const remainingRef = useRef(GAME_LENGTH_MS);
  const deadlineRef = useRef(Date.now() + GAME_LENGTH_MS);
  const recordedRef = useRef(false);
  const hintCycleRef = useRef(0);
  const hostRef = useRef<LanHost | null>(null);
  const guestRef = useRef<LanGuest | null>(null);
  const lanSeatsRef = useRef<number[]>([]);
  const lastClaimRef = useRef<LastClaim | null>(null);
  const lastClaimNonceRef = useRef(0);
  const lastClaimSeenRef = useRef(0);
  const guestSeqRef = useRef(-1);

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    aiCountRef.current = aiCount;
  }, [aiCount]);

  useEffect(() => {
    soundRef.current = soundOn;
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
      localStorage.setItem('familyarcade.triple-find.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2900);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const say = (text: string, tone: ToastTone = 'info') => setToast({ text, tone });

  const playerName = useCallback(
    (playerId: number) =>
      stateRef.current.players.find((player) => player.id === playerId)?.name ?? '',
    [],
  );

  const broadcastViews = useCallback((next: GameState, claim: LastClaim | null = lastClaimRef.current) => {
    const host = hostRef.current;
    if (!host) return;
    const seats = lanSeatsRef.current;
    if (seats.length === 0) return;
    const remaining = Math.max(0, deadlineRef.current - Date.now());
    seats.forEach((seat, playerId) => {
      const view: LanView = {
        state: next,
        seat,
        playerId,
        remainingMs: remaining,
        lastClaim: claim,
        serverTime: Date.now(),
      };
      host.sendView(seat, view);
    });
  }, []);

  const commit = useCallback(
    (next: GameState, previous: GameState, soundKind: SoundKind = 'score') => {
      if (next === previous) return;
      stateRef.current = next;
      setState(next);
      setHistory((items) => [...items.slice(-49), previous]);
      setSelected([]);
      setWrongIds([]);
      setSelectionError('');
      setHint(null);
      setCall(null);
      setClaiming(false);
      setAiThinking([]);
      if (soundRef.current) chime(soundKind);
      setToast(null);

      const currentMode = modeRef.current;
      if (next.status === 'finished') {
        if (!recordedRef.current) {
          recordedRef.current = true;
          if (currentMode !== 'lan-guest') {
            const resultMode: ResultMode =
              currentMode === 'lan-host' ? 'lan-host' : currentMode;
            setRecord(recordResult(next, resultMode));
            clearSave();
            setSaved(null);
          }
        }
      } else if (currentMode === 'solo' || currentMode === 'local') {
        saveGame({
          state: next,
          mode: currentMode,
          level: levelRef.current,
          aiCount: aiCountRef.current,
          remainingMs: Math.max(1, remainingRef.current),
          seed: seedRef.current,
        });
      }

      if (currentMode === 'lan-host') {
        broadcastViews(next);
        if (next.status === 'finished') {
          hostRef.current?.sendResult({
            status: next.status,
            players: standings(next).map((player) => ({
              name: player.name,
              score: player.score,
            })),
          });
        }
      }
      setNow(Date.now());
    },
    [broadcastViews],
  );

  const resolveClaim = (ids: number[], playerId: number) => {
    const current = stateRef.current;
    if (current.status !== 'playing') {
      setClaiming(false);
      return;
    }
    const result = claimSet(current, playerId, ids);
    if (result.ok) {
      setWrongIds([]);
      setSelectionError('');
      if (modeRef.current === 'lan-host') {
        lastClaimNonceRef.current += 1;
        lastClaimRef.current = {
          playerId,
          ok: true,
          nonce: lastClaimNonceRef.current,
        };
      }
      commit(result.state, current, 'score');
      return;
    }

    setClaiming(false);
    setWrongIds(ids);
    setSelectionError(tr('notASet'));
    if (soundRef.current) chime('error');
    say(tr('notASetDetail'), 'warn');

    if (modeRef.current === 'local') {
      setLockouts((items) => ({ ...items, [playerId]: Date.now() + CALL_LOCKOUT_MS }));
      setCall(null);
    }
    if (modeRef.current === 'lan-host') {
      lastClaimNonceRef.current += 1;
      lastClaimRef.current = {
        playerId,
        ok: false,
        error: result.error,
        nonce: lastClaimNonceRef.current,
      };
      broadcastViews(current, lastClaimRef.current);
    }
    window.setTimeout(() => {
      setSelected([]);
      setWrongIds([]);
      setSelectionError('');
    }, 900);
  };

  const interactionState = mode === 'lan-guest' && guestView ? guestView.state : state;
  const canPick =
    screen === 'game' &&
    interactionState.status === 'playing' &&
    findSet(interactionState.table) !== null &&
    !claiming &&
    (mode !== 'local' || call !== null) &&
    (mode !== 'lan-guest' || (guestStarted && guestView !== null));

  const selectCard = (cardId: number) => {
    if (!canPick) return;
    if (selected.includes(cardId)) {
      setSelected(selected.filter((id) => id !== cardId));
      return;
    }
    if (selected.length >= 3) return;
    const next = [...selected, cardId];
    setSelected(next);
    if (soundRef.current) chime('select');
    if (next.length < 3) return;
    setClaiming(true);

    if (mode === 'lan-guest') {
      if (!guestRef.current) {
        setClaiming(false);
        return;
      }
      guestRef.current.sendIntent({ type: 'claim', cardIds: next });
      return;
    }

    const playerId = mode === 'local' ? call?.playerId ?? -1 : 0;
    if (playerId < 0) {
      setClaiming(false);
      return;
    }
    window.setTimeout(() => resolveClaim(next, playerId), 80);
  };

  const startCall = (playerId: number) => {
    if (modeRef.current !== 'local' || stateRef.current.status !== 'playing') return;
    if (!stateRef.current.players.some((player) => player.id === playerId)) return;
    if (!findSet(stateRef.current.table)) return;
    const active = call;
    if (active) {
      if (active.playerId !== playerId) {
        say(tr('calling', { name: playerName(active.playerId) }), 'info');
      }
      return;
    }
    if ((lockouts[playerId] ?? 0) > Date.now()) return;
    setCall({ playerId, until: Date.now() + CALL_WINDOW_MS });
    setSelected([]);
    setWrongIds([]);
    setSelectionError('');
    setHint(null);
    setClaiming(false);
    if (soundRef.current) chime('select');
  };

  const showHint = () => {
    const currentMode = modeRef.current;
    if (currentMode === 'lan-host' || currentMode === 'lan-guest') {
      say(tr('hintOff'), 'warn');
      return;
    }
    const current = stateRef.current;
    if (current.status !== 'playing') return;
    const sets = findSets(current.table);
    if (sets.length === 0) {
      say(tr('noSet'), 'warn');
      return;
    }
    const indexes = sets[hintCycleRef.current % sets.length];
    hintCycleRef.current += 1;
    const cards = indexes.map((index) => current.table[index]);
    setHint({
      cards: cards.map((card) => card.id),
      reason: setReason([cards[0], cards[1], cards[2]] as [Card, Card, Card]),
    });
    if (soundRef.current) chime('select');
    say(tr('hintToast'), 'info');
  };

  const undo = () => {
    if (modeRef.current === 'lan-host' || modeRef.current === 'lan-guest') return;
    if (stateRef.current.status !== 'playing') return;
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));
    stateRef.current = previous;
    setState(previous);
    setSelected([]);
    setWrongIds([]);
    setSelectionError('');
    setHint(null);
    setCall(null);
    setClaiming(false);
    setLockouts({});
    if (soundRef.current) chime('select');
    if (modeRef.current === 'solo' || modeRef.current === 'local') {
      saveGame({
        state: previous,
        mode: modeRef.current,
        level: levelRef.current,
        aiCount: aiCountRef.current,
        remainingMs: Math.max(1, remainingRef.current),
        seed: seedRef.current,
      });
    }
  };

  const clearPick = () => {
    setSelected([]);
    setWrongIds([]);
    setSelectionError('');
    setClaiming(false);
  };

  const resetTable = (next: GameState, nextMode: Mode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
    stateRef.current = next;
    setState(next);
    setHistory([]);
    setSelected([]);
    setWrongIds([]);
    setSelectionError('');
    setHint(null);
    setCall(null);
    setLockouts({});
    setAiThinking([]);
    setClaiming(false);
    setToast(null);
    recordedRef.current = false;
    remainingRef.current = GAME_LENGTH_MS;
    setRemainingMs(GAME_LENGTH_MS);
    deadlineRef.current = Date.now() + GAME_LENGTH_MS;
    setNow(Date.now());
    setScreen('game');
    clearSave();
    setSaved(null);
  };

  const startConfigured = (config: {
    mode: 'solo' | 'local';
    names: string[];
    level: AiLevel;
    aiCount: number;
  }) => {
    const seed = randomSeed();
    seedRef.current = seed;
    levelRef.current = config.level;
    setLevel(config.level);
    aiCountRef.current = config.aiCount;
    setAiCount(config.aiCount);
    resetTable(createGame(config.names, mulberry32(seed)), config.mode);
  };

  const startSolo = () => {
    const human = names[0].trim() || tr('you');
    startConfigured({
      mode: 'solo',
      names: [human, ...aiNames(level, aiCount, lang)],
      level,
      aiCount,
    });
  };

  const startLocal = () => {
    const players = Array.from({ length: humanCount }, (_, index) => {
      return names[index].trim() || tr('playerNumber', { n: index + 1 });
    });
    startConfigured({ mode: 'local', names: players, level, aiCount });
  };

  const resume = () => {
    if (!saved) return;
    modeRef.current = saved.mode;
    setMode(saved.mode);
    levelRef.current = saved.level;
    setLevel(saved.level);
    aiCountRef.current = saved.aiCount;
    setAiCount(saved.aiCount);
    seedRef.current = saved.seed;
    stateRef.current = saved.state;
    setState(saved.state);
    setHistory([]);
    setSelected([]);
    setWrongIds([]);
    setSelectionError('');
    setHint(null);
    setCall(null);
    setLockouts({});
    setAiThinking([]);
    setClaiming(false);
    recordedRef.current = false;
    remainingRef.current = saved.remainingMs;
    setRemainingMs(saved.remainingMs);
    deadlineRef.current = Date.now() + saved.remainingMs;
    setNow(Date.now());
    setSaved(null);
    setScreen('game');
  };

  const closeLan = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setLanHost(null);
    setLanPlayers([]);
    setLanInfo(null);
    setLanInvite('');
    setLanQr('');
    setLanBusy(false);
    setLanError('');
    setLanCode('');
    lanSeatsRef.current = [];
    guestRef.current?.close();
    guestRef.current = null;
    setGuest(null);
    setGuestView(null);
    setGuestStarted(false);
    setGuestConnecting(false);
    setClaiming(false);
  }, []);

  const goHome = useCallback(() => {
    const currentMode = modeRef.current;
    if (currentMode === 'lan-host' || currentMode === 'lan-guest') {
      closeLan();
    } else if (screenRef.current === 'game' && stateRef.current.status === 'playing') {
      const left = Math.max(1, deadlineRef.current - Date.now());
      remainingRef.current = left;
      if (currentMode === 'solo' || currentMode === 'local') {
        saveGame({
          state: stateRef.current,
          mode: currentMode,
          level: levelRef.current,
          aiCount: aiCountRef.current,
          remainingMs: left,
          seed: seedRef.current,
        });
      }
    }
    setScreen('home');
    setSaved(loadSave());
    setToast(null);
    setSelected([]);
    setWrongIds([]);
    setSelectionError('');
    setHint(null);
    setCall(null);
    setClaiming(false);
    setAiThinking([]);
  }, [closeLan]);

  const restartMatch = () => {
    const current = stateRef.current;
    const namesNow = current.players.map((player) => player.name);
    const currentMode = modeRef.current;

    if (currentMode === 'lan-host') {
      const connected = lanPlayers
        .filter((player) => player.connected)
        .slice()
        .sort((a, b) => a.seat - b.seat);
      if (connected.length < 2) {
        say(tr('lanNeedTwo'), 'warn');
        return;
      }
      lanSeatsRef.current = connected.map((player) => player.seat);
      const seed = randomSeed();
      seedRef.current = seed;
      lastClaimRef.current = null;
      const next = createGame(
        connected.map((player) => player.name),
        mulberry32(seed),
      );
      resetTable(next, 'lan-host');
      hostRef.current?.start();
      broadcastViews(next, null);
      return;
    }

    if (currentMode === 'solo' || currentMode === 'local') {
      startConfigured({
        mode: currentMode,
        names: namesNow,
        level: levelRef.current,
        aiCount: aiCountRef.current,
      });
    }
  };

  const startLanMatch = () => {
    const host = lanHost;
    if (!host) return;
    const connected = lanPlayers
      .filter((player) => player.connected)
      .slice()
      .sort((a, b) => a.seat - b.seat);
    if (connected.length < 2) {
      say(tr('lanNeedTwo'), 'warn');
      return;
    }
    lanSeatsRef.current = connected.map((player) => player.seat);
    const seed = randomSeed();
    seedRef.current = seed;
    lastClaimRef.current = null;
    const next = createGame(
      connected.map((player) => player.name),
      mulberry32(seed),
    );
    resetTable(next, 'lan-host');
    host.start();
    broadcastViews(next, null);
  };

  const handleLanIntent = useCallback(
    (seat: number, intent: unknown) => {
      if (modeRef.current !== 'lan-host') return;
      const payload = intent as { type?: string; cardIds?: unknown } | null;
      if (!payload || payload.type !== 'claim' || !Array.isArray(payload.cardIds)) return;
      const ids = payload.cardIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value));
      if (ids.length !== 3) return;
      const playerId = lanSeatsRef.current.indexOf(seat);
      if (playerId < 0) return;
      const current = stateRef.current;
      if (current.status !== 'playing') return;

      const result = claimSet(current, playerId, ids);
      lastClaimNonceRef.current += 1;
      if (result.ok) {
        lastClaimRef.current = {
          playerId,
          ok: true,
          nonce: lastClaimNonceRef.current,
        };
        commit(result.state, current, 'score');
        return;
      }
      lastClaimRef.current = {
        playerId,
        ok: false,
        error: result.error,
        nonce: lastClaimNonceRef.current,
      };
      broadcastViews(current, lastClaimRef.current);
      if (soundRef.current) chime('error');
      say(tr('notASet'), 'warn');
    },
    [broadcastViews, commit, say, tr],
  );

  const openLanHost = async () => {
    closeLan();
    modeRef.current = 'lan-host';
    setMode('lan-host');
    setScreen('lan');
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
        maxPlayers: 4,
      });
      hostRef.current = host;
      setLanHost(host);
      setLanCode(code);
      host.onChange((players) => {
        if (hostRef.current === host) setLanPlayers(players);
      });
      host.onIntent((seat, intent) => handleLanIntent(seat, intent));
      host.onClose(() => {
        if (hostRef.current === host) setLanError(tr('lanClosed'));
      });
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#1f2b2a', light: '#fffdf6' },
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
    setGuestView(null);
    try {
      const joined = await LanGuest.join({
        wsUrl: guestWsUrl(),
        room: guestRoom,
        code: guestCode,
        name: guestName.trim(),
      });
      guestRef.current = joined;
      setGuest(joined);
      lastClaimSeenRef.current = 0;
      guestSeqRef.current = -1;
      joined.onView((payload) => {
        if (guestRef.current !== joined) return;
        const view = payload as LanView;
        setGuestView(view);
        setGuestViewAt(Date.now());
      });
      joined.onStart(() => {
        if (guestRef.current !== joined) return;
        setGuestStarted(true);
        setScreen('game');
        setToast(null);
      });
      joined.onError((reason) => {
        if (guestRef.current === joined) {
          setLanError(reason === 'room-full' ? tr('lanFull') : tr('lanWrong'));
        }
      });
      setGuestStarted(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLanError(
        message.includes('room-full') || message.includes('full')
          ? tr('lanFull')
          : message.includes('wrong') || message.includes('rejected')
            ? tr('lanWrong')
            : tr('lanDisconnected'),
      );
    } finally {
      setGuestConnecting(false);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(lanInvite);
      say(tr('lanCopied'), 'good');
    } catch {
      say(lanInvite, 'info');
    }
  };

  // Clock for solo and hot-seat. LAN guests follow the host's view.
  useEffect(() => {
    if (screen !== 'game') return;
    const timer = window.setInterval(() => {
      const stamp = Date.now();
      setNow(stamp);
      if (modeRef.current === 'lan-guest') return;
      if (stateRef.current.status !== 'playing') return;
      const left = Math.max(0, deadlineRef.current - stamp);
      remainingRef.current = left;
      setRemainingMs(left);
      if (left <= 0) {
        const current = stateRef.current;
        commit(finishGame(current), current, 'win');
      }
    }, 400);
    return () => window.clearInterval(timer);
  }, [screen, commit]);

  // Keep LAN guests roughly in sync without a message per frame.
  useEffect(() => {
    if (screen !== 'game' || mode !== 'lan-host' || state.status !== 'playing') return;
    const timer = window.setInterval(() => {
      broadcastViews(stateRef.current);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [screen, mode, state.status, broadcastViews]);

  // A called player has twelve seconds; a timeout is a short rest.
  useEffect(() => {
    if (!call || screen !== 'game') return;
    const wait = Math.max(0, call.until - Date.now());
    const timer = window.setTimeout(() => {
      setCall(null);
      setSelected([]);
      setWrongIds([]);
      setSelectionError('');
      setLockouts((items) => ({ ...items, [call.playerId]: Date.now() + CALL_LOCKOUT_MS }));
      if (soundRef.current) chime('error');
      say(tr('callTimeUp'), 'warn');
    }, wait);
    return () => window.clearTimeout(timer);
  }, [call, screen, tr]);

  // No set: deal three more, or end the game when the deck is empty.
  useEffect(() => {
    if (screen !== 'game' || modeRef.current === 'lan-guest') return;
    if (state.status !== 'playing') return;
    if (findSet(state.table)) return;

    if (state.deck.length === 0) {
      const timer = window.setTimeout(() => {
        const current = stateRef.current;
        if (current.status === 'playing') commit(finishGame(current), current, 'win');
      }, 1500);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.status !== 'playing' || findSet(current.table)) return;
      const result = dealExtra(current);
      if (result.ok) commit(result.state, current, 'deal');
    }, 1900);
    return () => window.clearTimeout(timer);
  }, [screen, state, commit]);

  // AI reaction. Deterministic per (seed, seq): no hidden Math.random here.
  useEffect(() => {
    if (mode !== 'solo' || screen !== 'game' || state.status !== 'playing') return;
    if (!findSet(state.table)) return;
    const rng = mulberry32((seedRef.current ^ Math.imul(state.seq + 1, 2654435761)) >>> 0);
    let pick: { playerId: number; delay: number } | null = null;
    for (let id = 1; id <= aiCount; id += 1) {
      const delay = aiDelay(level, rng);
      if (!pick || delay < pick.delay) pick = { playerId: id, delay };
    }
    if (!pick) return;
    const aiId = pick.playerId;
    const wait = pick.delay;
    setAiThinking(Array.from({ length: aiCount }, (_, index) => index + 1));
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.status !== 'playing') return;
      const choiceRng = mulberry32(
        (seedRef.current ^ Math.imul(current.seq + 1, 2654435761)) >>> 0,
      );
      const indexes = chooseSet(current.table, level, choiceRng);
      setAiThinking([]);
      if (!indexes) return;
      const ids = indexes
        .map((index) => current.table[index]?.id)
        .filter((id): id is number => Number.isInteger(id));
      if (ids.length !== 3) return;
      const result = claimSet(current, aiId, ids);
      if (result.ok) commit(result.state, current, 'score');
    }, wait);
    return () => {
      window.clearTimeout(timer);
      setAiThinking([]);
    };
  }, [mode, screen, state.status, state.seq, state.table, level, aiCount, commit]);

  // Guest view: apply the host's claim feedback and drop stale picks.
  useEffect(() => {
    if (!guestView) return;
    setGuestViewAt(Date.now());
    const claim = guestView.lastClaim;
    if (claim && claim.nonce !== lastClaimSeenRef.current) {
      lastClaimSeenRef.current = claim.nonce;
      if (claim.playerId === guestView.playerId) {
        setClaiming(false);
        if (!claim.ok) {
          setSelectionError(tr('notASet'));
          say(tr('notASetDetail'), 'warn');
          if (soundRef.current) chime('error');
          window.setTimeout(() => {
            setSelected([]);
            setWrongIds([]);
            setSelectionError('');
          }, 900);
        } else {
          setSelected([]);
          setWrongIds([]);
          setSelectionError('');
          if (soundRef.current) chime('score');
        }
      }
    }
    if (guestView.state.seq !== guestSeqRef.current) {
      guestSeqRef.current = guestView.state.seq;
      setClaiming(false);
      const ids = new Set(guestView.state.table.map((card) => card.id));
      setSelected((items) =>
        items.every((id) => ids.has(id)) ? items : items.filter((id) => ids.has(id)),
      );
    }
  }, [guestView, tr, say]);

  useEffect(() => {
    if (!claiming || mode !== 'lan-guest') return;
    const timer = window.setTimeout(() => {
      setClaiming(false);
      setSelected([]);
      setWrongIds([]);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [claiming, mode]);

  // Autosave periodically so a closed tab loses at most a couple of seconds.
  useEffect(() => {
    if (screen !== 'game' || (mode !== 'solo' && mode !== 'local')) return;
    const timer = window.setInterval(() => {
      const current = stateRef.current;
      if (current.status !== 'playing') return;
      saveGame({
        state: current,
        mode,
        level: levelRef.current,
        aiCount: aiCountRef.current,
        remainingMs: Math.max(1, remainingRef.current),
        seed: seedRef.current,
      });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [screen, mode]);

  useEffect(() => {
    if (!guestRoom) return;
    setScreen('lan');
    modeRef.current = 'lan-guest';
    setMode('lan-guest');
  }, [guestRoom]);

  const displayState = mode === 'lan-guest' && guestView ? guestView.state : state;
  const displayTable = displayState.table;
  const tableHasSet = findSet(displayTable) !== null;
  const guestRemaining = guestView
    ? Math.max(0, guestView.remainingMs - Math.max(0, now - guestViewAt))
    : GAME_LENGTH_MS;
  const shownRemaining = mode === 'lan-guest' ? guestRemaining : remainingMs;
  const finalStandings = standings(displayState);
  const finalWinners = winners(displayState);
  const finalDraw = isDraw(displayState);
  const callSeconds = call ? Math.ceil(Math.max(0, call.until - now) / 1000) : 0;
  const progress = Math.min(100, Math.max(0, (shownRemaining / GAME_LENGTH_MS) * 100));
  const isGuest = mode === 'lan-guest';

  const localLocked = (playerId: number) => (lockouts[playerId] ?? 0) > now;
  const lockSeconds = (playerId: number) =>
    Math.ceil(Math.max(0, (lockouts[playerId] ?? 0) - now) / 1000);
  const playerSets = (playerId: number) =>
    displayState.found.filter((item) => item.playerId === playerId).length;
  const setsText = (count: number) => tr(count === 1 ? 'setOne' : 'setsLabel', { count });
  const gamesText = (count: number) => tr(count === 1 ? 'recordGameOne' : 'recordGames');
  const inviteLabel = (() => {
    try {
      return decodeURIComponent(lanInvite.replace(/^https?:\/\//, ''));
    } catch {
      return lanInvite.replace(/^https?:\/\//, '');
    }
  })();
  const displayPlayerName = (playerId: number) =>
    displayState.players.find((player) => player.id === playerId)?.name ?? '';

  const updateName = (index: number, value: string) => {
    setNames((items) => items.map((name, itemIndex) => (itemIndex === index ? value : name)));
  };

  const handleClearRecord = () => {
    setRecord(clearRecord());
    say(tr('recordCleared'), 'good');
  };

  const closeToHome = () => {
    closeLan();
    setScreen('home');
    setSaved(loadSave());
  };

  // Keyboard path: every control is also a real button, but shortcuts help.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (screen === 'lan') closeToHome();
        else goHome();
        return;
      }
      if (screen !== 'game') return;
      const key = event.key.toLowerCase();
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
      if (mode === 'local') {
        const callKeys = ['q', 'w', 'e', 'r'];
        const callIndex = callKeys.indexOf(key);
        if (callIndex >= 0) {
          event.preventDefault();
          startCall(callIndex);
          return;
        }
      }
      const number = Number(event.key);
      if (Number.isInteger(number) && number >= 1 && number <= 9) {
        const card = displayTable[number - 1];
        if (card) {
          event.preventDefault();
          selectCard(card.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div className="brand">
          <LogoMark />
          <div>
            <p className="eyebrow">{tr('eyebrow')}</p>
            <h1>{tr('title')}</h1>
            <p className="subtitle">{tr('subtitle')}</p>
          </div>
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
        <div className="hero-art">
          <div className="hero-glow" aria-hidden="true" />
          <SetExample lang={lang} />
          <p className="hero-caption">{tr('heroCaption')}</p>
        </div>
        <div className="hero-copy">
          <div className="meta-badges">
            <span>{tr('players')}</span>
            <span>{tr('minutes')}</span>
            <span>{tr('age')}</span>
          </div>
          <p className="kicker">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide continue-card" onClick={resume}>
                <span>{tr('continueGame')}</span>
                <small>
                  {tr('savedDevice')} · {formatTime(saved.remainingMs)}
                </small>
              </button>
            )}
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={() => {
              setSetupKind('solo');
              setScreen('setup');
            }}>
              <span>{tr('playSolo')}</span>
              <small>{tr('setupLedeSolo')}</small>
            </button>
            <button className="secondary wide" onClick={() => {
              setSetupKind('local');
              setScreen('setup');
            }}>
              <span>{tr('playLocal')}</span>
              <small>{tr('setupLedeLocal')}</small>
            </button>
            <button className="secondary wide" onClick={openLanHost}>
              <span>{tr('playLan')}</span>
              <small>{tr('lanSameWifi')}</small>
            </button>
            <div className="menu-links">
              <button className="text-button" onClick={() => setScreen('rules')}>
                {tr('playRules')} →
              </button>
              <button className="text-button" onClick={() => setScreen('record')}>
                {tr('playRecord')} →
              </button>
            </div>
          </div>
          <div className="record-strip">
            <span>{tr('familyRecord')}</span>
            <strong>{record.games}</strong>
            <span>{gamesText(record.games)}</span>
            <span className="dot">·</span>
            <span>{tr('recordBest')} {record.bestScore}</span>
            <span className="dot">·</span>
            <span>{tr('recordStreak')} {record.streak}</span>
            <span className="dot">·</span>
            <span>{tr('drawsValue', { count: record.draws })}</span>
          </div>
        </div>
      </section>
      <footer className="foot">{tr('footer')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell setup-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <div className="section-head">
        <p className="eyebrow">{tr('eyebrow')}</p>
        <h1 className="screen-title">{tr(setupKind === 'solo' ? 'setupSolo' : 'setupLocal')}</h1>
        <p className="lede">{tr(setupKind === 'solo' ? 'setupLedeSolo' : 'setupLedeLocal')}</p>
      </div>
      <div className="setup-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={setupKind === 'solo'}
          className={setupKind === 'solo' ? 'active' : ''}
          onClick={() => setSetupKind('solo')}
        >
          {tr('setupSolo')}
        </button>
        <button
          role="tab"
          aria-selected={setupKind === 'local'}
          className={setupKind === 'local' ? 'active' : ''}
          onClick={() => setSetupKind('local')}
        >
          {tr('setupLocal')}
        </button>
      </div>

      <div className="setup-grid">
        <section className="setup-panel">
          {setupKind === 'solo' ? (
            <>
              <label className="field">
                <span>{tr('humanName')}</span>
                <input
                  value={names[0]}
                  onChange={(event) => updateName(0, event.target.value)}
                  placeholder={tr('namePlaceholder')}
                  maxLength={18}
                  autoComplete="nickname"
                />
              </label>

              <div className="field">
                <span>{tr('opponents')}</span>
                <div className="segmented">
                  {[1, 2, 3].map((count) => (
                    <button
                      key={count}
                      className={aiCount === count ? 'active' : ''}
                      aria-pressed={aiCount === count}
                      onClick={() => setAiCount(count)}
                    >
                      {tr(count === 1 ? 'aiCountOne' : count === 2 ? 'aiCountTwo' : 'aiCountThree')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span>{tr('level')}</span>
                <div className="level-grid">
                  {AI_LEVELS.map((item) => (
                    <button
                      key={item}
                      className={`level-card ${level === item ? 'selected' : ''}`}
                      aria-pressed={level === item}
                      onClick={() => setLevel(item)}
                    >
                      <span className={`level-dot ${item}`} />
                      <strong>{tr(item)}</strong>
                      <small>{tr(LEVEL_NOTES[item])}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="setup-meta">
                <span className="chip">{tr('gameLength')} · {tr('fiveMinutes')}</span>
                <span className="chip">{tr('players')}</span>
              </div>
              <button className="primary wide" onClick={startSolo}>
                {tr('beginSolo')}
              </button>
            </>
          ) : (
            <>
              <div className="field">
                <span>{tr('playerCount')}</span>
                <div className="segmented">
                  {[2, 3, 4].map((count) => (
                    <button
                      key={count}
                      className={humanCount === count ? 'active' : ''}
                      aria-pressed={humanCount === count}
                      onClick={() => setHumanCount(count)}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <div className="name-grid">
                {Array.from({ length: humanCount }, (_, index) => (
                  <label className="field" key={index}>
                    <span>{tr('playerNumber', { n: index + 1 })}</span>
                    <input
                      value={names[index]}
                      onChange={(event) => updateName(index, event.target.value)}
                      placeholder={tr('namePlaceholder')}
                      maxLength={18}
                    />
                  </label>
                ))}
              </div>

              <p className="tip">{tr('setupTip')}</p>
              <button className="primary wide" onClick={startLocal}>
                {tr('beginLocal')}
              </button>
            </>
          )}
        </section>

        <aside className="setup-aside">
          <h3>{tr('exampleTitle')}</h3>
          <SetExample lang={lang} compact />
          <p>{tr('exampleCaption')}</p>
          <div className="aside-note">
            <strong>{tr('howToTitle')}</strong>
            <p>{tr('howToBody')}</p>
          </div>
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
          <span>
            {mode === 'solo'
              ? tr(level)
              : mode === 'local'
                ? tr('playLocal')
                : mode === 'lan-host'
                  ? `${tr('lanHostTitle')} · ${lanCode}`
                  : `${tr('lanGuestTitle')}${guest?.code ? ` · ${guest.code}` : ''}`}
          </span>
        </div>
        <div className="game-tools">
          <div className={`game-timer ${shownRemaining < 30_000 ? 'urgent' : ''}`}>
            <small>{tr('timeLeft')}</small>
            <strong>{formatTime(shownRemaining)}</strong>
          </div>
          <button className="ghost" onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
        </div>
      </header>
      <div className="time-track" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="players-bar">
        {displayState.players.map((player) => {
          const activeCall = call?.playerId === player.id;
          const isSelf = isGuest ? guestView?.playerId === player.id : player.id === 0;
          const isAi = mode === 'solo' && player.id > 0;
          const locked = localLocked(player.id) && mode === 'local';
          const chip = (
            <>
              <span className={`seat-dot seat-${player.id}`} />
              <span className="player-name">
                {player.name}
                {isSelf && player.name !== tr('you') && <em>{tr('you')}</em>}
              </span>
              <span className="player-role">
                {isAi ? `${tr('aiTag')} · ${tr(level)}` : tr(modeLabelKey(mode))}
              </span>
              {aiThinking.includes(player.id) && <span className="thinking-dots">···</span>}
              {activeCall && <span className="call-count">{callSeconds}s</span>}
              {locked && <span className="call-count lock">{lockSeconds(player.id)}s</span>}
              <span className="player-score">{player.score}</span>
              <span className="player-sets">{setsText(playerSets(player.id))}</span>
            </>
          );

          if (mode === 'local') {
            return (
              <button
                type="button"
                key={player.id}
                className={`player-chip ${activeCall ? 'active' : ''} ${locked ? 'locked' : ''}`}
                onClick={() => startCall(player.id)}
                disabled={Boolean(call) || locked || state.status !== 'playing' || !tableHasSet}
                aria-label={tr('callAs', { name: player.name })}
              >
                {chip}
              </button>
            );
          }
          return (
            <div
              key={player.id}
              className={`player-chip static ${isSelf ? 'self' : ''} ${activeCall ? 'active' : ''}`}
            >
              {chip}
            </div>
          );
        })}
      </div>

      <div className="game-layout">
        <section className="table-wrap">
          {isGuest && !guestView ? (
            <div className="waiting-card">
              <span className="spinner" aria-hidden="true" />
              <strong>{tr('waitingView')}</strong>
              <p>{tr('waitingHost')}</p>
            </div>
          ) : (
            <>
              <div className="table-call">
                {mode === 'local' ? (
                  call ? (
                    <>
                      <strong>{tr('calling', { name: displayPlayerName(call.playerId) })}</strong>
                      <span>{tr('callHint', { seconds: callSeconds })}</span>
                    </>
                  ) : (
                    <>
                      <strong>{tr('callFirst')}</strong>
                      <span>{tr('quickRules')}</span>
                    </>
                  )
                ) : mode === 'solo' ? (
                  <>
                    <strong>{tr('pickThree')}</strong>
                    <span>{tr('soloRace')}</span>
                  </>
                ) : (
                  <>
                    <strong>{tr('pickThree')}</strong>
                    <span>{tr('lanRace')}</span>
                  </>
                )}
              </div>

              <div className={`card-table cards-${displayTable.length}`} role="group" aria-label={tr('title')}>
                {displayTable.map((card) => (
                  <CardFace
                    key={card.id}
                    card={card}
                    lang={lang}
                    selected={selected.includes(card.id)}
                    hinted={hint?.cards.includes(card.id) ?? false}
                    wrong={wrongIds.includes(card.id)}
                    disabled={!canPick}
                    onSelect={selectCard}
                  />
                ))}
              </div>

              {!tableHasSet && displayState.status === 'playing' && (
                <div className="deal-banner" role="status">
                  <span className="spinner small" aria-hidden="true" />
                  <div>
                    <strong>{tr('noSet')}</strong>
                    <p>{displayState.deck.length > 0 ? tr('dealing') : tr('noSetWait')}</p>
                  </div>
                </div>
              )}

              {selectionError && (
                <div className="selection-error" role="alert">
                  <strong>{selectionError}</strong>
                  <span>{tr('notASetDetail')}</span>
                </div>
              )}

              <div className="table-tools">
                <div className="selection-count">
                  {selected.length > 0 && (
                    <>
                      <span>{tr('selectedCount', { count: selected.length })}</span>
                      <button className="text-button" onClick={clearPick} disabled={claiming}>
                        {tr('clearPick')}
                      </button>
                    </>
                  )}
                </div>
                <div className="tool-buttons">
                  <button
                    className="secondary small"
                    onClick={showHint}
                    disabled={displayState.status !== 'playing' || isGuest}
                    title={isGuest ? tr('hintOff') : undefined}
                  >
                    {tr('hint')}
                  </button>
                  <button
                    className="secondary small"
                    onClick={undo}
                    disabled={
                      displayState.status !== 'playing' ||
                      history.length === 0 ||
                      mode === 'lan-host' ||
                      mode === 'lan-guest'
                    }
                  >
                    {tr('undo')}
                  </button>
                </div>
              </div>

              {hint && (
                <div className="hint-panel">
                  <strong>{tr('hintTitle')}</strong>
                  <ul>
                    {hint.reason.map((reason) => (
                      <li key={reason.attr}>
                        {tr('reasonFormat', {
                          attr: tr(ATTR_KEYS[reason.attr]),
                          relation: tr(REL_KEYS[reason.relation]),
                        })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="keyboard-note">{tr('keyboardHelp')}</p>
            </>
          )}
        </section>

        <aside className="game-side">
          <div className="side-card">
            <h3>{tr('howToTitle')}</h3>
            <p>{tr('howToBody')}</p>
            <div className="clue-grid">
              <div><span className="clue-label">{tr('attrColor')}</span><span className="clue-swatches"><i className="swatch coral" /><i className="swatch teal" /><i className="swatch indigo" /></span></div>
              <div><span className="clue-label">{tr('attrShape')}</span><span>{tr('shapePill')} · {tr('shapeDiamond')} · {tr('shapeStar')}</span></div>
              <div><span className="clue-label">{tr('attrFill')}</span><span>{tr('fillSolid')} · {tr('fillStripe')} · {tr('fillOpen')}</span></div>
              <div><span className="clue-label">{tr('attrCount')}</span><span>1 · 2 · 3</span></div>
            </div>
          </div>

          <div className="side-card">
            <h3>{tr('setLog')}</h3>
            {displayState.found.length === 0 ? (
              <p>{tr('noSets')}</p>
            ) : (
              <ul className="set-log">
                {displayState.found.slice(-5).reverse().map((item) => (
                  <li key={item.seq}>
                    <span className={`seat-dot seat-${item.playerId}`} />
                    <span>{displayPlayerName(item.playerId)}</span>
                    <em>#{item.seq + 1}</em>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="side-card mini-stats">
            <div><strong>{displayState.deck.length}</strong><span>{tr('deckLeft')}</span></div>
            <div><strong>{displayTable.length}</strong><span>{tr('tableLeft')}</span></div>
            <div><strong>{displayState.found.length}</strong><span>{tr('setsFound')}</span></div>
          </div>
        </aside>
      </div>

      {toast && <div className={`toast ${toast.tone}`}>{toast.text}</div>}

      {displayState.status === 'finished' && (
        <div className="result-overlay" role="dialog" aria-modal="true" aria-label={tr('gameOver')}>
          <div className="result-sheet">
            <p className="eyebrow">{shownRemaining <= 0 ? tr('timeUp') : tr('deckCleared')}</p>
            <h2>
              {finalDraw
                ? tr('familyDraw')
                : tr('winnerWins', { name: finalWinners[0]?.name ?? '' })}
            </h2>
            <p className="result-sub">
              {tr('finalScores')} · {tr('setsFound')} {displayState.found.length}
            </p>
            <ol className="result-list">
              {finalStandings.map((player, index) => (
                <li key={player.id} className={index === 0 ? 'top' : ''}>
                  <span className={`seat-dot seat-${player.id}`} />
                  <span className="result-name">{player.name}</span>
                  <span className="result-sets">{setsText(playerSets(player.id))}</span>
                  <strong>{player.score}</strong>
                </li>
              ))}
            </ol>
            <div className="result-actions">
              {mode !== 'lan-guest' ? (
                <button className="primary" onClick={restartMatch}>
                  {tr('playAgain')}
                </button>
              ) : (
                <span className="muted">{tr('waitingHostRestart')}</span>
              )}
              <button className="secondary" onClick={goHome}>{tr('home')}</button>
              {mode !== 'lan-guest' && (
                <button className="ghost" onClick={() => setScreen('record')}>
                  {tr('seeRecord')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <div className="section-head">
        <p className="eyebrow">{tr('eyebrow')}</p>
        <h1 className="screen-title">{tr('rulesTitle')}</h1>
        <p className="lede">{tr('rulesIntro')}</p>
      </div>
      <div className="rules-example">
        <SetExample lang={lang} />
      </div>
      <ol className="rules-list">
        <li>{tr('rule1')}</li>
        <li>{tr('rule2')}</li>
        <li>{tr('rule3')}</li>
        <li>{tr('rule4')}</li>
        <li>{tr('rule5')}</li>
        <li>{tr('rule6')}</li>
      </ol>
      <div className="rules-notes">
        <div>
          <h3>{tr('rulesAiTitle')}</h3>
          <p>{tr('rulesAiBody')}</p>
        </div>
        <div>
          <h3>{tr('rulesLanTitle')}</h3>
          <p>{tr('rulesLanBody')}</p>
        </div>
      </div>
      <button className="primary" onClick={() => setScreen('home')}>{tr('close')}</button>
    </main>
  );

  const leaders = Object.entries(record.players)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.wins - a.wins || b.best - a.best || b.games - a.games)
    .slice(0, 8);

  const recordScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>← {tr('back')}</button>
      <div className="section-head">
        <p className="eyebrow">{tr('eyebrow')}</p>
        <h1 className="screen-title">{tr('statsTitle')}</h1>
        <p className="lede">{tr('statsLede')}</p>
      </div>

      <div className="record-summary">
        <div><strong>{record.games}</strong><span>{tr('totalGames')}</span></div>
        <div>
          <strong>{record.bestScore}</strong>
          <span>{tr('bestScore')}</span>
          {record.bestName && <small>{tr('bestBy', { name: record.bestName })}</small>}
        </div>
        <div><strong>{record.streak}</strong><span>{tr('streak')}</span></div>
        <div><strong>{record.draws}</strong><span>{tr('draws')}</span></div>
      </div>

      <section className="record-section">
        <h2>{tr('leaderboard')}</h2>
        {leaders.length === 0 ? (
          <p className="empty-state">{tr('noRecord')}</p>
        ) : (
          <table className="leaderboard">
            <thead>
              <tr>
                <th>{tr('player')}</th>
                <th>{tr('wins')}</th>
                <th>{tr('best')}</th>
                <th>{tr('played')}</th>
              </tr>
            </thead>
            <tbody>
              {leaders.map((leader) => (
                <tr key={leader.name}>
                  <td>{leader.name}</td>
                  <td>{leader.wins}</td>
                  <td>{leader.best}</td>
                  <td>{leader.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="record-section">
        <h2>{tr('recentGames')}</h2>
        {record.recent.length === 0 ? (
          <p className="empty-state">{tr('noGamesYet')}</p>
        ) : (
          <ul className="recent-list">
            {record.recent.map((game) => (
              <li key={`${game.at}-${game.winner}`}>
                <span className="recent-date">
                  {new Date(game.at).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span className="recent-mode">{tr(resultModeLabel(game.mode))}</span>
                <span className="recent-winner">
                  {game.draw ? tr('draw') : game.winner}
                </span>
                <span className="recent-scores">
                  {game.scores.map((score) => `${score.name} ${score.score}`).join(' · ')}
                </span>
                <span className="recent-sets">{setsText(game.sets)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button className="secondary" onClick={handleClearRecord}>{tr('clearRecord')}</button>
      {toast && <div className={`toast ${toast.tone}`}>{toast.text}</div>}
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={closeToHome}>← {tr('back')}</button>

      {mode === 'lan-guest' || guestRoom ? (
        <>
          <div className="section-head">
            <p className="eyebrow">{tr('eyebrow')}</p>
            <h1 className="screen-title">{tr('lanJoinTitle')}</h1>
            <p className="lede">{guestRoom ? tr('lanCodeShort', { code: guestRoom }) : tr('lanJoinHint')}</p>
          </div>

          {!guest && (
            <div className="lan-form">
              <label className="field">
                <span>{tr('lanName')}</span>
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  maxLength={18}
                  placeholder={tr('namePlaceholder')}
                />
              </label>
              <label className="field">
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
                onClick={joinGuest}
                disabled={guestConnecting || !guestName.trim()}
              >
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
              <p className="tip">{tr('lanJoinHint')}</p>
            </div>
          )}

          {guest && !guestStarted && (
            <div className="waiting-card">
              <span className="spinner" aria-hidden="true" />
              <strong>{tr('lanGuestWaiting')}</strong>
              <p>{tr('lanSameWifi')}</p>
            </div>
          )}
          {guest && guestStarted && (
            <button className="primary wide" onClick={() => setScreen('game')}>
              {tr('lanStart')}
            </button>
          )}
          {lanError && <p className="error">{lanError}</p>}
          {toast && <div className={`toast ${toast.tone}`}>{toast.text}</div>}
        </>
      ) : (
        <>
          <div className="section-head">
            <p className="eyebrow">{tr('eyebrow')}</p>
            <h1 className="screen-title">{tr('lanHostTitle')}</h1>
            <p className="lede">{tr('lanHostOpen')}</p>
          </div>

          {lanBusy && <p className="lede">{tr('lanStarting')}</p>}
          {lanError && <p className="error">{lanError}</p>}

          {lanInfo && lanInvite ? (
            <div className="lan-layout">
              <div className="lan-card">
                <span className="label">{tr('lanCode')}</span>
                <div className="room-code big">{lanCode}</div>
                <p>{lanPlayers.filter((player) => player.connected).length >= 2 ? tr('lanReady') : tr('lanWaiting')}</p>
                <ul className="peer-list">
                  {lanPlayers.slice(0, 4).map((player) => (
                    <li key={player.seat} className={player.connected ? 'online' : 'offline'}>
                      <span className={`seat-dot seat-${player.seat}`} />
                      <span>{player.connected ? player.name : tr('openSeat')}</span>
                      {player.host && player.name.toLowerCase() !== tr('lanHostSeat').toLowerCase() && (
                        <em>{tr('lanHostSeat')}</em>
                      )}
                      <span className="peer-state">{player.connected ? '●' : '○'}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className="primary wide"
                  onClick={startLanMatch}
                  disabled={lanPlayers.filter((player) => player.connected).length < 2}
                >
                  {tr('lanStart')}
                </button>
                <button className="secondary wide" onClick={copyInvite}>
                  {tr('lanCopy')}
                </button>
                <p className="tip">{tr('lanStartNote')}</p>
              </div>
              <div className="qr-card">
                {lanQr ? <img src={lanQr} alt={tr('lanScan')} /> : null}
                <p>{tr('lanScan')}</p>
                <code>{inviteLabel}</code>
              </div>
            </div>
          ) : null}

          {!lanBusy && !lanError && !lanInvite && (
            <p className="empty-state">{tr('lanSameWifi')}</p>
          )}
          {toast && <div className={`toast ${toast.tone}`}>{toast.text}</div>}
        </>
      )}
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'record') return recordScreen;
  if (screen === 'lan') return lanScreen;
  return home;
}
