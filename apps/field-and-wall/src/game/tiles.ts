import raw from '../../data/tiles.json';
import type {
  CenterType,
  EdgeType,
  FeatureType,
  Rotation,
  TileData,
  TileType,
} from './types';

export const TILE_DATA = raw as unknown as TileData;
export const TILE_SIZE = TILE_DATA.tileSize;

const byId = new Map<string, TileType>(TILE_DATA.types.map((t) => [t.id, t]));

export function tileType(id: string): TileType {
  const type = byId.get(id);
  if (!type) throw new Error(`unknown tile type: ${id}`);
  return type;
}

export function allTileTypes(): TileType[] {
  return TILE_DATA.types;
}

export function tileName(id: string, lang: 'zh' | 'en'): string {
  return tileType(id).name[lang];
}

export function totalTiles(): number {
  return TILE_DATA.types.reduce((n, t) => n + t.copies, 0);
}

export function isRotation(value: unknown): value is Rotation {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

/** The four edges after rotating the tile clockwise. */
export function rotatedEdges(type: TileType, rot: Rotation): [EdgeType, EdgeType, EdgeType, EdgeType] {
  const e = type.edges;
  switch (rot) {
    case 0:
      return [e[0], e[1], e[2], e[3]];
    case 1:
      return [e[3], e[0], e[1], e[2]];
    case 2:
      return [e[2], e[3], e[0], e[1]];
    case 3:
      return [e[1], e[2], e[3], e[0]];
  }
}

export function edgeAt(typeId: string, rot: Rotation, dir: number): EdgeType {
  return rotatedEdges(tileType(typeId), rot)[dir];
}

export interface LocalFeature {
  index: number;
  type: FeatureType;
  /** Edge indexes (rotated) that belong to this feature. */
  edges: number[];
  /** 0..1 anchor inside the tile, after rotation. */
  anchor: { x: number; y: number };
  /** True when this feature only touches one edge (a cap or a dead end). */
  edgeFeature: boolean;
}

const EDGE_ANCHOR: Record<number, { x: number; y: number }> = {
  0: { x: 0.5, y: 0.23 },
  1: { x: 0.77, y: 0.5 },
  2: { x: 0.5, y: 0.77 },
  3: { x: 0.23, y: 0.5 },
};

const localCache = new Map<string, LocalFeature[]>();

function deriveLocal(type: TileType, rot: Rotation): LocalFeature[] {
  const edges = rotatedEdges(type, rot);
  const center = type.center;
  const features: LocalFeature[] = [];

  const addEdgeFeatures = (kind: 'city' | 'road') => {
    for (let i = 0; i < 4; i++) {
      if (edges[i] !== kind) continue;
      features.push({
        index: features.length,
        type: kind,
        edges: [i],
        anchor: EDGE_ANCHOR[i],
        edgeFeature: true,
      });
    }
  };

  if (center === 'city') {
    const cityEdges: number[] = [];
    for (let i = 0; i < 4; i++) if (edges[i] === 'city') cityEdges.push(i);
    if (cityEdges.length > 0) {
      features.push({
        index: features.length,
        type: 'city',
        edges: cityEdges,
        anchor: cityEdges.length === 1 ? EDGE_ANCHOR[cityEdges[0]] : { x: 0.5, y: 0.64 },
        edgeFeature: cityEdges.length === 1,
      });
    }
    addEdgeFeatures('road');
  } else if (center === 'road') {
    const roadEdges: number[] = [];
    for (let i = 0; i < 4; i++) if (edges[i] === 'road') roadEdges.push(i);
    if (roadEdges.length > 0) {
      features.push({
        index: features.length,
        type: 'road',
        edges: roadEdges,
        anchor: roadEdges.length === 1 ? EDGE_ANCHOR[roadEdges[0]] : { x: 0.5, y: 0.5 },
        edgeFeature: roadEdges.length === 1,
      });
    }
    addEdgeFeatures('city');
  } else if (center === 'monastery') {
    features.push({
      index: 0,
      type: 'monastery',
      edges: [],
      anchor: { x: 0.5, y: 0.73 },
      edgeFeature: false,
    });
    addEdgeFeatures('road');
    addEdgeFeatures('city');
  } else {
    // A field centre: every city edge is its own cap, every road edge its own dead end.
    addEdgeFeatures('city');
    addEdgeFeatures('road');
  }

  // Stable order: centre feature first, then edge features by edge number.
  return features.map((f, index) => ({ ...f, index }));
}

export function localFeatures(typeId: string, rot: Rotation): LocalFeature[] {
  const key = `${typeId}:${rot}`;
  const hit = localCache.get(key);
  if (hit) return hit;
  const value = deriveLocal(tileType(typeId), rot);
  localCache.set(key, value);
  return value;
}

export function localFeatureForEdge(typeId: string, rot: Rotation, edge: number): LocalFeature | null {
  return localFeatures(typeId, rot).find((f) => f.edges.includes(edge)) ?? null;
}

export function centerKind(typeId: string): CenterType {
  return tileType(typeId).center;
}
