import { playIdiom, setup, type GameState } from './game/idiom-chain';

export type DemoKind = 'game' | 'end';

/**
 * Deterministic demo tables built by replaying real engine moves. They are used
 * only for screenshots and render in the same components as a live game.
 */
export function buildDemo(kind: DemoKind, names: string[]): GameState {
  if (kind === 'end') {
    let state = setup({
      players: 2,
      names: [names[0] ?? 'Player 1', names[1] ?? 'Player 2'],
      first: 0,
      seconds: 15,
    });
    const moves = ['暗箭伤人', '人山人海', '海枯石烂', '烂醉如泥', '泥牛入海'];
    for (const [index, text] of moves.entries()) {
      const result = playIdiom(state, index % 2, text);
      state = result.state;
    }
    return state;
  }

  let state = setup({
    players: 3,
    names: [names[0] ?? 'Player 1', names[1] ?? 'Player 2', names[2] ?? 'Player 3'],
    first: 0,
    seconds: 15,
  });
  const moves = ['一心一意', '意气风发', '发扬光大', '大器晚成', '成千上万', '万紫千红'];
  for (const [index, text] of moves.entries()) {
    const result = playIdiom(state, index % 3, text);
    state = result.state;
  }
  return state;
}
