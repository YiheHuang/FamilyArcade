/**
 * Generates the game data used by the promo.
 *
 * Everything is produced by the real engine so the video can never show an
 * illegal board: every move is replayed through `Game.tryApply()`, and the
 * "illegal edge touch" demo is checked against `Game.illegalReason()`.
 *
 * Run: npx tsx scripts/gen-game.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chooseMove } from "../../src/ai/search.ts";
import { Game } from "../../src/game/engine.ts";
import { PIECES } from "../../src/game/pieces.ts";
import { mulberry32 } from "../../src/game/rng.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, "..", "src", "data", "game.json");
const CONFIG = { variant: "standard", players: 4 };
const MOVE_COUNT = 22;
const SEEDS = 16;
const BUDGET_MS = 50;

/** play one full candidate game; returns null when a pass would be needed */
function playGame(seed) {
  const g = new Game(CONFIG);
  const rng = mulberry32(seed * 7919 + 13);
  const moves = [];
  for (let i = 0; i < MOVE_COUNT; i++) {
    const seat = g.turn;
    if (g.mustPass(seat)) return null; // a pass would be noise in a 11s shot
    const mv = chooseMove(g, seat, "normal", Date.now() + BUDGET_MS, rng);
    if (!mv) return null;
    if (!g.tryApply(mv)) throw new Error("AI produced an illegal move");
    moves.push(mv);
  }
  return { g, moves };
}

function aesthetics(g) {
  const scores = g.scores();
  const cells = scores.map((s) => s.cells);
  const mean = cells.reduce((a, b) => a + b, 0) / cells.length;
  const variance = cells.reduce((a, b) => a + (b - mean) ** 2, 0) / cells.length;
  const total = cells.reduce((a, b) => a + b, 0);
  // balanced seats first, then a fuller board
  return -variance * 4 + total * 0.12;
}

let best = null;
for (let seed = 1; seed <= SEEDS; seed++) {
  const run = playGame(seed);
  if (!run) continue;
  const score = aesthetics(run.g);
  if (!best || score > best.score) best = { seed, score, ...run };
}
if (!best) throw new Error("no candidate game found");

// re-validate the chosen game from scratch
const replay = new Game(CONFIG);
for (const mv of best.moves) {
  if (!replay.tryApply(mv)) throw new Error(`replay rejected ${JSON.stringify(mv)}`);
}
if (JSON.stringify(replay.board) !== JSON.stringify(best.g.board)) {
  throw new Error("replay board mismatch");
}
const finalScores = replay.scores();
const finalRanking = replay.ranking();

// ---------------------------------------------------------------- rule demo
const demo = new Game(CONFIG);

const cornerMoves = demo.legalMoves(0).filter((m) => {
  const or = PIECES[m.piece].orientations[m.o];
  for (let i = 0; i < or.cells.length; i += 2) {
    if (m.x + or.cells[i] === 0 && m.y + or.cells[i + 1] === 0) return true;
  }
  return false;
});
if (cornerMoves.length === 0) throw new Error("no corner opening found");
// a chunky piece reads better on camera than a single square
const first = [...cornerMoves].sort((a, b) => {
  const sa = PIECES[a.piece].orientations[a.o].cells.length;
  const sb = PIECES[b.piece].orientations[b.o].cells.length;
  return sb - sa || a.piece - b.piece || a.o - b.o;
})[0];
if (!demo.tryApply(first)) throw new Error("demo opening rejected");
// let the next seat pass so it is player 0's turn again (passes leave no trace)
for (const seat of [1, 2, 3]) {
  if (!demo.tryApply({ kind: "pass", p: seat })) throw new Error("demo pass rejected");
}

