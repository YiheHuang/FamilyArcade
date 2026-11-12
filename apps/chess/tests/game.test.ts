import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai/ai';
import { hintFor } from '../src/ai/hint';
import {
  START_FEN,
  apply,
  applySeat,
  findMove,
  fromFen,
  insufficientMaterial,
  legalMoves,
  legalMovesFrom,
  parseSquare,
  perft,
  setup,
  squareName,
  toFen,
  view,
  type GameState,
  type Move,
  type Promotion,
} from '../src/game/chess';
import { EMPTY_RECORD, addResult, normalizeRecord } from '../src/storage';

function sq(name: string): number {
  const value = parseSquare(name);
  if (value === null) throw new Error(`Bad square: ${name}`);
  return value;
}

function mv(from: string, to: string, promotion?: Promotion): Move {
  return { from: sq(from), to: sq(to), ...(promotion ? { promotion } : {}) };
}

function play(state: GameState, moves: Move[]): GameState {
  let current = state;
  for (const move of moves) {
    const result = apply(current, move);
    expect(result.ok, `move ${squareName(move.from)}-${squareName(move.to)} should be legal`).toBe(true);
    current = result.state;
  }
  return current;
}

function hasMove(state: GameState, from: string, to: string, promotion?: Promotion): boolean {
  return legalMoves(state).some(
    (move) =>
      move.from === sq(from) &&
      move.to === sq(to) &&
      (promotion === undefined ? move.promotion === undefined : move.promotion === promotion),
  );
}

describe('Chess engine · setup and movement', () => {
  it('sets up the standard 32-piece position with White to move', () => {
    const state = setup();
    expect(state.board).toHaveLength(64);
    expect(state.board.filter(Boolean)).toHaveLength(32);
    expect(state.turn).toBe('w');
    expect(state.castling).toEqual({ wK: true, wQ: true, bK: true, bQ: true });
    expect(state.status).toBe('playing');
    expect(toFen(state)).toBe(START_FEN);
  });

  it('generates the 20 legal opening moves and correct shallow perft', () => {
    const state = setup();
    expect(legalMoves(state)).toHaveLength(20);
    expect(perft(state, 2)).toBe(400);
    expect(perft(state, 3)).toBe(8902);
  });

  it('allows a pawn double push but not a triple push', () => {
    const state = setup();
    expect(hasMove(state, 'e2', 'e4')).toBe(true);
    expect(hasMove(state, 'e2', 'e5')).toBe(false);
    const after = play(state, [mv('e2', 'e4')]);
    expect(after.ep).toBe(sq('e3'));
    expect(after.board[sq('e4')]).toEqual({ color: 'w', type: 'p' });
    expect(after.board[sq('e2')]).toBeNull();
  });

  it('moves knights over pieces and blocks bishops behind pawns', () => {
    const state = setup();
    expect(hasMove(state, 'g1', 'f3')).toBe(true);
    expect(hasMove(state, 'b1', 'c3')).toBe(true);
    expect(hasMove(state, 'c1', 'f4')).toBe(false);
    const after = play(state, [mv('g1', 'f3')]);
    expect(after.turn).toBe('b');
  });

  it('finds sliding moves and captures for a queen', () => {
    const state = fromFen('4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1');
    expect(hasMove(state, 'd4', 'd8')).toBe(true);
    expect(hasMove(state, 'd4', 'a4')).toBe(true);
    expect(hasMove(state, 'd4', 'h8')).toBe(true);
    expect(hasMove(state, 'd4', 'e5')).toBe(true);
  });

  it('does not let a pinned rook leave the pin line', () => {
    const state = fromFen('k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1');
    expect(hasMove(state, 'e2', 'e3')).toBe(true);
    expect(hasMove(state, 'e2', 'd2')).toBe(false);
  });

  it('does not let a king step into an attacked square', () => {
    const state = fromFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1');
    expect(state.inCheck).toBe(true);
    expect(hasMove(state, 'e1', 'd1')).toBe(true);
    expect(hasMove(state, 'e1', 'f1')).toBe(true);
    expect(hasMove(state, 'e1', 'd2')).toBe(false);
    expect(hasMove(state, 'e1', 'f2')).toBe(false);
  });

  it('rejects illegal moves and further moves after the end', () => {
    const state = setup();
    expect(apply(state, mv('e2', 'e5')).error).toBe('illegal');
    const after = play(state, [mv('e2', 'e4')]);
    expect(apply(after, mv('e2', 'e4')).error).toBe('illegal');
    expect(apply(after, mv('e7', 'e5')).ok).toBe(true);
  });
});

