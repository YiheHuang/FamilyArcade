/** A decorative courtyard used on the home and setup screens. This is art, not
 *  a game position: it never feeds the engine or a saved game. */
export const HOME_GARDEN = [
  { x: -2, y: 0, tile: 0 },
  { x: -1, y: 0, tile: 1 },
  { x: 0, y: 0, tile: 2 },
  { x: 1, y: 0, tile: 3 },
  { x: 2, y: 0, tile: 4 },
  { x: 0, y: -1, tile: 18 },
  { x: 0, y: -2, tile: 24 },
  { x: 0, y: 1, tile: 6 },
  { x: 0, y: 2, tile: 12 },
  { x: -1, y: -1, tile: 31 },
  { x: 1, y: -1, tile: 27 },
  { x: -1, y: 1, tile: 14 },
  { x: 1, y: 1, tile: 21 },
  { x: 2, y: 1, tile: 33 },
  { x: 2, y: -1, tile: 9 },
  { x: -2, y: -1, tile: 16 },
  { x: -2, y: 1, tile: 28 },
  { x: -1, y: 2, tile: 35 },
  { x: 1, y: 2, tile: 5 },
  { x: 3, y: 0, tile: 22 },
  { x: -3, y: 0, tile: 20 },
  { x: 0, y: 3, tile: 30 },
] as const;

export const SETUP_GARDEN = [
  { x: -1, y: 0, tile: 0 },
  { x: 0, y: 0, tile: 6 },
  { x: 1, y: 0, tile: 12 },
  { x: 0, y: -1, tile: 18 },
  { x: 0, y: 1, tile: 24 },
  { x: 1, y: -1, tile: 25 },
  { x: -1, y: 1, tile: 19 },
] as const;
