import { describe, expect, it } from 'vitest';
import { randomAgent, runGame } from '../src/simulation';
import { applyMove } from '../src/apply';
import { deserializeGame, replayGame, serializeGame } from '../src/serialize';
import { setupGame } from '../src/setup';
import { scoreboard } from '../src/scoring';

const players = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];

describe('确定性与回放', () => {
  it('中途存档恢复后，游戏结果与全程一致', () => {
    const agent = randomAgent();
    const full = runGame(players, { seed: 'replay-seed' }, [agent, agent, agent]);
    expect(full.error).toBeUndefined();

    let state = setupGame(players, { seed: 'replay-seed' });
    let restored = false;
    while (state.phase !== 'ended') {
      if (!restored && state.moves.length >= 20) {
        state = deserializeGame(serializeGame(state));
        restored = true;
      }
      const res = applyMove(state, agent(state));
      expect(res.error).toBeUndefined();
      state = res.state;
    }
    expect(restored).toBe(true);
    expect(state.winners).toEqual(full.state.winners);
    expect(scoreboard(state.players)).toEqual(scoreboard(full.state.players));
    expect(state.moves.length).toBe(full.state.moves.length);
  });

  it('种子 + 走法序列可完整重放', () => {
    const agent = randomAgent();
    const full = runGame(players, { seed: 'replay-2' }, [agent, agent, agent]);
    expect(full.error).toBeUndefined();
    const replay = replayGame(players, { seed: 'replay-2' }, full.state.moves);
    expect(replay.error).toBeUndefined();
    expect(replay.state.winners).toEqual(full.state.winners);
    expect(scoreboard(replay.state.players)).toEqual(scoreboard(full.state.players));
    expect(replay.state.phase).toBe('ended');
  });

  it('存档序列化包含版本与时间戳', () => {
    const state = setupGame(players, { seed: 'save' });
    const doc = JSON.parse(serializeGame(state)) as { kind: string; version: number; savedAt: string };
    expect(doc.kind).toBe('splendor-save');
    expect(doc.version).toBe(1);
    expect(typeof doc.savedAt).toBe('string');
  });
});
