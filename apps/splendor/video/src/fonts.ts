import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

/**
 * Local, glyph-subsetted Noto fonts (built by scripts/gen-fonts.ts).
 * Tiny payloads and fully deterministic — no network needed while rendering.
 */
export const FONT_SERIF = "Splendor Serif";
export const FONT_SANS = "Splendor Sans";

loadFont({
  family: FONT_SERIF,
  url: staticFile("fonts/noto-serif-sc-600.woff2"),
  weight: "600",
});

loadFont({
  family: FONT_SANS,
  url: staticFile("fonts/noto-sans-sc-400.woff2"),
  weight: "400",
});

loadFont({
  family: FONT_SANS,
  url: staticFile("fonts/noto-sans-sc-500.woff2"),
  weight: "500",
});
