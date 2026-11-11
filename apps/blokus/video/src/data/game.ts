import { Game } from "../../../src/game/engine";
import { PIECES } from "../../../src/game/pieces";
import type { PlaceMove } from "../../../src/game/types";
import raw from "./game.json";

export interface GameData {
  seed: number;
  config: { variant: "standard"; players: 4 };
  moves: Array<{ p: number; piece: number; o: number; x: number; y: number }>;
  scores: Array<{ cells: number; bonus: number; total: number; piecesLeft: number }>;
  ranking: number[];
  demo: {
    first: PlaceMove;
    second: PlaceMove;
    illegal: { piece: number; o: number; x: number; y: number };
  };
}

export const DATA = raw as unknown as GameData;

export const PASS = (p: number): { kind: "pass"; p: number } => ({ kind: "pass", p });

/** board snapshots for every move count: SNAPSHOTS[i] = state after i moves */
export const SNAPSHOTS: Game[] = (() => {
  const list: Game[] = [];
  const g = new Game(DATA.config);
  list.push(g.clone());
  for (const mv of DATA.moves) {
    if (!g.tryApply({ kind: "place", ...mv })) {
      throw new Error(`generated game is illegal at move ${list.length}`);
    }
    list.push(g.clone());
  }
  return list;
})();

export const DEMO_FIRST: Game = new Game(DATA.config, [DATA.demo.first]);
export const DEMO_SECOND: Game = new Game(DATA.config, [
  DATA.demo.first,
  PASS(1),
  PASS(2),
  PASS(3),
  DATA.demo.second,
]);

export function cellsOf(
  piece: number,
  o: number,
  x: number,
  y: number,
): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  const or = PIECES[piece].orientations[o];
  for (let i = 0; i < or.cells.length; i += 2) {
    cells.push([x + or.cells[i], y + or.cells[i + 1]]);
  }
  return cells;
}

/** the two cells that touch diagonally between the demo pieces (for the diagram) */
export function diagonalContact(): { a: [number, number]; b: [number, number] } {
  const first = cellsOf(DATA.demo.first.piece, DATA.demo.first.o, DATA.demo.first.x, DATA.demo.first.y);
  const second = cellsOf(DATA.demo.second.piece, DATA.demo.second.o, DATA.demo.second.x, DATA.demo.second.y);
  for (const [ax, ay] of first) {
    for (const [bx, by] of second) {
      if (Math.abs(ax - bx) === 1 && Math.abs(ay - by) === 1) return { a: [ax, ay], b: [bx, by] };
    }
  }
  throw new Error("demo pieces do not touch diagonally");
}
