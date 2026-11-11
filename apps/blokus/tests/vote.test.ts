import { describe, expect, it } from 'vitest';
import { LanVote } from '../src/net/vote';

describe('悔棋投票（全员同意）', () => {
  it('全员同意才通过', () => {
    const v = new LanVote('a', 1, 3, 2, [0, 1, 2]);
    expect(v.status().pending).toBe(true);
    v.record(0, true);
    expect(v.status().pending).toBe(true);
    v.record(2, true);
    expect(v.status()).toEqual({ pending: false, ok: true });
  });

  it('任一拒绝立刻失败并指出是谁', () => {
    const v = new LanVote('a', 0, 1, 1, [0, 1, 2]);
    v.record(1, true);
    v.record(2, false);
    expect(v.status()).toEqual({ pending: false, ok: false, by: 2 });
  });

  it('请求者自己不需要投票', () => {
    const v = new LanVote('a', 0, 5, 3, [0, 1]);
    v.record(0, true); // ignored: the requester does not vote
    expect(v.status().pending).toBe(true);
    v.record(1, true);
    expect(v.status()).toEqual({ pending: false, ok: true });
  });

  it('掉线者弃权后不再阻塞', () => {
    const v = new LanVote('a', 0, 2, 1, [0, 1, 2]);
    v.record(1, true);
    v.abstain(2);
    expect(v.status()).toEqual({ pending: false, ok: true });
  });

  it('别人投的票不影响结果', () => {
    const v = new LanVote('a', 0, 1, 1, [0, 1]);
    v.record(9, false);
    v.record(1, true);
    expect(v.status()).toEqual({ pending: false, ok: true });
  });
});
