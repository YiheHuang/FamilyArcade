/**
 * Render key frames for review in a single bundling pass.
 * Run: COMP=SplendorPromoEN npx tsx scripts/stills.mjs
 */
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "out", "stills");
mkdirSync(outDir, { recursive: true });

const COMP = process.env.COMP ?? "SplendorPromoZH";
const PREFIX = COMP.endsWith("EN") ? "en-" : "zh-";

const FRAMES = [
  { frame: 100, name: "s1-hook" },
  { frame: 420, name: "s2-title" },
  { frame: 750, name: "s3-rules" },
  { frame: 1100, name: "s4-take" },
  { frame: 1560, name: "s5-buy" },
  { frame: 1760, name: "s5-buy-end" },
  { frame: 2080, name: "s6-noble" },
  { frame: 2580, name: "s7-phone" },
  { frame: 2680, name: "s7-joined" },
  { frame: 2940, name: "s8-details" },
  { frame: 3165, name: "s9-end" },
];

const extra = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const targets =
  extra.length > 0 ? extra.map((f) => ({ frame: f, name: `frame-${f}` })) : FRAMES;

const serveUrl = await bundle({
  entryPoint: resolve(here, "..", "src", "index.ts"),
});
const composition = await selectComposition({ serveUrl, id: COMP });
console.log(
  `${COMP}: ${composition.width}x${composition.height} @${composition.fps}fps, ${composition.durationInFrames} frames`,
);

for (const target of targets) {
  const output = join(outDir, `${PREFIX}${target.name}.png`);
  await renderStill({ composition, serveUrl, output, frame: target.frame });
  console.log(`still ${target.frame} -> ${output}`);
}
