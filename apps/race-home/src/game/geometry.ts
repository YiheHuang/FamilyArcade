import { COLORS, type Color } from './race-home';

/**
 * The board is a 15×15 Ludo grid. Positions are returned as percentages of the
 * board box so the React layer can place HTML buttons over a CSS/SVG board.
 */
export const GRID = 15;

export interface Point {
  x: number;
  y: number;
}

export interface GridCell {
  row: number;
  col: number;
}

/** 52 shared-ring cells, clockwise from the red start. */
export const RING_PATH: readonly GridCell[] = [
  { row: 6, col: 1 },
  { row: 6, col: 2 },
  { row: 6, col: 3 },
  { row: 6, col: 4 },
  { row: 6, col: 5 },
  { row: 5, col: 6 },
  { row: 4, col: 6 },
  { row: 3, col: 6 },
  { row: 2, col: 6 },
  { row: 1, col: 6 },
  { row: 0, col: 6 },
  { row: 0, col: 7 },
  { row: 0, col: 8 },
  { row: 1, col: 8 },
  { row: 2, col: 8 },
  { row: 3, col: 8 },
  { row: 4, col: 8 },
  { row: 5, col: 8 },
  { row: 6, col: 9 },
  { row: 6, col: 10 },
  { row: 6, col: 11 },
  { row: 6, col: 12 },
  { row: 6, col: 13 },
  { row: 6, col: 14 },
  { row: 7, col: 14 },
  { row: 8, col: 14 },
  { row: 8, col: 13 },
  { row: 8, col: 12 },
  { row: 8, col: 11 },
  { row: 8, col: 10 },
  { row: 8, col: 9 },
  { row: 9, col: 8 },
  { row: 10, col: 8 },
  { row: 11, col: 8 },
  { row: 12, col: 8 },
  { row: 13, col: 8 },
  { row: 14, col: 8 },
  { row: 14, col: 7 },
  { row: 14, col: 6 },
  { row: 13, col: 6 },
  { row: 12, col: 6 },
  { row: 11, col: 6 },
  { row: 10, col: 6 },
  { row: 9, col: 6 },
  { row: 8, col: 5 },
  { row: 8, col: 4 },
  { row: 8, col: 3 },
  { row: 8, col: 2 },
  { row: 8, col: 1 },
  { row: 8, col: 0 },
  { row: 7, col: 0 },
  { row: 6, col: 0 },
];

/** Five colour-lane cells, outermost first. */
export const LANE_PATH: Record<Color, readonly GridCell[]> = {
  red: [
    { row: 7, col: 1 },
    { row: 7, col: 2 },
    { row: 7, col: 3 },
    { row: 7, col: 4 },
    { row: 7, col: 5 },
  ],
  green: [
    { row: 1, col: 7 },
    { row: 2, col: 7 },
    { row: 3, col: 7 },
    { row: 4, col: 7 },
    { row: 5, col: 7 },
  ],
  yellow: [
    { row: 7, col: 13 },
    { row: 7, col: 12 },
    { row: 7, col: 11 },
    { row: 7, col: 10 },
    { row: 7, col: 9 },
  ],
  blue: [
    { row: 13, col: 7 },
    { row: 12, col: 7 },
    { row: 11, col: 7 },
    { row: 10, col: 7 },
    { row: 9, col: 7 },
  ],
};

/** Four yard slots for each colour, as grid-space centres. */
export const BASE_CELLS: Record<Color, GridCell[]> = {
  red: [
    { row: 1.8, col: 1.8 },
    { row: 1.8, col: 4.2 },
    { row: 4.2, col: 1.8 },
    { row: 4.2, col: 4.2 },
  ],
  green: [
    { row: 1.8, col: 10.8 },
    { row: 1.8, col: 13.2 },
    { row: 4.2, col: 10.8 },
    { row: 4.2, col: 13.2 },
  ],
  yellow: [
    { row: 10.8, col: 10.8 },
    { row: 10.8, col: 13.2 },
    { row: 13.2, col: 10.8 },
    { row: 13.2, col: 13.2 },
  ],
  blue: [
    { row: 10.8, col: 1.8 },
    { row: 10.8, col: 4.2 },
    { row: 13.2, col: 1.8 },
    { row: 13.2, col: 4.2 },
  ],
};

export const YARD_RECT: Record<Color, { x: number; y: number }> = {
  red: { x: 0, y: 0 },
  green: { x: 60, y: 0 },
  yellow: { x: 60, y: 60 },
  blue: { x: 0, y: 60 },
};

/** Finished pawns sit in their colour's corner of the centre house. */
export const HOME_CELLS: Record<Color, GridCell[]> = {
  red: [
    { row: 5.77, col: 5.77 },
    { row: 5.77, col: 6.28 },
    { row: 6.28, col: 5.77 },
    { row: 6.28, col: 6.28 },
  ],
  green: [
    { row: 5.77, col: 7.72 },
    { row: 5.77, col: 8.23 },
    { row: 6.28, col: 7.72 },
    { row: 6.28, col: 8.23 },
  ],
  yellow: [
    { row: 7.72, col: 7.72 },
    { row: 7.72, col: 8.23 },
    { row: 8.23, col: 7.72 },
    { row: 8.23, col: 8.23 },
  ],
  blue: [
    { row: 7.72, col: 5.77 },
    { row: 7.72, col: 6.28 },
    { row: 8.23, col: 5.77 },
    { row: 8.23, col: 6.28 },
  ],
};

export function toPoint(cell: GridCell): Point {
  return {
    x: ((cell.col + 0.5) / GRID) * 100,
    y: ((cell.row + 0.5) / GRID) * 100,
  };
}

export const RING_POINTS: readonly Point[] = RING_PATH.map(toPoint);
export const LANE_POINTS: Record<Color, readonly Point[]> = {
  red: LANE_PATH.red.map(toPoint),
  green: LANE_PATH.green.map(toPoint),
  yellow: LANE_PATH.yellow.map(toPoint),
  blue: LANE_PATH.blue.map(toPoint),
};
export const BASE_POINTS: Record<Color, readonly Point[]> = {
  red: BASE_CELLS.red.map(toPoint),
  green: BASE_CELLS.green.map(toPoint),
  yellow: BASE_CELLS.yellow.map(toPoint),
  blue: BASE_CELLS.blue.map(toPoint),
};
export const HOME_POINTS: Record<Color, readonly Point[]> = {
  red: HOME_CELLS.red.map(toPoint),
  green: HOME_CELLS.green.map(toPoint),
  yellow: HOME_CELLS.yellow.map(toPoint),
  blue: HOME_CELLS.blue.map(toPoint),
};

/** Start cells in clockwise ring order, used to tint the board. */
export const START_INDICES = COLORS.map((color, index) => ({ color, index: index * 13 }));

export function startColor(index: number): Color | null {
  return START_INDICES.find((item) => item.index === index)?.color ?? null;
}

/** Cells one step behind a start are useful for drawing lane entrances. */
export function laneEntrance(color: Color): Point {
  const start = START_INDICES.find((item) => item.color === color);
  const idx = start ? start.index : 0;
  return RING_POINTS[(idx + RING_PATH.length - 1) % RING_PATH.length];
}
