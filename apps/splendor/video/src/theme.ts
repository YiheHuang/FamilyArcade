import { Easing } from "remotion";

/**
 * The app's own design tokens (packages/client/src/styles.css), mirrored here
 * so the video and the product share one palette. `scripts/facts.ts` compares
 * these values with the stylesheet, so they cannot silently drift.
 */
export const PAPER = "#f2f4f7";
export const PAPER_0 = "#ffffff";
export const PAPER_50 = "#fafbfc";
export const PAPER_100 = "#f2f4f7";
export const PAPER_200 = "#e8ebf0";
export const PAPER_300 = "#d9dfe7";
export const PAPER_400 = "#bcc6d2";
export const INK = "#26303e";
export const INK_700 = "#3d4a5c";
export const INK_500 = "#5d6c80";
export const INK_400 = "#7f8da0";
export const INK_300 = "#a6b1c0";
export const ACCENT = "#c9932e";
export const ACCENT_600 = "#b07d20";
export const ACCENT_700 = "#8f6416";
export const ACCENT_500 = "#c9932e";
export const ACCENT_300 = "#e8c583";
export const ACCENT_100 = "#f8eed8";

/** the six gem palettes, imported from the client so they can never drift */
export { GEM_HEX as GEM } from "../../packages/client/src/ui/gems";

export const W = 1920;
export const H = 1080;

/** title safe: 160 px sides, 96 px top/bottom; subtitles live below 960 */
export const SAFE = { x: 96, y: 64 };
export const SUBTITLE_Y = 958;

export const SIZE = {
  hero: 148,
  h1: 88,
  h2: 60,
  h3: 44,
  body: 34,
  small: 27,
  label: 22,
  subtitle: 32,
};

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_SOFT = Easing.bezier(0.33, 1, 0.68, 1);

export const withAlpha = (hex: string, alpha: number): string => {
  const clean = hex.replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
