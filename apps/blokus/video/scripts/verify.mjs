/**
 * Verifies the rendered MP4: geometry, frame rate, duration, audio, loudness,
 * and extracts review frames.
 *
 * Run: node scripts/verify.mjs [file]
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? join(here, "..", "out", "blokus-promo.mp4");
if (!existsSync(file)) {
  console.error(`missing ${file}`);
  process.exit(2);
}

const probe = JSON.parse(
  execFileSync(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
    { encoding: "utf8" },
  ),
);
const video = probe.streams.find((s) => s.codec_type === "video");
const audio = probe.streams.find((s) => s.codec_type === "audio");
const duration = Number(probe.format.duration);
const [num, den] = String(video.r_frame_rate).split("/").map(Number);

const checks = [];
const check = (label, ok, detail) => {
  checks.push({ label, ok, detail });
  if (!ok) console.error(`FAIL ${label}: ${detail}`);
};

check("1920×1080", video.width === 1920 && video.height === 1080, `${video.width}x${video.height}`);
check("60 fps", den > 0 && num / den === 60, `${video.r_frame_rate}`);
check("48.0 s", Math.abs(duration - 48) <= 0.05, duration.toFixed(3));
check("H.264 video", video.codec_name === "h264", video.codec_name);
check("AAC audio", audio?.codec_name === "aac", audio?.codec_name ?? "no audio stream");
check("yuv420p", video.pix_fmt === "yuv420p", video.pix_fmt);

// loudness + true peak
const loud = execSync(
  `ffmpeg -hide_banner -i "${file}" -af loudnorm=print_format=summary -f null - 2>&1`,
  { encoding: "utf8" },
);
const lufs = /Input Integrated:\s*(-?[\d.]+) LUFS/.exec(loud)?.[1];
const peak = /Input True Peak:\s*(-?[\d.]+) dBTP/.exec(loud)?.[1];
if (lufs) check("loudness −20…−12 LUFS", Number(lufs) > -20 && Number(lufs) < -12, `${lufs} LUFS`);
if (peak) check("true peak ≤ −1 dBTP", Number(peak) <= -1, `${peak} dBTP`);

// review frames
const framesDir = join(here, "..", "out", "verify");
mkdirSync(framesDir, { recursive: true });
const times = [1.5, 6.5, 11.5, 19.0, 26.5, 33.0, 40.0, 46.0];
for (const t of times) {
  execFileSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-y", join(framesDir, `t${t.toFixed(1)}.png`)],
  );
}

console.log("\nverified:");
for (const c of checks) console.log(` ${c.ok ? "PASS" : "FAIL"} ${c.label} (${c.detail})`);
console.log(`\nframes extracted to ${framesDir}`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
