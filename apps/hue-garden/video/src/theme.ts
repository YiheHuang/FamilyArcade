import { COLOR_THEME, COLOR_ORDER, SHAPE_NAMES, SHAPE_ORDER } from '../../src/ui/theme';

export const PAPER = '#f7f1e5';
export const PAPER_DEEP = '#efe4d2';
export const INK = '#24303a';
export const MUTED = '#7c7467';
export const LINE = '#d9cbb6';
export const ACCENT = '#b08a4f';
export const ACCENT_DEEP = '#86642f';
export const CARD = '#fffdf7';

export const COLORS = COLOR_ORDER.map((id) => COLOR_THEME[id]);
export const SHAPES = SHAPE_ORDER;
export const SHAPE_NAME = SHAPE_NAMES;

export const SERIF =
  '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", "Songti SC", "SimSun", Georgia, serif';
export const SANS =
  '"Avenir Next", "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
export const MONO = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 60;
export const SECONDS = 50;
export const DURATION = SECONDS * FPS;
