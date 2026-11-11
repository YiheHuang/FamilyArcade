/**
 * Unanimous undo vote for LAN games (pure logic, unit tested).
 *
 * Everyone at the table except the requester must agree. Players who are
 * disconnected are not asked (they are not in `voters`). Any single "no"
 * rejects the request immediately.
 */

export type VoteStatus =
  | { pending: true; done: number; total: number }
  | { pending: false; ok: true }
  | { pending: false; ok: false; by: number };

export class LanVote {
  readonly id: string;
  readonly requester: number;
  /** truncate the history to this index when accepted */
  readonly toIndex: number;
  /** how many actions will be discarded */
  readonly discarded: number;

  private readonly voters: Set<number>;
  private readonly votes = new Map<number, boolean>();

  constructor(
    id: string,
    requester: number,
    toIndex: number,
    discarded: number,
    voters: number[],
  ) {
    this.id = id;
    this.requester = requester;
    this.toIndex = toIndex;
    this.discarded = discarded;
    this.voters = new Set(voters.filter((v) => v !== requester));
  }

  record(slot: number, ok: boolean): void {
    if (this.voters.has(slot)) this.votes.set(slot, ok);
  }

  abstain(slot: number): void {
    this.voters.delete(slot);
  }

  status(): VoteStatus {
    for (const [slot, ok] of this.votes) {
      if (!ok) return { pending: false, ok: false, by: slot };
    }
    for (const slot of this.voters) {
      if (!this.votes.has(slot)) {
        return { pending: true, done: this.votes.size, total: this.voters.size };
      }
    }
    return { pending: false, ok: true };
  }
}
