import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LanGuest, LanHost, guestParams, newRoomCode, type LanPublicPeer } from '@family-arcade/lan';
import { chooseGuess, type AiLevel, type AiNote } from './ai/ai';
import { CodePicker } from './components/CodePicker';
import { GuessBoard } from './components/GuessBoard';
import { CodeRow, FeedbackDots, PEG_LABEL, PegDot } from './components/Pegs';
import {
  COLORS,
  MAX_GUESSES,
  applySeat,
  randomCode,
  revealPeg,
  setup,
  view,
  type Code,
  type Feedback,
  type GameAction,
  type GameState,
  type Peg,
  type Seat,
  type SeatView,
} from './game/codebreak';
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
  type SavedGame,
} from './storage';
import { chime } from './sound';

type Screen = 'home' | 'setup' | 'game' | 'rules' | 'lan' | 'record' | 'handoff';
type Mode = 'ai' | 'local' | 'lan-host' | 'lan-guest';
type SoloRole = 'breaker' | 'setter';

const LEVELS: { id: AiLevel; label: MessageKey; note: MessageKey }[] = [
  { id: 'companion', label: 'companion', note: 'companionHint' },
  { id: 'easy', label: 'easy', note: 'easyHint' },
  { id: 'normal', label: 'normal', note: 'normalHint' },
  { id: 'hard', label: 'hard', note: 'hardHint' },
];

const NOTE_KEYS: Record<AiNote, MessageKey> = {
  opening: 'hintNoteOpening',
  consistent: 'hintNoteConsistent',
  elimination: 'hintNoteElimination',
  minimax: 'hintNoteMinimax',
  gentle: 'hintNoteGentle',
};

const HERO_ROWS: { code: Code; feedback: Feedback }[] = [
  { code: ['red', 'yellow', 'green', 'blue'], feedback: { black: 1, white: 2 } },
  { code: ['purple', 'red', 'blue', 'orange'], feedback: { black: 2, white: 1 } },
  { code: ['yellow', 'green', 'red', 'purple'], feedback: { black: 0, white: 3 } },
];

const emptyCode = (): (Peg | null)[] => [null, null, null, null];

interface HintState {
  code: Code;
  candidates: number;
  worstCase: number;
  note: AiNote;
}

function fillCode(value: readonly (Peg | null)[], color: Peg): (Peg | null)[] {
  const index = value.findIndex((peg) => peg === null);
  if (index < 0) return value.slice();
  const next = value.slice();
  next[index] = color;
  return next;
}

function removeLast(value: readonly (Peg | null)[]): (Peg | null)[] {
  const index = value.map((peg) => peg !== null).lastIndexOf(true);
  if (index < 0) return value.slice();
  const next = value.slice();
  next[index] = null;
  return next;
}

