/**
 * The 121-hole Chinese Checkers star, generated from its 17 rows.
 *
 * Rows are laid out on a triangular lattice: holes in a row are 1 unit
 * apart, rows are sqrt(3)/2 apart, and neighbouring rows are offset by
 * half a unit.  Adjacency is therefore "distance 1".
 *
 * The star is the central hexagon (61 holes) plus six 10-hole triangles:
 *
 *        top
 *   upper-left / upper-right
 *   lower-left / lower-right
 *        bottom
 */

export const ROW_LENGTHS = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1] as const;
export const HOLE_COUNT = 121;
export const TRIANGLE_SIZE = 10;
export const CENTER_COUNT = 61;

const SQRT3_2 = Math.sqrt(3) / 2;

export interface Hole {
  id: number;
  row: number;
  col: number;
  x: number;
  y: number;
}

export type TriangleId =
  | 'top'
  | 'upper-right'
  | 'lower-right'
  | 'bottom'
  | 'lower-left'
  | 'upper-left';

export const TRIANGLE_IDS: TriangleId[] = [
  'top',
  'upper-right',
  'lower-right',
  'bottom',
  'lower-left',
  'upper-left',
];

export const OPPOSITE: Record<TriangleId, TriangleId> = {
  top: 'bottom',
  bottom: 'top',
  'upper-right': 'lower-left',
  'lower-left': 'upper-right',
  'lower-right': 'upper-left',
  'upper-left': 'lower-right',
};

const key = (x: number, y: number): string => `${x.toFixed(6)},${y.toFixed(6)}`;

export const HOLES: Hole[] = (() => {
  const out: Hole[] = [];
  let id = 0;
  for (let row = 0; row < ROW_LENGTHS.length; row++) {
    const len = ROW_LENGTHS[row];
    for (let col = 0; col < len; col++) {
      out.push({
        id,
        row,
        col,
        x: col - (len - 1) / 2,
        y: row * SQRT3_2 - 8 * SQRT3_2,
      });
      id++;
    }
  }
  return out;
})();

export const BY_COORD = new Map<string, number>(
  HOLES.map((h) => [key(h.x, h.y), h.id]),
);

export const ADJ: number[][] = (() => {
  const out: number[][] = HOLES.map(() => []);
  for (let a = 0; a < HOLES.length; a++) {
    for (let b = a + 1; b < HOLES.length; b++) {
      const dx = HOLES[a].x - HOLES[b].x;
      const dy = HOLES[a].y - HOLES[b].y;
      if (Math.abs(dx * dx + dy * dy - 1) < 1e-6) {
        out[a].push(b);
        out[b].push(a);
      }
    }
  }
  return out;
})();

/**
 * For an adjacent pair a→b, the hole directly beyond b (a "jump" landing),
 * or -1 when the point is outside the star.
 */
export const JUMP: number[][] = (() => {
  const out: number[][] = HOLES.map(() => new Array(HOLES.length).fill(-1));
  for (let a = 0; a < HOLES.length; a++) {
    for (const b of ADJ[a]) {
      const x = HOLES[b].x * 2 - HOLES[a].x;
      const y = HOLES[b].y * 2 - HOLES[a].y;
      const c = BY_COORD.get(key(x, y));
      if (c !== undefined) out[a][b] = c;
    }
  }
  return out;
})();

export const TRIANGLES: Record<TriangleId, number[]> = (() => {
  const top: number[] = [];
  const bottom: number[] = [];
  const upperLeft: number[] = [];
  const upperRight: number[] = [];
  const lowerLeft: number[] = [];
  const lowerRight: number[] = [];

  for (const h of HOLES) {
    if (h.row <= 3) top.push(h.id);
    else if (h.row >= 13) bottom.push(h.id);
    else if (h.row <= 7) {
      const take = 4 - (h.row - 4); // 4,3,2,1
      if (h.col < take) upperLeft.push(h.id);
      else if (h.col >= ROW_LENGTHS[h.row] - take) upperRight.push(h.id);
    } else if (h.row >= 9) {
      const take = h.row - 8; // 1,2,3,4
      if (h.col < take) lowerLeft.push(h.id);
      else if (h.col >= ROW_LENGTHS[h.row] - take) lowerRight.push(h.id);
    }
  }

  return {
    top,
    'upper-right': upperRight,
    'lower-right': lowerRight,
    bottom,
    'lower-left': lowerLeft,
    'upper-left': upperLeft,
  };
})();

export const TRIANGLE_SET: Record<TriangleId, Set<number>> = Object.fromEntries(
  (Object.keys(TRIANGLES) as TriangleId[]).map((id) => [id, new Set(TRIANGLES[id])]),
) as Record<TriangleId, Set<number>>;

const inAnyTriangle = new Set<number>();
for (const id of TRIANGLE_IDS) for (const hole of TRIANGLES[id]) inAnyTriangle.add(hole);

export const CENTRAL: number[] = HOLES.map((h) => h.id).filter((id) => !inAnyTriangle.has(id));
export const CENTRAL_SET = new Set(CENTRAL);

/** Seat start triangles by player count. 2/3/4 players are supported. */
export const START_TRIANGLES: Record<2 | 3 | 4, TriangleId[]> = {
  2: ['top', 'bottom'],
  3: ['top', 'lower-right', 'lower-left'],
  4: ['top', 'upper-right', 'bottom', 'lower-left'],
};

export function targetTriangle(playerCount: 2 | 3 | 4, seat: number): TriangleId {
  return OPPOSITE[START_TRIANGLES[playerCount][seat]];
}

export function startHoles(playerCount: 2 | 3 | 4, seat: number): number[] {
  return TRIANGLES[START_TRIANGLES[playerCount][seat]];
}

export function targetHoles(playerCount: 2 | 3 | 4, seat: number): number[] {
  return TRIANGLES[targetTriangle(playerCount, seat)];
}

const distanceCache = new Map<string, number[]>();

/**
 * BFS distance from every hole to the seat's target triangle.
 * Used for ranking, AI evaluation and hints. The graph is unweighted.
 */
export function distanceToTarget(playerCount: 2 | 3 | 4, seat: number): number[] {
  const cacheKey = `${playerCount}:${seat}`;
  const hit = distanceCache.get(cacheKey);
  if (hit) return hit;

  const dist = new Array<number>(HOLE_COUNT).fill(Infinity);
  const queue: number[] = [];
  for (const h of targetHoles(playerCount, seat)) {
    dist[h] = 0;
    queue.push(h);
  }
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const next of ADJ[cur]) {
      if (dist[next] === Infinity) {
        dist[next] = dist[cur] + 1;
        queue.push(next);
      }
    }
  }
  distanceCache.set(cacheKey, dist);
  return dist;
}

/** Board extents for SVG viewBox; includes a little breathing room. */
export const BOARD_BOUNDS = (() => {
  const xs = HOLES.map((h) => h.x);
  const ys = HOLES.map((h) => h.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
})();
