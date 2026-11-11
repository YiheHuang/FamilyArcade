import { t } from '../i18n';
import type { Session } from '../session/session';
import type { LanRoom } from './lan';
import type { GameMsg } from './protocol';
import { LanVote } from './vote';
import type { VoteCard } from '../ui/voteCard';

export interface LanSocialDeps {
  role: 'host' | 'guest';
  /** my slot (players only; spectators never get social controls) */
  me: number;
  session: () => Session;
  room: () => LanRoom | null;
  voteCard: VoteCard;
  toast: (msg: string, ms?: number) => void;
}

const VOTE_TIMEOUT_MS = 60_000;
const NUDGE_THROTTLE_MS = 30_000;

/**
 * LAN social layer: unanimous undo votes, host pause, and nudges.
 * The host owns the vote; guests send requests/votes.
 */
export class LanSocial {
  private vote: LanVote | null = null;
  private voteTimer: number | null = null;
  private paused = false;
  private readonly nudgedAt = new Map<number, number>();

  constructor(private readonly deps: LanSocialDeps) {}

  // ------------------------------------------------------------------ undo

  /** a local player pressed "request undo" */
  requestUndo(): void {
    if (this.vote) {
      this.deps.toast(t('vote.busy'));
      return;
    }
    if (this.deps.role === 'guest') {
      this.deps.room()?.askUndo();
      return;
    }
    this.hostStartVote(this.deps.me);
  }

  /** host: a guest would like to undo */
  onUndoAsk(from: number): void {
    if (this.vote) {
      this.deps.room()?.sendNotice(from, 'vote-busy');
      return;
    }
    this.hostStartVote(from);
  }

  /** guest: cancel my own pending request */
  cancelRequest(): void {
    if (!this.vote) return;
    const room = this.deps.room();
    if (this.deps.role === 'host') {
      this.finishVote(false, { reason: 'cancel' });
    } else {
      room?.broadcastMsg({ g: 'undo-cancel', id: this.vote.id });
      // the host will resolve it; hide our card optimistically
      this.vote = null;
      this.deps.voteCard.hide();
    }
  }

  private hostStartVote(requester: number): void {
    const session = this.deps.session();
    const room = this.deps.room();
    if (!room || session.game.over) return;
    let toIndex = -1;
    for (let i = session.game.history.length - 1; i >= 0; i--) {
      if (session.game.history[i].p === requester) {
        toIndex = i;
        break;
      }
    }
    if (toIndex < 0) return; // nothing to undo for that seat
    const discarded = session.game.history.length - toIndex;
    const voters = room.players
      .filter((p) => p.connected && !p.spectator && p.slot < room.config.players)
      .map((p) => p.slot);
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    this.vote = new LanVote(id, requester, toIndex, discarded, voters);
    session.setFrozen(true);
    room.broadcastMsg({ g: 'undo-request', id, slot: requester, toIndex, discarded });
    this.showVoteUi();
    this.voteTimer = window.setTimeout(() => {
      if (this.vote?.id === id) this.finishVote(false, { reason: 'timeout' });
    }, VOTE_TIMEOUT_MS);
  }

  /** draw the vote card for whoever is looking at it */
  private showVoteUi(): void {
    const v = this.vote;
    const room = this.deps.room();
    if (!v || !room) return;
    const requesterName = this.seatName(v.requester);
    const body = t('vote.undo.body', { name: requesterName, n: v.discarded });
    if (v.requester === this.deps.me) {
      const st = v.status();
      this.deps.voteCard.show({
        title: t('vote.undo.title'),
        body,
        status: st.pending ? t('vote.waiting', { done: st.done, total: st.total }) : '',
        buttons: [{ label: t('vote.cancel'), onClick: () => this.cancelRequest() }],
      });
    } else {
      this.deps.voteCard.show({
        title: t('vote.undo.title'),
        body,
        buttons: [
          {
            label: t('vote.agree'),
            primary: true,
            onClick: () => this.sendVote(v.id, true),
          },
          { label: t('vote.reject'), danger: true, onClick: () => this.sendVote(v.id, false) },
        ],
      });
    }
  }

  private sendVote(id: string, ok: boolean): void {
    const room = this.deps.room();
    if (!room) return;
    if (this.deps.role === 'host') {
      // the host does not receive its own broadcast: record locally
      this.onSocial(this.deps.me, { g: 'undo-vote', id, slot: this.deps.me, ok });
    } else {
      room.broadcastMsg({ g: 'undo-vote', id, slot: this.deps.me, ok });
    }
    const v = this.vote;
    if (!v) return; // my vote resolved the vote (e.g. everyone had agreed already)
    const st = v.status();
    this.deps.voteCard.show({
      title: t('vote.undo.title'),
      body: t('vote.undo.body', { name: this.seatName(v.requester), n: v.discarded }),
      status: st.pending ? t('vote.waiting', { done: st.done, total: st.total }) : '',
      buttons: [],
    });
  }

  // ------------------------------------------------------------- messaging

