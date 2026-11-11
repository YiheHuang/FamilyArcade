import type { ColorId, ShapeId } from '../game/tiles';

export interface ColorTheme {
  id: ColorId;
  hex: string;
  deep: string;
  light: string;
  ink: string;
  letter: string;
  zh: string;
  en: string;
}

/** Six Mediterranean glazes. Every tile also carries its shape and a colour
 *  seal, so colour is never the only channel. */
export const COLOR_THEME: Record<ColorId, ColorTheme> = {
  terracotta: {
    id: 'terracotta',
    hex: '#b8573f',
    deep: '#7d3222',
    light: '#e6a48e',
    ink: '#fff8ec',
    letter: 'T',
    zh: '陶土',
    en: 'Terracotta',
  },
  saffron: {
    id: 'saffron',
    hex: '#c8942f',
    deep: '#8b6418',
    light: '#efd08a',
    ink: '#2b2215',
    letter: 'S',
    zh: '赭黄',
    en: 'Saffron',
  },
  olive: {
    id: 'olive',
    hex: '#6f7f3a',
    deep: '#4a5723',
    light: '#bdc98e',
    ink: '#fff8ec',
    letter: 'O',
    zh: '橄榄',
    en: 'Olive',
  },
  sea: {
    id: 'sea',
    hex: '#3f7f8a',
    deep: '#285760',
    light: '#9cc9cf',
    ink: '#fff8ec',
    letter: 'M',
    zh: '海蓝',
    en: 'Sea',
  },
  indigo: {
    id: 'indigo',
    hex: '#4f5f9e',
    deep: '#323f70',
    light: '#a6b2dc',
    ink: '#fff8ec',
    letter: 'I',
    zh: '靛青',
    en: 'Indigo',
  },
  plum: {
    id: 'plum',
    hex: '#8b5b7d',
    deep: '#5f3a54',
    light: '#d2a9c2',
    ink: '#fff8ec',
    letter: 'P',
    zh: '梅紫',
    en: 'Plum',
  },
};

export const COLOR_ORDER: ColorId[] = [
  'terracotta',
  'saffron',
  'olive',
  'sea',
  'indigo',
  'plum',
];

export const SHAPE_ORDER: ShapeId[] = ['circle', 'diamond', 'leaf', 'star', 'drop', 'flower'];

export const SHAPE_NAMES: Record<ShapeId, { zh: string; en: string }> = {
  circle: { zh: '圆', en: 'Circle' },
  diamond: { zh: '菱', en: 'Diamond' },
  leaf: { zh: '叶', en: 'Leaf' },
  star: { zh: '星', en: 'Star' },
  drop: { zh: '滴', en: 'Drop' },
  flower: { zh: '花', en: 'Flower' },
};

export const SEAT_MARKS = ['1', '2', '3', '4'] as const;

export function colorTheme(color: number): ColorTheme {
  return COLOR_THEME[COLOR_ORDER[((color % 6) + 6) % 6]];
}

export function shapeName(shape: number): { zh: string; en: string } {
  return SHAPE_NAMES[SHAPE_ORDER[((shape % 6) + 6) % 6]];
}
