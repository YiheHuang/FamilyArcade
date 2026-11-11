/**
 * Masters a rendered raw cut: BT.709 limited-range H.264 + the audio chain used
 * for the published film (voice compressor, gain, limiter).
 *
 * Run: node scripts/master.mjs [zh|en]
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const lang = process.argv[2] === "en" ? "en" : "zh";
const raw = join(here, "..", "out", `splendor-promo-${lang}-raw.mp4`);
const out = join(here, "..", "out", `splendor-promo-${lang}.mp4`);
if (!existsSync(raw)) {
  console.error(`missing ${raw} — run the remotion render first`);
  process.exit(2);
}

const gain = lang === "en" ? "10.5dB" : "12dB";
execFileSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    raw,
    "-c:v",
    "libx264",
    "-crf",
    "21",
    "-preset",
    "slow",
    "-vf",
    "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p",
    "-color_range",
    "tv",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-af",
    `acompressor=threshold=0.1:ratio=2:attack=10:release=200,volume=${gain},alimiter=limit=0.62:attack=1:release=50:level=0`,
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    out,
  ],
  { stdio: "inherit" },
);
console.log(`mastered → ${out}`);
