import './style.css';
import { WorkerAi } from './ai/client';
import { Game } from './game/engine';
import type { GameConfig, PlayerCount, SerializedGame, VariantId } from './game/types';
import { difficultyLabel, initI18n, t, playerName } from './i18n';
import { initSound } from './sound';
import { LanRoom } from './net/lan';
import { LanSocial } from './net/lanSocial';
import { PROTOCOL_VERSION, type HostInfo } from './net/protocol';
import type { GameMode, GameRecord } from './records';
import { saveGameRecord } from './records';
import { clearInProgress, loadInProgress, saveInProgress, type SavedGame } from './savegame';
import { Session } from './session/session';
import { renderReplay } from './ui/replay';
import { renderGuide, guideSeen } from './ui/guide';
import { explainMove } from './ai/explain';
import { renderStats } from './ui/stats';
import { VoteCard } from './ui/voteCard';
import { errMsg, invokeTauri, isTauri, toast } from './ui/dom';
import { GameScreen, type SeatInfo } from './ui/gameScreen';
import { renderLanSetup, renderLobby, servedByRoom, type LanCtx, type LobbyScreen } from './ui/lanScreens';
import {
  renderHome,
  renderSetupAi,
  renderSetupHotseat,
  type AiOpts,
  type HotseatOpts,
  type Screen,
} from './ui/screens';

initI18n();
initSound();

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app not found');

let current: Screen | null = null;
let aiClient: WorkerAi | null = null;
let lobbyScreen: LobbyScreen | null = null;
let lan: {
  room: LanRoom;
  session: Session;
  stopGuard: () => void;
  social: LanSocial;
  voteCard: VoteCard;
} | null = null;
let lanPrevConnected = new Map<number, boolean>();

const ctx: LanCtx = {
  show(screen: Screen): void {
    if (current?.destroy) current.destroy();
    app.replaceChildren(screen.root);
    current = screen;
  },
  home(): Screen {
    return renderHome(ctx);
  },
  toast,
  startHotseat(opts: HotseatOpts): void {
    startHotseat(opts);
  },
  startAi(opts: AiOpts): void {
    startAi(opts);
  },
  openLanSetup(): void {
    ctx.show(renderLanSetup(ctx));
  },
  openStats(): void {
    ctx.show(renderStats(ctx));
  },
  openGuide(): void {
    ctx.show(renderGuide(ctx));
  },
  hostLan(opts): Promise<void> {
    return hostLan(opts);
  },
  joinLan(ip, port, name, code): Promise<void> {
    return joinLan(ip, port, name, code);
  },
  leaveLobby(): void {
    exitLan();
  },
  resumeGame(save: SavedGame): void {
    resumeGame(save);
  },
  discardResume(): void {
    clearInProgress();
    ctx.show(ctx.home());
  },
};

function getAi(): WorkerAi {
  if (!aiClient) aiClient = new WorkerAi();
  return aiClient;
}

/** snapshot of a finished (or running) game, for records and replays */
function buildRecord(mode: GameMode, session: Session): GameRecord {
  const g = session.game;
  return {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    at: Date.now(),
    mode,
    config: { ...g.config },
    seats: session.opts.seats.map((s) => s.name),
    localSeats: [...session.opts.localSeats],
    scores: g.scores(),
    ranking: g.ranking(),
    history: g.history.slice(),
  };
}

/** a finished game goes into the record list; nothing left to resume */
function finishRecord(mode: GameMode, session: Session): void {
  saveGameRecord(buildRecord(mode, session));
  clearInProgress();
}

/** AI seat labels for solo games (also used when continuing a saved game) */
function aiSeatInfo(players: number, humanSeat: number, difficulty: 'easy' | 'normal' | 'hard'): SeatInfo[] {
  const aiCount = players - 1;
  let aiIndex = 0;
  const seats: SeatInfo[] = [];
  for (let i = 0; i < players; i++) {
    if (i === humanSeat) {
      seats.push({ name: t('game.you'), kind: 'human' });
    } else {
      aiIndex++;
      const level = difficultyLabel(difficulty);
      seats.push({
        name: aiCount > 1 ? t('ai.nameN', { n: aiIndex, level }) : t('ai.name', { level }),
        kind: 'ai',
      });
    }
  }
  return seats;
}

// ------------------------------------------------------------------- mounting

/** auto-save the running game after every applied action */
let persistSig = '';
function persistSession(session: Session, mode: GameMode): void {
  const g = session.game;
  const sig = `${mode}:${g.config.variant}:${g.config.players}:${g.history.length}:${g.over}`;
  if (sig === persistSig) return;
  persistSig = sig;
  if (g.over || g.history.length === 0) {
    clearInProgress();
    return;
  }
  saveInProgress({
    v: 1,
    savedAt: Date.now(),
    mode,
    config: { ...g.config },
    seats: session.opts.seats.map((s) => ({ name: s.name, kind: s.kind })),
    localSeats: [...session.opts.localSeats],
    difficulty: session.opts.difficulty,
    history: g.history.slice(),
  });
}

