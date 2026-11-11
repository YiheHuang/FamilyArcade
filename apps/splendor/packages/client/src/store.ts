import {
  applyMove,
  checkInvariants,
  chooseMove,
  cloneState,
  deserializeGame,
  serializeGame,
  setupGame,
  totalPoints,
  type AiLevel,
  type Color,
  type GameEvent,
  type GameState,
  type Move,
} from '@splendor/engine';
import { create } from 'zustand';
import type { ClientMsg, SeatInfo, ServerMsg } from '../../server/src/protocol.js';
import { LanClient, defaultLanUrl, desktopAppVersion } from './lan';
import { cardById } from '@splendor/engine';
import { describeMove, explainMove, paymentOptions, totalPointsOfView } from './logic';
import { configureSfx, initSfx, playSfx, type SfxVolume } from './ui/sfx';
import { setLang, systemLang, errText, T, type Lang } from './i18n';
import { sfxForEvents, type SfxEventContext } from './ui/sfxMap';
import { buildFrames, deleteRecord, getRecord, saveRecord, type GameRecord, type RecordMode, type RecordSeat, type ReplayFrame } from './records';
import { resolveRects } from './anim/rects';
import { stepsFromEvents, type AnimSpeed } from './anim/steps';
import type { QueuedAnim } from './anim/types';
import { fromClientState, localView, type GameView } from './view';

export type Screen = 'menu' | 'game' | 'library' | 'lobby' | 'rules' | 'settings' | 'records' | 'replay';
export type Mode = 'local' | 'lan';
/** 主菜单里的三种本地玩法（各自记忆思考时间） */
export type LocalPlayMode = 'local' | 'ai' | 'training';

export type SeatConfig = { kind: 'human' | 'ai'; aiLevel: AiLevel; name: string };

export interface Settings {
  allowUndo: boolean;
  showLog: boolean;
  animations: boolean;
  /** 动效速度档：1=标准、2=慢、3=更慢（默认 3） */
  animSpeed: AnimSpeed;
  /** 界面语言：system = 跟随系统 */
  lang: Lang | 'system';
  /** 音效总开关 */
  sound: boolean;
  /** 音量档位 */
  volume: SfxVolume;
  /** 极轻的界面按钮点击音 */
  uiClicks: boolean;
  /** 背景音乐开关与音量 */
  music: boolean;
  musicVolume: SfxVolume;
  /** 思考时间（秒，0=不限）：本地三种玩法各记一份；局域网由房主在建房时决定 */
  turnSeconds: Record<LocalPlayMode, number>;
  /** 桌面端：发现新版本后自动后台下载 */
  autoDownloadUpdate: boolean;
  /** 界面缩放（100% / 115% / 130%） */
  uiScale: 1 | 1.15 | 1.3;
}

export type PopupSource =
  | { kind: 'board'; tier: 1 | 2 | 3; slot: number }
  | { kind: 'deck'; tier: 1 | 2 | 3 }
  | { kind: 'reserved'; seat: number; index: number };

export interface Popup {
  cardId: number;
  source: PopupSource;
  /** 触发元素的屏幕位置（用于锚定气泡定位） */
  anchor: { x: number; y: number; w: number; h: number };
}

export interface Toast {
  msg: string;
  at: number;
  kind: 'info' | 'error';
}

/** 最近一次本地操作（底部撤销提示条） */
export interface LastAction {
  label: string;
  at: number;
}

export interface LanState {
  code: string;
  you: number | null;
  spectator: boolean;
  hostSeat: number;
  seats: SeatInfo[];
  started: boolean;
}

/** 局域网时钟（服务器每秒推送；本地按收到时刻平滑插值） */
export interface LanClock {
  seat: number;
  /** 剩余秒数（未超时） */
  remaining: number;
  /** 超时秒数（>0 表示已超时） */
  over: number;
  /** 收到该帧的本地时刻（ms） */
  at: number;
}

