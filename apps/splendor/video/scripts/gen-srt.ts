/**
 * Writes the two subtitle tracks (SRT) beside the finished films.
 * Run: npx tsx scripts/gen-srt.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FILM_SECONDS } from "../src/narration.ts";
import zh from "../src/data/narration.zh.json";
import en from "../src/data/narration.en.json";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "docs", "promo");
mkdirSync(outDir, { recursive: true });

type Line = { at: number; duration: number; text: string };

const stamp = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const ms = total % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
};

for (const [lang, data] of [
  ["zh", zh],
  ["en", en],
] as const) {
  const lines = data.lines as Line[];
  const srt = lines
    .map((line, i) => {
      const start = line.at - 0.1;
      const end = Math.min(FILM_SECONDS - 0.1, line.at + line.duration + 0.3);
      return `${i + 1}\n${stamp(start)} --> ${stamp(end)}\n${line.text}\n`;
    })
    .join("\n");
  const file = join(outDir, `splendor-promo-${lang}.srt`);
  writeFileSync(file, srt, "utf8");
  console.log(`wrote ${file} (${lines.length} cues)`);
}
