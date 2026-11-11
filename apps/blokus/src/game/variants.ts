import type { PlayerCount, VariantId } from './types';

export interface VariantDef {
  id: VariantId;
  label: string;
  size: number;
  /** start corners (board coordinates) per player count */
  corners: Partial<Record<PlayerCount, Array<readonly [number, number]>>>;
}

export const VARIANTS: Record<VariantId, VariantDef> = {
  standard: {
    id: 'standard',
    label: '标准 20×20',
    size: 20,
    corners: {
      2: [
        [0, 0],
        [19, 19],
      ],
      3: [
        [0, 0],
        [19, 0],
        [0, 19],
      ],
      4: [
        [0, 0],
        [19, 0],
        [19, 19],
        [0, 19],
      ],
    },
  },
  duo: {
    id: 'duo',
    label: '双人 14×14',
    size: 14,
    corners: {
      2: [
        [0, 0],
        [13, 13],
      ],
    },
  },
};

export function cornersFor(variant: VariantId, players: PlayerCount): Array<readonly [number, number]> {
  const c = VARIANTS[variant].corners[players];
  if (!c) throw new Error(`变体 ${variant} 不支持 ${players} 人`);
  return c;
}

export function isVariantPlayerCountValid(variant: VariantId, players: number): players is PlayerCount {
  return (players === 2 || players === 3 || players === 4) && !!VARIANTS[variant].corners[players as PlayerCount];
}