const secondCandidates = demo.legalMoves(0);
const diagonalTouches = (m) => {
  const or = PIECES[m.piece].orientations[m.o];
  const firstOr = PIECES[first.piece].orientations[first.o];
  let touches = 0;
  for (let i = 0; i < or.cells.length; i += 2) {
    const cx = m.x + or.cells[i];
    const cy = m.y + or.cells[i + 1];
    for (let j = 0; j < firstOr.cells.length; j += 2) {
      const fx = first.x + firstOr.cells[j];
      const fy = first.y + firstOr.cells[j + 1];
      if (Math.abs(cx - fx) === 1 && Math.abs(cy - fy) === 1) touches++;
    }
  }
  return touches;
};
const second = [...secondCandidates].sort((a, b) => {
  const ta = diagonalTouches(a);
  const tb = diagonalTouches(b);
  if (tb !== ta) return tb - ta;
  const ca = PIECES[a.piece].orientations[a.o].cells.length;
  const cb = PIECES[b.piece].orientations[b.o].cells.length;
  return ca - cb || a.piece - b.piece; // prefer a small, tidy second piece
})[0];
if (!second) throw new Error("no diagonal follow-up found");
if (!demo.tryApply(second)) throw new Error("demo second move rejected");
for (const seat of [1, 2, 3]) {
  if (!demo.tryApply({ kind: "pass", p: seat })) throw new Error("demo pass rejected");
}

// find a placement that is illegal for the promised reason: edge touching.
// It must sit fully inside the board (one cell of breathing room) and only
// touch the first piece, so the rule reads at a glance on camera.
const firstCells = [];
for (let i = 0; i < PIECES[first.piece].orientations[first.o].cells.length; i += 2) {
  firstCells.push([
    first.x + PIECES[first.piece].orientations[first.o].cells[i],
    first.y + PIECES[first.piece].orientations[first.o].cells[i + 1],
  ]);
}
const secondCells = [];
for (let i = 0; i < PIECES[second.piece].orientations[second.o].cells.length; i += 2) {
  secondCells.push([
    second.x + PIECES[second.piece].orientations[second.o].cells[i],
    second.y + PIECES[second.piece].orientations[second.o].cells[i + 1],
  ]);
}

const candidates = [];
for (const pieceIdx of [1, 2, 5, 6, 7, 8]) {
  const orients = PIECES[pieceIdx].orientations;
  for (let o = 0; o < orients.length; o++) {
    const or = orients[o];
    for (let x = 1; x + or.w <= demo.size - 1; x++) {
      for (let y = 1; y + or.h <= demo.size - 1; y++) {
        const cand = { kind: "place", p: 0, piece: pieceIdx, o, x, y };
        if (demo.illegalReason(cand) !== "edge-touch") continue;
        let touchesFirst = 0;
        let touchesSecond = 0;
        for (let i = 0; i < or.cells.length; i += 2) {
          const cx = x + or.cells[i];
          const cy = y + or.cells[i + 1];
          for (const [fx, fy] of firstCells) if (Math.abs(fx - cx) + Math.abs(fy - cy) === 1) touchesFirst++;
          for (const [sx, sy] of secondCells) if (Math.abs(sx - cx) + Math.abs(sy - cy) === 1) touchesSecond++;
        }
        const touchesOwn = touchesFirst + touchesSecond;
        if (touchesOwn < 1) continue;
        candidates.push({ cand, cells: or.cells.length / 2, touchesOwn });
      }
    }
  }
}
// prefer a visibly sized ghost (3 cells) with a single, unambiguous contact
candidates.sort(
  (a, b) =>
    Math.abs(a.cells - 3) - Math.abs(b.cells - 3) ||
    Math.abs(a.touchesOwn - 1) - Math.abs(b.touchesOwn - 1) ||
    a.cand.x - b.cand.x ||
    a.cand.y - b.cand.y,
);
const illegal = candidates[0]?.cand ?? null;
if (!illegal) throw new Error("no edge-touch demo found");

// -------------------------------------------------------------------- output
const data = {
  seed: best.seed,
  config: CONFIG,
  moves: best.moves.map((m) => ({ p: m.p, piece: m.piece, o: m.o, x: m.x, y: m.y })),
  scores: finalScores,
  ranking: finalRanking,
  demo: {
    first,
    second,
    illegal: { piece: illegal.piece, o: illegal.o, x: illegal.x, y: illegal.y },
  },
};
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");

console.log(
  `seed ${best.seed}: ${data.moves.length} moves, cells ${finalScores.map((s) => s.cells).join("/")}, ` +
    `scores ${finalScores.map((s) => s.total).join("/")}`,
);
console.log(
  `demo: first=${PIECES[first.piece].id}@${first.x},${first.y} ` +
    `second=${PIECES[second.piece].id}@${second.x},${second.y} ` +
    `illegal=${PIECES[illegal.piece].id}@${illegal.x},${illegal.y} (edge-touch)`,
);
console.log(`written ${outFile}`);
