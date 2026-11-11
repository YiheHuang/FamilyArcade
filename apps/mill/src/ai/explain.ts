import {
  ADJACENCY,
  MILLS,
  apply,
  capturablePoints,
  millAt,
  other,
  type GameState,
  type Move,
  type Player,
} from '../game/mill';

export type HintKind =
  | 'capture'
  | 'captureAll'
  | 'mill'
  | 'block'
  | 'two'
  | 'space'
  | 'quiet';

export interface HintExplanation {
  kind: HintKind;
  side: Player;
  point: number | null;
}

/** Empty points where the opponent could complete a mill next turn. */
export function threatenedPoints(state: GameState, player: Player): number[] {
  const points = new Set<number>();

  if (state.phase === 'placing') {
    for (const line of MILLS) {
      let own = 0;
      let empty = -1;
      let blocked = false;
      for (const point of line) {
        const cell = state.board[point];
        if (cell === player) own += 1;
        else if (cell === null) {
          if (empty >= 0) blocked = true;
          else empty = point;
        } else blocked = true;
      }
      if (!blocked && own === 2 && empty >= 0) points.add(empty);
    }
    return [...points];
  }

  // During the moving phase a mill can also be completed by stepping a man in.
  for (let point = 0; point < state.board.length; point += 1) {
    if (state.board[point] !== null) continue;
    for (const from of ADJACENCY[point]) {
      if (state.board[from] !== player) continue;
      const board = state.board.slice();
      board[from] = null;
      board[point] = player;
      if (millAt(board, player, point)) {
        points.add(point);
        break;
      }
    }
  }
  return [...points];
}

function openLines(state: GameState, player: Player): number {
  let count = 0;
  for (const line of MILLS) {
    let own = 0;
    let empty = 0;
    for (const point of line) {
      if (state.board[point] === player) own += 1;
      else if (state.board[point] === null) empty += 1;
    }
    if (own === 2 && empty === 1) count += 1;
  }
  return count;
}

function mobility(state: GameState, player: Player): number {
  const seen = new Set<number>();
  for (let point = 0; point < state.board.length; point += 1) {
    if (state.board[point] !== player) continue;
    for (const next of ADJACENCY[point]) {
      if (state.board[next] === null) seen.add(next);
    }
  }
  return seen.size;
}

export function explainMove(state: GameState, move: Move): HintExplanation {
  const mover = state.turn;
  const opponent = other(mover);

  if (state.pendingCapture || move.type === 'capture') {
    const free = capturablePoints(state.board, opponent);
    const all = free.length === state.onBoard[opponent];
    return {
      kind: all ? 'captureAll' : 'capture',
      side: opponent,
      point: move.type === 'capture' ? move.point : free[0] ?? null,
    };
  }

  const target = move.type === 'place' ? move.point : move.type === 'move' ? move.to : null;
  const threatened = new Set(threatenedPoints(state, opponent));
  const result = apply(state, move);
  if (!result.ok) return { kind: 'quiet', side: mover, point: target };

  const next = result.state;
  if (next.status === 'playing' && next.pendingCapture === opponent) {
    return { kind: 'mill', side: opponent, point: target };
  }
  if (target !== null && threatened.has(target)) {
    return { kind: 'block', side: opponent, point: target };
  }
  if (openLines(next, mover) > openLines(state, mover)) {
    return { kind: 'two', side: mover, point: target };
  }
  if (mobility(next, mover) > mobility(state, mover)) {
    return { kind: 'space', side: mover, point: target };
  }
  return { kind: 'quiet', side: mover, point: target };
}
