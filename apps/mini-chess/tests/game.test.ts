import { describe, expect, it } from 'vitest';
import {
  apply,
  applySeat,
  fromFen,
  isInCheck,
  legalMoves,
  parseSquare,
  setup,
  squareName,
  toFen,
  view,
  type GameState,
  type PieceType,
} from '../src/game/chess';
import { chooseMove, hint } from '../src/ai/ai';

function square(name: string): number {
  const index = parseSquare(name);
  if (index < 0) throw new Error(`bad square ${name}`);
  return index;
}

function play(state: GameState, from: string, to: string, promotion?: PieceType): GameState {
  const result = apply(state, square(from), square(to), promotion);
  if (!result.ok) throw new Error(`move ${from}-${to} failed: ${result.error}`);
  return result.state;
}

function positions(state: GameState) {
  return legalMoves(state).map((move) => `${squareName(move.from)}-${squareName(move.to)}`);
}

function lcg(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

describe('Mini Chess board and setup', () => {
  it('builds a 5×6 board with twenty pieces and White to move', () => {
    const state = setup();
    expect(state.board).toHaveLength(30);
    expect(state.board.filter(Boolean)).toHaveLength(20);
    expect(state.turn).toBe('w');
    expect(state.status).toBe('playing');
    expect(state.board.filter((cell) => cell?.includes('Q'))).toHaveLength(0);
  });

  it('uses the compact army: king, two rooks, knight, bishop, five pawns', () => {
    const state = setup();
    for (const color of ['w', 'b'] as const) {
      const pieces = state.board.filter((cell) => cell?.startsWith(color));
      expect(pieces.filter((piece) => piece?.[1] === 'K')).toHaveLength(1);
      expect(pieces.filter((piece) => piece?.[1] === 'R')).toHaveLength(2);
      expect(pieces.filter((piece) => piece?.[1] === 'N')).toHaveLength(1);
      expect(pieces.filter((piece) => piece?.[1] === 'B')).toHaveLength(1);
      expect(pieces.filter((piece) => piece?.[1] === 'P')).toHaveLength(5);
    }
    expect(state.board[square('d1')]).toBe('wK');
    expect(state.board[square('d6')]).toBe('bK');
  });

  it('offers twelve opening moves and no queen moves', () => {
    const state = setup();
    expect(legalMoves(state)).toHaveLength(12);
    expect(positions(state)).toContain('e2-e4');
    expect(positions(state)).toContain('b1-c3');
    expect(positions(state)).toContain('b1-a3');
    expect(positions(state)).not.toContain('d1-d2');
  });

  it('round-trips the starting position through FEN', () => {
    const state = setup();
    expect(toFen(state)).toBe('rnbkr/ppppp/5/5/PPPPP/RNBKR w 0 1');
    const parsed = fromFen(toFen(state));
    expect(parsed.board).toEqual(state.board);
    expect(parsed.turn).toBe('w');
  });

  it('names and parses all thirty squares', () => {
    expect(squareName(square('a1'))).toBe('a1');
    expect(squareName(square('e6'))).toBe('e6');
    expect(square('a1')).toBe(25);
    expect(square('e6')).toBe(4);
    expect(parseSquare('z9')).toBe(-1);
  });
});

describe('Turns, moves and legality', () => {
  it('alternates turns and rejects a move by the wrong side', () => {
    const state = play(setup(), 'e2', 'e3');
    expect(state.turn).toBe('b');
    expect(apply(state, square('d2'), square('d3')).error).toBe('wrong-turn');
  });

  it('allows the double pawn step only from the starting rank', () => {
    const start = setup();
    expect(positions(start)).toContain('e2-e4');
    const after = play(play(start, 'e2', 'e3'), 'a5', 'a4');
    expect(positions(after)).not.toContain('e3-e5');
    expect(positions(after)).toContain('e3-e4');
  });

  it('blocks a pawn behind an enemy pawn and forbids a forward capture', () => {
    const state = fromFen('k4/4p/4P/5/5/K4 w');
    expect(positions(state).filter((move) => move.startsWith('e4-'))).toEqual([]);
  });

  it('captures diagonally but not forward', () => {
    const state = fromFen('k4/3p1/4P/5/5/K4 w');
    const moves = positions(state).filter((move) => move.startsWith('e4-'));
    expect(moves).toContain('e4-d5');
    expect(moves).toContain('e4-e5');
    expect(moves).not.toContain('e4-d4');
  });

  it('does not allow capturing your own piece', () => {
    const state = setup();
    expect(positions(state)).not.toContain('b1-d2');
  });

  it('moves the knight in an L and jumps over pieces', () => {
    const state = fromFen('k4/5/5/2N2/5/K4 w');
    const moves = positions(state).filter((move) => move.startsWith('c3-'));
    expect(moves).toHaveLength(8);
    expect(moves).toContain('c3-a2');
    expect(moves).toContain('c3-e4');
  });

  it('slides the bishop until a blocker', () => {
    const state = fromFen('k4/5/1P3/2B2/5/K4 w');
    const moves = positions(state).filter((move) => move.startsWith('c3-'));
    expect(moves).toContain('c3-d4');
    expect(moves).toContain('c3-e5');
    expect(moves).toContain('c3-b2');
    expect(moves).toContain('c3-d2');
    expect(moves).toContain('c3-e1');
    expect(moves).not.toContain('c3-b4');
  });

  it('slides the rook until a capture and then stops', () => {
    const state = fromFen('k4/2p2/5/2R2/5/K4 w');
    const moves = positions(state).filter((move) => move.startsWith('c3-'));
    expect(moves).toContain('c3-c4');
    expect(moves).toContain('c3-c5');
    expect(moves).not.toContain('c3-c6');
    expect(moves).toContain('c3-b3');
    expect(moves).toContain('c3-e3');
  });

  it('never lets a king step onto an attacked square', () => {
    const state = fromFen('k3r/5/5/5/5/3K1 w');
    const moves = positions(state).filter((move) => move.startsWith('d1-'));
    expect(moves).toContain('d1-c1');
    expect(moves).toContain('d1-c2');
    expect(moves).toContain('d1-d2');
    expect(moves).not.toContain('d1-e1');
    expect(moves).not.toContain('d1-e2');
  });

  it('freezes a pinned rook to the file of its king', () => {
    const state = fromFen('k3r/5/5/5/4R/4K w');
    const moves = positions(state).filter((move) => move.startsWith('e2-'));
    expect(moves).toEqual(expect.arrayContaining(['e2-e3', 'e2-e4', 'e2-e5', 'e2-e6']));
    expect(moves).not.toContain('e2-d2');
    expect(moves).not.toContain('e2-f2');
  });

  it('requires every legal reply to answer a check', () => {
    const state = fromFen('k3r/5/5/5/5/R3K w');
    expect(isInCheck(state.board, 'w')).toBe(true);
    const replies = legalMoves(state);
    expect(replies.length).toBeGreaterThan(0);
    for (const move of replies) {
      const next = apply(state, move.from, move.to, move.promotion ?? undefined).state;
      expect(isInCheck(next.board, 'w')).toBe(false);
    }
    expect(positions(state)).not.toContain('e1-e2');
  });

  it('rejects a move that would expose its own king', () => {
    const state = fromFen('k3r/5/5/5/4R/4K w');
    expect(apply(state, square('e2'), square('d2')).error).toBe('illegal');
  });

  it('does not mutate the state or board passed to apply', () => {
    const state = setup();
    const snapshot = JSON.stringify(state);
    const result = apply(state, square('e2'), square('e4'));
    expect(result.ok).toBe(true);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(state.moves).toHaveLength(0);
    expect(result.state).not.toBe(state);
  });
});

describe('Promotion, check and endings', () => {
  it('offers rook, bishop or knight promotion and applies the chosen piece', () => {
    const state = fromFen('k4/4P/5/5/5/KR3 w');
    const promotions = legalMoves(state).filter((move) => move.from === square('e5'));
    expect(promotions.map((move) => move.promotion).sort()).toEqual(['B', 'N', 'R']);
    const promoted = apply(state, square('e5'), square('e6'), 'B');
    expect(promoted.ok).toBe(true);
    expect(promoted.state.board[square('e6')]).toBe('wB');
    expect(promoted.state.moves[0]?.notation).toContain('=B');
  });

  it('defaults a promotion to a rook and rejects a queen', () => {
    const state = fromFen('k4/4P/5/5/5/KR3 w');
    const promoted = play(state, 'e5', 'e6');
    expect(promoted.board[square('e6')]).toBe('wR');
    expect(apply(state, square('e5'), square('e6'), 'Q' as PieceType).error).toBe(
      'bad-promotion',
    );
  });

  it('detects check and records it in the move notation', () => {
    const state = fromFen('k3r/5/5/5/5/R3K w');
    expect(isInCheck(state.board, 'w')).toBe(true);
    const blocker = fromFen('4k/5/5/5/5/R3K w');
    const after = play(blocker, 'a1', 'a6');
    expect(isInCheck(after.board, 'b')).toBe(true);
    expect(after.moves[0]?.check).toBe(true);
    expect(after.moves[0]?.notation.endsWith('+')).toBe(true);
  });

  it('finds checkmate and refuses further moves', () => {
    const state = fromFen('k4/5/1K3/5/5/4R w');
    const result = apply(state, square('e1'), square('e6'));
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('checkmate');
    expect(result.state.winner).toBe('w');
    expect(result.state.moves[0]?.checkmate).toBe(true);
    expect(result.state.moves[0]?.notation.endsWith('#')).toBe(true);
    expect(apply(result.state, square('a6'), square('a5')).error).toBe('game-over');
  });

  it('parses a checkmated position as checkmate', () => {
    const state = fromFen('k4/5/5/5/5/RR2K b');
    expect(state.status).toBe('checkmate');
    expect(state.winner).toBe('w');
    expect(legalMoves(state)).toEqual([]);
  });

  it('detects stalemate without check', () => {
    const state = fromFen('k1K2/5/2N2/5/5/5 b');
    expect(state.status).toBe('stalemate');
    expect(state.winner).toBeNull();
    expect(isInCheck(state.board, 'b')).toBe(false);
    expect(legalMoves(state)).toEqual([]);
  });

  it('draws by the fifty-move rule after a quiet move', () => {
    const state = fromFen('r3k/5/5/5/5/R3K w 99 1');
    const result = apply(state, square('a1'), square('b1'));
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('draw');
    expect(result.state.drawReason).toBe('fifty-move');
    expect(result.state.winner).toBeNull();
  });

  it('draws with insufficient material after a quiet bishop move', () => {
    const state = fromFen('k4/5/5/5/5/K1B2 w');
    const result = apply(state, square('c1'), square('b2'));
    expect(result.ok).toBe(true);
    expect(result.state.status).toBe('draw');
    expect(result.state.drawReason).toBe('insufficient-material');
  });

  it('keeps fullmove and halfmove counters', () => {
    const white = play(setup(), 'e2', 'e4');
    expect(white.halfmove).toBe(0);
    expect(white.fullmove).toBe(1);
    const black = play(white, 'd5', 'd4');
    expect(black.fullmove).toBe(2);
    const quiet = play(black, 'b1', 'c3');
    expect(quiet.halfmove).toBe(1);
  });

  it('captures material into the per-seat view tray', () => {
    const state = play(fromFen('r3k/5/5/5/5/R3K w'), 'a1', 'a6');
    const white = view(state, 0);
    const black = view(state, 1);
    expect(white.captured.w).toEqual(['R']);
    expect(white.captured.b).toEqual([]);
    expect(black.captured.w).toEqual(['R']);
    expect(white.board).not.toBe(state.board);
  });
});

describe('Seats, views and errors', () => {
  it('enforces seat ownership and validates the seat number', () => {
    const state = setup();
    expect(applySeat(state, 1, square('e2'), square('e4')).error).toBe('wrong-turn');
    expect(applySeat(state, 0, square('e2'), square('e4')).ok).toBe(true);
    expect(applySeat(state, 2, square('e2'), square('e4')).error).toBe('bad-seat');
  });

  it('gives each seat its own colour, legal moves and turn flag', () => {
    const state = play(setup(), 'e2', 'e4');
    const white = view(state, 0);
    const black = view(state, 1);
    expect(white.color).toBe('w');
    expect(black.color).toBe('b');
    expect(white.canMove).toBe(false);
    expect(black.canMove).toBe(true);
    expect(white.legal).toEqual([]);
    expect(black.legal.length).toBeGreaterThan(0);
    expect(black.lastMove?.to).toBe(square('e4'));
    expect(black.moveCount).toBe(1);
  });

  it('reports bad squares, empty squares, illegal moves and bad promotions', () => {
    const state = setup();
    expect(apply(state, -1, 0).error).toBe('bad-square');
    expect(apply(state, square('a1'), 99).error).toBe('bad-square');
    expect(apply(state, square('d4'), square('d5')).error).toBe('no-piece');
    expect(apply(state, square('e2'), square('e5')).error).toBe('illegal');
    expect(apply(state, square('e2'), square('e4'), 'B').error).toBe('bad-promotion');
  });

  it('rejects bad FEN input and queens', () => {
    expect(() => fromFen('k3q/5/5/5/5/K4 w')).toThrow(/queens/);
    expect(() => fromFen('k6/5/5/5/5/K4 w')).toThrow(/FEN/);
    expect(() => fromFen('k4/5/5/5/5 w')).toThrow(/ranks/);
  });
});

describe('Mini Chess AI', () => {
  it('returns a legal move on every level', () => {
    const state = setup();
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(state, level, lcg(9));
      expect(move).not.toBeNull();
      if (move) {
        expect(
          legalMoves(state).some(
            (candidate) =>
              candidate.from === move.from &&
              candidate.to === move.to &&
              candidate.promotion === move.promotion,
          ),
        ).toBe(true);
      }
    }
  });

  it('finds mate in one on hard', () => {
    const state = fromFen('k4/5/1K3/5/5/4R w');
    const move = chooseMove(state, 'hard', lcg(3));
    expect(move).not.toBeNull();
    expect(move?.from).toBe(square('e1'));
    expect(move?.to).toBe(square('e6'));
  });

  it('takes a hanging rook on normal and hard', () => {
    const state = fromFen('r3k/5/5/5/5/R3K w');
    for (const level of ['normal', 'hard'] as const) {
      const move = chooseMove(state, level, () => 0.5);
      expect({ from: move?.from, to: move?.to }).toEqual({
        from: square('a1'),
        to: square('a6'),
      });
    }
  });

  it('is deterministic with the same injected RNG on every level', () => {
    const state = fromFen('r3k/5/5/5/5/R3K w');
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const first = chooseMove(state, level, lcg(41));
      const second = chooseMove(state, level, lcg(41));
      expect(first && { ...first }).toEqual(second && { ...second });
    }
  });

  it('lets easy pick uniformly from the legal list with a fixed RNG', () => {
    const state = setup();
    const moves = legalMoves(state);
    const first = chooseMove(state, 'easy', () => 0);
    const last = chooseMove(state, 'easy', () => 0.999999);
    expect(first).toMatchObject({ from: moves[0]?.from, to: moves[0]?.to });
    expect(last).toMatchObject({
      from: moves[moves.length - 1]?.from,
      to: moves[moves.length - 1]?.to,
    });
  });

  it('makes the companion avoid giving check in the opening', () => {
    const state = fromFen('4k/5/5/5/5/R3K w');
    const move = chooseMove(state, 'companion', () => 0.5);
    expect(move).not.toBeNull();
    if (!move) return;
    const next = apply(state, move.from, move.to, move.promotion ?? undefined).state;
    expect(isInCheck(next.board, next.turn)).toBe(false);
  });

  it('explains a mating hint', () => {
    const state = fromFen('k4/5/1K3/5/5/4R w');
    const found = hint(state, lcg(2));
    expect(found?.reason).toBe('mate');
    expect(found?.move.to).toBe(square('e6'));
  });

  it('explains a capture hint', () => {
    const state = fromFen('r3k/5/5/5/5/R3K w');
    const found = hint(state, lcg(2));
    expect(found?.reason).toBe('capture');
    expect(found?.move.to).toBe(square('a6'));
  });

  it('does not mutate the position while thinking', () => {
    const state = fromFen('r3k/5/5/5/5/R3K w');
    const snapshot = JSON.stringify(state);
    chooseMove(state, 'hard', lcg(5));
    hint(state, lcg(5));
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('plays a complete random game to a terminal result', () => {
    let state = setup();
    const rng = lcg(20261111);
    let plies = 0;
    while (state.status === 'playing' && plies < 600) {
      const move = chooseMove(state, 'easy', rng);
      if (!move) break;
      const result = apply(state, move.from, move.to, move.promotion ?? undefined);
      expect(result.ok).toBe(true);
      state = result.state;
      plies += 1;
    }
    expect(state.status).not.toBe('playing');
    expect(['checkmate', 'stalemate', 'draw']).toContain(state.status);
    expect(plies).toBeLessThan(600);
  });
});