interface GameStore {
  screen: Screen;
  mode: Mode;
  game: GameState | null;
  view: GameView | null;
  seats: SeatConfig[];
  history: GameState[];
  events: GameEvent[];
  selected: Color[];
  takeTwo: Color | null;
  popup: Popup | null;
  toast: Toast | null;
  thinking: boolean;
  settings: Settings;
  lan: LanState | null;
  lanConnected: boolean;
  lanServerUrl: string;
  serverUrls: string[];
  /** 局域网服务器通告的更新源信息（零配置：客户端据此自动填更新源） */
  serverUpdates: { updates: boolean; updateVersion?: string; updatePublish?: boolean } | null;
  /** 最近一次可撤销的本地操作 */
  lastAction: LastAction | null;
  /** 本局思考时间（秒，0=不限） */
  turnLimitSec: number;
  /** 本地模式的回合截止时刻（ms）；null=不计时 */
  turnDeadline: number | null;
  /** 局域网的服务器时钟 */
  lanClock: LanClock | null;
  /** 待播放的操作动画（已解析好坐标） */
  animQueue: QueuedAnim[];
  /** 当前对局的记录草稿（种子 + 走法），结束后落库 */
  recordDraft: { mode: RecordMode; seats: RecordSeat[]; seed: string; moves: Move[]; createdAt: number; saved: boolean } | null;
  /** 复盘数据 */
  replay: { record: GameRecord; frames: ReplayFrame[]; index: number } | null;
  /** 记录列表版本号（自增触发刷新） */
  recordsVersion: number;
  /** 联机悔棋：待我表态的请求 */
  undoAsk: { seat: number; name: string } | null;

  startGame: (seats: SeatConfig[], opts?: { seed?: string; turnSeconds?: number; recordMode?: RecordMode }) => void;
  resumeSavedGame: () => boolean;
  setScreen: (s: Screen) => void;
  backToMenu: () => void;
  toggleToken: (c: Color) => void;
  takeTwoDirect: (c: Color) => void;
  setTakeTwo: (c: Color | null) => void;
  clearSelection: () => void;
  confirmTake: () => void;
  openPopup: (p: Popup) => void;
  closePopup: () => void;
  doBuy: (payPriority?: 'saveGold' | 'useGold') => void;
  doReserve: () => void;
  applyHumanMove: (move: Move) => boolean;
  aiTick: () => void;
  undo: () => void;
  showHint: () => void;
  setSettings: (s: Partial<Settings>) => void;
  pushToast: (msg: string, kind?: 'info' | 'error') => void;
  /** 把一组引擎事件转成动画步骤（须在状态更新、DOM 变化之前调用） */
  enqueueAnim: (events: GameEvent[]) => void;
  clearAnim: () => void;
  /** 记录：开始 / 追加走法 / 结束落库 */
  beginRecording: (mode: RecordMode, seats: RecordSeat[], seed: string) => void;
  recordMove: (move: Move) => void;
  finishRecording: (winners: number[], points: number[], turns: number) => void;
  /** 联机悔棋 */
  requestUndo: () => void;
  respondUndo: (accept: boolean) => void;
  /** 复盘 */
  openReplay: (id: string) => Promise<boolean>;
  setReplayIndex: (index: number) => void;
  closeReplay: () => void;
  removeRecord: (id: string) => Promise<void>;

  // 局域网
  lanConnect: () => void;
  lanCreate: (name: string, seatCount: number, turnSeconds?: number) => void;
  lanJoin: (code: string, name: string) => void;
  lanSetSeat: (seat: number, kind: 'open' | 'ai', aiLevel?: AiLevel) => void;
  lanStart: () => void;
  lanFillAiAndStart: () => void;
  lanLeave: () => void;
  setLanServerUrl: (url: string) => void;
  handleServerMsg: (msg: ServerMsg) => void;
  setLanConnected: (connected: boolean) => void;
}

const SETTINGS_KEY = 'splendor.settings.v1';
const REJOIN_KEY = 'splendor.lan.rejoin.v1';
const SAVE_KEY = 'splendor.save.v1';
const LAN_URL_KEY = 'splendor.lan.serverUrl.v1';
const DEFAULT_SETTINGS: Settings = {
  allowUndo: true,
  showLog: false,
  animations: true,
  // 慢节奏：默认「更慢」档（3x）
  animSpeed: 3,
  lang: 'system',
  // 本地热座与单人训练默认不限时；人机默认 60 秒（可在菜单改）
  turnSeconds: { local: 0, ai: 60, training: 0 },
  sound: true,
  volume: 'mid',
  uiClicks: true,
  music: true,
  musicVolume: 'low',
  autoDownloadUpdate: true,
  uiScale: 1,
};