function mount(session: Session, mode: GameMode, social?: LanSocial): void {
  const screen = new GameScreen({
    place: (m) => session.handlePlace(m),
    pass: () => session.handlePass(),
    hint: () => {
      void session.handleHint().then(() => {
        const hint = session.getSync().hint;
        if (hint) {
          const { reason } = explainMove(session.game, hint);
          toast(t(`hint.reason.${reason}` as 'hint.reason.size'), 3600);
        }
      });
    },
    undo: () => session.handleUndo(),
    exit: () => {
      clearInProgress();
      session.handleExit();
    },
    rematch: () => session.handleRematch(),
    replay: () => {
      const rec = buildRecord(mode, session);
      ctx.show(renderReplay(ctx, rec, () => mount(session, mode, social)));
    },
    undoRequest: () => social?.requestUndo(),
    togglePause: () => social?.togglePause(),
    nudge: () => social?.nudge(),
  });
  session.bind(() => {
    screen.sync(session.getSync());
    persistSession(session, mode);
  });
  ctx.show({ root: screen.root, destroy: () => screen.destroy() });
  // paint once up front — matters when remounting (e.g. back from a replay)
  screen.sync(session.getSync());
}

// ------------------------------------------------------------------ local games

function startHotseat(opts: HotseatOpts): void {
  const seats: SeatInfo[] = opts.names.map((name) => ({ name, kind: 'human' }));
  const session = new Session({
    config: { variant: opts.variant, players: opts.players },
    seats,
    localSeats: seats.map((_, i) => i),
    allowHint: false,
    allowUndo: false,
    onExit: () => ctx.show(ctx.home()),
    onGameOver: () => finishRecord('hotseat', session),
  });
  mount(session, 'hotseat');
  session.start();
}

function startAi(opts: AiOpts): void {
  const humanSeat = opts.humanFirst ? 0 : opts.players - 1;
  const seats = aiSeatInfo(opts.players, humanSeat, opts.difficulty);
  const session = new Session({
    config: { variant: opts.variant, players: opts.players },
    seats,
    localSeats: [humanSeat],
    difficulty: opts.difficulty,
    allowHint: true,
    allowUndo: true,
    ai: getAi(),
    onExit: () => ctx.show(ctx.home()),
    onGameOver: () => finishRecord('ai', session),
  });
  mount(session, 'ai');
  session.start();
}

/** continue an interrupted game (or review it when the LAN room is gone) */
function resumeGame(save: SavedGame): void {
  if (save.mode === 'lan') {
    const game = new Game(save.config, save.history);
    const rec: GameRecord = {
      id: `resume-${save.savedAt}`,
      at: save.savedAt,
      mode: 'lan',
      config: { ...save.config },
      seats: save.seats.map((s) => s.name),
      localSeats: [...save.localSeats],
      scores: game.scores(),
      ranking: game.ranking(),
      history: save.history.slice(),
    };
    ctx.show(renderReplay(ctx, rec, () => ctx.show(ctx.home())));
    return;
  }
  let session: Session;
  if (save.mode === 'ai') {
    const humanSeat = save.localSeats[0] ?? 0;
    const difficulty = save.difficulty ?? 'normal';
    session = new Session({
      config: save.config,
      seats: aiSeatInfo(save.config.players, humanSeat, difficulty),
      localSeats: [humanSeat],
      difficulty,
      allowHint: true,
      allowUndo: true,
      ai: getAi(),
      onExit: () => ctx.show(ctx.home()),
      onGameOver: () => finishRecord('ai', session),
    });
  } else {
    session = new Session({
      config: save.config,
      seats: save.seats.map((s) => ({ name: s.name, kind: 'human' as const })),
      localSeats: save.seats.map((_, i) => i),
      allowHint: false,
      allowUndo: false,
      onExit: () => ctx.show(ctx.home()),
      onGameOver: () => finishRecord('hotseat', session),
    });
  }
  mount(session, save.mode);
  // rebuild the board and let AI turns continue on their own
  session.reset(new Game(save.config, save.history));
}

// ------------------------------------------------------------------ LAN games

async function hostLan(opts: { port: number; room: string; config: GameConfig }): Promise<void> {
  if (!isTauri()) {
    toast(t('lan.browserCannotHostToast'));
    return;
  }
  try {
    const info = await invokeTauri<HostInfo>('start_host', {
      port: opts.port,
      room: opts.room,
      maxPlayers: opts.config.players,
      variant: opts.config.variant,
    });
    const room = await LanRoom.openHost(info, { room: opts.room, config: opts.config });
    wireRoom(room);
    lobbyScreen = renderLobby(ctx, room);
    ctx.show(lobbyScreen);
  } catch (err) {
    toast(errMsg(err));
  }
}

