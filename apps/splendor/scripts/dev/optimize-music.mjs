#!/usr/bin/env node
/**
 * Music optimizer: keeps the three CC0 pieces but turns them into phrase-aligned
 * loops so the installer stays small.
 *
 * For every track:
 *   1. run ffmpeg's silencedetect to find musical pauses;
 *   2. pick a window of ~TARGET seconds that ends inside a detected pause
 *      (starting at the first pause >= 4s when possible, so intros are kept);
 *   3. encode with short fades in/out (Opus, ~40 kbps stereo) into `public/music`.
 *
 * Originals stay untouched in git history; pass --out <dir> to write elsewhere first.
 *
 * Usage: node scripts/dev/optimize-music.mjs [--dry] [--out data/tmp/music-out]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_DIR = path.join(ROOT, 'packages', 'client', 'public', 'music');
const ffmpegBin = process.env.FFMPEG_BIN ?? 'ffmpeg';
const ffprobeBin = process.env.FFPROBE_BIN ?? 'ffprobe';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const outIdx = args.indexOf('--out');
const OUT_DIR = outIdx >= 0 ? path.resolve(ROOT, args[outIdx + 1] ?? 'data/tmp/music-out') : SRC_DIR;

const TARGET_SECONDS = Number(process.env.MUSIC_TARGET ?? 112);
const BITRATE = process.env.MUSIC_BITRATE ?? '40k';

const log = (m) => console.log(`[music] ${m}`);

function run(bin, argv) {
  const res = spawnSync(bin, argv, { encoding: 'utf8' });
  return { code: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

function duration(file) {
  const res = run(ffprobeBin, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]);
  return Number(res.out.trim()) || 0;
}

/** 返回静音区间 [start, end]（秒） */
function silences(file) {
  const res = run(ffmpegBin, ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-35dB:d=0.9', '-f', 'null', '-']);
  const out = res.out;
  const starts = [...out.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...out.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const ranges = [];
  for (let i = 0; i < starts.length; i++) {
    const s = Math.max(0, starts[i]);
    const e = ends[i] ?? s + 1;
    ranges.push([s, e]);
  }
  return ranges;
}

/** 选择片段：[start, end]，end 优先落在目标点附近的静音处，否则按目标点直接淡出 */
function pickWindow(total, ranges) {
  if (total <= TARGET_SECONDS + 6) return { start: 0, end: total };
  const targetEnd = TARGET_SECONDS;
  let best = null;
  let bestDist = Infinity;
  for (const [s, e] of ranges) {
    const mid = (s + e) / 2;
    const dist = Math.abs(mid - targetEnd);
    if (dist <= 12 && dist < bestDist) {
      best = mid;
      bestDist = dist;
    }
  }
  const end = best ?? targetEnd;
  return { start: 0, end: Math.min(end, total - 1) };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.ogg')).sort();
if (files.length === 0) {
  log(`no .ogg files in ${SRC_DIR}`);
  process.exit(1);
}

let totalBefore = 0;
let totalAfter = 0;
for (const name of files) {
  const file = path.join(SRC_DIR, name);
  const size = fs.statSync(file).size;
  totalBefore += size;
  const total = duration(file);
  const pauses = silences(file);
  const win = pickWindow(total, pauses);
  const seconds = win.end - win.start;
  const target = path.join(OUT_DIR, name);
  log(`${name}: ${total.toFixed(0)}s → ${win.start.toFixed(1)}–${win.end.toFixed(1)}s (${seconds.toFixed(0)}s, 静音点 ${pauses.length} 段)`);
  if (dry) continue;
  const argv = [
    '-hide_banner',
    '-loglevel', 'error',
    '-ss', win.start.toFixed(2),
    '-i', file,
    '-t', seconds.toFixed(2),
    '-af', `afade=t=in:st=0:d=0.8,afade=t=out:st=${Math.max(0, seconds - 2.2).toFixed(2)}:d=2.2`,
    '-ac', '2',
    '-c:a', 'libopus',
    '-b:a', BITRATE,
    '-vbr', 'on',
    '-application', 'audio',
    '-y',
    target,
  ];
  const res = run(ffmpegBin, argv);
  if (res.code !== 0 || !fs.existsSync(target)) {
    log(`编码失败：${name} → ${res.out.slice(0, 200)}`);
    process.exitCode = 1;
    continue;
  }
  const after = fs.statSync(target).size;
  totalAfter += after;
  log(`  → ${name} ${(after / 1024).toFixed(0)} KB（原 ${(size / 1024).toFixed(0)} KB）`);
}

if (!dry) {
  log(`合计 ${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024 / 1024).toFixed(2)} MB`);
  if (OUT_DIR !== SRC_DIR) log(`输出目录：${OUT_DIR}（确认后手动覆盖 public/music）`);
}