function loadLanServerUrl(): string {
  try {
    return localStorage.getItem(LAN_URL_KEY) ?? '';
  } catch {
    return '';
  }
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const base = raw
      ? (() => {
          const parsed = JSON.parse(raw) as Partial<Settings>;
          return {
            ...DEFAULT_SETTINGS,
            ...parsed,
            turnSeconds: { ...DEFAULT_SETTINGS.turnSeconds, ...(parsed.turnSeconds ?? {}) },
          } as Settings;
        })()
      : DEFAULT_SETTINGS;
    // ?lang=zh|en 覆盖（便于自动化测试与截图固定语言）
    if (typeof window !== 'undefined') {
      const forced = new URLSearchParams(window.location.search).get('lang');
      if (forced === 'zh' || forced === 'en') base.lang = forced;
    }
    return base;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** 开发构建：每步落子后跑一遍引擎不变量，尽早暴露非法状态 */
function devCheckInvariants(state: GameState): void {
  if (!import.meta.env.DEV) return;
  const issues = checkInvariants(state);
  if (issues.length > 0) console.error('[splendor] 引擎不变量异常：', issues);
}

/** 把设置同步到各子系统（音效 / 语言） */
function syncSfx(s: Settings): void {
  configureSfx({ sound: s.sound, volume: s.volume, uiClicks: s.uiClicks });
}

/** 解析当前应使用的语言（system = 跟随系统） */
export function resolveLang(s: Settings): Lang {
  return s.lang === 'system' ? systemLang() : s.lang;
}

function syncLang(s: Settings): void {
  setLang(resolveLang(s));
}

/** 界面缩放：对根元素用 CSS zoom（Chromium 下布局稳定） */
function syncUiScale(s: Settings): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.zoom = s.uiScale === 1 ? '' : String(s.uiScale);
}

function saveRejoin(info: { code: string; token: string }): void {
  try {
    localStorage.setItem(REJOIN_KEY, JSON.stringify(info));
  } catch {
    /* ignore */
  }
}

function loadRejoin(): { code: string; token: string } | null {
  try {
    const raw = localStorage.getItem(REJOIN_KEY);
    return raw ? (JSON.parse(raw) as { code: string; token: string }) : null;
  } catch {
    return null;
  }
}

function clearRejoin(): void {
  try {
    localStorage.removeItem(REJOIN_KEY);
  } catch {
    /* ignore */
  }
}

/** 本地对局自动存档（结束或新开一局时清空） */
function persistLocal(game: GameState | null): void {
  try {
    if (!game || game.phase === 'ended') localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, serializeGame(game));
  } catch {
    /* ignore */
  }
}

export interface SavedGameInfo {
  turn: number;
  finalRound: boolean;
  players: { name: string; points: number; kind: 'human' | 'ai' }[];
}

export function loadSavedGameInfo(): SavedGameInfo | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const game = deserializeGame(raw);
    if (game.phase === 'ended') return null;
    return {
      turn: game.turn,
      finalRound: game.finalRound,
      players: game.players.map((p) => ({ name: p.name, points: totalPoints(p), kind: p.kind })),
    };
  } catch {
    return null;
  }
}

// ---------------- 局域网客户端（可注入测试替身） ----------------

let lanClient: LanClient | null = null;
let lanWantRejoin = false;

export function getLanClient(): LanClient {
  if (!lanClient) {
    lanClient = new LanClient({
      onMessage: (msg) => useGame.getState().handleServerMsg(msg),
      onStatus: (connected) => useGame.getState().setLanConnected(connected),
      onReconnected: () => {
        // 断线重连后自动回到原座位
        const lan = useGame.getState().lan;
        const saved = loadRejoin();
        if (lan && saved && lan.code === saved.code) {
          getLanClient().send({ t: 'rejoin', code: saved.code, token: saved.token } satisfies ClientMsg);
        }
      },
    });
  }
  return lanClient;
}

export function setLanClientForTest(client: LanClient | null): void {
  lanClient = client;
}

/** 启动音效（首次交互解锁音频）——由 App 挂载时调用 */
export function initSfxOnce(): void {
  initSfx();
}

// ---------------- 思考时间（纯提示计时） ----------------

/** 有时限且当前行动者是人类 → 生成本回合截止时刻；否则 null */
function nextDeadline(state: GameState | null, limitSec: number, now = Date.now()): number | null {
  if (!state || limitSec <= 0 || state.phase === 'ended') return null;
  const p = state.players[state.current];
  if (!p || p.kind !== 'human') return null;
  return now + limitSec * 1000;
}

