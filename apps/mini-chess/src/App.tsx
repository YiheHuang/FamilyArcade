import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import QRCode from 'qrcode';
import {
  LanGuest,
  LanHost,
  guestParams,
  newRoomCode,
  type LanPublicPeer,
} from '@family-arcade/lan';
import { chooseMove, hint as coachHint, type AiLevel, type Hint } from './ai/ai';
import { Board, PieceGlyph } from './components/Board';
import {
  apply,
  applySeat,
  findKing,
  isInCheck,
  legalMoves,
  setup,
  view,
  type Color,
  type GameState,
  type LegalMove,
  type Piece,
  type PieceType,
  type SeatView,
} from './game/chess';
import { detectLang, t, type Lang, type MessageKey } from './i18n';
import { guestWsUrl, hostWsUrl, inviteUrl, startLanServer, type LanServerInfo } from './net';
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

const AI_LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const HINT_KEYS: Record<Hint['reason'], MessageKey> = {
  mate: 'hintMate',
  capture: 'hintCapture',
  promotion: 'hintPromotion',
  check: 'hintCheck',
  draw: 'hintDraw',
  advance: 'hintAdvance',
  develop: 'hintDevelop',
};

const PROMOTION_KEYS: Record<'R' | 'B' | 'N', MessageKey> = {
  R: 'promoteRook',
  B: 'promoteBishop',
  N: 'promoteKnight',
};

const PROMOTION_GLYPHS: Record<'R' | 'B' | 'N', string> = {
  R: '♜',
  B: '♝',
  N: '♞',
};

const PIECE_VALUES: { type: PieceType; value: string }[] = [
  { type: 'P', value: '1' },
  { type: 'N', value: '3' },
  { type: 'B', value: '3' },
  { type: 'R', value: '5' },
  { type: 'K', value: '∞' },
];

function asSeatView(value: unknown): SeatView | null {
  const candidate = value as Partial<SeatView> | null;
  if (!candidate || !Array.isArray(candidate.board) || candidate.board.length !== 30) return null;
  if (candidate.turn !== 'w' && candidate.turn !== 'b') return null;
  return candidate as SeatView;
}

function PlayerBadge({
  side,
  name,
  active,
  thinking,
  captured,
  lang,
}: {
  side: Color;
  name: string;
  active: boolean;
  thinking?: boolean;
  captured: PieceType[];
  lang: Lang;
}) {
  const capturedColor: Color = side === 'w' ? 'b' : 'w';
  const sideLabel = t(lang, side === 'w' ? 'white' : 'black');
  const detail =
    name === sideLabel
      ? thinking
        ? `${t(lang, 'thinking')}…`
        : ''
      : `${sideLabel}${thinking ? ` · ${t(lang, 'thinking')}…` : ''}`;
  return (
    <div className={`player-badge ${side} ${active ? 'active' : ''}`}>
      <div className={`badge-piece ${side}`}>
        <PieceGlyph piece={side === 'w' ? 'wK' : 'bK'} />
      </div>
      <div className="badge-copy">
        <strong>{name}</strong>
        {detail && <small>{detail}</small>}
      </div>
      <div className="captured-tray" aria-label={t(lang, 'captured')}>
        {captured.map((type, index) => (
          <PieceGlyph key={`${type}-${index}`} piece={`${capturedColor}${type}` as Piece} />
        ))}
      </div>
    </div>
  );
}

