import { chooseMove, totalPoints } from '@splendor/engine';
import { describe, expect, it } from 'vitest';
import { LanClient, type LanSocketLike } from '../src/lan';
import { setLanClientForTest, useGame, type SeatConfig } from '../src/store';

/** 可手工触发生命周期的假 WebSocket（与 lan.test 同一模式） */
class FakeSocket implements LanSocketLike {
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((data: string) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err?: unknown) => void) | null = null;
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    /* noop */
  }
  open(): void {
    this.onopen?.();
  }
}

describe('客户端对局驱动（store 层）', () => {
  it('AI 自动行动，能完整打完整局', () => {
    const seats: SeatConfig[] = [
      { kind: 'ai', aiLevel: 'easy', name: 'A' },
      { kind: 'ai', aiLevel: 'normal', name: 'B' },
      { kind: 'ai', aiLevel: 'friendly', name: 'C' },
    ];
    useGame.getState().startGame(seats, { seed: 'client-test-1' });
    let guard = 0;
    while (useGame.getState().game!.phase !== 'ended' && guard++ < 3000) {
      const g = useGame.getState().game!;
      const p = g.players[g.current]!;
      if (p.kind === 'ai') {
        useGame.getState().aiTick();
      } else {
        const ok = useGame.getState().applyHumanMove(chooseMove(g, 'normal'));
        expect(ok).toBe(true);
      }
    }
    const end = useGame.getState().game!;
    expect(end.phase).toBe('ended');
    expect(end.winners!.length).toBeGreaterThan(0);
    const scores = end.players.map((p) => totalPoints(p));
    expect(Math.max(...scores)).toBeGreaterThanOrEqual(15);

    // 对局记录：整局走法被完整记录，终局落库（IndexedDB 不可用时也不报错）
    const draft = useGame.getState().recordDraft!;
    expect(draft.saved).toBe(true);
    expect(draft.seed).toBe('client-test-1');
    expect(draft.moves.length).toBe(end.moves.length);
    expect(useGame.getState().recordsVersion).toBeGreaterThan(0);
  });

  it('悔棋会从记录中撤回最后一步走法', () => {    const seats: SeatConfig[] = [
      { kind: 'human', aiLevel: 'normal', name: '我' },
      { kind: 'human', aiLevel: 'normal', name: '你' },
    ];
    useGame.getState().startGame(seats, { seed: 'client-test-undo-rec', recordMode: 'local' });
    expect(useGame.getState().recordDraft?.mode).toBe('local');
    const g0 = useGame.getState().game!;
    expect(useGame.getState().applyHumanMove({ type: 'take', colors: ['white'] })).toBe(true);
    expect(useGame.getState().recordDraft!.moves.length).toBe(1);
    useGame.getState().undo();
    expect(useGame.getState().recordDraft!.moves.length).toBe(0);
  });

  it('人类+AI 混合：悔棋回到人类决策点', () => {
    const seats: SeatConfig[] = [
      { kind: 'human', aiLevel: 'normal', name: '我' },
      { kind: 'ai', aiLevel: 'easy', name: 'AI' },
    ];
    useGame.getState().startGame(seats, { seed: 'client-test-undo' });
    const g0 = useGame.getState().game!;
    expect(useGame.getState().applyHumanMove(chooseMove(g0, 'normal'))).toBe(true);
    expect(useGame.getState().game!.current).toBe(1);
    useGame.getState().aiTick();
    expect(useGame.getState().game!.moves.length).toBe(2);
    useGame.getState().undo();
    const back = useGame.getState().game!;
    expect(back.moves.length).toBe(0);
    expect(back.current).toBe(0);
  });

  it('拿取与确认流程可用', () => {
    const seats: SeatConfig[] = [
      { kind: 'human', aiLevel: 'normal', name: '我' },
      { kind: 'human', aiLevel: 'normal', name: '你' },
    ];
    useGame.getState().startGame(seats, { seed: 'client-test-take' });
    useGame.getState().toggleToken('white');
    useGame.getState().toggleToken('blue');
    useGame.getState().confirmTake();
    const g = useGame.getState().game!;
    expect(g.players[0]!.tokens.white).toBe(1);
    expect(g.players[0]!.tokens.blue).toBe(1);
    expect(g.current).toBe(1);
  });

  it('联机悔棋：收到询问 → 表态 → 结果写入状态', () => {
    const socket = new FakeSocket();
    const client = new LanClient({
      factory: () => socket,
      onMessage: (m) => useGame.getState().handleServerMsg(m),
      onStatus: () => {},
      reconnectDelayMs: 60_000,
    });
    setLanClientForTest(client);
    client.connect('ws://localhost:9/ws');
    socket.open();
    // 进入房间（座位 0 = 我）
    useGame.getState().handleServerMsg({
      t: 'room',
      code: 'TEST',
      you: { seat: 0, token: 'tok', spectator: false },
      hostSeat: 0,
      seats: [
        { seat: 0, kind: 'human', name: '我', connected: true },
        { seat: 1, kind: 'human', name: '妈妈', connected: true },
      ],
      started: true,
      turnSeconds: 0,
    });
    expect(useGame.getState().lan?.you).toBe(0);

    // 别人请求悔棋 → 我需要表态
    useGame.getState().handleServerMsg({ t: 'undo:ask', seat: 1, name: '妈妈', voters: [0] });
    expect(useGame.getState().undoAsk?.name).toBe('妈妈');

    // 我拒绝 → 发送 undo:respond 并清空询问
    useGame.getState().respondUndo(false);
    expect(useGame.getState().undoAsk).toBeNull();
    const sent = socket.sent.map((s) => JSON.parse(s) as { t: string; accept?: boolean });
    expect(sent.some((m) => m.t === 'undo:respond' && m.accept === false)).toBe(true);

    // 结果消息清空状态
    useGame.getState().handleServerMsg({ t: 'undo:ask', seat: 1, name: '妈妈', voters: [0] });
    useGame.getState().handleServerMsg({ t: 'undo:result', ok: true, seat: 1 });
    expect(useGame.getState().undoAsk).toBeNull();
    client.disconnect();
    setLanClientForTest(null);
  });
});