describe('Chess engine · check, mate and stalemate', () => {
  it('detects check', () => {
    const state = fromFen('4k3/8/8/8/8/8/4q3/4K3 w - - 0 1');
    expect(state.inCheck).toBe(true);
  });

  it("ends in Fool's Mate", () => {
    const state = play(setup(), [
      mv('f2', 'f3'),
      mv('e7', 'e5'),
      mv('g2', 'g4'),
      mv('d8', 'h4'),
    ]);
    expect(state.status).toBe('checkmate');
    expect(state.winner).toBe('b');
    expect(state.inCheck).toBe(true);
    expect(state.moves.at(-1)?.san).toBe('Qh4#');
    expect(apply(state, mv('e1', 'f2')).error).toBe('game-over');
  });

  it('detects a checkmate position from FEN', () => {
    const state = fromFen('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
    expect(state.status).toBe('checkmate');
    expect(state.winner).toBe('w');
  });

  it('detects stalemate', () => {
    const state = fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(state.status).toBe('stalemate');
    expect(state.drawReason).toBe('stalemate');
    expect(state.winner).toBeNull();
  });

  it('makes checkmate take priority over the fifty-move counter', () => {
    const state = fromFen('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 99 60');
    const after = play(state, [mv('e1', 'e8')]);
    expect(after.status).toBe('checkmate');
    expect(after.winner).toBe('w');
  });
});

describe('Chess engine · castling', () => {
  it('castles on both sides and moves the rook', () => {
    const state = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(hasMove(state, 'e1', 'g1')).toBe(true);
    expect(hasMove(state, 'e1', 'c1')).toBe(true);
    const kingSide = play(state, [mv('e1', 'g1')]);
    expect(kingSide.board[sq('g1')]).toEqual({ color: 'w', type: 'k' });
    expect(kingSide.board[sq('f1')]).toEqual({ color: 'w', type: 'r' });
    expect(kingSide.board[sq('h1')]).toBeNull();
    expect(kingSide.castling.wK).toBe(false);
    expect(kingSide.castling.wQ).toBe(false);

    const queenSide = play(state, [mv('e1', 'c1')]);
    expect(queenSide.board[sq('c1')]).toEqual({ color: 'w', type: 'k' });
    expect(queenSide.board[sq('d1')]).toEqual({ color: 'w', type: 'r' });
    expect(queenSide.board[sq('a1')]).toBeNull();
  });

  it('does not castle through an attacked square', () => {
    const state = fromFen('r3kr2/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(hasMove(state, 'e1', 'g1')).toBe(false);
    expect(apply(state, mv('e1', 'g1')).error).toBe('illegal');
  });

  it('does not castle with a piece in the way', () => {
    const state = fromFen('r3k2r/8/8/8/8/8/8/R3KB1R w KQkq - 0 1');
    expect(hasMove(state, 'e1', 'g1')).toBe(false);
    expect(hasMove(state, 'e1', 'c1')).toBe(true);
  });

  it('loses castling rights after the king or rook moves, or a rook is captured', () => {
    const state = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const kingMoved = play(state, [mv('e1', 'e2')]);
    expect(kingMoved.castling.wK).toBe(false);
    expect(kingMoved.castling.wQ).toBe(false);
    expect(kingMoved.castling.bK).toBe(true);

    const rookCaptured = play(state, [mv('a1', 'a8')]);
    expect(rookCaptured.castling.wQ).toBe(false);
    expect(rookCaptured.castling.bQ).toBe(false);
    expect(rookCaptured.castling.wK).toBe(true);
  });
});

describe('Chess engine · en passant and promotion', () => {
  it('captures en passant and removes the passed pawn', () => {
    const state = fromFen('rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    const after = play(state, [mv('e5', 'd6')]);
    expect(after.board[sq('d6')]).toEqual({ color: 'w', type: 'p' });
    expect(after.board[sq('d5')]).toBeNull();
    expect(after.moves.at(-1)?.captured).toBe('p');
    expect(after.moves.at(-1)?.san).toBe('exd6');
  });

  it('expires the en passant right after one move', () => {
    const state = fromFen('rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    const after = play(state, [mv('a2', 'a3')]);
    expect(after.ep).toBeNull();
    expect(hasMove(after, 'e5', 'd6')).toBe(false);
  });

  it('offers all four promotions and creates the chosen piece', () => {
    const state = fromFen('1k6/P7/8/8/8/8/8/7K w - - 0 1');
    const promotions = legalMovesFrom(state, sq('a7')).filter((move) => move.to === sq('a8'));
    expect(promotions.map((move) => move.promotion).sort()).toEqual(['b', 'n', 'q', 'r']);
    const queen = play(state, [mv('a7', 'a8', 'q')]);
    expect(queen.board[sq('a8')]).toEqual({ color: 'w', type: 'q' });
    expect(queen.moves.at(-1)?.san).toBe('a8=Q+');
  });

  it('supports a capture promotion', () => {
    const state = fromFen('1r5k/P7/8/8/8/8/8/7K w - - 0 1');
    const after = play(state, [mv('a7', 'b8', 'n')]);
    expect(after.board[sq('b8')]).toEqual({ color: 'w', type: 'n' });
    expect(after.board[sq('a7')]).toBeNull();
    expect(after.moves.at(-1)?.captured).toBe('r');
    expect(after.moves.at(-1)?.san).toBe('axb8=N');
  });
});

describe('Chess engine · draw rules', () => {
  it('draws on the fifty-move rule', () => {
    const state = fromFen('7k/8/8/8/8/8/8/R6K w - - 99 60');
    const after = play(state, [mv('a1', 'a2')]);
    expect(after.status).toBe('draw');
    expect(after.drawReason).toBe('fifty');
    expect(after.winner).toBeNull();
  });

  it('draws on threefold repetition', () => {
    let state = fromFen('7k/8/8/8/8/8/8/R6K w - - 0 1');
    const cycle = [
      mv('a1', 'a2'),
      mv('h8', 'h7'),
      mv('a2', 'a1'),
      mv('h7', 'h8'),
    ];
    state = play(state, cycle);
    expect(state.status).toBe('playing');
    state = play(state, cycle);
    expect(state.status).toBe('draw');
    expect(state.drawReason).toBe('threefold');
  });

  it('draws on insufficient material', () => {
    const bare = fromFen('7k/8/8/8/8/8/8/K7 w - - 0 1');
    expect(insufficientMaterial(bare.board)).toBe(true);
    const after = play(bare, [mv('a1', 'b1')]);
    expect(after.status).toBe('draw');
    expect(after.drawReason).toBe('material');

    const bishop = fromFen('7k/8/8/8/8/8/8/KB6 w - - 0 1');
    expect(insufficientMaterial(bishop.board)).toBe(true);
    const knights = fromFen('7k/8/8/8/8/8/8/KNN5 w - - 0 1');
    expect(insufficientMaterial(knights.board)).toBe(true);
    const knightEach = fromFen('6nk/8/8/8/8/8/8/KN6 w - - 0 1');
    expect(insufficientMaterial(knightEach.board)).toBe(false);
    const bishopsSame = fromFen('6bk/8/8/8/8/8/8/KB6 w - - 0 1');
    expect(insufficientMaterial(bishopsSame.board)).toBe(true);
    const bishopsOpposite = fromFen('5b1k/8/8/8/8/8/8/KB6 w - - 0 1');
    expect(insufficientMaterial(bishopsOpposite.board)).toBe(false);
    const rook = fromFen('7k/8/8/8/8/8/8/KR6 w - - 0 1');
    expect(insufficientMaterial(rook.board)).toBe(false);
  });
});

describe('Chess engine · notation, views and perft', () => {
  it('writes SAN disambiguation for two knights', () => {
    const state = fromFen('4k3/8/8/8/8/2N5/8/4K1N1 w - - 0 1');
    const move = findMove(state, sq('c3'), sq('e2'));
    expect(move).not.toBeNull();
    const after = apply(state, move!);
    expect(after.state.moves.at(-1)?.san).toBe('Nce2');
  });

  it('records captures, checks and the last move', () => {
    const state = play(setup(), [mv('e2', 'e4'), mv('d7', 'd5'), mv('e4', 'd5')]);
    const record = state.moves.at(-1);
    expect(record?.piece).toBe('p');
    expect(record?.captured).toBe('p');
    expect(record?.san).toBe('exd5');
    expect(state.lastMove).toEqual(record);
  });

  it('round-trips FEN with castling and an en passant square', () => {
    const fen = 'r3k2r/8/8/3pP3/8/8/8/R3K2R w KQkq d6 0 9';
    expect(toFen(fromFen(fen))).toBe(fen);
  });

  it('matches Kiwipete and position-3 perft counts', () => {
    const kiwipete = fromFen(
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    );
    expect(perft(kiwipete, 1)).toBe(48);
    expect(perft(kiwipete, 2)).toBe(2039);
    const position3 = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    expect(perft(position3, 1)).toBe(14);
    expect(perft(position3, 2)).toBe(191);
  });

  it('gives each seat a public view with the correct move permission', () => {
    const state = setup();
    const white = view(state, 0);
    const black = view(state, 1);
    expect(white.canMove).toBe(true);
    expect(white.legal).toHaveLength(20);
    expect(black.canMove).toBe(false);
    expect(black.legal).toHaveLength(0);
    expect(white.seat).toBe(0);
    expect(black.seat).toBe(1);
  });

  it('enforces seat, turn, staleness and legality on the host', () => {
    const state = setup();
    expect(applySeat(state, 1, mv('e7', 'e5')).error).toBe('wrong-turn');
    const white = applySeat(state, 0, mv('e2', 'e4'));
    expect(white.ok).toBe(true);
    expect(applySeat(white.state, 1, mv('e7', 'e5'), 0).error).toBe('stale');
    expect(applySeat(white.state, 1, mv('e7', 'e5'), 1).ok).toBe(true);
  });
});

describe('Chess AI and hints', () => {
  it('returns a legal move at every level', () => {
    const state = fromFen('7k/8/8/8/8/8/8/R6K w - - 0 1');
    const legal = legalMoves(state);
    for (const level of ['companion', 'easy', 'normal', 'hard'] as const) {
      const move = chooseMove(state, level, () => 0.42);
      expect(move, level).not.toBeNull();
      expect(legal, level).toContainEqual(move);
    }
  });

  it('finds mate in one on Hard', () => {
    const state = fromFen('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1');
    const move = chooseMove(state, 'hard', () => 0.5);
    expect(move).not.toBeNull();
    const after = apply(state, move!);
    expect(after.ok).toBe(true);
    expect(after.state.status).toBe('checkmate');
    expect(after.state.winner).toBe('w');
  });

  it('is deterministic for the same state, level and RNG sequence', () => {
    const state = fromFen('7k/8/8/8/8/8/8/R6K w - - 0 1');
    const sequence = () => 0.37;
    const first = chooseMove(state, 'normal', sequence);
    const second = chooseMove(state, 'normal', sequence);
    expect(first).toEqual(second);
  });

  it('explains a mating hint', () => {
    const state = fromFen('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1');
    const hint = hintFor(state);
    expect(hint).not.toBeNull();
    expect(hint?.reason).toBe('mate');
    const after = apply(state, hint!.move);
    expect(after.state.status).toBe('checkmate');
  });

  it('explains a capture hint', () => {
    const state = fromFen('4k3/8/8/8/8/8/3q4/3RK3 w - - 0 1');
    const hint = hintFor(state);
    expect(hint).not.toBeNull();
    expect(['capture', 'mate', 'check', 'defend', 'best']).toContain(hint?.reason);
    expect(legalMoves(state)).toContainEqual(hint?.move);
  });
});

describe('Family record storage', () => {
  it('normalizes missing and corrupt record fields', () => {
    const record = normalizeRecord({
      games: 3,
      whiteWins: 2,
      blackWins: 1,
      draws: 0,
      byMode: { ai: 2, local: 1, lan: 0 },
      recent: [],
    });
    expect(record).toMatchObject({
      games: 3,
      whiteWins: 2,
      blackWins: 1,
      byMode: { ai: 2, local: 1, lan: 0 },
    });
    expect(normalizeRecord(null)).toEqual(EMPTY_RECORD);
  });

  it('adds a result and keeps the streak', () => {
    const state = play(setup(), [
      mv('f2', 'f3'),
      mv('e7', 'e5'),
      mv('g2', 'g4'),
      mv('d8', 'h4'),
    ]);
    const first = addResult(EMPTY_RECORD, state, { mode: 'local', level: 'normal' }, 1000);
    expect(first.games).toBe(1);
    expect(first.blackWins).toBe(1);
    expect(first.byMode.local).toBe(1);
    expect(first.streak).toBe(1);
    const second = addResult(first, state, { mode: 'ai' }, 2000);
    expect(second.games).toBe(2);
    expect(second.blackWins).toBe(2);
    expect(second.byMode.ai).toBe(1);
    expect(second.streak).toBe(2);
    expect(second.recent[0].at).toBe(2000);
  });
});
