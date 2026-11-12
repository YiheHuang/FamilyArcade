import { describe, expect, it } from 'vitest';
import { chooseIdiom, hasMove, AI_LEVELS } from '../src/ai/ai';
import {
  chainableIdioms,
  deserialize,
  failTurn,
  hintFor,
  passTurn,
  playForSeat,
  playIdiom,
  required,
  scoreFor,
  serialize,
  setup,
  timeout,
  view,
  type GameState,
} from '../src/game/idiom-chain';
import { findIdiom, firstSound, lastSound, startsWithChar } from '../src/game/dictionary';

function play(state: GameState, seat: number, text: string, usedHint = false): GameState {
  return playIdiom(state, seat, text, { usedHint }).state;
}

function sequence(texts: string[], options: { players?: number; target?: number; homophone?: boolean } = {}): GameState {
  let state = setup({ players: options.players ?? 2, target: options.target ?? 10, homophone: options.homophone });
  for (const [index, text] of texts.entries()) {
    const result = playIdiom(state, index % (options.players ?? 2), text);
    expect(result.valid, `${text}: ${result.error ?? 'ok'}`).toBe(true);
    state = result.state;
  }
  return state;
}

describe('Idiom Chain engine', () => {
  it('sets up two players with the contract defaults', () => {
    const state = setup();
    expect(state.players).toHaveLength(2);
    expect(state.turn).toBe(0);
    expect(state.status).toBe('playing');
    expect(state.config).toEqual({ seconds: 15, homophone: false, target: 10, missLimit: 3 });
    expect(state.chain).toEqual([]);
  });

  it('accepts two to six players and rejects other table sizes', () => {
    for (const players of [2, 3, 4, 5, 6]) {
      expect(setup({ players }).players).toHaveLength(players);
    }
    expect(() => setup({ players: 1 })).toThrow(RangeError);
    expect(() => setup({ players: 7 })).toThrow(RangeError);
  });

  it('chooses the first seat with the injected RNG', () => {
    expect(setup({}, () => 0).turn).toBe(0);
    expect(setup({}, () => 0.99).turn).toBe(1);
    expect(setup({ players: 4 }, () => 0.99).turn).toBe(3);
    expect(() => setup({ players: 2, first: 2 })).toThrow(RangeError);
  });

  it('keeps names, timer, homophone and strike options', () => {
    const state = setup({
      players: 3,
      names: ['Mia', 'Ben', 'Ada'],
      seconds: 30,
      homophone: true,
      missLimit: 5,
    });
    expect(state.players.map((player) => player.name)).toEqual(['Mia', 'Ben', 'Ada']);
    expect(state.config.seconds).toBe(30);
    expect(state.config.homophone).toBe(true);
    expect(state.config.missLimit).toBe(5);
    expect(() => setup({ seconds: 4 })).toThrow(RangeError);
  });

  it('lets the first player open with any dictionary idiom and scores 1', () => {
    const result = playIdiom(setup(), 0, '一心一意');
    expect(result.valid).toBe(true);
    expect(result.points).toBe(1);
    expect(result.state.players[0].score).toBe(1);
    expect(result.state.turn).toBe(1);
    expect(result.state.chain[0].text).toBe('一心一意');
    expect(required(result.state).char).toBe('意');
  });

  it('adds the rare bonus', () => {
    const result = playIdiom(setup(), 0, '暗箭伤人');
    expect(result.valid).toBe(true);
    expect(result.entry?.rare).toBe(true);
    expect(result.points).toBe(3);
    expect(result.state.players[0].score).toBe(3);
  });

  it('requires the next idiom to start with the previous last character', () => {
    let state = play(setup(), 0, '一心一意');
    const bad = playIdiom(state, 1, '画蛇添足');
    expect(bad.valid).toBe(false);
    expect(bad.error).toBe('wrong-start');
    expect(bad.state.players[1].misses).toBe(1);
    expect(bad.state.turn).toBe(0);
    state = play(bad.state, 0, '意气风发');
    expect(state.chain[1].text).toBe('意气风发');
  });

  it('rejects a repeated idiom in a real chain', () => {
    let state = sequence(['人山人海', '海枯石烂', '烂醉如泥', '泥牛入海']);
    const repeated = playIdiom(state, 0, '海枯石烂');
    expect(repeated.valid).toBe(false);
    expect(repeated.error).toBe('repeated');
    expect(repeated.state.players[0].misses).toBe(1);
    expect(repeated.state.turn).toBe(1);
  });

  it('rejects unknown, blank and out-of-turn attempts', () => {
    let state = setup();
    expect(playIdiom(state, 1, '一心一意').error).toBe('wrong-turn');
    const unknown = playIdiom(state, 0, '不存在的成语');
    expect(unknown.error).toBe('not-in-dictionary');
    expect(unknown.state.turn).toBe(1);
    const blank = playIdiom(unknown.state, 1, '   ');
    expect(blank.error).toBe('blank');
    expect(blank.state.turn).toBe(0);
    state = play(setup(), 0, '一心一意');
    expect(playIdiom(state, 1, '意气风发').valid).toBe(true);
  });

  it('awards +1 on every third hint-free idiom', () => {
    let state = sequence(['画蛇添足', '足智多谋', '谋财害命', '命中注定'], { target: 100 });
    const result = playIdiom(state, 0, '定国安邦');
    state = result.state;
    expect(result.valid).toBe(true);
    expect(result.entry?.streakBonus).toBe(true);
    expect(result.points).toBe(4);
    expect(state.players[0].score).toBe(10);
    expect(state.players[0].streak).toBe(0);
    expect(state.chain.at(-1)?.streakBonus).toBe(true);
  });

  it('resets the hint-free run when a hint is used', () => {
    let state = sequence(['画蛇添足', '足智多谋', '谋财害命', '命中注定'], { target: 100 });
    const result = playIdiom(state, 0, '定国安邦', { usedHint: true });
    state = result.state;
    expect(result.valid).toBe(true);
    expect(result.entry?.streakBonus).toBe(false);
    expect(result.points).toBe(3);
    expect(state.players[0].score).toBe(9);
  });

  it('ends immediately at the winning score', () => {
    const state = sequence(['暗箭伤人', '人山人海', '海枯石烂', '烂醉如泥', '泥牛入海']);
    expect(state.status).toBe('finished');
    expect(state.winner).toBe(0);
    expect(state.closedBy).toBe('score');
    expect(state.players.map((player) => player.score)).toEqual([10, 4]);
    expect(playIdiom(state, 0, '一心一意').error).toBe('finished');
  });

  it('loses the turn and a strike on an invalid attempt', () => {
    const state = setup();
    const result = playIdiom(state, 0, '不存在的成语');
    expect(result.valid).toBe(false);
    expect(result.state.players[0].misses).toBe(1);
    expect(result.state.turn).toBe(1);
    expect(result.state.lastEvent?.kind).toBe('miss');
  });

  it('loses the turn on a late play', () => {
    const state = timeout(setup({ seconds: 15 }), 0);
    expect(state.turn).toBe(1);
    expect(state.players[0].misses).toBe(1);
    expect(state.lastEvent?.kind).toBe('miss');
    if (state.lastEvent?.kind === 'miss') expect(state.lastEvent.reason).toBe('late');
  });

  it('loses the turn on a pass', () => {
    const state = passTurn(setup(), 0);
    expect(state.turn).toBe(1);
    expect(state.players[0].misses).toBe(1);
    if (state.lastEvent?.kind === 'miss') expect(state.lastEvent.reason).toBe('pass');
  });

  it('eliminates a player after three strikes and names the last player standing', () => {
    let state = setup({ missLimit: 3 });
    state = playIdiom(state, 0, '').state;
    state = playIdiom(state, 1, '').state;
    state = playIdiom(state, 0, '').state;
    state = playIdiom(state, 1, '').state;
    const final = playIdiom(state, 0, '');
    expect(final.state.players[0].out).toBe(true);
    expect(final.state.status).toBe('finished');
    expect(final.state.winner).toBe(1);
    expect(final.state.closedBy).toBe('last-standing');
    expect(final.state.players[1].misses).toBe(2);
  });

  it('honours a custom strike limit', () => {
    let state = setup({ missLimit: 1 });
    const result = playIdiom(state, 0, '');
    state = result.state;
    expect(state.players[0].out).toBe(true);
    expect(state.status).toBe('finished');
    expect(state.winner).toBe(1);
  });

  it('skips eliminated seats when passing the turn', () => {
    let state = setup({ players: 3 });
    state = failTurn(state, 0, 'invalid');
    state = failTurn(state, 1, 'invalid');
    state = failTurn(state, 2, 'invalid');
    state = failTurn(state, 0, 'invalid');
    state = failTurn(state, 1, 'invalid');
    state = failTurn(state, 2, 'invalid');
    const result = failTurn(state, 0, 'invalid');
    expect(result.players[0].out).toBe(true);
    expect(result.status).toBe('playing');
    expect(result.turn).toBe(1);
    expect(result.players[1].misses).toBe(2);
  });

  it('accepts a homophone in homophone mode but not in standard mode', () => {
    const standard = play(setup({ homophone: false }), 0, '一心一意');
    const wrong = playIdiom(standard, 1, '一意孤行');
    expect(wrong.valid).toBe(false);
    expect(wrong.error).toBe('wrong-start');

    const homophone = play(setup({ homophone: true }), 0, '一心一意');
    const accepted = playIdiom(homophone, 1, '一意孤行');
    expect(accepted.valid).toBe(true);
    expect(lastSound(findIdiom('一心一意')!)).toBe(firstSound(findIdiom('一意孤行')!));
  });

  it('re-checks the seat for LAN intents', () => {
    const state = setup();
    expect(playForSeat(state, 1, '一心一意').error).toBe('wrong-turn');
    expect(playForSeat(state, 0, '一心一意').valid).toBe(true);
  });

  it('gives each seat a public view with its own canPlay flag', () => {
    const state = play(setup({ players: 3 }), 0, '一心一意');
    expect(view(state, 0).canPlay).toBe(false);
    expect(view(state, 1).canPlay).toBe(true);
    expect(view(state, 2).canPlay).toBe(false);
    expect(view(state, 1).requiredChar).toBe('意');
    expect(view(state, 1).playerCount).toBe(3);
    expect(view(state, 1).chain.map((entry) => entry.text)).toEqual(['一心一意']);
  });

  it('round-trips a game through JSON', () => {
    const state = sequence(['一心一意', '意气风发', '发扬光大']);
    const restored = deserialize(serialize(state));
    expect(restored).toEqual(state);
    expect(deserialize('not json')).toBeNull();
    expect(deserialize(JSON.stringify({ version: 2 }))).toBeNull();
  });

  it('returns a reasoned hint that is legal and unused', () => {
    const state = play(setup(), 0, '一心一意');
    const hint = hintFor(state, 1);
    expect(hint).not.toBeNull();
    expect(hint!.idiom.text.startsWith('意')).toBe(true);
    expect(hint!.nextCount).toBeGreaterThanOrEqual(0);
    expect(['only', 'opens', 'rare', 'common']).toContain(hint!.reason);
    expect(hintFor(state, 0)).toBeNull();
  });

  it('returns no hint when the chain has no dictionary continuation', () => {
    const state = play(setup(), 0, '爱屋及乌');
    expect(chainableIdioms(state)).toHaveLength(0);
    expect(hintFor(state, 1)).toBeNull();
    expect(startsWithChar('乌')).toHaveLength(0);
  });

  it('reports the required last character and sound', () => {
    const state = play(setup(), 0, '一心一意');
    const req = required(state);
    expect(req.char).toBe('意');
    expect(req.pinyin).toBe('yì');
    expect(req.sound).toBe('yi');
    expect(req.text).toBe('一心一意');
  });

  it('computes direct score values', () => {
    const common = findIdiom('一心一意')!;
    const rare = findIdiom('暗箭伤人')!;
    expect(scoreFor(common, 0)).toEqual({ points: 1, rare: false, streakBonus: false, nextStreak: 1 });
    expect(scoreFor(rare, 1)).toEqual({ points: 3, rare: true, streakBonus: false, nextStreak: 2 });
    expect(scoreFor(rare, 2)).toEqual({ points: 4, rare: true, streakBonus: true, nextStreak: 0 });
    expect(scoreFor(rare, 2, true)).toEqual({ points: 3, rare: true, streakBonus: false, nextStreak: 1 });
  });
});