async function joinLan(ip: string, port: number, name: string, code: string): Promise<void> {
  try {
    const room = await LanRoom.openGuest(ip, port, name, code);
    wireRoom(room);
    lobbyScreen = renderLobby(ctx, room);
    ctx.show(lobbyScreen);
  } catch (err) {
    toast(errMsg(err));
  }
}

function wireRoom(room: LanRoom): void {
  room.events = {
    onRoom: () => {
      lobbyScreen?.refresh();
      if (lan && lan.room === room) {
        syncSeatConn(room, lan.session);
        // tell the social layer about players who dropped mid-vote
        for (const p of room.players) {
          const was = lanPrevConnected.get(p.slot);
          if (was === true && !p.connected) lan.social.onPlayerDisconnected(p.slot);
          lanPrevConnected.set(p.slot, p.connected);
        }
      }
    },
    onStart: (config, seatNames) => {
      if (lan) cleanupLan(true); // stale session from another room, if any
      startLanGame(room, config, seatNames);
    },
    onSync: (snapshot, config, seatNames) => {
      if (lan && lan.room === room) {
        lan.session.netSync(snapshot);
        return;
      }
      if (lan) cleanupLan(true);
      startLanGame(room, config, seatNames, snapshot);
    },
    onGameMessage: (from, msg) => {
      if (!lan || lan.room !== room) return;
      if (msg.g === 'request' || msg.g === 'applied') {
        lan.session.netIngest(from, msg.a, msg.v);
      }
    },
    onUndoAsk: (from) => {
      if (!lan || lan.room !== room) return;
      lan.social.onUndoAsk(from);
    },
    onSocial: (from, msg) => {
      if (!lan || lan.room !== room) return;
      lan.social.onSocial(from, msg);
    },
    onRematch: () => {
      if (!lan || lan.room !== room) return;
      lan.session.reset(new Game(room.config));
    },
    onClosed: (reason) => {
      toast(reason);
      if (lan && lan.room === room) cleanupLan(false);
      else lobbyScreen = null;
      ctx.show(ctx.home());
    },
  };
}

function startLanGame(
  room: LanRoom,
  config: GameConfig,
  seatNames: string[],
  snapshot?: SerializedGame,
): void {
  const mySlot = room.spectating ? -1 : room.role === 'host' ? room.hostSlot : room.slot;
  const seats: SeatInfo[] = room.spectating
    ? room.spectatorSeats()
    : seatNames.map((name, i) => ({
        name,
        kind: i === mySlot ? 'human' : 'remote',
        connected: room.players.find((p) => p.slot === i)?.connected ?? false,
      }));
  const session = new Session({
    config,
    seats,
    localSeats: mySlot >= 0 ? [mySlot] : [],
    allowHint: false,
    allowUndo: false,
    net: room.bridge(),
    onExit: () => exitLan(),
    onGameOver: () => finishRecord('lan', session),
  });
  room.gameRef = {
    serialize: () => session.game.serialize(),
    seatNames: () => session.opts.seats.map((s) => s.name),
  };
  const voteCard = new VoteCard();
  const social = new LanSocial({
    role: room.role,
    me: mySlot,
    session: () => session,
    room: () => lan?.room ?? null,
    voteCard,
    toast: (msg, ms) => toast(msg, ms ?? 2400),
  });
  const stopGuard = room.role === 'host' ? startHostGuard(room, session) : (): void => {};
  const stopReminder = room.role === 'host' ? startTurnReminder(room, session) : (): void => {};
  lan = {
    room,
    session,
    stopGuard: () => {
      stopGuard();
      stopReminder();
    },
    social,
    voteCard,
  };
  lanPrevConnected = new Map(room.players.map((p) => [p.slot, p.connected]));
  mount(session, 'lan', social);
  if (snapshot) {
    session.netSync(snapshot);
  } else {
    session.start();
  }
}

function syncSeatConn(room: LanRoom, session: Session): void {
  const seats = session.opts.seats;
  let changed = false;
  for (let i = 0; i < seats.length; i++) {
    const p = room.players.find((x) => x.slot === i);
    const connected = p ? p.connected : false;
    if (seats[i].connected !== connected) {
      seats[i].connected = connected;
      changed = true;
    }
  }
  if (changed) session.poke();
}