function modeLabel(lang: Lang, mode: Mode, level: AiLevel): string {
  if (mode === 'ai') return `${t(lang, 'modeAi')} · ${t(lang, level)}`;
  if (mode === 'local') return t(lang, 'modeLocal');
  if (mode === 'lan-host') return t(lang, 'modeLanHost');
  return t(lang, 'modeLanGuest');
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [state, setState] = useState<GameState>(() => setup());
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [hint, setHint] = useState<{ from: number; to: number; reason: Hint['reason'] } | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [promotion, setPromotion] = useState<{
    from: number;
    to: number;
    options: PieceType[];
  } | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [flipBoard, setFlipBoard] = useState(false);
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.mini-chess.sound') !== 'off';
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
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestJoined, setGuestJoined] = useState(false);
  const [guestName, setGuestName] = useState(() => guestParams()?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => guestParams()?.code ?? '');
  const [guestRoom] = useState(() => guestParams()?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const moveListRef = useRef<HTMLOListElement | null>(null);
  const recordedRef = useRef(false);
  const commitRef = useRef<(next: GameState, currentMode: Mode, previous: GameState) => void>(
    () => undefined,
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const tr = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params),
    [lang],
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
      localStorage.setItem('familyarcade.mini-chess.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const finish = useCallback(
    (next: GameState, currentMode: Mode) => {
      if (next.status === 'playing' || recordedRef.current) return;
      recordedRef.current = true;
      if (currentMode === 'ai' || currentMode === 'local') {
        setRecord(recordResult(next));
        clearSave();
        setSaved(null);
      }
      if (soundOn) chime(next.status === 'draw' || next.status === 'stalemate' ? 'draw' : 'win');
    },
    [soundOn],
  );

  const commit = useCallback(
    (next: GameState, currentMode: Mode, previous: GameState) => {
      setHistory((items) => [...items, previous]);
      setState(next);
      stateRef.current = next;
      setSelected(null);
      setHint(null);
      setPromotion(null);
      const move = next.moves[next.moves.length - 1];
      if (soundOn && move && next.status === 'playing') {
        const checking = isInCheck(next.board, next.turn);
        chime(move.captured ? 'capture' : checking ? 'check' : 'move');
      }
      finish(next, currentMode);
      if (currentMode === 'ai' || currentMode === 'local') {
        if (next.status === 'playing') {
          saveGame({ state: next, mode: currentMode, level });
          setSaved(loadSave());
        }
      }
      if (currentMode === 'lan-host' && hostRef.current) {
        hostRef.current.sendView(1, view(next, 1));
        if (next.status !== 'playing') hostRef.current.sendResult(view(next, 1));
      }
    },
    [finish, level, soundOn],
  );

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

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
    setGuestJoined(false);
  }, [guest]);

  const goHome = useCallback(() => {
    if (mode === 'lan-host' || mode === 'lan-guest') closeLan();
    setSelected(null);
    setPromotion(null);
    setHint(null);
    setScreen('home');
    setSaved(loadSave());
  }, [closeLan, mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (promotion) {
        setPromotion(null);
        return;
      }
      if (screen === 'game') {
        goHome();
      } else if (screen !== 'home') {
        setScreen('home');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goHome, promotion, screen]);

  const startFresh = useCallback(
    (nextMode: 'ai' | 'local') => {
      const next = setup();
      setMode(nextMode);
      setState(next);
      stateRef.current = next;
      setHistory([]);
      setSelected(null);
      setHint(null);
      setPromotion(null);
      recordedRef.current = false;
      setAiThinking(false);
      setFlipBoard(false);
      setScreen('game');
      clearSave();
      setSaved(null);
    },
    [],
  );

  const startAi = () => {
    setMode('ai');
    setScreen('setup');
  };

  const resume = () => {
    if (!saved) return;
    setMode(saved.mode);
    setLevel(saved.level);
    setState(saved.state);
    stateRef.current = saved.state;
    setHistory([]);
    setSelected(null);
    setHint(null);
    setPromotion(null);
    recordedRef.current = false;
    setAiThinking(false);
    setFlipBoard(false);
    setScreen('game');
    setSaved(null);
  };

  const undo = () => {
    if (history.length === 0 || aiThinking || mode === 'lan-host' || mode === 'lan-guest') return;
    if (state.status !== 'playing') return;
    const items = history.slice();
    let previous: GameState | undefined = items.pop();
    if (!previous) return;
    if (mode === 'ai') {
      while (previous.turn !== 'w' && items.length > 0) {
        const earlier = items.pop();
        if (!earlier) break;
        previous = earlier;
      }
    }
    setHistory(items);
    setState(previous);
    stateRef.current = previous;
    setSelected(null);
    setHint(null);
    setPromotion(null);
    recordedRef.current = false;
    if (previous.status === 'playing') {
      saveGame({ state: previous, mode: mode === 'ai' ? 'ai' : 'local', level });
      setSaved(loadSave());
    } else {
      clearSave();
      setSaved(null);
    }
  };

  const showHint = () => {
    if (state.status !== 'playing' || mode === 'lan-guest' || hintBusy) return;
    const forState = state;
    setHintBusy(true);
    window.setTimeout(() => {
      const found = coachHint(forState);
      setHintBusy(false);
      if (!found || stateRef.current !== forState) return;
      setHint({ from: found.move.from, to: found.move.to, reason: found.reason });
      setToast(t(lang, HINT_KEYS[found.reason]));
    }, 30);
  };

  const openLanHost = async () => {
    closeLan();
    setScreen('lan');
    setMode('lan-host');
    setFlipBoard(false);
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
        if (players[1]?.connected && host.started) {
          const send = () => host.sendView(1, view(stateRef.current, 1));
          send();
          // A reconnecting guest may register its view handler just after the
          // peer-join event; send once more after the join settles.
          window.setTimeout(() => {
            if (host.status === 'open') send();
          }, 700);
        }
      });
      host.onIntent((seat, intent) => {
        const payload = intent as
          | { type?: unknown; from?: unknown; to?: unknown; promotion?: unknown }
          | null;
        if (!payload || payload.type !== 'move') return;
        const from = Number(payload.from);
        const to = Number(payload.to);
        if (!Number.isInteger(from) || !Number.isInteger(to)) return;
        const promo =
          payload.promotion === 'R' || payload.promotion === 'B' || payload.promotion === 'N'
            ? payload.promotion
            : undefined;
        const current = stateRef.current;
        const result = applySeat(current, seat, from, to, promo);
        if (!result.ok) return;
        commitRef.current(result.state, 'lan-host', current);
      });
      host.onClose(() => {
        setLanError(t(lang, 'lanClosed'));
        setLanPlayers([]);
      });
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#2b3a30', light: '#fffaf0' },
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
    const next = setup();
    setState(next);
    stateRef.current = next;
    setHistory([]);
    setSelected(null);
    setHint(null);
    setPromotion(null);
    recordedRef.current = false;
    setAiThinking(false);
    lanHost.start();
    lanHost.sendView(1, view(next, 1));
    setScreen('game');
  };

  const joinGuest = async () => {
    if (!guestRoom || !guestName.trim() || !guestCode.trim()) return;
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
      setMode('lan-guest');
      setFlipBoard(true);
      joined.onView((payload) => {
        const next = asSeatView(payload);
        if (!next) return;
        setGuestView(next);
        setSelected(null);
        setHint(null);
        setPromotion(null);
        setGuestStarted(true);
        setScreen('game');
      });
      joined.onStart(() => {
        setGuestStarted(true);
        setScreen('game');
      });
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? t(lang, 'lanFull') : t(lang, 'lanWrong'));
      });
      setGuestStarted(false);
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      setLanError(
        reason === 'room-full'
          ? t(lang, 'lanFull')
          : reason.includes('rejected') || reason.includes('wrong-code')
            ? t(lang, 'lanWrong')
            : t(lang, 'lanDisconnected'),
      );
    } finally {
      setGuestConnecting(false);
    }
  };

  // Auto-join when the URL contains a room.
  useEffect(() => {
    if (!guestRoom) return;
    setScreen('lan');
    setMode('lan-guest');
    setFlipBoard(true);
  }, [guestRoom]);

  // The shared guest helper has no close callback; watch its public status so a
  // guest returns to the lobby with a clear message if the host closes.
  useEffect(() => {
    if (!guest) return;
    const timer = window.setInterval(() => {
      if (guest.status !== 'closed') return;
      setLanError(t(lang, 'lanClosed'));
      setGuestView(null);
      setGuestStarted(false);
      setGuestJoined(false);
      setGuest(null);
      setScreen('lan');
    }, 1200);
    return () => window.clearInterval(timer);
  }, [guest, lang]);

  const isGuest = mode === 'lan-guest';
  const shownBoard = guestView?.board ?? state.board;
  const shownTurn = guestView?.turn ?? state.turn;
  const shownStatus = guestView?.status ?? state.status;
  const shownWinner = guestView?.winner ?? state.winner;
  const shownDrawReason = guestView?.drawReason ?? state.drawReason;
  const shownMoves = guestView?.moves ?? state.moves;
  const shownCaptured = guestView?.captured ?? view(state, 0).captured;

  useEffect(() => {
    const node = moveListRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [shownMoves.length]);

  const localCheck = isInCheck(state.board, state.turn);
  const shownCheck = guestView?.check ?? localCheck;
  const shownCheckSquare =
    guestView?.checkSquare ??
    (localCheck && state.status !== 'draw' && state.status !== 'stalemate'
      ? findKing(state.board, state.turn)
      : null);
  const lastMove = guestView?.lastMove ?? state.moves[state.moves.length - 1] ?? null;

  const localLegal = useMemo(
    () => (state.status === 'playing' ? legalMoves(state) : []),
    [state],
  );
  const activeLegal: LegalMove[] = isGuest ? (guestView?.legal ?? []) : localLegal;

  const guestCanPlay = Boolean(isGuest && guestStarted && guestView?.canMove);
  const hostConnected = mode === 'lan-host' ? Boolean(lanPlayers[1]?.connected) : true;
  const humanColor: Color | null = isGuest
    ? 'b'
    : mode === 'ai' || mode === 'lan-host'
      ? 'w'
      : null;
  const canPlayNow =
    screen === 'game' &&
    shownStatus === 'playing' &&
    hostConnected &&
    !promotion &&
    (isGuest
      ? guestCanPlay
      : mode === 'ai'
        ? state.turn === 'w' && !aiThinking
        : mode === 'local'
          ? true
          : mode === 'lan-host'
            ? state.turn === 'w'
            : false);

  const dispatchMove = useCallback(
    (from: number, to: number, promotionPiece?: PieceType) => {
      setSelected(null);
      setHint(null);
      setPromotion(null);
      if (isGuest) {
        if (guest && guestView?.canMove) {
          guest.sendIntent({ type: 'move', from, to, promotion: promotionPiece });
        }
        return;
      }
      const result =
        mode === 'lan-host'
          ? applySeat(state, 0, from, to, promotionPiece)
          : apply(state, from, to, promotionPiece);
      if (!result.ok) return;
      commit(result.state, mode, state);
    },
    [commit, guest, guestView, isGuest, mode, state],
  );

  const handleCell = (index: number) => {
    if (!canPlayNow) return;
    const boardNow = isGuest ? guestView?.board : state.board;
    if (!boardNow) return;
    const colorNow: Color | null = isGuest
      ? (guestView?.color ?? 'b')
      : humanColor ?? state.turn;
    const legalNow = isGuest ? (guestView?.legal ?? []) : localLegal;
    const piece = boardNow[index];

    if (index === selected) {
      setSelected(null);
      return;
    }

    if (selected !== null) {
      const candidates = legalNow.filter((move) => move.from === selected && move.to === index);
      if (candidates.length > 0) {
        const options = Array.from(
          new Set(
            candidates
              .map((move) => move.promotion)
              .filter((value): value is PieceType => Boolean(value)),
          ),
        );
        if (options.length > 0) {
          setPromotion({ from: selected, to: index, options });
          return;
        }
        dispatchMove(selected, index);
        return;
      }
    }

    if (piece && colorNow && piece[0] === colorNow) {
      setSelected(index);
      setHint(null);
      return;
    }
    setSelected(null);
  };

  const choosePromotion = (piece: PieceType) => {
    if (!promotion) return;
    const current = promotion;
    dispatchMove(current.from, current.to, piece);
  };

  // AI reply.
  useEffect(() => {
    if (screen !== 'game' || mode !== 'ai') return;
    if (state.status !== 'playing' || state.turn !== 'b') return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseMove(state, level);
      setAiThinking(false);
      if (!move) return;
      const result = apply(state, move.from, move.to, move.promotion ?? undefined);
      if (result.ok) commit(result.state, 'ai', state);
    }, 420);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [commit, level, mode, screen, state]);

  const restart = () => {
    if (mode === 'lan-guest') return;
    if (mode === 'lan-host' && lanHost) {
      const next = setup();
      setState(next);
      stateRef.current = next;
      setHistory([]);
      setSelected(null);
      setHint(null);
      setPromotion(null);
      recordedRef.current = false;
      lanHost.sendView(1, view(next, 1));
      return;
    }
    startFresh(mode === 'local' ? 'local' : 'ai');
  };

  const targetMoves = selected === null ? [] : activeLegal.filter((move) => move.from === selected);
  const displayStatus = (() => {
    if (isGuest && (!guestStarted || !guestView)) return t(lang, 'lanWaiting');
    if (shownStatus === 'checkmate') {
      return shownWinner === 'w' ? t(lang, 'whiteWins') : t(lang, 'blackWins');
    }
    if (shownStatus === 'stalemate') return t(lang, 'stalemate');
    if (shownStatus === 'draw') {
      return shownDrawReason === 'fifty-move' ? t(lang, 'drawFifty') : t(lang, 'drawMaterial');
    }
    const base = shownTurn === 'w' ? t(lang, 'turnWhite') : t(lang, 'turnBlack');
    return shownCheck ? `${base} · ${t(lang, 'check')}` : base;
  })();

  const resultKey: MessageKey | null =
    shownStatus === 'checkmate'
      ? shownWinner === 'w'
        ? 'whiteWins'
        : 'blackWins'
      : shownStatus === 'stalemate'
        ? 'stalemate'
        : shownStatus === 'draw'
          ? shownDrawReason === 'fifty-move'
            ? 'drawFifty'
            : 'drawMaterial'
          : null;

  const whiteName =
    mode === 'ai' || mode === 'lan-host'
      ? tr('you')
      : mode === 'lan-guest'
        ? tr('lanHostName')
        : tr('white');
  const blackName =
    mode === 'ai'
      ? `${tr('aiOpponent')} · ${tr(level)}`
      : mode === 'lan-host'
        ? lanPlayers[1]?.name || tr('lanGuestName')
        : mode === 'lan-guest'
          ? tr('you')
          : tr('black');
  const activeColor = isGuest && !guestView ? null : shownTurn;
  const chipColor = shownStatus === 'checkmate' ? shownWinner : activeColor;
  const thinkingForBlack = aiThinking && shownTurn === 'b' && mode === 'ai';
  const topSide: Color = flipBoard ? 'w' : 'b';
  const bottomSide: Color = flipBoard ? 'b' : 'w';
  const promotionColor: Color = isGuest ? 'b' : state.turn;
  const defaultHelp = isGuest
    ? tr('lanGuestSeat')
    : mode === 'lan-host'
      ? tr('lanHostSeat')
      : mode === 'ai'
        ? tr('setupSideNote')
        : tr('localHint');

  const trapPromotionFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">FAMILY ARCADE · 19/27</p>
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
        <div className="hero-board">
          <div className="hero-plaque">
            <span>5 × 6</span>
            <span>{tr('heroPlaque')}</span>
          </div>
          <Board board={setup().board} lang={lang} interactive={false} />
          <p className="hero-board-note">{tr('setupBoardNote')}</p>
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
            <button className="secondary wide" onClick={() => startFresh('local')}>
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
            <span>{record.games === 1 ? tr('gameOne') : tr('games')}</span>
            <span className="dot">·</span>
            <span>
              {record.winsW} {tr('white')}
            </span>
            <span className="dot">·</span>
            <span>
              {record.winsB} {tr('black')}
            </span>
            <span className="dot">·</span>
            <span>
              {record.draws} {tr('draws')}
            </span>
          </div>
        </div>
      </section>

      <section className="quick-rules">
        <div className="quick-head">
          <h2>{tr('quickTitle')}</h2>
          <span className="quick-chips">
            <span>{tr('quickPieces')}</span>
            <span>{tr('quickAi')}</span>
            <span>{tr('quickLan')}</span>
          </span>
        </div>
        <div className="quick-grid">
          <article>
            <span className="quick-number">01</span>
            <p>{tr('quick1')}</p>
          </article>
          <article>
            <span className="quick-number">02</span>
            <p>{tr('quick2')}</p>
          </article>
          <article>
            <span className="quick-number">03</span>
            <p>{tr('quick3')}</p>
          </article>
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
      <div className="setup-head">
        <div>
          <h2 className="screen-title">{tr('difficulty')}</h2>
          <p className="lede">{tr('setupLede')}</p>
        </div>
        <span className="level-card-illustration" aria-hidden="true">
          <b>5×6</b>
          <small>{tr('quickPieces')}</small>
        </span>
      </div>
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
      <div className="setup-lower">
        <div className="setup-sample">
          <Board board={setup().board} lang={lang} interactive={false} />
        </div>
        <div className="setup-notes">
          <p>{tr('setupSideNote')}</p>
          <p>{tr('setupBoardNote')}</p>
          <div className="row-actions">
            <button className="primary" onClick={() => startFresh('ai')}>
              {tr('beginGame')}
            </button>
            <button className="ghost" onClick={() => setScreen('home')}>
              {tr('back')}
            </button>
          </div>
        </div>
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
        <div className="game-top-actions">
          <button className="ghost" onClick={() => setFlipBoard((value) => !value)}>
            {tr('flip')}
          </button>
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
            <span className={`turn-chip ${chipColor ?? 'w'}`}>{chipColor === 'b' ? '♚' : '♔'}</span>
            <div aria-live="polite">
              <strong>{displayStatus}</strong>
              {shownStatus === 'playing' && <p>{defaultHelp}</p>}
            </div>
            {aiThinking && <span className="thinking">…</span>}
          </div>

          <PlayerBadge
            side={topSide}
            name={topSide === 'w' ? whiteName : blackName}
            active={
              shownStatus === 'checkmate'
                ? shownWinner === topSide
                : activeColor === topSide && shownStatus === 'playing'
            }
            thinking={topSide === 'b' && thinkingForBlack}
            captured={topSide === 'w' ? shownCaptured.w : shownCaptured.b}
            lang={lang}
          />

          <div className="board-frame">
            <Board
              board={shownBoard}
              selected={selected}
              targets={targetMoves}
              last={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
              checkSquare={shownCheckSquare}
              hint={hint ? { from: hint.from, to: hint.to } : null}
              flipped={flipBoard}
              lang={lang}
              onCell={handleCell}
            />
          </div>

          <PlayerBadge
            side={bottomSide}
            name={bottomSide === 'w' ? whiteName : blackName}
            active={
              shownStatus === 'checkmate'
                ? shownWinner === bottomSide
                : activeColor === bottomSide && shownStatus === 'playing'
            }
            thinking={bottomSide === 'b' && thinkingForBlack}
            captured={bottomSide === 'w' ? shownCaptured.w : shownCaptured.b}
            lang={lang}
          />

          {shownStatus === 'playing' && shownCheck && (
            <div className="check-banner">{tr('checkBanner')}</div>
          )}

          {resultKey && (
            <div className="result-banner" role="status">
              <div>
                <span className="result-label">
                  {shownStatus === 'checkmate'
                    ? tr('checkmate')
                    : shownStatus === 'stalemate'
                      ? tr('stalemate')
                      : tr('draw')}
                </span>
                <strong>{tr(resultKey)}</strong>
              </div>
              {isGuest ? (
                <span className="muted">{tr('lanWaiting')}</span>
              ) : (
                <button className="primary" onClick={restart}>
                  {tr('restart')}
                </button>
              )}
            </div>
          )}
        </section>

        <aside className="side">
          <div className="side-card coach-card">
            <h3>{tr('hintTitle')}</h3>
            {hint && <p className="coach-text">{tr(HINT_KEYS[hint.reason])}</p>}
            <div className="side-actions">
              <button
                className="secondary"
                onClick={undo}
                disabled={
                  history.length === 0 ||
                  mode === 'lan-guest' ||
                  mode === 'lan-host' ||
                  aiThinking ||
                  state.status !== 'playing'
                }
              >
                {tr('undo')}
              </button>
              <button
                className="secondary"
                onClick={showHint}
                disabled={shownStatus !== 'playing' || isGuest || hintBusy}
              >
                {hintBusy ? `${tr('hint')}…` : tr('hint')}
              </button>
              <button
                className="secondary"
                onClick={restart}
                disabled={isGuest}
              >
                {tr('newGame')}
              </button>
            </div>
            <p className="keyboard-note">{tr('keyboardHint')}</p>
          </div>

          <div className="side-card move-card">
            <h3>{tr('moveLog')}</h3>
            {shownMoves.length === 0 ? (
              <p>{tr('noMoves')}</p>
            ) : (
              <ol className="move-list" ref={moveListRef}>
                {shownMoves.map((move, index) => (
                  <li key={`${move.from}-${move.to}-${index}`} className={index === shownMoves.length - 1 ? 'latest' : ''}>
                    <span className="move-number">{index % 2 === 0 ? `${Math.floor(index / 2) + 1}.` : ''}</span>
                    <span className="move-side">{move.color === 'w' ? '♔' : '♚'}</span>
                    <span className="move-notation">{move.notation}</span>
                  </li>
                ))}
              </ol>
            )}
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

          {mode === 'lan-guest' && (
            <div className="side-card lan-mini">
              <h3>{tr('lanGuestSeat')}</h3>
              <p>{guestStarted ? tr('lanReady') : tr('lanWaiting')}</p>
            </div>
          )}

          {lanError && (mode === 'lan-host' || mode === 'lan-guest') && (
            <div className="side-card">
              <p className="error">{lanError}</p>
            </div>
          )}

          <div className="side-card record-mini">
            <h3>{tr('stats')}</h3>
            <p>
              {record.games} {record.games === 1 ? tr('gameOne') : tr('games')} · {record.winsW}/{record.winsB}/{record.draws}
            </p>
            <button className="text-button" onClick={() => setRecord(clearRecord())}>
              {tr('resetStats')}
            </button>
          </div>
        </aside>
      </div>

      {promotion && (
        <div className="modal-backdrop" onClick={() => setPromotion(null)}>
          <div
            className="promotion-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="promotion-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={trapPromotionFocus}
          >
            <h3 id="promotion-title">{tr('promotionTitle')}</h3>
            <p>{tr('promotionLede')}</p>
            <div className="promotion-row">
              {promotion.options.map((option, index) => (
                <button
                  key={option}
                  className="promotion-choice"
                  autoFocus={index === 0}
                  onClick={() => choosePromotion(option)}
                >
                  <span className={`promotion-glyph ${promotionColor}`}>{PROMOTION_GLYPHS[option as 'R' | 'B' | 'N']}</span>
                  <span>{tr(PROMOTION_KEYS[option as 'R' | 'B' | 'N'])}</span>
                </button>
              ))}
            </div>
            <button className="text-button" onClick={() => setPromotion(null)}>
              {tr('cancel')}
            </button>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );

  const statsScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('statsTitle')}</h2>
      <p className="lede">{tr('statsLede')}</p>
      <div className="stat-grid">
        <div className="stat-card accent">
          <span>{tr('totalGames')}</span>
          <strong>{record.games}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('whiteWinsStat')}</span>
          <strong>{record.winsW}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('blackWinsStat')}</span>
          <strong>{record.winsB}</strong>
        </div>
        <div className="stat-card">
          <span>{tr('drawsStat')}</span>
          <strong>{record.draws}</strong>
        </div>
      </div>
      <div className="record-meter">
        <div className="record-meter-head">
          <span>{tr('winRate')}</span>
          <strong>{record.games ? Math.round((record.winsW / record.games) * 100) : 0}%</strong>
        </div>
        <div className="meter-track">
          <span style={{ width: `${record.games ? Math.round((record.winsW / record.games) * 100) : 0}%` }} />
        </div>
      </div>
      {record.games === 0 && <p className="empty-note">{tr('noGames')}</p>}
      <p className="muted">{tr('recordLocal')}</p>
      <p className="muted">{tr('recordNote')}</p>
      <div className="row-actions">
        <button className="primary" onClick={() => setScreen('home')}>
          {tr('back')}
        </button>
        <button className="secondary" onClick={() => setRecord(clearRecord())}>
          {tr('clearRecord')}
        </button>
      </div>
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell">
      <button className="back" onClick={() => setScreen('home')}>
        ← {tr('back')}
      </button>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <p className="lede">{tr('rulesLede')}</p>
      <div className="rules-article">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((number) => (
          <section key={number}>
            <span className="rule-number">{String(number).padStart(2, '0')}</span>
            <div>
              <h3>{tr(`rule${number}Title` as MessageKey)}</h3>
              <p>{tr(`rule${number}` as MessageKey)}</p>
            </div>
          </section>
        ))}
      </div>
      <div className="pieces-card">
        <div>
          <h3>{tr('piecesTitle')}</h3>
          <p>{tr('piecesNote')}</p>
        </div>
        <div className="piece-values">
          {PIECE_VALUES.map((item) => (
            <div key={item.type}>
              <PieceGlyph piece={`w${item.type}` as Piece} />
              <span>{tr(`piece${item.type}` as MessageKey)}</span>
              <b>{item.value}</b>
            </div>
          ))}
        </div>
      </div>
      <button className="primary" onClick={() => setScreen('home')}>
        {tr('rulesClose')}
      </button>
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell">
      <button
        className="back"
        onClick={() => {
          goHome();
        }}
      >
        ← {tr('back')}
      </button>
      {mode === 'lan-guest' || guestRoom ? (
        <>
          <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
          <p className="lede">
            {tr('lanCode')} · {guestRoom}
          </p>
          {!guestJoined && (
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
                disabled={guestConnecting || !guestName.trim() || !guestCode.trim()}
              >
                {guestConnecting ? tr('lanConnecting') : tr('lanJoinButton')}
              </button>
            </div>
          )}
          {guestJoined && !guestStarted && (
            <div className="waiting-card">
              <span className="pulse-dot" />
              <p>{tr('lanWaiting')}</p>
            </div>
          )}
          {guestStarted && (
            <button className="primary" onClick={() => setScreen('game')}>
              {tr('lanStart')}
            </button>
          )}
          <p className="muted">{tr('lanGuestHelp')}</p>
          {lanError && <p className="error">{lanError}</p>}
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
                  className="primary wide"
                  onClick={startLan}
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
              </div>
              <div className="qr-card">
                {lanQr ? <img src={lanQr} alt={tr('lanScan')} /> : null}
                <p>{tr('lanScan')}</p>
                <code>{lanInvite.replace(/^https?:\/\//, '')}</code>
              </div>
            </div>
          )}
          <p className="muted">{tr('lanHostHelp')}</p>
          <p className="muted">{tr('lanWifiNote')}</p>
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
  return home;
}