describe('Idiom Chain AI', () => {
  it('offers four distinct levels', () => {
    expect(AI_LEVELS).toEqual(['companion', 'easy', 'normal', 'hard']);
  });

  it('opens a fresh chain at every level', () => {
    for (const level of AI_LEVELS) {
      const pick = chooseIdiom(setup(), level, () => 0.4);
      expect(pick).not.toBeNull();
      expect(findIdiom(pick!.text)).toBeTruthy();
    }
  });

  it('only returns chainable, unused idioms', () => {
    const state = play(setup(), 0, '一心一意');
    for (const level of AI_LEVELS) {
      const pick = chooseIdiom(state, level, () => 0.42);
      expect(pick).not.toBeNull();
      expect(pick!.text.startsWith('意')).toBe(true);
      expect(state.chain.some((entry) => entry.text === pick!.text)).toBe(false);
    }
  });

  it('is deterministic with the same injected RNG', () => {
    const state = play(setup(), 0, '一心一意');
    for (const level of AI_LEVELS) {
      const a = chooseIdiom(state, level, () => 0.37);
      const b = chooseIdiom(state, level, () => 0.37);
      expect(a?.text).toBe(b?.text);
    }
  });

  it('keeps Companion gentle: common options before rare ones', () => {
    const state = play(setup(), 0, '一心一意');
    const pick = chooseIdiom(state, 'companion', () => 0.5);
    expect(pick).not.toBeNull();
    expect(pick!.frequency).toBeGreaterThanOrEqual(3);
  });

  it('respects homophone searching', () => {
    const state = play(setup({ homophone: true }), 0, '一心一意');
    for (const level of AI_LEVELS) {
      const pick = chooseIdiom(state, level, () => 0.6);
      expect(pick).not.toBeNull();
      expect(firstSound(pick!)).toBe(lastSound(findIdiom('一心一意')!));
    }
  });

  it('passes when no continuation exists', () => {
    const state = play(setup(), 0, '爱屋及乌');
    expect(hasMove(state)).toBe(false);
    for (const level of AI_LEVELS) {
      expect(chooseIdiom(state, level, () => 0.2)).toBeNull();
    }
  });

  it('plays a complete AI-versus-AI game using only valid moves', () => {
    let seed = 17;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    let state = setup({ players: 3, target: 10 });
    let validMoves = 0;
    for (let turn = 0; turn < 150 && state.status === 'playing'; turn += 1) {
      const pick = chooseIdiom(state, AI_LEVELS[turn % AI_LEVELS.length], rng);
      if (!pick) {
        state = failTurn(state, state.turn, 'no-move');
        continue;
      }
      const result = playIdiom(state, state.turn, pick.text);
      expect(result.valid, `${pick.text}: ${result.error ?? 'ok'}`).toBe(true);
      validMoves += 1;
      state = result.state;
    }
    expect(state.status).toBe('finished');
    expect(validMoves).toBeGreaterThan(3);
  });
});