function removeAt(value: readonly (Peg | null)[], index: number): (Peg | null)[] {
  const next = value.slice();
  next[index] = null;
  return next;
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('ai');
  const [level, setLevel] = useState<AiLevel>('normal');
  const [soloRole, setSoloRole] = useState<SoloRole>('breaker');
  const [state, setState] = useState<GameState>(() => setup({ setterSeat: 0 }));
  const [history, setHistory] = useState<GameState[]>([]);
  const [draft, setDraft] = useState<(Peg | null)[]>(emptyCode);
  const [secretDraft, setSecretDraft] = useState<(Peg | null)[]>(emptyCode);
  const [hint, setHint] = useState<HintState | null>(null);
  const [hintReveal, setHintReveal] = useState<{ index: number; color: Peg } | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiNote, setAiNote] = useState<AiNote | null>(null);
  const [record, setRecord] = useState<FamilyRecord>(() => loadRecord());
  const [confirmClear, setConfirmClear] = useState(false);
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSave());
  const [toast, setToast] = useState('');
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyarcade.codebreak.sound') !== 'off';
    } catch {
      return true;
    }
  });

  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [lanHost, setLanHost] = useState<LanHost | null>(null);
  const [lanPlayers, setLanPlayers] = useState<LanPublicPeer[]>([]);
  const [lanCode, setLanCode] = useState('');
  const [lanInvite, setLanInvite] = useState('');
  const [lanQr, setLanQr] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanError, setLanError] = useState('');
  const [lanSetter, setLanSetter] = useState<'host' | 'guest'>('host');
  const [guest, setGuest] = useState<LanGuest | null>(null);
  const [guestView, setGuestView] = useState<SeatView | null>(null);
  const [guestStarted, setGuestStarted] = useState(false);
  const [guestPlayers, setGuestPlayers] = useState<LanPublicPeer[]>([]);
  const [guestName, setGuestName] = useState(() => guestParams()?.name ?? '');
  const [guestCode, setGuestCode] = useState(() => guestParams()?.code ?? '');
  const [guestRoom] = useState(() => guestParams()?.room ?? '');
  const [guestConnecting, setGuestConnecting] = useState(false);
  const [guestCodeSent, setGuestCodeSent] = useState(false);

  const stateRef = useRef(state);
  const hostRef = useRef<LanHost | null>(null);
  const recordedRef = useRef(false);

  const tr = (key: MessageKey, params?: Record<string, string | number>) => t(lang, key, params);

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
      localStorage.setItem('familyarcade.codebreak.sound', soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setConfirmClear(false);
  }, [screen]);

  useEffect(() => {
    if (!guestRoom) return;
    setScreen('lan');
    setMode('lan-guest');
  }, [guestRoom]);

  useEffect(() => {
    if (guestView?.canSet) setGuestCodeSent(false);
  }, [guestView?.canSet]);

  const adopt = (next: GameState) => {
    stateRef.current = next;
    setState(next);
  };

  const persist = (next: GameState, currentMode: Mode) => {
    if (currentMode !== 'ai' && currentMode !== 'local') return;
    if (next.status === 'playing' || next.status === 'setting') {
      saveGame({ state: next, mode: currentMode, level });
    } else {
      clearSave();
    }
    setSaved(null);
  };

  const finish = (next: GameState, currentMode: Mode) => {
    if (next.status !== 'won' && next.status !== 'lost') return;
    if (recordedRef.current) return;
    recordedRef.current = true;
    if (currentMode === 'ai' || currentMode === 'local') {
      setRecord(recordResult(next));
      clearSave();
      setSaved(null);
    }
    if (soundOn) chime(next.status === 'won' ? 'win' : 'lose');
  };

  const commit = (next: GameState, currentMode: Mode, previous: GameState) => {
    setHistory((items) => [...items, previous]);
    adopt(next);
    setHint(null);
    setHintReveal(null);
    setDraft(emptyCode());
    setSecretDraft(emptyCode());
    if (soundOn && next.status === 'playing') {
      chime(previous.status === 'setting' ? 'set' : 'place');
    }
    finish(next, currentMode);
    persist(next, currentMode);
    if (currentMode === 'lan-host' && hostRef.current) {
      hostRef.current.sendView(1, view(next, 1));
    }
  };

  const resetRoundUi = () => {
    setHistory([]);
    setHint(null);
    setHintReveal(null);
    setDraft(emptyCode());
    setSecretDraft(emptyCode());
    setAiNote(null);
    setAiThinking(false);
    recordedRef.current = false;
  };

  const openSoloSetup = () => {
    setMode('ai');
    setScreen('setup');
  };

  const beginSolo = () => {
    resetRoundUi();
    setMode('ai');
    let next: GameState;
    if (soloRole === 'breaker') {
      const secret = randomCode(Math.random);
      next = setup({
        setterSeat: 1,
        secret,
        hintsLeft: level === 'companion' ? 1 : 0,
      });
    } else {
      next = setup({ setterSeat: 0 });
    }
    adopt(next);
    clearSave();
    setSaved(null);
    persist(next, 'ai');
    setScreen('game');
  };

  const startLocal = () => {
    resetRoundUi();
    setMode('local');
    const next = setup({ setterSeat: 0 });
    adopt(next);
    clearSave();
    setSaved(null);
    persist(next, 'local');
    setScreen('game');
  };

  const resume = () => {
    if (!saved) return;
    resetRoundUi();
    setMode(saved.mode);
    setLevel(saved.level);
    adopt(saved.state);
    setSaved(null);
    setScreen('game');
  };

  // The AI only ever breaks codes in solo play. It guesses from the public
  // feedback history, so the secret never needs to reach the AI module.
  useEffect(() => {
    if (mode !== 'ai' || screen !== 'game') return;
    if (state.status !== 'playing' || state.breakerSeat !== 1) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (current.status !== 'playing' || current.breakerSeat !== 1) return;
      const move = chooseGuess(current.guesses, level, Math.random);
      const result = applySeat(current, current.breakerSeat, {
        type: 'guess',
        code: move.code,
      });
      setAiThinking(false);
      if (!result.ok) return;
      setAiNote(move.note);
      commit(result.state, 'ai', current);
    }, 720);
    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [mode, state, level, screen]);

  const localView = view(state, state.status === 'setting' ? state.setterSeat : state.breakerSeat);
  const myView: SeatView | null = mode === 'lan-guest' ? guestView : mode === 'local' ? localView : view(state, 0);

  const shownStatus = myView?.status ?? state.status;
  const isTerminal = shownStatus === 'won' || shownStatus === 'lost';
  const canSet = Boolean(myView?.canSet) && !(mode === 'lan-guest' && guestCodeSent);
  const canGuess = Boolean(myView?.canGuess);
  const guesses = myView?.guesses ?? [];
  const maxGuesses = myView?.maxGuesses ?? MAX_GUESSES;
  const crackedBodyText =
    guesses.length === 1 ? tr('crackedBodyOne') : tr('crackedBody', { n: guesses.length });
  const remaining = myView?.remaining ?? 0;
  const hintsLeft = myView?.hintsLeft ?? 0;
  const secret = myView?.secret ?? null;
  const revealed = myView?.revealed ?? [null, null, null, null];
  const breakerWon = shownStatus === 'won';

  const seatName = (seat: Seat): string => {
    if (mode === 'local') return tr('player', { n: seat + 1 });
    if (mode === 'ai') return seat === 0 ? tr('you') : `AI · ${tr(level)}`;
    if (mode === 'lan-guest') {
      if (seat === (guest?.seat ?? 1)) return tr('you');
      return guestPlayers.find((player) => player.seat === seat)?.name ?? tr('player', { n: seat + 1 });
    }
    if (seat === 0) return tr('you');
    return lanPlayers.find((player) => player.seat === seat)?.name ?? tr('player', { n: seat + 1 });
  };

  const addColor = (target: 'guess' | 'secret', color: Peg) => {
    if (target === 'guess') setDraft((value) => fillCode(value, color));
    else setSecretDraft((value) => fillCode(value, color));
  };

  const lockSecret = () => {
    if (!canSet || secretDraft.some((peg) => peg === null)) return;
    const code = secretDraft as Code;
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'secret', code } satisfies GameAction);
      setGuestCodeSent(true);
      setSecretDraft(emptyCode());
      return;
    }
    const seat: Seat = mode === 'local' ? state.setterSeat : 0;
    const current = stateRef.current;
    const result = applySeat(current, seat, { type: 'secret', code });
    if (!result.ok) return;
    commit(result.state, mode, current);
    if (mode === 'local') setScreen('handoff');
  };

  const submitGuess = () => {
    if (!canGuess || draft.some((peg) => peg === null)) return;
    const code = draft as Code;
    if (mode === 'lan-guest') {
      guest?.sendIntent({ type: 'guess', code } satisfies GameAction);
      setDraft(emptyCode());
      return;
    }
    const seat: Seat = mode === 'local' ? state.breakerSeat : 0;
    const current = stateRef.current;
    const result = applySeat(current, seat, { type: 'guess', code });
    if (!result.ok) return;
    commit(result.state, mode, current);
  };

  const useHint = () => {
    if (!hint) return;
    setDraft(hint.code.slice());
    setHint(null);
  };

  const showHint = () => {
    if (!myView || !canGuess) {
      setToast(tr('hintNoSecret'));
      return;
    }
    const hintLevel: AiLevel = mode === 'ai' ? (level === 'companion' ? 'normal' : level) : 'normal';
    const move = chooseGuess(myView.guesses, hintLevel, Math.random);
    setHintReveal(null);
    setHint({ code: move.code, candidates: move.candidates, worstCase: move.worstCase, note: move.note });
    if (soundOn) chime('hint');
  };

  const companionPeek = () => {
    if (!myView || !canGuess || hintsLeft <= 0) {
      setToast(tr('hintUsed'));
      return;
    }
    const current = stateRef.current;
    const result = revealPeg(current);
    if (!result.ok) {
      setToast(tr('hintUsed'));
      return;
    }
    const index = result.state.revealed.findIndex((peg, i) => peg !== null && current.revealed[i] === null);
    const color = result.state.revealed[index] as Peg;
    adopt(result.state);
    setHint(null);
    setHintReveal({ index, color });
    persist(result.state, mode);
    if (soundOn) chime('hint');
  };

  const canUndo =
    mode !== 'lan-host' &&
    mode !== 'lan-guest' &&
    myView?.role === 'breaker' &&
    shownStatus === 'playing' &&
    history.length > 0 &&
    history[history.length - 1].status === 'playing';

  const undo = () => {
    if (!canUndo) return;
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));
    adopt(previous);
    setHint(null);
    setHintReveal(null);
    setDraft(emptyCode());
    persist(previous, mode);
  };

  const closeLan = () => {
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
    setGuestPlayers([]);
    setGuestCodeSent(false);
  };

  const goHome = () => {
    if (mode === 'lan-host' || mode === 'lan-guest') closeLan();
    setMode('ai');
    setScreen('home');
    setHint(null);
    setHintReveal(null);
    setDraft(emptyCode());
    setSecretDraft(emptyCode());
    setSaved(loadSave());
    setRecord(loadRecord());
  };

  const restartAi = () => {
    resetRoundUi();
    let next: GameState;
    if (soloRole === 'breaker') {
      next = setup({
        setterSeat: 1,
        secret: randomCode(Math.random),
        hintsLeft: level === 'companion' ? 1 : 0,
      });
    } else {
      next = setup({ setterSeat: 0 });
    }
    adopt(next);
    clearSave();
    setSaved(null);
    persist(next, 'ai');
    setScreen('game');
  };

  const restartLocal = () => {
    resetRoundUi();
    const next = setup({ setterSeat: state.setterSeat === 0 ? 1 : 0 });
    adopt(next);
    clearSave();
    setSaved(null);
    persist(next, 'local');
    setScreen('game');
  };

  const restartLan = () => {
    if (!lanHost) return;
    resetRoundUi();
    const next = setup({ setterSeat: state.setterSeat === 0 ? 1 : 0 });
    adopt(next);
    setScreen('game');
    lanHost.sendView(1, view(next, 1));
  };

  const openLanHost = async () => {
    if (hostRef.current) return;
    setScreen('lan');
    setMode('lan-host');
    setLanSetter('host');
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
        const action = intent as Partial<GameAction> | null;
        if (!action || (action.type !== 'secret' && action.type !== 'guess')) return;
        if (!Array.isArray(action.code)) return;
        const current = stateRef.current;
        const result = applySeat(current, seat, action as GameAction);
        if (!result.ok) return;
        commit(result.state, 'lan-host', current);
      });
      host.onClose(() => setLanError(tr('lanClosed')));
      const url = inviteUrl(info, room, code, lang === 'zh' ? '家人' : 'Guest');
      setLanInvite(url);
      setLanQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#20302c', light: '#fffaf0' },
        }),
      );
    } catch (error) {
      setLanError(tr('lanDisconnected'));
      hostRef.current?.close();
      hostRef.current = null;
      if (error instanceof Error) console.warn('LAN host could not start:', error.message);
    } finally {
      setLanBusy(false);
    }
  };

  const startLan = () => {
    if (!lanHost) return;
    resetRoundUi();
    const setterSeat = lanSetter === 'host' ? 0 : 1;
    const next = setup({ setterSeat });
    adopt(next);
    setScreen('game');
    lanHost.start();
    lanHost.sendView(1, view(next, 1));
  };

  const joinGuest = async () => {
    if (!guestRoom || !guestName.trim() || guest) return;
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
        setGuestPlayers(players);
        setGuestStarted(true);
        setScreen('game');
      });
      joined.onPlayers((players) => setGuestPlayers(players));
      joined.onError((reason) => {
        setLanError(reason === 'room-full' ? tr('lanFull') : tr('lanWrong'));
      });
      setGuestStarted(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('room-full')) setLanError(tr('lanFull'));
      else if (message.includes('wrong-code')) setLanError(tr('lanWrong'));
      else setLanError(tr('lanDisconnected'));
    } finally {
      setGuestConnecting(false);
    }
  };

  const leaveGuest = () => {
    closeLan();
    setMode('ai');
    setScreen('home');
    setSaved(loadSave());
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (screen === 'home') return;
        if (screen === 'game' || screen === 'handoff' || screen === 'lan') goHome();
        else setScreen('home');
        return;
      }
      if (screen !== 'game') return;
      const number = Number(event.key);
      if (Number.isInteger(number) && number >= 1 && number <= COLORS.length) {
        event.preventDefault();
        if (canSet) addColor('secret', COLORS[number - 1]);
        else if (canGuess) addColor('guess', COLORS[number - 1]);
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        if (canSet) setSecretDraft(removeLast);
        else if (canGuess) setDraft(removeLast);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (canSet) lockSecret();
        else if (canGuess) submitGuess();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const statusHeading = () => {
    if (isTerminal) return breakerWon ? tr('crackedTitle') : tr('heldTitle');
    if (shownStatus === 'setting') return canSet ? tr('setSecretTitle') : tr('statusSetting');
    if (canGuess) return tr('guessTitle');
    if (aiThinking) return tr(level === 'companion' ? 'aiThinkingCompanion' : 'aiThinking');
    if (mode === 'ai' && state.setterSeat === 0) {
      return tr(level === 'companion' ? 'aiThinkingCompanion' : 'aiThinking');
    }
    return tr('waitingGuess');
  };

  const statusSub = () => {
    if (isTerminal) {
      return breakerWon ? crackedBodyText : tr('heldBody');
    }
    if (shownStatus === 'setting') {
      if (canSet) return tr('setSecretPrivacy');
      if (mode === 'lan-host') return tr('waitingHostSecret');
      return tr('waitingGuestSecret');
    }
    if (canGuess) return tr('guessCountLabel', { n: guesses.length + 1, m: maxGuesses });
    if (aiThinking) return tr(level === 'companion' ? 'aiThinkingCompanion' : 'aiThinking');
    if (mode === 'ai') return tr(aiNote ? NOTE_KEYS[aiNote] : 'waitingGuess');
    if (mode === 'lan-host') return tr('lanWaitingGuestGuess');
    if (mode === 'lan-guest') return tr('lanWaitingHostGuess');
    return tr('localHint');
  };

  const home = (
    <main className="shell home-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{tr('tableLabel')}</p>
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
        <div className="hero-copy">
          <p className="kicker">{tr('heroKicker')}</p>
          <p className="hero-tagline">{tr('tagline')}</p>
          <div className="menu">
            {saved && (
              <button className="primary wide" onClick={resume}>
                <span>{tr('continueGame')}</span>
                <small>{tr('saved')}</small>
              </button>
            )}
            <button className={saved ? 'secondary wide' : 'primary wide'} onClick={openSoloSetup}>
              <span>{tr('playSolo')}</span>
              <small>{tr('playSoloSub')}</small>
            </button>
            <button className="secondary wide" onClick={startLocal}>
              <span>{tr('playLocal')}</span>
              <small>{tr('playLocalSub')}</small>
            </button>
            <button className="secondary wide" onClick={openLanHost}>
              <span>{tr('playLan')}</span>
              <small>{tr('playLanSub')}</small>
            </button>
            <div className="menu-links">
              <button className="text-button" onClick={() => setScreen('rules')}>
                {tr('rules')} →
              </button>
              <button className="text-button" onClick={() => setScreen('record')}>
                {tr('recordLink')}
              </button>
            </div>
          </div>
          <button className="record-strip" onClick={() => setScreen('record')}>
            <span>{tr('familyRecord')}</span>
            <strong>{record.games}</strong>
            <span>{tr(record.games === 1 ? 'gameOne' : 'games')}</span>
            <span className="dot">·</span>
            <span>{record.cracked} {tr('cracked')}</span>
            <span className="dot">·</span>
            <span>{record.held} {tr('held')}</span>
            <span className="dot">·</span>
            <span>{tr('bestScore')} {record.bestGuesses ?? tr('noBest')}</span>
          </button>
        </div>

        <div className="hero-stage" aria-hidden="true">
          <div className="hero-card">
            <div className="hero-card-top">
              <span className="label">{tr('sampleSecret')}</span>
              <span className="hero-code">
                <PegDot hidden />
                <PegDot hidden />
                <PegDot hidden />
                <PegDot hidden />
              </span>
            </div>
            {HERO_ROWS.map((row, index) => (
              <div className="hero-row" key={index}>
                <span className="hero-row-no">{String(index + 1).padStart(2, '0')}</span>
                <CodeRow code={row.code} tr={tr} small />
                <FeedbackDots feedback={row.feedback} ariaLabel="" compact />
              </div>
            ))}
            <div className="hero-card-foot">
              <span>{tr('sampleCaption')}</span>
              <span className="hero-dots">
                <span className="fb-dot fb-black" />
                <span className="fb-dot fb-white" />
              </span>
            </div>
          </div>
          <div className="hero-sticker">4 × 6</div>
        </div>
      </section>
      <footer className="foot">{tr('webOnly')}</footer>
    </main>
  );

  const setupScreen = (
    <main className="shell narrow-shell setup-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
      <div className="setup-head">
        <p className="eyebrow">{tr('heroKicker')}</p>
        <h2 className="screen-title">{tr('setupTitle')}</h2>
        <p className="lede">{tr('setupLede')}</p>
      </div>

      <section className="setup-block">
        <h3 className="block-title">
          <span>01</span> {tr('roleTitle')}
        </h3>
        <div className="role-grid">
          <button
            className={`role-card ${soloRole === 'breaker' ? 'selected' : ''}`}
            onClick={() => setSoloRole('breaker')}
          >
            <span className="role-mini">
              <PegDot hidden small />
              <PegDot hidden small />
              <PegDot hidden small />
              <PegDot hidden small />
            </span>
            <strong>{tr('roleBreakerAction')}</strong>
            <small>{tr('roleBreakerHint')}</small>
          </button>
          <button
            className={`role-card ${soloRole === 'setter' ? 'selected' : ''}`}
            onClick={() => setSoloRole('setter')}
          >
            <span className="role-mini">
              <PegDot color="red" small />
              <PegDot color="yellow" small />
              <PegDot color="green" small />
              <PegDot color="blue" small />
            </span>
            <strong>{tr('roleSetterAction')}</strong>
            <small>{tr('roleSetterHint')}</small>
          </button>
        </div>
      </section>

      <section className="setup-block">
        <h3 className="block-title">
          <span>02</span> {tr('difficulty')}
        </h3>
        <p className="lede tight">{tr('difficultyHint')}</p>
        <div className="level-grid">
          {LEVELS.map((item) => (
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

      <div className="row-actions setup-actions">
        <button className="primary" onClick={beginSolo}>
          {tr('startGame')}
        </button>
        <button className="ghost" onClick={goHome}>
          {tr('back')}
        </button>
      </div>
    </main>
  );

  const secretPegs = Array.from({ length: 4 }, (_, index) => {
    const color = secret ? secret[index] : revealed[index];
    const hiddenPeg = !secret && !revealed[index];
    return (
      <span className="code-slot" key={index}>
        <PegDot color={color} hidden={hiddenPeg} empty={!hiddenPeg && !color} />
      </span>
    );
  });

  const resultCard = (
    <div className={`result-card ${breakerWon ? 'win' : 'hold'}`} role="status" aria-live="polite">
      <div className="result-copy">
        <p className="label">{tr('secretWas')}</p>
        <div className="result-secret">
          {secret ? (
            <CodeRow code={secret} tr={tr} />
          ) : (
            <CodeRow code={[null, null, null, null]} hidden tr={tr} />
          )}
        </div>
        <h2>{breakerWon ? tr('crackedTitle') : tr('heldTitle')}</h2>
        <p>{breakerWon ? crackedBodyText : tr('heldBody')}</p>
      </div>
      <div className="result-actions">
        {mode === 'local' && (
          <button className="primary" onClick={restartLocal}>
            {tr('swapRoles')}
          </button>
        )}
        {mode === 'ai' && (
          <button className="primary" onClick={restartAi}>
            {tr('playAgain')}
          </button>
        )}
        {mode === 'lan-host' && (
          <button
            className="primary"
            onClick={restartLan}
            disabled={!lanPlayers[1]?.connected}
          >
            {tr('rematch')}
          </button>
        )}
        {mode === 'lan-guest' && <p className="muted">{tr('lanWaitingStart')}</p>}
        <button className="ghost" onClick={goHome}>
          {tr('backHome')}
        </button>
      </div>
    </div>
  );

  const hintCard = hint && (
    <div className="hint-card">
      <div className="hint-top">
        <span className="label">{tr('hintTitle')}</span>
        <button className="icon-btn" onClick={() => setHint(null)} aria-label={tr('close')}>
          ×
        </button>
      </div>
      <div className="hint-body">
        <CodeRow code={hint.code} tr={tr} small />
        <div>
          <p>{tr('hintCandidates', { n: hint.candidates })}</p>
          <p className="muted">{tr('hintWorst', { n: hint.worstCase })}</p>
          <p className="muted">{tr(NOTE_KEYS[hint.note])}</p>
        </div>
      </div>
      <button className="text-button" onClick={useHint}>
        {tr('useHint')}
      </button>
    </div>
  );

  const revealCard = hintReveal && (
    <div className="hint-card reveal-card">
      <div className="hint-top">
        <span className="label">{tr('revealTitle')}</span>
        <button className="icon-btn" onClick={() => setHintReveal(null)} aria-label={tr('close')}>
          ×
        </button>
      </div>
      <div className="reveal-line">
        <PegDot color={hintReveal.color} />
        <p>
          {tr('revealAt', {
            n: hintReveal.index + 1,
            color: tr(PEG_LABEL[hintReveal.color]),
          })}
        </p>
      </div>
    </div>
  );

  const settingPanel = canSet ? (
    <section className="action-panel">
      <div className="privacy-banner">
        <span className="lock-mark" aria-hidden="true">
          ◉
        </span>
        <span>{tr('setSecretPrivacy')}</span>
      </div>
      <CodePicker
        value={secretDraft}
        onColor={(color) => addColor('secret', color)}
        onSlot={(index) => setSecretDraft((value) => removeAt(value, index))}
        onClear={() => setSecretDraft(emptyCode())}
        onSubmit={lockSecret}
        submitLabel={tr('lockSecret')}
        tr={tr}
      />
    </section>
  ) : (
    <section className="waiting-panel">
      <span className="thinking-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <h3>{tr('statusSetting')}</h3>
      <p>
        {mode === 'lan-host'
          ? tr('waitingHostSecret')
          : mode === 'lan-guest'
            ? guestCodeSent
              ? tr('lanCodeSent')
              : tr('waitingGuestSecret')
            : tr('waitingGuess')}
      </p>
      {mode === 'lan-guest' && (
        <button className="ghost" onClick={leaveGuest}>
          {tr('lanLeave')}
        </button>
      )}
    </section>
  );

  const guessPanel = canGuess ? (
    <section className="action-panel">
      <CodePicker
        value={draft}
        onColor={(color) => addColor('guess', color)}
        onSlot={(index) => setDraft((value) => removeAt(value, index))}
        onClear={() => setDraft(emptyCode())}
        onSubmit={submitGuess}
        submitLabel={tr('submitGuess')}
        tr={tr}
        helper={tr('draftHint')}
      />
    </section>
  ) : null;

  const waitingPlayPanel = !canGuess && !isTerminal && (
    <section className="waiting-panel compact">
      <span className="thinking-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <h3>{aiThinking ? tr(level === 'companion' ? 'aiThinkingCompanion' : 'aiThinking') : tr('waitingGuess')}</h3>
      <p>
        {mode === 'lan-host'
          ? tr('lanWaitingGuestGuess')
          : mode === 'lan-guest'
            ? tr('lanWaitingHostGuess')
            : tr('aiSays')}
      </p>
    </section>
  );

  const gameScreen = (
    <main className="shell game-shell">
      <header className="game-top">
        <button className="back" onClick={goHome}>
          ← {tr('home')}
        </button>
        <div className="game-id">
          <strong>{tr('title')}</strong>
          <span>
            {mode === 'ai'
              ? `${tr(level)} · ${soloRole === 'breaker' ? tr('roleBreaker') : tr('roleSetter')}`
              : mode === 'local'
                ? tr('playLocal')
                : mode === 'lan-host'
                  ? tr('modeLanHost')
                  : tr('lanGuestTitle')}
          </span>
        </div>
        <div className="game-top-actions">
          <button className="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {tr('language')}
          </button>
          <button className="ghost" onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? tr('soundOn') : tr('soundOff')}
          </button>
        </div>
      </header>

      <div className="game-layout">
        <section className="play-area">
          {!isTerminal && (
            <div className="status-bar">
              <span className="turn-chip" aria-hidden="true">
                <span className="turn-ring" />
              </span>
              <div className="status-copy">
                <strong>{statusHeading()}</strong>
                <p>{statusSub()}</p>
              </div>
              <div className="remaining-badge">
                <strong>{remaining}</strong>
                <span>{tr(remaining === 1 ? 'guessLeftShort' : 'guessesLeftShort')}</span>
              </div>
            </div>
          )}

          {hintCard}
          {revealCard}

          {mode === 'ai' && state.setterSeat === 0 && (aiNote || aiThinking) && (
            <div className={`ai-bubble ${aiThinking ? 'thinking' : ''}`}>
              <span className="ai-face">AI</span>
              <div>
                <span className="label">{tr('aiSays')}</span>
                <p>
                  {aiThinking
                    ? tr(level === 'companion' ? 'aiThinkingCompanion' : 'aiThinking')
                    : aiNote
                      ? tr(NOTE_KEYS[aiNote])
                      : ''}
                </p>
              </div>
            </div>
          )}

          {shownStatus === 'setting' ? (
            settingPanel
          ) : (
            <>
              <GuessBoard
                guesses={guesses}
                maxGuesses={maxGuesses}
                draft={draft}
                canGuess={canGuess}
                onDraftSlot={(index) => setDraft((value) => removeAt(value, index))}
                tr={tr}
              />
              {resultCard && isTerminal ? resultCard : null}
              {guessPanel}
              {waitingPlayPanel}
            </>
          )}
        </section>

        <aside className="side">
          <section className="side-card secret-card">
            <div className="side-card-head">
              <h3>{tr('secretTitle')}</h3>
              <span className="label">{secret ? tr('secretRevealed') : tr('secretHidden')}</span>
            </div>
            <div className="secret-pegs">{secretPegs}</div>
            <p>
              {secret
                ? tr('secretWas')
                : hintsLeft > 0
                  ? tr('hintCompanion')
                  : tr('secretHidden')}
            </p>
          </section>

          <section className="side-card">
            <h3>{tr('clues')}</h3>
            <div className="legend-row">
              <span className="fb-dot fb-black" />
              <span>{tr('feedbackLegendBlack')}</span>
            </div>
            <div className="legend-row">
              <span className="fb-dot fb-white" />
              <span>{tr('feedbackLegendWhite')}</span>
            </div>
          </section>

          <section className="side-card">
            <h3>{tr('playersTitle')}</h3>
            <p>
              {tr('roleSetter')}: {seatName(state.setterSeat)} · {tr('roleBreaker')}:{' '}
              {seatName(state.breakerSeat)}
            </p>
            <div className="side-actions">
              <button className="secondary" onClick={undo} disabled={!canUndo}>
                {tr('undo')}
              </button>
              <button className="secondary" onClick={showHint} disabled={!canGuess || isTerminal}>
                {tr('hint')}
              </button>
            </div>
            {mode === 'ai' && level === 'companion' && canGuess && (
              <button
                className="secondary wide side-wide"
                onClick={companionPeek}
                disabled={hintsLeft <= 0}
              >
                {tr('companionPeek')}
                <small>{tr('companionPeekHint')}</small>
              </button>
            )}
          </section>

          {mode === 'lan-host' && (
            <section className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanCode')}</h3>
                <span className="room-code">{lanCode}</span>
              </div>
              <p>{lanPlayers[1]?.connected ? tr('lanReady') : tr('lanWaitingPlayer')}</p>
              {lanPlayers[1] && (
                <p className="peer">
                  {lanPlayers[1].name}
                  {lanPlayers[1].connected ? ' · ●' : ' · ○'}
                </p>
              )}
              <button className="text-button" onClick={goHome}>
                {tr('lanLeave')}
              </button>
            </section>
          )}

          {mode === 'lan-guest' && (
            <section className="side-card lan-mini">
              <div className="side-card-head">
                <h3>{tr('lanRoom')}</h3>
                <span className="room-code">{guestRoom}</span>
              </div>
              <p>{guestStarted ? tr('lanConnected') : tr('lanWaitingStart')}</p>
              <p className="peer">{myView?.role === 'setter' ? tr('lanYouSet') : tr('lanYouGuess')}</p>
              <button className="text-button" onClick={leaveGuest}>
                {tr('lanLeave')}
              </button>
            </section>
          )}

          <section className="side-card record-mini">
            <h3>{tr('familyRecord')}</h3>
            <p>
              {record.games} {tr(record.games === 1 ? 'gameOne' : 'games')} · {record.cracked} {tr('cracked')} · {record.held}{' '}
              {tr('held')}
            </p>
            <p>★ {tr('bestScore')} {record.bestGuesses ?? tr('noBest')}</p>
          </section>
        </aside>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const handoffScreen = (
    <main className="shell handoff-shell">
      <div className="handoff-card">
        <p className="eyebrow">{tr('handoffTitle')}</p>
        <div className="handoff-pegs" aria-hidden="true">
          <PegDot hidden />
          <PegDot hidden />
          <PegDot hidden />
          <PegDot hidden />
        </div>
        <h2>{tr('secretLockedTitle')}</h2>
        <p>{tr('secretLockedBody')}</p>
        <button className="primary wide" onClick={() => setScreen('game')}>
          {tr('handoffButton')}
        </button>
        <button className="ghost" onClick={goHome}>
          {tr('home')}
        </button>
      </div>
    </main>
  );

  const lanScreen = (
    <main className="shell narrow-shell lan-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
      {mode === 'lan-guest' || guestRoom ? (
        <>
          <p className="eyebrow">{tr('lanGuestLead', { room: guestRoom })}</p>
          <h2 className="screen-title">{tr('lanGuestTitle')}</h2>
          <p className="lede">{tr('lanLead')}</p>
          {!guest && (
            <div className="lan-form">
              <label>
                <span>{tr('lanName')}</span>
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  maxLength={18}
                  autoComplete="nickname"
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
          {guest && (
            <div className="waiting-panel">
              <span className="thinking-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <h3>{tr('lanConnected')}</h3>
              <p>{guestStarted ? (myView?.role === 'setter' ? tr('lanYouSet') : tr('lanYouGuess')) : tr('lanWaitingStart')}</p>
              <p className="muted">{tr('lanStartHint')}</p>
              <button className="ghost" onClick={leaveGuest}>
                {tr('lanLeave')}
              </button>
            </div>
          )}
          {lanError && <p className="error">{lanError}</p>}
        </>
      ) : (
        <>
          <p className="eyebrow">{tr('lanTitle')}</p>
          <h2 className="screen-title">{tr('lanHostCard')}</h2>
          <p className="lede">{tr('lanLead')}</p>
          {lanBusy && <p className="lede">{tr('lanStarting')}</p>}
          {lanError && (
            <div className="error">
              <p>{lanError}</p>
              <p className="error-hint">{tr('lanServerHint')}</p>
            </div>
          )}
          {lanInfo && lanInvite && (
            <>
              <section className="lan-role">
                <h3>{tr('lanRoleTitle')}</h3>
                <div className="role-grid compact">
                  <button
                    className={`role-card ${lanSetter === 'host' ? 'selected' : ''}`}
                    onClick={() => setLanSetter('host')}
                  >
                    <strong>{tr('lanHostSets')}</strong>
                    <small>{tr('lanHostSetsHint')}</small>
                  </button>
                  <button
                    className={`role-card ${lanSetter === 'guest' ? 'selected' : ''}`}
                    onClick={() => setLanSetter('guest')}
                  >
                    <strong>{tr('lanGuestSets')}</strong>
                    <small>{tr('lanGuestSetsHint')}</small>
                  </button>
                </div>
              </section>
              <div className="lan-layout">
                <div className="lan-card">
                  <span className="label">{tr('lanCode')}</span>
                  <div className="room-code big">{lanCode}</div>
                  <p>{lanPlayers[1]?.connected ? tr('lanReady') : tr('lanWaitingPlayer')}</p>
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
                  <p className="muted">{tr('lanStartHint')}</p>
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
                  <p className="muted">{tr('lanScanHint')}</p>
                  <code>{lanInvite.replace(/^https?:\/\//, '')}</code>
                </div>
              </div>
            </>
          )}
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );

  const rulesScreen = (
    <main className="shell narrow-shell rules-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
      <p className="eyebrow">{tr('heroKicker')}</p>
      <h2 className="screen-title">{tr('rulesTitle')}</h2>
      <p className="lede">{tr('rulesLead')}</p>
      <div className="rules-example">
        <div className="rules-example-row">
          <span className="label">{tr('guess')}</span>
          <CodeRow code={['red', 'red', 'green', 'blue']} tr={tr} />
          <FeedbackDots
            feedback={{ black: 2, white: 1 }}
            ariaLabel={tr('feedbackAria', { black: 2, white: 1 })}
          />
        </div>
        <p>{tr('feedbackLegendBlack')} · {tr('feedbackLegendWhite')}</p>
      </div>
      <ol className="rules-list">
        <li>{tr('rule1')}</li>
        <li>{tr('rule2')}</li>
        <li>{tr('rule3')}</li>
        <li>{tr('rule4')}</li>
        <li>{tr('rule5')}</li>
      </ol>
      <div className="row-actions">
        <button className="primary" onClick={openSoloSetup}>
          {tr('playSolo')}
        </button>
        <button className="ghost" onClick={goHome}>
          {tr('close')}
        </button>
      </div>
    </main>
  );

  const recent = record.recent;
  const recordScreen = (
    <main className="shell narrow-shell record-shell">
      <button className="back" onClick={goHome}>
        ← {tr('back')}
      </button>
      <p className="eyebrow">{tr('familyRecord')}</p>
      <h2 className="screen-title">{tr('recordTitle')}</h2>
      <p className="lede">{tr('recordLead')}</p>
      <div className="record-grid">
        <div className="record-stat">
          <span>{tr('recordGames')}</span>
          <strong>{record.games}</strong>
        </div>
        <div className="record-stat">
          <span>{tr('recordCracked')}</span>
          <strong>{record.cracked}</strong>
        </div>
        <div className="record-stat">
          <span>{tr('recordHeld')}</span>
          <strong>{record.held}</strong>
        </div>
        <div className="record-stat">
          <span>{tr('recordBest')}</span>
          <strong>{record.bestGuesses === null ? tr('noBest') : `${record.bestGuesses}/${MAX_GUESSES}`}</strong>
        </div>
      </div>
      <div className="record-bars" aria-hidden="true">
        <span
          className="bar cracked"
          style={{ flex: Math.max(record.cracked, record.games === 0 ? 1 : 0) }}
        />
        <span
          className="bar held"
          style={{ flex: Math.max(record.held, record.games === 0 ? 1 : 0) }}
        />
      </div>
      <p className="muted">{tr('recordHint')}</p>
      <section className="recent-card">
        <h3>{tr('recentTitle')}</h3>
        {recent.length === 0 ? (
          <p>{tr('noGames')}</p>
        ) : (
          <div className="recent-list">
            {recent.map((outcome, index) => (
              <span key={index} className={`recent-chip ${outcome}`}>
                {outcome === 'breaker' ? tr('breaker') : tr('setter')}
              </span>
            ))}
          </div>
        )}
        <p className="muted">
          {tr('recordStreak')}: {record.streak}
        </p>
      </section>
      <button
        className={confirmClear ? 'danger' : 'secondary'}
        onClick={() => {
          if (!confirmClear) {
            setConfirmClear(true);
            return;
          }
          setRecord(clearRecord());
          setConfirmClear(false);
        }}
        disabled={record.games === 0}
      >
        {confirmClear ? tr('clearConfirm') : tr('clearRecord')}
      </button>
    </main>
  );

  if (screen === 'setup') return setupScreen;
  if (screen === 'game') return gameScreen;
  if (screen === 'handoff') return handoffScreen;
  if (screen === 'rules') return rulesScreen;
  if (screen === 'lan') return lanScreen;
  if (screen === 'record') return recordScreen;
  return home;
}