/** host-only: keeps the game flowing when a player drops mid-game (AI proxy after 12s) */
function startHostGuard(room: LanRoom, session: Session): () => void {
  let watchedSeat = -1;
  let since = 0;
  let busy = false;
  let acting = -1; // seat currently played by the AI caretaker
  const timer = setInterval(() => {
    if (busy) return;
    const g = session.game;
    if (g.over) return;
    const seat = g.turn;
    const player = room.players.find((p) => p.slot === seat);
    if (!player || player.connected) {
      if (acting === seat && player?.connected) {
        // the player came back while the caretaker was playing
        room.broadcastNotice('returned', seat);
        acting = -1;
      }
      watchedSeat = seat;
      since = 0;
      return;
    }
    if (watchedSeat !== seat) {
      watchedSeat = seat;
      since = Date.now();
      return;
    }
    if (Date.now() - since < 12000) return;
    busy = true;
    if (acting !== seat) {
      acting = seat;
      room.broadcastNotice('caretaker', seat);
      toast(t('notice.caretaker', { name: seatNameOf(room, seat) }), 3000);
    }
    const ai = getAi();
    void (async () => {
      try {
        if (g.mustPass(seat)) {
          session.netIngest(seat, { kind: 'pass', p: seat });
        } else {
          const mv = await ai.chooseMove(g.serialize(), seat, 'normal', 800);
          if (mv) session.netIngest(seat, mv);
        }
      } finally {
        busy = false;
        since = Date.now();
      }
    })();
  }, 1000);
  return () => clearInterval(timer);
}

/** host-only: a gentle "it's been a while" nudge — a reminder, never a penalty */
const SLOW_TURN_MS = 90_000;
function startTurnReminder(room: LanRoom, session: Session): () => void {
  let turn = -1;
  let hist = -1;
  let since = Date.now();
  let reminded = false;
  const timer = setInterval(() => {
    const g = session.game;
    if (g.over || session.isFrozen()) return;
    if (g.turn !== turn || g.history.length !== hist) {
      turn = g.turn;
      hist = g.history.length;
      since = Date.now();
      reminded = false;
      return;
    }
    if (reminded || Date.now() - since < SLOW_TURN_MS) return;
    const p = room.players.find((x) => x.slot === turn);
    if (!p || !p.connected || p.spectator) return; // offline seats are the guard's job
    reminded = true;
    room.broadcastNotice('slow', turn);
    toast(t('notice.slow', { name: p.name }), 3600);
  }, 2000);
  return () => clearInterval(timer);
}

function seatNameOf(room: LanRoom, slot: number): string {
  return room.players.find((p) => p.slot === slot)?.name ?? t('result.player', { n: slot + 1 });
}

function exitLan(): void {
  const wasHost = lan?.room.role === 'host';
  cleanupLan(true);
  if (wasHost && isTauri()) {
    void invokeTauri('stop_host').catch(() => undefined);
  }
  ctx.show(ctx.home());
}

function cleanupLan(closeRoom: boolean): void {
  lobbyScreen = null;
  if (!lan) return;
  const room = lan.room;
  lan.stopGuard();
  lan.social.reset();
  lan.voteCard.destroy();
  lan = null;
  room.events = {};
  if (closeRoom) room.leave();
}

// ---------------------------------------------------------------------- boot

// dev/debug helpers (used by the screenshot/e2e scripts and manual testing;
// not reachable from the UI). A fixed seed gives a reproducible position —
// the screenshots pass the same one every time.
(globalThis as Record<string, unknown>).__blokusProtocol = PROTOCOL_VERSION;
(globalThis as Record<string, unknown>).__blokusAuto = async (
  moves: number,
  variant: VariantId = 'standard',
  players: PlayerCount = 4,
  seed?: number,
): Promise<boolean> => {
  const names = [1, 2, 3, 4].map((n) => playerName(n));
  const seats: SeatInfo[] = Array.from({ length: players }, (_, i) => ({
    name: names[i] ?? `P${i + 1}`,
    kind: 'human' as const,
  }));
  const session = new Session({
    config: { variant, players },
    seats,
    localSeats: seats.map((_, i) => i),
    allowHint: false,
    allowUndo: false,
    onExit: () => ctx.show(ctx.home()),
    onGameOver: () => finishRecord('hotseat', session),
  });
  mount(session, 'hotseat');
  const ai = getAi();
  for (let i = 0; i < moves; i++) {
    const g = session.game;
    if (g.over) break;
    const seat = g.turn;
    if (g.mustPass(seat)) {
      session.handlePass();
      continue;
    }
    const mv = await ai.chooseMove(g.serialize(), seat, 'normal', 400, seed === undefined ? undefined : seed + i);
    if (mv) session.handlePlace(mv);
  }
  // a debug helper must not leave a resume banner behind
  clearInProgress();
  return true;
};

// first run: show the guide instead of dropping straight into the home screen.
// a browser opened from an invite link goes straight to the join screen with
// the address (and room code) prefilled.
if (servedByRoom()) {
  ctx.show(renderLanSetup(ctx));
} else if (!guideSeen()) {
  ctx.show(renderGuide(ctx));
} else {
  ctx.show(renderHome(ctx));
}