  onSocial(from: number, msg: GameMsg): void {
    switch (msg.g) {
      case 'undo-request': {
        // guest side: a vote just started
        const session = this.deps.session();
        session.setFrozen(true);
        this.vote = new LanVote(msg.id, msg.slot, msg.toIndex, msg.discarded, []);
        this.showVoteUi();
        break;
      }
      case 'undo-vote': {
        if (this.deps.role !== 'host' || !this.vote || this.vote.id !== msg.id) return;
        this.vote.record(msg.slot, msg.ok);
        const st = this.vote.status();
        if (st.pending) {
          if (this.vote.requester === this.deps.me) {
            this.deps.voteCard.setStatus(t('vote.waiting', { done: st.done, total: st.total }));
          }
          return;
        }
        this.finishVote(st.ok, st.ok ? {} : { reason: 'reject', by: st.by });
        break;
      }
      case 'undo-cancel': {
        if (this.deps.role !== 'host' || !this.vote || this.vote.id !== msg.id) return;
        this.finishVote(false, { reason: 'cancel' });
        break;
      }
      case 'undo-resolved': {
        // guests: the host settled the vote
        this.vote = null;
        this.deps.voteCard.hide();
        this.deps.session().setFrozen(false);
        if (msg.ok) this.deps.toast(t('vote.accepted', { n: msg.discarded ?? 0 }));
        else if (msg.reason === 'cancel') this.deps.toast(t('vote.cancelled'));
        else if (msg.reason === 'timeout') this.deps.toast(t('vote.timeout'));
        else this.deps.toast(t('vote.rejected', { name: this.seatName(msg.by ?? 0) }));
        break;
      }
      case 'pause': {
        this.setPaused(msg.on);
        break;
      }
      case 'notice': {
        if (msg.code === 'vote-busy') this.deps.toast(t('vote.busy'));
        else if (msg.code === 'caretaker') {
          this.deps.toast(t('notice.caretaker', { name: this.seatName(msg.slot ?? 0) }), 3200);
        } else if (msg.code === 'returned') {
          this.deps.toast(t('notice.returned', { name: this.seatName(msg.slot ?? 0) }), 2600);
        } else if (msg.code === 'slow') {
          this.deps.toast(t('notice.slow', { name: this.seatName(msg.slot ?? 0) }), 3600);
        }
        break;
      }
      case 'nudge': {
        const key = msg.target;
        const now = Date.now();
        if (now - (this.nudgedAt.get(key) ?? 0) < NUDGE_THROTTLE_MS) return;
        this.nudgedAt.set(key, now);
        this.deps.toast(
          t('game.nudged', { from: this.seatName(msg.from), target: this.seatName(msg.target) }),
        );
        break;
      }
      default:
        break;
    }
  }

  private finishVote(ok: boolean, opts: { reason?: 'reject' | 'cancel' | 'timeout'; by?: number }): void {
    const v = this.vote;
    if (!v) return;
    this.vote = null;
    if (this.voteTimer !== null) {
      window.clearTimeout(this.voteTimer);
      this.voteTimer = null;
    }
    const session = this.deps.session();
    const room = this.deps.room();
    this.deps.voteCard.hide();
    room?.broadcastMsg({
      g: 'undo-resolved',
      id: v.id,
      ok,
      reason: opts.reason,
      by: opts.by,
      discarded: v.discarded,
    });
    if (ok) {
      session.setFrozen(false);
      session.rollbackHistory(v.toIndex);
      room?.syncAll();
      this.deps.toast(t('vote.accepted', { n: v.discarded }));
    } else {
      session.setFrozen(false);
      if (opts.reason === 'cancel') this.deps.toast(t('vote.cancelled'));
      else if (opts.reason === 'timeout') this.deps.toast(t('vote.timeout'));
      else this.deps.toast(t('vote.rejected', { name: this.seatName(opts.by ?? 0) }));
    }
  }

  // ----------------------------------------------------------------- pause

  togglePause(): void {
    if (this.deps.role !== 'host') return;
    this.paused = !this.paused;
    this.deps.session().setFrozen(this.paused);
    this.deps.room()?.broadcastMsg({ g: 'pause', on: this.paused });
    this.deps.toast(this.paused ? t('game.paused') : t('game.resume'), 1800);
  }

  private setPaused(on: boolean): void {
    if (this.paused === on) return;
    this.paused = on;
    this.deps.session().setFrozen(on);
    this.deps.toast(on ? t('game.paused') : t('game.resume'), 1800);
  }

  // ----------------------------------------------------------------- nudge

  nudge(): void {
    const room = this.deps.room();
    const session = this.deps.session();
    if (!room || session.game.over) return;
    room.broadcastMsg({ g: 'nudge', from: this.deps.me, target: session.game.turn });
  }

  // ----------------------------------------------------------------- misc

  seatName(slot: number): string {
    const room = this.deps.room();
    return room?.players.find((p) => p.slot === slot)?.name ?? t('result.player', { n: slot + 1 });
  }

  /** the host must drop votes from players who disconnect mid-vote */
  onPlayerDisconnected(slot: number): void {
    if (this.deps.role !== 'host' || !this.vote) return;
    this.vote.abstain(slot);
    const st = this.vote.status();
    if (!st.pending) {
      this.finishVote(st.ok, st.ok ? {} : { reason: 'reject', by: st.by });
    }
  }

  reset(): void {
    this.vote = null;
    this.paused = false;
    if (this.voteTimer !== null) {
      window.clearTimeout(this.voteTimer);
      this.voteTimer = null;
    }
    this.deps.voteCard.hide();
    this.nudgedAt.clear();
  }
}
