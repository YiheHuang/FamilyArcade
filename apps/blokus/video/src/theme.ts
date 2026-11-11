import { Easing } from "remotion";

// The app's own design tokens — imported, never copied, so the promo matches.
export {
  ACCENT,
  BAD,
  BOARD_BG,
  INK,
  INK_FAINT,
  LINE,
  OK,
  PALETTE,
  PAPER,
  withAlpha,
} from "../../src/ui/theme";

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_SOFT = Easing.bezier(0.33, 1, 0.68, 1);

export const W = 1920;
export const H = 1080;

/** safe area for 1920x1080 (video-layout guidance scaled from 1080p) */
export const SAFE = { x: 160, y: 120 };

export const SIZE = {
  hero: 200,
  h1: 104,
  h2: 72,
  rule: 70,
  body: 40,
  small: 30,
  label: 26,
};
