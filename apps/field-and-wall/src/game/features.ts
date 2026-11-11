import { localFeatures } from './tiles';
import {
  DX,
  DY,
  OPPOSITE,
  type Cell,
  type FeatureType,
  type PlacedTile,
} from './types';

export interface GlobalFeature {
  id: string;
  type: FeatureType;
  /** Indexes into the tiles array, unique and sorted. */
  tileIndexes: number[];
  cells: Cell[];
  openEdges: number;
  openDetail: { tileIndex: number; edge: number }[];
  meeples: { tileIndex: number; seat: number; local: number }[];
  complete: boolean;
  /** For monasteries: how many of the 8 surrounding cells are filled. */
  filledAround: number;
}

export interface FeatureAnalysis {
  features: GlobalFeature[];
  byKey: Map<string, GlobalFeature>;
  nodeToFeature: Map<string, GlobalFeature>;
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function tileIndexByCell(tiles: PlacedTile[]): Map<string, number> {
  const map = new Map<string, number>();
  tiles.forEach((tile, i) => map.set(cellKey(tile.x, tile.y), i));
  return map;
}

class UnionFind {
  private parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    if (!this.parent.has(key)) {
      this.add(key);
      return key;
    }
    let root = key;
    while (this.parent.get(root) !== root) {
      const next = this.parent.get(root);
      if (!next) break;
      root = next;
    }
    let current = key;
    while (this.parent.get(current) !== root) {
      const next = this.parent.get(current);
      if (!next) break;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function surroundingFilled(map: Map<string, number>, x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (map.has(cellKey(x + dx, y + dy))) n++;
    }
  }
  return n;
}

export function analyze(tiles: PlacedTile[]): FeatureAnalysis {
  const map = tileIndexByCell(tiles);
  const uf = new UnionFind();

  tiles.forEach((tile, tileIndex) => {
    for (const feature of localFeatures(tile.type, tile.rot)) {
      uf.add(`${tileIndex}:${feature.index}`);
    }
  });

  // Join features across matching edges.
  tiles.forEach((tile, tileIndex) => {
    const features = localFeatures(tile.type, tile.rot);
    for (const feature of features) {
      for (const edge of feature.edges) {
        const nx = tile.x + DX[edge];
        const ny = tile.y + DY[edge];
        const neighbourIndex = map.get(cellKey(nx, ny));
        if (neighbourIndex == null) continue;
        const neighbour = tiles[neighbourIndex];
        const opposite = OPPOSITE[edge];
        const neighbourFeature = localFeatures(neighbour.type, neighbour.rot).find((f) =>
          f.edges.includes(opposite),
        );
        if (!neighbourFeature) continue;
        if (neighbourFeature.type !== feature.type) continue;
        uf.union(`${tileIndex}:${feature.index}`, `${neighbourIndex}:${neighbourFeature.index}`);
      }
    }
  });

  const groups = new Map<
    string,
    {
      type: FeatureType;
      tileSet: Set<number>;
      openDetail: { tileIndex: number; edge: number }[];
      meeples: { tileIndex: number; seat: number; local: number }[];
      anchorTile: number;
    }
  >();

  tiles.forEach((tile, tileIndex) => {
    const features = localFeatures(tile.type, tile.rot);
    for (const feature of features) {
      const root = uf.find(`${tileIndex}:${feature.index}`);
      let group = groups.get(root);
      if (!group) {
        group = {
          type: feature.type,
          tileSet: new Set(),
          openDetail: [],
          meeples: [],
          anchorTile: tileIndex,
        };
        groups.set(root, group);
      }
      group.tileSet.add(tileIndex);
      for (const edge of feature.edges) {
        const nx = tile.x + DX[edge];
        const ny = tile.y + DY[edge];
        if (!map.has(cellKey(nx, ny))) group.openDetail.push({ tileIndex, edge });
      }
      if (tile.meeple != null && tile.meepleFeature === feature.index) {
        group.meeples.push({ tileIndex, seat: tile.meeple, local: feature.index });
      }
    }
  });

  const features: GlobalFeature[] = [];
  const byKey = new Map<string, GlobalFeature>();
  const nodeToFeature = new Map<string, GlobalFeature>();
  for (const [root, group] of groups) {
    const tileIndexes = [...group.tileSet].sort((a, b) => a - b);
    const first = tiles[group.anchorTile];
    const isMonastery = group.type === 'monastery';
    const filledAround = isMonastery ? surroundingFilled(map, first.x, first.y) : 0;
    const complete = isMonastery
      ? filledAround === 8
      : group.openDetail.length === 0 && tileIndexes.length > 0;
    const feature: GlobalFeature = {
      id: root,
      type: group.type,
      tileIndexes,
      cells: tileIndexes.map((i) => ({ x: tiles[i].x, y: tiles[i].y })),
      openEdges: group.openDetail.length,
      openDetail: group.openDetail,
      meeples: group.meeples,
      complete,
      filledAround,
    };
    features.push(feature);
    byKey.set(root, feature);
    for (const tileIndex of tileIndexes) {
      const local = localFeatures(tiles[tileIndex].type, tiles[tileIndex].rot);
      for (const f of local) {
        if (uf.find(`${tileIndex}:${f.index}`) === root) {
          nodeToFeature.set(`${tileIndex}:${f.index}`, feature);
        }
      }
    }
  }

  features.sort((a, b) => {
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    const ax = a.cells[0]?.x ?? 0;
    const bx = b.cells[0]?.x ?? 0;
    if (ax !== bx) return ax - bx;
    return (a.cells[0]?.y ?? 0) - (b.cells[0]?.y ?? 0);
  });

  return { features, byKey, nodeToFeature };
}

export function meepleCounts(feature: GlobalFeature): { seat: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const meeple of feature.meeples) counts.set(meeple.seat, (counts.get(meeple.seat) ?? 0) + 1);
  return [...counts.entries()]
    .map(([seat, count]) => ({ seat, count }))
    .sort((a, b) => b.count - a.count || a.seat - b.seat);
}

export function majoritySeats(feature: GlobalFeature): number[] {
  const counts = meepleCounts(feature);
  if (counts.length === 0) return [];
  const best = counts[0].count;
  return counts.filter((c) => c.count === best).map((c) => c.seat);
}

export function featurePoints(feature: GlobalFeature, complete: boolean): number {
  const tiles = feature.tileIndexes.length;
  if (feature.type === 'city') return (complete ? 2 : 1) * tiles;
  if (feature.type === 'road') return tiles;
  return complete ? 9 : 1 + feature.filledAround;
}

export function featureForNode(
  analysis: FeatureAnalysis,
  tileIndex: number,
  localIndex: number,
): GlobalFeature | null {
  return analysis.nodeToFeature.get(`${tileIndex}:${localIndex}`) ?? null;
}
