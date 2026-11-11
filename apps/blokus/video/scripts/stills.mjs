/**
 * Render key frames for review in a single bundling pass.
 * Run: COMP=BlokusPromoEN node scripts/stills.mjs [frames...]
 */
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "out", "stills");
mkdirSync(outDir, { recursive: true });

const COMP = process.env.COMP ?? "BlokusPromoZH";
const PREFIX = COMP.endsWith("EN") ? "en-" : "zh-";

const FRAMES = [
  { frame: 140, name: "s1-title" },
  { frame: 324, name: "s2-beat1" },
  { frame: 504, name: "s2-beat2" },
  { frame: 704, name: "s2-beat3" },
  { frame: 998, name: "s3-early" },
  { frame: 1328, name: "s3-late" },
  { frame: 1654, name: "s4-score" },
  { frame: 2076, name: "s5-modes" },
  { frame: 2422, name: "s6-details" },
  { frame: 2784, name: "s7-end" },
];

const extra = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const targets = extra.length > 0 ? extra.map((f) => ({ frame: f, name: `frame-${f}` })) : FRAMES;

const serveUrl = await bundle({
  entryPoint: resolve(here, "..", "src", "index.ts"),
});
const composition = await selectComposition({ serveUrl, id: COMP });
console.log(
  `${COMP}: ${composition.width}x${composition.height} @${composition.fps}fps, ${composition.durationInFrames} frames`,
);

for (const t of targets) {
  const output = join(outDir, `${PREFIX}${t.name}.png`);
  await renderStill({ composition, serveUrl, output, frame: t.frame });
  console.log(`still ${t.frame} -> ${output}`);
}