/** 本地对局的音效上下文：真人座位正常音量；终局按"是否有真人获胜"选择胜利/失败音 */
function sfxCtxLocal(state: GameState): SfxEventContext {
  const humanSeats = new Set(state.players.filter((p) => p.kind === 'human').map((p) => p.seat));
  const mySeat = state.phase === 'ended' ? (state.winners?.find((w) => humanSeats.has(w)) ?? null) : state.current;
  return { humanSeats, mySeat, anyHumanTurn: true };
}

/** 本局思考时间随存档一起记住（继续上局时恢复） */
const SAVE_LIMIT_KEY = 'splendor.save.limit.v1';

function saveLimit(limitSec: number): void {
  try {
    localStorage.setItem(SAVE_LIMIT_KEY, String(limitSec));
  } catch {
    /* ignore */
  }
}

function loadSavedLimit(): number {
  try {
    return Number(localStorage.getItem(SAVE_LIMIT_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
}

/** 当前视角是否可以操作（本地模式=当前座位是人类；局域网=轮到自己且非托管/观战） */
export function selectCanAct(s: Pick<GameStore, 'mode' | 'view' | 'lan'>): boolean {
  const v = s.view;
  if (!v || v.phase === 'ended') return false;
  if (s.mode === 'local') return v.players[v.current]!.kind === 'human';
  const lan = s.lan;
  if (!lan || lan.spectator || lan.you == null) return false;
  if (lan.you !== v.current) return false;
  const seat = lan.seats[v.current];
  if (!seat) return false;
  return seat.kind !== 'ai' && !seat.autoPlaying;
}

const INITIAL_SETTINGS = loadSettings();
syncSfx(INITIAL_SETTINGS);
syncLang(INITIAL_SETTINGS);
syncUiScale(INITIAL_SETTINGS);

/** 动画 id 全局递增（避免不同批次步骤 id 重复：重复的 React key 会导致旧节点不被回收） */
let animIdSeq = 0;

export const useGame = create<GameStore>((set, get) => ({
  screen: 'menu',
  mode: 'local',
  game: null,
  view: null,
  seats: [],
  history: [],
  events: [],
  selected: [],
  takeTwo: null,
  popup: null,
  toast: null,
  thinking: false,
  settings: INITIAL_SETTINGS,
  lan: null,
  lanConnected: false,
  lanServerUrl: loadLanServerUrl(),
  serverUrls: [],
  serverUpdates: null,
  lastAction: null,
  turnLimitSec: 0,
  turnDeadline: null,
  lanClock: null,
  animQueue: [],
  recordDraft: null,
  replay: null,
  recordsVersion: 0,
  undoAsk: null,

  enqueueAnim: (events) => {
    if (!get().settings.animations) return; // 关动效：零开销
    const steps = stepsFromEvents(events, animIdSeq + 1, get().settings.animSpeed);
    animIdSeq += steps.length;
    if (animIdSeq > 1_000_000_000) animIdSeq = 0;
    const existing = get().animQueue;
    const queued: QueuedAnim[] = [];
    for (const step of steps) {
      const rects = resolveRects(step);
      if (rects) queued.push({ ...step, from: rects.from, to: rects.to });
    }
    if (queued.length > 0) set({ animQueue: [...existing, ...queued].slice(-16) });
  },

  clearAnim: () => set({ animQueue: [] }),

  beginRecording: (mode, seats, seed) => {
    set({ recordDraft: { mode, seats, seed, moves: [], createdAt: Date.now(), saved: false } });
  },

  recordMove: (move) => {
    const draft = get().recordDraft;
    if (!draft || draft.saved) return;
    set({ recordDraft: { ...draft, moves: [...draft.moves, move] } });
  },

  finishRecording: (winners, points, turns) => {
    const draft = get().recordDraft;
    if (!draft || draft.saved) return;
    const rec: GameRecord = {
      id: `${draft.createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      mode: draft.mode,
      createdAt: draft.createdAt,
      finishedAt: Date.now(),
      seats: draft.seats,
      seed: draft.seed,
      moves: draft.moves,
      winners,
      points,
      turns,
    };
    set({ recordDraft: { ...draft, saved: true }, recordsVersion: get().recordsVersion + 1 });
    void saveRecord(rec)
      .then(() => get().pushToast(T.toast.recordSaved))
      .catch(() => {
        /* 存储不可用时不打扰玩家 */
      });
  },

  requestUndo: () => {
    const st = get();
    if (st.mode !== 'lan' || !st.view || st.view.phase === 'ended') return;
    getLanClient().send({ t: 'undo:request' } satisfies ClientMsg);
    get().pushToast(T.toast.undoRequested(''));
  },

  respondUndo: (accept) => {
    set({ undoAsk: null });
    getLanClient().send({ t: 'undo:respond', accept } satisfies ClientMsg);
  },

  openReplay: async (id) => {
    const rec = await getRecord(id);
    if (!rec) return false;
    const frames = buildFrames(rec);
    set({ replay: { record: rec, frames, index: 0 }, screen: 'replay' });
    return true;
  },

  setReplayIndex: (index) => {
    const replay = get().replay;
    if (!replay) return;
    const clamped = Math.max(0, Math.min(replay.frames.length - 1, index));
    set({ replay: { ...replay, index: clamped } });
  },

  closeReplay: () => set({ replay: null, screen: 'records' }),

  removeRecord: async (id) => {
    await deleteRecord(id).catch(() => {});
    set({ recordsVersion: get().recordsVersion + 1 });
    get().pushToast(T.toast.recordDeleted);
  },

  startGame: (seats, opts) => {
    const limit = opts?.turnSeconds ?? get().turnLimitSec;
    const game = setupGame(
      seats.map((s) => ({ name: s.name, kind: s.kind, aiLevel: s.aiLevel })),
      opts?.seed ? { seed: opts.seed } : {},
    );
    set({
      screen: 'game',
      mode: 'local',
      game,
      view: localView(game),
      seats,
      history: [],
      events: [{ type: 'turn-start', seat: game.current }],
      selected: [],
      takeTwo: null,
      popup: null,
      thinking: false,
      toast: null,
      lan: null,
      lastAction: null,
      turnLimitSec: limit,
      turnDeadline: nextDeadline(game, limit),
      lanClock: null,
    });
    persistLocal(game);
    saveLimit(limit);
    get().beginRecording(
      opts?.recordMode ?? get().recordDraft?.mode ?? 'ai',
      seats.map((x) => ({ name: x.name, kind: x.kind, aiLevel: x.aiLevel })),
      game.seed,
    );
  },

  resumeSavedGame: () => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const game = deserializeGame(raw);
      if (game.phase === 'ended') return false;
      const seats: SeatConfig[] = game.players.map((p) => ({ kind: p.kind, aiLevel: p.aiLevel, name: p.name }));
      const limit = loadSavedLimit();
      set({
        screen: 'game',
        mode: 'local',
        game,
        view: localView(game),
        seats,
        history: [],
        events: [{ type: 'turn-start', seat: game.current }],
        selected: [],
        takeTwo: null,
        popup: null,
        thinking: false,
        toast: null,
        lan: null,
        lastAction: null,
        turnLimitSec: limit,
        turnDeadline: nextDeadline(game, limit),
        lanClock: null,
      });
      get().pushToast(T.toast.resumed);
      return true;
    } catch {
      return false;
    }
  },

  setScreen: (s) => set({ screen: s }),

  backToMenu: () => {
    if (get().mode === 'lan') get().lanLeave();
    set({
      screen: 'menu',
      mode: 'local',
      game: null,
      view: null,
      history: [],
      events: [],
      selected: [],
      takeTwo: null,
      popup: null,
      thinking: false,
      lan: null,
      lastAction: null,
      turnDeadline: null,
      lanClock: null,
      animQueue: [],
    });
  },

  toggleToken: (c) => {
    const { selected, view } = get();
    if (view && view.players[view.current] && view.bank[c] <= 0) return;
    if (selected.includes(c)) {
      set({ selected: selected.filter((x) => x !== c) });
    } else if (selected.length < 3) {
      set({ selected: [...selected, c], takeTwo: null });
      playSfx('gemPick');
    } else {
      get().pushToast(T.toast.maxSelect, 'error');
    }
  },

  setTakeTwo: (c) => {
    if (c) playSfx('gemPick');
    set({ takeTwo: c, selected: [] });
  },

  /** 双击宝石 = 选择「拿 2 枚同色」（与 ×2 按钮一致，需再点确认） */
  takeTwoDirect: (c) => {
    const state = get();
    if (!state.view || state.view.bank[c] < 4) return;
    if (state.takeTwo === c) set({ takeTwo: null });
    else {
      playSfx('gemPick');
      set({ takeTwo: c, selected: [] });
    }
  },

  clearSelection: () => set({ selected: [], takeTwo: null }),

  confirmTake: () => {
    const { selected, takeTwo } = get();
    if (takeTwo) {
      get().applyHumanMove({ type: 'take2', color: takeTwo });
    } else if (selected.length > 0) {
      get().applyHumanMove({ type: 'take', colors: [...selected] });
    }
  },

  openPopup: (p) => set({ popup: p }),
  closePopup: () => set({ popup: null }),

  doBuy: (payPriority?: 'saveGold' | 'useGold') => {
    const { popup, view } = get();
    if (!popup || !view) return;
    if (popup.source.kind === 'deck') {
      get().pushToast(T.toast.deckNeedsReserve, 'error');
      return;
    }
    const me = view.players[view.current]!;
    const card = cardById(popup.cardId);
    const plans = paymentOptions(me, card);
    const pay = (payPriority ?? 'saveGold') === 'useGold' ? plans.useGold.pay : plans.saveGold.pay;
    const move: Move =
      popup.source.kind === 'board'
        ? { type: 'buy', target: { kind: 'board', tier: popup.source.tier, slot: popup.source.slot }, pay }
        : { type: 'buy', target: { kind: 'reserved', index: popup.source.index }, pay };
    get().applyHumanMove(move);
  },

  doReserve: () => {
    const { popup } = get();
    if (!popup) return;
    const target =
      popup.source.kind === 'board'
        ? { kind: 'board' as const, tier: popup.source.tier, slot: popup.source.slot }
        : popup.source.kind === 'deck'
          ? { kind: 'deck' as const, tier: popup.source.tier }
          : null;
    if (!target) return;
    get().applyHumanMove({ type: 'reserve', target });
  },

  applyHumanMove: (move) => {
    const { mode } = get();
    if (mode === 'lan') {
      getLanClient().send({ t: 'move', move } satisfies ClientMsg);
      return true;
    }
    const { game, history } = get();
    if (!game || game.phase === 'ended') return false;
    const snapshot = cloneState(game);
    const label = describeMove(game, move);
    const res = applyMove(game, move);
    if (res.error) {
      get().pushToast(res.error, 'error');
      return false;
    }
    get().enqueueAnim(res.events);
    set({
      game: res.state,
      view: localView(res.state),
      events: res.events,
      history: [...history, snapshot].slice(-40),
      selected: [],
      takeTwo: null,
      popup: null,
      lastAction: { label, at: Date.now() },
      turnDeadline: nextDeadline(res.state, get().turnLimitSec),
    });
    persistLocal(res.state);
    sfxForEvents(res.events, sfxCtxLocal(res.state));
    get().recordMove(move);
    devCheckInvariants(res.state);
    if (res.state.phase === 'ended') {
      get().finishRecording(res.state.winners ?? [], res.state.players.map(totalPoints), res.state.turn);
    }
    return true;
  },

  aiTick: () => {
    const { game, screen, mode } = get();
    if (mode !== 'local' || !game || screen !== 'game' || game.phase === 'ended') return;
    const p = game.players[game.current]!;
    if (p.kind !== 'ai') return;
    set({ thinking: true });
    const move = chooseMove(game, p.aiLevel);
    const res = applyMove(game, move);
    if (res.error) {
      set({ thinking: false });
      get().pushToast(T.game.aiError(errText(res.error)), 'error');
      return;
    }
    get().enqueueAnim(res.events);
    set({
      game: res.state,
      view: localView(res.state),
      events: res.events,
      thinking: false,
      lastAction: null,
      turnDeadline: nextDeadline(res.state, get().turnLimitSec),
    });
    persistLocal(res.state);
    sfxForEvents(res.events, sfxCtxLocal(res.state));
    get().recordMove(move);
    devCheckInvariants(res.state);
    if (res.state.phase === 'ended') {
      get().finishRecording(res.state.winners ?? [], res.state.players.map(totalPoints), res.state.turn);
    }
  },

  undo: () => {
    const { history, game, settings, mode } = get();
    if (mode !== 'local' || !game || history.length === 0) return;
    if (!settings.allowUndo) {
      get().pushToast(T.toast.undoOff, 'error');
      return;
    }
    const prev = history[history.length - 1]!;
    get().clearAnim();
    const draft = get().recordDraft;
    if (draft && !draft.saved && draft.moves.length > 0) {
      set({ recordDraft: { ...draft, moves: draft.moves.slice(0, -1) } });
    }
    set({
      game: prev,
      view: localView(prev),
      history: history.slice(0, -1),
      events: [{ type: 'turn-start', seat: prev.current }],
      selected: [],
      takeTwo: null,
      popup: null,
      lastAction: null,
      turnDeadline: nextDeadline(prev, get().turnLimitSec),
    });
    persistLocal(prev);
    playSfx('undo');
    get().pushToast(T.toast.undoDone);
  },

  showHint: () => {
    const { game, mode } = get();
    if (mode !== 'local' || !game || game.phase === 'ended') return;
    const level = game.players[game.current]!.kind === 'ai' ? game.players[game.current]!.aiLevel : 'normal';
    const move = chooseMove(game, level);
    // 提示 = 推荐动作 + 一句话理由（用公开信息解释，不读牌堆）
    get().pushToast(`${T.game.suggestion(describeMove(game, move))} · ${explainMove(game, move)}`);
  },

  setSettings: (s) => {
    const next = { ...get().settings, ...s, turnSeconds: { ...get().settings.turnSeconds, ...(s.turnSeconds ?? {}) } };
    saveSettings(next);
    syncSfx(next);
    syncLang(next);
    syncUiScale(next);
    set({ settings: next });
  },

  pushToast: (msg, kind = 'info') => {
    if (!msg) return;
    if (kind === 'error') playSfx('error');
    set({ toast: { msg, at: Date.now(), kind } });
  },

  // ---------------- 局域网 ----------------

  lanConnect: () => {
    lanWantRejoin = true;
    const client = getLanClient();
    if (!client.connected) {
      const custom = get().lanServerUrl.trim();
      client.connect(custom || defaultLanUrl());
    }
  },

  setLanServerUrl: (url) => {
    const trimmed = url.trim();
    set({ lanServerUrl: trimmed });
    try {
      if (trimmed) localStorage.setItem(LAN_URL_KEY, trimmed);
      else localStorage.removeItem(LAN_URL_KEY);
    } catch {
      /* ignore */
    }
  },

  lanCreate: (name, seatCount, turnSeconds) => {
    get().lanConnect();
    const msg: ClientMsg = turnSeconds != null ? { t: 'create', name, seatCount, turnSeconds } : { t: 'create', name, seatCount };
    getLanClient().send(msg);
  },

  lanJoin: (code, name) => {
    get().lanConnect();
    getLanClient().send({ t: 'join', code: code.trim().toUpperCase(), name } satisfies ClientMsg);
  },

  lanSetSeat: (seat, kind, aiLevel) => {
    getLanClient().send({ t: 'setSeat', seat, kind, aiLevel } satisfies ClientMsg);
  },

  lanStart: () => {
    getLanClient().send({ t: 'start' } satisfies ClientMsg);
  },

  lanFillAiAndStart: () => {
    const lan = get().lan;
    if (!lan) return;
    for (const s of lan.seats) {
      if (s.kind === 'open') getLanClient().send({ t: 'setSeat', seat: s.seat, kind: 'ai', aiLevel: 'normal' } satisfies ClientMsg);
    }
    getLanClient().send({ t: 'start' } satisfies ClientMsg);
  },

  lanLeave: () => {
    getLanClient().send({ t: 'leave' } satisfies ClientMsg);
    clearRejoin();
    set({ lan: null, view: null, events: [], screen: 'menu' });
  },

  handleServerMsg: (msg) => {
    switch (msg.t) {
      case 'welcome': {
        set({ serverUrls: msg.urls });
        const info: { updates: boolean; updateVersion?: string; updatePublish?: boolean } = { updates: msg.updates === true };
        if (msg.updateVersion) info.updateVersion = msg.updateVersion;
        if (msg.updatePublish) info.updatePublish = msg.updatePublish;
        set({ serverUpdates: info });
        // 版本握手：桌面端本机版本与服务器版本 Major.Minor 不一致时提示（浏览器端与服务端同源，无需比较）
        const mine = desktopAppVersion();
        const theirs = msg.appVersion;
        if (mine && theirs && theirs !== 'dev') {
          const short = (v: string): string => v.split('.').slice(0, 2).join('.');
          if (short(mine) !== short(theirs)) get().pushToast(T.toast.versionMismatch(theirs, mine), 'error');
        }
        if (lanWantRejoin) {
          const saved = loadRejoin();
          if (saved) getLanClient().send({ t: 'rejoin', code: saved.code, token: saved.token } satisfies ClientMsg);
        }
        break;
      }
      case 'room': {
        const lan: LanState = {
          code: msg.code,
          you: msg.you.seat,
          spectator: msg.you.spectator,
          hostSeat: msg.hostSeat,
          seats: msg.seats,
          started: msg.started,
        };
        if (msg.you.token && !msg.you.spectator) saveRejoin({ code: msg.code, token: msg.you.token });
        set({
          lan,
          screen: msg.started ? 'game' : 'lobby',
          popup: null,
          selected: [],
          takeTwo: null,
          mode: 'lan',
          turnLimitSec: msg.turnSeconds ?? 0,
        });
        break;
      }
      case 'clock': {
        set({ lanClock: { seat: msg.seat, remaining: msg.remaining, over: msg.over, at: Date.now() } });
        break;
      }
      case 'state': {
        const v = fromClientState(msg.view);
        const lan = get().lan;
        const limit = get().turnLimitSec;
        const seatKind = lan?.seats[v.current]?.kind ?? 'human';
        const prevClock = get().lanClock;
        // 换人时先按满额显示，等服务器下一帧时钟推送校正（避免读秒闪烁）
        const lanClock =
          v.phase === 'ended' || limit <= 0 || seatKind === 'ai'
            ? null
            : prevClock && prevClock.seat === v.current
              ? prevClock
              : { seat: v.current, remaining: limit, over: 0, at: Date.now() };
        get().enqueueAnim(msg.events);
        set({
          mode: 'lan',
          view: v,
          events: msg.events,
          screen: 'game',
          popup: null,
          selected: [],
          takeTwo: null,
          lanClock,
        });
        const humanSeats = new Set((lan?.seats ?? []).filter((s) => s.kind !== 'ai').map((s) => s.seat));
        sfxForEvents(msg.events, { humanSeats, mySeat: lan?.you ?? null });

        // 对局记录（局域网）：草稿在首个状态消息时建立；结束时才拿到种子
        if (lan && !lan.spectator && v.players.length > 0) {
          const draft = get().recordDraft;
          if (!draft) {
            get().beginRecording(
              'lan',
              v.players.map((p, i) => ({ name: lan.seats[i]?.name ?? p.name, kind: lan.seats[i]?.kind === 'ai' ? 'ai' : 'human' })),
              msg.seed ?? '',
            );
          } else if (msg.seed && draft.seed !== msg.seed) {
            set({ recordDraft: { ...draft, seed: msg.seed } });
          }
          if (msg.move) get().recordMove(msg.move);
          // 悔棋回滚：服务端给出权威步数，客户端据此截断本局记录
          const draftNow = get().recordDraft;
          if (draftNow && !draftNow.saved && msg.moveCount != null && draftNow.moves.length > msg.moveCount) {
            set({ recordDraft: { ...draftNow, moves: draftNow.moves.slice(0, msg.moveCount) } });
          }
          if (v.phase === 'ended') {
            get().finishRecording(
              v.winners ?? [],
              v.players.map((p) => totalPointsOfView(p)),
              v.turn,
            );
          }
        }
        break;
      }
      case 'undo:ask': {
        const you = get().lan?.you ?? null;
        if (you != null && msg.voters.includes(you)) {
          set({ undoAsk: { seat: msg.seat, name: msg.name } });
        }
        break;
      }
      case 'undo:result': {
        set({ undoAsk: null });
        const name = get().view?.players[msg.seat]?.name ?? '';
        get().pushToast(msg.ok ? T.toast.undoAccepted(name) : T.toast.undoRejected(name));
        break;
      }
      case 'error': {
        get().pushToast(errText(msg.code), 'error');
        break;
      }
      case 'left': {
        clearRejoin();
        set({ lan: null, view: null, events: [], screen: 'menu', mode: 'local' });
        break;
      }
      case 'pong':
        break;
    }
  },

  setLanConnected: (connected) => {
    set({ lanConnected: connected });
  },
}));
