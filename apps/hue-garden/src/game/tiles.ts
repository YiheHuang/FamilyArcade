import raw from '../../data/tiles.json';

/** The six courtyard glazes and six tile shapes. Kept in data/tiles.json as the
 *  content source; this module only provides typed, pure accessors. */
export const COLORS = ['terracotta', 'saffron', 'olive', 'sea', 'indigo', 'plum'] as const;
export type ColorId = (typeof COLORS)[number];

export const SHAPES = ['circle', 'diamond', 'leaf', 'star', 'drop', 'flower'] as const;
export type ShapeId = (typeof SHAPES)[number];

export const COLOR_COUNT = COLORS.length;
export const SHAPE_COUNT = SHAPES.length;
export const COMBO_COUNT = COLOR_COUNT * SHAPE_COUNT;
export const COPIES_PER_TILE = 3;

export interface TileSpec {
  color: ColorId;
  shape: ShapeId;
  copies: number;
}

const itemByKey = new Map<string, number>();
for (const item of raw.items) {
  itemByKey.set(`${item.color}/${item.shape}`, item.copies);
}

export const TILE_SPECS: TileSpec[] = COLORS.flatMap((color) =>
  SHAPES.map((shape) => ({
    color,
    shape,
    copies: itemByKey.get(`${color}/${shape}`) ?? 0,
  })),
);

export function makeTile(color: number, shape: number): number {
  return color * SHAPE_COUNT + shape;
}

export function tileColor(tile: number): number {
  return Math.floor(tile / SHAPE_COUNT);
}

export function tileShape(tile: number): number {
  return tile % SHAPE_COUNT;
}

export function tileSpec(tile: number): TileSpec {
  return TILE_SPECS[tile] ?? { color: 'terracotta', shape: 'circle', copies: 0 };
}

export function isValidTile(tile: number): boolean {
  return Number.isInteger(tile) && tile >= 0 && tile < COMBO_COUNT;
}

/** Every physical tile, in a stable order, used only when building the bag. */
export function fullBag(): number[] {
  const bag: number[] = [];
  for (let tile = 0; tile < COMBO_COUNT; tile++) {
    const copies = TILE_SPECS[tile]?.copies ?? 0;
    for (let i = 0; i < copies; i++) bag.push(tile);
  }
  return bag;
}

export { raw as TILE_DATA };
